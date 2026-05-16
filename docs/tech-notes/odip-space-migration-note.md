# Migration Note — ODIP Tool → ODIP Space

**Version:** 2  
**Scope:** Web client only. Server, API, CLI, shared package unchanged throughout all phases.  
**Strategy:** Incremental, phase-by-phase. Each phase independently deployable and reversible.

---

## 0. Introduction

### 0.1 Purpose

This note prepares and documents the first phase of the migration from the ODIP Tool web client to a target web client referred to as **ODIP Space~** (Space-tilde). The tilde is intentional: the target is not the ODIP Space described in the blueprint (v1.42) nor the one formalised in the Space design note, but a working approximation towards which the web client will progressively converge, phase by phase, starting from Phase A documented here.

The note is a working design document — it reflects decisions reached iteratively and will continue to evolve as subsequent phases are elaborated.

### 0.2 Reference documents

| Document | Role |
|---|---|
| **ODIP Space UI Design Proposal v1.42** — Yves Steyt / ACD Division, EUROCONTROL Network Management, April 2026 | Primary UX authority. Defines the target navigation model, page purposes, interaction patterns, and mockups. Drives target design decisions. |
| **`odip-space-design.md`** | Structured design note derived from the blueprint. Formalises paths, activity map, page inventory, and open design questions. Used as the reference for URL structure and activity decomposition. |
| **ADD Chapter 08 — Web Client** | Authoritative description of the current ODIP Tool web client implementation: activity structure, component patterns, CSS architecture, API integration, routing. Drives the current-state analysis and migration mapping. |

### 0.3 Context

The ODIP Tool web client is a Vanilla JS SPA organised around seven flat top-level activities: Landing, Elaboration, Planning, Prioritisation, Setup, Publication, and Review. Each is a self-contained module loaded dynamically by `app.js` via the History API.

ODIP Space~ reorganises these into a structured hierarchy: **Home**, **Elaborate**, **Explore**, **Manage**, and (deferred) **Converse**. Elaborate and Explore share a common set of sub-activities (O\*s, Plan, Setup, Quality, Notes) distinguished only by dataset context (live vs edition) and access mode (R/W vs R/O). Manage absorbs Publication. Home replaces Landing with a dataset selector gateway.

The migration is web-client-only. The server, REST API, CLI, and shared package are not modified in any phase of this migration.

### 0.4 Organisation

The note is structured as follows:

- **§1 Target structure** — the JS and CSS file/folder organisation at end of Phase A
- **§2 Current → target file mapping** — per-file mapping with implementation status (reuse / reshaped / new / dummy)
- **§3 Phase A scope summary** — what changes, what does not, known gaps deferred
- **§4 Open questions** — design decisions still to be confirmed before implementation

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
│   ├── home/                         new — full rewrite of landing/
│   │
│   ├── workspace/
│   │     ├── elaborate/              reshaped — thin shell, live dataset + R/W
│   │     ├── explore/                reshaped — thin shell, edition context + R/O
│   │     ├── setup/                  reuse — all setup entities (permanent + edition)
│   │     │     ├── setup.js
│   │     │     ├── stakeholders.js
│   │     │     ├── reference-documents.js
│   │     │     ├── domains.js
│   │     │     ├── waves.js
│   │     │     └── bandwidth.js
│   │     └── shared/                 sub-activities shared by Elaborate and Explore
│   │           ├── os/
│   │           │     ├── os.js               new — shell: two tabs + context/mode
│   │           │     ├── requirements.js      reuse — from elaboration/
│   │           │     └── changes.js           reuse — from elaboration/
│   │           ├── plan/
│   │           │     ├── plan.js              new — shell: tabs + context/mode
│   │           │     ├── on-plan.js           reuse — from planning/
│   │           │     ├── oc-plan.js           reuse — from planning/ (placeholder)
│   │           │     ├── waves.js             reuse — from prioritisation/
│   │           │     ├── bandwidth.js         dummy — placeholder
│   │           │     └── calendar.js          dummy — placeholder
│   │           ├── quality/
│   │           │     └── quality.js           dummy — placeholder
│   │           └── notes/
│   │                 └── notes.js             dummy — placeholder
│   │
│   ├── manage/
│   │     ├── manage.js               new — minimal shell
│   │     └── editions/
│   │           └── editions.js       reuse — from publication/
│   │
│   └── converse/                     deferred
│
├── components/                       flat — unchanged
│
└── shared/
      ├── router.js                   new
      ├── api-client.js               unchanged
      ├── error-handler.js            unchanged
      ├── utils.js                    unchanged
      └── src/                        @odp/shared copy (build artefact)
```

### 1.2 CSS

Mirrors JS structure exactly:

```
web-client/src/styles/
├── main.css                          unchanged
├── primitives.css                    unchanged
├── feedback-components.css           unchanged
├── layout-components.css             unchanged
├── activities/
│   ├── home/
│   ├── workspace/
│   │     ├── elaborate/
│   │     ├── explore/
│   │     ├── setup/
│   │     └── shared/
│   │           ├── os/
│   │           ├── plan/
│   │           ├── quality/
│   │           └── notes/
│   ├── manage/
│   └── converse/
├── components/                       flat — unchanged
└── shared/                           unchanged
```

---

## 2. Current → target file mapping

### 2.1 Activities

| Current | Target | Status |
|---|---|---|
| `activities/landing/` | `activities/home/` | Full rewrite |
| `activities/elaboration/` | `activities/workspace/elaborate/` + `workspace/shared/os/requirements.js` + `workspace/shared/os/changes.js` | Reshaped + reuse |
| `activities/review/` | `activities/workspace/explore/` | Reshaped |
| `activities/planning/` | `activities/workspace/shared/plan/on-plan.js` + `plan/oc-plan.js` | Reuse |
| `activities/prioritisation/` | `activities/workspace/shared/plan/waves.js` | Reuse |
| `activities/setup/` | `activities/workspace/setup/` | Reuse |
| `activities/publication/` | `activities/manage/editions/editions.js` | Reuse |

### 2.2 New files (Phase A)

| File | Purpose |
|---|---|
| `shared/router.js` | Route table, navigate(), prefix matching, popstate handler |
| `activities/home/home.js` | Hero band + version list + dataset context selection |
| `activities/workspace/elaborate/elaborate.js` | Thin shell: sets live dataset context + R/W mode |
| `activities/workspace/explore/explore.js` | Thin shell: sets edition context + R/O mode |
| `activities/workspace/shared/os/os.js` | Shell: Requirements / Changes tabs + context/mode |
| `activities/workspace/shared/plan/plan.js` | Shell: plan tabs + context/mode |
| `activities/manage/manage.js` | Minimal manage shell |

### 2.3 Modified files (Phase A)

| File | Change |
|---|---|
| `app.js` | Delegates to router; Space paths in route map |
| `index.html` | Updated CSS links; Space paths |
| `components/header.js` | Connect form (user name + role selector); Space nav labels and paths; access guard logic |

### 2.4 Dummy placeholders (Phase A)

| File | Notes |
|---|---|
| `workspace/shared/quality/quality.js` | Empty shell, "Coming soon" |
| `workspace/shared/notes/notes.js` | Empty shell, "Coming soon" |
| `workspace/shared/plan/bandwidth.js` | Empty shell, "Coming soon" |
| `workspace/shared/plan/calendar.js` | Empty shell, "Coming soon" |
| `manage/editions/` sub-pages | Patching, admin sub-pages — deferred |

---

## 3. Phase A scope summary

### What changes
- Full target folder structure established
- Router introduced (`shared/router.js`)
- Home page rewritten (hero band + version selector)
- Header gains connect form (user name + role)
- Access guards: `/elaborate` and `/manage` blocked without user
- Nav tabs reflect role (Manage visible to integrators only)
- All existing activity logic preserved — reuse or dummy shell

### What does not change
- All component internals (`CollectionEntity`, `TreeTableEntity`, `TemporalGrid`, forms)
- All API calls
- Server, CLI, shared package
- CSS class names within activity components

### Known gaps deferred
- Setup entity versioning (permanent and edition)
- Evolutions panel on Home
- Converse activity
- Manage admin sub-pages (monitoring, users, log, backup)
- Edition patching workspace
- Quality and Notes content

---

## 4. Design decisions

| Topic | Decision |
|---|---|
| **Explore access** | Edition list on Home is visible without login. Anonymous users can navigate to Explore. `/elaborate` and `/manage` require a logged-in user — router redirects to Home if no user set. |
| **Role persistence** | User name and role stored client-side (localStorage) for now. No server-side authentication in Phase A. |
| **Router prefix matching** | Confirmed — router uses prefix matching. `/elaborate` matches `/elaborate/os`, `/elaborate/os/requirements/{id}` etc. The active top-level tab is determined by the first path segment. |
| **CSS load order** | Keep it simple — all CSS files listed explicitly in `index.html`, same pattern as current. Sub-folder files added to the list as new activities are introduced. |