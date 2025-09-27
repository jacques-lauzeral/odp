export const MilestoneEventType = {
    'API_PUBLICATION': 'API Publication',
    'API_TEST_DEPLOYMENT': 'API Test Deployment',
    'UI_TEST_DEPLOYMENT': 'UI Test Deployment',
    'OPS_DEPLOYMENT': 'Operations Deployment',
    'API_DECOMMISSIONING': 'API Decommissioning'
};

export const MilestoneEventKeys = Object.keys(MilestoneEventType);
export const MilestoneEventValues = Object.values(MilestoneEventType);

export const isMilestoneEventValid = (value) => MilestoneEventKeys.includes(value);
export const getMilestoneEventDisplay = (key) => MilestoneEventType[key] || key;

// Event ordering (if needed for sequencing)
export const MilestoneEventOrder = [
    'API_PUBLICATION',
    'API_TEST_DEPLOYMENT',
    'UI_TEST_DEPLOYMENT',
    'OPS_DEPLOYMENT',
    'API_DECOMMISSIONING'
];