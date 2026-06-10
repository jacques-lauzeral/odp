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