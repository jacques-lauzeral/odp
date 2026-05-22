import nodePath from 'path';
import fs from 'fs';
import {
    getDomainKeys as _getDomainKeys,
    getDomainLabel as _getDomainLabel,
    isDomainValid as _isDomainValid,
    getChapters as _getChapters,
    getChapterByCode as _getChapterByCode,
    getDomainChapterSlugs as _getDomainChapterSlugs,
} from '@odp/shared';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** @type {import('@odp/shared').DomainsConfig|null} */
let _domainsConfig = null;

/** @type {import('@odp/shared').EditionConfig|null} */
let _editionConfig = null;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * @param {unknown} parsed
 * @returns {import('@odp/shared').DomainsConfig}
 * @throws {Error}
 */
function _validateDomainsConfig(parsed) {
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
    return parsed;
}

/**
 * @param {unknown} parsed
 * @returns {import('@odp/shared').EditionConfig}
 * @throws {Error}
 */
function _validateEditionConfig(parsed) {
    if (!parsed || !Array.isArray(parsed.chapters)) {
        throw new Error(`edition.json: expected object with "chapters" array — got ${JSON.stringify(parsed)}`);
    }
    for (const chapter of parsed.chapters) {
        _validateChapterEntry(chapter, null);
        if (chapter.subChapters) {
            for (const sub of chapter.subChapters) {
                _validateChapterEntry(sub, chapter.key);
            }
        }
    }
    return parsed;
}

/**
 * @param {Object} entry
 * @param {string|null} parentKey
 */
function _validateChapterEntry(entry, parentKey) {
    if (!entry.key || !entry.title || typeof entry.position !== 'number') {
        throw new Error(
            `edition.json: chapter entry must have "key", "title", and "position"` +
            (parentKey ? ` (parent: ${parentKey})` : '') +
            ` — got ${JSON.stringify(entry)}`
        );
    }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function _requireDomainsConfig() {
    if (!_domainsConfig) throw new Error('DomainsConfig has not been loaded — call loadConfig() first');
    return _domainsConfig;
}

function _requireEditionConfig() {
    if (!_editionConfig) throw new Error('EditionConfig has not been loaded — call loadConfig() first');
    return _editionConfig;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all ODIP config files from the given config directory.
 * Must be called once at startup before any config accessor is used.
 *
 * Expected files under configDir:
 *   - domains.json   — domain tree (semantic classification authority for O*s)
 *   - edition.json   — edition chapter structure (publication organisation)
 *
 * @param {string} configDir - Absolute path to the config directory ($ODIP_HOME/config)
 * @throws {Error} If configDir is not provided, or if any config file is missing or invalid
 */
export function loadConfig(configDir) {
    if (!configDir) throw new Error('loadConfig: configDir is required');

    const domainsRaw = fs.readFileSync(nodePath.join(configDir, 'domains.json'), 'utf8');
    _domainsConfig = _validateDomainsConfig(JSON.parse(domainsRaw));

    const editionRaw = fs.readFileSync(nodePath.join(configDir, 'edition.json'), 'utf8');
    _editionConfig = _validateEditionConfig(JSON.parse(editionRaw));
}

// ---------------------------------------------------------------------------
// DomainsConfig accessors
// ---------------------------------------------------------------------------

/** @returns {string[]} */
export function getDomainKeys() {
    return _getDomainKeys(_requireDomainsConfig());
}

/**
 * @param {string} key
 * @returns {string}
 */
export function getDomainLabel(key) {
    return _getDomainLabel(_requireDomainsConfig(), key);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isDomainValid(key) {
    return _isDomainValid(_requireDomainsConfig(), key);
}

/**
 * Full domain tree structure.
 *
 * @returns {import('@odp/shared').DomainEntry[]}
 */
export function getDomainTree() {
    return _requireDomainsConfig().domains;
}

// ---------------------------------------------------------------------------
// EditionConfig accessors
// ---------------------------------------------------------------------------

/**
 * Flat ordered list of all chapters including sub-chapters.
 *
 * @returns {import('@odp/shared').ChapterEntry[]}
 */
export function getChapters() {
    return _getChapters(_requireEditionConfig());
}

/**
 * @param {string} code - Stable chapter code (= chapter key from edition.json)
 * @returns {import('@odp/shared').ChapterEntry|null}
 */
export function getChapterByCode(code) {
    return _getChapterByCode(_requireEditionConfig(), code);
}

/**
 * Flat list of directory-safe slugs for domain chapters.
 *
 * @returns {string[]}
 */
export function getDomainChapterSlugs() {
    return _getDomainChapterSlugs(_requireEditionConfig());
}