# Store Layer API - Core

## Overview
Core APIs for store initialization, transaction management, and base CRUD operations. These APIs provide the foundation for all store operations.

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

### documentStore()
```javascript
const store = documentStore()
```
**Returns**: `DocumentStore`  
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
**Description**: Ensures consistent ID comparison across all layers.

Handles Neo4j Integer objects, strings, and numbers.

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

**Returns**: `Promise<boolean>` - true if deleted, false if not found  
**Throws**: `StoreError` - Delete failure

## RefinableEntityStore API
*Hierarchy management for setup entities*

Extends BaseStore with REFINES relationship support for tree structures.

### createRefinesRelation(childId, parentId, transaction)
```javascript
await store.createRefinesRelation(childId, parentId, transaction)
```
**Parameters**:
- `childId: number` - Child entity ID
- `parentId: number` - Parent entity ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - true if created  
**Throws**: `StoreError` - Relationship creation failure  
**Validation**:
- Prevents self-reference
- Enforces tree structure (single parent)
- Replaces existing parent relationship

### deleteRefinesRelation(childId, transaction)
```javascript
await store.deleteRefinesRelation(childId, transaction)
```
**Parameters**:
- `childId: number` - Child entity ID
- `transaction: Transaction`

**Returns**: `Promise<boolean>` - true if deleted  
**Throws**: `StoreError` - Relationship deletion failure

### findParent(childId, transaction)
```javascript
const parent = await store.findParent(childId, transaction)
```
**Returns**: `Promise<object|null>` - Parent entity or null

### findChildren(parentId, transaction)
```javascript
const children = await store.findChildren(parentId, transaction)
```
**Returns**: `Promise<Array<object>>` - Array of child entities

### findRoots(transaction)
```javascript
const roots = await store.findRoots(transaction)
```
**Returns**: `Promise<Array<object>>` - Entities without parents (tree roots)

## VersionedItemStore API
*Version lifecycle management*

Extends BaseStore with dual-node versioning pattern (Item + ItemVersion).

### create(data, transaction)
```javascript
const entity = await store.create(data, transaction)
```
**Behavior**: Creates both Item node and ItemVersion (v1) with all content and relationships

### update(itemId, data, expectedVersionId, transaction)
```javascript
const entity = await store.update(itemId, data, expectedVersionId, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `data: object` - New version content
- `expectedVersionId: string` - Optimistic lock check
- `transaction: Transaction`

**Behavior**: Creates new ItemVersion, updates Item LATEST_VERSION relationship

### findById(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const entity = await store.findById(itemId, transaction, baselineId, fromWaveId)
```
**Multi-Context Support**: Returns version based on context parameters

### findByIdAndVersion(itemId, versionNumber, transaction)
```javascript
const entity = await store.findByIdAndVersion(itemId, 2, transaction)
```
**Returns**: Specific version by number

### findVersionHistory(itemId, transaction)
```javascript
const history = await store.findVersionHistory(itemId, transaction)
```
**Returns**: `Promise<Array<object>>` - Version metadata (newest first)

### patch(itemId, patchData, expectedVersionId, transaction)
```javascript
const entity = await store.patch(itemId, patchData, expectedVersionId, transaction)
```
**Behavior**: Partial update - creates new version with specified fields updated, others inherited