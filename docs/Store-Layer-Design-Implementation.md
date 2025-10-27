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
- Dual-node creation and management (Item + ItemVersion)
- Optimistic locking with expectedVersionId
- Relationship inheritance and override logic
- Multi-context query support

**Key Implementation**:
```javascript
class VersionedItemStore extends BaseStore {
    constructor(driver, itemLabel, versionLabel) {
        super(driver, itemLabel);
        this.versionLabel = versionLabel;
    }

    async create(data, transaction) {
        // Create Item node
        const itemResult = await transaction.run(`
      CREATE (item:${this.itemLabel} {
        title: $title,
        createdAt: datetime(),
        createdBy: $userId,
        latest_version: 1
      })
      RETURN item
    `, { title: data.title, userId: transaction.userId });

        const itemId = this.normalizeId(itemResult.records[0].get('item').identity);

        // Create ItemVersion node (version 1)
        const versionResult = await transaction.run(`
      MATCH (item:${this.itemLabel}) WHERE id(item) = $itemId
      CREATE (version:${this.versionLabel} {
        version: 1,
        createdAt: datetime(),
        createdBy: $userId,
        ...content
      })
      CREATE (item)-[:LATEST_VERSION]->(version)
      CREATE (version)-[:VERSION_OF]->(item)
      RETURN version
    `, { itemId, userId: transaction.userId, ...data });

        // Create relationships
        await this._createRelationships(versionId, data, transaction);

        return this._buildEntityResponse(itemId, versionId, data);
    }

    async update(itemId, data, expectedVersionId, transaction) {
        // Optimistic locking check
        const currentVersion = await this._getCurrentVersion(itemId, transaction);
        if (currentVersion.id !== expectedVersionId) {
            throw new OptimisticLockError('Version mismatch');
        }

        // Create new version
        const newVersion = currentVersion.version + 1;
        // ... implementation
    }
}
```

### Code Generation Pattern
**Additional Responsibilities**:
- Automatic unique code generation for operational entities
- Sequential numbering per entity type and drafting group
- Transaction-safe code assignment

**Key Implementation**:
```javascript
class VersionedItemStore extends BaseStore {
  /**
   * Find maximum code number for a given type+DRG combination
   */
  async _findMaxCodeNumber(entityType, drg, transaction) {
    const codePrefix = `${entityType}-${drg}-`;
    
    const result = await transaction.run(`
      MATCH (item:${this.nodeLabel})
      WHERE item.code STARTS WITH $codePrefix
      RETURN item.code as code
      ORDER BY item.code DESC
      LIMIT 1
    `, { codePrefix });

    if (result.records.length === 0) {
      return 0;
    }

    const maxCode = result.records[0].get('code');
    // Extract numeric part from "XX-YYY-####"
    const numericPart = maxCode.substring(maxCode.lastIndexOf('-') + 1);
    return parseInt(numericPart, 10);
  }

  /**
   * Generate unique code for entity
   */
  async _generateCode(entityType, drg, transaction) {
    const maxNumber = await this._findMaxCodeNumber(entityType, drg, transaction);
    const nextNumber = maxNumber + 1;
    const paddedNumber = nextNumber.toString().padStart(4, '0');
    return `${entityType}-${drg}-${paddedNumber}`;
  }

  /**
   * Abstract method - concrete stores must implement
   * Returns entity type prefix: 'ON', 'OR', or 'OC'
   */
  _getEntityTypeForCode(data) {
    throw new Error('_getEntityTypeForCode must be implemented by concrete store');
  }

  async create(data, transaction) {
    // Generate code if drg is provided
    let code = null;
    if (data.drg) {
      const entityType = this._getEntityTypeForCode(data);
      code = await this._generateCode(entityType, data.drg, transaction);
    }

    // Create Item node with code
    const itemResult = await transaction.run(`
      CREATE (item:${this.itemLabel} {
        title: $title,
        code: $code,
        createdAt: datetime(),
        createdBy: $userId
      })
      RETURN item
    `, { title: data.title, code, userId: transaction.userId });

    // ... rest of creation logic
  }
}
```

**Concrete Store Implementations**:
```javascript
// OperationalRequirementStore
class OperationalRequirementStore extends VersionedItemStore {
  _getEntityTypeForCode(data) {
    // Returns 'ON' or 'OR' based on type field
    return data.type || 'OR';
  }
}

// OperationalChangeStore
class OperationalChangeStore extends VersionedItemStore {
  _getEntityTypeForCode(data) {
    // Always returns 'OC'
    return 'OC';
  }
}
```

**Code Properties**:
- **Atomicity**: Generated within transaction to prevent race conditions
- **Immutability**: Stored on Item node, never changes across versions
- **Uniqueness**: Database constraint enforces global uniqueness
- **Scoping**: Independent counter per TYPE+DRG combination
- **Format**: `{TYPE}-{DRG}-####` (e.g., ON-IDL-0001, OR-NM_B2B-0042)

**Query Integration**:
All queries returning operational entities include the code field:
```javascript
// findById query
RETURN id(item) as itemId, 
       item.title as title, 
       item.code as code,  // Code included
       id(version) as versionId

// findAll query  
RETURN id(item) as itemId,
       item.title as title,
       item.code as code,  // Code included
       version { .* } as versionData
```


## Relationship Management Patterns

### Relationship Creation
```javascript
async _createRelationships(versionId, data, transaction) {
  const relationshipTypes = {
    refinesParents: 'REFINES',
    impactsServices: 'IMPACTS',
    satisfiesRequirements: 'SATISFIES'
  };

  for (const [field, relationshipType] of Object.entries(relationshipTypes)) {
    if (data[field] && data[field].length > 0) {
      await this._createRelationshipBatch(
        versionId,
        data[field],
        relationshipType,
        transaction
      );
    }
  }
}

async _createRelationshipBatch(sourceId, targetIds, relationshipType, transaction) {
  await transaction.run(`
    MATCH (source) WHERE id(source) = $sourceId
    UNWIND $targetIds as targetId
    MATCH (target) WHERE id(target) = targetId
    CREATE (source)-[:${relationshipType}]->(target)
  `, { sourceId, targetIds });
}
```

### Document Reference Relationships
```javascript
async _createDocumentReferences(versionId, documentReferences, transaction) {
  if (!documentReferences || documentReferences.length === 0) return;

  for (const ref of documentReferences) {
    await transaction.run(`
      MATCH (version) WHERE id(version) = $versionId
      MATCH (doc:Document) WHERE id(doc) = $documentId
      CREATE (version)-[:REFERENCES {note: $note}]->(doc)
    `, {
      versionId,
      documentId: ref.documentId,
      note: ref.note || ''
    });
  }
}
```

### Relationship Validation
```javascript
async _validateRelationships(data, transaction) {
  // Validate entity existence
  const allIds = [
    ...(data.refinesParents || []),
    ...(data.impactsServices || []),
    ...(data.documentReferences?.map(r => r.documentId) || [])
  ];

  if (allIds.length > 0) {
    await this._validateEntitiesExist(allIds, transaction);
  }

  // Validate relationship constraints
  if (data.implementedONs) {
    await this._validateImplementedONsTypes(data.implementedONs, transaction);
  }
}

async _validateEntitiesExist(ids, transaction) {
  const result = await transaction.run(`
    UNWIND $ids as id
    OPTIONAL MATCH (n) WHERE id(n) = id
    RETURN count(n) as found, count(*) as expected
  `, { ids });

  const record = result.records[0];
  if (record.get('found') !== record.get('expected')) {
    throw new ValidationError('One or more referenced entities not found');
  }
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
    dataCategory: new DataCategoryStore(driver),
    service: new ServiceStore(driver),
    wave: new WaveStore(driver),
    document: new DocumentStore(driver),
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

export function documentStore() {
  if (!storeInstances.document) {
    throw new Error('Stores not initialized - call initializeStores() first');
  }
  return storeInstances.document;
}

// ... similar accessor functions for all stores
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
  if (!storeInstances.newEntity) {
    throw new Error('Stores not initialized - call initializeStores() first');
  }
  return storeInstances.newEntity;
}
```

## Transaction Patterns

### Standard Transaction Flow
```javascript
export async function createEntity(data, userId) {
  const tx = createTransaction(userId);
  try {
    const entity = await entityStore().create(data, tx);
    await commitTransaction(tx);
    return entity;
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

### Multi-Operation Transaction
```javascript
export async function createHierarchy(parentData, childData, userId) {
  const tx = createTransaction(userId);
  try {
    const parent = await entityStore().create(parentData, tx);
    const child = await entityStore().create(childData, tx);
    await entityStore().createRefinesRelation(child.id, parent.id, tx);
    await commitTransaction(tx);
    return { parent, child };
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

## Error Handling Patterns

### Store-Level Error Handling
```javascript
class StoreError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.details = details;
  }
}

async create(data, transaction) {
  try {
    // Implementation
  } catch (error) {
    throw new StoreError(
      'Failed to create entity',
      'CREATE_FAILED',
      { originalError: error.message, data }
    );
  }
}
```

### Validation Error Handling
```javascript
class ValidationError extends StoreError {
  constructor(message, details) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

class OptimisticLockError extends StoreError {
  constructor(message) {
    super(message, 'OPTIMISTIC_LOCK_FAILED');
  }
}
```

## Performance Considerations

### Efficient Queries
```javascript
// Use UNWIND for batch operations
async createMultipleRelationships(sourceId, targetIds, type, transaction) {
  await transaction.run(`
    MATCH (source) WHERE id(source) = $sourceId
    UNWIND $targetIds as targetId
    MATCH (target) WHERE id(target) = targetId
    CREATE (source)-[:${type}]->(target)
  `, { sourceId, targetIds });
}

// Use EXISTS for conditional checks
async hasRelationship(sourceId, targetId, type, transaction) {
  const result = await transaction.run(`
    MATCH (source), (target)
    WHERE id(source) = $sourceId AND id(target) = $targetId
    RETURN EXISTS((source)-[:${type}]->(target)) as exists
  `, { sourceId, targetId });
  
  return result.records[0].get('exists');
}
```

### Index Usage
```javascript
// Ensure indexes exist for frequent queries
export async function createIndexes(driver) {
  const session = driver.session();
  try {
    await session.run('CREATE INDEX IF NOT EXISTS FOR (n:OperationalRequirement) ON (n.title)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (n:OperationalChange) ON (n.title)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (n:Wave) ON (n.year, n.quarter)');
    // Unique constraint for code field
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (n:OperationalRequirement) REQUIRE n.code IS UNIQUE');
    await session.run('CREATE CONSTRAINT IF NOT EXISTS FOR (n:OperationalChange) REQUIRE n.code IS UNIQUE');
  } finally {
    await session.close();
  }
}
```

## Testing Patterns

### Store Unit Tests
```javascript
describe('DocumentStore', () => {
    let store;
    let transaction;

    beforeEach(async () => {
        await initializeStores();
        store = documentStore();
        transaction = createTransaction('test-user');
    });

    afterEach(async () => {
        await rollbackTransaction(transaction);
    });

    it('should create document', async () => {
        const doc = await store.create({
            name: 'Test Document',
            version: '1.0',
            description: 'Test description',
            url: 'https://example.com/doc.pdf'
        }, transaction);

        expect(doc.id).toBeDefined();
        expect(doc.name).toBe('Test Document');
    });
});
```