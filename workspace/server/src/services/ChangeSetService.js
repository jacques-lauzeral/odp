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
 * listing, and the in-process id→ChangeSet cache used to hydrate the per-version
 * changeSetCommit on every versioned read.
 *
 * Cache contract:
 *   - lazily populated on demand (hydration miss → load from store within the
 *     active read transaction, then cache);
 *   - kept coherent on every ChangeSet mutation — create/update/close/reopen
 *     refresh the entry, delete evicts it.
 * The cache is per-process; title/classifier/status are mutable on the set, so
 * resolving them on read (rather than denormalising onto the HAS_REASON edge)
 * is what keeps a rename or reclassification consistent everywhere.
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
    // Hydration (called by VersionedItemService reads)
    // -------------------------------------------------------------------------

    /**
     * Enrich an entity's changeSetCommit in place — fills changeSetTitle and
     * classifier from the cache. No-op when the entity has no commit (e.g. a
     * pre-LCM version with a null changeSetCommit).
     */
    async hydrateInto(entity, transaction) {
        if (!entity || !entity.changeSetCommit) return entity;
        const commit = entity.changeSetCommit;
        const changeSet = await this._cacheGet(commit.changeSetId, transaction);
        if (changeSet) {
            commit.code = changeSet.code;
            commit.changeSetTitle = changeSet.title;
            commit.classifier = changeSet.classifier;
        }
        return entity;
    }

    /**
     * Hydrate a list of entities (O* list, version-history rows).
     */
    async hydrateAll(entities, transaction) {
        if (!Array.isArray(entities)) return entities;
        for (const entity of entities) {
            await this.hydrateInto(entity, transaction);
        }
        return entities;
    }

    // -------------------------------------------------------------------------
    // CRUD (cache-maintaining overrides)
    // -------------------------------------------------------------------------

    async createItem(data, userId) {
        const created = await super.createItem(data, userId);
        return this._cacheSet(created);
    }

    /**
     * Update title / reasonText. Editable only while OPEN (per change-set detail
     * view). Runs as a single transaction so the OPEN guard and write are atomic.
     */
    async updateItem(id, data, userId) {
        await this._validateUpdateData(data);
        const tx = createTransaction(userId);
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
     * Delete a change set. Only an empty, OPEN set may be deleted; a closed set
     * or one with members is never deletable.
     */
    async deleteItem(id, userId) {
        const tx = createTransaction(userId);
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

    async close(id, userId) {
        const tx = createTransaction(userId);
        try {
            const changeSet = await this.getStore().close(id, tx);
            await commitTransaction(tx);
            return this._cacheSet(changeSet);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async reopen(id, userId) {
        const tx = createTransaction(userId);
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

    async findByStatus(status, userId) {
        const tx = createTransaction(userId);
        try {
            const result = await this.getStore().findByStatus(status, tx);
            await commitTransaction(tx);
            return result;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async findByClassifier(classifier, userId) {
        const tx = createTransaction(userId);
        try {
            const result = await this.getStore().findByClassifier(classifier, tx);
            await commitTransaction(tx);
            return result;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async getMembers(changeSetId, userId) {
        const tx = createTransaction(userId);
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