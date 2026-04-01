import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalChangeService from '../services/OperationalChangeService.js';

class OperationalChangeRouter extends VersionedItemRouter {
    constructor() {
        super(OperationalChangeService, 'operational-change', 'Operational Change');
    }

    getContentFilters(req) {
        const filters = {};

        if (req.query.drg) {
            filters.drg = req.query.drg;
        }

        if (req.query.maturity) {
            filters.maturity = req.query.maturity;
        }

        if (req.query.title) {
            filters.title = req.query.title;
        }

        if (req.query.text) {
            filters.text = req.query.text;
        }

        if (req.query.path) {
            filters.path = req.query.path;
        }

        if (req.query.domain) {
            filters.domain = parseInt(req.query.domain);
        }

        if (req.query.stakeholderCategory) {
            filters.stakeholderCategory = req.query.stakeholderCategory.split(',').map(id => parseInt(id));
        }

        // Relationship-based filters (single Item ID)
        if (req.query.implementsOR) {
            filters.implementsOR = parseInt(req.query.implementsOR);
        }

        return filters;
    }
}

const operationalChangeRouter = new OperationalChangeRouter();
const router = operationalChangeRouter.getRouter();

// MILESTONE CRUD ROUTES WITH MULTI-CONTEXT SUPPORT

// GET /operational-changes/:id/milestones
router.get('/:id/milestones', async (req, res) => {
    try {
        const userId = operationalChangeRouter.getUserId(req);
        const editionId = operationalChangeRouter.getEditionId(req);
        console.log(`OperationalChangeService.getMilestones() itemId: ${req.params.id}, userId: ${userId}, editionId: ${editionId}`);
        const milestones = await OperationalChangeService.getMilestones(req.params.id, userId, editionId);
        res.json(milestones);
    } catch (error) {
        console.error('Error fetching milestones:', error);
        if (error.message === 'Operational change not found') {
            const editionId = operationalChangeRouter.getEditionId(req);
            const context = editionId ? ` in edition ${editionId}` : '';
            res.status(404).json({ error: { code: 'NOT_FOUND', message: `Operational change not found${context}` } });
        } else if (error.message.includes('Edition not found') || error.message.includes('ODPEdition not found')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// GET /operational-changes/:id/milestones/:milestoneKey
router.get('/:id/milestones/:milestoneKey', async (req, res) => {
    try {
        const userId = operationalChangeRouter.getUserId(req);
        const editionId = operationalChangeRouter.getEditionId(req);
        console.log(`OperationalChangeService.getMilestone() itemId: ${req.params.id}, milestoneKey: ${req.params.milestoneKey}, userId: ${userId}, editionId: ${editionId}`);
        const milestone = await OperationalChangeService.getMilestone(req.params.id, req.params.milestoneKey, userId, editionId);
        res.json(milestone);
    } catch (error) {
        console.error('Error fetching milestone:', error);
        if (error.message === 'Operational change not found' || error.message === 'Milestone not found') {
            const editionId = operationalChangeRouter.getEditionId(req);
            const context = editionId ? ` in edition ${editionId}` : '';
            res.status(404).json({ error: { code: 'NOT_FOUND', message: `${error.message}${context}` } });
        } else if (error.message.includes('Edition not found') || error.message.includes('ODPEdition not found')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// POST /operational-changes/:id/milestones
router.post('/:id/milestones', async (req, res) => {
    try {
        const userId = operationalChangeRouter.getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
            });
        }
        console.log(`OperationalChangeService.addMilestone() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const response = await OperationalChangeService.addMilestone(req.params.id, req.body, expectedVersionId, userId);
        res.status(201).json(response);
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

// PUT /operational-changes/:id/milestones/:milestoneKey
router.put('/:id/milestones/:milestoneKey', async (req, res) => {
    try {
        const userId = operationalChangeRouter.getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
            });
        }
        console.log(`OperationalChangeService.updateMilestone() itemId: ${req.params.id}, milestoneKey: ${req.params.milestoneKey}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const response = await OperationalChangeService.updateMilestone(req.params.id, req.params.milestoneKey, req.body, expectedVersionId, userId);
        res.json(response);
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

// DELETE /operational-changes/:id/milestones/:milestoneKey
router.delete('/:id/milestones/:milestoneKey', async (req, res) => {
    try {
        const userId = operationalChangeRouter.getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({
                error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' }
            });
        }
        console.log(`OperationalChangeService.deleteMilestone() itemId: ${req.params.id}, milestoneKey: ${req.params.milestoneKey}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const response = await OperationalChangeService.deleteMilestone(req.params.id, req.params.milestoneKey, expectedVersionId, userId);
        res.status(200).json(response);
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