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

## 4. Phase B — Deletion

### 4.1 Model / shared

- Referential-integrity result type — a structured `BlockingDependency` list shape (`{id, type, code, title}[]`) in `@odp/shared`, used by store, service, API and UI.
- No new enums beyond Phase A (the `DELETE` / `RESTORE` / `HARD_DELETE` actions already exist).

### 4.2 Storage

- `VersionedItemStore`:
  - `softDelete(itemId, changeSetCommit, tx)` — removes `LATEST_VERSION`, sets `status = DELETED`, logs `DELETE`.
  - `restore(itemId, changeSetCommit, tx)` — creates a new version copying latest content, re-points `LATEST_VERSION`, sets `status = ACTIVE`, logs `RESTORE`.
  - `hardDelete(itemId, changeSetCommit, tx)` — destroys item + versions + relationships, logs `HARD_DELETE` (event survives the target).
  - `findBlockingDependencies(itemId, tx)` — gathers **all** live inbound references (design §4), returns the structured list.
  - `isPublished(itemId, tx)` — the `HAS_ITEMS.editions` membership check (design §5).
  - `findDeleted(tx, domainFilter?)` — the recycle-bin query (`status = DELETED`).
- `ODPEditionStore` — replace the unconditional `delete()`-throws with `softDelete` (status flip + log) and `hardDelete` (remove node + `EXPOSES` edge + log). Add `findDeleted`. Edition content immutability is unchanged.

### 4.3 Service

- `VersionedItemService`:
  - `deleteItem(id, changeSetCommit, userId)` — runs `findBlockingDependencies` and `isPublished` first; throws a structured conflict if blocked or published; else `softDelete`.
  - `restoreItem(id, changeSetCommit, userId)` — permission check (deleter or integrator); `restore`.
  - `hardDeleteItem(id, changeSetCommit, userId)` — integrator-only; requires `status = DELETED` and never-published; `hardDelete`.
  - `getRecycleBin(userId)` — `findDeleted` with domain scoping.
- `ODIPEditionService` — `deleteEdition` / `hardDeleteEdition` (integrator-only) and `getDeletedEditions`.
- Permission checks reference the RBA-02 matrix (hard-coded at P0).

### 4.4 REST API

- `DELETE /{item}/{id}` — soft delete; `409 CONFLICT` with the blocking-dependency list or published-wall reason in the error envelope.
- `POST /{item}/{id}/restore`.
- `DELETE /{item}/{id}/hard` (integrator-only) — or a `?hard=true` modifier; recommendation: a distinct `/hard` sub-path for clarity and separate authorization.
- `GET /recycle-bin` — bin contents, domain-scoped.
- Edition equivalents: `DELETE /editions/{id}`, `POST /editions/{id}/restore`, `DELETE /editions/{id}/hard`.
- Error mapping: blocked deletion → `409 CONFLICT` (reuse existing arm); published wall → `409 CONFLICT` with a distinct code (e.g. `PUBLISHED_WALL`); hard-delete authorization failure → `403`.
- OpenAPI: delete/restore/hard paths, `BlockingDependency` schema, recycle-bin resource, new error codes.

### 4.5 CLI

- New verbs on item command groups: `delete <id> --change-set <id>`, `restore <id> --change-set <id>`, `hard-delete <id> --change-set <id>` (integrator), `recycle-bin [--domain ...]`.
- Edition equivalents under the existing edition command group.
- Blocking-dependency lists rendered as a table when a delete is refused.

### 4.6 Web client

- **Recycle bin** — a new view (Manage activity) listing deleted items with who/when/why, domain-scoped; restore action (deleter/integrator); hard-delete action (integrator) with strong confirmation.
- **Delete affordance** — on O* / chapter detail, a Delete action routed through the standard save dialog (it is a version-producing… *no longer version-producing, but still* change-set-bound write — the dialog supplies the ChangeSet + note). On a blocked delete, render the full blocking-dependency list inline with deep links to each blocker. On a published item, render the wall message (decommission is the path, but decommission is parked — so at P0 the message states deletion is not possible).
- Edition delete / restore in the edition management view (integrator-gated).

### 4.7 ADD chapters (Phase B)

- **01-Data-Model** — deletion lifecycle, status transitions, published-wall semantics.
- **02-Storage-Layer** — the new `VersionedItemStore` / `ODPEditionStore` methods.
- **03-Service-Layer** — delete/restore/hard-delete service methods and permission gates.
- **04-REST-API** — delete/restore/hard/recycle-bin paths and error codes.
- **07-CLI** — delete/restore/hard-delete/recycle-bin verbs.
- **08-Web-Client** — recycle bin view, delete affordance, blocking-dependency display.

## 5. Decision points carried into implementation

These are settled in the design note but surface as concrete code choices:

- **Audit query surface** — settled on a **single `GET /audit-events?changeSetId=&targetId=&userId=`** resource backed by one store method `findAll(filters)`, rather than an item-scoped `/{item}/{id}/history` endpoint. History is built client-side from `?targetId=`; change-set members reuse the same query with `?changeSetId=`. This superseded the earlier §3.4 recommendation of a nested `history` sub-resource.
- **Hard-delete API shape** — distinct `/hard` sub-path preferred over a `?hard=` modifier (§4.4).
- **Published-wall message at P0** — since decommission is parked, the wall presents as "deletion not possible" with no decommission CTA yet (§4.6).

## 6. Open points

- **Decommissioning (DEL-06)** — parked; `DECOMMISSION` action reserved so the audit shape is stable when it lands. A separate note will cover the lifecycle status, integrity sequencing, and its (non-)coupling to the OC `DECOMMISSIONS` relationship.
- **AuditEvent retention** — no purge policy at P0; revisit if volume warrants.
- **`actorId` IAM remapping** — model-ready; implementation at P2 (RBA-04).
- **Hard-deleted target identity in the log** — ✅ resolved: `targetId` (plus `targetType` / `targetCode` / `targetTitle`) is persisted as a frozen scalar on the event, so a `HARD_DELETE` event remains a complete record after its `TARGETS` edge is gone.

## 7. Estimated layer touch summary

| Layer | Phase A | Phase B |
|---|---|---|
| shared | enums, status, field removals | blocking-dependency type |
| storage | AuditEventStore (`log`+`findAll`), write-path rewire, findMembers delegation | delete/restore/hard methods, integrity, wall, edition store |
| service | AuditEventService (`getAuditEvents`), hydration removal, `user {id,role}` propagation | delete/restore/hard services, permission gates |
| REST API | `/audit-events` resource, `x-user-role`, schema cleanup, `/versions` list removal | delete/restore/hard/recycle-bin paths |
| CLI | `audit-event` command | delete/restore/hard-delete/recycle-bin verbs |
| web | History view (client-built over audit query) | recycle bin, delete affordance |
| ADD | 6 chapters (01–04 done, 07/08 pending) | 6 chapters |

---

*See also: [main index](odip-implementation-plan.md) · [design note](odip-audit-deletion-design.md) · [LCM note](odip-implmentation-plan-lcm.md)*