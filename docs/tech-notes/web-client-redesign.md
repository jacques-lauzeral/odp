# Technical Note — Web Client Redesign

## Status

Phase 1 complete. Phases 2–4 not started.

---

## 1. Motivation

The current web client has two structural weaknesses that become more visible as the user base grows and the data volume increases.

**Performance.** Every list query returns full entity payloads including rich text fields, regardless of whether the caller needs them. For list views, grids, and filter operations, only summary fields are needed. For detail views, derived (reverse-traversal) attributes are additionally useful but are currently computed client-side from the full in-memory dataset.

**Navigation continuity.** Activities restart from scratch on every tab switch. There is no mechanism to return to a previous activity state after navigating away. Cross-entity navigation (e.g. following a reference from an OR detail pane to the referenced ON) is not supported.

---

## 2. Target Design

### 2.1 Payload Projections (Server-Side)

Three projection levels are defined for `OperationalRequirement` and `OperationalChange`.

| Projection | Available on | Description |
|---|---|---|
| `summary` | list endpoints | Fields sufficient for list views, grids, and filter operations. Excludes rich text fields and derived attributes. |
| `standard` | list and single-item endpoints | Full entity payload as currently returned. Excludes derived attributes only. Default — backward compatible. |
| `extended` | single-item endpoints only | Standard payload enriched with derived (reverse-traversal) attributes. |

**Rich text fields** excluded from `summary` — OperationalRequirement: `statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `additionalDocumentation`. OperationalChange: `purpose`, `initialState`, `finalState`, `details`, `privateNotes`, `additionalDocumentation`.

**Derived attributes** available only in `extended`:

| Entity type | Attribute | Description |
|---|---|---|
| `OperationalRequirement` (ON) | `implementedByORs` | ORs whose `implementedONs` references this ON |
| `OperationalRequirement` (OR) | `implementedByOCs` | OCs whose `implementedORs` references this OR |
| `OperationalRequirement` (OR) | `decommissionedByOCs` | OCs whose `decommissionedORs` references this OR |
| `OperationalRequirement` (both) | `refinedBy` | Requirements whose `refinesParents` references this requirement |
| `OperationalRequirement` (OR) | `requiredByORs` | ORs whose `dependencies` references this OR |
| `OperationalChange` | `requiredByOCs` | OCs whose `dependencies` references this OC |

#### Shared model

Field set definitions and projection-to-field-set mappings are owned by `shared/src/model/projections.js`. Three field sets are defined per entity type: `summary`, `rich-text`, `derived`. Three functions are exported:

- `getProjectionFieldSets(projectionName)` → ordered field set names for a projection
- `getFieldSetFields(entityType, fieldSetName)` → field names in a field set
- `getProjectionFields(entityType, projectionName)` → flat merged field list (convenience)

The store layer calls `getProjectionFields` to determine exactly which fields and relationships to fetch. The projection name is never interpreted by the store itself.

#### Storage layer

`OperationalRequirementStore` and `OperationalChangeStore` gain a `projection` parameter as the fifth positional argument on `findAll` and `findById`:

- `findAll(tx, baselineId?, fromWaveId?, filters?, projection?)` — `projection`: `'summary'` | `'standard'` (default: `'standard'`); `'extended'` throws
- `findById(itemId, tx, baselineId?, fromWaveId?, projection?)` — `projection`: `'standard'` | `'extended'` (default: `'standard'`); `'summary'` throws

`buildFindAllQuery` receives the resolved field list and gates each OPTIONAL MATCH and RETURN column on field membership. `_buildRelationshipReferences` on `OperationalChangeStore` accepts an optional `fields` parameter and fetches only the relationships present in the list.

Internal service operations (validation, type-checking) always call the store without a `projection` argument, defaulting to `'standard'`.

#### REST API

**List endpoints** (`GET /operational-requirements`, `GET /operational-changes`):
- New query parameter: `projection` — values: `summary` | `standard`
- Default: `standard` (backward compatible)
- `extended` is not available on list endpoints; returns 400

**Single-item endpoints** (`GET /operational-requirements/{id}`, `GET /operational-changes/{id}`):
- New query parameter: `projection` — values: `standard` | `extended`
- Default: `standard` (backward compatible)
- `summary` is not available on single-item endpoints; returns 400

`projection` extraction and validation is handled by `VersionedItemRouter.getProjection(req, allowed)`.

OpenAPI schemas: `OperationalRequirement` and `OperationalChange` schemas in `openapi-base.yml` are annotated with projection-level comments per field. Separate `Summary` and `Extended` named schemas were not introduced — the single annotated schema serves all three projections.

#### CLI

`requirement list` and `change list` support `--projection summary|standard` (default: `standard`). `requirement show` and `change show` support `--projection standard|extended` (default: `standard`). List tables always render all rich-text columns, showing `—` when the field is absent. Show output renders `(not in projection)` for absent fields and always prints the derived fields section, showing `None` or `(not in projection)` as appropriate.

---

### 2.2 EntityCache and Data Flow Redesign (Web Client)

#### Principles

- Filter/query operations fetch summaries only; item selection fetches the full (`extended`) payload
- A single shared cache per session is accessible by all activities
- The cache is a write-through mirror of server responses — the server is always the source of truth
- Views never fetch data directly — they receive result-set IDs from the activity and pull from cache
- Reference manager options are built from cache summaries — no dedicated option fetch

#### EntityCache Singleton

A single `EntityCache` instance shared across all activities.

**Responsibilities:**
- Store summaries and full payloads keyed by `(entityType, itemId)`
- On upsert: compare incoming `version` against cached entry — update only if more recent
- Emit `itemUpdated` event for `(entityType, itemId)` when a cached entry is replaced
- Emit `itemRemoved` event for `(entityType, itemId)` when an entry is invalidated

**Interface:**

```javascript
EntityCache
  upsertMany(type, items[])           // bulk upsert summaries from query response
  upsertOne(type, item)               // upsert single full/extended payload
  get(type, itemId)                   // pull single item
  getMany(type, itemIds[])            // pull ordered result-set
  getAll(type)                        // pull all cached items of a type (for option lists)
  invalidate(type, itemId)            // remove entry, emit itemRemoved
  on(type, itemId, event, callback)   // subscribe to itemUpdated / itemRemoved
  off(type, itemId, event, callback)  // unsubscribe
```

#### Data Flows

**Query flow** (activity mount, filter change):

1. Activity issues `GET .../requirements?projection=summary` via `apiClient`
2. Cache upserts returned summaries (version-checked); returns result-set IDs to activity
3. Activity stores result-set IDs on its instance
4. Activity passes result-set IDs to all active views (collection, tree, temporal)
5. Each view pulls item data from cache by ID to render

On activity activation, the initial query has no filters — populating the full summary cache for reference manager use. Subsequent filter changes refine the result-set IDs without invalidating the broader cache.

**Retrieve flow** (item selection):

1. View notifies activity of selected `itemId`
2. Activity issues `GET .../{id}?projection=extended` via `apiClient`
3. Cache upserts retrieved payload (version-checked); if updated, emits `itemUpdated`
4. Activity delivers retrieved payload directly to the details form
5. Active list views subscribed to `itemUpdated` for this item update their row if `itemId` is in current result-set

**Write flow — update:**

1. Form submits via `apiClient`
2. Server returns updated payload
3. Cache upserts (version-checked); if updated, emits `itemUpdated`
4. Form receives returned payload directly and re-renders
5. List views update their row via `itemUpdated` subscription

**Write flow — create:**

1. Form submits via `apiClient`
2. Server returns new item payload
3. Cache upserts new item
4. Activity re-issues query to refresh result-set (new item may or may not match current filters)

**Write flow — delete:**

1. Activity issues delete via `apiClient`
2. On success: cache invalidates entry; emits `itemRemoved`
3. Activity removes `itemId` from result-set; notifies views
4. Details panel clears

#### Cache Invalidation

The cache is session-scoped — no TTL. Entries are invalidated by:

- **404 on retrieve** — entry removed, `itemRemoved` emitted
- **Validation error referencing a deleted entity** — referenced entry removed, `itemRemoved` emitted
- **Explicit delete** — as per delete flow above

Activity re-query on activation handles broader staleness from concurrent edits by other clients.

#### Reference Manager Options

Reference managers are populated from `cache.getAll(entityType)` — no dedicated API call. Since each activity issues a full unfiltered summary query on activation, the cache contains all entities of the relevant type by the time any form opens.

If a referenced entity was deleted by another client and its cache entry has been invalidated, the reference chip renders with a missing-label fallback. The server will reject any save referencing the deleted entity with a validation error, triggering cache invalidation and surfacing the error to the user.

#### Impact on Existing Components

| Component | Change |
|---|---|
| `PlanningActivity.loadSetupData` | Drop `GET /operational-requirements` preload |
| `ONPlanning.loadData` | Replace with query flow (`projection=summary`) |
| `RequirementForm._computeImplementedByIds` | Remove — `implementedBy` comes from server (`extended` projection) |
| `RequirementForm.getImplementedByOptions` | Remove — options from cache |
| `requirements.js` / `changes.js` option fetchers | Replace with cache-based option builders |
| `abstract-interaction-activity.js` | Adopt query flow; own result-set IDs |
| All `updateDetailsPanel` callers | Adopt retrieve flow |

---

### 2.3 Activity State Preservation

#### Motivation

Activities currently restart from scratch on every tab switch. Before navigating away from an activity (e.g. to Browse), its state must be saved so it can be restored on return — whether via tab click or browser back.

#### ActivityStateStore

A module-level in-memory map keyed by activity name. Each activity owns its state model and implements `saveState()` / `restoreState(state)`. The navigation layer calls `saveState()` on the departing activity before switching, and `restoreState(state)` on the arriving activity after it initialises.

#### Elaboration State Model

```javascript
{
  activeTab,          // 'requirements' | 'changes'
  perspective,        // 'collection' | 'tree' | 'temporal'
  filters,            // active filter chips (FilterBar state)
  selectedItemId,     // selected entity id in active perspective
  detailsTabIndex     // active tab index in details form
}
```

Other activities (Planning, Prioritisation, Review) define their own minimal state models as needed.

#### Scope

State preservation is introduced alongside the Browse activity (Phase 4). Earlier phases do not require it.

---

### 2.4 Browse Activity

#### Purpose

A dedicated activity for read-only cross-entity navigation. The user follows reference links from any entity to any related entity, traversing the graph freely. Browse is a persistent top-level tab, visible at all times alongside the existing activity tabs.

#### Entry Points

**Explicit entry** (clicking the Browse tab directly): displays a typeahead search input (same pattern as `ReferenceManager`) allowing the user to search by title across ONs, ORs, and OCs. On selection, the matched entity is loaded as the Browse root.

**Contextual entry** (clicking a reference link in a details pane): the source activity saves its state to `ActivityStateStore`, then navigates to Browse with the target entity pre-loaded. No search prompt is shown.

Reference links are rendered as clickable elements in `reference-list` and `annotated-reference-list` read-only fields. Clicking a link triggers contextual Browse entry.

#### Navigation Within Browse

Each entity is rendered read-only using the existing `CollectionEntityForm` read mode. All `reference-list` and `annotated-reference-list` fields render as navigable links, enabling multi-hop traversal. Each hop pushes a `history.pushState` entry, making browser back and forward functional within Browse.

Browse does not support edit or create operations.

#### Return to Source Activity

On closing Browse (via tab click or browser back reaching the source activity route), the source activity reads its saved state from `ActivityStateStore` and restores it — reapplying filters, reselecting the previously selected entity, and restoring the active perspective and details tab.

#### Browser History Scope

`pushState` is used exclusively within Browse for hop navigation. Full browser history integration across all activities (tab switches, filter changes, entity selection) is deferred — it would require retrofitting history management across the entire application and is out of scope for this redesign.

#### File Structure

```
activities/browse/
├── browse.js        BrowseActivity: entry point resolution, entity load, hop navigation
└── browse.css       Browse-specific layout overrides
```

---

## 3. Migration Plan

### Phase 1 — Server-Side Projections ✓ Complete

**Scope:** Shared model, storage layer, service layer, REST API, OpenAPI schemas, CLI.

**Dependencies:** None. Fully self-contained and transparent to the web client.

**Deliverables:**
- `shared/src/model/projections.js` — field set definitions (`summary`, `rich-text`, `derived`) per entity type; `getProjectionFieldSets`, `getFieldSetFields`, `getProjectionFields` functions
- `shared/src/model/odp-elements.js` — `OperationalRequirement` and `OperationalChange` models annotated with projection level per field; derived fields added
- `projection` positional parameter (5th) on `findAll` and `findById` in `OperationalRequirementStore` and `OperationalChangeStore`
- `buildFindAllQuery` field-list-driven OPTIONAL MATCH and RETURN gating
- `_buildRelationshipReferences` on `OperationalChangeStore` gated by field list
- `getAll` and `getById` on `VersionedItemService` pass `projection` through to store
- `projection` query parameter on list and single-item endpoints via `VersionedItemRouter.getProjection`
- `openapi-base.yml` — `OperationalRequirement` and `OperationalChange` schemas annotated with projection-level comments per field; derived fields added
- `openapi-operational.yml` — `projection` parameter on all four GET endpoints
- CLI — `--projection` on `requirement list`, `requirement show`, `change list`, `change show`
- ADD chapters 01, 02, 03, 04, 07 updated to reflect projection parameter

---

### Phase 2 — EntityCache and Data Flow Redesign

**Dependencies:** Phase 1 (requires `summary` and `extended` projection endpoints).

**Scope:** New `EntityCache` module; refactor of all activity data loading and details panel update flows.

**Deliverables:**
- `shared/entity-cache.js` — `EntityCache` singleton
- `abstract-interaction-activity.js` refactored to adopt query flow and result-set IDs
- `requirements.js`, `changes.js` option fetchers replaced with cache-based builders
- `PlanningActivity`, `ONPlanning` refactored to adopt query and retrieve flows
- `RequirementForm._computeImplementedByIds` and `getImplementedByOptions` removed
- ADD chapter 08 updated: new §EntityCache, data flow diagrams, impact table

---

### Phase 3 — Activity State Preservation

**Dependencies:** Phase 2 (state model aligns cleanly with result-set IDs introduced in Phase 2).

**Scope:** `ActivityStateStore` module; `saveState` / `restoreState` on Elaboration and Planning activities; navigation layer wiring.

**Deliverables:**
- `shared/activity-state-store.js` — module-level in-memory map
- `saveState()` / `restoreState(state)` implemented on `ElaborationActivity` and `PlanningActivity`
- Navigation layer (`app.js` or `header.js`) updated to call save/restore on tab switch
- ADD chapter 08 updated: new §Activity State Preservation, state model per activity

---

### Phase 4 — Browse Activity

**Dependencies:** Phase 2 (warm cache, `extended` projection for hop navigation); Phase 3 (source activity state must be saveable before Browse departure).

**Scope:** New `BrowseActivity`; reference link rendering in details pane read mode; `pushState` for Browse hops.

**Deliverables:**
- `activities/browse/browse.js` and `browse.css`
- Reference links rendered in `reference-list` / `annotated-reference-list` read-only fields
- Contextual entry from details pane (source activity saves state, navigates to Browse)
- Explicit entry via typeahead search on Browse tab
- `pushState` / `popstate` wired for Browse hop navigation
- `app.js` and `header.js` updated: new Browse route and nav tab
- ADD chapter 08 updated: new §Browse Activity
-