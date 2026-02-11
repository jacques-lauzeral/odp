// workspace/server/src/routes/publication.js
import { Router } from 'express';
import PublicationService from '../services/PublicationService.js';

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

// Generate Antora multipage website
router.post('/antora', async (req, res) => {
    try {
        const userId = getUserId(req);
        const editionId = req.query.editionId || null;

        console.log(`PublicationService.generateAntoraSite() ${editionId ? `editionId: ${editionId}` : 'repository mode'}, userId: ${userId}`);

        const zipBuffer = await PublicationService.generateAntoraSite(editionId, userId);

        // Build filename
        const filename = editionId
            ? `odip-edition-${editionId}-antora.zip`
            : 'odip-repository-antora.zip';

        // Set response headers for ZIP file
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Send binary buffer
        res.send(zipBuffer);

    } catch (error) {
        console.error('Error generating Antora site:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Generate single PDF document
router.post('/pdf', async (req, res) => {
    try {
        const userId = getUserId(req);
        const editionId = req.query.editionId || null;

        console.log(`PublicationService.generatePdf() ${editionId ? `editionId: ${editionId}` : 'repository mode'}, userId: ${userId}`);

        const pdfBuffer = await PublicationService.generatePdf(editionId, userId);

        // Build filename
        const filename = editionId
            ? `odip-edition-${editionId}.pdf`
            : 'odip-repository.pdf';

        // Set response headers for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Send binary buffer
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Error generating PDF:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else if (error.message.includes('not yet implemented')) {
            res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

// Generate single Word document
router.post('/docx', async (req, res) => {
    try {
        const userId = getUserId(req);
        const editionId = req.query.editionId || null;

        console.log(`PublicationService.generateDocx() ${editionId ? `editionId: ${editionId}` : 'repository mode'}, userId: ${userId}`);

        const docxBuffer = await PublicationService.generateDocx(editionId, userId);

        // Build filename
        const filename = editionId
            ? `odip-edition-${editionId}.docx`
            : 'odip-repository.docx';

        // Set response headers for Word document
        res.setHeader('Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Send binary buffer
        res.send(docxBuffer);

    } catch (error) {
        console.error('Error generating Word document:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else if (error.message.includes('not yet implemented')) {
            res.status(501).json({ error: { code: 'NOT_IMPLEMENTED', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;
