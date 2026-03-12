import { RefinableEntityStore } from './refinable-entity-store.js';

/**
 * DomainStore provides data access operations for Domain nodes.
 * Extends RefinableEntityStore to inherit both CRUD operations and REFINES hierarchy management.
 */
export class DomainStore extends RefinableEntityStore {
    constructor(driver) {
        super(driver, 'Domain');
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
}