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
}

// Export instance for generated controllers
export default new StakeholderCategoryService();