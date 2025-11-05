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
- **Manual Express routes** for API implementation (simple, maintainable, reproducible)
- **ES modules** throughout for modern JavaScript practices
- **Rationale:** Prioritizing development speed, consistency, and reproducible patterns for prototype validation

### 2.2 Development Environment
- **Containerization:** Docker Compose for service orchestration
- **Database:** Neo4j 5.15 with APOC plugin
- **Node.js:** Version 20 with live code reloading
- **Document processing:** LibreOffice 24.2+ (headless mode) for image format conversion
- **Source code repository:** GitHub
- **IDE:** WebStorm 2024.3.5

### 2.3 API Design
- **Manual Express routes:** Direct, readable route definitions
- **Consistent patterns:** Standardized CRUD operations across entities
- **Clean architecture:** Routes → Services → Store Layer → Neo4j
- **Error handling:** Consistent JSON error responses

## 3 Server Architecture

### 3.1 Deployment
- **Deployment solution:** Docker Compose
- **Services:** Neo4j graph database + Node.js application
- **Environment:** Development with live code reloading
- **System dependencies:** LibreOffice for document processing (EMF → PNG conversion)
- **Rationale:** Simplified service coordination, environment configuration, and consistent development workflow

### 3.2 Application Architecture
- **Programming language:** JavaScript (ES modules)
- **Framework:** Express.js with manual routing
- **Node.js application layers:**
  - **Express routes**: Entity-specific route files (routes/stakeholder-category.js)
  - **Service layer**: Business logic and transaction management (services/StakeholderCategoryService.js)
  - **Store layer**: Encapsulated data access with JavaScript API, manages transactions, supports node and edge operations
  - **Database layer**: Neo4j with official driver

### 3.3 Clean Architecture Pattern
```
HTTP Requests → Express Routes → Service Layer → Store Layer → Neo4j Database
                     ↓              ↓              ↓
             Route Handlers → Business Logic → Data Access
```

**Design Decision:**
- **Manual routes:** Direct Express route definitions for maximum clarity and control
- **Entity separation:** One route file per entity type for clean organization
- **Service abstraction:** Business logic isolated from HTTP concerns
- **Store abstraction:** Database operations encapsulated with transaction management

### 3.4 Store Layer Design
- **Connection management:** Singleton driver with connection pooling
- **Transaction pattern:** Explicit transaction boundaries with commit/rollback
- **Error handling:** Consistent StoreError hierarchy
- **Base patterns:** BaseStore for common CRUD operations
- **Entity stores:** Specialized stores extending base functionality

### 3.5 Server Backend Dependencies

**Node.js Packages:**
- **Express.js**: Web framework for REST API
- **Neo4j driver**: Official JavaScript driver for database connectivity
- **node-fetch**: HTTP client for external API calls
- **cors**: Cross-origin resource sharing middleware
- **nodemon**: Development auto-reload on code changes
- **commander**: CLI framework for command-line interface
- **cli-table3**: ASCII table formatting for CLI output
- **mustache**: Template engine for AsciiDoc document generation

**Document Processing:**
- **mammoth**: Word document parsing (DOCX → HTML conversion)
- **docx**: Word document generation library
- **xlsx**: Excel spreadsheet processing

**System Dependencies:**
- **LibreOffice**: Required for EMF → PNG image conversion in Word documents
  - Version: 24.2+ with headless mode support
  - Components: libreoffice-core, libreoffice-draw
  - Purpose: Convert Windows Enhanced Metafile (EMF) images to web-compatible PNG format
  - Usage: Invoked via command line during document extraction
  - Alternative: ImageMagick with libwmf (less reliable for complex EMF files)

### 3.6 Document Processing Architecture

**DrG Material Import Pipeline:**
```
Office Document (.docx/.xlsx)
    ↓
[1. Extractor] - Document parsing
  - DocxExtractor: mammoth.js + LibreOffice for images
  - XlsxExtractor: xlsx library
    ↓
Raw JSON (Generic structure)
    ↓
[2. Mapper] - DrG-specific mapping
  - Converts AsciiDoc → Quill Delta
  - Resolves entity references
    ↓
Structured JSON (Import format)
    ↓
[3. Importer] - Database import
  - Transaction management
  - Version tracking
    ↓
Neo4j Database
```

**Image Processing:**
- EMF images in Word documents converted to PNG at extraction time
- LibreOffice invoked synchronously for each image conversion
- Fallback to transparent placeholder on conversion failure
- Converted images embedded as Quill Delta image inserts

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

### 5.1 Technical Solution
- **Programming language:** JavaScript (Node.js)
- **Framework:** Commander.js for command-line interface
- **API integration:** Direct HTTP calls using node-fetch
- **Table formatting:** cli-table3 for ASCII table output
- **Configuration:** JSON config file for server endpoints
- **Rationale:** Maintains full JavaScript stack consistency, simple HTTP integration, no code generation complexity

### 5.2 CLI Architecture
- **Command structure:** Subcommands per entity (odp stakeholder-category list)
- **HTTP client:** Direct fetch calls to manual Express routes
- **Error handling:** Consistent error reporting with proper exit codes
- **Output formatting:** ASCII tables for list operations, plain text for single items

## 6 Development Workflow Architecture

### 6.1 Workspace Organization
```
odp/                          # Git repository root
├── workspace/                # Source code organization
│   ├── server/              # Express API server
│   │   ├── src/             # Manual server implementation
│   │   │   ├── routes/      # Entity route files
│   │   │   ├── services/    # Business logic layer
│   │   │   ├── store/       # Data access layer
│   │   │   ├── extractors/  # Document parsing (DocxExtractor, XlsxExtractor)
│   │   │   ├── mappers/     # DrG-specific mappers
│   │   │   └── templates/   # Mustache templates for exports
│   │   └── package.json     # Server dependencies
│   ├── shared/              # Common models and utilities
│   ├── web-client/          # Frontend application
│   └── cli/                 # Command-line interface
├── docker-compose.yml       # Development environment
├── Dockerfile.odp-server    # Custom server image with LibreOffice
└── package.json            # Root workspace configuration
```

### 6.2 Development Environment Services
- **odp-server**: Node.js application with live reload + LibreOffice
- **neo4j**: Graph database with web interface
- **Networking**: Internal Docker network for service communication

### 6.3 Entity Development Pattern
```
1. Add entity model to @odp/shared
2. Create entity store extending BaseStore
3. Create entity service with business logic
4. Create entity routes file
5. Add routes to main server
6. Add CLI commands for entity
```

### 6.4 Docker Configuration

**Custom Server Image:**
```dockerfile
FROM node:20

# Install LibreOffice for EMF→PNG conversion
RUN apt-get update && \
    apt-get install -y libreoffice-core libreoffice-draw --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
```

**Docker Compose Services:**
```yaml
services:
  odp-server:
    build:
      context: .
      dockerfile: Dockerfile.odp-server
    # ... other configuration
  
  neo4j:
    image: neo4j:5.15
    # ... other configuration
```

## 7 Data Architecture

### 7.1 Database Technology
- **Database:** Neo4j 5.15 Community Edition
- **Driver:** Official Neo4j JavaScript driver
- **Connection pattern:** Pooled connections with retry logic
- **Configuration:** Environment-specific settings in store layer

### 7.2 Data Model Implementation
- **Versioning pattern:** Root nodes + version nodes (for operational entities)
- **Relationship handling:** Store layer abstraction over Cypher queries
- **Transaction management:** Explicit boundaries with proper error handling
- **Current entities:** StakeholderCategory with hierarchy support (REFINES relationships)

### 7.3 Rich Text Storage
- **Format:** Quill Delta JSON stored as string properties
- **Fields:** statement, rationale, flows, privateNotes (for ON/OR/OC entities)
- **Images:** Embedded as Delta image inserts with base64-encoded PNG data
- **Round-trip:** Word ↔ AsciiDoc ↔ Quill Delta conversion pipeline

## 8 API Architecture

### 8.1 Manual Routes Design
- **Entity-based organization:** One route file per entity type
- **RESTful patterns:** Standard HTTP methods and status codes
- **Consistent structure:** GET, POST, PUT, DELETE for all entities
- **Error responses:** Standardized JSON error format

### 8.2 Current API Endpoints
- **Health check:** `GET /hello`
- **StakeholderCategory CRUD:**
  - `GET /stakeholder-categories` - List all categories
  - `GET /stakeholder-categories/:id` - Get category by ID
  - `POST /stakeholder-categories` - Create new category
  - `PUT /stakeholder-categories/:id` - Update category
  - `DELETE /stakeholder-categories/:id` - Delete category

### 8.3 Request/Response Patterns
- **Shared models:** Consistent data structures via @odp/shared
- **Error handling:** Standardized error responses with codes
- **Status codes:** Proper HTTP status code usage (200, 201, 404, 409, 500)

## 9 Quality and Development Practices

### 9.1 Code Organization
- **Module system:** ES modules throughout
- **Dependency management:** npm workspaces with file references
- **Code sharing:** Centralized models in shared workspace
- **Route separation:** One file per entity for clean organization

### 9.2 Development Environment
- **Containerization:** Full development stack in Docker
- **Live reload:** Immediate reflection of code changes via nodemon
- **Service coordination:** Automated startup and dependency management
- **Port management:** Clear port allocation for different services

### 9.3 Extensibility Patterns
- **New entities:** Follow established Store → Service → Routes → CLI pattern
- **Relationship types:** Extend store methods for entity-specific relationships
- **Business logic:** Add service methods for complex operations
- **Document formats:** Add new extractors/mappers for different DrG sources

## 10 Architecture Evolution

### 10.1 Changes from Original Design
- **Simplified to manual routes:** Removed OpenAPI generation complexity
- **Direct HTTP integration:** CLI uses fetch instead of generated clients
- **Clean separation:** Routes → Services → Store → Database layers
- **Proven patterns:** Established repeatable patterns for entity expansion
- **Document processing:** Added 3-stage import pipeline (Extractor → Mapper → Importer)

### 10.2 Architecture Benefits
- **Simplicity:** Easy to understand and modify
- **Reproducibility:** Clear patterns for adding new entities
- **Performance:** Direct route handling without middleware overhead
- **Maintainability:** Explicit code structure with clear separation of concerns
- **Flexibility:** Pluggable extractors and mappers for different document sources

### 10.3 Future Architecture Considerations
- **Scalability:** Connection pooling and transaction optimization already in place
- **Security:** Authentication and authorization can be added to route level
- **Performance:** Query optimization and caching strategies at store level
- **Production:** Current architecture scales well beyond development environment
- **Document processing:** Batch image conversion optimization for large documents

## 11 System Requirements

### 11.1 Development Environment
- **Operating System:** Linux, macOS, or Windows with WSL2
- **Docker:** Version 20.10+ with Docker Compose V2
- **Memory:** Minimum 8GB RAM (16GB recommended)
- **Storage:** 10GB free disk space for containers and data

### 11.2 Runtime Dependencies
- **Node.js:** Version 20 (containerized)
- **Neo4j:** Version 5.15 (containerized)
- **LibreOffice:** Version 24.2+ (containerized in odp-server)

### 11.3 External Tools (Optional)
- **Neo4j Browser:** Built-in at http://localhost:7474
- **WebStorm:** IDE for development (recommended)
- **Git:** Version control

This architecture provides a solid, simple foundation for prototype development while maintaining clear patterns for production evolution and rapid entity expansion in Phases 2-4. The addition of document processing capabilities with LibreOffice integration enables robust import of DrG materials with image support while maintaining web compatibility through automatic format conversion.