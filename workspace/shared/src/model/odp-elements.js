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
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '',
    type: '', // ON | OR
    statement: '',
    rationale: '',
    flows: '',
    privateNotes: '',
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
    title: '',
    description: '',
    eventType: '', // API_PUBLICATION | API_TEST_DEPLOYMENT | UI_TEST_DEPLOYMENT | OPS_DEPLOYMENT | API_DECOMMISSIONING
    targetDate: '',
    actualDate: null, // string or null
    wave: null // Wave object or null
};

export const OperationalChange = {
    itemId: '',
    title: '',
    versionId: '',
    version: 0,
    createdAt: '',
    createdBy: '',
    code: '',
    purpose: '',
    initialState: '',
    finalState: '',
    details: '',
    privateNotes: '',
    path: [], // array of strings
    visibility: '', // NM | NETWORK
    drg: '', // DraftingGroup enum
    satisfiesRequirements: [], // array of OperationalEntityReference
    supersedsRequirements: [], // array of OperationalEntityReference
    dependsOnChanges: [], // array of OperationalEntityReference
    documentReferences: [], // array of AnnotatedReference
    milestones: [] // array of Milestone
};