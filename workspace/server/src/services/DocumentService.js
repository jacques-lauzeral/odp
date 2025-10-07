import { SimpleItemService } from './SimpleItemService.js';
import { documentStore } from '../store/index.js';

/**
 * DocumentService provides CRUD operations for Document entities.
 * Extends SimpleItemService with Document-specific validation.
 * Handles reference documents (ConOPS, regulations, strategic plans, etc.).
 */
export class DocumentService extends SimpleItemService {
    constructor() {
        super(documentStore);
    }

    // Inherits from SimpleItemService:
    // - listItems(userId)
    // - getItem(id, userId)
    // - createItem(data, userId) - with Document validation
    // - updateItem(id, data, userId) - with Document validation
    // - deleteItem(id, userId)

    // =============================================================================
    // VALIDATION IMPLEMENTATION - Required by SimpleItemService
    // =============================================================================

    /**
     * Validate data for document creation
     */
    async _validateCreateData(data) {
        this._validateDocumentData(data);
    }

    /**
     * Validate data for document updates
     */
    async _validateUpdateData(data) {
        this._validateDocumentData(data);
    }

    // =============================================================================
    // DOCUMENT-SPECIFIC VALIDATION METHODS
    // =============================================================================

    /**
     * Validate complete document data
     */
    _validateDocumentData(data) {
        const { name, version, description, url } = data;

        // Required fields
        if (!name || typeof name !== 'string' || name.trim() === '') {
            throw new Error('Validation failed: name is required and must be a non-empty string');
        }

        // Optional fields validation
        if (version !== undefined && version !== null && typeof version !== 'string') {
            throw new Error('Validation failed: version must be a string');
        }

        if (description !== undefined && description !== null && typeof description !== 'string') {
            throw new Error('Validation failed: description must be a string');
        }

        if (url !== undefined && url !== null) {
            if (typeof url !== 'string') {
                throw new Error('Validation failed: url must be a string');
            }
            this._validateUrl(url);
        }
    }

    /**
     * Validate URL format (basic validation)
     */
    _validateUrl(url) {
        if (!url || url.trim() === '') {
            return; // Empty URL is allowed (optional field)
        }

        // Basic URL format validation
        try {
            new URL(url);
        } catch (error) {
            throw new Error('Validation failed: url must be a valid URL format');
        }
    }

    // =============================================================================
    // DOCUMENT-SPECIFIC UTILITY METHODS
    // =============================================================================

    /**
     * Find documents by name pattern
     */
    async findDocumentsByName(namePattern, userId) {
        const documents = await this.listItems(userId);
        return documents.filter(doc =>
            doc.name.toLowerCase().includes(namePattern.toLowerCase())
        );
    }

    /**
     * Find documents by version
     */
    async findDocumentsByVersion(version, userId) {
        const documents = await this.listItems(userId);
        return documents.filter(doc => doc.version === version);
    }

    /**
     * Check if document with same name and version exists
     */
    async isDocumentExists(name, version, excludeId = null, userId) {
        const documents = await this.listItems(userId);
        return documents.some(doc =>
            doc.name === name &&
            doc.version === version &&
            (excludeId === null || doc.id !== excludeId)
        );
    }

    // =============================================================================
    // LEGACY COMPATIBILITY METHODS
    // For backward compatibility with existing CLI/router code if needed
    // =============================================================================

    /**
     * @deprecated Use listItems() instead
     */
    async listDocuments(userId) {
        return this.listItems(userId);
    }

    /**
     * @deprecated Use getItem() instead
     */
    async getDocument(id, userId) {
        return this.getItem(id, userId);
    }

    /**
     * @deprecated Use createItem() instead
     */
    async createDocument(data, userId) {
        return this.createItem(data, userId);
    }

    /**
     * @deprecated Use updateItem() instead
     */
    async updateDocument(id, data, userId) {
        return this.updateItem(id, data, userId);
    }

    /**
     * @deprecated Use deleteItem() instead
     */
    async deleteDocument(id, userId) {
        return this.deleteItem(id, userId);
    }
}

// Export instance for route handlers
export default new DocumentService();