# Development Tooling

## Core Development Environment

### Source Code Management
- **Source code repository:** GitHub (jacques-lauzeral/odp)
- **IDE:** WebStorm 2024.3.5
- **Version control:** Git with standard workflow

### Containerized Development
- **Container orchestration:** Docker Compose
- **Base images:**
  - Node.js 20 for application runtime
  - Neo4j 5.15 for graph database
- **Development workflow:** Live code reloading in containers
- **Service coordination:** Automated startup and dependency management

## Development Environment Setup

### Prerequisites
- Docker and Docker Compose
- WSL 2 integration (for Windows)
- Git for repository access

### Environment Startup
```bash
# Clone repository
git clone https://github.com/jacques-lauzeral/odp
cd odp

# Start development environment
docker-compose up
```

### Service Access Points
- **ODP API Server:** http://localhost
- **Neo4j Browser:** http://localhost:7474 (neo4j/password123)
- **API Health Check:** http://localhost/hello
- **API Endpoints:** http://localhost/stakeholder-categories

## Build and Development Tools

### Package Management
- **Manager:** npm with workspaces
- **Workspace configuration:** Root-level package.json
- **Dependency resolution:** Centralized with workspace hoisting
- **Local dependencies:** File references between workspaces

### Code Generation
- **OpenAPI Generator:** @openapitools/openapi-generator-cli
- **Installation:** Workspace-specific devDependencies
- **Templates:** Custom templates for integration patterns
- **Generated code location:** `workspace/server/generated-src/`

### Development Scripts
```bash
# Root workspace operations
npm run dev                    # Start all workspaces
npm run build                  # Build all workspaces

# Individual workspace operations
npm run server:dev             # Development server
npm run client:dev             # Web client development
npm run cli:dev                # CLI development

# Code generation
cd workspace/server
npm run generate               # Generate from OpenAPI spec
```

## Development Workflow

### Container-Based Development
1. **Environment startup:** `docker-compose up`
2. **Code editing:** Direct file editing on host
3. **Live reload:** Automatic container restart on changes
4. **Service logs:** Visible in docker-compose output
5. **Debugging:** Container exec for inspection

### Code Organization
```
workspace/
├── server/src/               # Manual server implementation
├── server/generated-src/     # Generated API artifacts
├── shared/src/               # Shared models and types
└── [other-workspaces]/src/   # Additional manual code
```

### API Development Process
1. **Specification first:** Update `openapi.yaml`
2. **Code generation:** Run `npm run generate` in server workspace
3. **Implementation:** Create/update store layer and routes
4. **Testing:** Use curl or API client for endpoint testing
5. **Integration:** Verify end-to-end functionality

## Quality Assurance Tools

### Code Quality (Planned)
- **Linting:** ESLint configuration
- **Formatting:** Prettier for consistent code style
- **Type checking:** JSDoc annotations with IDE support

### Testing Strategy (Planned)
- **Unit tests:** Store layer and business logic
- **Integration tests:** API endpoint testing
- **Database tests:** Neo4j transaction and query testing

## Database Development Tools

### Neo4j Management
- **Database version:** Neo4j 5.15 Community
- **Management interface:** Neo4j Browser at localhost:7474
- **Connection:** Bolt protocol on port 7687
- **Authentication:** Username: neo4j, Password: password123
- **Plugins:** APOC for advanced procedures

### Database Development Workflow
1. **Schema design:** Through store layer implementation
2. **Query development:** Neo4j Browser for Cypher testing
3. **Connection testing:** Store layer connection verification
4. **Data inspection:** Browser interface for data exploration

## API Development Tools

### OpenAPI Tooling
- **Specification editing:** Direct YAML editing in IDE
- **Validation:** OpenAPI Generator CLI validation
- **Documentation:** Auto-generated from specification
- **Code generation:** Template-based artifact generation

### API Testing
- **Manual testing:** curl commands for endpoint verification
- **Health monitoring:** Built-in health check endpoint
- **Request/response inspection:** Docker logs for debugging

### Development Server Features
- **Live reload:** Nodemon for automatic restarts
- **Error handling:** Detailed error logging and stack traces
- **Transaction management:** Automatic rollback on errors
- **Connection pooling:** Efficient database resource usage

## IDE Integration

### WebStorm Configuration
- **Project structure:** Workspace-aware navigation
- **Node.js integration:** Proper module resolution
- **Docker integration:** Container management from IDE
- **Git integration:** Standard version control workflow

### Development Productivity
- **File watching:** Automatic change detection
- **Import resolution:** Proper ES module support
- **Debugging support:** Node.js debugging capabilities
- **Code completion:** Enhanced with JSDoc annotations

## Environment Configuration

### Docker Compose Services
```yaml
services:
  neo4j:           # Database service
    ports: 7474, 7687
    volumes: Persistent data storage

  odp-server:      # Application service
    ports: 80
    volumes: Live code mounting
    command: Live reload development
```

### Configuration Management
- **Database config:** `workspace/server/src/store/config.json`
- **Environment variables:** Docker Compose environment section
- **Service discovery:** Internal Docker network resolution
- **Port management:** Host-to-container port mapping

## Extension and Customization

### Adding New Entities
1. **Update OpenAPI spec:** Add new endpoints and schemas
2. **Generate code:** Run generation for new artifacts
3. **Implement store:** Create entity-specific store layer
4. **Add routes:** Implement Express endpoint handlers
5. **Test integration:** Verify end-to-end functionality

### Custom Templates
- **Location:** `workspace/server/templates/`
- **Customization:** Modify generator templates for specific patterns
- **Integration:** Template changes reflected in generated code

### Development Environment Customization
- **Service modification:** Update docker-compose.yml
- **Port changes:** Modify port mappings as needed
- **Volume mounting:** Adjust file system mounting for workflows
- **Environment variables:** Configure service-specific settings

This tooling setup provides a comprehensive development environment that supports rapid prototyping while maintaining production-quality practices.
