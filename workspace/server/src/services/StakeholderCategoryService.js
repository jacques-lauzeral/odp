import {
    stakeholderCategoryStore,
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

export class StakeholderCategoryService {
    async listStakeholderCategories() {
        const tx = createTransaction();
        try {
            const store = stakeholderCategoryStore();
            const categories = await store.findAll(tx);
            await commitTransaction(tx);
            return categories;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async getStakeholderCategory(id) {
        const tx = createTransaction();
        try {
            const store = stakeholderCategoryStore();
            const category = await store.findById(id, tx);
            await commitTransaction(tx);
            return category;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async createStakeholderCategory(data) {
        const tx = createTransaction();
        try {
            const store = stakeholderCategoryStore();
            const category = await store.create(data, tx);

            // Handle parentId if provided
            if (data.parentId) {
                await store.createRefinesRelation(category.id, data.parentId, tx);
            }

            await commitTransaction(tx);
            return category;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async updateStakeholderCategory(id, data) {
        const tx = createTransaction();
        try {
            const store = stakeholderCategoryStore();

            // Update the basic properties
            const updatedCategory = await store.update(id, {
                name: data.name,
                description: data.description
            }, tx);

            if (!updatedCategory) {
                await rollbackTransaction(tx);
                return null; // Category not found
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
            return updatedCategory;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async deleteStakeholderCategory(id) {
        const tx = createTransaction();
        try {
            const store = stakeholderCategoryStore();

            // Check if category has children
            const children = await store.findChildren(id, tx);
            if (children.length > 0) {
                await rollbackTransaction(tx);
                throw new Error('Cannot delete category with child categories');
            }

            // Remove parent relationship if exists
            const parent = await store.findParent(id, tx);
            if (parent) {
                await store.deleteRefinesRelation(id, parent.id, tx);
            }

            // Delete the category
            const deleted = await store.delete(id, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

// Export instance for generated controllers
export default new StakeholderCategoryService();