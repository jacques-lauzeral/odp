# ODIP Implementation Plan — Audit & Deletion (Design)

*Technical solution description*

*v1.1 — 17 June 2026*

## 1. Scope

This note describes a foundational revision to the versioning and audit model, introduced because the deletion topic (DEL) made an unavoidable need concrete: a single, queryable audit surface.

It covers three intertwined concerns:

- **A central audit log** — `AuditEvent` as the sole authoritative record of every consequential write, replacing the audit information currently scattered across item nodes, version nodes and `HAS_REASON` edges. This is the implementation backbone of **LCM-03** (audit trail), brought forward from the deferred position in the LCM note.
- **O* lifecycle** — a structural edge-based model expressing the full operational lifecycle of an O* (active, released, decommissioned, deleted), foundational to all deletion and post-publication operations.
- **Deletion** — soft delete, recycle bin, the published-edition wall and referential integrity, built on those foundations.

**Foundation vs solution.** Two things must be read separately throughout this note:

- The **lifecycle foundation** (§3.2) is **complete and definitive**. It defines all four lifecycle edges, all valid states, and all valid transitions — including the released and decommissioned transitions that no operation implements yet. It is the design principle; it is not expected to change.
- The **solution proposal** (§4) is **deliberately partial**. It implements the create / soft-delete / restore cluster of transitions plus the referential-integrity guard. The released and decommissioned transitions are *fully designed but not implemented* — the operations that drive them (release, decommission) lack UX and implementation. Hard delete and edition deletion are also deferred. The solution will be **refined later to reach full coverage**, building on the unchanged foundation.

**Requirement coverage.** Each requirement is assessed on two axes: whether the lifecycle foundation expresses it (design coverage), and whether the solution proposal implements it now.

| Req | Priority | Foundation | Solution proposal |
|---|---|---|---|
| **DEL-01** — Referential integrity | P0 | n/a (a service-layer guard) | ✅ implemented (§5.1) |
| **DEL-02** — Published-edition wall | P0 | ✅ `RELEASED_VERSION` edge gates it (§3.2) | ✅ implemented (§5.2) |
| **DEL-03** — Recycle bin (soft delete + restore) | P1 | ✅ defines `DELETED_VERSION` edge + transitions | ✅ implemented (§5.3) |
| **DEL-04** — Hard delete | P1 | ✅ permanent removal from Deleted state | ⚠ deferred (§5.4) |
| **DEL-05** — Edition deletion | P1 | n/a (separate edition lifecycle) | ⚠ deferred (§5.5) |
| **DEL-06** — Release & decommission | P0 \* | ✅ full design coverage — `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` edges + transitions | ⚠ UX & implementation not ready (§5.6) |
| **LCM-03** — Audit trail | P0 | — | ✅ realised here (§3.1) |

\* **DEL-06 is design-complete but not buildable yet.** Its priority is P0, but it is not "parked/undesigned": the lifecycle foundation (§3.2) fully defines its edges, states, and transitions. What is missing is the *operational UX and implementation* of the release and decommission operations. Closing DEL-06 is therefore a solution refinement, not a foundation change.

The **History view** is also revisited here. Its full redesign was deferred under LCM until deletion support arrived; that moment is now. The revisit is realised as a *client view over the audit query interface* (`GET /audit-events?targetId=`), not a bespoke server endpoint — see §3.1.

Out of scope: data migration of the existing Edition 1 dataset (handled by re-import, §5), single-version rollback (DEL-03 position (b) — versions remain strictly immutable, §6), and the release / decommission operations (§5.6, §7).

## 2. Current state

- `VersionedItemStore` manages append-only version history for O*s (ON/OR/OC) and chapters via the dual-node pattern: an `Item` node (stable identity) and `ItemVersion` nodes (content), with `LATEST_VERSION` / `VERSION_OF` relationships.
- **Audit information is dispersed.** `createdAt` / `createdBy` live on both item and version nodes; the reason for change lives on the `ChangeSet` node and the `HAS_REASON` edge (version → ChangeSet). Reconstructing a chronological audit trail across action types requires unioning heterogeneous node types with different traversal patterns per entity — the difficulty that motivated this revision.
- **No deletion of any kind.** `BaseStore.delete()` is unguarded; there is no soft delete, no recycle bin, no referential-integrity check, no published-edition wall.
- `Baseline` and `Edition` nodes are immutable — `delete()` throws `StoreError` on both stores.
- Published-edition membership is already tracked: `HAS_ITEMS.editions` is an array property on the baseline's `HAS_ITEMS` edge, listing the edition IDs that expose each captured version.

## 3. Foundations

### 3.1 AuditEvent — the sole audit surface

A first-class `AuditEvent` node records every consequential write. It is the single authoritative audit record; no audit information is duplicated on item or version nodes. Every field is **captured at write time and frozen** — nothing is resolved on read, so an item's timeline renders with no join, and a `HARD_DELETE` event survives its target.

**`AuditEvent` node:**

| Field | Type | Notes |
|---|---|---|
| `action` | enum | `AuditAction` — `CREATE` / `UPDATE` / `DELETE` / `RESTORE` / `HARD_DELETE` / `CLOSE` / `REOPEN` / `PUBLISH` / `BASELINE` / `RELEASE` (reserved, §5.6) / `DECOMMISSION` (reserved, §5.6) |
| `userId` | string | Stable logical actor key (§3.1.5) — mirrors the transaction's `userId` |
| `userRole` | enum | `UserRole` (`DOMAIN_WRITER` / `ICDM` / `INTEGRATOR`) — role at action time, frozen |
| `timestamp` | datetime | |
| `targetId` | string | Stable item identity; persisted as scalar so it survives hard delete |
| `targetType` | enum | `AuditTargetType` — `ON` / `OR` / `OC` / `CHAPTER` / `CHANGESET` / `EDITION` / `BASELINE` / `WAVE` |
| `targetCode` | string | Nullable — item code; null for code-less chapters |
| `targetTitle` | string | Title at action time, frozen |
| `targetVersion` | integer | Nullable — version number for version-producing actions; null otherwise |
| `changeSetCode` | string | Nullable — `CS-#####` handle; null when not change-set-bound |
| `changeSetTitle` | string | Nullable — set title at commit time, frozen |
| `classifier` | enum | Nullable — `ChangeSetClassifier` at commit time, frozen |
| `note` | text | Nullable — per-object annotation formerly on the `HAS_REASON` edge |

**Relationships:**

```
(AuditEvent)-[:TARGETS]->(item)              # always present
(AuditEvent)-[:UNDER_CHANGESET]->(ChangeSet) # nullable — only for change-set-bound writes
```

`TARGETS` points to the **item node** (stable identity), never to a version node, because deletion and restore operate at item level. The version number, where relevant, is the `targetVersion` scalar on the event. The polymorphic target is natural in Neo4j — no label constraint on the far end of `TARGETS`.

`UNDER_CHANGESET` is a relationship rather than a property so the ChangeSet detail view can traverse it directly, and so `findMembers` reduces to a single hop (§3.1.4).

#### 3.1.1 Write discipline

`AuditEvent` is written **within the same transaction** as the operation it records, through a single `AuditEventStore.log(...)` call. The event never exists without its cause, and the cause never commits without its event — atomicity is the integrity guarantee that lets us trust the log as authoritative.

Every consequential write path carries one `log(...)` call: create, update, restore, delete, hard delete on versioned items; close, reopen on change sets; publish, baseline, edition delete on management entities.

`userId` and `userRole` are read from the transaction, which carries `user {id, role}` threaded from the route layer (`x-user-id` / `x-user-role` headers).

#### 3.1.2 ItemVersion becomes a pure content carrier

With audit information centralised on `AuditEvent` and lifecycle expressed through structural edges (§3.2), both item and version nodes shed their former audit and lifecycle roles:

- **Item node** — no audit fields (`createdAt` / `createdBy` removed); no stored lifecycle status. Lifecycle is expressed entirely by the edges defined in §3.2.
- **ItemVersion node** — `version` (sequence number) plus content fields only. `createdAt` / `createdBy` are removed. The version node is now purely *what the content was*; *who / when / why* is the AuditEvent.
- **`HAS_REASON` edge** — removed. Replaced by `AuditEvent -[:UNDER_CHANGESET]-> ChangeSet`. The per-object `note` moves onto the event.

#### 3.1.3 The single audit query surface

All audit reads go through one store method, `AuditEventStore.findAll(filters, tx)`, where `filters = {changeSetId?, targetId?, userId?}` — all optional, AND-combined; an empty filter returns the whole log. The service mirrors this with the single `AuditEventService.getAuditEvents(filters, user)`, and the REST layer exposes the single resource `GET /audit-events?changeSetId=&targetId=&userId=`. One row shape serves every consumer.

The query starts from the `UNDER_CHANGESET` hop when `changeSetId` is supplied, otherwise a plain `TARGETS` scan; an `OPTIONAL MATCH` recovers `versionId` from `targetId` + `targetVersion` in the **same** statement (no N+1, null for non-version-producing events):

```cypher
// changeSetId given → start from the change set; otherwise MATCH (e)-[:TARGETS]->(item)
MATCH (cs:ChangeSet)<-[:UNDER_CHANGESET]-(e:AuditEvent)-[:TARGETS]->(item)
WHERE id(cs) = $changeSetId            // + optional id(item) = $targetId, e.userId = $userId
OPTIONAL MATCH (item)<-[:VERSION_OF]-(v) WHERE v.version = e.targetVersion
RETURN e, id(e), id(item), id(v)
ORDER BY e.timestamp
```

#### 3.1.4 Consumers of the audit query

**History is a client concern.** There is **no** item-scoped `/{item}/{id}/history` endpoint and no `getItemHistory` service method. The client builds an item's unified chronological timeline by calling `GET /audit-events?targetId=<id>` and rendering the returned rows. This is the LCM History revisit, realised as a client view over the audit interface rather than a bespoke server endpoint.

**Change-set members.** `ChangeSetStore.findMembers` delegates to `auditEventStore.findAll({changeSetId}, tx)` — the same single-hop traversal, the same row shape. `ChangeSetService.getMembers` and `GET /change-sets/{id}/members` are unchanged in signature; only the backing query changed. There is no standalone member-row projection — members are AuditEvent rows like every other consumer.

**`/versions/{versionNumber}` retained.** Fetching the *content* of one specific historical version (`getByIdAndVersion`) remains a distinct endpoint — it returns entity content, not audit trail. Only the former `/versions` (list) endpoint, which was version-history, is removed.

#### 3.1.5 actorId and future IAM remapping

`userId` stores the raw interim identifier today (the professional email of RBA-04's whitelist). The model treats it as a **stable logical actor key**, not a display string: the P2 platform-IAM integration (RBA-04, "account mapping preserved") will remap the identifier behind the key without rewriting history. The remapping layer is not built now — this is a design constraint that keeps the door open, not an implementation in this scope.

### 3.2 O* Lifecycle Model

The lifecycle of an O* (ON / OR / OC) is expressed entirely through **named Item→ItemVersion edges**. There is no stored lifecycle status field on the item node — lifecycle status is derived from which edges exist. This is a direct extension of the existing `LATEST_VERSION` structural pattern.

The four lifecycle edge types are:

| Edge | Meaning |
|---|---|
| `LATEST_VERSION` | Current working version — item is in active authoring |
| `RELEASED_VERSION` | Version currently deployed in the operational world |
| `DECOMMISSIONED_VERSION` | Version that was current when the item was decommissioned |
| `DELETED_VERSION` | Version that was current at soft-delete (recycle bin) |

**Lifecycle status.** The item's lifecycle status is encapsulated in a LifecycleStatus structure. This structure is composed of four independent boolean flags, each derived from the presence of the corresponding edge:

| Flag | Derived from |
|---|---|
| `active` | `LATEST_VERSION` edge exists |
| `released` | `RELEASED_VERSION` edge exists |
| `decommissioned` | `DECOMMISSIONED_VERSION` edge exists |
| `deleted` | `DELETED_VERSION` edge exists |

**Allowed combinations.** The flags are independent, but their co-occurrence is constrained — the lifecycle status of an item is always in exactly one of these states:

| State | active | released | decommissioned | deleted |
|---|---|---|---|---|
| Active | ✓ | | | |
| Active + Released | ✓ | ✓ | | |
| Decommissioned | | | ✓ | |
| Deleted (bin) | | | | ✓ |

No other combination is valid. In particular:
- `released` and `deleted` never coexist — a deployed item cannot be soft-deleted.
- `active` and `decommissioned` never coexist — decommissioning is terminal; no further authoring.
- `active` and `deleted` never coexist — soft delete removes `LATEST_VERSION`.

An item in the **Active + Released** lifecycle status holds two simultaneous edges pointing to different version nodes: `LATEST_VERSION` points to the current working version; `RELEASED_VERSION` points to the deployed version. This is the normal state of an OR being revised while its previous version is already operational.

**Allowed transitions.** The foundation defines all of these. The right-hand column marks which are implemented by the current solution proposal (§4) and which are designed-but-not-yet-built (§5.6):

| From | To | Operation | Edge changes | Solution |
|---|---|---|---|---|
| — | Active | create | `LATEST_VERSION` added | ✅ |
| Active | Deleted | soft delete | `LATEST_VERSION` removed; `DELETED_VERSION` added | ✅ |
| Deleted | Active | restore | `DELETED_VERSION` removed; `LATEST_VERSION` re-added to the same version node (no new version) | ✅ |
| Deleted | — | hard delete | item + versions + edges destroyed | ⚠ §5.4 |
| Active | Active + Released | release | `RELEASED_VERSION` added; `LATEST_VERSION` retained | ⚠ §5.6 |
| Active + Released | Decommissioned | decommission (decommissioning OC released) | `LATEST_VERSION` and `RELEASED_VERSION` removed; `DECOMMISSIONED_VERSION` added | ⚠ §5.6 |
| Decommissioned | Deleted | delete decommissioned | `DECOMMISSIONED_VERSION` removed; `DELETED_VERSION` added | ⚠ §5.6 |

Hard delete (permanent removal) is available from the `Deleted` state only, and only for items with no blocking dependencies (§5.1). It destroys the item node, all version nodes, and all edges in one transaction.

**Maturity vs lifecycle.** Maturity (`NO_SHOW` / `DRAFT` / `ADVANCED` / `MATURE`) is an **editorial signal** set by authors on the version node. Lifecycle status is an **operational signal** expressed by the structural edges above. The two are independent axes: maturity answers *how complete and stable is this requirement?*; lifecycle status answers *where is this item in its operational journey?*

**Release and decommission** are post-publication operations that drive the `RELEASED_VERSION` and `DECOMMISSIONED_VERSION` transitions. The decommission transition is the operational consequence of releasing a *decommissioning* OC: the OC-layer `DECOMMISSIONS` relationship (planning intent) becomes the lifecycle `DECOMMISSIONED_VERSION` edge (operational fact) when that OC is released. Both operations are fully designed at the foundation level (above) but their operational UX and implementation are not yet ready — see §5.6.

## 4. Lifecycle & Delete Solution (technical)

This section is the layer-by-layer description of the **lifecycle and deletion** implementation — what is built, by architectural layer. It does **not** cover the `AuditEvent` foundation (§3.1), which was delivered in Phase A and is already built; the lifecycle and delete operations here simply *use* the existing `log(...)` write discipline. Requirement traceability — which requirement each piece serves, and what is deferred — lives in §5.

### 4.1 Data model layer

**Lifecycle edges.** Three named Item→ItemVersion relationships join the existing `LATEST_VERSION`:

- `RELEASED_VERSION` — points to the deployed version
- `DECOMMISSIONED_VERSION` — points to the version current at decommission
- `DELETED_VERSION` — points to the version current at soft-delete

There is no stored lifecycle status field on the `Item` node; lifecycle status is derived from edge presence (the four flags `active` / `released` / `decommissioned` / `deleted`, §3.2).

**Lifecycle status in the projection.** The lifecycle status (attribute `lifecycleStatus` encapsulating the four flags `active` / `released` / `decommissioned` / `deleted`) is computed from lifecycle-edge presence and included in the item read projection at the **summary** tier — so they are present in all three projections (summary, standard, extended), not gated behind standard/extended. Lifecycle state is identity-level, needed by every consumer regardless of content depth: list views and pickers (summary) drive affordances from it, detail views (standard/extended) display it. The lifecycle status computing is cheap (edge-presence checks, no content hydration), so there is no cost reason to withhold them from summary. It is the read-side face of the edge model, available service→client.

**Lifecycle status is response-only.** The lifecycle status appears on response shapes, never on request shapes — it is not accepted as input on create / update / patch (the service rejects payloads carrying it, §4.3). Lifecycle status is edge-derived: the version node never carries lifecycle status, and the lifecycle edges are written exclusively by the transition operations (§4.2), never from create / update / patch content. A lifecycleStatus in a request therefore has no path to becoming the derived state, even before the strict-payload rejection — the rejection is the explicit guard on top of a model that already gives request lifecycle status no effect.

**Item node.** The Phase A `status` field (`ACTIVE` / `DELETED`) is **removed** — it is superseded by the edge model. This is the one Phase A element this revision walks back.

**ItemVersion node.** No change — already content-only after Phase A.

**Shared.** The `AuditAction` enum gains `RELEASE`. The referential-integrity result reuses the existing `OperationalEntityReference` shape `{id, code, title, type}` — `type` is strictly `ON | OR | OC`, its canonical scope. A future shared state-predicate helper (e.g. `isCandidateForSoftDelete(item)`) computing the flag-based part of a transition precondition would let server and client share the lifecycle rules from one source; not built now, noted as design intent.

> **Design correction.** An earlier iteration of this section stated that `type` spans the full `AuditTargetType` vocabulary so that edition/baseline references could appear in the blocker list. This was wrong: edition captures do not block soft delete (see §4.2 and §5.2 correction notes). `OperationalEntityReference` remains strictly an O\* cross-reference shape.

### 4.2 Store layer

`VersionedItemStore` gains the lifecycle transition methods and a `lifecycleFace` dataset selector on its read query; no separate per-state query methods are added.

**`lifecycleFace` as a dataset selector.** Reads are anchored on one lifecycle edge, chosen by a `lifecycleFace` argument on `findAll`: `active`→`LATEST_VERSION`, `released`→`RELEASED_VERSION`, `decommissioned`→`DECOMMISSIONED_VERSION`, `deleted`→`DELETED_VERSION`. This is a *dataset selector*, not a filter — it chooses which set of items the traversal walks, the peer of `baselineId` (the baseline-snapshot dataset). The two are **mutually exclusive**: `baselineId` present → baseline-snapshot dataset, `lifecycleFace` must be absent; `baselineId` absent → live dataset, with `lifecycleFace` (default `active`) selecting the face. The ordinary `filters` (`domain`, `text`, …) then narrow *within* whichever dataset was selected.

```
findAll(tx, baselineId, lifecycleFace, filters, projection)
```

The four lifecycle faces are not four datasets in tension — `released` is *what is in production*, `decommissioned` is *what has been withdrawn from production*, `deleted` is the recycle bin, `active` is the live working set. An item can be both `active` and `released` (it appears in both faces); the selector picks which list you are building, while the flags on each row describe that item's full state (below).

**Transition methods:**

- `softDelete(itemId, changeSetCommit, tx)` — valid only from the Active state (refuses if the item is `released`, `decommissioned` or already `deleted` — the §3.2 transition rule, a lifecycle-state guard separate from the blocking-dependency check). Removes `LATEST_VERSION`, adds `DELETED_VERSION` to the same version node, logs `DELETE`.
- `restore(itemId, changeSetCommit, tx)` — the mirror of `softDelete`: removes `DELETED_VERSION`, re-adds `LATEST_VERSION` to the same version node, logs `RESTORE`. No new version is created — the lifecycle edges are metadata over the version graph, and the transition itself is fully recorded in the audit log. Valid only from the Deleted state.
- `release(itemId, changeSetCommit, tx)` — adds `RELEASED_VERSION` (retains `LATEST_VERSION`), logs `RELEASE`.
- `decommission(itemId, changeSetCommit, tx)` — removes `LATEST_VERSION` and `RELEASED_VERSION`, adds `DECOMMISSIONED_VERSION`, logs `DECOMMISSION`.
- `hardDelete(itemId, changeSetCommit, tx)` — destroys the item node, all version nodes, and all edges in one transaction; logs `HARD_DELETE` (the event survives its target, §3.1).

**Blocking dependencies:**

- `findInboundReferences(itemId, tx)` — all **live** O\* inbound references (those whose source item still holds `LATEST_VERSION`), returned as `OperationalEntityReference[]` with `type` strictly in `ON | OR | OC`. Edition/baseline captures are **not** inspected — they do not block soft delete (see §5.2). The store computes referential facts only; the "blocking" interpretation is the service layer's.

> **Design correction.** An earlier iteration specified that `findInboundReferences` should also traverse to `ODPEdition`/`Baseline` nodes and return edition captures as references with `type: 'EDITION'`, treating them as one blocker kind. This is removed: edition captures do not block soft delete; `OperationalEntityReference` is an O\*-only shape; and the published-item protection is correctly expressed by the `released` lifecycle state, checked directly by `softDelete` before any reference query (see §4.3).

**Read projection — lifecycle flags.** The base read traversal (shared by `findAll`, `findById` and the specific-version read) `OPTIONAL MATCH`es the four lifecycle edges (`LATEST_VERSION`, `RELEASED_VERSION`, `DECOMMISSIONED_VERSION`, `DELETED_VERSION`) and projects their presence as the four booleans `active` / `released` / `decommissioned` / `deleted` in the row shape. This is computed at the summary tier, so the flags ride every read at every projection (§4.1) — the dedicated lifecycle-list queries above are just this same traversal filtered to one terminal edge. This is where the "derived from edge presence" model is actually realised; nothing else stores or computes lifecycle state.

`findInboundReferences` is a pure query: it computes the **referential-integrity** facts (inbound live references) and serves two consumers — the CLI and web client read it (via the service's `getInboundReferences`) to inform the user before any attempt, and the service calls it as a validation guard before `softDelete` (§4.3). This is distinct from the **lifecycle-state** precondition (the item must be Active and not Released), which is read from the flags. Soft delete requires both: the right lifecycle state *and* no inbound live references. Neo4j does not backstop either rule on soft delete (only `LATEST_VERSION` is removed; no node is deleted), so these application-level checks are the actual enforcement.

### 4.3 Service layer

`VersionedItemService` gains the lifecycle/delete operations and their read counterparts. Each write operation opens a transaction, calls the corresponding store method(s) within it, and commits or rolls back; the store never leaks an open transaction (transaction lifecycle is owned at the service layer, as today).

**Write operations:** `softDelete`, `restore`, `release`, `decommission`, `hardDelete` — each delegating to the store method of the same name.

**Read operations.** `getAll(user, editionId?, filters?, projection?, lifecycleFace?)` carries the dataset selector: `lifecycleFace` is one of `active` (default) / `released` / `decommissioned` / `deleted`, mutually exclusive with `editionId` (edition is the baseline-snapshot dataset; lifecycleFace selects a live-dataset face — supplying both is a `BAD_REQUEST`). `getById(itemId, user, editionId?, projection?, lifecycleFace?)` carries the **same** selector with the same default (`active`) and the same mutual exclusion with `editionId` — single-item reads of any face (a deleted item for the recycle-bin detail view, a released item for production inspection) go through it. Both append `lifecycleFace` **last**, matching the store's `findAll` / `findById` argument order (the dataset selector trails the shaping arguments rather than grouping with `editionId`); this keeps existing positional callers unaffected and the service signature aligned with the store it delegates to. Without the parameter the service could only ever read the active face of a single item and the store capability would be stranded. There are no separate `getDeleted` / `getReleased` / `getDecommissioned` methods at either granularity. `getInboundReferences(itemId, user)` (→ `store.findInboundReferences`) returns `OperationalEntityReference[]` — the live O\* items that reference this one. It does not decide deletability: the client (and `softDelete` internally) combines this list with the item's `lifecycleStatus` to reach a verdict — a non-empty list and/or a `released` state means the item cannot be soft-deleted. It is exposed so the client can assess deletability preemptively via `GET /{item}/{id}/inbound-references`; it is also called internally by `softDelete` as the reference guard (step 2 below). The `released` state is deliberately **not** folded into this method — the client already carries `lifecycleStatus.released` from the item read, and `softDelete` checks it directly as step 1.

**Strict payload validation.** The service rejects any create / update / patch payload that carries unexpected attributes, returning `BAD_REQUEST` (400) rather than silently dropping or absorbing them — a stray field signals a client error and should fail fast, not end up as an inert orphan property on the version node (a trap when investigating the store directly).

The accepted-field set is **not** re-declared in the service — it already exists in the `messages.js` request models, which compose the entity model with `ChangeSetCommit` and carve out everything derived or server-owned via `undefined` overrides (`itemId`, `versionId`, `version`, `code`, `lifecycleStatus`, and the reverse-traversal derived fields are all set `undefined` on `create`/`update`). A small `@odp/shared` helper — `allowedFields(requestModel)` returning `Object.keys(model).filter(k => model[k] !== undefined)` — turns each request model into its key allowlist, and the service validates the incoming payload's keys against it. `messages.js` is therefore the single source of truth; no per-service list is maintained.

Two wrinkles:
- **`patch`** declares only `{ ...ChangeSetCommit, expectedVersionId }` plus "any subset of entity fields" (the literal model carries no entity keys). Its allowlist is derived from the *entity* field set ∪ `ChangeSetCommit` ∪ `expectedVersionId`, **not** from the sparse `patch` literal — otherwise every entity field would be rejected.
- The convention relies on the `undefined`-override pattern being applied consistently across request models. It is (OR, OC, ChangeSet, and the setup entities all follow it); the helper is only as reliable as that discipline.

This covers the lifecycle flags with no special-casing: `lifecycleStatus` is `undefined` in the request models (response-only, §4.1), so a payload containing it is rejected like any other unexpected attribute.

**Validation guard.** `softDelete` enforces the precondition as two sequential checks before any mutation:

1. **Lifecycle-state guard** — the item must be Active *and not Released*: Active means `LATEST_VERSION` present; not Released means `RELEASED_VERSION` absent. A released item cannot be soft-deleted regardless of references — the only valid exits are release/decommission (DEL-06). This throws an invalid-transition error (not a 409) immediately.
2. **Reference guard** — `findInboundReferences` must return empty. If non-empty, refuses with `409 LIFECYCLE_BLOCKED` carrying the `OperationalEntityReference[]` list.

The two are distinct: the lifecycle-state guard is an invalid-transition error; only the reference check produces the 409 blocker report. Neo4j does not backstop either rule on soft delete (§4.2), so these application-level checks are the authoritative enforcement.

`restore` carries **only** the lifecycle-state guard (the item must be in the Deleted state — `DELETED_VERSION` present). There is no blocking-reference check on restore: re-adding `LATEST_VERSION` cannot introduce a *new* blocker — it reactivates an item that was already consistent when deleted, and any reference that would now point at it was either already present (and live) before the delete or points at an item the user can independently manage. Restore therefore mirrors `softDelete`'s state guard but not its reference guard.

**Flags in the read projection.** The service returns the lifecycle flags (§4.1) on every item read, at every projection (summary / standard / extended), so callers see state without a separate query. The web client uses them for live affordances and a preemptive deletability check; the CLI is non-preemptive — it simply calls the service operation and renders the result, including the conflict when a delete is refused.

**Bulk operations.** Lifecycle transitions are needed not only per-item but over a *set* — and the most concrete driver, an integrator reconciling a wave, selects in one worksheet what is to be **released**, what **decommissioned**, and possibly what **soft-deleted**, then commits all of it with one action. That is a single mixed batch spanning item types (an ON, an OR and an OC may all appear in it), so it cannot live on any type-scoped service. A dedicated **`BatchService`** owns it:

```
BatchService.applyLifecycleBatch({ release: [ids], decommission: [ids], softDelete: [ids] }, changeSetCommit, user)
```

`BatchService` creates the transaction and collaborates with the type-scoped services (`OperationalRequirementService`, `OperationalChangeService`) **within that shared transaction**, dispatching each item to the right per-item transition by type. It owns only the cross-cutting concerns: the transaction boundary, the set-relative blocking check across the union (below), per-item dispatch, and the aggregated conflict envelope. The per-item transition logic is not duplicated — it stays on the type-scoped services, which already accept an externally-provided `tx` (consistent with "transaction lifecycle owned at the service layer" — here `BatchService` is the owning layer).

The batch is all-or-nothing: any item failing its precondition rolls back the whole batch, the conflict reporting which items failed and why. One `changeSetCommit` covers the entire reconciliation — it is one logical change — while each item gets its own `AuditEvent` with its respective action (`RELEASE` / `DECOMMISSION` / `DELETE`) under that change set.

Both surfaces are public. The **per-item** methods (`softDelete`, `release`, `decommission`, `restore`, `hardDelete`) on the type-scoped services serve the ordinary single-item UI actions; **`BatchService.applyLifecycleBatch`** serves the integrator's mixed reconciliation. The batch is not sugar over N single calls — its single transaction and set-relative blocking check across the union cannot be reproduced by sequential per-item calls.

> **Set-relative blocking (to be specified).** A batch may be valid as a whole even when its members block each other individually: soft-deleting an ON and the only OR implementing it is fine, because the OR's removal clears the ON's blocker — and the clearing item may be in a *different* set of the same batch (e.g. an OR decommissioned in this batch clearing an ON soft-deleted in it). The precondition is therefore *set-relative* over the union of all three sets — an item's blocking dependency does not count if the blocker is itself in the batch; only blockers **external** to the batch are true failures. (For the release/decommission/soft-delete transitions this is a purely logical check, order-independent within the transaction since no node is deleted; a future hard-delete batch would additionally need dependency ordering, as Neo4j enforces at node-deletion time.) The exact algorithm is not specified here — the point is recorded so the batch precondition is not mistaken for a per-item independent check.

The candidate-derivation read that feeds the integrator's reconciliation worksheet (resolving the most-recent published edition spanning a wave, then its OC→OR release / decommission content) is DEL-06 operational design and is not specified here.

### 4.4 REST layer

**Per-item lifecycle actions** — sub-resource POSTs on the item, each carrying `changeSetCommit` in the body:

- `POST /{item}/{id}/delete` — soft delete
- `POST /{item}/{id}/restore`
- `POST /{item}/{id}/release`
- `POST /{item}/{id}/decommission`
- `POST /{item}/{id}/hard-delete`

Soft delete is a state-changing, change-set-bound action, not a bare `DELETE /{id}`: a POST sub-resource lets the body carry `changeSetCommit` and keeps it uniform with the other transitions, whereas the `DELETE` verb has no body convention and doesn't fit the change-set model. `DELETE /{id}` is **not** displaced — it remains the whole-item hard destroy (all versions). Soft delete and hard delete therefore coexist as `POST /{id}/delete` and `DELETE /{id}` respectively; the slightly inverted verb-to-rarity mapping (the common action on the sub-path, the rare destructive one on the natural verb) is accepted for now and revisited when hard delete is properly surfaced under DEL-04 (§5.4).

**Mixed batch** — top-level, mapping to `BatchService.applyLifecycleBatch`:

- `POST /batch/lifecycle` — body `{ release: [ids], decommission: [ids], softDelete: [ids], changeSetCommit }`

It sits under a `/batch` namespace rather than `/{item}` because it spans item types and takes globally-identified item IDs.

**Lifecycle dataset selection** — on the read endpoints via a query parameter:

- `GET /{item}?lifecycleFace=active|released|decommissioned|deleted` — defaults to `active`; selects the dataset face. Mutually exclusive with `?edition=` (supplying both → `400`).
- `GET /{item}/{id}?lifecycleFace=active|released|decommissioned|deleted` — the **same** parameter on the single-item read, mirroring `getById`'s service signature. Required for the recycle-bin detail view (fetch a soft-deleted item by id with `lifecycleFace=deleted`) and production inspection (`released`); without it only the active face of a single item is reachable. Same default (`active`) and same mutual exclusion with `?edition=`.
- `GET /{item}/{id}/inbound-references` — the preemptive deletability input (returns the live inbound-reference list; the client combines it with `lifecycleStatus` to decide)

No dedicated `/deleted` / `/released` / `/decommissioned` paths — they are faces of the one list resource, selected by `lifecycleFace`.

**Lifecycle flags** ride the existing item read projection (§4.1) — they appear on `GET /{item}` and `GET /{item}/{id}` responses at every projection (summary / standard / extended); no separate endpoint.

**Error mapping.** A refused transition returns `409 CONFLICT`. Two distinct service-layer codes drive it: `INVALID_LIFECYCLE_STATE` (the lifecycle-state guard failed — e.g. the item is `released`, or not in the `deleted` state on restore) and `LIFECYCLE_BLOCKED` (external blockers present), the latter carrying the blocker list as `OperationalEntityReference[]`. The batch endpoint reports per-item failures in the same envelope shape.

**OpenAPI.** The per-item lifecycle paths (`/delete`, `/restore`, `/release`, `/decommission`, `/hard-delete`) are declared in `openapi-operational.yml`, which already owns the operational-requirement and operational-change resources; the existing read endpoints there (both the list `GET /{item}` and the single-item `GET /{item}/{id}`) gain the `lifecycleFace` query parameter, and the single-item resource gains the `inbound-references` sub-path. The mixed batch goes in a new **`openapi-batch.yml`** (`/batch/lifecycle` + the `LifecycleBatchRequest` schema), referenced from `openapi.yml` alongside the other split specs. Shared schemas live in `openapi-base.yml`: the inbound-reference list reuses the existing `OperationalEntityReference` schema (no new schema needed — its `type` enum `ON | OR | OC` already covers every reference, which is always an O\*); the four lifecycle flags added at the **summary tier** of the `OperationalRequirement` / `OperationalChange` response schemas so they are present across all three projections; and a refusal `409` carried by a dedicated **`LifecycleConflictResponse`** schema — the standard `Error` envelope (`error: {code, message}`, code one of `LIFECYCLE_BLOCKED` / `INVALID_LIFECYCLE_STATE`) plus a top-level `references` sibling (`OperationalEntityReference[]`, present for `LIFECYCLE_BLOCKED` only). The list is a sibling of `error` rather than nested inside it, so clients that read only `error.code` are unaffected.

### 4.5 CLI

**Per-item lifecycle verbs** on the `requirement` and `change` command groups, each taking the item ID positionally and `--change-set <id>` (as existing write commands do):

- `requirement delete <id> --change-set <id>` — soft delete
- `requirement restore <id> --change-set <id>`
- `requirement release <id> --change-set <id>`
- `requirement decommission <id> --change-set <id>`
- `requirement hard-delete <id> --change-set <id>`

(and the same on `change`)

**Lifecycle dataset on `list` and `show`** — `requirement list` / `show` (and the same on `change`) gain a `--lifecycle-face active|released|decommissioned|deleted` option (default `active`), selecting the dataset face, alongside the other flags. There are no separate `deleted` / `released` / `decommissioned` verbs — `--lifecycle-face deleted` is the recycle bin, `released` is what's in production, and so on. Mutually exclusive with the edition option. The option is named `--lifecycle-face` (not `--lifecycle-status`, the original sketch wording) to match the `lifecycleFace` parameter used at every other layer and to avoid colliding with the unrelated `lifecycleStatus` read-shape structure. On `show` the face is the only way to inspect a soft-deleted item by id — a plain `show <id>` reads the active face and 404s for a soft-deleted item, so `show <id> --lifecycle-face deleted` is the recycle-bin detail read. (This brings the single-item recycle-bin read forward; the earlier position deferred it. The REST single-item read already accepts `?lifecycleFace=`, so this only exposes existing support on the CLI.)

**Lifecycle state in `list` and `show`.** Both carry the four flags via the read projection (§4.1). `show <id>` displays the item's lifecycle state as the true flags from the `lifecycleStatus` structure (the per-edge version display is a later refinement, not built this round). In `list`, the displayed lifecycle information depends on the selected `--lifecycle-face`:

- `active` (default) — the working set. Because `active` and `released` co-occur, an item here may also be released; the list therefore shows a **released** indicator so the integrator can see, within the working set, which items are already in production. No other flag can co-occur with `active`, so no further lifecycle column is needed in this face.
- `released` — what is in production. All rows are released by construction; the informative addition is whether each also has a working version in progress (i.e. is also `active`), shown as an **in-rework** indicator.
- `decommissioned` / `deleted` — single-state faces by construction; every row carries that one state, so no lifecycle indicator column is needed — the face itself is the state.

The principle: the selected face fixes one flag; any flag that can *co-occur* with it earns an indicator column, the rest are implied by the face.

> **As-built simplification (this round).** The face-conditional indicator scheme above is the intended display design. As built, `list` uses a single `Lifecycle` column listing the item's true flags (e.g. `active`, `active, released`) regardless of face, and `show` prints the same flag label. The per-face indicator columns (released indicator on the active face, in-rework on the released face) and the per-edge version display are deferred refinements — the single-column form is sufficient while only soft delete / restore are operable.

**No batch on the CLI.** The mixed lifecycle batch is an integrator reconciliation gesture surfaced only in the web client; the CLI exposes the per-item transitions only.

**Non-preemptive (per §4.3).** The CLI does not pre-check deletability — it calls the operation and renders the result; on a `409` refusal it prints the inbound-reference list (and any lifecycle-state failure) as a table. References surface from the refusal, not ahead of it: the `delete` verb itself never queries deletability before acting.

**User-initiated where-used query.** Separately from the delete flow, a `requirement inbound-references <id>` (and the same on `change`) verb lets the user inspect an item's live where-used list on demand, backed by `GET /{item}/{id}/inbound-references`. This does not make `delete` preemptive — the mutation still fires blind and surfaces the server's refusal; the query is an independent, user-chosen inspection, peer to `show`. (This refines the earlier position that there would be "no separate `inbound-references` query verb": that constraint was about keeping the *delete* non-preemptive, not about denying the user a deliberate inspection. The verb queries the live active dataset only — the endpoint takes no `lifecycleFace`.)

### 4.6 Web client

**This round — soft delete only.** The single web-client change now is a **soft-delete action on the O* detail form** (ON / OR / OC), routed through the standard change-set save dialog (it is a change-set-bound write — the dialog supplies the ChangeSet + note). On a refused delete (`409` — the lifecycle-state guard or blocking dependencies), the conflict is surfaced to the user, with the blocker list shown where present.

**Out of this round (P1+).** Lifecycle display (badges / indicators), the `lifecycleFace` dataset-face selector, the recycle bin view, and the restore / release / decommission / hard-delete affordances are deferred. The batch reconciliation worksheet is likewise P1+ (and its candidate derivation is DEL-06 operational design, §5.6).

Forward notes for when these land, not specified now:

- Lifecycle display will likely begin on the detail form. At most **two** flags can co-occur in any one view, bounded by the queried `lifecycleFace` (the working dataset) — e.g. the `active` face may also show `released`, but never a third.
- A "Production" / "Current Release" entry point from home (selecting the `released` face to see what is in production) is a planned future addition — not needed until next year.
- The `decommissioned` and `deleted` faces are **integrator-only** visibility, and it is open how much of the elaborate O* list / detail views will be reused for them — they may warrant only a stripped-back inspection/recovery view rather than the full authoring views. The visibility gating is an RBA concern (separate topic). Recorded here as the first indication that lifecycle faces differ both in visibility (active / released broad, decommissioned / deleted integrator-only) and possibly in view richness.

## 5. Requirement coverage

This section assesses the §4 solution against each requirement: how far up the stack the **design** is settled. Nothing here is built yet — the whole note is design; build sequencing lives in the plan. The marks reflect *design completeness per layer*: ✅ a clear solution exists · ◐ sketched but thin or open · — parked / not involved / not yet worked.

| Req | Priority | model | store | service | REST | CLI | web |
|---|---|---|---|---|---|---|---|
| **DEL-01** Referential integrity | P0 | ✅ | ✅ | ◐ | ✅ | ✅ | ◐ |
| **DEL-02** Published-edition wall | P0 | ✅ | ✅ | ◐ | ✅ | ✅ | ◐ |
| **DEL-03** Soft delete & restore | P1 | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ |
| **DEL-04** Hard delete | P1 | ✅ | ✅ | ◐ | ◐ | ◐ | — |
| **DEL-05** Edition deletion | P1 | — | ◐ | — | — | — | — |
| **DEL-06** Release & decommission | P0 \* | ✅ | ✅ | ✅ | ✅ | — | ◐ |

The remaining ◐ on DEL-01/DEL-02 is a single cross-cutting gap, now confined to the **web** layer — **reference-report presentation:** how the inbound-reference list is surfaced to the user (the refusal `409` rendering, and any preemptive display). The service side is settled: `getInboundReferences` returns the live O\* reference list as a flat `OperationalEntityReference[]` (no edition/ordinary distinction — edition captures don't block), and the client combines it with `lifecycleStatus`. The REST contract is settled (§4.4): the `409` refusal shape is fixed as `LifecycleConflictResponse` (the standard error envelope plus a top-level `references` sibling), and the per-item paths and `lifecycleFace` parameter are pinned. Web is partial this round — only the soft-delete-from-the-form refusal path is in scope. (The service ◐ reflects only that the where-used assembly thinness is shared with the web rendering question; the transition methods themselves are settled — DEL-03 service is ✅.)

DEL-04 (hard delete) and DEL-05 (edition deletion) are **parked**: only their store mechanics are sketched; service / REST / CLI / web were not worked this session. DEL-05 model is n/a (editions are not O*).

DEL-03's web layer is light — only soft-delete-from-the-detail-form is designed; **restore has no UI design**, and the recycle-bin view is deferred. DEL-06's data and store / service / REST design is settled; CLI is out of scope, the web layer is thin (batch-worksheet shape only), and the driving operations are open (§5.6).

### 5.1 DEL-01 — Referential integrity *[P0]*

No object is deletable while other **live** objects reference it; the check gathers **all** inbound live references in one pass. The blocking inbound references per target type, the live-only rule, and the structured result are specified in §4.1 (shape), §4.2 (`findInboundReferences`), §4.3 (guard). The service side is settled — the reference list is the flat `OperationalEntityReference[]` returned by `getInboundReferences`, which the client combines with `lifecycleStatus` to decide deletability. **Open:** how the web client presents it (the refusal `409` rendering and any preemptive display). Web is otherwise partial — only the soft-delete-from-form refusal path is in this round.

### 5.2 DEL-02 — Published-edition wall *[P0]*

A published item must not be soft-deletable. The gate is the item's **`released` lifecycle state** (`RELEASED_VERSION` edge present), not edition membership. `softDelete` checks this directly as an invalid-transition guard (step 1 in §4.3) — before any reference check, and independent of it. An item captured in a published edition but not yet operationally released (e.g. planned for a future wave) is **not** blocked by that edition membership alone — the correct gate is operational deployment, not publication. Once an item is released, its only sanctioned exits are release/decommission (DEL-06).

> **Design correction.** An earlier iteration folded the published-edition wall into the blocking-dependency check: `findInboundReferences` was specified to include edition/baseline captures as `type: 'EDITION'` references, and the service would distinguish them from ordinary O\* references in the blocker report. This was wrong on both counts — edition captures do not block deletion, and the `released` lifecycle state is the correct and sufficient gate. The scenario in §0 (OR-1 captured by Ed-1 but superseded and replaced in Ed-2) confirms that edition membership alone is not a valid blocker.

### 5.3 DEL-03 — Soft delete & restore *[P1]*

Soft delete and restore as the `LATEST_VERSION`↔`DELETED_VERSION` transitions, the recycle-bin read (`lifecycleFace=deleted`), and the two-part precondition (Active state + no blocking dependencies) are settled across §4.1–§4.5. **Web is light:** only soft-delete from the detail form is designed (§4.6); **restore has no UI design**, and the recycle-bin view is deferred (P1+).

### 5.4 DEL-04 — Hard delete *[P1]* — parked

The store mechanic is sketched (integrator-only, from the bin, blocking-clear; destroy item + versions + edges; log `HARD_DELETE` outliving its target, §4.2). Service, REST, CLI and web were not worked this session. Parked.

> **Note — edition-capture precondition.** Hard delete is where edition membership *does* constrain deletion. Unlike soft delete (which only moves a lifecycle edge and leaves all version nodes intact), hard delete destroys the `ItemVersion` nodes — and a published edition's `HAS_ITEMS` snapshot points directly at those nodes. Destroying a version captured by any edition would corrupt that edition. So the hard-delete precondition must include an edition-capture check (refuse if any `ODPEdition` exposes a baseline that captured a version of this item), in addition to the live-reference clear. This is the correct home for the protection that an earlier iteration mistakenly attached to soft delete (the "published-edition wall", see §5.2 correction). To be specified when DEL-04 is built.

### 5.5 DEL-05 — Edition deletion *[P1]* — parked

Editions do not use the O* lifecycle edge model; they would carry their own `status` field with soft / hard delete on `ODPEditionStore`. Only the store mechanic is sketched; the rest was not worked. Parked, and independent of the O* lifecycle work.

### 5.6 DEL-06 — Release & decommission *[P0 *]*

**Data model and the store / service / REST design are settled; the operations and their web UX are open.**

The lifecycle foundation (§3.2) completely defines this requirement's data model: the `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` edges, the Active + Released and Decommissioned states, and the transitions between them. The `RELEASE` and `DECOMMISSION` actions are reserved in `AuditAction`. The solution is designed down through store, service and REST: the transition methods (`release`, `decommission`) and `BatchService.applyLifecycleBatch` (§4.2–§4.3), and the REST surface — per-item `POST /{item}/{id}/{release|decommission}` and the mixed `POST /batch/lifecycle` with `openapi-batch.yml` (§4.4). CLI is deliberately out of scope.

What is **open** (the ◐ on web, and the reason DEL-06 is starred):

- **Release operation** — the post-publication act setting `RELEASED_VERSION` on each OR delivered by a released OC. Trigger, scope (per-OR vs per-wave/OC-batch) and UX unspecified.
- **Decommission operation** — the operational consequence of releasing a *decommissioning* OC (§3.2): the OC-layer `DECOMMISSIONS` planning relationship becomes the `DECOMMISSIONED_VERSION` lifecycle edge. Causally linked but distinct (intent vs fact). Integrity sequencing and linkage mechanics unspecified.
- **Integrator reconciliation worksheet** — the candidate-derivation read (most-recent published edition spanning a wave → its OC→OR release/decommission content) that populates the batch. Open operational design.

Because the data and service/REST design is complete, closing DEL-06 is a **solution refinement**, not a foundation change. A separate design note will cover it.

## 6. Migration / bootstrap

Migration of the existing Edition 1 dataset is **out of scope**. The dataset is refreshed by re-importing Edition 1, which produces the new node shape natively (no stamps on items / versions, no `HAS_REASON` edges, `AuditEvent` nodes written by the import path like any other write). Re-import may be run as many times as needed during development.

The import pipeline therefore gains the same `AuditEvent` write discipline as every other write path: each imported create / update is logged under the import's ChangeSet (per the LCM note's import pattern). Imported items enter as `Active` (holding only a `LATEST_VERSION` edge); no lifecycle transition edges are written by import.

## 7. Open points and parked items

- **Single-version rollback (DEL-03 (a) vs (b))** — settled on **(b)**: versions are strictly immutable. There is no `DELETE_VERSION` action and no version bin transit; deletion operates only at item level. This holds at least until edition patching forces the question.
- **`userId` remapping layer** — model-ready (§3.1.5); implementation deferred to P2 IAM integration.
- **AuditEvent retention / volume** — at P0 the log grows unbounded. No purge policy is defined; revisit if volume becomes a concern (it is bounded by write activity, which is modest).

(DEL-06's release-confirmation and decommission operations are tracked in §5.6, not here — they are design-complete and awaiting implementation, not open design questions.)

---

*See also: [main index](odip-implementation-plan.md) · [LCM note](odip-implmentation-plan-lcm.md) (audit superseded here) · [implementation plan](odip-audit-deletion-plan.md)*