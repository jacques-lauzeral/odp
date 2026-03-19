# Chapter 09 – Deployment

## 1. Overview

ODIP runs as a three-container pod managed by **Podman** with a single Kubernetes YAML configuration file. Environment differences (image registry, data paths, npm install mode) are expressed entirely through host environment variables — no environment-specific YAML files are maintained.

---

## 2. Container Architecture

Three containers share a single pod and communicate over localhost:

| Container | Image | Port | Role |
|---|---|---|---|
| `neo4j` | `$ODIP_DOCKER_REGISTRY/neo4j:5.15` + APOC | 7474 (HTTP), 7687 (Bolt) | Graph database |
| `odp-server` | `$ODIP_DOCKER_REGISTRY/node:20` | 8080 (host) → 80 (container) | Express API + import/export services |
| `web-client` | `odp-web-client:latest` (local build) | 3000 | Static web client dev server |

The server container mounts the source code tree as a host volume and runs `nodemon` for live reload during development. The web client is built into a local container image once and rebuilt only when its source or dependencies change.

---

## 3. Environment Variables

All environment-specific configuration is expressed through host shell variables. Add to `~/.bashrc` (or `~/.kshrc` on EC):

| Variable | Purpose | Local example | EC example |
|---|---|---|---|
| `ODIP_HOME` | Repository root — resolves YAML, Dockerfile, CLI entry point | `~/works/github/odp` | `/auto/home/lau/works/bitbucket/odip-proto` |
| `ODIP_DATA` | Neo4j data directory — **must be on local filesystem, not NFS** | `~/odp-data/neo4j` | `/cm/local_build/odip/data` |
| `ODIP_BACKUP` | Backup base directory — **must be on local filesystem, not NFS** | `~/odip-backups` | `/cm/local_build/odip/backups` |
| `ODIP_DOCKER_REGISTRY` | Docker image registry | `docker.io` | `yagi.cfmu.corp.eurocontrol.int:5000` |
| `ODIP_NPM_MODE` | npm install mode for web client image build: `podman` or `host` | `podman` | `host` |

`ODIP_DATA` and `ODIP_BACKUP` must reside on a local filesystem. NFS-mounted paths block Neo4j's internal `chown` operations under rootless Podman.

Also add `$ODIP_HOME/bin` to `PATH`:

```bash
export PATH="$ODIP_HOME/bin:$PATH"
```

On EC, the system Node.js must also be on the path:

```bash
export PATH="/cm/cots/osm/node.24.11.1/bin:$PATH"
```

### npm proxy (EC only)

The EC environment has no direct internet access. npm requires a corporate proxy configured in `~/.npmrc`:

```
http-proxy=http://<user>:<password>@pac.eurocontrol.int:9512
https-proxy=http://<user>:<password>@pac.eurocontrol.int:9512
```

Special characters in the password must be URL-encoded (e.g. `@` → `%40`).

---

## 4. Repository Structure

```
odip-proto/
├── bin/
│   ├── odip-admin              Pod lifecycle, backup / restore (manual)
│   ├── odip-backup             Automated periodic backup
│   └── odip-cli                CLI launcher
├── workspace/
│   ├── cli/                    CLI tool
│   ├── server/                 Express API server
│   ├── shared/                 @odp/shared package
│   └── web-client/             Web client
├── Dockerfile.web-client
├── odip-deployment.yaml
└── package.json                npm workspace root
```

---

## 5. Web Client Dockerfile

```dockerfile
FROM node:20-alpine

ARG NPM_INSTALL=true

WORKDIR /app
COPY . .
RUN mkdir -p workspace/web-client/src/shared/src && \
    cp -r workspace/shared/src/* workspace/web-client/src/shared/src/
WORKDIR /app/workspace/web-client
RUN if [ "$NPM_INSTALL" = "true" ]; then npm install; fi
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

The `NPM_INSTALL` build arg controls whether `npm install` runs inside the container:

- `podman` mode (local): `COPY . .` does not include `node_modules`; container installs via `npm install` (internet access required)
- `host` mode (EC): `npm install` is run on the host first by `odip-admin` using the user's proxy-configured npm; `node_modules` is copied in via `COPY . .`; container skips install

`odip-admin` passes the correct `--build-arg` automatically based on `ODIP_NPM_MODE`.

---

## 6. Access Points

| Service | URL | Credentials |
|---|---|---|
| Web Client | http://localhost:3000 | None (user name entry only) |
| ODP API | http://localhost:8080 | `x-user-id` request header |
| Neo4j Browser | http://localhost:7474 | neo4j / password123 |

In the Eurocontrol environment the web client is accessible from remote browsers at `http://dhws097:3000`; the API base URL in `web-client/src/config/api.js` is set to `http://<hostname>:8080` to support this.

---

## 7. Deployment Procedures

### One-time setup

```bash
# Clone repository
git clone <repository-url> && cd odip-proto

# Set environment variables in ~/.bashrc (see section 3)
source ~/.bashrc

# Create data and backup directories
mkdir -p $ODIP_DATA
mkdir -p $ODIP_BACKUP/auto

# Install workspace dependencies
# Local:
npm install
# EC (proxy-authenticated npm, per workspace):
cd workspace/server && npm install && cd ../..
cd workspace/web-client && npm install && cd ../..
cd workspace/cli && npm install && cd ../..

# Build web client image and start
odip-admin start --rebuild
```

### Routine operations

```bash
odip-admin start                             # start pod
odip-admin start --rebuild                  # rebuild web client image then start
odip-admin stop                              # stop pod
odip-admin restart                           # stop and restart
odip-admin restart --rebuild                 # rebuild web client image then restart
```

### Verify

```bash
podman ps                                    # expect 4 entries: infra + 3 app containers
podman logs odp-pod-neo4j      | tail -20
podman logs odp-pod-odp-server | tail -30
podman logs odp-pod-web-client | tail -20
curl -H "x-user-id: test" http://localhost:8080/ping
```

---

## 8. Data Management

Neo4j data persists in the host-mounted volume at `$ODIP_DATA`. No database migrations are required — the schema is created implicitly by the store layer on first use.

### 8.1 Manual Backup / Restore — `odip-admin`

`dump`, `load`, and `reset` operate on the Neo4j container only (not the whole pod). Before stopping Neo4j, the server is signalled to enter standby mode (503 on all non-admin requests); it resumes automatically once Neo4j is back up.

| Command | Effect |
|---|---|
| `dump` | Standby → stop Neo4j → `neo4j-admin dump` → start Neo4j → resume |
| `load` | Standby → stop Neo4j → `neo4j-admin load --overwrite` → start Neo4j → resume |
| `reset` | Standby → stop Neo4j → move data dir → start Neo4j → resume (empty DB) |

```bash
odip-admin dump                              # default: $ODIP_BACKUP/<timestamp>/neo4j.dump
odip-admin dump -b /path/to/backup
odip-admin load -b $ODIP_BACKUP/20260211-1430
odip-admin reset                             # requires YES confirmation; data moved not deleted
odip-admin standby                           # manual standby
odip-admin resume                            # manual resume
odip-admin dumps                             # list available backup slots
```

### 8.2 Automated Backup — `odip-backup`

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
mkdir -p $ODIP_BACKUP/auto
```

Add to crontab (`crontab -e`):

```cron
0 2 * * *  odip-backup >> $ODIP_BACKUP/auto/odip-backup.log 2>&1
```

**Manual invocation**

```bash
odip-backup                                  # default base dir from $ODIP_BACKUP
odip-backup -b /path/to/backup-base
```

### 8.3 Server Standby Protocol

`odip-admin` signals the API server before stopping Neo4j and after restarting it, via two localhost-only endpoints:

| Endpoint | Effect |
|---|---|
| `POST /admin/standby` | Server rejects all non-admin requests with 503 |
| `POST /admin/resume` | Server resumes normal operation |
| `GET /admin/status` | Returns `{ status: "standby" \| "running" }` |

The server module is `server/src/routes/admin.js`; it exports `standbyMiddleware` (registered before all other routes in `index.js`) and `adminRouter` (mounted at `/admin`).

---

[← 08 Web Client](08-Web-Client.md) | [10 Development Guide →](10-Development-Guide.md)