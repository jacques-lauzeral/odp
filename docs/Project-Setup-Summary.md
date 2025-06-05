# Project Setup Summary

## Repository Structure
```
odp/
├── workspace/
│   ├── cli/
│   │   ├── src/
│   │   │   └── index.js
│   │   └── package.json
│   ├── server/
│   │   ├── src/
│   │   │   ├── store/           # Store layer with Neo4j integration
│   │   │   │   ├── config.json  # Database configuration
│   │   │   │   └── ...
│   │   │   └── index.js         # Express server
│   │   ├── generated-src/       # OpenAPI generated code
│   │   └── package.json
│   ├── shared/
│   │   ├── src/
│   │   │   └── index.js        # API models and request structures
│   │   └── package.json
│   └── web-client/
│       ├── src/
│       │   └── index.js
│       └── package.json
├── openapi.yaml                 # API specification
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
- **API specification**: OpenAPI 3.1.0

### Shared Workspace (@odp/shared)
- **Purpose**: API exchange models between client and server
- **Dependencies**: None (pure JavaScript)
- **Current models**: StakeholderCategory with request structures

### Server Workspace (@odp/server)
- **Framework**: Express.js for REST API
- **Database**: Neo4j with official driver
- **Development**: Nodemon for auto-reload in Docker container
- **Architecture**: Direct Express routes → Store layer (simplified from original service layer approach)
- **API Generation**: OpenAPI Generator CLI for generating code artifacts

### Web Client Workspace (@odp/web-client)
- **Approach**: Vanilla JavaScript with specialized libraries (planned)
- **Rich text**: Quill editor (planned)
- **Tables**: AG-Grid Community (planned)
- **Timeline**: Vis.js Timeline (planned)

### CLI Workspace (@odp/cli)
- **Framework**: Commander.js (planned)
- **Binary name**: `odp` command (planned)
- **Purpose**: Command-line interface for ODP operations

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

## Development Workflow

### Starting the Environment
```bash
# From odp/ root
docker-compose up
```

### Available Services
- **ODP API**: http://localhost/stakeholder-categories
- **Health Check**: http://localhost/hello
- **Neo4j Browser**: http://localhost:7474

### Code Generation
```bash
# From workspace/server/
npm run generate    # Generate OpenAPI artifacts
```

### Individual Workspace Development
- **Root commands**: `npm run dev` (starts all), `npm run build` (builds all)
- **Individual workspace commands**: `npm run server:dev`, `npm run client:dev`, etc.
- **Dependency management**: Centralized through root workspace
- **Code sharing**: Via @odp/shared workspace dependency with `file:../shared` references

## OpenAPI Integration

### API Specification
- **Location**: `odp/openapi.yaml`
- **Version**: OpenAPI 3.1.0
- **Current Endpoints**: StakeholderCategory CRUD operations
- **Generator**: @openapitools/openapi-generator-cli

### Generated Artifacts
- **Server**: Express route templates and controllers in `generated-src/`
- **Shared**: API schemas and validation (when needed)
- **Templates**: Custom templates in `workspace/server/templates/`

## Current Implementation Status

### Implemented Features
✅ Repository structure with workspace organization  
✅ Docker Compose development environment  
✅ Neo4j database with connection management  
✅ Express server with live reload  
✅ Store layer with transaction management  
✅ StakeholderCategory CRUD API endpoints  
✅ OpenAPI specification and code generation setup  
✅ Workspace dependency resolution

### Working Endpoints
- `GET /stakeholder-categories` - List all categories
- `POST /stakeholder-categories` - Create new category
- `GET /hello` - Health check

### Next Implementation Steps
- Complete StakeholderCategory CRUD (GET by ID, PUT, DELETE)
- Add hierarchy operations (parent/child relationships)
- Implement remaining entities (Data, Service, RegulatoryAspect, Wave)
- Develop web client UI components
- Build CLI commands for ODP management
- Add baseline management system

## Key Design Decisions

### Architecture Changes from Original Plan
1. **Docker-first development**: Simplified service coordination and environment setup
2. **OpenAPI specification**: Contract-first API design with code generation
3. **Simplified server architecture**: Direct Express routes to store layer (bypassed complex generated service layer)
4. **Workspace organization**: Clean separation between infrastructure and source code
5. **ES modules throughout**: Consistent module system across all components

### Development Philosophy
- **Container-based development**: All dependencies managed through Docker
- **API-first**: OpenAPI specification drives both documentation and implementation
- **Minimal complexity**: Prefer simple, direct patterns over complex abstractions
- **Live development**: File changes reflected immediately in running containers