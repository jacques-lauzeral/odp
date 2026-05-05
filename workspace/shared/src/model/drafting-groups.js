export const DraftingGroup = {
    '4DT': '4D-Trajectory',
    'AIRPORT': 'Airport',
    'ASM_ATFCM': 'ASM/ATFCM Integration',
    'CRISIS': 'Crisis',
    'FAAS': 'FAAS',
    'FLOW': 'Flow',
    'IDL': 'Airspace (iDL)',
    'NM': 'Network Manager',
    'NM_B2B': 'NM B2B',
    'NMUI': 'NMUI',
    'RRT': 'Rerouting',
    'TCF': 'Transponder Code Function'
};

export const DraftingGroupKeys = Object.keys(DraftingGroup);
export const DraftingGroupValues = Object.values(DraftingGroup);

// Helper functions
export const isDraftingGroupValid = (value) => DraftingGroupKeys.includes(value);
export const getDraftingGroupDisplay = (key) => DraftingGroup[key] || key;