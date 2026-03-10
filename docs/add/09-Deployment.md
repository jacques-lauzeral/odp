# Chapter 08 – Deployment

## 1. Overview

ODIP runs as a three-container pod managed by **Podman** with Kubernetes YAML configuration files. Two environment-specific files are maintained — one for local development (WSL/Ubuntu) and one for the Eurocontrol corporate environment — with identical pod structure and only path and image registry differences between them.

---

## 2. Container Architecture

Three containers share a single pod and communicate over localhost:

| Container | Image | Port | Role |
|---|---|---|---|
| `neo4j` | neo4j:5.15 + APOC | 7474 (HTTP), 7687 (Bolt) | Graph database |
| `odp-server` | node:20 | 8080 (host) → 80 (container) | Express API + import/export services |
| `web-client` | odp-web-client:latest (local build) | 3000 | Static web client dev server |

The server container mounts the source code tree as a host volume and runs `nodemon` for live reload during development. The web client is built into a local container image once and rebuilt only when its dependencies change.

---

## 3. Deployment Configurations

### 3.1 Environment Differences

| Aspect | Local (`odp-deployment-local.yaml`) | Eurocontrol (`odp-deployment-ec.yaml`) |
|---|---|---|
| Base images | `docker.io/neo4j:5.15`, `docker.io/node:20` | `yagi.cfmu.corp.eurocontrol.int:5000/*` |
| Neo4j data | `~/odp-data/neo4j` | `/auto/local_build/dhws097/ssd1/odp-data/neo4j` |
| Source code | `~/odp/odp-main` | `/auto/home/lau/works/odp/odp-main` |
| Node.js | System / nvm | `/cm/cots/osm/node.24.11.1/` |

### 3.2 Common Environment Variables

```yaml
# Neo4j container
NEO4J_AUTH: "neo4j/password123"
NEO4J_PLUGINS: '["apoc"]'

# Server container
NODE_ENV: "development"
NEO4J_URI: "bolt://localhost:7687"
NEO4J_USER: "neo4j"
NEO4J_PASSWORD: "password123"
```

### 3.3 Web Client Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN mkdir -p workspace/web-client/src/shared/src && \
    cp -r workspace/shared/src/* workspace/web-client/src/shared/src/
WORKDIR /app/workspace/web-client
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

The Dockerfile copies the shared package into the web client source tree at build time to avoid workspace symlink issues inside the container.

---

## 4. Repository Structure

```
odp-main/
├── bin/
│   └── odp-admin-podman.bash       Backup / restore utility
├── workspace/
│   ├── cli/                        CLI tool
│   ├── server/                     Express API server
│   ├── shared/                     @odp/shared package
│   └── web-client/                 Web client
├── Dockerfile.web-client
├── odp-deployment-ec.yaml
├── odp-deployment-local.yaml
└── package.json                    npm workspace root
```

---

## 5. Access Points

| Service | URL | Credentials |
|---|---|---|
| Web Client | http://localhost:3000 | None (user name entry only) |
| ODP API | http://localhost:8080 | `x-user-id` request header |
| Neo4j Browser | http://localhost:7474 | neo4j / password123 |

In the Eurocontrol environment the web client is accessible from remote browsers at `http://dhws097:3000`; the API base URL in `web-client/src/config/api.js` is set to `http://<hostname>:8080` to support this.

---

## 6. Deployment Procedures

### Local Environment

```bash
# One-time setup
git clone <repository-url> odp-main && cd odp-main
npm install
mkdir -p ~/odp-data/neo4j
# Edit odp-deployment-local.yaml: replace USERNAME with your username
podman build -f Dockerfile.web-client -t odp-web-client:latest .

# Start
podman play kube odp-deployment-local.yaml

# Stop
podman play kube --down odp-deployment-local.yaml
```

### Eurocontrol Environment

```bash
# One-time extras (beyond the local steps above)
echo 'export PATH=/cm/cots/osm/node.24.11.1/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
mkdir -p /auto/local_build/dhws097/ssd1/odp-data/neo4j
chmod 777 /auto/local_build/dhws097/ssd1/odp-data/neo4j
# Reinstall sharp for Alpine Linux musl libc
rm -rf node_modules/sharp
npm install --os=linux --libc=musl --cpu=x64 sharp

podman play kube odp-deployment-ec.yaml
```

### Verify

```bash
podman ps                                    # Expect 4 entries: infra + 3 app containers
podman logs odp-pod-neo4j      | tail -20
podman logs odp-pod-odp-server | tail -30
podman logs odp-pod-web-client | tail -20
curl -H "x-user-id: test" http://localhost:8080/hello
```

---

## 7. Data Management

Neo4j data persists in the host-mounted volume. A backup/restore utility is provided at `bin/odp-admin-podman.bash`. No database migrations are required — the schema is created implicitly by the store layer on first use (Neo4j constraints are created at startup).

---

[← 08 Web Client](08-Web-Client.md) | [10 Development Guide →](10-Development-Guide.md)