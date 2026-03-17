# Chapter 08 – Web Client

## 1. Overview

The ODIP web client is a Vanilla JavaScript single-page application (no framework). It communicates exclusively with the REST API and shares data models with the server via the `@odp/shared` workspace package. The deliberate absence of a framework keeps the prototype flexible and avoids build complexity while still enforcing consistent component patterns through class-based inheritance and delegation.

---

## 2. Application Structure

```
web-client/src/
├── activities/
│   ├── landing/        User identification, activity tiles, connection status
│   ├── setup/          Setup entity management + TreeEntity, ListEntity base classes
│   ├── elaboration/    OR/OC authoring and browsing
│   ├── planning/       ON/OC deployment and implementation planning
│   ├── publication/    ODIP Edition management and export
│   └── review/         Edition review interface (read-only)
├── components/
│   ├── common/         Global navigation, error handling
│   └── odp/            CollectionEntity, TreeTableEntity, TemporalGrid, form base classes
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

Used for hierarchical setup entities (`StakeholderCategory`, `Domain`, `ReferenceDocument`). Located in `activities/setup/tree-entity.js`. Manages real parent–child relationships stored in the database as `REFINES` edges — `parentId` is never stored as a node property. Three-pane layout: tree navigation / item details / action buttons. Supports expand/collapse, parent reassignment, and context-sensitive actions (Add Child, Delete restricted to leaves).

Concrete subclasses declare only three things — no methods required:

| Declaration | Purpose |
|---|---|
| `entityLabel` | Singular display name (e.g. `'Domain'`) |
| `parentScope` | `'all'` — any non-self item as parent; `'roots'` — root items only (max two levels) |
| `fields` | Array of `{ name, label, type, required }` for entity-specific fields |

`ReferenceDocument` additionally overrides `getDisplayName()` to append the version.

### 3.2 ListEntity

Used for flat setup entities (`Wave`, `Bandwidth`). Located in `activities/setup/list-entity.js`. Single-pane table with sortable columns, inline filtering, and direct CRUD operations.

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

The Planning activity appears as a top-level nav tab alongside Elaboration. It uses the same edition picker as Elaboration (baseline + fromWave resolution, current working edition). The activity shell (`PlanningActivity`) renders two tabs:

| Tab | Status |
|---|---|
| `ON Plan` | Active — full implementation |
| `OC Plan` | Placeholder — disabled, renders "Coming soon" message |

### 11.2 ON Plan Layout

The ON Plan tab uses a **two-pane horizontal layout** (`grid-template-columns: 2fr 1fr`):

- **Left pane** — `TemporalGrid` with structured ON hierarchy rows
- **Right pane** — Selected ON details (stub — `RequirementForm` read-only + `Implemented By` tab to follow)

All data is loaded once by `ONPlanning` via `GET /requirements` (type=ON and type=OR, with edition parameters).

### 11.3 TemporalGrid Row Structure (Left Pane)

`ONPlanning` configures `TemporalGrid` with three row kinds that together represent the ON hierarchy:

| Row kind | Content | Source |
|---|---|---|
| `separator` | DrG display name (e.g. "NM B2B") | `on.drg` grouped |
| `group` | Root ON — no `refinesParents`; expand/collapse toggle | `addGroupRow` |
| `child` | Refined ON — has `refinesParents`; indented label | `addChildRow(id, parentId, ...)` |

Collapsing a group row hides all its child rows. The expanded state is preserved across re-renders.

ONs with a `tentative` period get two milestones — `period-start` (▶) and `period-end` (◀) — rendered as icon markers on the timeline track. ONs without `tentative` get an empty row (row reserved, no markers).

Ticks are one per integer year across the computed interval. The default interval is derived from the union of all ON `tentative` periods.

### 11.4 Milestone Rendering

```javascript
temporalGrid.setMilestoneRendering({
    mode: 'icon',
    eventTypes: {
        'period-start': { icon: '▶', colour: '#2563eb' },
        'period-end':   { icon: '◀', colour: '#2563eb' }
    }
})
```

### 11.5 ON Details (Right Pane)

Clicking any `group` or `child` row fires the selection listener. `ONPlanning.handleGridSelect(id)` looks up the ON entity and renders a details stub in the right pane showing title, DrG, maturity, tentative period, and the list of ORs implementing the ON (derived client-side from loaded OR data via `implementedONs`).

Full `RequirementForm` read-only integration with an `Implemented By` tab is planned for a subsequent step.

### 11.6 File Structure

```
activities/planning/
├── planning-activity.js    PlanningActivity shell, tab management, edition picker
├── on-planning.js          ONPlanning: data load, TemporalGrid config, selection, details stub
└── planning.css            Two-pane layout, separator/group/child row styles

components/odp/
└── temporal-grid.js        TemporalGrid: generic calendar timeline component (§5)

shared/
└── year-period.js          parseYearPeriod() / formatYearPeriod() shared utilities (§5.5)
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