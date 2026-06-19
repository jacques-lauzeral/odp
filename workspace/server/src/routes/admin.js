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
import { reloadConfig } from '../config/loader.js';

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

// POST /admin/config/reload?configs=users,permissions
// Live-reload the runtime-reloadable configs without a restart. Atomic: if any
// requested config fails validation, none are applied and the previous config
// stays active. Like the rest of /admin, protected by network isolation (not
// matrix-governed) at P0.
adminRouter.post('/config/reload', (req, res) => {
    const configsParam = req.query.configs;
    if (!configsParam) {
        return res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'Missing required query parameter: configs' }
        });
    }
    const requested = String(configsParam).split(',').map(s => s.trim()).filter(Boolean);
    if (requested.length === 0) {
        return res.status(400).json({
            error: { code: 'BAD_REQUEST', message: 'No configs requested' }
        });
    }
    try {
        const reloaded = reloadConfig(requested);
        console.log(`[admin] config reloaded: ${reloaded.join(', ')}`);
        res.json({ reloaded });
    } catch (err) {
        if (err.code === 'NOT_RELOADABLE') {
            // domains/edition are structural — restart required; reject the request.
            return res.status(400).json({
                error: { code: 'NOT_RELOADABLE', config: err.config, message: err.message }
            });
        }
        // CONFIG_RELOAD_FAILED — validation failed; previous config remains active.
        console.error(`[admin] config reload failed (${err.config}):`, err.message);
        return res.status(500).json({
            error: { code: 'CONFIG_RELOAD_FAILED', config: err.config, message: err.message }
        });
    }
});