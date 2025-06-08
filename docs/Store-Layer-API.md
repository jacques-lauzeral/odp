# Store Layer API Documentation

## Overview
Complete API reference for the ODP Store Layer with Reference structure design. Provides CRUD operations, versioning for operational items, relationship management with consistent Reference objects, and transaction handling over Neo4j.

## Reference Structure

### Core Reference Model
All relationship returns use consistent Reference objects:

```javascript
// Base Reference
{
  id: number,           // Neo4j internal ID
  title: string         // Human-readable identifier
}

// Extended Reference with context fields
{
  id: number,
  title: string,
  type?: string,        // For OperationalRequirements ('ON' | 'OR')
  name?: string,        // For setup items (alternative to title)
  year?: number,        // For Wave references
  quarter?: number,     // For Wave references
  date?: string         // For Wave references
}
```

### Input vs Output Pattern
- **Input**: ID arrays `[123, 456, 789]`
- **Output**: Reference arrays `[{id: 123, title: "Name", type: "OR"}, ...]`

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
*Common CRUD operations for all items*

### create(data, transaction)
```javascript
const item = await store.create(data, transaction)
```
**Parameters**:
- `data: object` - Item properties
- `transaction: Transaction`

**Returns**: `Promise<object>` - Created item with Neo4j ID  
**Throws**: `StoreError` - Creation failure

### findById(id, transaction)
```javascript
const item = await store.findById(id, transaction)
```
**Parameters**:
- `id: number` - Neo4j internal node ID
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Item or null if not found  
**Throws**: `StoreError` - Query failure

### findAll(transaction)
```javascript
const items = await store.findAll(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<Array<object>>` - Array of items  
**Throws**: `StoreError` - Query failure

### update(id, data, transaction)
```javascript
const item = await store.update(id, data, transaction)
```
**Parameters**:
- `id: number` - Neo4j internal node ID
- `data: object` - Properties to update
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Updated item or null if not found  
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

## RefinableItemStore API
*Extends BaseStore with REFINES hierarchy operations*

### createRefinesRelation(childId, parentId, transaction)
```javascript
const created = await store.createRefinesRelation(childId, parentId, transaction)
```
**Parameters**:
- `childId: number` - Child item ID
- `parentId: number` - Parent item ID
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
- `childId: number` - Child item ID
- `parentId: number` - Parent item ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - True if deleted  
**Throws**: `StoreError` - Delete failure

### findChildren(parentId, transaction)
```javascript
const children = await store.findChildren(parentId, transaction)
```
**Parameters**:
- `parentId: number` - Parent item ID
- `transaction: Transaction`

**Returns**: `Promise<Array<Reference>>` - Child items as Reference objects `[{id, title: name}, ...]` sorted by name  
**Throws**: `StoreError` - Query failure

### findParent(childId, transaction)
```javascript
const parent = await store.findParent(childId, transaction)
```
**Parameters**:
- `childId: number` - Child item ID
- `transaction: Transaction`

**Returns**: `Promise<Reference|null>` - Parent item as Reference object `{id, title: name}` or null if no parent  
**Throws**: `StoreError` - Query failure

### findRoots(transaction)
```javascript
const roots = await store.findRoots(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<Array<Reference>>` - Root items (no parent) as Reference objects `[{id, title: name}, ...]` sorted by name  
**Throws**: `StoreError` - Query failure

---

# Setup Item Stores

## StakeholderCategoryStore
**Inheritance**: `RefinableItemStore → BaseStore`  
**Item Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableItemStore methods
**Reference Pattern**: `{id, title: name}` for hierarchy relationships

## RegulatoryAspectStore
**Inheritance**: `RefinableItemStore → BaseStore`  
**Item Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableItemStore methods
**Reference Pattern**: `{id, title: name}` for hierarchy relationships

## DataCategoryStore
**Inheritance**: `RefinableItemStore → BaseStore`  
**Item Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableItemStore methods
**Reference Pattern**: `{id, title: name}` for hierarchy relationships

## ServiceStore
**Inheritance**: `RefinableItemStore → BaseStore`  
**Item Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

**Available Methods**: All BaseStore + RefinableItemStore methods
**Reference Pattern**: `{id, title: name}` for hierarchy relationships

---

# Versioned Item APIs

## VersionedItemStore API
*Base class for versioned items with optimistic locking and Reference structures*

### Data Model
```javascript
{
  itemId: number,           // Item node ID
  title: string,            // Item title
  versionId: number,        // ItemVersion node ID (for optimistic locking)
  version: number,          // Sequential version number
  createdAt: string,        // ISO timestamp
  createdBy: string,        // User identifier
  // ... item-specific fields
  // ... relationship arrays with Reference objects
}
```

### create(data, transaction)
```javascript
const item = await store.create(data, transaction)
```
**Parameters**:
- `data: object` - Item data (title + version fields + relationship ID arrays)
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - Complete item with version info and Reference objects  
**Behavior**: Creates Item + ItemVersion(v1) + relationships  
**Throws**: `StoreError` - Creation failure

### update(itemId, data, expectedVersionId, transaction)
```javascript
const item = await store.update(itemId, data, expectedVersionId, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `data: object` - Complete payload (content + relationship ID arrays)
- `expectedVersionId: number` - Current version ID for optimistic locking
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - New version with complete info and Reference objects  
**Behavior**: Creates new version, inherits/updates relationships  
**Throws**:
- `StoreError('Outdated item version')` - Version conflict
- `StoreError('Item not found')` - Invalid itemId

### findById(itemId, transaction)
```javascript
const item = await store.findById(itemId, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Latest version with Reference objects or null  
**Throws**: `StoreError` - Query failure

### findByIdAndVersion(itemId, versionNumber, transaction)
```javascript
const item = await store.findByIdAndVersion(itemId, versionNumber, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `versionNumber: number` - Specific version to retrieve
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Specific version with Reference objects or null  
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
const items = await store.findAll(transaction)
```
**Parameters**: `transaction: Transaction`  
**Returns**: `Promise<Array<object>>` - Latest versions with Reference objects  
**Throws**: `StoreError` - Query failure

## OperationalRequirementStore

### Item Model
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
  
  // Relationship fields with Reference objects
  refinesParents: Array<Reference>,           // Parent requirement References
  impactsStakeholderCategories: Array<Reference>, // StakeholderCategory References
  impactsData: Array<Reference>,              // DataCategory References
  impactsServices: Array<Reference>,          // Service References
  impactsRegulatoryAspects: Array<Reference>  // RegulatoryAspect References
}
```

### Reference Patterns
```javascript
// REFINES relationships (to OperationalRequirement Items)
refinesParents: [{id: 123, title: "Parent Requirement", type: "ON"}, ...]

// IMPACTS relationships (to setup items)
impactsStakeholderCategories: [{id: 456, title: "Government"}, ...]
impactsData: [{id: 789, title: "Customer Data"}, ...]
impactsServices: [{id: 101, title: "Auth Service"}, ...]
impactsRegulatoryAspects: [{id: 202, title: "GDPR"}, ...]
```

### create(data, transaction)
```javascript
const requirement = await store.create({
  title: "Requirement Title",
  type: "OR",
  statement: "Description",
  rationale: "Rationale",
  refinesParents: [123, 456],        // Input: ID arrays
  impactsServices: [789]
}, transaction)
```

**Parameters**: Item data with relationship ID arrays  
**Returns**: Complete requirement with all relationships as Reference objects  
**Behavior**: Creates Item + Version + all specified relationships  
**Validation**:
- Prevents self-references in REFINES
- Validates all referenced items exist

### update(itemId, data, expectedVersionId, transaction)
```javascript
const updated = await store.update(itemId, {
  statement: "Updated statement",
  impactsServices: [789, 999]  // Input: ID arrays
}, expectedVersionId, transaction)
```

**Behavior**:
- Creates new version
- **Inheritance**: Unspecified relationship arrays inherited from previous version
- **Override**: Specified relationship arrays replace previous version
- **Content**: Unspecified content fields copied from previous version
- **Returns**: All relationships as Reference objects

### Additional Query Methods

#### findChildren(itemId, transaction)
```javascript
const children = await store.findChildren(itemId, transaction)
```
**Returns**: `Promise<Array<Reference>>` - Requirements that refine this one `[{id, title, type}, ...]`

#### findParents(itemId, transaction)
```javascript
const parents = await store.findParents(itemId, transaction)
```
**Returns**: `Promise<Array<Reference>>` - Requirements that this one refines `[{id, title, type}, ...]`

#### findRoots(transaction)
```javascript
const roots = await store.findRoots(transaction)
```
**Returns**: `Promise<Array<Reference>>` - Requirements with no parents `[{id, title, type}, ...]`

#### findRequirementsThatImpact(targetLabel, targetId, transaction)
```javascript
const requirements = await store.findRequirementsThatImpact('Service', serviceId, transaction)
```
**Parameters**:
- `targetLabel: string` - 'StakeholderCategory'|'Data'|'Service'|'RegulatoryAspect'
- `targetId: number` - Target item ID

**Returns**: `Promise<Array<Reference>>` - Requirements impacting the target `[{id, title, type}, ...]`

## OperationalChangeStore

### Item Model
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
  
  // Relationship fields with Reference objects
  satisfiesRequirements: Array<Reference>,  // OperationalRequirement References
  supersedsRequirements: Array<Reference>,  // OperationalRequirement References
  
  // Milestone fields with Reference objects
  milestones: Array<{
    id: number,
    title: string,
    description: string,
    eventTypes: Array<string>,
    wave?: Reference           // Wave Reference if targeted
  }>
}
```

### Reference Patterns
```javascript
// Requirement relationships (to OperationalRequirement Items)
satisfiesRequirements: [{id: 123, title: "Requirement Title", type: "OR"}, ...]
supersedsRequirements: [{id: 456, title: "Old Requirement", type: "ON"}, ...]

// Milestone wave references (optional)
milestones: [{
  id: 789,
  title: "Phase 1",
  description: "Initial deployment",
  eventTypes: ["API_PUBLICATION"],
  wave: {id: 101, title: "2025.Q1", year: 2025, quarter: 1, date: "2025-03-31"}
}]
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
  satisfiesRequirements: [reqId1, reqId2]  // Input: ID arrays
}, transaction)
```

**Parameters**: Item data with milestone data and relationship ID arrays  
**Returns**: Complete change with milestones (including Wave References) and relationships as Reference objects  
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
- **Milestone inheritance**: If milestones not provided, copies milestone data from previous version
- **Relationship inheritance**: If relationships not provided, copies relationship data from previous version
- **Historical preservation**: Previous version keeps its own milestones and relationships
- **Returns**: All milestones with Wave References and relationships as Reference objects

### Additional Query Methods

#### findChangesThatSatisfyRequirement(requirementItemId, transaction)
```javascript
const changes = await store.findChangesThatSatisfyRequirement(reqId, transaction)
```
**Returns**: `Promise<Array<Reference>>` - Changes satisfying the requirement `[{id, title}, ...]`

#### findChangesThatSupersedeRequirement(requirementItemId, transaction)
```javascript
const changes = await store.findChangesThatSupersedeRequirement(reqId, transaction)
```
**Returns**: `Promise<Array<Reference>>` - Changes superseding the requirement `[{id, title}, ...]`

#### findMilestonesByWave(waveId, transaction)
```javascript
const milestones = await store.findMilestonesByWave(waveId, transaction)
```
**Returns**: `Promise<Array<object>>` - Milestones targeting the wave with change context:
```javascript
[{
  id: number,
  title: string,
  description: string,
  eventTypes: Array<string>,
  change: Reference  // {id, title}
}, ...]
```

#### findMilestonesByChange(itemId, transaction)
```javascript
const milestones = await store.findMilestonesByChange(itemId, transaction)
```
**Returns**: `Promise<Array<object>>` - Milestones for the change:
```javascript
[{
  id: number,
  title: string,
  description: string,
  eventTypes: Array<string>,
  wave?: Reference  // {id, title} if wave targeted
}, ...]
```

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
- `'Referenced nodes do not exist'` - Invalid item IDs in relationships
- `'Node cannot refine itself'` - Self-reference prevention in REFINES
- `'One or more [ItemType] items do not exist'` - Batch validation failure

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
    description: "Government items"
  }, tx);
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Versioned Item with Relationships and References
```javascript
const tx = createTransaction('user123');
try {
  // Create with initial relationships (input: ID arrays)
  const requirement = await operationalRequirementStore().create({
    title: "New Requirement",
    type: "OR",
    statement: "Requirement description",
    refinesParents: [123],
    impactsServices: [456, 789]
  }, tx);
  
  // Result includes Reference objects
  console.log(requirement.refinesParents);
  // [{id: 123, title: "Parent Requirement", type: "ON"}]
  
  console.log(requirement.impactsServices);
  // [{id: 456, title: "Auth Service"}, {id: 789, title: "Data Service"}]
  
  // Update content only (relationships inherited)
  const updated1 = await operationalRequirementStore().update(
    requirement.itemId,
    { statement: "Updated description" },
    requirement.versionId,
    tx
  );
  
  // Update relationships only (content inherited, input: ID arrays, output: References)
  const updated2 = await operationalRequirementStore().update(
    requirement.itemId,
    { impactsServices: [456, 789, 999] }, // Added service 999
    updated1.versionId,
    tx
  );
  
  console.log(updated2.impactsServices);
  // [{id: 456, title: "Auth Service"}, {id: 789, title: "Data Service"}, {id: 999, title: "New Service"}]
  
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
      return updated; // Contains Reference objects
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

## OperationalChange with Milestones and References
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
    satisfiesRequirements: [reqId1, reqId2]  // Input: ID arrays
  }, tx);
  
  // Result includes Reference objects and Wave References
  console.log(change.satisfiesRequirements);
  // [{id: reqId1, title: "Requirement 1", type: "OR"}, {id: reqId2, title: "Requirement 2", type: "ON"}]
  
  console.log(change.milestones);
  // [{
  //   id: 456, title: "Phase 1", description: "Initial deployment",
  //   eventTypes: ["API_PUBLICATION", "API_TEST_DEPLOYMENT"],
  //   wave: {id: 123, title: "2025.Q1", year: 2025, quarter: 1, date: "2025-03-31"}
  // }]
  
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
  
  // Updated milestones with new Wave References
  console.log(updated.milestones[0].wave);
  // {id: 124, title: "2025.Q2", year: 2025, quarter: 2}
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Working with Reference Objects
```javascript
const tx = createTransaction('user123');
try {
  // Find requirement with all relationships as References
  const requirement = await operationalRequirementStore().findById(itemId, tx);
  
  // Navigate using Reference objects
  for (const parentRef of requirement.refinesParents) {
    console.log(`Parent: ${parentRef.title} (${parentRef.type})`);
    
    // Use Reference ID for further queries
    const parentDetail = await operationalRequirementStore().findById(parentRef.id, tx);
  }
  
  // Find inverse relationships using Reference returns
  const children = await operationalRequirementStore().findChildren(itemId, tx);
  // Returns: [{id, title, type}, ...] as References
  
  const impactedBy = await operationalRequirementStore().findRequirementsThatImpact('Service', serviceId, tx);
  // Returns: [{id, title, type}, ...] as References
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Hierarchy Navigation with References
```javascript
const tx = createTransaction('user123');
try {
    // Find all root categories (returns References)
    const roots = await stakeholderCategoryStore().findRoots(tx);
    // Returns: [{id, title: name}, ...] sorted by name

    // Navigate hierarchy using References
    for (const rootRef of roots) {
        console.log(`Root: ${rootRef.title}`);

        const children = await stakeholderCategoryStore().findChildren(rootRef.id, tx);
        // Returns: [{id, title: name}, ...] sorted by name

        for (const childRef of children) {
            console.log(`  Child: ${childRef.title}`);
        }
    }

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