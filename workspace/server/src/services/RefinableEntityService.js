import { BaseService } from './BaseService.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

/**
 * RefinableEntityService extends BaseService with REFINES hierarchy management.
 * Provides hierarchy operations for entities that support tree structures.
 */
export class RefinableEntityService extends BaseService {
    constructor(storeGetter) {
        super(storeGetter);
    }

    /**
     * Create new entity with optional parent relationship
     */
    async createEntity(data) {
        const tx = createTransaction();
        try {
            console.log('RefinableEntityService.createEntity() parentId:', data.parentId);
            const store = this.getStore();
            const entity = await store.create(data, tx);

            // Handle parentId if provided
            if (data.parentId) {
                await store.createRefinesRelation(entity.id, data.parentId, tx);
            }

            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update entity with optional parent relationship changes
     */
    async updateEntity(id, data) {
        const tx = createTransaction();
        try {
            console.log('RefinableEntityService.createEntity() id:', id, ', parentId:', data.parentId);
            const store = this.getStore();

            // Update the basic properties
            const updatedEntity = await store.update(id, {
                name: data.name,
                description: data.description
            }, tx);

            if (!updatedEntity) {
                await rollbackTransaction(tx);
                return null; // Entity not found
            }

            // Handle parentId changes
            if (data.hasOwnProperty('parentId')) {
                // First, remove existing parent relationship
                const currentParent = await store.findParent(id, tx);
                if (currentParent) {
                    await store.deleteRefinesRelation(id, currentParent.id, tx);
                }

                // Then, create new parent relationship if provided
                if (data.parentId) {
                    await store.createRefinesRelation(id, data.parentId, tx);
                }
            }

            await commitTransaction(tx);
            return updatedEntity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete entity with hierarchy validation
     */
    async deleteEntity(id) {
        const tx = createTransaction();
        try {
            const store = this.getStore();

            // Check if entity has children
            const children = await store.findChildren(id, tx);
            if (children.length > 0) {
                await rollbackTransaction(tx);
                throw new Error('Cannot delete entity with child entities');
            }

            // Remove parent relationship if exists
            const parent = await store.findParent(id, tx);
            if (parent) {
                await store.deleteRefinesRelation(id, parent.id, tx);
            }

            // Delete the entity
            const deleted = await store.delete(id, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get direct children of an entity
     */
    async getChildren(parentId) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const children = await store.findChildren(parentId, tx);
            await commitTransaction(tx);
            return children;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get parent of an entity
     */
    async getParent(childId) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const parent = await store.findParent(childId, tx);
            await commitTransaction(tx);
            return parent;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get all root entities (no parent)
     */
    async getRoots() {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const roots = await store.findRoots(tx);
            await commitTransaction(tx);
            return roots;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Create REFINES relationship between entities
     */
    async createRefinesRelation(childId, parentId) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const success = await store.createRefinesRelation(childId, parentId, tx);
            await commitTransaction(tx);
            return success;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete REFINES relationship between entities
     */
    async deleteRefinesRelation(childId, parentId) {
        const tx = createTransaction();
        try {
            const store = this.getStore();
            const success = await store.deleteRefinesRelation(childId, parentId, tx);
            await commitTransaction(tx);
            return success;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}