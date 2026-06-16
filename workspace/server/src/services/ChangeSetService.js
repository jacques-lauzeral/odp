import { SimpleItemService } from './SimpleItemService.js';
import {
    changeSetStore,
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';
import { isChangeSetClassifierValid } from '@odp/shared';

/**
 * ChangeSetService — owns ChangeSet CRUD, lifecycle (close/reopen), member
 * listing, and the in-process id→ChangeSet cache used by the store layer to
 * validate open change sets on writes.
 *
 * Phase A (audit foundation):
 * - userId replaced by user {id, role} throughout
 * - hydrateInto / hydrateAll removed — changeSetCommit is no longer on the
 *   versioned-item read shape; History is served by AuditEventService
 * - Cache is now write-path only: used by _validateOpenChangeSet in the store
 *   to confirm a set is OPEN and capture the frozen {code, title, classifier}
 *   snapshot written onto AuditEvent
 *
 * Cache contract:
 *   - lazily populated on demand (store miss → load within active transaction)
 *   - refreshed on every mutation: create/update/close/reopen set the entry
 *   - evicted on delete
 *   - per-process; no cross-instance coherence
 */
export class ChangeSetService extends SimpleItemService {
    constructor() {
        super(changeSetStore);
        /** @type {Map<number, object>} changeSetId → ChangeSet */
        this._cache = new Map();
    }

    // -------------------------------------------------------------------------
    // Cache
    // -------------------------------------------------------------------------

    _cacheSet(changeSet) {
        if (changeSet && changeSet.id !== undefined && changeSet.id !== null) {
            this._cache.set(Number(changeSet.id), changeSet);
        }
        return changeSet;
    }

    _cacheEvict(id) {
        this._cache.delete(Number(id));
    }

    /**
     * Cached lookup; on miss, load from the store within the supplied transaction
     * and cache. Returns null if the change set does not exist.
     */
    async _cacheGet(id, transaction) {
        const key = Number(id);
        if (this._cache.has(key)) return this._cache.get(key);
        const changeSet = await this.getStore().findById(key, transaction);
        if (changeSet) this._cache.set(key, changeSet);
        return changeSet;
    }

    // -------------------------------------------------------------------------
    // CRUD (cache-maintaining overrides)
    // -------------------------------------------------------------------------

    async createItem(data, user) {
        const created = await super.createItem(data, user);
        return this._cacheSet(created);
    }

    /**
     * Update title / reasonText. Editable only while OPEN.
     * Runs as a single transaction so the OPEN guard and write are atomic.
     */
    async updateItem(id, data, user) {
        await this._validateUpdateData(data);
        const tx = createTransaction(user.id, user.role);
        try {
            const store = this.getStore();
            const current = await store.findById(id, tx);
            if (!current) {
                await rollbackTransaction(tx);
                return null;
            }
            if (current.status !== 'OPEN') {
                throw new Error('Change set is not OPEN — title and reason are editable only while OPEN');
            }
            const updated = await store.update(id, data, tx);
            await commitTransaction(tx);
            return this._cacheSet(updated);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete a change set. Only an empty, OPEN set may be deleted.
     */
    async deleteItem(id, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const store = this.getStore();
            const current = await store.findById(id, tx);
            if (!current) {
                await rollbackTransaction(tx);
                return false;
            }
            if (current.status !== 'OPEN') {
                throw new Error('Only an OPEN change set can be deleted');
            }
            const members = await store.findMembers(id, tx);
            if (members.length > 0) {
                throw new Error('Cannot delete a change set that has members');
            }
            const deleted = await store.delete(id, tx);
            await commitTransaction(tx);
            this._cacheEvict(id);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async close(id, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const changeSet = await this.getStore().close(id, tx);
            await commitTransaction(tx);
            return this._cacheSet(changeSet);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async reopen(id, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const changeSet = await this.getStore().reopen(id, tx);
            await commitTransaction(tx);
            return this._cacheSet(changeSet);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------------

    async findByStatus(status, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const result = await this.getStore().findByStatus(status, tx);
            await commitTransaction(tx);
            return result;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async findByClassifier(classifier, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const result = await this.getStore().findByClassifier(classifier, tx);
            await commitTransaction(tx);
            return result;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async getMembers(changeSetId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const members = await this.getStore().findMembers(changeSetId, tx);
            await commitTransaction(tx);
            return members;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    async _validateCreateData(data) {
        if (!data || typeof data.title !== 'string' || data.title.trim() === '') {
            throw new Error('Validation failed: title is required');
        }
        if (!isChangeSetClassifierValid(data.classifier)) {
            throw new Error('Validation failed: classifier is not a valid ChangeSetClassifier');
        }
    }

    async _validateUpdateData(data) {
        if (data.classifier !== undefined && !isChangeSetClassifierValid(data.classifier)) {
            throw new Error('Validation failed: classifier is not a valid ChangeSetClassifier');
        }
        if (data.title !== undefined && (typeof data.title !== 'string' || data.title.trim() === '')) {
            throw new Error('Validation failed: title must be a non-empty string');
        }
    }
}

export default new ChangeSetService();