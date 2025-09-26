export const DraftingGroup = {
    '4DT': '4D-Trajectory',
    'AIRPORT': 'Airport',
    'ASM_ATFCM': 'ASM / ATFCM Integration',
    'CRISIS_FAAS': 'Crisis and FAAS',
    'FLOW': 'Flow',
    'IDL': 'iDL',
    'NM_B2B': 'NM B2B',
    'NMUI': 'NMUI',
    'PERF': 'Performance',
    'RRT': 'Rerouting',
    'TCF': 'TCF'
};

export const DraftingGroupKeys = Object.keys(DraftingGroup);
export const DraftingGroupValues = Object.values(DraftingGroup);

// Helper functions
export const isDraftingGroupValid = (value) => DraftingGroupKeys.includes(value);
export const getDraftingGroupDisplay = (key) => DraftingGroup[key] || key;