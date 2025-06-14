# Project Setup Summary

## Repository Structure
```
odp/
├── workspace/
│   ├── cli/
│   │   ├── src/
│   │   │   ├── commands/        # CLI command handlers
│   │   │   │   ├── stakeholder-category.js  # Setup entity commands
│   │   │   │   ├── data-category.js         # Setup entity commands
│   │   │   │   ├── service.js               # Setup entity commands
│   │   │   │   ├── regulatory-aspect.js     # Setup entity commands
│   │   │   │   ├── operational-requirement.js # Operational entity commands (+ PATCH)
│   │   │   │   ├── operational-change.js    # Operational entity commands (+ PATCH + Milestones)
│   │   │   │   └── base-commands.js         # Factorized command patterns
│   │   │   └── index.js         # CLI entry point
│   │   ├── config.json          # Server endpoint configuration
│   │   └── package.json
│   ├── server/
│   │   ├── src/
│   │   │   ├── routes/          # Express route files
│   │   │   │   ├── simple-item-router.js        # Base router for setup entities
│   │   │   │   ├── versioned-item-router.js     # Base router for operational entities (+ PATCH)
│   │   │   │   ├── stakeholder-category.js      # Setup entity routes
│   │   │   │   ├── data-category.js             # Setup entity routes
│   │   │   │   ├── service.js                   # Setup entity routes
│   │   │   │   ├── regulatory-aspect.js         # Setup entity routes
│   │   │   │   ├── operational-requirement.js   # Operational entity routes (+ PATCH)
│   │   │   │   └── operational-change.js        # Operational entity routes (+ PATCH + Milestones)
│   │   │   ├── services/        # Business logic layer
│   │   │   │   ├── SimpleItemService.js         # Base service for setup entities
│   │   │   │   ├── RefinableItemService.js      # Hierarchy support for setup entities
│   │   │   │   ├── VersionedItemService.js      # Base service for operational entities (+ PATCH)
│   │   │   │   ├── StakeholderCategoryService.js # Setup entity services
│   │   │   │   ├── DataCategoryService.js       # Setup entity services
│   │   │   │   ├── ServiceService.js            # Setup entity services
│   │   │   │   ├── RegulatoryAspectService.js   # Setup entity services
│   │   │   │   ├── OperationalRequirementService.js # Operational entity services (+ PATCH)
│   │   │   │   └── OperationalChangeService.js  # Operational entity services (+ PATCH + Milestones)
│   │   │   ├── store/           # Data access layer
│   │   │   │   ├── config.json  # Database configuration
│   │   │   │   └── ...          # Store implementations for all entities (+ normalizeId)
│   │   │   └── index.js         # Express server
│   │   └── package.json
│   ├── shared/
│   │   ├── src/
│   │   │   └── index.js        # API models and request structures (setup + operational + PATCH schemas)
│   │   └── package.json
│   └── web-client/
│       ├── src/
│       │   └── index.js
│       └── package.json
├── docker-compose.yml          # Development environment
├── package.json                # Root workspace configuration
├── package-lock.json
└── .gitignore
```

## Workspace Configuration
- **Monorepo approach** with npm workspaces under `workspace/` directory
- **ES modules** (`"type": "module"`) across all components
- **Package naming**: `@odp/shared`, `@odp/server`, `@odp/web-client`, `@odp/cli`
- **Dependencies**: Shared workspace provides API exchange models to all other components

## Technology Stack

### Root Project
- **Repository**: GitHub (jacques-lauzeral/odp)
- **Package manager**: npm with workspaces
- **Module system**: ES modules
- **Development environment**: Docker Compose
- **API approach**: Manual Express routes with factorized patterns (SimpleItemRouter, VersionedItemRouter)

### Shared Workspace (@odp/shared)
- **Purpose**: API exchange models between client and server
- **Dependencies**: None (pure JavaScript)
- **Current models**:
  - **Setup entities**: StakeholderCategory, RegulatoryAspect, DataCategory, Service with request structures
  - **Operational entities**: OperationalRequirement, OperationalChange with versioning and PATCH schemas
  - **Milestone structures**: Complete milestone models with event types and wave targeting
- **Pattern**: Base entity models with request/response extensions plus PATCH request schemas

### Server Workspace (@odp/server)
- **Framework**: Express.js with manual routes using factorized router patterns
- **Database**: Neo4j with official driver
- **Development**: Nodemon for auto-reload in Docker container
- **Architecture**: Routes → Services → Store Layer → Neo4j with factorized base classes
- **Route organization**:
  - SimpleItemRouter for setup entities (4 lines per entity)
  - VersionedItemRouter for operational entities with PATCH support
  - Milestone CRUD routes integrated into OperationalChange router

### Web Client Workspace (@odp/web-client)
- **Approach**: Vanilla JavaScript with specialized libraries (planned)
- **Rich text**: Quill editor (planned)
- **Tables**: AG-Grid Community (planned)
- **Timeline**: Vis.js Timeline (planned)

### CLI Workspace (@odp/cli)
- **Framework**: Commander.js for subcommand structure
- **HTTP client**: node-fetch for direct API calls
- **Output**: cli-table3 for ASCII table formatting
- **Command structure**:
  - BaseCommands factorization (8 lines per setup entity)
  - VersionedCommands factorization for operational entities
- **Binary name**: `npm run dev` command
- **Purpose**: Command-line interface for all ODP operations including PATCH and milestone management

## Development Environment

### Docker Compose Setup
- **Neo4j Database**: Version 5.15 with APOC plugin
- **Node.js Application**: Version 20 with live code reloading
- **Network**: Internal Docker network for service communication
- **Ports**:
  - 80 → ODP API Server
  - 7474 → Neo4j Browser
  - 7687 → Neo4j Bolt Protocol

### Configuration
- **Neo4j Authentication**: neo4j/password123
- **Database Connection**: bolt://neo4j:7687 (internal Docker network)
- **Server Configuration**: `workspace/server/src/store/config.json`
- **CLI Configuration**: `workspace/cli/config.json`

## Development Workflow

### Starting the Environment
```bash
# From odp/ root
docker-compose up
```

### Available Services
- **ODP API**:
  - **Setup entities**: http://localhost/stakeholder-categories, /regulatory-aspects, /data-categories, /services
  - **Operational entities**: http://localhost/operational-requirements, /operational-changes
  - **PATCH endpoints**: All operational entities support PATCH for partial updates
  - **Milestone endpoints**: http://localhost/operational-changes/:id/milestones/*
- **Health Check**: http://localhost/hello
- **Neo4j Browser**: http://localhost:7474

### Individual Workspace Development
- **Root commands**: `npm run dev` (starts all), `npm run build` (builds all)
- **Individual workspace commands**: `npm run server:dev`, `npm run client:dev`, etc.
- **Dependency management**: Centralized through root workspace
- **Code sharing**: Via @odp/shared workspace dependency with `file:../shared` references

## Factorized Architecture (Phase 2-3 Achievement)

### Store Layer Architecture
```
BaseStore (core CRUD operations + normalizeId)
    ↓
RefinableEntityStore (REFINES hierarchy operations)
    ↓
StakeholderCategoryStore, RegulatoryAspectStore, DataCategoryStore, ServiceStore
    
VersionedItemStore (versioning + optimistic locking)
    ↓
OperationalRequirementStore, OperationalChangeStore
```

### Service Layer Architecture
```
SimpleItemService (core CRUD with transactions)
    ↓
RefinableEntityService (hierarchy operations with transactions)
    ↓
StakeholderCategoryService, RegulatoryAspectService, DataCategoryService, ServiceService

VersionedItemService (versioning + PATCH pattern)
    ↓
OperationalRequirementService, OperationalChangeService
```

### Route Layer Architecture
- **SimpleItemRouter**: Factorized all CRUD route patterns for setup entities
- **VersionedItemRouter**: Factorized versioned CRUD + PATCH patterns for operational entities
- **Entity routes**: 4-line implementations using base routers
- **95% code reduction** compared to duplicated routes

### CLI Layer Architecture
- **BaseCommands**: Factorized all CRUD command patterns for setup entities
- **VersionedCommands**: Factorized versioned CRUD + PATCH patterns for operational entities
- **Entity commands**: 8-line implementations using base commands
- **95% code reduction** compared to duplicated commands

## API Implementation Pattern

### API Implementation Pattern
```
Routes (HTTP) → Services (Business Logic) → Store (Data Access) → Neo4j
     ↓               ↓                        ↓
Router Patterns → Service Patterns → Store Patterns
```

### Entity Development Pattern (Optimized)
1. **Shared Models**: Define entity structure in `@odp/shared` (4 lines)
2. **Store Layer**: Create entity store extending appropriate base class (4 lines)
3. **Service Layer**: Create service extending appropriate base class (4 lines)
4. **Route Layer**: Create route using appropriate base router (4 lines)
5. **CLI Commands**: Create commands using appropriate base commands (8 lines)
6. **Integration**: Update index files (3 lines total)

**Total**: ~31 lines per entity (vs. 200+ before factorization)

### Current Implementation Status

### Implemented Features (Phase 1-3 Complete)
✅ Repository structure with workspace organization  
✅ Docker Compose development environment  
✅ Neo4j database with connection management  
✅ Express server with live reload  
✅ **Factorized architecture**: Router patterns, BaseCommands patterns, Store patterns  
✅ **Six complete entity implementations**:
- **Setup entities**: StakeholderCategory, RegulatoryAspect, DataCategory, Service
- **Operational entities**: OperationalRequirement, OperationalChange  
  ✅ **Store layer**: BaseStore → RefinableEntityStore → Entity stores with REFINES hierarchy support + VersionedItemStore with versioning  
  ✅ **Service layer**: Service hierarchies with transaction management + PATCH support + milestone operations  
  ✅ **Route layer**: Router factorization with 95% code reduction + PATCH endpoints + milestone CRUD  
  ✅ **CLI layer**: Command factorization with 95% code reduction + PATCH commands + milestone commands  
  ✅ **API endpoints**: All CRUD + PATCH + versioning + milestone operations  
  ✅ **CLI commands**: Complete command set for all entities  
  ✅ **Workspace dependency resolution**  
  ✅ **Clean separation of concerns** across layers  
  ✅ **ID normalization**: Consistent ID handling across all layers

### Working Features (All Entities)

#### Setup Entities (4 entities)
- **Manual Express Routes**:
  - `GET/POST/PUT/DELETE /stakeholder-categories`
  - `GET/POST/PUT/DELETE /regulatory-aspects`
  - `GET/POST/PUT/DELETE /data-categories`
  - `GET/POST/PUT/DELETE /services`
- **CLI Commands** (20 commands total):
  - `npm run dev {entity} list/create/show/update/delete`
  - **All commands support**: Table formatting, CRUD operations, hierarchy (--parent option)

#### Operational Entities (2 entities)
- **Versioned Express Routes**:
  - `GET/POST/PUT/PATCH/DELETE /operational-requirements`
  - `GET/POST/PUT/PATCH/DELETE /operational-changes`
  - **Version endpoints**: `GET /:id/versions`, `GET /:id/versions/:versionNumber`
  - **Milestone endpoints**: `GET/POST/PUT/DELETE /operational-changes/:id/milestones/*`
- **CLI Commands** (15+ commands total):
  - **OperationalRequirement**: `list/show/versions/show-version/create/update/patch`
  - **OperationalChange**: `list/show/versions/show-version/create/update/patch/delete/milestone-list/milestone-show/milestone-add/milestone-update/milestone-delete`

### Available API Endpoints (Complete)

#### Setup Management (Phase 2)
- **StakeholderCategory**: `/stakeholder-categories`
- **RegulatoryAspect**: `/regulatory-aspects`
- **DataCategory**: `/data-categories`
- **Service**: `/services`

#### Operational Management (Phase 3)
- **OperationalRequirement**: `/operational-requirements` (+ PATCH)
- **OperationalChange**: `/operational-changes` (+ PATCH)
- **Milestones**: `/operational-changes/:id/milestones/*` (5 CRUD operations)

### Available CLI Commands (Complete)

#### Setup Entities
```bash
# StakeholderCategory, RegulatoryAspect, DataCategory, Service
npm run dev {entity} list
npm run dev {entity} create "Name" "Description" [--parent <id>]
npm run dev {entity} show <id>
npm run dev {entity} update <id> "Name" "Description" [--parent <id>]
npm run dev {entity} delete <id>
```

#### Operational Entities
```bash
# OperationalRequirement
npm run dev requirement list
npm run dev requirement show <itemId>
npm run dev requirement versions <itemId>
npm run dev requirement show-version <itemId> <versionNumber>
npm run dev requirement create <title> [--type <ON|OR>] [options...]
npm run dev requirement update <itemId> <expectedVersionId> <title> [options...]
npm run dev requirement patch <itemId> <expectedVersionId> [--title <title>] [options...]

# OperationalChange
npm run dev change list
npm run dev change show <itemId>
npm run dev change versions <itemId>
npm run dev change show-version <itemId> <versionNumber>
npm run dev change create <title> [--description <desc>] [options...]
npm run dev change update <itemId> <expectedVersionId> <title> [options...]
npm run dev change patch <itemId> <expectedVersionId> [--title <title>] [options...]
npm run dev change delete <itemId>

# Milestone Management
npm run dev change milestone-list <itemId>
npm run dev change milestone-show <itemId> <milestoneId>
npm run dev change milestone-add <itemId> <expectedVersionId> <title> <description> [options...]
npm run dev change milestone-update <itemId> <milestoneId> <expectedVersionId> [options...]
npm run dev change milestone-delete <itemId> <milestoneId> <expectedVersionId>
```

### Next Implementation Steps (Phase 4)
- Add Wave entity for timeline management
- Implement ODPBaseline and ODPBaselineItem for snapshot management
- Add ODPEdition entity for publication workflow
- Develop web client UI components for all entities

## Key Design Decisions

### Architecture Simplifications & Improvements
1. **Manual Express routes**: Direct, readable route definitions with factorized base routers
2. **HTTP client integration**: CLI uses direct fetch calls with factorized base commands
3. **Clean layer separation**: Routes → Services → Store → Database with inheritance hierarchies
4. **Entity organization**: Factorized base classes enabling rapid entity expansion
5. **ES modules throughout**: Consistent module system across all components
6. **Versioning system**: Complete Item/ItemVersion pattern with optimistic locking
7. **PATCH operations**: Partial updates with field inheritance across operational entities
8. **Milestone management**: Full CRUD with versioning integration

### Factorization Achievements (Phase 2-3)
1. **95% code reduction**: Router patterns and BaseCommands eliminate duplication
2. **Inheritance patterns**: Clean base class hierarchies across all layers
3. **Rapid entity expansion**: New entities require ~31 lines vs 200+ previously
4. **Consistent behavior**: All entities follow identical patterns
5. **Single source of truth**: Base classes ensure consistency across operations
6. **PATCH pattern**: Consistent partial update implementation across operational entities
7. **Milestone pattern**: Reusable CRUD operations with versioning integration

### Development Philosophy
- **Container-based development**: All dependencies managed through Docker
- **Factorized implementation**: Base pattern extraction for maximum code reuse
- **Pattern consistency**: Repeatable patterns for rapid entity expansion
- **Live development**: File changes reflected immediately in running containers
- **Version management**: Complete audit trails with optimistic locking
- **ID normalization**: Consistent entity comparison across all layers

### Quality Practices
- **Transaction management**: Explicit boundaries with proper error handling
- **Error consistency**: Standardized JSON error responses across all endpoints
- **Code organization**: Clean separation between HTTP, business logic, and data access
- **Testing approach**: CLI provides comprehensive API validation for all entities
- **Documentation**: Self-documenting code structure with clear patterns
- **Version control**: Optimistic locking prevents concurrent modification conflicts

## Testing and Validation

### Current Testing Approach
```bash
# Setup entities - CLI provides comprehensive testing
npm run dev stakeholder-category list
npm run dev stakeholder-category create "Test" "Description"
npm run dev stakeholder-category show <id>
npm run dev stakeholder-category update <id> "Updated" "New description"
npm run dev stakeholder-category delete <id>

# Same pattern works for all setup entities:
npm run dev regulatory-aspect [commands]
npm run dev data-category [commands] 
npm run dev service [commands]

# Operational entities - including versioning and PATCH
npm run dev requirement create "Test Requirement" --type OR
npm run dev requirement show <itemId>
npm run dev requirement patch <itemId> <versionId> --statement "Updated statement"
npm run dev requirement versions <itemId>

# Milestone operations
npm run dev change create "Test Change"
npm run dev change milestone-add <itemId> <versionId> "Milestone 1" "Description"
npm run dev change milestone-list <itemId>
npm run dev change milestone-update <itemId> <milestoneId> <versionId> --title "Updated"

# Direct API testing
curl http://localhost/stakeholder-categories
curl http://localhost/operational-requirements
curl -X PATCH http://localhost/operational-changes/1 -H "Content-Type: application/json" -d '{"expectedVersionId":"v1","title":"New Title"}'
curl http://localhost/operational-changes/1/milestones
```

### Validation Status (Phase 1-3)
- ✅ All CRUD operations working correctly for all six entities
- ✅ Error handling with proper HTTP status codes
- ✅ Transaction management with automatic rollback
- ✅ CLI integration with table formatting for all entities
- ✅ Docker environment with live reload
- ✅ REFINES hierarchy relationships working for all entities
- ✅ Factorized architecture patterns validated across all layers
- ✅ Versioning system with optimistic locking working correctly
- ✅ PATCH operations providing proper field inheritance
- ✅ Milestone CRUD operations with version management
- ✅ ID normalization preventing comparison issues

## Phase 1-3 Completion Summary

**✅ Phase 1 - CLI for StakeholderCategory - COMPLETE**
- **First entity** implemented with full CRUD and CLI support
- **Architecture patterns** established for manual routes and CLI integration
- **Foundation** laid for rapid entity expansion

**✅ Phase 2 - Business Extension - Setup Entities - COMPLETE**
- **Four complete setup entities** implemented with full CRUD and hierarchy support
- **Significant architectural improvements** achieved through factorization
- **95% code reduction** in route and CLI layers through base pattern extraction
- **Inheritance patterns** established across all layers (Store, Service, Route, CLI)

**✅ Phase 3 - Business Extension - Operational Entities - COMPLETE**
- **Complete versioning system** with Item/ItemVersion pattern and optimistic locking
- **PATCH operations** for partial updates across operational entities
- **Full milestone CRUD** with versioning integration (5 operations)
- **Advanced CLI** with 15+ commands for operational entity management
- **ID normalization** for consistent entity comparison
- **Modular OpenAPI** specification for maintainable documentation

The current setup provides a **comprehensive, production-ready foundation** for operational deployment plan management with proven patterns that are easy to understand, maintain, and extend. The architectural improvements across all three phases significantly reduce future development effort while maintaining consistency and quality.

**Ready for Phase 4**: Wave, Baseline, and ODP Edition entities to complete the management workflow.