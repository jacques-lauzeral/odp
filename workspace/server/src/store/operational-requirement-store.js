import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalRequirement items with versioning and relationship management
 * Handles REFINES (to other OperationalRequirements) and IMPACTS (to setup items) relationships
 * Supports baseline, wave filtering, and content filtering for multi-context operations
 */
export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
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
                // Type filtering
                if (filters.type) {
                    whereConditions.push('version.type = $type');
                    params.type = filters.type;
                }

                // DrG  filtering
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
                        version.statement CONTAINS $text OR 
                        version.rationale CONTAINS $text OR 
                        version.flows CONTAINS $text OR 
                        version.flowExamples CONTAINS $text OR 
                        version.references CONTAINS $text OR 
                        version.risksAndOpportunities CONTAINS $text
                    )`);
                    params.text = filters.text;
                }

                // Category-based filtering (relationship-based)
                if (filters.dataCategory && Array.isArray(filters.dataCategory) && filters.dataCategory.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPACTS]->(dc:DataCategory) 
                        WHERE id(dc) IN $dataCategory
                    }`);
                    params.dataCategory = filters.dataCategory.map(id => this.normalizeId(id));
                }

                if (filters.stakeholderCategory && Array.isArray(filters.stakeholderCategory) && filters.stakeholderCategory.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPACTS]->(sc:StakeholderCategory) 
                        WHERE id(sc) IN $stakeholderCategory
                    }`);
                    params.stakeholderCategory = filters.stakeholderCategory.map(id => this.normalizeId(id));
                }

                if (filters.service && Array.isArray(filters.service) && filters.service.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPACTS]->(s:Service) 
                        WHERE id(s) IN $service
                    }`);
                    params.service = filters.service.map(id => this.normalizeId(id));
                }

                if (filters.regulatoryAspect && Array.isArray(filters.regulatoryAspect) && filters.regulatoryAspect.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPACTS]->(ra:RegulatoryAspect) 
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
                       version { .* } as versionData
                ORDER BY item.title
            `;

            return { cypher, params };
        } catch (error) {
            throw new StoreError(`Failed to build find all query: ${error.message}`, error);
        }
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
            implementedONs,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                refinesParents: refinesParents || [],
                impactsStakeholderCategories: impactsStakeholderCategories || [],
                impactsData: impactsData || [],
                impactsServices: impactsServices || [],
                impactsRegulatoryAspects: impactsRegulatoryAspects || [],
                implementedONs: implementedONs || []
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

            // Get IMPACTS relationships to StakeholderCategories
            const stakeholderResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:StakeholderCategory)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsStakeholderCategories = stakeholderResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to Data
            const dataResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:DataCategory)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsData = dataResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to Services
            const serviceResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:Service)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsServices = serviceResult.records.map(record => this._buildReference(record));

            // Get IMPACTS relationships to RegulatoryAspects
            const regulatoryResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPACTS]->(target:RegulatoryAspect)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title
                ORDER BY target.name
            `, { versionId });

            const impactsRegulatoryAspects = regulatoryResult.records.map(record => this._buildReference(record));

            // Get implementedONs relationships (to OperationalRequirement Items with type ON)
            const implementedONsResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:IMPLEMENTS]->(target:OperationalRequirement)-[:LATEST_VERSION]->(targetVersion:OperationalRequirementVersion)
            WHERE id(version) = $versionId AND targetVersion.type = 'ON'
            RETURN id(target) as id, target.title as title, targetVersion.type as type
            ORDER BY target.title
        `, { versionId });

            const implementedONs = implementedONsResult.records.map(record => this._buildReference(record));


            return {
                refinesParents,
                impactsStakeholderCategories,
                impactsData,
                impactsServices,
                impactsRegulatoryAspects,
                implementedONs
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

                // Get implementedONs relationships
                OPTIONAL MATCH (version)-[:IMPLEMENTS]->(ion:OperationalRequirement)
                
                RETURN refinesParents, impactsStakeholderCategories, impactsData, impactsServices, collect(id(ra)) as impactsRegulatoryAspects, collect(id(ion)) as implementedONs
            `, { versionId });

            if (result.records.length === 0) {
                // Version doesn't exist - return empty relationships
                return {
                    refinesParents: [],
                    impactsStakeholderCategories: [],
                    impactsData: [],
                    impactsServices: [],
                    impactsRegulatoryAspects: [],
                    implementedONs: []
                };
            }

            const record = result.records[0];
            return {
                refinesParents: record.get('refinesParents').map(id => this.normalizeId(id)),
                impactsStakeholderCategories: record.get('impactsStakeholderCategories').map(id => this.normalizeId(id)),
                impactsData: record.get('impactsData').map(id => this.normalizeId(id)),
                impactsServices: record.get('impactsServices').map(id => this.normalizeId(id)),
                impactsRegulatoryAspects: record.get('impactsRegulatoryAspects').map(id => this.normalizeId(id)),
                implementedONs: record.get('implementedONs').map(id => this.normalizeId(id))
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
                impactsRegulatoryAspects = [],
                implementedONs = []
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

            const itemId = this.normalizeId(versionCheck.records[0].get('itemId'));

            // Create REFINES relationships
            if (refinesParents.length > 0) {
                // Normalize parent IDs
                const normalizedParentIds = refinesParents.map(id => this.normalizeId(id));

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
            await this._createImpactsRelationshipsFromIds(versionId, 'DataCategory', impactsData, transaction);
            await this._createImpactsRelationshipsFromIds(versionId, 'Service', impactsServices, transaction);
            await this._createImpactsRelationshipsFromIds(versionId, 'RegulatoryAspect', impactsRegulatoryAspects, transaction);

            if (implementedONs.length > 0) {
                const normalizedONIds = implementedONs.map(id => this.normalizeId(id));

                // Validate all ON items exist (type validation will be done at service layer)
                await this._validateReferences('OperationalRequirement', normalizedONIds, transaction);

                // Create IMPLEMENTS relationships
                await transaction.run(`
                    MATCH (version:${this.versionLabel})
                    WHERE id(version) = $versionId
                
                    UNWIND $onIds as onId
                    MATCH (on:OperationalRequirement)
                    WHERE id(on) = onId
                    CREATE (version)-[:IMPLEMENTS]->(on)
                `, { versionId, onIds: normalizedONIds });
            }

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
            const normalizedTargetIds = targetIds.map(id => this.normalizeId(id));

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

    /**
     * Check if OperationalRequirement passes wave filter (referenced by filtered OCs + REFINES cascade)
     * @private
     * @param {number} itemId - OperationalRequirement Item ID
     * @param {number} fromWaveId - Waves ID for filtering
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @returns {Promise<boolean>} True if requirement is referenced by filtered OCs or ancestors are
     */
    async _checkWaveFilter(itemId, fromWaveId, transaction, baselineId = null) {
        try {
            // Step 1: Find OperationalChanges that pass wave filter
            let filteredOCQuery, ocParams;

            if (baselineId === null) {
                // Latest versions - find OCs with milestones at/after fromWave
                filteredOCQuery = `
                    MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                    MATCH (change:OperationalChange)-[:LATEST_VERSION]->(changeVersion:OperationalChangeVersion)
                    WHERE EXISTS {
                        MATCH (changeVersion)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                        WHERE date(targetWave.date) >= date(fromWave.date)
                    }
                    RETURN collect(id(change)) as filteredChangeIds
                `;
                ocParams = { fromWaveId: this.normalizeId(fromWaveId) };
            } else {
                // Baseline versions - find OCs in baseline with milestones at/after fromWave
                const numericBaselineId = this.normalizeId(baselineId);
                filteredOCQuery = `
                    MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId
                    AND EXISTS {
                        MATCH (changeVersion)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                        WHERE date(targetWave.date) >= date(fromWave.date)
                    }
                    RETURN collect(id(change)) as filteredChangeIds
                `;
                ocParams = { fromWaveId: this.normalizeId(fromWaveId), baselineId: numericBaselineId };
            }

            const ocResult = await transaction.run(filteredOCQuery, ocParams);
            const filteredChangeIds = ocResult.records[0]?.get('filteredChangeIds') || [];

            if (filteredChangeIds.length === 0) {
                return false; // No filtered OCs, so no requirements pass
            }

            // Step 2: Check if this requirement (or any ancestor via REFINES) is referenced by filtered OCs
            const normalizedItemId = this.normalizeId(itemId);
            const normalizedChangeIds = filteredChangeIds.map(id => this.normalizeId(id));

            let reqFilterQuery, reqParams;

            if (baselineId === null) {
                // Latest versions - check if requirement or ancestors are referenced
                reqFilterQuery = `
                    MATCH (req:OperationalRequirement) WHERE id(req) = $itemId
                    
                    // Get all ancestors via REFINES (including self)
                    MATCH path = (req)<-[:REFINES*0..]-(descendant:OperationalRequirement)
                    WITH collect(DISTINCT descendant) as allDescendants
                    
                    // Check if any descendant is referenced by filtered OCs
                    UNWIND allDescendants as descendant
                    MATCH (descendant)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                    MATCH (changeVersion:OperationalChangeVersion)-[:SATISFIES|SUPERSEDS]->(descendant)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(change) IN $filteredChangeIds
                    RETURN count(*) > 0 as isReferenced
                `;
                reqParams = { itemId: normalizedItemId, filteredChangeIds: normalizedChangeIds };
            } else {
                // Baseline versions - check with baseline context
                const numericBaselineId = this.normalizeId(baselineId);
                reqFilterQuery = `
                    MATCH (req:OperationalRequirement) WHERE id(req) = $itemId
                    
                    // Get all ancestors via REFINES (including self) in baseline context
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(reqVersion:OperationalRequirementVersion)-[:VERSION_OF]->(descendant:OperationalRequirement)
                    WHERE id(baseline) = $baselineId
                    MATCH path = (req)<-[:REFINES*0..]-(descendant)
                    WITH collect(DISTINCT descendant) as allDescendants
                    
                    // Check if any descendant is referenced by filtered OCs in baseline
                    UNWIND allDescendants as descendant
                    MATCH (baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:SATISFIES|SUPERSEDS]->(descendant)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(change) IN $filteredChangeIds
                    RETURN count(*) > 0 as isReferenced
                `;
                reqParams = { itemId: normalizedItemId, filteredChangeIds: normalizedChangeIds, baselineId: numericBaselineId };
            }

            const reqResult = await transaction.run(reqFilterQuery, reqParams);
            return reqResult.records[0]?.get('isReferenced') || false;

        } catch (error) {
            throw new StoreError(`Failed to check wave filter for requirement: ${error.message}`, error);
        }
    }

    /**
     * Find OperationalRequirement by ID with multi-context support
     * @param {number} itemId - OperationalRequirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<object|null>} OperationalRequirement with relationships or null
     */
    async findById(itemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            // Step 1: Get base result (current or baseline)
            const baseResult = await super.findById(itemId, transaction, baselineId);
            if (!baseResult) {
                return null;
            }

            // Step 2: Apply wave filtering if specified
            if (fromWaveId !== null) {
                const passesFilter = await this._checkWaveFilter(baseResult.itemId, fromWaveId, transaction, baselineId);
                return passesFilter ? baseResult : null;
            }

            return baseResult;
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID with multi-context: ${error.message}`, error);
        }
    }

    // Additional query methods with baseline and wave filtering support
    // (Previous methods like findChildren, findRequirementsThatImpact, etc. remain unchanged)

    /**
     * Find requirements that are children of the given requirement (inverse REFINES)
     * @param {number} itemId - Parent requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Child requirements with Reference structure
     */
    async findChildren(itemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (parent:OperationalRequirement)<-[:REFINES]-(childVersion:OperationalRequirementVersion)
                    MATCH (childVersion)-[:VERSION_OF]->(child:OperationalRequirement)
                    MATCH (child)-[:LATEST_VERSION]->(childVersion)
                    WHERE id(parent) = $itemId
                    RETURN id(child) as id, child.title as title, childVersion.type as type
                    ORDER BY child.title
                `;
                params = { itemId: normalizedItemId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(childVersion:OperationalRequirementVersion)-[:REFINES]->(parent:OperationalRequirement)
                    MATCH (childVersion)-[:VERSION_OF]->(child:OperationalRequirement)
                    WHERE id(baseline) = $baselineId AND id(parent) = $itemId
                    RETURN id(child) as id, child.title as title, childVersion.type as type
                    ORDER BY child.title
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId };
            }

            const result = await transaction.run(query, params);
            const children = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredChildren = [];
                for (const child of children) {
                    const passesFilter = await this._checkWaveFilter(child.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredChildren.push(child);
                    }
                }
                return filteredChildren;
            }

            return children;
        } catch (error) {
            throw new StoreError(`Failed to find children requirements: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that impact a specific item
     * @param {string} targetLabel - Target item label ('StakeholderCategories', 'Data', 'Services', 'RegulatoryAspects')
     * @param {number} targetId - Target item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Requirements that impact the target with Reference structure
     */
    async findRequirementsThatImpact(targetLabel, targetId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedTargetId = this.normalizeId(targetId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (target:${targetLabel})<-[:IMPACTS]-(version:OperationalRequirementVersion)
                    MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                    MATCH (item)-[:LATEST_VERSION]->(version)
                    WHERE id(target) = $targetId
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
                params = { targetId: normalizedTargetId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:IMPACTS]->(target:${targetLabel})
                    MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                    WHERE id(baseline) = $baselineId AND id(target) = $targetId
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
                params = { baselineId: numericBaselineId, targetId: normalizedTargetId };
            }

            const result = await transaction.run(query, params);
            const requirements = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredRequirements = [];
                for (const requirement of requirements) {
                    const passesFilter = await this._checkWaveFilter(requirement.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredRequirements.push(requirement);
                    }
                }
                return filteredRequirements;
            }

            return requirements;
        } catch (error) {
            throw new StoreError(`Failed to find requirements that impact ${targetLabel}: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that implement a specific ON-type requirement
     * @param {number} onItemId - ON-type requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Requirements that implement the ON with Reference structure
     */
    async findRequirementsThatImplement(onItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedOnId = this.normalizeId(onItemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                MATCH (on:OperationalRequirement)<-[:IMPLEMENTS]-(version:OperationalRequirementVersion)
                MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                MATCH (item)-[:LATEST_VERSION]->(version)
                WHERE id(on) = $onItemId
                RETURN id(item) as id, item.title as title, version.type as type
                ORDER BY item.title
            `;
                params = { onItemId: normalizedOnId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:IMPLEMENTS]->(on:OperationalRequirement)
                MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                WHERE id(baseline) = $baselineId AND id(on) = $onItemId
                RETURN id(item) as id, item.title as title, version.type as type
                ORDER BY item.title
            `;
                params = { baselineId: numericBaselineId, onItemId: normalizedOnId };
            }

            const result = await transaction.run(query, params);
            const requirements = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredRequirements = [];
                for (const requirement of requirements) {
                    const passesFilter = await this._checkWaveFilter(requirement.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredRequirements.push(requirement);
                    }
                }
                return filteredRequirements;
            }

            return requirements;
        } catch (error) {
            throw new StoreError(`Failed to find requirements that implement ON: ${error.message}`, error);
        }
    }

    /**
     * Find parent requirements for a specific requirement
     * @param {number} itemId - Child requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Parent requirements with Reference structure
     */
    async findParents(itemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (child:OperationalRequirement)-[:LATEST_VERSION]->(childVersion:OperationalRequirementVersion)
                    MATCH (childVersion)-[:REFINES]->(parent:OperationalRequirement)
                    MATCH (parent)-[:LATEST_VERSION]->(parentVersion:OperationalRequirementVersion)
                    WHERE id(child) = $itemId
                    RETURN id(parent) as id, parent.title as title, parentVersion.type as type
                    ORDER BY parent.title
                `;
                params = { itemId: normalizedItemId };
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(childVersion:OperationalRequirementVersion)-[:VERSION_OF]->(child:OperationalRequirement)
                    MATCH (childVersion)-[:REFINES]->(parent:OperationalRequirement)
                    OPTIONAL MATCH (baseline)-[:HAS_ITEMS]->(parentVersion:OperationalRequirementVersion)-[:VERSION_OF]->(parent)
                    WHERE id(baseline) = $baselineId AND id(child) = $itemId
                    RETURN id(parent) as id, parent.title as title, 
                           CASE WHEN parentVersion IS NOT NULL THEN parentVersion.type ELSE 'N/A' END as type
                    ORDER BY parent.title
                `;
                params = { baselineId: numericBaselineId, itemId: normalizedItemId };
            }

            const result = await transaction.run(query, params);
            const parents = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredParents = [];
                for (const parent of parents) {
                    const passesFilter = await this._checkWaveFilter(parent.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredParents.push(parent);
                    }
                }
                return filteredParents;
            }

            return parents;
        } catch (error) {
            throw new StoreError(`Failed to find parent requirements: ${error.message}`, error);
        }
    }

    /**
     * Find all root requirements (no parents)
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Root requirements with Reference structure
     */
    async findRoots(transaction, baselineId = null, fromWaveId = null) {
        try {
            let query, params = {};

            if (baselineId === null) {
                // Latest versions query
                query = `
                    MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version:OperationalRequirementVersion)
                    WHERE NOT EXISTS((version)-[:REFINES]->(:OperationalRequirement))
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
            } else {
                // Baseline versions query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:VERSION_OF]->(item:OperationalRequirement)
                    WHERE id(baseline) = $baselineId AND NOT EXISTS((version)-[:REFINES]->(:OperationalRequirement))
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
                params = { baselineId: numericBaselineId };
            }

            const result = await transaction.run(query, params);
            const roots = result.records.map(record => this._buildReference(record));

            // Apply wave filtering if specified
            if (fromWaveId !== null) {
                const filteredRoots = [];
                for (const root of roots) {
                    const passesFilter = await this._checkWaveFilter(root.id, fromWaveId, transaction, baselineId);
                    if (passesFilter) {
                        filteredRoots.push(root);
                    }
                }
                return filteredRoots;
            }

            return roots;
        } catch (error) {
            throw new StoreError(`Failed to find root requirements: ${error.message}`, error);
        }
    }
}