export const normalizeId = (id) => {
    if (typeof id === 'string') return parseInt(id, 10);
    if (typeof id === 'number') return id;
    if (id && typeof id.toNumber === 'function') return id.toNumber(); // Neo4j Integer
    throw new Error('Invalid ID format');
};

export const isValidId = (id) => {
    try {
        const normalized = normalizeId(id);
        return Number.isInteger(normalized) && normalized >= 0;
    } catch {
        return false;
    }
};

// Lazy comparison utilities
export const lazyEquals = (a, b) => {
    // Handle exact equality first
    if (a === b) return true;

    // Handle null/undefined
    if (a == null || b == null) return false;

    // Handle integer/string comparison only
    if ((typeof a === 'string' && typeof b === 'number') ||
        (typeof a === 'number' && typeof b === 'string')) {
        try {
            return normalizeId(a) === normalizeId(b);
        } catch {
            return false;
        }
    }

    // Handle Neo4j Integer objects
    if (a && typeof a.toNumber === 'function') {
        try {
            return normalizeId(a) === normalizeId(b);
        } catch {
            return false;
        }
    }

    if (b && typeof b.toNumber === 'function') {
        try {
            return normalizeId(a) === normalizeId(b);
        } catch {
            return false;
        }
    }

    return false;
};

// Convenience method for ID comparison
export const idsEqual = (id1, id2) => {
    try {
        return normalizeId(id1) === normalizeId(id2);
    } catch {
        return false;
    }
};