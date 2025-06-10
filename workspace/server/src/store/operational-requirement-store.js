import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalRequirement items with versioning and relationship management
 * Handles REFINES (to other OperationalRequirements) and IMPACTS (to setup items) relationships
 */
export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
    }

    /**
     * Extract relationship ID arrays from input data
     * @private
     * @param {object} data - Input data
     * @returns {object} - {relationshipIds, ...contentData}
     */
    async _extractRelationshipIdsFromInput(data) {
        const {
            refinesParents,
            impactsStakeholderCategories,
            impactsData,
            impactsServices,
            impactsRegulatoryAspects,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                refinesParents: refinesParents || [],
                impactsStakeholderCategories: impactsStakeholderCategories || [],
                impactsData: impactsData || [],
                impactsServices: impactsServices || [],
                impactsRegulatoryAspects: impactsRegulatoryAspects || []
            },
            ...contentData
        };
    }

    /**
     * Build relationship Reference objects for display from version relationships
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Relationships with Reference objects
     */
    async _buildRelationshipReferences(versionId, transaction) {
        try {
            // Get REFINES relationships (to OperationalRequirement Items)
            const refinesResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:REFINES]->(parent:OperationalRequirement)-[:LATEST_VERSION]->(parentVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(parent) as id, parent.title as title, parentVersion.type as type
                ORDER BY parent.title
            `, { versionId });

            const refinesParents = refinesResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to StakeholderCategory
            const stakeholderResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:StakeholderCategory)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsStakeholderCategories = stakeholderResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to Data
            const dataResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:Data)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsData = dataResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to Service
            const serviceResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:Service)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsServices = serviceResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to RegulatoryAspect
            const regulatoryResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:RegulatoryAspect)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsRegulatoryAspects = regulatoryResult.records.map(record => this._buildReference(record));

            return {
                refinesParents,
                impactsStakeholderCategories,
                impactsData,
                impactsServices,
                impactsRegulatoryAspects
            };
        } catch (error) {
            throw new StoreError(`Failed to build relationship references: ${error.message}`, error);
        }
    }

    /**
     * Extract relationship ID arrays from existing version for inheritance
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Current relationships as ID arrays
     */
    async _extractRelationshipIdsFromVersion(versionId, transaction) {
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
                refinesParents: record.get('refinesParents').map(id => this._normalizeId(id)),
                impactsStakeholderCategories: record.get('impactsStakeholderCategories').map(id => this._normalizeId(id)),
                impactsData: record.get('impactsData').map(id => this._normalizeId(id)),
                impactsServices: record.get('impactsServices').map(id => this._normalizeId(id)),
                impactsRegulatoryAspects: record.get('impactsRegulatoryAspects').map(id => this._normalizeId(id))
            };
        } catch (error) {
            throw new StoreError(`Failed to extract relationship IDs from version: ${error.message}`, error);
        }
    }

    /**
     * Create fresh relationships for a version from ID arrays
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {object} relationshipIds - Relationship data with ID arrays
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        try {
            const {
                refinesParents = [],
                impactsStakeholderCategories = [],
                impactsData = [],
                impactsServices = [],
                impactsRegulatoryAspects = []
            } = relationshipIds;

            // Validate that version exists and get its parent item for self-reference checks
            const versionCheck = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:VERSION_OF]->(item:OperationalRequirement)
                WHERE id(version) = $versionId
                RETURN id(item) as itemId
            `, { versionId });

            if (versionCheck.records.length === 0) {
                throw new StoreError('Version not found');
            }

            const itemId = this._normalizeId(versionCheck.records[0].get('itemId'));

            // Create REFINES relationships
            if (refinesParents.length > 0) {
                // Normalize parent IDs
                const normalizedParentIds = refinesParents.map(id => this._normalizeId(id));

                // Validate no self-references
                if (normalizedParentIds.includes(itemId)) {
                    throw new StoreError('Cannot create self-referencing REFINES relationship');
                }

                // Validate all parent items exist
                await this._validateReferences('OperationalRequirement', normalizedParentIds, transaction);

                // Create REFINES relationships
                await transaction.run(`
                    MATCH (version:${this.versionLabel})
                    WHERE id(version) = $versionId
                    
                    UNWIND $parentIds as parentId
                    MATCH (parent:OperationalRequirement)
                    WHERE id(parent) = parentId
                    CREATE (version)-[:REFINES]->(parent)
                `, { versionId, parentIds: normalizedParentIds });
            }

            // Create IMPACTS relationships (with normalization)
            await this._createImpactsRelationshipsFromIds(versionId, 'StakeholderCategory', impactsStakeholderCategories, transaction);
            await this._createImpactsRelationshipsFromIds(versionId, 'Data', impactsData, transaction);
            await this._createImpactsRelationshipsFromIds(versionId, 'Service', impactsServices, transaction);
            await this._createImpactsRelationshipsFromIds(versionId, 'RegulatoryAspect', impactsRegulatoryAspects, transaction);

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships from IDs: ${error.message}`, error);
        }
    }

    /**
     * Create IMPACTS relationships to a specific item type from ID arrays
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {string} targetLabel - Target item label
     * @param {Array<number>} targetIds - Target item IDs
     * @param {Transaction} transaction - Transaction instance
     */
    async _createImpactsRelationshipsFromIds(versionId, targetLabel, targetIds, transaction) {
        if (targetIds.length === 0) return;

        try {
            // Normalize target IDs
            const normalizedTargetIds = targetIds.map(id => this._normalizeId(id));

            // Validate all target items exist
            await this._validateReferences(targetLabel, normalizedTargetIds, transaction);

            // Create IMPACTS relationships
            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $targetIds as targetId
                MATCH (target:${targetLabel})
                WHERE id(target) = targetId
                CREATE (version)-[:IMPACTS]->(target)
            `, { versionId, targetIds: normalizedTargetIds });

        } catch (error) {
            throw new StoreError(`Failed to create IMPACTS relationships to ${targetLabel}: ${error.message}`, error);
        }
    }

    // Additional query methods

    /**
     * Find requirements that are children of the given requirement (inverse REFINES)
     * @param {number} itemId - Parent requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Child requirements with Reference structure
     */
    async findChildren(itemId, transaction) {
        try {
            const normalizedItemId = this._normalizeId(itemId);
            const result = await transaction.run(`
                MATCH (parent:OperationalRequirement)<-[:REFINES]-(childVersion:OperationalRequirementVersion)
                MATCH (childVersion)-[:VERSION_OF]->(child:OperationalRequirement)
                MATCH (child)-[:LATEST_VERSION]->(childVersion)
                WHERE id(parent) = $itemId
                RETURN id(child) as id, child.title as title, childVersion.type as type
                ORDER BY child.title
            `, { itemId: normalizedItemId });

            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find children requirements: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that impact a specific item
     * @param {string} targetLabel - Target item label ('StakeholderCategory', 'Data', 'Service', 'RegulatoryAspect')
     * @param {number} targetId - Target item ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Requirements that impact the target with Reference structure
     */
    async findRequirementsThatImpact(targetLabel, targetId, transaction) {
        try {
            const normalizedTargetId = this._normalizeId(targetId);
            const result = await transaction.run(`
                MATCH (target:${targetLabel})<-[:IMPACTS]-(version:OperationalRequirementVersion)
                MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                MATCH (item)-[:LATEST_VERSION]->(version)
                WHERE id(target) = $targetId
                RETURN id(item) as id, item.title as title, version.type as type
                ORDER BY item.title
            `, { targetId: normalizedTargetId });

            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find requirements that impact ${targetLabel}: ${error.message}`, error);
        }
    }

    /**
     * Find parent requirements for a specific requirement
     * @param {number} itemId - Child requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Parent requirements with Reference structure
     */
    async findParents(itemId, transaction) {
        try {
            const normalizedItemId = this._normalizeId(itemId);
            const result = await transaction.run(`
                MATCH (child:OperationalRequirement)-[:LATEST_VERSION]->(childVersion:OperationalRequirementVersion)
                MATCH (childVersion)-[:REFINES]->(parent:OperationalRequirement)
                MATCH (parent)-[:LATEST_VERSION]->(parentVersion:OperationalRequirementVersion)
                WHERE id(child) = $itemId
                RETURN id(parent) as id, parent.title as title, parentVersion.type as type
                ORDER BY parent.title
            `, { itemId: normalizedItemId });

            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find parent requirements: ${error.message}`, error);
        }
    }

    /**
     * Find all root requirements (no parents)
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<Array<object>>} Root requirements with Reference structure
     */
    async findRoots(transaction) {
        try {
            const result = await transaction.run(`
                MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version:OperationalRequirementVersion)
                WHERE NOT EXISTS((version)-[:REFINES]->(:OperationalRequirement))
                RETURN id(item) as id, item.title as title, version.type as type
                ORDER BY item.title
            `);

            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find root requirements: ${error.message}`, error);
        }
    }
}