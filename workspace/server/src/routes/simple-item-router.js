import { Router } from 'express';

/**
 * SimpleItemRouter provides common CRUD routes for simple entity services.
 * Handles standard REST operations with user context and consistent error handling.
 */
export class SimpleItemRouter {
    constructor(service, entityName, entityDisplayName = null) {
        this.service = service;
        this.entityName = entityName; // for logging (e.g., 'data-category')
        this.entityDisplayName = entityDisplayName || entityName; // for error messages (e.g., 'Data Category')
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

    setupRoutes() {
        // List all entities
        this.router.get('/', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.listEntities() userId: ${userId}`);
                const entities = await this.service.listEntities(userId);
                res.json(entities);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}s:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Get entity by ID
        this.router.get('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.getEntity() id: ${req.params.id}, userId: ${userId}`);
                const entity = await this.service.getEntity(req.params.id, userId);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Create new entity
        this.router.post('/', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.createEntity() userId: ${userId}, parentId: ${req.body.parentId}`);
                const entity = await this.service.createEntity(req.body, userId);
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

        // Update entity
        this.router.put('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.updateEntity() id: ${req.params.id}, userId: ${userId}, parentId: ${req.body.parentId}`);
                const entity = await this.service.updateEntity(req.params.id, req.body, userId);
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
                } else if (error.message.includes('Validation failed:')) {
                    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Delete entity
        this.router.delete('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.deleteEntity() id: ${req.params.id}, userId: ${userId}`);
                const deleted = await this.service.deleteEntity(req.params.id, userId);
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
                } else if (error.message.includes('child entities') || error.message.includes('child categories')) {
                    res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
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