import { Router } from 'express';
import ODPEditionService from '../services/ODPEditionService.js';
import { getUser, getUserOptional } from './request-user.js';

const router = Router();

// List all ODIP editions
router.get('/', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`ODPEditionService.listODPEditions() user: ${user?.id ?? null}`);
        const editions = await ODPEditionService.listODPEditions(user);
        res.json(editions);
    } catch (error) {
        console.error('Error fetching ODIP editions:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Export entire repository as AsciiDoc
router.get('/export', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`ODPEditionService.exportAsAsciiDoc() repository export, user: ${user?.id ?? null}`);
        const asciiDoc = await ODPEditionService.exportAsAsciiDoc(null, user);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'inline; filename="odp-repository.adoc"');
        res.send(asciiDoc);
    } catch (error) {
        console.error('Error exporting ODIP repository:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Get ODIP edition by ID
router.get('/:id', async (req, res) => {
    try {
        const user = getUserOptional(req);
        console.log(`ODPEditionService.getODPEdition() id: ${req.params.id}, user: ${user?.id ?? null}`);
        const edition = await ODPEditionService.getODPEdition(req.params.id, user);
        if (!edition) {
            return res.status(404).json({
                error: { code: 'NOT_FOUND', message: 'ODIP Edition not found' }
            });
        }
        res.json(edition);
    } catch (error) {
        console.error('Error fetching ODIP edition:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Export specific ODIP edition as AsciiDoc
router.get('/:id/export', async (req, res) => {
    try {
        const user = getUserOptional(req);
        const editionId = req.params.id;
        console.log(`ODPEditionService.exportAsAsciiDoc() edition export, id: ${editionId}, user: ${user?.id ?? null}`);
        const asciiDoc = await ODPEditionService.exportAsAsciiDoc(editionId, user);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `inline; filename="odp-edition-${editionId}.adoc"`);
        res.send(asciiDoc);
    } catch (error) {
        console.error('Error exporting ODIP edition:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Create new ODIP edition (with auto-baseline creation if needed)
router.post('/', async (req, res) => {
    try {
        const user = getUser(req);
        console.log(`ODPEditionService.createODPEdition() user: ${user?.id ?? null}, title: ${req.body.title}, type: ${req.body.type}, baselineId: ${req.body.baselineId}, startDate: ${req.body.startDate}`);
        const edition = await ODPEditionService.createODPEdition(req.body, user);
        res.status(201).json(edition);
    } catch (error) {
        console.error('Error creating ODIP edition:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('is required') || error.message.includes('must be')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else if (error.message.includes('Baseline with ID') && error.message.includes('does not exist')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Publish ODIP edition
// Body: PublishOptions — { wordFlat?, wordMultipart?, pdfFlat?, website? }
// Absent or empty body defaults to { website: true }
router.post('/:id/publish', async (req, res) => {
    try {
        const user = getUser(req);
        const editionId = req.params.id;

        const options = (req.body && Object.keys(req.body).length > 0)
            ? req.body
            : { website: true };

        console.log(`ODPEditionService.publishEdition() id: ${editionId}, options: ${JSON.stringify(options)}, user: ${user?.id ?? null}`);
        const result = await ODPEditionService.publishEdition(editionId, user, options);
        res.json(result);
    } catch (error) {
        console.error('Error publishing ODIP edition:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.code === 'NOT_FOUND') {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else if (error.code === 'PUBLICATION_IN_PROGRESS') {
            res.status(409).json({ error: { code: 'PUBLICATION_IN_PROGRESS', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Update ODIP edition - NOT SUPPORTED (ODIP editions are immutable)
router.put('/:id', async (req, res) => {
    res.status(405).json({
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'ODIP Edition update not supported - ODIP editions are immutable once created'
        }
    });
});

// Delete ODIP edition - NOT SUPPORTED (ODIP editions are immutable)
router.delete('/:id', async (req, res) => {
    res.status(405).json({
        error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'ODIP Edition deletion not supported - ODIP editions are immutable for historical integrity'
        }
    });
});

export default router;