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
 * Bandwidth model (scopeId and waveId are both optional):
 *   (waveId, scopeId)  → per-wave, per-DrG   — shown in DrG cell
 *   (waveId, -)        → per-wave, global     — shown in Global column cell only
 *   (-, scopeId)       → per-year, per-DrG    — parked post-MVP
 *   (-, -)             → per-year, global     — parked post-MVP
 */

import { idsEqual } from '/shared/src/index.js';

const OPS_DEPLOYMENT = 'OPS_DEPLOYMENT';/**
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
    return m?.wave?.id ?? null;
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
    // scopeId absent = global bandwidth, distributed equally across all DrGs
    const bwIndex = new Map();       // (waveId, drg) → MW
    const bwGlobal = new Map();      // waveId → MW  (global, no scopeId)
    for (const bw of bandwidths) {
        if (bw.scopeId) {
            bwIndex.set(_key(bw.waveId, bw.scopeId), bw.planned ?? 0);
        } else {
            bwGlobal.set(String(bw.waveId), bw.planned ?? 0);
        }
    }
    // Note: bwIndex/bwGlobal only contain entries for waves/DrGs that have a bandwidth
    // record. Missing entries (Map.get → undefined) mean "not configured" — distinct
    // from an explicit 0 MW record.

    const cells      = new Map();
    const waveGlobal = new Map();
    const unplanned  = [];

    // Pre-populate waveGlobal available for every wave upfront
    // so bandwidth shows correctly even when no OCs are planned in that wave
    for (const wave of waves) {
        const waveId = String(wave.id);
        const global = bwGlobal.get(waveId);
        let available;
        if (global !== undefined) {
            // Explicit global bandwidth record for this wave
            available = global;
        } else {
            // Sum per-DrG records; if none exist at all, available stays null
            let sum = null;
            for (const drg of drgs) {
                const drg_bw = bwIndex.get(_key(waveId, drg));
                if (drg_bw !== undefined) {
                    sum = (sum ?? 0) + drg_bw;
                }
            }
            available = sum;  // null if no per-DrG records, number if any exist
        }
        waveGlobal.set(waveId, { consumed: 0, available, ocs: [] });
    }

    for (const oc of ocs) {
        const waveId = resolveDeploymentWaveId(oc);
        if (!waveId || !oc.drg) {
            unplanned.push(oc);
            continue;
        }

        const cost   = oc.cost ?? 0;
        const drg    = oc.drg;
        const waveIdStr = String(waveId);

        // Per (waveId, drg) cell — available is per-DrG bandwidth only
        if (!cells.has(waveIdStr)) cells.set(waveIdStr, new Map());
        const waveMap = cells.get(waveIdStr);
        if (!waveMap.has(drg)) {
            const drg_bw = bwIndex.get(_key(waveIdStr, drg));
            waveMap.set(drg, {
                consumed:  0,
                available: drg_bw !== undefined ? drg_bw : null,
                ocs:       []
            });
        }
        const cell = waveMap.get(drg);
        cell.consumed += cost;
        cell.ocs.push(oc);

        // Per wave global
        if (!waveGlobal.has(waveIdStr)) {
            // Fallback: wave not in pre-populated set (unknown wave id)
            waveGlobal.set(waveIdStr, { consumed: 0, available: 0, ocs: [] });
        }
        const wg = waveGlobal.get(waveIdStr);
        wg.consumed += cost;
        wg.ocs.push(oc);
    }

    return { cells, waveGlobal, unplanned };
}

/**
 * Classify a consumed/available pair into a load category.
 *
 * @returns {'green'|'orange'|'red'|'empty'}
 */
export function classifyLoad(consumed, available) {
    if (available === null || available === undefined) return 'empty';  // no record defined
    if (available === 0) return consumed > 0 ? 'red' : 'empty';        // explicit 0 MW record
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
    const offenders = [];
    for (const depId of oc.dependencies) {
        const dep = allOcs.find(o => idsEqual(o.itemId, depId));
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