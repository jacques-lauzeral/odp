# Storage Layer Design

## Overview
This document describes the design and architecture of the ODP Storage Layer, which provides a clean abstraction over Neo4j graph database operations with support for entity versioning, relationship management, and transactional integrity. The storage layer implements a simplified design pattern focused on complete payload updates and relationship inheritance.

## Design Principles

### 1. Simplified API Design
- **Only two operations per entity**: `create()` and `update()`
- **Complete payload approach**: All content and relationships provided in single operation
- **No separate relationship methods**: Relationships managed as part of entity state
- **Linear versioning**: Sequential version numbers (1, 2, 3...) without sub-versions

### 2. Relationship Inheritance
- **Automatic copying**: New versions inherit relationships from previous version by default
- **Override capability**: Provided relationship arrays replace inherited ones
- **Historical preservation**: Previous versions maintain their complete state
- **Version-specific ownership**: Each version owns its relationships and milestones

### 3. Transaction Boundaries
- **Single transaction per user action**: One operation = one transaction
- **Atomic operations**: Content + relationships + milestones in same transaction
- **Optimistic locking**: Version conflicts handled through expectedVersionId
- **User context**: All transactions carry user identification for audit trails

### 4. Clean Separation of Concerns
- **BaseStore**: Common CRUD operations
- **RefinableEntityStore**: Hierarchy management for setup entities
- **VersionedItemStore**: Version lifecycle management
- **Concrete stores**: Entity-specific logic and relationship handling

## Architecture Overview

### Store Hierarchy
```
BaseStore (CRUD operations)
├── RefinableEntityStore (+ REFINES hierarchy)
│   ├── StakeholderCategoryStore
│   ├── RegulatoryAspectStore
│   ├── DataCategoryStore
│   └── ServiceStore
└── VersionedItemStore (+ versioning)
    ├── OperationalRequirementStore (+ REFINES + IMPACTS)
    └── OperationalChangeStore (+ SATISFIES + SUPERSEDS + milestones)
```

### Data Flow Pattern
```
Client Request → Store Method → Neo4j Operations → Transaction Commit → Response
                      ↓
              User Context → Versioning → Relationship Management
```

## Entity Categories

### 1. Setup Entities (Non-Versioned)
**Entities**: StakeholderCategory, RegulatoryAspect, DataCategory, Service

**Characteristics**:
- Extend `RefinableEntityStore`
- Simple CRUD operations via `BaseStore`
- REFINES hierarchy support (tree structure)
- No versioning complexity
- Immediate updates to existing nodes

**Storage Pattern**:
```cypher
(Entity:EntityType {id, name, description})
(Child:EntityType)-[:REFINES]->(Parent:EntityType)
```

**API Pattern**:
```javascript
// Standard CRUD
const entity = await store.create({name, description}, tx);
const updated = await store.update(id, {name, description}, tx);

// Hierarchy management
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

**Storage Pattern**:
```cypher
(Item:EntityType {id, title, createdAt, createdBy, latest_version})
(Version:EntityTypeVersion {id, version, createdAt, createdBy, ...content})
(Item)-[:LATEST_VERSION]->(Version)
(Version)-[:VERSION_OF]->(Item)
(Version)-[:RELATIONSHIP_TYPE]->(Target)
```

**Versioning Lifecycle**:
1. **Create**: Item(v1) + Version(v1) + Relationships
2. **Update**: Keep Item + Create Version(v2) + Copy/Update Relationships
3. **Query**: Latest version by default, specific version on request

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

## Performance Considerations

### Query Optimization
**Latest Version Pattern**:
```cypher
// Efficient latest version access
MATCH (item:EntityType)-[:LATEST_VERSION]->(version:EntityTypeVersion)
WHERE id(item) = $itemId
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
```

## Store Implementation Patterns

### BaseStore Pattern
**Responsibilities**:
- Core CRUD operations
- Neo4j result transformation
- Common validation
- Error handling consistency

**Key Methods**:
```javascript
async create(data, transaction) // → object
async findById(id, transaction) // → object|null  
async update(id, data, transaction) // → object|null
async delete(id, transaction) // → boolean
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

**Key Methods**:
```javascript
async create(data, transaction) // → object with version info
async update(itemId, data, expectedVersionId, transaction) // → new version
async findByIdAndVersion(itemId, versionNumber, transaction) // → specific version
```

### Concrete Store Pattern
**Additional Responsibilities**:
- Entity-specific relationships
- Complete payload handling
- Relationship inheritance
- Domain validation

**Implementation Strategy**:
```javascript
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

### Historical Integrity
- **Complete preservation**: All versions maintain full state
- **Relationship history**: Version-specific relationship sets
- **Milestone history**: Version-specific milestone ownership
- **Baseline support**: Exact state capture at any point

### Development Efficiency
- **Consistent patterns**: Same approach for all versioned entities
- **Reduced complexity**: No separate relationship management
- **Clear errors**: Specific error messages for common scenarios
- **Easy testing**: Single transaction per operation

### Operational Benefits
- **Atomic operations**: Complete consistency within transactions
- **Conflict resolution**: Clear optimistic locking semantics
- **Audit capability**: Complete change history preservation
- **Performance**: Efficient latest version access patterns

## Future Extensions

### Baseline Support
The storage design directly supports baseline creation:
```javascript
// Capture exact state at baseline time
const baselineItems = await captureCurrentVersions(tx);
const baselineRelationships = await captureCurrentRelationships(tx);
```

### Advanced Queries
The version structure supports complex historical queries:
```javascript
// Entity state at specific time
const stateAtTime = await findByIdAndVersion(itemId, versionAtTime, tx);

// Relationship evolution between versions
const relationshipChanges = await compareVersionRelationships(v1, v2, tx);
```

### Performance Optimization
- **Materialized views**: Latest version caching
- **Relationship indexing**: Optimized traversal paths
- **Batch operations**: Bulk relationship management

This storage layer design provides a robust, scalable foundation for the ODP system with clear patterns for entity management, versioning, and relationship handling while maintaining simplicity and consistency across all operations.