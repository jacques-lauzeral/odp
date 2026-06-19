# Chapter 03 – Service Layer

## 1. Overview

The service layer is the business logic tier of ODIP. It sits between the REST routes and the store layer, owning three responsibilities that neither route handlers nor stores handle: **transaction lifecycle**, **validation**, and **orchestration** of multi-store operations.

```
HTTP Request → Route Handler → Service Method → Store(s) → Neo4j
                                     ↕
                          Transaction + Validation
```

Routes are thin — they parse HTTP input, call a single service method, and map the result to an HTTP response. The service method performs all meaningful work inside a transaction boundary it manages exclusively.

---

## 2. Design Principles

### 2.1 Transaction Ownership

Services own the full transaction lifecycle. A transaction is created at the start of a service method, passed down to every store call, and either committed on success or rolled back on any error. Routes never create, commit, or roll back transactions.

This guarantees that each user action is atomic: content, relationships, and milestones are all committed together or not at all.

### 2.2 Validation at the Service Boundary

Validation happens in the service layer before the main write transaction is opened. The route layer performs only structural HTTP checks (required parameters, type coercion). The store layer performs only low-level constraint enforcement (self-reference prevention, node existence for relationship creation). Business rules — type compatibility, field constraints, dependency integrity — belong to the service layer.

Reference existence checks open their own short-lived `'system'` transactions, separate from the main write transaction. This keeps validation independent of the write and allows parallel validation where possible (see §5).

### 2.3 User Context Propagation

Every service method receives `user` (`{id, role}`) as a parameter. It is passed to `createTransaction(user.id, user.role)`; the transaction carries both, exposed via `getUserId()` and `getUserRole()`. The store layer reads both when writing `AuditEvent` nodes — `userId` and the role-at-action-time (`userRole`) are frozen onto each event. This is what provides the audit trail; version nodes no longer carry `createdAt`/`createdBy` stamps (Phase A — audit foundation).

Routes assemble `user` from the authenticated request context and pass it down. Validation-only `'system'` transactions (reference-existence checks) are created with the literal `createTransaction('system')` and write no audit event, so the defaulted role is immaterial there.

### 2.4 No Direct Store Coupling in Routes

Routes import service modules only. Store modules are never imported by routes.

---

## 3. Service Hierarchy

Three base classes cover all entity types.

```
SimpleItemService          (CRUD + transaction wrapping)
└── TreeItemService        (+ name/description validation + REFINES hierarchy)
    ├── StakeholderCategoryService
    └── ReferenceDocumentService
    (also flat, no hierarchy:)
    WaveService
    BandwidthService

VersionedItemService       (versioned CRUD + patch + multi-context)
├── ChapterService
├── OperationalRequirementService
└── OperationalChangeService

(standalone management services:)
BaselineService
ODIPEditionService

(quality orchestration — read-only, no base class:)
QualityService

(audit read orchestration — read-only, no base class:)
AuditEventService
```

### 3.1 SimpleItemService

Abstract base for all non-versioned entities. Wraps `BaseStore` CRUD with transaction boundaries and delegates validation to subclasses via two abstract methods.

| Method | Description |
|---|---|
| `listItems(user)` | List all entities |
| `getItem(id, user)` | Fetch single entity |
| `createItem(data, user)` | Validate then create |
| `updateItem(id, data, user)` | Validate then update; returns `null` if not found |
| `deleteItem(id, user)` | Delete entity |
| `_validateCreateData(data)` *(abstract)* | Must be implemented by subclass |
| `_validateUpdateData(data)` *(abstract)* | Must be implemented by subclass |

### 3.2 TreeItemService

Extends `SimpleItemService`. Implements validation for `{name, description}` entities and overrides `createItem`, `updateItem`, `deleteItem` to manage the REFINES parent–child relationship. Delete is blocked if the item has children.

Additional methods:

| Method | Description |
|---|---|
| `getChildren(parentId, user)` | Direct children of an item |
| `getParent(childId, user)` | Parent of an item |
| `getRoots(user)` | Items with no parent |
| `createRefinesRelation(childId, parentId, user)` | Explicit relationship creation |
| `deleteRefinesRelation(childId, parentId, user)` | Explicit relationship removal |
| `findItemsByName(namePattern, user)` | Case-insensitive name search (in-memory filter) |
| `isNameExists(name, excludeId?, user)` | Uniqueness check (in-memory) |

`WaveService` and `BandwidthService` extend `SimpleItemService` directly (no hierarchy).

### 3.3 VersionedItemService

Abstract base for versioned entities. Each mutation produces a new version node. Updates require `expectedVersionId` for optimistic locking.

| Method | Description |
|---|---|
| `create(payload, user)` | Strict-payload check, validate, then create at version 1 |
| `update(itemId, payload, expectedVersionId, user)` | Strict-payload check, validate, then create new version |
| `patch(itemId, patchPayload, expectedVersionId, user)` | Strict-payload check, then partial update — merges with current via `_computePatchedPayload`, validates, updates |
| `getById(itemId, user, editionId?, projection?, lifecycleFace?)` | Fetch with optional edition context, projection, and lifecycle face; resolves edition to `{baselineId, editionId}` internally before calling store |
| `getByIdAndVersion(itemId, versionNumber, user)` | Fetch specific historical version |
| `getAll(user, editionId?, filters?, projection?, lifecycleFace?)` | List with optional edition context, filters, projection, and lifecycle face; resolves edition internally before calling store |
| `softDelete(itemId, changeSetCommit, user)` | Move item Active → Deleted; two-step precondition guard (see below) |
| `restore(itemId, changeSetCommit, user)` | Move item Deleted → Active; lifecycle-state guard only |
| `getInboundReferences(itemId, user)` | Live O\* items referencing this one (`OperationalEntityReference[]`); where-used read, does not decide deletability |
| `delete(itemId, user)` | Delete item and all versions (hard delete of the whole item — distinct from `softDelete`) |
| `_validateCreatePayload(payload)` *(abstract)* | Must be implemented by subclass |
| `_validateUpdatePayload(payload, itemId?)` *(abstract)* | Must be implemented by subclass; `itemId` is `null` on create, set on update/patch |
| `_computePatchedPayload(current, patchPayload)` *(abstract)* | Field merge logic; must be implemented by subclass |
| `_requestModelFor(op)` *(abstract, defaulted)* | Returns the `messages.js` request model for `'create'`/`'update'`/`'patch'` (patch → update model), driving strict-payload validation; default returns `null` (no check) |

`patch()` is implemented entirely in the base class: it fetches the current entity (latest version), calls `_computePatchedPayload()` on the subclass to merge fields, validates the merged result via `_validateUpdatePayload(payload, itemId)`, and calls `store.update()` — all in a single transaction. Because `patch` always merges first, the store always receives a complete payload.

**Change-set linkage (LCM).** `payload` is the request message, and the request models carry the commit fields (`changeSetId`, `note`) alongside entity content. Routes stay pass-through; the message→domain split happens here, in `_extractChangeSetCommit(payload)` → `{data, changeSetCommit}`. `create`/`update`/`patch` pass `data` (pure entity state) and the explicit `changeSetCommit = {changeSetId, note}` to `store.*`, so the store boundary never sees the commit embedded in entity data. The store writes the `AuditEvent` (with the frozen `{code, title, classifier}` change-set snapshot) atomically inside the same transaction.

There is **no read-side `changeSetCommit` hydration** (Phase A — audit foundation). The field is gone from every versioned-item response shape; who/when/why lives in the audit log, queried via `AuditEventService.getAuditEvents`. `getById`/`getByIdAndVersion`/`getAll` simply return what the store reads — no `changeSetService` call on the read path. `getVersionHistory` is removed entirely; the client builds History from audit events filtered by `targetId`.

`ChapterService` overrides `getAll()` to omit edition context and filters (chapters are always listed in full, using `'standard'` projection). It also overrides `getById()` to default to `'extended'` projection (carrying `lifecycleFace` for base-signature alignment, passed through to a store that ignores it). It disables `create()` and `delete()` — chapters are bootstrap-only — and overrides `softDelete()` / `restore()` / `getInboundReferences()` to throw, since chapters have no lifecycle (parallel to `ChapterStore`'s overrides).

**Edition context resolution:** When `editionId` is provided to `getAll` or `getById`, the service calls `odpEditionStore().resolveContext(editionId, tx)` within the same transaction to obtain `{baselineId, editionId}`. It then passes `baselineId` as the store's positional argument and `editionId` via `filters.editionId`. The store applies `$editionId IN r.editions` as a WHERE condition on the `HAS_ITEMS` relationship. The route layer has no knowledge of baselines — it passes only `editionId` or `null`.

**Lifecycle face (dataset selector).** `getAll` and `getById` carry an optional `lifecycleFace` (`active` default / `released` / `decommissioned` / `deleted`), appended **last** in the signature to match the store's `findAll` / `findById` argument order. It selects which lifecycle edge anchors a **live-dataset** read and is mutually exclusive with `editionId` (the baseline-snapshot dataset): `_assertFaceEditionExclusive(editionId, lifecycleFace)` rejects a non-`active` face combined with an `editionId` (`Validation failed:` message → 400). The service forwards `lifecycleFace` to the store, which derives the four `lifecycleStatus` flags into every read row regardless of face.

**Filter resolution (`_resolveFilters`).** `getAll` calls `_resolveFilters(filters, tx)` after edition resolution and before the store read, within the same transaction. The base implementation is pass-through; subclasses override it to expand business-level filter semantics into the flat shape the store expects. `OperationalRequirementService` overrides it for the impacted-stakeholder filter, whose match scope is controlled by the boolean `impactedStakeholderExactMatch` (default `false`): when `false` (**business**, the default) the filter resolves to the selected category plus all its descendants in the StakeholderCategory `REFINES` tree (downward only), obtained via `stakeholderCategoryStore().findDescendants(selectedId, tx)`; when `true` (**exact**) it resolves to the selected category alone. In both cases the store receives a flat ID list on `impactedStakeholder` (the `IN` match), and the `impactedStakeholderExactMatch` key is consumed here, never forwarded. The acting-stakeholder filter (`actingStakeholder`) is exact-only and passes through untouched.

**Lifecycle transitions.** `softDelete` and `restore` are concrete on the base — the logic is identical for ON/OR and OC, and the store methods are likewise concrete on `VersionedItemStore`. Each opens one transaction, runs its precondition guard, calls the store transition, and commits:

- **`softDelete`** enforces a two-step precondition before mutating, both inside the transaction (Neo4j backstops neither — only `LATEST_VERSION` is moved):
  1. *Lifecycle-state guard* — the item must be Active and **not** Released (`lifecycleStatus.active && !released`, read via `store.findById`). The store's `softDelete` enforces only the `LATEST_VERSION`-present edge guard; the "not released" rule lives in the service because the store would otherwise drop `LATEST_VERSION` on a still-released item. A released item's only sanctioned exits are release/decommission (DEL-06). Failure throws `ServiceError(INVALID_LIFECYCLE_STATE)`.
  2. *Reference guard* — `store.findInboundReferences` must return empty. A non-empty list throws `ServiceError(LIFECYCLE_BLOCKED, references)` carrying the `OperationalEntityReference[]`.
- **`restore`** enforces the lifecycle-state guard **only** — the item must be in the Deleted state (read via `store.findById(..., lifecycleFace='deleted')`); failure throws `ServiceError(INVALID_LIFECYCLE_STATE)`. There is no reference guard: re-adding `LATEST_VERSION` cannot introduce a new blocker.

`release` / `decommission` / `hardDelete` and the cross-cutting `BatchService.applyLifecycleBatch` are designed (DEL-06 / DEL-04) but not built this round.

**`getInboundReferences(itemId, user)`** is a thin read over `store.findInboundReferences` returning the live O\* where-used list (`OperationalEntityReference[]`, `type` in `ON | OR | OC`). It does **not** decide deletability — the caller combines the list with the item's `lifecycleStatus` (a non-empty list and/or a `released` state means the item is not soft-deletable). It backs the preemptive `GET /{item}/{id}/inbound-references`; `softDelete` calls the store method directly inside its own transaction rather than via this method.

**Strict-payload validation.** `create`/`update`/`patch` call `_assertNoUnexpectedFields(payload, op)` on the **raw** payload — before `_extractChangeSetCommit`, because the request models include the commit fields (`changeSetId`, `note`) in their allowlist. The accepted-field set is derived from the `messages.js` request model via `allowedFields(model)` (every key not marked `FORBIDDEN`); `_requestModelFor(op)` supplies the model, returning the **update** model for the `patch` case (a patch is any subset of update-writable fields). Any key outside the set is an unexpected attribute and throws `Validation failed: unexpected field(s): …` (→ 400), rather than ending up as an inert orphan property on the version node. Subclasses opt in by implementing `_requestModelFor`; the base default returns `null` (no check). This covers `lifecycleStatus` with no special-casing — it is `FORBIDDEN` in the request models (response-only), so a payload carrying it is rejected like any other unexpected field.

### 3.4 OperationalRequirementService

Extends `VersionedItemService`. Required fields at create: `title`, `type`, `maturity`, `domain`. All relationship arrays are optional. Further fields are required conditionally based on maturity level (see maturity-gated rules below).

Key validation rules:

- `type` must be `ON` or `OR` (validated against `OperationalRequirementType` enum)
- `maturity` must be a valid `MaturityLevel` value (`DRAFT`, `ADVANCED`, or `MATURE`)
- `domain` is mandatory and must be a valid domain key from `domains.json` (validated via `isDomainValid()`)
- Type-gated fields — `ON` only: `tentative`, `strategicDocuments`; `OR` only: `implementedONs`, `dependencies`, `impactedStakeholders`, `actingStakeholders` — rejected on the wrong type
- `tentative` if present must be `{start, end}` integer year range with `start <= end`
- `implementedONs` only allowed on `OR`-type requirements; each referenced item must exist and be `ON`-type
- `OR` requirements cannot refine `ON` requirements (and vice versa); parent type checked per-item
- Annotated reference arrays (`impactedStakeholders`, `actingStakeholders`, `strategicDocuments`) must use `{id, note?}` object format
- Referenced entities (`impactedStakeholders`, `actingStakeholders`, `strategicDocuments`) validated for existence using separate `'system'` transactions; validations run in parallel via `Promise.all`
- `_requestModelFor(op)` returns `OperationalRequirementRequests.{create|update}` (patch → update), enabling the base strict-payload check. Note this is independent of the existing type-immutability rule: `type` is an *allowed* field on update (the client sends it back), while `_validateUpdatePayload` separately rejects *changing* it.

**Narrative generator support:**
- `getONStrategicDocumentRefs(user, editionId?)` — wraps `OperationalRequirementStore.findONStrategicDocumentRefs()`. Returns `Array<{ itemId, code, title, docId, note }>` — all `(ON, ReferenceDocument, note)` triples in a single query. Called by `ChapterService._buildRefDocMap()` for the strategic-traceability generated block.
- `getEditionStats(user, editionId?)` — wraps `OperationalRequirementStore.getMaturityCounts()` and pivots the rows into a flat stats object `{ onTotalCount, onDraftCount, onAdvancedCount, onMatureCount, orTotalCount, orDraftCount, orAdvancedCount, orMatureCount }`. Called by `ChapterService._resolveStringKeys()` for portfolio statistics generated strings.
- `getEditionStatsByDomain(user, editionId?)` — wraps `OperationalRequirementStore.getCountsByDomain()` and pivots the rows into `Map<domain, { onTotal, orTotal }>`. Called by `ChapterService._buildPortfolioTableData()` for the portfolio table generated block.

### 3.5 OperationalChangeService

Extends `VersionedItemService`. Required fields: `title`, `purpose`, `initialState`, `finalState`, `domain`, `maturity` (note: `domain` is **required** on OC as on OR).

Additional milestone methods — all require `expectedVersionId` because each operation creates a new OC version internally:

| Method | Description |
|---|---|
| `getMilestones(itemId, user, baselineId?)` | Returns `milestones` array from OC |
| `getMilestone(itemId, milestoneKey, user, baselineId?)` | Single milestone by stable `milestoneKey` |
| `addMilestone(itemId, milestoneData, expectedVersionId, user)` | Appends milestone; returns `{milestone, operationalChange}` |
| `updateMilestone(itemId, milestoneKey, milestoneData, expectedVersionId, user)` | Replaces milestone by key; returns `{milestone, operationalChange}` |
| `deleteMilestone(itemId, milestoneKey, expectedVersionId, user)` | Removes milestone by key; returns `{operationalChange}` |

Milestone mutations work by fetching the current OC, rebuilding the full milestones array, and calling `store.update()` with the complete payload — there is no direct milestone write. The `milestoneKey` is a stable UUID-based identifier preserved across versions.

**Change-set linkage:** each milestone mutation creates a new OC version and therefore commits under a change set. `addMilestone`/`updateMilestone` extract `{changeSetId, note}` from their `milestoneData` message (the milestone fields are the remainder); `deleteMilestone` has no entity body, so it takes an explicit `changeSetCommit` argument supplied by the route. All three thread `changeSetCommit` into `store.update(itemId, completePayload, expectedVersionId, tx, changeSetCommit)`.

**Milestone ownership contract:** `milestones` is forbidden in `update` and `patch` payloads — passing it returns a 400 validation error. Milestones must be managed exclusively via the dedicated milestone endpoints above. On the general update/patch path the store automatically inherits milestones from the current version (see §2.2 of the Storage Layer chapter).

**Call flow distinction — general update/patch vs milestone mutations:**

| | General `update` / `patch` | Milestone `add` / `update` / `delete` |
|---|---|---|
| Entry point | `VersionedItemService.update/patch` | `OperationalChangeService.addMilestone` etc. |
| Validation | `_validateUpdatePayload` runs — rejects `milestones` if present | Bypasses `_validateUpdatePayload` entirely |
| Milestone handling | Store inherits milestones from current version | Service rebuilds milestones array explicitly via `_buildCompletePayload` |
| Store call | `store.update()` with no milestones in payload | `store.update()` with explicit milestones array |

This asymmetry is intentional: milestone mutations own their own validation and payload construction, and do not go through the generic update pipeline.

Validation rules:
- `domain` is required and must be a valid domain key from `domains.json` (validated via `isDomainValid()`)
- `maturity` must be a valid `MaturityLevel` value (`DRAFT`, `ADVANCED`, or `MATURE`)
- `cost` if present must be an integer
- `orCosts` items must be `{orId, cost}` with integer `cost`; each `orId` validated for existence
- `eventTypes` on milestones must be valid `MilestoneEventType` values (array)
- each milestone must have a non-empty `name`; missing or blank `name` is rejected
- milestone `name` must be unique within the array (case-sensitive, trimmed); duplicate names are rejected — this uniqueness invariant is required by the diff algorithm which uses `name` as the business identifier for milestone map comparison
- `implementedORs` and `decommissionedORs` IDs validated for existence
- `dependencies` (OC item IDs) validated for existence and cycle-free via `store.hasDependsOnCycle()` — checked per dependency in a `'system'` transaction
- `_computePatchedPayload` maps reference objects back to ID arrays using `ref.id` (not `ref.itemId`)
- Milestone `waveId` references validated for existence
- Reference validations run in parallel using `Promise.all`
- `_buildCompletePayload()` extracts the common logic of rebuilding the full OC payload for all three milestone mutation methods
- `_requestModelFor(op)` returns `OperationalChangeRequests.{create|update}` (patch → update), enabling the base strict-payload check. Milestone mutations route through dedicated methods (not generic update/patch), so they bypass this check — consistent with the milestone-ownership contract above.

### 3.6 ChapterService

Extends `VersionedItemService`. User-maintained fields: `narrative` (rich text), `osHierarchy` (`OsHierarchy` object).

- `create()` and `delete()` are not supported — chapters are managed by server bootstrap (`initializeDatabase()`)
- `softDelete()`, `restore()`, and `getInboundReferences()` are overridden to throw — chapters have no lifecycle (parallel to `ChapterStore`'s overrides). `getById`/`getAll` carry the `lifecycleFace` parameter for base-signature alignment but chapters expose only the `active` face.
- `getAll(user)` — no edition context, no filters; returns all chapters with config-owned fields merged using `'standard'` projection (`narrative` and `osHierarchy` excluded). O* enrichment is not performed on the list path.
- `getById(itemId, user, editionId?, projection?, lifecycleFace?)` — defaults to `'extended'` projection; merges config-owned fields (including `availableBlockIds` from `edition.json`) and enriches `osHierarchy` items with `{id, type, code, title}` objects resolved from O* stores via `_buildOStarMap()`. `lifecycleFace` is carried for base-signature alignment and passed through (chapters expose only the `active` face).
- `_buildOStarMap(user)` — delegates to `OperationalRequirementService.getAll()` and `OperationalChangeService.getAll()` (both with `'summary'` projection) so transaction lifecycle is owned by the service layer. Returns a `Map<normalizedItemId, {id, type, code, title}>`.
- `_validateOsHierarchy()` recursively validates the topic tree structure; each topic must have a non-empty `topic` string and integer arrays for `ons`, `ors`, `ocs`
- `resolveGeneratedContent(itemId, editionId, user)` — resolves all generated content (blocks + strings) for a chapter in a single call. Returns `{ blocks: { [blockId]: node[] }, strings: { [key]: string } }`. Block and string resolution run in parallel via `Promise.all`. Always ephemeral — never persisted.
- `_resolveAllBlocks(narrative, editionId, user)` — extracts generated-block mark IDs from the narrative and resolves each in parallel; returns `{ [blockId]: node[] }`.
- `_resolveStringKeys(keys, editionId, user)` — routes each key to the appropriate source: config keys (`chapter-count`, `sub-chapter-count`) resolved via `_resolveConfigCounts()`; all others resolved from a single `getEditionStats()` call.
- `_resolveConfigCounts()` — derives `chapterCount` (top-level chapters with a domain and no sub-chapters) and `subChapterCount` (all sub-chapters) from `getChapters()` config. No DB access.
- `_buildPortfolioTableData(editionId, user)` — builds the row array for the `portfolio-table` block. Combines edition config (chapter numbers, titles, `primaryScope`) with domain-level stats from `getEditionStatsByDomain()`. Parent containers (no domain) get `null` ON/OR counts. Intro, wayforward, and annex chapters are excluded.
- `_buildRefDocMap(editionId, user)` — fetches all reference documents via `ReferenceDocumentService.listItems()` and all `(ON, ReferenceDocument, note)` triples via a single `OperationalRequirementService.getONStrategicDocumentRefs()` call (no N+1). Groups triples in memory into `onsByRefDocId: Map<docId, ON[]>`. Non-leaf documents may be cited directly — all hierarchy levels included.
- `_mergeConfigFields(item)` — merges `domain`, `position`, `parentCode`, `availableBlockIds` (from `generatedBlocks`), and `availableStringKeys` (from `generatedStrings`) from edition config. Both drive the editor toolbar — empty arrays on chapters that declare neither.

### 3.7 BaselineService

Standalone management service (no base class). Baselines are immutable once created.

| Method | Description |
|---|---|
| `createBaseline(data, user)` | Validate title, create baseline (snapshot logic in store) |
| `getBaseline(id, user)` | Fetch single baseline |
| `listBaselines(user)` | List all baselines |
| `getBaselineItems(id, user)` | List OR/OC versions captured in the baseline |

The atomic snapshot of all current latest-version ORs and OCs is handled inside `baselineStore().create()`, not by the service orchestrating multiple stores.

### 3.8 ODIPEditionService

Standalone management service. Editions are immutable once created.

| Method | Description |
|---|---|
| `createODPEdition(data, user)` | Validate and create edition; auto-creates a baseline if none provided; `minONMaturity` validated and passed through to store |
| `getODPEdition(id, user)` | Fetch single edition |
| `listODPEditions(user)` | List all editions |
| `exportAsAsciiDoc(editionId?, user)` | Export edition (or full repository if `null`) as AsciiDoc ZIP — see Chapter 05 |
| `publishEdition(editionId, user, options?)` | Full publication orchestration — see Chapter 06 |
| `generateAntoraZip(editionId, user, drgFilter?, introOnly?)` | Generate scoped Antora source ZIP |

Required fields: `title`, `type` (`DRAFT` or `OFFICIAL`). Optional: `baselineId`, `startDate` (yyyy-mm-dd lower bound for content filtering), `minONMaturity` (`DRAFT` | `ADVANCED` | `MATURE`). If `baselineId` is omitted a new baseline is auto-created with a generated title and linked to the edition. The optional baseline is validated for existence before the edition is written.

Edition context resolution (mapping an `edition` query parameter to `{baselineId, editionId}`) happens in the **service layer** (`VersionedItemService`), not in `ODIPEditionService`. `ODIPEditionService` is responsible only for edition lifecycle management.

**Publication options (`PublishOptions`):**

```
{
  html: boolean,              // Build HTML site (default: true from API, false from CLI)
  pdf: {
    flat: boolean,            // Flat PDF — single file covering all domains
    set: {
      intro: boolean,         // Include intro document in set
      domains: string[]       // DrG ids; empty = all domains from shared/content/
    }
  },
  word: { flat, set }         // Same structure as pdf (not yet restored)
}
```

Private helpers: `_buildFlat()`, `_buildSet()`, `_extractZipToWorks()`, `_createAntoraZip()`, `_resolveSetDomains()`, `_listStaticFiles()`, `_drgSlug()`, `_execStreaming()`, `_tryExecAsync()`.

---

### 3.9 ChangeSetService

Extends `SimpleItemService` (store: `ChangeSetStore`). Owns ChangeSet CRUD, lifecycle, member listing, and the in-process `id→ChangeSet` cache used by the store layer to validate OPEN change sets on writes and to capture the frozen `{code, title, classifier}` snapshot written onto each `AuditEvent`.

| Method | Description |
|---|---|
| `createItem(data, user)` | Validate (title required, valid classifier), create, cache the result |
| `updateItem(id, data, user)` | Edit `title`/`reasonText` — **only while OPEN** (guarded in one transaction); refresh cache |
| `deleteItem(id, user)` | Delete — **only an empty, OPEN set**; closed sets or sets with members are rejected; evict cache |
| `close(id, user)` / `reopen(id, user)` | Status transitions; refresh cache |
| `findByStatus(status, user)` / `findByClassifier(classifier, user)` | List queries |
| `getMembers(changeSetId, user)` | Member-row list via `store.findMembers` (backed by the audit log `UNDER_CHANGESET → TARGETS` traversal since Phase A) |

**Cache coherence:** the cache is lazily populated on misses (loaded from the store within the active transaction) and refreshed on every mutation — `create`/`update`/`close`/`reopen` set the entry, `delete` evicts it. It is consulted **only on the write path** (by the store's open-change-set validation, which also reads the frozen snapshot for the `AuditEvent`); no read path depends on it. The cache is per-process.

Exported as a singleton (`export default new ChangeSetService()`). It is no longer imported by `VersionedItemService` (read hydration removed in Phase A).

---

### 3.10 AuditEventService

Read-side companion to `AuditEventStore` (Phase A — audit foundation). A **pure read orchestrator** — no base class, no CRUD, no write path. The audit log is written by stores atomically within their own operation transactions (`auditEventStore().log(...)`); a separate service write would break the atomicity that lets the log be trusted as authoritative, so the service layer never touches the write side.

It exposes a single query method mirroring the store's single `findAll`:

| Method | Description |
|---|---|
| `getAuditEvents(filters, user)` | Query the audit log. `filters = {changeSetId?, targetId?, userId?}` — all optional, AND-combined; an empty filter returns the entire log. Returns `AuditEventRow[]` ordered by `timestamp`. |

Direct store access (`auditEventStore()`) is the same sanctioned exception applied to `QualityService`: read-only, no business validation, the store call is the lowest abstraction needed.

Each row carries every frozen event attribute — `action`, `userId`, `userRole`, `timestamp`, the target snapshot (`targetId`/`targetType`/`targetCode`/`targetTitle`/`targetVersion`), the resolved `versionId`, the change-set snapshot where present (`changeSetCode`/`changeSetTitle`/`classifier`), and the per-object `note`.

**History is a client concern.** There is no item-scoped service method. The History timeline is built by the client, which calls the audit interface filtered by `targetId` (`getAuditEvents({targetId})`). The same single feed also backs the change-set members view (`ChangeSetService.getMembers` → `ChangeSetStore.findMembers` → `findAll({changeSetId})`) and the general `/audit-events` resource.

Exported as a singleton (`export default new AuditEventService()`).

---

## 4. Transaction Management

### 4.1 Standard Pattern

Every service method follows the same try/catch/rollback structure:

```javascript
const tx = createTransaction(user.id, user.role);
try {
  const result = await store.someMethod(data, tx);
  await commitTransaction(tx);
  return result;
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

### 4.2 Validation Transactions

Reference existence checks open separate short-lived `'system'` transactions before the main write. This decouples validation from the write and allows `Promise.all` parallelism in `OperationalChangeService._validateReferencedEntities()`. These transactions always commit (read-only) or roll back on error.

### 4.3 Error Propagation

Services re-throw all errors after rolling back. They never swallow errors — rollback and rethrow is the only pattern.

**Service error types.** Most service-layer validation throws a plain `Error` with a `Validation failed:` message prefix, which the route layer maps to `400 VALIDATION_ERROR` by prefix match. For the lifecycle conflicts that need a structured payload or a dedicated status the prefix convention cannot express, the service throws a typed **`ServiceError`** (in `services/service-error.js`), parallel to the store's `StoreError` (§8.2 of the Storage chapter) — carrying a message-independent `code` the route switches on, and an optional `references` array:

| `ServiceErrorCode` | Raised by | Carries | Intended HTTP |
|---|---|---|---|
| `LIFECYCLE_BLOCKED` | `softDelete` reference guard | `references` (`OperationalEntityReference[]`) | 409 |
| `INVALID_LIFECYCLE_STATE` | `softDelete` / `restore` state guard | — | 409 |
| `BAD_REQUEST` | `_assertFaceEditionExclusive` | — | 400 |

The route mapping for `LIFECYCLE_BLOCKED` / `INVALID_LIFECYCLE_STATE` arrives with the per-item lifecycle endpoints (REST chapter). `BAD_REQUEST` from the face/edition guard also carries a `Validation failed:` message, so it already resolves to 400 on the existing read routes via the prefix path.

---

## 5. Validation Summary

| Check | Where | Notes |
|---|---|---|
| Required fields present | Service, before transaction | Throws immediately |
| `user` present (`{id, role}`) | Route, before service call | Assembled from auth context; passed to every service method |
| Enum values valid | Service, before transaction | Uses `@odp/shared` enum validators |
| `maturity` valid | Service, before transaction | `MaturityLevel` enum on OR and OC |
| Array field types | Service, before transaction | Checks `Array.isArray` |
| `{id, note?}` object format | Service, before transaction | For `impactedStakeholders`, `actingStakeholders`, `strategicDocuments` |
| Type-gated fields (ON/OR) | Service, before transaction | Wrong-type fields rejected immediately (OR only: `implementedONs`, `dependencies`, `impactedStakeholders`, `actingStakeholders`) |
| `tentative` range integrity | Service, before transaction | `start <= end`, both integers |
| `orCosts` structure | Service, before transaction | `{orId, cost}` with integer cost |
| Referenced entity existence | Service, separate `'system'` tx | Per-entity store `.exists()` calls |
| `implementedONs` type check | Service, separate `'system'` tx | Each referenced item fetched and type checked |
| Refinement rules (ON/OR) | Service, separate `'system'` tx | Parent fetched and type checked; symmetric rule |
| Self-reference / self-dependency | Service, before or during validation tx | Checked by item ID comparison |
| Milestone wave existence | Service, separate `'system'` tx | Per-milestone `waveStore().exists()` |
| Self-reference in REFINES | Store (`StoreError`) | Surfaced as-is to route layer |
| Delete with children | `TreeItemService.deleteItem()` | Checked via `store.findChildren()` |
| Unexpected payload field | Service, raw payload before extraction | `_assertNoUnexpectedFields` vs `messages.js` allowlist; `Validation failed:` → 400 |
| Soft-delete lifecycle state | Service, in transaction | Must be Active and not Released; else `ServiceError(INVALID_LIFECYCLE_STATE)` |
| Soft-delete inbound references | Service, in transaction | `findInboundReferences` empty; else `ServiceError(LIFECYCLE_BLOCKED, references)` |
| Restore lifecycle state | Service, in transaction | Must be Deleted; else `ServiceError(INVALID_LIFECYCLE_STATE)` |
| `lifecycleFace` / `editionId` exclusivity | Service, before transaction | Non-`active` face + `editionId` → `ServiceError(BAD_REQUEST)` |

---

## 6. Service Inventory

| Service | Base | Primary Store(s) |
|---|---|---|
| `StakeholderCategoryService` | `TreeItemService` | `StakeholderCategoryStore` |
| `WaveService` | `SimpleItemService` | `WaveStore` |
| `ReferenceDocumentService` | `TreeItemService` | `ReferenceDocumentStore` |
| `BandwidthService` | `SimpleItemService` | `BandwidthStore`, `WaveStore` |
| `ChapterService` | `VersionedItemService` | `ChapterStore` |
| `OperationalRequirementService` | `VersionedItemService` | `OperationalRequirementStore` |
| `OperationalChangeService` | `VersionedItemService` | `OperationalChangeStore` |
| `ChangeSetService` | `SimpleItemService` | `ChangeSetStore` |
| `BaselineService` | — | `BaselineStore` |
| `ODIPEditionService` | — | `ODPEditionStore`, `BaselineStore`, `WaveStore` |
| `QualityService` | — | none (delegates to `OperationalRequirementStore` via internal service methods) |
| `AuditEventService` | — | `AuditEventStore` (direct, read-only) |

---

## 7. Quality Service Pattern

### 7.1 Role

`QualityService` is a **pure orchestrator** — it has no base class, performs no CRUD, and exposes no REST endpoints on behalf of other services. It is the sole consumer of quality-specific query methods on `OperationalRequirementStore`.

### 7.2 Internal Quality Methods

Quality query methods (`findOrphanONs`, `findUntraceableORs`) are added directly to `OperationalRequirementStore` but are **not exposed via the operational entity REST routes**. They are called exclusively by `QualityService`.

This pattern keeps the quality concern encapsulated: the operational entity routes are unchanged, and `QualityService` accesses the store directly for read-only quality queries.

### 7.3 Direct Store Access

`QualityService` calls `operationalRequirementStore()` directly — both `findAll()` (for `on-traceability` and `no-show` rules) and the dedicated quality methods (`findOrphanONs`, `findUntraceableORs`). This is the one sanctioned exception to the "services call services, not stores" rule — justified because quality checks are read-only, carry no business validation, and the store calls are already the lowest-level abstraction needed.

### 7.4 Edition Context

`QualityService.runChecks(domains, editionId, user)` resolves the edition context once at the start of the call via `odpEditionStore().resolveContext()`, then passes `baselineId` and `editionId` to each rule implementation. This mirrors the pattern used by `VersionedItemService.getAll()`.

### 7.5 Rule Registry

Rules are declared as a static array in `QualityService`. Each rule descriptor carries `{ id, label, description }`. The registered rules are:

| Rule ID | Method | Store call | NO_SHOW excluded |
|---|---|---|---|
| `on-traceability` | `_checkONTraceability()` | `findAll({ type: 'ON', domain })` | yes (post-filter) |
| `or-traceability` | `_checkORTraceability()` | `findUntraceableORs()` | yes (in query) |
| `orphan-on` | `_checkOrphanON()` | `findOrphanONs()` | yes (in query) |
| `no-show` | `_checkNoShow()` | `findAll({ maturity: 'NO_SHOW', domain })` | **included** (this is the rule) |

Adding a new rule requires:
1. Adding a descriptor to the `RULES` array
2. Implementing a `_check<RuleName>()` method
3. Adding the result array to `_buildDomainReport()`
4. Adding the corresponding field to `DomainQualityReport` in `@odp/shared`
5. Adding the schema to `openapi-quality.yml`

No route, CLI, or web client changes are required when adding a rule — the client renders sections dynamically from `report.rules`.

### 7.6 Finding Shapes

| Rule | Finding type | Key fields |
|---|---|---|
| `on-traceability` | `BrokenONTraceability` | `onId`, `onCode`, `onTitle`, `onVersionId` |
| `or-traceability` | `UntraceableOR` | `orId`, `orCode`, `orTitle`, `orVersionId` |
| `orphan-on` | `OrphanON` | `onId`, `onCode`, `onTitle`, `onVersionId` |
| `no-show` | `NoShowOStar` | `oStarId`, `oStarCode`, `oStarTitle`, `oStarType`, `oStarVersionId` |

All ID fields are strings. `oStarType` is `'ON'` or `'OR'`.

---

[← 02 Storage Layer](02-Storage-Layer.md) | [04 REST API →](04-REST-API.md)