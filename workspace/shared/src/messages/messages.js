import { OperationalRequirement, OperationalChange } from '../model/odp-elements.js';
import { StakeholderCategory, DataCategory, Service, RegulatoryAspect, Wave } from '../model/setup-elements.js';

// Request Models
export const OperationalRequirementRequests = {
    create: {
        ...OperationalRequirement,
        itemId: undefined,
        versionId: undefined,
        version: undefined,
        createdAt: undefined,
        createdBy: undefined
    },

    update: {
        ...OperationalRequirement,
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
        createdAt: undefined,
        createdBy: undefined
    },

    update: {
        ...OperationalChange,
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

// Complete the pattern for other setup entities
export const DataCategoryRequests = {
    create: {
        ...DataCategory,
        id: undefined,
        parentId: null
    },

    update: {
        ...DataCategory,
        parentId: null
    },

    query: {
        parentId: null
    }
};

export const ServiceRequests = {
    create: {
        ...Service,
        id: undefined,
        parentId: null
    },

    update: {
        ...Service,
        parentId: null
    },

    query: {
        parentId: null
    }
};

export const RegulatoryAspectRequests = {
    create: {
        ...RegulatoryAspect,
        id: undefined,
        parentId: null
    },

    update: {
        ...RegulatoryAspect,
        parentId: null
    },

    query: {
        parentId: null
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
        quarter: null
    }
};