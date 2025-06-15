# Storage Layer Design

## Overview
This document describes the design and architecture of the ODP Storage Layer, which provides a clean abstraction over Neo4j graph database operations with support for entity versioning, relationship management, baseline-aware operations, and transactional integrity. The storage layer implements a simplified design pattern focused on complete payload updates and relationship inheritance.

## Design Principles

### 1. Simplified API Design
- **Only two operations per entity**: `create()` and `update()`
- **Complete payload approach**: All content and relationships provided in single operation
- **No separate relationship methods**: Relationships managed as part of entity state
- **Linear versioning**: Sequential version numbers (1, 2, 3...) without sub-versions
- **Baseline-aware operations**: Optional baseline context for historical queries

### 2. Relationship Inheritance
- **Automatic copying**: New versions inherit relationships from previous version by default
- **Override capability**: Provided relationship arrays replace inherited ones
- **Historical preservation**: Previous versions maintain their complete state
- **Version-specific ownership**: Each version owns its relationships and milestones
- **Baseline consistency**: Baseline queries return exact relationship state at capture time

### 3. Transaction Boundaries
- **Single transaction per user action**: One operation = one transaction
- **Atomic operations**: Content + relationships + milestones in same transaction
- **Optimistic locking**: Version conflicts handled through expectedVersionId
- **User context**: All transactions carry user identification for audit trails
- **Atomic baseline creation**: Complete system snapshot in single transaction

### 4. Clean Separation of Concerns
- **BaseStore**: Common CRUD operations
- **RefinableEntityStore**: Hierarchy management for setup entities
- **VersionedItemStore**: Version lifecycle management with baseline support
- **ODPBaselineStore**: Baseline creation and management
- **Concrete stores**: Entity-specific logic and relationship handling

## Architecture Overview

### Store Hierarchy
```
BaseStore (CRUD operations + normalizeId)
├── RefinableEntityStore (+ REFINES hierarchy)
│   ├── StakeholderCategoryStore
│   ├── RegulatoryAspectStore
│   ├── DataCategoryStore
│   └── ServiceStore
├── WaveStore (simple entity)
├── ODPBaselineStore (baseline management)
└── VersionedItemStore (+ versioning + baseline-aware)
    ├── OperationalRequirementStore (+ REFINES + IMPACTS)
    └── OperationalChangeStore (+ SATISFIES + SUPERSEDS + milestones)
```

### Data Flow Pattern
```
Client Request → Store Method → Neo4j Operations → Transaction Commit → Response
                      ↓
              User Context → Versioning → Relationship Management → Baseline Context
```

## Entity Categories

### 1. Setup Entities (Non-Versioned)
**Entities**: StakeholderCategory, RegulatoryAspect, DataCategory, Service, Wave

**Characteristics**:
- Extend `BaseStore` (Wave) or `RefinableEntityStore` (others)
- Simple CRUD operations via `BaseStore`
- REFINES hierarchy support (tree structure) for refinable entities
- No versioning complexity
- Immediate updates to existing nodes
- No baseline context needed (current state only)

**Storage Pattern**:
```cypher
(Entity:EntityType {id, name, description})
(Child:EntityType)-[:REFINES]->(Parent:EntityType)  // For refinable entities
```

**API Pattern**:
```javascript
// Standard CRUD
const entity = await store.create({name, description}, tx);
const updated = await store.update(id, {name, description}, tx);

// Hierarchy management (refinable entities only)
await store.createRefinesRelation(childId, parentId, tx);
const children = await store.findChildren(parentId, tx);
```

### 2. Operational Entities (Versioned)
**Entities**: OperationalRequirement, OperationalChange

**Characteristics**:
- Extend `VersionedItemStore`
- Dual-node pattern (Item + ItemVersion)
- Complete payload updates
- Relationship inheritance
- Optimistic locking
- **Baseline-aware operations**: Support historical context via baseline queries

**Storage Pattern**:
```cypher
(Item:EntityType {id, title, createdAt, createdBy, latest_version})
(Version:EntityTypeVersion {id, version, createdAt, createdBy, ...content})
(Item)-[:LATEST_VERSION]->(Version)
(Version)-[:VERSION_OF]->(Item)
(Version)-[:RELATIONSHIP_TYPE]->(Target)
(Baseline)-[:HAS_ITEMS]->(Version)  // Baseline capture
```

**Versioning Lifecycle**:
1. **Create**: Item(v1) + Version(v1) + Relationships
2. **Update**: Keep Item + Create Version(v2) + Copy/Update Relationships
3. **Query**: Latest version by default, specific version on request, baseline version when baseline context provided

### 3. Baseline Entities
**Entities**: ODPBaseline

**Characteristics**:
- Extend `BaseStore`
- Immutable once created (create and read only)
- Atomic snapshot creation
- Direct relationships to captured versions
- No versioning (baselines themselves are not versioned)

**Storage Pattern**:
```cypher
(Baseline:ODPBaseline {id, title, createdAt, createdBy})
(Baseline)-[:HAS_ITEMS]->(OperationalRequirementVersion)
(Baseline)-[:HAS_ITEMS]->(OperationalChangeVersion)
(Baseline)-[:STARTS_FROM]->(Wave)  // Optional
```

## Versioning Design

### Dual-Node Pattern
**Item Node**: Persistent entity identity
- `title`: User-facing identifier
- `createdAt`, `createdBy`: Creation metadata
- `latest_version`: Current version number

**ItemVersion Node**: Version-specific content
- `version`: Sequential number (1, 2, 3...)
- `createdAt`, `createdBy`: Version creation metadata
- All entity-specific content fields

### Version Creation Process
```javascript
// 1. Validate optimistic lock
if (currentVersionId !== expectedVersionId) {
  throw new StoreError('Outdated item version');
}

// 2. Create new ItemVersion
const newVersion = currentVersion + 1;
const versionResult = await createItemVersion(newVersion, content);

// 3. Update Item metadata
await updateItem(itemId, { title, latest_version: newVersion });

// 4. Update relationships
await deleteOldLatestVersionRelationship();
await createNewLatestVersionRelationship();

// 5. Create entity relationships (inherited or new)
await createEntityRelationships(versionId, relationships);
```

### Optimistic Locking
- **Client responsibility**: Provide current `versionId` in update requests
- **Server validation**: Verify `expectedVersionId` matches current latest
- **Conflict resolution**: Client must refresh and retry on conflict
- **First-commit-wins**: No server-side merging or conflict resolution

### Relationship Inheritance
**Default Behavior**: Copy relationships from previous version
```javascript
const currentRelationships = await getCurrentRelationships(previousVersionId);
const newRelationships = {
  refinesParents: data.refinesParents || currentRelationships.refinesParents,
  impactsServices: data.impactsServices || currentRelationships.impactsServices
  // ... other relationship types
};
```

**Override Behavior**: Replace with provided relationships
```javascript
// User provides relationship arrays → use as-is
const newRelationships = {
  refinesParents: data.refinesParents,  // Explicit override
  impactsServices: data.impactsServices  // Explicit override
};
```

## Baseline-Aware Operations Design

### Baseline Context Pattern
All versioned entity read operations support optional baseline context:

```javascript
// Latest version (current state)
const current = await store.findById(itemId, transaction);

// Version captured in baseline (historical state)
const historical = await store.findById(itemId, transaction, baselineId);

// All latest versions
const allCurrent = await store.findAll(transaction);

// All versions captured in baseline
const allHistorical = await store.findAll(transaction, baselineId);
```

### Query Resolution Strategy
**Without baseline context**:
```cypher
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE id(item) = $itemId
RETURN version
```

**With baseline context**:
```cypher
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
RETURN version
```

### Relationship Query Adaptation
**Current relationships**:
```cypher
MATCH (item)-[:LATEST_VERSION]->(version)-[:IMPACTS]->(target)
RETURN target
```

**Baseline relationships**:
```cypher
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)-[:LATEST_VERSION]->(currentVersion)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
MATCH (version)-[:IMPACTS]->(target)
RETURN target
```

### Baseline Creation Process
**Atomic Snapshot Creation**:
```javascript
// 1. Create baseline node
const baseline = await createBaseline(title, userId, transaction);

// 2. Capture all latest versions
const captureQuery = `
  MATCH (item)-[:LATEST_VERSION]->(version)
  WHERE item:OperationalRequirement OR item:OperationalChange
  MATCH (baseline) WHERE id(baseline) = $baselineId
  CREATE (baseline)-[:HAS_ITEMS]->(version)
  RETURN count(version) as capturedCount
`;

// 3. Optional wave relationship
if (startsFromWaveId) {
  await createStartsFromRelationship(baselineId, startsFromWaveId, transaction);
}
```

## Relationship Management

### Relationship Direction Patterns
**Setup Entity Hierarchies**:
```cypher
(Child:EntityType)-[:REFINES]->(Parent:EntityType)
```

**Operational Entity Cross-References**:
```cypher
(RequirementVersion)-[:REFINES]->(RequirementItem)
(RequirementVersion)-[:IMPACTS]->(SetupEntity)
(ChangeVersion)-[:SATISFIES]->(RequirementItem)
(ChangeVersion)-[:SUPERSEDS]->(RequirementItem)
```

**Milestone Ownership**:
```cypher
(Milestone)-[:BELONGS_TO]->(ChangeVersion)
(Milestone)-[:TARGETS]->(Wave)
```

**Baseline Capture**:
```cypher
(Baseline)-[:HAS_ITEMS]->(OperationalRequirementVersion)
(Baseline)-[:HAS_ITEMS]->(OperationalChangeVersion)
(Baseline)-[:STARTS_FROM]->(Wave)
```

### Relationship Lifecycle
**Creation**: Relationships created with new versions
```javascript
await createRelationships(versionId, {
  refinesParents: [123, 456],
  impactsServices: [789]
});
```

**Updates**: New version gets fresh relationship set
```javascript
// Previous version keeps old relationships
// New version gets updated relationships
await createRelationships(newVersionId, updatedRelationships);
```

**Historical Queries**: Version-specific relationship context
```cypher
// Latest relationships
MATCH (item)-[:LATEST_VERSION]->(version)-[:IMPACTS]->(target)

// Historical relationships  
MATCH (item)<-[:VERSION_OF]-(version)-[:IMPACTS]->(target)
WHERE version.version = $specificVersion

// Baseline relationships
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:IMPACTS]->(target)
WHERE id(baseline) = $baselineId
```

### Validation Patterns
**Entity Existence**:
```javascript
const entityCheck = await transaction.run(`
  MATCH (entity:EntityType) WHERE id(entity) IN $entityIds
  RETURN count(entity) as found
`);
if (found !== entityIds.length) {
  throw new StoreError('One or more entities do not exist');
}
```

**Self-Reference Prevention**:
```javascript
if (refinesParents.includes(itemId)) {
  throw new StoreError('Cannot create self-referencing relationship');
}
```

**Baseline Existence**:
```javascript
if (baselineId !== null) {
  const baselineExists = await checkBaselineExists(baselineId, transaction);
  if (!baselineExists) {
    throw new StoreError('Baseline not found');
  }
}
```

**Batch Relationship Creation**:
```javascript
await transaction.run(`
  MATCH (version:VersionLabel) WHERE id(version) = $versionId
  UNWIND $targetIds as targetId
  MATCH (target:TargetLabel) WHERE id(target) = targetId  
  CREATE (version)-[:RELATIONSHIP_TYPE]->(target)
`);
```

## Milestone Integration

### Design Philosophy
- **Version-specific ownership**: Milestones belong to specific OperationalChange versions
- **Complete lifecycle management**: Milestones created/updated/deleted as part of OC updates
- **No independent milestone operations**: Always managed through OC context
- **Historical preservation**: Each version maintains its own milestone set
- **Baseline consistency**: Baseline queries return milestones as they existed at capture time

### Storage Pattern
```cypher
(Milestone:OperationalChangeMilestone {
  title, description, eventTypes
})
(Milestone)-[:BELONGS_TO]->(ChangeVersion)
(Milestone)-[:TARGETS]->(Wave)  // Optional
```

### Milestone Lifecycle
**Creation with OC**:
```javascript
const change = await store.create({
  title: "Change",
  milestones: [
    { title: "M1", description: "...", eventTypes: [...], waveId: 123 }
  ]
}, tx);
```

**Update with Inheritance**:
```javascript
// If milestones not provided → copy from previous version
const currentMilestones = await getMilestonesForVersion(previousVersionId);
const newMilestones = data.milestones || currentMilestones;
await createMilestones(newVersionId, newMilestones);
```

**Baseline Milestone Queries**:
```javascript
// Current milestones
const currentMilestones = await store.findById(changeId, tx);

// Milestones as they were at baseline time
const baselineMilestones = await store.findById(changeId, tx, baselineId);
```

**Wave Targeting**:
```javascript
// Optional wave relationship per milestone
if (milestone.waveId) {
  await transaction.run(`
    MATCH (milestone), (wave:Wave)
    WHERE id(milestone) = $milestoneId AND id(wave) = $waveId
    CREATE (milestone)-[:TARGETS]->(wave)
  `);
}
```

## Transaction Design

### Transaction Scope
**Single User Action**: One transaction per user operation
```javascript
const tx = createTransaction(userId);
try {
  // Complete operation: content + relationships + milestones
  const result = await store.update(itemId, completePayload, expectedVersionId, tx);
  await commitTransaction(tx);
  return result;
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

**Atomic Baseline Creation**: Complete system snapshot
```javascript
const tx = createTransaction(userId);
try {
  // 1. Create baseline
  // 2. Capture all latest OR/OC versions
  // 3. Create wave relationship if specified
  const baseline = await odpBaselineStore().create(baselineData, tx);
  await commitTransaction(tx);
  return baseline;
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

### User Context Integration
**Transaction Creation**:
```javascript
export class Transaction {
  constructor(neo4jTransaction, userId) {
    this.neo4jTransaction = neo4jTransaction;
    this.userId = userId;
  }
  
  getUserId() { return this.userId; }
}
```

**Usage in Store Operations**:
```javascript
const userId = transaction.getUserId();
const timestamp = new Date().toISOString();

await transaction.run(`
  CREATE (version:EntityVersion {
    createdBy: $userId,
    createdAt: $timestamp,
    ...
  })
`, { userId, timestamp });
```

### Error Handling Strategy
**StoreError Hierarchy**:
```javascript
class StoreError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'StoreError';
    this.cause = cause;
  }
}
```

**Error Wrapping Pattern**:
```javascript
try {
  const result = await neo4jOperation();
  return result;
} catch (error) {
  if (error instanceof StoreError) throw error;
  throw new StoreError(`Operation failed: ${error.message}`, error);
}
```

**Common Error Scenarios**:
- `'Outdated item version'` - Optimistic locking conflict
- `'Referenced nodes do not exist'` - Invalid relationship targets
- `'Node cannot refine itself'` - Self-reference prevention
- `'Item not found'` - Invalid itemId for versioned operations
- `'Baseline not found'` - Invalid baselineId for baseline-aware operations

## Performance Considerations

### Query Optimization
**Latest Version Pattern**:
```cypher
// Efficient latest version access
MATCH (item:EntityType)-[:LATEST_VERSION]->(version:EntityTypeVersion)
WHERE id(item) = $itemId
RETURN item, version
```

**Baseline Version Pattern**:
```cypher
// Efficient baseline version access
MATCH (baseline:ODPBaseline)-[:HAS_ITEMS]->(version:EntityTypeVersion)-[:VERSION_OF]->(item:EntityType)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
RETURN item, version
```

**Batch Operations**:
```cypher
// Efficient relationship creation
UNWIND $relationships as rel
MATCH (source), (target)
WHERE id(source) = rel.sourceId AND id(target) = rel.targetId
CREATE (source)-[:REL_TYPE]->(target)
```

**Baseline Creation Optimization**:
```cypher
// Efficient baseline capture
MATCH (baseline:ODPBaseline), (item)-[:LATEST_VERSION]->(version)
WHERE id(baseline) = $baselineId 
  AND (item:OperationalRequirement OR item:OperationalChange)
CREATE (baseline)-[:HAS_ITEMS]->(version)
RETURN count(version) as capturedCount
```

### Connection Management
- **Driver pooling**: Single driver instance shared across stores
- **Connection reuse**: Efficient resource utilization
- **Transaction lifecycle**: Explicit commit/rollback patterns

### Indexing Strategy
**Recommended Indexes**:
```cypher
// Entity lookups
CREATE INDEX entity_id_idx FOR (n:EntityType) ON (id(n))

// Version navigation
CREATE INDEX version_number_idx FOR (v:EntityTypeVersion) ON (v.version)

// Latest version optimization  
CREATE INDEX latest_version_idx FOR ()-[r:LATEST_VERSION]-() ON (type(r))

// Baseline optimization
CREATE INDEX baseline_items_idx FOR ()-[r:HAS_ITEMS]-() ON (type(r))
```

## Store Implementation Patterns

### BaseStore Pattern
**Responsibilities**:
- Core CRUD operations
- Neo4j result transformation
- Common validation
- Error handling consistency
- ID normalization for consistent comparisons

**Key Methods**:
```javascript
async create(data, transaction) // → object
async findById(id, transaction) // → object|null  
async update(id, data, transaction) // → object|null
async delete(id, transaction) // → boolean
normalizeId(id) // → number
```

### RefinableEntityStore Pattern
**Additional Responsibilities**:
- REFINES hierarchy management
- Tree structure enforcement
- Parent/child navigation
- Root entity queries

**Key Methods**:
```javascript
async createRefinesRelation(childId, parentId, transaction) // → boolean
async findChildren(parentId, transaction) // → Array<object>
async findParent(childId, transaction) // → object|null
```

### VersionedItemStore Pattern
**Additional Responsibilities**:
- Item/ItemVersion lifecycle
- Version numbering
- Optimistic locking
- Latest version management
- **Baseline-aware operations**: Historical context support

**Key Methods**:
```javascript
async create(data, transaction) // → object with version info
async update(itemId, data, expectedVersionId, transaction) // → new version
async findById(itemId, transaction, baselineId = null) // → version with baseline context
async findAll(transaction, baselineId = null) // → versions with baseline context
async findByIdAndVersion(itemId, versionNumber, transaction) // → specific version
```

### ODPBaselineStore Pattern
**Additional Responsibilities**:
- Atomic baseline creation
- System state capture
- Immutable baseline management
- Wave relationship handling

**Key Methods**:
```javascript
async create(data, transaction) // → baseline with captured count
async findById(id, transaction) // → baseline with metadata
async getBaselineItems(baselineId, transaction) // → captured versions
// No update/delete operations (immutable)
```

### Concrete Store Pattern
**Additional Responsibilities**:
- Entity-specific relationships
- Complete payload handling
- Relationship inheritance
- Domain validation
- **Baseline context handling**: Proper query routing for historical vs current state

**Implementation Strategy**:
```javascript
async findById(itemId, transaction, baselineId = null) {
  if (baselineId) {
    // Query version captured in baseline
    return await this._findByIdInBaseline(itemId, baselineId, transaction);
  } else {
    // Query latest version
    return await this._findLatestById(itemId, transaction);
  }
}

async update(itemId, data, expectedVersionId, transaction) {
  // 1. Extract relationships from payload
  const { relationships, ...content } = data;
  
  // 2. Get current relationships for inheritance
  const currentRelationships = await this._getCurrentRelationships(expectedVersionId);
  
  // 3. Create new version with content
  const newVersion = await super.update(itemId, content, expectedVersionId, transaction);
  
  // 4. Apply relationship inheritance + overrides
  const finalRelationships = this._mergeRelationships(currentRelationships, relationships);
  
  // 5. Create relationships for new version
  await this._createRelationships(newVersion.versionId, finalRelationships, transaction);
  
  return { ...newVersion, ...finalRelationships };
}
```

## Design Benefits

### Simplified Mental Model
- **Two operations only**: create() and update()
- **Complete state**: Each version contains full entity state
- **Predictable behavior**: Consistent patterns across all entities
- **Clear ownership**: Each version owns its complete state
- **Historical clarity**: Baseline context provides exact historical state

### Historical Integrity
- **Complete preservation**: All versions maintain full state
- **Relationship history**: Version-specific relationship sets
- **Milestone history**: Version-specific milestone ownership
- **Baseline support**: Exact state capture at any point
- **Simplified querying**: Direct baseline-to-version relationships

### Development Efficiency
- **Consistent patterns**: Same approach for all versioned entities
- **Reduced complexity**: No separate relationship management
- **Clear errors**: Specific error messages for common scenarios
- **Easy testing**: Single transaction per operation
- **Baseline transparency**: Same API with optional baseline context

### Operational Benefits
- **Atomic operations**: Complete consistency within transactions
- **Conflict resolution**: Clear optimistic locking semantics
- **Audit capability**: Complete change history preservation
- **Performance**: Efficient latest version access patterns
- **Deployment planning**: Reliable baseline management for release planning

## Future Extensions

### Advanced Baseline Features
The storage design supports advanced baseline capabilities:
```javascript
// Compare baselines
const comparison = await compareBaselines(baseline1Id, baseline2Id, tx);

// Baseline lineage tracking
const parentBaseline = await findBaselineParent(baselineId, tx);

// Baseline impact analysis
const changedItems = await findChangedSinceBaseline(baselineId, tx);
```

### Advanced Queries
The version structure supports complex historical queries:
```javascript
// Entity state at specific time
const stateAtTime = await findByIdAndVersion(itemId, versionAtTime, tx);

// Relationship evolution between versions
const relationshipChanges = await compareVersionRelationships(v1, v2, tx);

// Cross-baseline analysis
const crossBaselineChanges = await analyzeChangesBetweenBaselines(b1, b2, tx);
```

### Performance Optimization
- **Materialized views**: Latest version caching
- **Relationship indexing**: Optimized traversal paths
- **Batch operations**: Bulk relationship management
- **Baseline indexing**: Fast baseline content access

This storage layer design provides a robust, scalable foundation for the ODP system with clear patterns for entity management, versioning, relationship handling, and baseline management while maintaining simplicity and consistency across all operations.