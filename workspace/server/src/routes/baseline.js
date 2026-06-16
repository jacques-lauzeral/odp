import { Router } from 'express';
import BaselineService from '../services/BaselineService.js';

const router = Router();

/**
 * Extract the acting user from request headers — throws if id absent.
 * Returns { id, role }; role is null when x-user-role is absent
 * (role validation / implicit population arrives with RBA).
 */
function getUser(req) {
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
function getUserOptional(req) {
    const id = req.headers['x-user-id'];
    if (!id) return null;
    return { id, role: req.headers['x-user-role'] || null };
}

// List all baselines
router.get('/', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`BaselineService.listBaselines() user: ${user?.id ?? null}`);
        const baselines = await BaselineService.listBaselines(user);
        res.json(baselines);
    } catch (error) {
        console.error('Error fetching baselines:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get baseline by ID
router.get('/:id', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`BaselineService.getBaseline() id: ${req.params.id}, user: ${user?.id ?? null}`);
        const baseline = await BaselineService.getBaseline(req.params.id, user);
        if (!baseline) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'Baseline not found' }
            });
        }
        res.json(baseline);
    } catch (error) {
        console.error('Error fetching baseline:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Create new baseline (atomic snapshot creation)
router.post('/', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`BaselineService.createBaseline() user: ${user?.id ?? null}, startsFromWaveId: ${req.body.startsFromWaveId}`);
        const baseline = await BaselineService.createBaseline(req.body, user);
        res.status(201).json(baseline);
    } catch (error) {
        console.error('Error creating baseline:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('Validation failed:')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else if (error.message.includes('Waves with ID') && error.message.includes('does not exist')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get items captured in baseline
router.get('/:id/items', async (req, res) => {
    try {
        const user = getUser(req);
        console.log(`BaselineService.getBaselineItems() id: ${req.params.id}, user: ${user?.id ?? null}`);
        const items = await BaselineService.getBaselineItems(req.params.id, user);
        res.json(items);
    } catch (error) {
        console.error('Error fetching baseline items:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('Baseline not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Baseline not found' } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Update baseline - NOT SUPPORTED (baselines are immutable)
router.put('/:id', async (req, res) => {
    res.status(405).json({
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'Baseline update not supported - baselines are immutable once created'
        }
    });
});

// Delete baseline - NOT SUPPORTED (baselines are immutable)
router.delete('/:id', async (req, res) => {
    res.status(405).json({
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'Baseline deletion not supported - baselines are immutable for historical integrity'
        }
    });
});

export default router;