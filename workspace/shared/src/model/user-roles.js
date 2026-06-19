/**
 * @file user-roles.js
 * @description The UserRole enum — the closed set of writer roles in the system.
 *
 * UserRole is the access-control role model. It is referenced by:
 *   - AuditEvent.userRole — frozen at write time (audit-elements.js)
 *   - users.yaml          — each declared user carries one UserRole key
 *   - permissions.yaml    — each matrix entry grants a method × path to UserRole keys
 *   - the requirePermission middleware — role checked against the matrix
 *
 * Audit is one consumer among several; the enum therefore lives in its own
 * model file rather than inside audit-elements.js.
 */

/**
 * The role under which a consequential write was performed.
 * Writer roles only — passive users perform no consequential writes, so no
 * AuditEvent ever carries a passive role. Source: blueprint RBA section.
 */
export const UserRole = {
    DOMAIN_WRITER: 'DOMAIN_WRITER',
    ICDM:          'ICDM',
    INTEGRATOR:    'INTEGRATOR',
};
export const UserRoleKeys   = Object.keys(UserRole);
export const UserRoleValues = Object.values(UserRole);
export const isUserRoleValid    = (v) => UserRoleKeys.includes(v);
export const getUserRoleDisplay = (k) => UserRole[k] || k;