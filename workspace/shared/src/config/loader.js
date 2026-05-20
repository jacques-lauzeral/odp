import nodePath from 'path';
import { loadDomainsConfig } from './domains-config.js';
import { loadEditionConfig } from './edition-config.js';

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
    loadDomainsConfig(nodePath.join(configDir, 'domains.json'));
    loadEditionConfig(nodePath.join(configDir, 'edition.json'));
}