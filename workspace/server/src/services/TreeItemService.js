import { SimpleItemService } from './SimpleItemService.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

/**
 * TreeItemService extends SimpleItemService with name/description validation and REFINES hierarchy management.
 * Combines NamedItemService validation with RefinableItemService hierarchy operations.
 * Base class for setup entities like StakeholderCategories, DataCategories, Services.
 */
export class TreeItemService extends SimpleItemService {
    constructor(storeGetter) {
        super(storeGetter);
    }

    // Inherits from SimpleItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - Legacy compatibility methods

    // =============================================================================
    // VALIDATION IMPLEMENTATION - Required by SimpleItemService
    // =============================================================================

    /**
     * Validate data for tree item creation
     * Validates {name, description} structure and content
     */
    async _validateCreateData(data) {
        this._validateRequiredFields(data);
        this._validateFieldTypes(data);
        this._validateFieldContent(data);
    }

    /**
     * Validate data for tree item updates
     * Same validation as create for named items
     */
    async _validateUpdateData(data) {
        this._validateRequiredFields(data);
        this._validateFieldTypes(data);
        this._validateFieldContent(data);
    }

    // =============================================================================
    // VALIDATION HELPER METHODS (from NamedItemService)
    // =============================================================================

    /**
     * Validate required fields are present
     */
    _validateRequiredFields(data) {
        const requiredFields = ['name'];

        for (const field of requiredFields) {
            if (data[field] === undefined || data[field] === null) {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }

    /**
     * Validate field types
     */
    _validateFieldTypes(data) {
        const { name, description } = data;

        if (typeof name !== 'string') {
            throw new Error('Validation failed: name must be a string');
        }

        if (description && typeof description !== 'string') {
            throw new Error('Validation failed: description must be a string');
        }
    }

    /**
     * Validate field content
     */
    _validateFieldContent(data) {
        const { name, description } = data;

        // Name validation
        if (name.trim() === '') {
            throw new Error('Validation failed: name cannot be empty');
        }

        if (name.trim().length > 255) {
            throw new Error('Validation failed: name cannot exceed 255 characters');
        }

        if (description && description.trim().length > 2000) {
            throw new Error('Validation failed: description cannot exceed 2000 characters');
        }
    }

    // =============================================================================
    // OVERRIDDEN CRUD METHODS WITH HIERARCHY SUPPORT (from RefinableItemService)
    // =============================================================================

    /**
     * Create new item with optional parent relationship
     */
    async createItem(data, userId) {
        // Validate data first
        await this._validateCreateData(data);

        const tx = createTransaction(userId);
        try {
            console.log('TreeItemService.createItem() parentId:', data.parentId);
            const store = this.getStore();
            const item = await store.create(data, tx);

            // Handle parentId if provided
            if (data.parentId !== null && data.parentId !== undefined) {
                await store.createRefinesRelation(item.id, data.parentId, tx);
            }

            await commitTransaction(tx);
            return item;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update item with optional parent relationship changes
     */
    async updateItem(id, data, userId) {
        // Validate data first
        await this._validateUpdateData(data);

        const tx = createTransaction(userId);
        try {
            console.log('TreeItemService.updateItem() id:', id, ', parentId:', data.parentId);
            const store = this.getStore();

            // Update the basic properties
            const updatedItem = await store.update(id, {
                name: data.name,
                description: data.description
            }, tx);

            if (!updatedItem) {
                await rollbackTransaction(tx);
                return null; // Item not found
            }

            // Handle parentId changes
            if (data.hasOwnProperty('parentId')) {
                // First, remove existing parent relationship
                const currentParent = await store.findParent(id, tx);
                if (currentParent) {
                    await store.deleteRefinesRelation(id, currentParent.id, tx);
                }

                // Then, create new parent relationship if provided
                if (data.parentId !== null && data.parentId !== undefined) {
                    await store.createRefinesRelation(id, data.parentId, tx);
                }
            }

            await commitTransaction(tx);
            return updatedItem;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete item with hierarchy validation
     */
    async deleteItem(id, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            // Check if item has children
            const children = await store.findChildren(id, tx);
            if (children.length > 0) {
                await rollbackTransaction(tx);
                throw new Error('Cannot delete item with child items');
            }

            // Remove parent relationship if exists
            const parent = await store.findParent(id, tx);
            if (parent) {
                await store.deleteRefinesRelation(id, parent.id, tx);
            }

            // Delete the item
            const deleted = await store.delete(id, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // =============================================================================
    // HIERARCHY MANAGEMENT METHODS (from RefinableItemService)
    // =============================================================================

    /**
     * Get direct children of an item
     */
    async getChildren(parentId, userId) {
        const tx = createTransaction(userId);
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
     * Get parent of an item
     */
    async getParent(childId, userId) {
        const tx = createTransaction(userId);
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
     * Get all root items (no parent)
     */
    async getRoots(userId) {
        const tx = createTransaction(userId);
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
     * Create REFINES relationship between items
     */
    async createRefinesRelation(childId, parentId, userId) {
        const tx = createTransaction(userId);
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
     * Delete REFINES relationship between items
     */
    async deleteRefinesRelation(childId, parentId, userId) {
        const tx = createTransaction(userId);
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

    // =============================================================================
    // ADDITIONAL UTILITY METHODS
    // =============================================================================

    /**
     * Find items by name pattern (case-insensitive search)
     */
    async findItemsByName(namePattern, userId) {
        const items = await this.listItems(userId);
        const pattern = namePattern.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(pattern)
        );
    }

    /**
     * Check if item name already exists
     */
    async isNameExists(name, excludeId = null, userId) {
        const items = await this.listItems(userId);
        return items.some(item =>
            item.name.toLowerCase() === name.toLowerCase() &&
            (excludeId === null || item.id !== excludeId)
        );
    }
}