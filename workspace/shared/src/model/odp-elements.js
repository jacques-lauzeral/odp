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
    refinesParents: [],
    impactsStakeholderCategories: [],
    impactsData: [],
    impactsServices: [],
    implementedONs: [], // OR type only
    referencesDocuments: [], // array of { documentId, note }
    dependsOnRequirements: [] // array of versionIds
};

export const OperationalChange = {
    itemId: 0,
    title: '',
    versionId: 0,
    version: 0,
    createdAt: '',
    createdBy: '',
    purpose: '', // renamed from description
    initialState: '',
    finalState: '',
    details: '',
    privateNotes: '',
    path: [], // array of strings
    visibility: '', // NM | NETWORK
    drg: '', // DraftingGroup enum
    satisfiesRequirements: [],
    supersedsRequirements: [],
    milestones: [],
    referencesDocuments: [], // array of { documentId, note }
    dependsOnChanges: [] // array of versionIds
};

export const OperationalChangeMilestone = {
    id: 0,
    milestoneKey: '',
    title: '',
    description: '',
    eventType: '', // MilestoneEventType enum
    targetDate: '',
    actualDate: '',
    waveId: 0,
    wave: null
};

// Management Entities
export const Baseline = {
    id: 0,
    title: '',
    createdAt: '',
    createdBy: '',
    capturedItemCount: 0
};

export const ODPEdition = {
    id: 0,
    title: '',
    type: '', // DRAFT | OFFICIAL
    createdAt: '',
    createdBy: '',
    baselineId: 0,
    startsFromWaveId: 0
};