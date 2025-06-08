import { RefinableItemService } from './RefinableItemService.js';
import { serviceStore } from '../store/index.js';

export class ServiceService extends RefinableItemService {
    constructor() {
        super(serviceStore);
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
    async listServices(userId) {
        return this.listEntities(userId);
    }

    async getService(id, userId) {
        return this.getEntity(id, userId);
    }

    async createService(data, userId) {
        return this.createEntity(data, userId);
    }

    async updateService(id, data, userId) {
        return this.updateEntity(id, data, userId);
    }

    async deleteService(id, userId) {
        return this.deleteEntity(id, userId);
    }

    // Add any Service-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new ServiceService();