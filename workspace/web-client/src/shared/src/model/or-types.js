export const OperationalRequirementType = {
    'ON': 'Operational Need',
    'OR': 'Operational Requirement'
};

export const OperationalRequirementTypeKeys = Object.keys(OperationalRequirementType);
export const OperationalRequirementTypeValues = Object.values(OperationalRequirementType);

// Helper functions
export const isOperationalRequirementTypeValid = (value) => OperationalRequirementTypeKeys.includes(value);
export const getOperationalRequirementTypeDisplay = (key) => OperationalRequirementType[key] || key;