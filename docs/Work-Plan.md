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

## 4 Phase 2: Business Extension - Setup Entities (🎯 NEXT)

### 4.1 Server Implementation
**Pattern**: Follow established StakeholderCategory pattern for each entity
- [ ] **RegulatoryAspect entity**:
  - [ ] Store Layer: Create RegulatoryAspectStore extending BaseStore
  - [ ] Service Layer: Create RegulatoryAspectService with transaction management
  - [ ] Route Layer: Create routes/regulatory-aspect.js with CRUD operations
  - [ ] Integration: Add routes to main server index.js
- [ ] **Service entity**:
  - [ ] Store Layer: Create ServiceStore extending BaseStore
  - [ ] Service Layer: Create ServiceService with transaction management
  - [ ] Route Layer: Create routes/service.js with CRUD operations
  - [ ] Integration: Add routes to main server index.js
- [ ] **Data entity**:
  - [ ] Store Layer: Create DataStore extending BaseStore
  - [ ] Service Layer: Create DataService with transaction management
  - [ ] Route Layer: Create routes/data.js with CRUD operations
  - [ ] Integration: Add routes to main server index.js
- [ ] **Hierarchy operations**: REFINES relationships for all entities

### 4.2 Shared Models
- [ ] Add RegulatoryAspect model to @odp/shared
- [ ] Add Service model to @odp/shared
- [ ] Add Data model to @odp/shared
- [ ] Request/response structures for each entity

### 4.3 CLI Implementation
**Pattern**: Follow established stakeholder-category.js pattern for each entity
- [ ] **CLI commands for RegulatoryAspect**:
  - [ ] `odp regulatory-aspect list/create/show/update/delete`
- [ ] **CLI commands for Service**:
  - [ ] `odp service list/create/show/update/delete`
- [ ] **CLI commands for Data**:
  - [ ] `odp data list/create/show/update/delete`

## 5 Phase 3: Business Extension - Operational Entities

### 5.1 Server Implementation
**Pattern**: Implement versioning pattern (Item/ItemVersion) for operational entities
- [ ] **Versioning pattern implementation**:
  - [ ] Update BaseStore to support Item/ItemVersion pattern
  - [ ] Implement optimistic locking with expected_version
  - [ ] Add version-aware CRUD operations
- [ ] **OperationalNeed entity with versioning**:
  - [ ] Store Layer: OperationalNeedStore with versioning support
  - [ ] Service Layer: OperationalNeedService with version management
  - [ ] Route Layer: routes/operational-need.js with version handling
- [ ] **OperationalRequirement entity with versioning**:
  - [ ] Store Layer: OperationalRequirementStore with versioning support
  - [ ] Service Layer: OperationalRequirementService with version management
  - [ ] Route Layer: routes/operational-requirement.js with version handling
- [ ] **Cross-entity relationships**:
  - [ ] IMPLEMENTS: OperationalRequirement → OperationalNeed
  - [ ] REFINES: Self-referencing hierarchies
  - [ ] IMPACTS: Operational entities → Setup entities

### 5.2 Shared Models
- [ ] Add OperationalNeed and OperationalNeedVersion models
- [ ] Add OperationalRequirement and OperationalRequirementVersion models
- [ ] Version-aware request structures with expected_version
- [ ] Relationship management request structures

### 5.3 CLI Implementation
- [ ] **CLI commands for OperationalNeed**:
  - [ ] `odp operational-need list/create/show/update/delete`
  - [ ] Version management commands
  - [ ] Relationship management commands
- [ ] **CLI commands for OperationalRequirement**:
  - [ ] `odp operational-requirement list/create/show/update/delete`
  - [ ] Version management commands
  - [ ] Relationship management commands

## 6 Phase 4: Business Extension - Management Entities

### 6.1 Server Implementation
- [ ] **Wave entity implementation**:
  - [ ] Store Layer: WaveStore for timeline management
  - [ ] Service Layer: WaveService with quarter/year validation
  - [ ] Route Layer: routes/wave.js with temporal operations
- [ ] **OperationalChange entity with versioning**:
  - [ ] Store Layer: OperationalChangeStore with versioning support
  - [ ] Service Layer: OperationalChangeService with milestone management
  - [ ] Route Layer: routes/operational-change.js
- [ ] **OperationalChangeMilestone entity**:
  - [ ] Store Layer: OperationalChangeMilestoneStore
  - [ ] Service Layer: OperationalChangeMilestoneService
  - [ ] Route Layer: routes/operational-change-milestone.js
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
- [ ] Add OperationalChange and OperationalChangeVersion models
- [ ] Add OperationalChangeMilestone model
- [ ] Add ODPBaseline, ODPBaselineItem, and ODPEdition models
- [ ] Baseline and edition request structures

### 6.3 CLI Implementation
- [ ] **CLI commands for Wave operations**:
  - [ ] `odp wave list/create/show/update/delete`
  - [ ] Timeline management commands
- [ ] **CLI commands for OperationalChange operations**:
  - [ ] `odp operational-change list/create/show/update/delete`
  - [ ] Milestone management commands
- [ ] **CLI commands for Milestone operations**:
  - [ ] `odp milestone list/create/show/update/delete`
  - [ ] Wave targeting commands
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
- [ ] OperationalNeed UI components with versioning support:
  - [ ] Version history display
  - [ ] Optimistic locking handling
  - [ ] Rich text editing for statement/rationale fields
- [ ] OperationalRequirement UI components with versioning support
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

### Quality Gates per Phase
- **Working endpoints**: Full CRUD operations with proper error handling
- **CLI validation**: Command-line interface tests all API functionality for each entity
- **Documentation**: Updated implementation guides and patterns
- **Integration testing**: End-to-end workflow validation across all layers

### Entity Implementation Pattern (Phases 2-4)
For each new entity, follow this proven pattern:
1. **Shared Models**: Add entity definition to `@odp/shared`
2. **Store Layer**: Create entity store extending BaseStore
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

This work plan maintains the successful manual routes approach established in Phase 1 while providing a clear roadmap for comprehensive ODP functionality across all planned phases.