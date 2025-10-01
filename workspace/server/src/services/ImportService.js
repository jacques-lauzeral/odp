import StakeholderCategoryService from './StakeholderCategoryService.js';
import ServiceService from './ServiceService.js';
import DataCategoryService from './DataCategoryService.js';
import RegulatoryAspectService from './RegulatoryAspectService.js';
import OperationalRequirementService from './OperationalRequirementService.js';

class ImportService {
    /**
     * Import setup data from YAML structure
     * @param {Object} setupData - Parsed YAML with stakeholderCategories, services, dataCategories, regulatoryAspects
     * @param {string} userId - User performing the import
     * @returns {Object} Summary with counts and errors
     */
    async importSetupData(setupData, userId) {
        // Create import context for this operation
        const context = {
            setupIdMap: new Map(),
            errors: [],
            warnings: []
        };

        const summary = {
            stakeholderCategories: 0,
            services: 0,
            dataCategories: 0,
            regulatoryAspects: 0,
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

            if (setupData.regulatoryAspects) {
                summary.regulatoryAspects = await this._importRegulatoryAspects(
                    setupData.regulatoryAspects,
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
     * @returns {Object} Summary with counts and errors
     */
    async importRequirements(requirementsData, drg, userId) {
        // Create import context for this operation
        const context = {
            globalRefMap: new Map(),
            waveIdMap: new Map(),
            errors: [],
            warnings: []
        };

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
     * @returns {Object} Summary with counts and errors
     */
    async importChanges(changesData, drg, userId) {
        // Create import context for this operation
        const context = {
            globalRefMap: new Map(),
            waveIdMap: new Map(),
            changeIdMap: new Map(),
            errors: [],
            warnings: []
        };

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
            // Phase 1: Build reference maps from existing DB (including waves)
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
            const WaveService = (await import('./WaveService.js')).default;

            // Load all existing entities from database
            const [stakeholders, services, dataCategories, regulatory, allRequirements, waves] =
                await Promise.all([
                    StakeholderCategoryService.listItems(userId),
                    ServiceService.listItems(userId),
                    DataCategoryService.listItems(userId),
                    RegulatoryAspectService.listItems(userId),
                    OperationalRequirementService.getAll(userId),
                    WaveService.listItems(userId)
                ]);

            // Clear and rebuild global reference map
            context.globalRefMap.clear();

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
            regulatory.forEach(entity =>
                context.globalRefMap.set(entity.name.toLowerCase(), entity.id)
            );

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
            });

            console.log(`Global reference map build - completed: ${context.globalRefMap.size} entries`);
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
                    references: reqData.references || '',
                    flows: reqData.flows || '',
                    drg: drg,
                    // All reference fields empty initially
                    refinesParents: [],
                    impactsStakeholderCategories: [],
                    impactsData: [],
                    impactsServices: [],
                    impactsRegulatoryAspects: [],
                    implementedONs: []
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
     * Create all changes with resolved references and milestones
     */
    async _createChangesWithReferences(changes, drg, userId, context) {
        const OperationalChangeService = (await import('./OperationalChangeService.js')).default;
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

                // Create the change with resolved references
                const createRequest = {
                    title: changeData.title,
                    purpose: changeData.purpose || '',
                    initialState: changeData.initialState || '',
                    finalState: changeData.finalState || '',
                    details: changeData.details || '',
                    visibility: changeData.visibility || 'NETWORK',
                    drg: drg,
                    satisfiesRequirements: satisfiedORs,
                    supersedsRequirements: supersededORs,
                    milestones: [] // Create without milestones initially
                };

                const created = await OperationalChangeService.create(createRequest, userId);

                // Store in map for potential future reference
                context.changeIdMap.set(changeData.externalId.toLowerCase(), created.itemId);

                // Add milestones separately
                if (changeData.milestones && changeData.milestones.length > 0) {
                    await this._addMilestonesToChange(
                        created.itemId,
                        created.versionId,
                        changeData.externalId,
                        changeData.milestones,
                        userId,
                        context
                    );
                }

                createdCount++;
                console.log(`Created change: ${changeData.externalId}`);

            } catch (error) {
                context.errors.push(
                    `Failed to create change ${changeData.externalId}: ${error.message}`
                );
            }
        }

        return createdCount;
    }

    /**
     * Add milestones to an existing change
     */
    async _addMilestonesToChange(changeId, versionId, changeExternalId, milestones, userId, context) {
        const OperationalChangeService = (await import('./OperationalChangeService.js')).default;

        // Get current change for update
        const current = await OperationalChangeService.getById(changeId, userId);

        const processedMilestones = [];
        let milestoneIndex = 1;

        for (const milestoneData of milestones) {
            try {
                // Generate milestone key
                const milestoneKey = `${changeExternalId}-M${milestoneIndex}`;

                // Resolve wave reference
                let waveId = null;
                if (milestoneData.wave) {
                    waveId = context.waveIdMap.get(milestoneData.wave);
                    if (!waveId) {
                        context.warnings.push(
                            `Wave '${milestoneData.wave}' not found for milestone in ${changeExternalId}`
                        );
                    }
                }

                processedMilestones.push({
                    milestoneKey: milestoneKey,
                    title: milestoneData.title,
                    description: milestoneData.description || '',
                    eventType: milestoneData.eventType,
                    waveId: waveId
                });

                milestoneIndex++;

            } catch (error) {
                context.errors.push(
                    `Failed to process milestone for ${changeExternalId}: ${error.message}`
                );
            }
        }

        // Update change with milestones if any were successfully processed
        if (processedMilestones.length > 0) {
            try {
                const updateRequest = {
                    title: current.title,
                    purpose: current.purpose,
                    initialState: current.initialState,
                    finalState: current.finalState,
                    details: current.details,
                    visibility: current.visibility,
                    drg: current.drg,
                    satisfiesRequirements: current.satisfiesRequirements?.map(r => r.id) || [],
                    supersedsRequirements: current.supersedsRequirements?.map(r => r.id) || [],
                    milestones: processedMilestones
                };

                await OperationalChangeService.update(
                    changeId,
                    updateRequest,
                    versionId,
                    userId
                );

                console.log(`Added ${processedMilestones.length} milestones to ${changeExternalId}`);

            } catch (error) {
                context.errors.push(
                    `Failed to add milestones to ${changeExternalId}: ${error.message}`
                );
            }
        }
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

        // Build update request with all resolved references
        const updateRequest = {
            title: current.title,
            type: current.type,
            statement: current.statement,
            rationale: current.rationale,
            references: current.references,
            flows: current.flows,
            drg: current.drg,
            refinesParents: refinesParents,
            impactsStakeholderCategories: impactsStakeholderCategories,
            impactsData: impactsData,
            impactsServices: impactsServices,
            implementedONs: implementedONs
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

    async _importRegulatoryAspects(aspects, userId, context) {
        let count = 0;

        for (const aspectData of aspects) {
            try {
                const createRequest = {
                    name: aspectData.name,
                    description: aspectData.description
                };

                const created = await RegulatoryAspectService.createRegulatoryAspect(
                    createRequest,
                    userId
                );

                // Store with lowercase key
                context.setupIdMap.set(aspectData.externalId.toLowerCase(), created.id);
                count++;

            } catch (error) {
                context.errors.push(`Failed to create regulatory aspect ${aspectData.externalId}: ${error.message}`);
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

        // Log missing references as errors
        if (missing.length > 0) {
            context.errors.push(`Missing external references: ${missing.join(', ')}`);
        }

        return resolved;
    }
}

export default ImportService;