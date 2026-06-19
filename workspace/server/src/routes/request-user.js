/**
 * @file request-user.js
 * @description Single source for extracting the acting user in route handlers.
 *
 * Identity is resolved once, early in the pipeline, by the resolveUser()
 * middleware (middleware/rba.js), which validates the x-user-id email against
 * users.yaml and attaches `req.user = { id, role, domains }` (or null for an
 * anonymous request). These helpers simply read what the middleware attached —
 * routes never read x-user-id / x-user-role headers directly, and role is
 * server-derived, never client-declared.
 */

/**
 * The acting user for a write route — throws if the request is anonymous.
 * The thrown message is matched by route error handlers to return 400.
 *
 * @param {import('express').Request} req
 * @returns {{ id: string, role: string, domains: string[] }}
 */
export function getUser(req) {
    if (!req.user) {
        throw new Error('Missing required header: x-user-id');
    }
    return req.user;
}

/**
 * The acting user for a read route.
 *
 * WORKAROUND (temporary): returns an anonymous actor object with null id/role
 * instead of null, so services that unconditionally destructure `user.id` /
 * `user.role` into createTransaction() don't crash on anonymous reads. The
 * stamped values are still null (no fabricated identity) — reads write no
 * AuditEvent, so a null actor is harmless.
 *
 * Proper fix (scheduled): split read vs write transactions —
 * createReadTransaction(user?) tolerating a null user, createWriteTransaction(user)
 * asserting one — and have services pass the user object rather than pre-unpacked
 * id/role. When that lands, this should revert to `return req.user ?? null;`.
 *
 * @param {import('express').Request} req
 * @returns {{ id: string|null, role: string|null, domains: string[] }}
 */
export function getUserOptional(req) {
    return req.user ?? { id: null, role: null, domains: [] };
}