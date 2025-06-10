import { BaseStore } from './base-store.js';

/**
 * WaveStore provides data access operations for Wavess.
 * Extends BaseStore to inherit CRUD operations.
 */
export class WaveStore extends BaseStore {
    constructor(driver) {
        super(driver, 'Wave');
    }

    // Inherits from BaseStore:
    // - create(data, transaction)
    // - findById(id, transaction)
    // - findAll(transaction)
    // - update(id, data, transaction)
    // - delete(id, transaction)
    // - exists(id, transaction)

    // Add any Data-specific methods here if needed in the future
}