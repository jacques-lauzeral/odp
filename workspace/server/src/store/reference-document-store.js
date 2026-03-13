import { RefinableEntityStore } from './refinable-entity-store.js';

/**
 * ReferenceDocumentStore provides data access operations for ReferenceDocument nodes.
 * Extends RefinableEntityStore to inherit CRUD operations and REFINES hierarchy management.
 */
export class ReferenceDocumentStore extends RefinableEntityStore {
    constructor(driver) {
        super(driver, 'ReferenceDocument');
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