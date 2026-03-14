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
    ├── DomainService
    └── ReferenceDocumentService
    (also flat, no hierarchy:)
    WaveService
    BandwidthService

VersionedItemService       (versioned CRUD + patch + multi-context)
├── OperationalRequirementService
└── OperationalChangeService

(standalone management services:)
BaselineService
ODIPEditionService
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
| `getById(itemId, userId, baselineId?, fromWaveId?)` | Fetch with optional context |
| `getByIdAndVersion(itemId, versionNumber, userId)` | Fetch specific historical version |
| `getVersionHistory(itemId, userId)` | All versions, newest first |
| `getAll(userId, baselineId?, fromWaveId?, filters?)` | List with optional context and filters |
| `delete(itemId, userId)` | Delete item and all versions |
| `_validateCreatePayload(payload)` *(abstract)* | Must be implemented by subclass |
| `_validateUpdatePayload(payload, itemId?)` *(abstract)* | Must be implemented by subclass; `itemId` is `null` on create, set on update/patch |
| `_computePatchedPayload(current, patchPayload)` *(abstract)* | Field merge logic; must be implemented by subclass |

`patch()` is implemented entirely in the base class: it fetches the current entity, calls `_computePatchedPayload()` on the subclass to merge fields, validates the merged result via `_validateUpdatePayload(payload, itemId)`, and calls `store.update()` — all in a single transaction. Because `patch` always merges first, the store always receives a complete payload.

### 3.4 OperationalRequirementService

Extends `VersionedItemService`. Required fields at create: `title`, `type`, `maturity`. Optional: `drg`, `path`, and all relationship arrays. Further fields are required conditionally based on maturity level (see maturity-gated rules below).

Key validation rules:

- `type` must be `ON` or `OR` (validated against `OperationalRequirementType` enum)
- `maturity` must be a valid `MaturityLevel` value (`DRAFT`, `ADVANCED`, or `MATURE`)
- `drg` is optional but if present must be a valid `DraftingGroup` value
- Type-gated fields — `ON` only: `tentative`, `strategicDocuments`; `OR` only: `implementedONs`, `dependencies`, `impactedStakeholders`, `impactedDomains` — rejected on the wrong type
- `tentative` if present must be `{start, end}` integer year range with `start <= end`
- `implementedONs` only allowed on `OR`-type requirements; each referenced item must exist and be `ON`-type
- `OR` requirements cannot refine `ON` requirements (and vice versa); parent type checked per-item
- Annotated reference arrays (`impactedStakeholders`, `impactedDomains`, `strategicDocuments`) must use `{id, note?}` object format
- Referenced entities (`impactedStakeholders`, `impactedDomains`, `strategicDocuments`) validated for existence using separate `'system'` transactions; validations run in parallel via `Promise.all`

### 3.5 OperationalChangeService

Extends `VersionedItemService`. Required fields: `title`, `purpose`, `initialState`, `finalState`, `drg`, `maturity` (note: `drg` is **required** on OC, unlike OR).

Additional milestone methods — all require `expectedVersionId` because each operation creates a new OC version internally:

| Method | Description |
|---|---|
| `getMilestones(itemId, userId, baselineId?, fromWaveId?)` | Returns `milestones` array from OC |
| `getMilestone(itemId, milestoneKey, userId, baselineId?, fromWaveId?)` | Single milestone by stable `milestoneKey` |
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
- `drg` is required and must be a valid `DraftingGroup` value
- `maturity` must be a valid `MaturityLevel` value (`DRAFT`, `ADVANCED`, or `MATURE`)
- `cost` if present must be an integer
- `orCosts` items must be `{orId, cost}` with integer `cost`; each `orId` validated for existence
- `eventTypes` on milestones must be valid `MilestoneEventType` values (array)
- `implementedORs` and `decommissionedORs` IDs validated for existence
- `dependencies` (OC item IDs) validated for existence and cycle-free via `store.hasDependsOnCycle()` — checked per dependency in a `'system'` transaction
- `_computePatchedPayload` maps reference objects back to ID arrays using `ref.id` (not `ref.itemId`)
- Milestone `waveId` references validated for existence
- Reference validations run in parallel using `Promise.all`
- `_buildCompletePayload()` extracts the common logic of rebuilding the full OC payload for all three milestone mutation methods

### 3.6 BaselineService

Standalone management service (no base class). Baselines are immutable once created.

| Method | Description |
|---|---|
| `createBaseline(data, userId)` | Validate title, create baseline (snapshot logic in store) |
| `getBaseline(id, userId)` | Fetch single baseline |
| `listBaselines(userId)` | List all baselines |
| `getBaselineItems(id, userId)` | List OR/OC versions captured in the baseline |

The atomic snapshot of all current latest-version ORs and OCs is handled inside `baselineStore().create()`, not by the service orchestrating multiple stores.

### 3.7 ODIPEditionService

Standalone management service. Editions are immutable once created.

| Method | Description |
|---|---|
| `createODPEdition(data, userId)` | Create edition; auto-creates a baseline if none provided |
| `getODPEdition(id, userId)` | Fetch single edition |
| `listODPEditions(userId)` | List all editions |
| `exportAsAsciiDoc(editionId?, userId)` | Export edition (or full repository if `null`) as AsciiDoc ZIP — see Chapter 05 |

Required fields: `title`, `type` (`DRAFT` or `OFFICIAL`), `startsFromWaveId`. `baselineId` is optional — if omitted a new baseline is auto-created with a generated title and linked to the edition. The wave and optional baseline are validated for existence before the edition is written.

Edition context resolution (mapping an `odpEdition` query parameter to `{baselineId, fromWaveId}`) happens in the route layer, not the service.

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
| `{id, note?}` object format | Service, before transaction | For `impactedStakeholders`, `impactedDomains`, `strategicDocuments` |
| Type-gated fields (ON/OR) | Service, before transaction | Wrong-type fields rejected immediately |
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
| `DomainService` | `TreeItemService` | `DomainStore` |
| `WaveService` | `SimpleItemService` | `WaveStore` |
| `ReferenceDocumentService` | `TreeItemService` | `ReferenceDocumentStore` |
| `BandwidthService` | `SimpleItemService` | `BandwidthStore`, `WaveStore`, `DomainStore` |
| `OperationalRequirementService` | `VersionedItemService` | `OperationalRequirementStore` |
| `OperationalChangeService` | `VersionedItemService` | `OperationalChangeStore` |
| `BaselineService` | — | `BaselineStore` |
| `ODIPEditionService` | — | `ODIPEditionStore`, `BaselineStore`, `WaveStore` |

---

[← 02 Storage Layer](02-Storage-Layer.md) | [04 REST API →](04-REST-API.md)