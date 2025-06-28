# Store Layer API - Core

## Overview
Foundation APIs for the ODP Store Layer providing initialization, transaction management, store access, and common CRUD operations. These APIs form the base for all entity-specific store operations.

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

### waveStore()
```javascript
const store = waveStore()
```
**Returns**: `WaveStore`  
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

### baselineStore()
```javascript
const store = baselineStore()
```
**Returns**: `BaselineStore`  
**Throws**: `Error` - Store not initialized

### odpEditionStore()
```javascript
const store = odpEditionStore()
```
**Returns**: `ODPEditionStore`  
**Throws**: `Error` - Store not initialized

## BaseStore API
*Common CRUD operations for all entities*

### normalizeId(id)
```javascript
const normalizedId = store.normalizeId(id)
```
**Parameters**: `id: any` - ID value to normalize (string, number, or Neo4j Integer object)  
**Returns**: `number` - Normalized integer ID  
**Description**: Ensures consistent ID comparison across all layers. Handles Neo4j Integer objects, strings, and numbers.

**Usage Examples**:
```javascript
// String to number
store.normalizeId("123") // → 123

// Neo4j Integer object to number  
store.normalizeId(neo4jId) // → 123 (calls id.toNumber())

// Number passthrough
store.normalizeId(123) // → 123
```

**Critical for**: ID comparisons in service layer operations, milestone lookups, relationship matching.

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

## Error Handling

### Error Types

#### StoreError
```javascript
{
  name: 'StoreError',
  message: string,
  cause?: Error
}
```
**Base error** for all store operations

#### TransactionError
```javascript
{
  name: 'TransactionError', 
  message: string,
  cause?: Error
}
```
**Transaction-specific** errors

### Common Error Messages

#### Version Conflicts
- `'Outdated item version'` - Optimistic locking failure, client must refresh and retry
- `'Item not found'` - Invalid itemId for versioned operations
- `'Data integrity error'` - Version/Item consistency violation

#### Validation Errors
- `'Referenced nodes do not exist'` - Invalid entity IDs in relationships
- `'Node cannot refine itself'` - Self-reference prevention in REFINES
- `'One or more [EntityType] entities do not exist'` - Batch validation failure

#### Baseline Errors
- `'Baseline not found'` - Invalid baselineId in baseline-aware operations
- `'No items captured in baseline'` - Baseline created but no OR/OC existed

#### Milestone Errors
- `'Waves with ID [waveId] does not exist'` - Invalid wave reference

#### ODPEdition Errors
- `'ODPEdition not found'` - Invalid odpEditionId in context resolution
- `'Invalid baseline reference'` - Baseline doesn't exist when creating ODPEdition
- `'Invalid wave reference'` - Waves doesn't exist when creating ODPEdition

#### Waves Filtering Errors
- `'Waves not found'` - Invalid fromWaveId in wave filtering operations
- `'No matching milestones'` - Waves filter results in empty OC set

## Configuration

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

## Usage Notes

### Initialization Pattern
```javascript
import { initializeStores, closeStores } from './store/index.js';

// Application startup
await initializeStores();

// Application shutdown
process.on('SIGTERM', async () => {
  await closeStores();
  process.exit(0);
});
```

### Transaction Pattern
```javascript
import { createTransaction, commitTransaction, rollbackTransaction } from './store/index.js';

const tx = createTransaction('user123');
try {
  // Perform operations
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

### ID Normalization Best Practice
```javascript
// Always normalize IDs when comparing
const store = someStore();
const targetId = store.normalizeId(inputId);
const found = items.find(item => store.normalizeId(item.id) === targetId);
```