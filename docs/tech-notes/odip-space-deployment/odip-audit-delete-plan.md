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

> **Status (18 Jun 2026):** §4.1 model/shared ⏳ · §4.2 storage ⏳ · §4.3 service ⏳ · §4.4 REST ⏳ · §4.5 CLI ⏳ · §4.6 web ⏳ · §4.7 ADD (01 ⏳, 02 ⏳; 03/04/07/08 pending) — **in progress.** §4.1 and §4.2 reopened: `OperationalEntityReference` type scope corrected (O\* only; edition references removed) and `findInboundReferences` revised to O\* references only (see design note §4.1/§4.2/§5.2 correction notes).

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

**In-round scope.** Lifecycle-edge model; soft delete + restore (per-item); referential integrity (blocking dependencies, published-wall folded in); the `lifecycleFace` read model; strict-payload rejection. **Deferred** (designed, not built): release / decommission (DEL-06), hard delete (DEL-04), edition deletion (DEL-05), `BatchService`, and the non-soft-delete web client.

### 4.1 Model / shared ⏳

- `AuditAction` gains `RELEASE` (`DECOMMISSION` already reserved from Phase A).
- `OperationalEntityReference` (existing) documented as the blocker-list shape — no new type; usage note added to `odp-elements.js` and ADD §2.5.

> **Correction (18 Jun 2026):** The earlier as-built note implied `OperationalEntityReference.type` was extended to cover `AuditTargetType` values (including `EDITION`) for edition blockers. This was wrong and is reversed — `type` is strictly `ON | OR | OC`. Edition captures do not block soft delete; the `released` lifecycle state is the correct gate (see design note §4.1 and §5.2 correction notes). ADD chapter 01 §2.5 and `odp-elements.js` need correction.

### 4.2 Storage ⏳

> **As-built refinements (vs the sketch below):**
> - `LIFECYCLE_FACE_EDGE` map exported from `versioned-item-store.js` (face value → anchoring edge); imported by the concrete O\* stores.
> - `findById` (base) also gained the `lifecycleFace` parameter (default `active`, mutually exclusive with `baselineId`) — single-item reads of any face work now, not just list reads. OR/OC `findById` thread it through to `super` (slot 6, after `projection`).
> - `softDelete` / `restore` are **concrete on the base** (`VersionedItemStore`) — edge mechanics are identical for all versioned items. Both are pure edge moves on the same version node (no new version on restore); each logs its `DELETE` / `RESTORE` event via the existing `auditEventStore.log`.
> - The store query method is `findInboundReferences` (not `findBlockingDependencies`) — the store computes raw inbound-reference facts; the "blocking" interpretation is the service's. Abstract on the base, concrete per O\* store (entity-specific edges only).
> - `lifecycleStatus` is assembled as a `LifecycleStatus` object `{active, released, decommissioned, deleted}` on each read row; `_computeLifecycleStatus(itemId, tx)` helper backs single-item reads.
> - `ChapterStore` overrides `softDelete` / `restore` / `findInboundReferences` to throw (chapters have no lifecycle); it keeps its own `findAll`/`findById`/`buildFindAllQuery` signatures and carries no `lifecycleStatus`.

> **Correction (18 Jun 2026):** The earlier as-built note stated `findInboundReferences` returns "entity-specific edges + the edition-membership wall, returned `type: 'EDITION'`". This is removed — `findInboundReferences` returns O\* references only (`type` in `ON | OR | OC`). The edition-membership wall is not a blocking dependency; the `released` lifecycle state is the correct gate (see design note §4.2 and §5.2 correction notes). Concrete OR and OC store implementations need correction.

- New lifecycle edges `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` / `DELETED_VERSION` (joining `LATEST_VERSION`).
- Remove the Phase A `Item.status` field; lifecycle is now edge-derived.
- `findAll` gains the `lifecycleFace` dataset selector (edge-anchored; mutually exclusive with `baselineId`) and computes the four lifecycle flags into the read row at the summary tier.
- Transition methods `softDelete` / `restore` (in-round) and `release` / `decommission` / `hardDelete` (designed; build deferred).
- `findInboundReferences`.

### 4.3 Service

- `getAll` gains `lifecycleFace` (default `active`, mutually exclusive with `editionId`).
- Per-item `softDelete` / `restore` with two-step precondition: (1) lifecycle-state guard — Active *and not Released* (invalid-transition error if fails); (2) blocking-reference guard via `getBlockingDependencies` — 409 with `OperationalEntityReference[]` if non-empty.
- `getBlockingDependencies(itemId, user)` — returns live O\* inbound references only; used preemptively by the client and internally by `softDelete`.
- Strict-payload rejection (`BAD_REQUEST` on unexpected attributes) added to create/update/patch validation.
- `release` / `decommission` / `hardDelete` and `BatchService.applyLifecycleBatch` — designed, build deferred.

### 4.4 REST API

- Per-item lifecycle actions `POST /{item}/{id}/{delete|restore}` in-round; `/release` `/decommission` `/hard-delete` deferred.
- `lifecycleFace` query parameter on the list endpoint (mutually exclusive with `edition`); `GET /{item}/{id}/blocking-dependencies`.
- `409` refusal reuses the `Error` envelope with a new code (e.g. `LIFECYCLE_BLOCKED`) carrying the blocker list.
- OpenAPI: lifecycle flags at summary tier of the OR/OC response schemas; blocker list reuses existing `OperationalEntityReference` schema; new `openapi-batch.yml` for `/batch/lifecycle` (deferred build).

### 4.5 CLI

- `requirement` / `change`: `delete` / `restore` verbs; `list --lifecycle-status`; lifecycle state in `list` / `show`.
- Non-preemptive (renders the `409` blocker list on refusal); no batch.

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
- **Published-wall folds into blocking dependencies** — no separate `isPublished` gate; an edition/baseline reference is one kind of blocker. Soft delete requires Active state *and* no blocking dependencies.
- **Strict-payload rejection** — the service rejects unexpected attributes with `BAD_REQUEST` rather than absorbing them.

## 6. Open points

- **Decommissioning (DEL-06)** — parked; `DECOMMISSION` action reserved so the audit shape is stable when it lands. A separate note will cover the lifecycle status, integrity sequencing, and its (non-)coupling to the OC `DECOMMISSIONS` relationship.
- **AuditEvent retention** — no purge policy at P0; revisit if volume warrants.
- **`actorId` IAM remapping** — model-ready; implementation at P2 (RBA-04).
- **Hard-deleted target identity in the log** — ✅ resolved: `targetId` (plus `targetType` / `targetCode` / `targetTitle`) is persisted as a frozen scalar on the event, so a `HARD_DELETE` event remains a complete record after its `TARGETS` edge is gone.

## 7. Estimated layer touch summary

| Layer | Phase A | Phase B |
|---|---|---|
| shared | enums, status, field removals | `RELEASE` action; `OperationalEntityReference` extended usage documented |
| storage | AuditEventStore (`log`+`findAll`), write-path rewire, findMembers delegation | lifecycle edges, `status` removal, `lifecycleFace` + flags in `findAll`/`findById`, `LIFECYCLE_FACE_EDGE` map, soft-delete/restore (edge moves), `findInboundReferences` (release/decommission/hard-delete designed) |
| service | AuditEventService (`getAuditEvents`), hydration removal, `user {id,role}` propagation | `lifecycleFace` on `getAll`, soft-delete/restore + guard, strict-payload rejection |
| REST API | `/audit-events` resource, `x-user-role`, schema cleanup, `/versions` list removal | per-item delete/restore, `lifecycleFace` param, blocking-dependencies, `409` blocker envelope |
| CLI | `audit-event` command | delete/restore verbs, `list --lifecycle-status` |
| web | History view (client-built over audit query) | soft-delete from O* detail form (rest P1+) |
| ADD | 6 chapters (01–04 done, 07/08 pending) | 6 chapters |

---

*See also: [main index](odip-implementation-plan.md) · [design note](odip-audit-deletion-design.md) · [LCM note](odip-implmentation-plan-lcm.md)*