import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore
} from '../store/index.js';

/**
 * VersionedItemService provides versioned CRUD operations with transaction management and user context.
 * Root class for operational entities (versioned with optimistic locking).
 *
 * Phase A (audit foundation):
 * - userId replaced by user {id, role} throughout — createTransaction(user.id, user.role)
 * - changeSetService.hydrateInto / hydrateAll removed from all read methods
 * - getVersionHistory removed — History served by AuditEventService.getItemHistory
 * - patch() no longer strips changeSetCommit from current (field no longer on read shape)
 *
 * Multi-context support:
 *   - No context: latest versions
 *   - Baseline context: baselineId provided
 *   - Edition context: editionId provided — service resolves to {baselineId, editionId} via
 *     odpEditionStore().resolveContext(), then passes both to the store
 */
export class VersionedItemService {
    constructor(storeGetter) {
        this.storeGetter = storeGetter;
    }

    getStore() {
        return this.storeGetter();
    }

    // -------------------------------------------------------------------------
    // Write methods
    // -------------------------------------------------------------------------

    async create(payload, user) {
        const { data, changeSetCommit } = this._extractChangeSetCommit(payload);
        await this._validateCreatePayload(data);

        const tx = createTransaction(user.id, user.role);
        try {
            const entity = await this.getStore().create(data, tx, changeSetCommit);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async update(itemId, payload, expectedVersionId, user) {
        const tx = createTransaction(user.id, user.role);
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
        const entity = await this.getStore().update(itemId, data, expectedVersionId, tx, changeSetCommit);
        await commitTransaction(tx);
        return entity;
    }

    async patch(itemId, patchPayload, expectedVersionId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const store = this.getStore();
            const { data: patchData, changeSetCommit } = this._extractChangeSetCommit(patchPayload);

            const current = await store.findById(itemId, tx);
            if (!current) {
                throw new Error('Entity not found');
            }

            const completePayload = await this._computePatchedPayload(current, patchData);
            await this._validateUpdatePayload(completePayload, itemId);

            const entity = await store.update(itemId, completePayload, expectedVersionId, tx, changeSetCommit);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async delete(itemId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const deleted = await this.getStore().delete(itemId, tx);
            await commitTransaction(tx);
            return deleted;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Read methods
    // -------------------------------------------------------------------------

    async getById(itemId, user, editionId = null, projection = 'standard') {
        const tx = createTransaction(user.id, user.role);
        try {
            let resolvedBaselineId = null;
            let resolvedEditionId  = null;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedEditionId  = context.editionId;
            }

            const entity = await this.getStore().findById(itemId, tx, resolvedBaselineId, resolvedEditionId, projection);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async getByIdAndVersion(itemId, versionNumber, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const entity = await this.getStore().findByIdAndVersion(itemId, versionNumber, tx);
            await commitTransaction(tx);
            return entity;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async getAll(user, editionId = null, filters = {}, projection = 'standard') {
        const tx = createTransaction(user.id, user.role);
        try {
            let resolvedBaselineId = null;
            let resolvedFilters    = filters;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedFilters    = { ...filters, editionId: context.editionId };
            }

            const entities = await this.getStore().findAll(tx, resolvedBaselineId, resolvedFilters, projection);
            await commitTransaction(tx);
            return entities;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Abstract methods
    // -------------------------------------------------------------------------

    async _validateCreatePayload(payload) {
        throw new Error('_validateCreatePayload must be implemented by subclass');
    }

    async _validateUpdatePayload(payload, itemId) {
        throw new Error('_validateUpdatePayload must be implemented by subclass');
    }

    async _computePatchedPayload(current, patchPayload) {
        throw new Error('_computePatchedPayload must be implemented by subclass');
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Split changeSetId / note out of a request payload.
     * Routes stay pass-through; the message→domain split happens here.
     */
    _extractChangeSetCommit(payload) {
        const { changeSetId, note, ...data } = payload;
        return { data, changeSetCommit: { changeSetId, note } };
    }

    /**
     * Check whether a TipTap document JSON string is empty.
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
     */
    _getDeltaFieldNames() {
        return [];
    }

    /**
     * Sanitize Delta JSON fields — removes illegal control characters that would
     * cause JSON.parse to fail downstream. Mutates payload in place.
     */
    _sanitizeDeltaFields(payload, context) {
        const fields = this._getDeltaFieldNames();
        for (const field of fields) {
            const value = payload[field];
            if (typeof value !== 'string' || value === '') continue;
            const sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
            if (sanitized !== value) {
                console.warn(`[VersionedItemService] Sanitized illegal control characters from ${context} field "${field}"`);
                payload[field] = sanitized;
            }
        }
    }
}