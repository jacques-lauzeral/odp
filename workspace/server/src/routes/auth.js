/**
 * @file auth.js
 * @description The /auth surface — the only client-facing view of users.yaml.
 *
 * Mounted ABOVE the RBA middleware in index.js and carries no auth itself:
 * a client calls /auth/identify to validate its email and learn its role
 * BEFORE it has any identity to present. The result is what the client then
 * sends as x-user-id on every subsequent request.
 */

import { Router } from 'express';
import { resolveUser as resolveUserByEmail } from '../config/loader.js';

const router = Router();

// POST /auth/identify  { email } -> 200 { email, role, domains } | 401 UNKNOWN_USER
router.post('/identify', (req, res) => {
    const email = req.body?.email;
    if (!email || typeof email !== 'string') {
        return res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'Missing required field: email' }
        });
    }
    const entry = resolveUserByEmail(email);
    if (!entry) {
        return res.status(401).json({
            error: { code: 'UNKNOWN_USER', message: 'Email address not recognised' }
        });
    }
    res.json({ email: entry.email, role: entry.role, domains: entry.domains });
});

export default router;