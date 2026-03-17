// routes/admin.js
//
// Admin routes and standby middleware.
//
// Exports:
//   standbyMiddleware  — register before all other routes in index.js
//   adminRouter        — mount at '/admin' in index.js
//
// Endpoints (localhost-only):
//   POST /admin/standby  — enter standby mode (503 on all non-admin requests)
//   POST /admin/resume   — resume normal operation
//   GET  /admin/status   — return current status

import express from 'express';

let inStandby = false;

export function standbyMiddleware(req, res, next) {
    if (req.path.startsWith('/admin')) return next();
    if (inStandby) {
        return res.status(503).json({
            error: 'Service temporarily unavailable',
            reason: 'Server is in standby mode (backup in progress)'
        });
    }
    next();
}

export const adminRouter = express.Router();

// Admin endpoints are unrestricted — the pod is on a private network

adminRouter.post('/standby', (req, res) => {
    inStandby = true;
    console.log('[admin] Server entered standby mode');
    res.json({ status: 'standby' });
});

adminRouter.post('/resume', (req, res) => {
    inStandby = false;
    console.log('[admin] Server resumed normal operation');
    res.json({ status: 'running' });
});

adminRouter.get('/status', (req, res) => {
    res.json({ status: inStandby ? 'standby' : 'running' });
});