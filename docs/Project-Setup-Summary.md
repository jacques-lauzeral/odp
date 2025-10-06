# Project Setup Summary

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Git
- WSL 2 (for Windows users)

### Get Running
```bash
# Clone and start full environment
git clone https://github.com/jacques-lauzeral/odp
cd odp
docker-compose up

# Access points
# Web Client: http://localhost:3000
# API Server: http://localhost
# Neo4j Browser: http://localhost:7474 (neo4j/password123)
# Health check: http://localhost/hello
```

### Verify Installation
```bash
# Test API Server
curl http://localhost/stakeholder-categories
curl http://localhost/hello

# Test CLI
npm run dev stakeholder-category list

# Test Web Client
# Open http://localhost:3000 in browser
# Should show ODP landing page with user identification
```

## Repository Structure
```
odp/
├── workspace/
│   ├── server/          # Express API with Neo4j
│   ├── shared/          # Common models (@odp/shared)
│   ├── cli/             # Command-line interface  
│   └── web-client/      # Frontend web application ✅
├── docker-compose.yml   # Multi-service development environment
└── package.json         # Root workspace configuration
```

## Development Environment

### Services
- **ODP API Server**: Node.js + Express on port 80 with CORS support
- **Web Client**: http-server serving vanilla JavaScript on port 3000
- **Neo4j Database**: Graph database on ports 7474 (browser) + 7687 (bolt)
- **Live Reload**: Automatic restart on code changes for all services

### Workspace Dependencies
- **ES Modules**: Throughout all components (server, CLI, web client)
- **npm workspaces**: Shared dependency management across all projects
- **@odp/shared**: Common models used by server, CLI, and web client
- **Docker networking**: Internal service communication and external access

## Configuration Files

### Database Connection
`workspace/server/src/store/config.json`:
```json
{
  "database": {
    "uri": "bolt://neo4j:7687",
    "username": "neo4j",
    "password": "password123"
  }
}
```

### CLI Configuration
`workspace/cli/config.json`:
```json
{
  "serverUrl": "http://localhost"
}
```

### Web Client Configuration
`workspace/web-client/src/config/api.js`:
```javascript
export const apiConfig = {
  baseUrl: 'http://localhost',  // Points to API server
  timeout: 30000,
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};
```

### Docker Compose Services
```yaml
services:
  neo4j:        # Database on ports 7474, 7687
  odp-server:   # API server on port 80 with CORS
  web-client:   # Web app on port 3000
```

## Available Interfaces

### Web Client (Primary Interface) ✅
**URL**: http://localhost:3000
- **Landing page**: User identification and activity selection
- **Activity navigation**: Setup Management, ODP Read, ODP Elaboration
- **Connection status**: Real-time API server health monitoring
- **Responsive design**: Mobile-friendly interface
- **Error handling**: User-friendly error notifications

### API Endpoints (Backend)
All endpoints support CORS for web client integration:

#### Setup Entities
- `GET/POST /stakeholder-categories` - Stakeholder management with hierarchy
- `GET/POST /regulatory-aspects` - Regulatory aspect management
- `GET/POST /data-categories` - Data category management
- `GET/POST /services` - Services management
- `GET/POST /waves` - Timeline wave management

#### Operational Entities (Versioned)
- `GET/POST/PUT/PATCH /operational-requirements` - Versioned requirements
- `GET/POST/PUT/PATCH /operational-changes` - Versioned changes
- `GET/POST/PUT/DELETE /operational-changes/{id}/milestones` - Milestone management
- **Multi-context queries**: `?baseline=<id>` and `?fromWave=<id>` parameters

#### Management Entities
- `GET/POST /baselines` - Immutable deployment plan snapshots
- `GET/POST /odp-editions` - Edition management with baseline references

### Command Line Interface
Full CLI coverage of all API functionality:

#### Setup Entities
```bash
npm run dev stakeholder-category list/create/show/update/delete
npm run dev regulatory-aspect list/create/show/update/delete
npm run dev data-category list/create/show/update/delete
npm run dev service list/create/show/update/delete
npm run dev wave list/create/show/update/delete
```

#### Operational Entities
```bash
npm run dev requirement list/create/show/update/patch/versions
npm run dev change list/create/show/update/patch/delete
npm run dev change milestone-list/milestone-add/milestone-update/milestone-delete

# Multi-context operations
npm run dev requirement list --baseline=123
npm run dev change list --baseline=123 --from-wave=456
```

#### Management Entities
```bash
npm run dev baseline list/create/show
npm run dev edition list/create/show/update/delete
```

### Neo4j Browser (Database)
**URL**: http://localhost:7474 (neo4j/password123)
- **Data exploration**: Cypher query interface
- **Relationship visualization**: Graph-based data views
- **Performance monitoring**: Query execution analysis
- **Schema inspection**: Node and relationship structure

## Testing and Validation

### Web Client Testing
1. **Landing Page**:
   ```
   Navigate to: http://localhost:3000
   Expected: Landing page with user identification form
   Test: Enter name → should show three activity tiles
   ```

2. **API Integration**:
   ```
   Expected: "Connected to ODP Server" status (green)
   If red: Check CORS configuration in server
   ```

3. **Activity Navigation**:
   ```
   Test: Click "Setup Management" tile
   Expected: Navigation to /setup URL (shows loading/error as Setup not implemented)
   ```

### API Server Testing
```bash
# Health check
curl http://localhost/hello
# Expected: {"status":"ok","message":"ODP Server running","timestamp":"..."}

# CORS validation
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS http://localhost/stakeholder-categories
# Expected: 200 OK with CORS headers

# Entity operations
curl http://localhost/stakeholder-categories
# Expected: JSON array of stakeholder categories
```

### CLI Testing
```bash
# Basic entity operations
npm run dev stakeholder-category list
npm run dev stakeholder-category create "Test Category" "Test Description"
npm run dev stakeholder-category show 1

# Versioned entity operations
npm run dev requirement list
npm run dev requirement create "Test Requirement" "Test Statement" "Test Rationale"
npm run dev requirement versions 1

# Management operations
npm run dev baseline create "Test Baseline"
npm run dev baseline show 1
```

## Development Workflow

### Starting Development
```bash
# Start all services
docker-compose up

# Watch logs for specific service
docker-compose logs -f web-client
docker-compose logs -f odp-server

# Stop all services
docker-compose down
```

### Code Changes
- **Server code**: Auto-reload via nodemon
- **Web client**: Refresh browser to see changes
- **Shared models**: Restart affected services

### Debugging
```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs web-client
docker-compose logs odp-server
docker-compose logs neo4j

# Container inspection
docker-compose exec web-client sh
docker-compose exec odp-server sh
```

## Troubleshooting

### Common Issues

#### Web Client Won't Start
```bash
# Check if directory structure exists
ls workspace/web-client/src/

# Check package.json exists
ls workspace/web-client/package.json

# View detailed logs
docker-compose logs web-client
```

#### CORS Errors
```bash
# Verify server has CORS middleware
grep -r "Access-Control-Allow-Origin" workspace/server/

# Check server logs for OPTIONS requests
docker-compose logs odp-server | grep OPTIONS
```

#### Port Conflicts
```bash
# Check port usage
netstat -tulpn | grep :3000
netstat -tulpn | grep :80

# Alternative ports in docker-compose.yml if needed
```

#### Database Connection Issues
```bash
# Verify Neo4j is running
docker-compose logs neo4j

# Test database connection
curl http://localhost:7474

# Check server database connection
docker-compose logs odp-server | grep "Store layer initialized"
```

### Fresh Installation
```bash
# Complete cleanup and restart
docker-compose down -v
docker system prune -f
git pull
docker-compose up --build
```

## What's Available Now

### ✅ Fully Working
- **Complete backend**: 7 entities with full CRUD and versioning
- **Advanced CLI**: 35+ commands with multi-context operations
- **Web client foundation**: Landing page with user identification
- **API integration**: CORS-enabled server with health monitoring
- **Development environment**: Live reload for all services

### 🔄 In Development
- **Setup Management Activity**: Entity management UI (next phase)
- **Entity CRUD interfaces**: Forms, tables, and detail views
- **Hierarchy management**: Visual tree navigation

### 📋 Planned
- **ODP Read Activity**: Query and browse interface
- **ODP Elaboration Activity**: Content creation and editing
- **Rich text editing**: Advanced content authoring
- **Timeline visualization**: Deployment planning interfaces

## Next Steps After Setup

1. **Explore the web interface**: Test user identification and activity navigation
2. **Experiment with CLI**: Try entity management commands
3. **Review the architecture**: See [Web-Client-Technical-Solution.md](Web-Client-Technical-Solution.md)
4. **Follow development**: See [Web-Client-Work-Plan.md](deprecated-Web-Client-Work-Plan) for current progress

*For detailed implementation and architecture information, see the specialized documentation files.*