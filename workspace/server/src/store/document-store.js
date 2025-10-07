import { BaseStore } from './base-store.js';

/**
 * DocumentStore provides data access operations for Documents.
 * Extends BaseStore to inherit CRUD operations.
 */
export class DocumentStore extends BaseStore {
    constructor(driver) {
        super(driver, 'Document');
    }

    // Inherits from BaseStore:
    // - create(data, transaction)
    // - findById(id, transaction)
    // - findAll(transaction)
    // - update(id, data, transaction)
    // - delete(id, transaction)
    // - exists(id, transaction)

    // Add any Document-specific methods here if needed in the future
}