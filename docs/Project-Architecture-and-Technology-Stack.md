# Project Architecture & Technology Stack

## 1. General Aspects

The solution is a client/server Web application and CLI, implemented as a containerized development environment. The source code is maintained in a single repository with organized workspace structure. The purpose of this project is to elaborate a high quality prototype with modern development practices.

---

## 2. Technology Stack Decisions

### 2.1 Core Decisions

- **Monorepo approach** with workspace organization for prototype development
- **JavaScript** across all components (server, web client, CLI)
- **Podman + Kubernetes YAML** for deployment orchestration
- **Manual Express routes** for API implementation (simple, maintainable, reproducible)
- **ES modules** throughout for modern JavaScript practices
- **Rationale:** Prioritizing development speed, consistency, and reproducible patterns for prototype validation

### 2.2 Development Environment

- **Containerization:** Podman with Kubernetes YAML configuration
- **Database:** Neo4j 5.15 with APOC plugin
- **Node.js:** Version 20 (full Debian-based image) with live code reloading
- **Document processing:** LibreOffice 24.2+ (headless mode) for image format conversion
- **Source code repository:** GitHub
- **IDE:** WebStorm 2024.3.5

**Why Podman?**
- Required for Eurocontrol corporate environment (Docker not available)
- Rootless mode provides better security
- Daemonless architecture (no background service)
- Drop-in Docker replacement with compatible CLI
- Better SELinux integration on RHEL

**Why Kubernetes YAML?**
- More portable than Docker Compose
- Cloud-native approach for future production
- Declarative configuration (better version control)
- Works identically across local and Eurocontrol environments
- Single YAML file per environment encapsulates all differences

### 2.3 API Design

- **Manual Express routes:** Direct, readable route definitions
- **Consistent patterns:** Standardized CRUD operations across entities
- **Clean architecture:** Routes → Services → Store Layer → Neo4j
- **Error handling:** Consistent JSON error responses

**Why Manual Routes?**
- Maximum clarity and control over API implementation
- No code generation complexity
- Direct debugging without generated middleware
- Clear patterns for entity expansion
- Simpler learning curve for team members

---

## 3. Server Architecture

### 3.1 Deployment Strategy

**Decision:** Podman + Kubernetes YAML with environment-specific configurations

**Rationale:**
- **Portability:** Same deployment model works locally and in corporate environment
- **Consistency:** Eliminates "works on my machine" issues
- **Explicit configuration:** All differences captured in YAML files
- **Production-ready:** Kubernetes-native approach scales beyond development

**Environment Differences:**
| Aspect | Local | Eurocontrol | Reason |
|--------|-------|-------------|--------|
| Container Runtime | Podman (apt) | Podman 4.9.4 (system) | Corporate standard |
| Images | docker.io | Internal registry | Security/vetting |
| Storage | Local filesystem | SSD + NFS | Performance/permissions |
| Node.js | System/nvm | Corporate installation | Version control |

### 3.2 Storage Strategy

**Neo4j Database: Local SSD Only**

**Decision:** Always use local SSD for Neo4j data, never NFS

**Rationale:**
- Neo4j requires `chown` operations which fail on NFS
- SSD provides significantly better I/O performance
- Prevents permission errors in containerized environment
- Consistent behavior across environments

**Application Code: Volume Mounts**

**Decision:** Volume-mount code directory instead of baking into image

**Rationale:**
- Enables live code editing without rebuilding containers
- Faster development iteration
- Easier debugging with hot-reload support
- Consistent with development workflow

**Web Client: Pre-built Image**

**Decision:** Build web client image with shared modules baked in

**Rationale:**
- Avoids runtime file copy operations that fail on NFS
- Faster container startup
- Consistent build artifact across environments
- Only rebuild when shared dependencies change

### 3.3 Port Configuration

**Decision:** API server on port 8080 (not 80)

**Rationale:**
- Podman rootless mode cannot bind to privileged ports (<1024)
- Port 8080 works on both local and corporate environments
- Maintains environment parity (same configuration everywhere)
- Security: rootless containers provide better isolation

### 3.4 Image Selection

**Neo4j: `5.15` (Specific Version)**

**Rationale:**
- Reproducibility: same version guaranteed across all deployments
- Controlled upgrades: explicit decision to change versions
- Testing consistency: local tests match production exactly
- Prevents surprise breaking changes from automatic updates

**Node: `node:20` (Full Debian Image, Not Alpine)**

**Rationale:**
- Better libc compatibility (glibc vs musl)
- Native modules (sharp, sqlite3) compile more reliably
- More complete development tooling included
- Slightly larger but significantly more stable
- Avoids platform-specific binary compilation issues

### 3.5 Application Architecture

- **Programming language:** JavaScript (ES modules)
- **Framework:** Express.js with manual routing
- **Node.js application layers:**
  - **Express routes**: Entity-specific route files
  - **Service layer**: Business logic and transaction management
  - **Store layer**: Encapsulated data access with JavaScript API
  - **Database layer**: Neo4j with official driver

### 3.6 Clean Architecture Pattern

```
HTTP Requests → Express Routes → Service Layer → Store Layer → Neo4j Database
                     ↓              ↓              ↓
             Route Handlers → Business Logic → Data Access
```

**Design Rationale:**
- **Separation of concerns:** Each layer has clear responsibility
- **Testability:** Layers can be tested independently
- **Maintainability:** Changes isolated to appropriate layer
- **Scalability:** Store layer can be optimized without affecting business logic

### 3.7 Store Layer Design

- **Connection management:** Singleton driver with connection pooling
- **Transaction pattern:** Explicit transaction boundaries with commit/rollback
- **Error handling:** Consistent StoreError hierarchy
- **Base patterns:** BaseStore for common CRUD operations
- **Entity stores:** Specialized stores extending base functionality

**Why This Approach?**
- Encapsulates all Neo4j-specific knowledge
- Consistent error handling across all database operations
- Transaction management centralized and reliable
- Easy to add new entities following established patterns

### 3.8 Server Backend Dependencies

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

**Why LibreOffice?**
- Only reliable tool for EMF → PNG conversion
- Headless mode allows server-side processing
- Handles complex EMF files better than ImageMagick
- Industry-standard tool with good support

### 3.9 Document Processing Architecture

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

**Three-Stage Design Rationale:**
- **Separation:** Parsing logic separate from business logic
- **Reusability:** Same extractor works for different DrG formats
- **Maintainability:** Each DrG can have custom mapper
- **Testability:** Each stage can be tested independently
- **Flexibility:** Easy to add new document formats

**Image Processing:**
- EMF images in Word documents converted to PNG at extraction time
- LibreOffice invoked synchronously for each image conversion
- Fallback to transparent placeholder on conversion failure
- Converted images embedded as Quill Delta image inserts

---

## 4. Web Client

### 4.1 Framework Decision

- **Vanilla JavaScript** with specialized libraries
- **Rich text:** Quill for WYSIWYG editing
- **Tables:** AG-Grid or Tabulator for filtering/grouping capabilities
- **Timeline:** Vis.js Timeline for temporal views

**Why Vanilla JS?**
- Minimal learning curve for prototype development
- Direct library integration without framework abstraction
- Rapid prototype development without framework complexity
- Easier to evaluate and switch libraries if needed
- Full control over DOM manipulation and performance

### 4.2 Integration Pattern

- **API consumption:** Direct fetch calls to Express endpoints
- **Model sharing:** Via @odp/shared workspace for consistent data structures
- **Development:** Served through workspace development server

### 4.3 API Configuration

**Modified:** `workspace/web-client/src/config/api.js`

```javascript
baseUrl: 'http://' + window.location.hostname + ':8080',
```

**Why This Change?**
- Web client accessed from remote browsers (e.g., `http://dhws097:3000`)
- Cannot rely on relative URLs or `window.location.origin`
- Must explicitly target port 8080 (API server port)
- Works correctly across all access patterns

---

## 5. Command Line Interface (CLI)

### 5.1 Technical Solution

- **Programming language:** JavaScript (Node.js)
- **Framework:** Commander.js for command-line interface
- **API integration:** Direct HTTP calls using node-fetch
- **Table formatting:** cli-table3 for ASCII table output
- **Configuration:** JSON config file for server endpoints

**Why JavaScript CLI?**
- Maintains full JavaScript stack consistency
- Simple HTTP integration (no code generation)
- Direct use of shared models
- Easier maintenance with single language
- Developers don't need to context-switch languages

### 5.2 CLI Architecture

- **Command structure:** Subcommands per entity (odp stakeholder-category list)
- **HTTP client:** Direct fetch calls to manual Express routes
- **Error handling:** Consistent error reporting with proper exit codes
- **Output formatting:** ASCII tables for list operations, plain text for single items

---

## 6. Development Workflow Architecture

### 6.1 Workspace Organization

```
odp/                          # Git repository root
├── bin/                      # Utility scripts
│   └── odp-admin-podman.bash # Backup/restore utility
├── workspace/                # Source code organization
│   ├── server/              # Express API server
│   │   ├── src/             # Manual server implementation
│   │   │   ├── routes/      # Entity route files
│   │   │   ├── services/    # Business logic layer
│   │   │   ├── store/       # Data access layer
│   │   │   ├── extractors/  # Document parsing
│   │   │   ├── mappers/     # DrG-specific mappers
│   │   │   └── templates/   # Mustache templates for exports
│   │   └── package.json     # Server dependencies
│   ├── shared/              # Common models and utilities
│   ├── web-client/          # Frontend application
│   └── cli/                 # Command-line interface
├── Dockerfile.web-client     # Web client container definition
├── odp-deployment-local.yaml # Local environment config
├── odp-deployment-ec.yaml    # Eurocontrol environment config
└── package.json             # Root workspace configuration
```

**Why This Structure?**
- Clear separation between environments and code
- Workspace pattern enables code sharing
- Environment configs encapsulate all deployment differences
- Utility scripts organized in dedicated directory

### 6.2 Development Environment Services

All services run in a single Kubernetes pod:
- **Neo4j container**: Database with web interface
- **ODP Server container**: Node.js application with live reload
- **Web Client container**: Pre-built static file server

**Why Single Pod?**
- Containers share network namespace (communicate via localhost)
- Simplified service discovery
- Consistent with Kubernetes deployment model
- Easier lifecycle management (start/stop as unit)

### 6.3 Entity Development Pattern

```
1. Add entity model to @odp/shared
2. Create entity store extending BaseStore
3. Create entity service with business logic
4. Create entity routes file
5. Add routes to main server
6. Add CLI commands for entity
```

**Why This Pattern?**
- Repeatable and consistent across all entities
- Clear separation of concerns at each step
- Easy to train new developers
- Natural progression from data to API

### 6.4 Container Configuration

**Web Client Dockerfile (`Dockerfile.web-client`):**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy entire codebase
COPY . .

# Pre-create the shared source structure
RUN mkdir -p workspace/web-client/src/shared/src && \
    cp -r workspace/shared/src/* workspace/web-client/src/shared/src/

# Set working directory to web-client
WORKDIR /app/workspace/web-client

# Expose port
EXPOSE 3000

# Start web server
CMD ["npm", "run", "dev"]
```

**Why This Approach?**
- Shared modules baked into image (no runtime copy)
- Avoids NFS permission issues
- Faster container startup
- Consistent across all environments

---

## 7. Data Architecture

### 7.1 Database Technology

- **Database:** Neo4j 5.15 Community Edition
- **Driver:** Official Neo4j JavaScript driver
- **Connection pattern:** Pooled connections with retry logic
- **Configuration:** Environment-specific settings in store layer

**Why Neo4j?**
- Graph model naturally represents operational entities and relationships
- Cypher query language well-suited for traversals
- APOC plugin provides extended functionality
- Excellent support for versioning patterns
- Strong JavaScript driver support

### 7.2 Data Model Implementation

- **Versioning pattern:** Root nodes + version nodes (for operational entities)
- **Relationship handling:** Store layer abstraction over Cypher queries
- **Transaction management:** Explicit boundaries with proper error handling
- **Hierarchy support:** REFINES relationships for stakeholder categories

**Why Versioning Pattern?**
- Preserves complete history of changes
- Enables temporal queries and snapshots
- Supports baseline/edition creation
- Natural fit for operational planning workflow

### 7.3 Rich Text Storage

- **Format:** Quill Delta JSON stored as string properties
- **Fields:** statement, rationale, flows, privateNotes (for ON/OR/OC entities)
- **Images:** Embedded as Delta image inserts with base64-encoded PNG data
- **Round-trip:** Word ↔ AsciiDoc ↔ Quill Delta conversion pipeline

**Why Quill Delta?**
- JSON format easily stored in Neo4j
- Preserves formatting information
- Direct integration with Quill editor
- Supports images with base64 encoding
- Enables round-trip document processing

---

## 8. API Architecture

### 8.1 Manual Routes Design

- **Entity-based organization:** One route file per entity type
- **RESTful patterns:** Standard HTTP methods and status codes
- **Consistent structure:** GET, POST, PUT, DELETE for all entities
- **Error responses:** Standardized JSON error format

**Benefits:**
- Maximum code clarity
- Easy to debug and modify
- Clear patterns for new entities
- No hidden middleware complexity

### 8.2 Request/Response Patterns

- **Shared models:** Consistent data structures via @odp/shared
- **Error handling:** Standardized error responses with codes
- **Status codes:** Proper HTTP status code usage (200, 201, 404, 409, 500)

---

## 9. Quality and Development Practices

### 9.1 Code Organization

- **Module system:** ES modules throughout
- **Dependency management:** npm workspaces with file references
- **Code sharing:** Centralized models in shared workspace
- **Route separation:** One file per entity for clean organization

### 9.2 Development Environment

- **Containerization:** Full development stack with Podman
- **Live reload:** Immediate reflection of code changes via nodemon
- **Service coordination:** Single pod manages all container lifecycles
- **Port management:** Clear port allocation for different services

### 9.3 Extensibility Patterns

- **New entities:** Follow established Store → Service → Routes → CLI pattern
- **Relationship types:** Extend store methods for entity-specific relationships
- **Business logic:** Add service methods for complex operations
- **Document formats:** Add new extractors/mappers for different DrG sources

---

## 10. Architecture Evolution

### 10.1 Changes from Original Design

- **Moved from Docker Compose to Kubernetes YAML:** Better portability
- **Moved from Docker to Podman:** Corporate requirement + better security
- **Simplified to manual routes:** Removed OpenAPI generation complexity
- **Direct HTTP integration:** CLI uses fetch instead of generated clients
- **Clean separation:** Routes → Services → Store → Database layers
- **Proven patterns:** Established repeatable patterns for entity expansion
- **Document processing:** Added 3-stage import pipeline (Extractor → Mapper → Importer)

### 10.2 Architecture Benefits

- **Portability:** Same deployment works locally and in corporate environment
- **Simplicity:** Easy to understand and modify
- **Reproducibility:** Clear patterns for adding new entities
- **Security:** Rootless containers provide better isolation
- **Performance:** Direct route handling without middleware overhead
- **Maintainability:** Explicit code structure with clear separation of concerns
- **Flexibility:** Pluggable extractors and mappers for different document sources

### 10.3 Future Architecture Considerations

- **Scalability:** Connection pooling and transaction optimization already in place
- **Security:** Authentication and authorization can be added at route level
- **Performance:** Query optimization and caching strategies at store level
- **Production:** Current architecture scales well beyond development environment
- **Document processing:** Batch image conversion optimization for large documents
- **Cloud deployment:** Kubernetes YAML ready for cloud platforms

---

## 11. System Requirements

### 11.1 Development Environment

- **Operating System:** Linux, macOS, or Windows with WSL2
- **Container Runtime:** Podman 3.4+ or Docker 20.10+ (for local development)
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

---

## 12. Key Architectural Decisions Summary

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| Podman + Kubernetes YAML | Portability, corporate requirement | Learning curve vs Docker Compose |
| Neo4j 5.15 (specific) | Reproducibility, controlled upgrades | Manual version management |
| Node 20 (Debian) | Compatibility, stability | Larger image size |
| Manual Express routes | Clarity, maintainability | No auto-documentation |
| Vanilla JS frontend | Simplicity, flexibility | Manual DOM management |
| Volume-mounted code | Live editing, fast iteration | Platform-specific paths |
| Pre-built web client | Performance, reliability | Rebuild on shared changes |
| Port 8080 for API | Rootless compatibility | Non-standard port |
| Local SSD for Neo4j | Performance, permissions | Environment-specific paths |
| JavaScript everywhere | Consistency, developer experience | Single language limitations |

---

This architecture provides a solid, simple foundation for prototype development while maintaining clear patterns for production evolution and rapid entity expansion. The Podman + Kubernetes YAML approach ensures the same deployment model works seamlessly across local development and corporate production environments.

**Document Version**: 2.0  
**Last Updated**: February 11, 2026  
**Focus**: Architectural decisions and rationale