import StakeholderCategoryService from '../StakeholderCategoryService.js';
import ServiceService from '../ServiceService.js';
import DataCategoryService from '../DataCategoryService.js';
import DocumentService from '../DocumentService.js';
import WaveService from '../WaveService.js';
import OperationalRequirementService from '../OperationalRequirementService.js';

class YamlMapper {
    /**
     * Import setup data from YAML structure
     * @param {Object} setupData - Parsed YAML with stakeholderCategories, services, dataCategories, documents, waves
     * @param {string} userId - User performing the import
     * @param {Object} context - Import context
     * @returns {Object} Summary with counts and errors
     */
    async importSetupData(setupData, userId, context) {
        const summary = {
            stakeholderCategories: 0,
            services: 0,
            dataCategories: 0,
            documents: 0,
            waves: 0,
            errors: [],
            warnings: []
        };

        try {
            // Import in dependency order to handle hierarchies
            if (setupData.stakeholderCategories) {
                summary.stakeholderCategories = await this._importStakeholderCategories(
                    setupData.stakeholderCategories,
                    userId,
                    context
                );
            }

            if (setupData.services) {
                summary.services = await this._importServices(
                    setupData.services,
                    userId,
                    context
                );
            }

            if (setupData.dataCategories) {
                summary.dataCategories = await this._importDataCategories(
                    setupData.dataCategories,
                    userId,
                    context
                );
            }

            if (setupData.documents) {
                summary.documents = await this._importDocuments(
                    setupData.documents,
                    userId,
                    context
                );
            }

            if (setupData.waves) {
                summary.waves = await this._importWaves(
                    setupData.waves,
                    userId,
                    context
                );
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
     * Import operational requirements from YAML structure using 3-phase algorithm
     * @param {Object} requirementsData - Parsed YAML with requirements array
     * @param {string} drg - Drafting Group to assign to all requirements
     * @param {string} userId - User performing the import
     * @param {Object} context - Import context
     * @returns {Object} Summary with counts and errors
     */
    async importRequirements(requirementsData, drg, userId, context) {
        const summary = {
            requirements: 0,
            errors: [],
            warnings: []
        };

        if (!requirementsData.requirements || !Array.isArray(requirementsData.requirements)) {
            context.errors.push('No requirements array found in import data');
            summary.errors = context.errors;
            return summary;
        }

        try {
            // Phase 1: Build global reference maps from existing DB
            console.log('Phase 1: Building global reference maps...');
            await this._buildGlobalReferenceMaps(userId, context);

            // Phase 2: Create all ON/ORs without references
            console.log('Phase 2: Creating entities without references...');
            const createdCount = await this._createEntitiesWithoutReferences(
                requirementsData.requirements,
                drg,
                userId,
                context
            );
            summary.requirements = createdCount;

            // Phase 3: Resolve all references in individual transactions
            console.log('Phase 3: Resolving references...');
            console.log(`>> Global reference map: ${context.globalRefMap.size} entries`);
            console.log('>> Global reference map contents:', Object.fromEntries(context.globalRefMap));
            await this._resolveAllReferences(
                requirementsData.requirements,
                userId,
                context
            );

            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;

        } catch (error) {
            context.errors.push(`Requirements import failed: ${error.message}`);
            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;
        }
    }

    /**
     * Import operational changes from YAML structure
     * @param {Object} changesData - Parsed YAML with changes array
     * @param {string} drg - Drafting Group to assign to all changes
     * @param {string} userId - User performing the import
     * @param {Object} context - Import context
     * @returns {Object} Summary with counts and errors
     */
    async importChanges(changesData, drg, userId, context) {
        const summary = {
            changes: 0,
            errors: [],
            warnings: []
        };

        if (!changesData.changes || !Array.isArray(changesData.changes)) {
            context.errors.push('No changes array found in import data');
            summary.errors = context.errors;
            return summary;
        }

        try {
            // Phase 1: Build reference maps from existing DB (including waves and documents)
            console.log('Phase 1: Building reference maps...');
            await this._buildGlobalReferenceMaps(userId, context);

            // Phase 2: Create all changes with resolved references and milestones
            console.log('Phase 2: Creating changes with references and milestones...');
            const createdCount = await this._createChangesWithReferences(
                changesData.changes,
                drg,
                userId,
                context
            );
            summary.changes = createdCount;

            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;

        } catch (error) {
            context.errors.push(`Changes import failed: ${error.message}`);
            summary.errors = context.errors;
            summary.warnings = context.warnings;
            return summary;
        }
    }

    // Phase 1: Global reference map building

    /**
     * Build comprehensive reference maps from existing database entities
     * Loads ALL entities for use by any import operation
     */
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

            // Clear and rebuild global reference map
            context.globalRefMap.clear();

            // Initialize document map if not exists
            if (!context.documentIdMap) {
                context.documentIdMap = new Map();
            }
            context.documentIdMap.clear();

            // Initialize wave map if not exists
            if (!context.waveIdMap) {
                context.waveIdMap = new Map();
            }
            context.waveIdMap.clear();

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

            // Build document reference map by external ID (case-insensitive)
            console.log('Building document reference map...');
            documents.forEach(doc => {
                // Documents are stored with external ID as their identifier
                context.documentIdMap.set(doc.name.toLowerCase(), doc.id);
            });

            // Build title paths for existing ON/ORs and map them
            console.log(`Global reference map - building title paths`);
            const titlePaths = this._buildTitlePaths(allRequirements, context);
            console.log(`Global reference map - built title paths`);
            titlePaths.forEach((id, titlePath) =>
                context.globalRefMap.set(titlePath.toLowerCase(), id)
            );

            // Build wave reference map
            console.log('Building wave reference map...');
            waves.forEach(wave => {
                // Primary key: "year.quarter" format
                const waveKey = wave.name; // e.g., "2027.2"
                context.waveIdMap.set(waveKey, wave.id);

                // Also support "year-Qquarter" format for flexibility
                const altKey = `${wave.year}-Q${wave.quarter}`;
                context.waveIdMap.set(altKey, wave.id);

                // Also support "year-quarter" format (without Q)
                const altKey2 = `${wave.year}-${wave.quarter}`;
                context.waveIdMap.set(altKey2, wave.id);
            });

            console.log(`Global reference map build - completed: ${context.globalRefMap.size} entries`);
            console.log(`Document map build - completed: ${context.documentIdMap.size} entries`);
            console.log(`Wave map build - completed: ${context.waveIdMap.size} entries`);

        } catch (error) {
            throw new Error(`Failed to build global reference maps: ${error.message}`);
        }
    }

    /**
     * Build title paths for all existing ON/ORs by traversing REFINES hierarchy
     */
    _buildTitlePaths(allRequirements, context) {
        const pathMap = new Map();
        const visitedPaths = new Map();
        const parentMap = new Map();
        const reqById = new Map();

        console.log(`Global reference map - build title paths`);

        // Build lookup maps
        allRequirements.forEach(req => {
            console.log(`Global reference map - build requirement map - set itemId: ${req.itemId}`);
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

        // Check for circular references
        console.log(`Global reference map - check for circular references`);
        const detectCircular = (reqId, visited = new Set()) => {
            if (visited.has(reqId)) {
                return reqId; // Found circular reference
            }
            visited.add(reqId);
            const parentId = parentMap.get(reqId);
            if (parentId) {
                return detectCircular(parentId, visited);
            }
            return null;
        };

        // Check all requirements for circular references
        console.log(`Global reference map - check all requirements for circular references`);
        for (const req of allRequirements) {
            const circularNode = detectCircular(req.id);
            if (circularNode) {
                const circularReq = reqById.get(circularNode);
                throw new Error(
                    `Circular reference detected in REFINES hierarchy involving: ${circularReq.title}`
                );
            }
        }

        // Recursive path building function
        console.log(`Global reference map - recursive path building function`);
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
        console.log(`Global reference map - build paths for all requirements`);
        allRequirements.forEach(req => buildPath(req.itemId));

        return pathMap;
    }

    // Phase 2: Entity creation without references (for requirements)

    /**
     * Create all ON/ORs without any references, adding them to global map
     */
    async _createEntitiesWithoutReferences(requirements, drg, userId, context) {
        let createdCount = 0;

        for (const reqData of requirements) {
            try {
                const createRequest = {
                    title: reqData.title,
                    type: reqData.type,
                    statement: reqData.statement,
                    rationale: reqData.rationale || '',
                    flows: reqData.flows || '',
                    privateNotes: reqData.privateNotes || '',
                    path: reqData.path || [],
                    drg: drg,
                    // All reference fields empty initially
                    refinesParents: [],
                    impactsStakeholderCategories: [],
                    impactsData: [],
                    impactsServices: [],
                    implementedONs: [],
                    referencesDocuments: [],
                    dependsOnRequirements: []
                };

                const created = await OperationalRequirementService.create(createRequest, userId);

                // Add to global reference map immediately (case-insensitive)
                context.globalRefMap.set(reqData.externalId.toLowerCase(), created.itemId);
                createdCount++;

                console.log(`Created requirement: ${reqData.externalId}`);

            } catch (error) {
                context.errors.push(
                    `Failed to create requirement ${reqData.externalId}: ${error.message}`
                );
            }
        }

        return createdCount;
    }

    // Phase 2: Create changes with references (simplified for changes)

    /**
     * Create all changes with resolved references and milestones in one step
     */
    async _createChangesWithReferences(changes, drg, userId, context) {
        const OperationalChangeService = (await import('../OperationalChangeService.js')).default;
        let createdCount = 0;

        for (const changeData of changes) {
            try {
                // Resolve OR references immediately (using globalRefMap)
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
                    changeData.referencesDocuments || [],
                    context
                );

                // Resolve change dependencies
                const dependsOnChanges = this._resolveExternalIds(
                    changeData.dependsOnChanges || [],
                    context
                );

                // Process milestones BEFORE creating the change
                const processedMilestones = [];
                if (changeData.milestones && changeData.milestones.length > 0) {
                    let milestoneIndex = 1;

                    for (const milestoneData of changeData.milestones) {
                        try {
                            // Generate milestone key
                            const milestoneKey = `${changeData.externalId}-M${milestoneIndex}`;

                            // Resolve wave reference
                            let waveId = null;
                            if (milestoneData.wave) {
                                // Try multiple formats for wave lookup
                                waveId = context.waveIdMap.get(milestoneData.wave) ||
                                    context.waveIdMap.get(milestoneData.wave.toLowerCase());

                                if (!waveId) {
                                    context.warnings.push(
                                        `Wave '${milestoneData.wave}' not found for milestone ${milestoneIndex} in ${changeData.externalId}`
                                    );
                                }
                            }

                            // Build milestone object for creation
                            // Note: eventType is now a single value, not an array
                            const milestone = {
                                milestoneKey: milestoneKey,
                                eventType: milestoneData.eventType || 'OPS_DEPLOYMENT',
                                waveId: waveId
                            };

                            console.log(`Prepared milestone for ${changeData.externalId}: ${JSON.stringify(milestone)}`);
                            processedMilestones.push(milestone);
                            milestoneIndex++;

                        } catch (error) {
                            context.errors.push(
                                `Failed to process milestone for ${changeData.externalId}: ${error.message}`
                            );
                        }
                    }
                }

                // Create the change WITH milestones included
                const createRequest = {
                    title: changeData.title,
                    purpose: changeData.purpose || '',
                    initialState: changeData.initialState || '',
                    finalState: changeData.finalState || '',
                    details: changeData.details || '',
                    privateNotes: changeData.privateNotes || '',
                    path: changeData.path || [],
                    visibility: changeData.visibility || 'NETWORK',
                    drg: drg,
                    satisfiesRequirements: satisfiedORs,
                    supersedsRequirements: supersededORs,
                    referencesDocuments: documentReferences,
                    dependsOnChanges: dependsOnChanges,
                    milestones: processedMilestones  // Include processed milestones directly
                };

                console.log(`Creating change ${changeData.externalId} with request: ${JSON.stringify(createRequest)}`);

                const created = await OperationalChangeService.create(createRequest, userId);

                // Store in map for potential future reference
                context.changeIdMap.set(changeData.externalId.toLowerCase(), created.itemId);

                createdCount++;
                console.log(`Successfully created change: ${changeData.externalId} with ${processedMilestones.length} milestones`);

            } catch (error) {
                console.error(`Failed to create change ${changeData.externalId}:`, error);
                context.errors.push(
                    `Failed to create change ${changeData.externalId}: ${error.message}`
                );
            }
        }

        return createdCount;
    }

    // Phase 3: Reference resolution (for requirements)

    /**
     * Resolve all references for each requirement in individual transactions
     */
    async _resolveAllReferences(requirements, userId, context) {
        for (const reqData of requirements) {
            try {
                await this._resolveEntityReferences(reqData, userId, context);
            } catch (error) {
                context.errors.push(
                    `Failed to resolve references for ${reqData.externalId}: ${error.message}`
                );
            }
        }
    }

    /**
     * Resolve and update all references for a single requirement
     */
    async _resolveEntityReferences(reqData, userId, context) {
        const requirementId = context.globalRefMap.get(reqData.externalId.toLowerCase());
        if (!requirementId) {
            throw new Error(`Requirement ${reqData.externalId} not found in global map`);
        }

        // Get current requirement for version control
        const current = await OperationalRequirementService.getById(requirementId, userId);

        // Resolve all reference types
        const refinesParents = this._resolveExternalIds(
            reqData.parentExternalId ? [reqData.parentExternalId] : [],
            context
        );

        const impactsStakeholderCategories = this._resolveExternalIds(
            reqData.impactedStakeholderCategories || [],
            context
        );

        const impactsData = this._resolveExternalIds(
            reqData.impactedDataCategories || [],
            context
        );

        const impactsServices = this._resolveExternalIds(
            reqData.impactedServices || [],
            context
        );

        const implementedONs = this._resolveExternalIds(
            reqData.implementedONs || [],
            context
        );

        const referencesDocuments = this._resolveDocumentReferences(
            reqData.referencesDocuments || [],
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
            referencesDocuments: referencesDocuments,
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

    // Setup entity import methods

    async _importStakeholderCategories(categories, userId, context) {
        const sorted = this._topologicalSort(categories, 'parentExternalId', context);
        let count = 0;

        for (const categoryData of sorted) {
            try {
                const parentId = categoryData.parentExternalId ?
                    context.setupIdMap.get(categoryData.parentExternalId.toLowerCase()) : null;

                const createRequest = {
                    name: categoryData.name,
                    description: categoryData.description,
                    parentId: parentId
                };

                const created = await StakeholderCategoryService.createStakeholderCategory(
                    createRequest,
                    userId
                );

                // Store with lowercase key
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
                    name: serviceData.name,
                    description: serviceData.description,
                    parentId: parentId
                };

                const created = await ServiceService.createService(createRequest, userId);
                // Store with lowercase key
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
                    name: categoryData.name,
                    description: categoryData.description,
                    parentId: parentId
                };

                const created = await DataCategoryService.createDataCategory(
                    createRequest,
                    userId
                );

                // Store with lowercase key
                context.setupIdMap.set(categoryData.externalId.toLowerCase(), created.id);
                count++;

            } catch (error) {
                context.errors.push(`Failed to create data category ${categoryData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importDocuments(documents, userId, context) {
        let count = 0;

        for (const docData of documents) {
            try {
                const createRequest = {
                    name: docData.name,
                    version: docData.version || '',
                    description: docData.description || '',
                    url: docData.url || ''
                };

                const created = await DocumentService.createDocument(
                    createRequest,
                    userId
                );

                // Store with lowercase key
                context.setupIdMap.set(docData.externalId.toLowerCase(), created.id);
                count++;

                console.log(`Created document: ${docData.externalId} (${docData.name})`);

            } catch (error) {
                context.errors.push(`Failed to create document ${docData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importWaves(waves, userId, context) {
        let count = 0;

        for (const waveData of waves) {
            try {
                const createRequest = {
                    name: waveData.name,
                    year: waveData.year,
                    quarter: waveData.quarter,
                    date: waveData.date
                };

                const created = await WaveService.createWave(
                    createRequest,
                    userId
                );

                // Store with lowercase key for externalId
                context.setupIdMap.set(waveData.externalId.toLowerCase(), created.id);
                count++;

                console.log(`Created wave: ${waveData.externalId} (${waveData.name})`);

            } catch (error) {
                context.errors.push(`Failed to create wave ${waveData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    // Utility methods

    /**
     * Topological sort for dependency resolution
     */
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

    /**
     * Resolve external IDs to internal IDs using global reference map (case-insensitive)
     */
    _resolveExternalIds(externalIds, context) {
        if (!Array.isArray(externalIds)) {
            return [];
        }

        const resolved = [];
        const missing = [];

        for (const extId of externalIds) {
            // Use lowercase for lookup
            const internalId = context.globalRefMap.get(extId.toLowerCase());
            if (internalId !== undefined) {
                resolved.push(internalId);
            } else {
                missing.push(extId);
            }
        }

        // Log missing references as warnings (not errors, as they may be external documents)
        if (missing.length > 0) {
            context.warnings.push(`Missing external references: ${missing.join(', ')}`);
        }

        return resolved;
    }

    /**
     * Resolve document references from YAML format to internal format
     * @param {Array} documentRefs - Array of {documentExternalId, note} objects
     * @param {Object} context - Import context with documentIdMap
     * @returns {Array} Array of {documentId, note} objects
     */
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

            // Look up document ID (case-insensitive)
            const documentId = context.documentIdMap.get(ref.documentExternalId.toLowerCase());

            if (documentId !== undefined) {
                resolved.push({
                    documentId: documentId,
                    note: ref.note || ''
                });
            } else {
                missing.push(ref.documentExternalId);
            }
        }

        // Log missing document references as warnings
        if (missing.length > 0) {
            context.warnings.push(`Missing document references: ${missing.join(', ')}`);
        }

        return resolved;
    }
}

export default new YamlMapper();