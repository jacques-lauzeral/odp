import StakeholderCategoryService from './StakeholderCategoryService.js';
import ServiceService from './ServiceService.js';
import DataCategoryService from './DataCategoryService.js';
import RegulatoryAspectService from './RegulatoryAspectService.js';
import OperationalRequirementService from './OperationalRequirementService.js';

class ImportService {
    constructor() {

        // Track external ID mappings during import
        this.externalIdMap = new Map();

        // Track errors for greedy processing
        this.errors = [];
    }

    /**
     * Import setup data from YAML structure
     * @param {Object} setupData - Parsed YAML with stakeholderCategories, services, dataCategories, regulatoryAspects
     * @param {string} userId - User performing the import
     * @returns {Object} Summary with counts and errors
     */
    async importSetupData(setupData, userId) {
        this.externalIdMap.clear();
        this.errors = [];

        const summary = {
            stakeholderCategories: 0,
            services: 0,
            dataCategories: 0,
            regulatoryAspects: 0,
            errors: []
        };

        try {
            // Import in dependency order to handle hierarchies
            if (setupData.stakeholderCategories) {
                summary.stakeholderCategories = await this._importStakeholderCategories(
                    setupData.stakeholderCategories,
                    userId
                );
            }

            if (setupData.services) {
                summary.services = await this._importServices(setupData.services, userId);
            }

            if (setupData.dataCategories) {
                summary.dataCategories = await this._importDataCategories(
                    setupData.dataCategories,
                    userId
                );
            }

            if (setupData.regulatoryAspects) {
                summary.regulatoryAspects = await this._importRegulatoryAspects(
                    setupData.regulatoryAspects,
                    userId
                );
            }

            summary.errors = this.errors;
            return summary;

        } catch (error) {
            this.errors.push(`Import failed: ${error.message}`);
            summary.errors = this.errors;
            return summary;
        }
    }

    /**
     * Import operational requirements from YAML structure
     * @param {Object} requirementsData - Parsed YAML with requirements array
     * @param {string} drg - Drafting Group to assign to all requirements
     * @param {string} userId - User performing the import
     * @returns {Object} Summary with counts and errors
     */
    async importRequirements(requirementsData, drg, userId) {
        this.externalIdMap.clear();
        this.errors = [];

        const summary = {
            requirements: 0,
            errors: []
        };

        if (!requirementsData.requirements || !Array.isArray(requirementsData.requirements)) {
            this.errors.push('No requirements array found in import data');
            summary.errors = this.errors;
            return summary;
        }

        try {
            // Two-pass approach: create all requirements first, then handle implementedONs
            const requirements = requirementsData.requirements;

            // Pass 1: Create all requirements without implementedONs relationships
            for (const reqData of requirements) {
                try {
                    const created = await this._createRequirement(reqData, drg, userId, false);
                    if (created) {
                        this.externalIdMap.set(reqData.externalId, created.id);
                        summary.requirements++;
                    }
                } catch (error) {
                    this.errors.push(`Failed to create requirement ${reqData.externalId}: ${error.message}`);
                }
            }

            // Pass 2: Update requirements with implementedONs relationships
            for (const reqData of requirements) {
                if (reqData.implementedONs && reqData.implementedONs.length > 0) {
                    try {
                        await this._updateRequirementImplementedONs(reqData, userId);
                    } catch (error) {
                        this.errors.push(`Failed to update implementedONs for ${reqData.externalId}: ${error.message}`);
                    }
                }
            }

            summary.errors = this.errors;
            return summary;

        } catch (error) {
            this.errors.push(`Requirements import failed: ${error.message}`);
            summary.errors = this.errors;
            return summary;
        }
    }

    // Private methods for setup entity import

    async _importStakeholderCategories(categories, userId) {
        // Sort by dependency order (parents before children)
        const sorted = this._topologicalSort(categories, 'parentExternalId');
        let count = 0;

        for (const categoryData of sorted) {
            try {
                const parentId = categoryData.parentExternalId ?
                    this.externalIdMap.get(categoryData.parentExternalId) : null;

                const createRequest = {
                    name: categoryData.name,
                    description: categoryData.description,
                    parentCategoryId: parentId
                };

                const created = await StakeholderCategoryService.createStakeholderCategory(
                    createRequest,
                    userId
                );

                this.externalIdMap.set(categoryData.externalId, created.id);
                count++;

            } catch (error) {
                this.errors.push(`Failed to create stakeholder category ${categoryData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importServices(services, userId) {
        const sorted = this._topologicalSort(services, 'parentExternalId');
        let count = 0;

        for (const serviceData of sorted) {
            try {
                const parentId = serviceData.parentExternalId ?
                    this.externalIdMap.get(serviceData.parentExternalId) : null;

                const createRequest = {
                    name: serviceData.name,
                    description: serviceData.description,
                    parentServiceId: parentId
                };

                const created = await ServiceService.createService(createRequest, userId);
                this.externalIdMap.set(serviceData.externalId, created.id);
                count++;

            } catch (error) {
                this.errors.push(`Failed to create service ${serviceData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importDataCategories(categories, userId) {
        const sorted = this._topologicalSort(categories, 'parentExternalId');
        let count = 0;

        for (const categoryData of sorted) {
            try {
                const parentId = categoryData.parentExternalId ?
                    this.externalIdMap.get(categoryData.parentExternalId) : null;

                const createRequest = {
                    name: categoryData.name,
                    description: categoryData.description,
                    parentCategoryId: parentId
                };

                const created = await DataCategoryService.createDataCategory(
                    createRequest,
                    userId
                );

                this.externalIdMap.set(categoryData.externalId, created.id);
                count++;

            } catch (error) {
                this.errors.push(`Failed to create data category ${categoryData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    async _importRegulatoryAspects(aspects, userId) {
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

                this.externalIdMap.set(aspectData.externalId, created.id);
                count++;

            } catch (error) {
                this.errors.push(`Failed to create regulatory aspect ${aspectData.externalId}: ${error.message}`);
            }
        }

        return count;
    }

    // Private methods for requirements import

    async _createRequirement(reqData, drg, userId, includeImplementedONs = false) {
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
            refinesParents: this._resolveExternalIds(reqData.parentExternalId ? [reqData.parentExternalId] : []),
            impactsStakeholderCategories: this._resolveExternalIds(reqData.impactedStakeholderCategories || []),
            impactsData: this._resolveExternalIds(reqData.impactedDataCategories || []),
            impactsServices: this._resolveExternalIds(reqData.impactedServices || []),
            impactsRegulatoryAspects: this._resolveExternalIds(reqData.impactedRegulatoryAspects || [])
        };

        if (includeImplementedONs && reqData.implementedONs) {
            createRequest.implementedONs = this._resolveExternalIds(reqData.implementedONs);
        }

        return await OperationalRequirementService.create(
            createRequest,
            userId
        );
    }

    async _updateRequirementImplementedONs(reqData, userId) {
        const requirementId = this.externalIdMap.get(reqData.externalId);
        if (!requirementId) {
            throw new Error(`Requirement ${reqData.externalId} not found in mapping`);
        }

        // Get current requirement to get version for update
        const current = await OperationalRequirementService.getById(requirementId, userId);

        const updateRequest = {
            title: reqData.title,
            type: reqData.type,
            statement: reqData.statement,
            rationale: reqData.rationale,
            references: reqData.references,
            risksAndOpportunities: reqData.risksAndOpportunities,
            flows: reqData.flows,
            flowExamples: reqData.flowExamples,
            drg: current.drg, // Keep existing DRG
            refinesParents: current.refinesParents?.map(p => p.id) || [],
            impactsStakeholderCategories: current.impactsStakeholderCategories?.map(s => s.id) || [],
            impactsData: current.impactsData?.map(d => d.id) || [],
            impactsServices: current.impactsServices?.map(s => s.id) || [],
            impactsRegulatoryAspects: current.impactsRegulatoryAspects?.map(r => r.id) || [],
            implementedONs: this._resolveExternalIds(reqData.implementedONs),
            expectedVersionId: current.versionId
        };

        return await OperationalRequirementService.updateOperationalRequirement(
            requirementId,
            updateRequest,
            userId
        );
    }

    // Utility methods

    /**
     * Topological sort for dependency resolution
     */
    _topologicalSort(items, parentField) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (item) => {
            if (visiting.has(item.externalId)) {
                // Circular dependency - add to errors but continue
                this.errors.push(`Circular dependency detected for ${item.externalId}`);
                return;
            }

            if (visited.has(item.externalId)) {
                return;
            }

            visiting.add(item.externalId);

            // Find parent and visit it first
            if (item[parentField]) {
                const parent = items.find(i => i.externalId === item[parentField]);
                if (parent) {
                    visit(parent);
                } else {
                    this.errors.push(`Parent ${item[parentField]} not found for ${item.externalId}`);
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
     * Resolve external IDs to internal IDs
     */
    _resolveExternalIds(externalIds) {
        if (!Array.isArray(externalIds)) {
            return [];
        }

        return externalIds
            .map(extId => this.externalIdMap.get(extId))
            .filter(id => id !== undefined);
    }
}

export default ImportService;