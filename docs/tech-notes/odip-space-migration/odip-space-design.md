# ODIP Space Design

## 1. Introduction

### 1.1 Purpose

This document describes the design of **ODIP Space**, the web client for the ODIP tool. It serves as the reference for UX decisions, navigation structure, page purposes, and interaction patterns. It is intended to drive discussion, alignment, and eventually implementation.

This document is built incrementally. Each section is progressively elaborated as design decisions are confirmed.

### 1.2 Principles and conventions

- **Activity names use the verb infinitive form** — e.g. *Elaborate*, *Explore*, *Converse*, *Manage*, not *Elaboration*, *Exploration*, etc.
- **Dataset** is the umbrella term covering both the Live Dataset and any Edition. When selecting a context on Home, the user selects which dataset to work in.
- **Live Dataset** — the continuously evolving working data.
- **Edition** — a baseline of the Live Dataset. An edition may or may not be published.
- **Version** — strictly reserved for O* versioning. An O* can have multiple versions across editions. The term must not be used to refer to datasets or editions.
- **O*** denotes the family of operational entities: Operational Needs (ONs), Operational Requirements (ORs), and Operational Changes (OCs).
- **Paths** use `>` as separator and follow the navigation hierarchy from Home downward.
- **Access** is indicated as `R` (read-only) or `W` (write, always via popup). Pages described as `R/W` contain inline write interactions (e.g. drag-and-drop, cell editing) without a popup.
- **Edit popups** are closed interaction contexts: no navigation is possible from within a popup. The user edits, then saves or cancels, returning exactly to the prior state.
- **Browser history** is used for navigation: each meaningful state transition pushes a URL history entry, enabling browser back/forward. Permanent nav tabs provide coarse-grained shortcuts bypassing history.
- **Canonical URLs**: every O*, wave, and edition has a permanent deep-linkable URL, reconstructable from URL alone without reliance on in-memory state.
- **Two distinct URL spaces** coexist in ODIP Space:
    - **Page URLs** — client-side SPA routes pushed to browser history, driving UI state. Defined in this document. E.g. `/elaborate/os/{id}`.
    - **Data URLs** — server-side REST API endpoints driving data CRUD operations. Defined in the OpenAPI spec, which remains the authority. E.g. `GET /api/on/{id}`. A page URL may trigger one or several API calls; an API endpoint may be called from multiple pages.

---

## 1.3 Open Design Questions

The following topics have been identified but not yet designed. They will be addressed in future iterations of this document.

| Topic | Notes |
|-------|-------|
| **Converse** | Inline conversation initiation surfaces on O* pages, wave pages, and dataset/edition level. Distinction between /converse and /edit paths. Full Converse section design. Possible solutions: `/{entity}/{id}/converse` opens Converse tab pre-filtered to that entity; or inline widget on the page without navigation; or similar. |
| **Review / Comment** | Whether a formal reviewed flag exists on individual O*s or notes. Distinction between comment, review, and edit activities. Access rules per user category. Possible solutions: `/{entity}/{id}/review` as a dedicated structured review workspace distinct from `/converse` and `/edit`; or review as a popup action; or similar. |
| **Quality** | Detailed design of quality checks, maturity indicators, and AI-assisted checks. Access scope per user category. |
| **Capability catalogue** | Placement and design within Setup. Pending discussion with note author. |
| **Event types / Domains** | Whether these belong in Setup. Parked pending further discussion. |
| **Patch workspace** | Detailed design of the Edition patch activity at . |
| **User taxonomy** | Full access matrix per user category across all paths. |

---

## 1.4 Coverage

The following table assesses the coverage of this document against the ODIP Space UI Design Proposal (v1.42, Yves Steyt / ACD Division).

| Note section | Status | Comment |
|---|---|---|
| §0 TODO / Open questions | Covered | Captured in §1.3 Open Design Questions |
| §1 Version history | Covered | Internal to the note — tracks the note's own evolution, not design content |
| §2 Logo assets | Covered | Design asset, not navigation/UX design content — to be handled separately |
| §3 Site plan | Covered | Addressed as path tables rather than visual diagram |
| §4 User taxonomy | Not covered | User categories, access tiers, badge logic — to be designed |
| §5 Universal rules | Partial | Opaque IDs, deprecation warnings, DRAFT visibility — partially in conventions; remainder to be designed |
| §6.1 Badge logic | Not covered | Header badge states per user/context — to be designed |
| §6.2 Header states | Not covered | Five reference header states — to be designed |
| §6.3 Nav bar visibility matrix | Not covered | Tab visibility per user category and context — to be designed |
| §6.4 Navigation model | Alternative | Stack model replaced by browser history + canonical URLs; URL spaces and navigation principles in conventions |
| §6.5 Link inventory | Not covered | All linkable elements across all pages — to be designed |
| §7 Home page | Covered | §2 top-level activity map |
| §8 ODIP Help | Not covered | Contextual help, manuals, help dropdown — to be designed |
| §9.1 Notes | Covered | §3.4 |
| §9.2 O*s | Partial | Path structure covered in §3.2; field lists, query fields, result set columns, sorting not covered |
| §9.2.6b Time Traveller | Not covered | O* version history navigation — to be designed |
| §9.3 Plan | Covered | §3.3 |
| §9.3.7 Prioritisation process | Not covered | OC chips, dependency warnings, re-proposal dialog — to be designed |
| §9.4 Quality | Not covered | Four indicator groups — to be designed |
| §9.5 Setup | Partial | Reference documents and stakeholder categories covered in §3.5; domains, event types, capability catalogue parked |
| §10 Explore | Covered | §4 — isomorphic to Elaborate |
| §11 Conversations | Not covered | Subject types, access model, version anchoring — to be designed |
| §11b Deep linking | Partial | Canonical URLs in conventions; versioned deep links, URL format not covered |
| §12 Management | Covered | §6 |

---

## 2. Top-level activity map

The following table lists the top-level pages and activities in ODIP Space.

| Title | Path | Purpose |
|-------|------|---------|
| Home | `/` | Entry point — user selects the context in which they will work: live dataset or a specific published edition. All subsequent navigation is qualified by this choice. |
| Elaborate | `/elaborate` | Authoring workspace for internal users working on the live dataset. Covers the full elaboration lifecycle: O* authoring, planning, quality control, and dataset configuration. |
| Explore | `/explore` | Read-only consultation workspace scoped to a specific published edition. Covers the same views as Elaborate but frozen at the selected edition snapshot. |
| Converse | `/converse` | Collaborative threading at application, edition, and O* level. Available regardless of edition context. |
| Manage | `/manage` | Version-independent administration area. Covers edition lifecycle, user management, monitoring, and backup. Restricted to integrators. |

---

## 3. Elaborate

### 3.1 Activity map

| Title | Path | Purpose |
|-------|------|---------|
| O*s | `/elaborate/os` | Create, query, consult, update and delete ONs, ORs and OCs in the Live Dataset. |
| Plan | `/elaborate/plan` | Access planning and prioritisation views: waves, bandwidth, and calendar. |
| Quality | `/elaborate/quality` | Consult content integrity checks, maturity indicators, and AI-assisted quality checks. |
| Setup | `/elaborate/setup` | Manage Live Dataset reference data. |
| Notes | `/elaborate/notes` | Editorial workspace for integrators. Consult computed changes since a selected edition. Author and maintain edition notes, domain notes, and wave notes for publication. |

### 3.2 O*s

| Title | Path | Purpose |
|-------|------|---------|
| O*s | `/elaborate/os` | Query and search ONs, ORs, OCs in the Live Dataset. Master-detail view: result set on the left, detail panel on the right. CRUD actions available via popup. |
| O* detail | `/elaborate/os/{id}` | Canonical O* detail page. Consult full O* content. Navigate related O*s via strategic connector subgraph. Edit via popup. Deep-linkable. |
| O* edit | `/elaborate/os/{id}/edit` | Edit popup for a specific O*. Closed context — no navigation. Save or cancel returns to prior state. |

### 3.3 Plan

| Title | Path | Purpose |
|-------|------|---------|
| Plan | `/elaborate/plan` | Planning and prioritisation workspace. Access waves, bandwidth budget, and calendar views for the Live Dataset. |
| Waves | `/elaborate/plan/waves` | Consult and prioritise the wave list. Drag-and-drop reordering. Navigate to wave detail. |
| Wave detail | `/elaborate/plan/waves/{id}` | Consult wave detail: OC list, Gantt, bandwidth allocation, wave notes. Navigate to O*s from Gantt. Edit via popup. Deep-linkable. |
| Wave edit | `/elaborate/plan/waves/{id}/edit` | Edit popup for a specific wave. Closed context — no navigation. Save or cancel returns to prior state. |
| Bandwidth | `/elaborate/plan/bandwidth` | Consult and edit the MW budget grid by year, wave, and domain. Inline editing. |
| Calendar | `/elaborate/plan/calendar` | Consult the timeline: wave release dates and OC milestones. Read-only. |

### 3.4 Notes

| Title | Path | Purpose |
|-------|------|---------|
| Notes | `/elaborate/notes` | Editorial workspace for integrators. Consult computed changes since a selected edition. Author and maintain edition notes, domain notes, and wave notes for publication. |
| Detailed changes | `/elaborate/notes/changes` | Computed diff against a selected edition. Tags: New / Changed / Decommissioned / Deleted. On-demand computation. Read-only. |
| Edition notes | `/elaborate/notes/edition` | Author and maintain the edition description and application evolution text. Scoped to the entire dataset. |
| Edition notes edit | `/elaborate/notes/edition/edit` | Edit popup for edition notes. Closed context — no navigation. Save or cancel returns to prior state. |
| Domain notes | `/elaborate/notes/{domain}` | Consult narrative annotations for a specific domain. |
| Domain notes edit | `/elaborate/notes/{domain}/edit` | Edit popup for domain notes. Closed context — no navigation. Save or cancel returns to prior state. |
| Wave notes | `/elaborate/notes/{wave}` | Consult narrative and migration schedule for a specific wave. |
| Wave notes edit | `/elaborate/notes/{wave}/edit` | Edit popup for wave notes. Closed context — no navigation. Save or cancel returns to prior state. |

### 3.5 Setup

| Title | Path | Purpose |
|-------|------|---------|
| Setup | `/elaborate/setup` | Manage Live Dataset reference data. |
| Reference documents | `/elaborate/setup/refdoc` | Create, consult, update and delete reference documents (strategic connectors). |
| Reference document detail | `/elaborate/setup/refdoc/{id}` | Consult reference document detail. Edit via popup. Deep-linkable. |
| Reference document edit | `/elaborate/setup/refdoc/{id}/edit` | Edit popup for a specific reference document. Closed context — no navigation. Save or cancel returns to prior state. |
| Stakeholder categories | `/elaborate/setup/stakeholder` | Create, consult, update and delete stakeholder categories. |
| Stakeholder category detail | `/elaborate/setup/stakeholder/{id}` | Consult stakeholder category detail. Edit via popup. Deep-linkable. |
| Stakeholder category edit | `/elaborate/setup/stakeholder/{id}/edit` | Edit popup for a specific stakeholder category. Closed context — no navigation. Save or cancel returns to prior state. |

---

## 4. Explore

Explore is isomorphic to Elaborate in structure and navigation, with one difference: all edit popup pages are absent. Every path available in Elaborate has a read-only counterpart in Explore under `/explore`, scoped to the selected edition rather than the Live Dataset.

---

## 5. Converse

_To be elaborated._

---

## 6. Manage

Management is the version-independent administration area of ODIP Space. It is restricted to integrators and accessible regardless of whether a dataset context is selected.

### 6.1 Editions

| Title | Path | Purpose |
|-------|------|---------|
| Editions | `/manage/editions` | List and query editions. Create and delete. |
| Edition detail | `/manage/editions/{id}` | Consult edition detail. Publish / unpublish via action. Deep-linkable. |
| Edition edit | `/manage/editions/{id}/edit` | Edit popup for edition metadata. Closed context — no navigation. Save or cancel returns to prior state. |
| Edition patch | `/manage/editions/{id}/patch` | Dedicated patching workspace. Author patch notes and apply targeted O* corrections within the frozen edition. |

### 6.2 Admin

| Title | Path | Purpose |
|-------|------|---------|
| Users | `/manage/admin/users` | Manage users and access rights. |
| Monitoring | `/manage/admin/monitoring` | Configure email distribution addresses and alerting. |
| Log | `/manage/admin/log` | Consult audit trail. Download backup files. Read-only. |
| Backup | `/manage/admin/backup` | Backup and restore operations. |