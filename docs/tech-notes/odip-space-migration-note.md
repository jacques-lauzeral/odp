# Migration Note — ODIP Tool → ODIP Space

**Version:** 3
**Scope:** Web client only. Server route files patched for anonymous read access. API, CLI, shared package otherwise unchanged.
**Strategy:** Incremental, phase-by-phase. Each phase independently deployable and reversible.

---

## 0. Introduction

### 0.1 Purpose

This note prepares and documents the migration from the ODIP Tool web client to a target web client referred to as **ODIP Space~** (Space-tilde). The tilde is intentional: the target is not the ODIP Space described in the blueprint (v1.42) nor the one formalised in the Space design note, but a working approximation towards which the web client progressively converges, phase by phase.

Phase A is now complete. This note reflects the as-implemented state of Phase A and identifies the scope remaining for subsequent phases.

### 0.2 Reference documents

| Document | Role |
|---|---|
| **ODIP Space UI Design Proposal v1.42** — Yves Steyt / ACD Division, EUROCONTROL Network Management, April 2026 | Primary UX authority. Defines the target navigation model, page purposes, interaction patterns, and mockups. |
| **`odip-space-design.md`** | Structured design note derived from the blueprint. Formalises paths, activity map, page inventory, and open design questions. |
| **ADD Chapter 08 — Web Client** | Authoritative description of the implemented ODIP Space web client: activity structure, component patterns, CSS architecture, API integration, routing. |

### 0.3 Context

The ODIP Tool web client was a Vanilla JS SPA organised around seven flat top-level activities: Landing, Elaboration, Planning, Prioritisation, Setup, Publication, and Review. Each was a self-contained module loaded dynamically by `app.js` via the History API. A shared `AbstractInteractionActivity` base class provided the two-column collection+details layout for Elaboration and Review.

ODIP Space~ reorganises these into a structured hierarchy: **Home**, **Elaborate**, **Explore**, **Manage**, and (deferred) **Converse**. Elaborate and Explore share a common set of sub-activities (O\*s, Plan, Setup, Quality, Notes) distinguished only by dataset context (live vs edition) and access mode (R/W vs R/O). Manage absorbs Publication. Home replaces Landing with a dataset selector gateway.

`AbstractInteractionActivity` has been retired. Its responsibilities are distributed across `OsActivity` (orchestration), `MasterDetail` (layout component), `RequirementsEntity`/`ChangesEntity` (list rendering with injected callbacks), and `RequirementDetails`/`ChangeDetails` (detail views).

The migration is web-client-only, with the exception of server route patches to support anonymous read access. The server business logic, REST API contract, CLI, and shared package are not modified.

### 0.4 Organisation

- **§1 Target structure** — the JS and CSS file/folder organisation at end of Phase A
- **§2 Current → target file mapping** — per-file mapping with implementation status
- **§3 Phase A scope summary** — what changed, what did not, known gaps deferred
- **§4 Design decisions** — decisions reached during Phase A implementation

---

## 1. Target structure

### 1.1 JavaScript

```
web-client/src/
├── index.html
├── index.js
├── app.js
│
├── activities/
│   ├── home/                                 new — full rewrite of landing/
│   │   └── home.js
│   │
│   ├── workspace/
│   │   ├── elaborate/                        new — thin shell, live dataset + R/W
│   │   │   └── elaborate.js
│   │   ├── explore/                          new — thin shell, edition context + R/O
│   │   │   └── explore.js
│   │   ├── setup/                            reuse — moved from activities/setup/
│   │   │   ├── setup.js
│   │   │   ├── stakeholder-categories.js
│   │   │   ├── reference-documents.js
│   │   │   ├── domains.js
│   │   │   ├── waves.js
│   │   │   └── bandwidth.js
│   │   └── shared/
│   │       ├── os/                           new orchestrator + refactored entities
│   │       │   ├── os.js                     new — replaces AbstractInteractionActivity
│   │       │   ├── requirements.js           reshaped — injected callbacks, no back-refs
│   │       │   ├── changes.js                reshaped — injected callbacks, no back-refs
│   │       │   ├── requirement-details.js    new — read-only detail (panel + page modes)
│   │       │   ├── change-details.js         new — read-only detail (panel + page modes)
│   │       │   ├── breadcrumb.js             new — buildBreadcrumb / attachBreadcrumbListeners
│   │       │   ├── requirement-form.js       moved from activities/common/
│   │       │   ├── requirement-form-fields.js
│   │       │   ├── change-form.js            moved from activities/common/
│   │       │   ├── change-form-fields.js
│   │       │   └── change-form-milestone.js
│   │       ├── plan/                         moved from activities/planning/ + prioritisation/
│   │       │   ├── plan.js                   new — shell (placeholder, wiring pending)
│   │       │   ├── planning.js               reuse
│   │       │   ├── on-planning.js            reuse
│   │       │   ├── prioritisation.js         reuse
│   │       │   └── prioritisation-grid.js    reuse
│   │       ├── quality/
│   │       │   └── quality.js                dummy — placeholder
│   │       └── notes/
│   │           └── notes.js                  dummy — placeholder
│   │
│   └── manage/
│       ├── manage.js                         new — minimal shell
│       ├── editions/                         moved from activities/publication/
│       │   ├── editions.js                   reuse (wiring pending)
│       │   └── odp-edition-form.js           reuse
│       └── admin/
│           └── admin.js                      dummy — placeholder
│
├── components/
│   ├── common/
│   │   └── header.js                         reshaped — connect form, Space nav, role gates
│   ├── master-detail.js                      new — reusable two-column resizable layout
│   └── odp/
│       ├── collection-entity.js              unchanged
│       ├── collection-entity-form.js         patched — onNavigate option, onItemClick wiring
│       ├── tree-table-entity.js              unchanged
│       ├── temporal-grid.js                  unchanged
│       ├── filter-bar.js                     unchanged
│       ├── reference-list-manager.js         patched — onItemClick, navigable chips, stopPropagation
│       ├── reference-manager.js              patched — onItemClick, navigable chip, stopPropagation
│       ├── annotated-multiselect-manager.js  unchanged
│       ├── diff-popup.js                     unchanged
│       └── odp-column-types.js               unchanged
│
└── shared/
    ├── router.js                             new
    ├── api-client.js                         unchanged
    ├── error-handler.js                      unchanged
    ├── utils.js                              unchanged
    └── src/                                  unchanged
```

### 1.2 CSS

```
web-client/src/styles/
├── main.css                          unchanged
├── primitives.css                    unchanged
├── feedback-components.css           unchanged
├── layout-components.css             unchanged
├── components/
│   ├── filter-bar.css                unchanged
│   ├── form-components.css           unchanged
│   ├── history-tab.css               unchanged
│   ├── master-detail.css             new
│   ├── reference-list-manager.css    unchanged
│   ├── table-components.css          unchanged
│   ├── tree-table-components.css     unchanged
│   └── temporal-components.css       unchanged
└── activities/
    ├── activity.css                  unchanged
    ├── home/home.css                 new (placeholder)
    ├── workspace/
    │   ├── elaborate/elaborate.css   new (placeholder)
    │   ├── explore/explore.css       new (placeholder)
    │   ├── setup/setup.css           reuse
    │   └── shared/
    │       ├── os/os.css             new (placeholder)
    │       ├── plan/plan.css         new (placeholder)
    │       ├── quality/quality.css   new (placeholder)
    │       └── notes/notes.css       new (placeholder)
    └── manage/
        ├── manage.css                new (placeholder)
        └── editions/editions.css     new (placeholder)
```

**Removed CSS files:** `landing.css`, `abstract-interaction-activity.css`, `elaboration.css`, `review.css`, `planning.css`, `prioritisation.css`, `publication.css`.

---

## 2. Current → target file mapping

### 2.1 Activities

| Current | Target | Status |
|---|---|---|
| `activities/landing/` | `activities/home/home.js` | Full rewrite |
| `activities/elaboration/elaboration.js` | deleted | Replaced by `os.js` |
| `activities/review/review.js` | deleted | Replaced by `explore.js` + `os.js` |
| `activities/publication/publication.js` | deleted | Replaced by `manage.js` |
| `activities/planning/planning.js` | `activities/workspace/shared/plan/planning.js` | Reuse (moved) |
| `activities/planning/on-planning.js` | `activities/workspace/shared/plan/on-planning.js` | Reuse (moved) |
| `activities/prioritisation/prioritisation.js` | `activities/workspace/shared/plan/prioritisation.js` | Reuse (moved) |
| `activities/prioritisation/prioritisation-grid.js` | `activities/workspace/shared/plan/prioritisation-grid.js` | Reuse (moved) |
| `activities/publication/odp-editions.js` | `activities/manage/editions/editions.js` | Reuse (moved, wiring pending) |
| `activities/publication/odp-edition-form.js` | `activities/manage/editions/odp-edition-form.js` | Reuse (moved) |
| `activities/setup/` | `activities/workspace/setup/` | Reuse (moved) |
| `activities/common/requirement-form.js` | `activities/workspace/shared/os/requirement-form.js` | Reuse (moved) |
| `activities/common/requirement-form-fields.js` | `activities/workspace/shared/os/requirement-form-fields.js` | Reuse (moved) |
| `activities/common/change-form.js` | `activities/workspace/shared/os/change-form.js` | Reuse (moved) |
| `activities/common/change-form-fields.js` | `activities/workspace/shared/os/change-form-fields.js` | Reuse (moved) |
| `activities/common/change-form-milestone.js` | `activities/workspace/shared/os/change-form-milestone.js` | Reuse (moved) |
| `activities/common/abstract-interaction-activity.js` | deleted | Replaced by `os.js` |

### 2.2 New files (Phase A)

| File | Purpose |
|---|---|
| `shared/router.js` | Route table, `navigate()`, prefix matching, popstate handler |
| `activities/home/home.js` | Dataset context selection gateway |
| `activities/workspace/elaborate/elaborate.js` | Thin shell: live dataset context + R/W mode |
| `activities/workspace/explore/explore.js` | Thin shell: edition context + R/O mode |
| `activities/workspace/shared/os/os.js` | O\* workspace orchestrator (replaces AbstractInteractionActivity) |
| `activities/workspace/shared/os/requirement-details.js` | ON/OR read-only detail view, panel + page modes |
| `activities/workspace/shared/os/change-details.js` | OC read-only detail view, panel + page modes |
| `activities/workspace/shared/os/breadcrumb.js` | `buildBreadcrumb` / `attachBreadcrumbListeners` |
| `activities/workspace/shared/plan/plan.js` | Plan shell (placeholder, wiring pending) |
| `activities/workspace/shared/quality/quality.js` | Placeholder |
| `activities/workspace/shared/notes/notes.js` | Placeholder |
| `activities/manage/manage.js` | Manage shell (integrators only) |
| `activities/manage/admin/admin.js` | Placeholder |
| `components/master-detail.js` | Reusable two-column resizable layout |

### 2.3 Modified files (Phase A)

| File | Change |
|---|---|
| `app.js` | Delegates to router; `setDatasetContext`/`getDatasetContext`; `getSetupData`/`invalidateSetupData`; `setUser` tolerates null |
| `index.html` | Updated CSS links; Space paths; `master-detail.css` added |
| `components/common/header.js` | Connect form (name + role, localStorage); Space nav tabs; role-gated Manage tab; active tab from `app.activeSegment()` |
| `activities/workspace/shared/os/requirements.js` | Injected callbacks (`onItemSelect`, `getViewControlsEl`, `isReadOnly`); no `app.currentActivity` back-references; `renderDetails` removed |
| `activities/workspace/shared/os/changes.js` | Same as requirements.js |
| `components/odp/collection-entity-form.js` | `onNavigate` at construction; `onItemClick` passed to managers in read mode with entity type from `field.formatArgs[0]` |
| `components/odp/reference-list-manager.js` | `onItemClick` option; `selected-chip--link` in read mode; `handleReadOnlyClick` with `stopPropagation` |
| `components/odp/reference-manager.js` | Same as reference-list-manager.js |

### 2.4 Server files patched (anonymous read access)

| File | Change |
|---|---|
| `server/src/routes/simple-item-router.js` | `getUserIdOptional` on GET / and GET /:id |
| `server/src/routes/versioned-item-router.js` | `getUserIdOptional` on all 4 GET routes |
| `server/src/routes/odp-edition.js` | `getUserIdOptional` on 4 GET routes |
| `server/src/routes/baseline.js` | `getUserIdOptional` on 3 GET routes |

### 2.5 Dummy placeholders (Phase A)

| File | Notes |
|---|---|
| `workspace/shared/quality/quality.js` | "Coming soon" shell |
| `workspace/shared/notes/notes.js` | "Coming soon" shell |
| `workspace/shared/plan/plan.js` | Shell — plan sub-activity wiring pending |
| `manage/editions/editions.js` | `ODPEditionsEntity` not yet wired into manage shell |
| `manage/admin/admin.js` | "Coming soon" shell |

---

## 3. Phase A scope summary

### What changed

- Full target folder structure established
- Router introduced (`shared/router.js`)
- Home page rewritten (dataset context selection: edition list + Live Dataset tile for identified users)
- Header: connect form (name + role, localStorage); Space nav labels and paths; role-gated Manage tab; access guard logic
- `AbstractInteractionActivity` retired and deleted
- O\* workspace fully implemented: `os.js` orchestrator, refactored `requirements.js`/`changes.js`, new `RequirementDetails`/`ChangeDetails`, `MasterDetail` layout, breadcrumb trail, navigable inter-O\* references
- `ReferenceListManager` and `ReferenceManager` support navigable chips in read mode
- `CollectionEntityForm` `onNavigate` option propagates to managers
- Server GET routes accept null userId (anonymous read)
- All activity files moved to new folder structure via WebStorm refactor (import paths auto-updated)

### What did not change

- All component internals (`CollectionEntity`, `TreeTableEntity`, `TemporalGrid`, `FilterBar`, `AnnotatedMultiselectManager`, `DiffPopup`)
- All API calls and server business logic
- CSS class names within activity components
- Server, CLI, shared package (except route patches)

### Known gaps deferred

| Item | Notes |
|---|---|
| CSS layout and styling | Functional but unpolished: `.selected-chip--link` cursor/link styling; detail panel scrollbar; toolbar layout |
| `plan.js` wiring | Plan shell exists but `PlanningActivity` and `PrioritisationActivity` not yet wired |
| `manage/editions/editions.js` wiring | `ODPEditionsEntity` not yet wired into manage shell |
| `setup.js` wiring | Files moved but sub-activity routing not yet wired in `elaborate.js` / `explore.js` |
| `quality.js` | Placeholder |
| `notes.js` | Placeholder |
| `admin.js` | Placeholder |
| Converse activity | Deferred — not started |
| Edition patch workspace (`/manage/editions/{id}/patch`) | Deferred |
| User taxonomy / access matrix | Deferred |
| Header badge logic | Deferred |
| Time Traveller (O\* version history navigation) | Deferred |
| Review popup on detail form | Deferred |

---

## 4. Design decisions

| Topic | Decision |
|---|---|
| **Anonymous access** | Home (edition list) and Explore accessible without login. `/elaborate` and `/manage` require identified user — router redirects to `/`. Server GET routes accept null userId. |
| **User identification** | Name + role stored in localStorage. No server-side authentication in Phase A. |
| **Dataset context** | Stored on `App`. Set by Home on selection. Sub-activities read `app.getDatasetContext()` transparently. |
| **Setup data** | Lazy-loaded once on first request, cached on `App`. Invalidated after setup CRUD via `invalidateSetupData()`. |
| **Router prefix matching** | `/elaborate` matches `/elaborate/os`, `/elaborate/os/requirements/157` etc. Active top-level tab from `router.activeSegment()`. |
| **CSS load order** | All CSS files listed explicitly in `index.html`. Sub-folder files added as new activities are implemented. |
| **`AbstractInteractionActivity` retirement** | Replaced by `OsActivity` (orchestration) + `MasterDetail` (layout) + injected callbacks on entity components. No subclassing. |
| **O\* detail navigation** | Row click → detail in MasterDetail panel (panel mode). Inter-O\* reference click → full page navigation (page mode). No inline detail panel. |
| **Form body in detail views** | `generateReadOnlyView` + `initializeReadOnlyInPanel` — single source of truth for field layout, tabs, and rich text. No duplicated field rendering. |
| **Navigable references** | `onNavigate` at form construction; `onItemClick` on manager construction; `stopPropagation` prevents panel deselection. Entity type from `field.formatArgs[0]` mapped to URL segment. |
| **Detail view toolbar** | Code identifier + Edit button (Elaborate only). Type badge and maturity removed from toolbar — present in General tab of the form. |
| **Back button** | Removed entirely. Breadcrumb trail provides all navigation. |
| **Breadcrumb ownership** | List view: owned by `OsActivity`, rendered above MasterDetail. Page mode: owned by `RequirementDetails`/`ChangeDetails`, rendered internally. Panel mode: suppressed (list breadcrumb serves). |
| **File moves** | Performed via WebStorm refactor tool — all import paths auto-updated. |