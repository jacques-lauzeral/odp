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
    references: '',
    risksAndOpportunities: '',
    flows: '',
    flowExamples: '',
    drg: '', // DraftingGroup enum
    refinesParents: [],
    impactsStakeholderCategories: [],
    impactsData: [],
    impactsServices: [],
    impactsRegulatoryAspects: [],
    implementedONs: [] // OR type only
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
    visibility: '', // NM | NETWORK
    drg: '', // DraftingGroup enum
    satisfiesRequirements: [],
    supersedsRequirements: [],
    milestones: []
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
