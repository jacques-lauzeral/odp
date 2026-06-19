# ODIP — Roles and Access (RBA) — Design Note

*v0.2 — 19 June 2026 — DRAFT for discussion*

---

## 1. Context and constraints

### 1.1 Purpose

This note defines the interim identification and access-control solution for ODIP Space. It covers the P0 requirements of the RBA topic (APP-RBA-01, APP-RBA-02, APP-RBA-04) and establishes the architecture for the remaining P1 item (APP-RBA-03).

### 1.2 Governing constraint: designed to be retired

The solution is **explicitly transitory**. EUROCONTROL platform SSO (Kerberos/IWA or equivalent) will replace the authentication half of this design at P2; external RBAC may eventually replace the authorisation half. Every design decision is therefore biased toward the minimum investment needed to open safely at P0 and hand off cleanly at P2.

The architecture separates two concerns that retire on different schedules:

| Concern | Question | Interim mechanism | Retires |
|---|---|---|---|
| **Authentication** | Who are you? | Email declared by client, validated against `users.yaml` | At SSO — ODIP stops owning this entirely |
| **Authorisation context** | What can you do, where? | Hard-coded permission matrix in `permissions.yaml` + domain scope in `users.yaml` | Matrix retires at external RBAC; domain scope may survive SSO as ODIP-specific data |

The **seam** is the server-side `resolveUser()` middleware. SSO integration replaces that one function; no application logic changes above it.

### 1.3 Scope

**In scope (this note):**
- Migration of existing config files from JSON to YAML (`domains.yaml`, `edition.yaml`)
- `users.yaml` — user declaration and domain assignment (APP-RBA-04, APP-RBA-01)
- `permissions.yaml` — action-permission matrix expressed as `method × path → roles` (APP-RBA-02 P0)
- `loader.js` and `config.js` extensions
- Server enforcement middleware
- Client Connect dialog changes

**Explicitly out of scope:**
- DB/CLI/web management of users or the matrix — deferred indefinitely; investment not justified for a transitory scheme
- Per-domain server-side write enforcement (APP-RBA-03) — P1/M4; noted in §5.1
- P1 configurable matrix (APP-RBA-02 P1) — recommend dropping; see §5.2
- Platform SSO integration (APP-RBA-04 P2) — out of scope

---

## 2. Requirements coverage

| Req | Statement | Priority | Coverage |
|---|---|---|---|
| APP-RBA-01 | Role model — passive/active, rights visible | P0 | §3.2 (roles), §4.2 (client) |
| APP-RBA-02 | Action-permission matrix, hard-coded at P0 | P0 | §3.3 |
| APP-RBA-03 | Per-domain write scoping, server-enforced | P1/M4 | §5.1 |
| APP-RBA-02 | Matrix configurable in Manage UI | P1/M4 | §5.2 — recommend dropping |
| APP-RBA-04 | Interim auth: email whitelist, no password | P0 | §3.2, §4.1 |
| APP-RBA-04 | Platform SSO integration | P2 | Out of scope |

---

## 3. Config layer

### 3.1 Format migration: JSON → YAML

All config files under `$ODIP_HOME/config/` migrate from JSON to YAML. The two existing files and the two new RBA files are all YAML. YAML is meaningfully more readable for non-expert integrators (no quotes on simple strings, no commas, clear list syntax) and is the appropriate format for human-maintained operational configuration.

**Dependency added:** `js-yaml` (one package, no transitive dependencies of consequence).

**`loader.js` change:** `JSON.parse(fs.readFileSync(...))` → `yaml.load(fs.readFileSync(...))` per file; file extension `.json` → `.yaml`. All validation logic and accessors are unchanged.

---

### 3.2 Existing files — YAML equivalents

#### `domains.yaml`

```yaml
domains:
  - key: 4DT
    label: 4D-Trajectory
  - key: AIRPORT
    label: Airport
  - key: IDL_ADMM
    label: Airspace Data Meta-Model (iDL-ADMM)
  - key: IDL_ADP
    label: Airspace Data Process (iDL-ADP)
  - key: IDL_INTERFACES
    label: iDL Interfaces
  - key: IDL_AURA
    label: Airspace Utilisation Rules and Availability (AURA)
  - key: IDL_LOA
    label: Letters of Agreement
  - key: IDL_TCF
    label: Transponder Code Function
  - key: ASM_ATFCM
    label: ASM/ATFCM Integration
  - key: CRISIS
    label: Crisis
  - key: FAAS
    label: FAAS
  - key: FLOW
    label: Flow
  - key: RRT
    label: Rerouting
  - key: TRANSVERSAL_NM
    label: Transversal NM
  - key: TRANSVERSAL_NMUI
    label: Transversal NMUI
  - key: TRANSVERSAL_NM_B2B
    label: Transversal NM-B2B
```

#### `edition.yaml` (representative extract — full file is a straight YAML translation)

```yaml
chapters:
  - key: intro
    title: "ODIP Edition 1 \u2014 General Introduction"
    position: 1
    generatedBlocks: [portfolio-table, portfolio-chart]
    generatedStrings:
      - chapter-count
      - sub-chapter-count
      - on-total-count
      - on-draft-count
      - on-advanced-count
      - on-mature-count
      - or-total-count
      - or-draft-count
      - or-advanced-count
      - or-mature-count

  - key: transversal
    title: Transversal Layer
    position: 2
    primaryScope: NM cross-channel principles and interface specifications
    subChapters:
      - key: nm
        title: Transversal NM
        position: 1
        domain: TRANSVERSAL_NM
        primaryScope: Cross-channel principles
      - key: nmui
        title: Transversal NMUI
        position: 2
        domain: TRANSVERSAL_NMUI
        primaryScope: Human interface
      - key: nm-b2b
        title: Transversal NM-B2B
        position: 3
        domain: TRANSVERSAL_NM_B2B
        primaryScope: System interface

  - key: 4d-trajectory
    title: 4D-Trajectory
    position: 3
    domain: 4DT
    primaryScope: Flight

  # ... remaining chapters follow the same pattern
```

---

### 3.3 New file — `users.yaml`

Maintained by integrators. A server restart is required to pick up changes.

**Schema:**

```yaml
users:
  - email: john.doe@eurocontrol.int
    role: DOMAIN_WRITER
    domains: [4DT, AIRSPACE]

  - email: jane.smith@eurocontrol.int
    role: ICDM
    domains: []

  - email: admin@eurocontrol.int
    role: INTEGRATOR
    domains: []
```

**Field rules:**

| Field | Type | Notes |
|---|---|---|
| `email` | string | Lowercase; primary key; must be unique |
| `role` | `DOMAIN_WRITER` \| `ICDM` \| `INTEGRATOR` | Canonical `UserRole` enum value |
| `domains` | string[] | Domain keys from `domains.yaml`; meaningful for `DOMAIN_WRITER` only; empty for `ICDM` and `INTEGRATOR` |

**Passive users** (external reviewers, read-only) are not declared in `users.yaml`. Anonymous access to Explore and Home requires no identification; there is no passive-user account concept in the interim scheme.

---

### 3.4 New file — `permissions.yaml`

Maintained by the developer. Integrators do not touch this file.

The matrix is expressed as an ordered list of `method × path-pattern → roles` entries. Every route requiring role enforcement must have an entry. Routes not in the matrix are open to anonymous access (e.g. Explore, Home). Routes that require identification but no role restriction (any active user) carry all three roles explicitly.

Path patterns use `:param` syntax (Express-compatible); matching is exact-segment, left-to-right. A custom lightweight matcher in `config.js` handles resolution — no additional library needed beyond what Express already provides transitively.

**Schema and representative entries (full list is an implementation artefact):**

```yaml
permissions:

  # ── O* and chapter/narrative writes — all active roles ──────────────────
  - { method: GET,    path: /operational-requirements,            roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: GET,    path: /operational-requirements/:id,        roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /operational-requirements,            roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: PUT,    path: /operational-requirements/:id,        roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /operational-requirements/:id/delete, roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /operational-requirements/:id/restore,roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }

  - { method: GET,    path: /operational-changes,                 roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: GET,    path: /operational-changes/:id,             roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /operational-changes,                 roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: PUT,    path: /operational-changes/:id,             roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /operational-changes/:id/delete,      roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /operational-changes/:id/restore,     roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }

  - { method: POST,   path: /chapters,                            roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: PUT,    path: /chapters/:id,                        roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }

  # ── Change sets — all active roles ──────────────────────────────────────
  - { method: GET,    path: /change-sets,                         roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /change-sets,                         roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: PUT,    path: /change-sets/:id,                     roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /change-sets/:id/close,               roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }
  - { method: POST,   path: /change-sets/:id/reopen,              roles: [DOMAIN_WRITER, ICDM, INTEGRATOR] }

  # ── Wave assignment — iCDM and integrator ───────────────────────────────
  - { method: PUT,    path: /operational-changes/:id,             roles: [ICDM, INTEGRATOR] }
    # note: wave assignment rides on the standard OC PUT; domain scoping
  # at P1 will distinguish the two write paths if needed

  # ── Setup entities — integrator only ────────────────────────────────────
  - { method: POST,   path: /waves,                               roles: [INTEGRATOR] }
  - { method: PUT,    path: /waves/:id,                           roles: [INTEGRATOR] }
  - { method: DELETE, path: /waves/:id,                           roles: [INTEGRATOR] }
  - { method: POST,   path: /stakeholder-categories,              roles: [INTEGRATOR] }
  - { method: PUT,    path: /stakeholder-categories/:id,          roles: [INTEGRATOR] }
  - { method: DELETE, path: /stakeholder-categories/:id,          roles: [INTEGRATOR] }

  # ── Edition lifecycle — integrator only ─────────────────────────────────
  - { method: POST,   path: /baselines,                           roles: [INTEGRATOR] }
  - { method: POST,   path: /odip-editions,                       roles: [INTEGRATOR] }
  - { method: POST,   path: /odip-editions/:id/publish,           roles: [INTEGRATOR] }
  - { method: DELETE, path: /odip-editions/:id,                   roles: [INTEGRATOR] }

  # ── Destructive operations — integrator only ────────────────────────────
  - { method: DELETE, path: /operational-requirements/:id,        roles: [INTEGRATOR] }
  - { method: DELETE, path: /operational-changes/:id,             roles: [INTEGRATOR] }
  - { method: POST,   path: /operational-requirements/:id/release,roles: [INTEGRATOR] }
  - { method: POST,   path: /operational-requirements/:id/decommission, roles: [INTEGRATOR] }
```

**Path matching algorithm** (implemented in `config.js` as `matchesPath(pattern, requestPath)`):

1. Split pattern and request path by `/`
2. Reject if segment counts differ
3. For each segment pair: literal segment must match exactly; `:param` segment matches any non-empty string
4. Return true only if all segments match

No dependency on `path-to-regexp` — the custom matcher is 10 lines and covers all patterns in this file.

---

### 3.5 `config.js` additions

New structure definitions and helpers added to `@odp/shared` alongside existing `DomainsConfig` and `EditionConfig`:

```javascript
// Structure definitions
export const UserEntry = {
    email: '',          // lowercase email — primary key
    role: '',           // UserRole enum value
    domains: []         // string[] — domain keys; meaningful for DOMAIN_WRITER only
};

export const UsersConfig = { users: [] };  // UserEntry[]

export const PermissionEntry = {
    method: '',         // HTTP verb — GET POST PUT DELETE
    path: '',           // Express-style path pattern
    roles: []           // string[] — UserRole keys permitted
};

export const PermissionsConfig = { permissions: [] };  // PermissionEntry[]

// Helpers

/**
 * Resolve a user by email. Returns null if not found.
 * @param {UsersConfig} config
 * @param {string} email
 * @returns {UserEntry|null}
 */
export function resolveUserByEmail(config, email) { ... }

/**
 * Whether the given role is permitted for the given method + path.
 * Returns false if no matching entry exists (deny by default for unmatched routes).
 * @param {PermissionsConfig} config
 * @param {string} method
 * @param {string} path
 * @param {string} role
 * @returns {boolean}
 */
export function isPermitted(config, method, path, role) { ... }

/**
 * Path segment matcher — :param wildcards match any non-empty segment.
 * @param {string} pattern
 * @param {string} requestPath
 * @returns {boolean}
 */
export function matchesPath(pattern, requestPath) { ... }
```

### 3.6 `loader.js` additions

`loadConfig()` extended with two new file loads following the existing pattern exactly:

```javascript
import yaml from 'js-yaml';

export function loadConfig(configDir) {
    // existing — format change only
    _domainsConfig  = _validateDomainsConfig(yaml.load(fs.readFileSync(join(configDir, 'domains.yaml'),  'utf8')));
    _editionConfig  = _validateEditionConfig(yaml.load(fs.readFileSync(join(configDir, 'edition.yaml'),  'utf8')));

    // new
    _usersConfig      = _validateUsersConfig(yaml.load(fs.readFileSync(join(configDir, 'users.yaml'),      'utf8')));
    _permissionsConfig = _validatePermissionsConfig(yaml.load(fs.readFileSync(join(configDir, 'permissions.yaml'), 'utf8')));
}

// New accessors
export function resolveUser(email)             { return _resolveUserByEmail(_requireUsersConfig(), email); }
export function isPermitted(method, path, role){ return _isPermitted(_requirePermissionsConfig(), method, path, role); }
```

---

## 4. Server and client changes

### 4.1 Server enforcement middleware

A single `resolveUser()` middleware inserted early in the Express pipeline. **This is the SSO seam** — the only function replaced when platform SSO arrives.

**Flow:**

```
Request arrives
  → read x-user-id header (the email the client declares)
  → if absent: attach req.user = null (anonymous)
  → if present: resolveUser(email)
      → not found: 401 { error: { code: 'UNKNOWN_USER' } }
      → found: attach req.user = { email, role, domains }
  → continue to route handlers
```

**Route-level enforcement:** a `requirePermission()` guard is applied per route, reading `req.user` and calling `isPermitted()` from the config layer:

```
requirePermission(method, path)
  → req.user is null: 401
  → isPermitted(method, path, req.user.role) is false: 403 { error: { code: 'FORBIDDEN' } }
  → pass
```

**Audit continuity:** `req.user.email` threads into transactions as `userId`. The `AuditEvent.userId` field is already a scalar string — no schema change. Existing audit events from pre-RBA sessions carry legacy display names and remain valid history.

### 4.2 `/auth/identify` endpoint

A lightweight POST route, no auth middleware applied. The only client-facing surface of `users.yaml`.

- **Request:** `POST /auth/identify` with body `{ email }`
- **Response 200:** `{ email, role, domains }`
- **Response 401:** `{ error: { code: 'UNKNOWN_USER' } }`

### 4.3 Client — Connect dialog and role display

**Connect dialog** replaces the current name + role selector:

- Email address input only — no display name field, no role selector
- On submit: `POST /auth/identify`; on success: store `{ email, role, domains }` in `localStorage`, call `app.setUser()`; on failure: inline error "Email address not recognised"
- `x-user-id` header sends the email on every subsequent request
- `x-user-role` header is **dropped** — role is now server-derived, never client-declared

**Role and domain visibility** (header user button):
- Identified state shows: `email — role label` (e.g. `john.doe@eurocontrol.int — Domain Writer`)
- Tooltip on hover shows domain scope for `DOMAIN_WRITER`: `Write access: 4DT, AIRSPACE`; empty tooltip for `ICDM` and `INTEGRATOR` (cross-domain)

`Header.restoreUser()` silent migration of legacy lowercase role values (already built) covers existing `localStorage` sessions from the self-declaration era.

### 4.4 Admin config reload endpoint

A server restart is the default mechanism for picking up config changes. `domains.yaml` and `edition.yaml` are structural config — they require a restart and are **not** dynamically reloadable. `users.yaml` and `permissions.yaml` carry operational access data and support live reload without downtime.

**Endpoint:** `POST /admin/config/reload?configs=<list>` — INTEGRATOR only

- `configs` — comma-separated subset of `users`, `permissions` (required; `domains` and `edition` are rejected with 400)
- Reloads only the specified configs atomically; others remain unchanged
- Returns `200 { reloaded: ['users', 'permissions'] }` on success
- Returns `500 { error: { code: 'CONFIG_RELOAD_FAILED', config: 'users', message } }` if validation fails — **previous config remains active**
- Entry in `permissions.yaml`: `{ method: POST, path: /admin/config/reload, roles: [INTEGRATOR] }`

**`odip-admin` integration:** a new `config-reload` command wraps the endpoint, consistent with the existing `standby` / `resume` pattern:

```
odip-admin config-reload [--users] [--permissions]
```

- Default (no flags): reloads both `users` and `permissions`
- Builds the `configs=` query string from the flags provided
- Calls `curl -sf -X POST "${SERVER_URL}/admin/config/reload?configs=<list>"`
- Logs success or prints the validation error message on failure

**`odip-admin` implementation notes (for the implementation session):**

- `deploy_config_files()` — update to copy four YAML files: `domains.yaml`, `edition.yaml`, `users.yaml`, `permissions.yaml`; remove `domains.json` and `edition.json` references
- `list_works_dirs()` — update to read `edition.yaml` instead of `edition.json`; replace `JSON.parse` with `require('${ODIP_REPO}/node_modules/js-yaml').load` (available post `npm install`); update comment accordingly
- Add `config-reload` to `usage()`, `cmd_config_reload()` function, and dispatch `case`

---

## 5. Deferred and out of scope

### 5.1 Per-domain write scoping (APP-RBA-03 — P1/M4)

At P0, the matrix grants write actions to `DOMAIN_WRITER` without domain validation. At P1, `requirePermission()` is extended with an optional `targetDomain` parameter; the guard checks `req.user.domains.includes(targetDomain)` for domain-scoped routes. The `domains` array in `users.yaml` is already in place — no config change at P1, only guard logic.

### 5.2 P1 configurable matrix — recommend dropping

APP-RBA-02 (P1/M4) calls for the matrix to become configurable in the Manage UI. Given the transitory constraint, this investment is not recommended — `permissions.yaml` is version-controlled, human-readable, and trivially auditable. The recommendation is to formally defer this to post-SSO when external RBAC is confirmed.

### 5.3 Reviewer commenting (APP-RBA-01 — P2)

No passive-user account concept in the interim scheme. Commenting remains on the iCDM SharePoint CRD channel until P2.

### 5.4 Platform SSO (APP-RBA-04 — P2)

Replaces `resolveUser()` middleware entirely. The rest of the stack — `permissions.yaml`, domain-scope enforcement, audit threading — is unchanged. Domain assignments in `users.yaml` migrate to the identity store or a thin ODIP-managed overlay at that point.

---

## 6. Resolved decisions

| # | Point | Resolution |
|---|---|---|
| 1 | Permission granularity (e.g. `ASSIGN_WAVE` vs `PUT /operational-changes/:id`) | Operational concern — exact `permissions.yaml` content defined by integrators/iCDM; not a solution design matter |
| 2 | P1 configurable matrix | Dropped — transitory constraint makes the investment unjustified |
| 3 | `MANAGE_SETUP` role grants | Operational concern — exact grants defined in `permissions.yaml` by integrators/iCDM |
| 4 | Config reload without restart | Admin reload endpoint added — `POST /admin/config/reload` (§4.4) |