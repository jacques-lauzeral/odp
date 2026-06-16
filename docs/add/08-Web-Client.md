# Chapter 08 – Web Client

## 1. Overview

The ODIP web client is a Vanilla JavaScript single-page application (no framework). It communicates exclusively with the REST API and shares data models with the server via the `@odp/shared` workspace package. **Vite** is used as the build tool and development server. The deliberate absence of a UI framework keeps the application flexible while still enforcing consistent component patterns through class-based composition and delegation.

The client is structured as **ODIP Space** — a multi-workspace SPA organised around top-level activities (Home, Elaborate, Explore, Converse, Manage) with shared sub-activities mounted inside the Elaborate and Explore workspace shells.

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
│   │       ├── narrative/
│   │       │   ├── narrative.js            Narrative sub-activity orchestrator
│   │       │   ├── chapter-toc.js          Chapter / topic / O* tree (left panel)
│   │       │   └── chapter-body.js         Chapter narrative / topic / O* detail (right panel)
│   │       ├── plan/
│   │       │   ├── plan.js                 Plan workspace shell
│   │       │   ├── planning.js             ON planning view
│   │       │   ├── on-planning.js          ON plan + Gantt
│   │       │   ├── prioritisation.js       OC wave assignment
│   │       │   ├── prioritisation-grid.js
│   │       │   ├── waves.js                Wave management
│   │       │   └── bandwidths.js           Bandwidth grid management
│   │       ├── quality/
│   │       │   └── quality.js              Dataset quality checks — on-demand report, context-aware
│   │       └── setup/
│   │           ├── setup.js                Setup sub-activity shell — shared Elaborate/Explore
│   │           ├── stakeholder-categories.js
│   │           └── reference-documents.js
│   │       └── change-sets/
│   │           ├── change-sets.js          Change Sets sub-activity — shared Elaborate/Explore
│   │           └── change-set-form.js      Create/edit form (extends CollectionEntityForm)
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
│   ├── header.js                           Global header — nav tabs, change-set chip, connect popup
│   ├── breadcrumb.js                       Breadcrumb trail utility (used by NarrativeActivity)
│   ├── master-detail.js                    Reusable two-column resizable layout
│   ├── tree-entity.js                      Base class for hierarchical entity management (MasterDetail layout)
│   ├── list-entity.js                      Base class for flat entity management (table layout)
│   ├── collection-entity.js                Base class for operational entity table/list perspective
│   ├── collection-entity-form.js           Base form class with config-driven tab rendering
│   ├── rich-text-component.js              TipTap-backed rich text editor/viewer component
│   ├── tree-table-entity.js                Base class for tree-table perspectives
│   ├── temporal-grid.js                    Generic temporal visualisation grid
│   ├── filter-bar.js                       FilterBar chip component
│   ├── reference-list-manager.js           Chip list + search popup (0..n references)
│   ├── reference-manager.js                Canonical single-value tree picker
│   ├── annotated-multiselect-manager.js    Reference list with per-item note
│   ├── diff-popup.js                       Version comparison modal
│   ├── change-set-commit-dialog.js         Commit gate dialog for versioned writes
│   ├── odp-column-types.js
│   └── user-dialogs.js                     ODIP-styled modal helpers: odipConfirm, odipUnsavedChanges, odipPromptLink
│
└── shared/
    ├── router.js
    ├── api-client.js
    ├── error-handler.js
    ├── utils.js
    └── src/                                @odp/shared copy (build artefact)
```

`vite.config.js` lives at `web-client/vite.config.js` (workspace root for the web client package).

> **Component placement convention:** all components live flat under `components/`. There is no `components/odp/` subfolder.

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
| Narrative | `narrative` | `NarrativeActivity` |
| Plan | `plan` | `PlanActivity` |
| Quality | `quality` | `QualityActivity` |
| Setup | `setup` | `SetupActivity` |
| Change Sets | `change-sets` | `ChangeSetsActivity` |

**Manage tab strip:**

| Tab | Sub-path segment | Sub-activity |
|---|---|---|
| Editions | `editions` (default) | `EditionsActivity` |

Context difference (live vs edition, R/W vs R/O) flows transparently through `app.getDatasetContext()` — sub-activities do not need to know which shell they are mounted in.

**Setup sub-path routing:** `SetupActivity` accepts a two-segment sub-path: `[entityKey, itemId?]`. `entityKey` selects the tab (`stakeholder-categories` or `reference-documents`); the optional `itemId` is forwarded to `TreeEntity.selectItem(itemId)` after render, enabling direct deep-links to a specific item (e.g. `/elaborate/setup/reference-documents/66`).

**Change Sets sub-path routing:** `ChangeSetsActivity` accepts a one-segment sub-path `[itemId?]`; the optional `itemId` is selected after load (deep-link to a specific change set, e.g. `/elaborate/change-sets/4201`).

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

Every inter-O\* navigation pushes a URL history entry via `window.history.pushState`. Panel row selection does not affect browser history. Tab switches between workspace sub-activities (O\*s, Narrative, Plan, Quality, Setup) push history entries via the router. All canonical O\* URLs are deep-linkable and reconstructable from the URL alone.

---

## 4. App and Dataset Context

`App` (`app.js`) is the singleton application class. It owns:

- Activity lifecycle (`_loadActivity`, lazy instantiation, cleanup, `canDeactivate` guard)
- Router instantiation and delegation
- User state (`setUser` / `getUser`) — persisted to localStorage by Header
- Dataset context (`setDatasetContext` / `getDatasetContext`) — set by Home on selection
- Active change set (`setActiveChangeSet` / `getActiveChangeSet`) — see §13
- Setup data cache (`getSetupData` / `invalidateSetupData`) — lazy-loaded, shared across all activities
- Chapter cache (`getChapters`) — config-driven, cached permanently
- O* summary cache (`getOStars` / `findOStar` / `invalidateOStars`) — TTL-refreshed, 5 minutes
- Connection monitoring (polls `GET /ping` every 60 seconds; dispatches `connection:change` on `window`)

### 4.1 Dataset Context

Dataset context is set on `App` by Home when the user selects a dataset. It is the single mechanism by which all sub-activities discover whether they operate against the live dataset or an edition snapshot.

**Dataset context shape:**

```js
{ type: 'live' }                        // Elaborate context
{ type: 'edition', editionId: number }  // Explore context
```

Sub-activities read `app.getDatasetContext()` on mount to determine:

- Whether to pass `?edition={editionId}` to API calls
- Whether edit actions are available (`type: 'live'`) or suppressed (`type: 'edition'`)

Edition context resolution — mapping the edition to a baseline and optional start date — happens server-side. The web client passes the edition ID directly to the API as `?edition=<id>` and never resolves `baselineId` or `startDate` client-side.

### 4.2 Setup Data Cache

**Setup data shape** (loaded once, cached):

```js
{ stakeholderCategories, referenceDocuments, waves }
```

`invalidateSetupData()` must be called after any setup entity CRUD operation.

### 4.3 O* Summary Cache

**O* summary shape** (TTL-cached, 5 minutes, stale-while-revalidate):

```js
{ itemId: number, type: string, code: string, title: string, domain: string|null, versionId: string|null }
```

`getOStars()` returns the full summary array. `findOStar(itemId)` returns a single summary or `null`. `invalidateOStars()` must be called after any O* create/update/delete operation.

### 4.4 Single Data Load and Shared State

Activities that present the same entity set through more than one view (e.g. the Plan activity, or any entity component exposing collection plus tree-table perspectives) follow a single-load pattern coordinated through `App`:

- **Single data load** — entities are fetched once and distributed to all active views via an `onDataUpdated(data)` callback; no view fetches independently.
- **Shared state** — filters, selection, and grouping are coordinated across views in a shared `sharedState` object rather than duplicated per view.
- **Injected callbacks** — views receive `onItemSelect`, `getViewControlsEl`, `isReadOnly` at construction and hold no back-reference to their parent activity.

### 4.5 Unsaved-Changes Guard — Top-Level Activity Switch

`App._loadActivity()` calls `canDeactivate()` on the current activity before mounting a new one. If `false` is returned, `router._activeSegment` is restored to the current activity name (so the Header tab reverts) and the load is aborted. `ElaborateActivity.canDeactivate()` forwards to the current sub-activity's `canDeactivate()` if present, enabling the guard to reach `NarrativeActivity` through the shell layer.

---

## 5. Header and User Identification

`Header` (`components/header.js`) owns a single-row layout:

- **Row 1** — logo · brand · nav tabs · right cluster (change-set chip · Connect/username button · server status dot)

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

### 5.1 Access Model

User identification is entirely client-side. Anonymous users can access Home, Explore, and Converse. `/elaborate` and `/manage` require an identified user — the router redirects to `/` if no user is set.

Server-side, all GET routes accept requests without an `x-user-id` header (returning `null` userId), enabling anonymous read access to Home (edition list) and Explore. Write operations still require `x-user-id`. Affected route files: `simple-item-router.js`, `versioned-item-router.js`, `odp-edition.js`, `baseline.js`.

---

## 6. Component Patterns

Four base component classes cover all entity management needs. They are the architectural patterns that concrete activities build on; individual reusable UI components are catalogued separately in §7.

### 6.1 TreeEntity

Used for hierarchical setup entities (`StakeholderCategory`, `ReferenceDocument`). Located in `components/tree-entity.js`. Renders a `MasterDetail` layout: tree navigation on the left, item details and action buttons on the right. Supports expand/collapse, parent reassignment, and context-sensitive actions (Add Child restricted by `parentScope`, Delete restricted to leaves).

Concrete subclasses declare only three things — no methods required:

| Declaration | Purpose |
|---|---|
| `entityLabel` | Singular display name (e.g. `'Stakeholder Category'`) |
| `parentScope` | `'all'` — any non-self item as parent; `'roots'` — root items only (grandchildren blocked at UI level) |
| `fields` | Array of `{ name, label, type, required }` for entity-specific fields, appended after `baseFields` |

`TreeEntity` declares `baseFields = [{ name: 'description', label: 'Description', type: 'textarea', required: false }]` — rendered before subclass `fields` in all forms and detail views.

The parent field uses `ReferenceManager` (§7.4) instead of a native `<select>`. The manager is wired after modal DOM insertion via `_initParentRM(modal)` and destroyed on `_closeModal`.

`ReferenceDocument` additionally overrides `getDisplayName()` to append the version. Its `parentScope` is `'all'`, supporting up to three levels (root / child / grandchild).

### 6.2 ListEntity

Used for flat planning entities (`Wave`, `Bandwidth`). Located in `components/list-entity.js`. Single-pane table with sortable columns and direct CRUD operations. Concrete subclasses (`waves.js`, `bandwidths.js`) live in `activities/workspace/shared/plan/`.

### 6.3 CollectionEntity

Used for operational entities in table/list perspective. Provides filtering, grouping, column configuration, row selection, and a details panel. Complex entities (requirements, changes) use **delegation** — the entity class owns a `CollectionEntity` instance and passes callbacks for filter config, column config, grouping config, and event handlers. This keeps entity-specific logic out of the base component.

**Keyboard navigation & focus management.** `CollectionEntity` supports ArrowDown / ArrowUp navigation through the visible collection rows:

- `collection-content` wrapper has `tabindex="0"` — focusable without affecting tab order of interactive elements inside
- Clicking a row calls `selectItem()` then immediately focuses `collection-content` so arrow keys work without an extra click
- A `keydown` listener on `collection-content` intercepts ArrowDown / ArrowUp, calls `_navigateByKey(±1)`, then re-asserts focus via `focus({ preventScroll: true })`
- `_navigateByKey(delta)` operates on **visible DOM rows** (`querySelectorAll('.collection-row')`) — not `this.data` — so filtering and search are automatically respected
- Clamps at boundaries; no wrap

**Tab preservation across item selection.** When the user switches selection in the master list, the active tab in the detail form is preserved:

- `RequirementDetails.render()` and `ChangeDetails.render()` capture `formExisted = this._form != null` before `_ensureForm()`
- `generateReadOnlyView(item, formExisted)` — `preserveTabIndex = true` on re-renders, `false` on first render
- `CollectionEntityForm._activeInstance` static property tracks the currently rendered panel form instance; `initializeReadOnlyInPanel` sets it on every panel render
- The shared document-level tab delegation listener updates `_activeInstance.currentTabIndex`, so the currently rendered panel form is the one whose tab index is tracked

### 6.4 TreeTableEntity

Used for tree-table perspectives on ORs/OCs and for the ON tree in the Plan activity. Builds tree structure from a flat entity list using a configurable `pathBuilder` function. The path builder returns a typed path array that drives both tree structure and per-node rendering via `typeRenderers`.

The `pathBuilder` may produce **virtual hierarchy** (e.g. `domain-folder → on-node` derived from entity attributes) or **graph-based hierarchy** (e.g. `parent-on-node → child-on-node` derived from real `refines` relationships). Both modes are supported without component modification.

**Build algorithm invariants:**

- Each path item carries an `id` used as the node key. Intermediate nodes must carry `entityId` so the build algorithm can attach the entity to the node for cell rendering.
- When a node already exists as a leaf but is later traversed as an intermediate node, it is demoted: `isLeaf = false`, `expandable = true`.
- Column renderers receive `context` in the `item` argument position (3rd arg). Affected renderers normalise with `context = context ?? item` at the top.

Filter matchers are injected as `options.filterMatchers`, enabling consistent filter behaviour across all perspectives sharing a `TreeTableEntity`.

**Scroll preservation.** `TreeTableEntity.renderContent()` saves and restores `scrollTop` on `.tree-table-container` around every `innerHTML` replacement, ensuring expand/collapse and row selection do not scroll the tree back to the top.

### 6.5 CollectionEntityForm

Abstract base class for entity forms. Concrete forms (`RequirementForm`, `ChangeForm`) extend it and implement: `getReadConfig()`, `getEditConfig()`, `hydrateField()`, `onSave()`, `onValidate()`, and optionally `transformDataForSave()` / `transformDataForEdit()`. The base class handles modal lifecycle, field rendering, validation orchestration, and error display.

**Commit gate — `requiresChangeSet()`.** `handleSave()` applies the LCM commit gate (§13.5) only when `requiresChangeSet()` returns `true` (the default — every O\* form). Non-versioned forms override it to `false`: `ChangeSetForm` (a change set is itself the reason carrier) and `ODPEditionForm` (editions are not versioned writes). When `false`, no commit dialog is shown and no `changeSetId` is attached to the save payload.

**`editableOnlyOnCreate` field flag.** A field marked `editableOnlyOnCreate: true` is editable in create mode and read-only (immutable) in edit mode. The base treats it as a normal field **only in create** — rendered editable, with `required` honoured for both the `*` marker and validation; in edit it renders read-only and is skipped by `validateForm`/`collectFormData`. So such a field can be declared `required: true` safely (mandatory on create, untouched on edit).

Key methods used by detail views:

| Method | Purpose |
|---|---|
| `generateReadOnlyView(item)` | Returns tabbed HTML for read-only display |
| `initializeReadOnlyInPanel(container, item)` | Initialises rich text components and reference managers after HTML injection |
| `showEditModal(item)` | Opens edit popup |
| `showCreateModal()` | Opens create popup |

#### 6.5.1 Field Type Vocabulary

| Type | Component | Cardinality | Notes |
|---|---|---|---|
| `select` | Native `<select>` | 1 | Enum choices |
| `number` | Native `<input type="number">` | 1 | Optional integer |
| `text` | Native `<input type="text">` | 1 | Scalar text |
| `static-label` | `<div>` with `staticText`, no `name` | — | Skipped in `collectFormData`, `validateForm`, `restoreVersionToForm` |
| `tentative` | `<input type="text">` pattern `^\d{4}(-\d{4})?$` | 1 | Formats `[start, end]` as `"YYYY"` or `"YYYY-ZZZZ"`; parsed via `parseTentative()` → `parseYearPeriod()` |
| `reference` | `ReferenceManager` (§7.4) | 0..1 | Inline typeahead; value wrapped in `[id]` array on save |
| `reference-list` | `ReferenceListManager` (§7.5) | 0..n | Chip list + search popup; may be computed/read-only via `computeKey` |
| `annotated-reference-list` | `AnnotatedMultiselectManager` (§7.6) | 0..n with note | Table with per-item note |
| `richtext` | `RichTextComponent` (§7.3) | — | TipTap JSON stored as stringified JSON |

#### 6.5.2 Layout Configs

Forms expose two declarative layout configs exported from `requirement-form-fields.js` / `change-form-fields.js`. They replace the former single `getFieldDefinitions()` section catalogue: layout and field metadata live together, and the edit config is the single source of truth for validation, data collection, and manager initialisation. When either config is non-null, `generateForm()` delegates to `_generateFormFromConfig()`.

| Config | Returned by | Role |
|---|---|---|
| `*ReadConfig` | `getReadConfig()` | Read-mode layout only — keys plus layout hints. Field metadata resolved from the edit config field map at render time. |
| `*EditConfig` | `getEditConfig()` | Edit/create layout **and** full field metadata (type, label, required, options, validation, placeholder, helpText). Source of truth for `validateForm`, `collectFormData`, manager init, and `restoreVersionToForm`. |

Both share a common shape: `{ sections: [ { title, modes?, fields: [...] } ] }`. Field `key` is the contract linking read entries to their metadata in the edit config. The legacy `getFieldDefinitions()` virtual is retained only as an empty-returning fallback for forms that have not adopted the config pattern.

**Section properties:**

| Property | Meaning |
|---|---|
| `title` | Tab label. |
| `modes` | Optional `['create' \| 'edit']`. Restricts the section to the listed modes; absent means both. Used to hide `Derived` and `Metadata` sections in create mode. |
| `fields` | Ordered list of field entries and row wrappers. |

**Field entry properties** — a `fields` entry is either a bare field (`{ key, ... }`) or a row wrapper (`{ row: [ ...fields ], valueInline? }`):

| Property | Applies | Meaning |
|---|---|---|
| `key` | field | Field identifier; in the edit config the entry also carries full metadata. |
| `visibleWhen` | field | `'ON'` \| `'OR'` (matched against `item.type`) or `(item) => bool`. Absent = always visible. |
| `readOnly` | field (edit) | Renders as display value in edit mode; suppressed entirely in create mode. Used for `itemId`, `version`, `_history`, and derived `refinedBy` / `implementedBy`. |
| `confirmOnChange` | field (edit) | Intercepts the field's change event; the user must confirm before the new value is accepted. Applied to `domain`. |
| `hideIfNullOrEmpty` | field (read) | When the value is null, empty string, or empty array, the field is not rendered. Default false. Applied to forward-reference fields so empty relations vanish in read mode. Derived fields deliberately omit it and always render. |
| `row` | wrapper | Array of field entries rendered side-by-side. A single visible child collapses to full width (unless `valueInline`). No visible children → the row emits nothing. |
| `valueInline` | row | When true, the row's fields render label and value on one line (`label \| value`) via `form-row--inline`, and even a single visible field stays wrapped so the inline styling applies. Used for compact metadata pairs (`maturity`/`tentative`, `itemId`/`version`). |

**hydrateField** — each form binds string references (`optionsKey`, `formatKey`, `computeKey`, `renderKey`) on its edit-config field entries to actual bound methods. `_buildFieldMap()` calls `this.hydrateField(entry)` on every field as it builds the map.

**Computed reference fields** (`type: 'reference-list'` with `computeKey`) derive their value at initialisation time by calling a named method on the form instance. `initializeReferenceListManagers` calls `field.compute(this.currentItem)` when present.

**Renderer** — `_generateFormFromConfig()` consumes the active config:

- `_buildFieldMap()` flattens the **edit** config (including row children) into `Map<key, hydratedFieldDef>`, calling `hydrateField()` per entry; cached by `_getFieldMap()`.
- `_isSectionVisibleFromConfig()` applies section `modes` and per-field `visibleWhen`.
- `_renderConfigEntry()` / `_renderConfigRow()` handle bare fields and `row` wrappers, applying `hideIfNullOrEmpty` and `valueInline`.
- `_resolveFieldDef()` looks up metadata by key from the field map; `_resolveEntryVisible()` evaluates `visibleWhen`.
- `_attachConfirmOnChangeListeners()` wires `confirmOnChange` fields after the modal DOM is ready (called from each form's modal-ready hook). The handler is async and uses `odipConfirm` from `user-dialogs.js` (§7.8) with the message `Do you really want to re-assign this ${type} to another domain?` — replacing `window.confirm`.

There is no header/strip concept: `code` and `title` are shown in the detail toolbar (`requirement-details.js` / `change-details.js` render `code — title`, matching the TOC), not repeated inside the form body.

**Context resolvers** — forms receive resolver functions in their `context`:

| Resolver | Returns | Used by |
|---|---|---|
| `getSetupData()` | Setup data object | `getSetupDataOptions`, `getReferenceDocumentOptions` |
| `getRequirements()` | Full live requirements array | `_computeImplementedByIds`, `_computeRefinedByIds`, `getAllRequirementOptions` |
| `onNavigate(ref)` | — | Enables navigable reference chips in read mode |
| `app` | `App` instance | `_getLinkProvider()` — reference target preloading; commit gate (§13) |
| `onInternalLink` | — | `initializeRichTextReadOnly()` — internal link click navigation |
| `onSaved(result, mode)` | — | Save-propagation callback (see below) |

**Edit mode field layout** — `renderEditableField` applies `.form-group--inline` to scalar field types (`text`, `number`, `select`, `tentative`, `reference`), rendering the label left of the input on a single line. Spatially extended types (`richtext`, `reference-list`, `annotated-reference-list`, `custom`) keep the label-above-value layout. `helpText` is suppressed for inline scalar fields — the placeholder carries the hint.

**Read mode field rendering** — non-scalar field wrappers (`reference-list`, `reference`, `richtext`, `annotated-reference-list`) receive the `.detail-field--block` modifier, which indents the value area. Read mode labels match edit mode style (no uppercase, `font-size-sm`, `font-weight-medium`).

**Ancillary exports** — the `*-form-fields.js` modules also export the save-path helpers consumed by `transformDataForSave`: `requiredIdentifierArrayFields`, `requiredAnnotatedReferenceArrayFields` (requirement only), `requiredTextFields`, `optionalTextFields` (change only), the `*FormTitles` map, and `*Defaults`.

**Save propagation** — `CollectionEntityForm` fires an optional `onSaved(result, mode)` callback after any successful create or edit (`mode` is `'create'` | `'edit'`), in addition to the legacy `entitySaved` DOM event. The detail views capture `callbacks.onSaved` on every `render()` and route the form's `onSaved` through `_handleSaved(result, mode)`, which re-renders their own panel from the server then forwards to the caller. This single mechanism replaces ad-hoc reload logic and works identically in the O* and Narrative perspectives.

**OC-specific focus fixes:**

- **Stale MutationObserver** — `ChangeForm.loadHistoryWithObserver` is called on every `generateReadOnlyView`. Without a disconnect guard, each OC re-render accumulated a new observer on `document.body`; stale observers fired on subsequent DOM mutations. Fix: `this._historyObserver?.disconnect()` before creating the new observer.
- **TipTap read-only focus** — `RichTextComponent` in read-only mode calls `blur()` immediately after `mount()` to prevent focus theft. The edit modal is unaffected — `focusFirstInput()` runs after modal open.

---

## 7. Components

Reusable UI components, each described independently of the activities that consume it. These are distinct from the base component *patterns* in §6: the items here are concrete widgets with their own public API.

### 7.1 MasterDetail

`MasterDetail` (`components/master-detail.js`) is a reusable two-column resizable layout used by `OsActivity`, `NarrativeActivity`, `TreeEntity` (Setup), and `EditionsActivity` (Manage).

Public API:

```js
md.render()                  // Mount into container
md.listContainer             // HTMLElement — mount list content here
md.detailContainer           // HTMLElement — mount detail content here
md.setDetail(html)           // Replace right column content
md.clearDetail()             // Restore placeholder
md.cleanup()                 // Unbind resize listeners
```

### 7.2 TemporalGrid

`TemporalGrid` (`components/temporal-grid.js`) is a single generic component for all temporal visualisations. It renders a horizontal grid with a continuous **calendar-based time axis** and a structured row hierarchy. All domain knowledge lives in the caller.

#### 7.2.1 Data Model

```javascript
// TimelineMilestone
{
    label:       string,        // short display label
        description: string,        // tooltip / detail text
    eventTypes:  string[],      // one or more event type keys
    date:        Date           // calendar position
}
```

#### 7.2.2 Row Taxonomy

Four row kinds are supported, rendered in insertion order:

| Kind | Description |
|---|---|
| `separator` | Full-width label spanning both label and axis columns. No timeline track, no selection. Used as a visual section header (e.g. domain name). |
| `group` | Label column + timeline track + expand/collapse toggle (`▶/▼`). Collapsing hides all child rows. Expand state preserved across re-renders. |
| `child` | Indented label column + timeline track. Visibility controlled by parent group's expanded state. |
| `timeline` | Flat label column + timeline track. No hierarchy — used by `ChangesEntity`. |

#### 7.2.3 Public API

**Time axis**

```javascript
setTimeInterval(startYear, endYear)   // set visible interval; fires timeIntervalListeners
setTicks(ticks)                       // ticks: [{ label: string, date: Date }]
getTimeInterval()                     // → { startYear, endYear }
addTimeIntervalUpdateListener(fn)     // fn(startYear, endYear)
```

**Milestone rendering** — `setMilestoneRendering(spec)`, one call per instance before adding rows. Two modes:

*Icon mode* — one marker per milestone, styled by event type:

```javascript
{ mode: 'icon', eventTypes: { 'period-start': { icon: '▶', colour: '#2563eb' }, ... } }
```

*Pixmap mode* — a `rows × cols` pixel grid per milestone:

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

**Row management**

```javascript
addGroupRow(id, label, milestones)          // header/separator rows: addGroupRow(id, label, [])
addChildRow(id, parentId, label, milestones)
addRow(id, label, milestones)               // flat row — used by ChangesEntity
updateRow(id, milestones)
removeRow(id)
clearRows()
```

All row-management calls trigger a full re-render. Rows are rendered in insertion order.

**Selection**

```javascript
addSelectionListener(fn)              // fn(id) — fires on every click, always
setTimeLineSelected(id, boolean)      // programmatic selection; does NOT fire listeners
getSelectedTimeLine()                 // → id | null
```

**Lifecycle**

```javascript
render(container)
cleanup()
```

#### 7.2.4 Connector Lines

When a row has two or more milestones visible within the current time interval, the component draws horizontal connector lines between adjacent milestones (sorted by date).

#### 7.2.5 Zoom Control

`TemporalGrid` renders a zoom control bar above the grid accepting `YYYY` or `YYYY-ZZZZ` format. Delegates parsing to `parseYearPeriod()` from `shared/year-period.js`. Absolute bounds (`minYear`, `maxYear`) are injected as constructor options (default `2025`–`2045`).

### 7.3 RichTextComponent

Rich text fields (`statement`, `rationale`, `flows`, `nfrs`, `privateNotes`, `purpose`, `initialState`, `finalState`, `details`) use the **TipTap** editor. Content is stored and transmitted as TipTap document JSON serialised to a string. `RichTextComponent` (`components/rich-text-component.js`) encapsulates all TipTap instantiation, configuration, and lifecycle. It is the single point of rich text usage across all forms and detail views.

#### 7.3.1 Storage Format

TipTap JSON document format:

```json
{ "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "..." } ] } ] }
```

This is the canonical format at rest (Neo4j), in transit (REST API), and in the browser. The `DistributedEditionImporter` converts Quill Delta source files to TipTap JSON at import time via `_deltaToTipTap()`.

#### 7.3.2 Constructor Options

| Option | Type | Default | Description |
|---|---|---|---|
| `readOnly` | boolean | `false` | Read-only viewer (no toolbar, non-editable) |
| `headings` | boolean | `false` | Enable H1/H2/H3 toolbar buttons (narrative context only) |
| `images` | boolean | `true` | Enable image embed via file upload |
| `tables` | boolean | `true` | Enable table toolbar buttons |
| `placeholder` | string | `''` | Placeholder text for empty edit fields |
| `onChange` | Function | `null` | Called with TipTap JSON string on every content change |
| `onInternalLink` | Function | `null` | Called with `(type, value)` on internal link click in read-only mode. `type`: `'n-ref'` \| `'o-ref'` \| `'d-ref'`; `value`: the mark's value attribute. Navigation implemented by the caller. |
| `linkProvider` | object | `null` | Supplies reference targets for the toolbar `#` picker (see §7.3.6). When absent, only the external-link button is shown. |
| `availableBlockIds` | string[] | `[]` | Block IDs for insertion in this chapter's narrative. Feeds the ⚙ dropdown in edit mode. Always `[]` for O* field editors. Never passed in read-only mode. |
| `availableStringKeys` | string[] | `[]` | Inline string keys for insertion in this chapter's narrative. Combined with `availableBlockIds` in the same ⚙ dropdown, separated by a divider. Always `[]` for O* field editors. Never passed in read-only mode. |

#### 7.3.3 Public API

| Method | Description |
|---|---|
| `mount(container)` | Mount editor into container element |
| `getValue()` | Return current content as JSON string, or `null` if empty |
| `setValue(jsonString)` | Replace editor content from JSON string |
| `destroy()` | Destroy TipTap instance and clean up DOM |
| `focus()` | Focus the editor (edit mode only) |
| `blur()` | Blur the editor |

**Extensions loaded:** `StarterKit` (paragraph, bold, italic, strike, lists, code, blockquote, hardBreak), `Underline`, `TextStyle`, `Link`, `Image`, `Table`/`TableRow`/`TableHeader`/`TableCell`, `Placeholder`, `OdipNRef`, `OdipORef`, `OdipDRef`, `GeneratedBlockMark`, `GeneratedStringMark`, `odipLinkClick` (custom ProseMirror plugin — see §7.3.5).

#### 7.3.4 Internal Reference Marks

Three mark extensions (`OdipNRef`, `OdipORef`, `OdipDRef`) preserve round-tripped content and support authoring via set/unset commands:

| Mark name | Rendered as | Attributes | Semantics |
|---|---|---|---|
| `n-ref` (`OdipNRef`) | `<span data-n-ref="{value}" data-label="{label}">` | `value`, `label` | Narrative reference: `{chapterId}[/{topicId}]` |
| `o-ref` (`OdipORef`) | `<span data-o-ref="{value}" data-label="{label}">` | `value`, `label` | O* reference: opaque O* itemId |
| `d-ref` (`OdipDRef`) | `<span data-d-ref="{value}" data-label="{label}">` | `value`, `label` | Strategic document reference: refdoc id — **legacy/imported content only** (see §7.3.6) |
| `generated-block` (`GeneratedBlockMark`) | `<span data-generated-block="{id}" class="generated-block-chip">` | `id` | Block placeholder — chapter narratives only. In edit mode rendered as a non-editable ⚙ chip. In read-only mode `ChapterBody` substitutes the mark with resolved TipTap node arrays (see §8.3). |
| `generated-string` (`GeneratedStringMark`) | `<span data-generated-string="{key}" class="generated-string-chip">` | `key` | Inline string placeholder — chapter narratives only. In edit mode rendered as a non-editable Σ chip. In read-only mode `ChapterBody` substitutes the mark with the resolved plain-text value (see §8.3). |

Each mark stores `value` (stable target identifier) and `label` (cached display text — may be absent on legacy imported marks). Each exposes `set{X}({ value, label })` / `unset{X}()` TipTap commands for programmatic authoring.

In read-only mode, `n-ref` and `o-ref` spans are styled as clickable links and a delegated click listener fires `onInternalLink(type, value)`. Navigation is implemented by the caller; the component is navigation-agnostic. `d-ref` spans in legacy/imported content follow the same path. Newly authored strategic document references are inserted as standard `link` marks (see §7.3.6) and open the document URL directly — `onInternalLink` is not involved.

**Read-only mode** — `editable: false` is set on the TipTap instance; the toolbar is omitted; `blur()` is called immediately after mount to prevent focus theft.

**Toolbar keyboard accessibility** — all toolbar buttons, the heading select, and dropdown menu items are created with `tabIndex = -1`. Tab therefore skips the entire toolbar and lands directly on the editor's content area. Toolbar controls remain accessible via mouse/click.

#### 7.3.5 Toolbar Structure and Link Behaviour

The toolbar is organised in groups (`.rich-text-component__toolbar-group`), rendered left to right:

| Group | Buttons | Condition |
|---|---|---|
| Text formatting | Bold · Italic · Underline · Strikethrough | always |
| Headings | H1 · H2 · H3 | `headings: true` only |
| Lists | Bullet list · Ordered list | always |
| Links | 🔗 External link · `#` Insert reference | `#` button only when `linkProvider` present |
| Images | 🖼 Insert image | `images: true` only |
| Tables | ⊞ Insert · +row · -row · +col · -col · ✕tbl | `tables: true` only |
| Generated content | ⚙ Insert block or string | `availableBlockIds` or `availableStringKeys` non-empty |

The toolbar is `position: sticky; top: 0` so it remains visible when the ancestor container scrolls.

**External link button (🔗)** — opens `odipPromptLink` dialog (§7.8) with two fields: URL and link text. Pre-fills link text from the current selection; pre-fills URL when the cursor is inside an existing `link` mark. On confirm, inserts or updates a `link` mark. When the URL field is cleared, the link mark is removed. The editor selection (`from`/`to`) is captured synchronously before the dialog opens to survive the `await`.

**Link click behaviour (`odipLinkClick` plugin)** — a custom ProseMirror plugin replaces TipTap's built-in `openOnClick` handling. It handles `handleDOMEvents.click` on `<a href>` elements:

| Mode | Trigger | Behaviour |
|---|---|---|
| Read-only | Any click | Opens `href` in a new tab (`target="_blank"`, `noopener,noreferrer`) |
| Edit | Ctrl/Cmd+click | Opens `href` in a new tab |
| Edit | Plain click | Passed through — ProseMirror places the cursor normally |

**Reference picker (`#` button)** — opens a modal overlay (`.rich-text-ref-popup`) with a type selector row (**O\*** `o-ref` · **Narrative** `n-ref` · **Document** `d-ref`) and a `ReferenceManager` typeahead preloaded from the `linkProvider`. On selection, `_applyRef(type, value, label, url?)` applies the mark to the current selection. For `o-ref`/`n-ref`, the corresponding mark is applied. For `d-ref`, a standard `link` mark is inserted pointing to the document's `url` — no `OdipDRef` mark is used for newly authored references. When the selection is empty, the label is inserted as text first, then marked. The editor selection is captured before the overlay opens and restored on apply via `setTextSelection`.

#### 7.3.6 Reference Authoring — `linkProvider` and `link-provider.js`

`RichTextComponent` supports authoring of `o-ref`, `n-ref`, and `d-ref` marks in edit mode when a `linkProvider` is injected by the owner. The provider is built via the factory `buildLinkProvider(app)` exported from `components/link-provider.js`.

`buildLinkProvider(app)` accepts an `App` instance and returns a provider object:

| Method | Description |
|---|---|
| `load()` | Preload all target nodes (chapters, refdocs, O\*s) from the app cache. Returns a `Promise`; no-op if already loaded. |
| `nodes(type)` | Return `ReferenceManager`-compatible node tree for `'o-ref'`, `'n-ref'`, or `'d-ref'`. Synchronous after `load()`. |
| `options(type)` | Return flat `Array<{ value, label }>` — backward-compat for flat-list consumers. |
| `isLoaded()` | Returns `true` once `load()` has completed. |

**Target preloading** — one `Promise.all` on first `load()` call, parallel to the three app caches:

| Mark type | Source | `value` | `label` | Node shape |
|---|---|---|---|---|
| `n-ref` | `app.getChapters()` | chapter `itemId` (string) | chapter title | Chapter hierarchy tree; topics/subtopics lazy via `onExpand` — fetches `apiClient.getChapter(itemId)` (extended projection) on first expand since `app.getChapters()` returns standard projection without `osHierarchy` |
| `d-ref` | `app.getSetupData().referenceDocuments` | refdoc `id` (string) | `name (version)` or `name` | Hierarchy tree via `ReferenceManager.buildTreeNodes()` when `parentId` present; flat leaf nodes otherwise. Each node carries an additional `url` field used at insertion time. |
| `o-ref` | `app.getOStars()` | O\* `itemId` (string) | `"{code} — {title}"` | Flat leaf nodes sorted by code |

O\* volumes are bounded (hundreds); preloading is cheap and avoids per-keystroke API calls. The interface supports swapping to async search behind the same `nodes(type)` contract without touching consumers.

**Owner responsibility** — `ChapterBody` is the reference implementation. It lazily creates a single `linkProvider` instance (stored as `this._linkProvider`) and passes it to `RichTextComponent` only in edit mode. `RequirementDetails` and `ChangeDetails` follow the same pattern when O\* rich-text fields are opened in edit mode.

#### 7.3.7 Integration with CollectionEntityForm

`CollectionEntityForm` manages `RichTextComponent` instances:

- **Edit/create** — `initializeRichTextEditors()` finds `.richtext-edit-placeholder` elements, mounts a `RichTextComponent` per field, wires `onChange` to a hidden `<input>`, and passes `linkProvider: this._getLinkProvider()` to enable reference authoring.
- **Read** — `initializeRichTextReadOnly()` finds `.richtext-readonly-placeholder` elements, mounts a read-only `RichTextComponent` per field, and passes `onInternalLink: this._onInternalLink` so reference spans are navigable.
- Instances are stored in `this.richTextComponents[fieldKey]` and destroyed in `cleanupRichTextComponents()`.

`_getLinkProvider()` lazily builds a `linkProvider` from `context.app` on first call via `buildLinkProvider(app)`; returns `null` when `context.app` is absent (e.g. standalone modal not owned by a details view), in which case only the external-link toolbar button is shown.

`RequirementDetails` / `ChangeDetails` `_handleInternalLink(type, value)` resolves all three mark types against the active dataset context:

| Mark | Resolution | Target |
|---|---|---|
| `n-ref` | Direct — value is `{chapterId}[/{topicId}]` | `{ctxBase}/narrative/{chapterId}[?theme={topicId}]` |
| `o-ref` | `app.findOStar(itemId)` → resolves type | `{base}/os/{type}/{itemId}` |
| `d-ref` | Direct — value is refdoc id (legacy imported marks only) | `{ctxBase}/setup/reference-documents/{id}` |

#### 7.3.8 Content Emptiness Check

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

Used by `OperationalRequirementService` and `OperationalChangeService` in `_validateMaturityGatedFields` to enforce that maturity-gated rich-text fields are non-empty.

#### 7.3.9 Images

Images are embedded as base64-encoded data URLs directly in the TipTap JSON (`type: 'image'`, `attrs.src`). The toolbar image button opens a hidden file input; the selected file is read via `FileReader.readAsDataURL` and inserted via `editor.chain().setImage({ src })`.

#### 7.3.10 Sticky Toolbar & Vertical Scroll Invariant

> ⚠️ **Fragile — read before changing any `overflow` or `height` rule on a rich-text container or its ancestors.** This behaviour has regressed several times. The symptom of a break is either the toolbar scrolling out of view while editing a long narrative, or editor content overflowing onto sibling fields with no scrollbar.

The sticky toolbar (`position: sticky; top: 0`) only works if **exactly one** element in the chain is the scroll container and the toolbar is a direct child of it. Two rules make this fragile:

1. A `position: sticky` element sticks relative to its **nearest ancestor that has `overflow` other than `visible`**. If an intermediate wrapper has `overflow: hidden`/`auto`, the toolbar is trapped inside that wrapper (which does not itself scroll) and never pins.
2. The scroll container must have a **definite (bounded) height**. A `height: 100%` only resolves if every ancestor up to a viewport-bounded element also has a definite height.

**The invariant:** in every edit context the **`.rich-text-component` is the sole scroll container**, the toolbar is sticky relative to it, and the editor (`.rich-text-component__editor`) **never** carries its own `overflow-y`. Read-only contexts have no scroll container — content grows naturally and an outer panel (`.master-detail__detail`) owns the scroll.

Per-context sizing (all defined in `rich-text-component.css`; context applied by the owner):

| Context | Modifier | Height | Scroll owner | Applied by |
|---|---|---|---|---|
| O* field (edit) | _(base)_ | `min-height: 320px; max-height: 320px` (fixed) | the component | `CollectionEntityForm` |
| Chapter narrative (edit) | `--fill` | `flex: 1; min-height: 0; max-height: none` | the component | `ChapterBody._renderChapterNarrative` |
| Theme narrative (edit) | `--capped` | `min-height: 200px; max-height: 50vh` | the component | `ChapterBody._renderTopic` |
| Any field/narrative (read) | `--readonly` | `min-height: 0; max-height: none; overflow: visible` | outer panel | all read views |

Supporting container rules (in `narrative.css`): `.chapter-body` (editable chapter) `overflow: hidden`; `.chapter-body--topic` (editable theme) `overflow-y: auto`; `.chapter-body--readonly` `overflow: visible`. For the full-page O\* read view the equivalent rule lives in `os.css`: `.os-detail--page` is bounded and `.os-detail--page .os-detail__body` scrolls; panel mode is unbounded and lets `.master-detail__detail` scroll.

### 7.4 ReferenceManager

`ReferenceManager` (`components/reference-manager.js`) is the canonical tree-picker component for single-value selection from a hierarchical list. It is used in:

- `TreeEntity` — parent field for `StakeholderCategory` and `ReferenceDocument`
- `CollectionEntityForm` — `reference` field type (single-select typeahead)
- `AnnotatedMultiselectManager` — embedded inline picker
- `RichTextComponent` — reference mark picker (`o-ref` / `n-ref` / `d-ref`)
- `ChangeSetCommitDialog` — OPEN change-set picker (flat options, `code — title` label, `reasonText` tooltip)

**Node shape:**

```js
{
    value:        string | number | null,  // null = non-selectable header
        label:        string,                  // display text; used for filtering
        displayLabel: string?,                 // override label for rendering only
        title:        string?,                 // optional tooltip; rendered as title= on the label button and selected chip
        leaf:         boolean?,                // hint; children absence is authoritative
        children:     node[]?,                 // static children (absent on leaves)
        onExpand:     () => Promise<node[]>?,  // lazy children loader
}
```

**Static utility — `ReferenceManager.buildTreeNodes(items, getLabel?)`** — converts a flat array of setup entities carrying `parentId` into a node tree. This is the **single source of truth** for tree construction — used by `link-provider.js` (d-ref), `collection-entity-form.js` (annotated-reference-list), and `annotated-multiselect-manager.js` (flat options fallback).

- When no item carries `parentId`, returns flat leaf nodes (backward-compatible)
- All nodes are selectable (`value = item id`)
- Children sorted alphabetically at every level
- `getLabel` defaults to `item.name ?? item.title ?? String(item.id)`

**Path-aware filtering** — when a search term is typed, `_filterNodesWithPath` is used instead of label-only matching. A node is included if **any segment of its full ancestor path** (including itself) contains the term. While a filter term is active, results render **fully expanded**; clearing the term restores normal expand/collapse state.

Two non-selectable node styles:

| Class | Used for | `text-transform` |
|---|---|---|
| `rm-node-label--header` | True non-selectable group nodes (never had a value) | `uppercase` |
| `rm-node-label--context` | Ancestors demoted during filtering (originally selectable, `value` nulled) | none — original case preserved |

Filtered nodes carry `_contextOnly: true` to distinguish them from true headers. Every filtered copy carries `_origin` pointing to the original `_roots` node; `_toggleExpand` writes lazy-loaded `_children` to `node._origin ?? node`, ensuring `_findNode` can locate descendants even when expand was triggered from a filtered view.

**Composite node values** — `ReferenceManager` supports non-integer node values (e.g. n-ref topic values `"{chapterItemId}/{topicId}"`). A module-level `_isIntegerId` helper (`/^\d+$/.test(String(v))`) replaces the unavailable `isValidId` from `@odp/shared`: `_normalizeValue` passes composite strings through as-is and normalises integer strings via `normalizeId`; `_findNode` and `isSelected` use `idsEqual` for integer pairs and fall back to `String(a) === String(b)` otherwise.

**Fixed-height popup** — the search popup (`.search-popup`) has a fixed `height: 360px`, preventing expand/collapse from resizing the frame. The results area (`.search-popup-results`) uses `flex: 1; min-height: 0; overflow-y: auto`.

**Filter-mode selection** — `_handleClick` resolves the selected node with priority `_findNode` (by value) → `_nodeAtPath` (fallback) → label-only stub. `_findNode` is tried first since it works for both integer and composite values once `_children` are populated; `_nodeAtPath` is unreliable in filter mode.

### 7.5 ReferenceListManager

`ReferenceListManager` (`components/reference-list-manager.js`) renders a chip list plus search popup for 0..n reference selection (the `reference-list` field type). In read mode, chips can be made navigable: when `onItemClick` is supplied, chips render as `selected-chip--link` spans and fire the callback on click (with `stopPropagation` to prevent panel deselection). Computed/read-only variants derive their value via a form `computeKey` method at initialisation.

### 7.6 AnnotatedMultiselectManager

`AnnotatedMultiselectManager` (`components/annotated-multiselect-manager.js`) renders the `annotated-reference-list` field type — a 0..n reference list where each selected item carries a free-text note.

**Edit / create mode** — each selected item is an editable table row; the note field is a `<textarea>`; line breaks are stored as `\n` and rendered with `white-space: pre-line`. The add control uses a `ReferenceManager` tree picker embedded inline in the footer. When the setup entity carries `parentId` on any item, `CollectionEntityForm.initializeAnnotatedMultiselects()` calls `ReferenceManager.buildTreeNodes()` and passes the resulting `nodes` tree; when no hierarchy exists, flat `options` are passed and `buildTreeNodes()` produces root-only leaf nodes. All nodes — leaf and non-leaf — are selectable.

**Read-only mode** — items render as a structured block list sorted alphabetically; each item: `• Title (link if url available) / note text`.

**Metadata resolution (`_resolveAnnotatedRefMeta`)** — fields declare `setupEntity` referencing a `setupData` collection key. Returns `{ description, url }`: description as native `title` tooltip; url renders the title as `<a>` for strategic documents.

`setupEntity` mapping:

| Field | `setupEntity` |
|---|---|
| `strategicDocuments` | `referenceDocuments` |
| `impactedStakeholders` | `stakeholderCategories` |

### 7.7 DiffPopup

`DiffPopup` (`components/diff-popup.js`) renders a modal comparison between two versions of an entity. Opened from the history tab.

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

### 7.8 User Dialogs

`components/user-dialogs.js` is a shared module of ODIP-styled interactive dialogs that replace browser-native `window.confirm` / `window.alert` with modal overlays using existing `.modal-overlay`, `.modal`, `.modal-body`, `.modal-footer`, and `odip-btn` CSS classes — no new CSS required. The module is intentionally pure-DOM / I/O-free.

**`odipConfirm(message)`** — returns `Promise<boolean>`. Small modal (z-index 2000, above edit modals at 1000) with the message, a **No** button (`odip-btn--standard`) and an auto-focused **Yes** button (`odip-btn--primary odip-btn--standard`).

| Caller | Message |
|---|---|
| `CollectionEntityForm._attachConfirmOnChangeListeners` | `Do you really want to re-assign this ${type} to another domain?` |
| `ChapterBody._deleteTheme` | `Do you really want to delete this theme?` |

**`odipUnsavedChanges(message?)`** — returns `Promise<'save' | 'discard' | 'cancel'>`. Modal with three buttons (left to right): **Cancel** (`odip-btn--standard`), **Discard** (`odip-btn--danger odip-btn--standard`), **Save** (`odip-btn--primary odip-btn--standard`, auto-focused). Escape resolves `'cancel'`. Default message `'You have unsaved changes.'`.

| Caller | Context |
|---|---|
| `ChapterBody._guardNavigation` | Shown when leaving an unsaved chapter narrative or topic in Elaborate |

**`odipPromptLink(initialUrl?, initialText?)`** — returns `Promise<{ url, text } | null>`. Modal with two inputs: **URL** (type `url`, placeholder `https://…`) and **Link text** (type `text`), pre-filled from arguments. Resolves `null` on Cancel/Escape; `{ url: '', text: '' }` on **Remove** (shown only when `initialUrl` is non-empty). Enter in the URL field confirms.

| Caller | Context |
|---|---|
| `RichTextComponent._promptLink` | External link toolbar button — insert or update a `link` mark |

### 7.9 ChangeSetCommitDialog

> Part of the in-progress LCM workstream (§13). Documented here as a component; its wider integration is described in §13.

`openChangeSetCommitDialog(app, { allowNote = true, mode = 'commit' }) → Promise<{ changeSetId, note } | null>` (`components/change-set-commit-dialog.js`). The shared commit gate for every versioned write (null = cancelled).

- **`mode: 'commit'`** (saves) — confirm button reads *Save*; an optional per-object **note** field is shown.
- **`mode: 'select'`** (header chip) — picks the active default only; no note; confirm reads *Set as active*.

Behaviour: fetches `OPEN` change sets, pre-selects the active default (dropped if no longer open), and offers confirm / pick-another / create-inline (title + classifier + optional reason). On confirm it calls `app.setActiveChangeSet(chosen)` and resolves; cancel/overlay/Esc resolves `null`.

**Existing-set selection — `ReferenceManager` typeahead.** The pick-an-existing path is a `ReferenceManager` (§7.4) in flat-options mode, replacing the earlier radio list (which did not scale past a handful of OPEN sets). Each option is built from one OPEN set: `label = `code — title`` (degrades to `title` if `code` is absent), filterable on the combined label (i.e. code **and** title); `value = id`; `title = reasonText`, surfaced as a hover tooltip on each row and on the selected chip. The picker is mounted into a `[data-role="picker-host"]` element and `destroy()`d on every re-render (create-toggle) and on dialog finish. Selection drives `_selectedId` via `onChange`, which re-evaluates the confirm button. The create-inline and optional-note paths and the `{ changeSetId, note } | null` contract are unchanged, so no caller is affected.

**Module placement & styling.** It is the same *family* as `user-dialogs.js` (promise-based modal helpers) but is **data-aware** (reads `OPEN` sets, may `POST` a new one), so it lives in its own module rather than in `user-dialogs.js`. It reuses the existing modal vocabulary exactly — `modal-overlay` / `modal` / `modal-header|body|footer` with the same inline overrides (`max-width:480px; height:auto; min-height:0; resize:none`), z-index `2000`, `odip-btn` buttons, `odip-input` fields, and real design tokens. **No new CSS file.**

---

## 8. Activities

Each sub-activity is mounted inside a workspace shell (Elaborate / Explore) or a top-level activity, and reads its read/write context transparently from `app.getDatasetContext()`. The sections below describe each activity; the shared single-load / shared-state coordination they rely on is described in §4.4.

### 8.1 Home

`HomeActivity` (`activities/home/home.js`) is the dataset-context selection gateway. It is unprotected and is the landing route (`/`). It presents the live dataset and the list of editions; selecting one calls `app.setDatasetContext()` and navigates into the corresponding workspace (Elaborate for live, Explore for an edition). Edition data is fetched anonymously (`GET /odp-editions`), so the list is visible before the user identifies.

### 8.2 O* Workspace

#### 8.2.1 Architecture

`OsActivity` (`os.js`) is the orchestrator. `OStarEntity` (`o-star-entity.js`) owns the unified ON/OR/OC list component.

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

**Full-page mode navigation pattern:** when inter-O\* reference navigation triggers a full-page detail render, `OsActivity` sets `_inPageMode = true` and renders the detail view into `this.container`, replacing the list shell. When the user navigates back, `ElaborateActivity._route` calls `os.handleSubPath([])`, which detects `_inPageMode` and calls `_renderList()` to rebuild the full list shell. `_prepareOStarEntity()` reconnects `_ostarEntity.container` to the new `masterDetail.listContainer` after each rebuild.

#### 8.2.2 OStarEntity

`OStarEntity` receives injected callbacks at construction:

```js
{
    onItemSelect(item),             // called on row click
        getViewControlsEl(),            // returns HTMLElement for view controls mount
        isReadOnly,                     // boolean; true in Explore/edition context
        onViewControlsRendered(),       // called after renderViewControls() — used to refresh count summary
}
```

Lifecycle hooks called by `OsActivity`: `onActivated()` (mounts view controls, renders from cache), `onDeactivated()` (clears view controls), `onDataUpdated(data)` (pre-computes virtual fields, caches data, re-renders if active).

**Virtual field pre-computation** in `onDataUpdated()`: `item.implements` = `item.implementedONs` (OR) or `item.implementedORs` (OC), whichever is non-empty.

#### 8.2.3 Unified List

**Layout:**
```
[ filter bar · · · · · · · · · · 🔍 search  +ON  +OR  +OC ]   ← toolbar row (OsActivity)
[ grouping | counts                                        ]   ← view controls row
[ list panel                    ‖ detail panel              ]
```

The +ON / +OR / +OC create buttons are owned by `OsActivity` (toolbar row), only rendered in live (non-read-only) context, and delegate to `_ostarEntity._handleCreate(type)`. They each pass `app: this.app` into the form context so the commit gate (§13) can read it.

**Search** — free-text input (debounced 300ms), maps to the `text` parameter, visually separate from structured filters.

**Filter bar** — Type · Domain · Maturity · Stakeholder · Implements · Strategic Document.

**Grouping** — Type · Domain · Maturity.

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

**OC type normalisation** — OCs from `/operational-changes` have no `type` field; normalised to `'OC'` in `_loadData()` after merge.

#### 8.2.4 Detail Views

`RequirementDetails` and `ChangeDetails` own the detail shell and delegate body rendering to the form class via `generateReadOnlyView(item)` + `initializeReadOnlyInPanel(container, item)`.

Two rendering modes:

| Mode | Context | Toolbar |
|---|---|---|
| `'panel'` | MasterDetail right column | `[ title · · · Edit  Full page ]` |
| `'page'` | Full page (inter-O\* navigation) | `[ title · · · In collection  In narrative ]` |

`os-detail__title` takes `flex: 1` and truncates with ellipsis. Action buttons are right-aligned, compact (`odip-btn`).

Mode-dependent navigation buttons:

| Mode | Button | Action |
|---|---|---|
| Panel | **Full page** | Pushes `/{base}/os/{type}/{id}` to browser history |
| Page | **In collection** | Navigates to `/{base}/os?selected={id}` |
| Page | **In narrative** | Navigates to `/{base}/narrative/{chapterId}?on={id}`, `?or={id}`, or `?oc={id}` |

**`In narrative` navigation** — `OsActivity._navigateToNarrative(item)` resolves the chapter by matching `item.domain` against `app.getChapters()` (cached). On match, pushes a typed URL (`?on=`/`?or=`/`?oc=`; absence of `item.type` implies OC). Falls back to `/{base}/narrative` if no chapter is found. `normalizeId` serialises the chapter `itemId`.

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

**Search param restore** — `_restoreFromSearchParams()` runs once after `_renderList()`. It reads `?selected`, sets `sharedState.selectedItem`, then calls `_handleItemSelect()` for the panel render. Params are cleaned via `replaceState` after consumption.

#### 8.2.5 Navigable References

Inter-O\* references in read-only detail views are rendered as navigable links:

1. `RequirementDetails` / `ChangeDetails` pass `onNavigate(ref)` to the form at construction
2. `CollectionEntityForm` stores `onNavigate` and passes `onItemClick` to `ReferenceListManager` / `ReferenceManager` in read mode
3. Managers render `selected-chip--link` spans; `stopPropagation` prevents panel deselection
4. `onItemClick` fires; `_navigateToRef` maps `ref.entityType` to a canonical URL segment (`on`, `or`, `oc`) and navigates
5. `annotated-ref-link` anchors (`strategicDocuments`) navigate to the document URL directly

Entity type mapping in `_navigateToRef` is defensive — accepts both legacy values (`requirement`, `change`) and canonical values (`ON`, `OR`, `OC`, `on`, `or`, `oc`).

**Link style** — navigable reference chips use `--link-color` (`--ec-blue`) with `font-weight: semibold` and no underline. The shared `.odip-link` utility class in `main.css` defines the canonical link style.

#### 8.2.6 Breadcrumb

`breadcrumb.js` (`components/breadcrumb.js`) provides `buildBreadcrumb(crumbs)` and `attachBreadcrumbListeners(container, app)`. It is used exclusively by `NarrativeActivity` for intra-narrative back-navigation (← Chapters, current chapter name). It is not a general-purpose header mechanism — `app.header.setBreadcrumb()` does not exist and must not be called by other activities.

#### 8.2.7 API Client — listOStars

`apiClient.listOStars(params)` is the unified O* query method (see §9 and ADD chapter 04). Key behaviour: fans out to `/operational-requirements` + `/operational-changes` in parallel; skip optimisation (OC-only type filter skips requirements call, non-OC type filter skips changes call); returns a merged array in fetch order (requirements first, then changes) with no client-side sorting.

### 8.3 Narrative Activity

The Narrative sub-activity (`activities/workspace/shared/narrative/`) provides editorial access to chapter narratives and O* organisation within ODIP editions.

#### 8.3.1 Layout

Two-pane `MasterDetail` layout (20% / 80% initial ratio):

- **Left panel** — `ChapterToc`: chapter tree (ODIP scope) or topic/O* tree (chapter scope)
- **Right panel** — `ChapterBody`: chapter narrative, topic card list, or O* detail view

A toolbar row is always rendered above the `MasterDetail`, in both Elaborate and Explore, with two slots:

- **Left slot** (`narrative-activity__toolbar-nav`) — in chapter scope, shows **← Chapters** (climbs to ODIP scope) and the current chapter name (selects chapter narrative); empty in ODIP scope.
- **Right slot** (`narrative-activity__toolbar-actions`) — in Elaborate, shows **+ Theme · + ON · + OR · + OC** (`odip-btn odip-btn--create`); absent in Explore.

Create buttons are disabled until a chapter is dived into (`NarrativeActivity._setToolbarEnabled`). Back/chapter nav is injected by `NarrativeActivity._updateToolbarNav()` on scope transitions.

#### 8.3.2 Scope State Machine

| Scope | TOC | Body default |
|---|---|---|
| `odip` | Full chapter tree; expand/collapse; select / dive → | Chapter narrative (read-only) |
| `chapter` | topic/O* tree | Chapter narrative (editable in Elaborate) |

Navigation between scopes lives in the toolbar left slot, not the TOC. In chapter scope, selecting the chapter node makes the **chapter narrative** editable; selecting a topic node makes that **topic narrative** editable (Elaborate only). Create actions are enabled on dive, disabled on climb.

#### 8.3.3 Sub-Path and Query Parameter Routing

| URL pattern | Behaviour |
|---|---|
| `{base}/narrative` | ODIP scope — chapter tree |
| `{base}/narrative/{chapterId}` | Chapter scope — dive into chapter by numeric `itemId` |
| `{base}/narrative/{chapterId}?theme={topicId}` | Chapter scope + select topic by numeric string ID |
| `{base}/narrative/{chapterId}?on={itemId}` | Chapter scope + select and render a specific ON |
| `{base}/narrative/{chapterId}?or={itemId}` | Chapter scope + select and render a specific OR |
| `{base}/narrative/{chapterId}?oc={itemId}` | Chapter scope + select and render a specific OC |

`{base}` is `/elaborate` (live) or `/explore/{editionId}` (edition context).

`_selectTopic(topicId)` — called after diving when `?theme=` is present. Delegates to `ChapterToc.setActiveByTopicId(topicId)`, which performs a DFS search across topics and sub-topics, expands collapsed ancestors, scrolls into view, and fires `onChapterSelect`.

`_selectOStar(ostarId, type)` — called after diving when `?on=`/`?or=`/`?oc=` is present. The type is derived directly from the param name. Calls `ChapterToc.setActiveByItemId(id)` then `ChapterBody.renderSelectionRead({ type: 'ostar', ostar: { id, type } }, chapter)`. `?theme` and the typed O* params are mutually exclusive.

**Same-chapter navigation** — `handleSubPath` short-circuits when the incoming `chapterId` matches `_selectedChapter` but still consumes the query params before returning, so Ctrl+Click on an `n-ref` within the open chapter selects the target without a full reload.

#### 8.3.4 ChapterToc External API

| Method | Description |
|---|---|
| `renderOdip(chapters, selectedId)` | Render full chapter tree (ODIP scope) |
| `renderChapter(chapter)` | Render topic/O* tree for a single chapter |
| `setActiveKey(key)` | Highlight a TOC entry by its `data-key` |
| `setActiveByItemId(id)` | Highlight the O* entry matching `id`; expands ancestors |
| `setActiveByTopicId(id)` | Highlight the topic/subtopic entry matching the stable string `id`; expands collapsed ancestors; fires `onChapterSelect` |
| `selectTopicByIndex(idx)` | Programmatically select a top-level topic by zero-based index |
| `refreshTree()` | Rebuild the chapter-scope tree from the current `_hierarchy` while preserving selection highlight and scroll position |

**Constructor callbacks:** `onOdipSelect(chapter)`, `onDive(chapter)`, `onClimb()`, `onFocusOdip()`, `onChapterSelect(entry)`, `onHierarchyChange(hierarchy)` (DnD, Elaborate only), `onUnclassifiedChange(hierarchy)`.

**Keyboard navigation** — both TOC shells (`#chapterTocOdip`, `#chapterTocChapter`) have `tabindex="0"` and handle `keydown`. Navigation moves the **selection** directly (identical to a click):

| Key | ODIP TOC | Chapter TOC |
|---|---|---|
| ↑ / ↓ | Move selection to prev/next visible chapter node | Move selection to prev/next visible entry; scrolls into view |
| → | Expand collapsed node; if expanded → dive into chapter | Expand collapsed topic; if expanded → move to first child |
| ← | Collapse expanded node | Collapse expanded topic; if collapsed → move to parent; at top level → transfer focus to ODIP TOC via `onFocusOdip` |
| Enter / Space | Activate selected node (same as click) | Activate selected entry (same as click) |

#### 8.3.5 ChapterBody Renderers

| Entry type | Renderer | Notes |
|---|---|---|
| `chapter` | `_renderChapterNarrative` | Full narrative; editable in Elaborate |
| `topic` | `_renderTopic` | Title input · narrative · O* cards · subtheme cards; editable in Elaborate |
| `subtopic-by-id` | — | Synthetic entry fired by subtheme card click; intercepted by `_handleChapterTocSelect`, delegated to `ChapterToc.setActiveByTopicId`, re-enters as `topic` |
| `unassigned` | `_renderUnassigned` | O*s with no topic placement |
| `ostar` | `_renderOStar` | `RequirementDetails` or `ChangeDetails` panel; **Full page** button navigates to `{base}/os/{type}/{id}` |

**Chapter narrative rendering** (`_renderChapterNarrative`) — delegates to `_initRichTextNarrative(el, chapter, editable)`, passing the chapter so the renderer has both `availableBlockIds` and `availableStringKeys`:

- **Edit mode** — both lists are passed to `RichTextComponent`; block and string chips are visible and insertable via the unified ⚙ dropdown.
- **Read-only** — narrative is rendered immediately with chips visible. If either list is non-empty, `_resolveAndSubstituteGeneratedContent()` runs asynchronously after mount: it calls `POST /chapters/:id/resolve-generated-content`, then applies block and string substitutions into the live TipTap document via `setValue`. Always dynamic — no stored content.

`_substituteGeneratedBlocks()` walks `doc.content` recursively; when a paragraph containing only a `generated-block` mark is found, replaces it with the resolved node array (unknown IDs left as-is). `_substituteGeneratedStrings()` replaces text nodes carrying a `generated-string` mark with a plain text node containing the resolved value (unresolved keys left as-is).

**Topic body layout** (`_renderTopic`) renders in order: Title (Elaborate: `odip-input.chapter-body__topic-title`, saves on blur/Enter, reverts on Escape; Explore: plain `<h3>`); Narrative (editable `RichTextComponent` in Elaborate, read-only when non-null in Explore); O* card list (direct O*s of the theme, no empty message); Subtheme card list (after O*s when `subTopics.length > 0`; each card shows a `▸` icon, label, and count hint, navigates via `subtopic-by-id`).

**Delete theme** — in Elaborate, a **Delete theme** `odip-btn--danger` button shows in the body header actions when the theme has no O*s and no subtopics. Clicking opens `odipConfirm` before delegating to `onThemeDelete(topicId)`.

#### 8.3.6 Internal Link Navigation

`ChapterBody._handleInternalLink(type, value)` — called via `onInternalLink` from `RichTextComponent`. Resolves the link, passes through `_guardNavigation()`, then calls `app.navigate()`:

| Mark type | Resolution | Target URL |
|---|---|---|
| `n-ref` | Value is `{chapterId}[/{topicId}]` — navigate directly | `{base}/narrative/{chapterId}[?theme={topicId}]` |
| `o-ref` | `app.findOStar(itemId)` resolves type; stale-while-revalidate via `app.getOStars()` | `{base}/os/{type}/{itemId}` |
| `d-ref` | Direct — value is refdoc id (legacy imported marks only) | `{base}/setup/reference-documents/{id}` |

**Edit mode — Ctrl+Click** — in read-only mode, any click on an internal ref span fires `onInternalLink`. In edit mode, only Ctrl/Cmd+Click fires it; plain clicks pass through to TipTap. While Ctrl/Cmd is held, `rich-text-component__editor--ctrl` is toggled on the editor element (triggering a `cursor: pointer` rule on ref spans). The class is removed on `keyup` and `window blur`. Listeners are registered once per instance and removed in `destroy()`.

#### 8.3.7 OsHierarchy Theme Model

Each topic in `osHierarchy.topics` carries:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Chapter-scoped unique ID; first free positive integer as string (`"1"`, `"2"`, …) |
| `topic` | string | Display label |
| `narrative` | string\|null | Optional TipTap JSON string; rendered above O* list |
| `ons`, `ors`, `ocs` | `OsHierarchyItem[]` | Enriched O* references (read path) |
| `subtopics` | `OsHierarchyTopic[]` | Recursive sub-themes |

IDs are first assigned at import time by `DistributedEditionImporter._patchChapterOsHierarchy` using a chapter-scoped counter (DFS order, starting at 1). The same ID is used in `n-ref` mark values. When a theme is created from the web client, `ChapterToc._nextFreeTopicId(hierarchy)` mirrors this counter (DFS max + 1).

#### 8.3.8 Editorial Actions (Elaborate)

The toolbar create actions and topic-editing all mutate the chapter `osHierarchy` and persist via `PATCH /chapters/{id}`. The active topic at action time is resolved by `ChapterToc._getActiveTopicPath()`.

| Action | Flow |
|---|---|
| **+ Theme** | `_handleAddTheme(activePath)` — minimal title modal → fetch-fresh chapter → insert new topic as child of active topic (or root) → PATCH → `refreshTree()` |
| **+ ON/OR/OC** | `_handleAddOStar(type, activePath)` — open create modal pre-populated with chapter `domain` (and `type` for OR/ON) → on save `_insertOStarIntoHierarchy`: fetch-fresh → insert into active topic's items (sorted ON→OR→OC) or leave unclassified → PATCH → `refreshTree()` → `app.invalidateOStars()` |
| **Theme title / narrative** | `ChapterBody._saveTopicFull(topic, topicId)` → `_handleTopicFullSave`: fetch-fresh → DFS-locate topic by `id` → mutate label and narrative in one pass → PATCH → sync into live `_toc._hierarchy` → `refreshTree()` only when title changed. A single PATCH is always used to avoid `versionId` conflicts. |
| **Delete theme** | `ChapterBody._deleteTheme(topicId)` (button visible only when empty) → `_handleThemeDelete`: fetch-fresh → defensive non-empty guard → `_removeTopicById` → PATCH → `refreshTree()` → body falls back to chapter narrative |

**Concurrency model:**

- **Non-DnD writes** use a **fetch-fresh** pattern — `GET /chapters/{id}` immediately before mutating, so the PATCH carries the latest `expectedVersionId`.
- **DnD reorder** uses the **optimistic** client `versionId`. On `409`, `_handleDndConflict` reloads the chapter, re-renders the TOC, resets the body, and informs the user.

`_mergeChapterConfig(cached, fresh)` reconciles a freshly fetched chapter with config-owned fields (`title`, `domain`, `position`) held in memory, and syncs `versionId`/`osHierarchy` back to the cached object.

**Unsaved-changes guard (Elaborate only)** — `ChapterBody` tracks a `_dirty` flag (set by `RichTextComponent.onChange` and the title input's `input` event) and `_currentEntry`. Before any navigation that would replace the body content, `_guardNavigation()` is called: not dirty → proceed; dirty → `odipUnsavedChanges()` (§7.8) with Cancel (abort), Discard (clear flag, proceed), Save (`_saveCurrentEntry()` then proceed on success).

Navigation paths guarded:

| Trigger | Guard location |
|---|---|
| TOC click / O* card / subtheme card | `ChapterBody.renderSelectionRead()` |
| Ctrl+Click on internal ref (edit mode) | `ChapterBody._handleInternalLink()` |
| ← Chapters toolbar button | `NarrativeActivity._climbToOdip()` |
| Elaborate tab switch | `ElaborateActivity._route()` via `canDeactivate()` |
| Top-level activity switch | `App._loadActivity()` via `canDeactivate()` chain |
| Browser Back / F5 / tab close | `beforeunload` listener (registered in `_renderShell`, removed in `cleanup`) |

`NarrativeActivity.canDeactivate()` delegates to `this._body._guardNavigation()`.

**Duplicate instance prevention** — `NarrativeActivity` instances are cached by `ElaborateActivity`; `render()` may be called again on the same instance. It tears down any existing `_toc`, `_body`, and `_masterDetail` (including the `beforeunload` listener) before calling `_renderShell()`, preventing accumulation of stale `RichTextComponent` instances.

#### 8.3.9 Service Layer Enrichment Contract

`ChapterService` overrides `update()` and `patch()` from `VersionedItemService`. Both call `super.update/patch` (which commits the write transaction) then immediately call `this.getById(itemId, userId)` (enriched `GET`) and return its result. This guarantees that **every write to a chapter returns the same enriched read-shape as `GET /chapters/{id}`** — `osHierarchy` items are always `{ id, type, code, title }` objects, never bare integer ids.

**Invariant:** client code must never use `updated.osHierarchy` from a PATCH response to rebuild the render-side hierarchy via a second `getChapter()` call. The PATCH response is already enriched.

### 8.4 Plan Activity

The Plan activity (`activities/workspace/shared/plan/`) supports deployment and implementation planning across two phases. Phase 1 (ON-based) is fully implemented. Phase 2 (OC-based) is reserved as a placeholder tab.

| Tab | Status |
|---|---|
| `ON Plan` | Active — full implementation |
| `OC Plan` | Placeholder — disabled |

**Data loading** — `PlanningActivity.loadSetupData()` loads setup entities and requirements in a single `Promise.all`. Requirements are **not** part of `setupData` — passed to `ONPlanning` as a dedicated constructor argument and exposed to `RequirementForm` via `getRequirements()`. Setup data loading is delegated to `app.getSetupData()`.

**ON Plan layout** — two-pane horizontal layout with resizable divider: left pane `TemporalGrid` with structured ON hierarchy rows; right pane selected ON details (toolbar + `RequirementForm.generateReadOnlyView()`).

**TemporalGrid row structure (left pane):**

| Row kind | Content |
|---|---|
| `group` (separator) | Domain display label |
| `group` | Root ON (no `refinesParents`); expand/collapse |
| `child` | Refined ON (has `refinesParents`); indented |

ONs with a `tentative` period get two milestones: `period-start` (▶) and `period-end` (◀):

```javascript
temporalGrid.setMilestoneRendering({
    mode: 'icon',
    eventTypes: {
        'period-start': { icon: '▶', colour: '#2563eb' },
        'period-end':   { icon: '◀', colour: '#2563eb' }
    }
})
```

**ON details (right pane)** — clicking any row fires the selection listener; `ONPlanning.handleGridSelect(id)` renders the right pane with `RequirementForm.generateReadOnlyView()`. The Edit button calls `requirementForm.showEditModal(on)`. After a successful save, the `entitySaved` DOM event triggers a reload and refresh.

**File structure:**

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

### 8.5 Prioritisation Activity

The Prioritisation activity (`activities/workspace/shared/plan/prioritisation.js`) matches OC implementation effort against domain bandwidth constraints across waves. Wave assignments are persisted via OPS_DEPLOYMENT milestones.

| Source | Usage |
|---|---|
| `GET /operational-changes` | OCs with `cost`, `domain`, `maturity`, `dependencies`, `milestones` |
| `GET /waves` | Wave definitions |
| `GET /bandwidths` | Available MW per (waveId, scope) pair |
| `DraftingGroup` enum | Hardcoded column order — **known limitation**: the board still uses DrG-based columns; OC `domain` field not yet integrated. Redesign pending. |

**Bandwidth aggregation** — pure logic in `shared/src/model/bandwidth-aggregation.js` (no DOM, no API):

| Function | Description |
|---|---|
| `buildMatrix(ocs, waves, bandwidths, drgs)` | Returns `{ cells, waveGlobal, unplanned }` |
| `resolveDeploymentWaveId(oc)` | Returns wave ID of OPS_DEPLOYMENT milestone, or null |
| `classifyLoad(consumed, available)` | Returns `'green'`/`'orange'`/`'red'`/`'empty'` |
| `cardHeight(cost)` | Returns card height in rem (logarithmic scale) |
| `checkDependencyViolations(oc, targetWaveId, allOcs, waves)` | Returns `{ violated, offenders }` |

`AggregationMatrix` shape: `{ cells: Map<waveId, Map<drg, CellData>>, waveGlobal: Map<waveId, CellData>, unplanned: OC[] }`; `CellData` is `{ consumed, available, ocs }`. `available` sentinels: `null` (no bandwidth record → grey), `0` (explicit zero → red if OCs assigned), `> 0` (load classified by consumed/available ratio). Load thresholds: green < 80%, orange 80–120%, red ≥ 120%.

**Grid layout** — wave rows ordered furthest-top to nearest-bottom (`flex-direction: column-reverse`); columns per DrG plus a Global column; backlog sub-rows (Mature / Advanced / Draft) below.

**OC cards** — `h = 2 + 2·log10(max(1, cost))` rem (clamped 2–12); left colour strip by maturity (grey/amber/green); shows title, cost in MW, dependency icon (⛓) if any; Draft cards are `cursor: not-allowed`, dimmed, locked (🔒), not draggable; hover open button (↗) navigates to `/elaborate/os/oc/{itemId}`.

**Wave row collapse** — collapsed (32px): cards hidden, DrG cells show `consumed / available MW`, 4px load strip; dropping onto a collapsed row auto-expands it.

**Backlog section** — Mature (`MATURE`) and Advanced (`ADVANCED`) are draggable and accept drops; Draft (`DRAFT`) is neither. Wave→backlog drop only accepted by the sub-row matching the OC's maturity.

**Drag-and-drop** — constrained to the same DrG column; wave assignment (backlog → wave) `createMilestone()`; reassignment (wave → wave) `updateMilestone()`; removal (wave → backlog) `deleteMilestone()`; `checkDependencyViolations()` on drop surfaces a confirmation dialog but does not block.

> **Known limitation** — the board still uses `oc.drg` for column placement, but OCs now carry `domain` instead. The board is broken for domain-model data; redesign around the domain model is deferred.

### 8.6 Quality Activity

`QualityActivity` (`activities/workspace/shared/quality/quality.js`) provides on-demand dataset quality checks in both Elaborate (live dataset) and Explore (edition snapshot) contexts — context read transparently from `app.getDatasetContext()`.

**Layout** — full-width scrollable page (no `MasterDetail`): toolbar (**Run checks** button + last-run timestamp) and report area (summary banner + one collapsible domain section per domain in scope).

**Context awareness** — on **Run checks**:

| Context | API call |
|---|---|
| `{ type: 'live' }` | `GET /quality/checks` (live dataset) |
| `{ type: 'edition', editionId }` | `GET /quality/checks?edition={editionId}` (edition snapshot) |

**Report structure** — the response is a `QualityReport` (defined in `@odp/shared` `quality-elements.js`):

```js
{
    runAt:         string,           // ISO timestamp
        rules:         QualityRule[],    // registered rules — drives section headers
        domainReports: DomainQualityReport[]  // one entry per domain, always present
}
```

Each `DomainQualityReport` contains one array per rule (always present, empty when no findings): `brokenONTraceability` (rule `on-traceability`), `untraceableORs` (`or-traceability`), `orphanONs` (`orphan-on`), `noShowOStars` (`no-show`).

Finding shapes and navigation:

| Finding type | ID field | Version field | Navigation |
|---|---|---|---|
| `BrokenONTraceability` | `onId` | `onVersionId` | `data-on-id` |
| `UntraceableOR` | `orId` | `orVersionId` | `data-or-id` |
| `OrphanON` | `onId` | `onVersionId` | `data-on-id` |
| `NoShowOStar` | `oStarId` | `oStarVersionId` | `data-ostar-id` + `data-ostar-type` |

**Finding navigation** — clicking a code link navigates to the O* detail page in the correct workspace:

| Attribute | Handler | Target URL pattern |
|---|---|---|
| `data-on-id` | ON findings | `{base}/os/on/{id}` |
| `data-or-id` | OR findings | `{base}/os/or/{id}` |
| `data-ostar-id` + `data-ostar-type` | NO SHOW findings | `{base}/os/{type}/{id}` |

Where `base` is `/elaborate` (live) or `/explore/{editionId}` (edition snapshot).

**Report persistence across tab switches** — results are held in `QualityActivity._report` (instance memory), not cached in `App` or persisted to the server. `ElaborateActivity`/`ExploreActivity` cache sub-activity instances; `cleanup()` preserves `_report` and `_runAt`, clearing only `container` and `_running`. On return to the Quality tab, `render()` detects an existing report and restores it immediately. The report is discarded only when the top-level shell is torn down.

**Staleness detection on tab return** — `_renderReportWithStaleness()` calls `app.getOStars()` and compares each finding's stored `versionId` against the current cache value. O*s whose `versionId` changed are marked "possibly fixed" (amber badge, dimmed row). Covers `brokenONTraceability`, `untraceableORs`, `orphanONs`; `noShowOStars` is excluded — NO SHOW status is structural, not version-sensitive. If the cache is unavailable, the report renders without indicators.

**API client** — `apiClient.runQualityChecks({ domains?, editionId? })`:

```js
async runQualityChecks({ domains = [], editionId = null } = {}) {
    const params = {};
    if (domains.length > 0) params.domain = domains.join(',');
    if (editionId !== null)  params.edition = editionId;
    return this.get('/quality/checks', { params });
}
```

**Extensibility** — adding a new quality rule requires one client change: a new block in `_renderDomainReport()` calling `_renderFindingTable()` with the appropriate `rowFn`. Staleness detection is opt-in per rule via `_isStale()`.

### 8.7 Setup Activity

`SetupActivity` (`activities/workspace/shared/setup/setup.js`) is the setup sub-activity shell, shared between Elaborate and Explore. It hosts the hierarchical setup entities as `TreeEntity` tabs:

| Tab | Entity | Component |
|---|---|---|
| Stakeholder Categories | `StakeholderCategory` | `stakeholder-categories.js` (`TreeEntity`) |
| Reference Documents | `ReferenceDocument` | `reference-documents.js` (`TreeEntity`) |

Sub-path routing accepts `[entityKey, itemId?]` (see §3.3), enabling deep-links to a specific item. In Explore (edition context) the editing actions are suppressed.

### 8.8 Manage Activity

`EditionsActivity` (`manage/editions/editions.js`) is a self-contained sub-activity within the Manage shell. It does not use `CollectionEntity`. Layout mirrors the O* workspace: top toolbar (reuses `.os-toolbar` / `.os-toolbar__create`, `+ Edition` right-aligned) and a `MasterDetail` (`initialRatio: 0.30`) — left edition card list, right edition detail shell.

`ODPEditionForm` (`manage/editions/odp-edition-form.js`) is used only for the create modal.

**Edition list (left panel)** — scrollable card list; each card shows title, DRAFT/OFFICIAL badge, creation date. Cards use string comparison (`String(id)`) for selection state. Data loaded on mount via `Promise.all([GET /odp-editions, GET /baselines])`; list reloads after every successful create (via `entitySaved` DOM event).

**Edition detail (right panel)** — `.os-detail` shell: toolbar actions **Explore** · **Export**; body `<dl>` with Created, Created by, Type (badge), Baseline, Start date, Min ON maturity. **Explore** navigates to `/explore/{editionId}`.

**Export modal** — `Export` opens a compact modal (`.edition-export-overlay`): format checkboxes (PDF · Word · Website); **Run** builds a single `PublishOptions` object and calls `apiClient.publishEdition(id, options)` once; results rendered inline per format (`✓ Label — Open` on success, error on failure; 409 → "Export already in progress — please retry later").

`PublishOptions` mapping: PDF → `pdfFlat: {}`; Word → `wordFlat: {}`; Website → `website: true`. Modal size scoped via `.edition-export-overlay .modal` in `editions.css` (width 390px, height auto).

**ODPEditionForm** — config-based (`getEditConfig()` / `getReadConfig()`); `getReadConfig()` returns `null` (detail rendering owned by `EditionsActivity`). Edit config sections: Edition (`title` text required, `type` radio DRAFT/OFFICIAL required); Content rules (`baselineId` select optional, `startDate` date optional, `minONMaturity` radio DRAFT/ADVANCED/MATURE optional). `transformDataForSave()` defaults `type` to `'DRAFT'`, `minONMaturity` to `'DRAFT'`, coerces `baselineId` to integer, strips absent optional fields. Editions are create-only — `onSave()` throws on any mode other than `'create'`.

### 8.9 Change Sets Activity

`ChangeSetsActivity` (`activities/workspace/shared/change-sets/change-sets.js`) is a shared sub-activity mounted in both the Elaborate and Explore shells. Layout mirrors `EditionsActivity`: top toolbar (`.os-toolbar`) with a status filter on the left and a `+ Change Set` button on the right, over a `MasterDetail` (`initialRatio: 0.30`) — left change-set card list, right `.os-detail` detail shell.

**Read/write context** — derived from `app.getDatasetContext()`: edition context ⇒ read-only. In Explore the create button and all lifecycle actions are suppressed; the list and detail (including members) render identically. Sub-activities do not know which shell they are mounted in.

**Explore data source (interim).** The list is loaded via `apiClient.listChangeSets()` in **both** contexts, so Explore currently shows *all* change sets rather than only those that produced the selected edition's versions. This is a deliberate placeholder: edition-scoped filtering (walking `(Edition)-[:EXPOSES]->(Baseline)-[:HAS_ITEMS {editions}]->(version)-[:HAS_REASON]->(ChangeSet)`, with the chapter-inclusion question to settle) requires a new server query and is a planned second pass. Until then Explore parity is list + detail only.

**List (left panel)** — card list filtered client-side by a status chip bar (`All` / `Open` / `Closed`) from a single load (no refetch on filter change). Each card shows `code — title`, an OPEN/CLOSED badge, and `classifier · date`. Selection uses `String(id)` comparison.

**Detail (right panel)** — `.os-detail` shell. Toolbar shows `code — title` and the status-gated action set; body is a `<dl>` (code, status badge, classifier, reason, created/closed stamps) followed by a **Changes** section — the versions committed under the set, fetched via `apiClient.getChangeSetMembers(id)`. The list is **de-duplicated by `itemId`** (multiple consecutive saves of one object under the same set collapse to a single row, keeping the highest version) and rendered **flat**, ordered Chapter → ON → OR → OC then by code/title. Each row carries a **coloured type label** (`.type-badge--on/or/oc/chapter`; the ON/OR/OC palette mirrors os.css, chapter is neutral — a local copy pending the styling-cleanup hoist to a shared `components/type-badge.css`) and the object name as a **context-aware deep link** (`/{base}/os/{on|or|oc}/{itemId}` for O\*s, `/{base}/narrative/{itemId}` for chapters, `{base}` being `/elaborate` or `/explore/{editionId}`; intercepted by the router's global anchor handler). O\* rows show `code title`; chapter rows show the title only (chapters carry no O\*-style code). A stale-await guard drops results if the selection changed during the fetch. Delete-enablement keys off the **raw** member count, not the de-duped list. *(Per-change Create/Update/Delete action and domain classification are deferred — they require new fields on the `findMembers` projection; see the parked change-set server pass.)*

**Lifecycle actions (Elaborate only)** — status-gated detail-toolbar buttons, never a status field:

| Status | Actions |
|---|---|
| OPEN | Edit · Close · Delete *(enabled only once members load and the set is empty)* |
| CLOSED | Reopen |

Close / Reopen / Delete confirm via `odipConfirm` (§7.8) and call `closeChangeSet` / `reopenChangeSet` / `deleteChangeSet`; server `409`s are surfaced inline in the detail body (e.g. "Only an empty, open change set can be deleted"). Create and Edit use `ChangeSetForm`; a single `entitySaved` document listener (registered once, removed in `cleanup()`) reloads the list and re-selects after either.

**`ChangeSetForm`** (`change-set-form.js`) — config-based (`getReadConfig()` returns `null`; detail rendering owned by the activity). A **single section** (`title`, `reasonText`, `classifier`) — no tab to click. `classifier` is `required: true` + `editableOnlyOnCreate: true`: a mandatory editable select in create (shows the `*`), a read-only value in edit (immutable after creation, skipped by validate/collect — see §6.5). `onSave` posts `{ title, classifier, reasonText? }` on create and PUTs `{ title, reasonText }` on edit (OPEN only); `status` is never sent — lifecycle is driven by the action buttons. The form overrides `requiresChangeSet()` to `false` (see §6.5) — a change set is the reason carrier and must not commit under another change set.

### 8.10 Converse Activity

`ConverseActivity` (`activities/converse/converse.js`) is a top-level placeholder for collaborative threading. It is unprotected and currently renders a placeholder shell; no data model or API integration exists yet.

---

## 9. API Integration

The shared API client in `shared/api-client.js` handles all `fetch` calls, base URL configuration, and error normalisation. All components use this client — no component issues `fetch` directly. The base URL is configured to target the API server port explicitly (`http://<hostname>:8080`) to support remote browser access.

### 9.1 Connection Monitoring

Connection monitoring is owned by `App` (`app.js`). On initialisation, `App` calls `endpoints.health` (`/ping`) immediately and then polls every 60 seconds. Each check dispatches a `connection:change` custom event on `window` with `detail.status` set to `'connected'` or `'disconnected'`. `Header` listens to this event and updates the status indicator. The 60-second interval is intentional — the application is a low-concurrency internal tool.

> Component-level API concerns are documented with their components: the unified `listOStars` query in §8.2.7, `runQualityChecks` in §8.6, and the change-set methods in §13.2.

---

## 10. CSS Architecture

### 10.1 File Tree

```
styles/
├── main.css                          Design tokens, CSS reset, typography, layout utilities — includes EC palette tokens (--ec-navy, --ec-blue, --ec-sky, --ec-light), link tokens (--link-color, --link-color-hover), and .odip-link utility class
├── primitives.css                    Buttons, form controls, spinners (atomic UI elements)
├── feedback-components.css           Toasts, error notifications, loading/skeleton states
├── layout-components.css             Top header, connect popup, cards, modals
├── components/
│   ├── filter-bar.css                FilterBar chip component
│   ├── form-components.css           Form tabs, tag selector, multi-select, rich text integration
│   ├── history-tab.css               History version list, diff popup
│   ├── master-detail.css             Two-column resizable layout
│   ├── reference-list-manager.css    Inline chip list with search popup
│   ├── rich-text-component.css       RichTextComponent editor/viewer, sticky toolbar, per-context sizing
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
    │       ├── narrative/narrative.css
    │       └── quality/quality.css
    │       └── change-sets/change-sets.css  Change-set cards, status badge/chips, detail dl + members list
    └── manage/
        ├── manage.css
        └── editions/editions.css     Edition count badge, publication action buttons
```

### 10.2 Layer Hierarchy

Files are loaded in strict dependency order: global → components → activities (base first, then concrete).

**Global** (`styles/`) — no dependencies between files at this level. `primitives.css` is the lowest-level layer.

**Components** (`styles/components/`) — depend only on global tokens. No component file references another component file or any activity file.

**Activities** (`styles/activities/`) — depend on global and component layers. `activity.css` is the base for all activities.

---

## 11. ODIP Design System — UI Primitives

ODIP Space uses a canonical set of UI primitive classes defined in `primitives.css`. These replace Bootstrap-legacy class names (`btn`, `btn-primary`, `form-control`) throughout all ODIP components. The design system enforces two tiers — **compact** (inline/toolbar contexts) and **standard** (modal/form contexts) — with semantic variants for both buttons and inputs.

### 11.1 Button System — `odip-btn`

All buttons use `odip-btn`. The base class defines the compact tier; `--standard` upgrades to form-body size.

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

```html
<button class="odip-btn">History</button>
<button class="odip-btn odip-btn--primary">Edit</button>
<button class="odip-btn odip-btn--danger">Delete</button>
<button class="odip-btn odip-btn--primary odip-btn--standard">Save</button>
<button class="odip-btn odip-btn--standard">Cancel</button>
<button class="odip-btn odip-btn--create">+ ON</button>
```

The legacy `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-sm` classes remain in `primitives.css` but are not used in any ODIP component.

### 11.2 Input System — `odip-input`

All text inputs, selects, and textareas use `odip-input`. Same two-tier pattern as `odip-btn`.

| Class | Font size | Padding | Border |
|---|---|---|---|
| `.odip-input` (default) | 11px | 4px 9px | 0.5px solid |
| `.odip-input.odip-input--standard` | `--font-size-sm` | `--space-2` `--space-3` | 1px solid |

Modifiers: `--textarea` (adds `min-height: 80px`, `resize: vertical`), `--error` (red border for validation error state).

```html
<input class="odip-input" type="text">                          <!-- compact -->
<input class="odip-input odip-input--standard" type="text">    <!-- form body -->
<select class="odip-input">…</select>                          <!-- compact select -->
<textarea class="odip-input odip-input--standard odip-input--textarea">…</textarea>
```

The legacy `form-control`, `form-select`, `form-textarea`, `form-control-sm` classes are not used in any ODIP component.

### 11.3 Link Style — `odip-link`

Navigable inline references (O* chips, strategic document links) use `.odip-link` defined in `main.css`:

```css
color: var(--link-color)       /* --ec-blue */
font-weight: semibold
cursor: pointer
text-decoration: none
```

Hover: `color: var(--link-color-hover)` (`--ec-navy`).

---

## 12. Build Tooling — Vite

### 12.1 Role

Vite is the build tool and development server. It provides:

- **Development server** — fast dev server with ES module native serving
- **Production build** — `npm run build` outputs a hashed, tree-shaken bundle to `web-client/dist/`
- **Asset processing** — files in `src/assets/` are processed and fingerprinted; must be imported as ES modules to get the resolved URL

### 12.2 Configuration (`vite.config.js`)

Located at `web-client/vite.config.js`. Key settings: root set to `src/`, output to `dist/`, dev server port `3000`.

### 12.3 Asset Import Pattern

Static assets (SVG, images) must be imported as ES modules:

```js
import logoUrl from '../assets/odip-space-logo.svg';
// logoUrl resolves to the correct hashed path in production,
// and to the dev server path in development
```

Placing an asset in `src/assets/` and referencing it by a static string path will fail in production — Vite does not serve `src/assets/` at a predictable URL after bundling.

### 12.4 @odp/shared Copy

The `@odp/shared` source is copied into `web-client/src/shared/src/` as a build preparation step (executed by `odip-admin` on `--rebuild`). This copy is imported directly as plain ES modules and processed by Vite as part of the main bundle.

### 12.5 Development vs Production

| Mode | Command | Output |
|---|---|---|
| Development | `npm run dev` | Vite dev server on port 3000; live reload |
| Production build | `npm run build` | Hashed bundle in `dist/` |
| Container | `CMD ["npm", "run", "preview"]` in Dockerfile | Vite preview server serving pre-built `dist/` |

The container runs `vite preview` to serve the pre-built `dist/` bundle. The build step runs on the host (EC) or inside the container (local) before the image is committed. This avoids running a full dev server in the deployed container while retaining Vite's SPA fallback routing.

---

## 13. Lifecycle & Change Management (LCM) — Web Client

> **Work in progress.** Every versioned write (O* create/edit, and — in later sub-steps — narrative/hierarchy saves) is committed under a **change set**: a first-class, non-versioned node carrying the *why* of a save. This section documents the current web-client foundation and the O* save-path integration. The Change Set management workspace, the narrative/hierarchy edit sessions, and the history/diff surfacing of commit metadata are separate, not-yet-implemented sub-steps. The content here is expected to be redistributed into the relevant sections once the workstream stabilises.

### 13.1 Active Change Set on `App`

`App` holds an **active change set** — the remembered default offered by the commit dialog. It is a convenience default only; the server re-validates that the set is `OPEN` at write time, and the commit dialog re-fetches `OPEN` sets on every open.

| Member | Behaviour |
|---|---|
| `activeChangeSet` | `{ id, title, classifier } \| null` |
| `setActiveChangeSet(cs)` | Sets the field, persists to `localStorage` (`odip-space-active-change-set`), and calls `header.onChangeSetChange()` |
| `getActiveChangeSet()` | Returns the field |
| `restoreActiveChangeSet()` | Called in `initialize()` after user restore; lenient — a stale/closed stored value is harmless (re-validated on next dialog use) |

### 13.2 `api-client.js` — Change Set Methods

All target the standalone `/change-sets` route: `listChangeSets({status?, classifier?})` (status takes precedence over classifier), `getChangeSet(id)`, `getChangeSetMembers(id)` (`?subPath=members`), `createChangeSet(data)`, `updateChangeSet(id, data)` (OPEN only), `closeChangeSet(id)` / `reopenChangeSet(id)` (`?subPath=close|reopen`), `deleteChangeSet(id)` (empty + OPEN only).

### 13.3 Commit Dialog

The commit dialog component (`openChangeSetCommitDialog`) is documented in §7.9. Its existing-set selector is a `ReferenceManager` typeahead (label `code — title`, searchable on code + title, `reasonText` on hover) — the radio list it replaced did not scale past a handful of OPEN sets.

### 13.4 Header Chip

A live-context-only chip (`_buildChangeSetChip()`, hidden when `datasetContext.type !== 'live'`) reuses the existing `.odp-header__user-btn` treatment and shows the active change set's title (or *none*). Clicking it opens the commit dialog in `select` mode. `header.onChangeSetChange()` re-renders the chip after the active set changes.

### 13.5 O* Save-Path Threading

The commit gate is applied **once** in the shared base `CollectionEntityForm.handleSave()`, after validation/transform and before `onSave`:

```
const commit = await openChangeSetCommitDialog(this.context.app, { allowNote: true });
if (!commit) return;                 // cancel aborts the save; form stays open
dataToSave.changeSetId = commit.changeSetId;
if (commit.note) dataToSave.note = commit.note;
```

Both `RequirementForm.onSave` and `ChangeForm.onSave` already send `dataToSave` as the POST/PUT body, so `changeSetId`/`note` ride into the request and match the server's inline write contract. One insertion point covers ON/OR/OC, create and edit.

**Context requirement** — the gate reads `this.context.app`, so every form construction must supply `app` in its context. The detail views (`RequirementDetails`/`ChangeDetails`) already did; `OStarEntity._handleCreate` was updated to pass `app: this.app` into both create contexts. Any future form instantiation (e.g. the Narrative "+ON/OR/OC" insert) must also pass `app`.

O* delete is not a form path and carries no commit gate at this layer.

### 13.6 Affected Files

`app.js`, `shared/api-client.js`, `components/header.js`, `components/change-set-commit-dialog.js`, `components/collection-entity-form.js`, `activities/workspace/shared/os/o-star-entity.js`.

---

[← 07 CLI](07-CLI.md) | [09 Deployment →](09-Deployment.md)