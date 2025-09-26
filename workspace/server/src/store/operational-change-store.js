import { VersionedItemStore } from './versioned-item-store.js';
import { OperationalChangeMilestoneStore } from './operational-change-milestone-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalChange items with versioning and relationship management
 * Handles SATISFIES/SUPERSEDS relationships to OperationalRequirements
 * Delegates milestone operations to OperationalChangeMilestoneStore
 * Supports baseline, wave filtering, and content filtering for multi-context operations
 */
export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
        this.milestoneStore = new OperationalChangeMilestoneStore(driver);
    }

    /**
     * Build optimized query for findAll with multi-context and content filtering support
     * Wave filtering is handled separately at application level for better maintainability
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering (ignored, handled at app level)
     * @param {object} filters - Content filtering parameters
     * @returns {object} Query object with cypher and params
     */
    buildFindAllQuery(baselineId, fromWaveId, filters) {
        try {
            let cypher, params = {};
            let whereConditions = [];

            // Base query structure
            if (baselineId === null) {
                // Latest versions query
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                `;
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                cypher = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                `;
                params.baselineId = numericBaselineId;
            }

            // Content filtering conditions
            if (filters && Object.keys(filters).length > 0) {
                // Visibility filtering
                if (filters.visibility) {
                    whereConditions.push('version.visibility = $visibility');
                    params.visibility = filters.visibility;
                }

                // DRG filtering support in buildFindAllQuery
                if (filters.drg) {
                    whereConditions.push('version.drg = $drg');
                    params.drg = filters.drg;
                }

                // Title pattern filtering
                if (filters.title) {
                    whereConditions.push('item.title CONTAINS $title');
                    params.title = filters.title;
                }

                // Full-text search across content fields
                if (filters.text) {
                    whereConditions.push(`(
                        item.title CONTAINS $text OR 
                        version.purpose CONTAINS $text OR 
                        version.initialState CONTAINS $text OR 
                        version.finalState CONTAINS $text OR 
                        version.details CONTAINS $text
                    )`);
                    params.text = filters.text;
                }

                // Impact-based filtering (via SATISFIES/SUPERSEDES requirements)
                if (filters.stakeholderCategory && Array.isArray(filters.stakeholderCategory) && filters.stakeholderCategory.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:SATISFIES|SUPERSEDS]->(req:OperationalRequirement)
                        MATCH (req)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                        MATCH (reqVersion)-[:IMPACTS]->(sc:StakeholderCategory)
                        WHERE id(sc) IN $stakeholderCategory
                    }`);
                    params.stakeholderCategory = filters.stakeholderCategory.map(id => this.normalizeId(id));
                }

                if (filters.dataCategory && Array.isArray(filters.dataCategory) && filters.dataCategory.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:SATISFIES|SUPERSEDS]->(req:OperationalRequirement)
                        MATCH (req)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                        MATCH (reqVersion)-[:IMPACTS]->(dc:DataCategory)
                        WHERE id(dc) IN $dataCategory
                    }`);
                    params.dataCategory = filters.dataCategory.map(id => this.normalizeId(id));
                }

                if (filters.service && Array.isArray(filters.service) && filters.service.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:SATISFIES|SUPERSEDS]->(req:OperationalRequirement)
                        MATCH (req)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                        MATCH (reqVersion)-[:IMPACTS]->(s:Service)
                        WHERE id(s) IN $service
                    }`);
                    params.service = filters.service.map(id => this.normalizeId(id));
                }

                if (filters.regulatoryAspect && Array.isArray(filters.regulatoryAspect) && filters.regulatoryAspect.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:SATISFIES|SUPERSEDS]->(req:OperationalRequirement)
                        MATCH (req)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                        MATCH (reqVersion)-[:IMPACTS]->(ra:RegulatoryAspect)
                        WHERE id(ra) IN $regulatoryAspect
                    }`);
                    params.regulatoryAspect = filters.regulatoryAspect.map(id => this.normalizeId(id));
                }
            }

            // Combine WHERE conditions
            if (whereConditions.length > 0) {
                const additionalWhereClause = whereConditions.join(' AND ');
                if (baselineId !== null) {
                    cypher += ` AND ${additionalWhereClause}`;
                } else {
                    cypher += ` WHERE ${additionalWhereClause}`;
                }
            }

            // Complete query with return clause
            cypher += `
                RETURN id(item) as itemId, item.title as title,
                        id(version) as versionId, version.version as version,
                        version.createdAt as createdAt, version.createdBy as createdBy,
                        version { .*, purpose, initialState, finalState, details, drg } as versionData
                ORDER BY item.title
            `;

            return { cypher, params };
        } catch (error) {
            throw new StoreError(`Failed to build find all query: ${error.message}`, error);
        }
    }

    /**
     * Check if OperationalChange passes wave filter (has milestones at/after fromWave)
     * @param {number} itemId - OperationalChange Item ID
     * @param {number} fromWaveId - Wave ID for filtering
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @returns {Promise<boolean>} True if change has milestones at/after fromWave
     */
    async _checkWaveFilter(itemId, fromWaveId, transaction, baselineId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            const normalizedFromWaveId = this.normalizeId(fromWaveId);
            let query, params;

            if (baselineId === null) {
                // Latest version - check if change has milestones at/after fromWave
                query = `
                    MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                    MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
                    WHERE id(change) = $itemId
                    
                    RETURN EXISTS {
                        MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                        WHERE date(targetWave.date) >= date(fromWave.date)
                    } as passesFilter
                `;
                params = { itemId: normalizedItemId, fromWaveId: normalizedFromWaveId };
            } else {
                // Baseline version - check milestones in baseline context
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(change) = $itemId
                    
                    RETURN EXISTS {
                        MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                        WHERE date(targetWave.date) >= date(fromWave.date)
                    } as passesFilter
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId, fromWaveId: normalizedFromWaveId };
            }

            const result = await transaction.run(query, params);

            if (result.records.length === 0) {
                return false;
            }

            return result.records[0].get('passesFilter');
        } catch (error) {
            throw new StoreError(`Failed to check wave filter: ${error.message}`, error);
        }
    }

    /**
     * Extract relationship ID arrays and milestone data from input data
     * @private
     * @param {object} data - Input data
     * @returns {object} - {relationshipIds, ...contentData}
     */
    async _extractRelationshipIdsFromInput(data) {
        const {
            satisfiesRequirements,
            supersedsRequirements,
            milestones,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                satisfiesRequirements: satisfiesRequirements || [],
                supersedsRequirements: supersedsRequirements || [],
                milestones: milestones || []  // Milestone data (not IDs)
            },
            ...contentData
        };
    }

    /**
     * Build relationship Reference objects and milestone objects for display
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Relationships and milestones with Reference objects
     */
    async _buildRelationshipReferences(versionId, transaction) {
        try {
            // Get SATISFIES relationships (to OperationalRequirement Items)
            const satisfiesResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:SATISFIES]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(req) as id, req.title as title, reqVersion.type as type
                ORDER BY req.title
            `, { versionId });

            const satisfiesRequirements = satisfiesResult.records.map(record => this._buildReference(record));

            // Get SUPERSEDS relationships (to OperationalRequirement Items)
            const supersedsResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:SUPERSEDS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(req) as id, req.title as title, reqVersion.type as type
                ORDER BY req.title
            `, { versionId });

            const supersedsRequirements = supersedsResult.records.map(record => this._buildReference(record));

            // Delegate milestone building to milestoneStore
            const milestones = await this.milestoneStore.getMilestonesWithReferences(versionId, transaction);

            return {
                satisfiesRequirements,
                supersedsRequirements,
                milestones
            };
        } catch (error) {
            throw new StoreError(`Failed to build relationship references: ${error.message}`, error);
        }
    }

    /**
     * Extract relationship ID arrays and milestone data from existing version for inheritance
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} Current relationships and milestone data as arrays
     */
    async _extractRelationshipIdsFromVersion(versionId, transaction) {
        try {
            // Get relationships as ID arrays
            const relationshipsResult = await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                // Get SATISFIES relationships
                OPTIONAL MATCH (version)-[:SATISFIES]->(satisfiedReq:OperationalRequirement)
                WITH version, collect(id(satisfiedReq)) as satisfiesRequirements
                
                // Get SUPERSEDS relationships
                OPTIONAL MATCH (version)-[:SUPERSEDS]->(supersededReq:OperationalRequirement)
                
                RETURN satisfiesRequirements, collect(id(supersededReq)) as supersedsRequirements
            `, { versionId });

            let relationships = {
                satisfiesRequirements: [],
                supersedsRequirements: []
            };

            if (relationshipsResult.records.length > 0) {
                const record = relationshipsResult.records[0];
                relationships = {
                    satisfiesRequirements: record.get('satisfiesRequirements').map(id => this.normalizeId(id)),
                    supersedsRequirements: record.get('supersedsRequirements').map(id => this.normalizeId(id))
                };
            }

            // Delegate milestone data extraction to milestoneStore
            const milestones = await this.milestoneStore.getMilestoneDataFromVersion(versionId, transaction);

            return {
                ...relationships,
                milestones
            };
        } catch (error) {
            throw new StoreError(`Failed to extract relationship IDs from version: ${error.message}`, error);
        }
    }

    /**
     * Create fresh relationships and milestones for a version from ID arrays and milestone data
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {object} relationshipIds - Relationship and milestone data
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        try {
            const {
                satisfiesRequirements = [],
                supersedsRequirements = [],
                milestones = []
            } = relationshipIds;

            // Create requirement relationships
            await this._createRequirementRelationshipsFromIds(versionId, satisfiesRequirements, supersedsRequirements, transaction);

            // Delegate milestone creation to milestoneStore
            await this.milestoneStore.createFreshMilestones(versionId, milestones, transaction);

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships from IDs: ${error.message}`, error);
        }
    }

    /**
     * Create requirement relationships for a version from ID arrays
     * @private
     * @param {number} versionId - ItemVersion node ID
     * @param {Array<number>} satisfiesRequirements - Requirement Item IDs
     * @param {Array<number>} supersedsRequirements - Requirement Item IDs
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRequirementRelationshipsFromIds(versionId, satisfiesRequirements, supersedsRequirements, transaction) {
        // Create SATISFIES relationships
        if (satisfiesRequirements.length > 0) {
            // Normalize requirement IDs
            const normalizedSatisfiesIds = satisfiesRequirements.map(id => this.normalizeId(id));

            await this._validateReferences('OperationalRequirement', normalizedSatisfiesIds, transaction);

            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $reqIds as reqId
                MATCH (req:OperationalRequirement)
                WHERE id(req) = reqId
                CREATE (version)-[:SATISFIES]->(req)
            `, { versionId, reqIds: normalizedSatisfiesIds });
        }

        // Create SUPERSEDS relationships
        if (supersedsRequirements.length > 0) {
            // Normalize requirement IDs
            const normalizedSupersedsIds = supersedsRequirements.map(id => this.normalizeId(id));

            await this._validateReferences('OperationalRequirement', normalizedSupersedsIds, transaction);

            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $reqIds as reqId
                MATCH (req:OperationalRequirement)
                WHERE id(req) = reqId
                CREATE (version)-[:SUPERSEDS]->(req)
            `, { versionId, reqIds: normalizedSupersedsIds });
        }
    }

    // Additional query methods with baseline and wave filtering support

    /**
     * Find changes that satisfy a specific requirement (inverse SATISFIES)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Changes that satisfy the requirement with Reference structure
     */
    async findChangesThatSatisfyRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedRequirementId = this.normalizeId(requirementItemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (req:OperationalRequirement)<-[:SATISFIES]-(changeVersion:OperationalChangeVersion)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                    WHERE id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { requirementItemId: normalizedRequirementId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:SATISFIES]->(req:OperationalRequirement)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { baselineId: numericBaselineId, requirementItemId: normalizedRequirementId };
            }

            const result = await transaction.run(query, params);
            const changes = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredChanges = [];
                for (const change of changes) {
                    const passesFilter = await this._checkWaveFilter(change.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredChanges.push(change);
                    }
                }
                return filteredChanges;
            }

            return changes;
        } catch (error) {
            throw new StoreError(`Failed to find changes that satisfy requirement: ${error.message}`, error);
        }
    }

    /**
     * Find changes that supersede a specific requirement (inverse SUPERSEDS)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Changes that supersede the requirement with Reference structure
     */
    async findChangesThatSupersedeRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedRequirementId = this.normalizeId(requirementItemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (req:OperationalRequirement)<-[:SUPERSEDS]-(changeVersion:OperationalChangeVersion)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                    WHERE id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { requirementItemId: normalizedRequirementId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:SUPERSEDS]->(req:OperationalRequirement)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { baselineId: numericBaselineId, requirementItemId: normalizedRequirementId };
            }

            const result = await transaction.run(query, params);
            const changes = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredChanges = [];
                for (const change of changes) {
                    const passesFilter = await this._checkWaveFilter(change.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredChanges.push(change);
                    }
                }
                return filteredChanges;
            }

            return changes;
        } catch (error) {
            throw new StoreError(`Failed to find changes that supersede requirement: ${error.message}`, error);
        }
    }

    // Delegate milestone query methods to milestoneStore

    /**
     * Find milestones by wave - delegates to milestoneStore
     */
    async findMilestonesByWave(waveId, transaction, baselineId = null, fromWaveId = null) {
        return await this.milestoneStore.findMilestonesByWave(waveId, transaction, baselineId, fromWaveId);
    }

    /**
     * Find milestones by change - delegates to milestoneStore
     */
    async findMilestonesByChange(itemId, transaction, baselineId = null, fromWaveId = null) {
        return await this.milestoneStore.findMilestonesByChange(itemId, transaction, baselineId, fromWaveId);
    }

    /**
     * Find milestone by key - delegates to milestoneStore
     */
    async findMilestoneByKey(itemId, milestoneKey, transaction, baselineId = null, fromWaveId = null) {
        return await this.milestoneStore.findMilestoneByKey(itemId, milestoneKey, transaction, baselineId, fromWaveId);
    }
}