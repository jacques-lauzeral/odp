import { Router } from 'express';
import AuditEventService from '../services/AuditEventService.js';

const router = Router();

/**
 * Extract the acting user from request headers — returns null if id absent.
 * Audit queries are read-only; anonymous reads are allowed.
 * Returns { id, role }; role is null when x-user-role is absent
 * (role validation / implicit population arrives with RBA).
 */
function getUserOptional(req) {
    const id = req.headers['x-user-id'];
    if (!id) return null;
    return { id, role: req.headers['x-user-role'] || null };
}

// GET /audit-events[?changeSetId=][&targetId=][&userId=]
// Query the append-only audit log. All filters optional and AND-combined;
// no filter returns the entire log. Read-only — the log is never mutated via REST.
// The client builds an item History timeline by passing ?targetId=.
router.get('/', async (req, res) => {
    try {
        const user = getUserOptional(req);

        const filters = {};
        if (req.query.changeSetId) filters.changeSetId = req.query.changeSetId;
        if (req.query.targetId)    filters.targetId    = req.query.targetId;
        if (req.query.userId)      filters.userId      = req.query.userId;

        console.log(`AuditEventService.getAuditEvents() filters: ${JSON.stringify(filters)}, user: ${user?.id ?? null}`);
        const events = await AuditEventService.getAuditEvents(filters, user);
        res.json(events);
    } catch (error) {
        console.error('Error querying audit events:', error);
        if (error.message.includes('x-user-id')) {
            res.status(400).json({ error: { code: 'BAD_REQUEST', message: error.message } });
        } else {
            res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
    }
});

export default router;