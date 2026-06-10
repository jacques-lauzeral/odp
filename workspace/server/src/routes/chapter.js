import { Router } from 'express';
import ChapterService from '../services/ChapterService.js';

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

/**
 * Extract userId from request headers — returns null if absent.
 * Used on read-only routes that allow anonymous access.
 */
function getUserIdOptional(req) {
    return req.headers['x-user-id'] || null;
}

// List all chapters (latest versions, config-owned fields merged)
router.get('/', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        console.log(`ChapterService.getAll() userId: ${userId}`);
        const chapters = await ChapterService.getAll(userId);
        res.json(chapters);
    } catch (error) {
        console.error('Error fetching chapters:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Get chapter by ID (latest or edition context)
router.get('/:id', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        const editionId = req.query.edition || null;
        console.log(`ChapterService.getById() itemId: ${req.params.id}, userId: ${userId}, editionId: ${editionId}`);
        const chapter = await ChapterService.getById(req.params.id, userId, editionId);
        if (!chapter) {
            const context = editionId ? ` in edition ${editionId}` : '';
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Chapter not found${context}` } });
        }
        res.json(chapter);
    } catch (error) {
        console.error('Error fetching chapter:', error);
        if (error.message.includes('Edition not found') || error.message.includes('ODPEdition not found')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get version history for chapter
router.get('/:id/versions', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        console.log(`ChapterService.getVersionHistory() itemId: ${req.params.id}, userId: ${userId}`);
        const history = await ChapterService.getVersionHistory(req.params.id, userId);
        res.json(history);
    } catch (error) {
        console.error('Error fetching chapter version history:', error);
        if (error.message.includes('Item not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chapter not found' } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get specific version of chapter
router.get('/:id/versions/:versionNumber', async (req, res) => {
    try {
        const userId = getUserIdOptional(req);
        const versionNumber = parseInt(req.params.versionNumber);
        console.log(`ChapterService.getByIdAndVersion() itemId: ${req.params.id}, version: ${versionNumber}, userId: ${userId}`);
        const chapter = await ChapterService.getByIdAndVersion(req.params.id, versionNumber, userId);
        if (!chapter) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Chapter version ${versionNumber} not found` } });
        }
        res.json(chapter);
    } catch (error) {
        console.error('Error fetching chapter version:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Full update — replace narrative and osHierarchy (creates new version)
router.put('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' } });
        }
        console.log(`ChapterService.update() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const chapter = await ChapterService.update(req.params.id, req.body, expectedVersionId, userId);
        if (!chapter) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chapter not found' } });
        }
        res.json(chapter);
    } catch (error) {
        console.error('Error updating chapter:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message === 'Outdated item version') {
            res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Chapter has been modified by another user. Please refresh and try again.' } });
        } else if (error.message.includes('Validation failed:')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Partial update — update narrative and/or osHierarchy (creates new version)
router.patch('/:id', async (req, res) => {
    try {
        const userId = getUserId(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' } });
        }
        console.log(`ChapterService.patch() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, userId: ${userId}`);
        const chapter = await ChapterService.patch(req.params.id, req.body, expectedVersionId, userId);
        if (!chapter) {
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Chapter not found' } });
        }
        res.json(chapter);
    } catch (error) {
        console.error('Error patching chapter:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message === 'Outdated item version') {
            res.status(409).json({ error: { code: 'VERSION_CONFLICT', message: 'Chapter has been modified by another user. Please refresh and try again.' } });
        } else if (error.message.includes('Validation failed:')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Resolve all generated content (blocks + strings) for a chapter narrative.
// Ephemeral — result is NOT persisted. Elaborate mode preview only.
router.post('/:id/resolve-generated-content', async (req, res) => {
    try {
        const userId = getUserId(req);
        const editionId = req.query.edition || null;
        console.log(`ChapterService.resolveGeneratedContent() itemId: ${req.params.id}, userId: ${userId}, editionId: ${editionId}`);
        const content = await ChapterService.resolveGeneratedContent(req.params.id, editionId, userId);
        res.json(content);
    } catch (error) {
        console.error('Error resolving generated content:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;