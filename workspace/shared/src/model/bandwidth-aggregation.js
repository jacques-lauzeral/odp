/**
 * bandwidth-aggregation.js
 *
 * Pure aggregation module for the prioritisation grid.
 * Framework-agnostic — no DOM, no API calls, no side effects.
 * Usable client-side (prioritisation page) and server-side (future endpoint).
 *
 * MVP rules:
 *   - An OC is attributed to the wave of its OPS_DEPLOYMENT milestone only.
 *   - OCs with no OPS_DEPLOYMENT milestone are unplanned (backlog).
 *   - Each OC is attributed to its own DrG only (no cross-DrG apportionment).
 *
 * Parked post-MVP:
 *   - Per-milestone effort apportionment across waves
 *   - Cross-DrG cost apportionment for multi-DrG OCs
 */

const OPS_DEPLOYMENT = 'OPS_DEPLOYMENT';

/**
 * Resolve the wave ID of an OC's OPS_DEPLOYMENT milestone.
 * Returns null if no such milestone exists.
 *
 * @param {Object} oc
 * @returns {string|null}
 */
export function resolveDeploymentWaveId(oc) {
    if (!Array.isArray(oc.milestones)) return null;
    const m = oc.milestones.find(
        m => Array.isArray(m.eventTypes) && m.eventTypes.includes(OPS_DEPLOYMENT)
    );
    return m?.waveId ?? null;
}

/**
 * Build the aggregation matrix from raw data.
 *
 * @param {Object[]} ocs
 * @param {Object[]} waves
 * @param {Object[]} bandwidths
 * @param {string[]} drgs       Ordered DrG enum values
 *
 * @returns {AggregationMatrix}
 *
 * AggregationMatrix:
 * {
 *   cells:      Map<waveId, Map<drg, CellData>>
 *   waveGlobal: Map<waveId, CellData>   // sum across all DrGs per wave
 *   unplanned:  OC[]                    // no OPS_DEPLOYMENT milestone
 * }
 *
 * CellData: { consumed: number, available: number, ocs: OC[] }
 */
export function buildMatrix(ocs, waves, bandwidths, drgs) {
    // Index bandwidths: (waveId, drg) → available MW
    const bwIndex = new Map();
    for (const bw of bandwidths) {
        bwIndex.set(_key(bw.waveId, bw.scopeId), bw.planned ?? 0);
    }

    const cells      = new Map();
    const waveGlobal = new Map();
    const unplanned  = [];

    for (const oc of ocs) {
        const waveId = resolveDeploymentWaveId(oc);
        if (!waveId || !oc.drg) {
            unplanned.push(oc);
            continue;
        }

        const cost = oc.cost ?? 0;
        const drg  = oc.drg;

        // Per (waveId, drg) cell
        if (!cells.has(waveId)) cells.set(waveId, new Map());
        const waveMap = cells.get(waveId);
        if (!waveMap.has(drg)) {
            waveMap.set(drg, {
                consumed:  0,
                available: bwIndex.get(_key(waveId, drg)) ?? 0,
                ocs:       []
            });
        }
        const cell = waveMap.get(drg);
        cell.consumed += cost;
        cell.ocs.push(oc);

        // Per wave global
        if (!waveGlobal.has(waveId)) {
            waveGlobal.set(waveId, { consumed: 0, available: 0, ocs: [] });
        }
        const wg = waveGlobal.get(waveId);
        wg.consumed += cost;
        wg.ocs.push(oc);
    }

    // available for waveGlobal = sum of bandwidth across all DrGs
    for (const [waveId, wg] of waveGlobal) {
        for (const drg of drgs) {
            wg.available += bwIndex.get(_key(waveId, drg)) ?? 0;
        }
    }

    return { cells, waveGlobal, unplanned };
}

/**
 * Classify a consumed/available pair into a load category.
 *
 * @returns {'green'|'orange'|'red'|'empty'}
 */
export function classifyLoad(consumed, available) {
    if (available === 0) return consumed > 0 ? 'red' : 'empty';
    const ratio = consumed / available;
    if (ratio < 0.8) return 'green';
    if (ratio < 1.2) return 'orange';
    return 'red';
}

/**
 * Compute card height in rem using logarithmic scale.
 *   1 MW  → 2 rem
 *  10 MW  → 4 rem
 * 100 MW  → 6 rem
 * Clamped: min 2 rem, max 12 rem.
 *
 * @param {number} cost  MW value (may be null/undefined → treated as 0)
 * @returns {number}     height in rem
 */
export function cardHeight(cost) {
    const h = 2 + 2 * Math.log10(Math.max(1, cost ?? 0));
    return Math.min(12, Math.max(2, h));
}

/**
 * Check whether shifting an OC to targetWaveId would violate dependencies.
 * Violation: a dependency OC has its OPS_DEPLOYMENT in the same or later wave.
 *
 * @returns {{ violated: boolean, offenders: OC[] }}
 */
export function checkDependencyViolations(oc, targetWaveId, allOcs, waves) {
    if (!Array.isArray(oc.dependencies) || oc.dependencies.length === 0) {
        return { violated: false, offenders: [] };
    }
    const waveOrder = new Map(waves.map((w, i) => [w.id, i]));
    const targetIdx = waveOrder.get(targetWaveId) ?? Infinity;
    const ocById    = new Map(allOcs.map(o => [o.id, o]));
    const offenders = [];
    for (const depId of oc.dependencies) {
        const dep = ocById.get(depId);
        if (!dep) continue;
        const depWaveId = resolveDeploymentWaveId(dep);
        if (!depWaveId) continue;
        const depIdx = waveOrder.get(depWaveId) ?? -1;
        if (depIdx >= targetIdx) offenders.push(dep);
    }
    return { violated: offenders.length > 0, offenders };
}

// ---------------------------------------------------------------------------

function _key(waveId, drg) { return `${waveId}::${drg}`; }