// Messages

import { OperationalRequirement, OperationalChange } from '../model/odp-elements.js';
import { StakeholderCategory, Bandwidth, ReferenceDocument, Wave } from '../model/setup-elements.js';
import { ChangeSet, ChangeSetCommit } from '../model/change-set-elements.js';

// Request Models
export const OperationalRequirementRequests = {
    create: {
        ...OperationalRequirement,
        ...ChangeSetCommit,
        itemId: undefined,
        versionId: undefined,
        version: undefined,
        code: undefined,
        // derived fields excluded from create/update
        implementedByORs: undefined,
        implementedByOCs: undefined,
        decommissionedByOCs: undefined,
        refinedBy: undefined,
        requiredByORs: undefined,
        // path: transient topic locator on create only — not stored on the version
        path: ''
    },

    update: {
        ...OperationalRequirement,
        ...ChangeSetCommit,
        code: undefined,
        expectedVersionId: '',
        // derived fields excluded from update
        implementedByORs: undefined,
        implementedByOCs: undefined,
        decommissionedByOCs: undefined,
        refinedBy: undefined,
        requiredByORs: undefined,
    },

    patch: {
        ...ChangeSetCommit,
        expectedVersionId: '',
        // Any subset of OperationalRequirement fields
    }
};

export const OperationalChangeRequests = {
    create: {
        ...OperationalChange,
        ...ChangeSetCommit,
        itemId: undefined,
        versionId: undefined,
        version: undefined,
        code: undefined,
        // derived fields excluded from create/update
        requiredByOCs: undefined,
        // path: transient topic locator on create only — not stored on the version
        path: ''
    },

    update: {
        ...OperationalChange,
        ...ChangeSetCommit,
        code: undefined,
        expectedVersionId: '',
        // derived fields excluded from update
        requiredByOCs: undefined,
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