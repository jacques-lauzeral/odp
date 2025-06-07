import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalRequirement entities with versioning and relationship management
 * Handles REFINES (to other OperationalRequirements) and IMPACTS (to setup entities) relationships
 */
export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
    }

    /**
     * Create a new OperationalRequirement with initial version and relationships
     * @param {object} data - Complete requirement data
     * @param {string} data.title - Requirement title (goes to Item)
     * @param {string} data.type - 'ON' | 'OR'
     * @param {string} data.statement - Rich text statement
     * @param {string} data.rationale - Rich text rationale
     * @param {string} data.references - Rich text references
     * @param {string} data.risksAndOpportunities - Rich text risks
     * @param {string} data.flows - Rich text flows
     * @param {string} data.flowExamples - Rich text flow examples
     * @param {Array<number>} [data.refinesParents=[]] - Parent requirement Item IDs
     * @param {Array<number>} [data.impactsStakeholderCategories=[]] - StakeholderCategory IDs
     * @param {Array<number>} [data.impactsData=[]] - Data IDs
     * @param {Array<number>} [data.impactsServices=[]] - Service IDs
     * @param {Array<number>} [data.impactsRegulatoryAspects=[]] - RegulatoryAspect IDs
     * @param {Transaction} transaction - Transaction instance with user context
     * @returns {Promise<object>} Created requirement with complete data
     */
    async create(data, transaction) {
        try {
            // Extract relationships from data
            const {
                refinesParents = [],
                impactsStakeholderCategories = [],
                impactsData = [],
                impactsServices = [],
                impactsRegulatoryAspects = [],
                ...itemAndVersionData
            } = data;

            // Create Item and first ItemVersion using parent class
            const requirement = await super.create(itemAndVersionData, transaction);

            // Create initial relationships
            await this._createRelationships(requirement.versionId, {
                refinesParents,
                impactsStakeholderCategories,
                impactsData,
                impactsServices,
                impactsRegulatoryAspects
            }, transaction);

            // Return complete requirement with relationships
            return {
                ...requirement,
                refinesParents,
                impactsStakeholderCategories,
                impactsData,
                impactsServices,
                impactsRegulatoryAspects
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create OperationalRequirement: ${error.message}`, error);
        }
    }

    /**
     * Update OperationalRequirement - creates new version with relationship inheritance
     * @param {number} itemId - Item node ID
     * @param {object} data - Complete requirement data (content + relationships)
     * @param {number} expectedVersionId - Current version ID for optimistic locking
     * @param {Transaction} transaction - Transaction instance with user context
     * @returns {Promise<object>} Updated requirement with complete data
     */
    async update(itemId, data, expectedVersionId, transaction) {
        try {
            // Extract relationships from data
            const {
                refinesParents = [],
                impactsStakeholderCategories = [],
                impactsData = [],
                impactsServices = [],
                impactsRegulatoryAspects = [],
                ...itemAndVersionData
            } = data;

            // Get current relationships before update (for inheritance)
            const currentRelationships = await this._getCurrentRelationships(expectedVersionId, transaction);

            // Create new Item version using parent class
            const requirement = await super.update(itemId, itemAndVersionData, expectedVersionId, transaction);

            // Use provided relationships or inherit from previous version
            const newRelationships = {
                refinesParents: refinesParents.length > 0 ? refinesParents : currentRelationships.refinesParents,
                impactsStakeholderCategories: impactsStakeholderCategories.length > 0 ? impactsStakeholderCategories : currentRelationships.impactsStakeholderCategories,
                impactsData: impactsData.length > 0 ? impactsData : currentRelationships.impactsData,
                impactsServices: impactsServices.length > 0 ? impactsServices : currentRelationships.impactsServices,
                impactsRegulatoryAspects: impactsRegulatoryAspects.length > 0 ? impactsRegulatoryAspects : currentRelationships.impactsRegulatoryAspects
            };

            // Create relationships for new version
            await this._createRelationships(requirement.versionId, newRelationships, transaction);

            // Return complete requirement with relationships
            return {
                ...requirement,
                ...newRelationships
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update OperationalRequirement: ${error.message}`, error);
        }
    }

    /**
     * Find OperationalRequirement by Item ID (returns latest version with relationships)
     * @param {number} itemId - Item node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Requirement with relationships or null if not found
     */
    async findById(itemId, transaction) {
        try {
            // Get basic requirement data using parent class
            const requirement = await super.findById(itemId, transaction);
            if (!requirement) {
                return null;
            }

            // Get current relationships
            const relationships = await this._getCurrentRelationships(requirement.versionId, transaction);

            return {
                ...requirement,
                ...relationships
            };
        } catch (error) {
            throw new StoreError(`Failed to find OperationalRequirement: ${error.message}`, error);
        }
    }

    /**
     * Find specific version of OperationalRequirement with its relationships
     * @param {number} itemId - Item node ID
     * @param {number} versionNumber - Specific version number
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object|null>} Requirement version with relationships or null if not found
     */
    async findByIdAndVersion(itemId, versionNumber, transaction) {
        try {
            // Get basic requirement data using parent class
            const requirement = await super.findByIdAndVersion(itemId, versionNumber, transaction);
            if (!requirement) {
                return null;
            }

            // Get relationships for this specific version
            const relationships = await this._getCurrentRelationships(requirement.versionId, transaction);

            return {
                ...requirement,
                ...relationships
            };
        } catch (error) {
            throw new StoreError(`Failed to find OperationalRequirement by version: ${error.message}`, error);
        }
    }

    /**
     * Find all OperationalRequirements (latest versions with relationships)
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Array of requirements with relationships
     */
    async findAll(transaction) {
        try {
            // Get basic requirements data using parent class
            const requirements = await super.findAll(transaction);

            // Get relationships for each requirement
            const requirementsWithRelationships = [];
            for (const requirement of requirements) {
                const relationships = await this._getCurrentRelationships(requirement.versionId, transaction);
                requirementsWithRelationships.push({
                    ...requirement,
                    ...relationships
                });
            }

            return requirementsWithRelationships;
        } catch (error) {
            throw new StoreError(`Failed to find all OperationalRequirements: ${error.message}`, error);
        }
    }

    /**
     * Get current relationships for a specific version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Current relationships
     */
    async _getCurrentRelationships(versionId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                // Get REFINES relationships
                OPTIONAL MATCH (version)-[:REFINES]->(parent:OperationalRequirement)
                WITH version, collect(id(parent)) as refinesParents
                
                // Get IMPACTS relationships to StakeholderCategory
                OPTIONAL MATCH (version)-[:IMPACTS]->(sc:StakeholderCategory)
                WITH version, refinesParents, collect(id(sc)) as impactsStakeholderCategories
                
                // Get IMPACTS relationships to Data
                OPTIONAL MATCH (version)-[:IMPACTS]->(d:Data)
                WITH version, refinesParents, impactsStakeholderCategories, collect(id(d)) as impactsData
                
                // Get IMPACTS relationships to Service
                OPTIONAL MATCH (version)-[:IMPACTS]->(s:Service)
                WITH version, refinesParents, impactsStakeholderCategories, impactsData, collect(id(s)) as impactsServices
                
                // Get IMPACTS relationships to RegulatoryAspect
                OPTIONAL MATCH (version)-[:IMPACTS]->(ra:RegulatoryAspect)
                
                RETURN refinesParents, impactsStakeholderCategories, impactsData, impactsServices, collect(id(ra)) as impactsRegulatoryAspects
            `, { versionId });

            if (result.records.length === 0) {
                // Version doesn't exist - return empty relationships
                return {
                    refinesParents: [],
                    impactsStakeholderCategories: [],
                    impactsData: [],
                    impactsServices: [],
                    impactsRegulatoryAspects: []
                };
            }

            const record = result.records[0];
            return {
                refinesParents: record.get('refinesParents').map(id => id.toNumber()),
                impactsStakeholderCategories: record.get('impactsStakeholderCategories').map(id => id.toNumber()),
                impactsData: record.get('impactsData').map(id => id.toNumber()),
                impactsServices: record.get('impactsServices').map(id => id.toNumber()),
                impactsRegulatoryAspects: record.get('impactsRegulatoryAspects').map(id => id.toNumber())
            };
        } catch (error) {
            throw new StoreError(`Failed to get current relationships: ${error.message}`, error);
        }
    }

    /**
     * Create relationships for a version
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {object} relationships - Relationship data
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRelationships(versionId, relationships, transaction) {
        try {
            const {
                refinesParents,
                impactsStakeholderCategories,
                impactsData,
                impactsServices,
                impactsRegulatoryAspects
            } = relationships;

            // Validate that version exists and get its parent item for self-reference checks
            const versionCheck = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:VERSION_OF]->(item:OperationalRequirement)
                WHERE id(version) = $versionId
                RETURN id(item) as itemId
            `, { versionId });

            if (versionCheck.records.length === 0) {
                throw new StoreError('Version not found');
            }

            const itemId = versionCheck.records[0].get('itemId').toNumber();

            // Create REFINES relationships
            if (refinesParents.length > 0) {
                // Validate no self-references
                if (refinesParents.includes(itemId)) {
                    throw new StoreError('Cannot create self-referencing REFINES relationship');
                }

                // Validate all parent items exist
                const parentCheck = await transaction.run(`
                    MATCH (parent:OperationalRequirement)
                    WHERE id(parent) IN $parentIds
                    RETURN count(parent) as foundCount
                `, { parentIds: refinesParents });

                const foundCount = parentCheck.records[0].get('foundCount').toNumber();
                if (foundCount !== refinesParents.length) {
                    throw new StoreError('One or more parent requirements do not exist');
                }

                // Create REFINES relationships
                await transaction.run(`
                    MATCH (version:${this.versionLabel})
                    WHERE id(version) = $versionId
                    
                    UNWIND $parentIds as parentId
                    MATCH (parent:OperationalRequirement)
                    WHERE id(parent) = parentId
                    CREATE (version)-[:REFINES]->(parent)
                `, { versionId, parentIds: refinesParents });
            }

            // Create IMPACTS relationships
            await this._createImpactsRelationships(versionId, 'StakeholderCategory', impactsStakeholderCategories, transaction);
            await this._createImpactsRelationships(versionId, 'Data', impactsData, transaction);
            await this._createImpactsRelationships(versionId, 'Service', impactsServices, transaction);
            await this._createImpactsRelationships(versionId, 'RegulatoryAspect', impactsRegulatoryAspects, transaction);

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships: ${error.message}`, error);
        }
    }

    /**
     * Create IMPACTS relationships to a specific entity type
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {string} targetLabel - Target entity label
     * @param {Array<number>} targetIds - Target entity IDs
     * @param {Transaction} transaction - Transaction instance
     */
    async _createImpactsRelationships(versionId, targetLabel, targetIds, transaction) {
        if (targetIds.length === 0) return;

        try {
            // Validate all target entities exist
            const targetCheck = await transaction.run(`
                MATCH (target:${targetLabel})
                WHERE id(target) IN $targetIds
                RETURN count(target) as foundCount
            `, { targetIds });

            const foundCount = targetCheck.records[0].get('foundCount').toNumber();
            if (foundCount !== targetIds.length) {
                throw new StoreError(`One or more ${targetLabel} entities do not exist`);
            }

            // Create IMPACTS relationships
            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $targetIds as targetId
                MATCH (target:${targetLabel})
                WHERE id(target) = targetId
                CREATE (version)-[:IMPACTS]->(target)
            `, { versionId, targetIds });

        } catch (error) {
            throw new StoreError(`Failed to create IMPACTS relationships to ${targetLabel}: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that are parents of the given requirement (inverse REFINES)
     * @param {number} itemId - Child requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Parent requirements
     */
    async findChildren(itemId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (parent:OperationalRequirement)<-[:REFINES]-(childVersion:OperationalRequirementVersion)
                MATCH (childVersion)-[:VERSION_OF]->(child:OperationalRequirement)
                MATCH (child)-[:LATEST_VERSION]->(childVersion)
                WHERE id(parent) = $itemId
                RETURN id(child) as itemId, child.title as title
                ORDER BY child.title
            `, { itemId });

            return result.records.map(record => ({
                id: record.get('itemId').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find children requirements: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that impact a specific entity
     * @param {string} targetLabel - Target entity label ('StakeholderCategory', 'Data', 'Service', 'RegulatoryAspect')
     * @param {number} targetId - Target entity ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Requirements that impact the target
     */
    async findRequirementsThatImpact(targetLabel, targetId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (target:${targetLabel})<-[:IMPACTS]-(version:OperationalRequirementVersion)
                MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                MATCH (item)-[:LATEST_VERSION]->(version)
                WHERE id(target) = $targetId
                RETURN id(item) as itemId, item.title as title
                ORDER BY item.title
            `, { targetId });

            return result.records.map(record => ({
                id: record.get('itemId').toNumber(),
                title: record.get('title')
            }));
        } catch (error) {
            throw new StoreError(`Failed to find requirements that impact ${targetLabel}: ${error.message}`, error);
        }
    }
}