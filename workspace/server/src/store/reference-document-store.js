import { BaseStore } from './base-store.js';

/**
 * ReferenceDocumentStore provides data access operations for ReferenceDocument nodes.
 * Extends BaseStore to inherit CRUD operations.
 */
export class ReferenceDocumentStore extends BaseStore {
    constructor(driver) {
        super(driver, 'ReferenceDocument');
    }

    // Inherits from BaseStore:
    // - create(data, transaction)
    // - findById(id, transaction)
    // - findAll(transaction)
    // - update(id, data, transaction)
    // - delete(id, transaction)
    // - exists(id, transaction)
}