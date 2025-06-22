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
- `baselineId: number` - Optional: returns version captured in baseline instead of latest
- `fromWaveId: number` - Optional: applies wave filtering (OCs with milestones at/after wave, ORs referenced by filtered OCs)

**Returns**: `Promise<object|null>` - Entity with relationships or null  
**Throws**: `StoreError` - Query failure

### findByIdAndVersion(itemId, versionNumber, transaction)
```javascript
const entity = await store.findByIdAndVersion(itemId, versionNumber, transaction)
```
**Parameters**:
- `itemId: number` - Item node ID
- `versionNumber: number` - Specific version to retrieve
- `transaction: Transaction`

**Returns**: `Promise<object|null>` - Specific version with relationships or null  
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

### findAll(transaction, baselineId = null, fromWaveId = null)
```javascript
const entities = await store.findAll(transaction, baselineId, fromWaveId)
```
**Parameters**:
- `transaction: Transaction`
- `baselineId: number` - Optional: returns versions captured in baseline instead of latest versions
- `fromWaveId: number` - Optional: applies wave filtering to results

**Returns**: `Promise<Array<object>>` - Entities with relationships  
**Throws**: `StoreError` - Query failure

**Wave filtering behavior**:
- **OperationalChanges**: Include only those with milestones targeting waves at/after the fromWave date
- **OperationalRequirements**: Include only those referenced by filtered OperationalChanges via SATISFIES/SUPERSEDS

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
    id: number,
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
    { title: "M1", description: "Updated M1", eventTypes: ["API_PUBLICATION"] },
    { title: "M2", description: "New M2", eventTypes: ["SERVICE_ACTIVATION"], waveId: 456 }
  ]
}, expectedVersionId, transaction)
```
**Inheritance behavior**:
- If milestones not provided, copies milestone data from previous version to new version
- If relationships not provided, copies relationship data from previous version to new version
- Previous version keeps its own milestones and relationships

### Milestone Management
- **Storage**: `(Milestone)-[:BELONGS_TO]->(OperationalChangeVersion)`
- **Wave targeting**: `(Milestone)-[:TARGETS]->(Wave)` (optional)
- **Ownership**: Milestones belong to specific versions (not shared)

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