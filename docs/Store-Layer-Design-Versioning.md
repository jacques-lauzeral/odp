# Storage Layer Design - Versioning

## Overview
The ODP versioning system implements a sequential versioning pattern using a dual-node approach (Item + ItemVersion) in Neo4j. This pattern provides both live relationship evolution and historical consistency through explicit version management and optimistic locking.

## Dual-Node Pattern

### Item Node (Persistent Identity)
**Purpose**: Stable entity identity that persists across all versions
**Properties**:
- `title`: User-facing identifier (updateable)
- `createdAt`, `createdBy`: Initial creation metadata
- `latest_version`: Current version number (maintained automatically)

**Relationships**:
- `LATEST_VERSION -> ItemVersion`: Points to current version
- `IS_LOCATED_IN -> Folder`: Static organizational relationships

### ItemVersion Node (Version Content)
**Purpose**: Version-specific content and relationships
**Properties**:
- `version`: Sequential number (1, 2, 3...)
- `createdAt`, `createdBy`: Version creation metadata
- All entity-specific content fields

**Relationships**:
- `VERSION_OF -> Item`: Back-reference to persistent identity
- `REFINES -> Item`: Cross-entity relationships point to Items (not versions)
- `IMPACTS -> SetupEntity`: Relationships follow latest version automatically

### Concrete Implementation
```cypher
// Item provides stable identity
(OperationalRequirement:OperationalRequirement {
  id: 123,
  title: "User Authentication Requirement",
  createdAt: "2025-01-15T10:30:00Z",
  createdBy: "user123",
  latest_version: 3
})

// ItemVersion contains version-specific content
(OperationalRequirementVersion:OperationalRequirementVersion {
  id: 456,
  version: 3,
  createdAt: "2025-01-16T14:20:00Z", 
  createdBy: "user456",
  type: "OR",
  statement: "The system must authenticate users...",
  rationale: "Security requirement for..."
})

// Relationships
(OperationalRequirement)-[:LATEST_VERSION]->(OperationalRequirementVersion)
(OperationalRequirementVersion)-[:VERSION_OF]->(OperationalRequirement)
```

## Version Lifecycle

### Version Creation Process
1. **Validate optimistic lock**: Check expectedVersionId matches current latest
2. **Create new ItemVersion**: Increment version number, copy/update content
3. **Update Item metadata**: Update title if changed, set latest_version
4. **Update version relationships**: Delete old LATEST_VERSION, create new one
5. **Create entity relationships**: Apply inheritance + overrides for new version

### Create Operation (First Version)
```javascript
// Creates both Item and ItemVersion (version=1)
const result = await store.create({
  title: "New Requirement",
  type: "OR", 
  statement: "Requirement description",
  refinesParents: [parentId1, parentId2],
  impactsServices: [serviceId1]
}, transaction);

// Result contains complete entity with version info
{
  itemId: 123,           // Item node ID
  title: "New Requirement",
  versionId: 456,        // ItemVersion node ID
  version: 1,
  type: "OR",
  statement: "Requirement description",
  refinesParents: [parentId1, parentId2],
  impactsServices: [serviceId1],
  createdAt: "2025-01-15T10:30:00Z",
  createdBy: "user123"
}
```

### Update Operation (New Version)
```javascript
// Creates new ItemVersion (version=2), inherits relationships
const updated = await store.update(itemId, {
  title: "Updated Title",        // Updates Item node
  statement: "New statement",    // Goes to new ItemVersion
  impactsServices: [serviceId2]  // Replaces previous services
  // refinesParents not specified = inherited from previous version
}, expectedVersionId, transaction);
```

## Optimistic Locking

### Client Responsibility Pattern
```javascript
// 1. Client retrieves current version
const current = await store.findById(itemId, transaction);
// current.versionId = 456 (for optimistic locking)

// 2. Client makes changes
const updatedData = { 
  statement: "Modified statement",
  impactsServices: [newServiceId] 
};

// 3. Client provides current versionId for conflict detection
try {
  const result = await store.update(itemId, updatedData, current.versionId, transaction);
} catch (error) {
  if (error.message === 'Outdated item version') {
    // Another user updated the item - client must refresh and retry
  }
}
```

### Conflict Resolution Strategy
- **First-commit-wins**: No server-side merging or conflict resolution
- **Client retry responsibility**: Client must refresh current state and retry
- **Clear error messages**: `'Outdated item version'` indicates version conflict
- **No database locking**: Optimistic approach avoids lock contention

### Version Validation
```javascript
// Server-side validation in update operation
const currentLatest = await getCurrentLatestVersion(itemId, transaction);
if (currentLatest.versionId !== expectedVersionId) {
  throw new StoreError('Outdated item version');
}
```

## Relationship Inheritance

### Default Behavior (Inheritance)
New versions automatically inherit relationships from previous version:
```javascript
// Previous version has: refinesParents=[123, 456], impactsServices=[789]
const updated = await store.update(itemId, {
  statement: "Updated statement only"
  // No relationship arrays provided = all inherited
}, expectedVersionId, transaction);

// New version gets: refinesParents=[123, 456], impactsServices=[789] (copied)
```

### Override Behavior (Replacement)
Provided relationship arrays replace inherited ones completely:
```javascript
// Previous version has: refinesParents=[123, 456], impactsServices=[789, 999]
const updated = await store.update(itemId, {
  statement: "Updated statement",
  impactsServices: [111, 222]  // Explicit override
  // refinesParents not specified = inherited [123, 456]
}, expectedVersionId, transaction);

// New version gets: refinesParents=[123, 456] (inherited), impactsServices=[111, 222] (replaced)
```

### Implementation Pattern
```javascript
// Merge relationships: inheritance + overrides
const currentRelationships = await getCurrentRelationships(previousVersionId);
const newRelationships = {
  refinesParents: data.refinesParents || currentRelationships.refinesParents,
  impactsServices: data.impactsServices || currentRelationships.impactsServices,
  impactsStakeholderCategories: data.impactsStakeholderCategories || currentRelationships.impactsStakeholderCategories
  // ... other relationship types
};

// Create relationships for new version
await createRelationships(newVersionId, newRelationships, transaction);
```

## Version Navigation

### Latest Version Access
```javascript
// Default: returns latest version via LATEST_VERSION relationship
const latest = await store.findById(itemId, transaction);
```

### Specific Version Access
```javascript
// Access specific historical version
const version2 = await store.findByIdAndVersion(itemId, 2, transaction);
```

### Version History
```javascript
// Get complete version history (newest first)
const history = await store.findVersionHistory(itemId, transaction);
// Returns: [{versionId, version, createdAt, createdBy}, ...]

// Navigate through history
for (const versionInfo of history) {
  const version = await store.findByIdAndVersion(itemId, versionInfo.version, transaction);
  console.log(`Version ${version.version}: ${version.statement.substring(0, 50)}...`);
}
```

## Relationship Versioning

### Cross-Entity Relationship Pattern
Relationships from versioned entities point to Item nodes (not ItemVersion nodes):
```cypher
// Correct: Relationships point to stable Item identity
(OperationalRequirementVersion)-[:REFINES]->(OperationalRequirement)
(OperationalRequirementVersion)-[:IMPACTS]->(StakeholderCategories)
(OperationalChangeVersion)-[:SATISFIES]->(OperationalRequirement)
```

### Relationship Lifecycle
**Version Creation**: New version gets fresh relationship set
```javascript
// Previous version relationships remain unchanged
// New version gets updated relationship set based on inheritance + overrides
await createRelationships(newVersionId, finalRelationships, transaction);
```

**Relationship Queries**: Follow latest version automatically
```cypher
// Query current relationships (automatically follows LATEST_VERSION)
MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version)
MATCH (version)-[:IMPACTS]->(target)
RETURN target

// Query historical relationships (specific version)
MATCH (item:OperationalRequirement)<-[:VERSION_OF]-(version)
WHERE version.version = $specificVersion
MATCH (version)-[:IMPACTS]->(target)
RETURN target
```

## Milestone Versioning

### Version-Specific Ownership
Milestones belong to specific OperationalChange versions:
```cypher
(Milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(OperationalChangeVersion)
(Milestone)-[:TARGETS]->(Waves)  // Optional wave targeting
```

### Milestone Inheritance
```javascript
// If milestones not provided in update, copy from previous version
const currentMilestones = await getMilestonesForVersion(previousVersionId, transaction);
const newMilestones = data.milestones || currentMilestones;

// Create milestone data for new version (milestones are version-specific)
await createMilestones(newVersionId, newMilestones, transaction);
```

### Historical Milestone Access
```javascript
// Current milestones (latest version)
const current = await operationalChangeStore().findById(changeId, transaction);
console.log(`Current milestones: ${current.milestones.length}`);

// Historical milestones (specific version)
const version2 = await operationalChangeStore().findByIdAndVersion(changeId, 2, transaction);
console.log(`Version 2 milestones: ${version2.milestones.length}`);
```

## Performance Considerations

### Query Optimization Patterns
**Latest Version Access** (most common):
```cypher
// Efficient: Single hop via LATEST_VERSION
MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version)
WHERE id(item) = $itemId
RETURN item, version
```

**Version History Access**:
```cypher
// Efficient: Indexed by version number
MATCH (item)<-[:VERSION_OF]-(version)
WHERE id(item) = $itemId
RETURN version
ORDER BY version.version DESC
```

**Relationship Traversal**:
```cypher
// Efficient: Direct relationship from latest version
MATCH (item)-[:LATEST_VERSION]->(version)-[:IMPACTS]->(target)
WHERE id(item) = $itemId
RETURN target
```

### Storage Efficiency
- **Shared Item metadata**: Title and organizational relationships shared across versions
- **Version-specific content**: Only changed content creates new versions
- **Relationship storage**: Each version maintains its own relationship set
- **Connection pooling**: Efficient resource utilization at driver level

## Data Integrity

### Version Sequence Integrity
- **Sequential numbering**: Versions created in sequence (1, 2, 3...)
- **No gaps**: Version numbers are consecutive
- **Single latest**: Each Item has exactly one LATEST_VERSION relationship
- **Bidirectional links**: VERSION_OF relationships maintained consistently

### Relationship Consistency
- **Item targeting**: All cross-entity relationships point to Item nodes
- **Version ownership**: Each version owns its complete relationship set
- **Historical accuracy**: Previous versions preserve exact relationship state
- **Cascade integrity**: Relationship changes create new versions

### Concurrency Safety
- **Optimistic locking**: Version conflicts detected and reported
- **Transaction boundaries**: All version operations atomic
- **No lost updates**: Concurrent modifications properly handled
- **Clear error messages**: Version conflicts clearly communicated to clients