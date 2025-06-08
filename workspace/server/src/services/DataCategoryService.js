import { RefinableItemService } from './RefinableItemService.js';
import { dataCategoryStore } from '../store/index.js';

export class DataCategoryService extends RefinableItemService {
    constructor() {
        super(dataCategoryStore);
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
    async listDataCategories(userId) {
        return this.listEntities(userId);
    }

    async getDataCategory(id, userId) {
        return this.getEntity(id, userId);
    }

    async createDataCategory(data, userId) {
        return this.createEntity(data, userId);
    }

    async updateDataCategory(id, data, userId) {
        return this.updateEntity(id, data, userId);
    }

    async deleteDataCategory(id, userId) {
        return this.deleteEntity(id, userId);
    }

    // Add any DataCategory-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new DataCategoryService();