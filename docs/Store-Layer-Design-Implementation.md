# Storage Layer Design - Implementation

## Overview
This document describes the implementation patterns, transaction design, performance considerations, and error handling strategies for the ODP Storage Layer. These patterns ensure consistency, performance, and maintainability across all store implementations.

## Store Implementation Patterns

### BaseStore Pattern
**Responsibilities**:
- Core CRUD operations with consistent error handling
- Neo4j result transformation and data mapping
- ID normalization for consistent comparisons across layers
- Common validation patterns

**Key Implementation**:
```javascript
class BaseStore {
  constructor(driver, label) {
    this.driver = driver;
    this.label = label;
  }

  normalizeId(id) {
    if (typeof id === 'string') return parseInt(id, 10);
    if (typeof id === 'number') return id;
    if (id && typeof id.toNumber === 'function') return id.toNumber(); // Neo4j Integer
    throw new Error('Invalid ID format');
  }

  async create(data, transaction) {
    const query = `CREATE (n:${this.label} $data) RETURN n`;
    const result = await transaction.run(query, { data });
    return this._transformRecord(result.records[0]);
  }

  _transformRecord(record) {
    const node = record.get('n');
    return {
      id: this.normalizeId(node.identity),
      ...node.properties
    };
  }
}
```

### RefinableEntityStore Pattern
**Additional Responsibilities**:
- REFINES hierarchy management with tree structure enforcement
- Parent/child navigation queries
- Self-reference prevention and cycle detection

**Key Implementation**:
```javascript
class RefinableEntityStore extends BaseStore {
  async createRefinesRelation(childId, parentId, transaction) {
    // Prevent self-reference
    if (this.normalizeId(childId) === this.normalizeId(parentId)) {
      throw new StoreError('Node cannot refine itself');
    }

    // Replace existing parent (tree structure enforcement)
    await transaction.run(`
      MATCH (child:${this.label}) WHERE id(child) = $childId
      OPTIONAL MATCH (child)-[oldRel:REFINES]->()
      DELETE oldRel
    `, { childId });

    // Create new parent relationship
    const result = await transaction.run(`
      MATCH (child:${this.label}), (parent:${this.label})
      WHERE id(child) = $childId AND id(parent) = $parentId
      CREATE (child)-[:REFINES]->(parent)
      RETURN count(*) as created
    `, { childId, parentId });

    return result.records[0].get('created').toNumber() > 0;
  }
}
```

### VersionedItemStore Pattern
**Additional Responsibilities**:
- Dual-node lifecycle management (Item + ItemVersion)
- Optimistic locking with version conflict detection
- Multi-context query resolution (baseline + wave filtering)
- Relationship inheritance and override logic

**Key Implementation**:
```javascript
class VersionedItemStore extends BaseStore {
  constructor(driver, itemLabel, versionLabel) {
    super(driver, itemLabel);
    this.versionLabel = versionLabel;
  }

  async create(data, transaction) {
    const userId = transaction.getUserId();
    const timestamp = new Date().toISOString();
    
    // Create Item node
    const itemResult = await transaction.run(`
      CREATE (item:${this.itemLabel} {
        title: $title,
        createdAt: $timestamp,
        createdBy: $userId,
        latest_version: 1
      })
      RETURN item
    `, { title: data.title, timestamp, userId });

    const itemId = this.normalizeId(itemResult.records[0].get('item').identity);

    // Create ItemVersion node
    const versionResult = await this._createVersion(itemId, 1, data, transaction);
    
    return this._buildCompleteEntity(itemId, versionResult.versionId, data);
  }

  async update(itemId, data, expectedVersionId, transaction) {
    // Validate optimistic lock
    const currentVersion = await this._getCurrentVersion(itemId, transaction);
    if (this.normalizeId(currentVersion.versionId) !== this.normalizeId(expectedVersionId)) {
      throw new StoreError('Outdated item version');
    }

    // Create new version
    const newVersionNumber = currentVersion.version + 1;
    const newVersionResult = await this._createVersion(itemId, newVersionNumber, data, transaction);

    // Update Item metadata
    await this._updateItemMetadata(itemId, data.title, newVersionNumber, transaction);

    return this._buildCompleteEntity(itemId, newVersionResult.versionId, data);
  }
}
```

## Transaction Design

### Transaction Lifecycle
```javascript
class Transaction {
  constructor(neo4jTransaction, userId) {
    this.neo4jTransaction = neo4jTransaction;
    this.userId = userId;
    this.startTime = new Date();
  }

  getUserId() {
    return this.userId;
  }

  async run(query, parameters = {}) {
    try {
      return await this.neo4jTransaction.run(query, parameters);
    } catch (error) {
      throw new StoreError(`Query failed: ${error.message}`, error);
    }
  }
}
```

### Transaction Management Functions
```javascript
export function createTransaction(userId) {
  if (!userId) {
    throw new TransactionError('User ID required for transaction context');
  }
  
  const neo4jTx = driver.session().beginTransaction();
  return new Transaction(neo4jTx, userId);
}

export async function commitTransaction(transaction) {
  try {
    await transaction.neo4jTransaction.commit();
  } catch (error) {
    throw new TransactionError(`Commit failed: ${error.message}`, error);
  } finally {
    await transaction.neo4jTransaction.close();
  }
}

export async function rollbackTransaction(transaction) {
  try {
    await transaction.neo4jTransaction.rollback();
  } catch (error) {
    console.error('Rollback failed:', error);
  } finally {
    await transaction.neo4jTransaction.close();
  }
}
```

### Single Transaction per Operation
```javascript
// Service layer pattern - one transaction per user action
async updateOperationalRequirement(itemId, data, expectedVersionId, userId) {
  const tx = createTransaction(userId);
  try {
    // Complete operation: content + relationships
    const result = await operationalRequirementStore().update(
      itemId, 
      data, 
      expectedVersionId, 
      tx
    );
    await commitTransaction(tx);
    return result;
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

## Performance Considerations

### Connection Management
```javascript
// Singleton driver pattern
let driver = null;

export async function initializeStores() {
  if (driver) return;
  
  const config = await loadConfig();
  driver = neo4j.driver(
    config.database.uri,
    neo4j.auth.basic(config.database.username, config.database.password),
    {
      maxConnectionPoolSize: config.database.connection.maxConnectionPoolSize || 10,
      connectionTimeout: config.database.connection.connectionTimeout || 5000
    }
  );

  // Test connection
  await driver.verifyConnectivity();
}
```

### Query Optimization Patterns
**Indexed Lookups**:
```cypher
// Use node ID for direct lookups (most efficient)
MATCH (n:EntityType) WHERE id(n) = $id RETURN n

// Use indexed properties when available
MATCH (n:Wave) WHERE n.year = $year AND n.quarter = $quarter RETURN n
```

**Efficient Relationship Traversal**:
```cypher
// Latest version access (single hop)
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE id(item) = $itemId
RETURN item, version

// Batch relationship queries
UNWIND $itemIds as itemId
MATCH (item)-[:LATEST_VERSION]->(version)-[:IMPACTS]->(target)
WHERE id(item) = itemId
RETURN itemId, collect(target) as targets
```

**Baseline Query Optimization**:
```cypher
// Direct baseline item access
MATCH (baseline)-[:HAS_ITEMS]->(version)
WHERE id(baseline) = $baselineId
RETURN version

// Baseline with filtering
MATCH (baseline)-[:HAS_ITEMS]->(version)
WHERE id(baseline) = $baselineId
  AND version:OperationalChangeVersion
  AND EXISTS {
    MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(wave)
    WHERE wave.date >= $fromWaveDate
  }
RETURN version
```

### Batch Operations
```javascript
// Efficient relationship creation
async _createRelationshipsBatch(versionId, relationshipType, targetIds, transaction) {
  if (targetIds.length === 0) return;
  
  await transaction.run(`
    MATCH (version) WHERE id(version) = $versionId
    UNWIND $targetIds as targetId
    MATCH (target) WHERE id(target) = targetId
    CREATE (version)-[:${relationshipType}]->(target)
  `, { versionId, targetIds });
}

// Efficient validation
async _validateEntitiesExist(entityLabel, entityIds, transaction) {
  const result = await transaction.run(`
    UNWIND $entityIds as entityId
    MATCH (entity:${entityLabel}) WHERE id(entity) = entityId
    RETURN count(entity) as found
  `, { entityIds });
  
  const found = result.records[0].get('found').toNumber();
  if (found !== entityIds.length) {
    throw new StoreError(`One or more ${entityLabel} entities do not exist`);
  }
}
```

## Error Handling Strategy

### Error Hierarchy
```javascript
export class StoreError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'StoreError';
    this.cause = cause;
  }
}

export class TransactionError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'TransactionError';
    this.cause = cause;
  }
}

export class ValidationError extends StoreError {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}
```

### Error Wrapping Pattern
```javascript
async findById(id, transaction) {
  try {
    const result = await transaction.run(`
      MATCH (n:${this.label}) WHERE id(n) = $id RETURN n
    `, { id });
    
    if (result.records.length === 0) {
      return null;
    }
    
    return this._transformRecord(result.records[0]);
  } catch (error) {
    if (error instanceof StoreError) {
      throw error;
    }
    throw new StoreError(`Failed to find ${this.label}: ${error.message}`, error);
  }
}
```

### Specific Error Scenarios
```javascript
// Version conflict detection
if (currentVersionId !== expectedVersionId) {
  throw new StoreError('Outdated item version');
}

// Entity validation
if (!await this._entityExists(parentId, transaction)) {
  throw new ValidationError('Referenced parent entity does not exist', 'parentId');
}

// Self-reference prevention
if (this.normalizeId(childId) === this.normalizeId(parentId)) {
  throw new ValidationError('Node cannot refine itself', 'parentId');
}

// Baseline validation
if (baselineId && !await this._baselineExists(baselineId, transaction)) {
  throw new StoreError('Baseline not found');
}
```

## Data Validation Patterns

### Entity Existence Validation
```javascript
async _validateReferencedEntities(relationships, transaction) {
  for (const [relationshipType, entityIds] of Object.entries(relationships)) {
    if (entityIds.length === 0) continue;
    
    const entityLabel = this._getEntityLabel(relationshipType);
    await this._validateEntitiesExist(entityLabel, entityIds, transaction);
  }
}

_getEntityLabel(relationshipType) {
  const labelMap = {
    'refinesParents': this.itemLabel,
    'impactsStakeholderCategories': 'StakeholderCategory',
    'impactsData': 'DataCategory',
    'impactsServices': 'Service',
    'impactsRegulatoryAspects': 'RegulatoryAspect'
  };
  return labelMap[relationshipType];
}
```

### Business Rule Validation
```javascript
// Prevent circular references in REFINES relationships
async _preventCircularReference(childId, parentId, transaction) {
  const result = await transaction.run(`
    MATCH path = (child:${this.label})-[:REFINES*]->(ancestor:${this.label})
    WHERE id(child) = $parentId AND id(ancestor) = $childId
    RETURN count(path) as cycles
  `, { childId, parentId });
  
  const cycles = result.records[0].get('cycles').toNumber();
  if (cycles > 0) {
    throw new ValidationError('Circular reference detected in hierarchy');
  }
}

// Validate wave references in milestones
async _validateMilestoneWaves(milestones, transaction) {
  const waveIds = milestones
    .filter(m => m.waveId)
    .map(m => this.normalizeId(m.waveId));
  
  if (waveIds.length > 0) {
    await this._validateEntitiesExist('Wave', waveIds, transaction);
  }
}
```

## Store Initialization Pattern

### Store Factory
```javascript
// Store instances (initialized once)
let storeInstances = {};

export async function initializeStores() {
  await initializeConnection();
  
  storeInstances = {
    stakeholderCategory: new StakeholderCategoryStore(driver),
    regulatoryAspect: new RegulatoryAspectStore(driver),
    dataCategory: new DataCategoryStore(driver),
    service: new ServiceStore(driver),
    wave: new WaveStore(driver),
    operationalRequirement: new OperationalRequirementStore(driver),
    operationalChange: new OperationalChangeStore(driver),
    baseline: new BaselineStore(driver),
    odpEdition: new ODPEditionStore(driver)
  };
}

// Store accessor functions
export function stakeholderCategoryStore() {
  if (!storeInstances.stakeholderCategory) {
    throw new Error('Stores not initialized - call initializeStores() first');
  }
  return storeInstances.stakeholderCategory;
}
```

### Cleanup Pattern
```javascript
export async function closeStores() {
  if (driver) {
    await driver.close();
    driver = null;
  }
  storeInstances = {};
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await closeStores();
  process.exit(0);
});
```

## Extensibility Patterns

### Adding New Entity Stores
```javascript
// 1. Create store class extending appropriate base
class NewEntityStore extends RefinableEntityStore {
  constructor(driver) {
    super(driver, 'NewEntity');
  }
  
  // Add entity-specific methods
  async findByCustomCriteria(criteria, transaction) {
    // Implementation
  }
}

// 2. Add to store initialization
storeInstances.newEntity = new NewEntityStore(driver);

// 3. Add accessor function
export function newEntityStore() {
  return storeInstances.newEntity;
}
```

### Adding New Relationship Types
```javascript
// Extend relationship validation
_getEntityLabel(relationshipType) {
  const labelMap = {
    // Existing mappings...
    'newRelationshipType': 'TargetEntityLabel'
  };
  return labelMap[relationshipType];
}

// Add relationship creation logic
async _createNewRelationships(versionId, targetIds, transaction) {
  await this._createRelationshipsBatch(versionId, 'NEW_RELATIONSHIP', targetIds, transaction);
}
```

## Monitoring and Debugging

### Query Performance Monitoring
```javascript
class PerformanceMonitor {
  static async executeWithTiming(operation, context) {
    const start = process.hrtime.bigint();
    try {
      const result = await operation();
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds
      
      if (duration > 1000) { // Log slow queries
        console.warn(`Slow query detected: ${context} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000;
      console.error(`Query failed: ${context} after ${duration}ms`, error);
      throw error;
    }
  }
}
```

### Connection Health Monitoring
```javascript
export async function checkStoreHealth() {
  try {
    await driver.verifyConnectivity();
    const session = driver.session();
    await session.run('RETURN 1');
    await session.close();
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    };
  }
}
```