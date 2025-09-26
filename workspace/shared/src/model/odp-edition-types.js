export const ODPEditionType = {
    'DRAFT': 'Draft',
    'OFFICIAL': 'Official'
};

export const ODPEditionTypeKeys = Object.keys(ODPEditionType);
export const ODPEditionTypeValues = Object.values(ODPEditionType);

// Helper functions
export const isODPEditionTypeValid = (value) => ODPEditionTypeKeys.includes(value);
export const getODPEditionTypeDisplay = (key) => ODPEditionType[key] || key;