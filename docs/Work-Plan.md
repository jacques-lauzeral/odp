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
- ✅ CLI commands for StakeholderCategory:
  - ✅ `odp stakeholder-category list` - Table view of all categories
  - ✅ `odp stakeholder-category create <n> <description>` - Create new category
  - ✅ `odp stakeholder-category show <id>` - Show specific category
  - ✅ `odp stakeholder-category update <id> <n> <description>` - Update category
  - ✅ `odp stakeholder-category delete <id>` - Delete category
- ✅ Complete CRUD operations working
- ✅ Shared model usage validation
- ✅ Manual routes architecture established

## 4 Phase 2: Business Extension - Setup Entities (✅ COMPLETED)

### 4.1 Server Implementation (✅ COMPLETED)
**Pattern**: Follow established StakeholderCategory pattern for each entity
- ✅ **RegulatoryAspect entity**:
  - ✅ Store Layer: RegulatoryAspectStore extending BaseStore
  - ✅ Service Layer: RegulatoryAspectService with transaction management
  - ✅ Route Layer: routes/regulatory-aspect.js with CRUD operations
  - ✅ Integration: Routes added to main server index.js
- ✅ **Service entity**:
  - ✅ Store Layer: ServiceStore extending BaseStore
  - ✅ Service Layer: ServiceService with transaction management
  - ✅ Route Layer: routes/service.js with CRUD operations
  - ✅ Integration: Routes added to main server index.js
- ✅ **Data entity**:
  - ✅ Store Layer: DataStore extending BaseStore
  - ✅ Service Layer: DataService with transaction management
  - ✅ Route Layer: routes/data.js with CRUD operations
  - ✅ Integration: Routes added to main server index.js
- ✅ **Hierarchy operations**: REFINES relationships for all entities

### 4.2 Shared Models (✅ COMPLETED)
- ✅ Added RegulatoryAspect model to @odp/shared
- ✅ Added Service model to @odp/shared
- ✅ Added Data model to @odp/shared
- ✅ Request/response structures for each entity

### 4.3 CLI Implementation (✅ COMPLETED)
**Pattern**: Follow established stakeholder-category.js pattern for each entity
- ✅ **CLI commands for RegulatoryAspect**:
  - ✅ `odp regulatory-aspect list/create/show/update/delete`
- ✅ **CLI commands for Service**:
  - ✅ `odp service list/create/show/update/delete`
- ✅ **CLI commands for Data**:
  - ✅ `odp data list/create/show/update/delete`

## 5 Phase 3: Business Extension - Operational Entities (🔄 IN PROGRESS)

### 5.1 Server Implementation
**Pattern**: Implement versioning pattern (Item/ItemVersion) for operational entities with relationship audit trail

#### 5.1.1 Versioning Pattern Implementation (✅ COMPLETED)
- ✅ **VersionedItemStore base class**:
  - ✅ Dual-node pattern (Item + ItemVersion) implementation
  - ✅ Sequential versioning with optimistic locking (expectedVersionId)
  - ✅ Version-aware CRUD operations (create, update, findById, findByIdAndVersion, findVersionHistory)
  - ✅ Transaction integration with user context (createTransaction(userId))
  - ✅ Automatic latest_version management and relationship handling

#### 5.1.2 Storage Model Simplification (✅ COMPLETED)
- ✅ **Model update**: Eliminated separate OperationalNeed entity
- ✅ **OperationalRequirement with type field**: 'ON' (Operational Need) | 'OR' (Operational Requirement)
- ✅ **Relationship simplification**: Single REFINES relationship with type-based validation
- ✅ **IMPACTS relationships**: Direct from OperationalRequirement to setup entities
- ✅ **OperationalChange**: Separate versioned entity with SATISFIES/SUPERSEDS relationships

#### 5.1.3 Store Layer Implementation (✅ COMPLETED - NEEDS REWORK)
- ✅ **OperationalRequirementStore** (versioned + REFINES + IMPACTS)
- ✅ **OperationalChangeStore** (versioned + SATISFIES + SUPERSEDS + Milestones)

#### 5.1.5 Store Layer Integration (✅ COMPLETED)
- ✅ **Update store/index.js**: Add OperationalRequirementStore and OperationalChangeStore to initialization and exports

### 5.2 Documentation Updates (✅ COMPLETED)
- ✅ **Storage Model**
- ✅ **Store Layer API**
- ✅ **Store Layer Design**
- ✅ **Work Plan**

### 5.3 Service Layer Implementation (🎯 NEXT)
- [ ] **OperationalRequirementService**:
  - [ ] Business logic with version management and optimistic locking
  - [ ] Separate transaction boundaries for field vs relationship updates
  - [ ] Type validation (ON/OR) and REFINES business rules (ON→ON, OR→OR, OR→ON)
  - [ ] IMPACTS relationship validation and management
- [ ] **OperationalChangeService**:
  - [ ] Version lifecycle management with SATISFIES/SUPERSEDS relationships
  - [ ] Milestone coordination and timeline management
  - [ ] Business logic for change impact analysis
- [ ] **OperationalChangeMilestoneService**:
  - [ ] Milestone lifecycle with change and wave coordination
  - [ ] Event type validation and wave targeting logic

### 5.5 Route Layer Implementation (🎯 AFTER SERVICE LAYER)
- [ ] **routes/operational-requirement.js**:
  - [ ] RESTful CRUD operations with version handling
  - [ ] Optimistic locking via expectedVersionId in requests
  - [ ] Separate endpoints for field updates vs relationship management
  - [ ] Version history and navigation endpoints
  - [ ] Historical relationship queries
- [ ] **routes/operational-change.js**:
  - [ ] Versioned CRUD operations with SATISFIES/SUPERSEDS management
  - [ ] Milestone coordination endpoints
  - [ ] Change impact and requirement analysis endpoints
- [ ] **routes/operational-change-milestone.js**:
  - [ ] Standard CRUD operations with relationship management
  - [ ] Timeline and wave targeting endpoints

### 5.6 Shared Models Implementation (🎯 AFTER ROUTE LAYER)
- [ ] **OperationalRequirement and OperationalRequirementVersion models**:
  - [ ] Base entity with type field ('ON' | 'OR')
  - [ ] Version-aware request structures with expectedVersionId
  - [ ] Separate relationship management request structures (add/remove pattern)
- [ ] **OperationalChange and OperationalChangeVersion models**:
  - [ ] Versioned entity with description and visibility fields
  - [ ] SATISFIES/SUPERSEDS relationship structures
  - [ ] Milestone coordination structures
- [ ] **OperationalChangeMilestone model**:
  - [ ] Standard entity with eventTypes array
  - [ ] BELONGS_TO and TARGETS relationship structures
- [ ] **RelationshipAuditLog model**:
  - [ ] Audit trail structure for API exposure

### 5.7 CLI Implementation (🎯 AFTER SHARED MODELS)
- [ ] **CLI commands for OperationalRequirement**:
  - [ ] `odp operational-requirement list/create/show/update/delete`
  - [ ] Version management commands (history, specific version access)
  - [ ] Relationship management commands (add-refines, remove-refines, add-impacts, remove-impacts)
  - [ ] Audit trail commands (show-history, show-relationships-at-time)
- [ ] **CLI commands for OperationalChange**:
  - [ ] `odp operational-change list/create/show/update/delete`
  - [ ] Version management with milestone coordination
  - [ ] Relationship management (add/remove satisfies, superseds)
- [ ] **CLI commands for OperationalChangeMilestone**:
  - [ ] `odp milestone list/create/show/update/delete`
  - [ ] Change and wave targeting commands

## 6 Phase 4: Business Extension - Management Entities

### 6.1 Server Implementation
- [ ] **Wave entity implementation**:
  - [ ] Store Layer: WaveStore for timeline management
  - [ ] Service Layer: WaveService with quarter/year validation
  - [ ] Route Layer: routes/wave.js with temporal operations
- [ ] **Baseline management system**:
  - [ ] ODPBaseline and ODPBaselineItem entities
  - [ ] Baseline snapshot functionality (capture current versions)
  - [ ] Historical navigation using explicit version specifications
- [ ] **ODPEdition entity**:
  - [ ] Store Layer: ODPEditionStore for publication management
  - [ ] Service Layer: ODPEditionService with draft/official lifecycle
  - [ ] Route Layer: routes/odp-edition.js

### 6.2 Shared Models
- [ ] Add Wave model with temporal validation
- [ ] Add ODPBaseline, ODPBaselineItem, and ODPEdition models
- [ ] Baseline and edition request structures

### 6.3 CLI Implementation
- [ ] **CLI commands for Wave operations**:
  - [ ] `odp wave list/create/show/update/delete`
  - [ ] Timeline management commands
- [ ] **CLI commands for Baseline management**:
  - [ ] `odp baseline create/list/show`
  - [ ] Historical navigation commands
- [ ] **CLI commands for ODP Edition management**:
  - [ ] `odp edition create/list/show/publish`
  - [ ] Draft/official lifecycle commands

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
- [ ] Unified hierarchy management across all setup entities
- [ ] Cross-entity navigation and relationship display

## 9 Phase 7: Web Client - Operational Entities
- [ ] OperationalRequirement UI components with versioning support:
  - [ ] Version history display
  - [ ] Optimistic locking handling
  - [ ] Rich text editing for statement/rationale fields
  - [ ] Type selection and validation (ON/OR)
- [ ] OperationalChange UI components with versioning support
- [ ] Relationship management interface:
  - [ ] Visual relationship mapping
  - [ ] Cross-entity navigation
  - [ ] Relationship creation/deletion
- [ ] Version comparison and diff display

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

**✅ Completed Phases**: 1-2 (Setup + Setup Entities)
**🔄 Current Phase**: 3 (Operational Entities) - Store Layer Complete, Service Layer Next
**📈 Overall Progress**: ~40% complete
**🎯 Next Milestone**: Complete Phase 3 Service + Route layers to enable operational entity management

**Key Achievements in Phase 3**:
- Robust versioning pattern with optimistic locking
- Simplified storage model eliminating complexity
- Complete store layer with versioned entity support
- Comprehensive documentation for future development

This work plan maintains the successful manual routes approach established in Phase 1 while providing a clear roadmap for comprehensive ODP functionality across all planned phases.