import { RefinableEntityService } from './RefinableEntityService.js';
import { dataCategoryStore } from '../store/index.js';

export class DataCategoryService extends RefinableEntityService {
    constructor() {
        super(dataCategoryStore);
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

    async getDataCategory(id) {
        return this.getEntity(id);
    }

    async createDataCategory(data) {
        return this.createEntity(data);
    }

    async updateDataCategory(id, data) {
        return this.updateEntity(id, data);
    }

    async deleteDataCategory(id) {
        return this.deleteEntity(id);
    }

    // Add any DataCategory-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new DataCategoryService();