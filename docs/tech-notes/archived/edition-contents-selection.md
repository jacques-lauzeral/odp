# Edition Content Selection — Technical Handoff Note

## Context

The ODIP system needs to publish editions containing a subset of ONs/ORs/OCs from a baseline.
An edition is configured with:
- `baselineId` (required — prerequisite, must exist before edition creation)
- `startsFromWave` (optional — wave lower bound)
- `minONMaturity` (optional — DRAFT | ADVANCED | MATURE)

The web client, CLI, OpenAPI, route layer, and data model have all been updated.
Server-side (store + service) has been **rolled back** to the pre-feature state.

---

## Chosen Architecture — `HAS_ITEMS.editions` array

Instead of computing edition content at query time (expensive, complex), the selection
algorithm runs **once at edition creation time** and marks the relevant `HAS_ITEMS`
relationships by appending the edition ID to an `editions` array property.

```
(Baseline)-[:HAS_ITEMS {editions: [3336, 3340]}]->(ORVersion)
(Baseline)-[:HAS_ITEMS {editions: []}]->(OCVersion)   ← not in any edition
```

At query time, edition filtering is a single extra WHERE condition:
```cypher
WHERE $editionId IN r.editions
```

No new nodes, no new relationship types — minimal overhead.

---

## Selection Algorithm (runs at edition creation, within baseline context)

### Inputs
- `baselineId` — the baseline universe
- `fromWaveId` (optional) — wave lower bound
- `minONMaturity` (optional) — minimum ON maturity gate

### Tentative path (ON/OR-based)

1. **Candidate ONs** — from baseline `HAS_ITEMS`: ONs where `version.tentative IS NOT NULL`
    - If `fromWaveId` set: keep only where `effectiveEnd(tentative) > fromWave.implementationDate`
        - `effectiveEnd([y]) = effectiveEnd([x,y]) = {y+1}-01-01`
    - If `minONMaturity` set: keep only where `maturity IN [minONMaturity..MATURE]`
2. **Downward ON cascade** — child ONs of accepted ONs (via `REFINES*1..`), recursively
3. **OR inclusion** — ORs implementing any accepted ON (via `IMPLEMENTS`)
4. **Downward OR cascade** — child ORs of accepted ORs (via `REFINES*1..`), recursively

### OC path (change-based)

5. **Candidate OCs** — from baseline `HAS_ITEMS`: OCs with at least one milestone
   where `milestone.wave.implementationDate >= fromWave.implementationDate`
6. **OR/ON inclusion** — ORs implemented/decommissioned by accepted OCs; ONs those ORs implement

### Result
Union of both paths → set of matching `ItemVersion` node IDs (already in baseline `HAS_ITEMS`).

---

## Store Layer Changes

### `odp-edition-store.js`

**`create({title, type, baselineId, startsFromWaveId?, minONMaturity?}, tx)`**

After creating the edition node and `EXPOSES`/`STARTS_FROM` relationships, run the
selection algorithm and patch matching `HAS_ITEMS` relationships:

```cypher
MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version)
WHERE id(baseline) = $baselineId AND id(version) IN $matchingVersionIds
SET r.editions = coalesce(r.editions, []) + $editionId
```

The algorithm itself can be implemented as a private method `_computeEditionVersionIds(baselineId, fromWaveId, minONMaturity, tx)` returning a Set of version IDs.

**`resolveContext(editionId, tx)`**

Returns `{baselineId, editionId}` — no wave/maturity needed at query time.

```javascript
// Route layer uses this to pass both to service/store
{ baselineId: number, editionId: number }
```

### `operational-requirement-store.js` and `operational-change-store.js`

**`buildFindAllQuery(baselineId, fromWaveId, filters, fields)`**

The baseline path gains one optional condition when `editionId` is present in filters:

```cypher
MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version)-[:VERSION_OF]->(item)
WHERE id(baseline) = $baselineId
AND ($editionId IN r.editions)   ← only when edition context active
```

Pass `editionId` via the `filters` object (e.g. `filters.editionId`), handled
alongside other filter conditions in `buildFindAllQuery`.

**`findAll(tx, baselineId?, fromWaveId?, filters?, projection?)`**

No structural change — `editionId` arrives via `filters.editionId`. The existing
wave filtering (`_computeWaveFilteredRequirements`, `_computeWaveFilteredChanges`)
is **no longer needed for edition queries** — the edition content is already fixed
in `HAS_ITEMS.editions`. Wave filtering remains available for direct `fromWaveId`
parameter use (non-edition queries).

---

## Service Layer Changes

### `VersionedItemService.js`

**`getAll(userId, editionId?, filters?, projection?)`**

```javascript
if (editionId) {
    const { baselineId, editionId: resolvedEditionId } = await editionStore.resolveContext(editionId, tx);
    return store.findAll(tx, baselineId, null, { ...filters, editionId: resolvedEditionId }, projection);
} else {
    return store.findAll(tx, null, null, filters, projection);
}
```

**`getById(itemId, userId, editionId?, projection?)`**

```javascript
const baselineId = editionId
    ? (await editionStore.resolveContext(editionId, tx)).baselineId
    : null;
return store.findById(itemId, tx, baselineId, null, projection);
```

Note: `getById` does NOT filter by `editionId` — if the item is in the baseline
it is returned. The edition membership check is only on list queries.

### `OperationalRequirementService.js` and `OperationalChangeService.js`

**No `_resolveContent` override needed** — the base class `getAll` handles everything.
These services revert to their pre-feature state (validation only).

### `ODPEditionService.js`

**`createODPEdition(data, userId)`**

After creating the edition node, call the store to run the algorithm and patch
`HAS_ITEMS`:

```javascript
await odpEditionStore().computeAndMarkEditionContent(edition.id, resolvedBaselineId, validatedData.startsFromWaveId, validatedData.minONMaturity, tx);
```

Or equivalently this logic lives entirely in `odpEditionStore().create()`.

---

## ADD Chapters to Update

- **02-Storage-Layer.md** — `ODPEditionStore.create()`, `resolveContext()`, `HAS_ITEMS` relationship updated to include `editions` property; `buildFindAllQuery` editionId filter; remove closure methods
- **03-Service-Layer.md** — simplify `VersionedItemService.getAll/getById`; remove `_resolveContent`; update `ODIPEditionService.createODPEdition`

---

## Open Questions (confirm before implementing)

1. Selection algorithm operates on **baseline versions** (not latest) — confirmed in design
2. `HAS_ITEMS` is created with no `editions` property at baseline creation — property added only when an edition is created referencing that baseline
3. Multiple editions per baseline: each edition appends its ID to the relevant subset of `HAS_ITEMS` relationships — the `editions` array can contain 0, 1, or many edition IDs