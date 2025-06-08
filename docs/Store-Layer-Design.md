# Store Layer Design

## Overview
This document describes the design and architecture of the ODP Store Layer, which provides a clean abstraction over Neo4j graph database operations with support for item versioning, relationship management, and transactional integrity. The store layer implements a simplified design pattern focused on complete payload updates, relationship inheritance, and consistent Reference structures.

## Design Principles

### 1. Simplified API Design
- **Only two operations per item**: `create()` and `update()`
- **Complete payload approach**: All content and relationships provided in single operation
- **Abstract method pattern**: Base classes define interface, concrete stores implement specifics
- **Linear versioning**: Sequential version numbers (1, 2, 3...) without sub-versions

### 2. Reference Structure Consistency
- **Unified Reference objects**: All relationships return `{id, title, type?, name?}` objects
- **Consistent across all stores**: Same Reference pattern for setup and operational items
- **Input flexibility**: Accept ID arrays in input, return Reference objects in output
- **Context-aware fields**: Include relevant additional fields (type for requirements, name for setup items)

### 3. Relationship Inheritance
- **Automatic copying**: New versions inherit relationships from previous version by default
- **Override capability**: Provided relationship arrays replace inherited ones
- **Historical preservation**: Previous versions maintain their complete state
- **Version-specific ownership**: Each version owns its relationships and milestones

### 4. Transaction Boundaries
- **Single transaction per user action**: One operation = one transaction
- **Atomic operations**: Content + relationships + milestones in same transaction
- **Optimistic locking**: Version conflicts handled through expectedVersionId
- **User context**: All transactions carry user identification for audit trails

### 5. Clean Separation of Concerns
- **BaseStore**: Common CRUD operations
- **RefinableItemStore**: Hierarchy management for setup items
- **VersionedItemStore**: Version lifecycle management with abstract methods
- **Concrete stores**: Item-specific logic and relationship handling

## Architecture Overview

### Store Hierarchy
```
BaseStore (CRUD operations)
├── RefinableItemStore (+ REFINES hierarchy)
│   ├── StakeholderCategoryStore
│   ├── RegulatoryAspectStore
│   ├── DataCategoryStore
│   └── ServiceStore
└── VersionedItemStore (+ versioning + abstract methods)
    ├── OperationalRequirementStore (+ REFINES + IMPACTS)
    └── OperationalChangeStore (+ SATISFIES + SUPERSEDS + milestones)
```

### Data Flow Pattern
```
Client Request → Store Method → Neo4j Operations → Transaction Commit → Response
                      ↓
              User Context → Versioning → Relationship Management → Reference Building
```

## Reference Structure Design

### Core Reference Pattern
```javascript
// Base Reference structure
{
    id: number,           // Neo4j internal ID
        title: string         // Human-readable identifier
}

// Extended Reference with context-specific fields
{
    id: number,
        title: string,
    type?: string,        // For OperationalRequirements ('ON' | 'OR')
    name?: string,        // For setup items (alternative to title)
    year?: number,        // For Wave references
    quarter?: number      // For Wave references
}
```

### Reference Usage Patterns
**Input (create/update)**: ID arrays `[123, 456, 789]`
**Output (findById/findAll)**: Reference arrays `[{id: 123, title: "Title", type: "OR"}, ...]`
**Relationship queries**: Reference objects with context-appropriate fields

### Reference Building Helper
```javascript
// Available in VersionedItemStore base class
_buildReference(record, titleField = 'title') {
    const ref = {
        id: record.get('id').toNumber(),
        title: record.get(titleField)
    };

    // Add additional fields if present
    ['type', 'name', 'year', 'quarter'].forEach(field => {
        try {
            const value = record.get(field);
            if (value !== null && value !== undefined) {
                ref[field] = value;
            }
        } catch (e) {
            // Field not present - ignore
        }
    });

    return ref;
}
```

## Item Categories

### 1. Setup Items (Non-Versioned)
**Items**: StakeholderCategory, RegulatoryAspect, DataCategory, Service

**Characteristics**:
- Extend `RefinableItemStore`
- Simple CRUD operations via `BaseStore`
- REFINES hierarchy support (tree structure)
- No versioning complexity
- Immediate updates to existing nodes
- Return Reference objects in hierarchy queries

**Storage Pattern**:
```cypher
(Item:ItemType {id, name, description})
(Child:ItemType)-[:REFINES]->(Parent:ItemType)
```

**API Pattern**:
```javascript
// Standard CRUD with Reference returns
const item = await store.create({name, description}, tx);
const updated = await store.update(id, {name, description}, tx);

// Hierarchy management with Reference objects
await store.createRefinesRelation(childId, parentId, tx);
const children = await store.findChildren(parentId, tx);
// Returns: [{id, title: name}, ...]
```

### 2. Operational Items (Versioned)
**Items**: OperationalRequirement, OperationalChange

**Characteristics**:
- Extend `VersionedItemStore`
- Dual-node pattern (Item + ItemVersion)
- Complete payload updates with relationship inheritance
- Optimistic locking
- Return Reference objects for all relationships

**Storage Pattern**:
```cypher
(Item:ItemType {id, title, createdAt, createdBy, latest_version})
(Version:ItemTypeVersion {id, version, createdAt, createdBy, ...content})
(Item)-[:LATEST_VERSION]->(Version)
(Version)-[:VERSION_OF]->(Item)
(Version)-[:RELATIONSHIP_TYPE]->(Target)
```

**Versioning Lifecycle**:
1. **Create**: Item(v1) + Version(v1) + Relationships (return References)
2. **Update**: Keep Item + Create Version(v2) + Inherit/Update Relationships (return References)
3. **Query**: Latest version by default, specific version on request (return References)

## Abstract Method Pattern

### VersionedItemStore Abstract Interface
The base VersionedItemStore defines abstract methods that concrete stores must implement:

```javascript
// Extract relationship ID arrays from input data
_extractRelationshipIdsFromInput(data) {
    // Return: {relationshipIds: {...}, ...contentData}
}

// Build Reference objects from version for display
_buildRelationshipReferences(versionId, transaction) {
    // Return: {relationshipType: [Reference, ...], ...}
}

// Extract relationship ID arrays from existing version for inheritance
_extractRelationshipIdsFromVersion(versionId, transaction) {
    // Return: {relationshipType: [id, ...], ...}
}

// Create fresh relationships from ID arrays
_createRelationshipsFromIds(versionId, relationshipIds, transaction) {
    // Create all relationship types
}
```

### Implementation Strategy
**Concrete stores implement these methods to**:
- Extract their specific relationship types from input data as ID arrays
- Build appropriate Reference objects for their relationship queries
- Handle inheritance of their specific relationship patterns as ID arrays
- Create and validate their specific relationship types from ID arrays

## Versioning Design

### Dual-Node Pattern
**Item Node**: Persistent item identity
- `title`: User-facing identifier
- `createdAt`, `createdBy`: Creation metadata
- `latest_version`: Current version number

**ItemVersion Node**: Version-specific content
- `version`: Sequential number (1, 2, 3...)
- `createdAt`, `createdBy`: Version creation metadata
- All item-specific content fields

### Version Creation Process
```javascript
// 1. Extract relationships from input payload
const {relationshipIds, ...contentData} = await store._extractRelationshipIdsFromInput(data);

// 2. Validate optimistic lock
if (currentVersionId !== expectedVersionId) {
  throw new StoreError('Outdated item version');
}

// 3. Create new ItemVersion
const newVersion = currentVersion + 1;
const versionResult = await createItemVersion(newVersion, contentData);

// 4. Update Item metadata
await updateItem(itemId, {title, latest_version: newVersion});

// 5. Update Item-Version relationships
await updateLatestVersionRelationship();

// 6. Handle relationship inheritance/override
const finalRelationshipIds = hasRelationshipIds ? relationshipIds : inheritedRelationshipIds;

// 7. Create fresh relationships for new version
await store._createRelationshipsFromIds(versionId, finalRelationshipIds);

// 8. Return complete item with Reference objects
const completeItem = await store.findById(itemId, transaction);
```

### Optimistic Locking
- **Client responsibility**: Provide current `versionId` in update requests
- **Server validation**: Verify `expectedVersionId` matches current latest
- **Conflict resolution**: Client must refresh and retry on conflict
- **First-commit-wins**: No server-side merging or conflict resolution

### Relationship Inheritance Logic
```javascript
// In VersionedItemStore.update()
const currentRelationshipIds = await this._extractRelationshipIdsFromVersion(expectedVersionId, tx);
const providedRelationshipIds = (await this._extractRelationshipIdsFromInput(data)).relationshipIds;

let finalRelationshipIds;
if (this._hasAnyRelationshipIds(providedRelationshipIds)) {
  // Use provided relationships (override)
  finalRelationshipIds = providedRelationshipIds;
} else {
  // Inherit from previous version
  finalRelationshipIds = currentRelationshipIds;
}

await this._createRelationshipsFromIds(newVersionId, finalRelationshipIds, tx);
```

## Relationship Management

### Relationship Direction Patterns
**Setup Item Hierarchies**:
```cypher
(Child:ItemType)-[:REFINES]->(Parent:ItemType)
```

**Operational Item Cross-References**:
```cypher
(RequirementVersion)-[:REFINES]->(RequirementItem)
(RequirementVersion)-[:IMPACTS]->(SetupItem)
(ChangeVersion)-[:SATISFIES]->(RequirementItem)
(ChangeVersion)-[:SUPERSEDS]->(RequirementItem)
```

**Milestone Ownership**:
```cypher
(Milestone)-[:BELONGS_TO]->(ChangeVersion)
(Milestone)-[:TARGETS]->(Wave)
```

### Relationship Lifecycle with References
**Creation**: Relationships created with new versions, queries return References
```javascript
// Input: ID arrays
await createRelationshipsFromIds(versionId, {
  refinesParents: [123, 456],
  impactsServices: [789]
});

// Output: Reference objects
const result = await findById(itemId);
// result.refinesParents = [{id: 123, title: "Parent", type: "OR"}, ...]
// result.impactsServices = [{id: 789, title: "Service Name"}, ...]
```

**Updates**: New version gets fresh relationship set, returns References
```javascript
// Previous version keeps old relationships
// New version gets updated relationships from ID arrays
await createRelationshipsFromIds(newVersionId, updatedRelationshipIds);

// All queries return Reference objects
const updated = await findById(itemId);
// All relationship arrays contain Reference objects
```

**Historical Queries**: Version-specific relationship context with References
```cypher
// Latest relationships
MATCH (item)-[:LATEST_VERSION]->(version)-[:IMPACTS]->(target)
RETURN id(target) as id, target.name as title

// Historical relationships  
MATCH (item)<-[:VERSION_OF]-(version)-[:IMPACTS]->(target)
WHERE version.version = $specificVersion
RETURN id(target) as id, target.name as title
```

### Validation Patterns
**Reference Validation Helper**:
```javascript
// Available in VersionedItemStore
async _validateReferences(label, ids, transaction) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  
  const result = await transaction.run(`
    MATCH (item:${label}) 
    WHERE id(item) IN $ids
    RETURN count(item) as found
  `, { ids });
  
  const found = result.records[0].get('found').toNumber();
  if (found !== ids.length) {
    throw new StoreError(`One or more ${label} items do not exist`);
  }
}
```

**Self-Reference Prevention**:
```javascript
if (refinesParents.includes(itemId)) {
  throw new StoreError('Cannot create self-referencing relationship');
}
```

**Batch Relationship Creation with Reference Return**:
```javascript
// Create relationships
await transaction.run(`
  MATCH (version:VersionLabel) WHERE id(version) = $versionId
  UNWIND $targetIds as targetId
  MATCH (target:TargetLabel) WHERE id(target) = targetId  
  CREATE (version)-[:RELATIONSHIP_TYPE]->(target)
`);

// Query for Reference objects
const result = await transaction.run(`
  MATCH (version:VersionLabel)-[:RELATIONSHIP_TYPE]->(target:TargetLabel)
  WHERE id(version) = $versionId
  RETURN id(target) as id, target.name as title
  ORDER BY target.name
`);

return result.records.map(record => this._buildReference(record));
```

## Milestone Integration

### Design Philosophy
- **Version-specific ownership**: Milestones belong to specific OperationalChange versions
- **Fresh milestone creation**: Each version gets brand new milestone nodes (never shared)
- **Complete lifecycle management**: Milestones created/updated/deleted as part of OC updates
- **No independent milestone operations**: Always managed through OC context
- **Historical preservation**: Each version maintains its own milestone set with separate nodes
- **Reference structure**: Wave references follow same pattern as other relationships

### Storage Pattern
```cypher
(Milestone1:OperationalChangeMilestone {
  title, description, eventTypes
})
(Milestone1)-[:BELONGS_TO]->(ChangeVersion1)
(Milestone1)-[:TARGETS]->(Wave)  // Optional

// Version 2 gets fresh milestone nodes (even if same data)
(Milestone2:OperationalChangeMilestone {
  title, description, eventTypes  // Same data, different node
})
(Milestone2)-[:BELONGS_TO]->(ChangeVersion2)
(Milestone2)-[:TARGETS]->(Wave)  // Fresh relationship
```

### Milestone Lifecycle with References
**Creation with OC**:
```javascript
const change = await store.create({
  title: "Change",
  milestones: [
    { title: "M1", description: "...", eventTypes: [...], waveId: 123 }
  ]
}, tx);

// Returns milestones with Wave References
// change.milestones = [{
//   id: 456, title: "M1", description: "...", eventTypes: [...],
//   wave: {id: 123, title: "2025.Q1", year: 2025, quarter: 1}
// }]
```

**Update with Inheritance**:
```javascript
// If milestones not provided → copy milestone data from previous version, create new nodes
const currentMilestoneData = await getMilestoneDataFromVersion(previousVersionId);
const newMilestoneData = data.milestones || currentMilestoneData;
await createFreshMilestones(newVersionId, newMilestoneData);

// Returns milestones with full Reference objects including Wave
```

**Fresh Milestone Creation**:
```javascript
// Each version gets completely new milestone nodes
// _createFreshMilestones() always creates new nodes, never reuses
// Milestone data inherited, but nodes always fresh
// Complete audit trail: each version owns its milestone nodes
```

**Wave Targeting with References**:
```javascript
// Wave relationship returns Reference object
const milestones = await getMilestonesForVersion(versionId);
// Each milestone.wave = {id, title, year, quarter, date, name}
```

## Transaction Design

### Transaction Scope
**Single User Action**: One transaction per user operation
```javascript
const tx = createTransaction(userId);
try {
  // Complete operation: content + relationships + milestones
  // Returns item with Reference objects
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
  CREATE (version:ItemVersion {
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
- `'Item not found'` - Invalid itemId for versioned operations
- `'One or more [ItemType] items do not exist'` - Batch validation failure

## Performance Considerations

### Query Optimization
**Latest Version with References Pattern**:
```cypher
// Efficient latest version access with Reference building
MATCH (item:ItemType)-[:LATEST_VERSION]->(version:ItemTypeVersion)
WHERE id(item) = $itemId

// Get relationships with Reference data
OPTIONAL MATCH (version)-[:RELATIONSHIP_TYPE]->(target:TargetType)
RETURN item, version, 
       collect({id: id(target), title: target.name}) as targetReferences
```

**Batch Reference Building**:
```cypher
// Efficient Reference construction for multiple relationships
MATCH (version:ItemVersion)-[:IMPACTS]->(target:TargetType)
WHERE id(version) = $versionId
RETURN id(target) as id, target.name as title, target.type as type
ORDER BY target.name
```

### Connection Management
- **Driver pooling**: Single driver instance shared across stores
- **Connection reuse**: Efficient resource utilization
- **Transaction lifecycle**: Explicit commit/rollback patterns
- **Reference caching**: Build References efficiently during queries

### Indexing Strategy
**Recommended Indexes**:
```cypher
// Item lookups
CREATE INDEX item_id_idx FOR (n:ItemType) ON (id(n))

// Version navigation
CREATE INDEX version_number_idx FOR (v:ItemTypeVersion) ON (v.version)

// Latest version optimization  
CREATE INDEX latest_version_idx FOR ()-[r:LATEST_VERSION]-() ON (type(r))

// Reference building optimization
CREATE INDEX target_name_idx FOR (t:TargetType) ON (t.name)
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

### RefinableItemStore Pattern
**Additional Responsibilities**:
- REFINES hierarchy management
- Tree structure enforcement
- Parent/child navigation with References
- Root item queries

**Key Methods**:
```javascript
async createRefinesRelation(childId, parentId, transaction) // → boolean
async findChildren(parentId, transaction) // → Array<Reference>
async findParent(childId, transaction) // → Reference|null
```

### VersionedItemStore Pattern
**Additional Responsibilities**:
- Item/ItemVersion lifecycle
- Version numbering
- Optimistic locking
- Latest version management
- Abstract method interface
- Reference building utilities

**Key Methods**:
```javascript
async create(data, transaction) // → object with References
async update(itemId, data, expectedVersionId, transaction) // → new version with References
async findByIdAndVersion(itemId, versionNumber, transaction) // → specific version with References

// Abstract methods for concrete implementation
async _extractRelationshipIdsFromInput(data) // → {relationshipIds, ...contentData}
async _buildRelationshipReferences(versionId, transaction) // → Reference objects
async _extractRelationshipIdsFromVersion(versionId, transaction) // → ID arrays
async _createRelationshipsFromIds(versionId, relationshipIds, transaction) // → void

// Helper methods
_buildReference(record, titleField) // → Reference object
async _validateReferences(label, ids, transaction) // → void
_hasAnyRelationshipIds(relationshipIds) // → boolean
```

### Concrete Store Pattern
**Additional Responsibilities**:
- Item-specific relationships
- Complete payload handling
- Relationship inheritance
- Domain validation
- Reference construction for specific item types

**Implementation Strategy**:
```javascript
// Implement abstract methods for specific item type
_extractRelationshipIdsFromInput(data) {
    const {refinesParents, impactsServices, ...contentData} = data;
    return {
        relationshipIds: {refinesParents, impactsServices},
        ...contentData
    };
}

_buildRelationshipReferences(versionId, transaction) {
    // Query for relationships and build Reference objects
    const refinesResult = await transaction.run(queryForRefines);
    const refinesParents = refinesResult.records.map(r => this._buildReference(r));

    const impactsResult = await transaction.run(queryForImpacts);
    const impactsServices = impactsResult.records.map(r => this._buildReference(r));

    return {refinesParents, impactsServices};
}

// Leverage parent class for core functionality
async create(data, transaction) {
    return super.create(data, transaction); // Returns item with References
}
```

## Design Benefits

### Simplified Mental Model
- **Two operations only**: create() and update()
- **Complete state**: Each version contains full item state with References
- **Predictable behavior**: Consistent patterns across all items
- **Clear ownership**: Each version owns its complete state

### Reference Consistency
- **Unified structure**: Same Reference pattern across all relationship types
- **Context awareness**: Additional fields based on relationship context
- **Display ready**: Reference objects ready for UI consumption
- **Navigation support**: References enable cross-item navigation

### Historical Integrity
- **Complete preservation**: All versions maintain full state with References
- **Relationship history**: Version-specific relationship sets with References
- **Milestone history**: Version-specific milestone ownership
- **Baseline support**: Exact state capture at any point with References

### Development Efficiency
- **Consistent patterns**: Same approach for all versioned items
- **Reduced complexity**: No separate relationship management
- **Clear errors**: Specific error messages for common scenarios
- **Easy testing**: Single transaction per operation with Reference validation

### Operational Benefits
- **Atomic operations**: Complete consistency within transactions
- **Conflict resolution**: Clear optimistic locking semantics
- **Audit capability**: Complete change history preservation
- **Performance**: Efficient latest version access patterns with Reference building

## Future Extensions

### Baseline Support
The storage design directly supports baseline creation with References:
```javascript
// Capture exact state at baseline time with Reference objects
const baselineItems = await captureCurrentVersions(tx);
const baselineRelationships = await captureCurrentRelationshipsAsReferences(tx);
```

### Advanced Queries
The version structure supports complex historical queries with References:
```javascript
// Item state at specific time with References
const stateAtTime = await findByIdAndVersion(itemId, versionAtTime, tx);

// Relationship evolution between versions with References
const relationshipChanges = await compareVersionRelationships(v1, v2, tx);
```

### Performance Optimization
- **Materialized Reference views**: Pre-built Reference objects for common queries
- **Relationship indexing**: Optimized traversal paths for Reference building
- **Batch Reference operations**: Bulk Reference construction and validation

This store layer design provides a robust, scalable foundation for the ODP system with clear patterns for item management, versioning, and relationship handling while maintaining simplicity, consistency, and Reference structure uniformity across all operations.