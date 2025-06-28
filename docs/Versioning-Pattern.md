# Versioning Pattern Implementation

## Overview
The ODP system implements a sequential versioning pattern for operational entities using a dual-node approach (Item + ItemVersion) in Neo4j. This pattern provides both live relationship evolution and historical consistency through explicit version management and optimistic locking.

## Implementation Architecture

### Dual-Node Pattern
```
Item (Root Node)                    ItemVersion (Version Node)
├── id (Neo4j internal ID)         ├── id (Neo4j internal ID)  
├── title (frequently accessed)     ├── version (sequential number)
├── createdAt, createdBy           ├── createdAt, createdBy
├── latest_version (current #)      ├── content (versioned payload)
└── LATEST_VERSION → ItemVersion   └── VERSION_OF → Item
```

### Concrete Implementation
```javascript
// Item node properties
{
  title: "Requirement Title",
  createdAt: "2025-01-15T10:30:00Z",
  createdBy: "user123",
  latest_version: 3
}

// ItemVersion node properties  
{
  version: 3,
  createdAt: "2025-01-15T10:30:00Z", 
  createdBy: "user123",
  type: "OR",                    // Entity-specific content
  statement: "Rich text...",
  rationale: "Rich text..."
}
```

## Store Layer Implementation

### VersionedItemStore Base Class
```javascript
class VersionedItemStore extends BaseStore {
  constructor(driver, itemLabel, versionLabel) {
    super(driver, itemLabel);
    this.versionLabel = versionLabel;
  }
  
  // Core versioned operations
  async create(data, transaction)
  async update(itemId, data, expectedVersionId, transaction)
  async findById(itemId, transaction)
  async findByIdAndVersion(itemId, versionNumber, transaction)
  async findVersionHistory(itemId, transaction)
}
```

### Concrete Entity Stores
```javascript
class OperationalRequirementStore extends VersionedItemStore {
  constructor(driver) {
    super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
  }
  // Adds REFINES and IMPACTS relationship methods
}

class OperationalChangeStore extends VersionedItemStore {
  constructor(driver) {
    super(driver, 'OperationalChange', 'OperationalChangeVersion');  
  }
  // Adds SATISFIES and SUPERSEDS relationship methods
}
```

## Version Management Operations

### Creating First Version
```javascript
// Creates both Item and ItemVersion (version=1) in single transaction
const result = await store.create({
  title: "New Requirement",
  type: "OR", 
  statement: "Requirement description"
}, transaction);

// Returns complete entity with version info
{
  itemId: 123,
  title: "New Requirement",
  versionId: 456,
  version: 1,
  type: "OR",
  statement: "Requirement description",
  createdAt: "2025-01-15T10:30:00Z",
  createdBy: "user123"
}
```

### Creating New Versions
```javascript
// Update creates new ItemVersion (version=2) and updates Item.latest_version
const updated = await store.update(itemId, {
  title: "Updated Title",        // Updates Item node
  statement: "New statement"     // Goes to new ItemVersion  
}, expectedVersionId, transaction);
```

### Optimistic Locking
```javascript
// Client must provide current versionId to prevent conflicts
const current = await store.findById(itemId, transaction);
// current.versionId = 456

// Update with version check
try {
  await store.update(itemId, newData, current.versionId, transaction);
} catch (error) {
  if (error.message === 'Outdated item version') {
    // Handle version conflict - client must refresh and retry
  }
}
```

### Version Navigation
```javascript
// Latest version (default)
const latest = await store.findById(itemId, transaction);

// Specific version
const version2 = await store.findByIdAndVersion(itemId, 2, transaction);

// Version history (newest first)
const history = await store.findVersionHistory(itemId, transaction);
// Returns: [{versionId, version, createdAt, createdBy}, ...]
```

## Relationship Patterns

### Relationship Direction
All relationships point from **ItemVersion → Item** to ensure they automatically follow the latest version:

```cypher
// Relationships from versioned entities point to Item nodes
(OperationalRequirementVersion)-[:REFINES]->(OperationalRequirement)
(OperationalRequirementVersion)-[:IMPACTS]->(StakeholderCategories)
(OperationalChangeVersion)-[:SATISFIES]->(OperationalRequirement)
```

### Version-Aware Relationships
```javascript
// Create relationship from specific version to target Item
await store.createRefinesRelation(versionId, parentItemId, transaction);

// Query relationships in latest context
const parents = await store.findRefinesParents(itemId, transaction);

// Query relationships in specific version context  
const parentsV2 = await store.findRefinesParentsByVersion(itemId, 2, transaction);
```

### Relationship Lifecycle
```javascript
// Update relationships for new version (delete all/recreate pattern)
await store.replaceRefinesRelations(newVersionId, [parentId1, parentId2], transaction);

// Old version relationships remain unchanged
// New version gets fresh relationship set
```

## Transaction Management

### User Context Integration
```javascript
// Transaction carries user context for audit trails
const tx = createTransaction(userId);

// Store layer accesses user info for createdBy fields
const createdBy = tx.getUserId();
```

### Atomic Version Creation
```javascript
// Single transaction ensures consistency
const tx = createTransaction(userId);
try {
  // 1. Create new ItemVersion
  // 2. Update Item.latest_version  
  // 3. Create VERSION_OF relationship
  // 4. Update LATEST_VERSION relationship
  // 5. Create entity relationships
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Data Consistency Patterns

### Version Integrity
- Sequential version numbering (1, 2, 3...)
- Every Item has exactly one LATEST_VERSION relationship
- Every ItemVersion has exactly one VERSION_OF relationship
- Item.latest_version property matches LATEST_VERSION target

### Relationship Consistency
- Relationships always point from ItemVersion to Item
- Latest queries use current LATEST_VERSION context
- Historical queries use explicit version specification
- Cross-version relationship integrity maintained

### Concurrency Control
- First commit wins approach via expectedVersionId
- No database locking required
- Clear error messages for version conflicts
- Client retry responsibility for conflict resolution

## Baseline Management Integration

### Snapshot Creation
```javascript
// Baselines capture exact version references
const baseline = {
  itemId: 123,
  itemTitle: "Requirement Title",
  itemVersion: 3,              // Explicit version number
  versionId: 456               // Exact ItemVersion reference
};
```

### Historical Navigation
```javascript
// Navigate to baseline state using explicit versions
const baselineView = await store.findByIdAndVersion(
  baseline.itemId, 
  baseline.itemVersion, 
  transaction
);
```

## Performance Considerations

### Query Optimization
- LATEST_VERSION relationships enable fast current state queries
- Version history queries use indexed version numbers
- Relationship traversals benefit from consistent direction

### Storage Efficiency
- Only changed content creates new versions
- Item metadata (title) shared across versions
- Relationship storage follows latest version pattern

### Scalability Patterns
- Connection pooling at driver level
- Transaction boundaries optimize for version operations
- Concurrent version creation handled via optimistic locking

## Error Handling

### Version Conflict Resolution
```javascript
// Standard version conflict handling
catch (error) {
  if (error.message === 'Outdated item version') {
    // Client must refresh current state and retry
    const current = await store.findById(itemId, transaction);
    // Re-attempt with current.versionId
  }
}
```

### Data Integrity Validation
- Node existence validation at relationship creation
- Version sequence validation during updates
- Transaction rollback on any validation failure

## Future Extensions

### Cycle Detection
```javascript
// Placeholder for relationship cycle detection
// TODO: Implement graph traversal algorithm in createRefinesRelation
```

### Soft Delete Support
```javascript
// Future: Add deleted flag to Item nodes
// Relationships blocked to deleted Items
// Version history preserved for audit
```

### Branch Versioning
Current implementation supports linear versioning only. Future enhancement could support branching with merge capabilities while maintaining the dual-node pattern.

## Migration from Simple Entities

### Setup Entities (Non-Versioned)
- StakeholderCategories, RegulatoryAspects, Data, Services
- Extend BaseStore directly
- Simple CRUD operations with REFINES relationships

### Operational Entities (Versioned)
- OperationalRequirement, OperationalChange
- Extend VersionedItemStore
- Full versioning with optimistic locking and relationship management

This implementation provides a robust foundation for operational deployment plan management with full version control, relationship integrity, and historical consistency.