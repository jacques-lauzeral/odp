import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    odpEditionStore
} from '../store/index.js';
import { allowedFields } from '../../../shared/src/index.js';
import { ServiceError, ServiceErrorCode } from './service-error.js';

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
 * Phase B (lifecycle & deletion):
 * - getById / getAll carry a `lifecycleFace` dataset selector (append-last, matching
 *   the store), mutually exclusive with editionId
 * - softDelete / restore — per-item lifecycle transitions, concrete on the base
 *   (ChapterService overrides them to throw, parallel to ChapterStore)
 * - getInboundReferences — live O* where-used read; the client/softDelete combine it
 *   with lifecycleStatus to decide deletability
 * - strict-payload rejection on create/update/patch via allowedFields()
 *
 * Multi-context support:
 *   - No context: latest versions
 *   - Baseline context: baselineId provided
 *   - Edition context: editionId provided — service resolves to {baselineId, editionId} via
 *     odpEditionStore().resolveContext(), then passes both to the store
 *   - Lifecycle face (live dataset only): lifecycleFace selects which lifecycle edge
 *     anchors the read; mutually exclusive with editionId
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
        this._assertNoUnexpectedFields(payload, 'create');
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
        this._assertNoUnexpectedFields(payload, 'update');
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
        this._assertNoUnexpectedFields(patchPayload, 'patch');
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
    // Lifecycle transitions (Phase B)
    //
    // Concrete on the base — the logic is identical for ON/OR and OC. ChapterService
    // overrides these to throw (chapters have no lifecycle), parallel to ChapterStore.
    // -------------------------------------------------------------------------

    /**
     * Soft delete: move the item from the Active face to the Deleted face.
     * Two-step precondition, both enforced here inside one transaction before any
     * mutation (Neo4j does not backstop either rule — only LATEST_VERSION is moved):
     *   1. Lifecycle-state guard — item must be Active and NOT Released. A released
     *      item's only sanctioned exits are release/decommission (DEL-06), so this is
     *      an invalid transition (INVALID_LIFECYCLE_STATE), not a 409. Note the store's
     *      softDelete enforces only the LATEST_VERSION-present edge guard; the
     *      "not released" rule lives here because the store would otherwise drop
     *      LATEST_VERSION on a still-released item.
     *   2. Reference guard — no live O* may reference the item. A non-empty list is a
     *      LIFECYCLE_BLOCKED refusal carrying the references.
     */
    async softDelete(itemId, changeSetCommit, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const current = await this.getStore().findById(itemId, tx);
            if (!current) {
                // Not found on the active face. Distinguish "doesn't exist at all"
                // (→ null → 404 at the route) from "exists but on another face"
                // (an invalid transition — only an Active item can be soft-deleted).
                const onAnyFace = await this._findOnAnyFace(itemId, tx);
                if (!onAnyFace) {
                    await commitTransaction(tx);
                    return null;
                }
                throw new ServiceError(
                    `Validation failed: cannot soft delete — item must be Active and not Released`,
                    ServiceErrorCode.INVALID_LIFECYCLE_STATE
                );
            }

            const { active, released } = current.lifecycleStatus;
            if (!active || released) {
                throw new ServiceError(
                    `Validation failed: cannot soft delete — item must be Active and not Released`,
                    ServiceErrorCode.INVALID_LIFECYCLE_STATE
                );
            }

            const references = await this.getStore().findInboundReferences(itemId, tx);
            if (references.length > 0) {
                throw new ServiceError(
                    `Cannot soft delete — item is referenced by ${references.length} live item(s)`,
                    ServiceErrorCode.LIFECYCLE_BLOCKED,
                    references
                );
            }

            await this.getStore().softDelete(itemId, changeSetCommit, tx);
            // Re-read the full item so the response carries title + lifecycleStatus.
            // After the transition the item is on the Deleted face, so read it there.
            const updated = await this.getStore().findById(itemId, tx, null, null, 'standard', 'deleted');
            await commitTransaction(tx);
            return updated;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Restore: move the item from the Deleted face back to Active.
     * Lifecycle-state guard ONLY — the item must be Deleted. There is no reference
     * guard: re-adding LATEST_VERSION cannot introduce a new blocker (§4.3).
     */
    async restore(itemId, changeSetCommit, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const current = await this.getStore().findById(itemId, tx, null, null, 'standard', 'deleted');
            if (!current) {
                // Not on the Deleted face. Distinguish "doesn't exist at all"
                // (→ null → 404) from "exists but not deleted" (invalid transition).
                const onAnyFace = await this._findOnAnyFace(itemId, tx);
                if (!onAnyFace) {
                    await commitTransaction(tx);
                    return null;
                }
                throw new ServiceError(
                    `Validation failed: cannot restore — item is not in the Deleted state`,
                    ServiceErrorCode.INVALID_LIFECYCLE_STATE
                );
            }

            await this.getStore().restore(itemId, changeSetCommit, tx);
            // Re-read the full item so the response carries title + lifecycleStatus.
            // After the transition the item is back on the Active face.
            const updated = await this.getStore().findById(itemId, tx, null, null, 'standard', 'active');
            await commitTransaction(tx);
            return updated;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Live O* items that reference this one (where-used). Returns
     * OperationalEntityReference[]. Does NOT decide deletability — the caller
     * combines this with the item's lifecycleStatus (a non-empty list and/or a
     * released state means the item cannot be soft-deleted). Backs the preemptive
     * GET /{item}/{id}/inbound-references; softDelete uses the store method directly
     * inside its own transaction.
     */
    async getInboundReferences(itemId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            // Existence guard: the where-used traversal returns an empty list for both a
            // nonexistent id and an existing-but-unreferenced item. Distinguish them by
            // confirming the target exists on some reachable face first. A deleted target
            // still resolves (one may inspect what referenced an item now in the bin);
            // only a truly-absent id yields null → 404 at the route.
            const exists = await this._findOnAnyFace(itemId, tx);
            if (!exists) {
                await commitTransaction(tx);
                return null;
            }

            const references = await this.getStore().findInboundReferences(itemId, tx);
            await commitTransaction(tx);
            return references;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Resolve an item across the reachable lifecycle faces, returning the first hit
     * or null if the id exists on no face. Only `active` and `deleted` are probed —
     * the only faces a transition can produce this round (release/decommission are
     * designed but not yet operable, DEL-06).
     */
    async _findOnAnyFace(itemId, tx) {
        const active = await this.getStore().findById(itemId, tx, null, null, 'standard', 'active');
        if (active) return active;
        return await this.getStore().findById(itemId, tx, null, null, 'standard', 'deleted');
    }

    // -------------------------------------------------------------------------
    // Read methods
    // -------------------------------------------------------------------------

    async getById(itemId, user, editionId = null, projection = 'standard', lifecycleFace = 'active') {
        this._assertFaceEditionExclusive(editionId, lifecycleFace);
        const tx = createTransaction(user.id, user.role);
        try {
            let resolvedBaselineId = null;
            let resolvedEditionId  = null;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedEditionId  = context.editionId;
            }

            const entity = await this.getStore().findById(
                itemId, tx, resolvedBaselineId, resolvedEditionId, projection, lifecycleFace
            );
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

    async getAll(user, editionId = null, filters = {}, projection = 'standard', lifecycleFace = 'active') {
        this._assertFaceEditionExclusive(editionId, lifecycleFace);
        const tx = createTransaction(user.id, user.role);
        try {
            let resolvedBaselineId = null;
            let resolvedFilters    = filters;

            if (editionId !== null) {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                resolvedBaselineId = context.baselineId;
                resolvedFilters    = { ...filters, editionId: context.editionId };
            }

            resolvedFilters = await this._resolveFilters(resolvedFilters, tx);

            const entities = await this.getStore().findAll(
                tx, resolvedBaselineId, resolvedFilters, projection, lifecycleFace
            );
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

    /**
     * Resolve / rewrite the content filter object before it reaches the store,
     * within the getAll transaction. Default is pass-through. Subclasses override
     * to expand business-level filter semantics into the flat shape the store
     * expects (e.g. descendant expansion of a hierarchical category filter).
     *
     * @param {object} filters
     * @param {Transaction} tx - the live getAll transaction
     * @returns {Promise<object>} the resolved filters
     */
    async _resolveFilters(filters, tx) {
        return filters;
    }

    async _validateCreatePayload(payload) {
        throw new Error('_validateCreatePayload must be implemented by subclass');
    }

    async _validateUpdatePayload(payload, itemId) {
        throw new Error('_validateUpdatePayload must be implemented by subclass');
    }

    async _computePatchedPayload(current, patchPayload) {
        throw new Error('_computePatchedPayload must be implemented by subclass');
    }

    /**
     * Return the messages.js request model for the given op ('create' | 'update' |
     * 'patch'), used by strict-payload validation. 'patch' returns the *update*
     * model: a patch is any subset of the fields writable on update, so the update
     * model's allowlist is the correct accepted set (the sparse patch literal carries
     * no entity keys and would wrongly reject them).
     *
     * Default returns null → no strict-payload check for that op (a service that has
     * not opted in is unaffected). Concrete services override to enable it.
     */
    _requestModelFor(op) {
        return null;
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
     * Strict-payload guard: reject any payload key not in the op's accepted-field set
     * (derived from the messages.js request model via allowedFields). Run on the RAW
     * payload — before _extractChangeSetCommit — because the request models include the
     * ChangeSetCommit fields (changeSetId, note) in their allowlist. A stray field is a
     * client error and fails fast with a 'Validation failed:' message (routes already
     * map that prefix to 400) rather than ending up as an inert orphan on the version.
     *
     * No-op when the service does not declare a request model for the op
     * (_requestModelFor returns null).
     */
    _assertNoUnexpectedFields(payload, op) {
        const model = this._requestModelFor(op);
        if (!model) return;
        const allowed = new Set(allowedFields(model));
        const unexpected = Object.keys(payload).filter(k => !allowed.has(k));
        if (unexpected.length > 0) {
            throw new Error(`Validation failed: unexpected field(s): ${unexpected.join(', ')}`);
        }
    }

    /**
     * Dataset selectors editionId (baseline-snapshot) and a non-default lifecycleFace
     * (live face) are mutually exclusive — supplying both is a client error.
     */
    _assertFaceEditionExclusive(editionId, lifecycleFace) {
        if (editionId !== null && lifecycleFace !== 'active') {
            throw new ServiceError(
                `Validation failed: editionId and lifecycleFace='${lifecycleFace}' are mutually exclusive`,
                ServiceErrorCode.BAD_REQUEST
            );
        }
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