import { Router } from 'express';

/**
 * SimpleItemRouter provides common CRUD routes for simple item services.
 * Handles standard REST operations with user context and consistent error handling.
 * Updated to use consistent *Item method names.
 */
export class SimpleItemRouter {
    constructor(service, entityName, entityDisplayName = null) {
        this.service = service;
        this.entityName = entityName; // for logging (e.g., 'wave')
        this.entityDisplayName = entityDisplayName || entityName; // for error messages (e.g., 'Waves')
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
        // List all items
        this.router.get('/', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.listItems() userId: ${userId}`);
                const items = await this.service.listItems(userId);
                res.json(items);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}s:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Get item by ID
        this.router.get('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.getItem() id: ${req.params.id}, userId: ${userId}`);
                const item = await this.service.getItem(req.params.id, userId);
                if (!item) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(item);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}:`, error);
                if (error.message.includes('x-user-id')) {
                    res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
                } else {
                    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
                }
            }
        });

        // Create new item
        this.router.post('/', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.createItem() userId: ${userId}, parentId: ${req.body.parentId}`);
                const item = await this.service.createItem(req.body, userId);
                res.status(201).json(item);
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

        // Update item
        this.router.put('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.updateItem() id: ${req.params.id}, userId: ${userId}, parentId: ${req.body.parentId}`);
                const item = await this.service.updateItem(req.params.id, req.body, userId);
                if (!item) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(item);
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

        // Delete item
        this.router.delete('/:id', async (req, res) => {
            try {
                const userId = this.getUserId(req);
                console.log(`${this.service.constructor.name}.deleteItem() id: ${req.params.id}, userId: ${userId}`);
                const deleted = await this.service.deleteItem(req.params.id, userId);
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
                } else if (error.message.includes('child items') || error.message.includes('child entities') || error.message.includes('child categories')) {
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