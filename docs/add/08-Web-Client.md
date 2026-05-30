# Chapter 08 – Web Client

## 1. Overview

The ODIP web client is a Vanilla JavaScript single-page application (no framework). It communicates exclusively with the REST API and shares data models with the server via the `@odp/shared` workspace package. **Vite** is used as the build tool and development server. The deliberate absence of a UI framework keeps the application flexible while still enforcing consistent component patterns through class-based composition and delegation.

The client has been rewritten as **ODIP Space** — a structured multi-workspace SPA replacing the flat seven-activity layout of the former ODIP Tool. The migration is incremental; this chapter describes the target architecture as implemented from Phase A onward.

---

## 2. Application Structure

```
web-client/src/
├── index.html
├── index.js
├── app.js
│
├── assets/
│   └── odip-space-logo.svg             Static assets processed by Vite (imported in JS)
├── activities/
│   ├── home/
│   │   └── home.js                         Dataset context selection gateway
│   │
│   ├── workspace/
│   │   ├── elaborate/
│   │   │   └── elaborate.js                Workspace shell — live dataset + R/W — owns level-2 tab strip
│   │   ├── explore/
│   │   │   └── explore.js                  Workspace shell — edition context + R/O — owns level-2 tab strip
│   │   ├── setup/
│   │   │   ├── setup.js
│   │   │   ├── stakeholder-categories.js
│   │   │   ├── reference-documents.js
│   │   │   ├── waves.js
│   │   │   └── bandwidth.js
│   │   └── shared/
│   │       ├── os/
│   │       │   ├── os.js                   O* workspace orchestrator
│   │       │   ├── o-star-entity.js        Unified ON/OR/OC list — Collection + Tree perspectives
│   │       │   ├── requirement-details.js  ON/OR read-only detail view
│   │       │   ├── change-details.js       OC read-only detail view
│   │       │   ├── requirement-form.js     ON/OR create/edit form
│   │       │   ├── requirement-form-fields.js
│   │       │   ├── change-form.js          OC create/edit form
│   │       │   ├── change-form-fields.js
│   │       │   └── change-form-milestone.js
│   │       ├── plan/
│   │       │   ├── plan.js                 Plan workspace shell
│   │       │   ├── planning.js             ON planning view
│   │       │   ├── on-planning.js          ON plan + Gantt
│   │       │   ├── prioritisation.js       OC wave assignment
│   │       │   └── prioritisation-grid.js
│   │       ├── quality/
│   │       │   └── quality.js              Placeholder
│   │       └── notes/
│   │           └── notes.js                Placeholder
│   │
│   ├── converse/
│   │   └── converse.js                     Converse activity — placeholder
│   │
│   └── manage/
│       ├── manage.js                       Manage shell — owns level-2 tab strip
│       └── editions/
│           ├── editions.js
│           └── odp-edition-form.js
│
├── components/
│   ├── header.js                           Global header — two-row layout, breadcrumb trail, connect popup
│   ├── breadcrumb.js                       Breadcrumb trail utility (moved from activities/workspace/shared/os/)
│   ├── master-detail.js                    Reusable two-column resizable layout
│   ├── collection-entity.js
│   ├── collection-entity-form.js           Base form class with tab rendering
│   ├── rich-text-component.js              TipTap-backed rich text editor/viewer component
│   ├── tree-table-entity.js
│   ├── temporal-grid.js
│   ├── filter-bar.js
│   ├── reference-list-manager.js
│   ├── reference-manager.js
│   ├── annotated-multiselect-manager.js
│   ├── diff-popup.js
│   └── odp-column-types.js
│
└── shared/
    ├── router.js
    ├── api-client.js
    ├── error-handler.js
    ├── utils.js
    └── src/                                @odp/shared copy (build artefact)
```

`vite.config.js` lives at `web-client/vite.config.js` (workspace root for the web client package).

---

## 3. Navigation Model

### 3.1 Top-Level Activities

| Title | Path | Protected | Purpose |
|---|---|---|---|
| Home | `/` | No | Dataset context selection: live dataset or a specific edition |
| Elaborate | `/elaborate` | Yes | Authoring workspace — live dataset, R/W |
| Explore | `/explore` | No | Consultation workspace — selected edition, R/O |
| Converse | `/converse` | No | Collaborative threading — placeholder |
| Manage | `/manage` | Yes | Edition lifecycle and administration — integrators only |

### 3.2 Router

`shared/router.js` owns the route table, prefix matching, `navigate()`, and `popstate` handling. It calls back into `App` via `onNavigate(activityKey, subPath[])` on each route resolution. Protected routes (`/elaborate`, `/manage`) redirect to `/` when no user is set.

Route table:

```js
{ prefix: '/elaborate', activityKey: 'elaborate', protected: true  }
{ prefix: '/explore',   activityKey: 'explore',   protected: false }
{ prefix: '/manage',    activityKey: 'manage',    protected: true  }
{ prefix: '/converse',  activityKey: 'converse',  protected: false }
{ prefix: '/',          activityKey: 'home',      protected: false }
```

`Router.activeSegment()` returns the bare first path segment (e.g. `'elaborate'`). Header calls `app.activeSegment()` to derive the active nav tab without coupling to the route table.

### 3.3 Workspace Shell Routing

`ElaborateActivity`, `ExploreActivity`, and `ManageActivity` are workspace shells that own a persistent level-2 tab strip and delegate sub-path routing to shared sub-activities. The tab strip renders once on mount and persists across sub-activity transitions; only the sub-container content is swapped.

**Elaborate and Explore tab strip** (identical):

| Tab | Sub-path segment | Sub-activity |
|---|---|---|
| O*s | `os` (default) | `OsActivity` |
| Plan | `plan` | `PlanActivity` |
| Quality | `quality` | `QualityActivity` (placeholder) |
| Notes | `notes` | `NotesActivity` (placeholder) |
| Setup | `setup` | `SetupActivity` |

**Manage tab strip:**

| Tab | Sub-path segment | Sub-activity |
|---|---|---|
| Editions | `editions` (default) | `EditionsActivity` |

Context difference (live vs edition, R/W vs R/O) flows transparently through `app.getDatasetContext()` — sub-activities do not need to know which shell they are mounted in.

### 3.4 O* Sub-Path Routing

`OsActivity` handles a unified ON/OR/OC list. Sub-path routing:

| SubPath | Rendering |
|---|---|
| `[]` | List view — unified ON/OR/OC result set |
| `['on', '{id}']` | `RequirementDetails` (ON) — full-page mode |
| `['or', '{id}']` | `RequirementDetails` (OR) — full-page mode |
| `['oc', '{id}']` | `ChangeDetails` (OC) — full-page mode |

Panel selection (clicking a row in the master list) does **not** update the browser URL. The URL stays at `/elaborate/os` (or `/explore/os`) throughout list browsing. Full-page detail mode is reached only via inter-O\* reference navigation from the detail panel — the canonical URL `/{base}/os/{type}/{id}` is then pushed to browser history.

Bare `/elaborate` and `/explore` paths redirect to `/elaborate/os` and `/explore/os` respectively via `replaceState`.

### 3.5 Browser History

Every inter-O\* navigation pushes a URL history entry via `window.history.pushState`. Panel row selection does not affect browser history. Tab switches between workspace sub-activities (O\*s, Plan, Notes, Setup) push history entries via the router. All canonical O\* URLs are deep-linkable and reconstructable from the URL alone.

---

## 4. App and Dataset Context

`App` (`app.js`) is the singleton application class. It owns:

- Activity lifecycle (`_loadActivity`, lazy instantiation, cleanup)
- Router instantiation and delegation
- User state (`setUser` / `getUser`) — persisted to localStorage by Header
- Dataset context (`setDatasetContext` / `getDatasetContext`) — set by Home on selection
- Setup data cache (`getSetupData` / `invalidateSetupData`) — lazy-loaded, shared across all activities
- Connection monitoring (polls `GET /ping` every 60 seconds; dispatches `connection:change` on `window`)

**Dataset context shape:**

```js
{ type: 'live' }                        // Elaborate context
{ type: 'edition', editionId: number }  // Explore context
```

**Setup data shape** (loaded once, cached):

```js
{ stakeholderCategories, referenceDocuments, waves }
```

`invalidateSetupData()` must be called after any setup entity CRUD operation.

---

## 5. Header and User Identification

`Header` (`components/header.js`) owns a two-row layout:

- **Row 1** — logo (spans both rows) · brand · nav tabs · right cluster (Connect/username button · server status dot)
- **Row 2** — breadcrumb trail

**Nav tabs** (row 1):

| Tab | Visibility |
|---|---|
| Home | Always |
| Elaborate | Only when dataset context is `live` |
| Explore | Only when dataset context is `edition` |
| Converse | Always |
| Manage | Always (access enforced by router — protected route) |

**Breadcrumb trail** (row 2):

Activities set the breadcrumb via `app.header.setBreadcrumb(crumbs)` where crumbs start at sub-level — Home and the workspace root are omitted since the active nav tab already conveys that context. Empty array clears the trail (used on Home).

```js
// Crumb shape
{ label: string, path?: string }  // no path = current page, non-clickable
```

`Header.setBreadcrumb()` is the public API called by activities. `buildBreadcrumb()` and `attachBreadcrumbListeners()` from `components/breadcrumb.js` handle the rendering.

**User identification:**

Anonymous → "Connect" button → popup dialog (name + role selector, persisted to localStorage).
Identified → username display → same popup (update / disconnect).

`Header.restoreUser()` is called once by `App.initialize()` after initial render — not inside `render()` — to avoid a re-render loop triggered by `app.setUser()` calling `header.onUserChange()`.

**Server status:**

Small dot (green / amber / red), extreme right of row 1, always visible. Driven by `connection:change` custom event dispatched by `App` connection monitoring.

User identification is entirely client-side. Anonymous users can access Home, Explore, and Converse. `/elaborate` and `/manage` require an identified user — the router redirects to `/` if no user is set.

---

## 6. Component Patterns

Four base component classes cover all entity management needs.

### 6.1 TreeEntity

Used for hierarchical setup entities (`StakeholderCategory`, `ReferenceDocument`). Located in `activities/workspace/setup/tree-entity.js`. Manages real parent–child relationships stored in the database as `REFINES` edges — `parentId` is never stored as a node property. Three-pane layout: tree navigation / item details / action buttons. Supports expand/collapse, parent reassignment, and context-sensitive actions (Add Child, Delete restricted to leaves).

Concrete subclasses declare only three things — no methods required:

| Declaration | Purpose |
|---|---|
| `entityLabel` | Singular display name (e.g. `'Domain'`) |
| `parentScope` | `'all'` — any non-self item as parent; `'roots'` — root items only (grandchildren blocked at UI level) |
| `fields` | Array of `{ name, label, type, required }` for entity-specific fields, appended after `baseFields` |

`TreeEntity` declares `baseFields = [{ name: 'description', label: 'Description', type: 'textarea', required: false }]` — rendered before subclass `fields` in all forms and detail views.

The parent field uses `ReferenceManager` (inline single-select typeahead, `components/odp/reference-manager.js`) instead of a native `<select>`. The manager is wired after modal DOM insertion via `_initParentRM(modal)` and destroyed on `closeModal`.

`ReferenceDocument` additionally overrides `getDisplayName()` to append the version. Its `parentScope` is `'all'`, supporting up to three levels (root / child / grandchild).

### 6.2 ListEntity

Used for flat setup entities (`Wave`, `Bandwidth`). Located in `activities/workspace/setup/list-entity.js`. Single-pane table with sortable columns, inline filtering, and direct CRUD operations.

### 6.3 CollectionEntity

Used for operational entities in table/list perspective. Provides filtering, grouping, column configuration, row selection, and a details panel. Complex entities (requirements, changes) use **delegation** — the entity class owns a `CollectionEntity` instance and passes callbacks for filter config, column config, grouping config, and event handlers. This keeps entity-specific logic out of the base component.

### 6.4 TreeTableEntity

Used for tree-table perspectives on ORs/OCs and for the ON tree in the Plan activity. Builds tree structure from a flat entity list using a configurable `pathBuilder` function. The path builder returns a typed path array that drives both tree structure and per-node rendering via `typeRenderers`.

The `pathBuilder` may produce **virtual hierarchy** (e.g. `drg-folder → on-node` derived from entity attributes) or **graph-based hierarchy** (e.g. `parent-on-node → child-on-node` derived from real `refines` relationships). Both modes are supported without component modification.

**Build algorithm invariants:**

- Each path item carries an `id` used as the node key. Intermediate nodes must carry `entityId` so the build algorithm can attach the entity to the node for cell rendering.
- When a node already exists as a leaf but is later traversed as an intermediate node, it is demoted: `isLeaf = false`, `expandable = true`.
- Column renderers receive `context` in the `item` argument position (3rd arg). Affected renderers normalise with `context = context ?? item` at the top.

Filter matchers are injected as `options.filterMatchers`, enabling consistent filter behaviour across all perspectives sharing a `TreeTableEntity`.

### 6.5 CollectionEntityForm

Abstract base class for entity forms. Concrete forms (`RequirementForm`, `ChangeForm`) extend it and implement: `getFieldDefinitions()`, `onSave()`, `onValidate()`, and optionally `transformDataForSave()` / `transformDataForEdit()`. The base class handles modal lifecycle, field rendering, validation orchestration, and error display.

**Field visibility (`visibleWhen`)** is evaluated in all modes including read. Section-level visibility is determined solely by whether any field in that section is included by `modes` — `visibleWhen` is not evaluated at section level.

**Computed reference fields** (`type: 'reference-list'` with `computeKey`) derive their value at initialisation time by calling a named method on the form instance. `initializeReferenceListManagers` calls `field.compute(this.currentItem)` when present.

**Context resolvers** — forms receive resolver functions in their `context`:

| Resolver | Returns | Used by |
|---|---|---|
| `getSetupData()` | Setup data object | `getSetupDataOptions`, `getReferenceDocumentOptions` |
| `getRequirements()` | Full live requirements array | `_computeImplementedByIds`, `_computeRefinedByIds`, `getAllRequirementOptions` |
| `onNavigate(ref)` | — | Enables navigable reference chips in read mode |

**`onNavigate` option** — when provided at construction, `CollectionEntityForm` passes `onItemClick` to `ReferenceListManager` and `ReferenceManager` in read mode, enabling reference chips to navigate on click. Entity type is derived from `field.formatArgs[0]` and mapped to URL segment (`'requirement'` or `'change'`).

Key methods used by detail views:

| Method | Purpose |
|---|---|
| `generateReadOnlyView(item)` | Returns tabbed HTML for read-only display |
| `initializeReadOnlyInPanel(container, item)` | Initialises rich text components and reference managers after HTML injection |
| `showEditModal(item)` | Opens edit popup |
| `showCreateModal()` | Opens create popup |

---

## 7. Multi-Perspective Pattern

Requirements and changes support multiple simultaneous perspectives (collection table, tree-table, temporal timeline) that share a single data load and common state. Key principles:

- **Single data load**: entities fetched once, distributed to all active perspectives via `onDataUpdated(data)` callback
- **Shared state**: filters, selection, and grouping coordinated across perspectives in `sharedState`
- **Perspective switching**: tab-driven by entity component, preserves selection and filter state
- **Injected callbacks**: `onItemSelect`, `getViewControlsEl`, `isReadOnly` — no back-references to parent activity

**Cross-perspective selection sync** (O\* workspace): when switching between Collection and Tree perspectives with an item selected, `OStarEntity._switchPerspective` synchronises state:

- **Collection → Tree**: `_expandToItem(itemId)` expands all ancestor nodes to make the selected item visible; the tree re-renders, marks the row selected, and `tree.scrollToItem(itemId)` centres it in the viewport.
- **Tree → Collection**: the collection re-renders with the selected row marked, then `scrollIntoView` brings it into view.

**Tree scroll preservation**: `TreeTableEntity.renderContent()` saves and restores `scrollTop` on `.tree-table-container` around every `innerHTML` replacement — ensuring expand/collapse and row selection do not scroll the tree back to the top.

---

## 8. TemporalGrid Component

`TemporalGrid` (`components/odp/temporal-grid.js`) is a single generic component for all temporal visualisations. It renders a horizontal grid with a continuous **calendar-based time axis** and a structured row hierarchy. All domain knowledge lives in the caller.

### 8.1 Data Model

```javascript
// TimelineMilestone
{
    label:       string,        // short display label
        description: string,        // tooltip / detail text
    eventTypes:  string[],      // one or more event type keys
    date:        Date           // calendar position
}
```

### 8.2 Row Taxonomy

Four row kinds are supported, rendered in insertion order:

| Kind | Description |
|---|---|
| `separator` | Full-width label spanning both label and axis columns. No timeline track, no selection. Used as a visual section header (e.g. DrG name). |
| `group` | Label column + timeline track + expand/collapse toggle (`▶/▼`). Collapsing hides all child rows. Expand state preserved across re-renders. |
| `child` | Indented label column + timeline track. Visibility controlled by parent group's expanded state. |
| `timeline` | Flat label column + timeline track. No hierarchy — used by `ChangesEntity`. |

### 8.3 Public API

#### Time axis

```javascript
setTimeInterval(startYear, endYear)   // set visible interval; fires timeIntervalListeners
setTicks(ticks)                       // ticks: [{ label: string, date: Date }]
getTimeInterval()                     // → { startYear, endYear }
addTimeIntervalUpdateListener(fn)     // fn(startYear, endYear)
```

#### Milestone rendering

```javascript
setMilestoneRendering(spec)
```

One call per instance before adding rows. Two modes:

**Icon mode** — one marker per milestone, styled by event type:

```javascript
{ mode: 'icon', eventTypes: { 'period-start': { icon: '▶', colour: '#2563eb' }, ... } }
```

**Pixmap mode** — a `rows × cols` pixel grid per milestone:

```javascript
{
    mode: 'pixmap', rows: 1, cols: 3,
        eventTypes: {
        'API_PUBLICATION':    { row: 0, col: 0, colour: '#3b82f6' },
        'UI_TEST_DEPLOYMENT': { row: 0, col: 1, colour: '#8b5cf6' },
        'OPS_DEPLOYMENT':     { row: 0, col: 2, colour: '#10b981' }
    }
}
```

#### Row management

```javascript
addGroupRow(id, label, milestones)          // header/separator rows: addGroupRow(id, label, [])
addChildRow(id, parentId, label, milestones)
addRow(id, label, milestones)               // flat row — used by ChangesEntity
updateRow(id, milestones)
removeRow(id)
clearRows()
```

All row-management calls trigger a full re-render. Rows are rendered in insertion order.

#### Selection

```javascript
addSelectionListener(fn)              // fn(id) — fires on every click, always
setTimeLineSelected(id, boolean)      // programmatic selection; does NOT fire listeners
getSelectedTimeLine()                 // → id | null
```

#### Lifecycle

```javascript
render(container)
cleanup()
```

### 8.4 Connector Lines

When a row has two or more milestones visible within the current time interval, the component draws horizontal connector lines between adjacent milestones (sorted by date).

### 8.5 Zoom Control

`TemporalGrid` renders a zoom control bar above the grid accepting `YYYY` or `YYYY-ZZZZ` format. Delegates parsing to `parseYearPeriod()` from `shared/year-period.js`. Absolute bounds (`minYear`, `maxYear`) are injected as constructor options (default `2025`–`2045`).

---

## 9. Temporal Perspective (Changes)

`ChangesEntity` is the only entity with a third perspective beyond collection and tree-table: the **temporal view**, implemented by `TemporalGrid` using flat `timeline` rows.

### 9.1 Time Interval and Ticks

`ChangesEntity.calculateOptimalTimeWindow()` computes the default interval from `setupData.waves` (earliest to latest future wave). It calls `temporalGrid.setTimeInterval(startYear, endYear)` and `temporalGrid.setTicks(waveTicks)` where `waveTicks` is derived from `setupData.waves` using `implementationDate` as the wave date.

Changes with no milestones within the current time interval are excluded before `addRow` calls. `_feedTemporalGrid()` performs this pre-filter and calls `clearRows()` then re-adds all visible changes.

### 9.2 Milestone Rendering

```javascript
temporalGrid.setMilestoneRendering({
    mode: 'pixmap', rows: 1, cols: 3,
    eventTypes: {
        'API_PUBLICATION':     { row: 0, col: 0, colour: '#3b82f6' },
        'API_TEST_DEPLOYMENT': { row: 0, col: 0, colour: '#3b82f6' },
        'API_DECOMMISSIONING': { row: 0, col: 0, colour: '#3b82f6' },
        'UI_TEST_DEPLOYMENT':  { row: 0, col: 1, colour: '#8b5cf6' },
        'OPS_DEPLOYMENT':      { row: 0, col: 2, colour: '#10b981' }
    }
})
```

### 9.3 Selection and State Sharing

`ChangesEntity` registers a selection listener on construction. Selection state is stored in `sharedState.selectedItem` and restored when switching back to the temporal perspective via `temporalGrid.setTimeLineSelected(itemId, true)`.

---

## 10. O* Workspace

### 10.1 Architecture

`OsActivity` (`os.js`) is the orchestrator. `OStarEntity` (`o-star-entity.js`) owns the unified ON/OR/OC list component.

Responsibilities:

| Concern | Owner |
|---|---|
| SubPath routing (list vs detail) | `OsActivity` |
| Shell layout (toolbar, view controls, MasterDetail) | `OsActivity` |
| Search box (debounced text input) | `OsActivity` |
| Filter bar instantiation and wiring | `OsActivity` |
| Data fetching via `listOStars` | `OsActivity` |
| OC type normalisation (`type = 'OC'`) | `OsActivity` |
| Count summary (ONs · ORs · OCs) | `OsActivity` |
| Breadcrumb trail | `OsActivity` |
| Two-column layout + resizable divider | `MasterDetail` component |
| List rendering — Collection + Tree perspectives | `OStarEntity` |
| Perspective toggle, grouping selector, create buttons | `OStarEntity` |
| Virtual `implements` field pre-computation | `OStarEntity` |
| Detail panel content | `RequirementDetails` / `ChangeDetails` |

**Full-page mode navigation pattern:** when inter-O\* reference navigation triggers a full-page detail render, `OsActivity` sets `_inPageMode = true` and renders the detail view into `this.container`, replacing the list shell. When the user navigates back (breadcrumb "O\*s" click or O\*s tab click), `ElaborateActivity._route` calls `os.handleSubPath([])`, which detects `_inPageMode` and calls `_renderList()` to rebuild the full list shell. `_prepareOStarEntity()` reconnects `_ostarEntity.container` to the new `masterDetail.listContainer` after each rebuild.

### 10.2 OStarEntity

`OStarEntity` receives injected callbacks at construction:

```js
{
    onItemSelect(item),             // called on row click
        getViewControlsEl(),            // returns HTMLElement for view controls mount
        isReadOnly,                     // boolean; true in Explore/edition context
        onViewControlsRendered(),       // called after renderViewControls() — used to refresh count summary
}
```

Lifecycle hooks called by `OsActivity`:
- `onActivated()` — mounts view controls, renders from cache
- `onDeactivated()` — clears view controls
- `onDataUpdated(data)` — pre-computes virtual fields, caches data, re-renders if active

**Virtual field pre-computation** in `onDataUpdated()`:
- `item.implements` = `item.implementedONs` (OR) or `item.implementedORs` (OC), whichever is non-empty

### 10.3 Detail Views

`RequirementDetails` and `ChangeDetails` own the detail shell and delegate body rendering to the form class via `generateReadOnlyView(item)` + `initializeReadOnlyInPanel(container, item)`.

Two rendering modes:

| Mode | Context | Back button |
|---|---|---|
| `'panel'` | MasterDetail right column | None |
| `'page'` | Full page (inter-O\* navigation) | None (breadcrumb provides navigation) |

Detail views call `app.header.setBreadcrumb(crumbs)` after render — crumbs follow the pattern `O*s (clickable) > {code — title} (current, non-clickable)`.

### 10.4 Navigable References

Inter-O\* references in read-only detail views are rendered as navigable links:

1. `RequirementDetails` / `ChangeDetails` pass `onNavigate(ref)` to the form at construction
2. `CollectionEntityForm` stores `onNavigate` and passes `onItemClick` to `ReferenceListManager` / `ReferenceManager` in read mode
3. Managers render `selected-chip--link` spans; `stopPropagation` prevents panel deselection
4. `onItemClick` fires; `_navigateToRef` maps `ref.entityType` to a canonical URL segment (`on`, `or`, `oc`) and navigates
5. `annotated-ref-link` anchors (`strategicDocuments`) navigate to the document URL directly

Entity type mapping in `_navigateToRef` is defensive — accepts both legacy values (`requirement`, `change`) and canonical values (`ON`, `OR`, `OC`, `on`, `or`, `oc`).

**Link style:** navigable reference chips use `--link-color` (`--ec-blue`) with `font-weight: semibold` and no underline. The shared `.odip-link` utility class in `main.css` defines the canonical link style; `selected-chip--link` and `annotated-ref-link` in `reference-list-manager.css` and `form-components.css` reference the same tokens.

### 10.5 Breadcrumb

`breadcrumb.js` (`components/breadcrumb.js`) provides `buildBreadcrumb(crumbs)` and `attachBreadcrumbListeners(container, app)`.

All activities call `app.header.setBreadcrumb(crumbs)`. Crumbs start at sub-level — Home and workspace root are omitted since the active nav tab already conveys that context:

```
O*s > OR-AIRSPACE-0033 — AIS reference baseline management
```

`O*s` is clickable and navigates to `/{base}/os`. The O* code and title is non-clickable (current page).

### 10.6 API Client — listOStars

`apiClient.listOStars(params)` is the unified O* query method. See §10 of the API Client documentation (ADD chapter 04) for full parameter mapping. Key behaviour:

- Fans out to `/operational-requirements` + `/operational-changes` in parallel
- Skip optimisation: OC-only type filter skips requirements call; non-OC type filter skips changes call
- Returns merged array in fetch order (requirements first, then changes) — no client-side sorting

---

## 11. MasterDetail Component

`MasterDetail` (`components/master-detail.js`) is a reusable two-column resizable layout used by `OsActivity`. Will be reused by Plan, Setup, and Manage sub-activities.

Public API:

```js
md.render()                  // Mount into container
md.listContainer             // HTMLElement — mount list content here
md.detailContainer           // HTMLElement — mount detail content here
md.setDetail(html)           // Replace right column content
md.clearDetail()             // Restore placeholder
md.cleanup()                 // Unbind resize listeners
```

---

## 12. Rich Text

Rich text fields (`statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `purpose`, `initialState`, `finalState`, `details`) use the **TipTap** editor. Content is stored and transmitted as TipTap document JSON serialised to a string. The web client renders content in read mode and edits it with a toolbar in write mode using `RichTextComponent`.

### 12.1 Storage Format

TipTap JSON document format:

```json
{ "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "..." } ] } ] }
```

This is the canonical format at rest (Neo4j), in transit (REST API), and in the browser. The `DistributedEditionImporter` converts Quill Delta source files to TipTap JSON at import time via `_deltaToTipTap()`.

### 12.2 RichTextComponent

`RichTextComponent` (`components/rich-text-component.js`) encapsulates all TipTap instantiation, configuration, and lifecycle. It is the single point of rich text usage across all forms and detail views.

**Constructor options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `readOnly` | boolean | `false` | Read-only viewer (no toolbar, non-editable) |
| `headings` | boolean | `false` | Enable H1/H2/H3 toolbar buttons (narrative context only) |
| `images` | boolean | `true` | Enable image embed via file upload |
| `tables` | boolean | `true` | Enable table toolbar buttons |
| `placeholder` | string | `''` | Placeholder text for empty edit fields |
| `onChange` | Function | `null` | Called with TipTap JSON string on every content change |

**Public API:**

| Method | Description |
|---|---|
| `mount(container)` | Mount editor into container element |
| `getValue()` | Return current content as JSON string, or `null` if empty |
| `setValue(jsonString)` | Replace editor content from JSON string |
| `destroy()` | Destroy TipTap instance and clean up DOM |
| `focus()` | Focus the editor (edit mode only) |
| `blur()` | Blur the editor |

**Extensions loaded:** `StarterKit` (paragraph, bold, italic, strike, lists, code, blockquote, hardBreak), `Underline`, `TextStyle`, `Link`, `Image`, `Table`/`TableRow`/`TableHeader`/`TableCell`, `Placeholder`, `OdipRef`, `OdipAnchor`.

`OdipRef` and `OdipAnchor` are passthrough marks — registered so TipTap does not discard text nodes carrying these custom attributes. Rendered as `<span data-ref>` / `<span data-anchor>`; actual semantics handled by the publication pipeline.

**Read-only mode** — `editable: false` is set on the TipTap instance; the toolbar is omitted; `blur()` is called immediately after mount to prevent focus theft.

### 12.3 Integration with CollectionEntityForm

`CollectionEntityForm` manages `RichTextComponent` instances:

- **Edit/create** — `initializeRichTextEditors()` finds `.richtext-edit-placeholder` elements injected by `renderInput()` for `type: 'richtext'` fields, mounts a `RichTextComponent` per field, and wires `onChange` to a hidden `<input>` that participates in form data collection. Initial value (TipTap JSON string) is passed directly to `setValue()`.
- **Read** — `initializeRichTextReadOnly()` finds `.richtext-readonly-placeholder` elements injected by `renderRichtextReadOnly()`, mounts a read-only `RichTextComponent` per field.
- Instances are stored in `this.richTextComponents[fieldKey]` and destroyed in `cleanupRichTextComponents()`.

### 12.4 Content Emptiness Check

`VersionedItemService._isContentEmpty(value)` is the canonical check for whether a TipTap JSON string is empty:

```js
_isContentEmpty(value) {
    if (!value) return true;
    try {
        const doc = typeof value === 'string' ? JSON.parse(value) : value;
        return doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length === 0;
    } catch { return true; }
}
```

Used by `OperationalRequirementService` and `OperationalChangeService` in `_validateMaturityGatedFields` to enforce that `statement`/`rationale` (ADVANCED+) and `purpose`/`initialState`/`finalState` (MATURE) are non-empty.

### 12.5 Images

Images are embedded as base64-encoded data URLs directly in the TipTap JSON (`type: 'image'`, `attrs.src`). The toolbar image button opens a hidden file input; the selected file is read via `FileReader.readAsDataURL` and inserted via `editor.chain().setImage({ src })`.

---

## 13. Edition Context

Dataset context is set on `App` by Home when the user selects a dataset. Sub-activities read `app.getDatasetContext()` on mount to determine:

- Whether to pass `?edition={editionId}` to API calls
- Whether edit actions are available (`type: 'live'`) or suppressed (`type: 'edition'`)

Edition context resolution — mapping the edition to a baseline and optional start date — happens server-side. The web client passes the edition ID directly to the API as `?edition=<id>` and never resolves `baselineId` or `startDate` client-side.

---

## 14. API Integration

The shared API client in `shared/api-client.js` handles all `fetch` calls, base URL configuration, and error normalisation. All components use this client — no component issues `fetch` directly. The base URL is configured to target the API server port explicitly (`http://<hostname>:8080`) to support remote browser access.

### 14.1 Connection Monitoring

Connection monitoring is owned by `App` (`app.js`). On initialisation, `App` calls `endpoints.health` (`/ping`) immediately and then polls every 60 seconds. Each check dispatches a `connection:change` custom event on `window` with `detail.status` set to `'connected'` or `'disconnected'`. `Header` listens to this event and updates the status indicator. The 60-second interval is intentional — the application is a low-concurrency internal tool.

### 14.2 DiffPopup

`DiffPopup` (`components/odp/diff-popup.js`) renders a modal comparison between two versions of an entity. Opened from the history tab.

**Responsibilities:**
- Fetch both versions in parallel via `GET /{entityType}/{id}/versions/{versionNumber}`
- Delegate change detection to `Comparator` — passes `ignoreMilestones: false` for OC diffs
- Apply a second-pass false-positive filter on scalar/rich-text fields
- Render field-level diffs: word-level Myers diff with character-level fallback for scalar/rich-text; added/removed chip columns for reference arrays; structured added/removed/modified blocks for milestones
- Provide an in-popup version selector

**Change entry shapes produced by `Comparator`:**

| Field type | Shape |
|---|---|
| Scalar / rich text | `{ field, oldValue, newValue }` |
| Reference array | `{ field, oldValue: ref[], newValue: ref[] }` |
| Milestones | `{ field: 'milestones', added: milestone[], removed: milestone[], modified: [{name, changes: fieldChange[]}] }` |

**Known design debt:** `DiffPopup` currently uses `_isReferenceArrayField(fieldName)` (hardcoded list) and an explicit `change.field === 'milestones'` guard. Planned refactor: `type` property on each change entry set by `Comparator`.

### 14.3 Anonymous Access

All GET routes on the server accept requests without `x-user-id` header (returning `null` userId). This enables anonymous access to Home (edition list) and Explore. Write operations still require `x-user-id`. Affected route files: `simple-item-router.js`, `versioned-item-router.js`, `odp-edition.js`, `baseline.js`.

---

## 15. CSS Architecture

### 15.1 File Tree

```
styles/
├── main.css                          Design tokens, CSS reset, typography, layout utilities — includes EC palette tokens (--ec-navy, --ec-blue, --ec-sky, --ec-light), link tokens (--link-color, --link-color-hover), and .odip-link utility class
├── primitives.css                    Buttons, form controls, spinners (atomic UI elements)
├── feedback-components.css           Toasts, error notifications, loading/skeleton states
├── layout-components.css             Top header (two-row: nav tabs + breadcrumb), connect popup, cards, modals
│   ├── activities/workspace/shared/os/
│   │   └── os-additions.css              O* toolbar, search input, type badges, view controls, perspective toggle
├── components/
│   ├── filter-bar.css                FilterBar chip component
│   ├── form-components.css           Form tabs, tag selector, multi-select, rich text integration
│   ├── history-tab.css               History version list, diff popup
│   ├── master-detail.css             Two-column resizable layout
│   ├── reference-list-manager.css    Inline chip list with search popup
│   ├── table-components.css          Collection table, row selection, grouping, empty states
│   ├── tree-table-components.css     Tree table with indentation levels
│   └── temporal-components.css       TemporalGrid base styles
└── activities/
    ├── activity.css                  Base layout for all activities
    ├── home/
    │   └── home.css
    ├── workspace/
    │   ├── elaborate/elaborate.css
    │   ├── explore/explore.css
    │   ├── setup/setup.css           Setup entity tabs, three-pane layout
    │   └── shared/
    │       ├── os/os.css             O* activity shell layout, detail shell height propagation, type badge colours (ON blue, OR green, OC purple)
    │       ├── plan/plan.css         ON plan two-pane layout, TemporalGrid context
    │       ├── quality/quality.css
    │       └── notes/notes.css
    └── manage/
        ├── manage.css
        └── editions/editions.css     Edition count badge, publication action buttons
```

Note: `abstract-interaction-activity.css`, `elaboration.css`, `review.css`, `planning.css`, `publication.css`, `prioritisation.css` have been removed. Their responsibilities are covered by the new activity structure or by `activity.css` directly.

### 15.2 Layer Hierarchy

Files are loaded in strict dependency order: global → components → activities (base first, then concrete).

**Global** (`styles/`) — no dependencies between files at this level. `primitives.css` is the lowest-level layer.

**Components** (`styles/components/`) — depend only on global tokens. No component file references another component file or any activity file.

**Activities** (`styles/activities/`) — depend on global and component layers. `activity.css` is the base for all activities.

---

## 16. Planning Activity

The Plan activity (`activities/workspace/shared/plan/`) supports deployment and implementation planning across two phases. Phase 1 (ON-based) is fully implemented. Phase 2 (OC-based) is reserved as a placeholder tab.

### 16.1 Tab Structure

| Tab | Status |
|---|---|
| `ON Plan` | Active — full implementation |
| `OC Plan` | Placeholder — disabled |

### 16.2 Data Loading

`PlanningActivity.loadSetupData()` loads setup entities and requirements in a single `Promise.all`. Requirements are **not** part of `setupData` — passed to `ONPlanning` as a dedicated constructor argument and exposed to `RequirementForm` via `getRequirements()`.

Since Phase A, setup data loading is delegated to `app.getSetupData()` rather than loaded independently.

### 16.3 ON Plan Layout

Two-pane horizontal layout with resizable column divider:

- **Left pane** — `TemporalGrid` with structured ON hierarchy rows
- **Right pane** — Selected ON details: toolbar (title + code + Edit button) + full `RequirementForm.generateReadOnlyView()`

### 16.4 TemporalGrid Row Structure (Left Pane)

| Row kind | Content |
|---|---|
| `group` (separator) | Domain display label |
| `group` | Root ON (no `refinesParents`); expand/collapse |
| `child` | Refined ON (has `refinesParents`); indented |

ONs with a `tentative` period get two milestones: `period-start` (▶) and `period-end` (◀).

### 16.5 Milestone Rendering

```javascript
temporalGrid.setMilestoneRendering({
    mode: 'icon',
    eventTypes: {
        'period-start': { icon: '▶', colour: '#2563eb' },
        'period-end':   { icon: '◀', colour: '#2563eb' }
    }
})
```

### 16.6 ON Details (Right Pane)

Clicking any row fires the selection listener. `ONPlanning.handleGridSelect(id)` renders the right pane with `RequirementForm.generateReadOnlyView()`. The Edit button calls `requirementForm.showEditModal(on)`. After a successful save, the `entitySaved` DOM event triggers a reload and refresh.

### 16.7 File Structure

```
activities/workspace/shared/plan/
├── plan.js             PlanActivity shell, tab management
├── planning.js         PlanningActivity: setup + requirements load
├── on-planning.js      ONPlanning: TemporalGrid config, selection, details pane
├── prioritisation.js   PrioritisationActivity shell
└── prioritisation-grid.js  PrioritisationGrid: board render, collapse, drag-and-drop

shared/src/model/
└── bandwidth-aggregation.js  Pure aggregation (no DOM, no API)

shared/
└── year-period.js      parseYearPeriod() / formatYearPeriod()
```

---

## 17. Prioritisation Activity

The Prioritisation activity (`activities/workspace/shared/plan/prioritisation.js`) matches OC implementation effort against domain bandwidth constraints across waves. Wave assignments are persisted via OPS_DEPLOYMENT milestones.

### 17.1 Data Inputs

| Source | Usage |
|---|---|
| `GET /operational-changes` | OCs with `cost`, `domain`, `maturity`, `dependencies`, `milestones` |
| `GET /waves` | Wave definitions |
| `GET /bandwidths` | Available MW per (waveId, scope) pair |
| `DraftingGroup` enum | Hardcoded column order — **known limitation**: prioritisation board still uses DrG-based columns; OC `domain` field not yet integrated. Redesign pending. |

### 17.2 Bandwidth Aggregation Module

Pure aggregation logic in `shared/src/model/bandwidth-aggregation.js` — no DOM, no API calls.

| Function | Description |
|---|---|
| `buildMatrix(ocs, waves, bandwidths, drgs)` | Returns `{ cells, waveGlobal, unplanned }` |
| `resolveDeploymentWaveId(oc)` | Returns wave ID of OPS_DEPLOYMENT milestone, or null |
| `classifyLoad(consumed, available)` | Returns `'green'`/`'orange'`/`'red'`/`'empty'` |
| `cardHeight(cost)` | Returns card height in rem (logarithmic scale) |
| `checkDependencyViolations(oc, targetWaveId, allOcs, waves)` | Returns `{ violated, offenders }` |

**`AggregationMatrix` shape:**

```javascript
{
    cells:      Map<waveId, Map<drg, CellData>>,
        waveGlobal: Map<waveId, CellData>,
        unplanned:  OC[]
}
// CellData
{ consumed: number, available: number | null, ocs: OC[] }
```

**`available` sentinel values:**
- `null` — no bandwidth record → grey, no load classification
- `0` — explicit zero MW → red if any OCs assigned
- `> 0` — normal; load classified by consumed/available ratio

**Load colour thresholds:** green < 80%, orange 80–120%, red ≥ 120%.

### 17.3 Grid Layout

```
┌─────────┬──────────┬──────────┬─────────┐
│  Label  │   DrG 1  │   DrG N  │ Global  │
├─────────┼──────────┼──────────┼─────────┤  ← furthest wave (top)
│ 2029#1  │  cards   │  cards   │ tinted  │
├─────────┼──────────┼──────────┼─────────┤
│ 2027#2  │  ...     │  ...     │  ...    │  ← nearest wave (bottom)
├─────────┼──────────┼──────────┼─────────┤
│ Mature  │  cards   │  cards   │  count  │  ← backlog sub-rows
│ Advanced│  cards   │  cards   │  + MW   │
│ Draft   │  cards   │  cards   │  count  │
└─────────┴──────────┴──────────┴─────────┘
```

Wave rows ordered furthest-top to nearest-bottom (`flex-direction: column-reverse`).

### 17.4 OC Cards

- Height: `h = 2 + 2·log10(max(1, cost))` rem, clamped 2–12 rem
- Left colour strip: grey (Draft), amber (Advanced), green (Mature)
- Shows: title (truncated), cost in MW, dependency icon (⛓) if any
- Hover: open button (↗) navigates to `/elaborate/os/change/{itemId}`
- Draft cards: `cursor: not-allowed`, reduced opacity, lock icon (🔒), not draggable

### 17.5 Wave Row Collapse

- **Collapsed state** (32px): OC cards hidden; DrG cells show `consumed / available MW`; 4px load strip
- **Expand on drop**: dropping onto a collapsed wave row automatically expands it

### 17.6 Backlog Section

| Sub-row | Maturity | Draggable | Accepts drops |
|---|---|---|---|
| Mature | `MATURE` | Yes | Yes |
| Advanced | `ADVANCED` | Yes | Yes |
| Draft | `DRAFT` | No | No |

Wave→backlog drop only accepted by the sub-row matching the OC's maturity.

### 17.7 Drag-and-Drop

- **Constraint**: only within the same DrG column
- **Wave assignment** (backlog → wave): `apiClient.createMilestone()`
- **Wave reassignment** (wave → wave): `apiClient.updateMilestone()`
- **Wave removal** (wave → backlog): `apiClient.deleteMilestone()`
- **Dependency check**: `checkDependencyViolations()` on drop; violations surface confirmation dialog but do not block

---

## 18. iCDM DrGs Edition 4 Model Changes

### 18.1 Setup Layer

| Change | Detail |
|---|---|
| `DataCategory` removed | `data-categories.js` deleted |
| `Service` removed | `services.js` deleted |
| `Document` → `ReferenceDocument` | `reference-documents.js`; `description` field added; hierarchy up to three levels; now a `TreeEntity`; endpoint `/reference-documents` |
| `Domain` removed | `domains.js` deleted — Domain setup entity retired; domain is now a config-driven key from `domains.json` |
| `Bandwidth` added | New `ListEntity` (`bandwidths.js`); unique on `(year, waveId, scope)`; `scope` is a `DraftingGroup` enum key |
| `Wave` fields renamed | `quarter` → `sequenceNumber`, `date` → `implementationDate`, `name` removed |

### 18.1b Field Type Vocabulary

| Type | Component | Cardinality | Notes |
|---|---|---|---|
| `select` | Native `<select>` | 1 | Enum choices |
| `reference` | `ReferenceManager` | 0..1 | Inline typeahead; value wrapped in `[id]` array on save |
| `reference-list` | `ReferenceListManager` | 0..n | Chip list + search popup |
| `annotated-reference-list` | `AnnotatedMultiselectManager` | 0..n with note | Table with per-item note |
| `richtext` | `RichTextComponent` (TipTap) | — | TipTap JSON stored as stringified JSON |

### 18.1c Annotated Reference List

**Edit / create mode** — each selected item in an editable table row; note field is `<textarea>`; line breaks stored as `\n`, rendered with `white-space: pre-line`.

**Read-only mode** — items rendered as structured block list sorted alphabetically. Each item: `• Title (link if url available) / note text`.

**Metadata resolution (`_resolveAnnotatedRefMeta`)** — fields declare `setupEntity` referencing a `setupData` collection key. Returns `{ description, url }`: description as native `title` tooltip; url renders title as `<a>` for strategic documents.

**`setupEntity` mapping:**

| Field | `setupEntity` |
|---|---|
| `strategicDocuments` | `referenceDocuments` |
| `impactedStakeholders` | `stakeholderCategories` |


### 18.2 Operational Requirement Fields

**Added to both ON and OR:**

| Field | Type | Notes |
|---|---|---|
| `maturity` | `select` | Required; options from `MaturityLevel` enum |
| `additionalDocumentation` | `static-label` | Renders "Not available yet"; not submitted |

**Added to ON only:**

| Field | Type | Notes |
|---|---|---|
| `strategicDocuments` | `annotated-reference-list` | Options from `referenceDocuments`; titles link to `url` if present |
| `tentative` | `tentative` | User enters `YYYY` or `YYYY-ZZZZ`; saved as `[start, end]` integer array |

**Added to OR only:**

| Field | Type | Notes |
|---|---|---|
| `nfrs` | `richtext` | Optional operational NFRs |
| `impactedStakeholders` | `annotated-reference-list` | Options from `stakeholderCategories` |
| `refinesParents` | `reference` | Single-select typeahead; wraps id in `[id]` array on save |
| `refinedBy` | `reference-list` | Computed, read-only. Uses `computeKey: '_computeRefinedByIds'` |
| `implementedBy` | `reference-list` | Computed, read-only, ON only. Uses `computeKey: '_computeImplementedByIds'` |

**Renamed:** `impactsStakeholderCategories` → `impactedStakeholders`, `dependsOnRequirements` → `dependencies`, `documentReferences` → `strategicDocuments` (ON only).

**Removed:** `impactsData`, `impactsServices`, `documentReferences` (from OR), `impactedDomains` (from OR — replaced by `domain` on the item itself), `drg`, `path`.

**Added to both ON and OR:** `domain` (`select`, required, options from `getDomainKeys()`).

**Traceability tab field order:** Strategic Documents → Refines (Parent) → Refined By → Implements (ONs) → Implemented By (ORs).

**Impact tab visibility:** Always renders (stable tab index). Fields hidden for ONs via `visibleWhen` — produces a blank tab for ON items intentionally to avoid tab index shifts.

### 18.3 Operational Change Fields

**Added:**

| Field | Type | Notes |
|---|---|---|
| `maturity` | `select` | Required |
| `cost` | `number` | Optional integer; MW |
| `dependencies` | `reference-list` | OCs that must precede this OC |
| `additionalDocumentation` | `static-label` | Renders "Not available yet" |

**Renamed:** `satisfiesRequirements` → `implementedORs`, `supersedsRequirements` → `decommissionedORs`.

**Removed:** `documentReferences` section, `visibility` field, `drg`, `path`.

**Added:** `domain` (`select`, required, options from `getDomainKeys()`).

### 18.4 Milestone Name Field

Milestone `title` field renamed to `name` throughout `change-form-milestone.js`. Wave label rendered as `{year}#{sequenceNumber}`.

### 18.5 New Field Types in CollectionEntityForm

| Type | Edit rendering | Read rendering | Notes |
|---|---|---|---|
| `static-label` | `<div>` with `staticText`, no `name` | Label + `staticText` | Skipped in `collectFormData`, `validateForm`, `restoreVersionToForm` |
| `tentative` | `<input type="text">` with pattern `^\d{4}(-\d{4})?$` | Formats `[start,end]` as `"YYYY"` or `"YYYY-ZZZZ"` | Parsed via `parseTentative()` → `parseYearPeriod()` |

### 18.6 O*s Activity — Unified List

`OsActivity` (`os.js`) and `OStarEntity` (`o-star-entity.js`) together implement the unified ON/OR/OC workspace.

**Layout:**
```
[ Filter bar ]  [ 🔍 search ]        ← single toolbar row
[ Collection | Tree ]  [ counts ]    ← view controls row
[ MasterDetail: list | detail ]
```

**Search:** free-text input (debounced 300ms), maps to `text` parameter — visually separate from structured filters.

**Filter bar:** Type · Domain · Maturity · Stakeholder · Implements · Strategic Document.

**Perspectives:** Collection (flat + grouping) and Tree (REFINES hierarchy). Toggle persists across data reloads.

**Grouping** (Collection only): Type · Domain · Maturity.

**Column set:**

| Column | Perspective | Applies to | Sortable |
|---|---|---|---|
| Type | both | all | Yes |
| Code | both | all | Yes |
| Title | both | all | Yes |
| Maturity | both | all | Yes |
| Domain | collection | all | Yes |
| Implements | both | OR, OC | No |
| Refines | collection | ON, OR | No |
| Strategic Documents | both | ON only | No |
| Impacted Stakeholders | both | OR, OC | No |

**Virtual field:** `item.implements` is pre-computed in `OStarEntity.onDataUpdated()` — merges `implementedONs` (OR) and `implementedORs` (OC) into a single array for the Implements column renderer.

**OC type normalisation:** OCs from `/operational-changes` have no `type` field — normalised to `'OC'` in `_loadData()` after merge.

**Tree path builder priority:**
1. `refinesParents` — if present, nest under parent node (graph-based)
2. ONs/ORs without `refinesParents` — flat under their domain group node
3. OCs — always flat under their domain group node

---

## 19. Phase 2 — Domain/Chapter Model Evolution

### 19.1 Setup Layer

| Change | Detail |
|---|---|
| `Domain` setup entity retired | `domains.js` deleted; domain is now a config-driven string key from `domains.json` |
| `domains` removed from setup data cache | `app.getSetupData()` no longer fetches `/domains`; `setupData.domains` no longer exists |

### 19.2 O* Fields

| Field | Change |
|---|---|
| `drg` | Removed from OR and OC — replaced by `domain` (string key) |
| `path` | Removed from OR and OC |
| `impactedDomains` | Removed from OR |
| `domain` | Added to both OR and OC — mandatory string key validated against `domains.json` |

### 19.3 O*s Activity

- Filter bar: `drg` and `impactedDomain` filters replaced by single `domain` string key filter
- Grouping: `drg` grouping replaced by `domain` grouping
- Tree perspective: root group nodes are now domain groups (`domain:KEY`) instead of DrG groups
- `on-planning.js`: TemporalGrid separator rows now show domain labels (via `getDomainLabel()`)

### 19.4 Known Limitations (Phase 2)

- **Prioritisation board** (`prioritisation.js`, `prioritisation-grid.js`) still uses `oc.drg` for column placement. OCs now carry `domain` instead. The board is broken for Phase 2 data — redesign of the prioritisation board around the domain model is deferred.

---

## 20. Edition Content Selection — Manage Activity Changes

### 19.1 ODPEditionForm (`manage/editions/odp-edition-form.js`)

**Type field** — options: `DRAFT` / `OFFICIAL`.

**`startDate` field** — replaces former `startsFromWave` select. Plain date input (`yyyy-mm-dd`), optional. Dual role: OC milestone lower bound + ON tentative period filter.

**`minONMaturity` field** — `radio` with options `DRAFT` (default), `ADVANCED`, `MATURE`.

**`transformDataForSave()`** — passes `startDate` directly; defaults `minONMaturity` to `'DRAFT'`; default type is `'DRAFT'`.

**`transformDataForEdit()`** — extracts `baselineId` from baseline reference object; defaults `minONMaturity` to `'DRAFT'`.

**`onValidate()`** — validates baseline reference only; wave validation removed.

### 19.2 ODPEditionsEntity (`manage/editions/editions.js`)

**Type column** — `enumLabels` and `enumStyles` updated to `DRAFT` / `OFFICIAL`.

**`startDate` column** — replaces former `startsFromWave`; plain text, renders `'—'` when absent.

**`minONMaturity` column** — text column; renders `'—'` when absent.

**Grouping config** — `startDate` and `minONMaturity` available as grouping options.

### 19.3 Publish Action

The edition details panel exposes a **Publish** button (triggers server-side Antora build).

**Publish flow:**
1. Button click calls `apiClient.publishEdition(editionId)` — `POST /odp-editions/{id}/publish` with body `{ pdf: { flat: true } }` (default)
2. Button disabled and labelled "Publishing…" while in flight (~5–30s)
3. On success: "✓ Published — Open site · PDF · Word" with absolute links
4. On 409: "Publication already in progress — please retry later"
5. On other error: error message displayed

**`apiClient.publishEdition(id, options)`** — `post('/odp-editions', options, { id, subPath: 'publish' })`. Response: `{ siteUrl, pdf: { flatUrl, setUrl }, word: { flatUrl, setUrl } }` — all nullable. URLs made absolute using `apiClient.baseUrl`.

---

## 20. ODIP Design System — UI Primitives

### 20.1 Overview

ODIP Space uses a canonical set of UI primitive classes defined in `primitives.css`. These replace Bootstrap-legacy class names (`btn`, `btn-primary`, `form-control`) throughout all ODIP components. The design system enforces two tiers — **compact** (inline/toolbar contexts) and **standard** (modal/form contexts) — with semantic variants for both buttons and inputs.

### 20.2 Button System — `odip-btn`

All buttons in ODIP components use `odip-btn`. The base class defines the compact tier; `--standard` upgrades to form-body size.

**Size tiers:**

| Class | Font size | Padding | Border |
|---|---|---|---|
| `.odip-btn` (default) | 11px | 4px 9px | 0.5px solid |
| `.odip-btn.odip-btn--standard` | `--font-size-sm` | `--space-2` `--space-4` | 1px solid |

**Semantic variants:**

| Modifier | Use | Background | Text | Border |
|---|---|---|---|---|
| (none) | Neutral — History, Cancel, navigation | white | `#1a1a2e` | `#cbd5e1` |
| `--primary` | Primary action — Edit, Save, Submit | `--ec-navy` (#1F3864) | white | `--ec-navy` |
| `--danger` | Destructive — Delete, Delete version | white | `#A32D2D` | `#F7C1C1` |
| `--warning` | Consequential — Decommission | white | `#854F0B` | `#FAC775` |
| `--create` | New-object — +ON, +OR, +OC | white | `#185FA5` | `#B5D4F4` |

**Usage pattern:**
```html
<button class="odip-btn">History</button>
<button class="odip-btn odip-btn--primary">Edit</button>
<button class="odip-btn odip-btn--danger">Delete</button>
<button class="odip-btn odip-btn--primary odip-btn--standard">Save</button>
<button class="odip-btn odip-btn--standard">Cancel</button>
<button class="odip-btn odip-btn--create">+ ON</button>
```

The legacy `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-sm` classes remain in `primitives.css` but are not used in any ODIP component.

### 20.3 Input System — `odip-input`

All text inputs, selects, and textareas in ODIP components use `odip-input`. Same two-tier pattern as `odip-btn`.

**Size tiers:**

| Class | Font size | Padding | Border |
|---|---|---|---|
| `.odip-input` (default) | 11px | 4px 9px | 0.5px solid |
| `.odip-input.odip-input--standard` | `--font-size-sm` | `--space-2` `--space-3` | 1px solid |

**Modifiers:**

| Modifier | Use |
|---|---|
| `--textarea` | Adds `min-height: 80px`, `resize: vertical` |
| `--error` | Red border for validation error state |

**Usage pattern:**
```html
<input class="odip-input" type="text">                          <!-- compact -->
<input class="odip-input odip-input--standard" type="text">    <!-- form body -->
<select class="odip-input">…</select>                          <!-- compact select -->
<textarea class="odip-input odip-input--standard odip-input--textarea">…</textarea>
```

The legacy `form-control`, `form-select`, `form-textarea`, `form-control-sm` classes are not used in any ODIP component.

### 20.4 Link Style — `odip-link`

Navigable inline references (O* chips, strategic document links) use `.odip-link` defined in `main.css`:

```css
color: var(--link-color)       /* --ec-blue */
font-weight: semibold
cursor: pointer
text-decoration: none
```

Hover: `color: var(--link-color-hover)` (`--ec-navy`).

### 20.5 Affected Files

| File | Change |
|---|---|
| `primitives.css` | Added `odip-btn` and `odip-input` systems |
| `os.css` | Added `os-toolbar__create`, `os-detail__toolbar`, `os-detail__title`, `os-detail__actions`; removed `os-action-btn`, `os-create-btn` |
| `form-components.css` | Migrated `.form-control` selectors to `.odip-input`; removed `.milestone-actions .btn` sizing override |
| `collection-entity-form.js` | `btn` → `odip-btn`; `form-control` → `odip-input odip-input--standard` |
| `change-form-milestone.js` | `btn` → `odip-btn`; `form-control` → `odip-input` |
| `annotated-multiselect-manager.js` | `btn` → `odip-btn`; `form-control` → `odip-input` |
| `reference-list-manager.js` | `btn` → `odip-btn`; `form-control` → `odip-input` |
| `reference-manager.js` | `form-control` → `odip-input` |
| `diff-popup.js` | `btn` → `odip-btn` |
| `os.js` | `os-action-btn` → `odip-btn`; `os-create-btn` → `odip-btn odip-btn--create` |
| `requirement-details.js` | `os-action-btn` → `odip-btn` |
| `change-details.js` | `os-action-btn` → `odip-btn` |

---

## 21. O* Workspace — Plain Page / Master Detail Navigation

### 21.1 Layout Changes

The O* workspace toolbar row has been restructured:

```
[ filter bar · · · · · · · · · · 🔍 search  +ON  +OR  +OC ]
[ perspective | grouping | counts                           ]
[ list panel                    ‖ detail panel              ]
```

The +ON / +OR / +OC create buttons moved from the view controls row (owned by `OStarEntity`) to the toolbar row (owned by `OsActivity`). This eliminates visual competition between create buttons and detail action buttons.

Create buttons are only rendered in live (non-read-only) context. They delegate to `_ostarEntity._handleCreate(type)`.

### 21.2 Detail Panel Header

The detail panel (`RequirementDetails` / `ChangeDetails`) uses a single toolbar row:

```
[ title (fills available space) · · · · Edit  Full page ]   ← panel mode
[ title (fills available space) · · · In collection  In tree ]  ← page mode
```

`os-detail__title` takes `flex: 1` and truncates with ellipsis. Action buttons are right-aligned, compact (`odip-btn`).

### 21.3 Plain Page ↔ Master Detail Navigation

Two new action buttons per detail view, mode-dependent:

| Mode | Button | Action |
|---|---|---|
| Panel | **Full page** | Pushes `/{base}/os/{type}/{id}` to browser history |
| Page | **In collection** | Navigates to `/{base}/os?perspective=coll&selected={id}` |
| Page | **In tree** | Navigates to `/{base}/os?perspective=tree&selected={id}` |

**Callback injection** — callbacks are passed into `render()` on every call (not at construction), ensuring cached instances always receive correct wiring:

```js
await this._requirementDetails.render(container, id, 'panel', {
    onFullPage:     (item) => this._navigateToFullPage(item),
    onInCollection: null,
    onInTree:       null,
});
```

**Search param restore** — `_restoreFromSearchParams()` is called once after `_renderList()` completes. It reads `?perspective` and `?selected`, sets `sharedState.selectedItem` before calling `setPerspective()` (ensuring tree expansion fires with the item already known), then calls `_handleItemSelect()` for panel render. Params are cleaned via `replaceState` after consumption.

**`OStarEntity.setPerspective(perspective)`** — public method added for programmatic perspective switching. Accepts `'collection'` or `'tree'`. Thin wrapper around `_switchPerspective`.


## 22. CollectionEntity — Keyboard Navigation & Focus Management

### 22.1 Keyboard Navigation

`CollectionEntity` supports ArrowDown / ArrowUp keyboard navigation through the visible collection rows.

- `collection-content` wrapper has `tabindex="0"` — making it focusable without affecting tab order of interactive elements inside
- Clicking a row calls `selectItem()` then immediately focuses `collection-content` so arrow keys work without an extra click
- `keydown` listener on `collection-content` intercepts ArrowDown / ArrowUp, calls `_navigateByKey(±1)`, then re-asserts focus via `focus({ preventScroll: true })`
- `_navigateByKey(delta)` operates on **visible DOM rows** (`querySelectorAll('.collection-row')`) — not `this.data` — so filtering and search are automatically respected
- Clamps at boundaries; no wrap

### 22.2 Tab Preservation Across Item Selection

When the user switches selection in the master list, the active tab in the detail form is preserved:

- `RequirementDetails.render()` and `ChangeDetails.render()` capture `formExisted = this._form != null` before `_ensureForm()`
- `generateReadOnlyView(item, formExisted)` — `preserveTabIndex=true` on re-renders, `false` on first render
- `CollectionEntityForm._activeInstance` static property tracks the currently rendered panel form instance
- `initializeReadOnlyInPanel` sets `CollectionEntityForm._activeInstance = this` on every panel render
- The shared document-level tab delegation listener updates `_activeInstance.currentTabIndex` — fixing a bug where only the first-constructed form instance ever had its tab index tracked

### 22.3 OC-Specific Focus Fixes

**Stale MutationObserver** — `ChangeForm.loadHistoryWithObserver` is called on every `generateReadOnlyView`. Without a disconnect guard, each OC re-render accumulated a new observer on `document.body`. Stale observers fired on subsequent DOM mutations, causing interference. Fix: `this._historyObserver?.disconnect()` before creating the new observer.

**TipTap read-only focus** — `RichTextComponent` in read-only mode calls `blur()` immediately after `mount()` to prevent focus theft. Edit modal unaffected — `focusFirstInput()` runs after modal open.

### 22.4 Affected Files

| File | Change |
|---|---|
| `collection-entity.js` | `tabindex="0"` on `collection-content`; auto-focus on row click; `_navigateByKey` uses visible DOM rows |
| `collection-entity-form.js` | `_activeInstance` static property; tab delegation updates `_activeInstance`; `RichTextComponent.blur()` in read-only init |
| `requirement-details.js` | `formExisted` flag passed as `preserveTabIndex` to `generateReadOnlyView`; `getRequirements` synthesised from extended projection |
| `change-details.js` | `formExisted` flag passed as `preserveTabIndex` to `generateReadOnlyView` |
| `change-form.js` | `_historyObserver?.disconnect()` before new observer creation |
| `requirement-form.js` | `_computeRefinedByIds` and `_computeImplementedByIds` prefer extended projection fields |

---

## 23. Build Tooling — Vite

### 23.1 Role

Vite replaces the former no-build-step approach. It provides:

- **Development server** — fast dev server with ES module native serving; replaces `sirv-cli`
- **Production build** — `npm run build` outputs a hashed, tree-shaken bundle to `web-client/dist/`
- **Asset processing** — files in `src/assets/` are processed and fingerprinted; must be imported as ES modules to get the resolved URL

### 23.2 Configuration (`vite.config.js`)

Located at `web-client/vite.config.js`. Key settings: root set to `src/`, output to `dist/`, dev server port `3000`.

### 23.3 Asset Import Pattern

Static assets (SVG, images) that were previously referenced by hardcoded paths must be imported as ES modules:

```js
import logoUrl from '../assets/odip-space-logo.svg';
// logoUrl resolves to the correct hashed path in production,
// and to the dev server path in development
```

Placing an asset in `src/assets/` and referencing it by a static string path will fail in production — Vite does not serve `src/assets/` at a predictable URL after bundling.

### 23.4 @odp/shared Copy

The `@odp/shared` source is copied into `web-client/src/shared/src/` as a build preparation step (executed by `odip-admin` on `--rebuild`). This copy is imported directly as plain ES modules and processed by Vite as part of the main bundle.

### 23.5 Development vs Production

| Mode | Command | Output |
|---|---|---|
| Development | `npm run dev` | Vite dev server on port 3000; live reload |
| Production build | `npm run build` | Hashed bundle in `dist/` |
| Container | `CMD ["npm", "run", "dev"]` in Dockerfile | Vite dev server inside the container |

The container always runs the Vite dev server — there is no separate production serving step in the current deployment model.

[← 07 CLI](07-CLI.md) | [09 Deployment →](09-Deployment.md)