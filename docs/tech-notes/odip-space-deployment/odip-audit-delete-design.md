# ODIP Implementation Plan — Audit & Deletion (Design)

*Technical solution description*

*v0.1 — 16 June 2026 — DRAFT for discussion*

## 1. Scope

This note describes a foundational revision to the versioning and audit model, introduced because the deletion topic (DEL) made an unavoidable need concrete: a single, queryable audit surface.

It covers two intertwined concerns:

- **A central audit log** — `AuditEvent` as the sole authoritative record of every consequential write, replacing the audit information currently scattered across item nodes, version nodes and `HAS_REASON` edges. This is the implementation backbone of **LCM-03** (audit trail), brought forward from the deferred position in the LCM note (§3.6).
- **Deletion** — soft delete, recycle bin, hard delete, the published-edition wall and referential integrity, built on that foundation.

Requirements addressed:

- **DEL-01** — Referential integrity on deletion *[P0]*
- **DEL-02** — Published-edition wall *[P0]*
- **DEL-03** — Recycle bin (soft delete) *[P1]*
- **DEL-04** — Hard delete *[P1]*
- **DEL-05** — Edition deletion *[P1]*
- **DEL-06** — Decommissioning *[P0 — **parked**, see §9]*
- **LCM-03** — Audit trail *[P0 — realised here]*

The **History view** is also revisited here. Its full redesign was deferred under LCM until deletion support arrived; that moment is now, and the new audit timeline *is* the revisit.

Out of scope: data migration of the existing Edition 1 dataset (handled by re-import, §8), single-version rollback (DEL-03 position (b) — versions remain strictly immutable, §9), and decommissioning (§9).

## 2. Current state

- `VersionedItemStore` manages append-only version history for O*s (ON/OR/OC) and chapters via the dual-node pattern: an `Item` node (stable identity) and `ItemVersion` nodes (content), with `LATEST_VERSION` / `VERSION_OF` relationships.
- **Audit information is dispersed.** `createdAt` / `createdBy` live on both item and version nodes; the reason for change lives on the `ChangeSet` node and the `HAS_REASON` edge (version → ChangeSet). Reconstructing a chronological audit trail across action types requires unioning heterogeneous node types with different traversal patterns per entity — the difficulty that motivated this revision.
- **No deletion of any kind.** `BaseStore.delete()` is unguarded; there is no soft delete, no recycle bin, no referential-integrity check, no published-edition wall.
- `Baseline` and `Edition` nodes are immutable — `delete()` throws `StoreError` on both stores.
- Published-edition membership is already tracked: `HAS_ITEMS.editions` is an array property on the baseline's `HAS_ITEMS` edge, listing the edition IDs that expose each captured version.

## 3. Proposed solution

### 3.1 AuditEvent — the sole audit surface

A first-class `AuditEvent` node records every consequential write. It is the single authoritative audit record; no audit information is duplicated on item or version nodes.

**`AuditEvent` node:**

| Field | Type | Notes |
|---|---|---|
| `action` | enum | `CREATE` / `UPDATE` / `DELETE` / `RESTORE` / `HARD_DELETE` / `CLOSE` / `REOPEN` / `PUBLISH` / `BASELINE` / `DECOMMISSION` (reserved, §9) |
| `actorId` | string | Stable logical actor key (§3.7) — mirrors the write transaction's `userId` |
| `timestamp` | datetime | |
| `targetType` | enum | `ON` / `OR` / `OC` / `CHAPTER` / `CHANGESET` / `EDITION` / `BASELINE` / `WAVE` |
| `targetVersion` | integer | Nullable — the version number for version-producing actions; null otherwise |
| `note` | text | Nullable — the per-object annotation formerly carried on the `HAS_REASON` edge |

**Relationships:**

```
(AuditEvent)-[:TARGETS]->(item)              # always present
(AuditEvent)-[:UNDER_CHANGESET]->(ChangeSet) # nullable — only for change-set-bound writes
```

`TARGETS` points to the **item node** (stable identity), never to a version node, because deletion and restore operate at item level. The version number, where relevant, is the `targetVersion` scalar on the event. The polymorphic target is natural in Neo4j — no label constraint on the far end of `TARGETS`.

`UNDER_CHANGESET` is a relationship rather than a property so the ChangeSet detail view can traverse it directly, and so `findMembers` reduces to a single hop (§3.6).

### 3.2 Write discipline

`AuditEvent` is written **within the same transaction** as the operation it records, through a single `AuditEventStore.log(...)` call. The event never exists without its cause, and the cause never commits without its event — atomicity is the integrity guarantee that lets us trust the log as authoritative.

Every consequential write path gains one `log(...)` call: create, update, restore, delete, hard delete on versioned items; close, reopen on change sets; publish, baseline, edition delete on management entities.

### 3.3 ItemVersion becomes a pure content carrier

With audit information centralised, the version node sheds its audit role:

- **Item node** — `status` (`ACTIVE` / `DELETED`) is the only lifecycle field retained. `createdAt` / `createdBy` are **removed**.
- **ItemVersion node** — `version` (sequence number) plus content fields only. `createdAt` / `createdBy` are **removed**. The version node is now purely *what the content was*; *who/when/why* is the AuditEvent.
- **`HAS_REASON` edge** — **removed**. Replaced by `AuditEvent -[:UNDER_CHANGESET]-> ChangeSet`. The per-object `note` moves onto the event.

### 3.4 Soft delete (DEL-03)

Soft delete operates at item level and produces no tombstone version — the `AuditEvent` with `action: DELETE` *is* the deletion record. The operation is:

1. Remove the `LATEST_VERSION` relationship (not move it). This severs the item from the live dataset at the graph level — every query that walks `LATEST_VERSION` to build the live dataset (`findAll`, baseline capture, edition selection) excludes the item automatically, with no per-query `status` filter.
2. Set `item.status = 'DELETED'`.
3. Write an `AuditEvent { action: DELETE, actorId, timestamp, note }` linked to the active ChangeSet via `UNDER_CHANGESET`.

Version nodes are untouched; `VERSION_OF` back-references and `HAS_ITEMS.editions` membership are fully preserved, so history and past-edition visibility survive deletion intact.

**Recycle bin** — the bin view is the trivial query `MATCH (item {status: 'DELETED'})`, with one hop to the most recent `DELETE` event for who/when/why. Bin contents are visible to all active users of the domain; there is no automatic purge (DEL-03).

### 3.5 Restore

Restore re-attaches the item to the live dataset:

1. Create a new `ItemVersion` (next sequence number) carrying the content of the most recent version.
2. Re-point `LATEST_VERSION` to it.
3. Set `item.status = 'ACTIVE'`.
4. Write an `AuditEvent { action: RESTORE }` linked to the active ChangeSet.

Restore is available to the deleter and to any integrator (DEL-03). The `DELETE` event remains in the log permanently — the timeline shows delete then restore as two events, the honest record.

### 3.6 Querying — History view and change-set members

Both the History view and change-set membership now read from the audit log.

**History view (LCM revisit).** A unified chronological timeline for an item — one query, all action types:

```cypher
MATCH (e:AuditEvent)-[:TARGETS]->(item)
WHERE id(item) = $itemId
RETURN e ORDER BY e.timestamp
```

The History view is consulted on explicit user demand, so the join from event to version content (on `targetVersion`) is incurred only when the view is opened — no cost on the common read paths. This consolidates the deferred LCM History redesign into the deletion work.

**Change-set members.** `findMembers` simplifies from the current triple-hop (`ChangeSet ← HAS_REASON ← version → item`) to a single hop through the event log:

```cypher
MATCH (cs)<-[:UNDER_CHANGESET]-(e:AuditEvent)-[:TARGETS]->(item)
WHERE id(cs) = $changeSetId
RETURN e.targetType, e.targetVersion, e.note, item
ORDER BY e.timestamp
```

### 3.7 actorId and future IAM remapping

`actorId` stores the raw interim identifier today (the professional email of RBA-04's whitelist). The model treats it as a **stable logical actor key**, not a display string: the P2 platform-IAM integration (RBA-04, "account mapping preserved") will remap the identifier behind the key without rewriting history. The remapping layer is not built now — this is a design constraint that keeps the door open, not an implementation in this scope.

## 4. Referential integrity (DEL-01)

No object (O*, theme/chapter, narrative, wave) is deletable while other **live** objects reference it. The check runs before any soft delete and gathers **all** blocking dependencies, not just the first, so the unblock path is actionable in one pass.

Inbound references that block, per the relationship model:

| Target | Blocking inbound references |
|---|---|
| ON | ORs that `IMPLEMENTS` it; child ONs that `REFINES` it |
| OR | OCs that `IMPLEMENTS` or `DECOMMISSIONS` it; ORs that `DEPENDS_ON` it; child ORs that `REFINES` it |
| OC | OCs that `DEPENDS_ON` it; milestone `TARGETS` to a wave do not block the OC, but… |
| Wave | OCs with milestones that `TARGETS` it |

Only references from **live** items count (those still holding a `LATEST_VERSION`). A reference from an already-deleted item does not block — its `LATEST_VERSION` is gone, so it is not part of the live graph. This falls out naturally from the `LATEST_VERSION` removal in §3.4 and needs no special handling.

The blocking-dependency list is returned to the caller as a structured collection (each entry: id, type, code, title) so the API and UI can present the full list.

## 5. Published-edition wall (DEL-02)

An object that has appeared in **any published edition** is never deletable in any form; decommissioning is its only retirement path (decommission parked, §9). Objects included only in internal baselines remain deletable, subject to §4.

The check reads the existing `HAS_ITEMS.editions` membership: an item is "published" if any of its versions is captured by a baseline whose `HAS_ITEMS` edge carries a non-empty `editions` array for that version.

```cypher
MATCH (item)<-[:VERSION_OF]-(v:ItemVersion)<-[h:HAS_ITEMS]-(:Baseline)
WHERE id(item) = $itemId AND size(h.editions) > 0
RETURN count(h) > 0 AS isPublished
```

The wall is enforced at the **service** layer before both soft delete and hard delete. (Hard delete additionally requires the item to have *never* been published, which this same check establishes.)

## 6. Hard delete (DEL-04)

Hard delete is the exceptional, permanent path:

- **Integrator-only**, executed **from the recycle bin only** (the item must already be `status = DELETED`), and only for items that **never appeared in a published edition** (§5).
- Destroys the item node, all its version nodes, and all their relationships, in one transaction.
- Requires a **mandatory reason**, carried through the same ChangeSet machinery as any other write.
- Writes an `AuditEvent { action: HARD_DELETE }`. The event **outlives the item it targeted** — its `TARGETS` relationship is deleted with the item, but the event retains `targetType` and the (now dangling) identity for the record. The audit log is therefore the only surviving trace, which is the point.

## 7. Edition deletion (DEL-05)

Editions are top-level objects with no inbound references, so there is no referential-integrity check and the mechanics are simpler than for items.

- **Soft delete** — `edition.status = 'DELETED'` plus an `AuditEvent`. Editions have no `LATEST_VERSION`, so the live/deleted distinction is the `status` field alone; the edition list query filters `status = 'ACTIVE'`. Integrator-only.
- **Hard delete** — removes the edition node and its `EXPOSES` edge to the baseline. The **baseline is not removed** (it may be shared or independently meaningful). Integrator-only, from the bin only.

This requires lifting the unconditional `delete()`-throws guard on `ODPEditionStore` and replacing it with the status-flip / node-removal logic above. The immutability of *edition content* is unaffected — only the lifecycle status is mutable.

## 8. Migration / bootstrap

Migration of the existing Edition 1 dataset is **out of scope**. The dataset is refreshed by re-importing Edition 1, which produces the new node shape natively (no stamps on items/versions, no `HAS_REASON` edges, `AuditEvent` nodes written by the import path like any other write). Re-import may be run as many times as needed during development.

The import pipeline therefore gains the same `AuditEvent` write discipline as every other write path: each imported create/update is logged under the import's ChangeSet (per the LCM note's import pattern).

## 9. Open points and parked items

- **Decommissioning (DEL-06)** — parked. The `DECOMMISSION` action is **reserved** in the AuditEvent action set so the log shape does not change when it lands, but the lifecycle status, the integrity sequencing ("an ON only once its ORs are decommissioned") and the OC `DECOMMISSIONS` relationship's relationship to item lifecycle are deliberately left for a later note. Decommission is orthogonal to the OC planning-layer `DECOMMISSIONS` relationship and must not be coupled to it.
- **Single-version rollback (DEL-03 (a) vs (b))** — settled on **(b)**: versions are strictly immutable. There is no `DELETE_VERSION` action and no version bin transit; deletion operates only at item level. This holds at least until edition patching forces the question.
- **`actorId` remapping layer** — model-ready (§3.7); implementation deferred to P2 IAM integration.
- **AuditEvent retention / volume** — at P0 the log grows unbounded. No purge policy is defined; revisit if volume becomes a concern (it is bounded by write activity, which is modest).

---

*See also: [main index](odip-implementation-plan.md) · [LCM note](odip-implmentation-plan-lcm.md) (audit §3.6 superseded here) · [implementation plan](odip-audit-deletion-plan.md)*