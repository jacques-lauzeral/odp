// Messages

import { OperationalRequirement, OperationalChange } from '../model/odp-elements.js';
import { StakeholderCategory, Domain, Bandwidth, ReferenceDocument, Wave } from '../model/setup-elements.js';

// Request Models
export const OperationalRequirementRequests = {
    create: {
        ...OperationalRequirement,
        itemId: undefined,
        versionId: undefined,
        version: undefined,
        code: undefined,
        createdAt: undefined,
        createdBy: undefined
    },

    update: {
        ...OperationalRequirement,
        code: undefined,
        expectedVersionId: ''
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
        createdBy: undefined
    },

    update: {
        ...OperationalChange,
        code: undefined,
        expectedVersionId: ''
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

export const DomainRequests = {
    create: {
        ...Domain,
        id: undefined,
        parentId: null
    },

    update: {
        ...Domain,
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