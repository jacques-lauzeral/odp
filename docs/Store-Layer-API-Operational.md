# Store Layer API - Operational Entities

## Overview
API documentation for operational entities supporting versioning, baseline operations, wave filtering, and content filtering. These entities support multi-context queries with optional historical and filtered views.

## Common Patterns

### Multi-Context Parameter Support
All operational entity queries support optional context and filtering parameters:
- **baselineId**: Historical context (returns versions captured in baseline)
- **fromWaveId**: Wave filtering (temporal filtering based on milestones)
- **filters**: Content filtering (text search, category filtering, type/visibility filtering)

### Enhanced findAll Signature
```javascript
const entities = await store.findAll(transaction, baselineId = null, fromWaveId = null, filters = {})
```

**Multi-Context Behavior**:
- No context: Returns latest versions
- Baseline only: Returns versions captured in baseline
- Wave only: Returns latest versions filtered by wave
- Filters only: Returns latest versions filtered by content
- Combined: All parameters can be used together for complex queries

**Wave Filtering Context**: For operational entities supporting wave filtering
- **OperationalChanges**: Include only those with milestones targeting waves at/after the fromWave date
- **OperationalRequirements**: Include only those referenced by filtered OperationalChanges via SATISFIES/SUPERSEDS, plus all ancestor requirements via REFINES hierarchy (upward cascade)

---

## OperationalRequirementStore
**Inheritance**: `VersionedItemStore → BaseStore`

### Entity Model
```javascript
{
  // VersionedItemStore fields
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
  flows: string,           // Rich text
  flowExamples: string,    // Rich text
  
  // Relationship fields
  refinesParents: Array<number>,      // OperationalRequirement Item IDs
  impactsStakeholderCategories: Array<number>, // StakeholderCategory IDs
  impactsData: Array<number>,         // DataCategory IDs
  impactsServices: Array<number>,     // Service IDs
  impactsRegulatoryAspects: Array<number>     // RegulatoryAspect IDs
}
```

### Core Methods

### findById(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const entity = await store.findById(itemId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `itemId: number` - Item node ID
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context for historical queries
- `fromWaveId: number|null` - Optional wave filtering

**Returns**: `Promise<object|null>` - Entity with relationships or null  
**Multi-Context Behavior**:
- No context: Returns latest version
- Baseline only: Returns version captured in baseline
- Wave only: Returns latest version if passes wave filter
- Both: Returns baseline version if passes wave filter

### findAll(transaction, baselineId = null, fromWaveId = null, filters = {})
```javascript
const entities = await store.findAll(transaction, baselineId, fromWaveId, filters)
```

**Enhanced Parameters**:
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context
- `fromWaveId: number|null` - Optional wave filtering
- `filters: object` - Optional content filtering

**Filters Object Structure**:
```javascript
filters = {
  type: 'OR',                    // 'ON' | 'OR' | null
  title: 'authentication',      // Title pattern string | null
  text: 'security',             // Full-text search string | null
  dataCategory: [123, 456],     // Array of DataCategory IDs | null
  stakeholderCategory: [789],   // Array of StakeholderCategory IDs | null
  service: [101, 102],          // Array of Service IDs | null
  regulatoryAspect: [234]       // Array of RegulatoryAspect IDs | null
}
```

**Content Filtering Behavior**:
- **type**: Filters by requirement type (ON/OR)
- **title**: Pattern matching against title field
- **text**: Full-text search across title, statement, rationale, flows, flowExamples, references, risksAndOpportunities
- **Category filters**: Filters by relationships to setup entities (OR logic within each category)

**Returns**: `Promise<Array<object>>` - Filtered entities with relationships
**Multi-Context Behavior**: Similar to `findById` with additional content filtering

### getVersionHistory(itemId, transaction)
```javascript
const history = await store.getVersionHistory(itemId, transaction)
```
**Returns**: `Promise<Array<object>>` - Version metadata (newest first)

### patch(itemId, patchPayload, expectedVersionId, transaction)
```javascript
const entity = await store.patch(itemId, patchPayload, expectedVersionId, transaction)
```
**Behavior**: Creates new version with partial updates + relationship inheritance

**Patch Payload**: Can include any subset of entity fields. Arrays copy from previous version, specified arrays replace previous version

### findChildren(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const children = await store.findChildren(itemId, transaction, baselineId, fromWaveId)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Requirements that refine this one

### findRequirementsThatImpact(targetLabel, targetId, transaction, baselineId = null, fromWaveId = null)
```javascript
const requirements = await store.findRequirementsThatImpact('Service', serviceId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `targetLabel: string` - 'StakeholderCategory'|'DataCategory'|'Service'|'RegulatoryAspect'
- `targetId: number` - Target entity ID

**Returns**: `Promise<Array<{id: number, title: string}>>` - Requirements impacting the target

---

## OperationalChangeStore
**Inheritance**: `VersionedItemStore → BaseStore`

### Entity Model
```javascript
{
  // VersionedItemStore fields
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
    id: number,             // Technical node ID (changes with each version)
    milestoneKey: string,   // Stable identifier (preserved across versions)
    title: string,
    description: string,
    eventTypes: Array<string>,
    wave?: {               // Wave information (optional)
      id: number,
      name: string,
      date: string
    }
  }>
}
```

### Core Methods

### findById(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const entity = await store.findById(itemId, transaction, baselineId, fromWaveId)
```
**Behavior**: Same multi-context behavior as OperationalRequirementStore

### findAll(transaction, baselineId = null, fromWaveId = null, filters = {})
```javascript
const entities = await store.findAll(transaction, baselineId, fromWaveId, filters)
```

**Enhanced Parameters**: Same as OperationalRequirementStore

**Filters Object Structure**:
```javascript
filters = {
  visibility: 'NETWORK',        // 'NM' | 'NETWORK' | null
  title: 'database',           // Title pattern string | null
  text: 'performance',         // Full-text search string | null
  stakeholderCategory: [123],  // Array of StakeholderCategory IDs | null
  dataCategory: [456, 789],    // Array of DataCategory IDs | null
  service: [101],              // Array of Service IDs | null
  regulatoryAspect: [234]      // Array of RegulatoryAspect IDs | null
}
```

**Content Filtering Behavior**:
- **visibility**: Filters by change visibility (NM/NETWORK)
- **title**: Pattern matching against title field
- **text**: Full-text search across title and description fields
- **Category filters**: Filters by impact through SATISFIES/SUPERSEDES requirements (OR logic within each category)

**Impact Filtering Logic**: Category filters work through requirements the changes satisfy/supersede:
1. Find requirements that impact the specified categories
2. Find changes that SATISFY or SUPERSEDE those requirements
3. Return matching changes

### getVersionHistory(itemId, transaction)
```javascript
const history = await store.getVersionHistory(itemId, transaction)
```
**Returns**: `Promise<Array<object>>` - Version metadata (newest first)

### patch(itemId, patchPayload, expectedVersionId, transaction)
```javascript
const entity = await store.patch(itemId, patchPayload, expectedVersionId, transaction)
```
**Behavior**: Creates new version with partial updates + relationship and milestone inheritance

**Milestone Preservation**: Each milestone has a `milestoneKey` (UUID-based) preserved across versions

### findMilestoneByKey(itemId, milestoneKey, transaction, baselineId = null, fromWaveId = null)
```javascript
const milestone = await store.findMilestoneByKey(itemId, "ms_uuid", transaction, baselineId, fromWaveId)
```
**Parameters**:
- `itemId: number` - OperationalChange Item ID
- `milestoneKey: string` - Stable milestone identifier
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context
- `fromWaveId: number|null` - Optional wave filtering

**Returns**: `Promise<object|null>` - Milestone object with wave information or null if not found

**Multi-Context Support**:
- Latest version: Returns milestone from current version if exists
- Baseline context: Returns milestone from baseline-captured version if exists
- Wave filtering: Returns milestone only if it passes wave date filter

### findMilestonesByChange(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const milestones = await store.findMilestonesByChange(itemId, transaction, baselineId, fromWaveId)
```
**Returns**: `Promise<Array<object>>` - All milestones for the change with full wave information

### findChangesThatSatisfyRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const changes = await store.findChangesThatSatisfyRequirement(reqId, transaction, baselineId, fromWaveId)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Changes satisfying the requirement

### findChangesThatSupersedeRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const changes = await store.findChangesThatSupersedeRequirement(reqId, transaction, baselineId, fromWaveId)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Changes superseding the requirement

### findMilestonesByWave(waveId, transaction, baselineId = null)
```javascript
const milestones = await store.findMilestonesByWave(waveId, transaction, baselineId)
```
**Returns**: `Promise<Array<object>>` - All milestones targeting the specified wave

---

## Content Filtering Implementation Notes

### Route Layer Responsibility
Route layer converts query parameters to filters object:
```javascript
const filters = {
  type: req.query.type || null,
  text: req.query.text || null,
  dataCategory: req.query.dataCategory ? 
    req.query.dataCategory.split(',').map(id => parseInt(id)) : null,
  stakeholderCategory: req.query.stakeholderCategory ? 
    req.query.stakeholderCategory.split(',').map(id => parseInt(id)) : null,
  service: req.query.service ? 
    req.query.service.split(',').map(id => parseInt(id)) : null,
  regulatoryAspect: req.query.regulatoryAspect ? 
    req.query.regulatoryAspect.split(',').map(id => parseInt(id)) : null
};
```

### Store Layer Implementation
Store layer applies content filters after baseline/wave filtering:
```javascript
async findAll(transaction, baselineId = null, fromWaveId = null, filters = {}) {
  // Step 1: Get base result set (current or baseline)
  let versions = baselineId ? 
    await this._findAllInBaseline(baselineId, transaction) :
    await this._findAllLatest(transaction);
  
  // Step 2: Apply wave filtering
  if (fromWaveId) {
    versions = await this._applyWaveFilter(versions, fromWaveId, transaction);
  }
  
  // Step 3: Apply content filtering
  if (Object.keys(filters).length > 0) {
    versions = await this._applyContentFilters(versions, filters, transaction);
  }
  
  return versions;
}
```

### Performance Considerations
- **Database-level filtering**: All content filtering performed at Neo4j level
- **Efficient queries**: Use EXISTS patterns for relationship-based filtering
- **Text search optimization**: CONTAINS patterns for text search across multiple fields
- **Index utilization**: Leverage existing indexes on ID fields for category filtering

---

## Error Handling

### Content Filter Errors
- `'Invalid filter parameter'` - Malformed filter object or invalid values
- `'Invalid category ID'` - Referenced category entity does not exist
- `'Text search too broad'` - Text search returned excessive results (implementation-dependent)

### Combined Context Errors
- `'Baseline not found'` - Invalid baselineId parameter
- `'Wave not found'` - Invalid fromWaveId parameter
- `'No matching results'` - Combined filtering resulted in empty set

---

## Usage Examples

### Basic Content Filtering
```javascript
// Filter requirements by type and text search
const filters = { type: 'OR', text: 'authentication' };
const requirements = await operationalRequirementStore().findAll(tx, null, null, filters);

// Filter changes by visibility and impact
const changeFilters = { visibility: 'NETWORK', service: [123, 456] };
const changes = await operationalChangeStore().findAll(tx, null, null, changeFilters);
```

### Combined Multi-Context Queries
```javascript
// Historical + filtered requirements
const filters = { type: 'ON', stakeholderCategory: [789] };
const historicalRequirements = await operationalRequirementStore().findAll(
  tx, baselineId, null, filters
);

// Wave filtered + content filtered changes
const changeFilters = { text: 'database', service: [101] };
const futureChanges = await operationalChangeStore().findAll(
  tx, null, fromWaveId, changeFilters
);

// All three context types combined
const complexFilters = { visibility: 'NM', dataCategory: [234, 567] };
const complexQuery = await operationalChangeStore().findAll(
  tx, baselineId, fromWaveId, complexFilters
);
```