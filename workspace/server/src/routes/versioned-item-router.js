import { Router } from 'express';
import { StoreErrorCode } from '../store/transaction.js';
import { ServiceErrorCode } from '../services/service-error.js';
import { getUser as resolveReqUser, getUserOptional as resolveReqUserOptional } from './request-user.js';

/**
 * VersionedItemRouter provides versioned CRUD routes for operational entity services.
 * Handles versioned REST operations with user context, optimistic locking, edition context, content filtering, and consistent error handling.
 */
export class VersionedItemRouter {
    constructor(service, entityName, entityDisplayName = null) {
        this.service = service;
        this.entityName = entityName;
        this.entityDisplayName = entityDisplayName || entityName;
        this.router = Router();
        this.setupRoutes();
    }

    /**
     * The acting user — throws if anonymous. Delegates to the shared helper;
     * identity is resolved by the resolveUser() middleware (role is server-derived).
     */
    getUser(req) {
        return resolveReqUser(req);
    }

    /**
     * The acting user, or null if anonymous. Read-only routes.
     */
    getUserOptional(req) {
        return resolveReqUserOptional(req);
    }

    /**
     * Extract edition ID from query parameters
     */
    getEditionId(req) {
        return req.query.edition || null;
    }

    /**
     * Extract the lifecycle face (dataset selector) from query parameters.
     * Defaults to 'active'. Mutual exclusivity with `edition` is enforced
     * by the service (_assertFaceEditionExclusive); the route forwards both.
     */
    getLifecycleFace(req) {
        return req.query.lifecycleFace || 'active';
    }

    /**
     * Extract and validate projection from query parameters
     * @param {Object} req - Express request object
     * @param {string[]} allowed - Allowed projection values for this endpoint
     * @returns {string} projection value
     */
    getProjection(req, allowed) {
        const projection = req.query.projection || 'standard';
        if (!allowed.includes(projection)) {
            throw new Error(`Invalid projection '${projection}'. Allowed values: ${allowed.join(', ')}`);
        }
        return projection;
    }

    /**
     * Extract content filters from query parameters
     * Must be implemented by concrete router classes for entity-specific filtering
     * @param {Object} req - Express request object
     * @returns {Object} filters object for the specific entity type
     */
    getContentFilters(req) {
        throw new Error('getContentFilters must be implemented by concrete router class');
    }

    setupRoutes() {
        // List all entities (repository or edition context, content filtered)
        this.router.get('/', async (req, res) => {
            try {
                const user = this.getUserOptional(req);
                const editionId = this.getEditionId(req);
                const lifecycleFace = this.getLifecycleFace(req);
                const filters = this.getContentFilters(req);
                const projection = this.getProjection(req, ['summary', 'standard']);

                console.log(`${this.service.constructor.name}.getAll() user: ${user?.id ?? null}, editionId: ${editionId}, lifecycleFace: ${lifecycleFace}, projection: ${projection}, filters:`, filters);
                const entities = await this.service.getAll(user, editionId, filters, projection, lifecycleFace);
                res.json(entities);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}s:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Edition not found') || error.message.includes('ODPEdition not found')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Invalid filter parameter') || error.message.includes('Invalid category ID') || error.message.includes('Invalid projection')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Get entity by ID (repository or edition context)
        this.router.get('/:id', async (req, res) => {
            try {
                const user = this.getUserOptional(req);
                const editionId = this.getEditionId(req);
                const lifecycleFace = this.getLifecycleFace(req);
                const projection = this.getProjection(req, ['standard', 'extended']);
                console.log(`${this.service.constructor.name}.getById() itemId: ${req.params.id}, user: ${user?.id ?? null}, editionId: ${editionId}, lifecycleFace: ${lifecycleFace}, projection: ${projection}`);
                const entity = await this.service.getById(req.params.id, user, editionId, projection, lifecycleFace);
                if (!entity) {
                    const context = editionId ? ` in edition ${editionId}` : '';
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found${context}` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Edition not found') || error.message.includes('ODPEdition not found')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Invalid projection')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Get specific version of entity (no multi-context support - version is explicit)
        this.router.get('/:id/versions/:versionNumber', async (req, res) => {
            try {
                const user = this.getUserOptional(req);
                const versionNumber = parseInt(req.params.versionNumber);
                console.log(`${this.service.constructor.name}.getByIdAndVersion() itemId: ${req.params.id}, version: ${versionNumber}, user: ${user?.id ?? null}`);
                const entity = await this.service.getByIdAndVersion(req.params.id, versionNumber, user);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} version ${versionNumber} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error fetching ${this.entityName} version:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Create new entity (creates Item + ItemVersion v1)
        this.router.post('/', async (req, res) => {
            try {
                const user = this.getUser(req);
                console.log(`${this.service.constructor.name}.create() user: ${user?.id ?? null}`);
                const entity = await this.service.create(req.body, user);
                res.status(201).json(entity);
            } catch (error) {
                console.error(`Error creating ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
                    res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
                    res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Update entity (creates new ItemVersion with complete replacement)
        this.router.put('/:id', async (req, res) => {
            try {
                const user = this.getUser(req);
                const expectedVersionId = req.body.expectedVersionId;
                if (!expectedVersionId) {
                    return res.status(400).json({
                        error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
                    });
                }

                console.log(`${this.service.constructor.name}.update() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, user: ${user?.id ?? null}`);
                const entity = await this.service.update(req.params.id, req.body, expectedVersionId, user);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error updating ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message === 'Outdated item version') {
                    res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Item has been modified by another user. Please refresh and try again.' } });
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
                    res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
                    res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Patch entity (creates new ItemVersion with partial updates)
        this.router.patch('/:id', async (req, res) => {
            try {
                const user = this.getUser(req);
                const expectedVersionId = req.body.expectedVersionId;
                if (!expectedVersionId) {
                    return res.status(400).json({
                        error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
                    });
                }

                console.log(`${this.service.constructor.name}.patch() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, user: ${user?.id ?? null}`);
                const entity = await this.service.patch(req.params.id, req.body, expectedVersionId, user);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error patching ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message === 'Outdated item version') {
                    res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Item has been modified by another user. Please refresh and try again.' } });
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
                    res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
                    res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Delete entity (Item + all versions)
        this.router.delete('/:id', async (req, res) => {
            try {
                const user = this.getUser(req);
                console.log(`${this.service.constructor.name}.delete() itemId: ${req.params.id}, user: ${user?.id ?? null}`);
                const deleted = await this.service.delete(req.params.id, user);
                if (!deleted) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.status(204).send();
            } catch (error) {
                console.error(`Error deleting ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Soft-delete entity (Active -> Deleted lifecycle edge move)
        // Body carries the change-set commit: { changeSetId, note? }
        this.router.post('/:id/delete', async (req, res) => {
            try {
                const user = this.getUser(req);
                const changeSetCommit = { changeSetId: req.body.changeSetId, note: req.body.note };
                console.log(`${this.service.constructor.name}.softDelete() itemId: ${req.params.id}, user: ${user?.id ?? null}`);
                const entity = await this.service.softDelete(req.params.id, changeSetCommit, user);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error soft-deleting ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.code === ServiceErrorCode.LIFECYCLE_BLOCKED) {
                    res.status(409).json({ error: { code: 'LIFECYCLE_BLOCKED', message: error.message }, references: error.references });
                } else if (error.code === ServiceErrorCode.INVALID_LIFECYCLE_STATE) {
                    res.status(409).json({ error: { code: 'INVALID_LIFECYCLE_STATE', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
                    res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
                    res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Restore entity (Deleted -> Active lifecycle edge move)
        // Body carries the change-set commit: { changeSetId, note? }
        this.router.post('/:id/restore', async (req, res) => {
            try {
                const user = this.getUser(req);
                const changeSetCommit = { changeSetId: req.body.changeSetId, note: req.body.note };
                console.log(`${this.service.constructor.name}.restore() itemId: ${req.params.id}, user: ${user?.id ?? null}`);
                const entity = await this.service.restore(req.params.id, changeSetCommit, user);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error restoring ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.code === ServiceErrorCode.INVALID_LIFECYCLE_STATE) {
                    res.status(409).json({ error: { code: 'INVALID_LIFECYCLE_STATE', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
                    res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
                } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
                    res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Preemptive where-used read: live O* items referencing this one.
        // Does not decide deletability — the client combines it with lifecycleStatus.
        this.router.get('/:id/inbound-references', async (req, res) => {
            try {
                const user = this.getUserOptional(req);
                console.log(`${this.service.constructor.name}.getInboundReferences() itemId: ${req.params.id}, user: ${user?.id ?? null}`);
                const references = await this.service.getInboundReferences(req.params.id, user);
                if (references === null) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(references);
            } catch (error) {
                console.error(`Error fetching inbound references for ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });
    }

    getRouter() {
        return this.router;
    }
}