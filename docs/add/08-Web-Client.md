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
│   ├── publication/    ODIP Edition management and export
│   └── review/         Edition review interface (read-only)
├── components/
│   ├── common/         Global navigation, error handling
│   ├── setup/          TreeEntity, ListEntity base classes
│   └── odp/            CollectionEntity, TreeTableEntity, form base classes
└── shared/             API client, utilities, error handling
```

### Three-Layer Navigation Hierarchy

Every activity follows the same structural pattern:

- **Layer 1** — Global chrome: persistent top navigation (`Landing | Setup | Elaboration | Publication | Review`), user context, connection status
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

Used for the tree-table perspective on ORs/OCs. Displays a **virtual hierarchy** derived from flat entity lists using a `pathBuilder` function — not from real database parent–child relationships. The path builder returns a typed path array (`drg` → `org-folder` → `on-node` / `or-node`) that drives the tree structure and per-node rendering via `typeRenderers`.

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

## 5. Temporal Perspective (Changes)

The `ChangesEntity` is the only entity with a third perspective beyond collection and tree-table: the **temporal view**, implemented by `TimelineGrid` (`components/odp/timeline-grid.js`).

### 5.1 Layout

The temporal view renders a horizontal grid:

- **Label column** (left) — change title and ID, one row per change
- **Timeline area** (right) — wave columns with milestone markers per row
- A horizontal baseline runs across each change row; milestone pixmaps and connector lines are overlaid on it

The grid header shows wave labels (`2027 Q1`, `2028`, etc.) with vertical guide lines. Only waves that fall within the current time window are shown as columns.

### 5.2 Time Window

The default time window spans all future setup waves (from the earliest future wave to the latest). `ChangesEntity.calculateOptimalTimeWindow()` computes this from `setupData.waves` on first activation. The window is stored in `sharedState.timeWindow` and persists across perspective switches.

Changes with no milestones within the time window are excluded from the temporal view (they remain visible in the collection perspective). `filterChangesByTimeWindow()` in `ChangesEntity` performs this pre-filter before handing data to `TimelineGrid.setData()`.

`TimelineGrid.updateTimeWindow(startDate, endDate)` can be called at any time to recompute the visible wave columns and re-render.

### 5.3 Milestone Pixmap

Each milestone is rendered as a **1-row × 3-column pixmap** positioned at the wave column where the milestone falls. The three columns map to event domain:

| Column | Domain | Events |
|---|---|---|
| Left (`api-cell`) | API | `API_PUBLICATION`, `API_TEST_DEPLOYMENT`, `API_DECOMMISSIONING` |
| Centre (`ui-cell`) | UI | `UI_TEST_DEPLOYMENT` |
| Right (`ops-cell`) | Operations | `OPS_DEPLOYMENT` |

A cell is filled (coloured) when the milestone carries at least one event of that domain. A tooltip on each cell lists the active event display names from the `@odp/shared` `getMilestoneEventDisplay` helper. An empty pixmap (no event types) renders three unfilled cells.

### 5.4 Connector Lines

When a change has two or more visible milestones, `renderConnectors()` draws horizontal connector `<div>` elements between them. Connectors are drawn between each adjacent pair of milestones (sorted by wave date). Milestones whose wave falls outside the visible columns are not connected.

### 5.5 Milestone Filtering

`TimelineGrid` maintains a `milestoneFilters` array (default `['ANY']`). When `ANY` is active all milestones are shown. When specific event types are set:

- Milestones are hidden unless they carry at least one of the filtered event types
- Changes that have no visible milestones after filtering are removed from the grid
- The empty state message distinguishes between "no data" and "no matches for current filters"

`ChangesEntity` stores the current milestone filter in `sharedState.eventTypeFilters` and propagates it to `TimelineGrid.setMilestoneFilters()` on perspective switches and shared-state updates.

### 5.6 Selection and State Sharing

Both item selection (click on change label) and milestone selection (click on pixmap) are supported:

- `onItemSelect(item)` — fires `handleItemSelect` on `ChangesEntity`, updates the shared details panel and syncs `CollectionEntity.selectedItem`
- `onMilestoneSelect(item, milestone)` — fires `handleTimelineMilestoneSelect`, updates the details panel with milestone emphasis

Selection state is stored in `sharedState.selectedItem` and restored when switching back to the temporal perspective via `TimelineGrid.selectItem(itemId)`.

The `AbstractInteractionActivity` parent holds the canonical `sharedState` and coordinates perspective switching. `ChangesEntity.handlePerspectiveSwitch()` applies the shared state to whichever perspective is being activated.

### 5.7 Perspective Toggle UI

The perspective toggle buttons (`📋 Collection` / `📅 Temporal`) are rendered by `ChangesEntity.renderViewControls()` into the `#viewControls` container owned by `AbstractInteractionActivity`. Clicking a button calls `handlePerspectiveSwitch(perspective, sharedState)`.

---

## 6. Rich Text

Rich text fields (`statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `purpose`, `initialState`, `finalState`, `details`) use the **Quill** editor. Content is stored and transmitted as Quill Delta JSON serialised to a string. The web client renders Delta content in read mode using Quill's read-only renderer and edits it with the full Quill toolbar in write mode.

Images can be embedded in Delta content as base64-encoded PNG data. The import pipeline handles the reverse path (Quill Delta → AsciiDoc → Word) for the docx round-trip workflow.

---

## 7. ODIP Edition Context

The edition picker (available in Elaboration and Review activities) resolves to `baseline` + `fromWave` API parameters before any list or get request is issued. The web client never sends `odpEdition` as a raw query parameter to the service layer — resolution happens client-side by reading the selected edition's `baselineId` and `startsFromWaveId` fields.

---

## 8. CSS Architecture

Modular CSS split across six functional files loaded in dependency order:

| File | Coverage |
|---|---|
| `main.css` | Design tokens, base styles, CSS variables |
| `base-components.css` | Buttons, form controls, utilities, loading spinner |
| `layout-components.css` | Header, navigation, modals, cards |
| `table-components.css` | Collection tables, row selection, grouping, empty states |
| `temporal-components.css` | Timeline grid, wave visualisation, milestone connectors |
| `form-components.css` | Tabs, tags, multi-select, validation, alerts |
| `feedback-components.css` | Status indicators, notifications, error states |
| `activities/abstract-interaction-activity.css` | Shared interaction patterns for all collection perspectives |
| `activities/<activity>.css` | Activity-specific overrides only |

The activity-specific files contain only what differs from the shared patterns. Common interaction chrome (tabs, filters, collection container layout, detail panels) lives in `abstract-interaction-activity.css`.

---

## 9. API Integration

The shared API client in `shared/` handles all `fetch` calls, base URL configuration, and error normalisation. All components use this client — no component issues `fetch` directly. The base URL is configured to target the API server port explicitly (`http://<hostname>:8080`) to support remote browser access.

---

## 10. iCDM DrGs Edition 4 Model Changes

The following web client changes align the client with the Edition 4 data model update.

### 10.1 Setup Layer

| Change | Detail |
|---|---|
| `DataCategory` removed | `data-categories.js` deleted; `TreeEntity` now covers `StakeholderCategory` and `Domain` only |
| `Service` removed | `services.js` deleted |
| `Document` → `ReferenceDocument` | `documents.js` replaced by `reference-documents.js`; `description` field removed; `version` optional; `parentId` optional; now a `TreeEntity` (was `ListEntity`); endpoint `/reference-documents` |
| `Domain` added | New `TreeEntity` (`domains.js`); has `contact` textarea field |
| `Bandwidth` added | New `ListEntity` (`bandwidths.js`); unique on `(year, waveId, scopeId)` tuple; select options for wave and scope (domain) resolved from `setupData`; `planned` optional integer field added |
| `Wave` fields renamed | `quarter` → `sequenceNumber`, `date` → `implementationDate`, `name` removed; uniqueness check on `(year, sequenceNumber)` |

`abstract-interaction-activity.js` `loadSetupData()` updated: `dataCategories`/`services`/`documents` replaced by `domains`/`referenceDocuments` loaded from `/domains` and `/reference-documents`.

### 10.2 Operational Requirement Fields

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

### 10.3 Operational Change Fields

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

### 10.4 Milestone Name Field

Milestone `title` field renamed to `name` throughout `change-form-milestone.js`: form input id/name, `collectFormData`, `validateMilestone`, `prepareData`, `renderRow`, and the delete confirmation message.

Wave label in milestone form and table now rendered as `Y{year}Q{sequenceNumber}` (the `name` field was removed from `Wave` in Edition 4).

### 10.5 New Field Types in CollectionEntityForm

Two new `type` values added to `renderInput` / `renderReadOnlyField`:

| Type | Edit rendering | Read rendering | Notes |
|---|---|---|---|
| `static-label` | `<div>` with `staticText` content, no `name` attribute | Label + `staticText` | Skipped in `collectFormData`, `validateForm`, `restoreVersionToForm` |
| `tentative` | `<input type="text">` with pattern `^\d{4}(-\d{4})?$` | Formats `[start,end]` array as `"YYYY"` or `"YYYY-ZZZZ"` | Parsed in `RequirementForm.transformDataForSave` via `parseTentative()` |

### 10.6 Filter Bar

`getFilterConfig()` in `abstract-interaction-activity.js` updated:

- Removed: `service`, `dataCategory`, `document` filters
- Added: `domain` filter (suggest, options from `domains` setupData)
- Renamed: `satisfies` → `implements`
  [← 07 CLI](07-CLI.md) | [09 Deployment →](09-Deployment.md)