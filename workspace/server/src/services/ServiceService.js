import { RefinableEntityService } from './RefinableEntityService.js';
import { serviceStore } from '../store/index.js';

export class ServiceService extends RefinableEntityService {
    constructor() {
        super(serviceStore);
    }

    // Inherits from RefinableEntityService:
    // - createEntity(data) - with parentId support
    // - updateEntity(id, data) - with parentId changes
    // - deleteEntity(id) - with hierarchy validation
    // - getChildren(parentId)
    // - getParent(childId)
    // - getRoots()
    // - createRefinesRelation(childId, parentId)
    // - deleteRefinesRelation(childId, parentId)
    //
    // Inherits from BaseService:
    // - listEntities()
    // - getEntity(id)

    // Legacy method names for backward compatibility
    async listDataCategories() {
        return this.listEntities();
    }

    async getService(id) {
        return this.getEntity(id);
    }

    async createService(data) {
        return this.createEntity(data);
    }

    async updateService(id, data) {
        return this.updateEntity(id, data);
    }

    async deleteService(id) {
        return this.deleteEntity(id);
    }

    // Add any Service-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new ServiceService();