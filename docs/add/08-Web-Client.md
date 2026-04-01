# Chapter 08 – Web Client

## 1. Overview

The ODIP web client is a Vanilla JavaScript single-page application (no framework). It communicates exclusively with the REST API and shares data models with the server via the `@odp/shared` workspace package. The deliberate absence of a framework keeps the prototype flexible and avoids build complexity while still enforcing consistent component patterns through class-based inheritance and delegation.

---

## 2. Application Structure

```
web-client/src/
├── activities/
│   ├── landing/          User identification, activity tiles, connection status
│   ├── setup/            Setup entity management + TreeEntity, ListEntity base classes
│   ├── elaboration/      OR/OC authoring and browsing
│   ├── planning/         ON/OC deployment and implementation planning
│   ├── prioritisation/   OC bandwidth balancing and wave assignment (§13)
│   ├── publication/      ODIP Edition management and export
│   └── review/           Edition review interface (read-only)
├── components/
│   ├── common/         Global navigation, error handling
│   └── odp/            CollectionEntity, TreeTableEntity, TemporalGrid, form base classes
└── shared/             API client, utilities, error handling
```

### Three-Layer Navigation Hierarchy

Every activity follows the same structural pattern:

- **Layer 1** — Global chrome: persistent top navigation (`Landing | Setup | Elaboration | Planning | Prioritisation | Publication | Review`), user context, connection status
- **Layer 2** — Activity workspace: activity-specific tabs, context selectors (edition picker), toolbars
- **Layer 3** — Entity interactions: CRUD operations, detail panels, forms, relationship management

---

## 3. Component Patterns

Four base component classes cover all entity management needs.

### 3.1 TreeEntity

Used for hierarchical setup entities (`StakeholderCategory`, `Domain`, `ReferenceDocument`). Located in `activities/setup/tree-entity.js`. Manages real parent–child relationships stored in the database as `REFINES` edges — `parentId` is never stored as a node property. Three-pane layout: tree navigation / item details / action buttons. Supports expand/collapse, parent reassignment, and context-sensitive actions (Add Child, Delete restricted to leaves).

Concrete subclasses declare only three things — no methods required:

| Declaration | Purpose |
|---|---|
| `entityLabel` | Singular display name (e.g. `'Domain'`) |
| `parentScope` | `'all'` — any non-self item as parent; `'roots'` — root items only (grandchildren blocked at UI level) |
| `fields` | Array of `{ name, label, type, required }` for entity-specific fields, appended after `baseFields` |

`TreeEntity` declares `baseFields = [{ name: 'description', label: 'Description', type: 'textarea', required: false }]` — rendered before subclass `fields` in all forms and detail views.

The parent field uses `ReferenceManager` (inline single-select typeahead, `components/odp/reference-manager.js`) instead of a native `<select>`. The manager is wired after modal DOM insertion via `_initParentRM(modal)` and destroyed on `closeModal`.

`ReferenceDocument` additionally overrides `getDisplayName()` to append the version. Its `parentScope` is `'all'`, supporting up to three levels (root / child / grandchild).

### 3.2 ListEntity

Used for flat setup entities (`Wave`, `Bandwidth`). Located in `activities/setup/list-entity.js`. Single-pane table with sortable columns, inline filtering, and direct CRUD operations.

### 3.3 CollectionEntity

Used for operational entities (ORs, OCs) in table/list perspective. Provides filtering, grouping, column configuration, row selection, and a details panel. Complex entities (requirements, changes) use **delegation** — the entity class owns a `CollectionEntity` instance and passes callbacks for filter config, column config, grouping config, and event handlers. This keeps entity-specific logic out of the base component.

### 3.4 TreeTableEntity

Used for tree-table perspectives on ORs/OCs and for the ON tree in the Planning activity. Builds tree structure from a flat entity list using a configurable `pathBuilder` function. The path builder returns a typed path array that drives both tree structure and per-node rendering via `typeRenderers`.

The `pathBuilder` may produce **virtual hierarchy** (e.g. `drg-folder → on-node` derived from entity attributes) or **graph-based hierarchy** (e.g. `parent-on-node → child-on-node` derived from real `refines` relationships). Both modes are supported without component modification — the distinction lives entirely in the `pathBuilder` implementation provided by the parent entity.

**Build algorithm invariants:**

- Each path item carries an `id` used as the node key. Intermediate nodes (folders, parent entities) must carry `entityId` so the build algorithm can attach the entity to the node for cell rendering.
- When a node already exists as a leaf but is later traversed as an intermediate node (parent processed before child in entity load order), it is demoted: `isLeaf = false`, `expandable = true`. This ensures correct rendering regardless of entity ordering.
- Column renderers receive `context` in the `item` argument position (3rd arg) due to a call-site convention in both `CollectionEntity` and `TreeTableEntity`. Affected renderers normalise with `context = context ?? item` at the top of their render function.

Filter matchers are injected as `options.filterMatchers` (same predicate map used by `CollectionEntity`), enabling consistent filter behaviour across all perspectives that share a `TreeTableEntity`.

### 3.5 CollectionEntityForm

Abstract base class for entity forms. Concrete forms (`RequirementForm`, `ChangeForm`) extend it and implement virtual methods: `getFieldDefinitions()`, `onSave()`, `onValidate()`, and optionally `transformDataForSave()` / `transformDataForEdit()`. The base class handles modal lifecycle, field rendering, validation orchestration, and error display.

**Field visibility (`visibleWhen`)** is evaluated in all modes including read. Fields whose `visibleWhen(item)` returns false are excluded from rendering. Section-level visibility is determined solely by whether any field in that section is included by `modes` — `visibleWhen` is not evaluated at section level. This means a section tab always appears if it has fields applicable to the current mode, even if all those fields are hidden by `visibleWhen` for the current item (producing a blank tab — intentional, preserves tab index stability across item switches).

**Computed reference fields** (`type: 'reference-list'` with `computeKey`) derive their value at initialisation time by calling a named method on the form instance rather than reading from `currentItem`. The `computeKey` string is wired in `hydrateField()` to produce a `compute(item)` function on the field definition. `initializeReferenceListManagers` calls `field.compute(this.currentItem)` when present, falling back to `getFieldValue(this.currentItem, field)` for non-computed fields.

**Context resolvers** — forms receive two mandatory resolver functions in their `context`:

| Resolver | Returns | Used by |
|---|---|---|
| `getSetupData()` | Setup data object (`stakeholderCategories`, `domains`, etc.) | `getSetupDataOptions`, `getReferenceDocumentOptions` |
| `getRequirements()` | Full live requirements array (ONs + ORs) | `_computeImplementedByIds`, `_computeRefinedByIds`, `getAllRequirementOptions` |

This decouples the form from the data source — Planning passes `() => this.requirements`, Elaboration passes `() => this.data`.

---

## 4. Multi-Perspective Pattern

Requirements and changes support multiple simultaneous perspectives (collection table, tree-table, temporal timeline) that share a single data load and common state. Key principles:

- **Single data load**: entities fetched once, distributed to all active perspectives
- **Shared state**: filters, selection, and grouping coordinated across perspectives
- **Shared handlers**: `onItemSelect` and `onCreate` wired identically to all perspectives
- **Perspective switching**: tab-driven, preserves selection and filter state

---

## 5. TemporalGrid Component

`TemporalGrid` (`components/odp/temporal-grid.js`) is a single generic component for all temporal visualisations. It renders a horizontal grid with a continuous **calendar-based time axis** and a structured row hierarchy. All domain knowledge lives in the caller.

### 5.1 Data Model

```javascript
// TimelineMilestone
{
  label: string,        // short display label
          description: string,  // tooltip / detail text
        eventTypes: string[], // one or more event type keys
        date: Date            // calendar position
}
```

### 5.2 Row Taxonomy

Four row kinds are supported, rendered in insertion order:

| Kind | Description |
|---|---|
| `separator` | Full-width label spanning both label and axis columns. No timeline track, no selection. Used as a visual section header (e.g. DrG name). |
| `group` | Label column + timeline track + expand/collapse toggle (`▶/▼`). Collapsing hides all child rows of this group. Expand state is preserved across re-renders. |
| `child` | Indented label column + timeline track. Visibility controlled by parent group's expanded state. |
| `timeline` | Flat label column + timeline track. No hierarchy — used by `ChangesEntity`. |

### 5.3 Public API

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
    'API_PUBLICATION':     { row: 0, col: 0, colour: '#3b82f6' },
    'UI_TEST_DEPLOYMENT':  { row: 0, col: 1, colour: '#8b5cf6' },
    'OPS_DEPLOYMENT':      { row: 0, col: 2, colour: '#10b981' }
  }
}
```

#### Row management

```javascript
addSeparatorRow(id, label)
addGroupRow(id, label, milestones)
addChildRow(id, parentId, label, milestones)
addRow(id, label, milestones)           // flat row — used by ChangesEntity
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

### 5.4 Connector Lines

When a row has two or more milestones visible within the current time interval, the component draws horizontal connector lines between adjacent milestones (sorted by date). Milestones outside the visible interval are not connected.

### 5.5 Zoom Control

`TemporalGrid` renders a zoom control bar above the grid — a single text input accepting `YYYY` or `YYYY-ZZZZ` format:

- Delegates parsing to `parseYearPeriod()` from `shared/year-period.js`.
- On valid input calls `setTimeInterval(startYear, endYear)`, which fires `timeIntervalListeners`.
- Absolute bounds (`minYear`, `maxYear`) are injected as constructor options (default `2025`–`2045`).

---

## 6. Temporal Perspective (Changes)

The `ChangesEntity` is the only entity in the Elaboration activity with a third perspective beyond collection and tree-table: the **temporal view**, implemented by `TemporalGrid` using flat `timeline` rows.

### 6.1 Layout

The temporal view renders a horizontal grid with a label column (change code/title) and a timeline track per row. Wave-based tick marks serve as the time axis.

### 6.2 Time Interval and Ticks

`ChangesEntity.calculateOptimalTimeWindow()` computes the default interval from `setupData.waves` (earliest to latest future wave) on first activation. It calls `temporalGrid.setTimeInterval(startYear, endYear)` and `temporalGrid.setTicks(waveTicks)` where `waveTicks` is the array of `{ label, date }` descriptors derived from `setupData.waves` using `implementationDate` as the wave date.

Changes with no milestones within the current time interval are excluded before `addRow` calls. `_feedTemporalGrid()` in `ChangesEntity` performs this pre-filter and calls `clearRows()` then re-adds all visible changes.

The zoom control (§5.5) is the primary user-facing mechanism for adjusting the interval.

### 6.3 Milestone Rendering

`ChangesEntity` configures `TemporalGrid` with pixmap-mode milestone rendering on construction:

```javascript
temporalGrid.setMilestoneRendering({
  mode: 'pixmap',
  rows: 1,
  cols: 3,
  eventTypes: {
    'API_PUBLICATION':     { row: 0, col: 0, colour: '#3b82f6' },
    'API_TEST_DEPLOYMENT': { row: 0, col: 0, colour: '#3b82f6' },
    'API_DECOMMISSIONING': { row: 0, col: 0, colour: '#3b82f6' },
    'UI_TEST_DEPLOYMENT':  { row: 0, col: 1, colour: '#8b5cf6' },
    'OPS_DEPLOYMENT':      { row: 0, col: 2, colour: '#10b981' }
  }
})
```

### 6.4 Connector Lines

When a change has two or more visible milestones, `TemporalGrid` draws horizontal connector lines between adjacent milestones (sorted by date).

### 6.5 Selection and State Sharing

`ChangesEntity` registers a selection listener on construction:

```javascript
temporalGrid.addSelectionListener((id) => this.handleTimelineItemSelect(id))
```

Selection state is stored in `sharedState.selectedItem` and restored when switching back to the temporal perspective via `temporalGrid.setTimeLineSelected(itemId, true)`.

### 6.6 Perspective Toggle UI

The perspective toggle buttons (`📋 Collection` / `📅 Temporal`) are rendered by `ChangesEntity.renderViewControls()` into the `#viewControls` container owned by `AbstractInteractionActivity`.

---

## 7. Rich Text

Rich text fields (`statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `purpose`, `initialState`, `finalState`, `details`) use the **Quill** editor. Content is stored and transmitted as Quill Delta JSON serialised to a string. The web client renders Delta content in read mode using Quill's read-only renderer and edits it with the full Quill toolbar in write mode.

Images can be embedded in Delta content as base64-encoded PNG data. The import pipeline handles the reverse path (Quill Delta → AsciiDoc → Word) for the docx round-trip workflow.

---

## 8. ODIP Edition Context

The edition picker (available in Elaboration, Planning, and Review activities) passes the selected edition ID directly to the API as `?edition=<id>`. Edition context resolution — mapping the edition to a baseline and optional wave — happens server-side. The web client never resolves `baselineId` or `startsFromWaveId` client-side.

`AbstractInteractionActivity.buildQueryParams()` implements this: when `config.dataSource` is a numeric edition ID, it adds `queryParams.edition = editionContext` to every list or get request. No additional API call is made to fetch the edition object for resolution purposes.

The Review activity (`review.js`) passes the edition ID directly as `config.dataSource` after target selection. All edition types (`DRAFT` and `OFFICIAL`) are available for review.

---

## 9. CSS Architecture

### 9.1 File Tree

```
styles/
├── main.css                          Design tokens, CSS reset, typography, layout utilities
├── primitives.css                    Buttons, form controls, spinners (atomic UI elements)
├── feedback-components.css           Toasts, error notifications, loading/skeleton states
├── layout-components.css             Top header, cards, modals
├── landing.css                       Landing page layout and activity tiles
├── components/
│   ├── filter-bar.css                FilterBar chip component (add filter, chips, suggestions)
│   ├── form-components.css           Form tabs, tag selector, multi-select, Quill integration
│   ├── history-tab.css               History version list, diff popup
│   ├── reference-list-manager.css    Inline chip list with search popup
│   ├── table-components.css          Collection table, row selection, grouping, empty states
│   ├── tree-table-components.css     Tree table with indentation levels
│   └── temporal-components.css       TemporalGrid base styles
└── activities/
    ├── activity.css                  Base layout for all activities (root, workspace, filters bar, tabs)
    ├── abstract-interaction-activity.css  Two-pane collection+details layout (elaboration, review)
    ├── elaboration.css               Elaboration-specific overrides
    ├── review.css                    Review-specific overrides and target selection screen
    ├── planning.css                  Planning two-pane layout, ON plan panes, TemporalGrid context
    ├── setup.css                     Setup entity tabs, three-pane layout, tree/list panes
    ├── publication.css               Publication-specific rules (edition count, action buttons)
    └── prioritisation.css            Prioritisation board layout, cards, load bars, backlog sub-rows
```

### 9.2 Layer Hierarchy

Files are loaded in strict dependency order: global → components → landing → activities.

**Global** (`styles/`) — no dependencies between files at this level. `primitives.css` is the lowest-level layer; all other files may reference the tokens defined in `main.css`.

**Components** (`styles/components/`) — depend only on global tokens. No component file references another component file or any activity file.

**Activities** (`styles/activities/`) — depend on global and component layers. Within the activities layer, the load order is:

1. `activity.css` — base for all activities
2. `abstract-interaction-activity.css` — extends `activity.css` for the collection+details pattern
3. Concrete activity files — extend either `activity.css` (planning, setup, publication) or `abstract-interaction-activity.css` (elaboration, review)

### 9.3 Activity CSS Responsibilities

| File | Extends | Owns |
|---|---|---|
| `activity.css` | — | Activity root layout, workspace flex chain, `.activity-filters`, `.interaction-tabs`, `.context-label`, `.no-selection-message` |
| `abstract-interaction-activity.css` | `activity.css` | Two-pane grid, `.collection-container`, `.collection-left-column`, `.collection-details`, perspective toggle, view controls, details panel internals |
| `elaboration.css` | `abstract-interaction-activity.css` | No current overrides |
| `review.css` | `abstract-interaction-activity.css` | Read-only indicators, target selection screen |
| `planning.css` | `activity.css` | ON plan two-pane layout, TemporalGrid context overrides, group/child row styles |
| `setup.css` | `activity.css` | Entity tabs, three-pane layout, tree/list pane styles |
| `publication.css` | `activity.css` | Edition count badge, publication action buttons, edition type badges |
| `prioritisation.css` | `activity.css` | Board layout, wave rows, DrG cells, OC cards, load bars, backlog sub-rows, collapse states |

### 9.4 Activity Headers

Activity-level headers (title + description blocks) have been removed from all activity pages. The global site header (`.odp-header`) is the sole persistent header. Context information (repository vs ODIP edition) is surfaced through the `.activity-filters` bar or the site header directly.

---

## 10. API Integration

The shared API client in `shared/` handles all `fetch` calls, base URL configuration, and error normalisation. All components use this client — no component issues `fetch` directly. The base URL is configured to target the API server port explicitly (`http://<hostname>:8080`) to support remote browser access.

### 10.1 Connection Monitoring

Connection monitoring is owned by `App` (`app.js`), not by any UI component. On initialisation, `App` calls `endpoints.health` (`/ping`) immediately and then polls every 60 seconds. Each check dispatches a `connection:change` custom event on `window` with `detail.status` set to `'connected'` or `'disconnected'`. `Header` listens to this event and updates the status indicator accordingly. No other component needs to handle the event unless it requires connection-awareness.

The 60-second interval is intentional — the application is a low-concurrency internal tool and does not require sub-minute liveness detection.

### 10.2 DiffPopup

`DiffPopup` (`components/odp/diff-popup.js`) renders a modal comparison between two versions of an entity. It is opened from the history tab and is the sole consumer of `Comparator` on the client side.

**Responsibilities:**
- Fetch both versions in parallel via `GET /{entityType}/{id}/versions/{versionNumber}`
- Delegate change detection to `Comparator` — passes `ignoreMilestones: false` for OC diffs so milestone changes are included
- Apply a second-pass false-positive filter on scalar/rich-text fields (suppresses cases where Quill JSON differs structurally but renders identically in plain text)
- Render field-level diffs: word-level Myers diff with character-level fallback for scalar/rich-text; added/removed chip columns for reference arrays; structured added/removed/modified blocks for milestones
- Provide an in-popup version selector to change the comparison target without reopening

**Change entry shapes produced by `Comparator`:**

| Field type | Shape |
|---|---|
| Scalar / rich text | `{ field, oldValue, newValue }` |
| Reference array | `{ field, oldValue: ref[], newValue: ref[] }` |
| Milestones | `{ field: 'milestones', added: milestone[], removed: milestone[], modified: [{name, changes: fieldChange[]}] }` |

**Known design debt:** `DiffPopup` currently uses `_isReferenceArrayField(fieldName)` (a hardcoded list of field names) and an explicit `change.field === 'milestones'` guard to drive rendering dispatch. The planned refactor will replace this with a `type` property on each change entry set by `Comparator`, making `DiffPopup` fully business-agnostic.

**False-positive filter caveat:** the second-pass filter operates on `oldValue`/`newValue` and must explicitly exempt any change entry that does not carry those properties (currently `milestones`). This exemption will be unnecessary once the type-based dispatch refactor is complete.

---

## 11. Planning Activity

The Planning activity (`activities/planning/`) supports deployment and implementation planning across two phases. Phase 1 (ON-based) is fully implemented. Phase 2 (OC-based) is reserved as a placeholder tab.

### 11.1 Navigation and Tab Structure

The Planning activity appears as a top-level nav tab alongside Elaboration. It uses the same edition picker as Elaboration (baseline + fromWave resolution, current working edition). The activity shell (`PlanningActivity`) renders two tabs:

| Tab | Status |
|---|---|
| `ON Plan` | Active — full implementation |
| `OC Plan` | Placeholder — disabled, renders "Coming soon" message |

### 11.2 Data Loading

`PlanningActivity.loadSetupData()` loads setup entities and requirements in a single `Promise.all`:

- Setup entities (`stakeholderCategories`, `domains`, `referenceDocuments`, `waves`) → stored in `this.setupData`
- Requirements (`GET /operational-requirements`, all types) → stored separately in `this.requirements`

Requirements are **not** part of `setupData`. They are passed to `ONPlanning` as a dedicated constructor argument and exposed to `RequirementForm` via the `getRequirements()` context resolver (see §3.5).

### 11.3 ON Plan Layout

The ON Plan tab uses a **two-pane horizontal layout** with a resizable column divider:

- **Left pane** — `TemporalGrid` with structured ON hierarchy rows
- **Right pane** — Selected ON details: sticky header (title + code + Edit button) + full `RequirementForm` read-only view

The split ratio is user-adjustable by dragging the divider and is preserved in `ONPlanning.splitRatio`.

### 11.4 TemporalGrid Row Structure (Left Pane)

`ONPlanning` configures `TemporalGrid` with three row kinds that together represent the ON hierarchy:

| Row kind | Content | Source |
|---|---|---|
| `separator` | DrG display name (e.g. "NM B2B") | `on.drg` grouped |
| `group` | Root ON — no `refinesParents`; expand/collapse toggle | `addGroupRow` |
| `child` | Refined ON — has `refinesParents`; indented label | `addChildRow(id, parentId, ...)` |

Collapsing a group row hides all its child rows. The expanded state is preserved across re-renders.

ONs with a `tentative` period get two milestones — `period-start` (▶) and `period-end` (◀) — rendered as icon markers on the timeline track. ONs without `tentative` get an empty row (row reserved, no markers).

Ticks are one per integer year across the computed interval. The default interval is derived from the union of all ON `tentative` periods.

### 11.5 Milestone Rendering

```javascript
temporalGrid.setMilestoneRendering({
  mode: 'icon',
  eventTypes: {
    'period-start': { icon: '▶', colour: '#2563eb' },
    'period-end':   { icon: '◀', colour: '#2563eb' }
  }
})
```

### 11.6 ON Details (Right Pane)

Clicking any `group` or `child` row fires the selection listener. `ONPlanning.handleGridSelect(id)` looks up the ON entity and renders the right pane with:

- **Sticky header** — ON title, code, and an Edit button
- **Full read-only form** — `RequirementForm.generateReadOnlyView()` with all tabs (General, Details, Traceability, Impact, Planning, Documentation, History)

The Edit button calls `requirementForm.showEditModal(on)`. After a successful save, the `entitySaved` DOM event is caught by `ONPlanning`'s listener, which reloads requirements from the API, refreshes the TemporalGrid, and re-renders the details pane for the currently selected ON.

`RequirementForm` is constructed with `entityConfig.name = 'Operational Requirements'` so that the `entitySaved` event filter matches correctly.

### 11.7 File Structure

```
activities/planning/
├── planning.js         PlanningActivity shell, setup + requirements data load, tab management
├── on-planning.js      ONPlanning: requirements filtering, TemporalGrid config, selection,
│                       details pane with edit support, entitySaved reload
└── planning.css        Two-pane layout, separator/group/child row styles

components/odp/
└── temporal-grid.js    TemporalGrid: generic calendar timeline component (§5)

shared/
└── year-period.js      parseYearPeriod() / formatYearPeriod() shared utilities (§5.5)
```

---

## 12. iCDM DrGs Edition 4 Model Changes

The following web client changes align the client with the Edition 4 data model update.

### 12.1 Setup Layer

| Change | Detail |
|---|---|
| `DataCategory` removed | `data-categories.js` deleted; `TreeEntity` now covers `StakeholderCategory` and `Domain` only |
| `Service` removed | `services.js` deleted |
| `Document` → `ReferenceDocument` | `documents.js` replaced by `reference-documents.js`; `description` field added (optional, textarea, inherited from `baseFields`); `version` optional; `parentId` optional; hierarchy up to three levels; now a `TreeEntity` (was `ListEntity`); endpoint `/reference-documents` |
| `Domain` added | New `TreeEntity` (`domains.js`); has `contact` textarea field |
| `Bandwidth` added | New `ListEntity` (`bandwidths.js`); unique on `(year, waveId, scope)` tuple; `scope` is a `DraftingGroup` enum key (DrG selector, not a Domain reference); `waveId` resolved from loaded waves; `planned` optional integer field added |
| `Wave` fields renamed | `quarter` → `sequenceNumber`, `date` → `implementationDate`, `name` removed; uniqueness check on `(year, sequenceNumber)` |

`abstract-interaction-activity.js` `loadSetupData()` updated: `dataCategories`/`services`/`documents` replaced by `domains`/`referenceDocuments` loaded from `/domains` and `/reference-documents`.

### 12.1b Field Type Vocabulary

Form fields in `collection-entity-form.js` use the following type identifiers:

| Type | Component | Cardinality | Notes |
|---|---|---|---|
| `select` | Native `<select>` | 1 | Enum choices (e.g. maturity, drg) |
| `reference` | `ReferenceManager` | 0..1 | Inline typeahead; value wrapped in `[id]` array on save; renders `'None'` when empty in read mode |
| `reference-list` | `ReferenceListManager` | 0..n | Chip list + search popup |
| `annotated-reference-list` | `AnnotatedMultiselectManager` | 0..n with note | Table with per-item note; see §12.1c |
| `richtext` | Quill editor | — | Delta stored as stringified JSON |

### 12.1c Annotated Reference List — Rendering & Metadata

**Edit / create mode (`AnnotatedMultiselectManager`)**

Each selected item is displayed in an editable table row. The note field is a `<textarea>` (multi-line), allowing line breaks to be entered and preserved. Line breaks are stored as `\n` in the note string and rendered with `white-space: pre-line` in view rows.

**Read-only mode (`renderAnnotatedMultiselectReadOnly`)**

Items are rendered as a structured block list, sorted alphabetically by title. Each item renders as:

```
• Title (or link if url available)
  note text (if present, muted, smaller font, pre-line)
```

`visibleWhen` is **not evaluated** in read mode — all `annotated-reference-list` fields are always rendered regardless of item type.

**Metadata resolution (`_resolveAnnotatedRefMeta`)**

Fields declare a `setupEntity` property referencing a `setupData` collection key (e.g. `'referenceDocuments'`). At render time, `_resolveAnnotatedRefMeta(field, refId)` looks up the full object by id and returns `{ description, url }`.

- `description` — rendered as a native `title` tooltip on the item title (both form and column)
- `url` — when present on `strategicDocuments` items, the title renders as `<a href target="_blank">` instead of a plain `<span>`

**Column rendering (`annotatedReferenceListColumn`)**

Items sorted alphabetically; title only displayed (note excluded). If `column.setupEntity` is set, `description` is resolved from `context.setupData` and added as a `title` tooltip.

**`setupEntity` mapping:**

| Field | `setupEntity` |
|---|---|
| `strategicDocuments` | `referenceDocuments` |
| `impactedStakeholders` | `stakeholderCategories` |
| `impactedDomains` | `domains` |

### 12.2 Operational Requirement Fields

**Added to both ON and OR:**

| Field | Type | Notes |
|---|---|---|
| `maturity` | `select` | Required; options from `MaturityLevel` enum |
| `additionalDocumentation` | `static-label` | Renders "Not available yet" in all modes; not submitted |

**Added to ON only (`visibleWhen: type === 'ON'`):**

| Field | Type | Notes |
|---|---|---|
| `strategicDocuments` | `annotated-reference-list` | Rename of `documentReferences`; options from `referenceDocuments` setupData; `setupEntity: 'referenceDocuments'`; titles link to `url` if present |
| `tentative` | `tentative` | Single text input; user enters `YYYY` or `YYYY-ZZZZ`; saved as `[start, end]` integer array; displayed as `"2026"` or `"2026-2028"` |

**Added to OR only (`visibleWhen: type === 'OR'`):**

| Field | Type | Notes |
|---|---|---|
| `nfrs` | `richtext` | Optional; operational non-functional requirements |
| `impactedStakeholders` | `annotated-reference-list` | Options from `stakeholderCategories` setupData; `setupEntity: 'stakeholderCategories'`; note stored per stakeholder |
| `impactedDomains` | `annotated-reference-list` | Options from `domains` setupData; `setupEntity: 'domains'`; note stored per domain |
| `refinesParents` | `reference` | Single-select typeahead via `ReferenceManager`; wraps selected id in `[id]` array on save; visible for both ON and OR. Rendered above `implementedONs` / `implementedBy` in the Traceability tab. |
| `refinedBy` | `reference-list` | **Computed, read-only.** Derived client-side: all requirements whose `refinesParents` references this item's id. Visible for both ON and OR. Uses `computeKey: '_computeRefinedByIds'`. |
| `implementedBy` | `reference-list` | **Computed, read-only, ON only.** Derived client-side: all ORs whose `implementedONs` references this ON's id. Uses `computeKey: '_computeImplementedByIds'`. |

`visibleWhen` conditions are enforced in **all modes including read** via `getVisibleFields`. Fields with `visibleWhen` that returns false are excluded from rendering regardless of mode.

**Renamed:**

| Old key | New key |
|---|---|
| `impactsStakeholderCategories` | `impactedStakeholders` |
| `dependsOnRequirements` | `dependencies` |
| `documentReferences` | `strategicDocuments` (ON only) |

**Removed:** `impactsData`, `impactsServices`, `documentReferences` (from OR).

**`dependencies` and `impactedDomains`** are now OR-only (previously `dependsOnRequirements` appeared for all types).

**Traceability tab field order:** Strategic Documents → Refines (Parent) → Refined By → Implements (ONs) → Implemented By (ORs).

**Impact tab visibility:** The Impact tab always renders (stable tab index). Fields inside (`impactedStakeholders`, `impactedDomains`) are hidden for ONs via `visibleWhen`, producing a blank tab for ON items — this is intentional to avoid tab index shifts when switching between ON and OR items.

### 12.3 Operational Change Fields

**Added:**

| Field | Type | Notes |
|---|---|---|
| `maturity` | `select` | Required; options from `MaturityLevel` enum |
| `cost` | `number` | Optional integer; placeholder "Integer value in MW" |
| `dependencies` | `reference-list` | OCs that must precede this OC; options from OC list |
| `additionalDocumentation` | `static-label` | Renders "Not available yet" in all modes; not submitted |

**Renamed:**

| Old key | New key |
|---|---|
| `satisfiesRequirements` | `implementedORs` |
| `supersedsRequirements` | `decommissionedORs` |

**Removed:** `documentReferences` section, `visibility` field.

### 12.4 Milestone Name Field

Milestone `title` field renamed to `name` throughout `change-form-milestone.js`: form input id/name, `collectFormData`, `validateMilestone`, `prepareData`, `renderRow`, and the delete confirmation message.

Wave label in milestone form and table now rendered as `{year}#{sequenceNumber}` (the `name` field was removed from `Wave` in Edition 4).

### 12.5 New Field Types in CollectionEntityForm

Two new `type` values added to `renderInput` / `renderReadOnlyField`:

| Type | Edit rendering | Read rendering | Notes |
|---|---|---|---|
| `static-label` | `<div>` with `staticText` content, no `name` attribute | Label + `staticText` | Skipped in `collectFormData`, `validateForm`, `restoreVersionToForm` |
| `tentative` | `<input type="text">` with pattern `^\d{4}(-\d{4})?$` | Formats `[start,end]` array as `"YYYY"` or `"YYYY-ZZZZ"` | Parsed in `RequirementForm.transformDataForSave` via `parseTentative()` which delegates to `parseYearPeriod()` in `shared/year-period.js` |

### 12.6 Filter Bar

`getFilterConfig()` in `abstract-interaction-activity.js` updated:

- Removed: `service`, `dataCategory`, `document` filters
- Added: `domain` filter (suggest, options from `domains` setupData)
- Added: `strategicDocument` filter (suggest, options from `referenceDocuments` setupData; ON type only)
- Renamed: `satisfies` → `implements`

All three relationship filters (`domain`, `stakeholderCategory`, `strategicDocument`) are scalar — a single ID is passed to the API and matched with `WHERE id(x) = $x` in the store.

**`RequirementsEntity` column config:**

| Column | `appliesTo` | Notes |
|---|---|---|
| `strategicDocuments` | `['on-node']` | ON only |
| `implementedONs` | `['or-node']` | OR only |
| `dependencies` | `['or-node']` | OR only |
| `impactedStakeholders` | `['or-node']` | OR only |
| `impactedDomains` | `['or-node']` | OR only |

Tree column list: `title`, `code`, `maturity`, `strategicDocuments`, `implementedONs`, `dependencies`, `impactedStakeholders`, `impactedDomains`.

**`RequirementsEntity` path builder (`buildRequirementTreePath`) priority:**

1. `refinesParents` — if present, nest under the parent ON/OR node (graph-based hierarchy); `path` is ignored
2. `path` — if no refines relation, build virtual folder nodes from the path array

The data model guarantees that if `refinesParents` is set, the parent will always be present in the entity map. No fallback is needed. Note: the JSON importer is responsible for clearing `path` when `refinesParents` is set on import.

**Grouping config** includes `strategicDocuments` as a grouping option.

---

## 13. Prioritisation Activity

The Prioritisation activity (`activities/prioritisation/`) is a dedicated
workspace for matching OC implementation effort against domain bandwidth
constraints across waves. It is a fully independent top-level activity
(`/prioritisation` route) — distinct from the Planning activity.

### 13.1 Purpose and Scope

The activity supports the iterative iCDM governance loop: assigning OCs to
delivery waves, monitoring bandwidth consumption per DrG and globally, and
identifying overloaded waves. Wave assignments are persisted via OPS_DEPLOYMENT
milestones on OCs.

### 13.2 Data Inputs

All data is loaded from existing endpoints on activity mount:

| Source | Usage |
|--------|-------|
| `GET /operational-changes` | OCs with `cost`, `drg`, `maturity`, `dependencies`, `milestones` |
| `GET /waves` | Wave definitions (year, sequenceNumber, implementationDate) |
| `GET /bandwidths` | Available MW per (waveId, scope) pair — `scope` is a DraftingGroup key |
| `DraftingGroup` enum | Hardcoded column order; keys from `Object.keys(DraftingGroup)` |

OR-level costs (`implementedORs[].cost`) are informational only and not used
for bandwidth aggregation.

### 13.3 Bandwidth Aggregation Module

Pure aggregation logic lives in `shared/src/model/bandwidth-aggregation.js` —
no DOM, no API calls, framework-agnostic. Reusable server-side without modification.

**Key exported functions:**

| Function | Description |
|----------|-------------|
| `buildMatrix(ocs, waves, bandwidths, drgs)` | Returns `{ cells, waveGlobal, unplanned }` |
| `resolveDeploymentWaveId(oc)` | Returns wave ID of OPS_DEPLOYMENT milestone, or null |
| `classifyLoad(consumed, available)` | Returns `'green'`/`'orange'`/`'red'`/`'empty'` |
| `cardHeight(cost)` | Returns card height in rem (logarithmic scale) |
| `checkDependencyViolations(oc, targetWaveId, allOcs, waves)` | Returns `{ violated, offenders }` |

**`AggregationMatrix` shape:**

```javascript
{
  cells:      Map<waveId, Map<drg, CellData>>,  // per (wave, DrG)
          waveGlobal: Map<waveId, CellData>,             // per wave, all DrGs summed
          unplanned:  OC[]                               // no OPS_DEPLOYMENT milestone
}

// CellData
{ consumed: number, available: number | null, ocs: OC[] }
```

**`available` sentinel values:**
- `null` — no bandwidth record defined for this (wave, DrG) pair → grey, no load classification
- `0` — explicit zero MW record exists → red if any OCs assigned
- `> 0` — normal case; load classified by consumed/available ratio

**Load colour thresholds:** green < 80%, orange 80–120%, red ≥ 120%.

### 13.4 Grid Layout

```
┌─────────┬──────────┬──────────┬─────────┐
│  Label  │   DrG 1  │   DrG N  │ Global  │
├─────────┼──────────┼──────────┼─────────┤  ← furthest wave (top)
│ 2029#1  │  cards   │  cards   │ tinted  │
│         │  loadbar │  loadbar │ loadbar │
├─────────┼──────────┼──────────┼─────────┤
│ 2027#2  │  ...     │  ...     │  ...    │  ← nearest wave (bottom)
├─────────┼──────────┼──────────┼─────────┤
│ Mature  │  cards   │  cards   │  count  │  ← backlog sub-rows
│ Advanced│  cards   │  cards   │  + MW   │
│ Draft   │  cards   │  cards   │  count  │
└─────────┴──────────┴──────────┴─────────┘
```

- **Columns**: one per DrG (hardcoded enum order) + rightmost Global column
- **Wave rows**: ordered furthest-top to nearest-bottom (CSS `flex-direction: column-reverse` on the wave rows container)
- **Wave label format**: `{year}#{sequenceNumber}` (e.g. `2027#1`)
- **Global column**: tinted background (light green/orange/red) per load level, distinct from OC maturity strips

### 13.5 OC Cards

- Height proportional to cost: `h = 2 + 2·log10(max(1, cost))` rem, clamped 2–12 rem
- Left colour strip indicates maturity: grey (Draft), amber (Advanced), green (Mature)
- Shows: title (truncated), cost in MW, dependency icon (⛓) if any
- Hover: open button (↗) navigates to `/elaboration/changes/{itemId}`
- Draft cards: `cursor: not-allowed`, reduced opacity, lock icon (🔒), not draggable

### 13.6 Wave Row Collapse

Each wave row is individually collapsible:

- Toggle button is anchored at top-left of the label cell (`align-items: flex-start`)
  so it does not shift vertically on expand/collapse
- **Collapsed state** (32px height):
  - OC cards hidden
  - Each DrG cell shows effort summary: `consumed / available MW` (if bandwidth
    defined) or `consumed MW` (if not)
  - Global cell shows the same summary
  - Load bar rendered as a 4px strip at the bottom of each cell
- **Expand on drop**: dropping an OC onto a collapsed wave row automatically expands it

### 13.7 Backlog Section

The backlog section is pinned below all wave rows and split into three
independently collapsible sub-rows:

| Sub-row  | Maturity   | Draggable | Accepts drops | Notes |
|----------|------------|-----------|---------------|-------|
| Mature   | `MATURE`   | Yes       | Yes           | — |
| Advanced | `ADVANCED` | Yes       | Yes           | — |
| Draft    | `DRAFT`    | No        | No            | Informational only |

- A wave→backlog drop is only accepted by the sub-row matching the OC's maturity
  (enforced at `dragover` — mismatched sub-rows reject the drop)
- Backlog global cell shows OC count + total MW sum (MW omitted if no OC in
  the sub-row has a cost set — applies especially to Draft)

### 13.8 Drag-and-Drop

- **Constraint**: only within the same DrG column; cross-DrG drops are rejected
- **Wave assignment** (backlog → wave): creates OPS_DEPLOYMENT milestone via
  `apiClient.createMilestone()`
- **Wave reassignment** (wave → wave): updates OPS_DEPLOYMENT milestone via
  `apiClient.updateMilestone()`
- **Wave removal** (wave → backlog): deletes OPS_DEPLOYMENT milestone via
  `apiClient.deleteMilestone()`
- All three operations use the dedicated `apiClient` milestone methods, not raw
  `delete/put/post`, to ensure `expectedVersionId` is placed in the request body
  per the OpenAPI contract
- **Dependency check**: on wave drop, `checkDependencyViolations()` is called;
  violations surface a confirmation dialog but do not block the operation
- After any successful API call, the activity reloads all data and redraws the grid

### 13.9 File Structure

```
activities/prioritisation/
├── prioritisation.js        Activity shell: data load, matrix compute, grid mount, API calls
├── prioritisation-grid.js   PrioritisationGrid: board render, collapse, drag-and-drop
└── prioritisation.css       Grid styles (extends activity.css)

shared/src/model/
└── bandwidth-aggregation.js Pure aggregation: buildMatrix, classifyLoad, cardHeight,
                             checkDependencyViolations, resolveDeploymentWaveId
```

**Modified files:**
- `app.js` — new `/prioritisation` route
- `header.js` — new "Prioritisation" nav item
- `activity.css` — `.prioritisation-activity`, `.prioritisation-workspace`
- `landing.html` — Prioritisation activity tile

### 13.10 CSS Conventions

`prioritisation.css` extends `activity.css` (`.prioritisation-activity` /
`.prioritisation-workspace` root classes). It does not extend
`abstract-interaction-activity.css` — the Prioritisation activity uses a custom
board layout, not the collection+details two-pane pattern.

---

## 14. Edition Content Selection — Publication Activity Changes

### 14.1 ODPEditionForm (`publication/odp-edition-form.js`)

**Type field** — options updated to `DRAFT` / `OFFICIAL`.

**`startsFromWave` field** — changed from `required: true` to `required: false`; help text updated to describe the dual role (OC milestone lower bound + ON tentative period filter); options include a "No wave (all content)" entry.

**`minONMaturity` field** — new optional `select` field with four options: no gate, DRAFT, ADVANCED, MATURE. Controls the minimum ON maturity level for edition content selection.

**`transformDataForSave()`** — handles absent `startsFromWave` (skips `startsFromWaveId`); strips empty `minONMaturity` before posting to API; default type is `'DRAFT'`.

**`onValidate()`** — wave validation now conditional (only fires when a wave is actually selected).

**`getWaveOptions()` / `formatWave()`** — wave label changed from `wave.name` to `${wave.year}#${wave.sequenceNumber}` throughout; sort key uses `year * 100 + sequenceNumber`.

### 14.2 ODPEditionsEntity (`publication/odp-editions.js`)

**Type column** — `enumLabels` and `enumStyles` updated to `DRAFT` / `OFFICIAL`.

**`minONMaturity` column** — new text column; renders `'—'` when absent.

**Grouping config** — `minONMaturity` added as a grouping option.

### 14.3 PublicationActivity (`publication/publication.js`)

**Type filter** — options updated to `DRAFT` / `OFFICIAL`.

**`buildWaveOptions()`** — wave label changed from `wave.name` to `${wave.year}#${wave.sequenceNumber}`; options sorted by `year * 100 + sequenceNumber`.

[← 07 CLI](07-CLI.md) | [09 Deployment →](09-Deployment.md)