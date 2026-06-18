# ODIP Implementation Plan — Audit & Deletion (Plan)

*Implementation plan*

*v1.0 — 17 June 2026 — Phase A complete*

## 1. Scope

Layer-by-layer implementation of the audit/deletion revision described in the companion design note ([odip-audit-deletion-design.md](odip-audit-deletion-design.md)). Read that note first — this document carries execution only, not rationale.

The revision is foundational: it touches the core versioning pattern (`ItemVersion` loses its audit role), removes the `HAS_REASON` edge, and introduces `AuditEvent` as the sole audit surface, before layering deletion on top. Sequencing therefore matters — the audit foundation lands before the deletion features that depend on it.

## 2. Sequencing overview

The work splits into two phases, each implemented layer by layer with its ADD companion chapter updated in the same batch.

**Phase A — Audit foundation.** Introduce `AuditEvent`; strip audit fields from item/version nodes; remove `HAS_REASON`; rewire change-set membership and the History view onto the log. At the end of Phase A the application behaves as before *to the user* (no deletion yet) but records every write in the log and reads History/members from it.

> **Status (17 Jun 2026):** §3.1 model/shared ✅ DONE · §3.2 storage ✅ DONE · §3.3 service ✅ DONE · §3.4 REST ✅ DONE · §3.5 CLI ✅ DONE · §3.6 web ✅ DONE · §3.7 ADD ✅ DONE — **Phase A complete.**

**Phase B — Deletion.** Soft delete, recycle bin, restore, referential integrity, published-edition wall, hard delete, edition deletion — all built on the Phase A foundation.

> **Status (18 Jun 2026):** §4.1 model/shared ✅ DONE · §4.2 storage ✅ DONE · §4.3 service ✅ DONE · §4.4 REST ✅ DONE · §4.5 CLI ✅ DONE · §4.6 web ⏳ · §4.7 ADD (01 ✅, 02 ✅, 03 ✅, 04 ✅, 07 ✅; 08 pending) — **in progress.** §4.1/§4.2 were briefly reopened to correct `OperationalEntityReference` scope (O\* only) and `findInboundReferences` (O\* where-used only; edition wall removed, relocated to DEL-04 hard delete) — correction applied across code, ADD 01/02, and design note. §4.4 settled the `409` refusal contract as `LifecycleConflictResponse` (`references` a top-level sibling of `error`) and recorded that `DELETE /:id` persists as the whole-item hard destroy alongside the new `POST /:id/delete` soft delete — design note §4.4 and §5 matrix updated accordingly. §4.5 added a user-initiated `inbound-references` query verb (distinct from the non-preemptive `delete`) — design note §4.5 updated to record the distinction.

Phase A must complete before Phase B begins. Within each phase the layer order is the project standard: model → store → service → API → CLI → web → ADD.

## 3. Phase A — Audit foundation

### 3.1 Model / shared ✅ DONE

- New `AuditAction` enum in `@odp/shared` — `CREATE` / `UPDATE` / `DELETE` / `RESTORE` / `HARD_DELETE` / `CLOSE` / `REOPEN` / `PUBLISH` / `BASELINE` / `DECOMMISSION` (reserved).
- New `AuditTargetType` enum — `ON` / `OR` / `OC` / `CHAPTER` / `CHANGESET` / `EDITION` / `BASELINE` / `WAVE`.
- `Item` node: add `status` (`ACTIVE` / `DELETED`), default `ACTIVE`. Remove `createdAt` / `createdBy` from the item projection.
- `ItemVersion`: remove `createdAt` / `createdBy` from the version projection. The version is content-only.
- Remove the `changeSetCommit` read-shape resolution that depended on `HAS_REASON` — superseded by the audit log.

### 3.2 Storage ✅ DONE

> **As-built refinements (vs the sketch below):**
> - `log` signature is **object-based**: `log(action, target, changeSetCommit, tx)` where `target = {id, type, code, title, version}` and `changeSetCommit = {changeSetId, code, title, classifier, note} | null`.
> - `userId` **and `userRole`** are read from the transaction; `transaction.js` gained `userRole` + `getUserRole()`, `createTransaction(userId, userRole)`. The route layer assembles `user {id, role}` from `x-user-id` / `x-user-role` and threads it through every service call (`userId` → `user` across the whole service + route surface).
> - `_validateOpenChangeSet` now **returns the frozen `{code, title, classifier}` snapshot**; `_auditCommit` and `_resolveAuditTargetType` added.
> - **Single query method.** `findByTarget` / `findByChangeSet` were consolidated into one `findAll(filters, tx)` (`filters = {changeSetId?, targetId?, userId?}`). `AuditEventStore` exposes exactly `log` + `findAll`. One row shape for all consumers — the full frozen event plus a `versionId` recovered via `OPTIONAL MATCH` in the same statement (no N+1). `findVersionHistory` removed; `_writeHasReason` / `_resolveChangeSetCommit` / `_attachChangeSetCommits` removed.
> - `ChangeSetStore.findMembers` delegates to `auditEventStore.findAll({changeSetId}, tx)` — no standalone member-row projection; members are AuditEvent rows. `itemType` carried as uppercase `AuditTargetType` (`CHAPTER`).
> - **Bootstrap chapters record no audit event** (config scaffolding); resolves the old "system change set" open point — no system actor, `UserRole` stays writer-only.
> - Index: `AuditEvent.timestamp` only at P0. The `_ensureConstraints` edit in `store/index.js` ✅ applied (timestamp index added alongside the changeset-code uniqueness constraint).

- New `AuditEventStore` with the single write method `log(action, target, changeSetCommit, tx)` — creates the `AuditEvent` node, the `TARGETS` edge, and the `UNDER_CHANGESET` edge when change-set-bound. One read method: `findAll(filters, tx)` with `filters = {changeSetId?, targetId?, userId?}` — the sole audit query, serving the audit interface, client-built History (`targetId`), and the members feed (`changeSetId`).
- `VersionedItemStore` — `create` / `update` stop stamping `createdAt` / `createdBy` and stop writing `HAS_REASON`; instead each calls `auditEventStore.log(...)` in the same transaction. The `changeSetCommit` argument is retained (it still carries `changeSetId` + `note`) but now feeds the audit event rather than the edge.
- `ChangeSetStore.findMembers` — delegates to `auditEventStore.findAll({changeSetId}, tx)` (the single `UNDER_CHANGESET` hop). Drops the `HAS_REASON` reverse traversal and the standalone member-row projection.
- `BaseStore` — `close` / `reopen` on `ChangeSetStore`, and the management-entity writes, gain their `log(...)` calls.
- Remove the `HAS_REASON` constraint/index bootstrap; add the `AuditEvent` node and any index on `timestamp`.

### 3.3 Service ✅ DONE

- New `AuditEventService` — a single read method `getAuditEvents(filters, user)` (`filters = {changeSetId?, targetId?, userId?}`) delegating to `auditEventStore.findAll`. No `getItemHistory` — History is a client concern (the client passes `{targetId}`). Write is not a service concern: the log is written by stores inside the operation transaction (atomicity).
- `VersionedItemService` — read-side `changeSetCommit` hydration **removed entirely** (not rewired). `getById` / `getByIdAndVersion` / `getAll` return what the store reads; `getVersionHistory` removed. `changeSetCommit` is gone from every versioned-item response shape.
- `ChangeSetService` — `hydrateInto` / `hydrateAll` removed; the `id→ChangeSet` cache is now write-path-only (open-set validation + frozen snapshot). `getMembers` signature unchanged; backed by the rewritten `findMembers`.
- **`user {id, role}` propagation** — every service method signature changed `userId` → `user`, calling `createTransaction(user.id, user.role)`. Applies across all base classes (`SimpleItemService`, `TreeItemService`, `VersionedItemService`), all concrete services, the import pipeline, and `QualityService`.

### 3.4 REST API ✅ DONE

- New read-only resource **`GET /audit-events?changeSetId=&targetId=&userId=`** → `auditEventService.getAuditEvents(filters, user)`. Hand-written `audit-event.js` router, mounted at `/audit-events`. The append-only log is never mutated via REST.
- **No item-scoped `/history` endpoint.** The earlier sketch's `/{item}/{id}/history` was dropped in favour of the single audit resource — History is built client-side from `?targetId=`. The former `/{item}/{id}/versions` (version-history list) is removed from the base router and `chapter.js`; `/{item}/{id}/versions/{versionNumber}` (specific-version content) is retained.
- `x-user-role` header added: routes assemble `user {id, role}` via `getUser` / `getUserOptional` (was `getUserId` / `getUserIdOptional`, now returning the object); `role` is `null` when the header is absent (validation deferred to RBA). CORS `Access-Control-Allow-Headers` gains `x-user-role`.
- Versioned-item write bodies unchanged — they already carry `changeSetId` + `note`.
- Response schemas lost `createdAt` / `createdBy` / `changeSetCommit`; gained `status`.
- OpenAPI: new `openapi-audit-event.yml` (`AuditAction` / `AuditTargetType` / `AuditEventRow` schemas + `/audit-events`); `VersionHistory` schema replaced by `AuditEventRow`; `/versions` list paths replaced; stamp fields removed from entity schemas.

### 3.5 CLI ✅ DONE

- New `audit-event` command group mapping to the single audit query (`GET /audit-events` / `auditEventService.getAuditEvents`). One verb — list/query the log — with optional filter flags, all aligned with the store's `findAll` filters:
  - `--change-set <id>` → `changeSetId`
  - `--target <id>` → `targetId` (an item's History timeline)
  - `--user <id>` → `userId`
    All optional and combinable; no flag lists the whole log. No item-scoped `history` subcommand on entity commands — History is the `--target` filter on `audit-event`, mirroring the client.
- Existing write commands unchanged at the call site (they already pass `--change-set`).
- Note the `user {id, role}` propagation: CLI commands assemble the acting user the same way routes do (the CLI's user-context source feeds `{id, role}` to the service/API call).

### 3.6 Web client ✅ DONE

> **As-built refinements:**
> - `UserRole` enum alignment in `header.js`: ROLES updated to `DOMAIN_WRITER` / `ICDM` / `INTEGRATOR` from `@odp/shared`; `restoreUser()` performs a one-time silent migration of legacy lowercase values from localStorage; `isIntegrator` guard updated. `x-user-role` added to every `ApiClient.getHeaders()` call alongside `x-user-id`.
> - `getEntityVersions()` removed from `ApiClient` (version-list endpoint gone). `getAuditEvents({ changeSetId?, targetId?, userId? })` added.
> - `HistoryTab` fully rebuilt: fetches `GET /audit-events?targetId=` instead of removed `/versions` list; state renamed `_events` (AuditEventRow[]); columns Ver · Action · Date · Actor · CS · Note · Actions; newest-first display; Diff and Restore gated to version-producing rows; `_latestVersion()` + `_versionsForDiff()` helpers added.
> - `ChangeSetsActivity` members re-renders on `AuditEventRow` shape: dedupe key `targetId`, type lookup key `CHAPTER` (uppercase), fields `targetCode` / `targetTitle` / `targetVersion`.
> - `VersionedCommands.addVersionsCommand()` removed; `displayChangeSetCommit()` removed from `BaseCommands`; `createdAt` / `createdBy` stripped from `displayItemDetails()`; `Created By` column dropped from requirement, change, and chapter list tables.
> - `history-tab.css`: new `.history-action-badge` (per-action colour variants), `.history-version-badge--none`, `.history-cs-code` / `.history-cs-title` / `.history-row-note`.

### 3.7 ADD chapters (Phase A)

Updated in the same batch as each layer:

- **01-Data-Model** ✅ — `AuditEvent` node and relationships; item/version field removals; `HAS_REASON` removal; status field.
- **02-Storage-Layer** ✅ — `AuditEventStore` (`log` + `findAll`); `VersionedItemStore` write-path changes; `findMembers` delegation; bootstrap changes.
- **03-Service-Layer** ✅ — `AuditEventService` (`getAuditEvents`); hydration removal; `user {id, role}` propagation.
- **04-REST-API** ✅ — `/audit-events` resource; `x-user-role`; schema changes; `/versions` list removal.
- **07-CLI** ✅ — `audit-event` command; `versions` subcommands removed; `Created By` dropped from list tables; `displayChangeSetCommit` removed.
- **08-Web-Client** ✅ — History view (client-built over the audit query); HistoryTab (§7.10); user identity role alignment; api-client changes; change-set members shape.

## 4. Phase B — Lifecycle & Deletion

Layer by layer, ADD companion updated in the same batch. Rationale and full specification are in the design note (`odip-audit-delete-design.md` §3.2, §4) — this is execution sequencing only.

**In-round scope.** Lifecycle-edge model; soft delete + restore (per-item); referential integrity (live O\* inbound-reference guard); the published-item gate as the `released` lifecycle state (not edition membership); the `lifecycleFace` read model; strict-payload rejection. **Deferred** (designed, not built): release / decommission (DEL-06), hard delete (DEL-04), edition deletion (DEL-05), `BatchService`, and the non-soft-delete web client.

### 4.1 Model / shared ✅ DONE

- `AuditAction` gains `RELEASE` (`DECOMMISSION` already reserved from Phase A).
- `OperationalEntityReference` (existing) reused for where-used / referential-integrity results — no new type; `type` strictly `ON | OR | OC`. Documented in `odp-elements.js` and ADD §2.5.

> **Correction (18 Jun 2026) — applied.** An earlier as-built note implied `OperationalEntityReference.type` was extended to cover `AuditTargetType` values (including `EDITION`) for edition blockers. Reversed — `type` is strictly `ON | OR | OC`; edition captures do not block soft delete (see design note §4.1 and §5.2 correction notes). `odp-elements.js` and ADD chapter 01 §2.5 corrected.

### 4.2 Storage ✅ DONE

> **As-built refinements (vs the sketch below):**
> - `LIFECYCLE_FACE_EDGE` map exported from `versioned-item-store.js` (face value → anchoring edge); imported by the concrete O\* stores.
> - `findById` (base) also gained the `lifecycleFace` parameter (default `active`, mutually exclusive with `baselineId`) — single-item reads of any face work now, not just list reads. OR/OC `findById` thread it through to `super` (slot 6, after `projection`).
> - `softDelete` / `restore` are **concrete on the base** (`VersionedItemStore`) — edge mechanics are identical for all versioned items. Both are pure edge moves on the same version node (no new version on restore); each logs its `DELETE` / `RESTORE` event via the existing `auditEventStore.log`.
> - The store query method is `findInboundReferences` (not `findBlockingDependencies`) — the store computes raw inbound-reference facts; the "blocking" interpretation is the service's. Abstract on the base, concrete per O\* store (entity-specific edges only; O\* references only).
> - `lifecycleStatus` is assembled as a `LifecycleStatus` object `{active, released, decommissioned, deleted}` on each read row; `_computeLifecycleStatus(itemId, tx)` helper backs single-item reads.
> - `ChapterStore` overrides `softDelete` / `restore` / `findInboundReferences` to throw (chapters have no lifecycle); it keeps its own `findAll`/`findById`/`buildFindAllQuery` signatures and carries no `lifecycleStatus`.

> **Correction (18 Jun 2026) — applied.** An earlier as-built note stated `findInboundReferences` returns "entity-specific edges + the edition-membership wall, returned `type: 'EDITION'`". Removed — `findInboundReferences` is a pure where-used query returning O\* references only (`type` in `ON | OR | OC`), ignoring the target's lifecycle state and not inspecting edition/baseline captures. The edition-membership wall is not a soft-delete blocker (it relocates to hard delete, DEL-04 — see design note §4.2, §5.2, §5.4 notes). OR and OC store implementations corrected; ADD chapter 02 updated.

- New lifecycle edges `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` / `DELETED_VERSION` (joining `LATEST_VERSION`).
- Remove the Phase A `Item.status` field; lifecycle is now edge-derived.
- `findAll` gains the `lifecycleFace` dataset selector (edge-anchored; mutually exclusive with `baselineId`) and computes the four lifecycle flags into the read row at the summary tier.
- Transition methods `softDelete` / `restore` (in-round) and `release` / `decommission` / `hardDelete` (designed; build deferred).
- `findInboundReferences`.

### 4.3 Service ✅ DONE

> **As-built refinements (vs the sketch below):**
> - Read selector is `lifecycleFace`, appended **last** on `getAll(user, editionId?, filters?, projection?, lifecycleFace?)` and `getById(itemId, user, editionId?, projection?, lifecycleFace?)` — matching the store's `findAll` / `findById` order, so existing positional callers are unaffected. (The design-note's earlier `lifecycleFace`-before-`projection` ordering was amended to append-last.) `getById` gained the selector too — the store capability was otherwise stranded (recycle-bin detail / production inspection).
> - Mutual exclusion enforced by `_assertFaceEditionExclusive(editionId, lifecycleFace)` — a non-`active` face + `editionId` throws `ServiceError(BAD_REQUEST)` (message also carries `Validation failed:` → 400 on existing read routes).
> - The where-used read is **`getInboundReferences`** (renamed from `getBlockingDependencies`) — it is a thin pass-through to `store.findInboundReferences` and does **not** decide deletability; the caller combines it with `lifecycleStatus`. REST endpoint renamed to `GET /{item}/{id}/inbound-references`.
> - `softDelete` two-step guard: (1) lifecycle-state — Active *and not Released*, read via `store.findById` (the "not released" rule lives in the service; the store's `softDelete` enforces only the `LATEST_VERSION`-present edge guard) → `ServiceError(INVALID_LIFECYCLE_STATE)`; (2) reference guard via `store.findInboundReferences` → `ServiceError(LIFECYCLE_BLOCKED, references)`. `restore` is state-guard-only (must be `deleted`, read via `lifecycleFace='deleted'`), no reference check.
> - `softDelete` / `restore` / `getInboundReferences` are **concrete on the base** `VersionedItemService`; `ChapterService` overrides all three to throw (parallel to `ChapterStore`).
> - New **`ServiceError` + `ServiceErrorCode`** module (`services/service-error.js`), parallel to `StoreError`/`StoreErrorCode`: `LIFECYCLE_BLOCKED` (carries `references`), `INVALID_LIFECYCLE_STATE`, `BAD_REQUEST`. Route mapping for the two lifecycle codes is a §4.4 carry-forward.
> - Strict-payload via `_assertNoUnexpectedFields(rawPayload, op)` on the **raw** payload (before `_extractChangeSetCommit`, since the commit fields are in the allowlist), driven by abstract `_requestModelFor(op)` (patch → update model). Uses `allowedFields(model)` from `@odp/shared`. Rejection message uses the `Validation failed:` prefix → existing routes map to 400 with no router change.
> - **`messages.js` changes:** added `FORBIDDEN` marker + `allowedFields()` helper; OR/OC request models rewritten to mark forbidden fields explicitly with `FORBIDDEN` (was the ambiguous `undefined`). Fixed a latent bug — `update` models had been silently leaking `itemId`/`versionId`/`version` (spread the entity model without carving them out). create/update forbidden sets are now declared independently (`path` create-only, `expectedVersionId` update-only).

- `getAll` / `getById` gain `lifecycleFace` (default `active`, mutually exclusive with `editionId`).
- Per-item `softDelete` / `restore` with the precondition guards above; `getInboundReferences`.
- Strict-payload rejection (`Validation failed: unexpected field(s)` → 400) on create/update/patch.
- `release` / `decommission` / `hardDelete` and `BatchService.applyLifecycleBatch` — designed, build deferred.

### 4.4 REST API ✅ DONE

> **As-built refinements (vs the sketch below):**
> - Soft-delete/restore body carries the change-set commit the same way `DELETE /:id/milestones/:milestoneKey` does — the route reads `changeSetId`/`note` from `req.body` and passes an explicit `changeSetCommit`; both return the updated entity (`200`).
> - `lifecycleFace` extracted via a new `getLifecycleFace(req)` helper on `VersionedItemRouter` (default `active`), threaded as the **trailing** argument to `service.getAll` / `getById`. Exclusivity with `edition` is **not** resolved in the route — the service's `_assertFaceEditionExclusive` rejects it with a `Validation failed:` message; a `Validation failed:` arm was added to **both** read-route catches so it maps to 400 (previously those catches fell through to 500).
> - `409` refusal contract fixed as **`LifecycleConflictResponse`**: the standard `{error: {code, message}}` envelope plus a top-level `references` sibling (present for `LIFECYCLE_BLOCKED` only). `references` is a sibling of `error`, not nested, so clients reading only `error.code` are unaffected.
> - `GET /:id/inbound-references` uses `getUserOptional` (anonymous-allowed), consistent with the other reads.
> - The lifecycle routes are concrete on `VersionedItemRouter`, reaching OR/OC only; `chapter.js` is standalone and exposes none (chapters have no lifecycle). No `ChapterRouter` suppression needed.
> - `DELETE /:id` left untouched — it remains the whole-item hard destroy. Soft delete deliberately takes the `POST /:id/delete` sub-path rather than displacing it; the hard/soft verb assignment is a DEL-04 revisit (design note §4.4, §5.4).
> - Base-contract cleanup: the stale Phase-A `status` (`ACTIVE`/`DELETED`) field was replaced by the `lifecycleStatus` block on the OR/OC response schemas and **removed entirely** from the Chapter schema.

- Per-item lifecycle actions `POST /{item}/{id}/{delete|restore}` in-round; `/release` `/decommission` `/hard-delete` deferred.
- `lifecycleFace` query parameter on **both** the list `GET /{item}` and the single-item `GET /{item}/{id}` (mutually exclusive with `edition`); `GET /{item}/{id}/inbound-references`.
- Route mapping for the service's `ServiceErrorCode`: `LIFECYCLE_BLOCKED` → `409` with the inbound-reference list in the body, `INVALID_LIFECYCLE_STATE` → `409`. (`BAD_REQUEST` from the face/edition guard already resolves to 400 via the `Validation failed:` prefix path.)
- OpenAPI: lifecycle flags at summary tier of the OR/OC response schemas; inbound-reference list reuses existing `OperationalEntityReference` schema (`type` in `ON | OR | OC`); new `openapi-batch.yml` for `/batch/lifecycle` (deferred build).

### 4.5 CLI ✅ DONE

> **As-built refinements (vs the sketch below):**
> - Verbs are concrete on `VersionedCommands` (`_addSoftDeleteCommand`, `_addRestoreCommand`, `_addInboundReferencesCommand`), wired in `createCommands`; `requirement`/`change` inherit them, `chapter.js` overrides all three to no-ops (chapters have no lifecycle). Mirrors the REST layer's "concrete on the base, chapters excluded" shape.
> - `delete` occupies the verb slot `VersionedCommands` left empty (it never wired `BaseCommands.addDeleteCommand`), so soft delete is `delete` with no clash; there is no hard-delete CLI verb. Corrected a stale ADD 07 line that had described `requirement/change delete` as "delete all versions" — that hard-delete verb never existed.
> - `--lifecycle-status` validated and checked for edition/baseline exclusivity by a shared `resolveLifecycleFace` helper; forwarded as `?lifecycleFace=` only when non-default (mirrors the `projection` pattern). Single `Lifecycle` column via `formatLifecycleStatus` (lists the true flags), and the same label on `show` via the base `displayItemDetails`.
> - 409 refusal rendered by a shared `printLifecycleConflict` helper (state message + blocker table for `LIFECYCLE_BLOCKED`).
> - **Added beyond the original sketch:** a user-initiated `inbound-references <id>` query verb (`GET /{item}/{id}/inbound-references`). This refines the note's earlier "no separate `inbound-references` query verb" — that constraint was about keeping `delete` non-preemptive, not about denying a deliberate inspection. Recorded in design note §4.5.

- `requirement` / `change`: `delete` / `restore` / `inbound-references` verbs; `list --lifecycle-status`; lifecycle state in `list` / `show`.
- Non-preemptive `delete` (renders the `409` blocker list on refusal); user-initiated `inbound-references` query is separate; no batch.

### 4.6 Web client

- **In-round:** soft-delete action on the O* detail form, via the change-set save dialog; `409` conflict surfaced with blocker list.
- Everything else (lifecycle display, `lifecycleFace` selector, recycle bin, restore / release / decommission / hard-delete, batch worksheet) — P1+, deferred.

### 4.7 ADD chapters (Phase B)

Updated in the same batch as each layer: **01-Data-Model**, **02-Storage-Layer**, **03-Service-Layer**, **04-REST-API**, **07-CLI**, **08-Web-Client**.

## 5. Decision points carried into implementation

These are settled in the design note but surface as concrete code choices:

- **Audit query surface** — settled on a **single `GET /audit-events?changeSetId=&targetId=&userId=`** resource backed by one store method `findAll(filters)`, rather than an item-scoped `/{item}/{id}/history` endpoint (Phase A).
- **Lifecycle is edge-derived** — no stored `Item.status`; the Phase A field is removed. The four flags (`active` / `released` / `decommissioned` / `deleted`) are computed from edge presence into the read row at the summary tier.
- **`lifecycleFace` is a dataset selector, not a filter** — it chooses which lifecycle face the read walks, the peer of `baselineId` and mutually exclusive with it (and with `editionId` at the service/API).
- **Published-item gate is the `released` lifecycle state** — not edition membership, and not part of the inbound-reference check. `softDelete` refuses a `released` item directly (step 1, `INVALID_LIFECYCLE_STATE`); edition/baseline captures do **not** block soft delete (an immutable snapshot is unaffected by an item-level lifecycle transition). Soft delete requires Active *and not Released* state **and** no live O\* inbound references. (Supersedes an earlier "published-wall folds into blocking dependencies" framing.)
- **Strict-payload rejection** — the service rejects unexpected attributes (`Validation failed: unexpected field(s)` → 400) rather than absorbing them, validated against the `messages.js` request-model allowlists via `allowedFields`.

## 6. Open points

- **Decommissioning (DEL-06)** — parked; `DECOMMISSION` action reserved so the audit shape is stable when it lands. A separate note will cover the lifecycle status, integrity sequencing, and its (non-)coupling to the OC `DECOMMISSIONS` relationship.
- **AuditEvent retention** — no purge policy at P0; revisit if volume warrants.
- **`actorId` IAM remapping** — model-ready; implementation at P2 (RBA-04).
- **Hard-deleted target identity in the log** — ✅ resolved: `targetId` (plus `targetType` / `targetCode` / `targetTitle`) is persisted as a frozen scalar on the event, so a `HARD_DELETE` event remains a complete record after its `TARGETS` edge is gone.

## 7. Estimated layer touch summary

| Layer | Phase A | Phase B |
|---|---|---|
| shared | enums, status, field removals | `RELEASE` action; `FORBIDDEN` marker + `allowedFields()`; OR/OC request models reworked (explicit forbidden fields, leak fix); `OperationalEntityReference` confirmed O\*-only (`ON\|OR\|OC`) |
| storage | AuditEventStore (`log`+`findAll`), write-path rewire, findMembers delegation | lifecycle edges, `status` removal, `lifecycleFace` + flags in `findAll`/`findById`, `LIFECYCLE_FACE_EDGE` map, soft-delete/restore (edge moves), `findInboundReferences` O\*-only (release/decommission/hard-delete designed) |
| service | AuditEventService (`getAuditEvents`), hydration removal, `user {id,role}` propagation | `lifecycleFace` on `getAll`/`getById` (append-last); soft-delete/restore + guards; `getInboundReferences`; strict-payload rejection; `ServiceError`/`ServiceErrorCode` module |
| REST API | `/audit-events` resource, `x-user-role`, schema cleanup, `/versions` list removal | per-item delete/restore, `lifecycleFace` on list + single-item reads, `inbound-references` sub-path, `ServiceError` → `409` mapping |
| CLI | `audit-event` command | delete/restore/inbound-references verbs, `list --lifecycle-status`, Lifecycle column + `show` label |
| web | History view (client-built over audit query) | soft-delete from O* detail form (rest P1+) |
| ADD | 6 chapters (01–04 done, 07/08 pending) | 01 ✅, 02 ✅, 03 ✅, 04 ✅, 07 ✅; 08 pending |

---

*See also: [main index](odip-implementation-plan.md) · [design note](odip-audit-deletion-design.md) · [LCM note](odip-implmentation-plan-lcm.md)*