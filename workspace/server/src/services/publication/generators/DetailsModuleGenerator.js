// workspace/server/src/services/publication/generators/DetailsModuleGenerator.js
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Mustache from 'mustache';
import { getDraftingGroupDisplay } from '../../../../../shared/src/index.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    referenceDocumentStore
} from '../../../store/index.js';
import operationalRequirementService from '../../OperationalRequirementService.js';
import DeltaToAsciidocConverter from '../../export/DeltaToAsciidocConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * DetailsModuleGenerator generates the details module with DrG-specific ON/OR pages.
 * Creates a nested file structure organized by DrG and path hierarchy.
 */
export class DetailsModuleGenerator {
    constructor(userId, editionId = null) {
        this.userId = userId;
        this.editionId = editionId;
        this.templatesDir = path.join(__dirname, '../templates');
        this.templates = {};
        this.deltaConverter = new DeltaToAsciidocConverter();
        // Never reset the converter - keep global counter for unique filenames
    }

    /**
     * Fix image paths for Antora (remove ./images/ prefix)
     * @private
     */
    _fixAntoraImagePaths(asciidoc) {
        if (!asciidoc) return asciidoc;
        // Replace image::./images/filename with image::filename
        return asciidoc.replace(/image::\.\/images\//g, 'image::');
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

            // Store for nav generation
            this.allOns = ons;
            this.allOrs = ors;

            // Initialize image collection
            this.allImages = [];

            // Preload reference documents for strategic document resolution
            this.documentLookup = await this._fetchReferenceDocuments();

            // Build lookup maps for cross-references (by itemId)
            // For refining children, we'll update their paths after tree building
            this.onLookup = new Map();
            this.orLookup = new Map();

            for (const on of ons) {
                this.onLookup.set(on.itemId, { drg: on.drg, path: on.path });
            }
            for (const or of ors) {
                this.orLookup.set(or.itemId, { drg: or.drg, path: or.path });
            }

            // Build reverse relationship maps
            this._buildReverseRelationships(ons, ors);

            // Group by DrG
            const onsByDrg = this._groupByDrg(ons);
            const orsByDrg = this._groupByDrg(ors);

            // Get list of all DrGs that have content
            const drgs = new Set([...Object.keys(onsByDrg), ...Object.keys(orsByDrg)]);

            // Build trees and update lookup paths for refining children
            for (const drg of drgs) {
                const drgOns = onsByDrg[drg] || [];
                const drgOrs = orsByDrg[drg] || [];
                const tree = this._buildHierarchy(drgOns, drgOrs);

                // Update lookup paths for refining children
                this._updateRefiningChildrenPaths(tree, []);
            }

            // Generate files for each DrG (rebuild trees since we modified lookups)
            const files = {};
            for (const drg of drgs) {
                const drgOns = onsByDrg[drg] || [];
                const drgOrs = orsByDrg[drg] || [];

                const drgFiles = await this._generateDrgFiles(drg, drgOns, drgOrs);
                Object.assign(files, drgFiles);
            }

            // Add extracted images to files (Antora expects them in assets/images)
            for (const image of this.allImages) {
                const imageBuffer = Buffer.from(image.data, 'base64');
                files[`details/assets/images/${image.filename}`] = imageBuffer;
            }

            // Generate details module navigation
            files['details/nav.adoc'] = this._generateDetailsNav(Array.from(drgs));

            console.log(`Extracted ${this.allImages.length} images from statements/rationales`);

            return files;

        } catch (error) {
            console.error('Failed to generate details module:', error);
            throw error;
        }
    }

    /**
     * Update lookup paths for refining children to use parent's path
     * @private
     */
    _updateRefiningChildrenPaths(node, currentPath) {
        // Update ONs and their children
        for (const on of node.ons) {
            if (on.children) {
                this._updateChildrenPaths(on.children, currentPath);
            }
        }

        // Update ORs and their children
        for (const or of node.ors) {
            if (or.children) {
                this._updateChildrenPaths(or.children, currentPath);
            }
        }

        // Recurse into folders
        for (const [slug, folder] of Object.entries(node.folders)) {
            const newPath = [...currentPath, slug];
            this._updateRefiningChildrenPaths(folder, newPath);
        }
    }

    /**
     * Update children paths recursively
     * @private
     */
    _updateChildrenPaths(children, parentPath) {
        for (const childOn of children.ons) {
            const lookup = this.onLookup.get(childOn.itemId);
            if (lookup) {
                lookup.path = parentPath; // Use parent's path
            }
            if (childOn.children) {
                this._updateChildrenPaths(childOn.children, parentPath);
            }
        }

        for (const childOr of children.ors) {
            const lookup = this.orLookup.get(childOr.itemId);
            if (lookup) {
                lookup.path = parentPath; // Use parent's path
            }
            if (childOr.children) {
                this._updateChildrenPaths(childOr.children, parentPath);
            }
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
    /**
     * Fetch all reference documents and build a lookup map by id
     * @private
     */
    async _fetchReferenceDocuments() {
        const tx = createTransaction(this.userId);
        try {
            const docs = await referenceDocumentStore().findAll(tx);
            await commitTransaction(tx);
            const lookup = new Map();
            for (const doc of docs) {
                lookup.set(doc.id, doc);
            }
            return lookup;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    async _fetchONsAndORs() {
        const allRequirements = await operationalRequirementService.getAll(
            this.userId,
            this.editionId,
            {},
            'standard'
        );

        const ons = allRequirements.filter(r => r.type === 'ON');
        const ors = allRequirements.filter(r => r.type === 'OR');

        return { ons, ors };
    }

    /**
     * Build reverse relationship maps (refinedBy, implementedBy)
     * @private
     */
    _buildReverseRelationships(ons, ors) {
        // Initialize reverse relationship arrays on all entities
        for (const on of ons) {
            on.refinedBy = [];      // ONs/ORs that refine this ON
            on.implementedBy = [];  // ORs that implement this ON
        }
        for (const or of ors) {
            or.refinedBy = [];      // ORs that refine this OR
        }

        // Build refinedBy from refinesParents
        for (const on of ons) {
            if (on.refinesParents && on.refinesParents.length > 0) {
                const parentId = on.refinesParents[0].id;
                // Find parent (could be ON or OR based on type)
                const parentOn = ons.find(o => o.itemId === parentId);
                if (parentOn) {
                    parentOn.refinedBy.push({ id: on.itemId, title: on.title, type: 'ON' });
                }
            }
        }

        for (const or of ors) {
            if (or.refinesParents && or.refinesParents.length > 0) {
                const parentId = or.refinesParents[0].id;
                // Parent could be ON or OR
                const parentOn = ons.find(o => o.itemId === parentId);
                const parentOr = ors.find(o => o.itemId === parentId);

                if (parentOn) {
                    parentOn.refinedBy.push({ id: or.itemId, title: or.title, type: 'OR' });
                } else if (parentOr) {
                    parentOr.refinedBy.push({ id: or.itemId, title: or.title, type: 'OR' });
                }
            }
        }

        // Build implementedBy from implementedONs
        for (const or of ors) {
            if (or.implementedONs && or.implementedONs.length > 0) {
                for (const implementedOn of or.implementedONs) {
                    const on = ons.find(o => o.itemId === implementedOn.id);
                    if (on) {
                        on.implementedBy.push({ id: or.itemId, title: or.title });
                    }
                }
            }
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
        files[`details/partials/${drg.toLowerCase()}/index.adoc`] =
            Mustache.render(this.templates['drg-index'], drgIndexData);

        // Generate files recursively for the tree
        this._generateTreeFiles(drg, tree, '', files);

        return files;
    }

    /**
     * Build hierarchy tree from paths and refinement relationships
     * @private
     */
    _buildHierarchy(ons, ors) {
        const tree = {
            folders: {},
            ons: [],
            ors: [],
            items: {} // Map of itemId -> node for refinement nesting
        };

        // First pass: validate and categorize entities
        const pathEntities = [];
        const refinementEntities = [];
        const rootEntities = [];

        for (const on of ons) {
            const hasPath = on.path && on.path.length > 0;
            const hasRefines = on.refinesParents && on.refinesParents.length > 0;

            if (hasPath && hasRefines) {
                console.warn(`ON ${on.itemId} has both path and refinesParents - ignoring path, using refinement`);
                refinementEntities.push({ entity: on, type: 'on' });
            } else if (hasPath) {
                pathEntities.push({ entity: on, type: 'on' });
            } else if (hasRefines) {
                refinementEntities.push({ entity: on, type: 'on' });
            } else {
                rootEntities.push({ entity: on, type: 'on' });
            }
        }

        for (const or of ors) {
            const hasPath = or.path && or.path.length > 0;
            const hasRefines = or.refinesParents && or.refinesParents.length > 0;

            if (hasPath && hasRefines) {
                console.warn(`OR ${or.itemId} has both path and refinesParents - ignoring path, using refinement`);
                refinementEntities.push({ entity: or, type: 'or' });
            } else if (hasPath) {
                pathEntities.push({ entity: or, type: 'or' });
            } else if (hasRefines) {
                refinementEntities.push({ entity: or, type: 'or' });
            } else {
                rootEntities.push({ entity: or, type: 'or' });
            }
        }

        // Second pass: add path-based entities to tree
        for (const { entity, type } of pathEntities) {
            this._addToTree(tree, entity.path, entity, type);
        }

        // Third pass: add root entities (no path, no refines)
        for (const { entity, type } of rootEntities) {
            if (type === 'on') {
                tree.ons.push(entity);
            } else {
                tree.ors.push(entity);
            }
        }

        // Sort root entities by itemId
        tree.ons.sort((a, b) => a.itemId - b.itemId);
        tree.ors.sort((a, b) => a.itemId - b.itemId);

        // Fourth pass: handle refinement relationships
        // Build item nodes with children arrays
        this._buildRefinementTree(tree, refinementEntities);

        return tree;
    }

    /**
     * Build refinement-based hierarchy by nesting children under parents
     * Processes in multiple passes to handle multi-level refinements
     * @private
     */
    _buildRefinementTree(tree, refinementEntities) {
        // Add children arrays to all entities in tree
        this._addChildrenArrays(tree);

        // Process refinements in multiple passes until all are placed
        let unprocessed = [...refinementEntities];
        let previousCount = unprocessed.length;

        while (unprocessed.length > 0) {
            const stillUnprocessed = [];

            for (const { entity, type } of unprocessed) {
                const parentId = entity.refinesParents[0].id;
                const parentNode = this._findEntityInTree(tree, parentId);

                if (!parentNode) {
                    // Parent not yet in tree - try again next pass
                    stillUnprocessed.push({ entity, type });
                } else {
                    // Add to parent's children
                    if (!parentNode.children) {
                        parentNode.children = { ons: [], ors: [] };
                    }
                    if (type === 'on') {
                        parentNode.children.ons.push(entity);
                        // Sort children by itemId
                        parentNode.children.ons.sort((a, b) => a.itemId - b.itemId);
                        // Initialize children for this entity too
                        entity.children = { ons: [], ors: [] };
                    } else {
                        parentNode.children.ors.push(entity);
                        // Sort children by itemId
                        parentNode.children.ors.sort((a, b) => a.itemId - b.itemId);
                        // Initialize children for this entity too
                        entity.children = { ons: [], ors: [] };
                    }
                }
            }

            unprocessed = stillUnprocessed;

            // Check if we made progress - if not, we have orphaned refinements
            if (unprocessed.length === previousCount) {
                // No progress made - log warnings and add to root
                for (const { entity, type } of unprocessed) {
                    const parentId = entity.refinesParents[0].id;
                    console.warn(`${type.toUpperCase()} ${entity.itemId} refines ${parentId} which was not found in tree - adding to root`);
                    if (type === 'on') {
                        tree.ons.push(entity);
                        entity.children = { ons: [], ors: [] };
                    } else {
                        tree.ors.push(entity);
                        entity.children = { ons: [], ors: [] };
                    }
                }
                // Sort after adding orphans
                tree.ons.sort((a, b) => a.itemId - b.itemId);
                tree.ors.sort((a, b) => a.itemId - b.itemId);
                break;
            }

            previousCount = unprocessed.length;
        }
    }

    /**
     * Recursively add children arrays to all entities in tree
     * @private
     */
    _addChildrenArrays(node) {
        // Add children to ONs
        for (const on of node.ons || []) {
            on.children = { ons: [], ors: [] };
        }
        // Add children to ORs
        for (const or of node.ors || []) {
            or.children = { ons: [], ors: [] };
        }
        // Recurse into folders
        for (const folder of Object.values(node.folders || {})) {
            this._addChildrenArrays(folder);
        }
    }

    /**
     * Find an entity by itemId anywhere in the tree (including in children)
     * @private
     */
    _findEntityInTree(node, itemId) {
        // Check ONs at this level
        for (const on of node.ons || []) {
            if (on.itemId === itemId) return on;
            // Search in children recursively
            if (on.children) {
                const found = this._findEntityInChildren(on.children, itemId);
                if (found) return found;
            }
        }
        // Check ORs at this level
        for (const or of node.ors || []) {
            if (or.itemId === itemId) return or;
            // Search in children recursively
            if (or.children) {
                const found = this._findEntityInChildren(or.children, itemId);
                if (found) return found;
            }
        }
        // Recurse into folders
        for (const folder of Object.values(node.folders || {})) {
            const found = this._findEntityInTree(folder, itemId);
            if (found) return found;
        }
        return null;
    }

    /**
     * Find entity in children structure
     * @private
     */
    _findEntityInChildren(children, itemId) {
        // Check child ONs
        for (const on of children.ons || []) {
            if (on.itemId === itemId) return on;
            // Recurse into this child's children
            if (on.children) {
                const found = this._findEntityInChildren(on.children, itemId);
                if (found) return found;
            }
        }
        // Check child ORs
        for (const or of children.ors || []) {
            if (or.itemId === itemId) return or;
            // Recurse into this child's children
            if (or.children) {
                const found = this._findEntityInChildren(or.children, itemId);
                if (found) return found;
            }
        }
        return null;
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

        // Add entity to final folder and sort by itemId
        if (type === 'on') {
            current.ons.push(entity);
            current.ons.sort((a, b) => a.itemId - b.itemId);
        } else {
            current.ors.push(entity);
            current.ors.sort((a, b) => a.itemId - b.itemId);
        }
    }

    /**
     * Generate files recursively for tree structure
     * @private
     */
    /**
     * A folder is "collapsed" if it has at least one direct ON.
     * Collapsed folders absorb their sub-folders into a single page
     * instead of generating separate pages for each sub-folder.
     * @private
     */
    _isCollapsed(node) {
        return node.ons.length > 0;
    }

    /**
     * Generate all Antora page files for a tree node and its descendants.
     *
     * Collapsed nodes (those with at least one direct ON) are treated differently:
     * their sub-folders do NOT get their own pages or nav entries — instead, the
     * sub-folder content is absorbed into the parent page as a flat annotated list
     * (see _prepareFolderIndexData / _flattenCollapsedFolder).
     * ON/OR files inside collapsed sub-folders are still written at their own paths
     * so that individual entity xrefs resolve correctly.
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

            // Generate files for refining children (they go in same folder as parent)
            if (on.children) {
                this._generateRefiningChildrenFiles(drg, on.children, currentPath, files);
            }
        }

        // Generate OR pages
        for (const or of node.ors) {
            const orData = this._prepareORData(or, currentPath, drg);
            const fileName = `or-${or.itemId}.adoc`;
            files[`${fullPath}/${fileName}`] =
                Mustache.render(this.templates['or'], orData);

            // Generate files for refining children (they go in same folder as parent)
            if (or.children) {
                this._generateRefiningChildrenFiles(drg, or.children, currentPath, files);
            }
        }

        // Recurse into subfolders only if this node is NOT collapsed.
        // When collapsed, sub-folder pages are not generated — their content is
        // rendered inline in this node's page by _prepareFolderIndexData.
        // Individual ON/OR files inside those sub-folders ARE still generated above
        // (via _generateTreeFiles called recursively on sub-nodes elsewhere) so
        // that xrefs from the collapsed list resolve correctly.
        if (!this._isCollapsed(node)) {
            for (const [slugKey, subNode] of Object.entries(node.folders).sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
                const newPath = currentPath ? `${currentPath}/${slugKey}` : slugKey;
                this._generateTreeFiles(drg, subNode, newPath, files);
            }
        }
    }

    /**
     * Generate files for refining children (placed in parent's folder)
     * @private
     */
    _generateRefiningChildrenFiles(drg, children, parentPath, files) {
        const basePath = `details/pages/${drg.toLowerCase()}`;
        const fullPath = parentPath ? `${basePath}/${parentPath}` : basePath;

        // Generate ON children
        for (const childOn of children.ons) {
            const onData = this._prepareONData(childOn, parentPath, drg);
            const fileName = `on-${childOn.itemId}.adoc`;
            files[`${fullPath}/${fileName}`] =
                Mustache.render(this.templates['on'], onData);

            // Recurse for nested refinements
            if (childOn.children) {
                this._generateRefiningChildrenFiles(drg, childOn.children, parentPath, files);
            }
        }

        // Generate OR children
        for (const childOr of children.ors) {
            const orData = this._prepareORData(childOr, parentPath, drg);
            const fileName = `or-${childOr.itemId}.adoc`;
            files[`${fullPath}/${fileName}`] =
                Mustache.render(this.templates['or'], orData);

            // Recurse for nested refinements
            if (childOr.children) {
                this._generateRefiningChildrenFiles(drg, childOr.children, parentPath, files);
            }
        }
    }

    /**
     * Prepare data for DrG index template
     * @private
     */
    _prepareDrgIndexData(drg, tree, ons, ors) {
        const drgSlug = this._slugify(drg);

        return {
            drgName: getDraftingGroupDisplay(drg),
            onCount: ons.length,
            orCount: ors.length,
            rootFolders: Object.keys(tree.folders).length > 0 ? {
                items: Object.values(tree.folders).sort((a, b) => a.name.localeCompare(b.name)).map(folder => ({
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

        // A collapsed node has at least one direct ON. In that case, sub-folders
        // are not rendered as separate linked pages but are absorbed inline into
        // this page's ON/OR lists, with sub-folder names as non-clickable labels.
        const collapsed = this._isCollapsed(node);

        // Start with the direct ONs/ORs of this node (always linked xrefs)
        const onItems = node.ons.flatMap(on =>
            this._flattenWithDepth(on, 'on', currentFullPath, 1)
        );
        const orItems = node.ors.flatMap(or =>
            this._flattenWithDepth(or, 'or', currentFullPath, 1)
        );

        // In collapsed mode, recursively absorb sub-folders into the same lists.
        // Each sub-folder contributes a non-clickable label item followed by its
        // own ONs/ORs (and recursively its sub-sub-folders).
        if (collapsed) {
            const sortedFolders = Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name));
            for (const folder of sortedFolders) {
                this._flattenCollapsedFolder(folder, currentFullPath, 1, onItems, orItems);
            }
        }

        // Convert raw item descriptors to pre-rendered AsciiDoc bullet lines.
        // Items with a file → clickable xref; items without → plain text label.
        // Pre-rendering here avoids conditional logic in the Mustache template.
        const toLine = item => ({
            line: item.file
                ? `${item.bulletPrefix} xref:${item.path}/${item.file}[${item.title}]`
                : `${item.bulletPrefix} ${item.title}`
        });

        return {
            folderName: node.name || folderName,
            subfolders: (!collapsed && Object.keys(node.folders).length > 0) ? {
                folders: Object.values(node.folders).sort((a, b) => a.name.localeCompare(b.name)).map(folder => {
                    const fullPath = currentPath
                        ? `${drgSlug}/${currentPath}/${folder.slug}`
                        : `${drgSlug}/${folder.slug}`;
                    return {
                        name: folder.name,
                        path: fullPath
                    };
                })
            } : null,
            ons: onItems.length > 0 ? { items: onItems.map(toLine) } : null,
            ors: orItems.length > 0 ? { items: orItems.map(toLine) } : null
        };
    }

    /**
     * Recursively flatten a collapsed sub-folder into the parent's ON/OR item arrays.
     *
     * Called only when the parent node is collapsed (has direct ONs). Instead of
     * generating a separate page for this sub-folder, its content is injected inline:
     *
     *   * <Sub-folder name>          ← non-clickable label (no xref)
     *   ** xref:...[ON-x: ...]       ← ONs of this sub-folder
     *   ** xref:...[OR-x: ...]       ← ORs of this sub-folder
     *   ** <Nested sub-folder>       ← recursive, depth increases
     *
     * The label is placed in the ON list if the sub-folder has ONs or deeper children,
     * otherwise in the OR list — keeping the two sections visually coherent.
     *
     * IMPORTANT: xref paths must use each folder's own slug-based path, not the
     * parent's path — entity files are written at their own sub-folder location.
     *
     * @param {Object} folder - tree node for the sub-folder being absorbed
     * @param {string} parentFolderPath - Antora path of the containing (parent) folder
     * @param {number} depth - current bullet nesting depth (1 = first level under parent)
     * @param {Array} onItems - accumulator for ON bullet items
     * @param {Array} orItems - accumulator for OR bullet items
     * @private
     */
    _flattenCollapsedFolder(folder, parentFolderPath, depth, onItems, orItems) {
        const prefix = '*'.repeat(depth);
        const label = { bulletPrefix: prefix, title: folder.name }; // no file = non-clickable label

        // Each folder's entities live at their own path, not the parent's.
        // This is critical: _generateTreeFiles still writes entity files at their
        // sub-folder path even when the parent is collapsed.
        const thisFolderPath = `${parentFolderPath}/${folder.slug}`;

        const folderHasOns = folder.ons.length > 0;
        const folderHasOrs = folder.ors.length > 0;
        const folderHasChildren = Object.keys(folder.folders).length > 0;

        // Only insert a label if there is something to label
        if (folderHasOns || folderHasOrs || folderHasChildren) {
            // Place label in the ON section if this folder contributes ONs (or deeper
            // sub-folders which may), otherwise place it in the OR section.
            if (folderHasOns || folderHasChildren) {
                onItems.push(label);
            } else {
                orItems.push(label);
            }
        }

        for (const on of folder.ons) {
            onItems.push(...this._flattenWithDepth(on, 'on', thisFolderPath, depth + 1));
        }
        for (const or of folder.ors) {
            orItems.push(...this._flattenWithDepth(or, 'or', thisFolderPath, depth + 1));
        }

        // Recurse into sub-sub-folders, passing this folder's path as the new parent
        const sortedFolders = Object.values(folder.folders).sort((a, b) => a.name.localeCompare(b.name));
        for (const subFolder of sortedFolders) {
            this._flattenCollapsedFolder(subFolder, thisFolderPath, depth + 1, onItems, orItems);
        }
    }

    /**
     * Flatten an entity and its refinement children into a depth-indented list.
     * Each entry carries a bulletPrefix ('*', '**', '***', …) for AsciiDoc nesting.
     * Children always share the same folder path as their root ancestor.
     *
     * @param {Object} entity - ON or OR entity node (with optional .children)
     * @param {'on'|'or'} type
     * @param {string} folderPath - Antora path for the containing folder
     * @param {number} depth - 1-based nesting depth (root items start at 1)
     * @returns {Array<{bulletPrefix, title, path, file}>}
     * @private
     */
    _flattenWithDepth(entity, type, folderPath, depth) {
        const prefix = '*'.repeat(depth);
        const result = [{
            bulletPrefix: prefix,
            title: entity.title,
            path: folderPath,
            file: `${type}-${entity.itemId}.adoc`
        }];

        if (entity.children) {
            for (const childOn of entity.children.ons) {
                result.push(...this._flattenWithDepth(childOn, 'on', folderPath, depth + 1));
            }
            for (const childOr of entity.children.ors) {
                result.push(...this._flattenWithDepth(childOr, 'or', folderPath, depth + 1));
            }
        }

        return result;
    }

    /**
     * Prepare data for ON template
     * @private
     */
    _prepareONData(on, currentPath, drg) {
        // Don't reset - use global counter to avoid collisions
        // this.deltaConverter.resetImageTracking();

        // Convert statement, rationale, and flows
        const _convert = (field, value) => {
            try {
                return this._fixAntoraImagePaths(this.deltaConverter.deltaToAsciidoc(value));
            } catch (err) {
                throw new Error(
                    `Failed to convert ON ${on.itemId} (${on.title || 'untitled'}) field "${field}": ${err.message}`
                );
            }
        };

        const statement = on.statement ? _convert('statement', on.statement) : null;
        const statementImages = [...this.deltaConverter.getExtractedImages()];

        // Don't reset between fields
        const rationale = on.rationale ? _convert('rationale', on.rationale) : null;
        const rationaleImages = [...this.deltaConverter.getExtractedImages().slice(statementImages.length)];

        const flows = on.flows ? _convert('flows', on.flows) : null;
        const flowsImages = [...this.deltaConverter.getExtractedImages().slice(statementImages.length + rationaleImages.length)];

        // Collect all images
        this.allImages.push(...statementImages, ...rationaleImages, ...flowsImages);

        return {
            title: on.title,
            code: on.code,
            drg: getDraftingGroupDisplay(drg),
            path: on.path ? on.path.join(' / ') : null,
            statement: statement,
            rationale: rationale,
            flows: flows,
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
            refinedBy: on.refinedBy && on.refinedBy.length > 0 ? {
                items: on.refinedBy.map(child => {
                    const lookupMap = child.type === 'ON' ? this.onLookup : this.orLookup;
                    const childInfo = lookupMap.get(child.id);
                    if (!childInfo) {
                        console.warn(`ON ${on.itemId} is refined by ${child.type} ${child.id} which was not found in lookup`);
                        return null;
                    }
                    return {
                        id: child.id,
                        title: child.title,
                        type: child.type,
                        path: this._buildEntityPath(childInfo.drg, childInfo.path),
                        file: `${child.type.toLowerCase()}-${child.id}.adoc`
                    };
                }).filter(Boolean)
            } : null,
            implementedBy: on.implementedBy && on.implementedBy.length > 0 ? {
                items: on.implementedBy.map(or => {
                    const orInfo = this.orLookup.get(or.id);
                    if (!orInfo) {
                        console.warn(`ON ${on.itemId} is implemented by OR ${or.id} which was not found in lookup`);
                        return null;
                    }
                    return {
                        id: or.id,
                        title: or.title,
                        path: this._buildEntityPath(orInfo.drg, orInfo.path),
                        file: `or-${or.id}.adoc`
                    };
                }).filter(Boolean)
            } : null,
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
            } : null,
            strategicDocuments: on.strategicDocuments && on.strategicDocuments.length > 0 ? {
                items: on.strategicDocuments.map(ref => {
                    const doc = this.documentLookup.get(ref.id);
                    if (!doc) {
                        console.warn(`ON ${on.itemId} references document ${ref.id} which was not found in lookup`);
                        return { title: ref.title, note: ref.note || null, url: null, version: null };
                    }
                    return {
                        title: doc.name,
                        version: doc.version || null,
                        url: doc.url || null,
                        note: ref.note || null
                    };
                })
            } : null
        };
    }

    /**
     * Prepare data for OR template
     * @private
     */
    _prepareORData(or, currentPath, drg) {
        // Don't reset - use global counter to avoid collisions
        // this.deltaConverter.resetImageTracking();

        // Convert statement, rationale, and flows
        const _convert = (field, value) => {
            try {
                return this._fixAntoraImagePaths(this.deltaConverter.deltaToAsciidoc(value));
            } catch (err) {
                throw new Error(
                    `Failed to convert OR ${or.itemId} (${or.title || 'untitled'}) field "${field}": ${err.message}`
                );
            }
        };

        const statement = or.statement ? _convert('statement', or.statement) : null;
        const statementImages = [...this.deltaConverter.getExtractedImages()];

        // Don't reset between fields
        const rationale = or.rationale ? _convert('rationale', or.rationale) : null;
        const rationaleImages = [...this.deltaConverter.getExtractedImages().slice(statementImages.length)];

        const flows = or.flows ? _convert('flows', or.flows) : null;
        const flowsImages = [...this.deltaConverter.getExtractedImages().slice(statementImages.length + rationaleImages.length)];

        // Collect all images
        this.allImages.push(...statementImages, ...rationaleImages, ...flowsImages);

        return {
            title: or.title,
            code: or.code,
            drg: getDraftingGroupDisplay(drg),
            path: or.path ? or.path.join(' / ') : null,
            statement: statement,
            rationale: rationale,
            flows: flows,
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
            })() : null,
            refinedBy: or.refinedBy && or.refinedBy.length > 0 ? {
                items: or.refinedBy.map(childOr => {
                    const childInfo = this.orLookup.get(childOr.id);
                    if (!childInfo) {
                        console.warn(`OR ${or.itemId} is refined by OR ${childOr.id} which was not found in lookup`);
                        return null;
                    }
                    return {
                        id: childOr.id,
                        title: childOr.title,
                        path: this._buildEntityPath(childInfo.drg, childInfo.path),
                        file: `or-${childOr.id}.adoc`
                    };
                }).filter(Boolean)
            } : null
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
     * Generate navigation for details module with full hierarchy
     * @private
     */
    _generateDetailsNav(drgs) {
        const sortedDrgs = drgs.sort((a, b) =>
            getDraftingGroupDisplay(a).localeCompare(getDraftingGroupDisplay(b)));
        let nav = '';

        // Get the full data structures for each DrG
        for (const drg of sortedDrgs) {
            const drgSlug = this._slugify(drg);
            nav += `* xref:${drgSlug}/index.adoc[${getDraftingGroupDisplay(drg)}]\n`;

            // Get the tree structure for this DrG
            const drgOns = this.allOns.filter(on => on.drg === drg);
            const drgOrs = this.allOrs.filter(or => or.drg === drg);
            const tree = this._buildHierarchy(drgOns, drgOrs);

            // Generate nav for this DrG's tree
            nav += this._generateTreeNav(tree, drgSlug, '', 2);
        }

        return nav;
    }

    /**
     * Generate navigation entries recursively for a tree structure.
     *
     * For collapsed nodes (those with direct ONs), sub-folders are not linked pages
     * but their entities still need nav entries so Antora can highlight and expand
     * the correct nav node when the user navigates to an individual ON/OR page.
     * Sub-folder names appear as non-clickable labels (plain text, no xref),
     * mirroring the inline structure rendered on the collapsed page itself.
     * @private
     */
    _generateTreeNav(node, drgSlug, currentPath, depth) {
        let nav = '';
        const indent = '*'.repeat(depth);

        if (this._isCollapsed(node)) {
            // Collapsed node: sub-folders have no pages of their own.
            // Emit direct ONs/ORs first, then recurse into sub-folders via
            // _generateCollapsedFolderNav to produce non-clickable labels + entity entries.
            for (const on of node.ons) {
                const fullPath = currentPath ? `${drgSlug}/${currentPath}` : drgSlug;
                nav += `${indent} xref:${fullPath}/on-${on.itemId}.adoc[ON ${on.title}]
`;
                if (on.children && (on.children.ons.length > 0 || on.children.ors.length > 0)) {
                    nav += this._generateChildrenNav(on.children, drgSlug, depth + 1);
                }
            }
            for (const or of node.ors) {
                const fullPath = currentPath ? `${drgSlug}/${currentPath}` : drgSlug;
                nav += `${indent} xref:${fullPath}/or-${or.itemId}.adoc[OR ${or.title}]
`;
                if (or.children && (or.children.ons.length > 0 || or.children.ors.length > 0)) {
                    nav += this._generateChildrenNav(or.children, drgSlug, depth + 1);
                }
            }
            for (const [folderSlug, folder] of Object.entries(node.folders).sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
                const thisFolderPath = `${drgSlug}/${currentPath ? currentPath + '/' : ''}${folderSlug}`;
                nav += this._generateCollapsedFolderNav(folder, thisFolderPath, depth);
            }
        } else {
            // Normal node: each sub-folder has its own linked page.
            for (const [folderSlug, folder] of Object.entries(node.folders).sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
                const folderPath = currentPath ? `${currentPath}/${folderSlug}` : folderSlug;
                const fullPath = `${drgSlug}/${folderPath}`;
                nav += `${indent} xref:${fullPath}/index.adoc[${folder.name}]
`;
                nav += this._generateTreeNav(folder, drgSlug, folderPath, depth + 1);
            }
            for (const on of node.ons) {
                const fullPath = currentPath ? `${drgSlug}/${currentPath}` : drgSlug;
                nav += `${indent} xref:${fullPath}/on-${on.itemId}.adoc[ON ${on.title}]
`;
                if (on.children && (on.children.ons.length > 0 || on.children.ors.length > 0)) {
                    nav += this._generateChildrenNav(on.children, drgSlug, depth + 1);
                }
            }
            for (const or of node.ors) {
                const fullPath = currentPath ? `${drgSlug}/${currentPath}` : drgSlug;
                nav += `${indent} xref:${fullPath}/or-${or.itemId}.adoc[OR ${or.title}]
`;
                if (or.children && (or.children.ons.length > 0 || or.children.ors.length > 0)) {
                    nav += this._generateChildrenNav(or.children, drgSlug, depth + 1);
                }
            }
        }

        return nav;
    }

    /**
     * Generate nav entries for a collapsed sub-folder and its descendants.
     *
     * The sub-folder has no page of its own, so its name is emitted as a
     * non-clickable plain-text label (no xref). Its ONs/ORs are emitted as
     * normal xref entries one level deeper. Sub-sub-folders recurse the same way.
     *
     * This mirrors exactly what _flattenCollapsedFolder produces on the page,
     * ensuring the nav tree and the page content are always in sync.
     *
     * @param {Object} folder - collapsed sub-folder tree node
     * @param {string} thisFolderPath - full Antora path for this folder (drgSlug/…/slug)
     * @param {number} depth - bullet depth for the label item
     * @private
     */
    _generateCollapsedFolderNav(folder, thisFolderPath, depth) {
        let nav = '';
        const indent = '*'.repeat(depth);
        const childIndent = '*'.repeat(depth + 1);

        const folderHasOns = folder.ons.length > 0;
        const folderHasOrs = folder.ors.length > 0;
        const folderHasChildren = Object.keys(folder.folders).length > 0;

        if (folderHasOns || folderHasOrs || folderHasChildren) {
            // Non-clickable label — plain text, no xref
            nav += `${indent} ${folder.name}
`;
        }

        for (const on of folder.ons) {
            nav += `${childIndent} xref:${thisFolderPath}/on-${on.itemId}.adoc[ON ${on.title}]
`;
            if (on.children && (on.children.ons.length > 0 || on.children.ors.length > 0)) {
                nav += this._generateChildrenNav(on.children, null, depth + 2);
            }
        }
        for (const or of folder.ors) {
            nav += `${childIndent} xref:${thisFolderPath}/or-${or.itemId}.adoc[OR ${or.title}]
`;
            if (or.children && (or.children.ons.length > 0 || or.children.ors.length > 0)) {
                nav += this._generateChildrenNav(or.children, null, depth + 2);
            }
        }

        // Recurse into sub-sub-folders
        for (const [subSlug, subFolder] of Object.entries(folder.folders).sort(([, a], [, b]) => a.name.localeCompare(b.name))) {
            const subFolderPath = `${thisFolderPath}/${subSlug}`;
            nav += this._generateCollapsedFolderNav(subFolder, subFolderPath, depth + 1);
        }

        return nav;
    }

    /**
     * Generate navigation entries for refining children
     * @private
     */
    _generateChildrenNav(children, drgSlug, depth) {
        let nav = '';
        const indent = '*'.repeat(depth);

        // Children have no path - they're positioned by refinement
        // We need to look up their actual location
        for (const childOn of children.ons) {
            const childInfo = this.onLookup.get(childOn.itemId);
            const fullPath = this._buildEntityPath(childInfo.drg, childInfo.path);
            nav += `${indent} xref:${fullPath}/on-${childOn.itemId}.adoc[ON ${childOn.title}]\n`;

            // Recurse for nested refinements
            if (childOn.children && (childOn.children.ons.length > 0 || childOn.children.ors.length > 0)) {
                nav += this._generateChildrenNav(childOn.children, drgSlug, depth + 1);
            }
        }

        for (const childOr of children.ors) {
            const childInfo = this.orLookup.get(childOr.itemId);
            const fullPath = this._buildEntityPath(childInfo.drg, childInfo.path);
            nav += `${indent} xref:${fullPath}/or-${childOr.itemId}.adoc[OR ${childOr.title}]\n`;

            // Recurse for nested refinements
            if (childOr.children && (childOr.children.ons.length > 0 || childOr.children.ors.length > 0)) {
                nav += this._generateChildrenNav(childOr.children, drgSlug, depth + 1);
            }
        }

        return nav;
    }
}