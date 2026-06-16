import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';
import { AuditEventStore } from './audit-event-store.js';

/**
 * Store for ChangeSet nodes.
 *
 * A ChangeSet records *why* content changed. It is non-versioned — a single
 * mutable node whose `status` transitions OPEN → CLOSED and may be reopened.
 * Every consequential write records an AuditEvent linked to its OPEN change set
 * via UNDER_CHANGESET (written by VersionedItemStore through AuditEventStore).
 * The members view (a change set → its committed versions) lives here in
 * findMembers, delegating to the audit log's single UNDER_CHANGESET hop.
 *
 * Change-set title/status/classifier are mutable; the per-event snapshots are
 * frozen at commit time on the AuditEvent, so member rows never re-hydrate them.
 */
export class ChangeSetStore extends BaseStore {
    constructor(driver) {
        super(driver, 'ChangeSet');
        this.auditEventStore = new AuditEventStore(driver);
    }

    /**
     * Create a change set. Stamps createdAt/createdBy and initialises the
     * creation-time invariants (status OPEN, empty commentRefs). closedAt/closedBy
     * remain unset until closure.
     *
     * @override
     * @param {object} data - { title, reasonText, classifier, commentRefs? }
     * @param {Transaction} transaction
     * @returns {Promise<object>}
     */
    async create(data, transaction) {
        const createdAt = new Date().toISOString();
        const createdBy = transaction.getUserId();

        const maxNumber = await this._findMaxChangeSetCodeNumber(transaction);
        const code = `CS-${(maxNumber + 1).toString().padStart(5, '0')}`;

        const node = {
            ...data,
            code,
            status: 'OPEN',                       // ChangeSetStatus.OPEN
            commentRefs: data.commentRefs ?? [],  // empty at P0
            createdAt,
            createdBy,
        };
        return super.create(node, transaction);
    }

    /**
     * Find the highest existing CS-##### number across all ChangeSet nodes.
     * Returns 0 when no change sets exist yet (next code will be CS-00001).
     * Mirrors VersionedItemStore._findMaxCodeNumber — no DRG segment, 5-digit pad.
     *
     * A UNIQUE constraint on ChangeSet.code (declared in initializeDatabase()) is
     * the fail-fast backstop against race-condition duplicates.
     *
     * @param {Transaction} transaction
     * @returns {Promise<number>}
     */
    async _findMaxChangeSetCodeNumber(transaction) {
        try {
            const result = await transaction.run(`
                MATCH (cs:ChangeSet)
                WHERE cs.code STARTS WITH 'CS-'
                RETURN cs.code as code
                ORDER BY cs.code DESC
                LIMIT 1
            `);
            if (result.records.length === 0) return 0;
            const maxCode = result.records[0].get('code');
            const numericPart = maxCode.substring('CS-'.length);
            return parseInt(numericPart, 10);
        } catch (error) {
            throw new StoreError(`Failed to find max change set code number: ${error.message}`, error);
        }
    }

    /**
     * Close a change set — no longer accepts new members.
     * @param {number} id
     * @param {Transaction} transaction
     * @returns {Promise<object>}
     */
    async close(id, transaction) {
        const closedAt = new Date().toISOString();
        const closedBy = transaction.getUserId();
        const result = await transaction.run(`
            MATCH (cs:ChangeSet)
            WHERE id(cs) = $id
            SET cs.status = 'CLOSED', cs.closedAt = $closedAt, cs.closedBy = $closedBy
            RETURN cs
        `, { id: this.normalizeId(id), closedAt, closedBy });
        if (result.records.length === 0) {
            throw new StoreError(`ChangeSet ${id} not found`);
        }
        return this.transformRecord(result.records[0], 'cs');
    }

    /**
     * Reopen a change set. closedAt/closedBy are cleared — multi-cycle history
     * is not retained at P0.
     * @param {number} id
     * @param {Transaction} transaction
     * @returns {Promise<object>}
     */
    async reopen(id, transaction) {
        const result = await transaction.run(`
            MATCH (cs:ChangeSet)
            WHERE id(cs) = $id
            SET cs.status = 'OPEN', cs.closedAt = null, cs.closedBy = null
            RETURN cs
        `, { id: this.normalizeId(id) });
        if (result.records.length === 0) {
            throw new StoreError(`ChangeSet ${id} not found`);
        }
        return this.transformRecord(result.records[0], 'cs');
    }

    /**
     * @param {string} status - ChangeSetStatus key ('OPEN' | 'CLOSED')
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>}
     */
    async findByStatus(status, transaction) {
        const result = await transaction.run(`
            MATCH (cs:ChangeSet)
            WHERE cs.status = $status
            RETURN cs
            ORDER BY cs.createdAt DESC
        `, { status });
        return this.transformRecords(result.records, 'cs');
    }

    /**
     * @param {string} classifier - ChangeSetClassifier key
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>}
     */
    async findByClassifier(classifier, transaction) {
        const result = await transaction.run(`
            MATCH (cs:ChangeSet)
            WHERE cs.classifier = $classifier
            RETURN cs
            ORDER BY cs.createdAt DESC
        `, { classifier });
        return this.transformRecords(result.records, 'cs');
    }

    /**
     * Members of a change set — the versions committed under it. Reads the audit
     * log via the single UNDER_CHANGESET → TARGETS hop (AuditEventStore.findByChangeSet),
     * returning the declared member-row projection. Computed on demand (change-set
     * detail view), so the per-row versionId resolution it performs is off any common
     * read path.
     *
     * @param {number} changeSetId
     * @param {Transaction} transaction
     * @returns {Promise<Array<{itemId:number, itemType:string, code:string, title:string, versionId:(number|null), version:(number|null), note:string}>>}
     */
    async findMembers(changeSetId, transaction) {
        return this.auditEventStore.findByChangeSet(changeSetId, transaction);
    }

    // Inherits from BaseStore: findById, findAll, update, delete, exists
}