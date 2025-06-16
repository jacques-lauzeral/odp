import { TreeItemService } from './TreeItemService.js';
import { serviceStore } from '../store/index.js';

export class ServiceService extends TreeItemService {
    constructor() {
        super(serviceStore);
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
    async listServices(userId) {
        return this.listItems(userId);
    }

    async getService(id, userId) {
        return this.getItem(id, userId);
    }

    async createService(data, userId) {
        return this.createItem(data, userId);
    }

    async updateService(id, data, userId) {
        return this.updateItem(id, data, userId);
    }

    async deleteService(id, userId) {
        return this.deleteItem(id, userId);
    }

    // Add any Service-specific methods here if needed in the future
}

// Export instance for route handlers
export default new ServiceService();