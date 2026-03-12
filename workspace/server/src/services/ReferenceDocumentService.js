import { SimpleItemService } from './SimpleItemService.js';
import { referenceDocumentStore } from '../store/index.js';

export class ReferenceDocumentService extends SimpleItemService {
    constructor() {
        super(referenceDocumentStore);
    }

    // Inherits from SimpleItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId)
    // - updateItem(id, data, userId)
    // - deleteItem(id, userId)

    async _validateCreateData(data) {
        this._validateRequiredFields(data);
    }

    async _validateUpdateData(data) {
        this._validateRequiredFields(data);
    }

    _validateRequiredFields(data) {
        const requiredFields = ['name', 'url'];
        for (const field of requiredFields) {
            if (data[field] === undefined || data[field] === null || data[field].trim() === '') {
                throw new Error(`Validation failed: missing required field: ${field}`);
            }
        }
    }
}

export default new ReferenceDocumentService();