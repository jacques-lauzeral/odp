import { BaseStore } from './base-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for ChangeSet nodes.
 *
 * A ChangeSet records *why* content changed. It is non-versioned — a single
 * mutable node whose `status` transitions OPEN → CLOSED and may be reopened.
 * Every versioned write (OR/OC/Chapter) links its new version to one OPEN
 * change set via a HAS_REASON edge; that edge is written by VersionedItemStore.
 * The reverse traversal (a change set → its member versions) lives here, in
 * findMembers.
 *
 * Title/status/classifier of a set are mutable; the service caches them and
 * hydrates per-version reads. This store never denormalises those onto edges.
 */
export class ChangeSetStore extends BaseStore {
    constructor(driver) {
        super(driver, 'ChangeSet');
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
     * Members of a change set — the versions committed under it, via the
     * HAS_REASON reverse traversal. Returns the declared member-row projection
     * (common columns only); the change-set detail view renders these directly.
     *
     * itemType resolves to 'OC' / 'chapter' from the item label, otherwise to
     * version.type ('ON' | 'OR').
     *
     * @param {number} changeSetId
     * @param {Transaction} transaction
     * @returns {Promise<Array<{itemId:number, itemType:string, code:string, title:string, versionId:number, version:number, note:string}>>}
     */
    async findMembers(changeSetId, transaction) {
        try {
            const id = this.normalizeId(changeSetId);
            const result = await transaction.run(`
                MATCH (cs:ChangeSet)<-[hr:HAS_REASON]-(version)-[:VERSION_OF]->(item)
                WHERE id(cs) = $id
                RETURN id(item) as itemId,
                       CASE
                         WHEN 'OperationalChange' IN labels(item) THEN 'OC'
                         WHEN 'Chapter' IN labels(item) THEN 'chapter'
                         ELSE version.type
                       END as itemType,
                       item.code as code,
                       item.title as title,
                       id(version) as versionId,
                       version.version as version,
                       hr.note as note
                ORDER BY item.title
            `, { id });
            return result.records.map(rec => ({
                itemId: this.normalizeId(rec.get('itemId')),
                itemType: rec.get('itemType'),
                code: rec.get('code'),
                title: rec.get('title'),
                versionId: this.normalizeId(rec.get('versionId')),
                version: this.normalizeId(rec.get('version')),
                note: rec.get('note') ?? '',
            }));
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find members of ChangeSet ${changeSetId}: ${error.message}`, error);
        }
    }

    // Inherits from BaseStore: findById, findAll, update, delete, exists
}