import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore
} from '../store/index.js';

/**
 * VersionedItemService provides versioned CRUD operations with transaction management and user context.
 * Root class for operational entities (versioned with optimistic locking).
 *
 * Multi-context support:
 *   - No context: latest versions
 *   - Baseline context: baselineId provided
 *   - Edition context: editionId provided — service resolves to {baselineId, editionId} via
 *     odpEditionStore().resolveContext(), then passes both to the store
 *
 * baselineId and editionId are mutually exclusive. Wave filtering has been removed —
 * edition content selection is pre-computed at edition creation time.
 */
export class VersionedItemService {
    constructor(storeGetter) {
        this.storeGetter = storeGetter;
    }

    /**
     * Get store instance using the provided getter function
     */
    getStore() {
        return this.storeGetter();
    }

    /**
     * Create new versioned entity (creates Item + ItemVersion v1)
     */
    async create(payload, userId) {
        await this._validateCreatePayload(payload);

        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const entity = await store.create(payload, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update versioned entity (creates new ItemVersion)
     */
    async update(itemId, payload, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            return await this._doUpdate(itemId, payload, expectedVersionId, tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _doUpdate(itemId, payload, expectedVersionId, tx) {
        await this._validateUpdatePayload(payload, itemId);
        const store = this.getStore();
        const entity = await store.update(itemId, payload, expectedVersionId, tx);
        await commitTransaction(tx);
        return entity;
    }

    /**
     * Patch versioned entity (partial update with field inheritance)
     */
    async patch(itemId, patchPayload, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Entity not found');
            }

            const completePayload = await this._computePatchedPayload(current, patchPayload);
            await this._validateUpdatePayload(completePayload, itemId);

            const entity = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get entity by ID with optional edition context.
     * When editionId is provided, the service resolves it to {baselineId, editionId}
     * before calling the store.
     *
     * @param {number} itemId
     * @param {string} userId
     * @param {number|null} editionId - Edition context, or null for latest version
     * @param {string} projection
     */
    async getById(itemId, userId, editionId = null, projection = 'standard') {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            let resolvedBaselineId = null;
            let resolvedEditionId = null;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedEditionId = context.editionId;
            }

            const entity = await store.findById(itemId, tx, resolvedBaselineId, resolvedEditionId, projection);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get entity by ID and specific version
     */
    async getByIdAndVersion(itemId, versionNumber, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const entity = await store.findByIdAndVersion(itemId, versionNumber, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get version history for entity
     */
    async getVersionHistory(itemId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const history = await store.findVersionHistory(itemId, tx);
            await commitTransaction(tx);
            return history;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * List all entities with optional edition context, content filtering, and projection.
     * When editionId is provided, the service resolves it to {baselineId, editionId} via
     * odpEditionStore().resolveContext() and passes both to the store.
     *
     * @param {string} userId
     * @param {number|null} editionId - Edition context, or null for latest versions
     * @param {object} filters - Content filters
     * @param {string} projection
     */
    async getAll(userId, editionId = null, filters = {}, projection = 'standard') {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            let resolvedBaselineId = null;
            let resolvedFilters = filters;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedFilters = { ...filters, editionId: context.editionId };
            }

            const entities = await store.findAll(tx, resolvedBaselineId, resolvedFilters, projection);
            await commitTransaction(tx);
            return entities;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete entity (Item + all versions)
     */
    async delete(itemId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const deleted = await store.delete(itemId, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // Abstract validation methods - must be implemented by subclasses
    async _validateCreatePayload(payload) {
        throw new Error('_validateCreatePayload must be implemented by subclass');
    }

    async _validateUpdatePayload(payload, itemId) {
        throw new Error('_validateUpdatePayload must be implemented by subclass');
    }

    // Abstract patch method - must be implemented by subclasses for entity-specific field merging
    async _computePatchedPayload(current, patchPayload) {
        throw new Error('_computePatchedPayload must be implemented by subclass');
    }
}