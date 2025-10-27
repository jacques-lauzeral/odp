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
        flows: string,            // Rich text
        privateNotes: string,     // Rich text
        path: Array<string>,      // Folder hierarchy path
        drg: string,              // Enum: '4DT'|'AIRPORT'|'ASM_ATFCM'|'CRISIS_FAAS'|'FLOW'|'IDL'|'NM_B2B'|'NMUI'|'PERF'|'RRT'|'TCF'

        // Relationship fields
        refinesParents: Array<number>,              // OperationalRequirement Item IDs
        impactsStakeholderCategories: Array<number>, // StakeholderCategory IDs
        impactsData: Array<number>,                 // DataCategory IDs
        impactsServices: Array<number>,             // Service IDs
        implementedONs: Array<number>,              // OperationalRequirement Item IDs (OR type only, references ON type)
        dependsOnRequirements: Array<number>,       // OperationalRequirement Item IDs (follows latest version automatically)

        // Document references
        documentReferences: Array<{
        documentId: number,     // Document ID
        note: string           // Optional context note (e.g., "Section 3.2")
    }>
}
```

### create(data, transaction)
```javascript
const requirement = await store.create({
  title: "Authentication Security",
  type: "OR",
  code: "OR-IDL-0021",
  statement: "System shall provide secure authentication",
  rationale: "Security compliance required",
  flows: "Authentication flow description",
  privateNotes: "Internal implementation notes",
  path: ["Security", "Authentication"],
  drg: "PERF",
  refinesParents: [123],
  impactsStakeholderCategories: [456],
  impactsData: [789],
  impactsServices: [101],
  implementedONs: [345],  // Only valid for OR type
  dependsOnRequirements: [567],  // Item IDs
  documentReferences: [
    { documentId: 201, note: "Section 3.2" },
    { documentId: 202, note: "Annex A" }
  ]
}, transaction)
```

**Parameters**:
- `data: object` - Complete entity data including relationships
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - Created entity with version 1

**Relationship Validation**:
- `implementedONs` only valid for type='OR', references must be type='ON'
- `dependsOnRequirements` references Item IDs (follows latest version automatically)
- All relationship arrays are optional (default: empty arrays)

### findById(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const requirement = await store.findById(itemId, transaction, baselineId, fromWaveId)
```
**Multi-Context Behavior**:
- Latest version: Returns current version with populated relationships
- Baseline context: Returns version captured in baseline
- Wave filtering: Returns latest version if passes wave filter, null otherwise

### findAll(transaction, baselineId = null, fromWaveId = null, filters = {})
```javascript
const requirements = await store.findAll(transaction, baselineId, fromWaveId, filters)
```

**Parameters**:
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context for historical data
- `fromWaveId: number|null` - Optional wave filtering
- `filters: object` - Optional content filtering

**Filters Object Structure**:
```javascript
filters = {
  type: 'OR',                    // 'ON' | 'OR' | null
  title: 'authentication',       // Title pattern string | null
  text: 'security',              // Full-text search string | null
  drg: 'PERF',                   // DRG enum value | null
  dataCategory: [123, 456],      // Array of DataCategory IDs | null
  stakeholderCategory: [789],    // Array of StakeholderCategory IDs | null
  service: [101, 102]            // Array of Service IDs | null
}
```

**Content Filtering Behavior**:
- **type**: Filters by requirement type (ON/OR)
- **title**: Pattern matching against title field
- **text**: Full-text search across title, statement, rationale, flows, privateNotes
- **drg**: Filters by Drafting Group enum value
- **Category filters**: Filters by relationships to setup entities (OR logic within each category)

**Returns**: `Promise<Array<object>>` - Filtered entities with relationships

### update(itemId, updatePayload, expectedVersionId, transaction)
```javascript
const requirement = await store.update(itemId, {
  title: "Updated Authentication Security",
  type: "OR",
  statement: "Updated statement",
  drg: "NM_B2B",
  implementedONs: [345, 567],
  dependsOnRequirements: [890],
  documentReferences: [
    { documentId: 201, note: "Updated - Section 4.1" }
  ]
}, "version_uuid", transaction)
```

**Relationship Inheritance**: Unspecified relationship arrays copy from previous version

### findParents(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const parents = await store.findParents(itemId, transaction, baselineId, fromWaveId)
```
**Returns**: `Promise<Array<{id: number, title: string}>>` - Requirements that this one refines

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
- `targetLabel: string` - 'StakeholderCategory'|'DataCategory'|'Service'
- `targetId: number` - Target entity ID

**Returns**: `Promise<Array<{id: number, title: string}>>` - Requirements impacting the target

### findImplementingRequirements(onItemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const implementers = await store.findImplementingRequirements(onItemId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `onItemId: number` - OperationalRequirement Item ID (type ON)

**Returns**: `Promise<Array<{id: number, title: string}>>` - OR-type requirements that implement this ON

### findDocumentReferences(versionId, transaction)
```javascript
const documents = await store.findDocumentReferences(versionId, transaction)
```
**Parameters**:
- `versionId: number` - OperationalRequirement Version ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{documentId: number, name: string, version: string, note: string}>>` - Documents referenced by this version with notes

### findDependencies(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const dependencies = await store.findDependencies(itemId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `itemId: number` - OperationalRequirement Item ID
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context
- `fromWaveId: number|null` - Optional wave filtering

**Returns**: `Promise<Array<{itemId: number, title: string, versionId: number, version: number}>>` - Requirement Items that this requirement depends on (follows latest version in context)

**Description**: Returns the Items that this requirement depends on. In current context, returns latest versions. In baseline context, returns the versions that were latest at baseline time.

### findDependents(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const dependents = await store.findDependents(itemId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `itemId: number` - OperationalRequirement Item ID
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context
- `fromWaveId: number|null` - Optional wave filtering

**Returns**: `Promise<Array<{itemId: number, title: string, versionId: number, version: number}>>` - Requirement Items that depend on this requirement (follows latest version in context)

**Description**: Returns the Items that depend on this requirement. In current context, returns latest versions. In baseline context, returns the versions that were latest at baseline time.

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
  purpose: string,          // Rich text (renamed from description)
  initialState: string,     // Rich text (multiline)
  finalState: string,       // Rich text (multiline)
  details: string,          // Rich text (multiline)
  privateNotes: string,     // Rich text
  path: Array<string>,      // Folder hierarchy path
  visibility: string,       // 'NM' | 'NETWORK'
  drg: string,              // Enum: '4DT'|'AIRPORT'|'ASM_ATFCM'|'CRISIS_FAAS'|'FLOW'|'IDL'|'NM_B2B'|'NMUI'|'PERF'|'RRT'|'TCF'
  
  // Relationship fields
  satisfiesRequirements: Array<number>,  // OperationalRequirement Item IDs
  supersedsRequirements: Array<number>,  // OperationalRequirement Item IDs
  dependsOnChanges: Array<number>,       // OperationalChange Item IDs (follows latest version automatically)
  
  // Document references
  documentReferences: Array<{
    documentId: number,     // Document ID
    note: string           // Optional context note (e.g., "Section 3.2")
  }>,
  
  // Milestone fields
  milestones: Array<{
    id: number,             // Technical node ID (changes with each version)
    milestoneKey: string,   // Stable identifier (preserved across versions)
    title: string,
    description: string,
    eventType: string,      // 'API_PUBLICATION'|'API_TEST_DEPLOYMENT'|'UI_TEST_DEPLOYMENT'|'OPS_DEPLOYMENT'|'API_DECOMMISSIONING'
    targetDate: string,     // ISO date string
    actualDate: string,     // ISO date string (optional)
    waveId?: number,        // Wave ID (optional)
    wave?: {               // Wave details (populated)
      id: number,
      year: number,
      quarter: number,
      date: string,
      name: string
    }
  }>
}
```

### create(data, transaction)
```javascript
const change = await store.create({
  title: "Authentication Enhancement",
  purpose: "Improve system security",
  initialState: "Basic authentication",
  finalState: "Multi-factor authentication",
  details: "Implementation details...",
  privateNotes: "Internal notes...",
  path: ["Security", "Authentication"],
  visibility: "NETWORK",
  drg: "PERF",
  satisfiesRequirements: [123, 456],
  supersedsRequirements: [789],
  dependsOnChanges: [234],  // Item IDs
  documentReferences: [
    { documentId: 301, note: "Design Document - Section 2" }
  ],
  milestones: [
    {
      milestoneKey: "uuid-generated-key",
      title: "API Publication",
      description: "Publish new API version",
      eventType: "API_PUBLICATION",
      targetDate: "2025-03-15",
      actualDate: null,
      waveId: 10
    }
  ]
}, transaction)
```

**Parameters**:
- `data: object` - Complete entity data including relationships and milestones
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - Created entity with version 1

**Relationship Validation**:
- `dependsOnChanges` references Item IDs (follows latest version automatically)
- All relationship arrays are optional (default: empty arrays)
- Milestones array is optional (default: empty array)

### findById(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const change = await store.findById(itemId, transaction, baselineId, fromWaveId)
```
**Multi-Context Behavior**:
- Latest version: Returns current version with populated relationships and milestones
- Baseline context: Returns version captured in baseline
- Wave filtering: Returns latest version if has milestones at/after wave, null otherwise

### findAll(transaction, baselineId = null, fromWaveId = null, filters = {})
```javascript
const changes = await store.findAll(transaction, baselineId, fromWaveId, filters)
```

**Filters Object Structure**:
```javascript
filters = {
  visibility: 'NETWORK',         // 'NM' | 'NETWORK' | null
  title: 'authentication',       // Title pattern string | null
  text: 'security',              // Full-text search string | null
  drg: 'PERF',                   // DRG enum value | null
  dataCategory: [123, 456],      // Array of DataCategory IDs | null
  stakeholderCategory: [789],    // Array of StakeholderCategory IDs | null
  service: [101, 102]            // Array of Service IDs | null
}
```

**Content Filtering Behavior**:
- **visibility**: Filters by visibility level (NM/NETWORK)
- **title**: Pattern matching against title field
- **text**: Full-text search across title, purpose, initialState, finalState, details, privateNotes
- **drg**: Filters by Drafting Group enum value
- **Category filters**: Filters by relationships to requirements that impact those categories
    1. Find requirements that impact the specified categories
    2. Find changes that SATISFY or SUPERSEDE those requirements
    3. Return matching changes

**Returns**: `Promise<Array<object>>` - Filtered entities with relationships and milestones

### update(itemId, updatePayload, expectedVersionId, transaction)
```javascript
const change = await store.update(itemId, {
  title: "Updated Authentication Enhancement",
  purpose: "Enhanced security implementation",
  dependsOnChanges: [234, 567],
  documentReferences: [
    { documentId: 301, note: "Updated Design - Section 3" }
  ],
  milestones: [
    {
      milestoneKey: "existing-uuid-key",  // Preserved from previous version
      title: "API Publication",
      description: "Updated description",
      eventType: "API_PUBLICATION",
      targetDate: "2025-04-01",  // Updated date
      actualDate: "2025-03-28",  // Actual completion
      waveId: 10
    }
  ]
}, "version_uuid", transaction)
```

**Relationship Inheritance**: Unspecified relationship arrays copy from previous version  
**Milestone Inheritance**: Milestones matched by `milestoneKey` preserve stable identity across versions

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

### findDocumentReferences(versionId, transaction)
```javascript
const documents = await store.findDocumentReferences(versionId, transaction)
```
**Parameters**:
- `versionId: number` - OperationalChange Version ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{documentId: number, name: string, version: string, note: string}>>` - Documents referenced by this version with notes

### findDependencies(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const dependencies = await store.findDependencies(itemId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `itemId: number` - OperationalChange Item ID
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context
- `fromWaveId: number|null` - Optional wave filtering

**Returns**: `Promise<Array<{itemId: number, title: string, versionId: number, version: number}>>` - Change Items that this change depends on (follows latest version in context)

**Description**: Returns the Items that this change depends on. In current context, returns latest versions. In baseline context, returns the versions that were latest at baseline time.

### findDependents(itemId, transaction, baselineId = null, fromWaveId = null)
```javascript
const dependents = await store.findDependents(itemId, transaction, baselineId, fromWaveId)
```
**Parameters**:
- `itemId: number` - OperationalChange Item ID
- `transaction: Transaction`
- `baselineId: number|null` - Optional baseline context
- `fromWaveId: number|null` - Optional wave filtering

**Returns**: `Promise<Array<{itemId: number, title: string, versionId: number, version: number}>>` - Change Items that depend on this change (follows latest version in context)

**Description**: Returns the Items that depend on this change. In current context, returns latest versions. In baseline context, returns the versions that were latest at baseline time.

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

---

## Content Filtering Implementation Notes

### Route Layer Responsibility
Route layer converts query parameters to filters object:
```javascript
const filters = {
  type: req.query.type || null,
  text: req.query.text || null,
  drg: req.query.drg || null,
  dataCategory: req.query.dataCategory ? 
    req.query.dataCategory.split(',').map(Number) : null,
  stakeholderCategory: req.query.stakeholderCategory ? 
    req.query.stakeholderCategory.split(',').map(Number) : null,
  service: req.query.service ? 
    req.query.service.split(',').map(Number) : null
};
```

### Store Layer Processing
Store layer receives filters object and constructs appropriate Cypher WHERE clauses:
- Text search uses full-text indexing for performance
- Category filtering uses efficient relationship traversal
- Combined filters use AND logic across filter types
- Multiple values within a category use OR logic

## Dependency Relationship Pattern

### Key Design Decision
Dependencies use the Item-to-Version pattern :
- **Storage**: `(VersionA)-[:DEPENDS_ON]->(ItemB)` - Version points to Item
- **API**: Arrays contain Item IDs: `dependsOnRequirements: [itemId1, itemId2]`
- **Behavior**: Relationships automatically follow latest version via LATEST_VERSION
- **Historical Context**: When querying with baselineId, returns versions that were latest at baseline time
- **Query Methods**: `findDependencies()` and `findDependents()` resolve to appropriate versions based on context

This pattern ensures:
1. Dependencies stay current automatically as new versions are created
2. Historical accuracy is preserved through baseline context
3. Consistent relationship patterns across all entity relationships
4. Simplified dependency management without explicit version tracking