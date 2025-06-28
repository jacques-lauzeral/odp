import { Router } from 'express';

/**
 * VersionedItemRouter provides versioned CRUD routes for operational entity services.
 * Handles versioned REST operations with user context, optimistic locking, multi-context support, and consistent error handling.
 */
export class VersionedItemRouter {
    constructor(service, entityName, entityDisplayName = null) {
        this.service = service;
        this.entityName = entityName; // for logging (e.g., 'operational-requirement')
        this.entityDisplayName = entityDisplayName || entityName; // for error messages (e.g., 'Operational Requirement')
        this.router = Router();
        this.setupRoutes();
    }

    /**
     * Extract userId from request headers
     */
    getUserId(req) {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            throw new Error('Missing required header: x-user-id');
        }
        return userId;
    }

    /**
     * Extract baseline ID from query parameters
     */
    getBaselineId(req) {
        return req.query.baseline || null;
    }

    /**
     * Extract fromWave ID from query parameters
     */
    getFromWaveId(req) {
        return req.query.fromWave || null;
    }

    setupRoutes() {
        // List all entities (latest versions, baseline context, or wave filtered)
        this.router.get('/', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                const baselineId = this.getBaselineId(req);
                const fromWaveId = this.getFromWaveId(req);
                console.log(`${this.service.constructor.name}.getAll() userId: ${userId}, baselineId: ${baselineId}, fromWaveId: ${fromWaveId}`);
                const entities = await this.service.getAll(userId, baselineId, fromWaveId);
                res.json(entities);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}s:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Baseline not found') || error.message.includes('Waves not found')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Get entity by ID (latest version, baseline context, or wave filtered)
        this.router.get('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                const baselineId = this.getBaselineId(req);
                const fromWaveId = this.getFromWaveId(req);
                console.log(`${this.service.constructor.name}.getById() itemId: ${req.params.id}, userId: ${userId}, baselineId: ${baselineId}, fromWaveId: ${fromWaveId}`);
                const entity = await this.service.getById(req.params.id, userId, baselineId, fromWaveId);
                if (!entity) {
                    const context = baselineId ? ` in baseline ${baselineId}` : '';
                    const waveContext = fromWaveId ? ` (wave filtered)` : '';
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found${context}${waveContext}` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Baseline not found') || error.message.includes('Waves not found')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Get specific version of entity (no multi-context support - version is explicit)
        this.router.get('/:id/versions/:versionNumber', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                const versionNumber = parseInt(req.params.versionNumber);
                console.log(`${this.service.constructor.name}.getByIdAndVersion() itemId: ${req.params.id}, version: ${versionNumber}, userId: ${userId}`);
                const entity = await this.service.getByIdAndVersion(req.params.id, versionNumber, userId);
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

        // Get version history (no multi-context support - shows all versions)
        this.router.get('/:id/versions', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.getVersionHistory() itemId: ${req.params.id}, userId: ${userId}`);
                const history = await this.service.getVersionHistory(req.params.id, userId);
                res.json(history);
            } catch (error) {
                console.error(`Error fetching ${this.entityName} version history:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Item not found')) {
                    res.status(404).json({ error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Create new entity (creates Item + ItemVersion v1)
        this.router.post('/', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.create() userId: ${userId}`);
                const entity = await this.service.create(req.body, userId);
                res.status(201).json(entity);
            } catch (error) {
                console.error(`Error creating ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Update entity (creates new ItemVersion with complete replacement)
        this.router.put('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                const expectedVersionId = req.body.expectedVersionId;
                if (!expectedVersionId) {
                    return res.status(400).json({
                        error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
                    });
                }

                console.log(`${this.service.constructor.name}.update() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
                const entity = await this.service.update(req.params.id, req.body, expectedVersionId, userId);
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
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Patch entity (creates new ItemVersion with partial updates)
        this.router.patch('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                const expectedVersionId = req.body.expectedVersionId;
                if (!expectedVersionId) {
                    return res.status(400).json({
                        error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
                    });
                }

                console.log(`${this.service.constructor.name}.patch() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
                const entity = await this.service.patch(req.params.id, req.body, expectedVersionId, userId);
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
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Delete entity (Item + all versions)
        this.router.delete('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.delete() itemId: ${req.params.id}, userId: ${userId}`);
                const deleted = await this.service.delete(req.params.id, userId);
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
    }

    getRouter() {
        return this.router;
    }
}