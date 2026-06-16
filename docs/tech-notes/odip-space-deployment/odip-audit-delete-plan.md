# ODIP Implementation Plan — Audit & Deletion (Plan)

*Implementation plan*

*v0.1 — 16 June 2026 — DRAFT for discussion*

## 1. Scope

Layer-by-layer implementation of the audit/deletion revision described in the companion design note ([odip-audit-deletion-design.md](odip-audit-deletion-design.md)). Read that note first — this document carries execution only, not rationale.

The revision is foundational: it touches the core versioning pattern (`ItemVersion` loses its audit role), removes the `HAS_REASON` edge, and introduces `AuditEvent` as the sole audit surface, before layering deletion on top. Sequencing therefore matters — the audit foundation lands before the deletion features that depend on it.

## 2. Sequencing overview

The work splits into two phases, each implemented layer by layer with its ADD companion chapter updated in the same batch.

**Phase A — Audit foundation.** Introduce `AuditEvent`; strip audit fields from item/version nodes; remove `HAS_REASON`; rewire change-set membership and the History view onto the log. At the end of Phase A the application behaves as before *to the user* (no deletion yet) but records every write in the log and reads History/members from it.

> **Status (16 Jun 2026):** §3.1 model/shared ✅ DONE · §3.2 storage ✅ DONE · §3.3 service ⏳ NEXT · §3.4 REST · §3.5 CLI · §3.6 web · §3.7 ADD (01/02 done with their layers).

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
> - `userId` **and `userRole`** are read from the transaction; `transaction.js` gained `userRole` + `getUserRole()`, `createTransaction(userId, userRole)`.
> - `_validateOpenChangeSet` now **returns the frozen `{code, title, classifier}` snapshot**; `_auditCommit` and `_resolveAuditTargetType` added.
> - `findVersionHistory` **removed** (not rewired) — History is served by `AuditEventStore.findByTarget`. `_writeHasReason` / `_resolveChangeSetCommit` / `_attachChangeSetCommits` removed.
> - Member row keeps **`versionId`** (resolved on demand from `targetId`+`targetVersion`); `itemType` is the uppercase `AuditTargetType` (`CHAPTER`, not `chapter`).
> - **Bootstrap chapters record no audit event** (config scaffolding); resolves the old "system change set" open point — no system actor, `UserRole` stays writer-only.
> - Index: `AuditEvent.timestamp` only at P0. *(Pending: the `_ensureConstraints` edit in `store/index.js`, not yet uploaded.)*

- New `AuditEventStore` with the single write method `log(action, targetId, targetType, targetVersion, actorId, changeSetId, note, tx)` — creates the `AuditEvent` node, the `TARGETS` edge, and the `UNDER_CHANGESET` edge when `changeSetId` is present. Read methods: `findByTarget(itemId, tx)` (History feed) and `findByChangeSet(changeSetId, tx)` (members feed).
- `VersionedItemStore` — `create` / `update` stop stamping `createdAt` / `createdBy` and stop writing `HAS_REASON`; instead each calls `auditEventStore.log(...)` in the same transaction. The `changeSetCommit` argument is retained (it still carries `changeSetId` + `note`) but now feeds the audit event rather than the edge.
- `ChangeSetStore.findMembers` — rewrite onto the single-hop `UNDER_CHANGESET` traversal (design §3.6). Drop the `HAS_REASON` reverse traversal.
- `BaseStore` — `close` / `reopen` on `ChangeSetStore`, and the management-entity writes, gain their `log(...)` calls.
- Remove the `HAS_REASON` constraint/index bootstrap; add the `AuditEvent` node and any index on `timestamp`.

### 3.3 Service

- New `AuditEventService` — read-side queries for the History view (`getItemHistory(itemId, userId)`) and any audit consumers. Write is not a service concern: the log is written by stores inside the operation transaction, not by a separate service call (which would break atomicity).
- `VersionedItemService` — read hydration that filled `changeSetCommit.changeSetTitle` / `classifier` from the `ChangeSetService` cache is retained for the History view, but now keyed off the audit event's `UNDER_CHANGESET` rather than the version's `HAS_REASON`.
- `ChangeSetService.getMembers` — unchanged signature; backed by the rewritten `findMembers`.

### 3.4 REST API

- New read-only resource `/audit` (or nested `GET /{item}/{id}/history`) returning the unified timeline for an item. Confirm placement: a dedicated `/audit` namespace vs a `history` sub-resource on each versioned item. Recommendation: `GET /operational-requirements/{id}/history` etc., since History is always item-scoped at P0.
- Versioned-item write bodies are unchanged — they already carry `changeSetId` + `note` (the `changeSetCommit` write shape). No request-shape change for clients.
- Remove any response fields that exposed version-node `createdAt` / `createdBy` directly; History responses carry the audit event's actor/timestamp instead.
- OpenAPI: new `AuditEvent` schema, new history path(s), removal of stamp fields from version response schemas.

### 3.5 CLI

- New `audit` command group (or `history` subcommand on existing item commands): `... history <id>` lists the timeline.
- Existing write commands are unchanged at the call site (they already pass `--change-set`).

### 3.6 Web client

- `apiClient` — new `getItemHistory(type, id)`; remove reliance on version-node stamps in any list/detail rendering.
- **History view redesign** — this is the deferred LCM History revisit, realised now. Render the unified AuditEvent timeline: one row per event, showing action, actor, timestamp, change-set link (where present), note. The previous version-list History tab is replaced by this timeline.
- Change-set member rendering is unchanged in the UI (the `findMembers` projection shape is preserved); only its backing query changed.

### 3.7 ADD chapters (Phase A)

Updated in the same batch as the code:

- **01-Data-Model** — `AuditEvent` node and relationships; item/version field removals; `HAS_REASON` removal; status field.
- **02-Storage-Layer** — `AuditEventStore`; `VersionedItemStore` write-path changes; `findMembers` rewrite; bootstrap changes.
- **03-Service-Layer** — `AuditEventService`; hydration rewiring.
- **04-REST-API** — history resource; schema changes.
- **07-CLI** — `history` command.
- **08-Web-Client** — History view redesign.

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

- **History endpoint placement** — item-scoped sub-resource (`/{item}/{id}/history`) preferred over a global `/audit` namespace at P0 (§3.4).
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
| storage | AuditEventStore, write-path rewire, findMembers | delete/restore/hard methods, integrity, wall, edition store |
| service | AuditEventService, hydration rewire | delete/restore/hard services, permission gates |
| REST API | history resource, schema cleanup | delete/restore/hard/recycle-bin paths |
| CLI | history command | delete/restore/hard/recycle-bin verbs |
| web | History view redesign | recycle bin, delete affordance |
| ADD | 6 chapters | 6 chapters |

---

*See also: [main index](odip-implementation-plan.md) · [design note](odip-audit-deletion-design.md) · [LCM note](odip-implmentation-plan-lcm.md)*