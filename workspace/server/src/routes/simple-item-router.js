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
     * Extract the acting user from request headers — throws if id absent.
     * Returns { id, role }; role is null when x-user-role is absent
     * (role validation / implicit population arrives with RBA).
     */
    getUser(req) {
        const id = req.headers['x-user-id'];
        if (!id) {
            throw new Error('Missing required header: x-user-id');
        }
        return { id, role: req.headers['x-user-role'] || null };
    }

    /**
     * Extract the acting user from request headers — returns null if id absent.
     * Used on read-only routes that allow anonymous access.
     */
    getUserOptional(req) {
        const id = req.headers['x-user-id'];
        if (!id) return null;
        return { id, role: req.headers['x-user-role'] || null };
    }

    setupRoutes() {
        // List all items
        this.router.get('/', async (req, res) => {
            try {
                const user = this.getUserOptional(req);
                console.log(`${this.service.constructor.name}.listItems() user: ${user?.id ?? null}`);
                const items = await this.service.listItems(user);
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
                const user = this.getUserOptional(req);
                console.log(`${this.service.constructor.name}.getItem() id: ${req.params.id}, user: ${user?.id ?? null}`);
                const item = await this.service.getItem(req.params.id, user);
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
                const user = this.getUser(req);
                console.log(`${this.service.constructor.name}.createItem() user: ${user?.id ?? null}, parentId: ${req.body.parentId}`);
                const item = await this.service.createItem(req.body, user);
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
                const user = this.getUser(req);
                console.log(`${this.service.constructor.name}.updateItem() id: ${req.params.id}, user: ${user?.id ?? null}, parentId: ${req.body.parentId}`);
                const item = await this.service.updateItem(req.params.id, req.body, user);
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
                const user = this.getUser(req);
                console.log(`${this.service.constructor.name}.deleteItem() id: ${req.params.id}, user: ${user?.id ?? null}`);
                const deleted = await this.service.deleteItem(req.params.id, user);
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