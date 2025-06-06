import { RefinableEntityService } from './RefinableEntityService.js';
import { regulatoryAspectStore } from '../store/index.js';

export class RegulatoryAspectService extends RefinableEntityService {
    constructor() {
        super(regulatoryAspectStore);
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

    async getRegulatoryAspect(id) {
        return this.getEntity(id);
    }

    async createRegulatoryAspect(data) {
        return this.createEntity(data);
    }

    async updateRegulatoryAspect(id, data) {
        return this.updateEntity(id, data);
    }

    async deleteRegulatoryAspect(id) {
        return this.deleteEntity(id);
    }

    // Add any RegulatoryAspect-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new RegulatoryAspectService();