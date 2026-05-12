export const DraftingGroup = {
    '4DT': '4D-Trajectory',
    'AIRPORT': 'Airport',
    'AIRSPACE': 'Airspace (iDL)',
    'ASM_ATFCM': 'ASM/ATFCM Integration',
    'CRISIS': 'Crisis',
    'FAAS': 'FAAS',
    'FLOW': 'Flow',
    'RRT': 'Rerouting',
    'TCF': 'Transponder Code Function',
    'TRANSVERSAL': 'Transversal',
};

export const DraftingGroupKeys = Object.keys(DraftingGroup);
export const DraftingGroupValues = Object.values(DraftingGroup);

// Helper functions
export const isDraftingGroupValid = (value) => DraftingGroupKeys.includes(value);
export const getDraftingGroupDisplay = (key) => DraftingGroup[key] || key;