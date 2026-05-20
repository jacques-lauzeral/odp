import fs from 'fs';

/**
 * @typedef {Object} SubDomain
 * @property {string} key   - Stable domain key
 * @property {string} label - Display label
 */

/**
 * @typedef {Object} DomainEntry
 * @property {string}      key          - Stable domain key
 * @property {string}      label        - Display label
 * @property {SubDomain[]} [subDomains] - Optional sub-domains (max one level)
 */

/**
 * @typedef {Object} DomainsConfig
 * @property {DomainEntry[]} domains - Top-level domain entries
 */

/** @type {DomainsConfig|null} */
let _config = null;

/** @type {string[]|null} */
let _flatKeys = null;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load and validate domains.json from the given path.
 * Must be called once at startup (via loader.js) before any accessor is used.
 *
 * @param {string} configPath - Absolute path to domains.json
 * @returns {DomainsConfig}
 * @throws {Error} If the file is missing, unparseable, or structurally invalid
 */
export function loadDomainsConfig(configPath) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.domains)) {
        throw new Error(`domains.json: expected object with "domains" array — got ${JSON.stringify(parsed)}`);
    }
    for (const entry of parsed.domains) {
        if (!entry.key || !entry.label) {
            throw new Error(`domains.json: each domain entry must have "key" and "label" — got ${JSON.stringify(entry)}`);
        }
        if (entry.subDomains) {
            for (const sub of entry.subDomains) {
                if (!sub.key || !sub.label) {
                    throw new Error(`domains.json: each subDomain entry must have "key" and "label" — got ${JSON.stringify(sub)}`);
                }
            }
        }
    }

    _config = parsed;
    _flatKeys = null;
    return _config;
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * @returns {DomainsConfig}
 * @throws {Error} If config has not been loaded
 */
function _requireConfig() {
    if (!_config) throw new Error('DomainsConfig has not been loaded — call loadConfig() first');
    return _config;
}

/**
 * Full domain tree structure.
 *
 * @returns {DomainEntry[]}
 */
export function getDomainTree() {
    return _requireConfig().domains;
}

/**
 * Flat list of all domain keys, including sub-domain keys.
 *
 * @returns {string[]}
 */
export function getDomainKeys() {
    if (_flatKeys) return _flatKeys;
    const keys = [];
    for (const entry of _requireConfig().domains) {
        keys.push(entry.key);
        if (entry.subDomains) {
            for (const sub of entry.subDomains) keys.push(sub.key);
        }
    }
    _flatKeys = keys;
    return _flatKeys;
}

/**
 * Display label for a domain key, or the key itself if not found.
 *
 * @param {string} key
 * @returns {string}
 */
export function getDomainLabel(key) {
    for (const entry of _requireConfig().domains) {
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
 * @param {string} key
 * @returns {boolean}
 */
export function isDomainValid(key) {
    return getDomainKeys().includes(key);
}