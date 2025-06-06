import { RefinableEntityStore } from './refinable-entity-store.js';

/**
 * RegulatoryAspectStore provides data access operations for RegulatoryAspect entities.
 * Extends RefinableEntityStore to inherit both CRUD operations and REFINES hierarchy management.
 */
export class RegulatoryAspectStore extends RefinableEntityStore {
    constructor(driver) {
        super(driver, 'RegulatoryAspect');
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

    // Add any RegulatoryAspect-specific methods here if needed in the future
}