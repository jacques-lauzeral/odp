import { RefinableItemService } from './RefinableItemService.js';
import { regulatoryAspectStore } from '../store/index.js';

export class RegulatoryAspectService extends RefinableItemService {
    constructor() {
        super(regulatoryAspectStore);
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
    async listRegulatoryAspects(userId) {
        return this.listEntities(userId);
    }

    async getRegulatoryAspect(id, userId) {
        return this.getEntity(id, userId);
    }

    async createRegulatoryAspect(data, userId) {
        return this.createEntity(data, userId);
    }

    async updateRegulatoryAspect(id, data, userId) {
        return this.updateEntity(id, data, userId);
    }

    async deleteRegulatoryAspect(id, userId) {
        return this.deleteEntity(id, userId);
    }

    // Add any RegulatoryAspect-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new RegulatoryAspectService();