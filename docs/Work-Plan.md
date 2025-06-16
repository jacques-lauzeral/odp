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

## 6 Phase 4: Business Extension - Management Entities (✅ COMPLETED)

### 6.1 Server Implementation ✅ COMPLETED
- ✅ **Wave entity implementation**:
  - ✅ Store Layer: WaveStore for timeline management
  - ✅ Service Layer: WaveService with quarter/year validation extending SimpleItemService
  - ✅ Route Layer: wave.js using SimpleItemRouter
- ✅ **Baseline management system**:
  - ✅ **Simplified storage model**: Direct HAS_ITEMS relationships design complete
  - ✅ **Baseline entity design**: Atomic snapshot creation without intermediate nodes
  - ✅ **Store implementation**: BaselineStore with immutable operations
  - ✅ **Service implementation**: BaselineService with atomic snapshot creation
  - ✅ **Route implementation**: baseline.js standalone router with immutable enforcement
- ✅ **Service layer refactoring**:
  - ✅ SimpleItemService (abstract base with transaction management)
  - ✅ TreeItemService (name/description validation + REFINES hierarchy)
  - ✅ Individual concrete services (StakeholderCategoryService, DataCategoryService, ServiceService, RegulatoryAspectService)
  - ✅ Enhanced VersionedItemService with baseline-aware operations

### 6.2 Shared Models ✅ COMPLETED
- ✅ **Wave model** with temporal validation (year, quarter, date, derived name)
- ✅ **Baseline model** with simplified structure
- ✅ **Baseline-aware request structures** for operational entities
- ✅ **Updated shared/src/index.js** with Wave and Baseline models

### 6.3 CLI Implementation ❌ NOT IMPLEMENTED
- ❌ **CLI commands for Wave operations**: Need implementation with temporal validation
- ❌ **CLI commands for Baseline management**: Need implementation (create/list/show only)
- ❌ **Enhanced operational CLI**: Need `--baseline` flag support for historical queries

### 6.4 API Documentation ✅ COMPLETED
- ✅ **Complete OpenAPI specification update**:
  - ✅ Wave endpoints and schemas
  - ✅ Baseline management endpoints
  - ✅ Baseline-aware query parameters for operational entities
  - ✅ Updated root OpenAPI file with all Phase 4 endpoints

### 6.5 Route Layer Implementation ✅ COMPLETED
- ✅ **Enhanced router hierarchy**:
  - ✅ SimpleItemRouter for CRUD operations (TreeItemService, WaveService)
  - ✅ VersionedItemRouter with baseline parameter support
  - ✅ Standalone baseline.js router with immutable operations
- ✅ **Server integration**: All routes mounted and documented in server/src/index.js
- ✅ **OpenAPI compliance**: Full conformance to specification

**Phase 4 Summary**: ✅ **90% Complete** - Server implementation, route layer, and shared models fully complete. Only CLI implementation remains.

**Next Priority**: CLI implementation for Wave and Baseline operations to achieve 100% Phase 4 completion.
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
- [ ] Wave UI components for timeline management
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

## 10 Phase 8: Web Client - Management Entities
- [ ] Wave management interface:
  - [ ] Timeline view for quarterly planning
  - [ ] Wave creation with temporal validation
- [ ] OperationalChange UI with milestone integration:
  - [ ] Milestone timeline visualization
  - [ ] Progress tracking interface
- [ ] Baseline creation and management:
  - [ ] Snapshot creation interface
  - [ ] Historical navigation with baseline selection
  - [ ] Baseline-aware entity browsing
- [ ] ODP Edition interface:
  - [ ] Draft/official lifecycle management
  - [ ] Publication workflow
- [ ] Comprehensive timeline view for deployment planning using Vis.js

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
- **Baseline support**: Simplified direct relationships for historical context

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
- Baseline management enables reliable deployment planning
- System demonstrates complete operational deployment plan lifecycle

### Technical Achievement
- Scalable manual routes architecture supporting unlimited entity expansion
- Robust versioning and baseline management for operational entities
- Clean separation between setup data and operational data
- Efficient Neo4j utilization with proper relationship management
- Consistent patterns that enable rapid development of future entities

## Current Status Summary

**✅ Completed Phases**: 1-3 (Setup + Setup Entities + Operational Entities)
**🔄 Current Phase**: 4 (Management Entities) - Design and documentation complete, implementation in early stages
**📈 Overall Progress**: ~60% complete (Phases 1-3 complete, Phase 4 design done but implementation needed)
**🎯 Next Milestone**: Implement Wave entity across service/route/CLI layers, then baseline management implementation

**Key Achievements in Phases 1-3**:
- Complete versioning system with optimistic locking and audit trails
- PATCH operations for partial updates across all operational entities
- Full milestone CRUD operations with versioning integration
- Modular OpenAPI specification for maintainable API documentation
- Comprehensive CLI with 25+ commands for all entity management
- Factorized architecture patterns enabling rapid future development

**Phase 4 Progress**:
- **Wave entity**: Store layer complete, service/route/CLI layers need implementation
- **Baseline system**: Complete design and documentation, but no implementation yet
- **API documentation**: Complete OpenAPI updates for Phase 4 features

This work plan maintains the successful manual routes approach established in Phase 1 while providing a clear roadmap for comprehensive ODP functionality across all planned phases.