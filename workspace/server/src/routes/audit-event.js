import { Router } from 'express';
import AuditEventService from '../services/AuditEventService.js';
import { getUserOptional } from './request-user.js';

const router = Router();

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