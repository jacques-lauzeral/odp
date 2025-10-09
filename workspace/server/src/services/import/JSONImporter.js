import StakeholderCategoryService from '../StakeholderCategoryService.js';
import ServiceService from '../ServiceService.js';
import DataCategoryService from '../DataCategoryService.js';
import DocumentService from '../DocumentService.js';
import WaveService from '../WaveService.js';
import OperationalRequirementService from '../OperationalRequirementService.js';
import OperationalChangeService from '../OperationalChangeService.js';

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
            documents: 0,
            stakeholderCategories: 0,
            dataCategories: 0,
            services: 0,
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
        // Import documents first (no dependencies)
        if (structuredData.documents && structuredData.documents.length > 0) {
            summary.documents = await this._importDocuments(structuredData.documents, userId, context);
        }

        // Import stakeholder categories (may have hierarchy)
        if (structuredData.stakeholderCategories && structuredData.stakeholderCategories.length > 0) {
            summary.stakeholderCategories = await this._importStakeholderCategories(
                structuredData.stakeholderCategories,
                userId,
                context
            );
        }

        // Import services (may have hierarchy)
        if (structuredData.services && structuredData.services.length > 0) {
            summary.services = await this._importServices(structuredData.services, userId, context);
        }

        // Import data categories (may have hierarchy)
        if (structuredData.dataCategories && structuredData.dataCategories.length > 0) {
            summary.dataCategories = await this._importDataCategories(structuredData.dataCategories, userId, context);
        }

        // Import waves (no dependencies)
        if (structuredData.waves && structuredData.waves.length > 0) {
            summary.waves = await this._importWaves(structuredData.waves, userId, context);
        }
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

    async _importDocuments(documents, userId, context) {
        let count = 0;

        for (const docData of documents) {
            try {
                const createRequest = {
                    name: docData.title,
                    version: docData.version || '',
                    description: docData.description || '',
                    url: docData.url || ''
                };

                const created = await DocumentService.createDocument(createRequest, userId);

                // Store with lowercase key
                context.setupIdMap.set(docData.externalId.toLowerCase(), created.id);
                context.documentIdMap.set(docData.externalId.toLowerCase(), created.id);
                count++;

                console.log(`Created document: ${docData.externalId}`);

            } catch (error) {
                context.errors.push(`Failed to create document ${docData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importStakeholderCategories(categories, userId, context) {
        const sorted = this._topologicalSort(categories, 'parentExternalId', context);
        let count = 0;

        for (const categoryData of sorted) {
            try {
                const parentId = categoryData.parentExternalId ?
                    context.setupIdMap.get(categoryData.parentExternalId.toLowerCase()) : null;

                const createRequest = {
                    name: categoryData.title,
                    description: categoryData.description || '',
                    parentId: parentId
                };

                const created = await StakeholderCategoryService.createStakeholderCategory(createRequest, userId);

                context.setupIdMap.set(categoryData.externalId.toLowerCase(), created.id);
                count++;

            } catch (error) {
                context.errors.push(`Failed to create stakeholder category ${categoryData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importServices(services, userId, context) {
        const sorted = this._topologicalSort(services, 'parentExternalId', context);
        let count = 0;

        for (const serviceData of sorted) {
            try {
                const parentId = serviceData.parentExternalId ?
                    context.setupIdMap.get(serviceData.parentExternalId.toLowerCase()) : null;

                const createRequest = {
                    name: serviceData.title,
                    description: serviceData.description || '',
                    parentId: parentId
                };

                const created = await ServiceService.createService(createRequest, userId);
                context.setupIdMap.set(serviceData.externalId.toLowerCase(), created.id);
                count++;

            } catch (error) {
                context.errors.push(`Failed to create service ${serviceData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importDataCategories(categories, userId, context) {
        const sorted = this._topologicalSort(categories, 'parentExternalId', context);
        let count = 0;

        for (const categoryData of sorted) {
            try {
                const parentId = categoryData.parentExternalId ?
                    context.setupIdMap.get(categoryData.parentExternalId.toLowerCase()) : null;

                const createRequest = {
                    name: categoryData.title,
                    description: categoryData.description || '',
                    parentId: parentId
                };

                const created = await DataCategoryService.createDataCategory(createRequest, userId);

                context.setupIdMap.set(categoryData.externalId.toLowerCase(), created.id);
                count++;

            } catch (error) {
                context.errors.push(`Failed to create data category ${categoryData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importWaves(waves, userId, context) {
        let count = 0;

        for (const waveData of waves) {
            try {
                const createRequest = {
                    name: waveData.title,
                    year: waveData.year,
                    quarter: waveData.quarter,
                    date: waveData.date
                };

                const created = await WaveService.createWave(createRequest, userId);

                context.setupIdMap.set(waveData.externalId.toLowerCase(), created.id);
                context.waveIdMap.set(waveData.externalId.toLowerCase(), created.id);
                // Also add wave name format for lookups
                context.waveIdMap.set(waveData.title.toLowerCase(), created.id);
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
            // Load all existing entities from database
            const [stakeholders, services, dataCategories, documents, allRequirements, waves] =
                await Promise.all([
                    StakeholderCategoryService.listItems(userId),
                    ServiceService.listItems(userId),
                    DataCategoryService.listItems(userId),
                    DocumentService.listItems(userId),
                    OperationalRequirementService.getAll(userId),
                    WaveService.listItems(userId)
                ]);

            // Map setup entities by name (case-insensitive)
            stakeholders.forEach(entity =>
                context.globalRefMap.set(entity.name.toLowerCase(), entity.id)
            );
            services.forEach(entity =>
                context.globalRefMap.set(entity.name.toLowerCase(), entity.id)
            );
            dataCategories.forEach(entity =>
                context.globalRefMap.set(entity.name.toLowerCase(), entity.id)
            );

            // Build document reference map by name (case-insensitive)
            documents.forEach(doc => {
                context.documentIdMap.set(doc.name.toLowerCase(), doc.id);
            });

            // Build title paths for existing requirements and map them
            const titlePaths = this._buildTitlePaths(allRequirements, context);
            titlePaths.forEach((id, titlePath) =>
                context.globalRefMap.set(titlePath.toLowerCase(), id)
            );

            // Build wave reference map
            waves.forEach(wave => {
                context.waveIdMap.set(wave.name.toLowerCase(), wave.id);
                // Also support "year-Qquarter" format
                const altKey = `${wave.year}-Q${wave.quarter}`;
                context.waveIdMap.set(altKey.toLowerCase(), wave.id);
            });

            console.log(`Global reference map: ${context.globalRefMap.size} entries`);
            console.log(`Document map: ${context.documentIdMap.size} entries`);
            console.log(`Wave map: ${context.waveIdMap.size} entries`);

        } catch (error) {
            throw new Error(`Failed to build global reference maps: ${error.message}`);
        }
    }

    _buildTitlePaths(allRequirements, context) {
        const pathMap = new Map();
        const visitedPaths = new Map();
        const parentMap = new Map();
        const reqById = new Map();

        // Build lookup maps
        allRequirements.forEach(req => {
            reqById.set(req.itemId, req);
            if (req.refinesParents && req.refinesParents.length > 0) {
                if (req.refinesParents.length > 1) {
                    context.warnings.push(
                        `Requirement ${req.title} has multiple parents, using first one only`
                    );
                }
                parentMap.set(req.itemId, req.refinesParents[0].id);
            }
        });

        // Recursive path building
        const buildPath = (reqId) => {
            if (visitedPaths.has(reqId)) {
                return visitedPaths.get(reqId);
            }

            const req = reqById.get(reqId);
            if (!req) {
                throw new Error(`Requirement with ID ${reqId} not found`);
            }

            const parentId = parentMap.get(reqId);
            let path;

            if (parentId) {
                const parentPath = buildPath(parentId);
                path = `${parentPath}/${req.title}`;
            } else {
                path = req.title;
            }

            visitedPaths.set(reqId, path);
            pathMap.set(path, reqId);
            return path;
        };

        // Build paths for all requirements
        allRequirements.forEach(req => buildPath(req.itemId));

        return pathMap;
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
                    path: reqData.path || [],
                    drg: reqData.drg,
                    // All reference fields empty initially
                    refinesParents: [],
                    impactsStakeholderCategories: [],
                    impactsData: [],
                    impactsServices: [],
                    implementedONs: [],
                    documentReferences: [],
                    dependsOnRequirements: []
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
            reqData.refines ? [reqData.refines] : [],
            context
        );

        const impactsStakeholderCategories = this._resolveExternalIds(
            reqData.impactsStakeholderCategories || [],
            context
        );

        const impactsData = this._resolveExternalIds(
            reqData.impactsData || [],
            context
        );

        const impactsServices = this._resolveExternalIds(
            reqData.impactsServices || [],
            context
        );

        const implementedONs = this._resolveExternalIds(
            reqData.implementedONs || [],
            context
        );

        const documentReferences = this._resolveDocumentReferences(
            reqData.documentReferences || [],
            context
        );

        const dependsOnRequirements = this._resolveExternalIds(
            reqData.dependsOnRequirements || [],
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
            path: current.path,
            drg: current.drg,
            refinesParents: refinesParents,
            impactsStakeholderCategories: impactsStakeholderCategories,
            impactsData: impactsData,
            impactsServices: impactsServices,
            implementedONs: implementedONs,
            documentReferences: documentReferences,
            dependsOnRequirements: dependsOnRequirements
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
                const satisfiedORs = this._resolveExternalIds(
                    changeData.satisfiedORs || [],
                    context
                );

                const supersededORs = this._resolveExternalIds(
                    changeData.supersededORs || [],
                    context
                );

                // Resolve document references
                const documentReferences = this._resolveDocumentReferences(
                    changeData.documentReferences || [],
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
                                milestoneKey: milestoneKey,
                                eventType: milestoneData.eventType || 'OPS_DEPLOYMENT',
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
                    path: changeData.path || [],
                    visibility: changeData.visibility || 'NETWORK',
                    drg: changeData.drg,
                    satisfiesRequirements: satisfiedORs,
                    supersedsRequirements: supersededORs,
                    documentReferences: documentReferences,
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

    _topologicalSort(items, parentField, context) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (item) => {
            if (visiting.has(item.externalId)) {
                context.errors.push(`Circular dependency detected for ${item.externalId}`);
                return;
            }

            if (visited.has(item.externalId)) {
                return;
            }

            visiting.add(item.externalId);

            if (item[parentField]) {
                const parent = items.find(i => i.externalId === item[parentField]);
                if (parent) {
                    visit(parent);
                } else {
                    context.errors.push(`Parent ${item[parentField]} not found for ${item.externalId}`);
                }
            }

            visiting.delete(item.externalId);
            visited.add(item.externalId);
            sorted.push(item);
        };

        items.forEach(visit);
        return sorted;
    }

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

    _resolveDocumentReferences(documentRefs, context) {
        if (!Array.isArray(documentRefs)) {
            return [];
        }

        const resolved = [];
        const missing = [];

        for (const ref of documentRefs) {
            if (!ref.documentExternalId) {
                context.warnings.push('Document reference missing documentExternalId');
                continue;
            }

            const documentId = context.documentIdMap.get(ref.documentExternalId.toLowerCase());

            if (documentId !== undefined) {
                resolved.push({
                    id: documentId,  // Changed from documentId to id
                    note: ref.note || ''
                });
            } else {
                missing.push(ref.documentExternalId);
            }
        }

        if (missing.length > 0) {
            context.warnings.push(`Missing document references: ${missing.join(', ')}`);
        }

        return resolved;
    }
}

export default new JSONImporter();