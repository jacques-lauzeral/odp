import { SimpleItemService } from './SimpleItemService.js';
import { waveStore } from '../store/index.js';

export class WaveService extends SimpleItemService {
    constructor() {
        super(waveStore);
    }

    // Inherits from SimpleItemService:
    // - createEntity(data, userId)
    // - updateEntity(id, data, userId)
    // - deleteEntity(id, userId)
    // - listEntities(userId)
    // - getEntity(id, userId)

    // Legacy method names for backward compatibility
    async listDataCategories(userId) {
        return this.listEntities(userId);
    }

    async getDataCategory(id, userId) {
        return this.getEntity(id, userId);
    }

    async createDataCategory(data, userId) {
        return this.createEntity(data, userId);
    }

    async updateDataCategory(id, data, userId) {
        return this.updateEntity(id, data, userId);
    }

    async deleteDataCategory(id, userId) {
        return this.deleteEntity(id, userId);
    }

    // Add any DataCategory-specific methods here if needed in the future
}

// Export instance for generated controllers
export default new WaveService();