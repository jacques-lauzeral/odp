import { Router } from 'express';
import ChapterService from '../services/ChapterService.js';
import { StoreErrorCode } from '../store/transaction.js';
import auditEventService from '../services/AuditEventService.js';

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

// List all chapters (latest versions, config-owned fields merged)
router.get('/', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`ChapterService.getAll() user: ${user?.id ?? null}`);
        const chapters = await ChapterService.getAll(user);
        res.json(chapters);
    } catch (error) {
        console.error('Error fetching chapters:', error);
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
});

// Get chapter by ID (latest or edition context)
router.get('/:id', async (req, res) => {
    try {
        const user = getUserOptional(req);
        const editionId = req.query.edition || null;
        console.log(`ChapterService.getById() itemId: ${req.params.id}, user: ${user?.id ?? null}, editionId: ${editionId}`);
        const chapter = await ChapterService.getById(req.params.id, user, editionId);
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

// Get audit timeline (History) — unified AuditEvent feed for the chapter.
// Replaces the former /:id/versions version-history route (Phase A).
router.get('/:id/history', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`Chapter history itemId: ${req.params.id}, user: ${user?.id ?? null}`);
        const history = await auditEventService.getItemHistory(req.params.id, user);
        res.json(history);
    } catch (error) {
        console.error('Error fetching chapter history:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get specific version of chapter
router.get('/:id/versions/:versionNumber', async (req, res) => {
    try {
        const user = getUserOptional(req);
        const versionNumber = parseInt(req.params.versionNumber);
        console.log(`ChapterService.getByIdAndVersion() itemId: ${req.params.id}, version: ${versionNumber}, user: ${user?.id ?? null}`);
        const chapter = await ChapterService.getByIdAndVersion(req.params.id, versionNumber, user);
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
        const user = getUser(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' } });
        }
        console.log(`ChapterService.update() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, user: ${user?.id ?? null}`);
        const chapter = await ChapterService.update(req.params.id, req.body, expectedVersionId, user);
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
        } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
            res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
        } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
            res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Partial update — update narrative and/or osHierarchy (creates new version)
router.patch('/:id', async (req, res) => {
    try {
        const user = getUser(req);
        const expectedVersionId = req.body.expectedVersionId;
        if (!expectedVersionId) {
            return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required field: expectedVersionId' } });
        }
        console.log(`ChapterService.patch() itemId: ${req.params.id}, expectedVersionId: ${expectedVersionId}, user: ${user?.id ?? null}`);
        const chapter = await ChapterService.patch(req.params.id, req.body, expectedVersionId, user);
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
        } else if (error.code === StoreErrorCode.CHANGESET_NOT_FOUND) {
            res.status(404).json({ error: { code: 'CHANGESET_NOT_FOUND', message: error.message } });
        } else if (error.code === StoreErrorCode.CHANGESET_CLOSED) {
            res.status(409).json({ error: { code: 'CHANGESET_CLOSED', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Resolve all generated content (blocks + strings) for a chapter narrative.
// Ephemeral — result is NOT persisted. Elaborate mode preview only.
router.post('/:id/resolve-generated-content', async (req, res) => {
    try {
        const user = getUser(req);
        const editionId = req.query.edition || null;
        console.log(`ChapterService.resolveGeneratedContent() itemId: ${req.params.id}, user: ${user?.id ?? null}, editionId: ${editionId}`);
        const content = await ChapterService.resolveGeneratedContent(req.params.id, editionId, user);
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