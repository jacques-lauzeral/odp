# Store Layer API - Management

## Overview
Management entity stores provide deployment plan management through baseline snapshots and ODP editions. These stores handle immutable entities for capturing system state and providing filtered deployment views.

## BaselineStore
**Inheritance**: `BaseStore`  
**Entity Model**: `{id: number, title: string, createdAt: string, createdBy: string, capturedItemCount: number}`

### create(data, transaction)
```javascript
const baseline = await store.create({
  title: "Q1 2025 Baseline"
}, transaction)
```

**Parameters**:
- `data: object` - Baseline properties (title only)
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - Created baseline with captured version count  
**Behavior**:
1. Creates baseline node with title, createdAt, createdBy
2. Captures all current LATEST_VERSION relationships for OR/OC
3. Creates HAS_ITEMS relationships to all latest versions
4. Returns baseline with capturedItemCount

### getBaselineItems(baselineId, transaction)
```javascript
const items = await store.getBaselineItems(baselineId, transaction)
```
**Parameters**:
- `baselineId: number` - Baseline ID
- `transaction: Transaction`

**Returns**: `Promise<Array<object>>` - All OR/OC versions captured in baseline with metadata

**Example Response**:
```javascript
[
  {
    versionId: 456,
    itemId: 789,
    title: "Requirement Title",
    version: 3,
    type: "OperationalRequirement"
  },
  {
    versionId: 457,
    itemId: 790,
    title: "Change Title", 
    version: 2,
    type: "OperationalChange"
  }
]
```

**Note**: No update/delete operations - baselines are immutable once created

## ODPEditionStore
**Inheritance**: `BaseStore`  
**Entity Model**: `{id: number, title: string, type: string, createdAt: string, createdBy: string, baselineId: number, startsFromWaveId: number}`

### create(data, transaction)
```javascript
const edition = await store.create({
  title: "Q1 2025 Edition",
  type: "DRAFT",
  baselineId: 123,
  startsFromWaveId: 456
}, transaction)
```

**Parameters**:
- `data: object` - Edition properties including baseline and wave references
- `transaction: Transaction` - Must have user context

**Returns**: `Promise<object>` - Created ODPEdition with resolved references  
**Behavior**:
1. Creates ODPEdition node with provided properties
2. Validates baseline and wave exist
3. Creates EXPOSES relationship to baseline
4. Creates STARTS_FROM relationship to wave

**Throws**:
- `StoreError('Invalid baseline reference')` - Baseline doesn't exist
- `StoreError('Invalid wave reference')` - Wave doesn't exist

### resolveContext(odpEditionId, transaction)
```javascript
const context = await store.resolveContext(odpEditionId, transaction)
```
**Parameters**:
- `odpEditionId: number` - ODPEdition ID
- `transaction: Transaction`

**Returns**: `Promise<{baselineId: number, fromWaveId: number}>` - Resolved baseline and wave context  
**Usage**: Route layer resolves ODPEdition to baseline+wave parameters for service calls  
**Throws**: `StoreError('ODPEdition not found')` - Invalid odpEditionId

### findById(id, transaction)
```javascript
const edition = await store.findById(id, transaction)
```
**Returns**: `Promise<object|null>` - ODPEdition with baseline and wave metadata

**Example Response**:
```javascript
{
  id: 789,
  title: "Q1 2025 Edition",
  type: "DRAFT",
  createdAt: "2025-01-15T14:30:00Z",
  createdBy: "user123",
  baseline: {
    id: 123,
    title: "Q1 2025 Baseline",
    createdAt: "2025-01-15T10:30:00Z"
  },
  startsFromWave: {
    id: 456,
    name: "2025.2",
    year: 2025,
    quarter: 2,
    date: "2025-06-30"
  }
}
```

**Note**: No update/delete operations - editions are immutable once created