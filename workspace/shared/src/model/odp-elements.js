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
    // summary fields — available in all projections
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '',
    type: '',                   // ON | OR
    maturity: '',               // DRAFT | ADVANCED | MATURE
    path: [],                   // array of strings
    drg: '',                    // DraftingGroup enum
    refinesParents: [],         // array of OperationalEntityReference
    // ON only — summary
    tentative: null,            // year period [year] or [start, end] where start <= end
    strategicDocuments: [],     // array of AnnotatedReference (ReferenceDocument)
    // OR only — summary
    implementedONs: [],         // array of OperationalEntityReference
    impactedStakeholders: [],   // array of AnnotatedReference (StakeholderCategory)
    impactedDomains: [],        // array of AnnotatedReference (Domain)
    dependencies: [],           // array of OperationalEntityReference (OR)

    // rich-text fields — available in standard and extended projections only
    statement: '',              // rich text
    rationale: '',              // rich text
    flows: '',                  // rich text
    nfrs: '',                   // rich text — OR only
    privateNotes: '',           // rich text
    additionalDocumentation: [],// attachments — standard and extended only

    // derived fields — available in extended projection only (reverse-traversal)
    implementedByORs: [],       // ORs whose implementedONs references this ON — ON only
    implementedByOCs: [],       // OCs whose implementedORs references this OR — OR only
    decommissionedByOCs: [],    // OCs whose decommissionedORs references this OR — OR only
    refinedBy: [],              // requirements whose refinesParents references this requirement
    requiredByORs: [],          // ORs whose dependencies references this OR — OR only
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
    // summary fields — available in all projections
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '',
    maturity: '',               // DRAFT | ADVANCED | MATURE
    path: [],                   // array of strings
    drg: '',                    // DraftingGroup enum
    implementedORs: [],         // array of OperationalEntityReference
    decommissionedORs: [],      // array of OperationalEntityReference
    dependencies: [],           // array of OperationalEntityReference (OC)
    milestones: [],             // array of Milestone
    cost: null,                 // integer, in MW, optional
    orCosts: [],                // array of ORCost

    // rich-text fields — available in standard and extended projections only
    purpose: '',                // rich text
    initialState: '',           // rich text
    finalState: '',             // rich text
    details: '',                // rich text
    privateNotes: '',           // rich text
    additionalDocumentation: [],// attachments — standard and extended only

    // derived fields — available in extended projection only (reverse-traversal)
    requiredByOCs: [],          // OCs whose dependencies references this OC
};