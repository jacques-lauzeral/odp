import fs from 'fs';

/**
 * @typedef {Object} ChapterEntry
 * @property {string}         key           - Stable identifier — used for bootstrap DB matching
 * @property {string}         title         - Display title — config-owned, not user-editable
 * @property {number}         position      - Ordering within parent
 * @property {string}         [domain]      - Domain key — absent on pure narrative chapters
 * @property {string}         [template]    - Publication template key — drives renderer for generated sections
 * @property {ChapterEntry[]} [subChapters] - Optional sub-chapters (max one level)
 * @property {string}         [parentKey]   - Parent chapter key — set on sub-chapters by getChapters()
 */

/**
 * @typedef {Object} EditionConfig
 * @property {ChapterEntry[]} chapters - Top-level chapter entries
 */

/** @type {EditionConfig|null} */
let _config = null;

/** @type {ChapterEntry[]|null} */
let _flat = null;

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * Load and validate edition.json from the given path.
 * Must be called once at startup (via loader.js) before any accessor is used.
 *
 * @param {string} configPath - Absolute path to edition.json
 * @returns {EditionConfig}
 * @throws {Error} If the file is missing, unparseable, or structurally invalid
 */
export function loadEditionConfig(configPath) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

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

    _config = parsed;
    _flat = null;
    return _config;
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
// Accessors
// ---------------------------------------------------------------------------

/**
 * @returns {EditionConfig}
 * @throws {Error} If config has not been loaded
 */
function _requireConfig() {
    if (!_config) throw new Error('EditionConfig has not been loaded — call loadConfig() first');
    return _config;
}

/**
 * Nested chapter structure (as declared in edition.json).
 *
 * @returns {ChapterEntry[]}
 */
export function getChapterTree() {
    return _requireConfig().chapters;
}

/**
 * Flat ordered list of all chapters including sub-chapters.
 * Sub-chapters carry a `parentKey` property set by this function.
 *
 * @returns {ChapterEntry[]}
 */
export function getChapters() {
    if (_flat) return _flat;
    const flat = [];
    for (const chapter of _requireConfig().chapters) {
        flat.push(chapter);
        if (chapter.subChapters) {
            for (const sub of chapter.subChapters) {
                flat.push({ ...sub, parentKey: chapter.key });
            }
        }
    }
    _flat = flat;
    return _flat;
}

/**
 * Single chapter entry by stable key, or null if not found.
 *
 * @param {string} key
 * @returns {ChapterEntry|null}
 */
export function getChapterByKey(key) {
    return getChapters().find(c => c.key === key) ?? null;
}

/**
 * Flat list of directory-safe slugs for domain chapters (top-level and sub-chapters).
 * Derived by lowercasing domain keys and replacing underscores with hyphens.
 * Used by both the server (initializePublicationWorkspace) and odip-admin to
 * derive per-domain works directory names consistently.
 *
 * @returns {string[]}
 */
export function getDomainChapterSlugs() {
    return getChapters()
        .filter(c => c.domain)
        .map(c => c.domain.toLowerCase().replace(/_/g, '-'));
}