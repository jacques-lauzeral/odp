// workspace/server/src/routes/docx-export.js
import { Router } from 'express';
import DocxExportService from '../services/DocxExportService.js';

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

// Export operational requirements as Word document
router.get('/export/requirements', async (req, res) => {
    try {
        const userId = getUserId(req);
        const drg = req.query.drg;

        // Validate DRG parameter
        if (!drg) {
            return res.status(400).json({
                error: {
                    code: 'MISSING_PARAMETER',
                    message: 'Query parameter "drg" is required'
                }
            });
        }

        console.log(`DocxExportService.exportRequirementsByDrg() userId: ${userId}, drg: ${drg}`);

        const buffer = await DocxExportService.exportRequirementsByDrg(drg, userId);

        // Set response headers for Word document
        res.setHeader('Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition',
            `attachment; filename="requirements-${drg.toLowerCase()}-${Date.now()}.docx"`);

        // Send binary buffer
        res.send(buffer);

    } catch (error) {
        console.error('Error exporting requirements:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else if (error.message.includes('Invalid DRG')) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
        } else if (error.message.includes('No requirements found')) {
            res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;