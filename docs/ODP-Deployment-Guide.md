# ODP Deployment Guide

## Overview

This guide provides step-by-step procedures for deploying and operating the ODP (Operational Data Platform) system using Podman and Kubernetes YAML configuration. For architectural decisions and technology rationale, see `Project-Architecture-and-Technology-Stack.md`.

---

## 1. Deployment Configurations

ODP uses environment-specific Kubernetes YAML files:

- **`odp-deployment-local.yaml`** - For personal PC (WSL/Ubuntu)
- **`odp-deployment-ec.yaml`** - For Eurocontrol environment

**Key Differences:**
| Aspect | Local | Eurocontrol |
|--------|-------|-------------|
| Images | docker.io/neo4j:5.15, docker.io/node:20 | yagi.cfmu.corp.eurocontrol.int:5000/* |
| Neo4j Data | ~/odp-data/neo4j | /auto/local_build/dhws097/ssd1/odp-data/neo4j |
| Code Path | ~/odp/odp-main | /auto/home/lau/works/odp/odp-main |
| Node.js | System or nvm | /cm/cots/osm/node.24.11.1/ |

**Common Configuration:**
- Neo4j: 5.15, Ports 7474, 7687
- API: Port 8080
- Web Client: Port 3000
- Same pod structure and environment variables

---

## 2. Configuration Files

### 2.1 Local Configuration (`odp-deployment-local.yaml`)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: odp-pod
spec:
  containers:
  
  # Neo4j Database
  - name: neo4j
    image: docker.io/neo4j:5.15
    ports:
    - containerPort: 7474
      hostPort: 7474
    - containerPort: 7687
      hostPort: 7687
    env:
    - name: NEO4J_AUTH
      value: "neo4j/password123"
    - name: NEO4J_PLUGINS
      value: '["apoc"]'
    volumeMounts:
    - name: neo4j-data
      mountPath: /data
    
  # ODP Server
  - name: odp-server
    image: docker.io/node:20
    workingDir: /app/workspace/server
    ports:
    - containerPort: 80
      hostPort: 8080
    command: ["sh", "-c", "npm run dev"]
    env:
    - name: NODE_ENV
      value: "development"
    - name: NEO4J_URI
      value: "bolt://localhost:7687"
    - name: NEO4J_USER
      value: "neo4j"
    - name: NEO4J_PASSWORD
      value: "password123"
    volumeMounts:
    - name: odp-code
      mountPath: /app
    
  # Web Client
  - name: web-client
    image: localhost/odp-web-client:latest
    imagePullPolicy: Never
    ports:
    - containerPort: 3000
      hostPort: 3000
    env:
    - name: NODE_ENV
      value: "development"
      
  volumes:
  - name: neo4j-data
    hostPath:
      path: /home/USERNAME/odp-data/neo4j
      type: Directory
  - name: odp-code
    hostPath:
      path: /home/USERNAME/odp/odp-main
      type: Directory
```

**Setup**: Replace `USERNAME` with your actual username.

### 2.2 Eurocontrol Configuration (`odp-deployment-ec.yaml`)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: odp-pod
spec:
  containers:
  
  # Neo4j Database
  - name: neo4j
    image: yagi.cfmu.corp.eurocontrol.int:5000/neo4j:5.15
    ports:
    - containerPort: 7474
      hostPort: 7474
    - containerPort: 7687
      hostPort: 7687
    env:
    - name: NEO4J_AUTH
      value: "neo4j/password123"
    - name: NEO4J_PLUGINS
      value: '["apoc"]'
    volumeMounts:
    - name: neo4j-data
      mountPath: /data
    
  # ODP Server
  - name: odp-server
    image: yagi.cfmu.corp.eurocontrol.int:5000/node:20
    workingDir: /app/workspace/server
    ports:
    - containerPort: 80
      hostPort: 8080
    command: ["sh", "-c", "npm run dev"]
    env:
    - name: NODE_ENV
      value: "development"
    - name: NEO4J_URI
      value: "bolt://localhost:7687"
    - name: NEO4J_USER
      value: "neo4j"
    - name: NEO4J_PASSWORD
      value: "password123"
    volumeMounts:
    - name: odp-code
      mountPath: /app
    
  # Web Client
  - name: web-client
    image: localhost/odp-web-client:latest
    imagePullPolicy: Never
    ports:
    - containerPort: 3000
      hostPort: 3000
    env:
    - name: NODE_ENV
      value: "development"
      
  volumes:
  - name: neo4j-data
    hostPath:
      path: /auto/local_build/dhws097/ssd1/odp-data/neo4j
      type: Directory
  - name: odp-code
    hostPath:
      path: /auto/home/lau/works/odp/odp-main
      type: Directory
```

### 2.3 Web Client Dockerfile (`Dockerfile.web-client`)

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

---

## 3. Local Environment Deployment

### 3.1 Prerequisites

1. **Install Podman**:
```bash
sudo apt update
sudo apt install podman
podman --version  # Should show 3.4.0+
```

2. **Clone Repository**:
```bash
mkdir -p ~/odp
cd ~/odp
git clone <repository-url> odp-main
```

### 3.2 One-Time Setup

1. **Install Dependencies**:
```bash
cd ~/odp/odp-main
npm install
```

2. **Create Data Directory**:
```bash
mkdir -p ~/odp-data/neo4j
```

3. **Update Configuration**:
   Edit `odp-deployment-local.yaml` - replace `USERNAME` with your actual username.

4. **Build Web Client Image**:
```bash
cd ~/odp/odp-main
podman build -f Dockerfile.web-client -t odp-web-client:latest .
podman images | grep odp-web-client  # Verify
```

### 3.3 Deploy

```bash
cd ~/odp/odp-main
podman play kube odp-deployment-local.yaml
```

### 3.4 Verify

```bash
# Check containers
podman ps

# Check logs
podman logs odp-pod-neo4j | tail -20
podman logs odp-pod-odp-server | tail -30
podman logs odp-pod-web-client | tail -20
```

### 3.5 Access Services

- **Neo4j Browser**: http://localhost:7474 (neo4j / password123)
- **ODP API**: http://localhost:8080
- **Web Client**: http://localhost:3000

### 3.6 Stop

```bash
podman play kube --down odp-deployment-local.yaml
```

---

## 4. Eurocontrol Environment Deployment

### 4.1 Prerequisites

1. Source code at `/auto/home/lau/works/odp/odp-main`
2. Access to internal registry `yagi.cfmu.corp.eurocontrol.int:5000`
3. Valid `.npmrc` with corporate credentials

### 4.2 One-Time Setup

1. **Configure Node.js PATH**:
```bash
# Add to ~/.bashrc
echo 'export PATH=/cm/cots/osm/node.24.11.1/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Verify
node --version  # v24.11.1
npm --version   # v11.6.2+
```

2. **Create Data Directory**:
```bash
mkdir -p /auto/local_build/dhws097/ssd1/odp-data/neo4j
chmod 777 /auto/local_build/dhws097/ssd1/odp-data/neo4j
```

3. **Install Dependencies**:
```bash
cd /auto/home/lau/works/odp/odp-main
npm install

# Reinstall sharp for Alpine Linux
rm -rf node_modules/sharp
npm install --os=linux --libc=musl --cpu=x64 sharp
```

4. **Build Web Client Image**:
```bash
cd /auto/home/lau/works/odp/odp-main
podman build -f Dockerfile.web-client -t odp-web-client:latest .
podman images | grep odp-web-client  # Verify
```

### 4.3 Deploy

```bash
cd /auto/home/lau/works/odp/odp-main
podman play kube odp-deployment-ec.yaml
```

### 4.4 Verify

```bash
# Check containers
podman ps

# Expected: 4 containers
# - odp-pod-neo4j
# - odp-pod-odp-server
# - odp-pod-web-client
# - <id>-infra

# Check logs
podman logs odp-pod-neo4j | tail -20
podman logs odp-pod-odp-server | tail -30
podman logs odp-pod-web-client | tail -20
```

### 4.5 Access Services

- **Neo4j Browser**: http://localhost:7474
- **ODP API**: http://localhost:8080
- **Web Client**: http://dhws097:3000 (or http://localhost:3000)

### 4.6 Stop

```bash
podman play kube --down odp-deployment-ec.yaml
```

---

## 5. Development Workflow

### 5.1 Making Code Changes

**Backend Changes** (workspace/server):
```bash
# Code is volume-mounted - just restart
podman play kube --down <yaml-file>
podman play kube <yaml-file>
```

**Frontend Changes** (workspace/web-client):
```bash
# No rebuild needed unless shared modules changed
podman play kube --down <yaml-file>
podman play kube <yaml-file>
```

**Shared Module Changes** (workspace/shared):
```bash
# Must rebuild web client image
podman play kube --down <yaml-file>
podman build -f Dockerfile.web-client -t odp-web-client:latest .
podman play kube <yaml-file>
```

---

## 6. Backup and Restore

### 6.1 Overview

Use the `bin/odp-admin-podman.bash` script for all backup/restore operations.

**Features:**
- Auto-detects configuration from deployment YAML
- Manages pod lifecycle (stop/start)
- Timestamped backups
- Complete database replacement on restore

### 6.2 Backup Database

**Basic Usage** (auto-timestamped):
```bash
# Local
./bin/odp-admin-podman.bash dump -y odp-deployment-local.yaml

# Eurocontrol
./bin/odp-admin-podman.bash dump -y odp-deployment-ec.yaml
```

Default location: `~/odp-backups/<timestamp>/neo4j.dump`

**Specify Directory**:
```bash
./bin/odp-admin-podman.bash dump -y odp-deployment-ec.yaml -b /cm/local_build/odp/odp-backups/manual-backup
```

### 6.3 Restore Database

**Usage**:
```bash
# Local
./bin/odp-admin-podman.bash load -y odp-deployment-local.yaml -b ~/odp-backups/20260211-1430

# Eurocontrol
./bin/odp-admin-podman.bash load -y odp-deployment-ec.yaml -b /cm/local_build/odp/odp-backups/20260211-1430
```

**Important**:
- Backup directory must contain `neo4j.dump` file
- Completely replaces existing database
- Pod automatically stopped and restarted

### 6.4 Script Options

```
Commands:
  dump    Backup database
  load    Restore database

Options:
  -y, --yaml <path>         Deployment YAML file
  -b, --backup-dir <path>   Backup directory (required for load)
  -d, --data-dir <path>     Override Neo4j data directory
  -i, --image <name>        Override Neo4j image
  -h, --help                Show help
```

### 6.5 Best Practices

1. **Regular backups** before major changes
2. **Backup location**:
  - Local: `~/odp-backups/`
  - EC: `/cm/local_build/odp/odp-backups/` (SSD, not NFS)
3. **Test restores** periodically
4. **Before upgrades** always backup

---

## 7. Troubleshooting

### 7.1 Module Not Found Errors

**Symptom**: `Cannot find package 'express'`

**Solution**:
```bash
cd <odp-main>
npm install
```

### 7.2 Neo4j Permission Errors

**Symptom**: `chown: permission denied`

**Solution**: Verify deployment YAML uses correct path:
- Local: `~/odp-data/neo4j` (local filesystem)
- EC: `/auto/local_build/.../neo4j` (SSD, not NFS)

### 7.3 Web Client 404 Errors

**Symptom**: Shared module 404s

**Solution**:
```bash
podman build -f Dockerfile.web-client -t odp-web-client:latest .
```

### 7.4 Sharp Module Error

**Symptom**: `Could not load the 'sharp' module`

**Solution** (EC only):
```bash
rm -rf node_modules/sharp
npm install --os=linux --libc=musl --cpu=x64 sharp
```

### 7.5 Wrong API Port

**Symptom**: Web client cannot reach API

**Solution**: Verify `workspace/web-client/src/config/api.js`:
```javascript
baseUrl: 'http://' + window.location.hostname + ':8080',
```

### 7.6 Diagnostic Commands

```bash
# View containers
podman ps -a

# View logs
podman logs <container-name>

# Enter container
podman exec -it odp-pod-odp-server sh

# Test API
curl -H "x-user-id: test-user" http://localhost:8080/hello

# Check resources
podman stats
```

---

## 8. Maintenance

### 8.1 Update Dependencies

```bash
cd <odp-main>
npm update
npm audit fix
```

### 8.2 Upgrade Neo4j

1. Backup database
2. Update image version in YAML
3. Stop and restart pod
4. Verify logs
5. Test application
6. If issues, restore backup

### 8.3 Clean Up

```bash
# Remove unused images
podman image prune -a

# Remove stopped containers
podman container prune

# Remove old backups (>30 days)
find ~/odp-backups/ -type d -mtime +30 -exec rm -rf {} \;
```

---

## 9. Architecture Diagram

```
┌───────────────────────────────────────────────────────────┐
│                     ODP Pod (Kubernetes)                  │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Neo4j      │  │  ODP Server  │  │ Web Client   │   │
│  │   :7474      │  │   :80→8080   │  │    :3000     │   │
│  │   :7687      │  │              │  │              │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘   │
│         │                  │                              │
│    ┌────▼──────────────────▼─────┐                       │
│    │  Volume: neo4j-data         │                       │
│    └─────────────────────────────┘                       │
│    ┌─────────────────────────────┐                       │
│    │  Volume: odp-code           │                       │
│    └─────────────────────────────┘                       │
└───────────────────────────────────────────────────────────┘
```

**Communication**:
- Containers share network namespace (localhost)
- Neo4j accessible at `localhost:7687` from ODP Server
- Persistent storage via volume mounts

---

## 10. Quick Reference

### Essential Commands

```bash
# Deploy
podman play kube <yaml-file>

# Stop
podman play kube --down <yaml-file>

# Backup
./bin/odp-admin-podman.bash dump -y <yaml-file>

# Restore
./bin/odp-admin-podman.bash load -y <yaml-file> -b <backup-dir>

# Status
podman ps

# Logs
podman logs <container-name>
```

### Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Neo4j Browser | http://localhost:7474 | neo4j / password123 |
| ODP API | http://localhost:8080 | Header: x-user-id |
| Web Client | http://localhost:3000 | None |

---

**Document Version**: 2.0  
**Last Updated**: February 11, 2026  
**Environments**: Local (WSL/Ubuntu) + Eurocontrol (RHEL 8)