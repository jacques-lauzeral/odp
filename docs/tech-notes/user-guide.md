# ODIP Web Client — User Guide

> **ODIP** — Operational Development and Implementation Plan  
> Internal prototype for managing ONs, ORs, and OCs within the iCDM process.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Setup](#2-setup)
3. [Elaboration](#3-elaboration)
4. [Planning](#4-planning)
5. [Prioritisation](#5-prioritisation)
6. [Publication](#6-publication)
7. [Review](#7-review)
8. [Key Concepts & Terminology](#8-key-concepts--terminology)

---

## 1. Getting Started

### Accessing the Application

Open a browser and navigate to:

- **Local**: `http://localhost:3000`
- **Eurocontrol environment**: `http://dhws097:3000`

### User Identification

There is no authentication. On the landing page, enter your name and confirm. This name is recorded as the author of every change you make.

### Navigation

The persistent top bar provides access to all seven activities:

| Activity | Purpose |
|---|---|
| **Landing** | Home screen and connection status |
| **Setup** | Manage reference data (domains, stakeholders, documents, waves, bandwidths) |
| **Elaboration** | Author and manage ONs, ORs, and OCs |
| **Planning** | Visualise ON deployment on a temporal grid |
| **Prioritisation** | Assign OCs to waves against DrG bandwidth constraints |
| **Publication** | Create baselines, editions, and publish |
| **Review** | Read-only consultation of any ODIP Edition |

### Connection Status

A status indicator in the top bar shows whether the web client can reach the API server. If disconnected, check that the server pod is running.

---

## 2. Setup

The Setup activity manages reference data used across the entire platform. All setup entities are non-versioned — edits take effect immediately.

### Tabs

| Tab | Entity | Structure |
|---|---|---|
| **Stakeholder Categories** | Operational stakeholder groupings | Two-level hierarchy |
| **Domains** | Business domains impacted by ORs | Two-level hierarchy |
| **Reference Documents** | Strategic/regulatory documents (e.g. CONOPS, EU Regulations) | Three-level hierarchy |
| **Waves** | NM deployment cycles, identified as `{year}#{sequenceNumber}` (e.g. `27#2`) | Flat list |
| **Bandwidths** | Per-wave, per-DrG planned capacity in Man-Weeks | Flat list |

### Tree-Based Entities (Stakeholder Categories, Domains, Reference Documents)

Three-pane layout: **tree** (left) | **details** (centre) | **actions** (right).

- Click a node in the tree to select it and view its details.
- **Add Root** — creates a top-level entry.
- **Add Child** — creates a child under the selected node.
- **Edit** — opens the selected item in edit mode.
- **Delete** — only available on leaf nodes (no children).
- Parent can be reassigned via the edit form.

> Reference Documents have an optional `url` field. When set, the document title becomes a hyperlink throughout the platform.

### List-Based Entities (Waves, Bandwidths)

Table layout with **Add**, **Edit**, and **Delete** actions. Waves are uniquely identified by `(year, sequenceNumber)`. Bandwidths are uniquely identified by `(year, wave, DrG)`.

---

## 3. Elaboration

The Elaboration activity is the core authoring workspace. It manages the three operational entity types: **ONs** (Operational Needs), **ORs** (Operational Requirements), and **OCs** (Operational Changes).

### Tabs

| Tab | Content |
|---|---|
| **Requirements** | ONs and ORs — collection or hierarchical tree view |
| **Changes** | OCs — collection or temporal view |

### Filtering

A shared filter bar sits above the Requirements and Changes tabs and applies to both. Filter by DrG, maturity, domain, stakeholder category, or strategic document (the latter applies to ONs only).

> **Note:** Filter state is not reset when navigating away from and back to the Elaboration or Review activity. If the displayed content appears incomplete or inconsistent, reset the filter bar manually.

> **Note:** The textual search is currently treated as a filter within the filter bar. It will be moved to a dedicated location in a future version.

### Requirements (ONs & ORs)

**Views available:**

- **Collection** — flat table with columns: title, code, maturity, strategic documents, implemented ONs, dependencies, impacted stakeholders, impacted domains.
- **Tree** — hierarchical view following `REFINES` relationships (ORs nested under parent ONs).

**Grouping:** Results can be grouped by any column header.

**Selecting an item** opens its details panel on the right:

| Details Tab | Content |
|---|---|
| **General** | Title, code, DrG, maturity, type, tentative period (ONs only) |
| **Content** | Rich-text fields: statement, rationale, flows, NFRs |
| **Traceability** | Strategic documents (ON), refines/refined-by, implements/implemented-by |
| **Impact** | Impacted stakeholders, impacted domains (ORs only) |
| **History** | Version list with diff |

**Creating an ON or OR:** Click **Add** in the toolbar. Required fields: title, DrG, type. Rich-text fields (statement, rationale, etc.) use the Quill editor — supports bold, italic, lists, and embedded images.

**Editing:** Click **Edit** in the details panel. Every save creates a new version. If another user saves the same item between your load and your save, you will get a version conflict — refresh and retry.

**Tentative period (ONs only):** A year or year range (e.g. `2027` or `2027-2029`). Used to position the ON on the Planning temporal grid.

### Changes (OCs)

**Views available:**

- **Collection** — table with columns: code, title, DrG, maturity, implemented ORs, decommissioned ORs, dependencies, milestones, cost.
- **Temporal** — horizontal timeline grid. Each OC is a row; milestone events appear as coloured markers on a wave-aligned time axis. OCs with no milestones in the visible window are hidden.

**Selecting an OC** opens its details panel:

| Details Tab | Content |
|---|---|
| **General** | Title, code, DrG, maturity, cost |
| **Content** | Rich-text: purpose, initial state, final state, details, private notes |
| **Traceability** | Implemented ORs, decommissioned ORs, OC dependencies |
| **Milestones** | Deployment milestone events, each targeting a Wave |
| **History** | Version list |

**Milestones:** Each milestone has a name, a wave target (`{year}#{sequenceNumber}`), and one or more event types:

| Event Type | Meaning |
|---|---|
| `API_PUBLICATION` | API published |
| `API_TEST_DEPLOYMENT` | API test deployment |
| `API_DECOMMISSIONING` | API decommissioned |
| `UI_TEST_DEPLOYMENT` | UI test deployment |
| `OPS_DEPLOYMENT` | Operational deployment (also used by Prioritisation) |

Milestones are managed via dedicated **Add Milestone / Edit / Delete** controls in the Milestones tab — separate from the main OC save. Milestones can only be added when **editing an existing OC** — the Milestones tab is not available at OC creation time.

**Temporal view zoom:** Use the zoom control to adjust the visible year range.

---

## 4. Planning

The Planning activity visualises ON deployment across waves on an interactive temporal grid.

### Tabs

| Tab | Status |
|---|---|
| **ON Plan** | Active |
| **OC Plan** | Placeholder — not yet implemented |

### ON Plan

**Left pane — Temporal Grid:**

ONs are organised in a two-level collapsible hierarchy:

- **DrG separator row** — groups ONs by Drafting Group.
- **Root ON row** — an ON with no parent. Expand/collapse toggle controls visibility of its children.
- **Child ON row** — an ON that refines a parent; indented under the root.

ONs with a tentative period show two markers:

- **▶** period start
- **◀** period end

ONs without a tentative period appear as empty rows (space reserved). Expand/collapse state is preserved across re-renders.

**Right pane — Details:**

Clicking any ON row opens its full read-only form. The sticky header shows title, code, and an **Edit** button that opens the ON edit form inline — the same form as in Elaboration.



---

## 5. Prioritisation

The Prioritisation activity is a board for assigning OCs to deployment waves, monitored against per-DrG bandwidth constraints.

### Layout

A two-dimensional board:

- **Rows** — Waves
- **Columns** — DrGs
- **Backlog row** — OCs not yet assigned to any wave

Each cell contains OC cards for that wave/DrG pair, plus a **load bar** (used vs planned Man-Weeks).

### Load Bar Colours

| Colour | Meaning |
|---|---|
| Green | Load < 80% of planned capacity |
| Orange | Load between 80% and 120% of planned capacity |
| Red | Load > 120% of planned capacity |

### Assigning OCs to Waves

Drag an OC card from the backlog (or another cell) into the target wave/DrG cell. The assignment is persisted as an `OPS_DEPLOYMENT` milestone on the OC.

**Dependency enforcement:** An OC cannot be placed in a wave earlier than any of its dependencies. Invalid assignments are rejected by the UI.

Wave rows can be **collapsed** to reduce visual noise — the load bar summary remains visible.

---

## 6. Publication

The Publication activity manages the lifecycle of ODIP Editions — from creation to publishing a static web site.

### Concepts

| Concept | Meaning |
|---|---|
| **Baseline** | Immutable snapshot of all current OR/OC versions at a point in time |
| **ODIP Edition** | Publication scope: a baseline + optional `startDate` filter + optional ON maturity gate |
| **Type** | `DRAFT` (working edition) or `OFFICIAL` (formal release) |

**Editions are immutable after creation.** All fields are set at creation time and cannot be modified.

### Layout

The activity has three areas:

- **Filter bar** (top) — filter by type (`DRAFT` / `OFFICIAL`). The wave filter is present but currently not functional.
- **Action bar** — **New Edition** button to create a new edition.
- **Master/detail** — edition list in the centre panel; edition details in the right panel.

### Edition List (Centre Panel)

Displays all editions with columns: title, type, start date, min ON maturity.

### Edition Details (Right Panel)

The details panel has a **header** (title + actions) and three tabs:

| Tab | Content |
|---|---|
| **Information** | Title, type |
| **Configuration** | Start date, min ON maturity |
| **Meta information** | Baseline reference, creation metadata |

### Header Actions

| Button | Action |
|---|---|
| **Review** | Opens the Review activity scoped to this edition |
| **Publish** | Triggers the Antora site build (~5–30 s); on success, a link to the static site appears |

> If a build is already in progress, you will see "Publication already in progress" — retry after a few seconds.

> **Publication format:** Only HTML static site generation is currently available. The published site includes a built-in search. PDF and Word export are under development.

### Creating an Edition

Click **New Edition** and provide:

- **Title** — required.
- **Type** — `DRAFT` or `OFFICIAL`.
- **Baseline** — select an existing one, or leave empty (a baseline is auto-created).
- **Start date** — optional lower bound for OC milestone and ON tentative period filtering (`yyyy-mm-dd`).
- **Min ON maturity** — optional gate: `DRAFT` (default), `ADVANCED`, or `MATURE`.

---

## 7. Review

The Review activity provides read-only access to any ODIP Edition (`DRAFT` or `OFFICIAL`).

### Selecting an Edition

On entering Review, a target selection screen lists available editions. Select one to load its content.

### Browsing

The interface mirrors Elaboration — Requirements and Changes tabs, collection and tree views, filter bar — but all forms are read-only. No add, edit, or delete actions are available.

The edition context is fixed to the selected edition. To switch, return to the target selection screen.

---

## 8. Key Concepts & Terminology

| Term | Meaning |
|---|---|
| **ON** | Operational Need — high-level operational objective |
| **OR** | Operational Requirement — traceable requirement derived from an ON |
| **OC** | Operational Change — deployment unit implementing one or more ORs |
| **DrG** | Drafting Group — working group responsible for a scope (e.g. IDL, 4DT, ASM_ATFCM) |
| **Wave** | NM deployment cycle, identified as `{year}#{sequenceNumber}` |
| **Baseline** | Immutable snapshot of the repository at a point in time |
| **ODIP Edition** | A publication scope: baseline + optional filters |
| **Maturity** | Editorial state of an entity: `DRAFT` → `ADVANCED` → `MATURE` |
| **Tentative period** | Year or year range expressing planned implementation window of an ON |
| **Milestone** | A dated deployment event on an OC, targeting a specific Wave |
| **REFINES** | Hierarchy relationship — a child ON/OR refines a parent ON/OR |
| **IMPLEMENTS** | An OR implements an ON; an OC implements an OR |
| **DEPENDS_ON** | An OC (or OR) must precede another in deployment order |
| **Round-trip editing** | Export to Word → manual edit → re-import into ODIP |