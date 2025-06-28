import { TreeItemService } from './TreeItemService.js';
import { dataCategoryStore } from '../store/index.js';

export class DataCategoryService extends TreeItemService {
    constructor() {
        super(dataCategoryStore);
    }

    // Inherits from TreeItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId) - with name/description validation + parentId support
    // - updateItem(id, data, userId) - with validation + parentId changes
    // - deleteItem(id, userId) - with hierarchy validation
    // - getChildren(parentId, userId)
    // - getParent(childId, userId)
    // - getRoots(userId)
    // - createRefinesRelation(childId, parentId, userId)
    // - deleteRefinesRelation(childId, parentId, userId)
    // - findItemsByName(namePattern, userId)
    // - isNameExists(name, excludeId, userId)
    // - Legacy compatibility methods (listEntities, getEntity, etc.)

    // Legacy method names for backward compatibility
    async listDataCategories(userId) {
        return this.listItems(userId);
    }

    async getDataCategory(id, userId) {
        return this.getItem(id, userId);
    }

    async createDataCategory(data, userId) {
        return this.createItem(data, userId);
    }

    async updateDataCategory(id, data, userId) {
        return this.updateItem(id, data, userId);
    }

    async deleteDataCategory(id, userId) {
        return this.deleteItem(id, userId);
    }

    // Add any DataCategories-specific methods here if needed in the future
}

// Export instance for route handlers
export default new DataCategoryService();