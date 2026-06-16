import { TreeItemService } from './TreeItemService.js';
import { referenceDocumentStore } from '../store/index.js';

export class ReferenceDocumentService extends TreeItemService {
    constructor() {
        super(referenceDocumentStore);
    }

    // Inherits from TreeItemService:
    // - listItems(user)
    // - getItem(id, user)
    // - createItem(data, user) - with name validation + parentId support
    // - updateItem(id, data, user) - with validation + parentId changes
    // - deleteItem(id, user) - with hierarchy validation
    // - getChildren(parentId, user)
    // - getParent(childId, user)
    // - getRoots(user)
    // - createRefinesRelation(childId, parentId, user)
    // - deleteRefinesRelation(childId, parentId, user)
    // - findItemsByName(namePattern, user)
    // - isNameExists(name, excludeId, user)

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
        if (data.description !== undefined && data.description !== null && typeof data.description !== 'string') {
            throw new Error('Validation failed: description must be a string');
        }
    }
}

export default new ReferenceDocumentService();