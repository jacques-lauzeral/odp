import nodePath from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import {
    getDomainKeys as _getDomainKeys,
    getDomainLabel as _getDomainLabel,
    isDomainValid as _isDomainValid,
    getChapters as _getChapters,
    getChapterByCode as _getChapterByCode,
    getDomainChapterSlugs as _getDomainChapterSlugs,
    resolveUserByEmail as _resolveUserByEmail,
    isPermitted as _isPermitted,
    isPermissionGoverned as _isPermissionGoverned,
    isUserRoleValid,
    UserRoleKeys,
} from '@odp/shared';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** @type {import('@odp/shared').DomainsConfig|null} */
let _domainsConfig = null;

/** @type {import('@odp/shared').EditionConfig|null} */
let _editionConfig = null;

/** @type {import('@odp/shared').UsersConfig|null} */
let _usersConfig = null;

/** @type {import('@odp/shared').PermissionsConfig|null} */
let _permissionsConfig = null;

/** @type {string|null} — remembered at loadConfig() so reloadConfig() can re-read */
let _configDir = null;

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
        throw new Error(`domains.yaml: expected object with "domains" array — got ${JSON.stringify(parsed)}`);
    }
    for (const entry of parsed.domains) {
        if (!entry.key || !entry.label) {
            throw new Error(`domains.yaml: each domain entry must have "key" and "label" — got ${JSON.stringify(entry)}`);
        }
        if (entry.subDomains) {
            for (const sub of entry.subDomains) {
                if (!sub.key || !sub.label) {
                    throw new Error(`domains.yaml: each subDomain entry must have "key" and "label" — got ${JSON.stringify(sub)}`);
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
        throw new Error(`edition.yaml: expected object with "chapters" array — got ${JSON.stringify(parsed)}`);
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
            `edition.yaml: chapter entry must have "key", "title", and "position"` +
            (parentKey ? ` (parent: ${parentKey})` : '') +
            ` — got ${JSON.stringify(entry)}`
        );
    }
}

/**
 * @param {unknown} parsed
 * @returns {import('@odp/shared').UsersConfig}
 * @throws {Error}
 */
function _validateUsersConfig(parsed) {
    if (!parsed || !Array.isArray(parsed.users)) {
        throw new Error(`users.yaml: expected object with "users" array — got ${JSON.stringify(parsed)}`);
    }
    const seen = new Set();
    for (const entry of parsed.users) {
        if (!entry.email || typeof entry.email !== 'string') {
            throw new Error(`users.yaml: each user must have an "email" string — got ${JSON.stringify(entry)}`);
        }
        if (entry.email !== entry.email.toLowerCase()) {
            throw new Error(`users.yaml: email must be lowercase — got "${entry.email}"`);
        }
        if (seen.has(entry.email)) {
            throw new Error(`users.yaml: duplicate email "${entry.email}"`);
        }
        seen.add(entry.email);
        if (!isUserRoleValid(entry.role)) {
            throw new Error(`users.yaml: invalid role "${entry.role}" for ${entry.email} — must be one of ${UserRoleKeys.join(', ')}`);
        }
        if (!Array.isArray(entry.domains)) {
            throw new Error(`users.yaml: "domains" must be an array for ${entry.email} — got ${JSON.stringify(entry.domains)}`);
        }
    }
    return parsed;
}

/**
 * @param {unknown} parsed
 * @returns {import('@odp/shared').PermissionsConfig}
 * @throws {Error}
 */
function _validatePermissionsConfig(parsed) {
    if (!parsed || !Array.isArray(parsed.permissions)) {
        throw new Error(`permissions.yaml: expected object with "permissions" array — got ${JSON.stringify(parsed)}`);
    }
    const methods = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    for (const entry of parsed.permissions) {
        if (!methods.has(entry.method)) {
            throw new Error(`permissions.yaml: invalid method "${entry.method}" — got ${JSON.stringify(entry)}`);
        }
        if (!entry.path || typeof entry.path !== 'string' || !entry.path.startsWith('/')) {
            throw new Error(`permissions.yaml: "path" must be an absolute path string — got ${JSON.stringify(entry)}`);
        }
        if (!Array.isArray(entry.roles) || entry.roles.length === 0) {
            throw new Error(`permissions.yaml: "roles" must be a non-empty array — got ${JSON.stringify(entry)}`);
        }
        for (const role of entry.roles) {
            if (!isUserRoleValid(role)) {
                throw new Error(`permissions.yaml: invalid role "${role}" in ${entry.method} ${entry.path} — must be one of ${UserRoleKeys.join(', ')}`);
            }
        }
    }
    return parsed;
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

function _requireUsersConfig() {
    if (!_usersConfig) throw new Error('UsersConfig has not been loaded — call loadConfig() first');
    return _usersConfig;
}

function _requirePermissionsConfig() {
    if (!_permissionsConfig) throw new Error('PermissionsConfig has not been loaded — call loadConfig() first');
    return _permissionsConfig;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all ODIP config files from the given config directory.
 * Must be called once at startup before any config accessor is used.
 *
 * Expected files under configDir (all YAML):
 *   - domains.yaml     — domain tree (semantic classification authority for O*s)
 *   - edition.yaml     — edition chapter structure (publication organisation)
 *   - users.yaml       — interim identity: email → role + domain scope (RBA)
 *   - permissions.yaml — action-permission matrix: method × path → roles (RBA)
 *
 * @param {string} configDir - Absolute path to the config directory ($ODIP_HOME/config)
 * @throws {Error} If configDir is not provided, or if any config file is missing or invalid
 */
export function loadConfig(configDir) {
    if (!configDir) throw new Error('loadConfig: configDir is required');
    _configDir = configDir;

    const domainsRaw = fs.readFileSync(nodePath.join(configDir, 'domains.yaml'), 'utf8');
    _domainsConfig = _validateDomainsConfig(yaml.load(domainsRaw));

    const editionRaw = fs.readFileSync(nodePath.join(configDir, 'edition.yaml'), 'utf8');
    _editionConfig = _validateEditionConfig(yaml.load(editionRaw));

    const usersRaw = fs.readFileSync(nodePath.join(configDir, 'users.yaml'), 'utf8');
    _usersConfig = _validateUsersConfig(yaml.load(usersRaw));

    const permissionsRaw = fs.readFileSync(nodePath.join(configDir, 'permissions.yaml'), 'utf8');
    _permissionsConfig = _validatePermissionsConfig(yaml.load(permissionsRaw));
}

// ---------------------------------------------------------------------------
// Live reload (RBA — POST /admin/config/reload)
// ---------------------------------------------------------------------------

/**
 * The configs that may be reloaded at runtime without a restart, each mapped to
 * a stager that reads + validates the file and RETURNS the validated config
 * without assigning it. domains/edition are structural and deliberately absent.
 */
const _RELOADABLE = {
    users:       (dir) => _validateUsersConfig(yaml.load(fs.readFileSync(nodePath.join(dir, 'users.yaml'), 'utf8'))),
    permissions: (dir) => _validatePermissionsConfig(yaml.load(fs.readFileSync(nodePath.join(dir, 'permissions.yaml'), 'utf8'))),
};

/** Whether a config name is runtime-reloadable. */
export function isReloadableConfig(name) {
    return Object.prototype.hasOwnProperty.call(_RELOADABLE, name);
}

/**
 * Atomically reload the given runtime-reloadable configs from the directory
 * remembered at loadConfig(). All requested configs are read and validated into
 * staging first; module state is committed only if every one validates — so a
 * failure leaves the previous config fully active (all-or-nothing).
 *
 * @param {string[]} configs - subset of 'users' | 'permissions'
 * @returns {string[]} the names reloaded
 * @throws {Error} with `.code` ('NOT_RELOADABLE' | 'CONFIG_RELOAD_FAILED') and `.config`
 */
export function reloadConfig(configs) {
    if (!_configDir) throw new Error('reloadConfig: config has not been loaded — call loadConfig() first');

    // Stage + validate everything before committing anything.
    const staged = {};
    for (const name of configs) {
        if (!isReloadableConfig(name)) {
            const e = new Error(`Config '${name}' is not runtime-reloadable`);
            e.code = 'NOT_RELOADABLE';
            e.config = name;
            throw e;
        }
        try {
            staged[name] = _RELOADABLE[name](_configDir);
        } catch (err) {
            const e = new Error(`Reload of '${name}' failed: ${err.message}`);
            e.code = 'CONFIG_RELOAD_FAILED';
            e.config = name;
            e.cause = err;
            throw e;
        }
    }

    // All validated — commit.
    if ('users' in staged)       _usersConfig       = staged.users;
    if ('permissions' in staged) _permissionsConfig = staged.permissions;
    return Object.keys(staged);
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
 * @param {string} code - Stable chapter code (= chapter key from edition.yaml)
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

// ---------------------------------------------------------------------------
// UsersConfig accessors (RBA)
// ---------------------------------------------------------------------------

/**
 * Resolve a declared user by email (case-insensitive). Returns null if the
 * email is not in users.yaml. This is the lookup behind the resolveUser()
 * middleware — the SSO seam.
 *
 * @param {string} email
 * @returns {import('@odp/shared').UserEntry|null}
 */
export function resolveUser(email) {
    return _resolveUserByEmail(_requireUsersConfig(), email);
}

// ---------------------------------------------------------------------------
// PermissionsConfig accessors (RBA)
// ---------------------------------------------------------------------------

/**
 * Whether the given role is permitted for the given method + path, per the
 * action-permission matrix. Deny by default for unmatched routes.
 *
 * @param {string} method
 * @param {string} path
 * @param {string} role
 * @returns {boolean}
 */
export function isPermitted(method, path, role) {
    return _isPermitted(_requirePermissionsConfig(), method, path, role);
}

/**
 * Whether the given method + path is governed by the permission matrix at all.
 * Used by requirePermission() to leave unlisted routes open.
 *
 * @param {string} method
 * @param {string} path
 * @returns {boolean}
 */
export function isPermissionGoverned(method, path) {
    return _isPermissionGoverned(_requirePermissionsConfig(), method, path);
}