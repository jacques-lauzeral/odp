// API DataCategory model
export const DataCategory = {
    id: '',
    name: '',
    description: ''
};

// API DataCategory request structures
export const DataCategoryRequests = {
    // Create request - reuses DataCategory structure minus id, plus parentId
    create: {
        ...DataCategory,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses DataCategory structure plus parentId
    update: {
        ...DataCategory,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};

// API RegulatoryAspect model
export const RegulatoryAspect = {
    id: '',
    name: '',
    description: ''
};

// API RegulatoryAspect request structures
export const RegulatoryAspectRequests = {
    // Create request - reuses RegulatoryAspect structure minus id, plus parentId
    create: {
        ...RegulatoryAspect,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses RegulatoryAspect structure plus parentId
    update: {
        ...RegulatoryAspect,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};

// API StakeholderCategory model
export const StakeholderCategory = {
    id: '',
    name: '',
    description: ''
};

// API StakeholderCategory request structures
export const StakeholderCategoryRequests = {
    // Create request - reuses StakeholderCategory structure minus id, plus parentId
    create: {
        ...StakeholderCategory,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses StakeholderCategory structure plus parentId
    update: {
        ...StakeholderCategory,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};

// API Service model
export const Service = {
    id: '',
    name: '',
    description: ''
};

// API Service request structures
export const ServiceRequests = {
    // Create request - reuses Service structure minus id, plus parentId
    create: {
        ...Service,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses Service structure plus parentId
    update: {
        ...Service,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};

// API Wave model
export const Wave = {
    id: '',
    year: 0,        // 4-digit year (YYYY)
    quarter: 0,     // Quarter number (1-4)
    date: '',       // Target date (YYYY-MM-DD)
    name: ''        // Derived name (year.quarter, e.g., "2025.1")
};

// API Wave request structures
export const WaveRequests = {
    // Create request - year, quarter, date (name is derived)
    create: {
        year: 0,        // Required: 4-digit year in range [2025, 2124[
        quarter: 0,     // Required: Quarter number (1-4)
        date: ''        // Required: Target date in RFC 3339 format (YYYY-MM-DD)
        // name is automatically generated as "year.quarter"
    },

    // Update request - same as create (complete replacement)
    update: {
        year: 0,        // Required: 4-digit year in range [2025, 2124[
        quarter: 0,     // Required: Quarter number (1-4)
        date: ''        // Required: Target date in RFC 3339 format (YYYY-MM-DD)
        // name is automatically generated as "year.quarter"
    }
};

// API Baseline model
export const Baseline = {
    id: '',
    title: '',                  // Human-readable identifier
    createdAt: '',             // Baseline creation timestamp
    createdBy: '',             // Baseline creator
    capturedItemCount: 0,      // Number of OR/OC versions captured
    startsFromWave: null       // Optional wave reference object {id, name, year, quarter, date}
};

// API Baseline request structures
export const BaselineRequests = {
    // Create request - title and optional wave reference
    create: {
        title: '',              // Required: Unique baseline identifier
        startsFromWaveId: null  // Optional: Wave ID that this baseline starts from
    }

    // No update request - baselines are immutable once created
    // No delete request - baselines are immutable for historical integrity
};

// Milestone Event Types for validation and UI
export const MilestoneEventTypes = [
    'API_PUBLICATION',
    'API_TEST_DEPLOYMENT',
    'UI_TEST_DEPLOYMENT',
    'SERVICE_ACTIVATION',
    'API_DECOMMISSIONING',
    'OTHER'
];

// API OperationalRequirement model
export const OperationalRequirement = {
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    type: 'OR',  // 'ON' | 'OR'
    statement: '',
    rationale: '',
    references: '',
    risksAndOpportunities: '',
    flows: '',
    flowExamples: '',
    refinesParents: [],  // Array of {id, title, type} references
    impactsStakeholderCategories: [],  // Array of {id, title} references
    impactsData: [],  // Array of {id, title} references
    impactsServices: [],  // Array of {id, title} references
    impactsRegulatoryAspects: []  // Array of {id, title} references
};

// API OperationalRequirement request structures
export const OperationalRequirementRequests = {
    // Create request - all content + relationship arrays (IDs only)
    create: {
        title: '',
        type: 'OR',
        statement: '',
        rationale: '',
        references: '',
        risksAndOpportunities: '',
        flows: '',
        flowExamples: '',
        refinesParents: [],  // Array of item IDs
        impactsStakeholderCategories: [],  // Array of entity IDs
        impactsData: [],  // Array of entity IDs
        impactsServices: [],  // Array of entity IDs
        impactsRegulatoryAspects: []  // Array of entity IDs
    },

    // Update request - same as create (complete payload required)
    update: {
        title: '',
        type: 'OR',
        statement: '',
        rationale: '',
        references: '',
        risksAndOpportunities: '',
        flows: '',
        flowExamples: '',
        refinesParents: [],  // Array of item IDs
        impactsStakeholderCategories: [],  // Array of entity IDs
        impactsData: [],  // Array of entity IDs
        impactsServices: [],  // Array of entity IDs
        impactsRegulatoryAspects: []  // Array of entity IDs
    }
};

// API OperationalChange model
export const OperationalChange = {
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    description: '',
    visibility: 'NETWORK',  // 'NM' | 'NETWORK'
    satisfiesRequirements: [],  // Array of {id, title, type} references
    supersedsRequirements: [],  // Array of {id, title, type} references
    milestones: []  // Array of milestone objects
};

// API OperationalChange request structures
export const OperationalChangeRequests = {
    // Create request - all content + relationship arrays (IDs only) + milestones
    create: {
        title: '',
        description: '',
        visibility: 'NETWORK',
        satisfiesRequirements: [],  // Array of requirement item IDs
        supersedsRequirements: [],  // Array of requirement item IDs
        milestones: [  // Array of milestone objects
            {
                title: '',  // Optional
                description: '',  // Optional
                eventTypes: [],  // Optional array of MilestoneEventTypes
                waveId: null  // Optional wave ID
            }
        ]
    },

    // Update request - same as create (complete payload required)
    update: {
        title: '',
        description: '',
        visibility: 'NETWORK',
        satisfiesRequirements: [],  // Array of requirement item IDs
        supersedsRequirements: [],  // Array of requirement item IDs
        milestones: [  // Array of milestone objects
            {
                title: '',  // Optional
                description: '',  // Optional
                eventTypes: [],  // Optional array of MilestoneEventTypes
                waveId: null  // Optional wave ID
            }
        ]
    }
};