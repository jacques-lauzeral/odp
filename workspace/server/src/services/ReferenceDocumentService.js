import { TreeItemService } from './TreeItemService.js';
import { referenceDocumentStore } from '../store/index.js';

export class ReferenceDocumentService extends TreeItemService {
    constructor() {
        super(referenceDocumentStore);
    }

    // Inherits from TreeItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId) - with name validation + parentId support
    // - updateItem(id, data, userId) - with validation + parentId changes
    // - deleteItem(id, userId) - with hierarchy validation
    // - getChildren(parentId, userId)
    // - getParent(childId, userId)
    // - getRoots(userId)
    // - createRefinesRelation(childId, parentId, userId)
    // - deleteRefinesRelation(childId, parentId, userId)
    // - findItemsByName(namePattern, userId)
    // - isNameExists(name, excludeId, userId)

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