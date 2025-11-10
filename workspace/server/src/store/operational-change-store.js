import { VersionedItemStore } from './versioned-item-store.js';
import { OperationalChangeMilestoneStore } from './operational-change-milestone-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalChange items with versioning and relationship management
 * Handles SATISFIES/SUPERSEDS relationships to OperationalRequirements,
 * REFERENCES relationships to Documents, and DEPENDS_ON relationships to OperationalChanges
 * Delegates milestone operations to OperationalChangeMilestoneStore
 * Supports baseline, wave filtering, and content filtering for multi-context operations
 */
export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
        this.milestoneStore = new OperationalChangeMilestoneStore(driver);
    }

    /**
     * Get entity type prefix for code generation
     * OperationalChange always uses 'OC' prefix
     * @param {object} data - Entity data
     * @returns {string} Entity type prefix ('OC')
     */
    _getEntityTypeForCode(data) {
        return 'OC';
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

                // DRG filtering
                if (filters.drg) {
                    whereConditions.push('version.drg = $drg');
                    params.drg = filters.drg;
                }

                // Title pattern filtering
                if (filters.title) {
                    whereConditions.push('item.title CONTAINS $title');
                    params.title = filters.title;
                }

                // Path filtering (array contains)
                if (filters.path) {
                    whereConditions.push('$path IN version.path');
                    params.path = filters.path;
                }

                // Full-text search across content fields
                if (filters.text) {
                    whereConditions.push(`(
                        item.title CONTAINS $text OR 
                        version.purpose CONTAINS $text OR 
                        version.initialState CONTAINS $text OR 
                        version.finalState CONTAINS $text OR 
                        version.details CONTAINS $text OR 
                        version.privateNotes CONTAINS $text
                    )`);
                    params.text = filters.text;
                }

                // Document-based filtering (relationship-based)
                if (filters.document && Array.isArray(filters.document) && filters.document.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:REFERENCES]->(doc:Document) 
                        WHERE id(doc) IN $document
                    }`);
                    params.document = filters.document.map(id => this.normalizeId(id));
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
                        item.code as code,
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

    async findAll(transaction, baselineId = null, fromWaveId = null, filters = {}) {
        try {
            // Step 1: Get base results with baseline + content filtering
            const queryObj = this.buildFindAllQuery(baselineId, null, filters);
            const result = await transaction.run(queryObj.cypher, queryObj.params);

            // Step 2: Build items with relationships
            const items = [];
            for (const record of result.records) {
                const versionData = record.get('versionData');
                delete versionData.version;
                delete versionData.createdAt;
                delete versionData.createdBy;

                const baseItem = {
                    itemId: this.normalizeId(record.get('itemId')),
                    title: record.get('title'),
                    code: record.get('code'),
                    versionId: this.normalizeId(record.get('versionId')),
                    version: this.normalizeId(record.get('version')),
                    createdAt: record.get('createdAt'),
                    createdBy: record.get('createdBy'),
                    ...versionData
                };

                const relationshipReferences = await this._buildRelationshipReferences(
                    baseItem.versionId,
                    transaction
                );
                items.push({ ...baseItem, ...relationshipReferences });
            }

            // Step 3: Apply wave filtering efficiently
            if (fromWaveId !== null) {
                const acceptedChangeIds = await this._computeWaveFilteredChanges(
                    fromWaveId,
                    transaction,
                    baselineId
                );
                return items.filter(item => acceptedChangeIds.has(item.itemId));
            }

            return items;
        } catch (error) {
            throw new StoreError(`Failed to find all ${this.nodeLabel}s: ${error.message}`, error);
        }
    }

    /**
     * Compute set of change IDs that pass wave filter
     * Returns changes with milestones at/after fromWave
     */
    async _computeWaveFilteredChanges(fromWaveId, transaction, baselineId = null) {
        try {
            const normalizedFromWaveId = this.normalizeId(fromWaveId);
            let query, params;

            if (baselineId === null) {
                query = `
                MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                MATCH (change:OperationalChange)-[:LATEST_VERSION]->(version:OperationalChangeVersion)
                WHERE EXISTS {
                    MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                    WHERE (targetWave.year > fromWave.year)
                       OR (targetWave.year = fromWave.year AND 
                           COALESCE(targetWave.quarter, 0) >= COALESCE(fromWave.quarter, 0))
                }
                RETURN collect(DISTINCT id(change)) as acceptedChangeIds
            `;
                params = { fromWaveId: normalizedFromWaveId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalChangeVersion)
                    -[:VERSION_OF]->(change:OperationalChange)
                WHERE id(baseline) = $baselineId
                AND EXISTS {
                    MATCH (version)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                    WHERE (targetWave.year > fromWave.year)
                       OR (targetWave.year = fromWave.year AND 
                           COALESCE(targetWave.quarter, 0) >= COALESCE(fromWave.quarter, 0))
                }
                RETURN collect(DISTINCT id(change)) as acceptedChangeIds
            `;
                params = { fromWaveId: normalizedFromWaveId, baselineId: numericBaselineId };
            }

            const result = await transaction.run(query, params);
            const changeIds = result.records[0]?.get('acceptedChangeIds') || [];

            return new Set(changeIds.map(id => this.normalizeId(id)));
        } catch (error) {
            throw new StoreError(
                `Failed to compute wave-filtered changes: ${error.message}`,
                error
            );
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
            documentReferences,
            dependsOnChanges,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                satisfiesRequirements: satisfiesRequirements || [],
                supersedsRequirements: supersedsRequirements || [],
                milestones: milestones || [],  // Milestone data (not IDs)
                documentReferences: documentReferences || [], // Array of EntityReference {id, note?}
                dependsOnChanges: dependsOnChanges || [] // Array of item IDs
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
            RETURN id(req) as id, req.title as title, req.code as code, reqVersion.type as type
            ORDER BY req.title
        `, { versionId });

            const satisfiesRequirements = satisfiesResult.records.map(record => this._buildReference(record));

            // Get SUPERSEDS relationships (to OperationalRequirement Items)
            const supersedsResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:SUPERSEDS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
            WHERE id(version) = $versionId
            RETURN id(req) as id, req.title as title, req.code as code, reqVersion.type as type
            ORDER BY req.title
        `, { versionId });

            const supersedsRequirements = supersedsResult.records.map(record => this._buildReference(record));

            // Get REFERENCES relationships to Documents (with note)
            const referencesResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[ref:REFERENCES]->(doc:Document)
            WHERE id(version) = $versionId
            RETURN id(doc) as id, doc.name as title, ref.note as note
            ORDER BY doc.name
        `, { versionId });

            const documentReferences = referencesResult.records.map(record => ({
                id: this.normalizeId(record.get('id')),
                title: record.get('title'),
                note: record.get('note') || ''
            }));

            // Get DEPENDS_ON relationships (Version -> Item, resolve to current context version)
            const dependsOnResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:DEPENDS_ON]->(changeItem:OperationalChange)-[:LATEST_VERSION]->(changeVersion:OperationalChangeVersion)
            WHERE id(version) = $versionId
            RETURN id(changeItem) as itemId, changeItem.title as title, changeItem.code as code, id(changeVersion) as versionId, changeVersion.version as version
            ORDER BY changeItem.title
        `, { versionId });

            const dependsOnChanges = dependsOnResult.records.map(record => ({
                itemId: this.normalizeId(record.get('itemId')),
                title: record.get('title'),
                code: record.get('code'),
                versionId: this.normalizeId(record.get('versionId')),
                version: this.normalizeId(record.get('version'))
            }));

            // Delegate milestone building to milestoneStore
            const milestones = await this.milestoneStore.getMilestonesWithReferences(versionId, transaction);

            return {
                satisfiesRequirements,
                supersedsRequirements,
                documentReferences,
                dependsOnChanges,
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
            WITH version, satisfiesRequirements, collect(id(supersededReq)) as supersedsRequirements
            
            // Get REFERENCES relationships with note property
            OPTIONAL MATCH (version)-[ref:REFERENCES]->(doc:Document)
            WITH version, satisfiesRequirements, supersedsRequirements,
                 collect({id: id(doc), note: ref.note}) as documentReferences
            
            // Get DEPENDS_ON relationships (Version -> Item)
            OPTIONAL MATCH (version)-[:DEPENDS_ON]->(depChange:OperationalChange)
            
            RETURN satisfiesRequirements, supersedsRequirements, documentReferences, collect(id(depChange)) as dependsOnChanges
        `, { versionId });

            let relationships = {
                satisfiesRequirements: [],
                supersedsRequirements: [],
                documentReferences: [],
                dependsOnChanges: []
            };

            if (relationshipsResult.records.length > 0) {
                const record = relationshipsResult.records[0];
                relationships = {
                    satisfiesRequirements: record.get('satisfiesRequirements').map(id => this.normalizeId(id)),
                    supersedsRequirements: record.get('supersedsRequirements').map(id => this.normalizeId(id)),
                    documentReferences: record.get('documentReferences').filter(ref => ref.id !== null).map(ref => ({
                        id: this.normalizeId(ref.id),
                        note: ref.note || ''
                    })),
                    dependsOnChanges: record.get('dependsOnChanges').map(id => this.normalizeId(id))
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
                milestones = [],
                documentReferences = [],
                dependsOnChanges = []
            } = relationshipIds;

            // Create requirement relationships
            await this._createRequirementRelationshipsFromIds(versionId, satisfiesRequirements, supersedsRequirements, transaction);

            // Create REFERENCES relationships with note property
            if (documentReferences.length > 0) {
                const documentIds = documentReferences.map(ref => this.normalizeId(ref.id));

                // Validate all documents exist
                await this._validateReferences('Document', documentIds, transaction);

                // Create REFERENCES relationships with notes
                for (const ref of documentReferences) {
                    await transaction.run(`
                    MATCH (version:${this.versionLabel}), (doc:Document)
                    WHERE id(version) = $versionId AND id(doc) = $documentId
                    CREATE (version)-[:REFERENCES {note: $note}]->(doc)
                `, {
                        versionId,
                        documentId: this.normalizeId(ref.id),
                        note: ref.note || ''
                    });
                }
            }

            // Create DEPENDS_ON relationships (Version -> Item)
            if (dependsOnChanges.length > 0) {
                // Get parent item for self-reference check
                const versionCheck = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:VERSION_OF]->(item:OperationalChange)
                WHERE id(version) = $versionId
                RETURN id(item) as itemId
            `, { versionId });

                if (versionCheck.records.length === 0) {
                    throw new StoreError('Version not found');
                }

                const itemId = this.normalizeId(versionCheck.records[0].get('itemId'));
                const normalizedDepIds = dependsOnChanges.map(id => this.normalizeId(id));

                // Validate no self-dependencies
                if (normalizedDepIds.includes(itemId)) {
                    throw new StoreError('Cannot create self-referencing DEPENDS_ON relationship');
                }

                // Validate all dependency items exist
                await this._validateReferences('OperationalChange', normalizedDepIds, transaction);

                // Create DEPENDS_ON relationships
                await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                
                UNWIND $depIds as depId
                MATCH (depChange:OperationalChange)
                WHERE id(depChange) = depId
                CREATE (version)-[:DEPENDS_ON]->(depChange)
            `, { versionId, depIds: normalizedDepIds });
            }

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