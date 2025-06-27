// Common utility functions for ODP Web Client

// DOM manipulation helpers
export const dom = {
    // Create element with attributes and content
    create(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else if (key === 'textContent') {
                element.textContent = value;
            } else {
                element.setAttribute(key, value);
            }
        });

        if (content && !attributes.innerHTML && !attributes.textContent) {
            element.textContent = content;
        }

        return element;
    },

    // Clear element content
    clear(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    },

    // Find element by selector with optional parent
    find(selector, parent = document) {
        return parent.querySelector(selector);
    },

    // Find all elements by selector with optional parent
    findAll(selector, parent = document) {
        return Array.from(parent.querySelectorAll(selector));
    }
};

// String utilities
export const string = {
    // Convert camelCase to kebab-case
    toKebabCase(str) {
        return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase();
    },

    // Convert kebab-case to camelCase
    toCamelCase(str) {
        return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
    },

    // Capitalize first letter
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },

    // Convert to title case
    toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) =>
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    },

    // Truncate string with ellipsis
    truncate(str, length, suffix = '...') {
        if (str.length <= length) return str;
        return str.substring(0, length - suffix.length) + suffix;
    }
};

// Date and time utilities
export const date = {
    // Format date for display
    format(date, options = {}) {
        const defaultOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };
        return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options })
            .format(new Date(date));
    },

    // Format date for input fields
    toInputFormat(date) {
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    },

    // Check if date is valid
    isValid(date) {
        const d = new Date(date);
        return d instanceof Date && !isNaN(d);
    }
};

// Data validation utilities
export const validate = {
    // Check if value is empty
    isEmpty(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim().length === 0;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    },

    // Validate required field
    required(value, fieldName = 'Field') {
        if (this.isEmpty(value)) {
            throw new Error(`${fieldName} is required`);
        }
        return true;
    },

    // Validate string length
    length(value, min, max, fieldName = 'Field') {
        if (typeof value !== 'string') {
            throw new Error(`${fieldName} must be a string`);
        }
        if (value.length < min) {
            throw new Error(`${fieldName} must be at least ${min} characters`);
        }
        if (max && value.length > max) {
            throw new Error(`${fieldName} must be no more than ${max} characters`);
        }
        return true;
    },

    // Validate ID format (assuming numeric IDs)
    id(value, fieldName = 'ID') {
        const numericValue = parseInt(value, 10);
        if (isNaN(numericValue) || numericValue <= 0) {
            throw new Error(`${fieldName} must be a positive number`);
        }
        return true;
    }
};

// URL utilities
export const url = {
    // Build internal navigation URL
    build(path, params = {}) {
        let url = path;
        const searchParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                searchParams.append(key, value.toString());
            }
        });

        const queryString = searchParams.toString();
        return queryString ? `${url}?${queryString}` : url;
    },

    // Parse current URL parameters
    getParams() {
        return Object.fromEntries(new URLSearchParams(window.location.search));
    },

    // Get specific parameter
    getParam(name, defaultValue = null) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || defaultValue;
    }
};

// Data formatting utilities
export const format = {
    // Format entity name for display
    entityName(str) {
        return string.toTitleCase(str.replace(/([A-Z])/g, ' $1').trim());
    },

    // Format field name for display
    fieldName(str) {
        return string.toTitleCase(str.replace(/([A-Z])/g, ' $1').trim());
    },

    // Format number with appropriate precision
    number(value, precision = 0) {
        const num = parseFloat(value);
        if (isNaN(num)) return 'N/A';
        return num.toLocaleString('en-US', {
            minimumFractionDigits: precision,
            maximumFractionDigits: precision
        });
    }
};

// Async utilities
export const async = {
    // Delay execution
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // Debounce function calls
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};
