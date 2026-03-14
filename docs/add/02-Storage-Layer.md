# Chapter 02 – Storage Layer

## 1. Overview

The Storage Layer provides a clean JavaScript abstraction over Neo4j graph database operations. It is the only layer that issues Cypher queries — all layers above interact exclusively through the store API.

Key responsibilities:
- Entity CRUD with consistent Neo4j result transformation
- Hierarchical relationship management (REFINES)
- Versioned entity lifecycle with optimistic locking
- Complete relationship payload per version (no inheritance fallback)
- Multi-context querying (baseline snapshots and wave filtering)
- Transaction boundary management

---

## 2. Design Principles

### 2.1 Complete Payload Approach
All content and relationships are provided in a single operation. There are no partial update endpoints — the store always receives the complete desired state for every write.

### 2.2 Relationship Inheritance
When a new version is created, the store uses the relationship arrays supplied in the payload. An empty array explicitly clears that relationship type. The service layer (both `update` and `patch`) is responsible for always providing a complete payload — `patch` achieves this by fetching the current state and merging before calling the store. Previous versions are never mutated.

**Exception — milestones on `OperationalChangeStore`:** Milestones are owned exclusively by the dedicated milestone endpoints. `update` and `patch` payloads must not include milestones. On the update path, `OperationalChangeStore._extractRelationshipIdsFromInput` detects the absence of milestones in the payload and automatically inherits them from the current version via `OperationalChangeMilestoneStore.getMilestoneDataFromVersion()`. Milestone mutation methods (`addMilestone`, `updateMilestone`, `deleteMilestone`) supply an explicit milestones array and bypass this inheritance.

### 2.3 Transaction Boundaries
One user action = one transaction. Content, relationships, and milestones are committed atomically. All transactions carry user identification for audit trails. The store never commits or rolls back — that responsibility belongs to the service layer.

### 2.4 Clean Separation of Concerns
The store has no knowledge of HTTP, business rules, or validation logic. It handles data access only. The service layer owns transaction lifecycle and business validation.

### 2.5 Fail-Fast
Invalid inputs (bad IDs, missing referenced nodes, self-references) throw immediately rather than silently degrading.

---

## 3. Store Hierarchy

```
BaseStore                              (base-store.js)
├── BaselineStore                      (baseline-store.js)
├── BandwidthStore                     (bandwidth-store.js)
├── ODPEditionStore                    (odp-edition-store.js)
├── OperationalChangeMilestoneStore    (operational-change-milestone-store.js)
├── RefinableEntityStore               (refinable-entity-store.js)
│   ├── DomainStore                    (domain-store.js)
│   ├── ReferenceDocumentStore         (reference-document-store.js)
│   └── StakeholderCategoryStore       (stakeholder-category-store.js)
├── VersionedItemStore                 (versioned-item-store.js)
│   ├── OperationalChangeStore         (operational-change-store.js)
│   └── OperationalRequirementStore    (operational-requirement-store.js)
└── WaveStore                          (wave-store.js)
```

### 3.1 BaseStore (`base-store.js`)

Provides core CRUD operations and Neo4j result transformation for all entity types.

**Public methods:**
- `create(data, tx)` — CREATE node, return transformed record
- `findById(id, tx)` — MATCH by Neo4j internal ID; returns `null` if not found
- `findAll(tx)` — MATCH all nodes of label, ordered by internal ID
- `update(id, data, tx)` — SET node properties (`+=`), returns `null` if not found
- `delete(id, tx)` — DELETE node, returns `boolean`
- `exists(id, tx)` — returns `boolean`

**Internal helpers:**
- `transformRecord(record, alias?)` — maps a Neo4j record to a plain JS object; ID extracted via `node.identity.toNumber()`
- `transformRecords(records, alias?)` — maps an array of records
- `normalizeId(id, field?)` — handles Neo4j Integer / string / number; throws `StoreError` on failure

```javascript
class BaseStore {
    constructor(driver, nodeLabel) {
        this.driver = driver;
        this.nodeLabel = nodeLabel;
    }

    async create(data, transaction) {
        const result = await transaction.run(
            `CREATE (n:${this.nodeLabel} $data) RETURN n`, { data });
        return this.transformRecord(result.records[0]);
    }

    transformRecord(record, alias = 'n') {
        const node = record.get(alias);
        return { id: node.identity.toNumber(), ...node.properties };
    }
}
```

### 3.2 RefinableEntityStore (`refinable-entity-store.js`)

Extends `BaseStore` with REFINES hierarchy management.

**Public methods:**
- `createRefinesRelation(childId, parentId, tx)` — validates both nodes exist, prevents self-reference, enforces tree structure (deletes existing parent relationship before creating the new one)
- `deleteRefinesRelation(childId, parentId, tx)` — removes a specific REFINES relationship
- `findChildren(parentId, tx)` — direct children, ordered by `name`
- `findParent(childId, tx)` — direct parent, or `null` if root
- `findRoots(tx)` — all nodes with no parent, ordered by `name`

```javascript
async createRefinesRelation(childId, parentId, transaction) {
    if (childId === parentId) throw new StoreError('Node cannot refine itself');
    // Delete existing parent (tree enforcement), then create new
    await transaction.run(`
        MATCH (child:${this.nodeLabel})-[r:REFINES]->(:${this.nodeLabel})
        WHERE id(child) = $childId DELETE r`, { childId });
    await transaction.run(`
        MATCH (child:${this.nodeLabel}), (parent:${this.nodeLabel})
        WHERE id(child) = $childId AND id(parent) = $parentId
        CREATE (child)-[:REFINES]->(parent)`, { childId, parentId });
}
```

### 3.3 VersionedItemStore (`versioned-item-store.js`)

Extends `BaseStore` with the dual-node versioning pattern, code generation, optimistic locking, and multi-context query support.

**Concrete public methods:**
- `create(data, tx)` — generates `code`, creates Item + ItemVersion (version 1), establishes all relationships
- `update(itemId, data, expectedVersionId, tx)` — validates lock, creates new version, always uses provided relationship arrays
- `findById(itemId, tx)` — resolves to latest version, returns item with all relationship references
- `findByIdAndVersion(itemId, versionNumber, tx)` — specific historical version with relationships
- `findVersionHistory(itemId, tx)` — lightweight list of all versions (versionId, version, createdAt, createdBy)

**Abstract methods** (must be implemented by concrete stores):
- `_extractRelationshipIdsFromInput(data, currentVersionId, transaction)` — separates relationship arrays from content fields; `currentVersionId` is `null` on create, set on update (used by `OperationalChangeStore` for milestone inheritance)
- `_buildRelationshipReferences(versionId, tx)` — loads relationships as Reference objects `{id, title, code}`
- `_createRelationshipsFromIds(versionId, relationshipIds, tx)` — writes all relationships for a version
- `buildFindAllQuery(baselineId, fromWaveId, filters)` — builds entity-specific optimised Cypher for list queries
- `findAll(tx, baselineId?, fromWaveId?, filters?)` — list with multi-context and content filtering (abstract)
- `_checkWaveFilter(itemId, fromWaveId, tx, baselineId?)` — per-entity wave filter logic (abstract)
- `_getEntityTypeForCode(data)` — returns `'ON'`, `'OR'`, or `'OC'` for code generation (abstract)

**Internal helpers:**
- `_generateCode(entityType, drg, tx)` — generates sequential codes in format `{type}-{DRG}-{####}` (e.g. `OR-IDL-0001`)
- `_findMaxCodeNumber(entityType, drg, tx)` — finds highest existing code number for a type+DRG pair
- `_buildReference(record, titleField?)` — builds a `{id, title, code, ...}` Reference object from a Neo4j record
- `_validateReferences(label, ids, tx)` — batch-validates that all referenced node IDs exist; throws `StoreError` listing missing IDs

**Note on `code` field**: Item nodes carry a `code` property (e.g. `OR-IDL-0042`) that is generated at creation time from the entity type and DRG. Codes are stable identifiers used for round-trip import matching alongside `externalId`.

### 3.4 Concrete Stores

Each concrete store extends the appropriate base and adds entity-specific relationship handling.

| Store | Base | Additional relationships / notes |
|---|---|---|
| `StakeholderCategoryStore` | `RefinableEntityStore` | — |
| `DomainStore` | `RefinableEntityStore` | — |
| `ReferenceDocumentStore` | `RefinableEntityStore` | — |
| `WaveStore` | `BaseStore` | — |
| `BandwidthStore` | `BaseStore` | — |
| `BaselineStore` | `BaseStore` | `HAS_ITEMS` capture; immutable |
| `ODPEditionStore` | `BaseStore` | `EXPOSES`, `STARTS_FROM`, context resolution; immutable |
| `OperationalChangeMilestoneStore` | `BaseStore` | `BELONGS_TO`, `TARGETS`; internal to `OperationalChangeStore` |
| `OperationalRequirementStore` | `VersionedItemStore` | `REFINES`, `IMPACTS_STAKEHOLDER`, `IMPACTS_DOMAIN`, `REFERENCES`, `DEPENDS_ON`, `IMPLEMENTS` |
| `OperationalChangeStore` | `VersionedItemStore` | `IMPLEMENTS`, `DECOMMISSIONS`, `DEPENDS_ON`; milestones delegated |

---

## 4. Concrete Store APIs

### 4.1 Setup Entity Stores

`StakeholderCategoryStore` and `DomainStore` both inherit `RefinableEntityStore → BaseStore` and expose no additional public methods beyond those described in §3.1 and §3.2.

`WaveStore` inherits `BaseStore` only. Business rules: `year` is a 4-digit integer, `sequenceNumber` is a positive integer. The `(year, sequenceNumber)` pair is unique (e.g. wave `27#2`). `implementationDate` is optional (ISO format).

`ReferenceDocumentStore` inherits `RefinableEntityStore → BaseStore`. Supports REFINES parent-child hierarchy consistent with `DomainStore` and `StakeholderCategoryStore`. Fields: `name`, `version` (optional), `url`, `parentId` (optional). Reference documents are referenced via `REFERENCES` relationships from operational requirement versions, not via any method on `ReferenceDocumentStore` itself.

`BandwidthStore` inherits `BaseStore` only. Fields: `year`, `planned` (optional, integer, in MW), `waveId` (optional), `scopeId` (optional). The `(year, waveId, scopeId)` tuple is unique. NM internal — not exposed to external stakeholders.

---

### 4.2 OperationalRequirementStore (`operational-requirement-store.js`)

Inherits `VersionedItemStore → BaseStore`. The `findById` signature is extended with optional context: `findById(itemId, tx, baselineId?, fromWaveId?)`.

**Relationship fields** (returned by `findAll`/`findById`, accepted by `create`/`update`):

| Field | Relationship | ON/OR | Note |
|---|---|---|---|
| `refinesParents` | `REFINES` → OR Item | both | — |
| `strategicDocuments` | `REFERENCES` → ReferenceDocument | ON only | `note` |
| `implementedONs` | `IMPLEMENTS` → OR Item (ON type) | OR only | — |
| `impactedStakeholders` | `IMPACTS_STAKEHOLDER` → StakeholderCategory | OR only | `note` |
| `impactedDomains` | `IMPACTS_DOMAIN` → Domain | OR only | `note` |
| `dependencies` | `DEPENDS_ON` → OR Item | OR only | — |

**`findAll(tx, baselineId?, fromWaveId?, filters?)`** — uses a single aggregated query (no N+1). Wave filtering applies a 3-hop `REFINES|IMPLEMENTS` upward cascade. Filters object:

| Filter field | Type | Behaviour |
|---|---|---|
| `type` | `'ON'\|'OR'\|null` | Exact match on version field |
| `title` | `string\|null` | CONTAINS match on title or code |
| `text` | `string\|null` | CONTAINS across statement, rationale, flows, privateNotes |
| `drg` | `string\|null` | Exact match on DRG enum value |
| `maturity` | `string\|null` | Exact match on maturity enum value |
| `path` | `string\|null` | Array membership (`$path IN version.path`) |
| `stakeholderCategory` | `number[]\|null` | EXISTS via IMPACTS_STAKEHOLDER → StakeholderCategory |
| `refinesParent` | `number\|null` | Single OR item ID — EXISTS via REFINES |
| `dependsOn` | `number\|null` | Single OR item ID — EXISTS via DEPENDS_ON |
| `implementedON` | `number\|null` | Single ON item ID — EXISTS via IMPLEMENTS |

**`findChildren(itemId, tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code, type}>`

**`findParents(itemId, tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code, type}>`

**`findRoots(tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code, type}>` — requirements with no REFINES parent

**`findRequirementsThatImpact(targetLabel, targetId, tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code, type}>` — `targetLabel`: `'StakeholderCategory'` or `'Domain'`

**`findRequirementsThatImplement(onItemId, tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code, type}>` — OR requirements that IMPLEMENT a given ON

**Not implemented**: `findDependencies`, `findDependents`, `patch`, `getVersionHistory`

---

### 4.3 OperationalChangeStore (`operational-change-store.js`)

Inherits `VersionedItemStore → BaseStore`. Milestone operations are **delegated** to an internal `OperationalChangeMilestoneStore` instance (see §4.6). Additional public methods:

**`findAll(tx, baselineId?, fromWaveId?, filters?)`** — wave filtering is applied as a post-query set operation via `_computeWaveFilteredChanges`. Filters object:

| Filter field | Type | Behaviour |
|---|---|---|
| `title` | `string\|null` | CONTAINS match on title or code |
| `text` | `string\|null` | CONTAINS search across purpose, initialState, finalState, details, privateNotes |
| `drg` | `string\|null` | Exact match on DRG enum value |
| `maturity` | `string\|null` | Exact match on maturity enum value |
| `path` | `string\|null` | Array membership (`$path IN version.path`) |
| `stakeholderCategory` | `number[]\|null` | Via IMPLEMENTS\|DECOMMISSIONS → OR IMPACTS_STAKEHOLDER chain |
| `implementsOR` | `number\|null` | Single OR item ID — EXISTS via IMPLEMENTS\|DECOMMISSIONS |

**`findChangesThatImplementRequirement(requirementItemId, tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code}>` — OCs that IMPLEMENT the given OR

**`findChangesThatDecommissionRequirement(requirementItemId, tx, baselineId?, fromWaveId?)`** → `Array<{id, title, code}>` — OCs that DECOMMISSION the given OR

**Milestone delegation** — the following are thin wrappers that forward to `this.milestoneStore`:

- **`findMilestonesByChange(itemId, tx, baselineId?, fromWaveId?)`** → `Array<object>`
- **`findMilestoneByKey(itemId, milestoneKey, tx, baselineId?, fromWaveId?)`** → `object|null`
- **`findMilestonesByWave(waveId, tx, baselineId?, fromWaveId?)`** → `Array<object>`

**Not implemented in this store**: `findDependencies`, `findDependents`, `patch`, `getVersionHistory`. Dependencies are returned inline as part of `findById` / `findAll` results.

**Note on milestone fields**: The milestone object uses **`eventTypes`** (array, not singular `eventType`). Milestones carry a stable **`milestoneKey`** (UUID-prefixed string, e.g. `ms_<uuid>`) generated on first creation and preserved across versions.

---

### 4.4 BaselineStore (`baseline-store.js`)

Inherits `BaseStore`. `update()` and `delete()` are overridden to throw `StoreError` — baselines are immutable.

**`create({title}, tx)`** — creates the Baseline node, atomically captures all current `LATEST_VERSION` targets for `OperationalRequirement` and `OperationalChange` as `HAS_ITEMS` relationships, returns baseline with `capturedItemCount`.

**`findById(id, tx)`** → baseline with `capturedItemCount` (count of `HAS_ITEMS` targets)

**`findAll(tx)`** → all baselines with `capturedItemCount`, ordered by `createdAt DESC`

**`getBaselineItems(baselineId, tx)`** → `Array<{itemId, itemTitle, itemType, versionId, version, capturedAt}>` — all OR/OC versions captured, ordered by `itemType` then `itemTitle`

---

### 4.5 ODPEditionStore (`odp-edition-store.js`)

Inherits `BaseStore`. `update()` and `delete()` are overridden to throw `StoreError` — editions are immutable.

**`create({title, type, baselineId, startsFromWaveId}, tx)`** — validates baseline and wave exist, creates node with `EXPOSES` → Baseline and `STARTS_FROM` → Wave. Returns the bare edition object (no sub-objects). Throws `StoreError('Invalid baseline reference')` or `StoreError('Invalid wave reference')`.

**`findById(id, tx)`** → edition enriched with `baseline: {id, title, createdAt}` and `startsFromWave: {id, year, sequenceNumber, implementationDate}` sub-objects

**`findAll(tx)`** → all editions with same enrichment, ordered by `createdAt DESC`

**`resolveContext(odpEditionId, tx)`** → `{baselineId, fromWaveId}` — used exclusively by the route layer to resolve an edition to its context parameters. Throws `StoreError('ODPEdition not found')`.

---

### 4.6 OperationalChangeMilestoneStore (`operational-change-milestone-store.js`)

Extends `BaseStore` (node label `OperationalChangeMilestone`). **Not a public store accessor** — instantiated internally by `OperationalChangeStore` as `this.milestoneStore`. All milestone operations for OCs route through this class.

**Milestone model:**
```javascript
{
    id: number,              // Neo4j node ID (changes each version)
        milestoneKey: string,    // Stable identifier: "ms_<uuid>" — preserved across versions
        name: string,
        description: string,
        eventTypes: string[],    // Array of event type values
        wave?: {                 // Optional — present only if TARGETS relationship exists
            id: number,
            year: number,
            sequenceNumber: number,
            implementationDate: string  // optional
        }
}
```

**Write methods** (called by `OperationalChangeStore` internally):
- **`createFreshMilestones(versionId, milestonesData, tx)`** — creates `OperationalChangeMilestone` nodes for a new version; generates `milestoneKey` if absent; validates wave exists if `waveId` supplied
- **`getMilestoneDataFromVersion(versionId, tx)`** — reads raw milestone data (including `milestoneKey`) for inheritance into a new version
- **`getMilestonesWithReferences(versionId, tx)`** — reads milestones with full wave Reference objects, for inclusion in `findById`/`findAll` results

**Query methods** (exposed via `OperationalChangeStore` delegation):
- **`findMilestoneByKey(itemId, milestoneKey, tx, baselineId?, fromWaveId?)`** → `object|null`
- **`findMilestonesByChange(itemId, tx, baselineId?, fromWaveId?)`** → `Array<object>` — ordered by `milestone.name`
- **`findMilestonesByWave(waveId, tx, baselineId?, fromWaveId?)`** → `Array<object>` — each result includes `change: {id, title}` context; ordered by `change.title, milestone.name`

**Wave filtering for milestones**: a milestone passes the `fromWaveId` filter only if it has a `TARGETS` wave and that wave's `implementationDate >= fromWave.implementationDate`. Milestones without a wave target **do not pass** the filter.

---

## 5. Versioning Pattern

### 5.1 Dual-Node Structure

Versioned entities use two Neo4j node types:

```cypher
// Item node — stable identity
(item:OperationalRequirement {
    title: string,
    createdAt: datetime,
    createdBy: string,
    latest_version: integer     // cached current version number
})

// ItemVersion node — version-specific content
(version:OperationalRequirementVersion {
    version: integer,           // sequential: 1, 2, 3...
    createdAt: datetime,
    createdBy: string,
    type: string,
    statement: string,
    // ... all content fields
})

(item)-[:LATEST_VERSION]->(version)
(version)-[:VERSION_OF]->(item)
```

### 5.2 Create Operation (Version 1)

Creates both the Item node and the first ItemVersion node in a single transaction, then establishes all provided relationships.

```javascript
// Result shape
{
    itemId: 123,
        versionId: 456,
    version: 1,
    title: "Requirement Title",
    type: "OR",
    statement: "...",
    refinesParents: [789],
    createdAt: "2025-01-15T10:30:00Z",
    createdBy: "user123"
}
```

### 5.3 Update Operation (New Version)

1. Validate `expectedVersionId` matches current `LATEST_VERSION` — reject with `StoreError` if not
2. Create new `ItemVersion` node (version + 1)
3. Move `LATEST_VERSION` pointer from old to new version
4. Write relationships from provided arrays — empty array clears, clear; non-empty array sets; raw relationship ID properties stripped from `versionData` before spread

### 5.4 Optimistic Locking

The client must supply `expectedVersionId` (the `versionId` of the version it last read). If another user has since updated the entity, the IDs will not match and the operation fails fast with a `StoreError`.

---

## 6. Relationship Management

### 6.1 Relationship Direction Conventions

```cypher
// Setup hierarchies
(Child)-[:REFINES]->(Parent)

// Operational cross-references (from version node to item node)
(ORVersion)-[:REFINES]->(ORItem)
(ORVersion)-[:IMPACTS_STAKEHOLDER {note}]->(StakeholderCategory)
(ORVersion)-[:IMPACTS_DOMAIN {note}]->(Domain)
(ORVersion)-[:REFERENCES {note}]->(ReferenceDocument)
(ORVersion)-[:DEPENDS_ON]->(ORItem)
(ORVersion)-[:IMPLEMENTS]->(ORItem)   // OR → ON links

(OCVersion)-[:IMPLEMENTS]->(ORItem)
(OCVersion)-[:DECOMMISSIONS]->(ORItem)
(OCVersion)-[:DEPENDS_ON]->(OCItem)

// Milestones
(Milestone)-[:BELONGS_TO]->(OCVersion)
(Milestone)-[:TARGETS]->(Wave)

// Management
(Baseline)-[:HAS_ITEMS]->(ORVersion)
(Baseline)-[:HAS_ITEMS]->(OCVersion)
(ODIPEdition)-[:EXPOSES]->(Baseline)
(ODIPEdition)-[:STARTS_FROM]->(Wave)
```

`DEPENDS_ON` always points to the **Item** node, not a specific version. This means dependencies automatically follow the latest version without any additional bookkeeping.

### 6.2 Batch Relationship Creation

Relationships are created in batch using `UNWIND` to minimise round-trips:

```javascript
await transaction.run(`
    MATCH (source) WHERE id(source) = $sourceId
    UNWIND $targetIds AS targetId
    MATCH (target) WHERE id(target) = targetId
    CREATE (source)-[:${relationshipType}]->(target)
`, { sourceId, targetIds });
```

### 6.3 Strategic Document Reference Relationships

`REFERENCES` carries an optional `note` property (plain text, e.g. "Section 3.2"). Used only by ON-type requirements:

```javascript
await transaction.run(`
    MATCH (version) WHERE id(version) = $versionId
    MATCH (doc:ReferenceDocument) WHERE id(doc) = $docId
    CREATE (version)-[:REFERENCES {note: $note}]->(doc)
`, { versionId, docId, note });
```

---

## 7. Multi-Context Operations

All operational entity queries accept optional context parameters that transparently change which versions are returned.

### 7.1 Query Contexts

| Context | Parameters | Behaviour |
|---|---|---|
| Current state | none | Returns latest versions via `LATEST_VERSION` |
| Historical | `baselineId` | Returns versions captured in baseline via `HAS_ITEMS` |
| Wave-filtered | `fromWaveId` | Returns latest versions; OCs filtered by milestone date, ORs by OC reference |
| Historical + filtered | `baselineId` + `fromWaveId` | Combines both |
| ODIP Edition | `odpEditionId` | Route layer resolves to `baselineId` + `fromWaveId` before calling store |

### 7.2 Baseline Queries

At baseline creation, all current `LATEST_VERSION` pointers are captured atomically as `HAS_ITEMS` relationships:

```cypher
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE item:OperationalRequirement OR item:OperationalChange
CREATE (baseline)-[:HAS_ITEMS]->(version)
```

Historical queries use these direct pointers:

```cypher
// With baseline context
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
RETURN item, version
```

### 7.3 Wave Filtering

Wave filtering cascades from milestones upward:

1. **OCs**: include only those with at least one milestone targeting a wave at or after `fromWave`
2. **ORs**: include only those referenced by a filtered OC via `IMPLEMENTS` or `DECOMMISSIONS`, plus all ancestors via `REFINES` (upward cascade)

```javascript
// Wave filter check for OC
async _checkWaveFilter(version, fromWaveId, transaction) {
    if (this.entityType === 'OperationalChange') {
        return await this._hasMilestoneAtOrAfterWave(version.versionId, fromWaveId, transaction);
    } else if (this.entityType === 'OperationalRequirement') {
        return await this._isReferencedByFilteredOCs(version.itemId, fromWaveId, transaction);
    }
    return true;
}
```

### 7.4 ODIP Edition Parameter Resolution

`ODIPEdition` resolution happens at the **route layer**, not in the store. The store always receives resolved `baselineId` and `fromWaveId` parameters and has no knowledge of editions.

```javascript
// Route layer
if (req.query.odpEdition) {
    const context = await odpEditionStore().resolveContext(req.query.odpEdition, tx);
    baselineId = context.baselineId;
    fromWaveId = context.fromWaveId;
}
const results = await operationalRequirementStore().findAll(tx, baselineId, fromWaveId);
```

---

## 8. Transaction Design

### 8.1 Transaction Lifecycle (`transaction.js`)

The `Transaction` class wraps a Neo4j transaction and session. It exposes `run()`, `commit()`, and `rollback()`, and closes the session in a `finally` block regardless of outcome. Once completed (`isComplete = true`), any further `run()` call throws a `TransactionError`.

Transactions carry `userId` via `getUserId()`, which stores use when writing `createdBy` fields.

```javascript
// transaction.js exports
export function createTransaction(userId)      // → Transaction
export async function commitTransaction(tx)    // → void
export async function rollbackTransaction(tx)  // → void
```

### 8.2 Error Hierarchy (`transaction.js`)

```
StoreError          (base — message + cause)
└── TransactionError  (transaction lifecycle failures)
```

`StoreError` is also imported and thrown by store classes for data-level errors. `TransactionError` covers session/commit/rollback failures.

### 8.3 Connection Management (`connection.js`)

A singleton Neo4j driver is managed by `connection.js`. It initialises with retry logic (configurable `maxAttempts` and `intervalMs` from `config.json`) and exposes three functions:

```javascript
export async function initializeConnection()  // called once at server startup
export function getDriver()                   // used by createTransaction()
export async function closeConnection()       // called on server shutdown
```

The driver is configured with `maxConnectionPoolSize` and `connectionTimeout` from `config.json`. Stores are initialised once via `initializeStores(driver)` and accessed through named accessor functions that throw if called before initialisation:

```javascript
export function operationalRequirementStore() {
    if (!storeInstances.operationalRequirement)
        throw new Error('Stores not initialized — call initializeStores() first');
    return storeInstances.operationalRequirement;
}
```

### 8.4 Standard Transaction Pattern

```javascript
// Service layer owns the transaction boundary
const tx = createTransaction(userId);
try {
    const entity = await entityStore().create(data, tx);
    await commitTransaction(tx);
    return entity;
} catch (error) {
    await rollbackTransaction(tx);
    throw error;
}
```

---

## 9. Error Handling

### 9.1 StoreError Hierarchy

Defined in `transaction.js` and used across all store files:

```
StoreError          (message + cause)
└── TransactionError  (transaction/session lifecycle failures)
```

Unlike the previous design, there is no separate `ValidationError` or `OptimisticLockError` subclass — validation and locking failures throw `StoreError` directly with descriptive messages.

### 9.2 Common Error Conditions

| Condition | Error type | Thrown by |
|---|---|---|
| Self-reference in REFINES | `StoreError` | `RefinableEntityStore` |
| Referenced node(s) not found | `StoreError` | `RefinableEntityStore`, `_validateReferences` |
| Version mismatch on update | `StoreError` | `VersionedItemStore` |
| Item has no versions (data integrity) | `StoreError` | `findVersionHistory` |
| Invalid ID format | `StoreError` | `normalizeId` |
| Baseline not found | `StoreError` | Multi-context queries |
| Wave not found | `StoreError` | Multi-context queries |
| Query on completed transaction | `TransactionError` | `Transaction.run()` |
| Commit/rollback failure | `TransactionError` | `Transaction.commit/rollback()` |

---

## 10. Performance Considerations

- **`LATEST_VERSION` relationships** enable single-hop access to the current version, avoiding full version history scans
- **`HAS_ITEMS` relationships** on baselines enable direct version lookup without re-deriving historical state
- **`UNWIND` batching** minimises round-trips for multi-target relationship creation
- **`EXISTS {}` subqueries** avoid materialising full node sets for wave milestone checks
- **Neo4j indexes** on `title` (OperationalRequirement, OperationalChange) and `year`/`sequenceNumber` (Wave) support search and filtering
- **Connection pooling** at the driver level handles concurrent requests without per-request connection overhead

---

*Previous: [Chapter 01 – Data Model](./01-Data-Model.md) | Next: [Chapter 03 – Service Layer](./03-Service-Layer.md)*