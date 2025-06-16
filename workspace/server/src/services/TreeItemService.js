import { TreeItemService } from './TreeItemService.js';
import {
    stakeholderCategoryStore,
    dataCategoryStore,
    serviceStore,
    regulatoryAspectStore
} from '../store/index.js';

// =============================================================================
// STAKEHOLDER CATEGORY SERVICE
// =============================================================================

export class StakeholderCategoryService extends TreeItemService {
    constructor() {
        super(stakeholderCategoryStore);
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
    // - Legacy compatibility methods

    // Legacy method names for backward compatibility
    async listStakeholderCategories(userId) {
        return this.listItems(userId);
    }

    async getStakeholderCategory(id, userId) {
        return this.getItem(id, userId);
    }

    async createStakeholderCategory(data, userId) {
        return this.createItem(data, userId);
    }

    async updateStakeholderCategory(id, data, userId) {
        return this.updateItem(id, data, userId);
    }

    async deleteStakeholderCategory(id, userId) {
        return this.deleteItem(id, userId);
    }
}

// =============================================================================
// DATA CATEGORY SERVICE
// =============================================================================

export class DataCategoryService extends TreeItemService {
    constructor() {
        super(dataCategoryStore);
    }

    // Inherits all TreeItemService functionality

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
}

// =============================================================================
// SERVICE SERVICE
// =============================================================================

export class ServiceService extends TreeItemService {
    constructor() {
        super(serviceStore);
    }

    // Inherits all TreeItemService functionality

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
}

// =============================================================================
// REGULATORY ASPECT SERVICE
// =============================================================================

export class RegulatoryAspectService extends TreeItemService {
    constructor() {
        super(regulatoryAspectStore);
    }

    // Inherits all TreeItemService functionality

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
}

// =============================================================================
// EXPORT INSTANCES FOR ROUTE HANDLERS
// =============================================================================

export default {
    stakeholderCategory: new StakeholderCategoryService(),
    dataCategory: new DataCategoryService(),
    service: new ServiceService(),
    regulatoryAspect: new RegulatoryAspectService()
};

// Individual exports for direct imports
export const stakeholderCategoryService = new StakeholderCategoryService();
export const dataCategoryService = new DataCategoryService();
export const serviceService = new ServiceService();
export const regulatoryAspectService = new RegulatoryAspectService();