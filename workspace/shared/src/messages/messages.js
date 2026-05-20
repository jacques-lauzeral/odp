// Messages

import { OperationalRequirement, OperationalChange } from '../model/odp-elements.js';
import { StakeholderCategory, Bandwidth, ReferenceDocument, Wave } from '../model/setup-elements.js';

// Request Models
export const OperationalRequirementRequests = {
    create: {
        ...OperationalRequirement,
        itemId: undefined,
        versionId: undefined,
        version: undefined,
        code: undefined,
        createdAt: undefined,
        createdBy: undefined,
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
        expectedVersionId: '',
        // Any subset of OperationalRequirement fields
    }
};

export const OperationalChangeRequests = {
    create: {
        ...OperationalChange,
        itemId: undefined,
        versionId: undefined,
        version: undefined,
        code: undefined,
        createdAt: undefined,
        createdBy: undefined,
        // derived fields excluded from create/update
        requiredByOCs: undefined,
        // path: transient topic locator on create only — not stored on the version
        path: ''
    },

    update: {
        ...OperationalChange,
        code: undefined,
        expectedVersionId: '',
        // derived fields excluded from update
        requiredByOCs: undefined,
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