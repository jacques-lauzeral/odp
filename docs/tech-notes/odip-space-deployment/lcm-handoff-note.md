# LCM — Handoff Note

Status of the Lifecycle & Change Management (LCM) work. Server tiers, CLI tier, the
`CS-#####` code introduction, and the full web work — commit dialog (2a), Change Set
workspace (2b), and **narrative/hierarchy edit sessions (2c)** — are **DONE and documented**
(ADD Chapter 08 updated, steady-state).

Outputs under `/mnt/user-data/outputs/`. Working style unchanged: confirmation-gated,
brief/conceptual by default, layer-by-layer, surgical `str_replace`, `present_files`,
fail-fast / no defensive programming. Never bash/view `/mnt/project/` — use
`project_knowledge_search`; uploads at `/mnt/user-data/uploads/`. `node --check` every JS
file before presenting.

---

## DONE — 2c (narrative edit sessions)

- **Read-first model**: chapter/topic narrative render read-only in Elaborate with an
  **Edit** button; Edit → Save/Cancel session. Cancel discards immediately (no dialog).
- **Edit-session mutual exclusion**: `NarrativeActivity._editSession` (`null` |
  `'narrative'` | `'hierarchy'`); body and TOC lock each other via paired callbacks.
- **Buffered structure session**: DnD drops buffer in `_pendingHierarchy`; one Save = one
  PATCH = one commit prompt (Save/Cancel strip atop the TOC). 409 → discard stale buffer.
- **Commit gate on ALL chapter writes** via `NarrativeActivity._commitFor()` — narrative,
  topic, +Theme, +O* placement, delete-theme, structure. Every chapter write lives in the
  activity; `ChapterBody` only collects input and delegates (fixed the chapter-narrative
  save that bypassed the gate).
- **Nav guards** cover both sessions: `canDeactivate` → `_guardAllSessions`; `_climbToOdip`
  and `beforeunload` extended.
- Files: `narrative.js`, `chapter-toc.js`, `chapter-body.js`, `narrative.css`
  (session-strip), `08-Web-Client.md`.
- Dialog/label polish: commit dialog title "Select change set"; "+ New change set";
  `ReferenceManager` re-pick button "Change" → "Select" (global).

---

## NEXT — per general plan, in order

1. **DEL — Deletion / recycle bin / decommissioning** (full note still *tbd*). Three
   mechanisms with a clear wall: published → decommission only; internal-baseline →
   soft-delete or hard-delete (integrator only); referential integrity blocks deletion with
   the full dependency list. **Design decisions to settle first**: soft-delete
   representation (status vs lifecycle state vs recycle-bin edge; does it produce a
   change-set-committed version?); decommission vs delete semantics; dependency check
   (reuse vs new `findDependents`; advisory vs blocking); recycle bin P0 scope.
2. **HIST** — version history view surfacing change-set link / code / classifier / note.
3. **DIF** — DiffPopup surfacing commit metadata per version (`diff-popup.js`).

HIST/DIF (the former "2d") are deliberately **after DEL** so they surface decommission /
soft-delete operations too, rather than being retrofitted.

---

## PARKED (server + refactor — dedicated chats)

- **P1 — change-set server pass**: (1) edition-scoped change-set list for Explore (today
  lists *all* sets — placeholder; needs the `EXPOSES→HAS_ITEMS→HAS_REASON` query, chapter
  inclusion to settle); (2) `findMembers` projection gains `action` (Create/Update/Delete —
  delete semantics to settle) + `domain`.
- **P2 — styling cleanup**: hoist type-badge palette + card-list/detail-`dl` idiom to the
  components layer; hide single-tab `.tab-header`.

## Open verifications (carry forward)
- Grep form configs for other `editableOnlyOnCreate` usage.
- Manual check that edition-create still works through its `requiresChangeSet()` override.