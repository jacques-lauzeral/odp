# Improvement Note — Payload Projections for Requirements and Changes

## Status
Pending implementation. Phase 1 (server-side) is fully designed. Phase 2 (web client redesign) to be discussed separately.

## Motivation

Currently `GET /operational-requirements` and `GET /operational-changes` return the full standard payload for every matching entity on every query. This is wasteful for list/filter use cases where only summary fields are needed, and insufficient for detail use cases where derived (reverse-traversal) attributes are useful.

---

## Phase 1 — Server-Side Preparation

Phase 1 is transparent to the CLI and Web Client. Default behaviour is preserved.

### 1.1 Three Projection Levels

| Projection | Description | Excludes |
|---|---|---|
| `summary` | Fields sufficient for list views, grids, and filter operations | Rich text fields; derived attributes |
| `standard` | Full entity payload as currently returned | Derived attributes only |
| `extended` | Standard payload enriched with derived (reverse-traversal) attributes | — |

**Rich text fields** (excluded from `summary`): `statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `initialState`.

**Derived attributes** (only in `extended`):
- `OperationalRequirement` (ON): `implementedBy` — list of ORs whose `implementedONs` references this ON
- `OperationalRequirement` (OR): `implementedBy` — list of OCs whose `implementedORs` references this OR
- `OperationalChange`: none currently defined

### 1.2 Data Model

One data structure per entity type (`OperationalRequirement`, `OperationalChange`). Each field is annotated with its projection membership:

- `summary` — field present in all three projections
- `standard` — field present in `standard` and `extended` only
- `extended` — field present in `extended` only (derived attributes)

Chapter 01 (Data Model) to be updated with a `Projection` annotation column on all field tables.

### 1.3 Storage Layer

`OperationalRequirementStore` and `OperationalChangeStore` gain a `projection` parameter on `findAll` and `findById`:

- `findAll(tx, options)` — `options.projection` accepts `'summary'` | `'standard'` (default: `'standard'`)
- `findById(itemId, tx, options)` — `options.projection` accepts `'standard'` | `'extended'` (default: `'standard'`)

The store applies the projection mechanically — fetching only the relationships and properties required for the requested level, as defined by the data model annotations. The store does not interpret business meaning of projections.

`extended` projection on `findById` performs the additional reverse-traversal queries needed to resolve derived attributes.

### 1.4 Service Layer

The service layer passes `projection` through to the store transparently. No additional validation logic is required for projection handling.

Exception: internal service operations that require full field access (e.g. type-checking `implementedONs` on create/update) always use `standard` projection regardless of the caller's requested projection.

### 1.5 REST API / OpenAPI

**List endpoints** (`GET /operational-requirements`, `GET /operational-changes`):
- New query parameter: `projection` — values: `summary` | `standard`
- Default: `standard` (backward compatible — existing clients unaffected)

**Single-item endpoints** (`GET /operational-requirements/{id}`, `GET /operational-changes/{id}`):
- New query parameter: `projection` — values: `standard` | `extended`
- Default: `standard` (backward compatible)

`projection=extended` is **not** available on list endpoints.

OpenAPI spec to define:
- `OperationalRequirementSummary` response schema (list endpoint with `projection=summary`)
- `OperationalRequirement` response schema (current — list default and single-item `standard`)
- `OperationalRequirementExtended` response schema (single-item `projection=extended`)
- Same three schemas for `OperationalChange`

### 1.6 Export Consideration

The `summary` and `standard` projections on list endpoints are designed with future JSON export/dump use cases in mind. A bulk export can request `projection=standard` to get complete entity payloads without derived attributes, or `projection=summary` for index-style exports.

---

## Phase 2 — Web Client Redesign

### 2.1 Principles

- Filter/query → summaries only; selection → full payload
- Single shared cache per session, accessible by all activities
- Cache is a write-through mirror of server responses — server is always the source of truth
- Views never fetch data directly — they receive result-set IDs from the activity and pull from cache
- Reference manager options are built from cache summaries — no dedicated option fetch

### 2.2 EntityCache Singleton

A single `EntityCache` instance, shared across all activities.

**Responsibilities:**
- Store summaries and full payloads keyed by `(entityType, itemId)`
- On upsert: compare incoming `version` against cached entry — update only if more recent
- Emit `'itemUpdated'` event for `(entityType, itemId)` when a cached entry is replaced
- Emit `'itemRemoved'` event for `(entityType, itemId)` when an entry is invalidated
- Expose `getAll(entityType)` for reference manager option population

**Interface:**
```javascript
EntityCache
  upsertMany(type, items[])          // bulk upsert summaries from query response
  upsertOne(type, item)              // upsert single full/extended payload
  get(type, itemId)                  // pull single item
  getMany(type, itemIds[])           // pull ordered result-set
  getAll(type)                       // pull all cached items of a type (for option lists)
  invalidate(type, itemId)           // remove entry, emit 'itemRemoved'
  on(type, itemId, event, callback)  // subscribe to itemUpdated / itemRemoved
  off(type, itemId, event, callback) // unsubscribe
```

### 2.3 Data Flows

#### Query flow (activity mount, filter change)

1. Activity issues `GET .../requirements?projection=summary` (or changes) via `apiClient`
2. Cache upserts returned summaries (version-checked); returns result-set IDs to activity
3. Activity stores result-set IDs on its instance
4. Activity passes result-set IDs to all active views (collection, tree, temporal)
5. Each view pulls item data from cache by ID to render

On activity activation, the initial query has no filters — populating the full summary cache for reference manager use. Subsequent filter changes refine the result-set IDs without invalidating the broader cache.

#### Retrieve flow (item selection)

1. View notifies activity of selected `itemId`
2. Activity issues `GET .../{id}?projection=extended` via `apiClient`
3. Cache upserts retrieved payload (version-checked); if updated, emits `'itemUpdated'`
4. Activity delivers retrieved payload directly to the details form — no subscription needed for initial render
5. Active list views subscribed to `'itemUpdated'` for this item update their row if `itemId` is in current result-set

#### Write flow (update)

1. Form submits via `apiClient`
2. Server returns updated payload
3. Cache upserts (version-checked); if updated, emits `'itemUpdated'`
4. Form receives returned payload directly — re-renders
5. List views update their row via `'itemUpdated'` subscription

#### Write flow (create)

1. Form submits via `apiClient`
2. Server returns new item payload
3. Cache upserts new item
4. Activity re-issues query to refresh result-set (new item may or may not match current filters)

#### Write flow (delete)

1. Activity issues delete via `apiClient`
2. On success: cache invalidates entry; emits `'itemRemoved'`
3. Activity removes `itemId` from result-set; notifies views
4. Details panel clears

### 2.4 Cache Invalidation

The cache is session-scoped — no TTL. Entries are invalidated by:

- **404 on retrieve** — entry removed, `'itemRemoved'` emitted
- **Validation error referencing a deleted entity** — referenced entry removed, `'itemRemoved'` emitted
- **Explicit delete** — as per delete flow above

Activity re-query on activation handles broader staleness from concurrent edits by other clients.

### 2.5 Reference Manager Options

Reference managers are populated from `cache.getAll(entityType)` — no dedicated API call. Since each activity issues a full (unfiltered) summary query on activation, the cache contains all entities of the relevant type by the time any form opens.

If a referenced entity was deleted by another client and its cache entry has been invalidated, the reference chip renders with a missing-label fallback. The server will reject any save that references the deleted entity with a validation error, which triggers cache invalidation and surfaces the error to the user.

### 2.6 Impact on Existing Components

| Component | Change |
|---|---|
| `PlanningActivity.loadSetupData` | Drop `GET /operational-requirements` preload |
| `ONPlanning.loadData` | Replace with query flow (`projection=summary`) |
| `RequirementForm._computeImplementedByIds` | Remove — `implementedBy` comes from server (`extended` projection) |
| `RequirementForm.getImplementedByOptions` | Remove — options from cache |
| `requirements.js` / `changes.js` option fetchers | Replace with cache-based option builders |
| `abstract-interaction-activity.js` | Adopt query flow; own result-set IDs |
| All `updateDetailsPanel` callers | Adopt retrieve flow |