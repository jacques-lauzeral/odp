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

## 6 Phase 4: Business Extension - Management Entities (🟡 ~90% COMPLETED)

### 6.1 Server Implementation - Baseline ✅ COMPLETED
- ✅ **Baseline entity implementation**:
  - ✅ **Simplified storage model**: Direct HAS_ITEMS relationships design complete
  - ✅ **Baseline entity design**: Atomic snapshot creation without intermediate nodes
  - ✅ **Store implementation**: BaselineStore with immutable operations
  - ✅ **Service implementation**: BaselineService with atomic snapshot creation (wave references removed)
  - ✅ **Route implementation**: baseline.js standalone router with immutable enforcement

### 6.2 Server Implementation - Wave ✅ COMPLETED
- ✅ **Wave entity implementation**:
  - ✅ Store Layer: WaveStore for timeline management
  - ✅ Service Layer: WaveService with quarter/year validation extending SimpleItemService
  - ✅ Route Layer: wave.js using SimpleItemRouter

### 6.3 Server Implementation - ODP Edition ✅ COMPLETED
- ✅ **Updated shared models**: ODPEdition model with baseline and wave references
- ✅ **Updated OpenAPI specification**: ODPEdition endpoints and schemas (baselineId optional)
- ✅ **ODP Edition store implementation**:
  - ✅ ODPEditionStore with baseline and wave references
  - ✅ resolveContext() method for parameter resolution
  - ✅ EXPOSES → Baseline and STARTS_FROM → Wave relationships
- ✅ **ODP Edition service implementation**:
  - ✅ ODPEditionService with reference validation and auto-baseline creation
  - ✅ Context resolution for route layer (internal use only)
- ✅ **ODP Edition route implementation**:
  - ✅ odp-edition.js router with ODPEdition CRUD operations
  - ✅ Immutable operations pattern (create/read only)
  - ✅ Integration with main server (mounted at /odp-editions)

### 6.4 Route Layer Refactoring ✅ COMPLETED
- ✅ **Enhanced router hierarchy**:
  - ✅ SimpleItemRouter for CRUD operations (TreeItemService, WaveService)
  - ✅ VersionedItemRouter with multi-context parameter support (baseline + fromWave)
  - ✅ Standalone baseline.js router with immutable operations
  - ✅ Standalone odp-edition.js router with immutable operations
- ✅ **Multi-context parameter support**:
  - ✅ Direct baseline and fromWave parameter extraction
  - ✅ Clean service integration without ODPEdition complexity at route level
  - ✅ Consistent error handling for baseline and wave validation

### 6.5 Service Layer Refactoring ✅ COMPLETED
- ✅ SimpleItemService (abstract base with transaction management)
- ✅ TreeItemService (name/description validation + REFINES hierarchy)
- ✅ Individual concrete services (StakeholderCategoryService, DataCategoryService, ServiceService, RegulatoryAspectService)
- ✅ Enhanced VersionedItemService with multi-context operations (baseline + fromWave support)
- ✅ OperationalChangeService with multi-context milestone management

### 6.6 CLI Implementation - Legacy ✅ COMPLETED
- ✅ **CLI commands for Wave operations**: Full CRUD with temporal validation and field configuration
- ✅ **CLI commands for Baseline management**: Immutable operations (create/list/show)
- ✅ **Enhanced operational CLI**: Complete `--baseline` flag support for historical queries
- ✅ **Type conversion fixes**: String-to-integer conversion for Wave year/quarter fields

### 6.7 CLI Implementation - ODP Edition ❌ NOT STARTED
- ❌ **CLI commands for ODP Edition management**:
  - ❌ odp create [title] [type] [baselineId] [startsFromWaveId]
  - ❌ odp list
  - ❌ odp show [id]
- ❌ **Enhanced operational CLI with multi-context support**:
  - ❌ --fromWave flag support for requirement/change commands
  - ❌ Parameter validation and integration testing

### 6.8 Code Migration Tasks 🟡 PARTIALLY COMPLETED
- ✅ **Remove targetWave from Baseline**:
  - ✅ Update BaselineService to remove wave-related functionality
  - ✅ Update VersionedItemRouter and operational-change routes
  - ✅ Update OpenAPI operational schemas to remove odp parameters

### 6.9 Server Integration ✅ COMPLETED
- ✅ **Enhanced baseline and wave routes**: All routes mounted and documented in server/src/index.js
- ✅ **ODP Edition integration**: ODP Edition routes mounted at /odp-editions
- ✅ **OpenAPI compliance**: Operational endpoints cleaned of odp parameters

### 6.10 Store Layer Multi-Context Support ✅ COMPLETED
- ✅ **fromWaveId parameter support**: Added to all operational entity store methods
  - ✅ OperationalChangeStore: Wave filtering based on milestone target dates
  - ✅ OperationalRequirementStore: Cascade filtering via OC references + REFINES ancestors
  - ✅ Method signatures updated: findById, findAll, and all relationship query methods
- ✅ **Wave filtering implementation**:
  - ✅ _checkWaveFilter() methods using Neo4j date() functions for robust comparison
  - ✅ Two-step filtering pattern: baseline resolution → wave filtering
  - ✅ Milestone-based filtering: OCs with milestones targeting waves >= fromWave.date
- ✅ **REFINES cascade filtering**:
  - ✅ Requirements referenced by filtered OCs (SATISFIES/SUPERSEDS relationships)
  - ✅ Ancestor requirements via REFINES hierarchy (upward cascade only)
  - ✅ Complete requirement context preservation for deployment planning
- ✅ **VersionedItemStore base class updates**:
  - ✅ Method signature updates for multi-context support
  - ✅ Parameter pass-through to concrete store implementations
  - ✅ Clean separation: baseline logic (base) vs wave logic (concrete stores)

**Phase 4 Current Status**: 🟡 **~90% Complete** - Core ODP Edition implementation complete, CLI commands and final cleanup tasks remaining.

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
- [ ] Multi-context switching:
  - [ ] Baseline selection interface
  - [ ] Wave filtering interface
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
  - [ ] Multi-context filtering and switching

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
- **Multi-context operations**: Baseline + wave filtering for deployment planning

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
- Multi-context operations enable flexible deployment planning with baseline + wave filtering
- System demonstrates complete operational deployment plan lifecycle

### Technical Achievement
- Scalable manual routes architecture supporting unlimited entity expansion
- Robust versioning and baseline management for operational entities
- Clean separation between setup data and operational data
- Efficient Neo4j utilization with proper relationship management
- Consistent patterns that enable rapid development of future entities
- Complete multi-context implementation with baseline and wave filtering

## Current Status Summary

**✅ Completed Phases**: 1-3 (Setup + Setup Entities + Operational Entities)
**🟡 Current Phase**: 4 (~90% complete - CLI commands and final cleanup remaining)
**🎯 Next Milestone**: Complete ODP Edition CLI commands and Phase 4 cleanup
**📈 Overall Progress**: ~80% complete (Phases 1-3 complete, Phase 4 mostly complete)

**Key Achievements in Phases 1-3**:
- **Complete entity management system**: 6 entities with full CRUD and versioning
- **Advanced CLI interface**: 30+ commands with baseline-aware historical queries
- **Proven architecture patterns**: Manual routes approach with factorized CLI and service layers
- **Production-ready features**: Optimistic locking, transaction management, comprehensive error handling

**Phase 4 Achievements**:
- **Complete ODP Edition implementation**: Store, service, and route layers working
- **Multi-context operations**: Baseline + wave filtering across all operational entities
- **Clean architecture**: VersionedItemRouter with simplified parameter handling
- **OpenAPI compliance**: Correct parameter documentation without internal complexity

**Phase 4 Remaining Work**:
- **CLI commands**: ODP Edition management commands (create/list/show)
- **Enhanced operational CLI**: --fromWave flag support
- **Final cleanup**: Remove remaining baseline wave references, database migration
- **Integration testing**: End-to-end validation of multi-context operations

**Immediate next focus**: Complete ODP Edition CLI commands to validate the complete Phase 4 implementation. This will enable full testing of the auto-baseline creation and multi-context filtering capabilities.

This near-completion of Phase 4 represents the final backend milestone before transitioning to web client development. The multi-context pattern provides the complete deployment planning foundation needed for sophisticated web-based interfaces.