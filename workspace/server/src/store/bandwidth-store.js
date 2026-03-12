import { BaseStore } from './base-store.js';

/**
 * BandwidthStore provides data access operations for Bandwidth nodes.
 * Extends BaseStore to inherit CRUD operations.
 *
 * Fields: year (integer), waveId (optional), scopeId (optional Domain ID).
 * The (year, waveId, scopeId) tuple is unique — enforced at the service layer.
 */
export class BandwidthStore extends BaseStore {
    constructor(driver) {
        super(driver, 'Bandwidth');
    }

    // Inherits from BaseStore:
    // - create(data, transaction)
    // - findById(id, transaction)
    // - findAll(transaction)
    // - update(id, data, transaction)
    // - delete(id, transaction)
    // - exists(id, transaction)
}