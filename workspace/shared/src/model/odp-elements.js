// Type declarations
export const AnnotatedReference = {
    id: '',
    title: '',
    note: '' // optional
};

export const OperationalEntityReference = {
    id: '',
    code: '',
    title: '',
    type: '' // ON | OR | OC
};

export const ORCost = {
    or: null, // OperationalEntityReference
    cost: 0   // integer, in MW
};

// ODIP Elements

export const OperationalRequirement = {
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '',
    type: '',       // ON | OR
    maturity: '',   // DRAFT | ADVANCED | MATURE
    statement: '',  // rich text
    rationale: '',  // rich text
    flows: '',      // rich text
    privateNotes: '',           // rich text
    additionalDocumentation: [],// attachments
    path: [],       // array of strings
    drg: '',        // DraftingGroup enum
    refinesParents: [],         // array of OperationalEntityReference
    // ON only
    tentative: null,            // year period [year] or [start, end] where start <= end
    strategicDocuments: [],     // array of AnnotatedReference (ReferenceDocument)
    // OR only
    implementedONs: [],         // array of OperationalEntityReference
    impactedStakeholders: [],   // array of AnnotatedReference (StakeholderCategory)
    impactedDomains: [],        // array of AnnotatedReference (Domain)
    dependencies: [],           // array of OperationalEntityReference (OR)
    nfrs: ''                    // rich text
};

export const Milestone = {
    id: '',
    milestoneKey: '',
    name: '',        // short text
    description: '', // rich text, optional
    eventTypes: [],  // array of MilestoneEventType keys
    wave: null       // Wave object or null
};

export const OperationalChange = {
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '',
    maturity: '',   // DRAFT | ADVANCED | MATURE
    purpose: '',    // rich text
    initialState: '',           // rich text
    finalState: '',             // rich text
    details: '',    // rich text
    privateNotes: '',           // rich text
    additionalDocumentation: [],// attachments
    path: [],       // array of strings
    drg: '',        // DraftingGroup enum
    implementedORs: [],         // array of OperationalEntityReference
    decommissionedORs: [],      // array of OperationalEntityReference
    dependencies: [],           // array of OperationalEntityReference (OC)
    milestones: [],             // array of Milestone
    cost: null,     // integer, in MW, optional
    orCosts: []     // array of ORCost
};