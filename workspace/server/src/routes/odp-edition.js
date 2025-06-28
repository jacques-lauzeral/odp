import { Router } from 'express';
import ODPEditionService from '../services/ODPEditionService.js';

const router = Router();

/**
 * Extract userId from request headers
 */
function getUserId(req) {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        throw new Error('Missing required header: x-user-id');
    }
    return userId;
}

// List all ODP editions
router.get('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        console.log(`ODPEditionService.listODPEditions() userId: ${userId}`);
        const editions = await ODPEditionService.listODPEditions(userId);
        res.json(editions);
    } catch (error) {
        console.error('Error fetching ODP editions:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get ODP edition by ID
router.get('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        console.log(`ODPEditionService.getODPEdition() id: ${req.params.id}, userId: ${userId}`);
        const edition = await ODPEditionService.getODPEdition(req.params.id, userId);
        if (!edition) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'ODP Edition not found' }
            });
        }
        res.json(edition);
    } catch (error) {
        console.error('Error fetching ODP edition:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Create new ODP edition (with auto-baseline creation if needed)
router.post('/', async (req, res) => {
    try {
        const userId = getUserId(req);
        console.log(`ODPEditionService.createODPEdition() userId: ${userId}, title: ${req.body.title}, type: ${req.body.type}, baselineId: ${req.body.baselineId}, startsFromWaveId: ${req.body.startsFromWaveId}`);
        const edition = await ODPEditionService.createODPEdition(req.body, userId);
        res.status(201).json(edition);
    } catch (error) {
        console.error('Error creating ODP edition:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('is required') || error.message.includes('must be')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else if (error.message.includes('Baseline with ID') && error.message.includes('does not exist')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('Waves with ID') && error.message.includes('does not exist')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Update ODP edition - NOT SUPPORTED (ODP editions are immutable)
router.put('/:id', async (req, res) => {
    res.status(405).json({
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'ODP Edition update not supported - ODP editions are immutable once created'
        }
    });
});

// Delete ODP edition - NOT SUPPORTED (ODP editions are immutable)
router.delete('/:id', async (req, res) => {
    res.status(405).json({
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'ODP Edition deletion not supported - ODP editions are immutable for historical integrity'
        }
    });
});

export default router;