# Work Topics / Plan

## 1 Setup (✅ COMPLETED)
- ✅ Ultra minimal Server, Web Client and CLI structure
- ✅ Source code organisation with workspace structure
- ✅ Artefact packaging with npm workspaces
- ✅ Deployment with Docker Compose
- ✅ Initial development environment

## 2 Server Foundation (✅ COMPLETED)

### 2.1 Storage layer (✅ COMPLETED)
- ✅ Storage layer exchange model
- ✅ Storage layer JavaScript API
- ✅ Storage layer connection to Neo4J
- ✅ Storage layer implementation with BaseStore pattern

### 2.2 Service layer (✅ COMPLETED)
- ✅ Manual Express routes with clean separation (Routes → Services → Store → Neo4j)
- ✅ Service layer with business logic and transaction management
- ✅ REST API implementation with entity-specific route files

### 2.3 Server side transversal aspects (✅ COMPLETED)
- ✅ Bootstrap and initialization
- ✅ Error handling and logging
- ✅ Docker containerization with live reload

## 3 Phase 1: CLI for StakeholderCategory (✅ COMPLETED)
- ✅ CLI technical solution setup with Commander.js
- ✅ Direct HTTP client integration (node-fetch)
- ✅ ASCII table formatting with cli-table3
- ✅ Configuration management via JSON config
- ✅ CLI commands for StakeholderCategory CRUD operations
- ✅ Complete CRUD operations working
- ✅ Shared model usage validation
- ✅ Manual routes architecture established

## 4 Phase 2: Business Extension - Setup Entities (✅ COMPLETED)
- ✅ **Four complete setup entities**: StakeholderCategory, RegulatoryAspect, DataCategory, Service
- ✅ **Factorized architecture**: Router patterns, BaseCommands patterns, Store patterns
- ✅ **95% code reduction** in route and CLI layers through base pattern extraction
- ✅ **REFINES hierarchy support** for all entities

## 5 Phase 3: Business Extension - Operational Entities (✅ COMPLETED)
- ✅ **Complete versioning system** with Item/ItemVersion pattern and optimistic locking
- ✅ **Two operational entities**: OperationalRequirement, OperationalChange with full versioning
- ✅ **PATCH operations** for partial updates across operational entities
- ✅ **Full milestone CRUD** with versioning integration (5 operations)
- ✅ **Advanced CLI** with 15+ commands for operational entity management
- ✅ **ID normalization** for consistent entity comparison
- ✅ **Modular OpenAPI** specification for maintainable documentation

## 6 Phase 4: Business Extension - Management Entities (🟡 PARTIALLY COMPLETED)

### 6.1 Server Implementation - Baseline ✅ COMPLETED
- ✅ **Baseline entity implementation**:
  - ✅ **Simplified storage model**: Direct HAS_ITEMS relationships design complete
  - ✅ **Baseline entity design**: Atomic snapshot creation without intermediate nodes
  - ✅ **Store implementation**: BaselineStore with immutable operations
  - ✅ **Service implementation**: BaselineService with atomic snapshot creation
  - ✅ **Route implementation**: baseline.js standalone router with immutable enforcement

### 6.2 Server Implementation - Wave ✅ COMPLETED
- ✅ **Wave entity implementation**:
  - ✅ Store Layer: WaveStore for timeline management
  - ✅ Service Layer: WaveService with quarter/year validation extending SimpleItemService
  - ✅ Route Layer: wave.js using SimpleItemRouter

### 6.3 Server Implementation - ODP Edition 🟡 IN PROGRESS
- ✅ **Updated shared models**: ODPEdition model with baseline and wave references
- ✅ **Updated OpenAPI specification**: ODPEdition endpoints and schemas
- ❌ **ODP Edition store implementation**:
  - ❌ ODPEditionStore with baseline and wave references
  - ❌ resolveContext() method for parameter resolution
  - ❌ EXPOSES → Baseline and STARTS_FROM → Wave relationships
- ❌ **ODP Edition service implementation**:
  - ❌ ODPEditionService with reference validation
  - ❌ Context resolution for route layer
- ❌ **ODP Edition route implementation**:
  - ❌ odp.js router with ODPEdition CRUD operations
  - ❌ /odp/{id}/context endpoint for parameter resolution
  - ❌ Integration with operational entity routes for context resolution

### 6.4 Route Layer Refactoring 🟡 IN PROGRESS
- ✅ **Enhanced router hierarchy**:
  - ✅ SimpleItemRouter for CRUD operations (TreeItemService, WaveService)
  - ✅ VersionedItemRouter with baseline parameter support
  - ✅ Standalone baseline.js router with immutable operations
- ❌ **ODPEdition parameter resolution**:
  - ❌ Update VersionedItemRouter to handle odp query parameter
  - ❌ Route-level context resolution (odp → baseline + fromWave)
  - ❌ Parameter precedence handling (odp excludes baseline/fromWave)

### 6.5 Service Layer Refactoring ✅ COMPLETED
- ✅ SimpleItemService (abstract base with transaction management)
- ✅ TreeItemService (name/description validation + REFINES hierarchy)
- ✅ Individual concrete services (StakeholderCategoryService, DataCategoryService, ServiceService, RegulatoryAspectService)
- ✅ Enhanced VersionedItemService with baseline-aware operations

### 6.6 CLI Implementation - Legacy ✅ COMPLETED
- ✅ **CLI commands for Wave operations**: Full CRUD with temporal validation and field configuration
- ✅ **CLI commands for Baseline management**: Immutable operations (create/list/show)
- ✅ **Enhanced operational CLI**: Complete `--baseline` flag support for historical queries
- ✅ **Type conversion fixes**: String-to-integer conversion for Wave year/quarter fields

### 6.7 CLI Implementation - ODP Edition 🟡 IN PROGRESS
- ❌ **CLI commands for ODP Edition management**:
  - ❌ odp create [title] [type] [baselineId] [startsFromWaveId]
  - ❌ odp list
  - ❌ odp show [id]
  - ❌ odp resolve [id] (show resolved baseline + wave context)
- ❌ **Enhanced operational CLI with ODP Edition support**:
  - ❌ --odp flag support for requirement/change commands
  - ❌ Parameter validation (odp excludes baseline/fromWave)

### 6.8 Code Migration Tasks 🟡 IN PROGRESS
- ❌ **Remove targetWave from Baseline**:
  - ❌ Update BaselineStore to remove wave-related functionality
  - ❌ Update baseline.js routes to remove wave parameters
  - ❌ Update baseline CLI commands to remove wave targeting
  - ❌ Update OpenAPI baseline schemas to remove wave references
- ❌ **Database migration**:
  - ❌ Remove any existing Baseline → Wave relationships
  - ❌ Migrate existing baseline data (if any) to new structure
- ❌ **Integration testing**:
  - ❌ Verify baseline operations work without wave targeting
  - ❌ Test ODP Edition context resolution end-to-end
  - ❌ Validate operational entity queries with odp parameter

### 6.9 Server Integration 🟡 IN PROGRESS
- ✅ **Enhanced baseline and wave routes**: All routes mounted and documented in server/src/index.js
- ❌ **ODP Edition integration**: Mount ODP Edition routes in main server
- ❌ **OpenAPI compliance**: Verify full conformance to updated specification

**Phase 4 Current Status**: 🟡 **~75% Complete** - Wave and Baseline systems working, but ODP Edition concept needs full implementation to replace wave targeting in baselines. Core baseline management functional but architectural update to ODP Edition pattern not yet implemented in code.

## 7 Phase 5: Web Client - Current Scope
- [ ] Web Client technical solution setup
- [ ] StakeholderCategory UI components:
  - [ ] List view with hierarchy display
  - [ ] Create/edit forms with validation
  - [ ] Delete confirmation dialogs
  - [ ] Hierarchy management interface (parent selection)
- [ ] Direct fetch integration with manual API routes
- [ ] Shared model integration for consistent data structures

## 8 Phase 6: Web Client - Setup Entities
- [ ] RegulatoryAspect UI components following StakeholderCategory patterns
- [ ] Service UI components following StakeholderCategory patterns
- [ ] Data UI components following StakeholderCategory patterns
- [ ] Wave UI components for timeline management:
  - [ ] Quarter/year timeline visualization
  - [ ] Wave creation with temporal validation
  - [ ] Wave targeting interface for milestones
- [ ] ODP Edition UI components:
  - [ ] Edition creation with baseline and wave selection
  - [ ] Edition management interface
  - [ ] Context resolution display
- [ ] Unified hierarchy management across all setup entities
- [ ] Cross-entity navigation and relationship display

## 9 Phase 7: Web Client - Operational Entities
- [ ] OperationalRequirement UI components with versioning support:
  - [ ] Version history display
  - [ ] Optimistic locking handling
  - [ ] Rich text editing for statement/rationale fields
  - [ ] Type selection and validation (ON/OR)
  - [ ] PATCH operations interface
- [ ] OperationalChange UI components with versioning support
- [ ] Relationship management interface:
  - [ ] Visual relationship mapping
  - [ ] Cross-entity navigation
  - [ ] Relationship creation/deletion
- [ ] Version comparison and diff display
- [ ] Milestone management interface:
  - [ ] Milestone timeline visualization
  - [ ] CRUD operations for milestones
  - [ ] Event type management
  - [ ] Wave targeting interface
- [ ] ODP Edition context switching:
  - [ ] Edition selection interface
  - [ ] Context-aware entity browsing
  - [ ] Historical vs filtered view indicators

## 10 Phase 8: Web Client - Management Entities
- [ ] Wave management interface:
  - [ ] Timeline view for quarterly planning
  - [ ] Wave creation with temporal validation
  - [ ] Wave-milestone relationship visualization
- [ ] Baseline creation and management:
  - [ ] Snapshot creation interface with progress indication
  - [ ] Baseline browsing and selection
- [ ] ODP Edition management interface:
  - [ ] Edition creation workflow (baseline + wave selection)
  - [ ] Edition comparison views
  - [ ] Publication workflow (draft → official)
- [ ] OperationalChange UI with milestone integration:
  - [ ] Milestone timeline visualization using Wave context
  - [ ] Progress tracking interface across waves
- [ ] Comprehensive deployment timeline view using Vis.js:
  - [ ] Cross-entity timeline with milestones, waves, and baselines
  - [ ] Interactive deployment planning interface
  - [ ] ODP Edition filtering and context switching

## Implementation Principles

### Development Approach
- **Incremental delivery**: Each phase delivers working functionality
- **Pattern reuse**: Establish patterns in Phase 1, replicate in subsequent phases
- **Manual routes consistency**: Follow Routes → Services → Store → Neo4j pattern for all entities
- **CLI validation**: Each entity's CLI commands validate all API operations
- **Complexity graduation**: Setup entities → Versioned entities → Complex management entities

### Technical Standards
- **Manual routes**: Direct Express route files for clear, maintainable API implementation
- **Transaction management**: Explicit boundaries with proper error handling across all entities
- **Shared models**: Consistent data structures across CLI, Server, and Web Client
- **Docker development**: Containerized environment for all development
- **ES modules**: Consistent module system throughout all components
- **Versioning pattern**: Item/ItemVersion dual-node approach for operational entities
- **PATCH operations**: Partial updates with field inheritance for all versioned entities
- **ID normalization**: Consistent ID comparison across all layers
- **ODP Edition pattern**: Context resolution (baseline + wave) for deployment planning

### Quality Gates per Phase
- **Working endpoints**: Full CRUD operations with proper error handling
- **CLI validation**: Command-line interface tests all API functionality for each entity
- **Documentation**: Updated implementation guides and patterns
- **Integration testing**: End-to-end workflow validation across all layers

### Entity Implementation Pattern (Phases 2-4)
For each new entity, follow this proven pattern:
1. **Shared Models**: Add entity definition to `@odp/shared`
2. **Store Layer**: Create entity store extending appropriate base class (BaseStore/VersionedItemStore)
3. **Service Layer**: Implement business logic with transaction management
4. **Route Layer**: Create Express routes file with CRUD operations
5. **Server Integration**: Add routes to main server application
6. **CLI Commands**: Create command handlers using direct HTTP calls
7. **Testing**: Validate all operations via CLI and direct API calls

## Success Criteria

### Phase Completion Criteria
- All planned entities implemented with full CRUD operations
- CLI commands provide complete functionality coverage for all entities
- Web client offers intuitive user experience for all operational workflows
- ODP Edition management enables flexible deployment planning with baseline + wave context
- System demonstrates complete operational deployment plan lifecycle

### Technical Achievement
- Scalable manual routes architecture supporting unlimited entity expansion
- Robust versioning and baseline management for operational entities
- Clean separation between setup data and operational data
- Efficient Neo4j utilization with proper relationship management
- Consistent patterns that enable rapid development of future entities
- Complete ODP Edition implementation with context resolution

## Current Status Summary

**✅ Completed Phases**: 1-3 (Setup + Setup Entities + Operational Entities)
**🟡 Current Phase**: 4 (~75% complete - ODP Edition implementation needed)
**🎯 Next Milestone**: Complete ODP Edition implementation and baseline migration
**📈 Overall Progress**: ~70% complete (Phases 1-3 complete, Phase 4 needs ODP Edition completion)

**Key Achievements in Phases 1-3**:
- **Complete entity management system**: 6 entities with full CRUD and versioning
- **Advanced CLI interface**: 30+ commands with baseline-aware historical queries
- **Proven architecture patterns**: Manual routes approach with factorized CLI and service layers
- **Production-ready features**: Optimistic locking, transaction management, comprehensive error handling

**Phase 4 Remaining Work**:
- **ODP Edition implementation**: Store, service, and route layers for edition management
- **Context resolution**: Route-level parameter resolution (odp → baseline + fromWave)
- **CLI commands**: ODP Edition management and enhanced operational commands
- **Code migration**: Remove targetWave from baseline, migrate existing data
- **Integration testing**: End-to-end validation of ODP Edition functionality

**Immediate next focus**: Complete ODP Edition implementation to enable proper baseline + wave context management for deployment planning. This architectural update will finalize the backend foundation and enable web client development to proceed with the correct ODP Edition patterns.

This completion of Phase 4 represents the final backend milestone before transitioning to web client development. The ODP Edition pattern provides the complete deployment planning foundation needed for sophisticated web-based interfaces.