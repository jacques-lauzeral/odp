# Chapter 09 – Deployment

## 1. Overview

ODIP runs as a three-container pod managed by **Podman** with Kubernetes YAML configuration files. Two environment-specific files are maintained — one for local development (WSL/Ubuntu) and one for the Eurocontrol corporate environment — with identical pod structure and only path and image registry differences between them.

---

## 2. Container Architecture

Three containers share a single pod and communicate over localhost:

| Container | Image | Port | Role |
|---|---|---|---|
| `neo4j` | neo4j:5.15 + APOC | 7474 (HTTP), 7687 (Bolt) | Graph database |
| `odp-server` | node:24 | 8080 (host) → 80 (container) | Express API + import/export services |
| `web-client` | odp-web-client:latest (local build) | 3000 | Static web client dev server |

The server container mounts the source code tree as a host volume and runs `nodemon` for live reload during development. The web client is built into a local container image once and rebuilt only when its dependencies change.

---

## 3. Deployment Configurations

### 3.1 Environment Differences

| Aspect | Local (`odip-deployment-local.yaml`) | Eurocontrol (`odip-deployment-ec.yaml`) |
|---|---|---|
| Base images | `docker.io/neo4j:5.15`, `docker.io/node:24` | `yagi.cfmu.corp.eurocontrol.int:5000/*` |
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
FROM node:24-alpine
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
│   ├── odip-admin              Pod lifecycle, backup / restore (manual)
│   ├── odip-backup             Automated periodic backup
│   └── odip-cli                CLI launcher
├── workspace/
│   ├── cli/                        CLI tool
│   ├── server/                     Express API server
│   ├── shared/                     @odp/shared package
│   └── web-client/                 Web client
├── Dockerfile.web-client
├── odip-deployment-ec.yaml
├── odip-deployment-local.yaml
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

## 6. Environment Variables

Add to `~/.bashrc`:

```bash
export ODIP_HOME=/home/jacques/works/github/odp
export ODIP_DATA=~/odip-data
export ODIP_BACKUP=~/odip-backups
export PATH="$ODIP_HOME/bin:$PATH"
```

| Variable | Purpose |
|---|---|
| `ODIP_HOME` | Repository root — resolves YAML files, Dockerfile, CLI entry point |
| `ODIP_DATA` | Neo4j data directory (`~/odip-data`) — used by `odip-admin` dump/load/reset and resolved in YAML via `envsubst` |
| `ODIP_BACKUP` | Backup base directory — default root for all backup slots |

---

## 7. Deployment Procedures

### Local Environment

```bash
# One-time setup
git clone <repository-url> odp-main && cd odp-main
npm install
mkdir -p ~/odp-data/neo4j
# Edit odip-deployment-local.yaml: replace USERNAME with your username
podman build -f Dockerfile.web-client -t odp-web-client:latest .

# Start
podman play kube odip-deployment-local.yaml

# Stop
podman play kube --down odip-deployment-local.yaml
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

podman play kube odip-deployment-ec.yaml
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
## 8. Data Management

Neo4j data persists in the host-mounted volume. No database migrations are required — the schema is created implicitly by the store layer on first use (Neo4j constraints are created at startup).

### 7.1 Manual Backup / Restore — `odip-admin`

`dump`, `load`, and `reset` operate on the Neo4j container only (not the whole pod). Before stopping Neo4j, the server is signalled to enter standby mode (503 on all non-admin requests); it resumes automatically once Neo4j is back up.

| Command | Effect |
|---|---|
| `dump` | Standby → stop Neo4j → `neo4j-admin dump` → start Neo4j → resume |
| `load` | Standby → stop Neo4j → `neo4j-admin load --overwrite` → start Neo4j → resume |
| `reset` | Standby → stop Neo4j → move data dir → start Neo4j → resume (empty DB) |

```bash
odip-admin dump                              # default: ~/odip-backups/<timestamp>/neo4j.dump
odip-admin dump -b /path/to/backup
odip-admin load -b ~/odip-backups/20260211-1430
odip-admin reset                             # requires YES confirmation; data moved not deleted
odip-admin dump -e ec                        # Eurocontrol environment
odip-admin standby                           # manual standby
odip-admin resume                            # manual resume
```

### 7.2 Pod Lifecycle — `odip-admin`

```bash
odip-admin start
odip-admin stop
odip-admin restart
odip-admin restart --rebuild                 # rebuilds web client image before restart
odip-admin logs                              # stream server logs
odip-admin logs --tail 50                   # last 50 lines
odip-admin logs -f                          # follow
```

### 7.3 Automated Backup — `odip-backup`

Three-slot rotation with fixed filenames. Cron wakes the script nightly; the age-threshold logic decides what action to take.

| Slot | File | Cadence | Source |
|---|---|---|---|
| daily | `auto/daily/neo4j.dump` | every 24h | fresh dump via `odip-admin dump` |
| weekly | `auto/weekly/neo4j.dump` | every 7 days | promoted from daily |
| monthly | `auto/monthly/neo4j.dump` | every 28 days | promoted from weekly |

Promotions run before the fresh dump so the pre-dump state propagates up the chain.

**Setup**

```bash
chmod +x bin/odip-backup
mkdir -p ~/odip-backups/auto
```

Add to crontab (`crontab -e`):

```cron
# Local environment — nightly at 02:00
0 2 * * *  odip-backup >> ~/odip-backups/auto/odip-backup.log 2>&1

# Eurocontrol environment — nightly at 02:00
0 2 * * *  odip-backup -e ec >> ~/odip-backups/auto/odip-backup.log 2>&1
```

**Manual invocation**

```bash
odip-backup                                  # local, default base dir
odip-backup -e ec
odip-backup -b /path/to/backup-base
```

### 7.4 Server Standby Protocol

`odip-admin` signals the API server before stopping Neo4j and after restarting it, via two localhost-only endpoints:

| Endpoint | Effect |
|---|---|
| `POST /admin/standby` | Server rejects all non-admin requests with 503 |
| `POST /admin/resume` | Server resumes normal operation |
| `GET /admin/status` | Returns `{ status: "standby" \| "running" }` |

The server module is `server/src/routes/admin.js`; it exports `standbyMiddleware` (registered before all other routes in `index.js`) and `adminRouter` (mounted at `/admin`).

---

[← 08 Web Client](08-Web-Client.md) | [10 Development Guide →](10-Development-Guide.md)