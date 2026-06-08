import { Router } from 'express';
import ImportService from '../services/ImportService.js';

const router = Router();
const importService = new ImportService();

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

// Import distributed edition source JSON file directly
router.post('/distributed', async (req, res) => {
    try {
        const userId = getUserId(req);

        console.log(`ImportService.importDistributedSourceFile() userId: ${userId}`);

        if (req.get('Content-Type') !== 'application/json') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_CONTENT_TYPE',
                    message: 'Content-Type must be application/json'
                }
            });
        }

        const sourceData = req.body;

        if (!sourceData || typeof sourceData !== 'object') {
            return res.status(400).json({
                error: {
                    code: 'INVALID_FORMAT',
                    message: 'Invalid request body: expected source JSON object'
                }
            });
        }

        const summary = await importService.importDistributedSourceFile(sourceData, userId);

        console.log(`Distributed import completed: ${JSON.stringify(summary)}`);
        res.json(summary);

    } catch (error) {
        console.error('Error importing distributed source file:', error);

        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;