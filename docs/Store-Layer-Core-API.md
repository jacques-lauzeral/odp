# Store Layer Core API

## Overview
This document defines the public API for the ODP store layer, providing the interface between the server layer and the data persistence components. The store layer abstracts Neo4j database operations and provides consistent transaction management, error handling, CRUD operations, and versioning support for operational entities.

## Initialization API

### initializeStores()
Initializes the store layer with Neo4j connection and store instances.

```javascript
import { initializeStores } from './store/index.js';

await initializeStores();
```

**Behavior:**
- Establishes Neo4j connection with retry logic (max 10 attempts, 2s intervals)
- Blocks until connection is established or fails
- Creates store instances with shared driver
- Must be called before any store operations

**Throws:**
- `Error` if connection fails after maximum retry attempts
- `Error` if configuration cannot be loaded

### closeStores()
Gracefully shuts down the store layer.

```javascript
import { closeStores } from './store/index.js';

await closeStores();
```

**Behavior:**
- Closes Neo4j driver and connection pool
- Resets store instances to prevent further use
- Should be called during application shutdown

## Transaction Management API

### createTransaction(userId)
Creates a new database transaction with user context.

```javascript
import { createTransaction } from './store/index.js';

const transaction = createTransaction('user123');
```

**Parameters:**
- `userId` (string) - User identifier for audit trails

**Returns:** `Transaction` - Transaction wrapper instance with user context

**Throws:**
- `TransactionError` if transaction creation fails

### commitTransaction(transaction)
Commits a transaction and cleans up resources.

```javascript
import { commitTransaction } from './store/index.js';

await commitTransaction(transaction);
```

**Parameters:**
- `transaction` (Transaction) - Transaction to commit

**Throws:**
- `TransactionError` if commit fails or transaction is invalid

### rollbackTransaction(transaction)
Rolls back a transaction and cleans up resources.

```javascript
import { rollbackTransaction } from './store/index.js';

await rollbackTransaction(transaction);
```

**Parameters:**
- `transaction` (Transaction) - Transaction to rollback

**Throws:**
- `TransactionError` if rollback fails or transaction is invalid

## Store Access API

### Non-Versioned Entity Stores

#### stakeholderCategoryStore()
Gets the StakeholderCategory store instance.

```javascript
import { stakeholderCategoryStore } from './store/index.js';

const store = stakeholderCategoryStore();
```

**Returns:** `StakeholderCategoryStore` - Store instance

**Throws:**
- `Error` if store layer not initialized

#### regulatoryAspectStore()
Gets the RegulatoryAspect store instance.

```javascript
import { regulatoryAspectStore } from './store/index.js';

const store = regulatoryAspectStore();
```

**Returns:** `RegulatoryAspectStore` - Store instance

#### dataCategoryStore()
Gets the DataCategory store instance.

```javascript
import { dataCategoryStore } from './store/index.js';

const store = dataCategoryStore();
```

**Returns:** `DataCategoryStore` - Store instance

#### serviceStore()
Gets the Service store instance.

```javascript
import { serviceStore } from './store/index.js';

const store = serviceStore();
```

**Returns:** `ServiceStore` - Store instance

### Versioned Entity Stores

#### operationalRequirementStore()
Gets the OperationalRequirement store instance.

```javascript
import { operationalRequirementStore } from './store/index.js';

const store = operationalRequirementStore();
```

**Returns:** `OperationalRequirementStore` - Versioned store instance

#### operationalChangeStore()
Gets the OperationalChange store instance.

```javascript
import { operationalChangeStore } from './store/index.js';

const store = operationalChangeStore();
```

**Returns:** `OperationalChangeStore` - Versioned store instance

#### operationalChangeMilestoneStore()
Gets the OperationalChangeMilestone store instance.

```javascript
import { operationalChangeMilestoneStore } from './store/index.js';

const store = operationalChangeMilestoneStore();
```

**Returns:** `OperationalChangeMilestoneStore` - Store instance

## Non-Versioned Entity API

### StakeholderCategory Store API

#### Data Model
```javascript
{
  id: number,        // Neo4j internal ID
  name: string,      // Category name
  description: string // Category description
}
```

#### CRUD Operations

##### create(data, transaction)
Creates a new StakeholderCategory.

```javascript
const data = { name: "Government", description: "Government stakeholders" };
const category = await store.create(data, transaction);
```

**Parameters:**
- `data` (object) - Category data (`{ name, description }`)
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<object>` - Created category with ID

**Throws:**
- `StoreError` if creation fails

##### findById(id, transaction)
Finds a StakeholderCategory by ID.

```javascript
const category = await store.findById(123, transaction);
```

**Parameters:**
- `id` (number) - Neo4j internal node ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<object|null>` - Category object or null if not found

**Throws:**
- `StoreError` if query fails

##### findAll(transaction)
Finds all StakeholderCategory nodes.

```javascript
const categories = await store.findAll(transaction);
```

**Parameters:**
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<Array<object>>` - Array of category objects

**Throws:**
- `StoreError` if query fails

##### update(id, data, transaction)
Updates a StakeholderCategory by ID.

```javascript
const updated = await store.update(123, { name: "New Name" }, transaction);
```

**Parameters:**
- `id` (number) - Neo4j internal node ID
- `data` (object) - Properties to update
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<object|null>` - Updated category or null if not found

**Throws:**
- `StoreError` if update fails

##### exists(id, transaction)
Checks if a StakeholderCategory exists by ID.

```javascript
const exists = await store.exists(123, transaction);
```

**Parameters:**
- `id` (number) - Neo4j internal node ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<boolean>` - True if exists

**Throws:**
- `StoreError` if query fails

#### Hierarchy Operations

##### createRefinesRelation(childId, parentId, transaction)
Creates a REFINES relationship between categories.

```javascript
const success = await store.createRefinesRelation(childId, parentId, transaction);
```

**Parameters:**
- `childId` (number) - Child category ID
- `parentId` (number) - Parent category ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<boolean>` - True if relationship created

**Behavior:**
- Validates both nodes exist
- Prevents self-references
- Enforces tree structure (replaces existing parent)

**Throws:**
- `StoreError` if nodes don't exist or operation fails

*Note: Other setup entities (RegulatoryAspect, DataCategory, Service) follow identical API patterns.*

## Versioned Entity API

### OperationalRequirement Store API

#### Data Model
```javascript
{
  // Item properties
  itemId: number,           // Item node ID
  title: string,            // Item title
  
  // Version properties  
  versionId: number,        // ItemVersion node ID (for optimistic locking)
  version: number,          // Sequential version number
  createdAt: string,        // ISO timestamp
  createdBy: string,        // User identifier
  
  // Entity-specific content
  type: string,             // 'ON' | 'OR'
  statement: string,        // Rich text
  rationale: string,        // Rich text
  references: string,       // Rich text
  risksAndOpportunities: string, // Rich text
  flows: string,            // Rich text
  flowExamples: string      // Rich text
}
```

#### Versioned CRUD Operations

##### create(data, transaction)
Creates a new OperationalRequirement with first version.

```javascript
const data = { 
  title: "New Requirement",
  type: "OR", 
  statement: "Requirement description" 
};
const requirement = await store.create(data, transaction);
```

**Parameters:**
- `data` (object) - Requirement data (title goes to Item, other fields to ItemVersion)
- `transaction` (Transaction) - Transaction with user context

**Returns:** `Promise<object>` - Created requirement with complete version info

**Behavior:**
- Creates Item node with title, createdAt, createdBy, latest_version=1
- Creates ItemVersion node with version=1 and content fields
- Establishes VERSION_OF and LATEST_VERSION relationships
- Returns combined Item + ItemVersion data

**Throws:**
- `StoreError` if creation fails

##### update(itemId, data, expectedVersionId, transaction)
Creates a new version of an existing OperationalRequirement.

```javascript
const updated = await store.update(itemId, {
  title: "Updated Title",
  statement: "Updated statement"
}, expectedVersionId, transaction);
```

**Parameters:**
- `itemId` (number) - Item node ID
- `data` (object) - Fields to update (title updates Item, others create new ItemVersion)
- `expectedVersionId` (number) - Current version ID for optimistic locking
- `transaction` (Transaction) - Transaction with user context

**Returns:** `Promise<object>` - New version with complete info

**Behavior:**
- Validates expectedVersionId matches current latest version
- Creates new ItemVersion with incremented version number
- Updates Item.latest_version and LATEST_VERSION relationship
- Returns combined data from updated Item + new ItemVersion

**Throws:**
- `StoreError` with 'Outdated item version' if version conflict
- `StoreError` if update fails

##### findById(itemId, transaction)
Finds an OperationalRequirement by Item ID, returns latest version.

```javascript
const requirement = await store.findById(123, transaction);
```

**Parameters:**
- `itemId` (number) - Item node ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<object|null>` - Latest version data or null if not found

**Throws:**
- `StoreError` if query fails

##### findByIdAndVersion(itemId, versionNumber, transaction)
Finds a specific version of an OperationalRequirement.

```javascript
const requirement = await store.findByIdAndVersion(123, 2, transaction);
```

**Parameters:**
- `itemId` (number) - Item node ID
- `versionNumber` (number) - Specific version to retrieve
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<object|null>` - Specific version data or null if not found

**Throws:**
- `StoreError` if query fails

##### findVersionHistory(itemId, transaction)
Gets version history for an OperationalRequirement.

```javascript
const history = await store.findVersionHistory(123, transaction);
```

**Parameters:**
- `itemId` (number) - Item node ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<Array<object>>` - Version metadata (newest first)

**Format:**
```javascript
[
  { versionId: 456, version: 3, createdAt: "...", createdBy: "user123" },
  { versionId: 455, version: 2, createdAt: "...", createdBy: "user456" },
  { versionId: 454, version: 1, createdAt: "...", createdBy: "user123" }
]
```

**Throws:**
- `StoreError` with 'Item not found' if itemId doesn't exist
- `StoreError` with 'Data integrity error' if no versions found

##### findAll(transaction)
Finds all OperationalRequirements, returns latest versions.

```javascript
const requirements = await store.findAll(transaction);
```

**Parameters:**
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<Array<object>>` - Array of requirements (latest versions)

**Throws:**
- `StoreError` if query fails

#### Relationship Operations

##### REFINES Relationships

###### createRefinesRelation(childVersionId, parentItemId, transaction)
Creates a REFINES relationship from a specific version to parent Item.

```javascript
const success = await store.createRefinesRelation(versionId, parentItemId, transaction);
```

**Parameters:**
- `childVersionId` (number) - Source ItemVersion ID
- `parentItemId` (number) - Target Item ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<boolean>` - True if relationship created

**Validation:**
- Both nodes must exist
- Prevents self-references (childItem ≠ parentItem)
- Cycle detection (TODO: implementation pending)

**Throws:**
- `StoreError` if validation fails

###### replaceRefinesRelations(childVersionId, parentItemIds, transaction)
Replaces all REFINES relationships for a version (delete all/recreate pattern).

```javascript
await store.replaceRefinesRelations(versionId, [parentId1, parentId2], transaction);
```

**Parameters:**
- `childVersionId` (number) - Source ItemVersion ID
- `parentItemIds` (Array<number>) - Target Item IDs
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<boolean>` - True if successful

###### findRefinesParents(itemId, transaction)
Finds parent requirements in latest version context.

```javascript
const parents = await store.findRefinesParents(itemId, transaction);
```

**Returns:** `Promise<Array<{id, title}>>` - Parent Items

###### findRefinesParentsByVersion(itemId, versionNumber, transaction)
Finds parent requirements from specific version context.

```javascript
const parents = await store.findRefinesParentsByVersion(itemId, 2, transaction);
```

**Returns:** `Promise<Array<{id, title}>>` - Parent Items

##### IMPACTS Relationships

###### createImpactsRelation(versionId, targetType, targetId, transaction)
Creates an IMPACTS relationship to setup entities.

```javascript
await store.createImpactsRelation(versionId, 'StakeholderCategory', targetId, transaction);
```

**Parameters:**
- `versionId` (number) - Source ItemVersion ID
- `targetType` (string) - Target entity type ('Data'|'StakeholderCategory'|'Service'|'RegulatoryAspect')
- `targetId` (number) - Target entity ID
- `transaction` (Transaction) - Transaction instance

**Returns:** `Promise<boolean>` - True if relationship created

###### replaceImpactsRelations(versionId, targetType, targetIds, transaction)
Replaces all IMPACTS relationships for a version and target type.

```javascript
await store.replaceImpactsRelations(versionId, 'Data', [dataId1, dataId2], transaction);
```

###### findImpacts(itemId, targetType, transaction)
Finds impacted entities in latest version context.

```javascript
const impacts = await store.findImpacts(itemId, 'StakeholderCategory', transaction);
```

**Returns:** `Promise<Array<{type, id, name}>>` - Impacted entities

### OperationalChange Store API

#### Data Model
```javascript
{
  // Item properties
  itemId: number,           // Item node ID
  title: string,            // Item title
  
  // Version properties
  versionId: number,        // ItemVersion node ID
  version: number,          // Sequential version number
  createdAt: string,        // ISO timestamp
  createdBy: string,        // User identifier
  
  // Entity-specific content
  description: string,      // Rich text
  visibility: string        // 'NM' | 'NETWORK'
}
```

#### Versioned CRUD Operations
*Same pattern as OperationalRequirement: create, update, findById, findByIdAndVersion, findVersionHistory, findAll*

#### Relationship Operations

##### SATISFIES Relationships

###### createSatisfiesRelation(versionId, requirementItemId, transaction)
Creates a SATISFIES relationship to OperationalRequirement.

```javascript
await store.createSatisfiesRelation(versionId, requirementItemId, transaction);
```

###### findSatisfies(itemId, transaction)
Finds satisfied requirements in latest version context.

```javascript
const satisfied = await store.findSatisfies(itemId, transaction);
```

**Returns:** `Promise<Array<{id, title}>>` - Satisfied requirements

##### SUPERSEDS Relationships
*Same API pattern as SATISFIES relationships*

##### Inverse Queries

###### findChangesThatSatisfyRequirement(requirementItemId, transaction)
Finds changes that satisfy a specific requirement.

```javascript
const changes = await store.findChangesThatSatisfyRequirement(reqId, transaction);
```

**Returns:** `Promise<Array<{id, title}>>` - Changes satisfying the requirement

### OperationalChangeMilestone Store API

#### Data Model
```javascript
{
  id: number,               // Neo4j internal ID
  title: string,            // Unique identifier
  description: string,      // Rich text
  eventTypes: Array<string> // Event type array
}
```

#### Standard CRUD Operations
*Same pattern as non-versioned entities: create, findById, findAll, update, exists*

#### Relationship Operations

##### BELONGS_TO Relationships

###### createBelongsToRelation(milestoneId, changeItemId, transaction)
Associates milestone with an OperationalChange.

```javascript
await store.createBelongsToRelation(milestoneId, changeItemId, transaction);
```

###### findMilestonesByChange(changeItemId, transaction)
Finds milestones belonging to a change.

```javascript
const milestones = await store.findMilestonesByChange(changeId, transaction);
```

##### TARGETS Relationships

###### createTargetsRelation(milestoneId, waveId, transaction)
Associates milestone with a Wave.

```javascript
await store.createTargetsRelation(milestoneId, waveId, transaction);
```

###### findMilestonesByWave(waveId, transaction)
Finds milestones targeting a wave.

```javascript
const milestones = await store.findMilestonesByWave(waveId, transaction);
```

##### Combined Queries

###### findMilestoneWithContext(milestoneId, transaction)
Gets milestone with its change and wave context.

```javascript
const milestone = await store.findMilestoneWithContext(milestoneId, transaction);
```

**Returns:** Milestone object with embedded change and wave objects

## Error Handling

### Error Types
- **StoreError** - Base error for all store operations
- **TransactionError** - Transaction-specific errors

### Error Properties
```javascript
{
  name: string,      // Error class name
  message: string,   // Error description
  cause?: Error      // Original error (if wrapped)
}
```

### Version Conflict Handling
```javascript
try {
  await store.update(itemId, data, expectedVersionId, transaction);
} catch (error) {
  if (error.message === 'Outdated item version') {
    // Refresh current state and retry
    const current = await store.findById(itemId, transaction);
    // Retry with current.versionId
  }
}
```

## Usage Patterns

### Basic Versioned Entity Example
```javascript
import { 
  initializeStores, 
  operationalRequirementStore, 
  createTransaction, 
  commitTransaction, 
  rollbackTransaction 
} from './store/index.js';

// Initialize stores
await initializeStores();

// Get store instance
const store = operationalRequirementStore();

// Create new requirement
const tx = createTransaction('user123');
try {
  const requirement = await store.create({ 
    title: "New Requirement",
    type: "OR",
    statement: "Requirement description" 
  }, tx);
  
  // Create relationships
  await store.createRefinesRelation(
    requirement.versionId, 
    parentRequirementId, 
    tx
  );
  
  await commitTransaction(tx);
  console.log('Created:', requirement);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

### Version Update Example
```javascript
const tx = createTransaction('user456');
try {
  // Get current state
  const current = await store.findById(itemId, tx);
  
  // Update with optimistic locking
  const updated = await store.update(itemId, {
    title: "Updated Title",
    statement: "Updated statement"
  }, current.versionId, tx);
  
  // Update relationships for new version
  await store.replaceRefinesRelations(
    updated.versionId, 
    [newParentId1, newParentId2], 
    tx
  );
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Configuration

The store layer uses `server/config.json` for database configuration:

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

## Integration Notes

- All store operations require an active transaction with user context
- Transaction management is explicit - always commit or rollback
- Store instances are created once during initialization
- Error handling follows consistent StoreError hierarchy
- All operations return plain JavaScript objects (no Neo4j internals)
- Versioned entity models align with `@odp/shared` API structure
- Relationship queries support both latest and historical contexts