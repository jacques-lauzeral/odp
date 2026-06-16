import { Router } from 'express';
import ImportService from '../services/ImportService.js';

const router = Router();
const importService = new ImportService();

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

// Import distributed edition source JSON file directly
router.post('/distributed', async (req, res) => {
    try {
        const user = getUser(req);

        console.log(`ImportService.importDistributedSourceFile() user: ${user?.id ?? null}`);

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

        const changeSetId = req.query.changeSetId;
        if (!changeSetId) {
            return res.status(400).json({
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Missing required query parameter: changeSetId'
                }
            });
        }

        const summary = await importService.importDistributedSourceFile(sourceData, user, changeSetId);

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