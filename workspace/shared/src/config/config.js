// ---------------------------------------------------------------------------
// Structure definitions
// ---------------------------------------------------------------------------

export const SubDomain = {
    key: '',    // stable domain key
    label: ''   // display label
};

export const DomainEntry = {
    key: '',            // stable domain key
    label: '',          // display label
    subDomains: []      // SubDomain[] — optional, max one level
};

export const DomainsConfig = {
    domains: []         // DomainEntry[]
};

export const ChapterEntry = {
    key: '',              // stable identifier — used for bootstrap DB matching
    title: '',            // display title — config-owned, not user-editable
    position: 0,          // ordering within parent
    domain: '',           // domain key — absent on pure narrative chapters
    generatedBlocks: [],  // string[] — block IDs available for insertion in this chapter's narrative
    generatedStrings: [], // string[] — inline string keys available for insertion in this chapter's narrative
    primaryScope: '',     // string   — brief scope description shown in portfolio table
    subChapters: [],      // ChapterEntry[] — optional, max one level
    parentKey: ''         // parent chapter key — set on sub-chapters by getChapters()
};

export const EditionConfig = {
    chapters: []        // ChapterEntry[]
};

// ---------------------------------------------------------------------------
// DomainsConfig helpers
// ---------------------------------------------------------------------------

/**
 * Flat list of all domain keys, including sub-domain keys.
 *
 * @param {DomainsConfig} config
 * @returns {string[]}
 */
export function getDomainKeys(config) {
    const keys = [];
    for (const entry of config.domains) {
        keys.push(entry.key);
        if (entry.subDomains) {
            for (const sub of entry.subDomains) keys.push(sub.key);
        }
    }
    return keys;
}

/**
 * Display label for a domain key, or the key itself if not found.
 *
 * @param {DomainsConfig} config
 * @param {string} key
 * @returns {string}
 */
export function getDomainLabel(config, key) {
    for (const entry of config.domains) {
        if (entry.key === key) return entry.label;
        if (entry.subDomains) {
            for (const sub of entry.subDomains) {
                if (sub.key === key) return sub.label;
            }
        }
    }
    return key;
}

/**
 * Whether the given key is a valid domain key (top-level or sub-domain).
 *
 * @param {DomainsConfig} config
 * @param {string} key
 * @returns {boolean}
 */
export function isDomainValid(config, key) {
    return getDomainKeys(config).includes(key);
}

// ---------------------------------------------------------------------------
// EditionConfig helpers
// ---------------------------------------------------------------------------

/**
 * Flat ordered list of all chapters including sub-chapters.
 * Sub-chapters carry a `parentKey` property.
 *
 * @param {EditionConfig} config
 * @returns {ChapterEntry[]}
 */
export function getChapters(config) {
    const flat = [];
    for (const chapter of config.chapters) {
        flat.push(chapter);
        if (chapter.subChapters) {
            for (const sub of chapter.subChapters) {
                flat.push({ ...sub, parentKey: chapter.key });
            }
        }
    }
    return flat;
}

/**
 * Single chapter entry by stable code (= chapter key from edition.json), or null if not found.
 *
 * @param {EditionConfig} config
 * @param {string} code - Stable chapter code stored as item.code in DB
 * @returns {ChapterEntry|null}
 */
export function getChapterByCode(config, code) {
    return getChapters(config).find(c => c.key === code) ?? null;
}

/**
 * Flat list of directory-safe slugs for domain chapters.
 * Derived by lowercasing domain keys and replacing underscores with hyphens.
 * Used by server (initializePublicationWorkspace) and odip-admin to derive
 * per-domain works directory names consistently.
 *
 * @param {EditionConfig} config
 * @returns {string[]}
 */
export function getDomainChapterSlugs(config) {
    return getChapters(config)
        .filter(c => c.domain)
        .map(c => c.domain.toLowerCase().replace(/_/g, '-'));
}

// ---------------------------------------------------------------------------
// RBA — UsersConfig structure
// ---------------------------------------------------------------------------

export const UserEntry = {
    email: '',          // lowercase email — primary key
    role: '',           // UserRole enum key
    domains: []         // string[] — domain keys; meaningful for DOMAIN_WRITER only
};

export const UsersConfig = {
    users: []           // UserEntry[]
};

// ---------------------------------------------------------------------------
// RBA — PermissionsConfig structure
// ---------------------------------------------------------------------------

export const PermissionEntry = {
    method: '',         // HTTP verb — GET POST PUT DELETE PATCH
    path: '',           // Express-style path pattern (:param wildcards)
    roles: []           // string[] — UserRole keys permitted
};

export const PermissionsConfig = {
    permissions: []     // PermissionEntry[]
};

// ---------------------------------------------------------------------------
// UsersConfig helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a user by email. The lookup is lowercased to match the
 * lowercase-keyed file. Returns null if not found.
 *
 * @param {UsersConfig} config
 * @param {string} email
 * @returns {UserEntry|null}
 */
export function resolveUserByEmail(config, email) {
    if (!email) return null;
    const target = email.toLowerCase();
    return config.users.find(u => u.email === target) ?? null;
}

// ---------------------------------------------------------------------------
// PermissionsConfig helpers
// ---------------------------------------------------------------------------

/**
 * Path segment matcher — left-to-right, exact segment count.
 * A `:param` pattern segment matches any single non-empty request segment;
 * every other segment must match literally.
 *
 * @param {string} pattern - Express-style path pattern
 * @param {string} requestPath
 * @returns {boolean}
 */
export function matchesPath(pattern, requestPath) {
    const patternSegments = pattern.split('/');
    const pathSegments = requestPath.split('/');
    if (patternSegments.length !== pathSegments.length) return false;
    for (let i = 0; i < patternSegments.length; i++) {
        const p = patternSegments[i];
        const r = pathSegments[i];
        if (p.startsWith(':')) {
            if (r.length === 0) return false;   // :param requires a non-empty segment
        } else if (p !== r) {
            return false;
        }
    }
    return true;
}

/**
 * Whether the given role is permitted for the given method + path.
 *
 * Deny by default: returns false when no entry matches the method + path
 * (an unmatched route carries no grant — openness for anonymous routes is a
 * middleware decision, made by not applying a guard, not by this returning true).
 *
 * Grant if any matching entry permits: the role is permitted when at least one
 * entry matching method + path lists it. Multiple entries may match the same
 * method + path (e.g. an OC write entry and a wave-assignment entry on
 * `PUT /operational-changes/:id`); their grants union, so evaluation is
 * order-independent.
 *
 * @param {PermissionsConfig} config
 * @param {string} method
 * @param {string} path
 * @param {string} role
 * @returns {boolean}
 */
export function isPermitted(config, method, path, role) {
    for (const entry of config.permissions) {
        if (entry.method === method && matchesPath(entry.path, path)) {
            if (entry.roles.includes(role)) return true;
        }
    }
    return false;
}

/**
 * Whether any matrix entry matches the given method + path — i.e. whether the
 * route is governed by the matrix at all. Lets the caller distinguish an
 * unlisted (open) route from a listed route that denies the role: `isPermitted`
 * returns false for both, so `requirePermission` checks this first.
 *
 * @param {PermissionsConfig} config
 * @param {string} method
 * @param {string} path
 * @returns {boolean}
 */
export function isPermissionGoverned(config, method, path) {
    return config.permissions.some(
        entry => entry.method === method && matchesPath(entry.path, path)
    );
}