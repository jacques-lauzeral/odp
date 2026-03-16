# Chapter 08 – Web Client

## 1. Overview

The ODIP web client is a Vanilla JavaScript single-page application (no framework). It communicates exclusively with the REST API and shares data models with the server via the `@odp/shared` workspace package. The deliberate absence of a framework keeps the prototype flexible and avoids build complexity while still enforcing consistent component patterns through class-based inheritance and delegation.

---

## 2. Application Structure

```
web-client/src/
├── activities/
│   ├── landing/        User identification, activity tiles, connection status
│   ├── setup/          Setup entity management
│   ├── elaboration/    OR/OC authoring and browsing
│   ├── planning/       ON/OC deployment and implementation planning
│   ├── publication/    ODIP Edition management and export
│   └── review/         Edition review interface (read-only)
├── components/
│   ├── common/         Global navigation, error handling
│   ├── setup/          TreeEntity, ListEntity base classes
│   └── odp/            CollectionEntity, TreeTableEntity, AbstractTimelineGrid,
│                       TimelineGrid, GanttGrid, form base classes
└── shared/             API client, utilities, error handling
```

### Three-Layer Navigation Hierarchy

Every activity follows the same structural pattern:

- **Layer 1** — Global chrome: persistent top navigation (`Landing | Setup | Elaboration | Planning | Publication | Review`), user context, connection status
- **Layer 2** — Activity workspace: activity-specific tabs, context selectors (edition picker), toolbars
- **Layer 3** — Entity interactions: CRUD operations, detail panels, forms, relationship management

---

## 3. Component Patterns

Four base component classes cover all entity management needs.

### 3.1 TreeEntity

Used for hierarchical setup entities (`StakeholderCategory`, `Domain`). Manages real parent–child relationships stored in the database. Three-pane layout: tree navigation / item details / action buttons. Supports expand/collapse, parent reassignment, and context-sensitive actions.

### 3.2 ListEntity

Used for flat setup entities (`Wave`, `ReferenceDocument`, `Bandwidth`). Single-pane table with sortable columns, inline filtering, and direct CRUD operations.

### 3.3 CollectionEntity

Used for operational entities (ORs, OCs) in table/list perspective. Provides filtering, grouping, column configuration, row selection, and a details panel. Complex entities (requirements, changes) use **delegation** — the entity class owns a `CollectionEntity` instance and passes callbacks for filter config, column config, grouping config, and event handlers. This keeps entity-specific logic out of the base component.

### 3.4 TreeTableEntity

Used for tree-table perspectives on ORs/OCs and for the ON tree in the Planning activity. Builds tree structure from a flat entity list using a configurable `pathBuilder` function. The path builder returns a typed path array that drives both tree structure and per-node rendering via `typeRenderers`.

The `pathBuilder` may produce **virtual hierarchy** (e.g. `drg-folder → on-node` derived from entity attributes) or **graph-based hierarchy** (e.g. `parent-on-node → child-on-node` derived from real `refines` relationships). Both modes are supported without component modification — the distinction lives entirely in the `pathBuilder` implementation provided by the parent entity.

Filter matchers are injected as `options.filterMatchers` (same predicate map used by `CollectionEntity`), enabling consistent filter behaviour across all perspectives that share a `TreeTableEntity`.

### 3.5 CollectionEntityForm

Abstract base class for entity forms. Concrete forms (`RequirementForm`, `ChangeForm`) extend it and implement virtual methods: `getFieldDefinitions()`, `onSave()`, `onValidate()`, and optionally `transformDataForSave()` / `transformDataForEdit()`. The base class handles modal lifecycle, field rendering, validation orchestration, and error display.

---

## 4. Multi-Perspective Pattern

Requirements and changes support multiple simultaneous perspectives (collection table, tree-table, temporal timeline) that share a single data load and common state. Key principles:

- **Single data load**: entities fetched once, distributed to all active perspectives
- **Shared state**: filters, selection, and grouping coordinated across perspectives
- **Shared handlers**: `onItemSelect` and `onCreate` wired identically to all perspectives
- **Perspective switching**: tab-driven, preserves selection and filter state

---

## 5. Temporal Grid Components

Two temporal visualisation components — `TimelineGrid` (OC milestones, wave-based axis) and `GanttGrid` (ON tentative periods, year-based axis) — share a common base class `AbstractTimelineGrid`.

### 5.1 AbstractTimelineGrid

`AbstractTimelineGrid` (`components/odp/abstract-timeline-grid.js`) owns all logic that is independent of the column unit (wave vs year):

- Container and data lifecycle (`render()`, `setData()`, `cleanup()`)
- Selection state and `selectItem()` / `updateSelectionUI()`
- Time window state and `updateTimeWindow(startDate, endDate)`
- Zoom control rendering and event binding (see §5.3)
- `renderContent()` skeleton: header + body loop
- `bindEvents()` for row selection
- Helper utilities: `getItemId()`, `escapeHtml()`

The following methods are **abstract** — concrete subclasses must override them:

| Method | Responsibility |
|---|---|
| `initializeTimeWindow()` | Compute default start/end from available data |
| `getVisibleColumns()` | Return ordered array of column descriptors within time window |
| `calculateColumnPosition(col, allCols)` | Return `%` position for a column |
| `renderHeader(cols)` | Render the column header row |
| `renderRow(item, cols)` | Render a single data row |
| `applyFilters()` | Filter `this.data` into `this.filteredData` |

### 5.2 TimelineGrid (OC / wave-based)

`TimelineGrid extends AbstractTimelineGrid` (`components/odp/timeline-grid.js`). Concrete implementation for the Changes temporal perspective.

- `initializeTimeWindow()` — defaults to all future setup waves within a 3-year horizon; `ChangesEntity.calculateOptimalTimeWindow()` computes the actual bounds from `setupData.waves` and calls `updateTimeWindow()`.
- `getVisibleColumns()` — filters `setupData.waves` to those falling within the time window; returns wave descriptors sorted chronologically.
- `calculateColumnPosition()` — distributes wave columns evenly with 5% padding.
- `renderHeader()` — renders wave labels (`2027 Q1`, `2028`, etc.) with vertical guide lines.
- `renderRow()` — renders a change row with baseline, milestone pixmaps, and connector lines (see §5.5–5.7).
- `applyFilters()` — excludes changes that have no milestones matching the active `milestoneFilters` within the time window.

Additional public API specific to `TimelineGrid`:

- `setMilestoneFilters(filters)` — updates the active event-type filter array and re-renders.
- `selectMilestone(itemId, milestoneKey)` — programmatic milestone selection.

### 5.3 Zoom Control

`AbstractTimelineGrid` renders a zoom control bar above the grid. The control consists of two text inputs labelled **From** and **To**, sharing the same parse/validate/render logic as the `tentative` form field type (§10.5):

- Input format: `YYYY` (single year) or `YYYY-ZZZZ` (year range), validated by `parseYearPeriod(str)`.
- `parseYearPeriod(str)` → `{ start: Date, end: Date }` is a shared utility in `shared/year-period.js`. A single year `YYYY` maps to `[YYYY/01/01, YYYY+1/01/01[`. A range `YYYY-ZZZZ` maps to `[YYYY/01/01, ZZZZ+1/01/01[`.
- On valid input, the control calls `this.updateTimeWindow(start, end)` on the owning grid instance.
- Absolute bounds (`minYear`, `maxYear`) are injected as constructor options (default `2025`–`2045`). The zoom control enforces these bounds during validation.
- The current window is displayed as a read-only `YYYY-ZZZZ` label beside the inputs, updated on every `updateTimeWindow()` call.

Both `TimelineGrid` and `GanttGrid` inherit this control without modification.

### 5.4 GanttGrid (ON / year-based)

`GanttGrid extends AbstractTimelineGrid` (`components/odp/gantt-grid.js`). Concrete implementation for the ON Plan temporal perspective.

- `initializeTimeWindow()` — defaults to the union of all `tentative` periods across the loaded ON dataset. Falls back to current year + 5 years if no tentative periods are set.
- `getVisibleColumns()` — returns one column descriptor per integer year within the time window.
- `calculateColumnPosition()` — distributes year columns evenly with 5% padding (same algorithm as `TimelineGrid`).
- `renderHeader()` — renders year labels (`2027`, `2028`, etc.) with vertical guide lines.
- `renderRow()` — renders one row per ON. If the ON has a `tentative` period, a horizontal bar spans from `tentative.start` to `tentative.end` (inclusive) across the year columns. ONs without a `tentative` period render an empty row with reserved vertical space — no bar is drawn.
- `applyFilters()` — passes all items through (no row exclusion); filtering is handled upstream by `ONPlanning` before `setData()` is called.

`GanttGrid` has no milestone-specific API — `setMilestoneFilters` and `selectMilestone` are not present.

---

## 6. Temporal Perspective (Changes)

The `ChangesEntity` is the only entity in the Elaboration activity with a third perspective beyond collection and tree-table: the **temporal view**, implemented by `TimelineGrid` (`components/odp/timeline-grid.js`).

### 6.1 Layout

The temporal view renders a horizontal grid:

- **Label column** (left) — change title and ID, one row per change
- **Timeline area** (right) — wave columns with milestone markers per row
- A horizontal baseline runs across each change row; milestone pixmaps and connector lines are overlaid on it

The grid header shows wave labels (`2027 Q1`, `2028`, etc.) with vertical guide lines. Only waves that fall within the current time window are shown as columns.

### 6.2 Time Window

The default time window spans all future setup waves (from the earliest future wave to the latest). `ChangesEntity.calculateOptimalTimeWindow()` computes this from `setupData.waves` on first activation. The window is stored in `sharedState.timeWindow` and persists across perspective switches.

Changes with no milestones within the time window are excluded from the temporal view (they remain visible in the collection perspective). `filterChangesByTimeWindow()` in `ChangesEntity` performs this pre-filter before handing data to `TimelineGrid.setData()`.

`TimelineGrid.updateTimeWindow(startDate, endDate)` can be called at any time to recompute the visible wave columns and re-render. The zoom control (§5.3) is the primary user-facing mechanism for adjusting the window.

### 6.3 Milestone Pixmap

Each milestone is rendered as a **1-row × 3-column pixmap** positioned at the wave column where the milestone falls. The three columns map to event domain:

| Column | Domain | Events |
|---|---|---|
| Left (`api-cell`) | API | `API_PUBLICATION`, `API_TEST_DEPLOYMENT`, `API_DECOMMISSIONING` |
| Centre (`ui-cell`) | UI | `UI_TEST_DEPLOYMENT` |
| Right (`ops-cell`) | Operations | `OPS_DEPLOYMENT` |

A cell is filled (coloured) when the milestone carries at least one event of that domain. A tooltip on each cell lists the active event display names from the `@odp/shared` `getMilestoneEventDisplay` helper. An empty pixmap (no event types) renders three unfilled cells.

### 6.4 Connector Lines

When a change has two or more visible milestones, `renderConnectors()` draws horizontal connector `<div>` elements between them. Connectors are drawn between each adjacent pair of milestones (sorted by wave date). Milestones whose wave falls outside the visible columns are not connected.

### 6.5 Milestone Filtering

`TimelineGrid` maintains a `milestoneFilters` array (default `['ANY']`). When `ANY` is active all milestones are shown. When specific event types are set:

- Milestones are hidden unless they carry at least one of the filtered event types
- Changes that have no visible milestones after filtering are removed from the grid
- The empty state message distinguishes between "no data" and "no matches for current filters"

`ChangesEntity` stores the current milestone filter in `sharedState.eventTypeFilters` and propagates it to `TimelineGrid.setMilestoneFilters()` on perspective switches and shared-state updates.

### 6.6 Selection and State Sharing

Both item selection (click on change label) and milestone selection (click on pixmap) are supported:

- `onItemSelect(item)` — fires `handleItemSelect` on `ChangesEntity`, updates the shared details panel and syncs `CollectionEntity.selectedItem`
- `onMilestoneSelect(item, milestone)` — fires `handleTimelineMilestoneSelect`, updates the details panel with milestone emphasis

Selection state is stored in `sharedState.selectedItem` and restored when switching back to the temporal perspective via `TimelineGrid.selectItem(itemId)`.

The `AbstractInteractionActivity` parent holds the canonical `sharedState` and coordinates perspective switching. `ChangesEntity.handlePerspectiveSwitch()` applies the shared state to whichever perspective is being activated.

### 6.7 Perspective Toggle UI

The perspective toggle buttons (`📋 Collection` / `📅 Temporal`) are rendered by `ChangesEntity.renderViewControls()` into the `#viewControls` container owned by `AbstractInteractionActivity`. Clicking a button calls `handlePerspectiveSwitch(perspective, sharedState)`.

---

## 7. Rich Text

Rich text fields (`statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `purpose`, `initialState`, `finalState`, `details`) use the **Quill** editor. Content is stored and transmitted as Quill Delta JSON serialised to a string. The web client renders Delta content in read mode using Quill's read-only renderer and edits it with the full Quill toolbar in write mode.

Images can be embedded in Delta content as base64-encoded PNG data. The import pipeline handles the reverse path (Quill Delta → AsciiDoc → Word) for the docx round-trip workflow.

---

## 8. ODIP Edition Context

The edition picker (available in Elaboration, Planning, and Review activities) resolves to `baseline` + `fromWave` API parameters before any list or get request is issued. The web client never sends `odpEdition` as a raw query parameter to the service layer — resolution happens client-side by reading the selected edition's `baselineId` and `startsFromWaveId` fields.

---

## 9. CSS Architecture

Modular CSS split across functional files loaded in dependency order:

| File | Coverage |
|---|---|
| `main.css` | Design tokens, base styles, CSS variables |
| `base-components.css` | Buttons, form controls, utilities, loading spinner |
| `layout-components.css` | Header, navigation, modals, cards |
| `table-components.css` | Collection tables, row selection, grouping, empty states |
| `temporal-components.css` | Timeline grid, Gantt grid, wave/year visualisation, milestone connectors, zoom control |
| `form-components.css` | Tabs, tags, multi-select, validation, alerts |
| `feedback-components.css` | Status indicators, notifications, error states |
| `activities/abstract-interaction-activity.css` | Shared interaction patterns for all collection perspectives |
| `activities/<activity>.css` | Activity-specific overrides only |

The activity-specific files contain only what differs from the shared patterns. Common interaction chrome (tabs, filters, collection container layout, detail panels) lives in `abstract-interaction-activity.css`.

---

## 10. API Integration

The shared API client in `shared/` handles all `fetch` calls, base URL configuration, and error normalisation. All components use this client — no component issues `fetch` directly. The base URL is configured to target the API server port explicitly (`http://<hostname>:8080`) to support remote browser access.

---

## 11. Planning Activity

The Planning activity (`activities/planning/`) supports deployment and implementation planning across two phases. Phase 1 (ON-based) is fully implemented. Phase 2 (OC-based) is reserved as a placeholder tab.

### 11.1 Navigation and Tab Structure

The Planning activity appears as a top-level nav tab alongside Elaboration. It uses the same edition picker as Elaboration (baseline + fromWave resolution, current working edition). The activity shell (`PlanningActivity extends AbstractInteractionActivity`) renders two tabs:

| Tab | Status |
|---|---|
| `ON Plan` | Active — full implementation |
| `OC Plan` | Placeholder — disabled, renders "Coming soon" message |

### 11.2 ON Plan Layout

The ON Plan tab uses a **three-pane horizontal layout**:

- **Left pane** — ON tree (`ONTreeComponent`, implemented via `TreeTableEntity`)
- **Centre pane** — ON Gantt (`GanttGrid`)
- **Right pane** — Selected ON details (`RequirementForm` read-only + `Implemented By` tab)

All three panes share a single data load. ONs are fetched once via `GET /requirements?type=ON` (with edition parameters). `ONPlanning` distributes the loaded data to the tree and the Gantt.

### 11.3 ON Tree (Left Pane)

The ON tree is a `TreeTableEntity` instance configured with a single hierarchy column (no additional table columns). The `pathBuilder` builds paths from real `refines` relationships:

- Root ONs (no `refines` parent) appear as top-level nodes.
- ONs that refine another ON appear as child nodes under their parent.
- The path type for all nodes is `on-node`; folder nodes (e.g. `drg-folder`) may be prepended if DrG grouping is active.

The tree supports the same filter injection pattern as the Elaboration tree-table perspective. Initial filter configuration includes:

| Filter | Source |
|---|---|
| DrG | `DraftingGroup` enum |
| Strategic document | `referenceDocuments` from `setupData` |

Expand/collapse on the tree drives which ON rows are visible in the Gantt. The tree notifies `ONPlanning` on expansion state change; `ONPlanning` calls `GanttGrid.setData()` with the updated visible ON list.

### 11.4 ON Gantt (Centre Pane)

The Gantt is a `GanttGrid` instance (§5.4). It is initialised with:

```javascript
new GanttGrid(app, entityConfig, options = {
    minYear: 2025,
    maxYear: 2045,
    onItemSelect: (on) => onPlanEntity.handleONSelect(on)
})
```

Each visible ON (root or child of an expanded node) is rendered as one row. The bar spans the ON's `tentative` period if set; the row is empty otherwise. Selecting a row fires `onItemSelect`, which updates both the right panel and the tree selection.

The zoom control (§5.3) is rendered by `AbstractTimelineGrid` above the grid. The default time window is computed from the union of all loaded ON `tentative` periods via `GanttGrid.initializeTimeWindow()`.

### 11.5 ON Details (Right Pane)

The right pane reuses `RequirementForm` in **read-only mode** with one additional tab: **Implemented By**.

The `Implemented By` tab renders a flat read-only list of ORs that carry an `implements` relationship to the selected ON. The list is derived client-side by filtering the loaded OR dataset (`type=OR`) for entries whose `implementedONs` array contains the selected ON's id. Each list entry shows the OR code, title, and maturity.

The existing form tab order is preserved; `Implemented By` is appended as the last tab.

### 11.6 Bidirectional Selection Sync

Selection is coordinated by `ONPlanning` via `sharedState.selectedItem`:

- Clicking a tree node → updates Gantt highlight + right panel
- Clicking a Gantt row → updates tree selection + right panel
- Both paths call the same `handleONSelect(on)` handler on `ONPlanning`

### 11.7 File Structure

```
activities/planning/
├── planning-activity.js       PlanningActivity shell, tab management, edition picker
├── on-planning.js          ONPlanning: data load, pane coordination, selection sync
└── planning-activity.css      Three-pane layout overrides only

components/odp/
├── abstract-timeline-grid.js  AbstractTimelineGrid base class (§5.1)
├── timeline-grid.js           TimelineGrid extends AbstractTimelineGrid (§5.2)
└── gantt-grid.js              GanttGrid extends AbstractTimelineGrid (§5.4)

shared/
└── year-period.js             parseYearPeriod() shared utility (§5.3)
```

---

## 12. iCDM DrGs Edition 4 Model Changes

The following web client changes align the client with the Edition 4 data model update.

### 12.1 Setup Layer

| Change | Detail |
|---|---|
| `DataCategory` removed | `data-categories.js` deleted; `TreeEntity` now covers `StakeholderCategory` and `Domain` only |
| `Service` removed | `services.js` deleted |
| `Document` → `ReferenceDocument` | `documents.js` replaced by `reference-documents.js`; `description` field removed; `version` optional; `parentId` optional; now a `TreeEntity` (was `ListEntity`); endpoint `/reference-documents` |
| `Domain` added | New `TreeEntity` (`domains.js`); has `contact` textarea field |
| `Bandwidth` added | New `ListEntity` (`bandwidths.js`); unique on `(year, waveId, scopeId)` tuple; select options for wave and scope (domain) resolved from `setupData`; `planned` optional integer field added |
| `Wave` fields renamed | `quarter` → `sequenceNumber`, `date` → `implementationDate`, `name` removed; uniqueness check on `(year, sequenceNumber)` |

`abstract-interaction-activity.js` `loadSetupData()` updated: `dataCategories`/`services`/`documents` replaced by `domains`/`referenceDocuments` loaded from `/domains` and `/reference-documents`.

### 12.2 Operational Requirement Fields

**Added to both ON and OR:**

| Field | Type | Notes |
|---|---|---|
| `maturity` | `select` | Required; options from `MaturityLevel` enum |
| `additionalDocumentation` | `static-label` | Renders "Not available yet" in all modes; not submitted |

**Added to ON only (`visibleWhen: type === 'ON'`):**

| Field | Type | Notes |
|---|---|---|
| `strategicDocuments` | `annotated-multiselect` | Rename of `documentReferences`; options from `referenceDocuments` setupData |
| `tentative` | `tentative` | Single text input; user enters `YYYY` or `YYYY-ZZZZ`; saved as `[start, end]` integer array; displayed as `"2026"` or `"2026-2028"` |

**Added to OR only (`visibleWhen: type === 'OR'`):**

| Field | Type | Notes |
|---|---|---|
| `nfrs` | `richtext` | Optional; operational non-functional requirements |
| `impactedDomains` | `annotated-multiselect` | Options from `domains` setupData; note stored per domain |

**Renamed:**

| Old key | New key |
|---|---|
| `impactsStakeholderCategories` | `impactedStakeholders` |
| `dependsOnRequirements` | `dependencies` |
| `documentReferences` | `strategicDocuments` (ON only) |

**Removed:** `impactsData`, `impactsServices`, `documentReferences` (from OR).

**`dependencies` and `impactedDomains`** are now OR-only (previously `dependsOnRequirements` appeared for all types).

### 12.3 Operational Change Fields

**Added:**

| Field | Type | Notes |
|---|---|---|
| `maturity` | `select` | Required; options from `MaturityLevel` enum |
| `cost` | `number` | Optional integer; placeholder "Integer value in MW" |
| `dependencies` | `multiselect` | OCs that must precede this OC; options from OC list |
| `additionalDocumentation` | `static-label` | Renders "Not available yet" in all modes; not submitted |

**Renamed:**

| Old key | New key |
|---|---|
| `satisfiesRequirements` | `implementedORs` |
| `supersedsRequirements` | `decommissionedORs` |

**Removed:** `documentReferences` section, `visibility` field.

### 12.4 Milestone Name Field

Milestone `title` field renamed to `name` throughout `change-form-milestone.js`: form input id/name, `collectFormData`, `validateMilestone`, `prepareData`, `renderRow`, and the delete confirmation message.

Wave label in milestone form and table now rendered as `Y{year}Q{sequenceNumber}` (the `name` field was removed from `Wave` in Edition 4).

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
- Renamed: `satisfies` → `implements`

[← 07 CLI](07-CLI.md) | [09 Deployment →](09-Deployment.md)