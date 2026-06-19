# Chapter 02 – Storage Layer

## 1. Overview

The Storage Layer provides a clean JavaScript abstraction over Neo4j graph database operations. It is the only layer that issues Cypher queries — all layers above interact exclusively through the store API.

Key responsibilities:
- Entity CRUD with consistent Neo4j result transformation
- Hierarchical relationship management (REFINES)
- Versioned entity lifecycle with optimistic locking
- Complete relationship payload per version (no inheritance fallback)
- Multi-context querying (baseline snapshots and edition filtering)
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
├── ChangeSetStore                     (change-set-store.js)
├── ODPEditionStore                    (odp-edition-store.js)
├── OperationalChangeMilestoneStore    (operational-change-milestone-store.js)
├── RefinableEntityStore               (refinable-entity-store.js)
│   ├── ReferenceDocumentStore         (reference-document-store.js)
│   └── StakeholderCategoryStore       (stakeholder-category-store.js)
├── VersionedItemStore                 (versioned-item-store.js)
│   ├── ChapterStore                   (chapter-store.js)
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

Extends `BaseStore` with REFINES hierarchy management. `parentId` is managed exclusively as a `REFINES` relationship — it is never stored as a node property.

**Overridden methods:**
- `create(data, tx)` — strips `parentId` from `data` before delegating to `BaseStore.create()`; the caller (`TreeItemService`) is responsible for creating the `REFINES` relationship separately
- `findAll(tx)` — overrides `BaseStore.findAll()` with an `OPTIONAL MATCH` on `REFINES` to derive `parentId` from the graph edge

**Additional public methods:**
- `createRefinesRelation(childId, parentId, tx)` — validates both nodes exist, prevents self-reference, enforces tree structure (deletes existing parent relationship before creating the new one)
- `deleteRefinesRelation(childId, parentId, tx)` — removes a specific REFINES relationship
- `findChildren(parentId, tx)` — direct children, ordered by `name`
- `findDescendants(rootId, tx)` — full subtree below the root at any depth via transitive `REFINES*1..`, excluding the root itself, ordered by `name`
- `findParent(childId, tx)` — direct parent, or `null` if root
- `findRoots(tx)` — all nodes with no parent, ordered by `name`

```javascript
async create(data, transaction) {
    const { parentId, ...nodeData } = data;
    return super.create(nodeData, transaction);
}

async findAll(transaction) {
    const result = await transaction.run(`
        MATCH (n:${this.nodeLabel})
        OPTIONAL MATCH (n)-[:REFINES]->(parent:${this.nodeLabel})
        RETURN n, id(parent) AS parentId
        ORDER BY id(n)`);
    return result.records.map(record => {
        const item = this.transformRecord(record, 'n');
        const parentId = record.get('parentId');
        if (parentId !== null) item.parentId = parentId.toNumber();
        return item;
    });
}

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
- `create(data, tx, changeSetCommit)` — generates `code`, creates Item + ItemVersion (version 1), establishes all relationships; validates the change set is OPEN and records a `CREATE` `AuditEvent` in the same transaction. The Item node carries **no** `status` field — lifecycle is edge-derived (§5.6). Item and version nodes carry **no** `createdAt`/`createdBy` — who/when/why is on the event. `data` carries entity state only — the commit is a separate argument.
- `update(itemId, data, expectedVersionId, tx, changeSetCommit)` — validates lock, creates new version, always uses provided relationship arrays; validates the change set is OPEN and records an `UPDATE` `AuditEvent`. Release and decommission are service operations that flow through dedicated transition methods, not `update`.
- `findById(itemId, tx, baselineId?, editionId?, lifecycleFace?)` — resolves to the version on the selected lifecycle face (default `active` → `LATEST_VERSION`), returns item with all relationship references and the computed `lifecycleStatus` (live context only). No `createdAt`/`createdBy`/`changeSetCommit` on the read shape.
- `findByIdAndVersion(itemId, versionNumber, tx)` — specific historical version with relationships; same read shape.
- `softDelete(itemId, changeSetCommit, tx)` — moves the item from the Active to the Deleted face: removes `LATEST_VERSION`, adds `DELETED_VERSION` on the same version node, records a `DELETE` `AuditEvent`. Lifecycle-state guard only (item must hold `LATEST_VERSION`); the blocking-reference precondition is enforced by the service layer before this is called. Concrete on the base — the edge mechanics are identical for all versioned items.
- `restore(itemId, changeSetCommit, tx)` — the inverse: removes `DELETED_VERSION`, re-adds `LATEST_VERSION`, records a `RESTORE` `AuditEvent`. Lifecycle-state guard only (item must hold `DELETED_VERSION`).

> `findVersionHistory` is **removed**. The History feed is built by the client from `AuditEventStore.findAll({targetId}, tx)` (§3.x) — self-contained event rows carrying action, actor, role, timestamp, frozen change-set code/title, and note. No version-node join on the common path.

**Abstract methods** (must be implemented by concrete stores):
- `_extractRelationshipIdsFromInput(data, currentVersionId, transaction)` — separates relationship arrays from content fields; `currentVersionId` is `null` on create, set on update (used by `OperationalChangeStore` for milestone inheritance)
- `_buildRelationshipReferences(versionId, tx, fields?)` — loads relationships as Reference objects `{id, title, code}`; `fields` is the projection field list — only relationships whose field name is included are fetched
- `_createRelationshipsFromIds(versionId, relationshipIds, tx)` — writes all relationships for a version
- `buildFindAllQuery(baselineId, filters, fields?, lifecycleFace?)` — builds entity-specific optimised Cypher for list queries; `fields` is the projection field list driving which OPTIONAL MATCHes and RETURN columns are emitted; in the live dataset (`baselineId` null) `lifecycleFace` selects the anchoring edge via `LIFECYCLE_FACE_EDGE`; when `filters.editionId` is present the `HAS_ITEMS` relationship is aliased as `r` and `$editionId IN r.editions` is added as a WHERE condition. The RETURN always projects the four lifecycle flags (`EXISTS {}` edge-presence checks) into the row.
- `findAll(tx, baselineId?, filters?, projection?, lifecycleFace?)` — list with multi-context, content filtering, lifecycle-face selection, and projection support; throws if `projection = 'extended'`; each row carries a `lifecycleStatus` object
- `findInboundReferences(itemId, tx)` — returns all **live** O\* items referencing the target via an inbound relationship, as `OperationalEntityReference[]` (`{id, code, title, type}` with `type` in `ON | OR | OC`). The relationship set inspected is entity-specific. A pure where-used query: it does not inspect the target's lifecycle state, and edition/baseline captures are **not** included (edition membership does not constrain soft delete). Concrete stores implement.
- `_getEntityTypeForCode(data)` — returns `'ON'`, `'OR'`, or `'OC'` for code generation (abstract)

Note that `findById` itself is concrete on the base (it gained the `lifecycleFace` parameter); concrete stores override it only to append derived fields under the `extended` projection, passing `lifecycleFace` through to `super`.

**Internal helpers:**
- `_generateCode(entityType, drg, tx)` — generates sequential codes in format `{type}-{DRG}-{####}` (e.g. `OR-IDL-0001`)
- `_findMaxCodeNumber(entityType, drg, tx)` — finds highest existing code number for a type+DRG pair
- `_computeLifecycleStatus(itemId, tx)` — returns the `LifecycleStatus` object `{active, released, decommissioned, deleted}` from four `EXISTS {}` edge-presence checks; used by `findById` in the live context
- `_buildReference(record, titleField?)` — builds a `{id, title, code, ...}` Reference object from a Neo4j record
- `_validateReferences(label, ids, tx)` — batch-validates that all referenced node IDs exist; throws `StoreError` listing missing IDs
- `_validateOpenChangeSet(changeSetCommit, tx)` — fail-fast validation that **returns a frozen change-set snapshot** `{code, title, classifier}` for the audit event: missing `changeSetId` throws a `Validation failed:` `StoreError` (no code); a non-existent ChangeSet throws `code: CHANGESET_NOT_FOUND`; a non-`OPEN` ChangeSet throws `code: CHANGESET_CLOSED`
- `_auditCommit(changeSetCommit, csSnapshot)` — assembles the audit commit fragment `{changeSetId, code, title, classifier, note}` from the write-time commit and the frozen snapshot
- `_resolveAuditTargetType(contentData)` — resolves the `AuditTargetType` leaf for this store: `OC` / `CHAPTER` from the node label, otherwise the requirement's `ON`/`OR` from `contentData.type`

**Module constant**: `LIFECYCLE_FACE_EDGE` — exported map from `lifecycleFace` value (`active` / `released` / `decommissioned` / `deleted`) to the anchoring lifecycle edge (`LATEST_VERSION` / `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` / `DELETED_VERSION`). Imported by the concrete O\* stores.

**Note on `code` field**: Item nodes carry a `code` property (e.g. `OR-IDL-0042`) that is generated at creation time from the entity type and domain key. Codes are stable identifiers used for round-trip import matching alongside `externalId`.

### 3.x AuditEventStore (`audit-event-store.js`)

Extends `BaseStore` (node label `AuditEvent`). The **sole audit surface** — the single authoritative record of every consequential write. Instantiated by `VersionedItemStore` (as `this.auditEventStore`, shared by all versioned stores) and by `ChangeSetStore` (for the member feed). Write + read only — events are append-only, never updated or deleted.

**Methods:**
- `log(action, target, changeSetCommit, tx)` — the single write. Creates the `AuditEvent` node (all fields frozen at write time), the `TARGETS` edge to the item, and `UNDER_CHANGESET` when `changeSetCommit` is present. `userId`/`userRole` are read from the transaction (§8.1). `target` is `{id, type, code, title, version}`; `changeSetCommit` is `{changeSetId, code, title, classifier, note}` or `null`. Written **in the same transaction** as the operation it records — the event never exists without its cause, and the cause never commits without its event.
- `findAll(filters, tx)` → `Array<AuditEvent row>` ordered by `timestamp` — the **sole audit-query method**. `filters` is `{changeSetId?, targetId?, userId?}`, all optional, AND-combined; an empty object returns the entire log. Every consumer reads this one shape: the audit interface (`/audit-events`), the client-built History timeline (filter by `targetId`), and the change-set members feed (`ChangeSetStore.findMembers` delegates with `{changeSetId}`). Each row carries every frozen event attribute plus a resolved `versionId` — the `ItemVersion` node id recovered via an `OPTIONAL MATCH` on `targetId` + `targetVersion` **within the same query** (one statement, no N+1; null for non-version-producing events). When `changeSetId` is supplied the match starts from the `UNDER_CHANGESET` hop; otherwise it is a plain `TARGETS` scan.

The denormalised target/change-set fields on the event are frozen snapshots; a `HARD_DELETE` event's `TARGETS` edge is removed with the item, but `targetId`/`targetType`/`targetCode`/`targetTitle` survive as the only trace.

### 3.4 Concrete Stores

Each concrete store extends the appropriate base and adds entity-specific relationship handling.

| Store | Base | Additional relationships / notes |
|---|---|---|
| `StakeholderCategoryStore` | `RefinableEntityStore` | — |
| `ReferenceDocumentStore` | `RefinableEntityStore` | — |
| `WaveStore` | `BaseStore` | — |
| `BandwidthStore` | `BaseStore` | — |
| `BaselineStore` | `BaseStore` | `HAS_ITEMS` capture; immutable |
| `ODPEditionStore` | `BaseStore` | `EXPOSES`, context resolution; immutable |
| `OperationalChangeMilestoneStore` | `BaseStore` | `BELONGS_TO`, `TARGETS`; internal to `OperationalChangeStore` |
| `ChangeSetStore` | `BaseStore` | Non-versioned; status transitions; `findMembers` via audit `UNDER_CHANGESET` hop |
| `AuditEventStore` | `BaseStore` | Append-only audit log; `TARGETS` / `UNDER_CHANGESET`; `log` + `findAll` (single audit-query method) |
| `ChapterStore` | `VersionedItemStore` | No relationships; `findByKey(key, tx)` for bootstrap; config-owned fields merged at read time |
| `OperationalRequirementStore` | `VersionedItemStore` | `REFINES`, `IMPACTS_STAKEHOLDER`, `HAS_ACTING_STAKEHOLDER`, `REFERENCES`, `DEPENDS_ON`, `IMPLEMENTS` |
| `OperationalChangeStore` | `VersionedItemStore` | `IMPLEMENTS`, `DECOMMISSIONS`, `DEPENDS_ON`; milestones delegated |

---

## 4. Concrete Store APIs

### 4.1 Setup Entity Stores

`StakeholderCategoryStore` inherits `RefinableEntityStore → BaseStore` and exposes no additional public methods beyond those described in §3.1 and §3.2.

`WaveStore` inherits `BaseStore` only. Business rules: `year` is a 4-digit integer, `sequenceNumber` is a positive integer. The `(year, sequenceNumber)` pair is unique (e.g. wave `27#2`). `implementationDate` is optional (ISO format).

`ReferenceDocumentStore` inherits `RefinableEntityStore → BaseStore`. Supports REFINES parent-child hierarchy consistent with `StakeholderCategoryStore`. Fields: `name`, `description` (optional), `version` (optional), `url`, `parentId` (optional). Reference documents are referenced via `REFERENCES` relationships from operational requirement versions, not via any method on `ReferenceDocumentStore` itself.

`BandwidthStore` inherits `BaseStore` only. Fields: `year`, `planned` (optional, integer, in MW), `waveId` (optional), `scopeId` (optional). The `(year, waveId, scopeId)` tuple is unique. NM internal — not exposed to external stakeholders.

---

### 4.2 ChapterStore (`chapter-store.js`)

Inherits `VersionedItemStore → BaseStore`. Chapters have no graph relationships — all content is stored as scalar fields on `ChapterVersion`. Config-owned fields (`title`, `domain`, `position`) are not stored in the DB — they are merged from `edition-config` at read time by `_mergeConfigFields()`.

**No `create()` from `VersionedItemStore`** — chapter creation is bootstrap-only via `createChapter(code, title, tx)`. `_getEntityTypeForCode()` returns `null` (no code generation for chapters).

**Projection:**

| Projection | Fields included |
|---|---|
| `'standard'` | All identity and scalar fields — excludes `narrative`, `osHierarchy`, and `generatedBlocks` |
| `'extended'` | All fields including `narrative`, `osHierarchy`, and `generatedBlocks` |

**Additional public methods:**

**`findByCode(code, tx)`** → `object|null` — find a chapter by its stable config code. Used by `initializeDatabase()` to check existence before creating. Always returns `extended` projection.

**`createChapter(code, title, tx)`** — bootstrap-only creation. Stores `code` and `title` on the item node; initialises version with empty `narrative`, null `jsonOsHierarchy`, and null `jsonGeneratedBlocks`.

**`findAll(tx, projection?)`** → all chapters ordered by item ID. Defaults to `'standard'` projection — `narrative`, `osHierarchy`, and `generatedBlocks` are excluded. Config-owned fields are merged by `ChapterService`.

**`findById(itemId, tx, baselineId?, editionId?, projection?)`** → single chapter; defaults to `'extended'` projection. Accepts `editionId` for API symmetry but **drops it** before delegating to `super.findById` — only `baselineId` is forwarded. Chapters are implicitly present in every edition; their `HAS_ITEMS` relationships are never marked with edition IDs by `_computeEditionVersionIds`, so applying the `$editionId IN r.editions` filter would always return no results. The baseline context alone gives the correct snapshot. Strips `narrative`/`osHierarchy`/`generatedBlocks` from the result if `'standard'` projection is requested. Returns `null` if not found.

**Lifecycle — not applicable.** Chapters are config-owned scaffolding: created at bootstrap, never deleted, and they carry no lifecycle edges beyond `LATEST_VERSION`. `softDelete`, `restore`, and `findInboundReferences` are overridden to throw `StoreError` (fail-fast), mirroring the immutability overrides on `BaselineStore` / `ODPEditionStore`. Chapter reads carry no `lifecycleStatus` — `ChapterStore` keeps its own `findAll` / `findById` / `buildFindAllQuery` signatures (with `projection` in the fourth slot) and does not participate in lifecycle-face selection.

Config fields absent in `edition-config` (e.g. after a config drift) are set to `null` rather than throwing — drift is visible at read time rather than fatal.

---

### 4.3 OperationalRequirementStore (`operational-requirement-store.js`)

Inherits `VersionedItemStore → BaseStore`. The `findById` signature carries optional context, projection, and lifecycle face: `findById(itemId, tx, baselineId?, editionId?, projection?, lifecycleFace?)`. `lifecycleFace` is threaded through to `super.findById`.

**Relationship fields** (returned by `findAll`/`findById`, accepted by `create`/`update`):

| Field | Relationship | ON/OR | Note |
|---|---|---|---|
| `refinesParents` | `REFINES` → OR Item | both | — |
| `strategicDocuments` | `REFERENCES` → ReferenceDocument | ON only | `note` |
| `implementedONs` | `IMPLEMENTS` → OR Item (ON type) | OR only | — |
| `impactedStakeholders` | `IMPACTS_STAKEHOLDER` → StakeholderCategory | OR only | `note` |
| `actingStakeholders` | `HAS_ACTING_STAKEHOLDER` → StakeholderCategory | OR only | `note` |
| `dependencies` | `DEPENDS_ON` → OR Item | OR only | — |

**`findAll(tx, baselineId?, filters?, projection?, lifecycleFace?)`** — uses a single aggregated query (no N+1). `projection` defaults to `'standard'`; `'extended'` is rejected. `lifecycleFace` defaults to `'active'` and selects the anchoring edge in the live dataset (mutually exclusive with `baselineId`). The field list from `getProjectionFields('requirement', projection)` drives which OPTIONAL MATCHes and RETURN columns are emitted in `buildFindAllQuery`, and which fields are assembled from each record. Every row carries a `lifecycleStatus` object (four flags from `EXISTS {}` checks). Filters object:

| Filter field | Type | Behaviour |
|---|---|---|
| `editionId` | `number\|null` | Edition membership — `$editionId IN r.editions` on baseline `HAS_ITEMS` relationship; requires `baselineId` to be set |
| `type` | `'ON'\|'OR'\|null` | Exact match on version field |
| `title` | `string\|null` | CONTAINS match on title or code |
| `text` | `string\|null` | CONTAINS across statement, rationale, flows, privateNotes |
| `domain` | `string\|null` | Exact match on `version.domain` string field |
| `maturity` | `string\|null` | Exact match on maturity enum value |
| `impactedStakeholder` | `number\|number[]\|null` | ID or ID list — EXISTS via IMPACTS_STAKEHOLDER → StakeholderCategory, matched with `id(sc) IN $impactedStakeholder`. A single value is wrapped to a one-element list; each element normalised. OR type only. The list supports business-match expansion (selected category + descendants) resolved at the service layer; the store sees only a flat ID list |
| `actingStakeholder` | `number\|null` | Single ID — EXISTS via HAS_ACTING_STAKEHOLDER → StakeholderCategory. OR type only. Exact match only |
| `strategicDocument` | `number\|null` | Single ID — EXISTS via REFERENCES → ReferenceDocument. ON type only |
| `refinesParent` | `number\|null` | Single OR item ID — EXISTS via REFINES |
| `dependsOn` | `number\|null` | Single OR item ID — EXISTS via DEPENDS_ON |
| `implementedON` | `number\|null` | Single ON item ID — EXISTS via IMPLEMENTS |

**`findChildren(itemId, tx, baselineId?, startDate?)`** → `Array<{id, title, code, type}>`

**`findParents(itemId, tx, baselineId?, startDate?)`** → `Array<{id, title, code, type}>`

**`findRoots(tx, baselineId?, startDate?)`** → `Array<{id, title, code, type}>` — requirements with no REFINES parent

**`findRequirementsThatImpactStakeholder(targetId, tx, baselineId?)`** → `Array<{id, title, code, type}>` — requirements that impact a given `StakeholderCategory`

**`findRequirementsThatImplement(onItemId, tx, baselineId?, startDate?)`** → `Array<{id, title, code, type}>` — OR requirements that IMPLEMENT a given ON

**`findOrphanONs(tx, baselineId?, editionId?, domain?)`** → `Array<{itemId, code, title, versionId}>` — ONs with no incoming `IMPLEMENTS` and no incoming `REFINES`; NO_SHOW ONs excluded. Called exclusively by `QualityService`.

**`findUntraceableORs(tx, baselineId?, editionId?, domain?)`** → `Array<{itemId, code, title, versionId}>` — ORs with no outgoing `IMPLEMENTS` and no outgoing `REFINES`; NO_SHOW ORs excluded. Called exclusively by `QualityService`.

**`findONStrategicDocumentRefs(tx, baselineId?, editionId?)`** → `Array<{ itemId, code, title, docId, note }>` — fetches all `(ON)-[:REFERENCES]->(ReferenceDocument)` triples in a single query. NO_SHOW ONs excluded. Supports latest / baseline / edition contexts. Called exclusively by `OperationalRequirementService.getONStrategicDocumentRefs()`.

**`getMaturityCounts(tx, baselineId?, editionId?)`** → `Array<{ domain, type, maturity, count }>` — aggregates ON/OR counts grouped by domain × type × maturity in a single query. NO_SHOW items excluded. Supports latest / baseline / edition contexts. Returns a richer result than a simple type × maturity grouping — callers derive both global and per-domain stats from this single query. Called by `OperationalRequirementService.getEditionStats()` (sums across domains) and `OperationalRequirementService.getEditionStatsByDomain()` (groups by domain).

**`findById` — `extended` projection**: performs the standard load then appends derived fields via additional reverse-traversal queries:

| Derived field | Query |
|---|---|
| `implementedByORs` | OR versions with `IMPLEMENTS → this item` whose version is `LATEST_VERSION` |
| `implementedByOCs` | OC versions with `IMPLEMENTS → this item` whose version is `LATEST_VERSION` |
| `decommissionedByOCs` | OC versions with `DECOMMISSIONS → this item` whose version is `LATEST_VERSION` |
| `refinedBy` | Requirement versions with `REFINES → this item` whose version is `LATEST_VERSION` |
| `requiredByORs` | OR versions with `DEPENDS_ON → this item` whose version is `LATEST_VERSION` |

**`findInboundReferences(itemId, tx)`** → `OperationalEntityReference[]` — all **live** O\* items referencing this requirement: child requirements via `REFINES`, ORs via `IMPLEMENTS` and `DEPENDS_ON`, OCs via `IMPLEMENTS` and `DECOMMISSIONS` (each referencing version must hold `LATEST_VERSION`). A pure where-used query over O\* references — `type` is always `ON | OR | OC`. It does not inspect the target's lifecycle state, and edition/baseline captures are **not** included: edition membership does not constrain soft delete (the snapshot holds frozen `ItemVersion` nodes, unaffected by item-level lifecycle transitions). The service layer interprets this set as blocking dependencies; the store applies no such interpretation.

**Not implemented**: `findDependencies`, `findDependents`, `patch`, `getVersionHistory`

---

### 4.4 OperationalChangeStore (`operational-change-store.js`)

Inherits `VersionedItemStore → BaseStore`. Milestone operations are **delegated** to an internal `OperationalChangeMilestoneStore` instance (see §4.6). Additional public methods:

**`findAll(tx, baselineId?, filters?, projection?, lifecycleFace?)`** — wave filtering is removed; edition filtering applied via `filters.editionId` when present. `projection` defaults to `'standard'`; `'extended'` is rejected. `lifecycleFace` defaults to `'active'` and selects the anchoring edge in the live dataset (mutually exclusive with `baselineId`). The field list from `getProjectionFields('change', projection)` drives which scalar fields are projected in the RETURN clause, and whether `_buildRelationshipReferences` is called per item. Every row carries a `lifecycleStatus` object (four flags from `EXISTS {}` checks). Filters object:

| Filter field | Type | Behaviour |
|---|---|---|
| `editionId` | `number\|null` | Edition membership — `$editionId IN r.editions` on baseline `HAS_ITEMS` relationship; requires `baselineId` to be set |
| `title` | `string\|null` | CONTAINS match on title or code |
| `text` | `string\|null` | CONTAINS search across purpose, initialState, finalState, details, privateNotes |
| `domain` | `string\|null` | Exact match on `version.domain` string field |
| `maturity` | `string\|null` | Exact match on maturity enum value |
| `stakeholderCategory` | `number[]\|null` | Via IMPLEMENTS\|DECOMMISSIONS → OR IMPACTS_STAKEHOLDER chain |
| `implementsOR` | `number\|null` | Single OR item ID — EXISTS via IMPLEMENTS\|DECOMMISSIONS |

**`findChangesThatImplementRequirement(requirementItemId, tx, baselineId?, startDate?)`** → `Array<{id, title, code}>` — OCs that IMPLEMENT the given OR

**`findChangesThatDecommissionRequirement(requirementItemId, tx, baselineId?, startDate?)`** → `Array<{id, title, code}>` — OCs that DECOMMISSION the given OR

**`findById(itemId, tx, baselineId?, editionId?, projection?, lifecycleFace?)`** — `lifecycleFace` threaded through to `super.findById`. `extended` projection appends the following derived field via reverse-traversal query:

| Derived field | Query |
|---|---|
| `requiredByOCs` | OC versions with `DEPENDS_ON → this item` whose version is `LATEST_VERSION` |

**`findInboundReferences(itemId, tx)`** → `OperationalEntityReference[]` — all **live** O\* items referencing this change: other OCs via `DEPENDS_ON` (referencing version must hold `LATEST_VERSION`). A pure where-used query — `type` is `OC`. It does not inspect the target's lifecycle state, and edition/baseline captures are **not** included (edition membership does not constrain soft delete). The service layer interprets this set as blocking dependencies.

**`_buildRelationshipReferences(versionId, tx, fields?)`** — fetches only the relationship queries whose field name is present in `fields`. When `fields` is `null` (internal calls), all relationships are fetched.

**Milestone delegation** — the following are thin wrappers that forward to `this.milestoneStore`:

- **`findMilestonesByChange(itemId, tx, baselineId?)`** → `Array<object>`
- **`findMilestoneByKey(itemId, milestoneKey, tx, baselineId?)`** → `object|null`
- **`findMilestonesByWave(waveId, tx, baselineId?)`** → `Array<object>`

**Not implemented in this store**: `findDependencies`, `findDependents`, `patch`, `getVersionHistory`. Dependencies are returned inline as part of `findById` / `findAll` results.

**Note on milestone fields**: The milestone object uses **`eventTypes`** (array, not singular `eventType`). Milestones carry a stable **`milestoneKey`** (UUID-prefixed string, e.g. `ms_<uuid>`) generated on first creation and preserved across versions.

---

### 4.5 BaselineStore (`baseline-store.js`)

Inherits `BaseStore`. `update()` and `delete()` are overridden to throw `StoreError` — baselines are immutable.

**`create({title}, tx)`** — creates the Baseline node, atomically captures all current `LATEST_VERSION` targets for `OperationalRequirement`, `OperationalChange`, and `Chapter` as `HAS_ITEMS` relationships, returns baseline with `capturedItemCount`.

**`findById(id, tx)`** → baseline with `capturedItemCount` (count of `HAS_ITEMS` targets)

**`findAll(tx)`** → all baselines with `capturedItemCount`, ordered by `createdAt DESC`

**`getBaselineItems(baselineId, tx)`** → `Array<{itemId, itemTitle, itemType, versionId, version, capturedAt}>` — all OR/OC/Chapter versions captured, ordered by `itemType` then `itemTitle`

---

### 4.6 ODPEditionStore (`odp-edition-store.js`)

Inherits `BaseStore`. `update()` and `delete()` are overridden to throw `StoreError` — editions are immutable.

**`create({title, type, baselineId, startDate?, minONMaturity?}, tx)`** — creates the `ODPEdition` node (storing `startDate` and `minONMaturity` as node properties when provided), creates `EXPOSES` → Baseline relationship, then runs the content selection algorithm via `_computeEditionVersionIds()` and patches matching `HAS_ITEMS` relationships by appending the edition ID to their `editions` array property.

**`findById(id, tx)`** → edition enriched with `baseline: {id, title, createdAt}` sub-object; `startDate` is returned directly from the edition node properties

**`findAll(tx)`** → all editions with same enrichment, ordered by `createdAt DESC`

**`resolveContext(editionId, tx)`** → `{baselineId, editionId}` — used exclusively by the service layer to resolve an edition to its context parameters before calling operational store methods. Throws `StoreError('Edition not found')`.

**`_computeEditionVersionIds(baselineId, startDate, minONMaturity, tx)`** *(private)* — runs the two-path selection algorithm and returns a `Set` of version node IDs already present in baseline `HAS_ITEMS` relationships.

**Tentative path (ON/OR-based):**
1. **Lead ONs** — all baseline `HAS_ITEMS` ON versions. If `minONMaturity` set: maturity numeric rank >= minONMaturity rank (`DRAFT=0`, `ADVANCED=1`, `MATURE=2`); absent maturity treated as `DRAFT`. If `startDate` set: ONs with a `tentative` field must satisfy `effectiveEnd(tentative) > startDate` where `effectiveEnd([x,y]) = {y+1}-01-01`; ONs without a `tentative` field pass the `startDate` check unconditionally.
2. **Downward ON cascade** — baseline ON versions that `REFINES*1..` any accepted ON item.
3. **OR inclusion** — baseline OR versions that `IMPLEMENTS` any accepted ON item.
4. **Downward OR cascade** — baseline OR versions that `REFINES*1..` any accepted OR item.

**OC path (change-based):**
5. **Lead OCs** — baseline OC versions with at least one milestone. If `startDate` set: milestone must have a `TARGETS` wave with `implementationDate >= startDate`.
6. **OR/ON inclusion** — baseline OR versions `IMPLEMENTS|DECOMMISSIONS`-linked to accepted OC versions; baseline ON versions `IMPLEMENTS`-linked to those OR versions.

Result is the union of both paths. The patch query:
```cypher
MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version)
WHERE id(baseline) = $baselineId AND id(version) IN $versionIds
SET r.editions = coalesce(r.editions, []) + $editionId
```

---

### 4.7 OperationalChangeMilestoneStore (`operational-change-milestone-store.js`)

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
- **`findMilestoneByKey(itemId, milestoneKey, tx, baselineId?, startDate?)`** → `object|null`
- **`findMilestonesByChange(itemId, tx, baselineId?, startDate?)`** → `Array<object>` — ordered by `milestone.name`
- **`findMilestonesByWave(waveId, tx, baselineId?, startDate?)`** → `Array<object>` — each result includes `change: {id, title}` context; ordered by `change.title, milestone.name`

**Wave filtering for milestones**: a milestone passes the `startDate` filter only if it has a `TARGETS` wave and that wave's `implementationDate >= startDate`. Milestones without a wave target **do not pass** the filter.

---

### 4.8 ChangeSetStore (`change-set-store.js`)

Inherits `BaseStore` (node label `ChangeSet`). Non-versioned — a change set is a single mutable node, not a dual-node entity. It records *why* content changed; every consequential write records an `AuditEvent` linked to its OPEN change set via `UNDER_CHANGESET` (written through `AuditEventStore`, §3.x). The `ChangeSet` node keeps its own `createdAt`/`createdBy` stamps — only versioned items lost theirs.

**Overridden methods:**
- `create(data, tx)` — generates `code` (`CS-#####`, sequential, 5-digit zero-pad) via `_findMaxChangeSetCodeNumber(tx)`, then stamps `createdAt`/`createdBy`, initialises `status = 'OPEN'` and `commentRefs = []`, and delegates to `BaseStore.create`. `closedAt`/`closedBy` remain unset until closure.

**Private helpers:**
- `_findMaxChangeSetCodeNumber(tx)` — scans `ChangeSet.code` values prefixed `CS-`, extracts the numeric suffix, and returns the highest found (0 when none exist). Mirrors `VersionedItemStore._findMaxCodeNumber` — no DRG segment, 5-digit pad. A `UNIQUE` constraint on `ChangeSet.code` (declared in `initializeDatabase()` via `_ensureConstraints()`) is the fail-fast backstop against race-condition duplicates.

**Additional public methods:**
- `close(id, tx)` — sets `status = 'CLOSED'`, `closedAt = now`, `closedBy = userId`; throws if not found
- `reopen(id, tx)` — sets `status = 'OPEN'`, clears `closedAt`/`closedBy` (multi-cycle history not retained); throws if not found
- `findByStatus(status, tx)` → `Array<ChangeSet>` ordered by `createdAt DESC`
- `findByClassifier(classifier, tx)` → `Array<ChangeSet>` ordered by `createdAt DESC`
- `findMembers(changeSetId, tx)` → `Array<AuditEvent row>` — delegates to `AuditEventStore.findAll({changeSetId}, tx)`. Returns the standard audit-row shape (same as every audit consumer); the change-set detail view reads `targetType` / `targetCode` / `targetTitle` / `targetVersion` / `versionId` directly off each row. Computed on demand.

**Member rows** are the standard AuditEvent row shape returned by `findAll` (no separate projection — `findMembers` delegates with `{changeSetId}`). The change-set detail view reads these columns off each row:

| Field | Source |
|---|---|
| `targetId` | `id(item)` — stable item identity |
| `targetType` | frozen on the event — `ON` / `OR` / `OC` / `CHAPTER` etc. |
| `targetCode` | `e.targetCode` |
| `targetTitle` | `e.targetTitle` |
| `targetVersion` | `e.targetVersion` — the version sequence integer |
| `versionId` | `id(v)` — `ItemVersion` node id, resolved in the same query via the `OPTIONAL MATCH` hop |
| `note` | `e.note` |
| `action`, `userId`, `userRole`, `timestamp`, `changeSetCode`, `changeSetTitle`, `classifier` | also present — the full frozen event |

Members are read from the audit log; the set's own title / status / classifier are on the `ChangeSet` node (its detail header), while each row's change context is frozen on the event.

---

## 5. Versioning Pattern

### 5.1 Dual-Node Structure

Versioned entities use two Neo4j node types:

```cypher
// Item node — stable identity
(item:OperationalRequirement {
    title: string,
    latest_version: integer     // cached current version number
})

// ItemVersion node — version-specific content (no audit stamps)
(version:OperationalRequirementVersion {
    version: integer,           // sequential: 1, 2, 3...
    type: string,
    statement: string,
    // ... all content fields
})

(item)-[:LATEST_VERSION]->(version)
(version)-[:VERSION_OF]->(item)
```

Audit (who/when/why) is **not** on these nodes — it is recorded on `AuditEvent` (§3.x). `createdAt`/`createdBy` have been removed from both item and version. The item carries **no** `status` field either — lifecycle state is expressed structurally by the presence of lifecycle edges and surfaced on reads as a computed `lifecycleStatus` object (§5.6).

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
    lifecycleStatus: { active: true, released: false, decommissioned: false, deleted: false }
}
```

### 5.3 Update Operation (New Version)

1. Validate `expectedVersionId` matches current `LATEST_VERSION` — reject with `StoreError` if not
2. Create new `ItemVersion` node (version + 1)
3. Move `LATEST_VERSION` pointer from old to new version
4. Write relationships from provided arrays — empty array clears, clear; non-empty array sets; raw relationship ID properties stripped from `versionData` before spread

### 5.4 Optimistic Locking

The client must supply `expectedVersionId` (the `versionId` of the version it last read). If another user has since updated the entity, the IDs will not match and the operation fails fast with a `StoreError`.

### 5.5 Audit Linkage (`AuditEvent`)

Every consequential write records an `AuditEvent` in the same transaction (§3.x), linked to its change set via `UNDER_CHANGESET`:

```cypher
(e:AuditEvent)-[:TARGETS]->(item)
(e:AuditEvent)-[:UNDER_CHANGESET]->(changeSet:ChangeSet)   // when change-set-bound
```

**Write path** — `create` and `update` take a `changeSetCommit = {changeSetId, note}` argument, separate from `data` (which carries entity state only). `_validateOpenChangeSet` fails fast if the set is missing or not `OPEN` **and returns a frozen `{code, title, classifier}` snapshot**; `_auditCommit` assembles the audit fragment; `auditEventStore.log(...)` writes the event. The change-set code/title/classifier are frozen onto the event at commit time, so a later rename or reclassification never leaves a stale member row. The lifecycle transitions (`softDelete` / `restore`, §5.6) audit through the same `auditEventStore.log(...)` call with their own action (`DELETE` / `RESTORE`); they do not create a new version.

**Read path** — there is no per-version reason resolution on common reads. Both the History feed and the change-set members feed read `AuditEventStore.findAll(filters)` — History with `{targetId}`, members with `{changeSetId}`. Both are on-demand and self-contained (every field frozen on the event).

> **Bootstrap:** `ChapterStore.createChapter` seeds version 1 directly (not through `VersionedItemStore.create`) and records **no** audit event — bootstrap chapters are config-owned scaffolding, not a consequential user write. Their audit trail begins at first edit. (Resolves the former "bootstrap system change set" open point: no system actor is invented, keeping `UserRole` to writer roles only.)

### 5.6 Lifecycle Model (edge-derived)

An item's lifecycle is expressed structurally by which lifecycle edge points at its version node — there is no stored `status` field. Four edges, all pointing item → version:

| Edge | Meaning |
|---|---|
| `LATEST_VERSION` | Active — the live, editable current version |
| `RELEASED_VERSION` | Released — in production (DEL-06, designed; not written this round) |
| `DECOMMISSIONED_VERSION` | Decommissioned — operationally retired (DEL-06, designed; not written this round) |
| `DELETED_VERSION` | Deleted — soft-deleted, in the recycle bin |

The four `LifecycleStatus` flags (`active` / `released` / `decommissioned` / `deleted`) are computed from edge presence (`EXISTS {}` checks) at read time — by `buildFindAllQuery` for list rows and by `_computeLifecycleStatus` for single-item reads. At most two co-occur (e.g. an item may be `active` and `released` simultaneously).

**Dataset selection.** In the live dataset, `lifecycleFace` (`active` default) chooses which edge anchors the read — the peer of `baselineId` and mutually exclusive with it. `LIFECYCLE_FACE_EDGE` maps the face value to its edge. A baseline context carries no live lifecycle face; `lifecycleFace` is ignored there.

**Transitions (this round).** `softDelete` and `restore` move the edge between `LATEST_VERSION` and `DELETED_VERSION` on the same version node — no new version is created — and record a `DELETE` / `RESTORE` `AuditEvent`. They enforce a lifecycle-state guard only (correct source edge present); the blocking-reference precondition (via `findInboundReferences`) is the service layer's responsibility. `release` / `decommission` / `hardDelete` are designed (DEL-06 / DEL-04) but not built this round.

---

## 6. Relationship Management

### 6.1 Relationship Direction Conventions

```cypher
// Setup hierarchies
(Child)-[:REFINES]->(Parent)

// Operational cross-references (from version node to item node)
(ORVersion)-[:REFINES]->(ORItem)
(ORVersion)-[:IMPACTS_STAKEHOLDER {note}]->(StakeholderCategory)
(ORVersion)-[:HAS_ACTING_STAKEHOLDER {note}]->(StakeholderCategory)
(ORVersion)-[:REFERENCES {note}]->(ReferenceDocument)
(ORVersion)-[:DEPENDS_ON]->(ORItem)
(ORVersion)-[:IMPLEMENTS]->(ORItem)   // OR → ON links

(OCVersion)-[:IMPLEMENTS]->(ORItem)
(OCVersion)-[:DECOMMISSIONS]->(ORItem)
(OCVersion)-[:DEPENDS_ON]->(OCItem)

// Versioning and lifecycle (item → version)
(item)-[:LATEST_VERSION]->(version)            // Active
(item)-[:RELEASED_VERSION]->(version)          // Released (DEL-06, designed)
(item)-[:DECOMMISSIONED_VERSION]->(version)    // Decommissioned (DEL-06, designed)
(item)-[:DELETED_VERSION]->(version)           // Deleted (soft delete)
(version)-[:VERSION_OF]->(item)

// Milestones
(Milestone)-[:BELONGS_TO]->(OCVersion)
(Milestone)-[:TARGETS]->(Wave)

// Management
(Baseline)-[:HAS_ITEMS {editions: [editionId, ...]}]->(ORVersion)
(Baseline)-[:HAS_ITEMS {editions: [editionId, ...]}]->(OCVersion)
(Baseline)-[:HAS_ITEMS {editions: [editionId, ...]}]->(ChapterVersion)
(ODIPEdition)-[:EXPOSES]->(Baseline)
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
| Edition | `baselineId` + `filters.editionId` | Returns baseline versions where `$editionId IN r.editions` on the `HAS_ITEMS` relationship |

### 7.2 Baseline Queries

At baseline creation, all current `LATEST_VERSION` pointers are captured atomically as `HAS_ITEMS` relationships:

```cypher
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE item:OperationalRequirement OR item:OperationalChange OR item:Chapter
CREATE (baseline)-[:HAS_ITEMS]->(version)
```

Historical queries use these direct pointers:

```cypher
// With baseline context
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
RETURN item, version
```

### 7.3 Edition Filtering

Edition content is pre-computed at edition creation time by `ODPEditionStore._computeEditionVersionIds()`. The algorithm marks matching `HAS_ITEMS` relationships by appending the edition ID to their `editions` array property. At query time, filtering is a single extra WHERE condition on the aliased relationship:

```cypher
MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId
  AND $editionId IN r.editions
```

`HAS_ITEMS` relationships with no `editions` property (created before any edition referenced the baseline) are treated as not belonging to any edition. Multiple editions per baseline are supported — each appends its own ID to the relevant subset of `HAS_ITEMS` relationships.

**Chapter exception:** the edition membership filter applies only to O* entities (ONs, ORs, OCs). All chapters are implicitly present in every edition — `_computeEditionVersionIds` does not mark chapter `HAS_ITEMS` relationships. `ChapterStore.findById` therefore drops the `editionId` before calling `super.findById`, using the baseline context alone to retrieve the snapshot version.

### 7.4 Edition Context Resolution

Edition context resolution happens in the **service layer** (`VersionedItemService`), not the route or store layer. The route extracts `req.query.edition` and passes it as `editionId` to `service.getAll()` or `service.getById()`. The service calls `odpEditionStore().resolveContext(editionId, tx)` within the same transaction to obtain `{baselineId, editionId}`, then passes `baselineId` as the positional argument and `editionId` via `filters.editionId` to the store.

The store has no knowledge of editions beyond the `$editionId IN r.editions` filter condition. `HAS_ITEMS` relationships carry an `editions` array property populated at edition creation time by `_computeEditionVersionIds()`.

```javascript
// Service layer (VersionedItemService.getAll)
if (editionId !== null) {
    const context = await odpEditionStore().resolveContext(editionId, tx);
    resolvedBaselineId = context.baselineId;
    resolvedFilters = { ...filters, editionId: context.editionId };
}
await store.findAll(tx, resolvedBaselineId, resolvedFilters, projection);

// Store layer (buildFindAllQuery, baseline path)
MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId
AND $editionId IN r.editions   ← only when edition context active
```

---

## 8. Transaction Design

### 8.1 Transaction Lifecycle (`transaction.js`)

The `Transaction` class wraps a Neo4j transaction and session. It exposes `run()`, `commit()`, and `rollback()`, and closes the session in a `finally` block regardless of outcome. Once completed (`isComplete = true`), any further `run()` call throws a `TransactionError`.

Transactions carry the actor as `userId` (via `getUserId()`) and `userRole` (via `getUserRole()`), used when writing audit events (`AuditEvent.userId` / `userRole`) and the `ChangeSet` `createdBy`/`closedBy` stamps. `userRole` is the `UserRole` key resolved by the auth layer when the transaction is opened; it is frozen onto each `AuditEvent`.

```javascript
// transaction.js exports
export function createTransaction(userId, userRole)  // → Transaction
export async function commitTransaction(tx)    // → void
export async function rollbackTransaction(tx)  // → void
```

### 8.2 Error Hierarchy (`transaction.js`)

```
StoreError          (base — message + cause)
└── TransactionError  (transaction lifecycle failures)
```

`StoreError` is also imported and thrown by store classes for data-level errors. `TransactionError` covers session/commit/rollback failures.

`StoreError` carries an optional third constructor argument, `code` (`constructor(message, cause = null, code = null)`), exposing `error.code`. It defaults to `null`, so existing two-argument throws are unaffected. The codes are declared once as a frozen `StoreErrorCode` constant alongside the class:

```javascript
export const StoreErrorCode = Object.freeze({
    CHANGESET_NOT_FOUND: 'CHANGESET_NOT_FOUND',
    CHANGESET_CLOSED: 'CHANGESET_CLOSED'
});
```

`code` is a stable, message-independent discriminator that the route layer switches on to choose an HTTP status (404 / 409), rather than matching on prose. It is distinct from the HTTP-facing `code` in the REST error envelope. Only change-set write failures are coded today; all other store errors leave `code` null and continue to be classified by message.

### 8.3 Connection Management (`connection.js`)

A singleton Neo4j driver is managed by `connection.js`. It initialises with retry logic (configurable `maxAttempts` and `intervalMs` from `config.json`) and exposes three functions:

```javascript
export async function initializeConnection()  // called once at server startup
export function getDriver()                   // used by createTransaction()
export async function closeConnection()       // called on server shutdown
```

The driver is configured with `maxConnectionPoolSize` and `connectionTimeout` from `config.json`. Stores are initialised once via `initializeStores()` in `store/index.js`. After store initialisation, `initializeDatabase()` (also in `store/index.js`) ensures the schema and config-driven DB entities exist — it first calls `_ensureConstraints()` (creates the `ChangeSet.code` uniqueness constraint, plus an index on `AuditEvent.timestamp` for the History ordering; all idempotent via `IF NOT EXISTS`, isolated in its own write transaction), then bootstraps `Chapter` nodes from `edition.json`. No `HAS_REASON` constraint exists or is dropped — that edge was never constrained. Both are called from `server/src/index.js` at startup. Stores are accessed through named accessor functions that throw if called before initialisation:

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
| Change set missing on write (changeSetId absent) | `StoreError` (`Validation failed:` message, no code) | `VersionedItemStore._validateOpenChangeSet` |
| Change set not found on write | `StoreError` (`code: CHANGESET_NOT_FOUND`) | `VersionedItemStore._validateOpenChangeSet` |
| Change set not OPEN on write | `StoreError` (`code: CHANGESET_CLOSED`) | `VersionedItemStore._validateOpenChangeSet` |
| Change set not found on close/reopen | `StoreError` | `ChangeSetStore` |
| Audit event target not found on log | `StoreError` | `AuditEventStore.log` |
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