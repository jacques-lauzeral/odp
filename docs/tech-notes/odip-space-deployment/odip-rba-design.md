# ODIP — Roles and Access (RBA) — Design Note

*v0.3 — 19 June 2026 — web-client design settled (P1/P2); server/CLI/admin layers implemented*

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

### 4.3 Client — web client RBA

The web-client work splits into two priorities. **Priority 1** is a self-contained, shippable unit: it makes the client correct and secure (email identity, role-derived display, the one coarse Manage gate, and graceful 403 handling) with no permission machinery. **Priority 2** is additive — preemptive control enablement driven by a server-provided grant set — and does not rework anything in Priority 1.

The implementation order within P1 is: `error-handler.js` (smallest) → `api-client.js` → `header.js` → `app.js` → `router.js`, syntax-checking each.

#### Priority 1 — identity rework + 403 handling

**Connect dialog** replaces the current name + role selector:
- Email address input only — no display-name field, no role selector.
- **No client-side email validation** — there is no half-measure worth doing; the server is the sole authority. The input collects a string and submits it.
- On submit: `POST /auth/identify` (this call goes *through* `apiClient`). On `200`: store `{ email, role, domains }` in `localStorage` and call `app.setUser()`. On `401`: show an **inline** dialog error "Email address not recognised".
- **Carve-out:** the `/auth/identify` call's `401` is handled *locally in the dialog* (inline message), NOT routed to the global error toast. Every other call keeps centralized error handling.

**Headers** (`api-client.js getHeaders()`):
- `x-user-id` now sends the **email** (was `this.app.user.name`).
- `x-user-role` is **dropped** — role is server-derived, never client-declared.

**`localStorage` and restore** (decision: keep localStorage; no migration):
- localStorage is kept as a convenience cache (key `odip-space-user`), **not** a trust store — the server re-validates `x-user-id` against `users.yaml` on every request, so tampering gains nothing.
- `Header.restoreUser()` is rewritten: on load, if stored state has an `email` (new shape), **re-validate** it via `POST /auth/identify` — restore on `200`, show Connect on `401` (so a user removed from the whitelist is bounced at next load, not just next write).
- Legacy `{ name, role }` state (no `email`) is **discarded outright** — the existing legacy lowercase-role migration is removed. There is no email to migrate to, and the model changed from self-declared to server-validated.

**Role and domain display** (header user button):
- Identified state shows `email — role label`. Labels are a hardcoded client map: `DOMAIN_WRITER → "Domain Writer"`, `ICDM → "iCDM"`, `INTEGRATOR → "Integrator"`.
- Tooltip: for `DOMAIN_WRITER`, `Domains: <domains>` (e.g. `Domains: 4DT, RRT`); **empty (no tooltip)** for `ICDM` and `INTEGRATOR`.
- Disconnected state shows the "Connect" button (existing pattern).
- (Domain keys vs. labels in the tooltip resolves against whatever the client already has loaded — labels if the domain list is already client-side, keys otherwise.)

**403 handling** (the safety net, needed regardless of P2):
- `api-client.js request()` is the single fetch chokepoint; it already builds `error.status`/`error.code` and throws. Route `403` through the existing `errorHandler`.
- `error-handler.js handleApiError()` gets an explicit `403` case — title "Not Permitted", `retry: false` (today 403 falls into the `default` "Services Error" arm with `retry: true`, which is wrong for a permission denial).

**Manage gate** (coarse role check — lives in P1, needs no grant set):
- Manage is for **INTEGRATOR and iCDM** only; DOMAIN_WRITER excluded. This is a single role comparison, the same coarse tier as anonymous-vs-identified — *not* matrix mirroring.
- **Tab:** `header.js _buildNavItems()` gains one filter clause — the Manage tab renders only when `role === INTEGRATOR || role === ICDM`.
- **Route:** `router.js` is extended so `/manage` requires INTEGRATOR/ICDM (option b — chosen so the route and the tab tell the same story; a DOMAIN_WRITER deep-linking `/manage` redirects to `/`). The route table currently carries only a `protected` boolean; add an optional allowed-roles dimension checked in `_handleRoute` alongside `protected`.
- Note: the tab/route gate is a courtesy. The server still gates each underlying write by its own `permissions.yaml` entry, so an iCDM user inside Manage will still get `403` on integrator-only actions — covered by the 403 toast.

#### Priority 2 — preemptive control enablement

Goal: controls a role cannot use are **disabled or not rendered**, rather than clickable-then-403. Built on a server-provided grant set, with no permission matrix on the client.

**Principle (settled through discussion):** every UI action ultimately fires API calls whose `method`+`path` are known. An action is bound to a **set** of request-type patterns; the action is **enabled iff *all* its request patterns are authorised** (single-call actions are the all-of-one case). The client does **not** receive or evaluate the matrix — it receives the *verdicts*.

**Server "checked access" API** (new endpoint): returns, for the authenticated caller, the set of **permitted request-type patterns** `{ method, path-pattern }` (the `:param` forms, e.g. `PUT /operational-changes/:id`), computed server-side via the same `isPermitted` used for enforcement. The matrix never crosses the wire.

**Client consumption (designed to avoid scattered/complex coding):**
- **Action registry** — a single module mapping `actionId → [request-type patterns]`. The action↔request binding lives here, in one place, not on the controls.
- **`app.can(actionId)`** — fetches/caches the grant set at identify time; `can(actionId)` returns `true` iff *every* pattern the action declares is present in the cached grant set. Because actions declare **patterns** (not concrete paths) and the server returns **patterns**, enablement is a pure set-membership lookup — **no path matching on the client**.
- **Controls declare one `actionId`** (a single attribute, not a permission rule) and a render-time wrapper applies `disabled`/hidden from `can(actionId)`. Tabs are config-driven, so a tab entry can carry an optional `actionId` the tab-strip honours.
- **Coverage is incremental:** only controls you choose to tag are gated; untagged controls stay enabled and fall through to the P1 403 toast (which fails closed at the server). Seed coverage with the high-value integrator-only controls; extend as needed.
- `app.js` is the home for the grant-set cache and `can()` (it already owns `user` and the `apiClient` singleton wiring).

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
- `list_works_dirs()` — update to read `edition.yaml` instead of `edition.json`. **Must stay dependency-free:** this runs during `install` *before* `npm install`, so `js-yaml` is not yet available. Use a `node -e` line scan (built-in `fs` only) extracting the `domain:` lines from the machine-generated `edition.yaml` — verified to produce the same slugs as the server's `getDomainChapterSlugs()`. (Do **not** use `require('js-yaml')` here — that was the original sketch but fails on a fresh pre-install tree.)
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
| 5 | Client-side email validation | None — no half-measure is worth it; server is sole authority (§4.3 P1) |
| 6 | localStorage: keep, and legacy migration | Keep as convenience cache (server re-validates every request); **no migration** — re-validate stored email via `/auth/identify`, discard legacy `{name,role}` (§4.3 P1) |
| 7 | Role labels / domain tooltip | Hardcoded labels (`Domain Writer` / `iCDM` / `Integrator`); tooltip `Domains: <domains>` for DOMAIN_WRITER, **empty** for iCDM/INTEGRATOR (§4.3 P1) |
| 8 | Manage visibility | INTEGRATOR + iCDM only; DOMAIN_WRITER excluded. Coarse role check on both tab and route (option b) — not matrix mirroring (§4.3 P1) |
| 9 | Preemptive control: how | Server exposes **permitted request-type patterns** (not the matrix); client binds `actionId → [patterns]` in a single registry; `can(actionId)` = all patterns present in cached grant set; pure set lookup, no client-side path matching (§4.3 P2) |
| 10 | Preemptive control: enablement rule | An action is enabled iff **all** its request-type patterns are authorised (§4.3 P2) |
| 11 | Build priority | P1 (identity + 403 + Manage gate) is shippable standalone; P2 (grant-set preemptive control) is additive and reworks nothing in P1 (§4.3) |
| 12 | `/auth/identify` 401 surfacing | Handled **inline** in the Connect dialog, bypassing the global error toast; all other calls keep centralized handling (§4.3 P1) |

### Implementation status (as of this revision)

Built and documented in the corresponding ADD chapters: §3 config files, §3.5/§3.6 `config.js`/`loader.js` additions, §4.1 server middleware + route enforcement (ch04), §4.2 `/auth/identify` and §4.4 `/admin/config/reload` (ch04), CLI changes (ch07), `odip-admin` changes (ch09). **Remaining: §4.3 web client (P1 then P2)** — to be implemented in a fresh session using this note.