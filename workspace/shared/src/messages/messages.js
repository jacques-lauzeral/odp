// Messages

import { OperationalRequirement, OperationalChange } from '../model/odp-elements.js';
import { StakeholderCategory, Bandwidth, ReferenceDocument, Wave } from '../model/setup-elements.js';
import { ChangeSet, ChangeSetCommit } from '../model/change-set-elements.js';

/**
 * Explicit marker for a field that is **not accepted on write**. Stamped onto a
 * request model in place of a value, it reads as intent ("forbidden") rather than
 * the ambiguous `undefined` (which looks like a no-op and collides with "optional").
 * Each operation (create / update) declares its own forbidden set independently —
 * a field may be writable on create but not update (e.g. `path`) or vice versa
 * (e.g. `expectedVersionId`), so the lists are deliberately not shared.
 */
export const FORBIDDEN = Symbol('forbidden');

/**
 * Derive the accepted-field allowlist from a request model: every key whose value
 * is not the FORBIDDEN marker. Used by the service layer for strict-payload
 * validation — a payload key absent from this set is an unexpected attribute and
 * is rejected (BAD_REQUEST).
 *
 * @param {object} requestModel — one of the *Requests.{create,update,...} models
 * @returns {string[]} the allowed field names
 */
export const allowedFields = (requestModel) =>
    Object.keys(requestModel).filter(k => requestModel[k] !== FORBIDDEN);

// Request Models
//
// Each operation declares its own forbidden fields explicitly via FORBIDDEN.
// create and update are intentionally independent — note `path` is allowed on
// create only, `expectedVersionId` on update only. Identity / derived fields
// (itemId, versionId, version, code, lifecycleStatus, and the reverse-traversal
// derived fields) are forbidden on every write.

export const OperationalRequirementRequests = {
    create: {
        ...OperationalRequirement,
        ...ChangeSetCommit,
        itemId: FORBIDDEN,
        versionId: FORBIDDEN,
        version: FORBIDDEN,
        code: FORBIDDEN,
        lifecycleStatus: FORBIDDEN,
        // derived (reverse-traversal) fields — never written
        implementedByORs: FORBIDDEN,
        implementedByOCs: FORBIDDEN,
        decommissionedByOCs: FORBIDDEN,
        refinedBy: FORBIDDEN,
        requiredByORs: FORBIDDEN,
        // path: transient topic locator on create only — not stored on the version
        path: ''
    },

    update: {
        ...OperationalRequirement,
        ...ChangeSetCommit,
        itemId: FORBIDDEN,
        versionId: FORBIDDEN,
        version: FORBIDDEN,
        code: FORBIDDEN,
        lifecycleStatus: FORBIDDEN,
        // derived (reverse-traversal) fields — never written
        implementedByORs: FORBIDDEN,
        implementedByOCs: FORBIDDEN,
        decommissionedByOCs: FORBIDDEN,
        refinedBy: FORBIDDEN,
        requiredByORs: FORBIDDEN,
        // path is NOT accepted on update (create-only); expectedVersionId is update-only
        expectedVersionId: '',
    },

    patch: {
        ...ChangeSetCommit,
        expectedVersionId: '',
        // Any subset of OperationalRequirement fields — the allowlist for patch is
        // derived from the update model (which entity fields are writable on update),
        // not from this sparse literal.
    }
};

export const OperationalChangeRequests = {
    create: {
        ...OperationalChange,
        ...ChangeSetCommit,
        itemId: FORBIDDEN,
        versionId: FORBIDDEN,
        version: FORBIDDEN,
        code: FORBIDDEN,
        lifecycleStatus: FORBIDDEN,
        // derived (reverse-traversal) field — never written
        requiredByOCs: FORBIDDEN,
        // path: transient topic locator on create only — not stored on the version
        path: ''
    },

    update: {
        ...OperationalChange,
        ...ChangeSetCommit,
        itemId: FORBIDDEN,
        versionId: FORBIDDEN,
        version: FORBIDDEN,
        code: FORBIDDEN,
        lifecycleStatus: FORBIDDEN,
        // derived (reverse-traversal) field — never written
        requiredByOCs: FORBIDDEN,
        // path is NOT accepted on update (create-only); expectedVersionId is update-only
        expectedVersionId: '',
    }
};

// Chapter requests — relocated here from chapter-elements.js for consistency of
// location with the other request models. Flat shape preserved: chapters are
// update-only (created from edition.json config, not via the API).
// osHierarchy.topics[].ons/ors/ocs must be integer arrays on write.
export const ChapterRequests = {
    ...ChangeSetCommit,
    narrative:         null,
    osHierarchy:       null,
    expectedVersionId: null,
};

export const ChangeSetRequests = {
    create: {
        ...ChangeSet,
        id: undefined,
        status: undefined,        // server initialises to OPEN
        commentRefs: undefined,   // empty at P0, server-managed
        createdAt: undefined,
        createdBy: undefined,
        closedAt: undefined,
        closedBy: undefined,
        // leaves: title, classifier, reasonText
    },

    update: {
        // editable while OPEN (per change-set detail view)
        title: '',
        reasonText: '',
    },

    query: {
        status: null,
        classifier: null,
    }
};

export const StakeholderCategoryRequests = {
    create: {
        ...StakeholderCategory,
        id: undefined,
        parentId: null
    },

    update: {
        ...StakeholderCategory,
        parentId: null
    },

    query: {
        parentId: null
    }
};

export const BandwidthRequests = {
    create: {
        ...Bandwidth,
        id: undefined
    },

    update: {
        ...Bandwidth
    },

    query: {
        year: null,
        waveId: null,
        scopeId: null
    }
};

export const ReferenceDocumentRequests = {
    create: {
        ...ReferenceDocument,
        id: undefined
    },

    update: {
        ...ReferenceDocument
    },

    query: {
        name: null,
        version: null
    }
};

export const WaveRequests = {
    create: {
        ...Wave,
        id: undefined
    },

    update: {
        ...Wave
    },

    query: {
        year: null,
        sequenceNumber: null
    }
};