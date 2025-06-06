import { Router } from 'express';

/**
 * BaseRouter provides common CRUD routes for entity services.
 * Handles standard REST operations with consistent error handling.
 */
export class BaseRouter {
    constructor(service, entityName, entityDisplayName = null) {
        this.service = service;
        this.entityName = entityName; // for logging (e.g., 'stakeholder-category')
        this.entityDisplayName = entityDisplayName || entityName; // for error messages (e.g., 'Category')
        this.router = Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // List all entities
        this.router.get('/', async (req, res) => {
            try {
                console.log(`${this.service.constructor.name}.listEntities()`);
                const entities = await this.service.listEntities();
                res.json(entities);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}s:`, error);
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
            }
        });

        // Get entity by ID
        this.router.get('/:id', async (req, res) => {
            try {
                console.log(`${this.service.constructor.name}.getEntity() id:`, req.params.id);
                const entity = await this.service.getEntity(req.params.id);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error fetching ${this.entityName}:`, error);
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
            }
        });

        // Create new entity
        this.router.post('/', async (req, res) => {
            try {
                const entity = await this.service.createEntity(req.body);
                res.status(201).json(entity);
            } catch (error) {
                console.error(`Error creating ${this.entityName}:`, error);
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
            }
        });

        // Update entity
        this.router.put('/:id', async (req, res) => {
            try {
                const entity = await this.service.updateEntity(req.params.id, req.body);
                if (!entity) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.json(entity);
            } catch (error) {
                console.error(`Error updating ${this.entityName}:`, error);
                res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
            }
        });

        // Delete entity
        this.router.delete('/:id', async (req, res) => {
            try {
                const deleted = await this.service.deleteEntity(req.params.id);
                if (!deleted) {
                    return res.status(404).json({
                        error: { code: 'NOT_FOUND', message: `${this.entityDisplayName} not found` }
                    });
                }
                res.status(204).send();
            } catch (error) {
                console.error(`Error deleting ${this.entityName}:`, error);
                if (error.message.includes('child entities') || error.message.includes('child categories')) {
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