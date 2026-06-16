/**
 * @file change-set-elements.js
 * @description ChangeSet entity model, classifier and status enums, and the
 * ChangeSetCommit write fragment.
 *
 * A ChangeSet is the first-class carrier of "why" for every save of a managed
 * object (O*, chapter/narrative). The reason for a save is recorded on the
 * AuditEvent (see audit-elements.js), linked to its ChangeSet via UNDER_CHANGESET.
 *
 * ChangeSets are authored in-app only — no external id, never imported.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Nature of the change captured by a ChangeSet.
 */
export const ChangeSetClassifier = {
    NEW_CONTENT:     'NEW_CONTENT',
    IN_DEPTH_REWORK: 'IN_DEPTH_REWORK',
    CLARIFICATION:   'CLARIFICATION',
    EDITORIAL:       'EDITORIAL',
};
export const ChangeSetClassifierKeys   = Object.keys(ChangeSetClassifier);
export const ChangeSetClassifierValues = Object.values(ChangeSetClassifier);
export const isChangeSetClassifierValid    = (v) => ChangeSetClassifierKeys.includes(v);
export const getChangeSetClassifierDisplay = (k) => ChangeSetClassifier[k] || k;

/**
 * Open / closed state of a ChangeSet.
 */
export const ChangeSetStatus = {
    OPEN:   'OPEN',
    CLOSED: 'CLOSED',
};
export const ChangeSetStatusKeys   = Object.keys(ChangeSetStatus);
export const ChangeSetStatusValues = Object.values(ChangeSetStatus);
export const isChangeSetStatusValid    = (v) => ChangeSetStatusKeys.includes(v);
export const getChangeSetStatusDisplay = (k) => ChangeSetStatus[k] || k;

// ---------------------------------------------------------------------------
// Entity model
// ---------------------------------------------------------------------------

/**
 * ChangeSet entity.
 *
 * @typedef {object} ChangeSet
 * @property {string}      id
 * @property {string}      code         — stable human-readable handle, e.g. CS-00001
 * @property {string}      title        — human-readable label
 * @property {string}      reasonText   — free-text justification
 * @property {string}      classifier   — ChangeSetClassifier key
 * @property {string[]}    commentRefs  — empty at P0; FBK-04 register ids at P1
 * @property {string}      status       — ChangeSetStatus key
 * @property {string}      createdAt
 * @property {string}      createdBy
 * @property {string|null} closedAt     — most recent closure; overwritten on reopen
 * @property {string|null} closedBy
 */
export const ChangeSet = {
    id:          '',
    code:        '',     // CS-#####
    title:       '',
    reasonText:  '',
    classifier:  '',     // ChangeSetClassifier key
    commentRefs: [],     // empty at P0
    status:      '',     // ChangeSetStatus key
    createdAt:   '',
    createdBy:   '',
    closedAt:    null,
    closedBy:    null,
};

// ---------------------------------------------------------------------------
// Commit fragment — write
// ---------------------------------------------------------------------------

/**
 * Commit metadata WRITTEN with every versioned-entity request
 * (OR/OC create, update, patch; Chapter update). Not entity content — it
 * identifies the ChangeSet a save commits under, plus an optional per-object note.
 *
 * @typedef {object} ChangeSetCommit
 * @property {string} changeSetId — required at the request layer; the save fails
 *                                  if missing or referring to a CLOSED set
 * @property {string} note        — optional per-object annotation (recorded on the AuditEvent)
 */
export const ChangeSetCommit = {
    changeSetId: '',
    note:        '',   // optional
};

// ---------------------------------------------------------------------------
// Member projection
// ---------------------------------------------------------------------------

/**
 * A single version committed under a ChangeSet (member-row projection).
 * Returned by ChangeSetStore.findMembers / ChangeSetService.getMembers, read
 * from the audit log via the UNDER_CHANGESET → TARGETS hop. The exact version
 * committed under the set is shown — not the latest version of the item. A given
 * item may appear multiple times if updated more than once within the set.
 *
 * @typedef {object} ChangeSetMember
 * @property {string}      itemId    — stable item identity
 * @property {string}      itemType  — 'ON' | 'OR' | 'OC' | 'CHAPTER' (AuditTargetType)
 * @property {string|null} code      — item code (null for pre-code chapters)
 * @property {string}      title
 * @property {string}      versionId
 * @property {number}      version
 * @property {string}      note      — per-object annotation (optional)
 */
export const ChangeSetMember = {
    itemId:    '',
    itemType:  '',   // ON | OR | OC | chapter
    code:      null,
    title:     '',
    versionId: '',
    version:   0,
    note:      '',   // optional
};