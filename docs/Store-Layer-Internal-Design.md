# Store Layer Internal Design

## Overview
This document describes the internal architecture and implementation patterns for the ODP store layer. The store layer provides a clean abstraction over Neo4j database operations, implements the versioning pattern for operational entities, and maintains complete relationship audit trails for historical consistency and baseline management.

## Architectural Principles

### Separation of Concerns
- **Connection Management**: Centralized driver and transaction handling
- **Entity Operations**: CRUD operations abstracted through base classes
- **Relationship Management**: Consistent patterns with automatic audit logging
- **Version Control**: Sequential versioning with optimistic locking
- **Audit Trail**: Comprehensive relationship change tracking

### Transaction Boundaries
- **Field Updates**: Create new ItemVersion (content versioning)
- **Relationship Changes**: Modify relationships + create audit entries (relationship versioning)
- **Baseline Creation**: Capture complete state snapshot (consistency point)

## Core Components

### 1. Connection Management

#### Database Driver
```javascript
// store/connection.js
let driver = null;

export async function initializeConnection() {
  const config = await loadConfig();
  driver = neo4j.driver(
    config.database.uri,
    neo4j.auth.basic(config.database.username, config.database.password),
    config.database.connection
  );
  
  // Connection verification with retry logic
  await verifyConnectivity();
}
```

#### Transaction Wrapper
```javascript
// store/transaction.js
export class Transaction {
  constructor(neo4jTransaction, userId) {
    this.neo4jTransaction = neo4jTransaction;
    this.userId = userId;
    this.isActive = true;
  }
  
  getUserId() {
    return this.userId;
  }
  
  async run(query, parameters) {
    if (!this.isActive) {
      throw new TransactionError('Transaction is not active');
    }
    return this.neo4jTransaction.run(query, parameters);
  }
}
```

### 2. Base Store Classes

#### BaseStore (Non-Versioned Entities)
```javascript
// store/base-store.js
export class BaseStore {
  constructor(driver, nodeLabel) {
    this.driver = driver;
    this.nodeLabel = nodeLabel;
  }
  
  // Standard CRUD operations
  async create(data, transaction) {
    const query = `
      CREATE (n:${this.nodeLabel} $data)
      RETURN n
    `;
    const result = await transaction.run(query, { data });
    return this.transformRecord(result.records[0], 'n');
  }
  
  async findById(id, transaction) {
    const query = `
      MATCH (n:${this.nodeLabel})
      WHERE id(n) = $id
      RETURN n
    `;
    const result = await transaction.run(query, { id });
    return result.records.length > 0 
      ? this.transformRecord(result.records[0], 'n')
      : null;
  }
  
  // Additional CRUD methods...
  
  // Utility methods
  transformRecord(record, alias) {
    const node = record.get(alias);
    return {
      id: node.identity.toNumber(),
      ...node.properties
    };
  }
  
  transformRecords(records, alias) {
    return records.map(record => this.transformRecord(record, alias));
  }
}
```

#### VersionedItemStore (Versioned Entities)
```javascript
// store/versioned-item-store.js
export class VersionedItemStore extends BaseStore {
  constructor(driver, itemLabel, versionLabel) {
    super(driver, itemLabel);
    this.versionLabel = versionLabel;
  }
  
  async create(data, transaction) {
    const { title, ...versionData } = data;
    const userId = transaction.getUserId();
    const timestamp = new Date().toISOString();
    
    const query = `
      CREATE (item:${this.nodeLabel} {
        title: $title,
        createdAt: $timestamp,
        createdBy: $userId,
        latest_version: 1
      })
      CREATE (version:${this.versionLabel} $versionData {
        version: 1,
        createdAt: $timestamp,
        createdBy: $userId
      })
      CREATE (item)-[:LATEST_VERSION]->(version)
      CREATE (version)-[:VERSION_OF]->(item)
      RETURN item, version
    `;
    
    const result = await transaction.run(query, {
      title,
      versionData,
      timestamp,
      userId
    });
    
    return this.combineItemAndVersion(result.records[0]);
  }
  
  async update(itemId, data, expectedVersionId, transaction) {
    const { title, ...versionData } = data;
    const userId = transaction.getUserId();
    const timestamp = new Date().toISOString();
    
    // Optimistic locking check
    const lockQuery = `
      MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(currentVersion:${this.versionLabel})
      WHERE id(item) = $itemId AND id(currentVersion) = $expectedVersionId
      RETURN item.latest_version as currentVersionNumber
    `;
    
    const lockResult = await transaction.run(lockQuery, { itemId, expectedVersionId });
    if (lockResult.records.length === 0) {
      throw new StoreError('Outdated item version');
    }
    
    const currentVersionNumber = lockResult.records[0].get('currentVersionNumber').toNumber();
    const newVersionNumber = currentVersionNumber + 1;
    
    // Update Item and create new ItemVersion
    const updateQuery = `
      MATCH (item:${this.nodeLabel})-[oldLatest:LATEST_VERSION]->(oldVersion:${this.versionLabel})
      WHERE id(item) = $itemId
      
      SET item.title = $title,
          item.latest_version = $newVersionNumber
      
      DELETE oldLatest
      
      CREATE (newVersion:${this.versionLabel} $versionData {
        version: $newVersionNumber,
        createdAt: $timestamp,
        createdBy: $userId
      })
      CREATE (item)-[:LATEST_VERSION]->(newVersion)
      CREATE (newVersion)-[:VERSION_OF]->(item)
      
      RETURN item, newVersion
    `;
    
    const result = await transaction.run(updateQuery, {
      itemId,
      title: title || null,
      newVersionNumber,
      versionData,
      timestamp,
      userId
    });
    
    return this.combineItemAndVersion(result.records[0]);
  }
  
  async findById(itemId, transaction) {
    const query = `
      MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
      WHERE id(item) = $itemId
      RETURN item, version
    `;
    
    const result = await transaction.run(query, { itemId });
    return result.records.length > 0 
      ? this.combineItemAndVersion(result.records[0])
      : null;
  }
  
  async findByIdAndVersion(itemId, versionNumber, transaction) {
    const query = `
      MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
      WHERE id(item) = $itemId AND version.version = $versionNumber
      RETURN item, version
    `;
    
    const result = await transaction.run(query, { itemId, versionNumber });
    return result.records.length > 0 
      ? this.combineItemAndVersion(result.records[0])
      : null;
  }
  
  // Utility methods for versioned entities
  combineItemAndVersion(record) {
    const item = record.get('item');
    const version = record.get('version');
    
    return {
      itemId: item.identity.toNumber(),
      title: item.properties.title,
      versionId: version.identity.toNumber(),
      version: version.properties.version.toNumber(),
      createdAt: version.properties.createdAt,
      createdBy: version.properties.createdBy,
      ...version.properties
    };
  }
}
```

### 3. Relationship Management with Audit Trail

#### RelationshipAuditLogStore
```javascript
// store/relationship-audit-log.js
export class RelationshipAuditLogStore extends BaseStore {
  constructor(driver) {
    super(driver, 'RelationshipAuditLog');
  }
  
  async logRelationshipChange(relationshipData, transaction) {
    const userId = transaction.getUserId();
    const timestamp = new Date().toISOString();
    
    const query = `
      MATCH (source) WHERE id(source) = $sourceId
      MATCH (target) WHERE id(target) = $targetId
      
      CREATE (audit:RelationshipAuditLog {
        timestamp: $timestamp,
        userId: $userId,
        action: $action,
        relationshipType: $relationshipType,
        sourceType: $sourceType,
        sourceId: $sourceId,
        targetType: $targetType,
        targetId: $targetId
      })
      
      CREATE (audit)-[:LOGGED_FOR]->(source)
      CREATE (audit)-[:AFFECTS]->(target)
      
      RETURN audit
    `;
    
    const result = await transaction.run(query, {
      ...relationshipData,
      timestamp,
      userId
    });
    
    return this.transformRecord(result.records[0], 'audit');
  }
  
  async findAuditTrailForItem(itemId, transaction) {
    const query = `
      MATCH (item:OperationalRequirement)-[:HAS_VERSION*]->(version)
      MATCH (audit:RelationshipAuditLog)-[:LOGGED_FOR]->(version)
      WHERE id(item) = $itemId
      RETURN audit
      ORDER BY audit.timestamp ASC
    `;
    
    const result = await transaction.run(query, { itemId });
    return this.transformRecords(result.records, 'audit');
  }
  
  async reconstructRelationshipsAtTime(itemId, timestamp, transaction) {
    // Complex query to rebuild relationship state at specific time
    const query = `
      MATCH (item) WHERE id(item) = $itemId
      MATCH (audit:RelationshipAuditLog)
      WHERE audit.sourceId IN [(item)-[:HAS_VERSION*]->(v) | id(v)]
        AND audit.timestamp <= $timestamp
      
      WITH audit
      ORDER BY audit.timestamp ASC
      
      // Apply ADD/REMOVE logic to reconstruct state
      WITH collect(audit) as auditTrail
      UNWIND auditTrail as audit
      
      // Group by relationship type and target
      WITH audit.relationshipType as relType,
           audit.targetId as targetId,
           collect(audit) as changes
      
      // Get final state (last action for each target)
      WITH relType, targetId, changes[-1] as finalAction
      WHERE finalAction.action = 'ADD'
      
      MATCH (target) WHERE id(target) = targetId
      RETURN relType, collect({id: id(target), properties: properties(target)}) as targets
    `;
    
    const result = await transaction.run(query, { itemId, timestamp });
    return this.formatRelationshipState(result.records);
  }
  
  formatRelationshipState(records) {
    const state = {};
    records.forEach(record => {
      const relType = record.get('relType');
      const targets = record.get('targets');
      state[relType] = targets;
    });
    return state;
  }
}
```

#### Relationship Methods in Concrete Stores
```javascript
// store/operational-requirement.js
export class OperationalRequirementStore extends VersionedItemStore {
  constructor(driver) {
    super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
    this.auditStore = null; // Injected during initialization
  }
  
  setAuditStore(auditStore) {
    this.auditStore = auditStore;
  }
  
  async addRefinesRelation(versionId, parentItemId, transaction) {
    // 1. Validate nodes exist
    const validationQuery = `
      MATCH (version:${this.versionLabel}) WHERE id(version) = $versionId
      MATCH (parent:${this.nodeLabel}) WHERE id(parent) = $parentItemId
      MATCH (version)-[:VERSION_OF]->(item:${this.nodeLabel})
      WHERE id(item) <> id(parent)
      RETURN version, parent, item
    `;
    
    const validationResult = await transaction.run(validationQuery, { versionId, parentItemId });
    if (validationResult.records.length === 0) {
      throw new StoreError('Invalid nodes or self-reference detected');
    }
    
    // 2. Create relationship
    const relationshipQuery = `
      MATCH (version:${this.versionLabel}) WHERE id(version) = $versionId
      MATCH (parent:${this.nodeLabel}) WHERE id(parent) = $parentItemId
      
      MERGE (version)-[:REFINES]->(parent)
      RETURN count(*) as created
    `;
    
    const relationshipResult = await transaction.run(relationshipQuery, { versionId, parentItemId });
    const created = relationshipResult.records[0].get('created').toNumber() > 0;
    
    // 3. Log the change
    if (created && this.auditStore) {
      await this.auditStore.logRelationshipChange({
        action: 'ADD',
        relationshipType: 'REFINES',
        sourceType: this.versionLabel,
        sourceId: versionId,
        targetType: this.nodeLabel,
        targetId: parentItemId
      }, transaction);
    }
    
    return created;
  }
  
  async removeRefinesRelation(versionId, parentItemId, transaction) {
    // 1. Remove relationship
    const relationshipQuery = `
      MATCH (version:${this.versionLabel})-[r:REFINES]->(parent:${this.nodeLabel})
      WHERE id(version) = $versionId AND id(parent) = $parentItemId
      DELETE r
      RETURN count(*) as deleted
    `;
    
    const relationshipResult = await transaction.run(relationshipQuery, { versionId, parentItemId });
    const deleted = relationshipResult.records[0].get('deleted').toNumber() > 0;
    
    // 2. Log the change
    if (deleted && this.auditStore) {
      await this.auditStore.logRelationshipChange({
        action: 'REMOVE',
        relationshipType: 'REFINES',
        sourceType: this.versionLabel,
        sourceId: versionId,
        targetType: this.nodeLabel,
        targetId: parentItemId
      }, transaction);
    }
    
    return deleted;
  }
  
  async findRefinesParents(itemId, transaction) {
    const query = `
      MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
      MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})
      WHERE id(item) = $itemId
      RETURN parent
      ORDER BY parent.title
    `;
    
    const result = await transaction.run(query, { itemId });
    return this.transformRecords(result.records, 'parent');
  }
  
  async findRefinesParentsByVersion(itemId, versionNumber, transaction) {
    const query = `
      MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
      MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})
      WHERE id(item) = $itemId AND version.version = $versionNumber
      RETURN parent
      ORDER BY parent.title
    `;
    
    const result = await transaction.run(query, { itemId, versionNumber });
    return this.transformRecords(result.records, 'parent');
  }
  
  // Similar patterns for IMPACTS relationships...
  async addImpactsRelation(versionId, targetType, targetId, transaction) {
    // Implementation follows same pattern as addRefinesRelation
    // with relationshipType: 'IMPACTS'
  }
  
  async removeImpactsRelation(versionId, targetType, targetId, transaction) {
    // Implementation follows same pattern as removeRefinesRelation
    // with relationshipType: 'IMPACTS'
  }
}
```

### 4. Store Registry and Initialization

#### Store Orchestration
```javascript
// store/index.js
import { BaseStore } from './base-store.js';
import { VersionedItemStore } from './versioned-item-store.js';
import { StakeholderCategoryStore } from './stakeholder-category.js';
import { OperationalRequirementStore } from './operational-requirement.js';
import { OperationalChangeStore } from './operational-change.js';
import { OperationalChangeMilestoneStore } from './operational-change-milestone.js';
import { RelationshipAuditLogStore } from './relationship-audit-log.js';

// Store instances
let stakeholderCategoryStore = null;
let regulatoryAspectStore = null;
let dataStore = null;
let serviceStore = null;
let operationalRequirementStore = null;
let operationalChangeStore = null;
let operationalChangeMilestoneStore = null;
let relationshipAuditLogStore = null;

export async function initializeStores() {
  try {
    await initializeConnection();
    const driver = getDriver();
    
    // Create store instances
    stakeholderCategoryStore = new StakeholderCategoryStore(driver);
    regulatoryAspectStore = new RegulatoryAspectStore(driver);
    dataStore = new DataStore(driver);
    serviceStore = new ServiceStore(driver);
    operationalRequirementStore = new OperationalRequirementStore(driver);
    operationalChangeStore = new OperationalChangeStore(driver);
    operationalChangeMilestoneStore = new OperationalChangeMilestoneStore(driver);
    relationshipAuditLogStore = new RelationshipAuditLogStore(driver);
    
    // Inject audit store into versioned stores
    operationalRequirementStore.setAuditStore(relationshipAuditLogStore);
    operationalChangeStore.setAuditStore(relationshipAuditLogStore);
    
    console.log('Store layer initialized successfully');
  } catch (error) {
    console.error('Failed to initialize store layer:', error.message);
    throw error;
  }
}

// Store access functions
export function getStakeholderCategoryStore() {
  if (!stakeholderCategoryStore) {
    throw new Error('Store layer not initialized. Call initializeStores() first.');
  }
  return stakeholderCategoryStore;
}

export function getOperationalRequirementStore() {
  if (!operationalRequirementStore) {
    throw new Error('Store layer not initialized. Call initializeStores() first.');
  }
  return operationalRequirementStore;
}

export function getRelationshipAuditLogStore() {
  if (!relationshipAuditLogStore) {
    throw new Error('Store layer not initialized. Call initializeStores() first.');
  }
  return relationshipAuditLogStore;
}

// Export with consistent naming
export { 
  getStakeholderCategoryStore as stakeholderCategoryStore,
  getOperationalRequirementStore as operationalRequirementStore,
  getRelationshipAuditLogStore as relationshipAuditLogStore
  // ... other stores
};
```

## Design Patterns

### 1. Transaction Pattern
```javascript
// Service layer transaction management
async function updateRequirementWithRelationships(itemId, data, relationships, userId) {
  const tx = createTransaction(userId);
  try {
    // 1. Update content (creates new version)
    const current = await reqStore.findById(itemId, tx);
    const updated = await reqStore.update(itemId, data, current.versionId, tx);
    
    // 2. Update relationships (no new version, with audit)
    await reqStore.removeRefinesRelation(updated.versionId, oldParentId, tx);
    await reqStore.addRefinesRelation(updated.versionId, newParentId, tx);
    
    await commitTransaction(tx);
    return updated;
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

### 2. Optimistic Locking Pattern
```javascript
// Version conflict detection and resolution
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
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('Update failed after maximum retries');
}
```

### 3. Relationship Audit Pattern
```javascript
// Consistent audit logging across all relationship operations
async function executeRelationshipOperation(operation, auditData, transaction) {
  let operationResult = false;
  
  try {
    // Execute the relationship operation
    operationResult = await operation();
    
    // Log to audit trail if successful
    if (operationResult && this.auditStore) {
      await this.auditStore.logRelationshipChange(auditData, transaction);
    }
    
    return operationResult;
  } catch (error) {
    // Relationship operation failed - don't create audit entry
    throw new StoreError(`Relationship operation failed: ${error.message}`, error);
  }
}

// Usage in concrete stores
async addImpactsRelation(versionId, targetType, targetId, transaction) {
  const operation = async () => {
    const query = `
      MATCH (version:${this.versionLabel}) WHERE id(version) = $versionId
      MATCH (target:${targetType}) WHERE id(target) = $targetId
      MERGE (version)-[:IMPACTS]->(target)
      RETURN count(*) as created
    `;
    const result = await transaction.run(query, { versionId, targetId });
    return result.records[0].get('created').toNumber() > 0;
  };
  
  const auditData = {
    action: 'ADD',
    relationshipType: 'IMPACTS',
    sourceType: this.versionLabel,
    sourceId: versionId,
    targetType: targetType,
    targetId: targetId
  };
  
  return await this.executeRelationshipOperation(operation, auditData, transaction);
}
```

### 4. Historical Reconstruction Pattern
```javascript
// Efficient historical state reconstruction
async function getItemStateAtTime(itemId, timestamp, transaction) {
  // 1. Get content version active at timestamp
  const contentQuery = `
    MATCH (item)-[:HAS_VERSION*]->(version)
    WHERE id(item) = $itemId 
      AND version.createdAt <= $timestamp
    RETURN version
    ORDER BY version.createdAt DESC
    LIMIT 1
  `;
  
  const contentResult = await transaction.run(contentQuery, { itemId, timestamp });
  const version = contentResult.records[0]?.get('version');
  
  if (!version) {
    return null; // Item didn't exist at that time
  }
  
  // 2. Reconstruct relationships at timestamp
  const relationships = await this.auditStore.reconstructRelationshipsAtTime(
    itemId, 
    timestamp, 
    transaction
  );
  
  // 3. Combine content + relationships
  return {
    ...version.properties,
    id: version.identity.toNumber(),
    relationships: relationships
  };
}
```

## Performance Optimizations

### 1. Connection Pooling
```javascript
// Efficient connection management
const connectionConfig = {
  maxConnectionPoolSize: 10,
  connectionAcquisitionTimeout: 60000,
  maxTransactionRetryTime: 15000,
  connectionTimeout: 5000
};

// Connection health monitoring
export async function verifyConnectivity() {
  const session = driver.session();
  try {
    const result = await session.run('RETURN 1 as health');
    return result.records[0].get('health').toNumber() === 1;
  } finally {
    await session.close();
  }
}
```

### 2. Query Optimization
```javascript
// Efficient latest version queries
const optimizedLatestQuery = `
  MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version:OperationalRequirementVersion)
  WHERE id(item) = $itemId
  RETURN item, version
`;

// Batch relationship queries
const batchRelationshipQuery = `
  MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version:OperationalRequirementVersion)
  WHERE id(item) IN $itemIds
  OPTIONAL MATCH (version)-[:REFINES]->(parent:OperationalRequirement)
  OPTIONAL MATCH (version)-[:IMPACTS]->(impact)
  RETURN item, version, collect(DISTINCT parent) as parents, collect(DISTINCT impact) as impacts
`;
```

### 3. Audit Trail Indexing Strategy
```javascript
// Recommended Neo4j indexes for audit trail performance
const auditIndexes = [
  'CREATE INDEX audit_timestamp_idx FOR (a:RelationshipAuditLog) ON (a.timestamp)',
  'CREATE INDEX audit_source_idx FOR (a:RelationshipAuditLog) ON (a.sourceId)',
  'CREATE INDEX audit_target_idx FOR (a:RelationshipAuditLog) ON (a.targetId)',
  'CREATE INDEX audit_type_idx FOR (a:RelationshipAuditLog) ON (a.relationshipType)'
];

// Efficient audit trail queries using indexes
const indexedAuditQuery = `
  MATCH (audit:RelationshipAuditLog)
  WHERE audit.sourceId = $sourceId
    AND audit.relationshipType = $relationshipType
    AND audit.timestamp <= $maxTimestamp
  RETURN audit
  ORDER BY audit.timestamp ASC
`;
```

## Error Handling Patterns

### 1. Store Error Hierarchy
```javascript
// store/errors.js
export class StoreError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'StoreError';
    this.cause = cause;
  }
}

export class TransactionError extends StoreError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'TransactionError';
  }
}

export class AuditError extends StoreError {
  constructor(message, cause = null) {
    super(message, cause);
    this.name = 'AuditError';
  }
}

export class VersionConflictError extends StoreError {
  constructor(expectedVersion, actualVersion) {
    super(`Version conflict: expected ${expectedVersion}, found ${actualVersion}`);
    this.name = 'VersionConflictError';
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}
```

### 2. Graceful Error Recovery
```javascript
// Robust error handling in store operations
async function safeRelationshipOperation(operation, auditData, transaction) {
  try {
    const result = await operation();
    
    // Attempt audit logging
    try {
      if (result && this.auditStore) {
        await this.auditStore.logRelationshipChange(auditData, transaction);
      }
    } catch (auditError) {
      // Log audit failure but don't fail the operation
      console.warn('Audit logging failed:', auditError.message);
      // Could implement audit retry queue here
    }
    
    return result;
  } catch (error) {
    if (error.code === 'Neo.TransientError.Transaction.DeadlockDetected') {
      throw new TransactionError('Deadlock detected - retry recommended', error);
    }
    
    if (error.code === 'Neo.ClientError.Statement.ConstraintValidation') {
      throw new StoreError('Data validation failed', error);
    }
    
    throw new StoreError(`Operation failed: ${error.message}`, error);
  }
}
```

## Testing Patterns

### 1. Transaction Testing
```javascript
// Unit test pattern for store operations
describe('OperationalRequirementStore', () => {
  let store;
  let transaction;
  
  beforeEach(async () => {
    await initializeStores();
    store = operationalRequirementStore();
    transaction = createTransaction('test-user');
  });
  
  afterEach(async () => {
    if (transaction.isActive) {
      await rollbackTransaction(transaction);
    }
  });
  
  test('should create requirement with audit trail', async () => {
    const requirement = await store.create({
      title: 'Test Requirement',
      type: 'OR',
      statement: 'Test statement'
    }, transaction);
    
    expect(requirement.itemId).toBeDefined();
    expect(requirement.version).toBe(1);
    
    await commitTransaction(transaction);
  });
});
```

### 2. Audit Trail Testing
```javascript
// Testing audit trail functionality
test('should track relationship changes in audit log', async () => {
  const req1 = await store.create({ title: 'Req 1', type: 'OR' }, transaction);
  const req2 = await store.create({ title: 'Req 2', type: 'OR' }, transaction);
  
  // Add relationship
  await store.addRefinesRelation(req1.versionId, req2.itemId, transaction);
  
  // Check audit trail
  const auditTrail = await relationshipAuditLogStore().findAuditTrailForItem(
    req1.itemId, 
    transaction
  );
  
  expect(auditTrail).toHaveLength(1);
  expect(auditTrail[0].action).toBe('ADD');
  expect(auditTrail[0].relationshipType).toBe('REFINES');
  
  await commitTransaction(transaction);
});
```

## Future Enhancements

### 1. Baseline Integration
```javascript
// Future baseline creation support
export class ODPBaselineStore extends BaseStore {
  constructor(driver) {
    super(driver, 'ODPBaseline');
  }
  
  async createBaseline(title, waveId, userId) {
    const tx = createTransaction(userId);
    try {
      // 1. Create baseline node
      const baseline = await this.create({ title }, tx);
      
      // 2. Capture all current operational items
      await this.captureOperationalItems(baseline.id, tx);
      
      // 3. Capture all current relationships
      await this.captureRelationships(baseline.id, tx);
      
      await commitTransaction(tx);
      return baseline;
    } catch (error) {
      await rollbackTransaction(tx);
      throw error;
    }
  }
  
  async captureRelationships(baselineId, transaction) {
    const query = `
      MATCH (item)-[:LATEST_VERSION]->(version)
      MATCH (version)-[rel]->(target)
      WHERE type(rel) IN ['REFINES', 'IMPACTS', 'SATISFIES', 'SUPERSEDS']
      
      CREATE (baselineRel:BaselineRelationship {
        type: type(rel),
        sourceItemId: id(item),
        sourceVersionId: id(version),
        targetType: labels(target)[0],
        targetId: id(target)
      })-[:BELONGS_TO]->(baseline:ODPBaseline)
      WHERE id(baseline) = $baselineId
      
      RETURN count(baselineRel) as captured
    `;
    
    const result = await transaction.run(query, { baselineId });
    return result.records[0].get('captured').toNumber();
  }
}
```

### 2. Advanced Audit Queries
```javascript
// Future comprehensive audit analysis
export class AuditAnalysisService {
  async getChangeImpactAnalysis(itemId, fromTimestamp, toTimestamp) {
    // Analyze all changes to an item and its relationships over time period
    // Return impact report including affected downstream items
  }
  
  async getRelationshipEvolution(sourceId, targetId, relationshipType) {
    // Track complete evolution of a specific relationship
    // Return timeline of adds/removes with user attribution
  }
  
  async getUserActivityReport(userId, fromTimestamp, toTimestamp) {
    // Generate report of all relationship changes by specific user
    // Include statistics and affected items
  }
}
```

This internal design provides a robust, scalable foundation for the ODP store layer with comprehensive relationship audit trails, efficient versioning, and clear patterns for future enhancement.