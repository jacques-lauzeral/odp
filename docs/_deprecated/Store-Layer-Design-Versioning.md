# Storage Layer Design - Versioning

## Overview
The versioning system implements a dual-node pattern with complete state preservation and relationship inheritance. Every update creates a new version while maintaining complete historical state and providing optimistic locking for concurrent access control.

## Dual-Node Pattern

### Node Structure
```cypher
// Item node: Stable identity and organizational metadata
(Item:OperationalRequirement {
  id: integer,
  title: string,           // Current title (can be updated)
  createdAt: timestamp,    // Item creation time
  createdBy: string,       // Original creator
  latest_version: integer  // Current version number (cache)
})

// ItemVersion node: Version-specific content and metadata
(ItemVersion:OperationalRequirementVersion {
  id: integer,
  version: integer,        // Sequential version number (1, 2, 3...)
  createdAt: timestamp,    // Version creation time
  createdBy: string,       // Version creator
  
  // Version-specific content
  type: string,
  statement: string,
  rationale: string,
  // ... other content fields
})
```

### Relationship Structure
```cypher
// Core versioning relationships
(Item)-[:LATEST_VERSION]->(ItemVersion)     // Points to current version
(ItemVersion)-[:VERSION_OF]->(Item)         // Back-reference to Item

// Entity relationships from ItemVersion
(ItemVersion)-[:REFINES]->(ParentItem)      // Cross-entity relationships
(ItemVersion)-[:IMPACTS]->(SetupEntity)     // Point to Item nodes
(ItemVersion)-[:SATISFIES]->(RequirementItem)

// Baseline capture
(Baseline)-[:HAS_ITEMS]->(ItemVersion)      // Snapshot relationships
```

## Version Lifecycle

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

### Version Creation Process
1. **Validate optimistic lock**: Check expectedVersionId matches current latest
2. **Create new ItemVersion**: Increment version number, copy/update content
3. **Update Item metadata**: Update title if changed, set latest_version
4. **Update version relationships**: Delete old LATEST_VERSION, create new one
5. **Create entity relationships**: Apply inheritance + overrides for new version

## Relationship Inheritance

### Inheritance Rules
- **Unspecified relationships**: Copy from previous version
- **Specified relationships**: Replace previous version's relationships
- **Empty arrays**: Clear all relationships of that type
- **Version isolation**: Previous versions keep their relationships unchanged

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
(Milestone)-[:TARGETS]->(Wave)  // Optional wave targeting
```

### Milestone Stable Identity
**Design Principle**: Each milestone has a stable business identifier (`milestoneKey`) that persists across versions, separate from technical node IDs.

```cypher
// Milestone node structure
(Milestone:OperationalChangeMilestone {
  id: integer,              // Technical node ID (changes with each version)
  milestoneKey: string,     // Stable business identifier (preserved across versions)
  title: string,
  description: string,
  eventTypes: [string]
})
```

### Milestone Key Generation
- **Format**: `ms_${uuid}` (e.g., `ms_a1b2c3d4-e5f6-7890-abcd-ef1234567890`)
- **New milestones**: Auto-generate UUID-based key when not provided
- **Existing milestones**: Preserve `milestoneKey` from previous version
- **Version independence**: Same milestone identity across all versions

### Milestone Inheritance
```javascript
// If milestones not provided in update, copy from previous version
const currentMilestones = await getMilestonesForVersion(previousVersionId, transaction);
const newMilestones = data.milestones || currentMilestones;

// Create milestone data for new version (milestones are version-specific)
await createMilestones(newVersionId, newMilestones, transaction);
```

### Milestone Version Creation Process
```javascript
// Extract milestone data from previous version
const previousMilestones = await getMilestoneDataFromVersion(previousVersionId, transaction);
// Returns: [{milestoneKey: "ms_uuid", title: "...", description: "...", eventTypes: [...], waveId: 123}]

// For each milestone, create new node for new version
for (const milestoneData of milestonesForNewVersion) {
  const milestoneKey = milestoneData.milestoneKey || `ms_${uuidv4()}`;  // Generate if new
  
  // Create fresh milestone node
  const milestone = await createMilestone({
    milestoneKey,  // Preserve stable identity
    title: milestoneData.title,
    description: milestoneData.description,
    eventTypes: milestoneData.eventTypes
  });
  
  // Create relationships
  await createRelationship(milestone, "BELONGS_TO", newVersionId);
  if (milestoneData.waveId) {
    await createRelationship(milestone, "TARGETS", milestoneData.waveId);
  }
}
```

### Historical Milestone Access
```javascript
// Current milestones (latest version)
const current = await operationalChangeStore().findById(changeId, transaction);
console.log(`Current milestones: ${current.milestones.length}`);

// Historical milestones (specific version)
const version2 = await operationalChangeStore().findByIdAndVersion(changeId, 2, transaction);
console.log(`Version 2 milestones: ${version2.milestones.length}`);

// Find milestone by stable key across versions
const milestone = await operationalChangeStore().findMilestoneByKey(changeId, "ms_uuid", transaction);
```

### Milestone Identity Benefits
- **Stable operations**: Update/delete operations use consistent identifiers
- **Version transparency**: Same milestone key works across all versions
- **API consistency**: Client code doesn't need to track ID changes
- **Historical tracking**: Milestone evolution can be traced across versions

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

// 3. Client submits update with version check
try {
  const updated = await store.update(itemId, updatedData, current.versionId, transaction);
  console.log(`Success: Updated to version ${updated.version}`);
} catch (error) {
  if (error.message === 'Outdated item version') {
    // Handle conflict: refresh and retry or merge changes
    console.log('Version conflict detected');
  }
}
```

### Version Conflict Detection
```javascript
// Store validates expectedVersionId before creating new version
const currentVersion = await findLatestVersion(itemId, transaction);
if (currentVersion.versionId !== expectedVersionId) {
  throw new StoreError('Outdated item version');
}
```

### Conflict Resolution Strategies
1. **Refresh and retry**: Client gets latest version and reapplies changes
2. **Merge changes**: Client combines their changes with latest version
3. **Abort operation**: Client notifies user of conflict and abandons changes

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
(OperationalRequirementVersion)-[:IMPACTS]->(StakeholderCategory)
(OperationalChangeVersion)-[:SATISFIES]->(OperationalRequirement)
```

### Relationship Lifecycle
```javascript
// Update relationships for new version (delete all/recreate pattern)
await store.replaceRefinesRelations(newVersionId, [parentId1, parentId2], transaction);

// Old version relationships remain unchanged
// New version gets fresh relationship set
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

**Milestone by Stable Key**:
```cypher
// Efficient: Direct lookup by milestoneKey
MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
MATCH (milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(version)
WHERE id(change) = $itemId AND milestone.milestoneKey = $milestoneKey
RETURN milestone
```

### Storage Efficiency
- **Shared Item metadata**: Title and organizational relationships shared across versions
- **Version-specific content**: Only changed content creates new versions
- **Relationship storage**: Each version maintains its own relationship set
- **Milestone nodes**: Fresh nodes per version maintain clear ownership
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

### Milestone Identity Integrity
- **Stable keys**: Each milestone has persistent `milestoneKey` across versions
- **Unique keys**: UUID-based keys ensure global uniqueness
- **Version ownership**: Each version has its own milestone nodes
- **Key preservation**: Existing milestone keys inherited during version updates

### Concurrency Safety
- **Optimistic locking**: Version conflicts detected and reported
- **Transaction boundaries**: All version operations atomic
- **No lost updates**: Concurrent modifications properly handled
- **Clear error messages**: Version conflicts clearly communicated to clients