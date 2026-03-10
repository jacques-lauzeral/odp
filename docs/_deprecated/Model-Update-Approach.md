# Model Update Approach

## Overview
Documents the approach for an ODP model update - no DB migration script is required as the application will restart from an empty DB.

## 1. OperationalChange Model Updates

### 1.1 Field Changes
- **Rename**: `description` → `purpose`
- **Add**: `initial_state` (multiline rich text)
- **Add**: `final_state` (multiline rich text)
- **Add**: `details` (multiline rich text)
- **Add**: `drg` (Drafting Group - enum field)

### 1.2 Neo4j Schema Impact
- Update `OperationalChangeVersion` node properties
- Preserve existing versioning pattern (Item + ItemVersion)
- Update store layer CRUD operations

## 2. OperationalRequirement Model Updates

### 2.1 Field Changes
- **Add**: `drg` (Drafting Group - enum field)
- **Add**: `implementedONs` (list of OR references, type ON only)

### 2.3 DRG Enum Values
```
4DT: "4D-Trajectory"
AIRPORT: "Airport" 
ASM_ATFCM: "ASM / ATFCM Integration"
CRISIS_FAAS: "Crisis and FAAS"
FLOW: "Flow"
IDL: "iDL"
NM_B2B: "NM B2B"
NMUI: "NMUI"
PERF: "Performance"
RRT: "Rerouting"
TCF: "TCF"
```
- Update `OperationalRequirementVersion` node properties
- Add relationship validation for ON-type references
- Update store layer for reference handling

## 3. Milestone System Replacement

### 3.1 New Milestone Events (Independent)
Replace existing milestone system with 5 specific events:
- `API_PUBLICATION`
- `API_TEST_DEPLOYMENT`
- `UI_TEST_DEPLOYMENT`
- `OPS_DEPLOYMENT`
- `API_DECOMMISSIONING`

### 3.2 Neo4j Schema Impact
- Update `Milestone` node structure
- Maintain versioning pattern for milestones
- Preserve `MilestoneEvent` → `OperationalChangeVersion` relationships

## 4. Implementation Order

### 4.1 Storage Layer Updates
1. Update Neo4j node schemas
2. Modify store classes (OperationalChangeStore, OperationalRequirementStore)
3. Update milestone handling in stores
4. Test CRUD operations

### 4.2 Service Layer Updates
1. Update service classes for new fields
2. Modify request/response handling
3. Update validation logic for implementedONs references
4. Test service operations

### 4.3 OpenAPI Contract Updates
1. Update OperationalChangeRequest/Response schemas
2. Update OperationalRequirementRequest/Response schemas
3. Replace milestone schemas with 5-event system
4. Update API documentation

### 4.4 CLI Layer Updates
1. Update CLI commands for new fields
2. Modify milestone commands for 5-event system
3. Update help text and examples
4. Test CLI operations

### 4.5 Web Client Updates
1. Update forms for new fields (purpose, states, details, drg)
2. Modify milestone tracking UI
3. Add implementedONs reference handling
4. Update validation and error handling

## 5. Key Constraints

- **Versioning**: All existing versioning patterns MUST be preserved
- **Milestones**: Independent events (no sequencing/dependencies)
- **References**: implementedONs must validate OR type = ON
- **Empty DB**: No data migration needed, schema evolution only

## 6. Validation Points

- [ ] OperationalChange CRUD with new fields
- [ ] OperationalRequirement CRUD with new fields
- [ ] 5-milestone system working independently
- [ ] implementedONs reference validation
- [ ] Versioning pattern integrity maintained