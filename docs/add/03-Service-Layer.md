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

Every service method receives `userId` as a parameter. It is passed to `createTransaction(userId)` and recorded on every version node created during that transaction, providing a full audit trail through version history.

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
```

### 3.1 SimpleItemService

Abstract base for all non-versioned entities. Wraps `BaseStore` CRUD with transaction boundaries and delegates validation to subclasses via two abstract methods.

| Method | Description |
|---|---|
| `listItems(userId)` | List all entities |
| `getItem(id, userId)` | Fetch single entity |
| `createItem(data, userId)` | Validate then create |
| `updateItem(id, data, userId)` | Validate then update; returns `null` if not found |
| `deleteItem(id, userId)` | Delete entity |
| `_validateCreateData(data)` *(abstract)* | Must be implemented by subclass |
| `_validateUpdateData(data)` *(abstract)* | Must be implemented by subclass |

### 3.2 TreeItemService

Extends `SimpleItemService`. Implements validation for `{name, description}` entities and overrides `createItem`, `updateItem`, `deleteItem` to manage the REFINES parent–child relationship. Delete is blocked if the item has children.

Additional methods:

| Method | Description |
|---|---|
| `getChildren(parentId, userId)` | Direct children of an item |
| `getParent(childId, userId)` | Parent of an item |
| `getRoots(userId)` | Items with no parent |
| `createRefinesRelation(childId, parentId, userId)` | Explicit relationship creation |
| `deleteRefinesRelation(childId, parentId, userId)` | Explicit relationship removal |
| `findItemsByName(namePattern, userId)` | Case-insensitive name search (in-memory filter) |
| `isNameExists(name, excludeId?, userId)` | Uniqueness check (in-memory) |

`WaveService` and `BandwidthService` extend `SimpleItemService` directly (no hierarchy).

### 3.3 VersionedItemService

Abstract base for versioned entities. Each mutation produces a new version node. Updates require `expectedVersionId` for optimistic locking.

| Method | Description |
|---|---|
| `create(payload, userId)` | Validate then create at version 1 |
| `update(itemId, payload, expectedVersionId, userId)` | Validate then create new version |
| `patch(itemId, patchPayload, expectedVersionId, userId)` | Partial update — merges with current via `_computePatchedPayload`, then validates and updates |
| `getById(itemId, userId, editionId?, projection?)` | Fetch with optional edition context and projection; resolves edition to `{baselineId, editionId}` internally before calling store |
| `getByIdAndVersion(itemId, versionNumber, userId)` | Fetch specific historical version |
| `getVersionHistory(itemId, userId)` | All versions, newest first |
| `getAll(userId, editionId?, filters?, projection?)` | List with optional edition context, filters, and projection; resolves edition internally before calling store |
| `delete(itemId, userId)` | Delete item and all versions |
| `_validateCreatePayload(payload)` *(abstract)* | Must be implemented by subclass |
| `_validateUpdatePayload(payload, itemId?)` *(abstract)* | Must be implemented by subclass; `itemId` is `null` on create, set on update/patch |
| `_computePatchedPayload(current, patchPayload)` *(abstract)* | Field merge logic; must be implemented by subclass |

`patch()` is implemented entirely in the base class: it fetches the current entity (latest version), calls `_computePatchedPayload()` on the subclass to merge fields, validates the merged result via `_validateUpdatePayload(payload, itemId)`, and calls `store.update()` — all in a single transaction. Because `patch` always merges first, the store always receives a complete payload.

`ChapterService` overrides `getAll()` to omit edition context and filters (chapters are always listed in full, using `'standard'` projection). It also overrides `getById()` to default to `'extended'` projection. It disables `create()` and `delete()` — chapters are bootstrap-only.

**Edition context resolution:** When `editionId` is provided to `getAll` or `getById`, the service calls `odpEditionStore().resolveContext(editionId, tx)` within the same transaction to obtain `{baselineId, editionId}`. It then passes `baselineId` as the store's positional argument and `editionId` via `filters.editionId`. The store applies `$editionId IN r.editions` as a WHERE condition on the `HAS_ITEMS` relationship. The route layer has no knowledge of baselines — it passes only `editionId` or `null`.

### 3.4 OperationalRequirementService

Extends `VersionedItemService`. Required fields at create: `title`, `type`, `maturity`, `domain`. All relationship arrays are optional. Further fields are required conditionally based on maturity level (see maturity-gated rules below).

Key validation rules:

- `type` must be `ON` or `OR` (validated against `OperationalRequirementType` enum)
- `maturity` must be a valid `MaturityLevel` value (`DRAFT`, `ADVANCED`, or `MATURE`)
- `domain` is mandatory and must be a valid domain key from `domains.json` (validated via `isDomainValid()`)
- Type-gated fields — `ON` only: `tentative`, `strategicDocuments`; `OR` only: `implementedONs`, `dependencies`, `impactedStakeholders` — rejected on the wrong type
- `tentative` if present must be `{start, end}` integer year range with `start <= end`
- `implementedONs` only allowed on `OR`-type requirements; each referenced item must exist and be `ON`-type
- `OR` requirements cannot refine `ON` requirements (and vice versa); parent type checked per-item
- Annotated reference arrays (`impactedStakeholders`, `strategicDocuments`) must use `{id, note?}` object format
- Referenced entities (`impactedStakeholders`, `strategicDocuments`) validated for existence using separate `'system'` transactions; validations run in parallel via `Promise.all`

**Narrative generator support:**
- `getONStrategicDocumentRefs(userId, editionId?)` — wraps `OperationalRequirementStore.findONStrategicDocumentRefs()`. Returns `Array<{ itemId, code, title, docId, note }>` — all `(ON, ReferenceDocument, note)` triples in a single query. Called by `ChapterService._buildRefDocMap()` for the strategic-traceability generated block.

### 3.5 OperationalChangeService

Extends `VersionedItemService`. Required fields: `title`, `purpose`, `initialState`, `finalState`, `domain`, `maturity` (note: `domain` is **required** on OC as on OR).

Additional milestone methods — all require `expectedVersionId` because each operation creates a new OC version internally:

| Method | Description |
|---|---|
| `getMilestones(itemId, userId, baselineId?)` | Returns `milestones` array from OC |
| `getMilestone(itemId, milestoneKey, userId, baselineId?)` | Single milestone by stable `milestoneKey` |
| `addMilestone(itemId, milestoneData, expectedVersionId, userId)` | Appends milestone; returns `{milestone, operationalChange}` |
| `updateMilestone(itemId, milestoneKey, milestoneData, expectedVersionId, userId)` | Replaces milestone by key; returns `{milestone, operationalChange}` |
| `deleteMilestone(itemId, milestoneKey, expectedVersionId, userId)` | Removes milestone by key; returns `{operationalChange}` |

Milestone mutations work by fetching the current OC, rebuilding the full milestones array, and calling `store.update()` with the complete payload — there is no direct milestone write. The `milestoneKey` is a stable UUID-based identifier preserved across versions.

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

### 3.6 ChapterService

Extends `VersionedItemService`. User-maintained fields: `narrative` (rich text), `osHierarchy` (`OsHierarchy` object).

- `create()` and `delete()` are not supported — chapters are managed by server bootstrap (`initializeDatabase()`)
- `getAll(userId)` — no edition context, no filters; returns all chapters with config-owned fields merged using `'standard'` projection (`narrative` and `osHierarchy` excluded). O* enrichment is not performed on the list path.
- `getById(itemId, userId, editionId?, projection?)` — defaults to `'extended'` projection; merges config-owned fields (including `availableBlockIds` from `edition.json`) and enriches `osHierarchy` items with `{id, type, code, title}` objects resolved from O* stores via `_buildOStarMap()`.
- `_buildOStarMap(userId)` — delegates to `OperationalRequirementService.getAll()` and `OperationalChangeService.getAll()` (both with `'summary'` projection) so transaction lifecycle is owned by the service layer. Returns a `Map<normalizedItemId, {id, type, code, title}>`.
- `_validateOsHierarchy()` recursively validates the topic tree structure; each topic must have a non-empty `topic` string and integer arrays for `ons`, `ors`, `ocs`
- `resolveGeneratedBlocks(itemId, editionId, userId)` — on-demand resolution for ODIP-level preview and explore mode. Scans the chapter narrative for `generated-block` marks, builds the required data map per block ID via `_buildRefDocMap()`, delegates rendering to the appropriate generator, returns `{ [blockId]: node[] }`. Always ephemeral — never persisted.
- `_buildRefDocMap(editionId, userId)` — fetches all reference documents via `ReferenceDocumentService.listItems()` and all `(ON, ReferenceDocument, note)` triples via a single `OperationalRequirementService.getONStrategicDocumentRefs()` call (no N+1). Groups triples in memory into `onsByRefDocId: Map<docId, ON[]>`. Non-leaf documents may be cited directly — all hierarchy levels included.
- `_mergeConfigFields(item)` — merges `domain`, `position`, `parentCode`, and `availableBlockIds` (from `edition.json` `generatedBlocks` array) from edition config. `availableBlockIds` drives the editor toolbar — empty on domain chapters.

### 3.7 BaselineService

Standalone management service (no base class). Baselines are immutable once created.

| Method | Description |
|---|---|
| `createBaseline(data, userId)` | Validate title, create baseline (snapshot logic in store) |
| `getBaseline(id, userId)` | Fetch single baseline |
| `listBaselines(userId)` | List all baselines |
| `getBaselineItems(id, userId)` | List OR/OC versions captured in the baseline |

The atomic snapshot of all current latest-version ORs and OCs is handled inside `baselineStore().create()`, not by the service orchestrating multiple stores.

### 3.8 ODIPEditionService

Standalone management service. Editions are immutable once created.

| Method | Description |
|---|---|
| `createODPEdition(data, userId)` | Validate and create edition; auto-creates a baseline if none provided; `minONMaturity` validated and passed through to store |
| `getODPEdition(id, userId)` | Fetch single edition |
| `listODPEditions(userId)` | List all editions |
| `exportAsAsciiDoc(editionId?, userId)` | Export edition (or full repository if `null`) as AsciiDoc ZIP — see Chapter 05 |
| `publishEdition(editionId, userId, options?)` | Full publication orchestration — see Chapter 06 |
| `generateAntoraZip(editionId, userId, drgFilter?, introOnly?)` | Generate scoped Antora source ZIP |

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

## 4. Transaction Management

### 4.1 Standard Pattern

Every service method follows the same try/catch/rollback structure:

```javascript
const tx = createTransaction(userId);
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

---

## 5. Validation Summary

| Check | Where | Notes |
|---|---|---|
| Required fields present | Service, before transaction | Throws immediately |
| Enum values valid | Service, before transaction | Uses `@odp/shared` enum validators |
| `maturity` valid | Service, before transaction | `MaturityLevel` enum on OR and OC |
| Array field types | Service, before transaction | Checks `Array.isArray` |
| `{id, note?}` object format | Service, before transaction | For `impactedStakeholders`, `strategicDocuments` |
| Type-gated fields (ON/OR) | Service, before transaction | Wrong-type fields rejected immediately (OR only: `implementedONs`, `dependencies`, `impactedStakeholders`) |
| `tentative` range integrity | Service, before transaction | `start <= end`, both integers |
| `orCosts` structure | Service, before transaction | `{orId, cost}` with integer cost |
| Referenced entity existence | Service, separate `'system'` tx | Per-entity store `.exists()` calls |
| `implementedONs` type check | Service, separate `'system'` tx | Each referenced item fetched and type checked |
| Refinement rules (ON/OR) | Service, separate `'system'` tx | Parent fetched and type checked; symmetric rule |
| Self-reference / self-dependency | Service, before or during validation tx | Checked by item ID comparison |
| Milestone wave existence | Service, separate `'system'` tx | Per-milestone `waveStore().exists()` |
| Self-reference in REFINES | Store (`StoreError`) | Surfaced as-is to route layer |
| Delete with children | `TreeItemService.deleteItem()` | Checked via `store.findChildren()` |

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
| `BaselineService` | — | `BaselineStore` |
| `ODIPEditionService` | — | `ODPEditionStore`, `BaselineStore`, `WaveStore` |
| `QualityService` | — | none (delegates to `OperationalRequirementStore` via internal service methods) |

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

`QualityService.runChecks(domains, editionId, userId)` resolves the edition context once at the start of the call via `odpEditionStore().resolveContext()`, then passes `baselineId` and `editionId` to each rule implementation. This mirrors the pattern used by `VersionedItemService.getAll()`.

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