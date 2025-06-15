# Project Setup Summary

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Git
- WSL 2 (for Windows users)

### Get Running
```bash
# Clone and start
git clone https://github.com/jacques-lauzeral/odp
cd odp
docker-compose up

# Access points
# API: http://localhost
# Neo4j Browser: http://localhost:7474 (neo4j/password123)
# Health check: http://localhost/hello
```

### Verify Installation
```bash
# Test API
curl http://localhost/stakeholder-categories

# Test CLI
npm run dev stakeholder-category list
```

## Repository Structure
```
odp/
├── workspace/
│   ├── server/          # Express API with Neo4j
│   ├── shared/          # Common models (@odp/shared)
│   ├── cli/             # Command-line interface  
│   └── web-client/      # Frontend (planned)
├── docker-compose.yml   # Development environment
└── package.json         # Root workspace
```

## Development Environment

### Services
- **ODP API Server**: Node.js + Express on port 80
- **Neo4j Database**: Graph database on ports 7474 (browser) + 7687 (bolt)
- **Live Reload**: Automatic restart on code changes

### Workspace Dependencies
- **ES Modules**: Throughout all components
- **npm workspaces**: Shared dependency management
- **@odp/shared**: Common models used by server, CLI, and web client

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

## Available Endpoints

### Setup Entities
- `/stakeholder-categories` - Stakeholder management
- `/regulatory-aspects` - Regulatory aspect management
- `/data-categories` - Data category management
- `/services` - Service management
- `/waves` - Timeline wave management

### Operational Entities
- `/operational-requirements` - Versioned requirements (with `?baseline=<id>`)
- `/operational-changes` - Versioned changes (with `?baseline=<id>`)
- `/operational-changes/{id}/milestones` - Milestone management

### Baseline Management
- `/baselines` - Deployment plan snapshots

## Available CLI Commands

### Setup Entities
```bash
npm run dev {entity} list/create/show/update/delete
# Examples:
npm run dev stakeholder-category create "Government" "Government entities"
npm run dev wave create 2025 1 "2025-03-31"
```

### Operational Entities
```bash
npm run dev requirement list/create/show/update/patch/versions
npm run dev change list/create/show/update/patch/delete
npm run dev change milestone-list/milestone-add/milestone-update/milestone-delete
```

## IDE Setup (WebStorm)

### Project Configuration
- **Open**: `odp/` directory as root
- **Node.js**: Enable Node.js integration
- **Docker**: Connect to Docker service for container management
- **Module Resolution**: ES modules with workspace support

### Recommended Settings
- **File Watchers**: Disabled (nodemon handles reload)
- **Version Control**: Git integration enabled
- **Code Style**: Standard JavaScript formatting

## Troubleshooting

### Common Issues
**Port conflicts**: Ensure ports 80, 7474, 7687 are available
```bash
# Check port usage
netstat -tulpn | grep :80
```

**Database connection**: Verify Neo4j container is running
```bash
docker-compose logs neo4j
```

**Module resolution**: Clear npm cache if workspace issues
```bash
npm run clean
npm install
```

### Development Workflow
1. **Start environment**: `docker-compose up`
2. **Edit code**: Changes auto-reload via nodemon
3. **Test API**: Use CLI commands or curl
4. **Check database**: Neo4j browser at localhost:7474
5. **Stop environment**: `Ctrl+C` or `docker-compose down`

## What's Included

### Working Features
- ✅ 6 complete entities with full CRUD
- ✅ Versioning system with optimistic locking
- ✅ CLI with 25+ commands
- ✅ Manual Express routes with factorized patterns
- ✅ Neo4j graph database with relationship management
- ✅ Live development environment

### Ready for Extension
- **New entities**: Follow established patterns in 4-8 lines per layer
- **New relationships**: Extend store classes with relationship methods
- **New CLI commands**: Use base command patterns

---

## Next Steps After Setup

1. **Explore entities**: Try CLI commands for different entity types
2. **Review architecture**: See [Development-Tooling.md](Development-Tooling.md) for patterns
3. **Add features**: Follow [Guidelines for Extending API Coverage](Guidelines%20for%20Extending%20API%20Coverage%20-%20StakeholderCategory%20Example.md)

*For detailed implementation and architecture information, see the specialized documentation files.*