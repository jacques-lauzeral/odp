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

    // Phase 1: Global reference map building

    /**
     * Build comprehensive reference maps from existing database entities
     */
    async _buildGlobalReferenceMaps(userId, context) {
        try {
            // Load all existing entities from database
            const [stakeholders, services, dataCategories, regulatory, allRequirements] =
                await Promise.all([
                    StakeholderCategoryService.listItems(userId),
                    ServiceService.listItems(userId),
                    DataCategoryService.listItems(userId),
                    RegulatoryAspectService.listItems(userId),
                    OperationalRequirementService.getAll(userId)
                ]);

            // Clear and rebuild global reference map
            context.globalRefMap.clear();

            // Map setup entities by name
            stakeholders.forEach(entity => context.globalRefMap.set(entity.name, entity.id));
            services.forEach(entity => context.globalRefMap.set(entity.name, entity.id));
            dataCategories.forEach(entity => context.globalRefMap.set(entity.name, entity.id));
            regulatory.forEach(entity => context.globalRefMap.set(entity.name, entity.id));

            // Build title paths for existing ON/ORs and map them
            const titlePaths = this._buildTitlePaths(allRequirements, context);
            titlePaths.forEach((id, titlePath) => context.globalRefMap.set(titlePath, id));

            console.log(`Global reference map built: ${context.globalRefMap.size} entries`);

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

        // Build lookup maps
        allRequirements.forEach(req => {
            reqById.set(req.id, req);
            if (req.refinesParents && req.refinesParents.length > 0) {
                if (req.refinesParents.length > 1) {
                    context.warnings.push(
                        `Requirement ${req.title} has multiple parents, using first one only`
                    );
                }
                parentMap.set(req.id, req.refinesParents[0].id);
            }
        });

        // Check for circular references
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
        allRequirements.forEach(req => buildPath(req.id));

        return pathMap;
    }

    // Phase 2: Entity creation without references

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
                    rationale: reqData.rationale,
                    references: reqData.references,
                    risksAndOpportunities: reqData.risksAndOpportunities,
                    flows: reqData.flows,
                    flowExamples: reqData.flowExamples,
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

                // Add to global reference map immediately
                context.globalRefMap.set(reqData.externalId, created.itemId);
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

    // Phase 3: Reference resolution

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
        const requirementId = context.globalRefMap.get(reqData.externalId);
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

        const impactsRegulatoryAspects = this._resolveExternalIds(
            reqData.impactedRegulatoryAspects || [],
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
            risksAndOpportunities: current.risksAndOpportunities,
            flows: current.flows,
            flowExamples: current.flowExamples,
            drg: current.drg,
            refinesParents: refinesParents,
            impactsStakeholderCategories: impactsStakeholderCategories,
            impactsData: impactsData,
            impactsServices: impactsServices,
            impactsRegulatoryAspects: impactsRegulatoryAspects,
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
                    context.setupIdMap.get(categoryData.parentExternalId) : null;

                const createRequest = {
                    name: categoryData.name,
                    description: categoryData.description,
                    parentId: parentId
                };

                const created = await StakeholderCategoryService.createStakeholderCategory(
                    createRequest,
                    userId
                );

                context.setupIdMap.set(categoryData.externalId, created.id);
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
                    context.setupIdMap.get(serviceData.parentExternalId) : null;

                const createRequest = {
                    name: serviceData.name,
                    description: serviceData.description,
                    parentId: parentId
                };

                const created = await ServiceService.createService(createRequest, userId);
                context.setupIdMap.set(serviceData.externalId, created.id);
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
                    context.setupIdMap.get(categoryData.parentExternalId) : null;

                const createRequest = {
                    name: categoryData.name,
                    description: categoryData.description,
                    parentId: parentId
                };

                const created = await DataCategoryService.createDataCategory(
                    createRequest,
                    userId
                );

                context.setupIdMap.set(categoryData.externalId, created.id);
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

                context.setupIdMap.set(aspectData.externalId, created.id);
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
     * Resolve external IDs to internal IDs using global reference map
     */
    _resolveExternalIds(externalIds, context) {
        if (!Array.isArray(externalIds)) {
            return [];
        }

        const resolved = [];
        const missing = [];

        for (const extId of externalIds) {
            const internalId = context.globalRefMap.get(extId);
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