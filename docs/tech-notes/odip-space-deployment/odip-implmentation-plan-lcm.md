# ODIP Implementation Plan — LCM

*Lifecycle and change management*

*v0.1 — 12 June 2026 — DRAFT for discussion*

## 1. Scope

Topic LCM covers four requirements from v0.4:

- **LCM-01** — Reason for change *[P0]*
- **LCM-03** — Audit trail *[P0]*
- **LCM-04** — Maturity, no-show and publication visibility *[P0 — parked, see §6]*
- **LCM-05** — Change sets *[P1/M4 — anticipated at P0, see §3.1]*

LCM-02 (AI-assisted reason proposal) is out of P0 scope and will be handled at M4.

The History tab redesign that surfaces LCM data on each version row is treated separately under topic **HIST**.

## 2. Current state

- `VersionedItemStore` manages append-only version history for O*s (ON/OR/OC) and chapters/narratives; every save creates a new version with version number, timestamp, author.
- **No reason for change today.** Saves carry no justification and no nature classifier.
- **No change-set concept.**
- Maturity field exists on ONs, ORs, OCs as an enum that currently includes `NO_SHOW` as a maturity value (rather than a separate flag). See §3.6.
- Lifecycle entities (`ODPEdition`, `Wave`, etc.) carry `createdBy` / `createdAt` and the relevant transition stamps.

## 3. Proposed solution

### 3.1 Model — ChangeSet as the carrier of "why"

The reason for change is captured by a first-class `ChangeSet` node. Every version of every managed object (O*, theme/chapter, narrative) links to **exactly one** `ChangeSet` via a `HAS_REASON` edge.

LCM-05 (change sets) is anticipated at P0: the storage shape is the right shape from day one, and the UI affordances (workspace, save dialog, banner) are small enough to fit alongside the rest of the P0 work. Splitting LCM-01 (per-save reasons) from LCM-05 (grouping) would mean building twice.

**`ChangeSet` node:**

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `title` | string | Human-readable label |
| `reasonText` | text | Free-text justification |
| `classifier` | enum | `NEW_CONTENT` / `IN_DEPTH_REWORK` / `CLARIFICATION` / `EDITORIAL` |
| `commentRefs` | string[] | Empty at P0; populated at P1 with FBK-04 register IDs |
| `status` | enum | `OPEN` / `CLOSED` |
| `createdBy`, `createdAt` | | |
| `closedBy`, `closedAt` | nullable | Most recent closure; reopens overwrite (see §3.5) |

**`HAS_REASON` edge** (from version node to ChangeSet):

| Field | Type | Notes |
|---|---|---|
| `note` | text | Optional per-object annotation |

A change set is **not a transaction**. Each save is an independent atomic commit through `VersionedItemStore`'s optimistic-concurrency check. Partial-set states are valid and visible to other users while the set is open.

### 3.2 Querying

The model supports the two essential reverse queries via a single graph traversal:

- *All versions impacted by change set X* — one hop along `HAS_REASON` (reverse direction).
- *Change set carrying the reason for version V* — one hop along `HAS_REASON` (forward direction).

No denormalised reason text on version nodes; the edge carries only the per-object note.

### 3.3 Lifecycle

| Transition | Who | Mechanism |
|---|---|---|
| Created | Any active user | Change-sets workspace ("+ New change set") or inline from the save dialog |
| Used | Any active user | Selected in the save dialog. No ownership. |
| Closed | Any active user | From the change-set detail page in the workspace |
| Reopened | Creator or integrator (RBA-02) | From the change-set detail page |
| Deleted | Creator | Empty OPEN sets only (soft delete, recycle bin per DEL-03). Closed sets with members are never deletable. |

**Active change set** is a per-user UI session state in `localStorage` (like user identification). It is **not** a property of the change-set node — different users may have the same set active concurrently and both save into it.

### 3.4 Save dialog

The single point of association. Every save event that creates a new version (create / update / restore / decommission) opens this dialog.

```
┌─ Save changes ─────────────────────────────────────────────┐
│ Change set                                                 │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ▾  [pre-selected: active set]                          │ │
│ └────────────────────────────────────────────────────────┘ │
│   [ Pick another ]   [ + New change set ]                  │
│                                                            │
│ Note for this object (optional)                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │                                                        │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│                                  [ Cancel ]   [ Save ]     │
└────────────────────────────────────────────────────────────┘
```

- **Default** — the user's active change set (sticky session state).
- **Pick another** — dropdown of all OPEN sets, showing title + classifier badge.
- **+ New change set** — mini-form (title, classifier, reason text); creates and activates the new set, then proceeds to save.
- **Note** — optional free text, written to the `HAS_REASON` edge.

The save dialog **always** requires a change set. There is no "save without a set" path. The first save on a fresh installation forces "+ New change set" — the only viable action.

### 3.5 Stale active set

If the user's active change set is no longer OPEN when the user clicks Save:

> *Change set "Editorial pass before publication" was closed by yves on 11 Jun at 14:32.*
>
> `[ Reopen it ]  [ Pick another ]  [ + New change set ]  [ Cancel ]`

Three forward paths, plus cancel. **Reopen** is permission-checked (creator + integrators, per RBA-02). On reopen, the set's `status` flips to `OPEN`; `closedBy` / `closedAt` are overwritten. Multi-cycle history is not retained at P0 — the most recent closure is authoritative.

### 3.6 Audit trail (LCM-03)

**Stance: trust the lifecycle stamps already on entities.** No dedicated `AuditEvent` log at P0.

| Action category | Coverage |
|---|---|
| Version-producing (create, update, restore, decommission) | Version metadata (`createdBy`, `createdAt`) + change-set link via `HAS_REASON` |
| Lifecycle entity transitions (edition created/published, wave created, change set closed/reopened) | Stamps on the entity itself (`createdBy`/`createdAt`, `publishedBy`/`publishedAt`, `closedBy`/`closedAt`) |
| Hard delete | Not in P0 scope (DEL-04 at M4) |
| Multi-transition history (publish/unpublish cycles, close/reopen cycles) | Not retained at P0; most recent transition is authoritative |

An `AuditEvent` log is deferred. It becomes warranted at M4 when hard delete arrives (DEL-04) and when multi-transition history starts to matter. Adding it later is additive instrumentation — no data migration on the entity model.

### 3.7 Maturity / no-show (LCM-04) — parked

The requirement asks for maturity (`DRAFT` / `ADVANCED` / `MATURE`) **and** a separate per-O* no-show flag, with a hard-coded Edition 1 visibility convention. Current implementation conflates `NO_SHOW` into the maturity enum (the Quality activity's `no-show` rule reads `maturity = NO_SHOW`).

Parked pending:

- Confirmation that the storage-level split (separate `noShow` boolean) is wanted at P0 or can be deferred.
- Confirmation that the publication visibility convention is still correctly enforced today.
- Decision on whether non-MATURE content should carry an explicit visual marker in outputs (beyond no-show).

Reopens once these are settled with Yves.

### 3.8 Change-sets workspace

A new sub-activity:

- `Elaborate/Change-sets` — full read/write
- `Explore/Change-sets` — read-only, for past coordinated edits as a navigation aid during consultation

#### List view (master)

One row per change set. Columns:

| Column | Notes |
|---|---|
| Title | Sortable |
| Status badge | OPEN / CLOSED |
| Classifier badge | NEW_CONTENT / IN_DEPTH_REWORK / CLARIFICATION / EDITORIAL |
| Opened | |
| Closed | Empty for OPEN sets |

Default sort: OPEN first, then CLOSED by recency.

Filter bar: Status · Classifier · Date range.
Search box: free-text over title + reason text.
Toolbar: **+ New change set**.

#### Detail view (right pane)

| Section | Content |
|---|---|
| Header | Title (editable while OPEN) · classifier badge · status badge · `createdBy`/`createdAt` · `closedBy`/`closedAt` |
| Reason | `reasonText` (editable while OPEN) |
| Comment references | Empty at P0 |
| Member table | One row per version under the set: Object · Type · Code · Version · Saved at · Author · Note |
| Actions | **Reopen** (if closed, permission-checked) · **Close** (if open) · **Delete** (if empty OPEN) |

Member rows are clickable, navigating to the object detail in full-page mode with a back-link to the change-set detail.

### 3.9 Active-set banner

The workspace shell displays a persistent banner indicating the user's active change set:

```
▌ Saving under: [Editorial pass before publication ▾] · clear
```

- The dropdown is a picker — clicking switches active set across all OPEN sets.
- **clear** deactivates the banner (no active set).
- Activation is per-user UI state in `localStorage`; no node-level state.

## 4. Layer impact

### 4.1 Storage

- New `ChangeSet` node type. `HAS_REASON` edge from every version node to exactly one `ChangeSet`.
- `VersionedItemStore._prepareInput` and the create/update/restore/decommission code paths gain `changeSetId` (required) and `note` (optional) parameters.
- Validate at write time: the `ChangeSet` exists and is `OPEN`. Create the `HAS_REASON` edge with `{ note }`. Save fails if `changeSetId` is missing or refers to a `CLOSED` set.
- New `ChangeSetStore` with CRUD, status transitions, and `findMembers(changeSetId)` — walks `ChangeSet ← HAS_REASON ← Version → Item` in a single Cypher query, projecting each member with the *summary projection of its own entity type* (driven by `getProjectionFields(entityType, 'summary')` from `shared/src/model/projections.js`) plus the per-edge `note`. Returns the *exact linked versions*, not the latest. A single object may appear multiple times if updated more than once within the set.

### 4.2 Service

- New `ChangeSetService` — CRUD, status transitions (open / close / reopen), validation, list/detail queries for the workspace, and `getMembers(changeSetId, userId)` returning the change set's members. No RBA restriction on read.
- `OperationalRequirementService`, `OperationalChangeService`, `ChapterService` — every method that creates a new version gains `changeSetId` and `note` parameters, forwarded to the store.

### 4.3 REST API

- `POST` / `PUT` endpoints on versioned items accept `changeSetId` (required) and `note` (optional) in the request body.
- New resource `/change-sets` with full CRUD, plus dedicated routes:
  - `POST /change-sets/{id}/close`
  - `POST /change-sets/{id}/reopen`
  - `GET /change-sets/{id}/members` — returns the change set's modified objects with their per-edge notes
- OpenAPI schemas updated: request bodies on versioned-item routes, new `ChangeSet` schema, new member schemas, new `/change-sets` paths.

**Member shape — reused from existing projections.**

A change-set member is *the entity's `summary` projection* plus the `note` from the `HAS_REASON` edge. No new entity-content schema is introduced — the projection model defined in `shared/src/model/projections.js` remains the single source of truth.

Members are heterogeneous (ONs, ORs, OCs, chapters all coexist in one set), so the response is polymorphic with a `itemType` discriminator:

```yaml
ChangeSetMember:
  oneOf:
    - $ref: '#/components/schemas/OperationalRequirementMember'
    - $ref: '#/components/schemas/OperationalChangeMember'
    - $ref: '#/components/schemas/ChapterMember'
  discriminator:
    propertyName: itemType
```

Each variant carries the entity's summary fields plus `itemType` and `note`. The client renders the common columns (code, title, version, saved at, author, note) and ignores the type-specific extras at P0.

**Important** — `findMembers` returns the *exact versions linked by `HAS_REASON`*, not the latest version of each item. The same object may have a more recent version outside this change set; the member row shows the version that this set produced.

Members are returned ordered by `savedAt` ascending. A given object may appear multiple times if updated more than once within the set — each occurrence is a distinct row with its own version and its own note. The UI renders them as flat rows at P0; grouping is a deferred refinement.

### 4.4 Web client

- `apiClient` methods for versioned items gain `changeSetId` / `note` parameters.
- New shared `SaveDialog` component used across O*s, chapters, narrative editors.
- New `ChangeSetActivity` (`Elaborate/Change-sets` and `Explore/Change-sets`).
- Workspace shell extension: persistent active-set banner; session state in `localStorage` (`activeChangeSetId`).

### 4.5 Import pipeline

- `DistributedEditionImporter` requires an explicit `changeSetId` parameter — same as any other write. No synthetic-set machinery.
- The integrator's workflow: create a change set (via CLI or workspace) titled e.g. *"Import: ODIP Edition 1"*, pass its id to the import command, close the set when the import completes.
- Same pattern applies to the Jira one-off import (OUT-02 at M4).

### 4.6 Publication

- Read-only — no impact on writes at P0.
- The publication pipeline may consume change-set metadata at P2 (DIF-04 evolutions lens). No work for the current scope.

### 4.7 CLI

- New `change-set` command group:
  - `change-set list [--status OPEN|CLOSED] [--classifier ...]`
  - `change-set show <id>`
  - `change-set members <id>` — lists the set's modified objects with their notes
  - `change-set create --title "..." --classifier ... --reason "..."`
  - `change-set close <id>`
  - `change-set reopen <id>`
  - `change-set delete <id>` — empty OPEN sets only
- Existing commands that create / update / restore / decommission versioned items gain a required `--change-set <id>` flag. No on-the-fly creation — `change-set create` is a separate call.
- Bulk operations (import) follow the same pattern: caller creates the change set, passes its id.

## 5. Open points

- **LCM-04 split and visibility convention** — parked pending Yves alignment. See §3.7.
- **Reopen permission scope** — proposed creator + integrators; to be reflected in the RBA-02 matrix.
- **Multi-transition history on change sets** — at P0, `closedBy` / `closedAt` is overwritten on reopen. If governance later requires the full timeline, this graduates to the deferred `AuditEvent` log.
- **First save on a brand-new object** — confirmed: same dialog as updates, "+ New change set" is the bootstrap path. No "initial creation" special treatment.

## 6. Implementation steps

*To be drafted.*

---

*See also: [main index](odip-implementation-plan.md) · HIST (tbd) · DIF (tbd) · DEL (tbd) · RBA (tbd)*