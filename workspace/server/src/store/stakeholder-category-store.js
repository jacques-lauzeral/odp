import { RefinableEntityStore } from './refinable-entity-store.js';

/**
 * StakeholderCategoryStore provides data access operations for StakeholderCategory entities.
 * Extends RefinableEntityStore to inherit both CRUD operations and REFINES hierarchy management.
 */
export class StakeholderCategoryStore extends RefinableEntityStore {
    constructor(driver) {
        super(driver, 'StakeholderCategory');
    }

    // Inherits from RefinableEntityStore:
    // - createRefinesRelation(childId, parentId, transaction)
    // - deleteRefinesRelation(childId, parentId, transaction)
    // - findChildren(parentId, transaction)
    // - findParent(childId, transaction)
    // - findRoots(transaction)
    //
    // Inherits from BaseStore:
    // - create(data, transaction)
    // - findById(id, transaction)
    // - findAll(transaction)
    // - update(id, data, transaction)
    // - delete(id, transaction)
    // - exists(id, transaction)

    // Add any StakeholderCategory-specific methods here if needed in the future
}