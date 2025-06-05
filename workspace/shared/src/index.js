// StakeholderCategory API model
export const StakeholderCategory = {
    id: '',
    name: '',
    description: ''
};

// API request structures
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