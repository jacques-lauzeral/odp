# Server / CLI Work Plan

## Overview
This document tracks server-side implementation phases of the ODP system. Phases 1-5 are complete, providing a production-ready foundation. Phase 6 addresses model evolution with empty database restart. Phase 7 adds bulk import capabilities before comprehensive CLI updates.

**Status**: ✅ PHASES 1-7 COMPLETE + 🚧 PHASE 8 CLI COMPREHENSIVE UPDATES  
**Current Focus**: Service layer extensions for bulk import capabilities  
**Next Phase**: CLI comprehensive updates (model evolution + import support)

---

## ✅ PHASES 1-5: COMPLETE

### Core System ✅ COMPLETED
- ✅ **Infrastructure**: Docker environment, workspace structure, manual Express routes
- ✅ **4 Setup entities**: StakeholderCategory, RegulatoryAspect, DataCategory, Service with REFINES hierarchy
- ✅ **2 Operational entities**: OperationalRequirement, OperationalChange with versioning system
- ✅ **3 Management entities**: Wave, Baseline, ODPEdition with timeline management
- ✅ **Content filtering**: Server-side filtering for operational entities

### Technical Excellence ✅ COMPLETED
- ✅ **Architecture**: Scalable manual routes, factorized patterns, clean separation
- ✅ **Production features**: Optimistic locking, audit trails, content filtering
- ✅ **CLI validation**: 35+ commands with filtering support
- ✅ **Documentation**: Complete API documentation and implementation guides

---

## ✅ PHASE 6: Model Evolution (COMPLETED)

### Shared Module Foundation ✅ COMPLETED
- ✅ **@odp/shared structure**: Organized enum and model definitions
- ✅ **Enum centralization**: DRG, MilestoneEvents, Visibility, OR/OC types
- ✅ **Validation helpers**: Consistent validation pattern across all enums
- ✅ **Model definitions**: Complete entity models with updated schema

### Storage Layer Updates ✅ COMPLETED
- ✅ **OperationalRequirementStore**: Added `drg` field and `implementedONs` relationships
- ✅ **OperationalChangeStore**: Updated field mapping (`description` → `purpose`), added rich text fields (`initialState`, `finalState`, `details`), `drg` field
- ✅ **Content filtering**: Updated full-text search to include all new rich text fields
- ✅ **DRG filtering**: Added enum filtering support in buildFindAllQuery methods
- ✅ **Milestone system**: Confirmed existing milestone store supports 5-event structure

### OpenAPI Contract Updates ✅ COMPLETED
- ✅ **Base schemas**: Updated OperationalRequirement/OperationalChange schemas with new fields
- ✅ **Enum definitions**: Added DraftingGroup and MilestoneEventType enums with validation
- ✅ **Request/Response schemas**: Updated all CRUD operations to match new field structure
- ✅ **Query parameters**: Added DRG filtering for both OR and OC endpoints

### Service Layer Updates ✅ COMPLETED
- ✅ **DRG validation**: Implemented shared enum validation for both OR and OC entities
- ✅ **implementedONs validation**: Added ON-type constraint validation for relationships
- ✅ **Field handling**: Updated service request/response mapping for new field structure
- ✅ **Shared module integration**: Imported and integrated @odp/shared validation helpers
- ✅ **Route updates**: Added DRG filtering support in both entity routes

---

## ✅ PHASE 7: Bulk Import (COMPLETED)

### OpenAPI Contract Layer ✅ COMPLETED
- ✅ **openapi-import.yml**: New import module with two distinct endpoints
- ✅ **Import schemas**: YAML-based request structures matching existing data format
- ✅ **Response schemas**: Summary-based responses with entity counts and error collection
- ✅ **Root integration**: Update main openapi.yml to include import endpoints

### Service Layer Implementation ✅ COMPLETED
- ✅ **ImportService class**: Core service handling YAML parsing and entity creation
- ✅ **Dependency resolution**: Topological sorting for parent/child relationships (`parentExternalId`)
- ✅ **Reference mapping**: External ID to internal ID tracking during creation process
- ✅ **Greedy error handling**: Continue processing on individual failures, collect comprehensive error reports
- ✅ **Service integration**: Leverage existing StakeholderCategoryService, ServiceService, etc.

### Route Layer Integration ✅ COMPLETED
- ✅ **Import routes**: Two endpoint handlers for `/import/setup` and `/import/requirements`
- ✅ **YAML middleware**: Content parsing and validation before service layer
- ✅ **DRG parameter handling**: Query parameter integration for requirements import
- ✅ **Response formatting**: Summary response with entity counts and error aggregation
- ✅ **Server integration**: Import routes registered in main index.js with YAML content-type support

---

---

## 🚧 PHASE 8: CLI Comprehensive Updates (NEXT)

### Model Evolution Support 🚧 PLANNED
- 🚧 **OperationalRequirement commands**: Update for `drg` field and `implementedONs` relationships
- 🚧 **OperationalChange commands**: Update for field rename (`description` → `purpose`) and new rich text fields
- 🚧 **DRG enum integration**: Add shared enum support in interactive command flows
- 🚧 **Milestone commands**: Verify 5-event system compatibility

### Import Command Integration 🚧 PLANNED
- 🚧 **Import commands**: `odp import setup --file data.yml` and `odp import requirements --drg IDL --file reqs.yml`
- 🚧 **File validation**: Local YAML structure validation before API calls
- 🚧 **Progress feedback**: Real-time import status and comprehensive error reporting
- 🚧 **Result summary**: Display entity creation counts and detailed error information

### Integration Testing 🚧 PLANNED
- 🚧 **End-to-end CLI testing**: Complete validation with updated model and import capabilities
- 🚧 **Command validation**: All 35+ existing commands plus new import commands
- 🚧 **Error handling**: Comprehensive error scenarios and user feedback

---

## Key Changes Summary

### Model Enhancements ✅ IMPLEMENTED
- **DRG enum**: 11 values (4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NM_B2B, NMUI, PERF, RRT, TCF)
- **Enhanced OperationalChange**: Rich text fields (`purpose`, `initialState`, `finalState`, `details`)
- **OperationalRequirement relationships**: `implementedONs` linking OR-type to ON-type requirements
- **Milestone system**: 5 independent milestone events (API_PUBLICATION, API_TEST_DEPLOYMENT, UI_TEST_DEPLOYMENT, OPS_DEPLOYMENT, API_DECOMMISSIONING)

### Import Capabilities 🚧 IN DEVELOPMENT
- **YAML-based import**: Two distinct endpoints for setup and requirements data
- **Dependency resolution**: Automated handling of parent/child relationships and external ID references
- **Greedy processing**: Continue on errors with comprehensive error collection and reporting
- **Integration**: Reuse existing service layer patterns for entity creation and validation

---

## Implementation Phases

### Phase 7.1: OpenAPI Contract (PLANNED)
1. Create `openapi-import.yml` with setup and requirements endpoints
2. Define YAML request schemas matching existing data format structure
3. Define summary response schemas with entity counts and error collection
4. Update root `openapi.yml` to include import endpoint references

### Phase 7.2: Service Layer Implementation (PLANNED)
1. **ImportService creation**: Core service class with YAML parsing capabilities
2. **Dependency resolution**: Implement topological sort for hierarchical entity creation
3. **Reference tracking**: Build external ID to internal ID mapping system
4. **Error aggregation**: Greedy processing with comprehensive error collection
5. **Service integration**: Orchestrate existing service calls for entity creation

### Phase 7.3: Route Layer Integration (PLANNED)
1. **Route handlers**: Implement `/import/setup` and `/import/requirements` endpoints
2. **YAML parsing**: Add content-type handling and structure validation
3. **Parameter processing**: Handle DRG query parameter for requirements import
4. **Response formatting**: Return summary with creation counts and error details

---

## Quality Gates

### Storage & Service Layer ✅ ALL COMPLETED
- ✅ Store layer supports all new fields with proper relationship handling
- ✅ Content filtering includes all rich text fields for comprehensive search
- ✅ DRG enum filtering functional across both OR and OC entities
- ✅ Service layer validates DRG enum values using shared module
- ✅ implementedONs relationship validation enforces ON-type constraints
- ✅ Route layer supports DRG filtering via query parameters

### Import Layer ✅ COMPLETED
- ✅ Import endpoints accept YAML content and return structured summaries
- ✅ Dependency resolution handles parent/child relationships correctly
- ✅ External ID reference resolution works for implementedONs relationships
- ✅ Greedy error handling continues processing despite individual failures
- ✅ Server integration with YAML content-type middleware and route registration

### CLI Layer (PHASE 8)
- [ ] CLI commands functional with new field structure
- [ ] DRG enum support in interactive commands
- [ ] Rich text field handling in CLI operations
- [ ] implementedONs relationship management via CLI
- [ ] Import commands handle large datasets efficiently

---

## System Status

**Backend Foundation**: ✅ Production-ready with comprehensive features  
**Storage Layer**: ✅ Model evolution complete with enhanced field support  
**Contract Layer**: ✅ OpenAPI specifications updated + 🚧 Import extensions  
**Service Layer**: ✅ Complete implementation with shared module + 🚧 Import service development  
**Route Layer**: ✅ DRG filtering and model evolution support + 🚧 Import endpoint implementation  
**Current Phase**: CLI layer comprehensive updates for model evolution and import support  
**Next Phase**: Web client integration (WEB-12 model updates + import UI)  
**Architecture**: Proven scalable patterns supporting unlimited expansion