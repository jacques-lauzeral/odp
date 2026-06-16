# LCM — Handoff Note (for a fresh chat)

Status of the Lifecycle & Change Management (LCM) web-client work. Server tiers
(model → storage → service → import → routes → error-mapping), CLI tier, the
**`CS-#####` code introduction** (full layer sweep), and web sub-steps **2a** (commit
dialog typeahead) and **2b** (Change Set workspace sub-activity) are **DONE and documented**.
Remaining: **2c** (narrative edit sessions) and **2d** (history/diff commit surfacing),
plus a small parked server pass and a styling-cleanup pass (both scoped below).

All outputs land under `/mnt/user-data/outputs/`: web at `web/`. Working style unchanged:
confirmation-gated, brief/conceptual by default, layer-by-layer, surgical `str_replace`,
`present_files`, fail-fast / no defensive programming, no unrequested bundling. Components
flat under `components/`. Never bash/view `/mnt/project/` — use `project_knowledge_search`;
uploads at `/mnt/user-data/uploads/`. `node --check` every JS file before presenting.

---

## DONE this stream

### 2a — Commit dialog: radio list → typeahead
- `components/change-set-commit-dialog.js`: existing-set picker is now a `ReferenceManager`
  (flat-options mode). Label `code — title` (degrades to `title`), filter matches code+title,
  `reasonText` as per-row hover tooltip. `initialValue` = active default; `onChange` →
  `_selectedId` → confirm gating. Picker mounted into `[data-role="picker-host"]`, `destroy()`d
  on create-toggle and on finish. Create-inline + note paths and the `{changeSetId,note}|null`
  contract unchanged. Orphaned local `esc()` removed.
- `components/reference-manager.js`: added optional per-node `title` → rendered as `title=` on
  the label button and the edit-mode chip; `_flatToNodes` passes `title` through. Backward-compatible.
- ADD §7.4 (node shape + usage list), §7.9, §13.3.

### 2b — Change Set workspace sub-activity (shared Elaborate/Explore)
- `activities/workspace/shared/change-sets/change-sets.js`: mirrors `EditionsActivity` —
  `.os-toolbar` (status filter left, `+ Change Set` right) + `MasterDetail` (0.30), card list,
  `.os-detail` panel. Read-only derived from `app.getDatasetContext()?.type === 'edition'`
  (Explore drops create + all lifecycle actions). Status filter chips **All/Open/Closed**
  filter client-side from one `listChangeSets()` load (no refetch). Deep-link `[itemId]`
  select-after-load. Single `entitySaved` document listener registered in `_ensureForm`,
  removed in `cleanup()`.
    - **Lifecycle (Elaborate, status-gated detail-toolbar buttons, never a status field):**
      OPEN → Edit / Close / Delete (Delete enabled only after Changes load AND raw member
      count == 0); CLOSED → Reopen. Close/Reopen/Delete via `odipConfirm`; server 409s surfaced
      inline in the detail body.
    - **Changes section** (was "Members"): `getChangeSetMembers(id)`, **de-duped by `itemId`**
      (keep highest version = current state under the set), rendered **flat**, ordered
      **Chapter → ON → OR → OC** then by code/title. Each row: coloured **type badge** + object
      name as a **context-aware deep link** (`/{base}/os/{on|or|oc}/{itemId}`, chapters
      `/{base}/narrative/{itemId}`, `{base}` = `/elaborate` or `/explore/{editionId}`; relies on
      the router's global anchor handler) + `vN` + note. **Chapter rows show title only**
      (no code); O* rows show `code title`. Stale-await guard drops results if selection changed.
- `activities/workspace/shared/change-sets/change-set-form.js`: `extends CollectionEntityForm`.
  **Single section** (title, reasonText, classifier) — no tab to click. classifier is
  `required:true` + `editableOnlyOnCreate:true` (mandatory editable select in create with `*`,
  read-only value in edit). `onSave`: create → `createChangeSet({title,classifier,reasonText?})`;
  edit → `updateChangeSet(id,{title,reasonText})`. Overrides `requiresChangeSet()` → `false`.
- `activities/workspace/elaborate/elaborate.js` + `.../explore/explore.js`: `change-sets`
  added to `SUB_ACTIVITIES` + `TABS` (after Setup). No `router.js` change.
- `styles/activities/workspace/shared/change-sets/change-sets.css`: mirrors `editions.css`
  (cards/detail `dl`), reuses setup active-tab treatment for status chips, **local copy of the
  os.css ON/OR/OC type-badge palette** (`.type-badge--on/or/oc`, chapter+other → neutral),
  reuses `.odip-link` for object links. New file.
- `index.html`: `<link>` added in the activities layer after `setup.css`.
- ADD §3.3 (tab table + routing note), structure tree, §8.9 (new), §10.1 (CSS tree),
  Converse renumbered §8.10.

### Base-class changes (backward-compatible, made during 2b)
`components/collection-entity-form.js`:
- **`requiresChangeSet()`** (default `true`) — `handleSave()` now runs the LCM commit gate only
  when this returns true. O* forms unchanged. `ChangeSetForm` and `ODPEditionForm` override → `false`
  (both are non-versioned; the gate previously fired with no `context.app` → would throw).
- **`editableOnlyOnCreate` completed** — `validateForm`/`collectFormData` now skip such fields
  when `mode !== 'create'` (they render read-only in edit). With `renderField` already honouring
  the flag, a field can be `required:true` + `editableOnlyOnCreate:true` and behave correctly.
- ADD §6.5 documents both. `activities/manage/editions/odp-edition-form.js` gained the
  `requiresChangeSet()` override.

**⚠️ One open verification (carry forward):** edit 3 (`editableOnlyOnCreate` skip-guards) is
backward-compatible *only if no existing form already sets `editableOnlyOnCreate`*. Confirmed only
in the files seen (`collection-entity-form.js`, `odp-edition-form.js`, change-set form). **Grep
`requirement-form-fields.js` / `change-form-fields.js` (and any other form configs) for
`editableOnlyOnCreate`** to confirm. Also worth a quick manual check that **edition create** still
works (it was hitting the commit gate with no `app` before the override — either silently broken or
tolerated; the override is correct now either way).

---

## NEXT — remaining web sub-steps

### 2c — Narrative redesign (do next)
Narrative text + osHierarchy become explicit **Read → Edit → {Save | Cancel}** sessions
(read-only by default even in Elaborate; change set chosen on entry = session gate). Hierarchy
edits **buffered in memory, one PATCH on Save** (removes per-drag DnD writes + the 409 handler);
Cancel discards. **Mutual exclusion**: at most one `_editSession` open per chapter (narrative theme
OR hierarchy, never both) via the existing `_dirty`/`canDeactivate` guard. Thread the commit gate,
and **pass `app` into NarrativeActivity-created forms** (the "+ON/OR/OC" insert) so the save gate
reads `context.app`. Touches ChapterToc / ChapterBody / NarrativeActivity + ADD §8.3 / §18.
Files to request: `narrative.js`, `chapter-toc.js`, `chapter-body.js` (+ ADD §8.3 region).

### 2d — History / reason surfacing
History tab and `DiffPopup` (`components/diff-popup.js`) show the `changeSetCommit`
(id / code / title / classifier / note) per version. Note `ChangeSetCommit` now hydrates `code`
too (openapi-base). Add ADD coverage (§7.7 / history-tab).

---

## PARKED (server + refactor passes — do as dedicated chats)

### P1 — Change-set server pass (one pass, two features)
1. **Edition-scoped change-set list** for Explore. Today Explore lists *all* sets via
   `listChangeSets()` (deliberate placeholder, flagged in ADD §8.9). Add a query walking
   `(Edition)-[:EXPOSES]->(Baseline)-[:HAS_ITEMS {editions}]->(version)-[:HAS_REASON]->(ChangeSet)`,
   `$editionId IN r.editions`, dedup. **Decide chapter inclusion** (chapters aren't edition-marked
   per §7.3 — O*-only vs union all baseline chapter versions). Contract choice:
   `GET /change-sets?edition=<id>` vs `/odp-editions/{id}/change-sets`. Response = full `ChangeSet[]`
   so the web Explore list reuses the exact rendering. Layers: store → service → route →
   openapi → api-client. Then a small web tweak swaps the Explore data source.
2. **`findMembers` projection: add `action` + `domain`.** The Changes list wants authoritative
   **Create/Update/Delete** per change (today only inferable from `version`; delete is a real gap —
   settle delete/decommission semantics) and **domain** (O* only; null for chapters). Both are
   `findMembers` projection fields (store → API → openapi → api-client), then a web tweak surfaces
   action + domain grouping/column in the Changes list.

### P2 — Styling cleanup (extract to components layer)
Per §10.2 (global → components → activities; no activity→activity refs), hoist cross-activity
patterns out of activity CSS into the **components layer**:
- **Type-badge palette** → `components/type-badge.css` with neutral names (`.type-badge--on/or/oc`,
    + a real **chapter colour decision** — currently neutral). Repoint os.css and change-sets.css.
- **Card-list + detail-`dl`** idiom (duplicated across editions.css and change-sets.css) → a shared
  component stylesheet; adopt in `editions.js` markup too.
- Update ADD §10 tree + `index.html`.
- Minor: a single `.tab-header` still renders for one-section forms (pre-active, nothing to click);
  optionally hide `.tab-headers` when it holds a single tab (shared form-component CSS).

---

## Working-style reminders
Confirmation-gated, brief/conceptual by default, layer-by-layer (user uploads files per layer →
surgical `str_replace` → `present_files`). Fail-fast, no defensive programming. Surgical changes,
no unrequested bundling. All components flat under `components/` (no `components/odp/`). CSS lives in
`src/styles/...` (NOT colocated with JS) and must be `<link>`ed in `index.html`. Never bash/view
`/mnt/project/` — use `project_knowledge_search`; uploads at `/mnt/user-data/uploads/`.