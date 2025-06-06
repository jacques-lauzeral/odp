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

### Development Scripts
```bash
# Root workspace operations
npm run dev                    # Start all workspaces
npm run build                  # Build all workspaces

# Individual workspace operations
npm run server:dev             # Development server
npm run client:dev             # Web client development
npm run cli:dev                # CLI development
```

### Code Organization
```
workspace/
├── server/src/               # Manual server implementation
│   ├── routes/              # Entity route files
│   ├── services/            # Business logic layer
│   └── store/               # Data access layer
├── shared/src/               # Shared models and types
└── [other-workspaces]/src/   # Additional manual code
```

## Development Workflow

### Container-Based Development
1. **Environment startup:** `docker-compose up`
2. **Code editing:** Direct file editing on host
3. **Live reload:** Automatic container restart on changes via nodemon
4. **Service logs:** Visible in docker-compose output
5. **Debugging:** Container exec for inspection

### Manual API Development Process
1. **Entity modeling:** Define data structures in `@odp/shared`
2. **Store layer:** Create entity store extending BaseStore
3. **Service layer:** Implement business logic with transaction management
4. **Route layer:** Create Express routes for CRUD operations
5. **CLI integration:** Add commands using direct HTTP calls
6. **Testing:** Use CLI and curl for endpoint verification

### Entity Development Pattern
```bash
# 1. Add to shared models
echo 'export const NewEntity = { id: "", name: "", description: "" };' >> workspace/shared/src/index.js

# 2. Create store
cp workspace/server/src/store/stakeholder-category-store.js workspace/server/src/store/new-entity.js

# 3. Create service
cp workspace/server/src/services/StakeholderCategoryService.js workspace/server/src/services/NewEntityService.js

# 4. Create routes
cp workspace/server/src/routes/stakeholder-category-store.js workspace/server/src/routes/new-entity.js

# 5. Add to server
# Edit src/index.js to add new routes

# 6. Add CLI commands
cp workspace/cli/src/commands/stakeholder-category-store.js workspace/cli/src/commands/new-entity.js
```

## Quality Assurance Tools

### Code Quality (Planned)
- **Linting:** ESLint configuration
- **Formatting:** Prettier for consistent code style
- **Type checking:** JSDoc annotations with IDE support

### Testing Strategy (Current)
- **Manual testing:** CLI commands for all operations
- **API testing:** Direct curl commands for endpoint verification
- **Integration testing:** End-to-end workflow validation via CLI

### Testing Workflow
```bash
# Test all CRUD operations for an entity
npm run dev entity-name list
npm run dev entity-name create "Test" "Description"
npm run dev entity-name show <id>
npm run dev entity-name update <id> "Updated" "Updated description"
npm run dev entity-name delete <id>
```

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
5. **Relationship testing:** Store layer hierarchy operations

### Query Testing
```cypher
// Test queries in Neo4j Browser
MATCH (n:StakeholderCategory) RETURN n;
MATCH (n:StakeholderCategory)-[:REFINES]->(p:StakeholderCategory) RETURN n, p;
MATCH (n) WHERE id(n) = 0 RETURN n;
```

## API Development Tools

### Manual Route Development
- **Route organization:** One file per entity in src/routes/
- **Service integration:** Clean separation between HTTP and business logic
- **Error handling:** Consistent JSON error responses
- **Testing:** CLI provides comprehensive API validation

### API Testing Workflow
```bash
# Direct API testing
curl http://localhost/entity-name
curl -X POST http://localhost/entity-name -H "Content-Type: application/json" -d '{"name":"Test","description":"Test"}'
curl http://localhost/entity-name/1
curl -X PUT http://localhost/entity-name/1 -H "Content-Type: application/json" -d '{"id":"1","name":"Updated","description":"Updated"}'
curl -X DELETE http://localhost/entity-name/1

# CLI testing (preferred)
npm run dev entity-name list
npm run dev entity-name create "Name" "Description"
npm run dev entity-name show 1
npm run dev entity-name update 1 "New Name" "New Description"
npm run dev entity-name delete 1
```

### Development Server Features
- **Live reload:** Nodemon for automatic restarts on code changes
- **Error handling:** Detailed error logging and stack traces
- **Transaction management:** Automatic rollback on errors
- **Connection pooling:** Efficient database resource usage

## IDE Integration

### WebStorm Configuration
- **Project structure:** Workspace-aware navigation
- **Node.js integration:** Proper module resolution for ES modules
- **Docker integration:** Container management from IDE
- **Git integration:** Standard version control workflow

### Development Productivity
- **File watching:** Automatic change detection via nodemon
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
- **CLI config:** `workspace/cli/config.json`
- **Environment variables:** Docker Compose environment section
- **Service discovery:** Internal Docker network resolution
- **Port management:** Host-to-container port mapping

## Extension and Customization

### Adding New Entities
1. **Add to shared models:** Define entity structure in `@odp/shared`
2. **Create store:** Extend BaseStore for data access
3. **Create service:** Implement business logic with transactions
4. **Create routes:** Add Express routes for CRUD operations
5. **Update server:** Register routes in main application
6. **Add CLI commands:** Create command handlers using HTTP calls
7. **Test integration:** Verify end-to-end functionality

### Store Layer Patterns
- **CRUD operations:** Inherit from BaseStore for consistency
- **Relationships:** Add entity-specific relationship methods
- **Validation:** Business rules enforcement at service layer
- **Transactions:** Explicit transaction boundaries for data integrity

### Route Layer Patterns
- **HTTP methods:** GET, POST, PUT, DELETE for standard operations
- **Error handling:** Consistent JSON error responses with proper status codes
- **Parameter handling:** URL parameters and request body validation
- **Response format:** JSON responses with standardized structure

### CLI Patterns
- **Command structure:** Subcommands per entity (entity-name action)
- **HTTP integration:** Direct fetch calls to API endpoints
- **Output formatting:** ASCII tables for lists, plain text for single items
- **Error handling:** Proper exit codes and error messages

### Development Environment Customization
- **Service modification:** Update docker-compose.yml as needed
- **Port changes:** Modify port mappings for different services
- **Volume mounting:** Adjust file system mounting for specific workflows
- **Environment variables:** Configure service-specific settings

This tooling setup provides a comprehensive development environment that supports rapid prototyping while maintaining production-quality practices and clear patterns for entity expansion.