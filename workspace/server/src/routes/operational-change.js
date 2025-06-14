import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalChangeService from '../services/OperationalChangeService.js';

// Create base router using VersionedItemRouter
const versionedRouter = new VersionedItemRouter(OperationalChangeService, 'operational-change', 'Operational Change');
const router = versionedRouter.getRouter();

// MILESTONE CRUD ROUTES

// GET /operational-changes/:id/milestones - List all milestones
router.get('/:id/milestones', async (req, res) => {
    try {
        const userId = versionedRouter.getUserId(req);
        console.log(`OperationalChangeService.getMilestones() itemId: ${req.params.id}, userId: ${userId}`);
        const milestones = await OperationalChangeService.getMilestones(req.params.id, userId);
        res.json(milestones);
    } catch (error) {
        console.error('Error fetching milestones:', error);
        if (error.message === 'Operational change not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Operational change not found' } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// POST /operational-changes/:id/milestones - Add milestone
router.post('/:id/milestones', async (req, res) => {
    try {
        const userId = versionedRouter.getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
            });
        }

        console.log(`OperationalChangeService.addMilestone() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const milestone = await OperationalChangeService.addMilestone(req.params.id, req.body, expectedVersionId, userId);
        res.status(201).json(milestone);
    } catch (error) {
        console.error('Error adding milestone:', error);
        if (error.message === 'Operational change not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Operational change not found' } });
        } else if (error.message === 'Outdated item version') {
            res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Operational change has been modified by another user. Please refresh and try again.' } });
        } else if (error.message.includes('Validation failed:')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// GET /operational-changes/:id/milestones/:milestoneId - Get specific milestone
router.get('/:id/milestones/:milestoneId', async (req, res) => {
    try {
        const userId = versionedRouter.getUserId(req);
        console.log(`OperationalChangeService.getMilestone() itemId: ${req.params.id}, milestoneId: ${req.params.milestoneId}, userId: ${userId}`);
        const milestone = await OperationalChangeService.getMilestone(req.params.id, req.params.milestoneId, userId);
        res.json(milestone);
    } catch (error) {
        console.error('Error fetching milestone:', error);
        if (error.message === 'Operational change not found' || error.message === 'Milestone not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// PUT /operational-changes/:id/milestones/:milestoneId - Update milestone
router.put('/:id/milestones/:milestoneId', async (req, res) => {
    try {
        const userId = versionedRouter.getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
            });
        }

        console.log(`OperationalChangeService.updateMilestone() itemId: ${req.params.id}, milestoneId: ${req.params.milestoneId}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const milestone = await OperationalChangeService.updateMilestone(req.params.id, req.params.milestoneId, req.body, expectedVersionId, userId);
        res.json(milestone);
    } catch (error) {
        console.error('Error updating milestone:', error);
        if (error.message === 'Operational change not found' || error.message === 'Milestone not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else if (error.message === 'Outdated item version') {
            res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Operational change has been modified by another user. Please refresh and try again.' } });
        } else if (error.message.includes('Validation failed:')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// DELETE /operational-changes/:id/milestones/:milestoneId - Delete milestone
router.delete('/:id/milestones/:milestoneId', async (req, res) => {
    try {
        const userId = versionedRouter.getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
            });
        }

        console.log(`OperationalChangeService.deleteMilestone() itemId: ${req.params.id}, milestoneId: ${req.params.milestoneId}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        await OperationalChangeService.deleteMilestone(req.params.id, req.params.milestoneId, expectedVersionId, userId);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting milestone:', error);
        if (error.message === 'Operational change not found' || error.message === 'Milestone not found') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else if (error.message === 'Outdated item version') {
            res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Operational change has been modified by another user. Please refresh and try again.' } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;