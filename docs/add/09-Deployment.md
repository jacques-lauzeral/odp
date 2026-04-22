# Chapter 09 – Deployment

## 1. Overview

ODIP runs as a three-container pod managed by **Podman** with a single Kubernetes YAML configuration file. Environment differences (image registry, data paths, npm install mode) are expressed entirely through host environment variables — no environment-specific YAML files are maintained.

---

## 2. Container Architecture

Three containers share a single pod and communicate over localhost:

| Container | Image | Port | Role |
|---|---|---|---|
| `neo4j` | `$ODIP_DOCKER_REGISTRY/neo4j:5.15` + APOC | 7474 (HTTP), 7687 (Bolt) | Graph database |
| `odp-server` | `$ODIP_DOCKER_REGISTRY/odp-server:latest` (custom image) | 8080 (host) → 80 (container) | Express API + import/export + publication services |
| `web-client` | `odp-web-client:latest` (local build) | 3000 | Static web client dev server |

The server container receives `ODIP_HOME=/odip` as an env var (injected in `odip-deployment.yaml`). The `$ODIP_HOME` host path is mounted into the container at `/odip` via the `odip-runtime` volume, making the publication workspace at `$ODIP_HOME/publication/works/` accessible inside the container as `/odip/publication/works/`.

The server container mounts the source code tree as a host volume and runs `nodemon` for live reload during development. The web client is built into a local container image once and rebuilt only when its source or dependencies change.

---

## 3. Environment Variables

All environment-specific configuration is expressed through host shell variables. Add to `~/.bashrc` (or `~/.kshrc` on EC):

| Variable | Purpose | Local example | EC example |
|---|---|---|---|
| `ODIP_REPO` | Repository root — source code, bin scripts, Dockerfiles | `~/works/github/odp` | `/cm/local_build/odip/repo` |
| `ODIP_HOME` | Runtime root — contains `data/`, `backups/`, `logs/`, `publication/` — **must be on local filesystem, not NFS** | `~/odip` | `/cm/local_build/odip` |
| `ODIP_DOCKER_REGISTRY` | Docker image registry | `docker.io` | `yagi.cfmu.corp.eurocontrol.int:5000` |
| `ODIP_NPM_MODE` | npm install mode for web client image build: `podman` or `host` | `podman` | `host` |

`ODIP_HOME` must reside on a local filesystem. NFS-mounted paths block Neo4j's internal `chown` operations under rootless Podman.

The runtime directory structure under `ODIP_HOME` is created automatically by `odip-admin` on `start` and `restart`:

```
$ODIP_HOME/
├── data/                  Neo4j database files
├── backups/               Manual and automated backups
│   ├── auto/              Automated backup slots (daily, weekly, monthly)
│   ├── adhoc/             Manual ad-hoc dumps
│   └── reset/             Pre-reset dumps
├── logs/                  Server log files
└── publication/
    └── works/             Antora build workspace (persistent git repo)
```

`publication/works/` is initialised by the server at startup (see §7.3).

Also add `$ODIP_REPO/bin` to `PATH`:

```bash
export PATH="$ODIP_REPO/bin:$PATH"
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

### Full `.bashrc` example

**Local:**
```bash
export ODIP_REPO=~/works/github/odp
export ODIP_HOME=~/odip
export ODIP_DOCKER_REGISTRY=docker.io
export ODIP_NPM_MODE=podman
export PATH="$ODIP_REPO/bin:$PATH"
```

**EC:**
```bash
export ODIP_REPO=/cm/local_build/odip/repo
export ODIP_HOME=/cm/local_build/odip
export ODIP_DOCKER_REGISTRY=yagi.cfmu.corp.eurocontrol.int:5000
export ODIP_NPM_MODE=host
export PATH="$ODIP_REPO/bin:$PATH"
export PATH="/cm/cots/osm/node.24.11.1/bin:$PATH"
```

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
├── publication/
│   └── web-site/
│       └── static/             Antora scaffolding (playbooks, templates, ui-bundle.zip)
│           └── partials/
│               └── header-content.hbs   ← Custom EUROCONTROL navbar (injected into ui-bundle.zip)
├── Dockerfile.web-client
├── Dockerfile.odp-server       ← Custom server image (node:20 + Ruby + asciidoctor-pdf)
├── odip-deployment.yaml
└── package.json                npm workspace root
```

---

## 5. Container Images

### 5.1 Web Client (`Dockerfile.web-client`)

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

- `podman` mode (local): container installs via `npm install` (internet access required)
- `host` mode (EC): `npm install` is run on the host first by `odip-admin` using the user's proxy-configured npm; `node_modules` is copied in via `COPY . .`; container skips install

`odip-admin` passes the correct `--build-arg` automatically based on `ODIP_NPM_MODE`.

### 5.2 Server (`Dockerfile.odp-server`)

The server requires Ruby and `asciidoctor-pdf` for PDF publication. A custom image extends `node:20`:

```dockerfile
FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends \
        ruby ruby-dev build-essential libxml2-dev libxslt-dev \
    && gem install asciidoctor-pdf rouge \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app/workspace/server
CMD ["npm", "run", "dev"]
```

The image is built locally and tagged `$ODIP_DOCKER_REGISTRY/odp-server:latest`. It is referenced in `odip-deployment.yaml` with `imagePullPolicy: Never` — Podman uses the locally built image without pulling from the registry.

**EC porting:** build the image on the EC host (or a machine with access to the EC registry), push it to `$ODIP_DOCKER_REGISTRY`, and change `imagePullPolicy` to `IfNotPresent`. Ruby gems are baked into the image — no internet access is required at runtime.

> **Note:** `apt-get` during image build requires internet access (or an EC-internal Debian mirror). If the EC environment blocks outbound `apt` traffic, the image must be built on a machine with internet access and pushed to the EC registry.

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

# Run one-time installation
odip-admin install

# Start the pod
odip-admin start
```

`odip-admin install` performs all one-time setup steps:
1. Creates runtime directories (`ensure_runtime_dirs`)
2. Copies UI bundle (`ui-bundle.zip`) to `$ODIP_HOME/publication/works/` if not already there
3. Unconditionally syncs static content from `$ODIP_REPO/publication/web-site/static/` to `works/` — ensures no stale files
4. Runs `npm install` in `works/` if `node_modules/` absent (host side, proxy-aware via `~/.npmrc`)
5. Runs `npm install` for all workspaces (server, web-client, cli)
6. Builds `odp-server` image from `Dockerfile.odp-server`
7. Builds `web-client` image from `Dockerfile.web-client`

> **Note:** `ui-bundle.zip` is committed to the repository pre-patched with the custom EUROCONTROL header — no download step is required. See ch06 §7 for details on how the bundle was prepared.

### Publication workspace

`ensure_runtime_dirs` (called on every `start`/`restart`) creates `$ODIP_HOME/publication/works/` with `chmod 777` — required so the container (running as root) can write into a directory owned by the host user.

The server completes workspace initialisation at startup via `initializePublicationWorkspace()` in `index.js`:

1. `git init` — if `.git` absent
2. `git config --global safe.directory` + `user.email` + `user.name` — always, on every startup (survives `.git` recreation)
3. Static content bootstrap (`cp -r $STATIC_CONTENT_PATH/. works/`) — if `package.json` absent
4. Warns if `node_modules/` absent (run `odip-admin install` to fix)

> **Note:** `npm install` in `works/` runs on the host side via `odip-admin install` to avoid container internet access dependency. The container has no outbound internet access on EC.

### Routine operations

```bash
odip-admin start                                  # start pod
odip-admin start --rebuild=server                 # rebuild server image then start
odip-admin start --rebuild=web-client             # rebuild web client image then start
odip-admin start --rebuild=all                    # rebuild both images then start
odip-admin start --install                        # npm install all workspaces then start
odip-admin stop                                   # stop pod
odip-admin restart                                # stop and restart
odip-admin restart --rebuild=server               # rebuild server image then restart
odip-admin restart --rebuild=web-client           # rebuild web client image then restart
odip-admin restart --rebuild=all                  # rebuild both images then restart
odip-admin restart --install                      # npm install all workspaces then restart
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

Neo4j data persists in `$ODIP_HOME/data`. No database migrations are required — the schema is created implicitly by the store layer on first use.

### 8.1 Manual Backup / Restore — `odip-admin`

`dump`, `load`, and `reset` operate on the Neo4j container only (not the whole pod). Before stopping Neo4j, the server is signalled to enter standby mode (503 on all non-admin requests); it resumes automatically once Neo4j is back up.

| Command | Effect |
|---|---|
| `dump` | Standby → stop Neo4j → `neo4j-admin dump` → start Neo4j → resume |
| `load` | Standby → stop Neo4j → `neo4j-admin load --overwrite` → start Neo4j → resume |
| `reset` | Standby → stop Neo4j → `neo4j-admin dump` → delete data dir → start Neo4j → resume (empty DB) |

```bash
odip-admin dump                              # default: $ODIP_HOME/backups/adhoc/<timestamp>/neo4j.dump
odip-admin dump -b /path/to/backup
odip-admin load -b adhoc/20260211-1430       # relative paths are resolved to absolute
odip-admin reset                             # requires YES confirmation; pre-reset dump saved to backups/reset/<timestamp>/
odip-admin standby                           # manual standby
odip-admin resume                            # manual resume
odip-admin dumps                             # list dumps across auto / adhoc / reset sections
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
mkdir -p $ODIP_HOME/backups/auto
```

Add to crontab (`crontab -e`):

```cron
0 2 * * *  odip-backup >> $ODIP_HOME/backups/auto/odip-backup.log 2>&1
```

**Manual invocation**

```bash
odip-backup                                  # default base dir from $ODIP_HOME/backups/auto
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