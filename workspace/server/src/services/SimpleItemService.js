import {
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

/**
 * SimpleItemService provides common CRUD operations with transaction management and user context.
 * Abstract base class for all simple entity services (non-versioned entities).
 * Uses consistent "item" terminology for method naming across all services.
 */
export class SimpleItemService {
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
     * List all items
     */
    async listItems(userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const items = await store.findAll(tx);
            await commitTransaction(tx);
            return items;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get item by ID
     */
    async getItem(id, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const item = await store.findById(id, tx);
            await commitTransaction(tx);
            return item;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Create new item
     */
    async createItem(data, userId) {
        // Validate data before transaction
        await this._validateCreateData(data);

        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const item = await store.create(data, tx);
            await commitTransaction(tx);
            return item;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update item by ID
     */
    async updateItem(id, data, userId) {
        // Validate data before transaction
        await this._validateUpdateData(data);

        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const updatedItem = await store.update(id, data, tx);

            if (!updatedItem) {
                await rollbackTransaction(tx);
                return null; // Item not found
            }

            await commitTransaction(tx);
            return updatedItem;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete item by ID
     */
    async deleteItem(id, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const deleted = await store.delete(id, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // =============================================================================
    // ABSTRACT VALIDATION METHODS - Must be implemented by subclasses
    // =============================================================================

    /**
     * Validate data for item creation
     * Must be implemented by subclasses for entity-specific validation
     */
    async _validateCreateData(data) {
        throw new Error('_validateCreateData must be implemented by subclass');
    }

    /**
     * Validate data for item updates
     * Must be implemented by subclasses for entity-specific validation
     */
    async _validateUpdateData(data) {
        throw new Error('_validateUpdateData must be implemented by subclass');
    }

}