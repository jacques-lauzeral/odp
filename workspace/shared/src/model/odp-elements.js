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

// Management Entities

export const Baseline = {
    id: '',
    title: '',
    createdAt: '',
    createdBy: '',
    capturedItemCount: 0
};

export const Edition = {
    id: '',
    title: '',
    type: '',               // DRAFT | OFFICIAL
    createdAt: '',
    createdBy: '',
    baseline: null,         // AnnotatedReference {id, title, note}
    startsFromWave: null,   // AnnotatedReference {id, title, note}, optional
    minONMaturity: null     // DRAFT | ADVANCED | MATURE, optional
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
    refinesParents: [],         // array of OperationalEntityReference {id, code, title, type}
    // ON only — summary
    tentative: null,            // year period [year] or [start, end] where start <= end
    strategicDocuments: [],     // array of AnnotatedReference {id, title, note} (ReferenceDocument)
    // OR only — summary
    implementedONs: [],         // array of OperationalEntityReference {id, code, title, type}
    impactedStakeholders: [],   // array of AnnotatedReference {id, title, note} (StakeholderCategory)
    impactedDomains: [],        // array of AnnotatedReference {id, title, note} (Domain)
    dependencies: [],           // array of OperationalEntityReference {id, code, title, type} (OR)

    // rich-text fields — available in standard and extended projections only
    statement: '',              // rich text
    rationale: '',              // rich text
    flows: '',                  // rich text
    nfrs: '',                   // rich text — OR only
    privateNotes: '',           // rich text
    additionalDocumentation: [],// attachments — standard and extended only

    // derived fields — available in extended projection only (reverse-traversal)
    implementedByORs: [],       // array of OperationalEntityReference {id, code, title, type} — ON only
    implementedByOCs: [],       // array of OperationalEntityReference {id, code, title, type} — OR only
    decommissionedByOCs: [],    // array of OperationalEntityReference {id, code, title, type} — OR only
    refinedBy: [],              // array of OperationalEntityReference {id, code, title, type}
    requiredByORs: [],          // array of OperationalEntityReference {id, code, title, type} — OR only
};

export const Milestone = {
    id: '',
    milestoneKey: '',
    name: '',        // short text
    description: '', // rich text, optional
    eventTypes: [],  // array of MilestoneEventType keys
    wave: null       // Wave {id, year, sequenceNumber, implementationDate} or null
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
    implementedORs: [],         // array of OperationalEntityReference {id, code, title, type}
    decommissionedORs: [],      // array of OperationalEntityReference {id, code, title, type}
    dependencies: [],           // array of OperationalEntityReference {id, code, title, type} (OC)
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
    requiredByOCs: [],          // array of OperationalEntityReference {id, code, title, type}
};