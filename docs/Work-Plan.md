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

### 2.2 Service layer (✅ COMPLETED - Simplified)
- ✅ Direct Express routes to Store layer (simplified architecture)
- ✅ REST API implementation
- ✅ Transaction management integration

### 2.3 Server side transversal aspects (✅ COMPLETED)
- ✅ Bootstrap and initialization
- ✅ Error handling and logging
- ✅ Docker containerization

## 3 Phase 1: CLI for Current Scope (🎯 NEXT)
- CLI technical solution setup
- CLI commands for StakeholderCategory:
    - `odp stakeholder-category list`
    - `odp stakeholder-category create <name> <description>`
    - `odp stakeholder-category update <id> <name> <description>`
    - `odp stakeholder-category delete <id>`
    - `odp stakeholder-category show <id>`
- API client integration
- Shared model usage validation

## 4 Phase 2: Business Extension - Setup Entities
### 4.1 Server Implementation
- RegulatoryAspect entity (Store Layer + REST API)
- Service entity (Store Layer + REST API)
- Data entity (Store Layer + REST API)
- OpenAPI specification updates
- Hierarchy operations for each entity

### 4.2 CLI Implementation
- CLI commands for RegulatoryAspect operations
- CLI commands for Service operations
- CLI commands for Data operations

## 5 Phase 3: Business Extension - Operational Entities
### 5.1 Server Implementation
- Versioning pattern implementation (Item/ItemVersion)
- OperationalNeed entity with versioning
- OperationalRequirement entity with versioning
- Cross-entity relationships (IMPLEMENTS, REFINES)
- Optimistic locking (expected_version)

### 5.2 CLI Implementation
- CLI commands for OperationalNeed operations
- CLI commands for OperationalRequirement operations
- Version management commands
- Relationship management commands

## 6 Phase 4: Business Extension - Management Entities
### 6.1 Server Implementation
- Wave entity implementation
- OperationalChange entity with versioning
- OperationalChangeMilestone entity
- ODPBaseline and ODPBaselineItem entities
- ODPEdition entity
- Baseline snapshot functionality

### 6.2 CLI Implementation
- CLI commands for Wave operations
- CLI commands for OperationalChange operations
- CLI commands for Milestone operations
- CLI commands for Baseline management
- CLI commands for ODP Edition management

## 7 Phase 5: Web Client - Current Scope
- Web Client technical solution
- StakeholderCategory UI components:
    - List view with hierarchy display
    - Create/edit forms
    - Delete confirmation
    - Hierarchy management interface

## 8 Phase 6: Web Client - Setup Entities
- RegulatoryAspect UI components
- Service UI components
- Data UI components
- Unified hierarchy management across entities

## 9 Phase 7: Web Client - Operational Entities
- OperationalNeed UI components with versioning
- OperationalRequirement UI components with versioning
- Version history display
- Relationship management interface
- Cross-entity navigation

## 10 Phase 8: Web Client - Management Entities
- Wave management interface
- OperationalChange UI with milestones
- Baseline creation and management
- ODP Edition interface
- Timeline view for deployment planning

## Implementation Principles

### Development Approach
- **Incremental delivery**: Each phase delivers working functionality
- **Parallel CLI + Server**: Validate APIs through CLI development
- **Pattern reuse**: Establish patterns in Phase 1, replicate in subsequent phases
- **Complexity graduation**: Simple entities → Versioned entities → Complex relationships

### Technical Standards
- **API-first**: OpenAPI specification drives implementation
- **Transaction management**: Explicit boundaries with proper error handling
- **Shared models**: Consistent data structures across CLI, Server, and Web Client
- **Docker development**: Containerized environment for all development

### Quality Gates
- **Working endpoints**: Full CRUD operations with hierarchy support
- **CLI validation**: Command-line interface tests all API functionality
- **Documentation**: Updated specifications and implementation guides
- **Integration testing**: End-to-end workflow validation

## Success Criteria

### Phase Completion Criteria
- All planned entities implemented with full CRUD operations
- CLI commands provide complete functionality coverage
- Web client offers intuitive user experience
- Baseline management enables deployment planning
- System demonstrates operational deployment plan lifecycle

### Technical Achievement
- Scalable architecture supporting future entities
- Robust versioning and baseline management
- Clean separation between setup and operational data
- Efficient Neo4j utilization with proper relationships