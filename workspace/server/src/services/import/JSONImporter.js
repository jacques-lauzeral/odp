import StakeholderCategoryService from '../StakeholderCategoryService.js';
import DomainService from '../DomainService.js';
import ReferenceDocumentService from '../ReferenceDocumentService.js';
import WaveService from '../WaveService.js';
import OperationalRequirementService from '../OperationalRequirementService.js';
import OperationalChangeService from '../OperationalChangeService.js';
import ExternalIdBuilder from '../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * JSON Importer for StructuredImportData format
 * Handles import from Word/Excel extraction pipeline
 */
class JSONImporter {
    /**
     * Import structured data from JSON format
     * @param {Object} structuredData - StructuredImportData with all entity types
     * @param {string} userId - User performing the import
     * @returns {Object} ImportSummary with counts and errors
     */
    async importStructuredData(structuredData, userId) {
        const context = this._createContext();
        const summary = {
            referenceDocuments: 0,
            stakeholderCategories: 0,
            domains: 0,
            waves: 0,
            requirements: 0,
            changes: 0,
            errors: []
        };

        try {
            // Phase 1: Import setup entities (dependencies for requirements/changes)
            console.log('Phase 1: Importing setup entities...');
            await this._importSetupEntities(structuredData, userId, context, summary);

            // Phase 2: Import requirements using 3-phase algorithm
            console.log('Phase 2: Importing requirements...');
            if (structuredData.requirements && structuredData.requirements.length > 0) {
                await this._importRequirements(structuredData.requirements, userId, context, summary);
            }

            // Phase 3: Import changes
            console.log('Phase 3: Importing changes...');
            if (structuredData.changes && structuredData.changes.length > 0) {
                await this._importChanges(structuredData.changes, userId, context, summary);
            }

            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;

        } catch (error) {
            context.errors.push(`Import failed: ${error.message}`);
            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;
        }
    }

    /**
     * Create import context with necessary maps and error tracking
     * @private
     */
    _createContext() {
        return {
            setupIdMap: new Map(),
            globalRefMap: new Map(),
            documentIdMap: new Map(),
            waveIdMap: new Map(),
            changeIdMap: new Map(),
            errors: [],
            warnings: []
        };
    }

    /**
     * Import all setup entities in dependency order
     * @private
     */
    async _importSetupEntities(structuredData, userId, context, summary) {
        // Load existing setup entities from database into global reference map
        await this._buildSetupEntityReferenceMaps(userId, context);

        // Import reference documents first (no dependencies)
        if (structuredData.referenceDocuments && structuredData.referenceDocuments.length > 0) {
            summary.referenceDocuments = await this._importReferenceDocuments(structuredData.referenceDocuments, userId, context);
        }

        // Import stakeholder categories (may have hierarchy)
        if (structuredData.stakeholderCategories && structuredData.stakeholderCategories.length > 0) {
            summary.stakeholderCategories = await this._importStakeholderCategories(
                structuredData.stakeholderCategories,
                userId,
                context
            );
        }

        // Import domains (may have hierarchy)
        if (structuredData.domains && structuredData.domains.length > 0) {
            summary.domains = await this._importDomains(structuredData.domains, userId, context);
        }

        // Import waves (no dependencies)
        if (structuredData.waves && structuredData.waves.length > 0) {
            summary.waves = await this._importWaves(structuredData.waves, userId, context);
        }
    }

    /**
     * Build reference maps for existing setup entities from database
     * @private
     */
    async _buildSetupEntityReferenceMaps(userId, context) {
        try {
            const [stakeholders, domains, referenceDocuments, waves] = await Promise.all([
                StakeholderCategoryService.listItems(userId),
                DomainService.listItems(userId),
                ReferenceDocumentService.listItems(userId),
                WaveService.listItems(userId)
            ]);

            // Build maps with memoization for hierarchical entities
            this._buildHierarchicalMap(stakeholders, 'stakeholder', context);
            this._buildHierarchicalMap(domains, 'domain', context);

            // Build reference document map by external ID (case-insensitive)
            referenceDocuments.forEach(doc => {
                const externalId = ExternalIdBuilder.buildExternalId(doc, 'refdoc');
                context.documentIdMap.set(externalId.toLowerCase(), doc.id);
            });

            // Build wave reference map by external ID (case-insensitive)
            waves.forEach(wave => {
                const externalId = ExternalIdBuilder.buildExternalId(wave, 'wave');
                context.waveIdMap.set(externalId.toLowerCase(), wave.id);
            });

            console.log(`Loaded existing entities - Stakeholders: ${stakeholders.length}, Domains: ${domains.length}, ReferenceDocuments: ${referenceDocuments.length}, Waves: ${waves.length}`);

        } catch (error) {
            throw new Error(`Failed to build setup entity reference maps: ${error.message}`);
        }
    }


    /**
     * Build hierarchical entity map with memoization
     * @private
     */
    _buildHierarchicalMap(entities, type, context) {
        // Create lookup by ID
        const entityById = new Map();
        entities.forEach(entity => entityById.set(entity.id, entity));

        // Cache for computed external IDs
        const externalIdCache = new Map();

        // Recursively resolve external ID
        const resolveExternalId = (entityId) => {
            if (externalIdCache.has(entityId)) {
                return externalIdCache.get(entityId);
            }

            const entity = entityById.get(entityId);
            if (!entity) {
                throw new Error(`Entity with ID ${entityId} not found`);
            }

            let externalId;
            if (entity.parentId !== null && entity.parentId !== undefined) {
                const parentExternalId = resolveExternalId(entity.parentId);
                externalId = ExternalIdBuilder.buildExternalId({
                    name: entity.name,
                    parentExternalId: parentExternalId
                }, type);
            } else {
                externalId = ExternalIdBuilder.buildExternalId({
                    name: entity.name
                }, type);
            }

            externalIdCache.set(entityId, externalId);
            return externalId;
        };

        // Build the map
        entities.forEach(entity => {
            const externalId = resolveExternalId(entity.id);
            context.globalRefMap.set(externalId.toLowerCase(), entity.id);
        });
    }

    /**
     * Import requirements using 3-phase algorithm
     * @private
     */
    async _importRequirements(requirements, userId, context, summary) {
        try {
            // Phase 1: Build global reference maps from existing DB
            console.log('Requirements Phase 1: Building global reference maps...');
            await this._buildGlobalReferenceMaps(userId, context);

            // Phase 2: Create all requirements without references
            console.log('Requirements Phase 2: Creating entities without references...');
            const createdCount = await this._createRequirementsWithoutReferences(requirements, userId, context);
            summary.requirements = createdCount;

            // Phase 3: Resolve all references in individual transactions
            console.log('Requirements Phase 3: Resolving references...');
            await this._resolveRequirementReferences(requirements, userId, context);

        } catch (error) {
            context.errors.push(`Requirements import failed: ${error.message}`);
        }
    }

    /**
     * Import changes with resolved references
     * @private
     */
    async _importChanges(changes, userId, context, summary) {
        try {
            // Ensure global reference maps are built (may already be done by requirements import)
            if (context.globalRefMap.size === 0) {
                console.log('Changes: Building global reference maps...');
                await this._buildGlobalReferenceMaps(userId, context);
            }

            console.log('Changes: Creating changes with references...');
            const createdCount = await this._createChangesWithReferences(changes, userId, context);
            summary.changes = createdCount;

        } catch (error) {
            context.errors.push(`Changes import failed: ${error.message}`);
        }
    }

    // Setup entity import methods

    async _importReferenceDocuments(documents, userId, context) {
        let count = 0;

        for (const docData of documents) {
            try {
                const createRequest = {
                    name: docData.name,
                    version: docData.version || '',
                    url: docData.url || ''
                };

                const created = await ReferenceDocumentService.createItem(createRequest, userId);

                context.setupIdMap.set(docData.externalId.toLowerCase(), created.id);
                context.documentIdMap.set(docData.externalId.toLowerCase(), created.id);
                count++;

                console.log(`Created reference document: ${docData.externalId}`);

            } catch (error) {
                context.errors.push(`Failed to create reference document ${docData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importStakeholderCategories(categories, userId, context) {
        // Build lookup map by externalId
        const categoryMap = new Map();
        categories.forEach(cat => categoryMap.set(cat.externalId.toLowerCase(), cat));

        // Recursively import each category
        let count = 0;
        for (const categoryData of categories) {
            const created = await this._importStakeholderCategory(
                categoryData,
                categoryMap,
                userId,
                context
            );
            if (created) count++;
        }

        return count;
    }

    /**
     * Recursively import a stakeholder category, ensuring parent exists first
     * @private
     */
    async _importStakeholderCategory(itemData, itemMap, userId, context) {
        const externalId = itemData.externalId.toLowerCase();

        // Already imported?
        if (context.globalRefMap.has(externalId)) {
            return context.globalRefMap.get(externalId);
        }

        let parentId = null;

        // Handle parent if exists
        if (itemData.parentExternalId) {
            const parentExternalId = itemData.parentExternalId.toLowerCase();

            // Check if parent already in global map (from DB or already imported)
            if (context.globalRefMap.has(parentExternalId)) {
                parentId = context.globalRefMap.get(parentExternalId);
            } else {
                // Parent not yet imported - check if in current batch
                const parentData = itemMap.get(parentExternalId);
                if (parentData) {
                    // Recursively import parent first
                    parentId = await this._importStakeholderCategory(
                        parentData,
                        itemMap,
                        userId,
                        context
                    );
                } else {
                    context.errors.push(`Parent ${itemData.parentExternalId} not found for ${itemData.externalId}`);
                    return null;
                }
            }
        }

        // Create the item
        try {
            const createRequest = {
                name: itemData.name,
                description: itemData.description || '',
                parentId: parentId
            };

            const created = await StakeholderCategoryService.createItem(createRequest, userId);

            // Store in global map
            context.globalRefMap.set(externalId, created.id);

            console.log(`Created stakeholder category: ${itemData.externalId}`);
            return created.id;

        } catch (error) {
            context.errors.push(`Failed to create stakeholder category ${itemData.externalId}: ${error.message}`);
            return null;
        }
    }

    async _importDomains(domains, userId, context) {
        const domainMap = new Map();
        domains.forEach(d => domainMap.set(d.externalId.toLowerCase(), d));

        let count = 0;
        for (const domainData of domains) {
            const created = await this._importDomain(domainData, domainMap, userId, context);
            if (created) count++;
        }

        return count;
    }

    /**
     * Recursively import a domain, ensuring parent exists first
     * @private
     */
    async _importDomain(itemData, itemMap, userId, context) {
        const externalId = itemData.externalId.toLowerCase();

        if (context.globalRefMap.has(externalId)) {
            return context.globalRefMap.get(externalId);
        }

        let parentId = null;

        if (itemData.parentExternalId) {
            const parentExternalId = itemData.parentExternalId.toLowerCase();

            if (context.globalRefMap.has(parentExternalId)) {
                parentId = context.globalRefMap.get(parentExternalId);
            } else {
                const parentData = itemMap.get(parentExternalId);
                if (parentData) {
                    parentId = await this._importDomain(parentData, itemMap, userId, context);
                } else {
                    context.errors.push(`Parent ${itemData.parentExternalId} not found for ${itemData.externalId}`);
                    return null;
                }
            }
        }

        try {
            const createRequest = {
                name: itemData.name,
                description: itemData.description || '',
                parentId: parentId
            };

            const created = await DomainService.createItem(createRequest, userId);

            context.globalRefMap.set(externalId, created.id);

            console.log(`Created domain: ${itemData.externalId}`);
            return created.id;

        } catch (error) {
            context.errors.push(`Failed to create domain ${itemData.externalId}: ${error.message}`);
            return null;
        }
    }

    async _importWaves(waves, userId, context) {
        let count = 0;

        for (const waveData of waves) {
            try {
                const createRequest = {
                    year: waveData.year,
                    sequenceNumber: waveData.sequenceNumber,
                    implementationDate: waveData.implementationDate
                };

                const created = await WaveService.createItem(createRequest, userId);

                context.setupIdMap.set(waveData.externalId.toLowerCase(), created.id);
                context.waveIdMap.set(waveData.externalId.toLowerCase(), created.id);
                count++;

                console.log(`Created wave: ${waveData.externalId}`);

            } catch (error) {
                context.errors.push(`Failed to create wave ${waveData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    // Requirements import - 3-phase algorithm

    async _buildGlobalReferenceMaps(userId, context) {
        try {
            // Load all existing requirements from database
            const allRequirements = await OperationalRequirementService.getAll(userId);

            // Build requirement ID map and resolve external IDs
            const reqById = new Map();
            allRequirements.forEach(req => reqById.set(req.itemId, req));

            // Build external ID cache with memoization
            const externalIdCache = new Map();

            // Map all requirements by their external IDs
            allRequirements.forEach(req => {
                const externalId = this._resolveRequirementExternalId(req.itemId, reqById, externalIdCache);
                context.globalRefMap.set(externalId.toLowerCase(), req.itemId);
            });

        } catch (error) {
            throw new Error(`Failed to build global reference maps: ${error.message}`);
        }
    }

    /**
     * Resolve internal database ID to external ID for a requirement
     * Handles parent hierarchy recursively with memoization
     * @param {number} itemId - Internal database ID
     * @param {Map} reqById - Map of itemId -> requirement object
     * @param {Map} cache - Memoization cache (itemId -> externalId)
     * @returns {string} External ID
     * @private
     */
    _resolveRequirementExternalId(itemId, reqById, cache) {
        // Check cache first
        if (cache.has(itemId)) {
            return cache.get(itemId);
        }

        const req = reqById.get(itemId);
        if (!req) {
            throw new Error(`Requirement with ID ${itemId} not found`);
        }

        let externalId;

        // Check if has parent (refines relationship)
        if (req.refinesParents && req.refinesParents.length > 0) {
            const parentId = req.refinesParents[0].id;
            const parentExternalId = this._resolveRequirementExternalId(parentId, reqById, cache);

            externalId = ExternalIdBuilder.buildExternalId({
                drg: req.drg,
                parent: { externalId: parentExternalId },
                title: req.title
            }, req.type.toLowerCase());
        } else {
            // No parent, use path if available
            externalId = ExternalIdBuilder.buildExternalId({
                drg: req.drg,
                path: req.path || [],
                title: req.title
            }, req.type.toLowerCase());
        }

        // Cache the result
        cache.set(itemId, externalId);
        return externalId;
    }

    async _createRequirementsWithoutReferences(requirements, userId, context) {
        let createdCount = 0;

        for (const reqData of requirements) {
            try {
                const createRequest = {
                    title: reqData.title,
                    type: reqData.type,
                    statement: reqData.statement || '',
                    rationale: reqData.rationale || '',
                    flows: reqData.flows || '',
                    privateNotes: reqData.privateNotes || '',
                    maturity: reqData.maturity || 'DRAFT',
                    path: reqData.path || [],
                    drg: reqData.drg,
                    // All reference fields empty initially
                    refinesParents: [],
                    impactedStakeholders: [],
                    impactedDomains: [],
                    implementedONs: [],
                    dependencies: []
                };

                const created = await OperationalRequirementService.create(createRequest, userId);

                // Add to global reference map immediately (case-insensitive)
                context.globalRefMap.set(reqData.externalId.toLowerCase(), created.itemId);
                createdCount++;

                console.log(`Created requirement: ${reqData.externalId}`);

            } catch (error) {
                context.errors.push(`Failed to create requirement ${reqData.externalId}: ${error.message}`);
            }
        }

        return createdCount;
    }

    async _resolveRequirementReferences(requirements, userId, context) {
        for (const reqData of requirements) {
            try {
                await this._resolveEntityReferences(reqData, userId, context);
            } catch (error) {
                context.errors.push(`Failed to resolve references for ${reqData.externalId}: ${error.message}`);
            }
        }
    }

    async _resolveEntityReferences(reqData, userId, context) {
        const requirementId = context.globalRefMap.get(reqData.externalId.toLowerCase());
        if (!requirementId) {
            throw new Error(`Requirement ${reqData.externalId} not found in global map`);
        }

        // Get current requirement for version control
        const current = await OperationalRequirementService.getById(requirementId, userId);

        // Resolve all reference types
        const refinesParents = this._resolveExternalIds(
            reqData.parent ? [reqData.parent.externalId] : [],
            context
        );

        const impactedStakeholders = this._resolveImpactElementReferences(
            reqData.impactedStakeholders || [],
            context
        );

        const impactedDomains = this._resolveImpactElementReferences(
            reqData.impactedDomains || [],
            context
        );

        const implementedONs = this._resolveExternalIds(
            reqData.implementedONs || [],
            context
        );

        const dependencies = this._resolveExternalIds(
            reqData.dependencies || [],
            context
        );

        // Build update request with all resolved references
        const updateRequest = {
            title: current.title,
            type: current.type,
            statement: current.statement,
            rationale: current.rationale,
            flows: current.flows,
            privateNotes: current.privateNotes,
            maturity: current.maturity,
            path: current.path,
            drg: current.drg,
            refinesParents: refinesParents,
            impactedStakeholders: impactedStakeholders,
            impactedDomains: impactedDomains,
            implementedONs: implementedONs,
            dependencies: dependencies
        };

        // Update in single transaction
        await OperationalRequirementService.update(
            requirementId,
            updateRequest,
            current.versionId,
            userId
        );

        console.log(`Resolved references for: ${reqData.externalId}`);
    }

    // Changes import

    async _createChangesWithReferences(changes, userId, context) {
        let createdCount = 0;

        for (const changeData of changes) {
            try {
                // Resolve OR references
                const implementedORs = this._resolveExternalIds(
                    changeData.implementedORs || [],
                    context
                );

                const decommissionedORs = this._resolveExternalIds(
                    changeData.decommissionedORs || [],
                    context
                );

                // Resolve change dependencies
                const dependsOnChanges = this._resolveExternalIds(
                    changeData.dependsOnChanges || [],
                    context
                );

                // Process milestones
                const processedMilestones = [];
                if (changeData.milestones && changeData.milestones.length > 0) {
                    let milestoneIndex = 1;

                    for (const milestoneData of changeData.milestones) {
                        try {
                            const milestoneKey = `${changeData.externalId}-M${milestoneIndex}`;

                            // Resolve wave reference
                            let waveId = null;
                            if (milestoneData.wave) {
                                waveId = context.waveIdMap.get(milestoneData.wave.toLowerCase());

                                if (!waveId) {
                                    context.warnings.push(
                                        `Wave '${milestoneData.wave}' not found for milestone ${milestoneIndex} in ${changeData.externalId}`
                                    );
                                }
                            }

                            processedMilestones.push({
                                name: milestoneData.name,
                                milestoneKey: milestoneKey,
                                description: milestoneData.description || 'TBD',
                                eventTypes: milestoneData.eventTypes || [],
                                waveId: waveId
                            });

                            milestoneIndex++;

                        } catch (error) {
                            context.errors.push(
                                `Failed to process milestone for ${changeData.externalId}: ${error.message}`
                            );
                        }
                    }
                }

                // Create the change
                const createRequest = {
                    title: changeData.title,
                    purpose: changeData.purpose || '',
                    initialState: changeData.initialState || '',
                    finalState: changeData.finalState || '',
                    details: changeData.details || '',
                    privateNotes: changeData.privateNotes || '',
                    maturity: changeData.maturity || 'DRAFT',
                    path: changeData.path || [],
                    drg: changeData.drg,
                    implementedORs: implementedORs,
                    decommissionedORs: decommissionedORs,
                    dependsOnChanges: dependsOnChanges,
                    milestones: processedMilestones
                };

                const created = await OperationalChangeService.create(createRequest, userId);

                context.changeIdMap.set(changeData.externalId.toLowerCase(), created.itemId);
                createdCount++;

                console.log(`Created change: ${changeData.externalId}`);

            } catch (error) {
                context.errors.push(`Failed to create change ${changeData.externalId}: ${error.message}`);
            }
        }

        return createdCount;
    }

    // Utility methods

    _resolveExternalIds(externalIds, context) {
        if (!Array.isArray(externalIds)) {
            return [];
        }

        const resolved = [];
        const missing = [];

        for (const extId of externalIds) {
            const internalId = context.globalRefMap.get(extId.toLowerCase());
            if (internalId !== undefined) {
                resolved.push(internalId);
            } else {
                missing.push(extId);
            }
        }

        if (missing.length > 0) {
            context.warnings.push(`Missing external references: ${missing.join(', ')}`);
        }

        return resolved;
    }

    _resolveImpactElementReferences(impactElements, context) {
        if (!Array.isArray(impactElements)) {
            return [];
        }

        const resolved = [];
        const missing = [];

        for (const element of impactElements) {
            // Expect object format: { stakeholderCategoryExternalId: "...", note?: "..." }
            // (or similar for other impact types)

            if (typeof element !== 'object' || element === null) {
                context.warnings.push(`Invalid impact element format (expected object): ${JSON.stringify(element)}`);
                continue;
            }

            // Extract external ID
            const externalId = element.externalId;

            if (!externalId) {
                context.warnings.push(`Impact element missing external ID field: ${JSON.stringify(element)}`);
                continue;
            }

            const internalId = context.globalRefMap.get(externalId.toLowerCase());

            if (internalId !== undefined) {
                const ref = { id: internalId };
                if (element.note) {
                    ref.note = element.note;
                }
                resolved.push(ref);
            } else {
                missing.push(externalId);
            }
        }

        if (missing.length > 0) {
            context.warnings.push(`Missing external references: ${missing.join(', ')}`);
        }

        return resolved;
    }

}


export default new JSONImporter();