# LCM — Handoff Note (for a fresh chat)

Status of the Lifecycle & Change Management (LCM) feature, and what's left. Server tiers
(model → storage → service → import → routes → error-mapping), CLI tier, and web sub-steps
**(a) foundation** and **(c) O\* save threading** are DONE and documented in ADD ch.8 §26.
Two threads remain: the **`CS-#####` code introduction** (a full layer sweep) and the
**remaining web-client sub-steps**.

---

## 1. `CS-#####` code introduction (next, do first)

**Why.** The commit dialog currently uses a radio list of OPEN change sets — fine for a
handful, breaks past ~100. It must become a **typeahead**, which needs a short, stable,
human-readable handle. Change sets today have only an opaque `id` and a non-unique `title`.
So a **`code`** is a model-level addition, not just UI.

**Scheme (confirmed).** `CS-#####` — same mechanism as ON/OR/OC codes, but **no DRG segment**
(change sets have no domain) and **5-digit zero-pad** (e.g. `CS-00001`), matching ON/OR/OC width.

**Mechanism to mirror (from `02-Storage-Layer.md` / `VersionedItemStore`):**
- ON/OR/OC use `_generateCode(entityType, drg, tx)` → `{type}-{DRG}-{####}` and
  `_findMaxCodeNumber(entityType, drg, tx)` (highest existing for type+DRG, next = max+1, padded).
- **`ChangeSetStore` extends `BaseStore`, not `VersionedItemStore`** → it does **not** inherit
  those helpers. It needs its **own** generator: `CS-` + `(maxChangeSetNumber + 1)` zero-padded
  to 5, via a private `_findMaxChangeSetCodeNumber(tx)` that scans existing `ChangeSet.code`
  values (mirror `_findMaxCodeNumber`'s parsing/regex/"start at 1 when none" logic exactly).
- Add a **uniqueness constraint on `ChangeSet.code`** as the fail-fast backstop (declared
  wherever ON/OR/OC `code`/`externalId` constraints live — confirm `initializeDatabase()`/schema
  bootstrap location).

**Also confirmed:** bootstrap/import behaviour stays as-is; `ChangeSetStore.create` is the sole
creator of `ChangeSet` nodes, so code assignment lives only there.

**Full sweep (model → … → web data):**
1. `change-set-elements.js` (model) — `code` on `ChangeSet`, `ChangeSetCommitRead`
   (`{changeSetId, code, changeSetTitle, classifier, note}`), `ChangeSetMember`, summary.
2. `change-set-store.js` — generate `code` in `create`; add `_findMaxChangeSetCodeNumber(tx)`;
   add `reasonText` **and** `code` to the list / `findByStatus` / `findByClassifier` projections;
   declare the unique constraint.
3. `ChangeSetService.js` — id→ChangeSet cache and the commit read-shape carry `code`.
4. API — `code` on `ChangeSet` / `ChangeSetCommit` / `ChangeSetMember` in `openapi-base.yml`
   (+ `openapi-change-set.yml`); add `reasonText` to the list response.
5. CLI — `code` column in `change-set list` / `show` / `versions` (and the commit columns).
6. Web — **data only** (api-client already passes fields through). The dialog rework is separate.

**Files to re-upload for this pass** (edit against current source, not the output copies):
`change-set-elements.js`, `change-set-store.js`, `ChangeSetService.js`, plus **`versioned-item-store.js`**
(to copy `_generateCode` / `_findMaxCodeNumber` precisely), and confirm the schema-bootstrap file
for the constraint.

---

## 2. Remaining web-client changes

### 2a. Commit dialog: radio list → typeahead (do right after the code pass)
Replace the radio list in `components/change-set-commit-dialog.js` with a suggestion/typeahead:
- Option label = **`code — title`**; searchable on **code + title**.
- **Hover shows `reasonText`** via `title=` on each row (and on the header chip / history entries).
  Requires `reasonText` in the list response (item 4 above).
- Keep the create-inline and optional-note paths; keep the `{changeSetId, note}|null` contract so
  no caller changes. Isolated component change — reviewable on its own.

### 2b. Change Set workspace sub-activity (b)
Dedicated sub-activity: **Elaborate** (editable: create / edit title+reason / close / reopen /
delete-empty / view members) and **Explore** (read-only). Mirror the Manage→Editions pattern
(ADD §20 *Manage Activity — Editions*) and the Elaborate/Explore shell that registers sub-activities.
Uses the api-client methods already added (§26.2).

### 2c. Narrative redesign (d)
Narrative text + osHierarchy become explicit **Read → Edit → {Save | Cancel}** sessions
(read-only by default even in Elaborate; change set chosen on entry = session gate). Hierarchy
edits **buffered in memory, one PATCH on Save** (removes per-drag DnD writes + the 409 handler);
Cancel discards. **Mutual exclusion**: at most one `_editSession` open per chapter (narrative theme
OR hierarchy, never both) via the existing `_dirty`/`canDeactivate` guard. Thread the commit gate,
and **pass `app` into NarrativeActivity-created forms** (the "+ON/OR/OC" insert, ADD §18.8) — the
save gate reads `context.app`. Touches ChapterToc / ChapterBody / NarrativeActivity + ADD §18.

### 2d. History / reason surfacing (e)
History tab and `DiffPopup` (`components/diff-popup.js` — note flat path; ADD §14.2 already fixed)
show the `changeSetCommit` (id / code / title / classifier / note) per version. Add ADD coverage.

### ADD
Update ch.8 §26 as each remaining sub-step lands (and add the typeahead detail to §26.3).

---

## Working-style reminders
Confirmation-gated, brief/conceptual by default, layer-by-layer (user uploads files per layer →
surgical `str_replace` → `present_files`). Fail-fast, no defensive programming. Surgical changes,
no unrequested bundling. **All components are flat under `components/`** (no `components/odp/`).
Outputs under `/mnt/user-data/outputs/`: server at root, CLI at `cli/`, web at `web/`.
Never bash/view `/mnt/project/` — use `project_knowledge_search`; uploads at `/mnt/user-data/uploads/`.