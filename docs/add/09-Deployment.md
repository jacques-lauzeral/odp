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
| `web-client` | `odp-web-client:latest` (local build) | 3000 | Vite preview server — serves pre-built SPA `dist/` with deep-link routing support |

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
| `ODIP_GEM_MODE` | gem install mode for server image build: `podman` or `host` | `podman` | `host` |

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
    ├── works/             HTML + flat document builds (persistent git repo)
    ├── works-intro/       Intro document set build (persistent git repo)
    └── works-{drg}/       Per-domain document set builds × 13 (persistent git repos)
```

All `publication/works*/` directories are initialised by the server at startup (see §7.3).

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
fetch-timeout=300000
fetch-retry-mintimeout=20000
fetch-retry-maxtimeout=120000
```

Special characters in the password must be URL-encoded (e.g. `@` → `%40`). The fetch timeout settings prevent npm from aborting the full-workspace install prematurely when the Nexus proxy (`yagi:8081`) has a short idle timeout.

### gem proxy (EC only)

Ruby gem installation during server image build requires a corporate proxy configured in `~/.gemrc`:

```yaml
:backtrace: false
:verbose: true
https-proxy: http://<user>:<password>@pac.eurocontrol.int:9512
```

Special characters in the password must be URL-encoded. `odip-admin` extracts the proxy URL from `~/.gemrc` and passes it as a Podman build secret — credentials are never stored in the image or its history.

> **Note:** `apt-get` during image build also requires proxy access. `odip-admin` passes `http_proxy`/`https_proxy` as build args automatically when `ODIP_GEM_MODE=host`. No additional configuration is required for `apt-get`.

### EC compatibility fixes (one-time)

The following changes are required in the repository before `odip-admin install` will succeed on EC with npm 11 / Node 24:

**Remove `@openapitools/openapi-generator-cli`** from `devDependencies` in both `package.json` (root) and `workspace/shared/package.json`. This package pulls in `@nuxtjs/opencollective` which carries an empty version string that npm 11's stricter semver validation rejects with `TypeError: Invalid Version`. The generator is a one-time code generation tool already executed — it is not needed for installation or runtime.

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
export ODIP_GEM_MODE=host
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
FROM node:20

ARG NPM_INSTALL=true
ARG BUILD_WEB_CLIENT=true

WORKDIR /app
COPY . .
RUN mkdir -p workspace/web-client/src/shared/src && \
    cp -r workspace/shared/src/* workspace/web-client/src/shared/src/
WORKDIR /app/workspace/web-client
RUN if [ "$NPM_INSTALL" = "true" ]; then npm install; fi
RUN if [ "$BUILD_WEB_CLIENT" = "true" ]; then npm run build; fi
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

Two build args control the install and build steps:

- `NPM_INSTALL` — whether `npm install` runs inside the container
- `BUILD_WEB_CLIENT` — whether `vite build` runs inside the container

In `podman` mode (local), both are `true` — the container installs and builds with direct internet access. In `host` mode (EC), both are `false` — `odip-admin` runs `npm install` and `vite build` on the host first (proxy-aware), and the resulting `node_modules/` and `dist/` are copied into the image via `COPY . .`.

`odip-admin` passes the correct `--build-arg` values automatically based on `ODIP_NPM_MODE`.

> **EC note:** The base image is `node:20` (glibc) rather than `node:20-alpine` (musl). This is required because `npm install` runs on the host (glibc) in EC mode — the native Rollup binary installed on the host must match the container libc. Alpine's musl libc would cause `vite preview` to crash with a missing `@rollup/rollup-linux-x64-musl` error.

**Preview server:** The container runs `vite preview` to serve the pre-built `dist/` bundle on port 3000. `vite preview` provides SPA fallback routing (all unmatched paths return `index.html`) without requiring a full dev server.

```json
"preview": "vite preview --host --port 3000"
```

> **EC note:** `vite preview` blocks requests from hostnames not in its allowlist by default. Set `preview.allowedHosts: true` in `vite.config.js` to allow EC workstation hostnames (e.g. `dhws222`).

After any change to source or dependencies, run `odip-admin restart --rebuild=web-client` to rebuild the image.

### 5.2 Server (`Dockerfile.odp-server`)

The server requires Ruby and `asciidoctor-pdf` for PDF publication. A custom image extends `node:20`:

```dockerfile
FROM node:20

# Proxy args for apt-get (EC env — no direct internet access in container builds)
# Passed by odip-admin when ODIP_GEM_MODE=host; absent in podman mode (direct internet).
ARG http_proxy
ARG https_proxy

RUN apt-get update && apt-get install -y --no-install-recommends \
        ruby ruby-dev build-essential libxml2-dev libxslt-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# gem_proxy secret: contains proxy URL (e.g. http://user:pass@host:port)
# Passed by odip-admin when ODIP_GEM_MODE=host; absent in podman mode.
# When absent, gem install proceeds without proxy (direct internet).
RUN --mount=type=secret,id=gem_proxy \
    proxy=$(cat /run/secrets/gem_proxy 2>/dev/null || true) && \
    gem install asciidoctor-pdf rouge ${proxy:+--http-proxy "$proxy"}

WORKDIR /app/workspace/server
CMD ["npm", "run", "dev"]
```

The image is built locally and tagged `$ODIP_DOCKER_REGISTRY/odp-server:latest`. It is referenced in `odip-deployment.yaml` with `imagePullPolicy: Never` — Podman uses the locally built image without pulling from the registry.

`odip-admin` controls gem installation mode via `ODIP_GEM_MODE`:

- `podman` (default, personal env): `gem install` runs with direct internet access — no proxy args passed
- `host` (EC): proxy URL is extracted from `~/.gemrc` and passed as a Podman build secret (`--secret id=gem_proxy`); `http_proxy`/`https_proxy` build args are also passed for `apt-get`

> **Security:** proxy credentials are passed via Podman build secret — they are never embedded in the Dockerfile, build args, or image history.

---

## 6. Access Points

| Service | URL | Credentials |
|---|---|---|
| Web Client | http://localhost:3000 | Email identification (validated against `users.yaml`) |
| ODP API | http://localhost:8080 | `x-user-id` request header (the user's email) |
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
1. Creates runtime directories (`ensure_runtime_dirs`) — creates all 15 `works*/` dirs with `chmod 777`
2. Deploys config (`deploy_config_files`) — copies the four YAML config files (`domains.yaml`, `edition.yaml`, `users.yaml`, `permissions.yaml`) from `$ODIP_REPO/workspace/server/config/` to `$ODIP_HOME/config/`, and removes any superseded `domains.json` / `edition.json`
3. Bootstraps each works dir from the corresponding config source dirs under `$ODIP_REPO/publication/`
4. Runs `npm install` in each works dir if `node_modules/` absent (host side, proxy-aware via `~/.npmrc`)
5. Runs `npm install` for all workspaces (server, web-client, cli)
6. Builds `odp-server` image from `Dockerfile.odp-server`
7. Builds `web-client` image from `Dockerfile.web-client`

The domain list for per-DrG works dirs is derived from `$ODIP_REPO/publication/shared/content/` subdirectories — adding a new DrG static content directory automatically creates a new works dir on next `odip-admin install`.

> **Note:** `ui-bundle.zip` is committed to the repository pre-patched with the custom EUROCONTROL header — no download step is required. See ch06 §7 for details on how the bundle was prepared.

### Publication workspace

`ensure_runtime_dirs` (called on every `start`/`restart`) creates `$ODIP_HOME/publication/works/` with `chmod 777` — required so the container (running as root) can write into a directory owned by the host user.

The server completes workspace initialisation at startup via `initializePublicationWorkspace()` in `index.js`:

1. `git init` — if `.git` absent
2. `git config --global safe.directory` + `user.email` + `user.name` — always, on every startup (survives `.git` recreation)
3. Static content bootstrap (`cp -r $PUBLICATION_PATH/. works/`) — if `package.json` absent
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
odip-admin config-reload                     # reload users.yaml + permissions.yaml (no restart)
odip-admin config-reload --users             # reload users.yaml only
odip-admin config-reload --permissions       # reload permissions.yaml only
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
| `POST /admin/config/reload?configs=users,permissions` | Live-reload the named runtime configs (no restart) |

The server module is `server/src/routes/admin.js`; it exports `standbyMiddleware` (registered before all other routes in `index.js`) and `adminRouter` (mounted at `/admin`).

The `/admin` surface is mounted **above** the RBA middleware and is therefore not matrix-governed — it is protected as a whole by network isolation (localhost-only). `POST /admin/config/reload` (wrapped by `odip-admin config-reload`) re-reads `users.yaml` and/or `permissions.yaml` and applies them atomically: if a file fails validation, none of the requested configs change and the previously loaded config stays active. `domains.yaml` and `edition.yaml` are structural and not reloadable — changing them requires a restart.

---

[← 08 Web Client](08-Web-Client.md) | [10 Development Guide →](10-Development-Guide.md)