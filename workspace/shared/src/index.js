
// API DataCategory model
export const DataCategory = {
    id: '',
    name: '',
    description: ''
};

// API DataCategory request structures
export const DataCategoryRequests = {
    // Create request - reuses DataCategory structure minus id, plus parentId
    create: {
        ...DataCategory,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses DataCategory structure plus parentId
    update: {
        ...DataCategory,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};

// API RegulatoryAspect model
export const RegulatoryAspect = {
    id: '',
    name: '',
    description: ''
};

// API RegulatoryAspect request structures
export const RegulatoryAspectRequests = {
    // Create request - reuses RegulatoryAspect structure minus id, plus parentId
    create: {
        ...RegulatoryAspect,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses RegulatoryAspect structure plus parentId
    update: {
        ...RegulatoryAspect,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};

// API StakeholderCategory model
export const StakeholderCategory = {
    id: '',
    name: '',
    description: ''
};

// API StakeholderCategory request structures
export const StakeholderCategoryRequests = {
    // Create request - reuses StakeholderCategory structure minus id, plus parentId
    create: {
        ...StakeholderCategory,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses StakeholderCategory structure plus parentId
    update: {
        ...StakeholderCategory,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};


// API Service model
export const Service = {
    id: '',
    name: '',
    description: ''
};

// API Service request structures
export const ServiceRequests = {
    // Create request - reuses Service structure minus id, plus parentId
    create: {
        ...Service,
        id: undefined, // not needed for create
        parentId: null // optional - for REFINES relationship
    },

    // Update request - reuses Service structure plus parentId
    update: {
        ...Service,
        parentId: null
    },

    // Query request
    query: {
        parentId: null // optional - filter by parent
    }
};
