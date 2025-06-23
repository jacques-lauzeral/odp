# Storage Layer Design - Multi-Context

## Overview
Multi-context operations enable querying operational entities in different temporal and filtered contexts. The system supports baseline-aware queries for historical state and wave filtering for deployment timeline planning, with seamless parameter combinations.

## Context Parameters

### baselineId (Historical Context)
**Purpose**: Query entities as they existed at baseline creation time
**Behavior**: Returns versions captured in the specified baseline instead of latest versions
**Implementation**: Uses HAS_ITEMS relationships from baseline to captured versions

### fromWaveId (Wave Filtering)
**Purpose**: Filter entities based on deployment timeline milestones
**Behavior**: Applies cascading filter from waves to milestones to changes to requirements
**Implementation**: Queries milestone timing and requirement references

### Parameter Combinations
1. **Current state**: No parameters - returns latest versions
2. **Historical state**: `baselineId` only - returns baseline-captured versions
3. **Filtered current**: `fromWaveId` only - returns latest versions filtered by wave
4. **Filtered historical**: Both parameters - returns baseline versions filtered by wave

## Baseline-Aware Operations

### Baseline Creation Process
```cypher
// 1. Create baseline node
CREATE (baseline:Baseline {
  title: $title,
  createdAt: $timestamp,
  createdBy: $userId
})

// 2. Capture all latest versions atomically
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE item:OperationalRequirement OR item:OperationalChange
CREATE (baseline)-[:HAS_ITEMS]->(version)
RETURN count(version) as capturedCount
```

### Query Resolution Strategy
**Without baseline context**:
```cypher
// Standard latest version query
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE id(item) = $itemId
RETURN item, version
```

**With baseline context**:
```cypher
// Baseline-specific version query
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
RETURN item, version
```

### Baseline Relationship Queries
**Current relationships**:
```cypher
MATCH (item)-[:LATEST_VERSION]->(version)-[:IMPACTS]->(target)
WHERE id(item) = $itemId
RETURN target
```

**Baseline relationships**:
```cypher
MATCH (baseline)-[:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId AND id(item) = $itemId
MATCH (version)-[:IMPACTS]->(target)
RETURN target
```

## Wave Filtering Implementation

### Filtering Logic
**OperationalChange Filtering**:
- Include only OCs that have at least one milestone targeting a wave at or after the fromWave date
- Comparison based on wave.date field (e.g., "2025-06-30" >= "2025-03-31")

**OperationalRequirement Filtering**:
- Include only ORs that are referenced by at least one filtered OC via SATISFIES or SUPERSEDS relationships
- Include all ancestor ORs via REFINES hierarchy (upward cascade)
- Cascading filter: Wave → Milestones → Changes → Requirements → REFINES Ancestors

### Implementation Queries
**OperationalChange wave filtering**:
```cypher
// Find OCs with milestones at/after specified wave
MATCH (ocVersion:OperationalChangeVersion)
WHERE EXISTS {
  MATCH (ocVersion)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
  MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
  WHERE targetWave.date >= fromWave.date
}
RETURN ocVersion
```

**OperationalRequirement wave filtering**:
```cypher
// Find ORs referenced by filtered OCs + their REFINES ancestors
MATCH (filteredOCVersion)-[:SATISFIES|SUPERSEDS]->(orItem:OperationalRequirement)
WHERE id(filteredOCVersion) IN $filteredOCVersionIds
MATCH path = (orItem)<-[:REFINES*0..]-(descendant:OperationalRequirement)
RETURN DISTINCT descendant
```

### Wave Date Comparison
```javascript
// Wave filtering uses date field for temporal comparison
const fromWave = { id: 456, name: "2025.2", date: "2025-06-30" };
const targetWave = { id: 789, name: "2025.3", date: "2025-09-30" };

// Include milestone if: targetWave.date >= fromWave.date
// Neo4j date() function for robust comparison
WHERE date(targetWave.date) >= date(fromWave.date)
```

## Multi-Context Query Implementation

### Query Method Pattern
```javascript
async findById(itemId, transaction, baselineId = null, fromWaveId = null) {
  let version;
  
  // Step 1: Resolve baseline context
  if (baselineId) {
    version = await this._findByIdInBaseline(itemId, baselineId, transaction);
  } else {
    version = await this._findLatestById(itemId, transaction);
  }
  
  // Step 2: Apply wave filtering if specified
  if (fromWaveId && version) {
    const passesFilter = await this._checkWaveFilter(version, fromWaveId, transaction);
    return passesFilter ? version : null;
  }
  
  return version;
}
```

### Wave Filter Implementation
```javascript
async _checkWaveFilter(version, fromWaveId, transaction) {
  if (this.entityType === 'OperationalChange') {
    // Check if any milestone targets wave at/after fromWave
    return await this._hasMilestoneAtOrAfterWave(version.versionId, fromWaveId, transaction);
  } else if (this.entityType === 'OperationalRequirement') {
    // Check if referenced by any filtered OC
    return await this._isReferencedByFilteredOCs(version.itemId, fromWaveId, transaction);
  }
  return true; // Other entity types pass through
}
```

### Baseline + Wave Combined Filtering
```javascript
async findAll(transaction, baselineId = null, fromWaveId = null) {
  // Step 1: Get base result set (current or baseline)
  let versions;
  if (baselineId) {
    versions = await this._findAllInBaseline(baselineId, transaction);
  } else {
    versions = await this._findAllLatest(transaction);
  }
  
  // Step 2: Apply wave filtering to result set
  if (fromWaveId) {
    const filteredVersions = [];
    for (const version of versions) {
      const passesFilter = await this._checkWaveFilter(version, fromWaveId, transaction);
      if (passesFilter) {
        filteredVersions.push(version);
      }
    }
    return filteredVersions;
  }
  
  return versions;
}
```

## ODPEdition Parameter Resolution

### Route Layer Responsibility
ODPEdition parameter resolution happens at the route layer, not in the store layer:

```javascript
// Route layer resolves ODPEdition to baseline + wave
app.get('/operational-requirements', async (req, res) => {
  let baselineId = req.query.baseline;
  let fromWaveId = req.query.fromWave;
  
  // ODPEdition takes precedence and excludes baseline/fromWave
  if (req.query.odpEdition) {
    const context = await odpEditionStore().resolveContext(req.query.odpEdition, tx);
    baselineId = context.baselineId;
    fromWaveId = context.fromWaveId;
  }
  
  // Store layer receives resolved parameters
  const requirements = await operationalRequirementStore().findAll(tx, baselineId, fromWaveId);
});
```

### Context Resolution Method
```javascript
// ODPEditionStore.resolveContext()
async resolveContext(odpEditionId, transaction) {
  const result = await transaction.run(`
    MATCH (edition:ODPEdition)-[:EXPOSES]->(baseline:Baseline)
    MATCH (edition)-[:STARTS_FROM]->(wave:Wave)
    WHERE id(edition) = $odpEditionId
    RETURN id(baseline) as baselineId, id(wave) as fromWaveId
  `, { odpEditionId });
  
  if (result.records.length === 0) {
    throw new StoreError('ODPEdition not found');
  }
  
  const record = result.records[0];
  return {
    baselineId: record.get('baselineId').toNumber(),
    fromWaveId: record.get('fromWaveId').toNumber()
  };
}
```

### Store Layer Transparency
```javascript
// Store layer methods always receive resolved parameters
// No knowledge of ODPEdition - only baseline + wave parameters
async findAll(transaction, baselineId = null, fromWaveId = null) {
  // Implementation handles both parameters uniformly
  // Whether they came from direct parameters or ODPEdition resolution
}
```

## Performance Optimization

### Query Efficiency Patterns
**Latest Version Queries**:
```cypher
// Efficient: Single relationship hop
MATCH (item)-[:LATEST_VERSION]->(version)
WHERE id(item) = $itemId
```

**Baseline Queries**:
```cypher
// Efficient: Direct HAS_ITEMS relationship
MATCH (baseline)-[:HAS_ITEMS]->(version)
WHERE id(baseline) = $baselineId
```

**Wave Filtering Queries**:
```cypher
// Optimized: Use EXISTS for milestone checking
WHERE EXISTS {
  MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(wave)
  WHERE wave.date >= $fromWaveDate
}
```

### Caching Strategies
- **Wave date lookup**: Cache wave date values for filtering comparisons
- **Baseline item sets**: Cache baseline HAS_ITEMS relationships for frequent queries
- **Filtered result sets**: Cache wave-filtered entity sets within transaction scope

### Batch Operations
```javascript
// Efficient batch wave filtering
const filteredOCVersionIds = await this._batchFilterOCsByWave(fromWaveId, transaction);
const filteredORs = await this._batchFilterORsByOCs(filteredOCVersionIds, transaction);
```

## Data Consistency

### Baseline Integrity
- **Atomic capture**: All latest versions captured in single transaction
- **Immutable snapshots**: Baseline content never changes after creation
- **Complete state**: Baseline captures entire system state at creation time
- **Relationship preservation**: Captured versions maintain their exact relationship state

### Wave Filtering Consistency
- **Temporal accuracy**: Wave date comparisons ensure correct timeline filtering
- **Cascade integrity**: OR filtering accurately reflects OC references
- **Relationship consistency**: Filtered sets maintain referential integrity
- **Version alignment**: Wave filtering respects version-specific milestones

### Multi-Context Validation
```javascript
// Validate baseline exists
if (baselineId !== null) {
  const baselineExists = await this._checkBaselineExists(baselineId, transaction);
  if (!baselineExists) {
    throw new StoreError('Baseline not found');
  }
}

// Validate wave exists  
if (fromWaveId !== null) {
  const waveExists = await this._checkWaveExists(fromWaveId, transaction);
  if (!waveExists) {
    throw new StoreError('Wave not found');
  }
}
```

## Error Handling

### Context Parameter Errors
- `'Baseline not found'` - Invalid baselineId parameter
- `'Wave not found'` - Invalid fromWaveId parameter
- `'ODPEdition not found'` - Invalid odpEditionId in route layer resolution

### Filtering Result Errors
- `'No matching milestones'` - Wave filter results in empty OC set
- `'No baseline items found'` - Baseline exists but captured no operational entities

### Query Combination Errors
```javascript
// Graceful handling of empty result sets
if (baselineVersions.length === 0) {
  console.warn(`Baseline ${baselineId} contains no operational entities`);
  return [];
}

if (waveFilteredVersions.length === 0) {
  console.info(`Wave filter ${fromWaveId} matched no entities`);
  return [];
}
```

## Integration Patterns

### Service Layer Integration
```javascript
// Service methods receive resolved context parameters
class OperationalRequirementService {
  async findAll(baselineId, fromWaveId, userId) {
    const tx = createTransaction(userId);
    try {
      // Store layer handles multi-context transparently
      const requirements = await operationalRequirementStore().findAll(tx, baselineId, fromWaveId);
      await commitTransaction(tx);
      return requirements;
    } catch (error) {
      await rollbackTransaction(tx);
      throw error;
    }
  }
}
```

### Client Usage Patterns
```javascript
// Client can use any parameter combination
const currentRequirements = await api.get('/operational-requirements');
const baselineRequirements = await api.get('/operational-requirements?baseline=123');
const futureRequirements = await api.get('/operational-requirements?fromWave=456');
const baselineFuture = await api.get('/operational-requirements?baseline=123&fromWave=456');
const editionRequirements = await api.get('/operational-requirements?odpEdition=789');
```