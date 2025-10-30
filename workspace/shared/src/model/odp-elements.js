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

// ODP Elements

export const OperationalRequirement = {
    itemId: '',
    title: '', // string
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '', // string
    type: '', // ON | OR
    statement: '', // rich text
    rationale: '', // rich text
    flows: '', // rich text
    privateNotes: '', // rich text
    path: [], // array of strings
    drg: '', // DraftingGroup enum
    refinesParents: [], // array of OperationalEntityReference
    impactsStakeholderCategories: [], // array of AnnotatedReference
    impactsData: [], // array of AnnotatedReference
    impactsServices: [], // array of AnnotatedReference
    implementedONs: [], // array of OperationalEntityReference (OR type only)
    documentReferences: [], // array of AnnotatedReference
    dependsOnRequirements: [] // array of OperationalEntityReference
};

export const Milestone = {
    id: '',
    milestoneKey: '',
    title: '', // string
    description: '', // rich text
    eventType: '', // API_PUBLICATION | API_TEST_DEPLOYMENT | UI_TEST_DEPLOYMENT | OPS_DEPLOYMENT | API_DECOMMISSIONING
    targetDate: '',
    actualDate: null, // string or null
    wave: null // Wave object or null
};

export const OperationalChange = {
    itemId: '',
    title: '', // string
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '', // string
    purpose: '', // rich text
    initialState: '', // rich text
    finalState: '', // rich text
    details: '', // rich text
    privateNotes: '', // rich text
    path: [], // array of strings
    visibility: '', // NM | NETWORK
    drg: '', // DraftingGroup enum
    satisfiesRequirements: [], // array of OperationalEntityReference
    supersedsRequirements: [], // array of OperationalEntityReference
    dependsOnChanges: [], // array of OperationalEntityReference
    documentReferences: [], // array of AnnotatedReference
    milestones: [] // array of Milestone
};