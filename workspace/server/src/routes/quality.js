import express from 'express';
import qualityService from '../services/QualityService.js';
import { isDomainValid } from '../config/loader.js';
import { getUser } from './request-user.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /quality/checks[?domain=ASM_ATFCM,IDL][&edition=<editionId>]
// Run all quality rules — returns a QualityReport organised by domain.
// Optional ?domain= accepts a comma-separated list of domain keys.
// Optional ?edition= scopes checks to a published edition snapshot.
// When absent, checks run against the live dataset (latest versions).
// ---------------------------------------------------------------------------
router.get('/checks', async (req, res) => {
    try {
        const user = getUser(req);

        // Parse optional domain filter
        const domains = [];
        if (req.query.domain) {
            const requested = req.query.domain.split(',').map(d => d.trim());
            const invalid = requested.filter(d => !isDomainValid(d));
            if (invalid.length > 0) {
                return res.status(400).json({
                    error: { code: 'VALIDATION_ERROR', message: `Invalid domain key(s): ${invalid.join(', ')}` }
                });
            }
            domains.push(...requested);
        }

        // Parse optional edition context — same pattern as versioned item routes
        let editionId = null;
        if (req.query.edition) {
            editionId = parseInt(req.query.edition, 10);
            if (!Number.isFinite(editionId)) {
                return res.status(400).json({
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid edition ID' }
                });
            }
        }

        const report = await qualityService.runChecks(domains, editionId, user);
        res.json(report);
    } catch (error) {
        console.error('[quality] runChecks error:', error);
        res.status(500).json({
            error: { code: 'INTERNAL_ERROR', message: error.message }
        });
    }
});

export default router;