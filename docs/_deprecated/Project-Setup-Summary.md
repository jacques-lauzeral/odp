# Project Setup Summary

## Quick Start

### Prerequisites
- **Podman** (or Docker for legacy setups)
- **Git**
- **WSL 2** (for Windows users)

### Get Running

**Local Environment (WSL/Ubuntu):**
```bash
# Clone repository
git clone <repository-url>
cd odp-main

# Install dependencies
npm install

# Create data directory
mkdir -p ~/odp-data/neo4j

# Update configuration
# Edit odp-deployment-local.yaml: replace USERNAME with your username

# Build web client image
podman build -f Dockerfile.web-client -t odp-web-client:latest .

# Deploy
podman play kube odp-deployment-local.yaml
```

**Eurocontrol Environment:**
```bash
# See detailed procedures in odp-deployment-guide.md
```

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| Web Client | http://localhost:3000 | None |
| ODP API | http://localhost:8080 | Header: x-user-id |
| Neo4j Browser | http://localhost:7474 | neo4j / password123 |

### Verify Installation

```bash
# Check containers
podman ps

# Test API Server
curl -H "x-user-id: test-user" http://localhost:8080/hello

# Test web client
# Open http://localhost:3000 in browser
# Should show ODP landing page with user identification
```

---

## Repository Structure

```
odp-main/
├── bin/
│   └── odp-admin-podman.bash    # Backup/restore utility
├── workspace/
│   ├── server/                  # Express API with Neo4j
│   ├── shared/                  # Common models (@odp/shared)
│   ├── cli/                     # Command-line interface  
│   └── web-client/              # Frontend web application ✅
├── Dockerfile.web-client         # Web client container definition
├── odp-deployment-local.yaml     # Local environment configuration
├── odp-deployment-ec.yaml        # Eurocontrol environment configuration
└── package.json                  # Root workspace configuration
```

---

## Deployment Configurations

The project supports two deployment environments with identical functionality:

### Local (Development)
- **File**: `odp-deployment-local.yaml`
- **Images**: docker.io/neo4j:5.15, docker.io/node:20
- **Paths**: ~/odp-data/neo4j, ~/odp/odp-main
- **Usage**: Local development and testing

### Eurocontrol (Production)
- **File**: `odp-deployment-ec.yaml`
- **Images**: Internal registry (yagi.cfmu.corp.eurocontrol.int:5000/*)
- **Paths**: /auto/local_build/.../neo4j, /auto/home/.../odp-main
- **Usage**: Corporate environment deployment

**See**: `odp-deployment-guide.md` for detailed deployment procedures.

---

## Services Overview

### ODP API Server
- **Port**: 8080
- **Stack**: Node.js + Express
- **Features**: CORS enabled, RESTful API, live reload
- **Database**: Neo4j via Bolt protocol

### Web Client
- **Port**: 3000
- **Stack**: Vanilla JavaScript
- **Features**: Responsive design, real-time status monitoring
- **API**: Connects to ODP Server on port 8080

### Neo4j Database
- **Ports**: 7474 (browser), 7687 (Bolt)
- **Version**: 5.15 with APOC plugin
- **Storage**: Persistent volume (environment-specific path)

---

## Configuration Files

### Database Connection
`workspace/server/src/store/config.json`:
```json
{
  "database": {
    "uri": "bolt://localhost:7687",
    "username": "neo4j",
    "password": "password123"
  }
}
```

### CLI Configuration
`workspace/cli/config.json`:
```json
{
  "serverUrl": "http://localhost:8080"
}
```

### Web Client API Configuration
`workspace/web-client/src/config/api.js`:
```javascript
export const apiConfig = {
  baseUrl: 'http://' + window.location.hostname + ':8080',
  timeout: 30000,
  defaultHeaders: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
};
```

---

## Available Interfaces

### Web Client (Primary Interface) ✅

**URL**: http://localhost:3000

**Features**:
- Landing page with user identification
- Activity navigation (Setup Management, ODP Read, ODP Elaboration)
- Real-time API server health monitoring
- Responsive, mobile-friendly design
- User-friendly error handling

### API Endpoints (Backend)

All endpoints require `x-user-id` header.

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

**Query Parameters**:
- `?baseline=<id>` - Filter by baseline
- `?fromWave=<id>` - Filter changes from specific wave

#### Management Entities
- `GET/POST /baselines` - Immutable deployment plan snapshots
- `GET/POST /odp-editions` - Edition management with baseline references

#### Document Import/Export
- `POST /import/idl` - Import iDL requirements
- `POST /import/odp` - Import ODP operational changes
- `GET /export/odp-edition/{id}` - Export ODP edition as Word document

### Command Line Interface

Full CLI coverage of all API functionality.

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

#### Import/Export Operations
```bash
npm run dev import idl <file-path>
npm run dev import odp <file-path>
npm run dev export edition <edition-id> <output-path>
```

### Neo4j Browser (Database)

**URL**: http://localhost:7474  
**Credentials**: neo4j / password123

**Features**:
- Cypher query interface
- Graph visualization
- Performance monitoring
- Schema inspection

---

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
   If red: Check CORS configuration and API server logs
   ```

3. **Activity Navigation**:
   ```
   Test: Click activity tiles
   Expected: Navigation to activity URLs
   ```

### API Server Testing

```bash
# Health check
curl -H "x-user-id: test-user" http://localhost:8080/hello
# Expected: {"status":"ok","message":"ODP Server running","timestamp":"..."}

# Entity operations
curl -H "x-user-id: test-user" http://localhost:8080/stakeholder-categories
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

---

## Development Workflow

### Starting Development

```bash
# Deploy (local)
podman play kube odp-deployment-local.yaml

# Deploy (Eurocontrol)
podman play kube odp-deployment-ec.yaml

# Check status
podman ps

# View logs
podman logs odp-pod-neo4j
podman logs odp-pod-odp-server
podman logs odp-pod-web-client
```

### Stopping Services

```bash
# Stop (local)
podman play kube --down odp-deployment-local.yaml

# Stop (Eurocontrol)
podman play kube --down odp-deployment-ec.yaml
```

### Code Changes

**Backend Changes** (workspace/server):
- No rebuild needed - code is volume-mounted
- Just restart pod

**Frontend Changes** (workspace/web-client):
- No rebuild needed for code changes
- Rebuild image only if shared modules changed

**Shared Module Changes** (workspace/shared):
- Must rebuild web client image
- Restart pod after rebuild

### Backup and Restore

```bash
# Backup database
./bin/odp-admin-podman.bash dump -y <yaml-file>

# Restore database
./bin/odp-admin-podman.bash load -y <yaml-file> -b <backup-dir>
```

**See**: `odp-deployment-guide.md` for detailed backup/restore procedures.

### Debugging

```bash
# Check service status
podman ps -a

# View service logs
podman logs <container-name>

# Enter container
podman exec -it odp-pod-odp-server sh

# Test API connectivity
curl -H "x-user-id: test-user" http://localhost:8080/hello

# Check Neo4j connectivity
# Use Neo4j Browser: http://localhost:7474
```

---

## Troubleshooting

### Common Issues

#### Module Not Found Errors
```bash
# Solution: Install dependencies
cd <odp-main>
npm install
```

#### Neo4j Permission Errors
```bash
# Solution: Verify data directory path in deployment YAML
# Local: ~/odp-data/neo4j
# EC: /auto/local_build/dhws097/ssd1/odp-data/neo4j
```

#### Web Client 404 Errors
```bash
# Solution: Rebuild web client image
podman build -f Dockerfile.web-client -t odp-web-client:latest .
```

#### Wrong API Port
```bash
# Solution: Verify workspace/web-client/src/config/api.js
# Should have: baseUrl: 'http://' + window.location.hostname + ':8080'
```

**See**: `odp-deployment-guide.md` Section 7 for comprehensive troubleshooting.

---

## What's Available Now

### ✅ Fully Working

- **Complete backend**: 7 entities with full CRUD and versioning
- **Advanced CLI**: 35+ commands with multi-context operations
- **Web client foundation**: Landing page with user identification
- **API integration**: CORS-enabled server with health monitoring
- **Development environment**: Podman-based deployment with live reload
- **Document processing**: Import/export pipeline for DrG materials
- **Backup/restore**: Automated database backup and restore utility

### 🔄 In Development

- **Setup Management Activity**: Entity management UI
- **Entity CRUD interfaces**: Forms, tables, and detail views
- **Hierarchy management**: Visual tree navigation

### 📋 Planned

- **ODP Read Activity**: Query and browse interface
- **ODP Elaboration Activity**: Content creation and editing
- **Rich text editing**: Advanced content authoring
- **Timeline visualization**: Deployment planning interfaces

---

## Quick Reference Commands

### Deployment
```bash
# Deploy
podman play kube <yaml-file>

# Stop
podman play kube --down <yaml-file>

# Status
podman ps
```

### Backup/Restore
```bash
# Backup
./bin/odp-admin-podman.bash dump -y <yaml-file>

# Restore
./bin/odp-admin-podman.bash load -y <yaml-file> -b <backup-dir>
```

### Development
```bash
# Install dependencies
npm install

# Build web client
podman build -f Dockerfile.web-client -t odp-web-client:latest .

# View logs
podman logs <container-name>
```

---

## Next Steps After Setup

1. **Explore the web interface**: Test user identification and activity navigation
2. **Experiment with CLI**: Try entity management commands
3. **Review the architecture**: See `Project-Architecture-and-Technology-Stack.md`
4. **Read deployment guide**: See `odp-deployment-guide.md` for operational procedures

---

**For detailed deployment procedures, see**: `odp-deployment-guide.md`  
**For architectural decisions and rationale, see**: `Project-Architecture-and-Technology-Stack.md`

**Document Version**: 2.0  
**Last Updated**: February 11, 2026  
**Focus**: Quick reference and what's available