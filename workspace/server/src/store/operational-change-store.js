import { VersionedItemStore } from './versioned-item-store.js';
import { OperationalChangeMilestoneStore } from './operational-change-milestone-store.js';
import { StoreError } from './transaction.js';
import { getProjectionFields } from '../../../shared/src/index.js';

/**
 * Store for OperationalChange items with versioning and relationship management
 * Handles IMPLEMENTS/DECOMMISSIONS relationships to OperationalRequirements,
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
    buildFindAllQuery(baselineId, fromWaveId, filters, fields = null) {
        try {
            // If no field list provided, include everything (standard behaviour)
            const includeField = fields ? (f => fields.includes(f)) : () => true;
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
                // DRG filtering
                if (filters.drg) {
                    whereConditions.push('version.drg = $drg');
                    params.drg = filters.drg;
                }

                // Title pattern filtering
                if (filters.title) {
                    whereConditions.push(`(
                    item.title CONTAINS $title OR
                    item.code CONTAINS $title
                )`);
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

                // Relationship-based filtering
                if (filters.implementsOR !== undefined && filters.implementsOR !== null) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPLEMENTS|DECOMMISSIONS]->(req:OperationalRequirement)
                        WHERE id(req) = $implementsOR
                    }`);
                    params.implementsOR = this.normalizeId(filters.implementsOR, 'implementsOR');
                }

                // Impact-based filtering (via IMPLEMENTS/DECOMMISSIONS -> requirement -> impacted stakeholders/domains)
                if (filters.stakeholderCategory && Array.isArray(filters.stakeholderCategory) && filters.stakeholderCategory.length > 0) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPLEMENTS|DECOMMISSIONS]->(req:OperationalRequirement)
                        MATCH (req)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                        MATCH (reqVersion)-[:IMPACTS_STAKEHOLDER]->(sc:StakeholderCategory)
                        WHERE id(sc) IN $stakeholderCategory
                    }`);
                    params.stakeholderCategory = filters.stakeholderCategory.map(id => this.normalizeId(id));
                }

                if (filters.domain !== undefined && filters.domain !== null) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPLEMENTS|DECOMMISSIONS]->(req:OperationalRequirement)
                        MATCH (req)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                        MATCH (reqVersion)-[:IMPACTS_DOMAIN]->(d:Domain)
                        WHERE id(d) = $domain
                    }`);
                    params.domain = this.normalizeId(filters.domain, 'domain');
                }

                if (filters.maturity) {
                    whereConditions.push('version.maturity = $maturity');
                    params.maturity = filters.maturity;
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

            // Build RETURN clause — always include identity fields, gate the rest
            const scalarVersionFields = [
                'drg', 'maturity', 'path', 'cost', 'orCosts',
                'purpose', 'initialState', 'finalState', 'details', 'privateNotes', 'additionalDocumentation'
            ].filter(includeField);

            // Complete query with return clause
            cypher += `
                RETURN id(item) as itemId, item.title as title,
                        item.code as code,
                        id(version) as versionId, version.version as version,
                        version.createdAt as createdAt, version.createdBy as createdBy
                        ${scalarVersionFields.length > 0 ? ',' : ''}
                        ${scalarVersionFields.map(f => `version.${f} as ${f}`).join(',\n                        ')}
                ORDER BY item.title
            `;

            return { cypher, params };
        } catch (error) {
            throw new StoreError(`Failed to build find all query: ${error.message}`, error);
        }
    }

    async findAll(transaction, baselineId = null, fromWaveId = null, filters = {}, projection = 'standard') {
        try {
            if (projection === 'extended') {
                throw new StoreError("Projection 'extended' is not valid on findAll — use findById");
            }

            const fields = getProjectionFields('change', projection);
            const includeField = f => fields.includes(f);

            // Step 1: Get base results with baseline + content filtering
            const queryObj = this.buildFindAllQuery(baselineId, null, filters, fields);
            const result = await transaction.run(queryObj.cypher, queryObj.params);

            // Step 2: Build items
            const items = [];
            for (const record of result.records) {
                const item = {
                    itemId: this.normalizeId(record.get('itemId')),
                    title: record.get('title'),
                    code: record.get('code'),
                    versionId: this.normalizeId(record.get('versionId')),
                    version: this.normalizeId(record.get('version')),
                    createdAt: record.get('createdAt'),
                    createdBy: record.get('createdBy'),
                };

                // Scalar version fields — only those in projection
                const scalarVersionFields = [
                    'drg', 'maturity', 'path', 'cost', 'orCosts',
                    'purpose', 'initialState', 'finalState', 'details', 'privateNotes', 'additionalDocumentation'
                ];
                for (const f of scalarVersionFields) {
                    if (includeField(f)) {
                        item[f] = record.get(f);
                    }
                }

                // Relationship fields — fetched per-item only when in projection
                const relFields = ['implementedORs', 'decommissionedORs', 'dependencies', 'milestones'];
                const needsRelationships = relFields.some(includeField);
                if (needsRelationships) {
                    const relationshipReferences = await this._buildRelationshipReferences(
                        item.versionId,
                        transaction,
                        fields
                    );
                    Object.assign(item, relationshipReferences);
                }

                items.push(item);
            }

            // Step 3: Apply wave filtering
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
            if (error instanceof StoreError) throw error;
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
                           COALESCE(targetWave.sequenceNumber, 0) >= COALESCE(fromWave.sequenceNumber, 0))
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
                           COALESCE(targetWave.sequenceNumber, 0) >= COALESCE(fromWave.sequenceNumber, 0))
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
     * Extract relationship ID arrays from input data.
     * Milestones are managed exclusively by the dedicated milestone endpoints — they must not
     * appear in general update/patch payloads. That contract is enforced at the service layer
     * (OperationalChangeService._validateUpdatePayload). Here, on the update path
     * (currentVersionId provided), milestones from input are used as-is when present (milestone
     * mutation methods supply them explicitly), or inherited from the current version when absent
     * (general update/patch path). On the create path (currentVersionId is null), milestones are
     * taken from input.
     *
     * @param {object} data - Input data
     * @param {number|null} currentVersionId - Current version ID for milestone inheritance (null on create)
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<object>} - {relationshipIds, ...contentData}
     */
    async _extractRelationshipIdsFromInput(data, currentVersionId, transaction) {
        const {
            implementedORs,
            decommissionedORs,
            milestones,
            dependencies,
            ...contentData
        } = data;

        let resolvedMilestones;
        if (currentVersionId !== null && milestones === undefined) {
            // Update path, no milestones in payload: inherit from current version
            resolvedMilestones = await this.milestoneStore.getMilestoneDataFromVersion(currentVersionId, transaction);
        } else {
            // Create path, or milestone mutation methods supplying explicit milestones
            resolvedMilestones = milestones || [];
        }

        return {
            relationshipIds: {
                implementedORs: implementedORs || [],
                decommissionedORs: decommissionedORs || [],
                milestones: resolvedMilestones,
                dependencies: dependencies || []
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
    async _buildRelationshipReferences(versionId, transaction, fields = null) {
        try {
            const includeField = fields ? (f => fields.includes(f)) : () => true;
            const result = {};

            // IMPLEMENTS relationships (to OR-type requirements)
            if (includeField('implementedORs')) {
                const implementedORsResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:IMPLEMENTS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
            WHERE id(version) = $versionId AND reqVersion.type = 'OR'
            RETURN id(req) as id, req.title as title, req.code as code, reqVersion.type as type
            ORDER BY req.title
        `, { versionId });
                result.implementedORs = implementedORsResult.records.map(record => this._buildReference(record));
            }

            // DECOMMISSIONS relationships (to OR-type requirements)
            if (includeField('decommissionedORs')) {
                const decommissionedORsResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:DECOMMISSIONS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
            WHERE id(version) = $versionId AND reqVersion.type = 'OR'
            RETURN id(req) as id, req.title as title, req.code as code, reqVersion.type as type
            ORDER BY req.title
        `, { versionId });
                result.decommissionedORs = decommissionedORsResult.records.map(record => this._buildReference(record));
            }

            // DEPENDS_ON relationships (Version -> Item)
            if (includeField('dependencies')) {
                const dependsOnResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:DEPENDS_ON]->(changeItem:OperationalChange)-[:LATEST_VERSION]->(changeVersion:OperationalChangeVersion)
            WHERE id(version) = $versionId
            RETURN id(changeItem) as id, changeItem.title as title, changeItem.code as code
            ORDER BY changeItem.title
        `, { versionId });
                result.dependencies = dependsOnResult.records.map(record => this._buildReference(record));
            }

            // Milestones — delegate to milestoneStore
            if (includeField('milestones')) {
                result.milestones = await this.milestoneStore.getMilestonesWithReferences(versionId, transaction);
            }

            return result;
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
                implementedORs = [],
                decommissionedORs = [],
                milestones = [],
                dependencies = []
            } = relationshipIds;

            // Create requirement relationships
            await this._createRequirementRelationshipsFromIds(versionId, implementedORs, decommissionedORs, transaction);

            // Create DEPENDS_ON relationships (Version -> Item)
            if (dependencies.length > 0) {
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
                const normalizedDepIds = dependencies.map(id => this.normalizeId(id));

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
     * @param {Array<number>} implementedORs - Requirement Item IDs
     * @param {Array<number>} decommissionedORs - Requirement Item IDs
     * @param {Transaction} transaction - Transaction instance
     */
    async _createRequirementRelationshipsFromIds(versionId, implementedORs, decommissionedORs, transaction) {
        // Create IMPLEMENTS relationships
        if (implementedORs.length > 0) {
            const normalizedImplementedIds = implementedORs.map(id => this.normalizeId(id));
            await this._validateReferences('OperationalRequirement', normalizedImplementedIds, transaction);
            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                UNWIND $reqIds as reqId
                MATCH (req:OperationalRequirement)
                WHERE id(req) = reqId
                CREATE (version)-[:IMPLEMENTS]->(req)
            `, { versionId, reqIds: normalizedImplementedIds });
        }

        // Create DECOMMISSIONS relationships
        if (decommissionedORs.length > 0) {
            const normalizedDecommissionedIds = decommissionedORs.map(id => this.normalizeId(id));
            await this._validateReferences('OperationalRequirement', normalizedDecommissionedIds, transaction);
            await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                UNWIND $reqIds as reqId
                MATCH (req:OperationalRequirement)
                WHERE id(req) = reqId
                CREATE (version)-[:DECOMMISSIONS]->(req)
            `, { versionId, reqIds: normalizedDecommissionedIds });
        }
    }

    // Additional query methods with baseline and wave filtering support

    /**
     * Find OperationalChange by ID with multi-context and projection support
     * @param {number} itemId - OperationalChange Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @param {string} projection - 'standard' | 'extended' (default: 'standard')
     * @returns {Promise<object|null>} OperationalChange with relationships or null
     */
    async findById(itemId, transaction, baselineId = null, fromWaveId = null, projection = 'standard') {
        try {
            if (projection === 'summary') {
                throw new StoreError("Projection 'summary' is not valid on findById — use findAll");
            }

            // Step 1: Get standard result
            const baseResult = await super.findById(itemId, transaction, baselineId);
            if (!baseResult) {
                return null;
            }

            // Step 2: Apply wave filtering if specified
            if (fromWaveId !== null) {
                const passesFilter = await this._checkWaveFilter(baseResult.itemId, fromWaveId, transaction, baselineId);
                if (!passesFilter) return null;
            }

            if (projection !== 'extended') {
                return baseResult;
            }

            // Step 3: Extended — append derived (reverse-traversal) fields
            const numericItemId = this.normalizeId(itemId);

            // requiredByOCs — OCs whose dependencies references this OC
            const requiredByOCsResult = await transaction.run(`
                MATCH (ocVersion:${this.versionLabel})-[:DEPENDS_ON]->(item:${this.nodeLabel})
                MATCH (ocVersion)-[:VERSION_OF]->(ocItem:${this.nodeLabel})-[:LATEST_VERSION]->(ocVersion)
                WHERE id(item) = $itemId
                RETURN id(ocItem) as id, ocItem.title as title, ocItem.code as code
                ORDER BY ocItem.title
            `, { itemId: numericItemId });
            const requiredByOCs = requiredByOCsResult.records.map(r => this._buildReference(r));

            return { ...baseResult, requiredByOCs };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID with multi-context: ${error.message}`, error);
        }
    }

    /**
     * Find changes that implement a specific requirement (inverse IMPLEMENTS)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Changes that implement the requirement with Reference structure
     */
    async findChangesThatImplementRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedRequirementId = this.normalizeId(requirementItemId);
            let query, params;

            if (baselineId === null) {
                query = `
                    MATCH (req:OperationalRequirement)<-[:IMPLEMENTS]-(changeVersion:OperationalChangeVersion)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                    WHERE id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { requirementItemId: normalizedRequirementId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:IMPLEMENTS]->(req:OperationalRequirement)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    WHERE id(baseline) = $baselineId AND id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { baselineId: numericBaselineId, requirementItemId: normalizedRequirementId };
            }

            const result = await transaction.run(query, params);
            const changes = result.records.map(record => this._buildReference(record));

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
            throw new StoreError(`Failed to find changes that implement requirement: ${error.message}`, error);
        }
    }

    /**
     * Find changes that decommission a specific requirement (inverse DECOMMISSIONS)
     * @param {number} requirementItemId - Requirement Item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Changes that decommission the requirement with Reference structure
     */
    async findChangesThatDecommissionRequirement(requirementItemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedRequirementId = this.normalizeId(requirementItemId);
            let query, params;

            if (baselineId === null) {
                query = `
                    MATCH (req:OperationalRequirement)<-[:DECOMMISSIONS]-(changeVersion:OperationalChangeVersion)
                    MATCH (changeVersion)-[:VERSION_OF]->(change:OperationalChange)
                    MATCH (change)-[:LATEST_VERSION]->(changeVersion)
                    WHERE id(req) = $requirementItemId
                    RETURN id(change) as id, change.title as title
                    ORDER BY change.title
                `;
                params = { requirementItemId: normalizedRequirementId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)-[:DECOMMISSIONS]->(req:OperationalRequirement)
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
            throw new StoreError(`Failed to find changes that decommission requirement: ${error.message}`, error);
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

    /**
     * Check whether adding a DEPENDS_ON edge from itemId to candidateDependencyId would create a cycle.
     * Returns true if (candidateDependency)-[:DEPENDS_ON*]->(item) path already exists.
     *
     * @param {number} itemId - The item that would declare the dependency
     * @param {number} candidateDependencyId - The item that would be depended on
     * @param {Transaction} transaction
     * @returns {Promise<boolean>}
     */
    async hasDependsOnCycle(itemId, candidateDependencyId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (candidate:${this.nodeLabel}), (item:${this.nodeLabel})
                WHERE id(candidate) = $candidateDependencyId AND id(item) = $itemId
                RETURN EXISTS {
                    MATCH (candidate)-[:DEPENDS_ON*]->(item)
                } AS hasCycle
            `, {
                itemId: this.normalizeId(itemId),
                candidateDependencyId: this.normalizeId(candidateDependencyId)
            });
            return result.records[0].get('hasCycle');
        } catch (error) {
            throw new StoreError(`Failed to check DEPENDS_ON cycle: ${error.message}`, error);
        }
    }
}