// Type declarations
export const EntityReference = {
    id: 0,
    title: '',
    note: '' // optional
};

export const OperationalRequirementReference = {
    id: 0,
    title: '',
    type: '' // ON | OR
};

// ODP Elements

export const OperationalRequirement = {
    itemId: 0,
    title: '',
    versionId: 0,
    version: 0,
    createdAt: '',
    createdBy: '',
    type: '', // ON | OR
    statement: '',
    rationale: '',
    flows: '',
    privateNotes: '',
    path: [], // array of strings
    drg: '', // DraftingGroup enum
    refinesParents: [], // array of OperationalRequirementReference
    impactsStakeholderCategories: [], // array of EntityReference
    impactsData: [], // array of EntityReference
    impactsServices: [], // array of EntityReference
    implementedONs: [], // array of OperationalRequirementReference (OR type only)
    documentReferences: [], // array of EntityReference
    dependsOnRequirements: [] // array of itemIds (strings)
};

export const OperationalChange = {
    itemId: 0,
    title: '',
    versionId: 0,
    version: 0,
    createdAt: '',
    createdBy: '',
    purpose: '',
    initialState: '',
    finalState: '',
    details: '',
    privateNotes: '',
    path: [], // array of strings
    visibility: '', // NM | NETWORK
    drg: '', // DraftingGroup enum
    satisfiesRequirements: [], // array of OperationalRequirementReference
    supersedsRequirements: [], // array of OperationalRequirementReference
    milestones: [],
    documentReferences: [], // array of EntityReference
    dependsOnChanges: [] // array of itemIds (strings)
};