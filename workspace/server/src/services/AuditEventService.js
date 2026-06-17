/**
 * @file AuditEventService.js
 * @description Read-side service for the audit log.
 *
 * AuditEventService is a pure read orchestrator — no base class, no CRUD,
 * no write path. Writes are performed by stores atomically within their own
 * operation transactions (AuditEventStore.log), never by a separate service call:
 * a separate service write would break the atomicity guarantee that lets the
 * log be trusted as authoritative.
 *
 * It exposes a single query method mirroring the store's single findAll. The
 * History timeline is NOT a server concern — the client builds it by querying
 * audit events filtered by targetId.
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
     * Query the audit log. All filters are optional and AND-combined; an empty
     * filter returns the entire log. Returns AuditEvent rows ordered by timestamp,
     * each with all fields frozen at write time plus a resolved versionId.
     *
     * The client builds the per-item History timeline by passing { targetId }.
     *
     * @param {object} filters - { changeSetId?, targetId?, userId? }
     * @param {object} user    - {id, role}
     * @returns {Promise<AuditEventRow[]>}
     */
    async getAuditEvents(filters, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const rows = await auditEventStore().findAll(filters ?? {}, tx);
            await commitTransaction(tx);
            return rows;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new AuditEventService();