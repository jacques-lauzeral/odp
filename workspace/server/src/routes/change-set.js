import { Router } from 'express';
import ChangeSetService from '../services/ChangeSetService.js';

const router = Router();

/**
 * Extract userId from request headers — throws if absent.
 */
function getUserId(req) {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        throw new Error('Missing required header: x-user-id');
    }
    return userId;
}

function getUserIdOptional(req) {
    return req.headers['x-user-id'] || null;
}

/**
 * Map a service/store error to an HTTP response.
 */
function handleError(res, error, entity = 'Change set') {
    if (error.message.includes('x-user-id')) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
    }
    if (error.message.includes('Validation failed:')) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
    }
    if (error.message.includes('not OPEN') || error.message.includes('has members')) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: error.message } });
    }
    if (error.message.includes('not found')) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}

// List change sets — optional status / classifier filter (mutually exclusive; status wins)
router.get('/', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        const { status, classifier } = req.query;
        let items;
        if (status) {
            items = await ChangeSetService.findByStatus(status, userId);
        } else if (classifier) {
            items = await ChangeSetService.findByClassifier(classifier, userId);
        } else {
            items = await ChangeSetService.listItems(userId);
        }
        res.json(items);
    } catch (error) {
        console.error('Error listing change sets:', error);
        handleError(res, error);
    }
});

// Get change set by ID
router.get('/:id', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        const item = await ChangeSetService.getItem(req.params.id, userId);
        if (!item) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
        }
        res.json(item);
    } catch (error) {
        console.error('Error fetching change set:', error);
        handleError(res, error);
    }
});

// Members of a change set (the versions committed under it)
router.get('/:id/members', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        const members = await ChangeSetService.getMembers(req.params.id, userId);
        res.json(members);
    } catch (error) {
        console.error('Error fetching change set members:', error);
        handleError(res, error);
    }
});

// Create a change set
router.post('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        const item = await ChangeSetService.createItem(req.body, userId);
        res.status(201).json(item);
    } catch (error) {
        console.error('Error creating change set:', error);
        handleError(res, error);
    }
});

// Update title / reasonText (OPEN only)
router.put('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const item = await ChangeSetService.updateItem(req.params.id, req.body, userId);
        if (!item) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
        }
        res.json(item);
    } catch (error) {
        console.error('Error updating change set:', error);
        handleError(res, error);
    }
});

// Close a change set
router.post('/:id/close', async (req, res) => {
    try {
        const userId = getUserId(req);
        const item = await ChangeSetService.close(req.params.id, userId);
        res.json(item);
    } catch (error) {
        console.error('Error closing change set:', error);
        handleError(res, error);
    }
});

// Reopen a change set
router.post('/:id/reopen', async (req, res) => {
    try {
        const userId = getUserId(req);
        const item = await ChangeSetService.reopen(req.params.id, userId);
        res.json(item);
    } catch (error) {
        console.error('Error reopening change set:', error);
        handleError(res, error);
    }
});

// Delete a change set (empty + OPEN only)
router.delete('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const deleted = await ChangeSetService.deleteItem(req.params.id, userId);
        if (!deleted) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Change set not found' } });
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting change set:', error);
        handleError(res, error);
    }
});

export default router;