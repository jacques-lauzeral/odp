import {
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

/**
 * VersionedItemService provides versioned CRUD operations with transaction management and user context.
 * Root class for operational entities (versioned with optimistic locking).
 * Enhanced with multi-context operations for baseline-aware and wave filtering support.
 * Enhanced with content filtering support for operational entities.
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
        await this._validateUpdatePayload(payload);
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

            // Fetch current version within the same transaction
            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Entity not found');
            }

            // Delegate field merging to subclass
            const completePayload = await this._computePatchedPayload(current, patchPayload);

            // Validate the complete payload
            await this._validateUpdatePayload(completePayload);

            // Perform the update within the same transaction
            const entity = await store.update(itemId, completePayload, expectedVersionId, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get entity by ID (latest version, baseline context, or wave filtered)
     * @param {number} itemId - Item ID
     * @param {string} userId - User ID
     * @param {number|null} baselineId - Optional baseline ID for historical context
     * @param {number|null} fromWaveId - Optional wave ID for filtering
     */
    async getById(itemId, userId, baselineId = null, fromWaveId = null) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const entity = await store.findById(itemId, tx, baselineId, fromWaveId);
            await commitTransaction(tx);
            console.log('VersionedItemService.getById', entity);
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
     * List all entities (latest versions, baseline context, wave filtered, and content filtered)
     * @param {string} userId - User ID
     * @param {number|null} baselineId - Optional baseline ID for historical context
     * @param {number|null} fromWaveId - Optional wave ID for filtering
     * @param {object} filters - Optional content filtering parameters
     */
    async getAll(userId, baselineId = null, fromWaveId = null, filters = {}) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const entities = await store.findAll(tx, baselineId, fromWaveId, filters);
            await commitTransaction(tx);
            console.log('VersionedItemService.getAll: ' + JSON.stringify(entities));
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

    async _validateUpdatePayload(payload) {
        throw new Error('_validateUpdatePayload must be implemented by subclass');
    }

    // Abstract patch method - must be implemented by subclasses for entity-specific field merging
    async _computePatchedPayload(current, patchPayload) {
        throw new Error('_computePatchedPayload must be implemented by subclass');
    }
}