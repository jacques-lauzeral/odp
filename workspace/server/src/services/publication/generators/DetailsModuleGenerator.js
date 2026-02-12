// workspace/server/src/services/publication/generators/DetailsModuleGenerator.js
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Mustache from 'mustache';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    operationalRequirementStore
} from '../../../store/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DetailsModuleGenerator generates the details module with DrG-specific ON/OR pages.
 * Creates a nested file structure organized by DrG and path hierarchy.
 */
export class DetailsModuleGenerator {
    constructor(userId) {
        this.userId = userId;
        this.templatesDir = path.join(__dirname, '../templates');
        this.templates = {};
    }

    /**
     * Generate all details module files
     * @returns {Promise<Object>} Map of file paths to content
     */
    async generate() {
        try {
            // Load templates
            await this._loadTemplates();

            // Fetch all ONs and ORs from database
            const { ons, ors } = await this._fetchONsAndORs();

            // Build lookup maps for cross-references (by itemId)
            this.onLookup = new Map();
            this.orLookup = new Map();

            for (const on of ons) {
                this.onLookup.set(on.itemId, { drg: on.drg, path: on.path });
            }
            for (const or of ors) {
                this.orLookup.set(or.itemId, { drg: or.drg, path: or.path });
            }

            // Group by DrG
            const onsByDrg = this._groupByDrg(ons);
            const orsByDrg = this._groupByDrg(ors);

            // Get list of all DrGs that have content
            const drgs = new Set([...Object.keys(onsByDrg), ...Object.keys(orsByDrg)]);

            // Generate files for each DrG
            const files = {};
            for (const drg of drgs) {
                const drgOns = onsByDrg[drg] || [];
                const drgOrs = orsByDrg[drg] || [];

                const drgFiles = await this._generateDrgFiles(drg, drgOns, drgOrs);
                Object.assign(files, drgFiles);
            }

            // Generate details module navigation
            files['details/nav.adoc'] = this._generateDetailsNav(Array.from(drgs));

            return files;

        } catch (error) {
            console.error('Failed to generate details module:', error);
            throw error;
        }
    }

    /**
     * Load Mustache templates from disk
     * @private
     */
    async _loadTemplates() {
        const templateNames = ['on', 'or', 'folder-index', 'drg-index'];

        for (const name of templateNames) {
            const templatePath = path.join(this.templatesDir, `${name}.mustache`);
            try {
                // Force fresh read with explicit encoding
                this.templates[name] = await fs.readFile(templatePath, { encoding: 'utf-8', flag: 'r' });
                console.log(`Loaded template ${name}: ${this.templates[name].substring(0, 100)}...`);
            } catch (error) {
                throw new Error(`Failed to load template ${name}: ${error.message}`);
            }
        }
    }

    /**
     * Fetch all ONs and ORs from database
     * @private
     */
    async _fetchONsAndORs() {
        const tx = createTransaction(this.userId);
        try {
            const allRequirements = await operationalRequirementStore().findAll(
                tx,
                null,  // baselineId - null for latest versions
                null,  // fromWaveId - null for no wave filtering
                {}     // filters - empty for no content filtering
            );

            await commitTransaction(tx);

            // Split by type
            const ons = allRequirements.filter(r => r.type === 'ON');
            const ors = allRequirements.filter(r => r.type === 'OR');

            return { ons, ors };

        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * Group entities by DrG
     * @private
     */
    _groupByDrg(entities) {
        const grouped = {};
        for (const entity of entities) {
            if (!entity.drg) continue; // Skip entities without DrG

            if (!grouped[entity.drg]) {
                grouped[entity.drg] = [];
            }
            grouped[entity.drg].push(entity);
        }
        return grouped;
    }

    /**
     * Generate all files for a single DrG
     * @private
     */
    async _generateDrgFiles(drg, ons, ors) {
        const files = {};

        // Build hierarchy tree
        const tree = this._buildHierarchy(ons, ors);

        // Generate DrG index page
        const drgIndexData = this._prepareDrgIndexData(drg, tree, ons, ors);
        files[`details/pages/${drg.toLowerCase()}/index.adoc`] =
            Mustache.render(this.templates['drg-index'], drgIndexData);

        // Generate files recursively for the tree
        this._generateTreeFiles(drg, tree, '', files);

        return files;
    }

    /**
     * Build hierarchy tree from paths and entities
     * @private
     */
    _buildHierarchy(ons, ors) {
        const tree = {
            folders: {},
            ons: [],
            ors: []
        };

        // Process ONs
        for (const on of ons) {
            if (!on.path || on.path.length === 0) {
                // Root level ON
                tree.ons.push(on);
            } else {
                // Nested ON - add to folder structure
                this._addToTree(tree, on.path, on, 'on');
            }
        }

        // Process ORs
        for (const or of ors) {
            if (!or.path || or.path.length === 0) {
                // Root level OR
                tree.ors.push(or);
            } else {
                // Nested OR - add to folder structure
                this._addToTree(tree, or.path, or, 'or');
            }
        }

        return tree;
    }

    /**
     * Add entity to tree at specified path
     * @private
     */
    _addToTree(tree, pathArray, entity, type) {
        let current = tree;

        // Navigate/create folder structure with slugified names
        for (let i = 0; i < pathArray.length; i++) {
            const segment = pathArray[i];
            const slugified = this._slugify(segment);

            if (!current.folders[slugified]) {
                current.folders[slugified] = {
                    name: segment,          // Keep original name for display
                    slug: slugified,        // Slugified for URLs
                    folders: {},
                    ons: [],
                    ors: []
                };
            }

            current = current.folders[slugified];
        }

        // Add entity to final folder
        if (type === 'on') {
            current.ons.push(entity);
        } else {
            current.ors.push(entity);
        }
    }

    /**
     * Generate files recursively for tree structure
     * @private
     */
    _generateTreeFiles(drg, node, currentPath, files) {
        const basePath = `details/pages/${drg.toLowerCase()}`;
        const fullPath = currentPath ? `${basePath}/${currentPath}` : basePath;

        // Generate folder index if:
        // - We're in a subfolder (not DrG root), AND
        // - Folder has content (subfolders, ONs, or ORs)
        const hasContent = Object.keys(node.folders).length > 0 ||
            node.ons.length > 0 ||
            node.ors.length > 0;

        if (currentPath && hasContent) {
            const folderIndexData = this._prepareFolderIndexData(node, currentPath, drg);
            files[`${fullPath}/index.adoc`] =
                Mustache.render(this.templates['folder-index'], folderIndexData);
        }

        // Generate ON pages
        for (const on of node.ons) {
            const onData = this._prepareONData(on, currentPath, drg);
            const fileName = `on-${on.itemId}.adoc`;
            files[`${fullPath}/${fileName}`] =
                Mustache.render(this.templates['on'], onData);
        }

        // Generate OR pages
        for (const or of node.ors) {
            const orData = this._prepareORData(or, currentPath, drg);
            const fileName = `or-${or.itemId}.adoc`;
            files[`${fullPath}/${fileName}`] =
                Mustache.render(this.templates['or'], orData);
        }

        // Recurse into subfolders using slugified names
        for (const [slugKey, subNode] of Object.entries(node.folders)) {
            const newPath = currentPath ? `${currentPath}/${slugKey}` : slugKey;
            this._generateTreeFiles(drg, subNode, newPath, files);
        }
    }

    /**
     * Prepare data for DrG index template
     * @private
     */
    _prepareDrgIndexData(drg, tree, ons, ors) {
        const drgSlug = this._slugify(drg);

        return {
            drgName: drg,
            onCount: ons.length,
            orCount: ors.length,
            rootFolders: Object.keys(tree.folders).length > 0 ? {
                items: Object.values(tree.folders).map(folder => ({
                    name: folder.name,
                    path: `${drgSlug}/${folder.slug}`
                }))
            } : null,
            rootONs: tree.ons.length > 0 ? {
                items: tree.ons.map(on => ({
                    title: on.title,
                    path: drgSlug,
                    file: `on-${on.itemId}.adoc`
                }))
            } : null,
            rootORs: tree.ors.length > 0 ? {
                items: tree.ors.map(or => ({
                    title: or.title,
                    path: drgSlug,
                    file: `or-${or.itemId}.adoc`
                }))
            } : null
        };
    }

    /**
     * Prepare data for folder index template
     * @private
     */
    _prepareFolderIndexData(node, currentPath, drg) {
        const pathParts = currentPath ? currentPath.split('/') : [];
        const folderName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'Root';

        // Slugify DrG name for consistent paths
        const drgSlug = this._slugify(drg);

        // Build current full path from DrG root
        const currentFullPath = currentPath ? `${drgSlug}/${currentPath}` : drgSlug;

        return {
            folderName: node.name || folderName,
            subfolders: Object.keys(node.folders).length > 0 ? {
                folders: Object.values(node.folders).map(folder => {
                    const fullPath = currentPath
                        ? `${drgSlug}/${currentPath}/${folder.slug}`
                        : `${drgSlug}/${folder.slug}`;
                    return {
                        name: folder.name,
                        path: fullPath
                    };
                })
            } : null,
            ons: node.ons.length > 0 ? {
                items: node.ons.map(on => ({
                    title: on.title,
                    path: currentFullPath,
                    file: `on-${on.itemId}.adoc`
                }))
            } : null,
            ors: node.ors.length > 0 ? {
                items: node.ors.map(or => ({
                    title: or.title,
                    path: currentFullPath,
                    file: `or-${or.itemId}.adoc`
                }))
            } : null
        };
    }

    /**
     * Prepare data for ON template
     * @private
     */
    /**
     * Prepare data for ON template
     * @private
     */
    _prepareONData(on, currentPath, drg) {
        return {
            title: on.title,
            itemId: on.itemId,
            drg: drg,
            path: on.path ? on.path.join(' / ') : null,
            refinesParents: on.refinesParents && on.refinesParents.length > 0 ? (() => {
                const parent = on.refinesParents[0];
                const parentInfo = this.onLookup.get(parent.id);
                if (!parentInfo) {
                    console.warn(`ON ${on.itemId} references parent ON ${parent.id} which was not found in lookup`);
                    return null;
                }
                return {
                    parentPath: this._buildEntityPath(parentInfo.drg, parentInfo.path),
                    parentFile: `on-${parent.id}.adoc`,
                    parentTitle: parent.title
                };
            })() : null,
            implementingORs: on.implementingORs && on.implementingORs.length > 0 ? {
                ors: on.implementingORs.map(or => {
                    const orInfo = this.orLookup.get(or.id);
                    if (!orInfo) {
                        console.warn(`ON ${on.itemId} references OR ${or.id} which was not found in lookup`);
                        return null;
                    }
                    return {
                        title: or.title,
                        path: this._buildEntityPath(orInfo.drg, orInfo.path),
                        file: `or-${or.id}.adoc`
                    };
                }).filter(Boolean)
            } : null,
            subONs: on.subONs && on.subONs.length > 0 ? {
                ons: on.subONs.map(subOn => {
                    const subOnInfo = this.onLookup.get(subOn.id);
                    if (!subOnInfo) {
                        console.warn(`ON ${on.itemId} references sub-ON ${subOn.id} which was not found in lookup`);
                        return null;
                    }
                    return {
                        title: subOn.title,
                        path: this._buildEntityPath(subOnInfo.drg, subOnInfo.path),
                        file: `on-${subOn.id}.adoc`
                    };
                }).filter(Boolean)
            } : null
        };
    }

    /**
     * Prepare data for OR template
     * @private
     */
    /**
     * Prepare data for OR template
     * @private
     */
    _prepareORData(or, currentPath, drg) {
        return {
            title: or.title,
            itemId: or.itemId,
            drg: drg,
            path: or.path ? or.path.join(' / ') : null,
            implementedONs: or.implementedONs && or.implementedONs.length > 0 ? {
                ons: or.implementedONs.map(on => {
                    const onInfo = this.onLookup.get(on.id);
                    if (!onInfo) {
                        console.warn(`OR ${or.itemId} references ON ${on.id} which was not found in lookup`);
                        return null;
                    }
                    return {
                        title: on.title,
                        path: this._buildEntityPath(onInfo.drg, onInfo.path),
                        file: `on-${on.id}.adoc`
                    };
                }).filter(Boolean)
            } : null,
            refinesParents: or.refinesParents && or.refinesParents.length > 0 ? (() => {
                const parent = or.refinesParents[0];
                const parentInfo = this.orLookup.get(parent.id);
                if (!parentInfo) {
                    console.warn(`OR ${or.itemId} references parent OR ${parent.id} which was not found in lookup`);
                    return null;
                }
                return {
                    parentPath: this._buildEntityPath(parentInfo.drg, parentInfo.path),
                    parentFile: `or-${parent.id}.adoc`,
                    parentTitle: parent.title
                };
            })() : null
        };
    }

    /**
     * Convert folder name to URL-safe slug using underscores
     * @private
     */
    _slugify(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscores
            .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
    }

    /**
     * Build full path for an entity based on its path array
     * @private
     */
    _buildEntityPath(drg, pathArray) {
        const drgSlug = this._slugify(drg);
        if (!pathArray || pathArray.length === 0) {
            return drgSlug;
        }
        const sluggedPath = pathArray.map(segment => this._slugify(segment)).join('/');
        return `${drgSlug}/${sluggedPath}`;
    }

    /**
     * Generate navigation for details module
     * @private
     */
    _generateDetailsNav(drgs) {
        const sortedDrgs = drgs.sort();
        let nav = '* xref:index.adoc[Operational Needs and Requirements]\n\n';

        for (const drg of sortedDrgs) {
            nav += `** xref:${drg.toLowerCase()}/index.adoc[${drg}]\n`;
        }

        return nav;
    }
}
