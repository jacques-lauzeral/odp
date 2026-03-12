export const MaturityLevel = {
    'DRAFT':    'Draft',
    'ADVANCED': 'Advanced',
    'MATURE':   'Mature'
};

export const MaturityLevelKeys = Object.keys(MaturityLevel);
export const MaturityLevelValues = Object.values(MaturityLevel);

export const isMaturityLevelValid = (value) => MaturityLevelKeys.includes(value);
export const getMaturityLevelDisplay = (key) => MaturityLevel[key] || key;