import { TreeItemService } from './TreeItemService.js';
import { regulatoryAspectStore } from '../store/index.js';

export class RegulatoryAspectService extends TreeItemService {
    constructor() {
        super(regulatoryAspectStore);
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
    async listRegulatoryAspects(userId) {
        return this.listItems(userId);
    }

    async getRegulatoryAspect(id, userId) {
        return this.getItem(id, userId);
    }

    async createRegulatoryAspect(data, userId) {
        return this.createItem(data, userId);
    }

    async updateRegulatoryAspect(id, data, userId) {
        return this.updateItem(id, data, userId);
    }

    async deleteRegulatoryAspect(id, userId) {
        return this.deleteItem(id, userId);
    }

    // Add any RegulatoryAspect-specific methods here if needed in the future
}

// Export instance for route handlers
export default new RegulatoryAspectService();