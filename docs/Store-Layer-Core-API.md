# Store Layer API Documentation

## Initialization & Connection Management

### initializeStores()
```javascript
await initializeStores()
```
- **Returns**: `Promise<void>`
- **Throws**: `Error` - Connection failure or configuration issues
- **Description**: Initializes Neo4j connection and all store instances with audit injection

### closeStores()
```javascript
await closeStores()
```
- **Returns**: `Promise<void>`
- **Throws**: `Error` - Connection closure issues
- **Description**: Closes connections and resets store instances

## Transaction Management

### createTransaction(userId)
```javascript
const tx = createTransaction(userId)
```
- **Parameters**: `userId: string` - User identifier for audit trails
- **Returns**: `Transaction` - Transaction wrapper with user context
- **Throws**: `TransactionError` - Transaction creation failure

### commitTransaction(transaction)
```javascript
await commitTransaction(transaction)
```
- **Parameters**: `transaction: Transaction`
- **Returns**: `Promise<void>`
- **Throws**: `TransactionError` - Commit failure

### rollbackTransaction(transaction)
```javascript
await rollbackTransaction(transaction)
```
- **Parameters**: `transaction: Transaction`
- **Returns**: `Promise<void>`
- **Throws**: `TransactionError` - Rollback failure

## Store Access Functions

### stakeholderCategoryStore()
```javascript
const store = stakeholderCategoryStore()
```
- **Returns**: `StakeholderCategoryStore`
- **Throws**: `Error` - Store not initialized

### regulatoryAspectStore()
```javascript
const store = regulatoryAspectStore()
```
- **Returns**: `RegulatoryAspectStore`
- **Throws**: `Error` - Store not initialized

### dataCategoryStore()
```javascript
const store = dataCategoryStore()
```
- **Returns**: `DataCategoryStore`
- **Throws**: `Error` - Store not initialized

### serviceStore()
```javascript
const store = serviceStore()
```
- **Returns**: `ServiceStore`
- **Throws**: `Error` - Store not initialized

### operationalRequirementStore()
```javascript
const store = operationalRequirementStore()
```
- **Returns**: `OperationalRequirementStore`
- **Throws**: `Error` - Store not initialized

### operationalChangeStore()
```javascript
const store = operationalChangeStore()
```
- **Returns**: `OperationalChangeStore`
- **Throws**: `Error` - Store not initialized

### relationshipAuditLogStore()
```javascript
const store = relationshipAuditLogStore()
```
- **Returns**: `RelationshipAuditLogStore`
- **Throws**: `Error` - Store not initialized

---

# Non-Versioned Entity Stores

## Common BaseStore API
*Applies to: StakeholderCategoryStore, RegulatoryAspectStore, DataCategoryStore, ServiceStore*

### create(data, transaction)
```javascript
const entity = await store.create(data, transaction)
```
- **Parameters**:
    - `data: object` - Entity properties `{name: string, description: string}`
    - `transaction: Transaction`
- **Returns**: `Promise<object>` - Created entity with Neo4j ID
- **Throws**: `StoreError` - Creation failure

### findById(id, transaction)
```javascript
const entity = await store.findById(id, transaction)
```
- **Parameters**:
    - `id: number` - Neo4j internal node ID
    - `transaction: Transaction`
- **Returns**: `Promise<object|null>` - Entity or null if not found
- **Throws**: `StoreError` - Query failure

### findAll(transaction)
```javascript
const entities = await store.findAll(transaction)
```
- **Parameters**: `transaction: Transaction`
- **Returns**: `Promise<Array<object>>` - Array of entities
- **Throws**: `StoreError` - Query failure

### update(id, data, transaction)
```javascript
const entity = await store.update(id, data, transaction)
```
- **Parameters**:
    - `id: number` - Neo4j internal node ID
    - `data: object` - Properties to update
    - `transaction: Transaction`
- **Returns**: `Promise<object|null>` - Updated entity or null if not found
- **Throws**: `StoreError` - Update failure

### delete(id, transaction)
```javascript
const deleted = await store.delete(id, transaction)
```
- **Parameters**:
    - `id: number` - Neo4j internal node ID
    - `transaction: Transaction`
- **Returns**: `Promise<boolean>` - True if deleted
- **Throws**: `StoreError` - Delete failure or dependencies exist

### exists(id, transaction)
```javascript
const exists = await store.exists(id, transaction)
```
- **Parameters**:
    - `id: number` - Neo4j internal node ID
    - `transaction: Transaction`
- **Returns**: `Promise<boolean>` - True if exists
- **Throws**: `StoreError` - Query failure

## Hierarchy Operations (REFINES relationships)
*Applies to: StakeholderCategoryStore, RegulatoryAspectStore, DataCategoryStore, ServiceStore*

### createRefinesRelation(childId, parentId, transaction)
```javascript
const created = await store.createRefinesRelation(childId, parentId, transaction)
```
- **Parameters**:
    - `childId: number` - Child entity ID
    - `parentId: number` - Parent entity ID
    - `transaction: Transaction`
- **Returns**: `Promise<boolean>` - True if created
- **Throws**: `StoreError` - Validation failure, self-reference, or creation failure

### deleteRefinesRelation(childId, parentId, transaction)
```javascript
const deleted = await store.deleteRefinesRelation(childId, parentId, transaction)
```
- **Parameters**:
    - `childId: number` - Child entity ID
    - `parentId: number` - Parent entity ID
    - `transaction: Transaction`
- **Returns**: `Promise<boolean>` - True if deleted
- **Throws**: `StoreError` - Delete failure

### findChildren(parentId, transaction)
```javascript
const children = await store.findChildren(parentId, transaction)
```
- **Parameters**:
    - `parentId: number` - Parent entity ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, name: string}>>` - Child entities
- **Throws**: `StoreError` - Query failure

---

# Versioned Entity Stores

## OperationalRequirementStore

### Data Model
```javascript
{
  itemId: number,           // Item node ID
  title: string,            // Item title
  versionId: number,        // ItemVersion node ID (for optimistic locking)
  version: number,          // Sequential version number
  createdAt: string,        // ISO timestamp
  createdBy: string,        // User identifier
  type: string,             // 'ON' | 'OR'
  statement: string,        // Rich text
  rationale: string,        // Rich text
  references: string,       // Rich text
  risksAndOpportunities: string, // Rich text
  flows: string,            // Rich text
  flowExamples: string      // Rich text
}
```

### Versioned CRUD Operations

#### create(data, transaction)
```javascript
const requirement = await store.create(data, transaction)
```
- **Parameters**:
    - `data: object` - Requirement data (title + version fields)
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<object>` - Complete requirement with version info
- **Throws**: `StoreError` - Creation failure

#### update(itemId, data, expectedVersionId, transaction)
```javascript
const requirement = await store.update(itemId, data, expectedVersionId, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `data: object` - Fields to update
    - `expectedVersionId: number` - Current version ID for optimistic locking
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<object>` - New version with complete info
- **Throws**:
    - `StoreError('Outdated item version')` - Version conflict
    - `StoreError` - Update failure

#### findById(itemId, transaction)
```javascript
const requirement = await store.findById(itemId, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `transaction: Transaction`
- **Returns**: `Promise<object|null>` - Latest version or null
- **Throws**: `StoreError` - Query failure

#### findByIdAndVersion(itemId, versionNumber, transaction)
```javascript
const requirement = await store.findByIdAndVersion(itemId, versionNumber, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `versionNumber: number` - Specific version to retrieve
    - `transaction: Transaction`
- **Returns**: `Promise<object|null>` - Specific version or null
- **Throws**: `StoreError` - Query failure

#### findVersionHistory(itemId, transaction)
```javascript
const history = await store.findVersionHistory(itemId, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{versionId: number, version: number, createdAt: string, createdBy: string}>>` - Version metadata (newest first)
- **Throws**:
    - `StoreError('Item not found')` - Item doesn't exist
    - `StoreError('Data integrity error')` - No versions found

#### findAll(transaction)
```javascript
const requirements = await store.findAll(transaction)
```
- **Parameters**: `transaction: Transaction`
- **Returns**: `Promise<Array<object>>` - Latest versions of all requirements
- **Throws**: `StoreError` - Query failure

### REFINES Relationship Operations (with Audit Trail)

#### addRefinesRelation(versionId, parentItemId, transaction)
```javascript
const added = await store.addRefinesRelation(versionId, parentItemId, transaction)
```
- **Parameters**:
    - `versionId: number` - Source ItemVersion ID
    - `parentItemId: number` - Target Item ID
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<boolean>` - True if relationship created
- **Throws**: `StoreError` - Validation failure, self-reference, or audit failure

#### removeRefinesRelation(versionId, parentItemId, transaction)
```javascript
const removed = await store.removeRefinesRelation(versionId, parentItemId, transaction)
```
- **Parameters**:
    - `versionId: number` - Source ItemVersion ID
    - `parentItemId: number` - Target Item ID
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<boolean>` - True if relationship removed
- **Throws**: `StoreError` - Remove failure or audit failure

#### findRefinesParents(itemId, transaction)
```javascript
const parents = await store.findRefinesParents(itemId, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Parent Items from latest version
- **Throws**: `StoreError` - Query failure

#### findRefinesParentsByVersion(itemId, versionNumber, transaction)
```javascript
const parents = await store.findRefinesParentsByVersion(itemId, versionNumber, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `versionNumber: number` - Specific version number
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Parent Items from specified version
- **Throws**: `StoreError` - Query failure

### IMPACTS Relationship Operations (with Audit Trail)

#### addImpactsRelation(versionId, targetType, targetId, transaction)
```javascript
const added = await store.addImpactsRelation(versionId, targetType, targetId, transaction)
```
- **Parameters**:
    - `versionId: number` - Source ItemVersion ID
    - `targetType: string` - 'Data'|'StakeholderCategory'|'Service'|'RegulatoryAspect'
    - `targetId: number` - Target entity ID
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<boolean>` - True if relationship created
- **Throws**: `StoreError` - Validation failure or audit failure

#### removeImpactsRelation(versionId, targetType, targetId, transaction)
```javascript
const removed = await store.removeImpactsRelation(versionId, targetType, targetId, transaction)
```
- **Parameters**:
    - `versionId: number` - Source ItemVersion ID
    - `targetType: string` - Target entity type
    - `targetId: number` - Target entity ID
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<boolean>` - True if relationship removed
- **Throws**: `StoreError` - Remove failure or audit failure

#### findImpacts(itemId, targetType, transaction)
```javascript
const impacts = await store.findImpacts(itemId, targetType, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `targetType: string` - Target entity type filter
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{type: string, id: number, name: string}>>` - Impacted entities from latest version
- **Throws**: `StoreError` - Query failure

#### findImpactsByVersion(itemId, targetType, versionNumber, transaction)
```javascript
const impacts = await store.findImpactsByVersion(itemId, targetType, versionNumber, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `targetType: string` - Target entity type filter
    - `versionNumber: number` - Specific version number
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{type: string, id: number, name: string}>>` - Impacted entities from specified version
- **Throws**: `StoreError` - Query failure

---

## OperationalChangeStore

### Data Model
```javascript
{
  itemId: number,           // Item node ID
  title: string,            // Item title
  versionId: number,        // ItemVersion node ID
  version: number,          // Sequential version number
  createdAt: string,        // ISO timestamp
  createdBy: string,        // User identifier
  description: string,      // Rich text
  visibility: string        // 'NM' | 'NETWORK'
}
```

### Versioned CRUD Operations
*Same signatures as OperationalRequirementStore: create, update, findById, findByIdAndVersion, findVersionHistory, findAll*

### SATISFIES/SUPERSEDS Relationship Operations (with Audit Trail)

#### addSatisfiesRelation(versionId, requirementItemId, transaction)
```javascript
const added = await store.addSatisfiesRelation(versionId, requirementItemId, transaction)
```
- **Parameters**:
    - `versionId: number` - Source OperationalChangeVersion ID
    - `requirementItemId: number` - Target OperationalRequirement Item ID
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<boolean>` - True if relationship created
- **Throws**: `StoreError` - Validation failure or audit failure

#### removeSatisfiesRelation(versionId, requirementItemId, transaction)
```javascript
const removed = await store.removeSatisfiesRelation(versionId, requirementItemId, transaction)
```
- **Parameters**:
    - `versionId: number` - Source OperationalChangeVersion ID
    - `requirementItemId: number` - Target OperationalRequirement Item ID
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<boolean>` - True if relationship removed
- **Throws**: `StoreError` - Remove failure or audit failure

#### addSupersedsRelation(versionId, requirementItemId, transaction)
```javascript
const added = await store.addSupersedsRelation(versionId, requirementItemId, transaction)
```
- **Parameters**: Same as addSatisfiesRelation
- **Returns**: `Promise<boolean>` - True if relationship created
- **Throws**: `StoreError` - Validation failure or audit failure

#### removeSupersedsRelation(versionId, requirementItemId, transaction)
```javascript
const removed = await store.removeSupersedsRelation(versionId, requirementItemId, transaction)
```
- **Parameters**: Same as removeSatisfiesRelation
- **Returns**: `Promise<boolean>` - True if relationship removed
- **Throws**: `StoreError` - Remove failure or audit failure

#### findSatisfies(itemId, transaction)
```javascript
const satisfied = await store.findSatisfies(itemId, transaction)
```
- **Parameters**:
    - `itemId: number` - OperationalChange Item ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Satisfied requirements from latest version
- **Throws**: `StoreError` - Query failure

#### findSatisfiesByVersion(itemId, versionNumber, transaction)
```javascript
const satisfied = await store.findSatisfiesByVersion(itemId, versionNumber, transaction)
```
- **Parameters**:
    - `itemId: number` - OperationalChange Item ID
    - `versionNumber: number` - Specific version number
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Satisfied requirements from specified version
- **Throws**: `StoreError` - Query failure

#### findSuperseds(itemId, transaction)
```javascript
const superseded = await store.findSuperseds(itemId, transaction)
```
- **Parameters**: Same as findSatisfies
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Superseded requirements from latest version
- **Throws**: `StoreError` - Query failure

#### findSupersedsByVersion(itemId, versionNumber, transaction)
```javascript
const superseded = await store.findSupersedsByVersion(itemId, versionNumber, transaction)
```
- **Parameters**: Same as findSatisfiesByVersion
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Superseded requirements from specified version
- **Throws**: `StoreError` - Query failure

### Inverse Relationship Queries

#### findChangesThatSatisfyRequirement(requirementItemId, transaction)
```javascript
const changes = await store.findChangesThatSatisfyRequirement(requirementItemId, transaction)
```
- **Parameters**:
    - `requirementItemId: number` - OperationalRequirement Item ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Changes satisfying the requirement
- **Throws**: `StoreError` - Query failure

#### findChangesThatSupersedeRequirement(requirementItemId, transaction)
```javascript
const changes = await store.findChangesThatSupersedeRequirement(requirementItemId, transaction)
```
- **Parameters**: Same as findChangesThatSatisfyRequirement
- **Returns**: `Promise<Array<{id: number, title: string}>>` - Changes superseding the requirement
- **Throws**: `StoreError` - Query failure

### Milestone Management (with OC Versioning)

#### Milestone Data Model
```javascript
{
  id: number,               // Neo4j internal ID
  title: string,            // Unique identifier
  description: string,      // Rich text
  eventTypes: Array<string> // Event type array
}
```

#### addMilestone(changeItemId, milestoneData, expectedVersionId, transaction)
```javascript
const result = await store.addMilestone(changeItemId, milestoneData, expectedVersionId, transaction)
```
- **Parameters**:
    - `changeItemId: number` - OperationalChange Item ID
    - `milestoneData: object` - Milestone properties `{title: string, description: string, eventTypes: Array<string>}`
    - `expectedVersionId: number` - Current version ID for optimistic locking
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<{operationalChange: object, milestone: object}>` - New OC version + created milestone
- **Throws**: `StoreError` - Version conflict, creation failure, or relationship failure

#### updateMilestone(changeItemId, milestoneId, milestoneData, expectedVersionId, transaction)
```javascript
const result = await store.updateMilestone(changeItemId, milestoneId, milestoneData, expectedVersionId, transaction)
```
- **Parameters**:
    - `changeItemId: number` - OperationalChange Item ID
    - `milestoneId: number` - Milestone node ID
    - `milestoneData: object` - Properties to update
    - `expectedVersionId: number` - Current version ID for optimistic locking
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<{operationalChange: object, milestone: object}>` - New OC version + updated milestone
- **Throws**:
    - `StoreError('Milestone does not belong to this OperationalChange')` - Ownership validation failure
    - `StoreError` - Version conflict or update failure

#### deleteMilestone(changeItemId, milestoneId, expectedVersionId, transaction)
```javascript
const result = await store.deleteMilestone(changeItemId, milestoneId, expectedVersionId, transaction)
```
- **Parameters**:
    - `changeItemId: number` - OperationalChange Item ID
    - `milestoneId: number` - Milestone node ID
    - `expectedVersionId: number` - Current version ID for optimistic locking
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<{operationalChange: object, deleted: boolean}>` - New OC version + deletion confirmation
- **Throws**:
    - `StoreError('Milestone does not belong to this OperationalChange')` - Ownership validation failure
    - `StoreError` - Version conflict or delete failure

#### updateMilestoneTargetsWave(changeItemId, milestoneId, waveId, expectedVersionId, transaction)
```javascript
const result = await store.updateMilestoneTargetsWave(changeItemId, milestoneId, waveId, expectedVersionId, transaction)
```
- **Parameters**:
    - `changeItemId: number` - OperationalChange Item ID
    - `milestoneId: number` - Milestone node ID
    - `waveId: number` - Wave node ID
    - `expectedVersionId: number` - Current version ID for optimistic locking
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<{operationalChange: object, milestone: object}>` - New OC version + milestone with updated context
- **Throws**:
    - `StoreError('Milestone does not belong to this OperationalChange')` - Ownership validation failure
    - `StoreError('Wave does not exist')` - Wave validation failure
    - `StoreError` - Version conflict or update failure

### Milestone Querying (No Versioning)

#### findMilestonesByChange(changeItemId, transaction)
```javascript
const milestones = await store.findMilestonesByChange(changeItemId, transaction)
```
- **Parameters**:
    - `changeItemId: number` - OperationalChange Item ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<{id: number, title: string, description: string, eventTypes: Array<string>}>>` - Milestones belonging to the change
- **Throws**: `StoreError` - Query failure

#### findMilestoneById(milestoneId, transaction)
```javascript
const milestone = await store.findMilestoneById(milestoneId, transaction)
```
- **Parameters**:
    - `milestoneId: number` - Milestone node ID
    - `transaction: Transaction`
- **Returns**: `Promise<object|null>` - Milestone or null if not found
- **Throws**: `StoreError` - Query failure

#### findMilestoneWithContext(milestoneId, transaction)
```javascript
const milestone = await store.findMilestoneWithContext(milestoneId, transaction)
```
- **Parameters**:
    - `milestoneId: number` - Milestone node ID
    - `transaction: Transaction`
- **Returns**: `Promise<object|null>` - Milestone with embedded change and wave objects
- **Format**:
```javascript
{
  id: number,
  title: string,
  description: string,
  eventTypes: Array<string>,
  change: {id: number, title: string} | null,
  wave: {id: number, year: number, quarter: number, date: string, name: string} | null
}
```
- **Throws**: `StoreError` - Query failure

#### findMilestonesByWave(waveId, transaction)
```javascript
const milestones = await store.findMilestonesByWave(waveId, transaction)
```
- **Parameters**:
    - `waveId: number` - Wave node ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<object>>` - Milestones targeting the wave
- **Throws**: `StoreError` - Query failure

#### findMilestonesByChangeAndWave(changeItemId, waveId, transaction)
```javascript
const milestones = await store.findMilestonesByChangeAndWave(changeItemId, waveId, transaction)
```
- **Parameters**:
    - `changeItemId: number` - OperationalChange Item ID
    - `waveId: number` - Wave node ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<object>>` - Milestones belonging to specific change and targeting specific wave
- **Throws**: `StoreError` - Query failure

---

# RelationshipAuditLogStore

### Data Model
```javascript
{
  id: number,               // Neo4j internal ID
  timestamp: string,        // ISO timestamp when change occurred
  userId: string,           // User who made the change
  action: string,           // 'ADD' | 'REMOVE'
  relationshipType: string, // 'REFINES' | 'IMPACTS' | 'SATISFIES' | 'SUPERSEDS'
  sourceType: string,       // Source node type (e.g., 'OperationalRequirementVersion')
  sourceId: number,         // Source node Neo4j ID
  targetType: string,       // Target node type (e.g., 'OperationalRequirement')
  targetId: number          // Target node Neo4j ID
}
```

### Audit Trail Operations

#### logRelationshipChange(relationshipData, transaction)
```javascript
const auditEntry = await store.logRelationshipChange(relationshipData, transaction)
```
- **Parameters**:
    - `relationshipData: object` - Relationship change details (see data model above)
    - `transaction: Transaction` - Must have user context
- **Returns**: `Promise<object>` - Created audit log entry
- **Throws**: `StoreError('Failed to create audit log entry - source or target node not found')` - Validation failure

#### findAuditTrailForItem(itemId, transaction)
```javascript
const auditTrail = await store.findAuditTrailForItem(itemId, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `transaction: Transaction`
- **Returns**: `Promise<Array<object>>` - Audit entries chronologically ordered
- **Throws**: `StoreError` - Query failure

#### findAuditTrailForRelationship(sourceId, targetId, relationshipType, transaction)
```javascript
const trail = await store.findAuditTrailForRelationship(sourceId, targetId, relationshipType, transaction)
```
- **Parameters**:
    - `sourceId: number` - Source node ID
    - `targetId: number` - Target node ID
    - `relationshipType: string` - Relationship type
    - `transaction: Transaction`
- **Returns**: `Promise<Array<object>>` - Audit entries for specific relationship
- **Throws**: `StoreError` - Query failure

#### reconstructRelationshipsAtTime(itemId, timestamp, transaction)
```javascript
const relationships = await store.reconstructRelationshipsAtTime(itemId, timestamp, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `timestamp: string` - ISO timestamp for reconstruction
    - `transaction: Transaction`
- **Returns**: `Promise<object>` - Relationship state at specified time
- **Format**:
```javascript
{
  REFINES: {
    OperationalRequirement: [{id: number, name: string, properties: object}]
  },
  IMPACTS: {
    StakeholderCategory: [{id: number, name: string, properties: object}],
    Data: [{id: number, name: string, properties: object}]
  }
}
```
- **Throws**: `StoreError` - Query failure

#### getAuditStatistics(itemId, transaction)
```javascript
const stats = await store.getAuditStatistics(itemId, transaction)
```
- **Parameters**:
    - `itemId: number` - Item node ID
    - `transaction: Transaction`
- **Returns**: `Promise<object>` - Audit statistics
- **Format**:
```javascript
{
  totalChanges: number,
  relationshipTypes: number,
  contributors: Array<string>,
  firstChange: string | null,
  lastChange: string | null
}
```
- **Throws**: `StoreError` - Query failure

---

# Error Handling

## Error Types

### StoreError
- **Base error** for all store operations
- **Properties**: `{name: 'StoreError', message: string, cause?: Error}`

### TransactionError
- **Transaction-specific** errors
- **Properties**: `{name: 'TransactionError', message: string, cause?: Error}`

## Common Error Messages

### Version Conflicts
- `'Outdated item version'` - Optimistic locking failure, client must refresh and retry

### Validation Errors
- `'Referenced nodes do not exist'` - Relationship creation with invalid targets
- `'Node cannot refine itself'` - Self-reference prevention
- `'Milestone does not belong to this OperationalChange'` - Ownership validation
- `'Wave does not exist'` - Wave reference validation

### Data Integrity Errors
- `'Item not found'` - Item doesn't exist for version operations
- `'Data integrity error'` - Structural consistency violation

### Audit Errors
- `'Failed to create audit log entry - source or target node not found'` - Audit validation failure

---

# Usage Patterns

## Transaction Management Pattern
```javascript
const tx = createTransaction(userId);
try {
  // Store operations
  const result = await store.someOperation(data, tx);
  await commitTransaction(tx);
  return result;
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Version Conflict Handling Pattern
```javascript
try {
  await store.update(itemId, data, expectedVersionId, tx);
} catch (error) {
  if (error.message === 'Outdated item version') {
    // Client must refresh current state and retry
    const current = await store.findById(itemId, tx);
    // Retry with current.versionId
  }
  throw error;
}
```

## Milestone Operations Pattern
```javascript
// All milestone operations require expectedVersionId for OC versioning
const current = await store.findById(changeItemId, tx);
const result = await store.addMilestone(changeItemId, milestoneData, current.versionId, tx);
// result.operationalChange contains new version
// result.milestone contains created milestone
```