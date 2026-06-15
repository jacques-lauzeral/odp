import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore
} from '../store/index.js';
import changeSetService from './ChangeSetService.js';

/**
 * VersionedItemService provides versioned CRUD operations with transaction management and user context.
 * Root class for operational entities (versioned with optimistic locking).
 *
 * Multi-context support:
 *   - No context: latest versions
 *   - Baseline context: baselineId provided
 *   - Edition context: editionId provided — service resolves to {baselineId, editionId} via
 *     odpEditionStore().resolveContext(), then passes both to the store
 *
 * baselineId and editionId are mutually exclusive. Wave filtering has been removed —
 * edition content selection is pre-computed at edition creation time.
 */
export class VersionedItemService {
    constructor(storeGetter) {
        this.storeGetter = storeGetter;
    }

    /**
     * Get store instance using the provided getter function
     */
    getStore() {
        return this.storeGetter();
    }

    /**
     * Create new versioned entity (creates Item + ItemVersion v1)
     */
    async create(payload, userId) {
        const { data, changeSetCommit } = this._extractChangeSetCommit(payload);
        await this._validateCreatePayload(data);

        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const entity = await store.create(data, tx, changeSetCommit);
            await changeSetService.hydrateInto(entity, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Update versioned entity (creates new ItemVersion)
     */
    async update(itemId, payload, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            return await this._doUpdate(itemId, payload, expectedVersionId, tx);
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _doUpdate(itemId, payload, expectedVersionId, tx) {
        const { data, changeSetCommit } = this._extractChangeSetCommit(payload);
        await this._validateUpdatePayload(data, itemId);
        const store = this.getStore();
        const entity = await store.update(itemId, data, expectedVersionId, tx, changeSetCommit);
        await changeSetService.hydrateInto(entity, tx);
        await commitTransaction(tx);
        return entity;
    }

    /**
     * Patch versioned entity (partial update with field inheritance)
     */
    async patch(itemId, patchPayload, expectedVersionId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const { data: patchData, changeSetCommit } = this._extractChangeSetCommit(patchPayload);

            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Entity not found');
            }
            // changeSetCommit is a read-only field — never feed it back into a write
            delete current.changeSetCommit;

            const completePayload = await this._computePatchedPayload(current, patchData);
            await this._validateUpdatePayload(completePayload, itemId);

            const entity = await store.update(itemId, completePayload, expectedVersionId, tx, changeSetCommit);
            await changeSetService.hydrateInto(entity, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get entity by ID with optional edition context.
     * When editionId is provided, the service resolves it to {baselineId, editionId}
     * before calling the store.
     *
     * @param {number} itemId
     * @param {string} userId
     * @param {number|null} editionId - Edition context, or null for latest version
     * @param {string} projection
     */
    async getById(itemId, userId, editionId = null, projection = 'standard') {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            let resolvedBaselineId = null;
            let resolvedEditionId = null;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedEditionId = context.editionId;
            }

            const entity = await store.findById(itemId, tx, resolvedBaselineId, resolvedEditionId, projection);
            await changeSetService.hydrateInto(entity, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get entity by ID and specific version
     */
    async getByIdAndVersion(itemId, versionNumber, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const entity = await store.findByIdAndVersion(itemId, versionNumber, tx);
            await changeSetService.hydrateInto(entity, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Get version history for entity
     */
    async getVersionHistory(itemId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const history = await store.findVersionHistory(itemId, tx);
            await changeSetService.hydrateAll(history, tx);
            await commitTransaction(tx);
            return history;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * List all entities with optional edition context, content filtering, and projection.
     * When editionId is provided, the service resolves it to {baselineId, editionId} via
     * odpEditionStore().resolveContext() and passes both to the store.
     *
     * @param {string} userId
     * @param {number|null} editionId - Edition context, or null for latest versions
     * @param {object} filters - Content filters
     * @param {string} projection
     */
    async getAll(userId, editionId = null, filters = {}, projection = 'standard') {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();

            let resolvedBaselineId = null;
            let resolvedFilters = filters;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedFilters = { ...filters, editionId: context.editionId };
            }

            const entities = await store.findAll(tx, resolvedBaselineId, resolvedFilters, projection);
            await changeSetService.hydrateAll(entities, tx);
            await commitTransaction(tx);
            return entities;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Delete entity (Item + all versions)
     */
    async delete(itemId, userId) {
        const tx = createTransaction(userId);
        try {
            const store = this.getStore();
            const deleted = await store.delete(itemId, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // Abstract validation methods - must be implemented by subclasses
    async _validateCreatePayload(payload) {
        throw new Error('_validateCreatePayload must be implemented by subclass');
    }

    async _validateUpdatePayload(payload, itemId) {
        throw new Error('_validateUpdatePayload must be implemented by subclass');
    }

    // Abstract patch method - must be implemented by subclasses for entity-specific field merging
    async _computePatchedPayload(current, patchPayload) {
        throw new Error('_computePatchedPayload must be implemented by subclass');
    }

    /**
     * Split the commit metadata out of a request message. Routes stay pass-through
     * (they hand the body over untransformed); the message→domain split happens here.
     * Returns the entity `data` (without changeSetId/note) and the `changeSetCommit`
     * { changeSetId, note } threaded to the store. `note` is the optional top-level
     * per-object annotation — distinct from any nested reference notes.
     *
     * @param {object} payload - request message body
     * @returns {{data: object, changeSetCommit: {changeSetId: *, note: *}}}
     */
    _extractChangeSetCommit(payload) {
        const { changeSetId, note, ...data } = payload;
        return { data, changeSetCommit: { changeSetId, note } };
    }

    /**
     * Check whether a TipTap document JSON string is empty (null, unparseable,
     * not a doc node, or has no content blocks).
     * @param {string|null} value
     * @returns {boolean}
     */
    _isContentEmpty(value) {
        if (!value) return true;
        try {
            const doc = typeof value === 'string' ? JSON.parse(value) : value;
            return doc.type !== 'doc' || !Array.isArray(doc.content) || doc.content.length === 0;
        } catch {
            return true;
        }
    }

    /**
     * Override in subclasses to declare which fields contain Delta JSON strings.
     * @returns {string[]}
     */
    _getDeltaFieldNames() {
        return [];
    }

    /**
     * Sanitize Delta JSON fields in the payload by removing raw control characters
     * (U+0000–U+001F, excluding tab \t, newline \n, carriage return \r) that would
     * cause JSON.parse to fail downstream.
     *
     * Mutates the payload in place. Logs a warning for each field that required fixing.
     *
     * @param {object} payload
     * @param {string} context - Human-readable label for logging (e.g. "ON 1234 (My Title)")
     */
    _sanitizeDeltaFields(payload, context) {
        const fields = this._getDeltaFieldNames();
        for (const field of fields) {
            const value = payload[field];
            if (typeof value !== 'string' || value === '') continue;
            // Remove control characters that are illegal inside JSON strings
            // Keep \t (0x09), \n (0x0A), \r (0x0D) — JSON.stringify escapes these correctly
            const sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
            if (sanitized !== value) {
                console.warn(`[VersionedItemService] Sanitized illegal control characters from ${context} field "${field}"`);
                payload[field] = sanitized;
            }
        }
    }
}