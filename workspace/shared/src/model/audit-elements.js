/**
 * @file audit-elements.js
 * @description The AuditEvent entity model and its supporting enums
 * (AuditAction, AuditTargetType, UserRole, ItemStatus).
 *
 * An AuditEvent is the SOLE authoritative record of every consequential write.
 * No audit information is duplicated on item or version nodes: who / when / why
 * lives here. Each event is fully self-contained — every field is captured at
 * write time and frozen, so the History timeline renders with no hydration hop
 * and a HARD_DELETE event survives the destruction of its target.
 *
 * Relationships (owned by the store, not on this projection):
 *   (AuditEvent)-[:TARGETS]->(item)               always present; item node, never a version
 *   (AuditEvent)-[:UNDER_CHANGESET]->(ChangeSet)  nullable; change-set-bound writes only
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * The consequential action an AuditEvent records.
 * DECOMMISSION is reserved (DEL-06 parked) so the log shape is stable when it lands.
 */
export const AuditAction = {
    CREATE:       'CREATE',
    UPDATE:       'UPDATE',
    DELETE:       'DELETE',
    RESTORE:      'RESTORE',
    HARD_DELETE:  'HARD_DELETE',
    CLOSE:        'CLOSE',
    REOPEN:       'REOPEN',
    PUBLISH:      'PUBLISH',
    BASELINE:     'BASELINE',
    DECOMMISSION: 'DECOMMISSION',   // reserved — DEL-06 parked
};
export const AuditActionKeys   = Object.keys(AuditAction);
export const AuditActionValues = Object.values(AuditAction);
export const isAuditActionValid    = (v) => AuditActionKeys.includes(v);
export const getAuditActionDisplay = (k) => AuditAction[k] || k;

/**
 * The kind of object an AuditEvent targets.
 */
export const AuditTargetType = {
    ON:        'ON',
    OR:        'OR',
    OC:        'OC',
    CHAPTER:   'CHAPTER',
    CHANGESET: 'CHANGESET',
    EDITION:   'EDITION',
    BASELINE:  'BASELINE',
    WAVE:      'WAVE',
};
export const AuditTargetTypeKeys   = Object.keys(AuditTargetType);
export const AuditTargetTypeValues = Object.values(AuditTargetType);
export const isAuditTargetTypeValid    = (v) => AuditTargetTypeKeys.includes(v);
export const getAuditTargetTypeDisplay = (k) => AuditTargetType[k] || k;

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

/**
 * Lifecycle status of a versioned item. The only lifecycle field retained on
 * the item node; ACTIVE items hold a LATEST_VERSION, DELETED items do not.
 */
export const ItemStatus = {
    ACTIVE:  'ACTIVE',
    DELETED: 'DELETED',
};
export const ItemStatusKeys   = Object.keys(ItemStatus);
export const ItemStatusValues = Object.values(ItemStatus);
export const isItemStatusValid    = (v) => ItemStatusKeys.includes(v);
export const getItemStatusDisplay = (k) => ItemStatus[k] || k;

// ---------------------------------------------------------------------------
// Entity model
// ---------------------------------------------------------------------------

/**
 * AuditEvent entity — the sole audit surface.
 *
 * Every field is captured at write time and frozen. Nothing is resolved on
 * read: the event is a complete standalone record. The denormalised target and
 * change-set fields (targetId/targetType/targetCode/targetTitle, changeSetCode/
 * changeSetTitle/classifier) deliberately duplicate what TARGETS / UNDER_CHANGESET
 * encode — that redundancy is what lets a HARD_DELETE event remain a complete
 * record after its TARGETS edge is gone.
 *
 * @typedef {object} AuditEvent
 * @property {string}      action         — AuditAction key
 * @property {string}      userId         — stable logical actor key; remappable at P2 IAM
 * @property {string}      userRole       — UserRole key; role held at action time (frozen)
 * @property {string}      timestamp
 * @property {string}      targetId       — stable item identity; survives hard delete
 * @property {string}      targetType     — AuditTargetType key
 * @property {string|null} targetCode     — item code; null for code-less chapters
 * @property {string}      targetTitle    — title at action time (frozen)
 * @property {number|null} targetVersion  — version sequence number; null for non-version-producing actions
 * @property {string|null} changeSetCode  — CS-##### handle; null when not change-set-bound
 * @property {string|null} changeSetTitle — set title at commit time (frozen); null when not change-set-bound
 * @property {string|null} classifier     — ChangeSetClassifier key at commit time (frozen); null when not change-set-bound
 * @property {string|null} note           — per-object annotation; null when absent
 */
export const AuditEvent = {
    action:         '',     // AuditAction key
    userId:         '',
    userRole:       '',     // UserRole key
    timestamp:      '',
    targetId:       '',
    targetType:     '',     // AuditTargetType key
    targetCode:     null,
    targetTitle:    '',
    targetVersion:  null,
    changeSetCode:  null,
    changeSetTitle: null,
    classifier:     null,   // ChangeSetClassifier key
    note:           null,
};