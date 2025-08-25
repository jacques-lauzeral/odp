# Store Layer API - Operational

## Overview
Operational entity stores provide versioned CRUD operations for deployment planning entities. These stores extend VersionedItemStore and support optimistic locking, baseline-aware operations, and wave filtering for temporal deployment planning.

## VersionedItemStore API
*Base class for versioned entities with optimistic locking and multi-context support*

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
- `data: object` - Entity data (title + version fields + relationships)
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

### findAll(transaction, baselineId = null, fromWaveId = null)
```javascript
const entities = await store.findAll(transaction, baselineId, fromWaveId)
```
Similar multi-context behavior as `findById`

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

**Wave Filtering Context**: For operational entities supporting wave filtering
- **OperationalChanges**: Include only those with milestones targeting waves at/after the fromWave date
- **OperationalRequirements**: Include only those referenced by filtered OperationalChanges via SATISFIES/SUPERSEDS, plus all ancestor requirements via REFINES hierarchy (upward cascade)

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

### Available Methods
All VersionedItemStore methods plus:

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
**Validation**: Prevents self-references in REFINES, validates all referenced entities exist

### update(itemId, data, expectedVersionId, transaction)
```javascript
const updated = await store.update(itemId, {
  statement: "Updated statement",
  impactsServices: [789, 999]  // Replaces previous impactsServices
  // Other relationships inherited from previous version
}, expectedVersionId, transaction)
```
**Inheritance behavior**: Unspecified relationship arrays copy from previous version, specified arrays replace previous version

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

### Available Methods
All VersionedItemStore methods plus:

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
      // milestoneKey will be auto-generated as 'ms_uuid'
    }
  ],
  satisfiesRequirements: [reqId1, reqId2]
}, transaction)
```
**Behavior**: Creates Item + Version + milestones + relationships in single transaction

### update(itemId, data, expectedVersionId, transaction)
```javascript
const updated = await store.update(itemId, {
  description: "Updated description",
  milestones: [
    { 
      milestoneKey: "ms_existing_uuid", // Preserve existing milestone
      title: "M1", 
      description: "Updated M1", 
      eventTypes: ["API_PUBLICATION"] 
    },
    { 
      title: "M2", 
      description: "New M2", 
      eventTypes: ["SERVICE_ACTIVATION"], 
      waveId: 456 
      // New milestone gets auto-generated milestoneKey
    }
  ]
}, expectedVersionId, transaction)
```
**Inheritance behavior**:
- If milestones not provided, copies milestone data from previous version to new version
- If relationships not provided, copies relationship data from previous version to new version
- Previous version keeps its own milestones and relationships
- Milestone keys are preserved when provided, generated when missing

### Milestone Management
- **Storage**: `(Milestone)-[:BELONGS_TO]->(OperationalChangeVersion)`
- **Wave targeting**: `(Milestone)-[:TARGETS]->(Wave)` (optional)
- **Ownership**: Milestones belong to specific versions (not shared)
- **Stable Identity**: Each milestone has a `milestoneKey` (UUID-based) preserved across versions

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

### findMilestonesByWave(waveId, transaction, baselineId = null, fromWaveId = null)
```javascript
const milestones = await store.findMilestonesByWave(waveId, transaction, baselineId, fromWaveId)
```
**Returns**: `Promise<Array<object>>` - Milestones targeting the wave with change context

## Milestone Stable Identity

### Design Principles
- **Stable Keys**: Each milestone gets a UUID-based `milestoneKey` (format: `ms_uuid`)
- **Version Independence**: Milestone keys are preserved across OperationalChange versions
- **Technical vs Business ID**: `id` is technical node ID (changes), `milestoneKey` is business identifier (stable)

### Key Generation
- **New milestones**: Auto-generated UUID when `milestoneKey` not provided
- **Existing milestones**: Preserved from previous version when milestone data inherited
- **Format**: `ms_${uuid}` (e.g., `ms_a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

### Milestone Operations
```javascript
// Find milestone by stable key across versions
const milestone = await store.findMilestoneByKey(changeId, "ms_uuid", transaction);

// Update uses milestoneKey in milestone data for preservation
const updatedChange = await store.update(changeId, {
  milestones: [
    {
      milestoneKey: "ms_existing_uuid",  // Preserve identity
      title: "Updated title",
      description: "Updated description"
    }
  ]
}, expectedVersionId, transaction);
```

### Migration Support
Existing milestones without `milestoneKey` can be updated with:
```cypher
MATCH (milestone:OperationalChangeMilestone)
WHERE milestone.milestoneKey IS NULL
SET milestone.milestoneKey = 'ms_' + randomUUID()
```

## Wave Filtering Errors
Additional error conditions for multi-context operations:
- `'Wave not found'` - Invalid fromWaveId in wave filtering operations
- `'No matching milestones'` - Wave filter results in empty OC set

## Dependencies

### Updated Package Requirements
- **Server**: Requires `uuid` package for milestone key generation
```bash
cd workspace/server
npm install uuid  # (or sudo npm install uuid if permission issues)
```

### Milestone Data Migration
Existing projects need to update milestone data:
```cypher
// Run in Neo4j Browser (http://localhost:7474)
MATCH (milestone:OperationalChangeMilestone)
WHERE milestone.milestoneKey IS NULL
SET milestone.milestoneKey = 'ms_' + randomUUID()
RETURN count(milestone) as updated
```

## Known Issues Resolution
- **Milestone empty responses**: ✅ RESOLVED - Stable milestone identity implementation
- **Version info missing**: ✅ RESOLVED - New response format includes version details