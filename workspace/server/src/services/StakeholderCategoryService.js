import { RefinableItemService } from './RefinableItemService.js';
import { stakeholderCategoryStore } from '../store/index.js';

export class StakeholderCategoryService extends RefinableItemService {
    constructor() {
        super(stakeholderCategoryStore);
    }

    // Inherits from RefinableItemService:
    // - createEntity(data, userId) - with parentId support
    // - updateEntity(id, data, userId) - with parentId changes
    // - deleteEntity(id, userId) - with hierarchy validation
    // - getChildren(parentId, userId)
    // - getParent(childId, userId)
    // - getRoots(userId)
    // - createRefinesRelation(childId, parentId, userId)
    // - deleteRefinesRelation(childId, parentId, userId)
    //
    // Inherits from SimpleItemService:
    // - listEntities(userId)
    // - getEntity(id, userId)

    // Legacy method names for backward compatibility
    async listStakeholderCategories(userId) {
        return this.listEntities(userId);
    }

    async getStakeholderCategory(id, userId) {
        return this.getEntity(id, userId);
    }

    async createStakeholderCategory(data, userId) {
        return this.createEntity(data, userId);
    }

    async updateStakeholderCategory(id, data, userId) {
        return this.updateEntity(id, data, userId);
    }

    async deleteStakeholderCategory(id, userId) {
        return this.deleteEntity(id, userId);
    }

    // Add any StakeholderCategory-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new StakeholderCategoryService();