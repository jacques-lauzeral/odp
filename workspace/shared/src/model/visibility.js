export const Visibility = {
    'NM': 'Network Manager',
    'NETWORK': 'Network'
};

export const VisibilityKeys = Object.keys(Visibility);
export const VisibilityValues = Object.values(Visibility);

// Helper functions
export const isVisibilityValid = (value) => VisibilityKeys.includes(value);
export const getVisibilityDisplay = (key) => Visibility[key] || key;