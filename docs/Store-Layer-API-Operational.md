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
        refinesParents: Array<number>,        // OperationalRequirement Item IDs
        impactsStakeholderCategories: Array<number>, // StakeholderCategory IDs  
        impactsData: Array<number>,          // DataCategory IDs
        impactsServices: Array<number>,      // Service IDs
        implementedONs: Array<number>,       // OperationalRequirement Item IDs (OR type only, references ON type)
        dependsOnRequirements: Array<number>, // OperationalRequirement Version IDs (version-to-version dependencies)

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
  dependsOnRequirements: [567],  // Version IDs
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
- `dependsOnRequirements` references version IDs (version-to-version)
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

### findDependentVersions(versionId, transaction)
```javascript
const dependents = await store.findDependentVersions(versionId, transaction)
```
**Parameters**:
- `versionId: number` - OperationalRequirement Version ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{versionId: number, itemId: number, title: string, version: number}>>` - Requirement versions that depend on this version

### findDependencyVersions(versionId, transaction)
```javascript
const dependencies = await store.findDependencyVersions(versionId, transaction)
```
**Parameters**:
- `versionId: number` - OperationalRequirement Version ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{versionId: number, itemId: number, title: string, version: number}>>` - Requirement versions that this version depends on

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
  dependsOnChanges: Array<number>,       // OperationalChange Version IDs (version-to-version dependencies)
  
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
    wave?: object           // Wave object with year, quarter, date (populated in queries)
  }>
}
```

### create(data, transaction)
```javascript
const change = await store.create({
  title: "Implement Authentication API",
  purpose: "Provide secure authentication endpoints",
  initialState: "No authentication system exists",
  finalState: "Full OAuth2 authentication implemented",
  details: "Implementation includes login, logout, token refresh",
  privateNotes: "Internal technical considerations",
  path: ["API", "Security"],
  visibility: "NETWORK",
  drg: "NM_B2B",
  satisfiesRequirements: [123, 456],
  supersedsRequirements: [789],
  dependsOnChanges: [890],  // Version IDs
  documentReferences: [
    { documentId: 301, note: "Design spec - Section 2" }
  ],
  milestones: [
    {
      title: "API Publication",
      description: "Publish authentication API specification",
      eventType: "API_PUBLICATION",
      targetDate: "2025-06-15",
      waveId: 101
    },
    {
      title: "Test Deployment",
      description: "Deploy to test environment",
      eventType: "API_TEST_DEPLOYMENT",
      targetDate: "2025-09-01",
      waveId: 102
    }
  ]
}, transaction)
```

**Milestone Event Types** (5 specific types only):
- `API_PUBLICATION`
- `API_TEST_DEPLOYMENT`
- `UI_TEST_DEPLOYMENT`
- `OPS_DEPLOYMENT`
- `API_DECOMMISSIONING`

### findAll(transaction, baselineId = null, fromWaveId = null, filters = {})
```javascript
const changes = await store.findAll(transaction, baselineId, fromWaveId, filters)
```

**Filters Object Structure**:
```javascript
filters = {
  title: 'authentication',        // Title pattern string | null
  text: 'security',              // Full-text search string | null
  visibility: 'NETWORK',         // 'NM' | 'NETWORK' | null
  drg: 'NM_B2B',                 // DRG enum value | null
  satisfiesRequirement: [123],   // Array of OperationalRequirement IDs | null
  supersedsRequirement: [456],   // Array of OperationalRequirement IDs | null
  stakeholderCategory: [789],    // Array of StakeholderCategory IDs | null
  dataCategory: [101],           // Array of DataCategory IDs | null
  service: [102]                 // Array of Service IDs | null
}
```

**Content Filtering Behavior**:
- **title**: Pattern matching against title field
- **text**: Full-text search across title, purpose, initialState, finalState, details, privateNotes
- **visibility**: Filters by visibility enum
- **drg**: Filters by Drafting Group enum value
- **Requirement filters**: Filters by SATISFIES/SUPERSEDS relationships
- **Category filters**: Indirect filtering via requirements that impact categories

**Category Filtering Logic**:
1. Find requirements that impact the specified categories
2. Find changes that SATISFY or SUPERSEDE those requirements
3. Return matching changes

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

### findDependentVersions(versionId, transaction)
```javascript
const dependents = await store.findDependentVersions(versionId, transaction)
```
**Parameters**:
- `versionId: number` - OperationalChange Version ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{versionId: number, itemId: number, title: string, version: number}>>` - Change versions that depend on this version

### findDependencyVersions(versionId, transaction)
```javascript
const dependencies = await store.findDependencyVersions(versionId, transaction)
```
**Parameters**:
- `versionId: number` - OperationalChange Version ID
- `transaction: Transaction`

**Returns**: `Promise<Array<{versionId: number, itemId: number, title: string, version: number}>>` - Change versions that this version depends on

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