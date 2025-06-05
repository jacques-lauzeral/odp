# Project Architecture & Technology Stack

## 1 General Aspects
The solution is a client/server Web application and a CLI, implemented as a containerized development environment.
The source code is maintained in a single repository with organized workspace structure.
The purpose of this project is to elaborate a high quality prototype with modern development practices.

## 2 Technology Stack Decisions

### 2.1 Core Decisions
- **Monorepo approach** with workspace organization for prototype development
- **JavaScript** across all components (server, web client, CLI)
- **Docker Compose** for development environment orchestration
- **OpenAPI 3.1.0** for API specification and code generation
- **ES modules** throughout for modern JavaScript practices
- **Rationale:** Prioritizing development speed, consistency, and modern tooling for prototype validation

### 2.2 Development Environment
- **Containerization:** Docker Compose for service orchestration
- **Database:** Neo4j 5.15 with APOC plugin
- **Node.js:** Version 20 with live code reloading
- **Source code repository:** GitHub
- **IDE:** WebStorm 2024.3.5

### 2.3 API Design
- **Specification:** OpenAPI 3.1.0 contract-first approach
- **Code generation:** @openapitools/openapi-generator-cli
- **Documentation:** Auto-generated from OpenAPI specification
- **Validation:** Runtime request/response validation

## 3 Server Architecture

### 3.1 Deployment
- **Deployment solution:** Docker Compose
- **Services:** Neo4j graph database + Node.js application
- **Environment:** Development with live code reloading
- **Rationale:** Simplified service coordination, environment configuration, and consistent development workflow

### 3.2 Application Architecture
- **Programming language:** JavaScript (ES modules)
- **Framework:** Express.js with direct routing
- **Node.js application layers:**
    - **Express routes**: Direct endpoint handlers for API operations
    - **Store layer**: Encapsulated data access with JavaScript API, manages transactions, supports node and edge operations
    - **Database layer**: Neo4j with official driver

### 3.3 Simplified Architecture Pattern
```
HTTP Requests → Express Routes → Store Layer → Neo4j Database
                     ↓
             Transaction Management
```

**Design Decision Changes:**
- **Original plan:** Service layer between routes and store
- **Current implementation:** Direct Express routes to store layer
- **Rationale:** Reduced complexity while maintaining clean separation of concerns

### 3.4 Store Layer Design
- **Connection management:** Singleton driver with connection pooling
- **Transaction pattern:** Explicit transaction boundaries with commit/rollback
- **Error handling:** Consistent StoreError hierarchy
- **Base patterns:** BaseStore for common CRUD operations
- **Entity stores:** Specialized stores extending base functionality

## 4 Web Client

### 4.1 Framework Decision (Planned)
- **Vanilla JavaScript** with specialized libraries
- **Rich text:** Quill or TinyMCE for direct integration
- **Tables:** AG-Grid or Tabulator for filtering/grouping capabilities
- **Timeline:** Vis.js Timeline for temporal views
- **Rationale:** Minimal learning curve, direct library integration, rapid prototype development without framework complexity

### 4.2 Integration Pattern
- **API consumption:** Direct fetch calls to Express endpoints
- **Model sharing:** Via @odp/shared workspace for consistent data structures
- **Development:** Served through workspace development server

## 5 Command Line Interface (CLI)

### 5.1 Technical Solution (Planned)
- **Programming language:** JavaScript (Node.js)
- **Framework:** Commander.js for command-line interface
- **API integration:** HTTP calls to Express server
- **Rationale:** Maintains full JavaScript stack consistency, enables shared code and models in monorepo

## 6 Development Workflow Architecture

### 6.1 Workspace Organization
```
odp/                          # Git repository root
├── workspace/                # Source code organization
│   ├── server/              # Express API server
│   ├── shared/              # Common models and utilities
│   ├── web-client/          # Frontend application
│   └── cli/                 # Command-line interface
├── openapi.yaml             # API contract specification
├── docker-compose.yml       # Development environment
└── package.json            # Root workspace configuration
```

### 6.2 Development Environment Services
- **odp-server**: Node.js application with live reload
- **neo4j**: Graph database with web interface
- **Networking**: Internal Docker network for service communication

### 6.3 Code Generation Pipeline
```
OpenAPI Spec → OpenAPI Generator → Generated Artifacts → Manual Integration
```

- **Generated code location:** `workspace/server/generated-src/`
- **Custom templates:** Modified to integrate with store layer
- **Integration approach:** Generated code calls manual service implementations

## 7 Data Architecture

### 7.1 Database Technology
- **Database:** Neo4j 5.15 Community Edition
- **Driver:** Official Neo4j JavaScript driver
- **Connection pattern:** Pooled connections with retry logic
- **Configuration:** Environment-specific settings in store layer

### 7.2 Data Model Implementation
- **Versioning pattern:** Root nodes + version nodes (as documented in storage model)
- **Relationship handling:** Store layer abstraction over Cypher queries
- **Transaction management:** Explicit boundaries with proper error handling
- **Current entities:** StakeholderCategory with hierarchy support

## 8 API Architecture

### 8.1 Contract-First Design
- **Specification format:** OpenAPI 3.1.0
- **Location:** Root-level `openapi.yaml`
- **Documentation:** Auto-generated API documentation
- **Validation:** Runtime request/response validation

### 8.2 Current API Endpoints
- **Health check:** `GET /hello`
- **StakeholderCategory CRUD:**
    - `GET /stakeholder-categories` - List all categories
    - `POST /stakeholder-categories` - Create new category
    - *(Additional CRUD operations planned)*

### 8.3 Request/Response Patterns
- **Shared models:** Consistent data structures via @odp/shared
- **Error handling:** Standardized error responses
- **Status codes:** RESTful HTTP status code usage

## 9 Quality and Development Practices

### 9.1 Code Organization
- **Module system:** ES modules throughout
- **Dependency management:** npm workspaces with file references
- **Code sharing:** Centralized models in shared workspace
- **Generated code:** Isolated in `generated-src/` directories

### 9.2 Development Environment
- **Containerization:** Full development stack in Docker
- **Live reload:** Immediate reflection of code changes
- **Service coordination:** Automated startup and dependency management
- **Port management:** Clear port allocation for different services

### 9.3 Extensibility Patterns
- **New entities:** Add to OpenAPI spec → Generate → Implement store → Add routes
- **New operations:** Extend existing stores and add Express endpoints
- **New workspaces:** Follow established patterns with package.json configuration

## 10 Architecture Evolution

### 10.1 Changes from Original Design
- **Added:** Docker Compose development environment
- **Added:** OpenAPI specification and code generation
- **Simplified:** Direct Express routing instead of generated service layer
- **Reorganized:** Workspace directory structure for cleaner separation

### 10.2 Future Architecture Considerations
- **Scalability:** Connection pooling and transaction optimization
- **Security:** Authentication and authorization patterns
- **Performance:** Query optimization and caching strategies
- **Production:** Deployment architecture beyond development environment

This architecture provides a solid foundation for prototype development while maintaining flexibility for production evolution.