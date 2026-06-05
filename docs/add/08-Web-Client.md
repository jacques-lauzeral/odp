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
│   │       │   ├── o-star-entity.js        Unified ON/OR/OC list — Collection perspective
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
│   │       │   └── quality.js              Dataset quality checks — on-demand report, context-aware
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
│   ├── odp-column-types.js
│   └── user-dialogs.js                     ODIP-styled interactive dialogs: odipConfirm (Yes/No) and odipUnsavedChanges (Save/Discard/Cancel)
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
| Quality | `quality` | `QualityActivity` |
| Notes | `notes` | `NotesActivity` (placeholder) |
| Setup | `setup` | `SetupActivity` |

**Manage tab strip:**

| Tab | Sub-path segment | Sub-activity |
|---|---|---|
| Editions | `editions` (default) | `EditionsActivity` |

Context difference (live vs edition, R/W vs R/O) flows transparently through `app.getDatasetContext()` — sub-activities do not need to know which shell they are mounted in.

**Unsaved-changes guard — sub-activity tab switch:** `ElaborateActivity._route()` calls `canDeactivate()` on the current sub-activity before switching to a different tab. If the method returns `false` (user chose Cancel), the active tab highlight is restored and the switch is aborted. `canDeactivate()` is implemented by `NarrativeActivity`; all other sub-activities omit it and are always safe to leave.

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

- Activity lifecycle (`_loadActivity`, lazy instantiation, cleanup, `canDeactivate` guard)
- Router instantiation and delegation
- User state (`setUser` / `getUser`) — persisted to localStorage by Header
- Dataset context (`setDatasetContext` / `getDatasetContext`) — set by Home on selection
- Setup data cache (`getSetupData` / `invalidateSetupData`) — lazy-loaded, shared across all activities
- Chapter cache (`getChapters`) — config-driven, cached permanently
- O* summary cache (`getOStars` / `findOStar` / `invalidateOStars`) — TTL-refreshed, 5 minutes
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

**O* summary shape** (TTL-cached, 5 minutes, stale-while-revalidate):

```js
{ itemId: number, type: string, code: string, title: string, domain: string|null, versionId: string|null }
```

`getOStars()` returns the full summary array. `findOStar(itemId)` returns a single summary or `null`. `invalidateOStars()` must be called after any O* create/update/delete operation.

**Unsaved-changes guard — top-level activity switch:** `App._loadActivity()` calls `canDeactivate()` on the current activity before mounting a new one. If `false` is returned, `router._activeSegment` is restored to the current activity name (so the Header tab reverts) and the load is aborted. `ElaborateActivity.canDeactivate()` forwards to the current sub-activity's `canDeactivate()` if present, enabling the guard to reach `NarrativeActivity` through the shell layer.

---

## 5. Header and User Identification

`Header` (`components/header.js`) owns a single-row layout:

- **Row 1** — logo · brand · nav tabs · right cluster (Connect/username button · server status dot)

**Nav tabs** (row 1):

| Tab | Visibility |
|---|---|
| Home | Always |
| Elaborate | Only when dataset context is `live` |
| Explore | Only when dataset context is `edition` |
| Converse | Always |
| Manage | Always (access enforced by router — protected route) |



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

Abstract base class for entity forms. Concrete forms (`RequirementForm`, `ChangeForm`) extend it and implement: `getReadConfig()`, `getEditConfig()`, `hydrateField()`, `onSave()`, `onValidate()`, and optionally `transformDataForSave()` / `transformDataForEdit()`. The base class handles modal lifecycle, field rendering, validation orchestration, and error display.

**Layout configs drive rendering.** Forms expose two layout configs (see §24): `getReadConfig()` for read mode and `getEditConfig()` for edit/create. When either is non-null, `generateForm()` delegates to `_generateFormFromConfig()`. The edit config additionally carries full field metadata (type, label, options, validation, placeholder) and is the single source of truth consumed by `validateForm`, `collectFormData`, the manager initialisers, and `restoreVersionToForm` via a flat `Map<key, fieldDef>` built by `_buildFieldMap()` / cached by `_getFieldMap()`. The legacy `getFieldDefinitions()` virtual is retained only as an empty-returning fallback for forms that have not adopted the config pattern.

**hydrateField** — each form binds string references (`optionsKey`, `formatKey`, `computeKey`, `renderKey`) on its edit-config field entries to actual bound methods. `_buildFieldMap()` calls `this.hydrateField(entry)` on every field as it builds the map.

**Field visibility (`visibleWhen`)** on a config entry is `'ON'` | `'OR'` (matched against `item.type`) or a function `(item) => bool`. Section visibility is determined by section `modes` (which modes the section appears in) plus whether any field entry is visible for the current item.

**Computed reference fields** (`type: 'reference-list'` with `computeKey`) derive their value at initialisation time by calling a named method on the form instance. `initializeReferenceListManagers` calls `field.compute(this.currentItem)` when present.

**Context resolvers** — forms receive resolver functions in their `context`:

| Resolver | Returns | Used by |
|---|---|---|
| `getSetupData()` | Setup data object | `getSetupDataOptions`, `getReferenceDocumentOptions` |
| `getRequirements()` | Full live requirements array | `_computeImplementedByIds`, `_computeRefinedByIds`, `getAllRequirementOptions` |
| `onNavigate(ref)` | — | Enables navigable reference chips in read mode |

**`onNavigate` option** — when provided at construction, `CollectionEntityForm` passes `onItemClick` to `ReferenceListManager` and `ReferenceManager` in read mode, enabling reference chips to navigate on click. Entity type is derived from `field.formatArgs[0]` and mapped to URL segment (`'requirement'` or `'change'`).

**Modal title** — `getFormTitle(mode, item = null)` is called by `showModal` with `this.currentItem`. Subclasses override it. In edit mode, `RequirementForm` and `ChangeForm` return `Edit {code} — {title}` using the item's `code` and `title` fields. Create mode returns `Create {type}` / `Create OC` as before.

**Edit mode field layout** — `renderEditableField` applies `.form-group--inline` to scalar field types (`text`, `number`, `select`, `tentative`, `reference`), rendering the label left of the input on a single line. Spatially extended types (`richtext`, `reference-list`, `annotated-reference-list`, `custom`) keep the label-above-value layout. `helpText` is suppressed for inline scalar fields — the placeholder carries the hint.

**Read mode field rendering** — non-scalar field wrappers (`reference-list`, `reference`, `richtext`, `annotated-reference-list`) receive the `.detail-field--block` modifier, which indents the value area. Read mode labels match edit mode style (no uppercase, `font-size-sm`, `font-weight-medium`).

**Confirm on change** — `_attachConfirmOnChangeListeners` is async and uses `odipConfirm` from `components/user-dialogs.js` instead of `window.confirm`. The message is `Do you really want to re-assign this ${type} to another domain?` using `this.currentItem?.type`.

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

**Cross-perspective selection sync** (`ChangesEntity`): when switching between Collection and Tree perspectives with an item selected, the entity synchronises state — the tree re-renders with ancestors expanded and the selected row visible; the collection re-renders with the selected row scrolled into view.

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
| List rendering — Collection perspective | `OStarEntity` |
| Grouping selector | `OStarEntity` |
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
| `'page'` | Full page (inter-O\* navigation) | None |

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

This utility is used exclusively by `NarrativeActivity` for intra-narrative back-navigation (← Chapters, current chapter name). It is not a general-purpose header mechanism — `app.header.setBreadcrumb()` does not exist and must not be called by other activities.

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
| `onInternalLink` | Function | `null` | Called with `(type, value)` on internal link click in read-only mode. `type`: `'n-ref'` \| `'o-ref'` \| `'d-ref'`; `value`: the mark's value attribute. Navigation implemented by the caller. |
| `linkProvider` | object | `null` | Supplies reference targets for the toolbar `#` picker (see §12.6). When absent, only the external-link button is shown. |

**Public API:**

| Method | Description |
|---|---|
| `mount(container)` | Mount editor into container element |
| `getValue()` | Return current content as JSON string, or `null` if empty |
| `setValue(jsonString)` | Replace editor content from JSON string |
| `destroy()` | Destroy TipTap instance and clean up DOM |
| `focus()` | Focus the editor (edit mode only) |
| `blur()` | Blur the editor |

**Extensions loaded:** `StarterKit` (paragraph, bold, italic, strike, lists, code, blockquote, hardBreak), `Underline`, `TextStyle`, `Link`, `Image`, `Table`/`TableRow`/`TableHeader`/`TableCell`, `Placeholder`, `OdipNRef`, `OdipORef`, `OdipDRef`.

**Internal reference marks** — three mark extensions (`OdipNRef`, `OdipORef`, `OdipDRef`) that both preserve round-tripped content and support authoring via set/unset commands:

| Mark name | Rendered as | Attributes | Semantics |
|---|---|---|---|
| `n-ref` (`OdipNRef`) | `<span data-n-ref="{value}" data-label="{label}">` | `value`, `label` | Narrative reference: `{chapterId}[/{topicId}]` |
| `o-ref` (`OdipORef`) | `<span data-o-ref="{value}" data-label="{label}">` | `value`, `label` | O* reference: opaque O* itemId |
| `d-ref` (`OdipDRef`) | `<span data-d-ref="{value}" data-label="{label}">` | `value`, `label` | Strategic document reference: refdoc id |

Each mark stores two attributes: `value` (the stable target identifier) and `label` (cached display text — code/title/name — may be absent on legacy imported marks). Each mark exposes `set{X}({ value, label })` / `unset{X}()` TipTap commands for programmatic authoring.

In read-only mode, spans are styled as clickable links and a delegated click listener fires `onInternalLink(type, value)`. Navigation is implemented by the caller; the component is navigation-agnostic.

**Read-only mode** — `editable: false` is set on the TipTap instance; the toolbar is omitted; `blur()` is called immediately after mount to prevent focus theft.

**Toolbar keyboard accessibility** — all toolbar buttons, the heading select, and dropdown menu items are created with `tabIndex = -1`. Tab therefore skips the entire toolbar and lands directly on the editor's content area. Toolbar controls remain accessible via mouse/click.

### 12.3 Integration with CollectionEntityForm

`CollectionEntityForm` manages `RichTextComponent` instances:

- **Edit/create** — `initializeRichTextEditors()` finds `.richtext-edit-placeholder` elements, mounts a `RichTextComponent` per field, wires `onChange` to a hidden `<input>`, and passes `linkProvider: this._getLinkProvider()` to enable reference authoring.
- **Read** — `initializeRichTextReadOnly()` finds `.richtext-readonly-placeholder` elements, mounts a read-only `RichTextComponent` per field, and passes `onInternalLink: this._onInternalLink` so reference spans are navigable.
- Instances are stored in `this.richTextComponents[fieldKey]` and destroyed in `cleanupRichTextComponents()`.

**`_getLinkProvider()`** — lazily builds a `linkProvider` from `context.app` on first call via `buildLinkProvider(app)`. Returns `null` when `context.app` is absent (e.g. standalone modal not owned by a details view), in which case only the external-link toolbar button is shown.

**Context fields consumed** (`context` passed at construction by `RequirementDetails` / `ChangeDetails`):

| Field | Used by |
|---|---|
| `app` | `_getLinkProvider()` — reference target preloading |
| `onInternalLink` | `initializeRichTextReadOnly()` — internal link click navigation |
| `onNavigate` | Read-mode reference chips (O\* / strategic document navigation) |

**`RequirementDetails` / `ChangeDetails`** pass `app: this.app` and `onInternalLink` in the context to `_ensureForm()`. Their `_handleInternalLink(type, value)` implementation resolves all three mark types against the active dataset context:

| Mark | Resolution | Target |
|---|---|---|
| `n-ref` | Direct — value is `{chapterId}[/{topicId}]` | `{ctxBase}/narrative/{chapterId}[?theme={topicId}]` |
| `o-ref` | `app.findOStar(itemId)` → resolves type | `{base}/os/{type}/{itemId}` |
| `d-ref` | Direct — value is refdoc id | `{ctxBase}/setup/reference-documents/{id}` |

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

### 12.6 Reference Authoring — `linkProvider` and `link-provider.js`

`RichTextComponent` supports authoring of `o-ref`, `n-ref`, and `d-ref` marks in edit mode when a `linkProvider` is injected by the owner. The provider is built via the factory `buildLinkProvider(app)` exported from `components/link-provider.js`.

**`buildLinkProvider(app)` — factory**

Accepts an `App` instance and returns a provider object with three methods:

| Method | Description |
|---|---|
| `load()` | Preload all target options (chapters, refdocs, O\*s) from the app cache. Returns a `Promise`; no-op if already loaded. |
| `options(type)` | Return `Array<{ value: string, label: string }>` for `'o-ref'`, `'n-ref'`, or `'d-ref'`. Synchronous after `load()`. |
| `isLoaded()` | Returns `true` once `load()` has completed. |

**Target preloading** — one `Promise.all` on first `load()` call, parallel to the three app caches:

| Mark type | Source | `value` | `label` |
|---|---|---|---|
| `n-ref` | `app.getChapters()` | chapter `itemId` (string) | `"{code} — {title}"` |
| `d-ref` | `app.getSetupData().referenceDocuments` | refdoc `id` (string) | refdoc `name` |
| `o-ref` | `app.getOStars()` | O\* `itemId` (string) | `"{code} — {title}"` |

O\* volumes are bounded (hundreds); preloading is cheap and avoids per-keystroke API calls. If volume demands it, the interface supports swapping to async search behind the same `options(type)` contract without touching consumers.

**Owner responsibility** — `ChapterBody` is the reference implementation. It lazily creates a single `linkProvider` instance (stored as `this._linkProvider`) and passes it to `RichTextComponent` only in edit mode:

```js
linkProvider: editable
    ? (this._linkProvider ??= buildLinkProvider(this._app))
    : null,
```

`RequirementDetails` and `ChangeDetails` follow the same pattern when O\* rich-text fields are opened in edit mode.

### 12.7 Toolbar Structure

The toolbar is organised in groups (`.rich-text-component__toolbar-group`), rendered left to right:

| Group | Buttons | Condition |
|---|---|---|
| Text formatting | Bold · Italic · Underline · Strikethrough | always |
| Headings | H1 · H2 · H3 | `headings: true` only |
| Lists | Bullet list · Ordered list | always |
| Links | 🔗 External link · `#` Insert reference | `#` button only when `linkProvider` present |
| Images | 🖼 Insert image | `images: true` only |
| Tables | ⊞ Insert · +row · -row · +col · -col · ✕tbl | `tables: true` only |

The toolbar is `position: sticky; top: 0` so it remains visible when the ancestor container scrolls.

**Reference picker (`#` button)** — opens a modal overlay (`.rich-text-ref-popup`) with:
- A type selector row: **O\*** (`o-ref`) · **Narrative** (`n-ref`) · **Document** (`d-ref`)
- A `ReferenceManager` typeahead mounted below, preloaded from the `linkProvider`

On selection, `_applyRef(type, value, label)` applies the matching mark to the current selection. When the selection is empty, the label is inserted as text first, then marked. The editor selection is captured before the overlay opens (DOM focus shift) and restored on apply via `setTextSelection`.

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
│   │   └── os-additions.css              O* toolbar, search input, type badges, view controls
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
[ grouping | counts ]                ← view controls row
[ MasterDetail: list | detail ]
```

**Search:** free-text input (debounced 300ms), maps to `text` parameter — visually separate from structured filters.

**Filter bar:** Type · Domain · Maturity · Stakeholder · Implements · Strategic Document.

**Grouping:** Type · Domain · Maturity.

**Column set:**

| Column | Applies to | Sortable |
|---|---|---|
| Type | all | Yes |
| Code | all | Yes |
| Title | all | Yes |
| Maturity | all | Yes |
| Domain | all | Yes |
| Implements | OR, OC | No |
| Refines | ON, OR | No |
| Strategic Documents | ON only | No |
| Impacted Stakeholders | OR, OC | No |

**Virtual field:** `item.implements` is pre-computed in `OStarEntity.onDataUpdated()` — merges `implementedONs` (OR) and `implementedORs` (OC) into a single array for the Implements column renderer.

**OC type normalisation:** OCs from `/operational-changes` have no `type` field — normalised to `'OC'` in `_loadData()` after merge.

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
[ grouping | counts                                        ]
[ list panel                    ‖ detail panel              ]
```

The +ON / +OR / +OC create buttons moved from the view controls row (owned by `OStarEntity`) to the toolbar row (owned by `OsActivity`). This eliminates visual competition between create buttons and detail action buttons.

Create buttons are only rendered in live (non-read-only) context. They delegate to `_ostarEntity._handleCreate(type)`.

### 21.2 Detail Panel Header

The detail panel (`RequirementDetails` / `ChangeDetails`) uses a single toolbar row:

```
[ title (fills available space) · · · · Edit  Full page ]   ← panel mode
[ title (fills available space) · · · In collection  In narrative ]  ← page mode
```

`os-detail__title` takes `flex: 1` and truncates with ellipsis. Action buttons are right-aligned, compact (`odip-btn`).

### 21.3 Plain Page ↔ Master Detail Navigation

Two action buttons per detail view, mode-dependent:

| Mode | Button | Action |
|---|---|---|
| Panel | **Full page** | Pushes `/{base}/os/{type}/{id}` to browser history |
| Page | **In collection** | Navigates to `/{base}/os?perspective=coll&selected={id}` |
| Page | **In narrative** | Navigates to `/{base}/narrative/{chapterId}?on={id}`, `?or={id}`, or `?oc={id}` |

**`In narrative` navigation** — `OsActivity._navigateToNarrative(item)` resolves the chapter by matching `item.domain` against `app.getChapters()` (cached). On match, pushes a typed URL: `?on=` for ONs, `?or=` for ORs, `?oc=` for OCs (absence of `item.type` implies OC). Falls back to `/{base}/narrative` if no chapter is found. `normalizeId` is used to serialise the chapter `itemId` in the URL.

**Callback injection** — callbacks are passed into `render()` on every call (not at construction), ensuring cached instances always receive correct wiring:

```js
await this._requirementDetails.render(container, id, 'panel', {
    onFullPage: (item) => this._navigateToFullPage(item),
});

await this._requirementDetails.render(container, id, 'page', {
    onInCollection: (item) => this._navigateToList(item),
    onInNarrative:  (item) => this._navigateToNarrative(item),
});
```

**Search param restore** — `_restoreFromSearchParams()` is called once after `_renderList()` completes. It reads `?selected`, sets `sharedState.selectedItem`, then calls `_handleItemSelect()` for panel render. `?perspective` is accepted in the URL for compatibility but ignored — only the collection perspective exists. Params are cleaned via `replaceState` after consumption.


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

## 18. Narrative Activity

The Narrative sub-activity (`activities/workspace/shared/narrative/`) provides editorial access to chapter narratives and O* organisation within ODIP editions.

### 18.1 Layout

Two-pane `MasterDetail` layout (20% / 80% initial ratio):

- **Left panel** — `ChapterToc`: chapter tree (ODIP scope) or topic/O* tree (chapter scope)
- **Right panel** — `ChapterBody`: chapter narrative, topic card list, or O* detail view

A toolbar row is always rendered above the `MasterDetail`, in both Elaborate and Explore. It has two slots:

- **Left slot** (`narrative-activity__toolbar-nav`) — in chapter scope, shows **← Chapters** (climbs to ODIP scope) and the current chapter name (selects chapter narrative); empty in ODIP scope.
- **Right slot** (`narrative-activity__toolbar-actions`) — in Elaborate, shows **+ Theme · + ON · + OR · + OC** (`odip-btn odip-btn--create`); absent in Explore.

Create buttons are disabled until a chapter is dived into (`NarrativeActivity._setToolbarEnabled`). Back/chapter nav is injected by `NarrativeActivity._updateToolbarNav()` on scope transitions. See §18.8.

### 18.2 Scope State Machine

| Scope | TOC | Body default |
|---|---|---|
| `odip` | Full chapter tree; expand/collapse; select / dive → | Chapter narrative (read-only) |
| `chapter` | topic/O* tree | Chapter narrative (editable in Elaborate) |

Navigation between scopes (← Chapters, current chapter name) lives in the toolbar left slot, not the TOC. In chapter scope, selecting the chapter node makes the **chapter narrative** editable; selecting a topic node makes that **topic narrative** editable (Elaborate only). The toolbar create actions are enabled on dive and disabled on climb (`NarrativeActivity._setToolbarEnabled`).

### 18.3 Sub-Path and Query Parameter Routing

| URL pattern | Behaviour |
|---|---|
| `{base}/narrative` | ODIP scope — chapter tree |
| `{base}/narrative/{chapterId}` | Chapter scope — dive into chapter by numeric `itemId` |
| `{base}/narrative/{chapterId}?theme={topicId}` | Chapter scope + select topic by numeric string ID |
| `{base}/narrative/{chapterId}?on={itemId}` | Chapter scope + select and render a specific ON |
| `{base}/narrative/{chapterId}?or={itemId}` | Chapter scope + select and render a specific OR |
| `{base}/narrative/{chapterId}?oc={itemId}` | Chapter scope + select and render a specific OC |

`{base}` is `/elaborate` (live dataset) or `/explore/{editionId}` (edition context).

`NarrativeActivity._selectTopic(topicId)` — called after diving when `?theme=` is present. Finds the topic by `id` field in `osHierarchy.topics`, then delegates to `ChapterToc.selectTopicByIndex(idx)`.

`NarrativeActivity._selectOStar(ostarId, type)` — called after diving when `?on=`, `?or=`, or `?oc=` is present. The type is derived directly from the param name — no `app.findOStar()` call needed. Calls `ChapterToc.setActiveByItemId(id)` then `ChapterBody.renderSelectionRead({ type: 'ostar', ostar: { id, type } }, chapter)`. `?theme` and the typed O* params are mutually exclusive.

**Same-chapter navigation:** `handleSubPath` short-circuits when the incoming `chapterId` matches `_selectedChapter` — but still consumes `?theme`/`?on`/`?or`/`?oc` query params before returning. This ensures that Ctrl+Click on an `n-ref` within the currently open chapter correctly selects the target topic or O* without a full chapter reload.

### 18.4 ChapterToc External API

| Method | Description |
|---|---|
| `renderOdip(chapters, selectedId)` | Render full chapter tree (ODIP scope). No title header — TOC content is self-evident. |
| `renderChapter(chapter)` | Render topic/O* tree for a single chapter. No back/chapter-name header — navigation lives in the toolbar. |
| `setActiveKey(key)` | Highlight a TOC entry by its `data-key` |
| `setActiveByItemId(id)` | Highlight the O* entry matching `id`; expands ancestors |
| `setActiveByTopicId(id)` | Highlight the topic/subtopic entry matching the stable string `id`; expands collapsed ancestors; fires `onChapterSelect`. Used when navigation originates from a subtheme card in the body panel. |
| `selectTopicByIndex(idx)` | Programmatically select a top-level topic by zero-based index; equivalent to user click; fires `onChapterSelect` callback |
| `refreshTree()` | Rebuild the chapter-scope tree from the current `_hierarchy` while preserving the active selection highlight and scroll position. Used after out-of-band hierarchy changes (theme create, rename, delete, O* create/edit) |

**Constructor callbacks:**

| Callback | Signature | Description |
|---|---|---|
| `onOdipSelect` | `(chapter)` | ODIP scope label click — selection + body render |
| `onDive` | `(chapter)` | Dive into chapter scope |
| `onClimb` | `()` | Climb back to ODIP scope |
| `onFocusOdip` | `()` | Transfer keyboard focus to ODIP TOC shell — called by chapter TOC on ← at top level |
| `onChapterSelect` | `(entry)` | Chapter scope node click |
| `onHierarchyChange` | `(hierarchy)` | Fired after each DnD mutation (Elaborate only) |
| `onUnclassifiedChange` | `(hierarchy)` | Fired when an O* moves into/out of unclassified |

**Keyboard navigation** — both TOC shells (`#chapterTocOdip`, `#chapterTocChapter`) have `tabindex="0"` and handle `keydown`. Navigation moves the **selection** directly (identical to a click — fires the same callbacks and renders the body):

| Key | ODIP TOC | Chapter TOC |
|---|---|---|
| ↑ / ↓ | Move selection to prev/next visible chapter node | Move selection to prev/next visible entry; scrolls into view |
| → | Expand collapsed node; if already expanded → dive into chapter | Expand collapsed topic; if expanded → move to first child |
| ← | Collapse expanded node | Collapse expanded topic; if collapsed → move to parent; at top level → transfer focus to ODIP TOC via `onFocusOdip` |
| Enter / Space | Activate selected node (same as click) | Activate selected entry (same as click) |

### 18.5 ChapterBody Renderers

| Entry type | Renderer | Notes |
|---|---|---|
| `chapter` | `_renderChapterNarrative` | Full narrative; editable in Elaborate |
| `topic` | `_renderTopic` | Title input · narrative · O* cards · subtheme cards; editable in Elaborate |
| `subtopic-by-id` | — | Synthetic entry fired by subtheme card click; intercepted by `NarrativeActivity._handleChapterTocSelect` which delegates to `ChapterToc.setActiveByTopicId` and returns — re-enters as `topic` |
| `unassigned` | `_renderUnassigned` | O*s with no topic placement |
| `ostar` | `_renderOStar` | `RequirementDetails` or `ChangeDetails` panel; **Full page** button available (navigates to `{base}/os/{type}/{id}`) |

**Topic body layout** — `_renderTopic` renders in this order:
1. **Title** — in Elaborate: `odip-input.chapter-body__topic-title` (saves on blur or Enter; reverts on Escape). In Explore: plain `<h3>`.
2. **Narrative** — editable `RichTextComponent` in Elaborate; read-only when non-null in Explore.
3. **O* card list** — direct O*s of the theme (ONs, ORs, OCs); no empty message.
4. **Subtheme card list** — rendered after O*s when `subTopics.length > 0`; each card shows a `▸` icon and the subtheme label with a count hint `(n)`. Clicking navigates to the subtheme via `subtopic-by-id` entry type.

**Delete theme** — in Elaborate, a **Delete theme** `odip-btn--danger` button is shown in the body header actions when the theme has no O*s and no subtopics (`items.length === 0 && subTopics.length === 0`). Clicking opens an `odipConfirm` dialog (`components/user-dialogs.js`) before delegating to `onThemeDelete(topicId)` → `NarrativeActivity._handleThemeDelete`.

### 18.6 Internal Link Navigation

`ChapterBody._handleInternalLink(type, value)` — called via `onInternalLink` from `RichTextComponent`. Resolves the link, passes through `_guardNavigation()`, then calls `app.navigate()`:

| Mark type | Resolution | Target URL |
|---|---|---|
| `n-ref` | Value is `{chapterId}[/{topicId}]` — navigate directly, no lookup | `{base}/narrative/{chapterId}[?theme={topicId}]` |
| `o-ref` | `app.findOStar(itemId)` resolves type; stale-while-revalidate via `app.getOStars()` | `{base}/os/{type}/{itemId}` |
| `d-ref` | Direct — value is refdoc id | `{base}/setup/reference-documents/{id}` |

**Edit mode — Ctrl+Click:** In read-only mode, any click on an internal ref span fires `onInternalLink`. In edit mode, only `Ctrl+Click` (or `Cmd+Click` on Mac) fires it — plain clicks are passed through to TipTap for normal cursor placement. While Ctrl/Cmd is held, the class `rich-text-component__editor--ctrl` is toggled on the editor element, triggering a `cursor: pointer` CSS rule on ref spans as a visual affordance. The class is removed on `keyup` and on `window blur` (to prevent it getting stuck when the user Alt-Tabs while holding Ctrl). The `keydown`/`keyup` listeners are registered once per `RichTextComponent` instance and removed in `destroy()`.

### 18.7 OsHierarchy Theme Model

Each topic in `osHierarchy.topics` carries:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Chapter-scoped unique ID; first free positive integer as string (`"1"`, `"2"`, …) |
| `topic` | string | Display label |
| `narrative` | string\|null | Optional TipTap JSON string; rendered above O* list |
| `ons`, `ors`, `ocs` | `OsHierarchyItem[]` | Enriched O* references (read path) |
| `subtopics` | `OsHierarchyTopic[]` | Recursive sub-themes |

IDs are first assigned at import time by `DistributedEditionImporter._patchChapterOsHierarchy` using a chapter-scoped counter (DFS order, starting at 1). The same ID is used in `n-ref` mark values for intra-chapter navigation. When a theme is created from the web client, `ChapterToc._nextFreeTopicId(hierarchy)` mirrors this counter (DFS max + 1) so client-assigned IDs stay consistent with the import scheme.

### 18.8 Editorial Actions (Elaborate)

The toolbar create actions and topic-editing all mutate the chapter `osHierarchy` and persist via `PATCH /chapters/{id}`. The active topic at action time is resolved by `ChapterToc._getActiveTopicPath()`, which returns `{ topicIndex, subPath }` for the selected topic/subtopic, or `null` when the chapter node or an O* is active.

| Action | Flow |
|---|---|
| **+ Theme** | `NarrativeActivity._handleAddTheme(activePath)` — minimal title modal → fetch-fresh chapter → insert new topic as child of the active topic (or at root if none) → PATCH → `ChapterToc.refreshTree()` |
| **+ ON/OR/OC** | `_handleAddOStar(type, activePath)` — open `RequirementForm`/`ChangeForm` create modal pre-populated with the chapter `domain` (and `type` for OR/ON) → on save, `_insertOStarIntoHierarchy`: fetch-fresh → insert the new O* into the active topic's items (sorted ON→OR→OC), or leave unclassified if no topic is active → PATCH → `refreshTree()` → `app.invalidateOStars()` |
| **Theme title / narrative** | `ChapterBody._saveTopicFull(topic, topicId)` (Save button, or from guard dialog) → `onTopicFullSave(topicId, title, narrative)` → `NarrativeActivity._handleTopicFullSave`: fetch-fresh → DFS-locate topic by `id` → mutate both `topic` label and `narrative` in one pass → PATCH → sync both into live `_toc._hierarchy` → `refreshTree()` only when title changed. A single PATCH is always used regardless of which fields changed, to avoid `versionId` conflicts from sequential patches. |
| **Delete theme** | `ChapterBody._deleteTheme(topicId)` (button visible only when `items.length === 0 && subTopics.length === 0`) → `onThemeDelete(topicId)` → `NarrativeActivity._handleThemeDelete`: fetch-fresh → defensive non-empty guard → `_removeTopicById` → PATCH → `refreshTree()` → body falls back to chapter narrative |

**Concurrency model:**

- **Non-DnD writes** (theme create/rename/delete, O* insert, topic narrative) use a **fetch-fresh** pattern — `GET /chapters/{id}` immediately before mutating, so the PATCH carries the latest `expectedVersionId`. This avoids conflicts from background chapter edits.
- **DnD reorder** (`_handleHierarchyChange`, `_handleUnclassifiedChange`) uses the **optimistic** client `versionId`. On `409`, `_handleDndConflict` reloads the chapter, re-renders the TOC, resets the body, and informs the user that the change was not applied.

`_mergeChapterConfig(cached, fresh)` reconciles a freshly fetched chapter with config-owned fields (`title`, `domain`, `position`) held in memory, and syncs `versionId`/`osHierarchy` back to the cached object.

**Unsaved-changes guard (Elaborate only):**

`ChapterBody` tracks a `_dirty` flag (set by `RichTextComponent.onChange` and the title input's `input` event) and a `_currentEntry` field (the last `entry` passed to `renderSelectionRead`). Before any navigation that would replace the body content, `_guardNavigation()` is called:

- If not dirty → proceed immediately.
- If dirty → show `odipUnsavedChanges()` (§25.2):
    - **Cancel** → return false; navigation aborted, user stays in editor.
    - **Discard** → clear dirty flag, return true; navigation proceeds.
    - **Save** → call `_saveCurrentEntry()` (routes to `_saveNarrative` or `_saveTopicFull` based on `_currentEntry.type`); on success return true; on error surface the error and return false.

Navigation paths guarded:

| Trigger | Guard location |
|---|---|
| TOC click / O* card / subtheme card | `ChapterBody.renderSelectionRead()` |
| Ctrl+Click on internal ref (edit mode) | `ChapterBody._handleInternalLink()` |
| ← Chapters toolbar button | `NarrativeActivity._climbToOdip()` |
| Elaborate tab switch (O*s, Plan, Setup…) | `ElaborateActivity._route()` via `canDeactivate()` |
| Top-level activity switch (Home, Manage…) | `App._loadActivity()` via `canDeactivate()` chain |
| Browser Back / F5 / tab close | `beforeunload` listener (generic browser warning; registered on `window` in `_renderShell`, removed in `cleanup`) |

`NarrativeActivity.canDeactivate()` delegates to `this._body._guardNavigation()`. `ElaborateActivity.canDeactivate()` forwards to the current sub-activity's `canDeactivate()` if present.

**Duplicate instance prevention:** `NarrativeActivity` instances are cached by `ElaborateActivity` — `render()` may be called again on the same instance when the user returns to the Narrative tab. `render()` tears down any existing `_toc`, `_body`, and `_masterDetail` (including removing the `beforeunload` listener) before calling `_renderShell()`, preventing duplicate `RichTextComponent` instances with stale click listeners from accumulating.

### 18.9 Save Propagation

`CollectionEntityForm` fires an optional `onSaved(result, mode)` callback after any successful create or edit (`mode` is `'create'` | `'edit'`), in addition to the legacy `entitySaved` DOM event. Callers opt in by passing `onSaved` in the form `context`.

The detail views forward it with a self-refresh:

- `RequirementDetails` / `ChangeDetails` capture `callbacks.onSaved` on every `render()` and route the form's `onSaved` through `_handleSaved(result, mode)`, which **re-renders its own panel** from the server (so edited fields show immediately) and then forwards to the caller's `onSaved`.

Consumers of the forwarded callback:

| Consumer | Wiring | Effect on save |
|---|---|---|
| `NarrativeActivity` | `ChapterBody` `onOStarSaved` → `_handleOStarSaved` | Re-fetch chapter (enriched hierarchy) → `ChapterToc.refreshTree()` so a changed O* title updates in the tree without losing selection or scroll |
| `OsActivity` | `onSaved` on the panel-mode detail render | `_loadData()` re-fetches the collection so the master list row reflects the edit |

This single mechanism replaces ad-hoc reload logic and works identically in both the OS and Narrative perspectives.

### 18.10 Service Layer Enrichment Contract

`ChapterService` overrides both `update()` and `patch()` from `VersionedItemService`:

```
async update(itemId, payload, expectedVersionId, userId)
async patch(itemId, patchPayload, expectedVersionId, userId)
```

Both call `super.update/patch` (which commits the write transaction) then immediately call `this.getById(itemId, userId)` (enriched `GET`) and return its result. This guarantees that **every write to a chapter returns the same enriched read-shape as `GET /chapters/{id}`** — `osHierarchy` items are always `{ id, type, code, title }` objects, never bare integer ids.

**Invariant:** client code must never use `updated.osHierarchy` from a PATCH response to rebuild the render-side hierarchy via a second `getChapter()` call. The PATCH response is already enriched. Workaround patterns (`_fullyLoaded = false`, redundant re-fetches) are prohibited.

---

## 24. O* Form Layout Configs

The ON/OR/OC forms (`RequirementForm`, `ChangeForm`) are driven by two declarative layout configs exported from `requirement-form-fields.js` / `change-form-fields.js`. The configs replace the former single `getFieldDefinitions()` section catalogue: layout and field metadata now live together, and the edit config is the single source of truth for validation, data collection, and manager initialisation.

### 24.1 Two Configs

| Config | Returned by | Role |
|---|---|---|
| `*ReadConfig` | `getReadConfig()` | Read-mode layout only — keys plus layout hints. Field metadata is resolved from the edit config field map at render time. |
| `*EditConfig` | `getEditConfig()` | Edit/create layout **and** full field metadata (type, label, required, options, validation, placeholder, helpText). Source of truth for `validateForm`, `collectFormData`, manager init, and `restoreVersionToForm`. |

Both share a common shape: `{ sections: [ { title, modes?, fields: [...] } ] }`. Field `key` is the contract linking read entries to their metadata in the edit config.

### 24.2 Section Properties

| Property | Meaning |
|---|---|
| `title` | Tab label. |
| `modes` | Optional `['create' \| 'edit']`. Restricts the section to the listed modes; absent means both. Used to hide `Derived` and `Metadata` sections in create mode. |
| `fields` | Ordered list of field entries and row wrappers. |

### 24.3 Field Entry Properties

A `fields` entry is either a bare field (`{ key, ... }`) or a row wrapper (`{ row: [ ...fields ], valueInline? }`).

| Property | Applies | Meaning |
|---|---|---|
| `key` | field | Field identifier; in the edit config the entry also carries full metadata. |
| `visibleWhen` | field | `'ON'` \| `'OR'` (matched against `item.type`) or `(item) => bool`. Absent = always visible. |
| `readOnly` | field (edit) | Renders as display value in edit mode; suppressed entirely in create mode. Used for `itemId`, `version`, `_history`, and the derived `refinedBy` / `implementedBy`. |
| `confirmOnChange` | field (edit) | Intercepts the field's change event; the user must confirm before the new value is accepted. Applied to `domain`. |
| `hideIfNullOrEmpty` | field (read) | When the value is null, empty string, or empty array, the field is not rendered. Default false. Applied to forward-reference fields (`refinesParents`, `implementedONs`, `dependencies`, `implementedORs`, `decommissionedORs`) so empty relations vanish in read mode. Derived fields deliberately omit it and always render. |
| `row` | wrapper | Array of field entries rendered side-by-side. A single visible child collapses to full width (unless `valueInline`). No visible children → the row emits nothing. |
| `valueInline` | row | When true, the row's fields render label and value on one line (`label \| value`) via the `form-row--inline` class, and even a single visible field stays wrapped so the inline styling applies. Used for compact metadata pairs (`maturity`/`tentative`, `itemId`/`version`). |

### 24.4 Renderer

`CollectionEntityForm._generateFormFromConfig()` consumes the active config:

- `_buildFieldMap()` flattens the **edit** config (including row children) into `Map<key, hydratedFieldDef>`, calling `hydrateField()` per entry; cached by `_getFieldMap()`.
- `_isSectionVisibleFromConfig()` applies section `modes` and per-field `visibleWhen`.
- `_renderConfigEntry()` / `_renderConfigRow()` handle bare fields and `row` wrappers, applying `hideIfNullOrEmpty` and `valueInline`.
- `_resolveFieldDef()` looks up metadata by key from the field map; `_resolveEntryVisible()` evaluates `visibleWhen`.
- `_attachConfirmOnChangeListeners()` wires `confirmOnChange` fields after the modal DOM is ready (called from each form's modal-ready hook). The handler is async and uses `odipConfirm` from `components/user-dialogs.js` with the message `Do you really want to re-assign this ${type} to another domain?` — replacing `window.confirm`.

There is no header/strip concept: `code` and `title` are shown in the detail toolbar (`requirement-details.js` / `change-details.js` render `code — title`, matching the TOC), not repeated inside the form body.

### 24.5 Ancillary Exports

The `*-form-fields.js` modules also export the save-path helpers consumed by `transformDataForSave`: `requiredIdentifierArrayFields`, `requiredAnnotatedReferenceArrayFields` (requirement only), `requiredTextFields`, `optionalTextFields` (change only), the `*FormTitles` map, and `*Defaults`.

---

## 25. User Dialogs — `components/user-dialogs.js`

Shared module for ODIP-styled interactive dialogs. Replaces browser-native `window.confirm` / `window.alert` with modal overlays that use existing `.modal-overlay`, `.modal`, `.modal-body`, `.modal-footer`, and `odip-btn` CSS classes — no new CSS required.

### 25.1 `odipConfirm(message)`

```js
import { odipConfirm } from '../../../../components/user-dialogs.js';
const confirmed = await odipConfirm('Are you sure?');
```

Returns `Promise<boolean>`. Renders a small modal (z-index 2000, above edit modals at 1000) with the message, a **No** button (`odip-btn--standard`) and a **Yes** button (`odip-btn--primary odip-btn--standard`). The Yes button is auto-focused for keyboard accessibility. Resolves `true`/`false` on button click; the overlay removes itself.

**Current callers:**

| Caller | Message |
|---|---|
| `CollectionEntityForm._attachConfirmOnChangeListeners` | `Do you really want to re-assign this ${type} to another domain?` |
| `ChapterBody._deleteTheme` | `Do you really want to delete this theme?` |

### 25.2 `odipUnsavedChanges(message?)`

```js
import { odipUnsavedChanges } from '../../../../components/user-dialogs.js';
const answer = await odipUnsavedChanges('You have unsaved changes. What would you like to do?');
// answer: 'save' | 'discard' | 'cancel'
```

Returns `Promise<'save' | 'discard' | 'cancel'>`. Renders a modal with three buttons (left to right): **Cancel** (`odip-btn--standard`), **Discard** (`odip-btn--danger odip-btn--standard`), **Save** (`odip-btn--primary odip-btn--standard`). The Save button is auto-focused. Pressing Escape resolves to `'cancel'`. The `message` parameter defaults to `'You have unsaved changes.'`.

**Current callers:**

| Caller | Context |
|---|---|
| `ChapterBody._guardNavigation` | Shown when leaving an unsaved chapter narrative or topic (title/narrative) in Elaborate |

---

## 20. Quality Activity

`QualityActivity` (`activities/workspace/shared/quality/quality.js`) provides on-demand dataset quality checks. It operates in both Elaborate (live dataset) and Explore (edition snapshot) contexts — context is read transparently from `app.getDatasetContext()`.

### 20.1 Layout

Full-width scrollable page. No `MasterDetail` layout — the report is self-contained.

- **Toolbar** — **Run checks** button + last-run timestamp (session-only, cleared on page refresh)
- **Report area** — summary banner + one collapsible domain section per domain in scope

### 20.2 Context Awareness

On **Run checks**, `QualityActivity` reads `app.getDatasetContext()`:

| Context | API call |
|---|---|
| `{ type: 'live' }` | `GET /quality/checks` (live dataset) |
| `{ type: 'edition', editionId }` | `GET /quality/checks?edition={editionId}` (edition snapshot) |

This is the same transparent context pattern used by all other sub-activities — `QualityActivity` does not know which shell (Elaborate or Explore) it is mounted in.

### 20.3 Report Structure

The response is a `QualityReport` (defined in `@odp/shared` `quality-elements.js`):

```js
{
  runAt:         string,           // ISO timestamp
  rules:         QualityRule[],    // registered rules — drives section headers
  domainReports: DomainQualityReport[]  // one entry per domain, always present
}
```

Each `DomainQualityReport` contains one array per rule — always present, empty when no findings:

```js
{
  domain:               string,
  brokenONTraceability: BrokenONTraceability[]
}
```

Each `BrokenONTraceability` entry carries `{ onId, onCode, onTitle, onVersionId }` — sufficient to render a navigable link and detect staleness on tab return.

### 20.4 Finding Navigation

Clicking an ON code link navigates to the O* detail page in the correct workspace:

| Context | Target URL |
|---|---|
| Elaborate | `/elaborate/os/on/{onId}` |
| Explore | `/explore/{editionId}/os/on/{onId}` |

### 20.5 Report Persistence Across Tab Switches

Results are held in `QualityActivity._report` (instance memory). They are not cached in `App` and not persisted to the server.

`ElaborateActivity` and `ExploreActivity` cache sub-activity instances — `QualityActivity` is not destroyed on tab switch. `cleanup()` intentionally preserves `_report` and `_runAt`, clearing only `container` and `_running`. When the user returns to the Quality tab, `render()` detects an existing report and restores it immediately — no re-run required.

The report is discarded only when the top-level workspace shell is torn down (top-level activity switch). The "Last run" timestamp tells the user when the report was generated; they can re-run explicitly at any time.

**Staleness detection on tab return:** when `render()` is called on an existing report, `_renderReportWithStaleness()` calls `app.getOStars()` (which will be fresh if the user just edited an ON via `invalidateOStars()`) and compares each flagged ON's stored `onVersionId` against the current cache value. ONs whose `versionId` has changed are marked "possibly fixed" (amber badge, dimmed row) — a non-definitive hint that the issue may have been resolved. Re-running confirms. If the cache is unavailable the report renders without indicators.

### 20.6 API Client

`apiClient.runQualityChecks({ domains?, editionId? })` — added to `shared/api-client.js`:

```js
async runQualityChecks({ domains = [], editionId = null } = {}) {
    const params = {};
    if (domains.length > 0) params.domain = domains.join(',');
    if (editionId !== null)  params.edition = editionId;
    return this.get('/quality/checks', { params });
}
```

### 20.7 Extensibility

Adding a new quality rule requires no web client code change — `QualityActivity` renders rule sections dynamically from `report.rules`. The only client change needed when a new rule is implemented is adding a renderer for the new finding array in `_renderDomainReport()`.

---

[← 07 CLI](07-CLI.md) | [09 Deployment →](09-Deployment.md)