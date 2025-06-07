# Store Layer API Documentation

## Overview
Complete API reference for the ODP Store Layer with simplified design. Provides CRUD operations, versioning for operational entities, relationship management, and transaction handling over Neo4j.

## Initialization & Connection

### initializeStores()
```javascript
await initializeStores()
```
**Returns**: `Promise<void>`  
**Throws**: `Error` - Connection failure or configuration issues  
**Description**: Initializes Neo4j connection and all store instances. Must be called before any store operations.

### closeStores()
```javascript
await closeStores()
```
**Returns**: `Promise<void>`  
**Throws**: `Error` - Connection closure issues  
**Description**: Closes connections and resets store instances.

## Transaction Management

### createTransaction(userId)
```javascript
const tx = createTransaction(userId)
```
**Parameters**: `userId: string` - User identifier for audit context  
**Returns**: `Transaction` - Transaction wrapper with user context  
**Throws**: `TransactionError` - Transaction creation failure

### commitTransaction(transaction)
```javascript
await commitTransaction(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<void>`  
**Throws**: `TransactionError` - Commit failure

### rollbackTransaction(transaction)
```javascript
await rollbackTransaction(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<void>`  
**Throws**: `TransactionError` - Rollback failure

## Store Access Functions

### stakeholderCategoryStore()
```javascript
const store = stakeholderCategoryStore()
```
**Returns**: `StakeholderCategoryStore`  
**Throws**: `Error` - Store not initialized

### regulatoryAspectStore()
```javascript
const store = regulatoryAspectStore()
```
**Returns**: `RegulatoryAspectStore`  
**Throws**: `Error` - Store not initialized

### dataCategoryStore()
```javascript
const store = dataCategoryStore()
```
**Returns**: `DataCategoryStore`  
**Throws**: `Error` - Store not initialized

### serviceStore()
```javascript
const store = serviceStore()
```
**Returns**: `ServiceStore`  
**Throws**: `Error` - Store not initialized

### operationalRequirementStore()
```javascript
const store = operationalRequirementStore()
```
**Returns**: `OperationalRequirementStore`  
**Throws**: `Error` - Store not initialized

### operationalChangeStore()
```javascript
const store = operationalChangeStore()
```
**Returns**: `OperationalChangeStore`  
**Throws**: `Error` - Store not initialized

---

# Base Store APIs

## BaseStore API
*Common CRUD operations for all entities*

### create(data, transaction)
```javascript
const entity = await store.create(data, transaction)
```
**Parameters**:
- `data: object` - Entity properties
- `transaction: Transaction`

**Returns**: `Promise<object>` - Created entity with Neo4j ID  
**Throws**: `StoreError` - Creation failure

### findById(id, transaction)
```javascript
const entity = await store.findById(id, transaction)
```
**Parameters**:
- `id: number` - Neo4j internal node ID
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Entity or null if not found  
**Throws**: `StoreError` - Query failure

### findAll(transaction)
```javascript
const entities = await store.findAll(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<Array<object>>` - Array of entities  
**Throws**: `StoreError` - Query failure

### update(id, data, transaction)
```javascript
const entity = await store.update(id, data, transaction)
```
**Parameters**:
- `id: number` - Neo4j internal node ID
- `data: object` - Properties to update
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Updated entity or null if not found  
**Throws**: `StoreError` - Update failure

### delete(id, transaction)
```javascript
const deleted = await store.delete(id, transaction)
```
**Parameters**:
- `id: number` - Neo4j internal node ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - True if deleted  
**Throws**: `StoreError` - Delete failure

### exists(id, transaction)
```javascript
const exists = await store.exists(id, transaction)
```
**Parameters**:
- `id: number` - Neo4j internal node ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - True if exists  
**Throws**: `StoreError` - Query failure

## RefinableEntityStore API
*Extends BaseStore with REFINES hierarchy operations*

### createRefinesRelation(childId, parentId, transaction)
```javascript
const created = await store.createRefinesRelation(childId, parentId, transaction)
```
**Parameters**:
- `childId: number` - Child entity ID
- `parentId: number` - Parent entity ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - True if created  
**Behavior**: Enforces tree structure by replacing existing parent  
**Throws**:
- `StoreError('Referenced nodes do not exist')` - Invalid IDs
- `StoreError('Node cannot refine itself')` - Self-reference prevention

### deleteRefinesRelation(childId, parentId, transaction)
```javascript
const deleted = await store.deleteRefinesRelation(childId, parentId, transaction)
```
**Parameters**:
- `childId: number` - Child entity ID
- `parentId: number` - Parent entity ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - True if deleted  
**Throws**: `StoreError` - Delete failure

### findChildren(parentId, transaction)
```javascript
const children = await store.findChildren(parentId, transaction)
```
**Parameters**:
- `parentId: number` - Parent entity ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{id: number, name: string, description: string}>>` - Child entities sorted by name  
**Throws**: `StoreError` - Query failure

### findParent(childId, transaction)
```javascript
const parent = await store.findParent(childId, transaction)
```
**Parameters**:
- `childId: number` - Child entity ID
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Parent entity or null if no parent  
**Throws**: `StoreError` - Query failure

### findRoots(transaction)
```javascript
const roots = await store.findRoots(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<Array<object>>` - Root entities (no parent) sorted by name  
**Throws**: `StoreError` - Query failure

---

# Setup Entity Stores

## StakeholderCategoryStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableEntityStore methods

## RegulatoryAspectStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableEntityStore methods

## DataCategoryStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableEntityStore methods

## ServiceStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableEntityStore methods

---

# Versioned Entity APIs

## VersionedItemStore API
*Base class for versioned entities with optimistic locking*

### Data Model
```javascript
{
  itemId: number,           // Item node ID
  title: string,            // Item title
  versionId: number,        // ItemVersion node ID (for optimistic locking)
  version: number,          // Sequential version number
  createdAt: string,        // ISO timestamp
  createdBy: string,        // User identifier
  // ... entity-specific fields
}
```

### create(data, transaction)
```javascript
const entity = await store.create(data, transaction)
```
**Parameters**:
- `data: object` - Entity data (title + version fields)
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - Complete entity with version info  
**Behavior**: Creates Item + ItemVersion(v1) + relationships  
**Throws**: `StoreError` - Creation failure

### update(itemId, data, expectedVersionId, transaction)
```javascript
const entity = await store.update(itemId, data, expectedVersionId, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `data: object` - Complete payload (content + relationships)
- `expectedVersionId: number` - Current version ID for optimistic locking
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - New version with complete info  
**Behavior**: Creates new version, inherits/updates relationships  
**Throws**:
- `StoreError('Outdated item version')` - Version conflict
- `StoreError('Item not found')` - Invalid itemId

### findById(itemId, transaction)
```javascript
const entity = await store.findById(itemId, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Latest version with relationships or null  
**Throws**: `StoreError` - Query failure

### findByIdAndVersion(itemId, versionNumber, transaction)
```javascript
const entity = await store.findByIdAndVersion(itemId, versionNumber, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `versionNumber: number` - Specific version to retrieve
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Specific version with relationships or null  
**Throws**: `StoreError` - Query failure

### findVersionHistory(itemId, transaction)
```javascript
const history = await store.findVersionHistory(itemId, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{versionId: number, version: number, createdAt: string, createdBy: string}>>` - Version metadata (newest first)  
**Throws**:
- `StoreError('Item not found')` - Item doesn't exist
- `StoreError('Data integrity error')` - No versions found

### findAll(transaction)
```javascript
const entities = await store.findAll(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<Array<object>>` - Latest versions with relationships  
**Throws**: `StoreError` - Query failure

## OperationalRequirementStore

### Entity Model
```javascript
{
  // Item + Version fields (from VersionedItemStore)
  itemId: number,
  title: string,
  versionId: number,
  version: number,
  createdAt: string,
  createdBy: string,
  
  // Content fields
  type: string,             // 'ON' | 'OR'
  statement: string,        // Rich text
  rationale: string,        // Rich text
  references: string,       // Rich text
  risksAndOpportunities: string, // Rich text
  flows: string,            // Rich text
  flowExamples: string,     // Rich text
  
  // Relationship fields
  refinesParents: Array<number>,           // Parent requirement Item IDs
  impactsStakeholderCategories: Array<number>, // StakeholderCategory IDs
  impactsData: Array<number>,              // DataCategory IDs
  impactsServices: Array<number>,          // Service IDs
  impactsRegulatoryAspects: Array<number>  // RegulatoryAspect IDs
}
```

### create(data, transaction)
```javascript
const requirement = await store.create({
  title: "Requirement Title",
  type: "OR",
  statement: "Description",
  rationale: "Rationale",
  refinesParents: [123, 456],
  impactsServices: [789]
}, transaction)
```

**Parameters**: Same as VersionedItemStore.create + relationship arrays  
**Returns**: Complete requirement with all relationships  
**Behavior**: Creates Item + Version + all specified relationships  
**Validation**:
- Prevents self-references in REFINES
- Validates all referenced entities exist

### update(itemId, data, expectedVersionId, transaction)
```javascript
const updated = await store.update(itemId, {
  statement: "Updated statement",
  impactsServices: [789, 999]  // Added service 999
}, expectedVersionId, transaction)
```

**Behavior**:
- Creates new version
- **Inheritance**: Unspecified relationship arrays copy from previous version
- **Override**: Specified relationship arrays replace previous version
- **Content**: Unspecified content fields copy from previous version

### Inverse Relationship Queries

#### findChildren(itemId, transaction)
```javascript
const children = await store.findChildren(itemId, transaction)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Requirements that refine this one

#### findRequirementsThatImpact(targetLabel, targetId, transaction)
```javascript
const requirements = await store.findRequirementsThatImpact('Service', serviceId, transaction)
```
**Parameters**:
- `targetLabel: string` - 'StakeholderCategory'|'DataCategory'|'Service'|'RegulatoryAspect'
- `targetId: number` - Target entity ID

**Returns**: `Promise<Array<{id: number, title: string}>>` - Requirements impacting the target

## OperationalChangeStore

### Entity Model
```javascript
{
  // Item + Version fields (from VersionedItemStore)
  itemId: number,
  title: string,
  versionId: number,
  version: number,
  createdAt: string,
  createdBy: string,
  
  // Content fields
  description: string,      // Rich text
  visibility: string,       // 'NM' | 'NETWORK'
  
  // Relationship fields
  satisfiesRequirements: Array<number>,  // OperationalRequirement Item IDs
  supersedsRequirements: Array<number>,  // OperationalRequirement Item IDs
  
  // Milestone fields
  milestones: Array<{
    id: number,
    title: string,
    description: string,
    eventTypes: Array<string>,
    wave?: {
      id: number,
      year: number,
      quarter: number,
      date: string,
      name: string
    }
  }>
}
```

### create(data, transaction)
```javascript
const change = await store.create({
  title: "Change Title",
  description: "Change description",
  visibility: "NETWORK",
  milestones: [
    { 
      title: "M1", 
      description: "Milestone 1", 
      eventTypes: ["API_PUBLICATION"],
      waveId: 123 
    }
  ],
  satisfiesRequirements: [reqId1, reqId2]
}, transaction)
```

**Parameters**: Same as VersionedItemStore.create + milestones + relationships  
**Returns**: Complete change with milestones and relationships  
**Behavior**: Creates Item + Version + milestones + relationships in single transaction

### update(itemId, data, expectedVersionId, transaction)
```javascript
const updated = await store.update(itemId, {
  description: "Updated description",
  milestones: [
    { title: "M1", description: "Updated M1", eventTypes: ["API_PUBLICATION"] },
    { title: "M2", description: "New M2", eventTypes: ["SERVICE_ACTIVATION"], waveId: 456 }
  ]
}, expectedVersionId, transaction)
```

**Behavior**:
- Creates new version
- **Milestone inheritance**: If milestones not provided, copies milestone **data** from previous version to new version
- **Relationship inheritance**: If relationships not provided, copies relationship **data** from previous version to new version
- **Historical preservation**: Previous version keeps its own milestones and relationships

### Milestone Management
- **BELONGS_TO**: `(Milestone)-[:BELONGS_TO]->(OperationalChangeVersion)`
- **TARGETS**: `(Milestone)-[:TARGETS]->(Wave)`
- Milestones belong to specific versions (not shared)
- Wave targeting is optional per milestone

### Inverse Relationship Queries

#### findChangesThatSatisfyRequirement(requirementItemId, transaction)
```javascript
const changes = await store.findChangesThatSatisfyRequirement(reqId, transaction)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Changes satisfying the requirement

#### findChangesThatSupersedeRequirement(requirementItemId, transaction)
```javascript
const changes = await store.findChangesThatSupersedeRequirement(reqId, transaction)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Changes superseding the requirement

#### findMilestonesByWave(waveId, transaction)
```javascript
const milestones = await store.findMilestonesByWave(waveId, transaction)
```
**Returns**: `Promise<Array<object>>` - Milestones targeting the wave with change context

---

# Error Handling

## Error Types

### StoreError
```javascript
{
  name: 'StoreError',
  message: string,
  cause?: Error
}
```
**Base error** for all store operations

### TransactionError
```javascript
{
  name: 'TransactionError', 
  message: string,
  cause?: Error
}
```
**Transaction-specific** errors

## Common Error Messages

### Version Conflicts
- `'Outdated item version'` - Optimistic locking failure, client must refresh and retry
- `'Item not found'` - Invalid itemId for versioned operations
- `'Data integrity error'` - Version/Item consistency violation

### Validation Errors
- `'Referenced nodes do not exist'` - Invalid entity IDs in relationships
- `'Node cannot refine itself'` - Self-reference prevention in REFINES
- `'One or more [EntityType] entities do not exist'` - Batch validation failure

### Milestone Errors
- `'Wave with ID [waveId] does not exist'` - Invalid wave reference

---

# Usage Patterns

## Basic Transaction Pattern
```javascript
import { 
  initializeStores, 
  stakeholderCategoryStore, 
  createTransaction, 
  commitTransaction, 
  rollbackTransaction 
} from './store/index.js';

// Initialize once at startup
await initializeStores();

// Use throughout application
const tx = createTransaction('user123');
try {
  const category = await stakeholderCategoryStore().create({
    name: "Government",
    description: "Government entities"
  }, tx);
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Versioned Entity with Relationships
```javascript
const tx = createTransaction('user123');
try {
  // Create with initial relationships
  const requirement = await operationalRequirementStore().create({
    title: "New Requirement",
    type: "OR",
    statement: "Requirement description",
    refinesParents: [123],
    impactsServices: [456, 789]
  }, tx);
  
  // Update content only (relationships inherited)
  const updated1 = await operationalRequirementStore().update(
    requirement.itemId,
    { statement: "Updated description" },
    requirement.versionId,
    tx
  );
  
  // Update relationships only (content inherited)
  const updated2 = await operationalRequirementStore().update(
    requirement.itemId,
    { impactsServices: [456, 789, 999] }, // Added service 999
    updated1.versionId,
    tx
  );
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Version Conflict Handling
```javascript
async function updateWithRetry(itemId, data, userId, maxRetries = 3) {
  let retries = 0;
  
  while (retries < maxRetries) {
    const tx = createTransaction(userId);
    try {
      const current = await store.findById(itemId, tx);
      const updated = await store.update(itemId, data, current.versionId, tx);
      await commitTransaction(tx);
      return updated;
    } catch (error) {
      await rollbackTransaction(tx);
      
      if (error.message === 'Outdated item version' && retries < maxRetries - 1) {
        retries++;
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}
```

## OperationalChange with Milestones
```javascript
const tx = createTransaction('user123');
try {
  const change = await operationalChangeStore().create({
    title: "New Change",
    description: "Change description",
    visibility: "NETWORK",
    milestones: [
      {
        title: "Phase 1",
        description: "Initial deployment",
        eventTypes: ["API_PUBLICATION", "API_TEST_DEPLOYMENT"],
        waveId: 123
      }
    ],
    satisfiesRequirements: [reqId1, reqId2]
  }, tx);
  
  // Update milestones and keep relationships
  const updated = await operationalChangeStore().update(
    change.itemId,
    {
      milestones: [
        {
          title: "Phase 1",
          description: "Updated deployment",
          eventTypes: ["API_PUBLICATION", "SERVICE_ACTIVATION"],
          waveId: 124
        },
        {
          title: "Phase 2", 
          description: "Full rollout",
          eventTypes: ["SERVICE_ACTIVATION"]
        }
      ]
    },
    change.versionId,
    tx
  );
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

---

# Configuration

Database configuration in `server/config.json`:
```json
{
  "database": {
    "uri": "bolt://localhost:7687",
    "username": "neo4j", 
    "password": "password",
    "connection": {
      "maxConnectionPoolSize": 10,
      "connectionTimeout": 5000
    }
  },
  "retry": {
    "maxAttempts": 10,
    "intervalMs": 2000
  }
}
```