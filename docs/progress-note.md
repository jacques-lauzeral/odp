# Continuity Note — CFT Gap Analysis & Prioritisation Activity
**Session date**: 2026-03-20

---

## 1. Context

Reviewed the Eurocontrol ODIP Call for Tender technical specification
(`TechSpecs_TASKING_ODIP.docx`, v6.1, 2025-06-13) against the current
ODIP prototype. Produced a gap analysis and initiated design and
implementation planning for the Prioritisation activity. The Prioritisation
activity MVP is now fully implemented and working in the browser.

---

## 2. Gap Analysis

### 2.1 Raw Analysis (all identified gaps)

1. **User model & RBAC** — spec defines rich taxonomy (Strategist, Domain writer,
   Integrator, iCDM, NM reviewer, External) with fine-grained domain-scoped access
   rules and role implications. Current ODIP has a simpler user model.

2. **Conversations** — full conversation system required: internal vs external,
   linked to logical O* identity, cross-version continuity, version context markers,
   pending status, soft-delete, suspension/reactivation, immutability of comments,
   rich text. Not implemented at all.

3. **Strategic connectors (NSP Cockpit)** — spec requires ~9 strategic connector
   types (NSP SO/Sub-SO, ATMMP SDO/DA, SESAR Solutions, SDP AF, ICAO ASBU, KPA, NOP)
   with bi-directional links to ONs. Current ODIP covers this via the
   strategic/reference document model already in the DB — gap is a matter of
   taxonomy alignment and UI tuning rather than a missing layer.

4. **External users** — distinct external user persona: read-only access to published
   editions, commenting rights, strict separation from internal conversations.
   Entirely absent; IAM-dependent.

5. **Authentication / IAM** — NM Azure AD/SSO integration required for production.
   No production authentication layer exists currently.

6. **Self-registration workflow** — user self-registration with integrator approval,
   profile maintenance. Architecture must support it from day one (forward
   compatibility). IAM-dependent.

7. **Edition Notes** — structured diff display between consecutive editions
   (dataset vs latest edition, edition vs previous edition). Hard part is the
   diff computation and presentation. Currently not implemented.

8. **Quality page** — governance dashboard: content maturity/completeness indicators,
   broken strategic references, pending conversations (future), data volume stats,
   usage indicators. Not implemented.

9. **Document generation tuning** — dual generation required (external-compatible
   vs NM-private, excluding cost/bandwidth and private notes for externals).
   Current `DetailsModuleGenerator` covers a subset; the dual-generation and
   DRAFT exclusion rules need verification and tuning.

10. **Graphical plan view (Gantt)** — user-facing interactive Gantt over OCs/waves,
    filterable, printable, embedded in web client and generated documents. The
    existing `TemporalGrid` is an internal planning tool, not this user-facing view.

11. **Backup & restore rehearsal** — nightly automated backup, off-premises copy,
    daily restore rehearsal on secondary machine with automated test execution.
    Current backup is basic (binary DB backup in place).

12. **Full-text search** — indexed search over O* fields returning the standard
    result set structure. The published static site has a search; the live dataset
    does not.

13. **Prioritisation page** — dedicated workspace for the iterative prioritisation
    process: OC creation/management, OR evolution cost assignment, bandwidth
    constraints per domain, wave assignment, dataset locking/unlocking, iCDM
    governance loop. Most critical missing functional piece.

14. **User self-management & GDPR compliance** — profile maintenance (excluding
    email), organisation list, email-address-never-displayed rule, GDPR logging
    provisions. IAM-dependent.

15. **Automated & load testing** — exhaustive automated test suite as formal
    deliverable; load testing against volumetric requirements (30 concurrent
    queries, 3 concurrent Gantt generations, 10 concurrent large file downloads,
    10k O*s). Currently limited automated testing exists.

---

### 2.2 Decisions and Motivations

| # | Decision | Motivation |
|---|----------|------------|
| 1 | Not priority | IAM prerequisite; no value without authentication layer |
| 2 | Not priority | Complex, large scope; deferred post-MVP |
| 3 | Covered | Strategic/reference documents already in ODIP DB; taxonomy alignment is a tuning task |
| 4 | Not priority | IAM-dependent; no external users without authentication |
| 5 | Not priority | IAM is not a current priority |
| 6 | Not priority | IAM-dependent; architecture must remain forward-compatible |
| 7 | **Active — linked to #9** | Diff display is the hard unsolved part; tackled together with doc generation tuning |
| 8 | **Active** | Governance value is clear; implementable without IAM |
| 9 | **Active — linked to #7** | Current generator covers a subset; dual generation and exclusion rules need completing |
| 10 | **Active** | Required by spec both in web client and in generated documents |
| 11 | Not priority | Binary DB backup in place; sufficient for current phase |
| 12 | **Active** | Static site search exists but live dataset search is absent; needed for usability |
| 13 | **Done** | MVP implemented — see §4 and §6 |
| 14 | Not priority | IAM-dependent |
| 15 | **Active** | Formal deliverable per spec; load testing required against documented volumetrics |

---

## 3. Gap Prioritisation — Active Backlog

Active gaps ordered by priority for implementation. IAM-dependent and
deferred gaps are excluded (see §2.2).

| Priority | Gap | Rationale |
|----------|-----|-----------|
| 1 | ~~**#13 Prioritisation page**~~ | **Done** |
| 2 | **#7+9 Edition Notes & doc generation tuning** | Closely linked: diff display (#7) and dual external/NM-private generation (#9) tackled together; needed before any production edition cycle |
| 3 | **#10 Graphical plan view (Gantt)** | Required in both web client and generated documents; high visibility for stakeholders |
| 4 | **#8 Quality page** | Governance dashboard; enables integrators to monitor data quality and broken references; no IAM dependency |
| 5 | **#12 Full-text search** | Live dataset search absent; static site search insufficient for authoring workflows |
| 6 | **#15 Automated & load testing** | Formal deliverable per spec; must be built incrementally alongside feature delivery, not deferred to end |

---

## 4. Prioritisation Activity — Design Decisions

### 4.1 Scope

New top-level activity: **Prioritisation** (`/prioritisation` route).
Distinct from the existing Planning activity (ON tentative timeline).
The existing `OC Plan` placeholder tab in Planning is **not** the insertion
point — Prioritisation is a fully separate activity.

### 4.2 Purpose

Iterative workspace for matching OC implementation effort against domain
bandwidth constraints across waves, supporting the iCDM governance loop.

### 4.3 Data inputs (all from existing endpoints)

- `GET /operational-changes` — OCs with `cost`, `drg`, `maturity`,
  `dependencies`, `implementedORs`, milestones
- `GET /bandwidths` — available MW per (year, wave, scope)
- `GET /waves` — wave definitions
- **DrG list** — hardcoded enum, not fetched from API; values:
  `4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NM_B2B, NMUI, PERF, RRT, TCF`;
  display labels from `getDraftingGroupDisplay()` in `@odp/shared`
- OR-level costs (`implementedORs[].cost`) — informational only,
  used to help estimate OC-level cost; not used for bandwidth aggregation

**Note on "domain" terminology**: the CFT uses "domain" for two distinct
concepts. In the prioritisation context, the grid columns are **DrGs**
(hardcoded enum on O* and bandwidth records). The setup entity `Domain`
(user-managed: Flight, Flight Preparation, etc.) is used for OR impact
classification — orthogonal to DrG, not used in the prioritisation grid.

### 4.4 Bandwidth aggregation

- **Consumed MW per cell** = sum of `OC.cost` where `OC.drg = drg`
  AND `OC` has a milestone with `eventType = OPS_DEPLOYMENT` in `wave`
- **Available MW per cell** = bandwidth record for `(wave, drg)`
  (`scope` field on bandwidth record references the DrG enum value)
- `available = null` when no bandwidth record exists for that cell
  (distinct from `available = 0` which means an explicit zero record)

**MVP simplification**: only the `OPS_DEPLOYMENT` milestone determines
wave attribution. OCs with no `OPS_DEPLOYMENT` milestone are treated as
unplanned and appear in the backlog regardless of other milestones.

- **Colour thresholds**: green < 80%, orange 80–120%, red ≥ 120%, grey = no record
- Aggregation at two active levels: (wave, DrG) and (wave, global);
  (year, DrG) and (year, global) are parked post-MVP

**Architecture decision**: aggregation logic lives in a shared pure
module (`shared/src/model/bandwidth-aggregation.js`), usable client-side
now and server-side later without rewriting.

### 4.5 Grid layout

**Axes:**
- **Columns** = DrGs (hardcoded enum, display labels from `getDraftingGroupDisplay()`)
    + rightmost "Global" total column
- **Rows** = waves ordered bottom = nearest, top = furthest
    + Backlog section pinned at the very bottom (3 sub-rows — see §4.6)

**OC cards:**
- Each OC rendered as a card inside its (wave, DrG) cell
- **Height proportional to cost** (logarithmic): `2 + 2·log10(max(1, cost))` rem,
  clamped 2–12 rem → 1 MW = 2 rem, 10 MW = 4 rem, 100 MW = 6 rem
- Card shows: title, cost in MW, maturity colour strip (left edge),
  dependencies icon (⛓) if any, open button (↗) on hover
- **Drag-and-drop** between wave rows within the same DrG column only
  (no cross-DrG drag — OCs belong to their DrG)

**Load indicator bar:**
- Horizontal bar at the bottom of each cell, full cell width
- Fill ratio left-to-right = consumed / available MW
- Colour: green < 80%, orange 80–120%, red ≥ 120%, grey = no bandwidth record
- In collapsed row: thin 4px strip at bottom of cell

**Global (rightmost) column:**
- Tinted background per load level (light green / orange / red) for immediate
  visual distinction from OC maturity strips
- Label: `consumed / available MW` when record exists; `consumed MW` when not

**Wave row collapse:**
- Each wave row is individually collapsible via toggle button anchored at top-left
- Collapsed = 32px row showing effort summary per DrG cell (`consumed [/ available] MW`)
  and load bar strip; OC cards hidden
- Dropping an OC onto a collapsed wave row expands it automatically

**Totals:**
- Global column (rightmost): wave-level totals across all DrGs
- No per-DrG column total row in MVP (future extension)

### 4.6 Backlog section

The backlog is split into three collapsible sub-rows, each independently
expandable, ordered top to bottom:

| Sub-row | Maturity | Draggable | Drop target |
|---------|----------|-----------|-------------|
| Mature  | `MATURE`   | Yes | Yes — accepts drops from wave cells |
| Advanced | `ADVANCED` | Yes | Yes — accepts drops from wave cells |
| Draft   | `DRAFT`    | No  | No — informational only |

- OC cards in Draft sub-row: `cursor: not-allowed`, reduced opacity, lock icon (🔒)
- A wave→backlog drop is only accepted by the sub-row matching the OC's maturity
- Backlog global cell shows OC count + total estimated MW (MW omitted per sub-row
  if no OC in that sub-row has a cost set)
- No load indicator bar (no available bandwidth concept for backlog)

### 4.7 Drag-and-drop interaction

- **Source**: any draggable OC card (maturity ≠ DRAFT) in any wave cell or
  Mature/Advanced backlog sub-row
- **Target**: any wave cell or Mature/Advanced backlog sub-row in the same DrG column
- **Cross-DrG drops**: rejected at `dragover` (no visual feedback, drop not accepted)
- **Backlog maturity mismatch**: rejected at `dragover`
- **On drop**: dependency violation check — warning dialog if violated, but drop
  is allowed with user confirmation
- **Wave→backlog**: calls `apiClient.deleteMilestone()` to remove OPS_DEPLOYMENT
- **Wave→wave**: calls `apiClient.updateMilestone()` to update OPS_DEPLOYMENT wave
- **Backlog→wave**: calls `apiClient.createMilestone()` to create OPS_DEPLOYMENT
- All three API paths use the dedicated `apiClient` milestone methods (not raw
  `apiClient.delete/put/post`) to ensure `expectedVersionId` is sent in the
  request body per the OpenAPI contract

### 4.8 File structure

```
activities/prioritisation/
├── prioritisation.js          Activity shell: data loading, renders grid + backlog
├── prioritisation-grid.js     Grid component: board, cells, cards, drag-and-drop
└── prioritisation.css         Grid styles

shared/src/model/
└── bandwidth-aggregation.js   Pure aggregation module (client + future server reuse)
```

**`app.js`**: new route `/prioritisation`
**`header.js`**: new nav item "Prioritisation"
**`activity.css`**: `.prioritisation-activity` and `.prioritisation-workspace` added

### 4.9 CSS conventions

Follows existing hierarchy:
- Design tokens from `main.css`
- Activity root/workspace pattern from `activity.css`
  (`.prioritisation-activity` / `.prioritisation-workspace`)
- Grid-specific styles in `prioritisation.css`
- No modifications to `abstract-interaction-activity.css`
  (that file is for collection+details two-pane pattern, not used here)

---

## 5. Prioritisation Activity — Parked Backlog

Items explicitly deferred from MVP scope, with rationale and implementation
notes for when they are tackled.

| Item | Rationale for deferral | Implementation notes |
|------|------------------------|----------------------|
| **Per-milestone effort apportionment** | MVP uses OPS_DEPLOYMENT wave as sole attribution point; real effort often spans multiple milestones across different waves | Requires per-milestone cost field on OC milestone structure; aggregation module updated to split OC cost across milestone waves proportionally or by explicit per-milestone MW values; bandwidth records may need finer granularity |
| **Cross-domain OC apportionment** | Adds data model complexity (per-domain MW split on OC); not needed for single-domain MVP | Requires new `apportionment: [{domainId, cost}]` structure on OC; must sum to `OC.cost`; affects aggregation module and grid cell rendering |
| **OC split** | Destructive operation on OC identity; affects dependency chains; needs preview/wizard UI | Requires a dedicated modal: select ORs to move to new OC, redistribute costs, reassign dependencies; new OC inherits wave from parent |
| **Dataset lock/unlock** | IAM-dependent for meaningful enforcement; backend endpoint missing | Backend: new `PATCH /dataset/lock` endpoint; UI: lock indicator in activity header, integrator-only toggle; blocks all write operations while locked |
| **3D presentation mode** | High implementation cost relative to MVP value; purely presentational | Read-only prism view (wave × domain × consumed MW as height); Three.js or CSS 3D transform; triggered from activity header "Present" button; full-screen |
| **Wave × domain aggregation endpoint** | Client-side composition sufficient at current volumetrics (≤500 OCs) | When O* volumes grow or server-side reporting is needed, expose `GET /prioritisation/matrix?year=YYYY` returning pre-computed (wave × domain) cells; reuses `bandwidth-aggregation.js` shared module |
| **Per-DrG column total row** | Not needed for MVP; global column covers cross-wave summary | Pinned footer row below backlog section; one cell per DrG showing total consumed MW across all waves |

---

## 6. Implementation Status

### 6.1 Completed

| File | Location | Status |
|------|----------|--------|
| `bandwidth-aggregation.js` | `shared/src/model/` | ✓ Done |
| `prioritisation.js` | `activities/prioritisation/` | ✓ Done |
| `prioritisation-grid.js` | `activities/prioritisation/` | ✓ Done |
| `prioritisation.css` | `activities/prioritisation/` | ✓ Done |
| `app.js` | root | ✓ Updated |
| `header.js` | `components/common/` | ✓ Updated |
| `landing.html` | `activities/landing/` | ✓ Updated |
| `activity.css` | root | ✓ Updated |
| `08-Web-Client.md` | ADD | ✓ §13 added this session |
| `operational-change-milestone-store.js` | server store | ✓ Bug fix: `description` default |

### 6.2 Key Implementation Notes

**DrG enum usage**: `Object.keys(DraftingGroup)` gives API-facing keys (e.g. `'RRT'`);
`DraftingGroup[key]` gives display labels. Keys match `oc.drg` field from API.

**Entity identity**: `oc.itemId` = stable entity identifier (used in API paths);
`oc.versionId` = current version identifier (used as `expectedVersionId` for optimistic locking).

**Milestone response shape**: `milestone.wave.id` (not `milestone.waveId`) — the API
returns a full `wave` object. `waveId` only appears in request payloads.

**Bandwidth model**: `scopeId` absent = wave × global (shown in Global column only);
`scopeId` present = wave × DrG (shown in DrG cell). All wave IDs normalised to `String`
as map keys to avoid number/string mismatch. `available = null` = no record defined
(distinct from explicit `0`).

**`OPS_DEPLOYMENT`** — used as a literal key string `'OPS_DEPLOYMENT'`. The
`MilestoneEventType` enum maps keys to display labels; keys are the API-facing strings.

**Wave label format**: `{year}#{sequenceNumber}` (e.g. `2027#1`). Previous format
`Y{year}Q{sequenceNumber}` was wrong and is corrected everywhere.

**Wave ID type**: `wave.id` is numeric from the API; `data-*` attributes are always
strings. All `_collapsed` Set lookups normalise to `String(wave.id)` to avoid
type mismatch causing collapse toggle to silently fail.

**`apiClient` milestone methods**: always use `apiClient.deleteMilestone()`,
`apiClient.updateMilestone()`, `apiClient.createMilestone()` — never raw
`apiClient.delete/put/post` for milestone operations. The raw methods do not
place `expectedVersionId` in the request body.

**`idsEqual`** from `@odp/shared` — use for all entity id comparisons.
Never use raw `===` or `String()` coercion for id comparisons.

### 6.3 Known Remaining Issues / Next Session

- `change-form-milestone.js` still uses stale wave label format `Y${year}Q${seq}` —
  needs updating to `${year}#${seq}` (out of scope this session)
- `operational-change-milestone-store.js` server bug fix not yet reflected in ADD
- ADD §13 added this session — wave label fix already in §12.4