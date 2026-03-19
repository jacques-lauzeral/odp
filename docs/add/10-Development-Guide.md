# Chapter 10 – Development Guide

## 1. Philosophy

Three principles govern all implementation decisions:

- **Fail fast** — validate at the earliest possible point, throw immediately on invalid state, never silently swallow errors
- **Layer separation** — store, service, route, CLI, and web client are strict layers; no layer reaches across to another's concerns
- **Complete regeneration over patching** — when in doubt, regenerate an entire file rather than applying partial updates that risk inconsistency

---

## 2. Workspace Layout

```
odip-proto/
├── bin/
│   ├── odip-admin          Pod lifecycle, backup / restore
│   ├── odip-backup         Automated periodic backup
│   └── odip-cli            CLI launcher
├── workspace/
│   ├── shared/             @odp/shared — enums, models, utilities
│   ├── server/             Express API, services, stores
│   ├── cli/                Commander.js CLI
│   └── web-client/         Vanilla JS SPA
├── Dockerfile.web-client
├── odip-deployment.yaml
└── package.json            npm workspace root (type: "module")
```

The workspace root uses npm workspaces with ES modules throughout (`"type": "module"`). All cross-workspace imports use the `@odp/shared` package name — never relative paths across workspace boundaries.

---

## 3. Shared Package (`@odp/shared`)

The shared package is the single source of truth for enums, entity models, request structures, and utility functions used across all layers.

### Enum Pattern

Every enum follows this consistent structure:

```javascript
export const DraftingGroup = { '4DT': '4DT', 'IDL': 'iDL', /* ... */ };
export const DraftingGroupKeys   = Object.keys(DraftingGroup);
export const DraftingGroupValues = Object.values(DraftingGroup);
export const isDraftingGroupValid    = (v) => DraftingGroupKeys.includes(v);
export const getDraftingGroupDisplay = (k) => DraftingGroup[k] || k;
```

Enums defined in `@odp/shared`: `DraftingGroup`, `ORType`, `ODIPEditionType`, `Visibility`, `MilestoneEvent`, `MaturityLevel`, `BandwidthScope`.

### Model Pattern

```javascript
export const StakeholderCategory = { id: '', name: '', description: '' };

export const StakeholderCategoryRequests = {
    create: { ...StakeholderCategory, id: undefined, parentId: null },
    update: { ...StakeholderCategory, parentId: null },
    query:  { parentId: null }
};
```

All enum validation, ID normalisation (`normalizeId`), and lazy comparison utilities (`lazyEquals`, `idsEqual`) are imported from `@odp/shared` — never reimplemented in other layers.

---

## 4. Adding a New Entity — Layer Sequence

Work strictly in this order. Approve each layer before starting the next.

### Step 1 — Shared model
Add entity model and request structures to `shared/src/`. Export from `shared/src/index.js`.

### Step 2 — Store
Extend the appropriate base store:

| Entity type | Base store |
|---|---|
| Hierarchical setup (tree) | `RefinableEntityStore` |
| Flat setup (list) | `BaseStore` |
| Versioned operational | `VersionedItemStore` |
| Management / snapshot | `BaseStore` |

Register the new store instance in the store factory (`initializeStores()`).

### Step 3 — Service
Extend the appropriate base service:

| Entity type | Base service |
|---|---|
| Hierarchical setup | `TreeItemService` |
| Flat setup | `SimpleItemService` |
| Versioned operational | `VersionedItemService` |
| Management | standalone |

Validation of foreign-key references must use a **separate `'system'` transaction** before the main write transaction — never mix validation reads with write transactions.

### Step 4 — Route
Use `SimpleItemRouter` for setup entities or `VersionedItemRouter` for operational entities. Register in `server/src/index.js`. Update the relevant OpenAPI module file.

### Step 5 — CLI
Add a new command file in `cli/src/commands/`. Register in `cli/src/index.js`.

### Step 6 — Web client
Choose the appropriate component pattern (see Chapter 08), add entity to the relevant activity, update setup data loading if the entity is referenced in forms.

---

## 5. Naming Conventions

| Scope | Convention | Example |
|---|---|---|
| Classes | PascalCase | `OperationalRequirementStore` |
| Files (server) | kebab-case | `operational-requirement.js` |
| Files (web client lists) | plural kebab-case | `requirements.js` |
| Files (web client forms) | singular kebab-case | `requirement-form.js` |
| Fields | camelCase | `parentId`, `expectedVersionId` |
| Neo4j labels | PascalCase singular | `OperationalRequirement` |
| Neo4j relationships | UPPER_SNAKE_CASE | `REFINES`, `IMPLEMENTS`, `DECOMMISSIONS`, `DEPENDS_ON`, `IMPACTS_STAKEHOLDER`, `IMPACTS_DOMAIN` |
| API endpoints | plural kebab-case | `/operational-requirements` |

---

## 6. Transaction Rules

- Every store method that reads or writes takes an explicit `transaction` parameter — no method opens its own transaction
- Transactions are opened and committed/rolled back exclusively in the service layer
- Read-only validation queries use a separate `'system'` transaction; write operations use a `'write'` transaction
- Multiple independent validations within a single service operation may use `Promise.all` for parallelism

---

## 7. Error Handling

- Throw `StoreError` for data access failures
- Services propagate errors upward without wrapping (no double-wrapping)
- Route layer maps error types to HTTP status codes: `null` → 404, validation error → 400, optimistic lock conflict → 409, immutable entity mutation → 405, unexpected → 500
- CLI prints errors to stderr and exits non-zero; never swallows errors silently

---

## 8. OpenAPI Maintenance

The API specification is split across modular files:

| File | Coverage |
|---|---|
| `openapi-base.yml` | Shared schemas and security components |
| `openapi-setup.yml` | Setup entity endpoints |
| `openapi-operational.yml` | OR / OC endpoints |
| `openapi-operational-milestones.yml` | Milestone sub-resource |
| `openapi-baseline.yml` | Baseline endpoints |
| `openapi-odp.yml` | ODIP Edition endpoints |
| `openapi-import.yml` | Import pipeline endpoints |
| `openapi-docx.yml` | Docx export endpoints |
| `openapi-publication.yml` | Publication / Antora endpoints |

`openapi.yml` at project root is the aggregating entry point that `$ref`-includes all module files. Update the relevant module file whenever a route changes; the root file does not need editing for path additions.

---

## 9. Development Workflow

```bash
# Start environment
odip-admin start

# Start with npm install + web client rebuild (first time or after dependency changes)
odip-admin start --install --rebuild

# Watch logs
odip-admin logs -f

# Quick API smoke test
curl -H "x-user-id: dev" http://localhost:8080/ping

# Run CLI against running server
odip-cli stakeholder list

# Neo4j query console
# Open http://localhost:7474  (neo4j / password123)
```

Live reload via `nodemon` is active on the server container — saving a file in `workspace/server/src/` restarts the server automatically. The web client dev server watches for changes within the running container image; source file changes on the host require rebuilding the web client image via `odip-admin restart --rebuild`.

---

## 10. Git Conventions

- One commit per logical layer change when adding a new entity (shared → store → service → route → CLI → web client)
- Commit messages: `<layer>: <entity> — <what changed>`  e.g. `store: OperationalChange — add findByDrg filter`
- No committed secrets; `config.json` files with credentials are gitignored

---

[← 09 Deployment](09-Deployment.md)