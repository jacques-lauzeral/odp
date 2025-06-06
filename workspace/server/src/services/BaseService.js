import {
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

/**
 * BaseService provides common CRUD operations with transaction management.
 * Abstract base class for all entity services.
 */
export class BaseService {
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
     * List all entities
     */
    async listEntities() {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const entities = await store.findAll(tx);
            await commitTransaction(tx);
            return entities;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get entity by ID
     */
    async getEntity(id) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const entity = await store.findById(id, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Create new entity
     */
    async createEntity(data) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const entity = await store.create(data, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update entity by ID
     */
    async updateEntity(id, data) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const updatedEntity = await store.update(id, {
                name: data.name,
                description: data.description
            }, tx);

            if (!updatedEntity) {
                await rollbackTransaction(tx);
                return null; // Entity not found
            }

            await commitTransaction(tx);
            return updatedEntity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete entity by ID
     */
    async deleteEntity(id) {
        const tx = createTransaction();
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
}