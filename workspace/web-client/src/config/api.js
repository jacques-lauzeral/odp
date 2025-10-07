// API configuration for ODP Web Client
export const apiConfig = {
    // Base API URL - defaults to same origin in development
    baseUrl: window.location.hostname === 'localhost' ? 'http://localhost' : window.location.origin,

    // Request timeout in milliseconds
    timeout: 30000,

    // Default headers for all requests
    defaultHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
};

// Entity endpoint mappings following server route structure
export const endpoints = {
    // Setup Management entities
    stakeholderCategories: '/stakeholder-categories',
    dataCategories: '/data-categories',
    services: '/services',
    documents: '/documents',
    waves: '/waves',

    // Operational entities
    operationalRequirements: '/operational-requirements',
    operationalChanges: '/operational-changes',

    // Edition and baseline management
    baselines: '/baselines',
    odpEditions: '/odp-editions',

    // Health check
    health: '/hello'
};

// Helper function to build full URL
export function buildUrl(endpoint, id = null, subPath = null) {
    let url = `${apiConfig.baseUrl}${endpoint}`;

    if (id) {
        url += `/${id}`;
    }

    if (subPath) {
        url += `/${subPath}`;
    }

    return url;
}

// Helper function to build query string
export function buildQueryString(params) {
    if (!params || Object.keys(params).length === 0) {
        return '';
    }

    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            searchParams.append(key, value.toString());
        }
    }

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
}