import { VersionedItemStore } from './versioned-item-store.js';
import { OperationalChangeMilestoneStore } from './operational-change-milestone-store.js';
import { StoreError } from './transaction.js';
import { getProjectionFields } from '../../../shared/src/index.js';

/**
 * Store for OperationalChange items with versioning and relationship management.
 * Handles IMPLEMENTS/DECOMMISSIONS relationships to OperationalRequirements,
 * DEPENDS_ON relationships to OperationalChanges, and delegates milestone operations
 * to OperationalChangeMilestoneStore.
 *
 * Supports three query contexts (mutually exclusive):
 *   - No context: latest versions via LATEST_VERSION
 *   - Baseline context: versions captured in baseline via HAS_ITEMS
 *   - Edition context: baseline versions further filtered by HAS_ITEMS.editions membership
 *
 * Wave filtering has been removed — edition content selection is pre-computed at
 * edition creation time by ODPEditionStore._computeEditionVersionIds().
 */
export class OperationalChangeStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalChange', 'OperationalChangeVersion');
        this.milestoneStore = new OperationalChangeMilestoneStore(driver);
    }

    /**
     * Get entity type prefix for code generation
     */
    _getEntityTypeForCode(data) {
        return 'OC';
    }

    /**
     * Build optimized query for findAll with multi-context, edition filtering,
     * content filtering, and projection support.
     *
     * @param {number|null} baselineId - Baseline context (null = latest versions)
     * @param {object} filters - Content filters; may include editionId
     * @param {string[]|null} fields - Projection field list (null = include all)
     * @returns {{cypher: string, params: object}}
     */
    buildFindAllQuery(baselineId, filters, fields = null) {
        try {
            const includeField = fields ? (f => fields.includes(f)) : () => true;
            let cypher, params = {};
            let whereConditions = [];

            if (baselineId === null) {
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                `;
            } else {
                // Alias HAS_ITEMS as r for edition filter
                const numericBaselineId = this.normalizeId(baselineId);
                cypher = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                `;
                params.baselineId = numericBaselineId;

                // Edition membership filter
                if (filters && filters.editionId !== undefined && filters.editionId !== null) {
                    whereConditions.push('$editionId IN r.editions');
                    params.editionId = this.normalizeId(filters.editionId);
                }
            }

            // Content filtering conditions
            if (filters && Object.keys(filters).length > 0) {
                if (filters.drg) {
                    whereConditions.push('version.drg = $drg');
                    params.drg = filters.drg;
                }
                if (filters.title) {
                    whereConditions.push(`(
                    item.title CONTAINS $title OR
                    item.code CONTAINS $title
                )`);
                    params.title = filters.title;
                }
                if (filters.path) {
                    whereConditions.push('$path IN version.path');
                    params.path = filters.path;
                }
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
                if (filters.implementsOR !== undefined && filters.implementsOR !== null) {
                    whereConditions.push(`EXISTS {
                        MATCH (version)-[:IMPLEMENTS|DECOMMISSIONS]->(req:OperationalRequirement)
                        WHERE id(req) = $implementsOR
                    }`);
                    params.implementsOR = this.normalizeId(filters.implementsOR, 'implementsOR');
                }
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

            // Build RETURN clause
            const scalarVersionFields = [
                'drg', 'maturity', 'path', 'cost', 'orCosts',
                'purpose', 'initialState', 'finalState', 'details', 'privateNotes', 'additionalDocumentation'
            ].filter(includeField);

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

    /**
     * Find all changes with optional baseline/edition context, content filtering,
     * and projection.
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId - Baseline context; must be set when editionId is in filters
     * @param {object} filters - Content filters; may include editionId
     * @param {string} projection - 'summary' | 'standard' (default); 'extended' rejected
     * @returns {Promise<Array<object>>}
     */
    async findAll(transaction, baselineId = null, filters = {}, projection = 'standard') {
        try {
            if (projection === 'extended') {
                throw new StoreError("Projection 'extended' is not valid on findAll — use findById");
            }

            const fields = getProjectionFields('change', projection);
            const includeField = f => fields.includes(f);

            const queryObj = this.buildFindAllQuery(baselineId, filters, fields);
            const result = await transaction.run(queryObj.cypher, queryObj.params);

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

            return items;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find all ${this.nodeLabel}s: ${error.message}`, error);
        }
    }

    /**
     * Find OperationalChange by ID with optional context and projection.
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId - When set, baselineId must also be set
     * @param {string} projection - 'standard' | 'extended' (default: 'standard'); 'summary' rejected
     * @returns {Promise<object|null>}
     */
    async findById(itemId, transaction, baselineId = null, editionId = null, projection = 'standard') {
        try {
            if (projection === 'summary') {
                throw new StoreError("Projection 'summary' is not valid on findById — use findAll");
            }

            // Step 1: Get standard result via base class
            const baseResult = await super.findById(itemId, transaction, baselineId, editionId);
            if (!baseResult) {
                return null;
            }

            if (projection !== 'extended') {
                return baseResult;
            }

            // Step 2: Extended — append derived (reverse-traversal) fields
            const numericItemId = this.normalizeId(itemId);

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
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID: ${error.message}`, error);
        }
    }

    /**
     * Extract relationship ID arrays from input data.
     * On the update path (currentVersionId provided), milestones are inherited from
     * the current version when absent from payload. On the create path they are taken
     * from input.
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
            resolvedMilestones = await this.milestoneStore.getMilestoneDataFromVersion(currentVersionId, transaction);
        } else {
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
     * Build relationship Reference objects and milestone objects for display.
     * Only fetches relationships whose field name is in `fields` (null = all).
     */
    async _buildRelationshipReferences(versionId, transaction, fields = null) {
        try {
            const includeField = fields ? (f => fields.includes(f)) : () => true;
            const result = {};

            if (includeField('implementedORs')) {
                const implementedORsResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:IMPLEMENTS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
            WHERE id(version) = $versionId AND reqVersion.type = 'OR'
            RETURN id(req) as id, req.title as title, req.code as code, reqVersion.type as type
            ORDER BY req.title
        `, { versionId });
                result.implementedORs = implementedORsResult.records.map(record => this._buildReference(record));
            }

            if (includeField('decommissionedORs')) {
                const decommissionedORsResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:DECOMMISSIONS]->(req:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
            WHERE id(version) = $versionId AND reqVersion.type = 'OR'
            RETURN id(req) as id, req.title as title, req.code as code, reqVersion.type as type
            ORDER BY req.title
        `, { versionId });
                result.decommissionedORs = decommissionedORsResult.records.map(record => this._buildReference(record));
            }

            if (includeField('dependencies')) {
                const dependsOnResult = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:DEPENDS_ON]->(changeItem:OperationalChange)-[:LATEST_VERSION]->(changeVersion:OperationalChangeVersion)
            WHERE id(version) = $versionId
            RETURN id(changeItem) as id, changeItem.title as title, changeItem.code as code
            ORDER BY changeItem.title
        `, { versionId });
                result.dependencies = dependsOnResult.records.map(record => this._buildReference(record));
            }

            if (includeField('milestones')) {
                result.milestones = await this.milestoneStore.getMilestonesWithReferences(versionId, transaction);
            }

            return result;
        } catch (error) {
            throw new StoreError(`Failed to build relationship references: ${error.message}`, error);
        }
    }

    /**
     * Create fresh relationships and milestones for a version from ID arrays and milestone data
     */
    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        try {
            const {
                implementedORs = [],
                decommissionedORs = [],
                milestones = [],
                dependencies = []
            } = relationshipIds;

            await this._createRequirementRelationshipsFromIds(versionId, implementedORs, decommissionedORs, transaction);

            if (dependencies.length > 0) {
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

                if (normalizedDepIds.includes(itemId)) {
                    throw new StoreError('Cannot create self-referencing DEPENDS_ON relationship');
                }

                await this._validateReferences('OperationalChange', normalizedDepIds, transaction);

                await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                UNWIND $depIds as depId
                MATCH (depChange:OperationalChange)
                WHERE id(depChange) = depId
                CREATE (version)-[:DEPENDS_ON]->(depChange)
            `, { versionId, depIds: normalizedDepIds });
            }

            await this.milestoneStore.createFreshMilestones(versionId, milestones, transaction);

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships from IDs: ${error.message}`, error);
        }
    }

    /**
     * Create IMPLEMENTS and DECOMMISSIONS relationships for a version
     */
    async _createRequirementRelationshipsFromIds(versionId, implementedORs, decommissionedORs, transaction) {
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

    // =========================================================================
    // Additional query methods
    // =========================================================================

    /**
     * Find changes that implement a specific requirement
     * @param {number} requirementItemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findChangesThatImplementRequirement(requirementItemId, transaction, baselineId = null) {
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
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find changes that implement requirement: ${error.message}`, error);
        }
    }

    /**
     * Find changes that decommission a specific requirement
     * @param {number} requirementItemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findChangesThatDecommissionRequirement(requirementItemId, transaction, baselineId = null) {
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
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find changes that decommission requirement: ${error.message}`, error);
        }
    }

    // Milestone delegation

    async findMilestonesByWave(waveId, transaction, baselineId = null) {
        return await this.milestoneStore.findMilestonesByWave(waveId, transaction, baselineId);
    }

    async findMilestonesByChange(itemId, transaction, baselineId = null) {
        return await this.milestoneStore.findMilestonesByChange(itemId, transaction, baselineId);
    }

    async findMilestoneByKey(itemId, milestoneKey, transaction, baselineId = null) {
        return await this.milestoneStore.findMilestoneByKey(itemId, milestoneKey, transaction, baselineId);
    }

    /**
     * Check whether adding a DEPENDS_ON edge would create a cycle.
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