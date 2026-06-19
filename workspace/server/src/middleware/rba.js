/**
 * @file rba.js
 * @description RBA pipeline middleware: identity resolution and matrix enforcement.
 *
 * Two app-level middlewares, inserted early in the Express pipeline:
 *
 *   resolveUser()        — THE SSO SEAM. Reads the x-user-id email the client
 *                          declares, validates it against users.yaml, and
 *                          attaches the authoritative req.user. Platform SSO
 *                          replaces this one function; nothing above it changes.
 *
 *   requirePermission()  — Consults permissions.yaml. Gates only routes the
 *                          matrix governs; unlisted routes pass through (open,
 *                          anonymous reads for Explore/Home/quality/History).
 *
 * Role is server-derived here — never trusted from the client.
 */

import { resolveUser as resolveUserByEmail, isPermitted, isPermissionGoverned } from '../config/loader.js';

/**
 * Resolve the acting user from the x-user-id header.
 *   - absent  → req.user = null (anonymous; allowed on open routes)
 *   - unknown → 401 UNKNOWN_USER
 *   - known   → req.user = { id: email, role, domains }
 *
 * `id` carries the email so the existing user.id → AuditEvent.userId contract
 * is preserved without touching the service layer.
 */
export function resolveUser(req, res, next) {
    const email = req.headers['x-user-id'];
    if (!email) {
        req.user = null;
        return next();
    }
    const entry = resolveUserByEmail(email);
    if (!entry) {
        return res.status(401).json({
            error: { code: 'UNKNOWN_USER', message: `Email address not recognised: ${email}` }
        });
    }
    req.user = { id: entry.email, role: entry.role, domains: entry.domains };
    next();
}

/**
 * Enforce the permission matrix on governed routes.
 *   - route not in matrix → pass (open)
 *   - governed + anonymous → 401 UNKNOWN_USER (identification required)
 *   - governed + role not permitted → 403 FORBIDDEN
 *   - governed + permitted → pass
 */
export function requirePermission(req, res, next) {
    const method = req.method;
    // Normalise a trailing slash (except root) so "/waves/" matches "/waves".
    const path = (req.path.length > 1 && req.path.endsWith('/'))
        ? req.path.slice(0, -1)
        : req.path;

    if (!isPermissionGoverned(method, path)) {
        return next();   // unlisted → open
    }
    if (!req.user) {
        return res.status(401).json({
            error: { code: 'UNKNOWN_USER', message: 'Identification required for this operation' }
        });
    }
    if (!isPermitted(method, path, req.user.role)) {
        return res.status(403).json({
            error: { code: 'FORBIDDEN', message: `Role ${req.user.role} is not permitted to ${method} ${path}` }
        });
    }
    next();
}