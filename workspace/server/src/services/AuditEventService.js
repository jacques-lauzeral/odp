/**
 * @file AuditEventService.js
 * @description Read-side service for the unified AuditEvent timeline.
 *
 * AuditEventService is a pure read orchestrator — no base class, no CRUD,
 * no write path. Writes are performed by stores atomically within their own
 * operation transactions (AuditEventStore.log), never by a separate service call:
 * a separate service write would break the atomicity guarantee that lets the
 * log be trusted as authoritative.
 *
 * Pattern mirrors QualityService: standalone, read-only, direct store access
 * is the one sanctioned exception to "services call services, not stores".
 */

import {
    auditEventStore,
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

export class AuditEventService {

    /**
     * Return the full chronological audit timeline for a versioned item.
     *
     * Each row is an AuditEvent with all fields frozen at write time — no join
     * required; the History view renders directly from this list.
     *
     * @param {string|number} itemId — stable item identity (Neo4j node ID)
     * @param {object}        user   — {id, role}
     * @returns {Promise<AuditEventRow[]>}
     */
    async getItemHistory(itemId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const rows = await auditEventStore().findByTarget(itemId, tx);
            await commitTransaction(tx);
            return rows;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new AuditEventService();