import { VersionedItemStore, LIFECYCLE_FACE_EDGE } from './versioned-item-store.js';
import { StoreError } from './transaction.js';
import { getProjectionFields } from '../../../shared/src/index.js';

/**
 * Store for OperationalRequirement items with versioning and relationship management.
 * Handles REFINES, IMPACTS_STAKEHOLDER, REFERENCES (ON only),
 * IMPLEMENTS (OR only), and DEPENDS_ON (OR only) relationships.
 *
 * Supports three query contexts (mutually exclusive):
 *   - No context: latest versions via LATEST_VERSION
 *   - Baseline context: versions captured in baseline via HAS_ITEMS
 *   - Edition context: baseline versions further filtered by HAS_ITEMS.editions membership
 *
 * Wave filtering has been removed — edition content selection is pre-computed at
 * edition creation time by ODPEditionStore._computeEditionVersionIds().
 */
export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
    }

    /**
     * Get entity type prefix for code generation
     */
    _getEntityTypeForCode(data) {
        return data.type || 'OR';
    }

    /**
     * Build optimized single-query for findAll with multi-context, edition filtering,
     * content filtering, and projection support.
     *
     * @param {number|null} baselineId - Baseline context (null = live dataset)
     * @param {object} filters - Content filters; may include editionId
     * @param {string[]|null} fields - Projection field list (null = include all)
     * @param {string} lifecycleFace - Live-dataset face selector: 'active' (default) |
     *        'released' | 'decommissioned' | 'deleted'. Selects the anchoring edge.
     *        Ignored when baselineId is set (baseline snapshots have no live face).
     * @returns {{cypher: string, params: object}}
     */
    buildFindAllQuery(baselineId, filters, fields = null, lifecycleFace = 'active') {
        try {
            console.log(`[ORStore.buildFindAllQuery] baselineId: ${baselineId}, filters: ${JSON.stringify(filters)}, lifecycleFace: ${lifecycleFace}`);
            const includeField = fields ? (f => fields.includes(f)) : () => true;

            let cypher, params = {};
            let whereConditions = [];

            if (baselineId === null) {
                // Live dataset — anchor on the lifecycle-face edge.
                const anchorEdge = LIFECYCLE_FACE_EDGE[lifecycleFace];
                if (!anchorEdge) {
                    throw new StoreError(`Unknown lifecycleFace '${lifecycleFace}'`);
                }
                cypher = `
                MATCH (item:${this.nodeLabel})-[:${anchorEdge}]->(version:${this.versionLabel})
            `;
            } else {
                // Baseline (or edition) versions query — alias HAS_ITEMS as r for edition filter
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
                if (filters.type) {
                    whereConditions.push('version.type = $type');
                    params.type = filters.type;
                }

                if (filters.title) {
                    whereConditions.push(`(
                    item.title CONTAINS $title OR
                    item.code CONTAINS $title
                )`);
                    params.title = filters.title;
                }

                if (filters.text) {
                    whereConditions.push(`(
                    item.title CONTAINS $text OR 
                    version.statement CONTAINS $text OR 
                    version.rationale CONTAINS $text OR 
                    version.flows CONTAINS $text OR 
                    version.privateNotes CONTAINS $text
                )`);
                    params.text = filters.text;
                }
                if (filters.maturity) {
                    whereConditions.push('version.maturity = $maturity');
                    params.maturity = filters.maturity;
                }
                if (filters.strategicDocument !== undefined && filters.strategicDocument !== null) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:REFERENCES]->(doc:ReferenceDocument)
                    WHERE id(doc) = $strategicDocument
                }`);
                    params.strategicDocument = this.normalizeId(filters.strategicDocument);
                }
                if (filters.stakeholderCategory !== undefined && filters.stakeholderCategory !== null) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:IMPACTS_STAKEHOLDER]->(sc:StakeholderCategory)
                    WHERE id(sc) = $stakeholderCategory
                }`);
                    params.stakeholderCategory = this.normalizeId(filters.stakeholderCategory);
                }
                if (filters.domain !== undefined && filters.domain !== null) {
                    whereConditions.push('version.domain = $domain');
                    params.domain = filters.domain;
                }
                if (filters.refinesParent !== undefined && filters.refinesParent !== null) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})
                    WHERE id(parent) = $refinesParent
                }`);
                    params.refinesParent = this.normalizeId(filters.refinesParent, 'refinesParent');
                }
                if (filters.dependsOn !== undefined && filters.dependsOn !== null) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:DEPENDS_ON]->(dep:${this.nodeLabel})
                    WHERE id(dep) = $dependsOn
                }`);
                    params.dependsOn = this.normalizeId(filters.dependsOn, 'dependsOn');
                }
                if (filters.implementedON !== undefined && filters.implementedON !== null) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:IMPLEMENTS]->(on:${this.nodeLabel})
                    WHERE id(on) = $implementedON
                }`);
                    params.implementedON = this.normalizeId(filters.implementedON, 'implementedON');
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

            // Relationship OPTIONAL MATCHes — emitted only when field is in projection
            if (includeField('refinesParents')) {
                cypher += `
            OPTIONAL MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})-[:LATEST_VERSION]->(parentVersion:${this.versionLabel})
            `;
            }
            if (includeField('impactedStakeholders')) {
                cypher += `
            OPTIONAL MATCH (version)-[scRel:IMPACTS_STAKEHOLDER]->(sc:StakeholderCategory)
            `;
            }

            if (includeField('implementedONs')) {
                cypher += `
            OPTIONAL MATCH (version)-[:IMPLEMENTS]->(on:${this.nodeLabel})-[:LATEST_VERSION]->(onVersion:${this.versionLabel})
            WHERE onVersion.type = 'ON'
            `;
            }
            if (includeField('strategicDocuments')) {
                cypher += `
            OPTIONAL MATCH (version)-[docRel:REFERENCES]->(doc:ReferenceDocument)
            `;
            }
            if (includeField('dependencies')) {
                cypher += `
            OPTIONAL MATCH (version)-[:DEPENDS_ON]->(depReq:${this.nodeLabel})-[:LATEST_VERSION]->(depReqVersion:${this.versionLabel})
            `;
            }

            // Build RETURN clause — always include identity fields, gate the rest
            const versionFields = [
                'type', 'domain', 'maturity', 'tentative',
                'statement', 'rationale', 'flows', 'nfrs', 'privateNotes', 'additionalDocumentation'
            ].filter(includeField);

            cypher += `
            RETURN
                id(item) as itemId,
                item.code as code,
                item.title as title,
                id(version) as versionId,
                version.version as version,
                EXISTS { (item)-[:LATEST_VERSION]->() }         as lcActive,
                EXISTS { (item)-[:RELEASED_VERSION]->() }       as lcReleased,
                EXISTS { (item)-[:DECOMMISSIONED_VERSION]->() } as lcDecommissioned,
                EXISTS { (item)-[:DELETED_VERSION]->() }        as lcDeleted,
                ${versionFields.map(f => `version.${f} as ${f}`).join(',\n                ')}
                ${includeField('refinesParents') ? `,
                collect(DISTINCT CASE WHEN parent IS NOT NULL
                    THEN {id: id(parent), code: parent.code, title: parent.title, type: parentVersion.type}
                    ELSE NULL END) as refinesParents` : ''}
                ${includeField('impactedStakeholders') ? `,
                collect(DISTINCT CASE WHEN sc IS NOT NULL
                    THEN {id: id(sc), title: sc.name, note: scRel.note}
                    ELSE NULL END) as impactedStakeholders` : ''}

                ${includeField('implementedONs') ? `,
                collect(DISTINCT CASE WHEN on IS NOT NULL
                    THEN {id: id(on), code: on.code, title: on.title, type: onVersion.type}
                    ELSE NULL END) as implementedONs` : ''}
                ${includeField('strategicDocuments') ? `,
                collect(DISTINCT CASE WHEN doc IS NOT NULL
                    THEN {id: id(doc), title: doc.name, note: docRel.note}
                    ELSE NULL END) as strategicDocuments` : ''}
                ${includeField('dependencies') ? `,
                collect(DISTINCT CASE WHEN depReq IS NOT NULL
                    THEN {id: id(depReq), code: depReq.code, title: depReq.title}
                    ELSE NULL END) as dependencies` : ''}

            ORDER BY item.title
        `;

            return { cypher, params };
        } catch (error) {
            throw new StoreError(`Failed to build find all query: ${error.message}`, error);
        }
    }

    /**
     * Find all requirements with optional baseline/edition context, content filtering,
     * and projection.
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId - Baseline context; must be set when editionId is in filters
     * @param {object} filters - Content filters; may include editionId
     * @param {string} projection - 'summary' | 'standard' (default); 'extended' rejected
     * @param {string} lifecycleFace - Live-dataset face: 'active' (default) | 'released' | 'decommissioned' | 'deleted'
     * @returns {Promise<Array<object>>}
     */
    async findAll(transaction, baselineId = null, filters = {}, projection = 'standard', lifecycleFace = 'active') {
        try {
            if (projection === 'extended') {
                throw new StoreError("Projection 'extended' is not valid on findAll — use findById");
            }

            const fields = getProjectionFields('requirement', projection);
            const includeField = f => fields.includes(f);

            const queryObj = this.buildFindAllQuery(baselineId, filters, fields, lifecycleFace);
            console.log(`[ORStore.findAll] params: ${JSON.stringify(queryObj.params)}`);
            const result = await transaction.run(queryObj.cypher, queryObj.params);
            console.log(`[ORStore.findAll] query returned ${result.records.length} record(s)`);

            const items = [];
            for (const record of result.records) {
                const item = {
                    itemId: this.normalizeId(record.get('itemId')),
                    title: record.get('title'),
                    code: record.get('code'),
                    versionId: this.normalizeId(record.get('versionId')),
                    version: this.normalizeId(record.get('version')),
                    lifecycleStatus: {
                        active:         record.get('lcActive'),
                        released:       record.get('lcReleased'),
                        decommissioned: record.get('lcDecommissioned'),
                        deleted:        record.get('lcDeleted'),
                    },
                };

                const scalarVersionFields = [
                    'type', 'domain', 'maturity', 'tentative',
                    'statement', 'rationale', 'flows', 'nfrs', 'privateNotes', 'additionalDocumentation'
                ];
                for (const f of scalarVersionFields) {
                    if (includeField(f)) {
                        item[f] = record.get(f);
                    }
                }

                const relFields = [
                    'refinesParents', 'impactedStakeholders',
                    'implementedONs', 'strategicDocuments', 'dependencies'
                ];
                for (const f of relFields) {
                    if (includeField(f)) {
                        item[f] = this._filterNullsAndNormalize(record.get(f));
                    }
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
     * Find OperationalRequirement by ID with optional context and projection.
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId - When set, baselineId must also be set
     * @param {string} projection - 'standard' | 'extended' (default: 'standard'); 'summary' rejected
     * @param {string} lifecycleFace - Live-dataset face: 'active' (default) | 'released' | 'decommissioned' | 'deleted'
     * @returns {Promise<object|null>}
     */
    async findById(itemId, transaction, baselineId = null, editionId = null, projection = 'standard', lifecycleFace = 'active') {
        try {
            if (projection === 'summary') {
                throw new StoreError("Projection 'summary' is not valid on findById — use findAll");
            }

            // Step 1: Get standard result via base class
            const baseResult = await super.findById(itemId, transaction, baselineId, editionId, lifecycleFace);
            if (!baseResult) {
                return null;
            }

            if (projection !== 'extended') {
                return baseResult;
            }

            // Step 2: Extended — append derived (reverse-traversal) fields
            const numericItemId = this.normalizeId(itemId);

            const implementedByORsResult = await transaction.run(`
                MATCH (orVersion:${this.versionLabel})-[:IMPLEMENTS]->(item:${this.nodeLabel})
                MATCH (orVersion)-[:VERSION_OF]->(orItem:${this.nodeLabel})-[:LATEST_VERSION]->(orVersion)
                WHERE id(item) = $itemId
                RETURN id(orItem) as id, orItem.title as title, orItem.code as code, orVersion.type as type
                ORDER BY orItem.title
            `, { itemId: numericItemId });
            const implementedByORs = implementedByORsResult.records.map(r => this._buildReference(r));

            const implementedByOCsResult = await transaction.run(`
                MATCH (ocVersion:OperationalChangeVersion)-[:IMPLEMENTS]->(item:${this.nodeLabel})
                MATCH (ocVersion)-[:VERSION_OF]->(ocItem:OperationalChange)-[:LATEST_VERSION]->(ocVersion)
                WHERE id(item) = $itemId
                RETURN id(ocItem) as id, ocItem.title as title, ocItem.code as code
                ORDER BY ocItem.title
            `, { itemId: numericItemId });
            const implementedByOCs = implementedByOCsResult.records.map(r => this._buildReference(r));

            const decommissionedByOCsResult = await transaction.run(`
                MATCH (ocVersion:OperationalChangeVersion)-[:DECOMMISSIONS]->(item:${this.nodeLabel})
                MATCH (ocVersion)-[:VERSION_OF]->(ocItem:OperationalChange)-[:LATEST_VERSION]->(ocVersion)
                WHERE id(item) = $itemId
                RETURN id(ocItem) as id, ocItem.title as title, ocItem.code as code
                ORDER BY ocItem.title
            `, { itemId: numericItemId });
            const decommissionedByOCs = decommissionedByOCsResult.records.map(r => this._buildReference(r));

            const refinedByResult = await transaction.run(`
                MATCH (childVersion:${this.versionLabel})-[:REFINES]->(item:${this.nodeLabel})
                MATCH (childVersion)-[:VERSION_OF]->(childItem:${this.nodeLabel})-[:LATEST_VERSION]->(childVersion)
                WHERE id(item) = $itemId
                RETURN id(childItem) as id, childItem.title as title, childItem.code as code, childVersion.type as type
                ORDER BY childItem.title
            `, { itemId: numericItemId });
            const refinedBy = refinedByResult.records.map(r => this._buildReference(r));

            const requiredByORsResult = await transaction.run(`
                MATCH (orVersion:${this.versionLabel})-[:DEPENDS_ON]->(item:${this.nodeLabel})
                MATCH (orVersion)-[:VERSION_OF]->(orItem:${this.nodeLabel})-[:LATEST_VERSION]->(orVersion)
                WHERE id(item) = $itemId
                RETURN id(orItem) as id, orItem.title as title, orItem.code as code, orVersion.type as type
                ORDER BY orItem.title
            `, { itemId: numericItemId });
            const requiredByORs = requiredByORsResult.records.map(r => this._buildReference(r));

            return {
                ...baseResult,
                implementedByORs,
                implementedByOCs,
                decommissionedByOCs,
                refinedBy,
                requiredByORs,
            };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID: ${error.message}`, error);
        }
    }

    /**
     * Find all live O* items referencing this requirement via an inbound relationship.
     * A requirement (ON or OR) may be referenced by:
     *   - child requirements via REFINES
     *   - ORs implementing it (IMPLEMENTS) — when this is an ON
     *   - ORs depending on it (DEPENDS_ON)
     *   - OCs implementing it (IMPLEMENTS) — when this is an OR
     *   - OCs decommissioning it (DECOMMISSIONS) — when this is an OR
     * "Live" = the referencing version holds LATEST_VERSION on its own item.
     *
     * This is a pure where-used query over O* references. It does not inspect
     * the target's lifecycle state, and it does NOT consider edition/baseline
     * captures — edition membership does not constrain soft delete (an edition
     * snapshot holds frozen ItemVersion nodes and is unaffected by item-level
     * lifecycle transitions). The returned references are always O* (type ON|OR|OC).
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @returns {Promise<Array<{id:number, code:string, title:string, type:string}>>}
     */
    async findInboundReferences(itemId, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);
            const refs = [];

            // Requirement → requirement (REFINES, IMPLEMENTS, DEPENDS_ON), live referencing versions
            const reqResult = await transaction.run(`
                MATCH (refVersion:${this.versionLabel})-[:REFINES|IMPLEMENTS|DEPENDS_ON]->(item:${this.nodeLabel})
                MATCH (refItem:${this.nodeLabel})-[:LATEST_VERSION]->(refVersion)
                WHERE id(item) = $itemId
                RETURN DISTINCT id(refItem) as id, refItem.code as code, refItem.title as title, refVersion.type as type
                ORDER BY refItem.title
            `, { itemId: numericItemId });
            for (const r of reqResult.records) {
                refs.push({
                    id: this.normalizeId(r.get('id')),
                    code: r.get('code'),
                    title: r.get('title'),
                    type: r.get('type'),
                });
            }

            // OC → requirement (IMPLEMENTS, DECOMMISSIONS), live referencing OC versions
            const ocResult = await transaction.run(`
                MATCH (ocVersion:OperationalChangeVersion)-[:IMPLEMENTS|DECOMMISSIONS]->(item:${this.nodeLabel})
                MATCH (ocItem:OperationalChange)-[:LATEST_VERSION]->(ocVersion)
                WHERE id(item) = $itemId
                RETURN DISTINCT id(ocItem) as id, ocItem.code as code, ocItem.title as title
                ORDER BY ocItem.title
            `, { itemId: numericItemId });
            for (const r of ocResult.records) {
                refs.push({
                    id: this.normalizeId(r.get('id')),
                    code: r.get('code'),
                    title: r.get('title'),
                    type: 'OC',
                });
            }

            return refs;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find inbound references for ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    /**
     * Helper: Filter nulls from OPTIONAL MATCH results and normalize IDs
     */
    _filterNullsAndNormalize(array) {
        if (!array) return [];
        return array
            .filter(item => item !== null)
            .map(item => {
                const normalized = { ...item };
                if (normalized.id !== undefined) normalized.id = this.normalizeId(normalized.id);
                if (normalized.itemId !== undefined) normalized.itemId = this.normalizeId(normalized.itemId);
                if (normalized.versionId !== undefined) normalized.versionId = this.normalizeId(normalized.versionId);
                if (normalized.version !== undefined) normalized.version = this.normalizeId(normalized.version);
                return normalized;
            });
    }

    /**
     * Extract relationship ID arrays from input data
     */
    async _extractRelationshipIdsFromInput(data, currentVersionId, transaction) {
        const {
            refinesParents,
            impactedStakeholders,
            implementedONs,
            strategicDocuments,
            dependencies,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                refinesParents: refinesParents || [],
                impactedStakeholders: impactedStakeholders || [],
                implementedONs: implementedONs || [],
                strategicDocuments: strategicDocuments || [],
                dependencies: dependencies || []
            },
            ...contentData
        };
    }

    /**
     * Build relationship Reference objects for display from version relationships
     */
    async _buildRelationshipReferences(versionId, transaction) {
        try {
            const refinesResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:REFINES]->(parent:OperationalRequirement)-[:LATEST_VERSION]->(parentVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(parent) as id, parent.title as title, parent.code as code, parentVersion.type as type
                ORDER BY parent.title
            `, { versionId });
            const refinesParents = refinesResult.records.map(record => this._buildReference(record));

            const stakeholderResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[rel:IMPACTS_STAKEHOLDER]->(target:StakeholderCategory)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title, rel.note as note
                ORDER BY target.name
            `, { versionId });
            const impactedStakeholders = stakeholderResult.records.map(record => ({
                id: this.normalizeId(record.get('id')),
                title: record.get('title'),
                note: record.get('note') || ''
            }));

            const implementedONsResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPLEMENTS]->(target:OperationalRequirement)-[:LATEST_VERSION]->(targetVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId AND targetVersion.type = 'ON'
                RETURN id(target) as id, target.title as title, target.code as code, targetVersion.type as type
                ORDER BY target.title
            `, { versionId });
            const implementedONs = implementedONsResult.records.map(record => this._buildReference(record));

            const referencesResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[rel:REFERENCES]->(doc:ReferenceDocument)
                WHERE id(version) = $versionId
                RETURN id(doc) as id, doc.name as title, doc.version as docVersion, rel.note as note
                ORDER BY doc.name
            `, { versionId });
            const strategicDocuments = referencesResult.records.map(record => ({
                id: this.normalizeId(record.get('id')),
                title: record.get('title'),
                docVersion: record.get('docVersion'),
                note: record.get('note') || ''
            }));

            const dependsOnResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:DEPENDS_ON]->(reqItem:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(reqItem) as id, reqItem.title as title, reqItem.code as code
                ORDER BY reqItem.title
            `, { versionId });
            const dependencies = dependsOnResult.records.map(record => this._buildReference(record));

            return { refinesParents, impactedStakeholders, implementedONs, strategicDocuments, dependencies };
        } catch (error) {
            throw new StoreError(`Failed to build relationship references: ${error.message}`, error);
        }
    }

    /**
     * Create fresh relationships for a version from ID arrays
     */
    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        try {
            const {
                refinesParents = [],
                impactedStakeholders = [],
                implementedONs = [],
                strategicDocuments = [],
                dependencies = []
            } = relationshipIds;

            const versionCheck = await transaction.run(`
            MATCH (version:${this.versionLabel})-[:VERSION_OF]->(item:OperationalRequirement)
            WHERE id(version) = $versionId
            RETURN id(item) as itemId
        `, { versionId });

            if (versionCheck.records.length === 0) {
                throw new StoreError('Version not found');
            }

            const itemId = this.normalizeId(versionCheck.records[0].get('itemId'));

            if (refinesParents.length > 0) {
                const normalizedParentIds = refinesParents.map(id => this.normalizeId(id));
                if (normalizedParentIds.includes(itemId)) {
                    throw new StoreError('Cannot create self-referencing REFINES relationship');
                }
                await this._validateReferences('OperationalRequirement', normalizedParentIds, transaction);
                await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                UNWIND $parentIds as parentId
                MATCH (parent:OperationalRequirement)
                WHERE id(parent) = parentId
                CREATE (version)-[:REFINES]->(parent)
            `, { versionId, parentIds: normalizedParentIds });
            }

            await this._createAnnotatedRelationships(versionId, 'IMPACTS_STAKEHOLDER', 'StakeholderCategory', impactedStakeholders, transaction);

            if (implementedONs.length > 0) {
                const normalizedONIds = implementedONs.map(id => this.normalizeId(id));
                await this._validateReferences('OperationalRequirement', normalizedONIds, transaction);
                await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                UNWIND $onIds as onId
                MATCH (on:OperationalRequirement)
                WHERE id(on) = onId
                CREATE (version)-[:IMPLEMENTS]->(on)
            `, { versionId, onIds: normalizedONIds });
            }

            await this._createAnnotatedRelationships(versionId, 'REFERENCES', 'ReferenceDocument', strategicDocuments, transaction);

            if (dependencies.length > 0) {
                const normalizedDepIds = dependencies.map(id => this.normalizeId(id));
                if (normalizedDepIds.includes(itemId)) {
                    throw new StoreError('Cannot create self-referencing DEPENDS_ON relationship');
                }
                await this._validateReferences('OperationalRequirement', normalizedDepIds, transaction);
                await transaction.run(`
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                UNWIND $depIds as depId
                MATCH (depReq:OperationalRequirement)
                WHERE id(depReq) = depId
                CREATE (version)-[:DEPENDS_ON]->(depReq)
            `, { versionId, depIds: normalizedDepIds });
            }

        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create relationships from IDs: ${error.message}`, error);
        }
    }

    /**
     * Create annotated relationships (with optional note property) to a target label
     */
    async _createAnnotatedRelationships(versionId, relType, targetLabel, refs, transaction) {
        if (refs.length === 0) return;
        try {
            const targetIds = refs.map(ref => this.normalizeId(ref.id));
            await this._validateReferences(targetLabel, targetIds, transaction);
            for (const ref of refs) {
                await transaction.run(`
                MATCH (version:${this.versionLabel}), (target:${targetLabel})
                WHERE id(version) = $versionId AND id(target) = $targetId
                CREATE (version)-[:${relType} {note: $note}]->(target)
            `, {
                    versionId,
                    targetId: this.normalizeId(ref.id),
                    note: ref.note || ''
                });
            }
        } catch (error) {
            throw new StoreError(`Failed to create ${relType} relationships to ${targetLabel}: ${error.message}`, error);
        }
    }

    // =========================================================================
    // Additional query methods
    // =========================================================================

    /**
     * Find requirements that are children of the given requirement (inverse REFINES)
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findChildren(itemId, transaction, baselineId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
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
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find children requirements: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that impact a specific stakeholder category
     * @param {number} targetId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findRequirementsThatImpactStakeholder(targetId, transaction, baselineId = null) {
        try {
            const targetLabel = 'StakeholderCategory';
            const relType = 'IMPACTS_STAKEHOLDER';
            const normalizedTargetId = this.normalizeId(targetId);
            let query, params;

            if (baselineId === null) {
                query = `
                    MATCH (target:${targetLabel})<-[:${relType}]-(version:OperationalRequirementVersion)
                    MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                    MATCH (item)-[:LATEST_VERSION]->(version)
                    WHERE id(target) = $targetId
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
                params = { targetId: normalizedTargetId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:OperationalRequirementVersion)-[:${relType}]->(target:${targetLabel})
                    MATCH (version)-[:VERSION_OF]->(item:OperationalRequirement)
                    WHERE id(baseline) = $baselineId AND id(target) = $targetId
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
                params = { baselineId: numericBaselineId, targetId: normalizedTargetId };
            }

            const result = await transaction.run(query, params);
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find requirements that impact ${targetLabel}: ${error.message}`, error);
        }
    }

    /**
     * Find requirements that implement a specific ON-type requirement
     * @param {number} onItemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findRequirementsThatImplement(onItemId, transaction, baselineId = null) {
        try {
            const normalizedOnId = this.normalizeId(onItemId);
            let query, params;

            if (baselineId === null) {
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
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find requirements that implement ON: ${error.message}`, error);
        }
    }

    /**
     * Find parent requirements for a specific requirement
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findParents(itemId, transaction, baselineId = null) {
        try {
            const normalizedItemId = this.normalizeId(itemId);
            let query, params;

            if (baselineId === null) {
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
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find parent requirements: ${error.message}`, error);
        }
    }

    /**
     * Find all root requirements (no parents)
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findRoots(transaction, baselineId = null) {
        try {
            let query, params = {};

            if (baselineId === null) {
                query = `
                    MATCH (item:OperationalRequirement)-[:LATEST_VERSION]->(version:OperationalRequirementVersion)
                    WHERE NOT EXISTS((version)-[:REFINES]->(:OperationalRequirement))
                    RETURN id(item) as id, item.title as title, version.type as type
                    ORDER BY item.title
                `;
            } else {
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
            return result.records.map(record => this._buildReference(record));
        } catch (error) {
            throw new StoreError(`Failed to find root requirements: ${error.message}`, error);
        }
    }

    /**
     * Check whether adding a REFINES edge would create a cycle.
     */
    async hasRefinesCycle(itemId, candidateParentId, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (candidate:${this.nodeLabel}), (item:${this.nodeLabel})
                WHERE id(candidate) = $candidateParentId AND id(item) = $itemId
                RETURN EXISTS {
                    MATCH (candidate)-[:REFINES*]->(item)
                } AS hasCycle
            `, {
                itemId: this.normalizeId(itemId),
                candidateParentId: this.normalizeId(candidateParentId)
            });
            return result.records[0].get('hasCycle');
        } catch (error) {
            throw new StoreError(`Failed to check REFINES cycle: ${error.message}`, error);
        }
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

    // =========================================================================
    // Quality check methods — called exclusively by QualityService
    // =========================================================================

    /**
     * Find ONs that have no implementing OR and are not refined by any child ON.
     * NO_SHOW ONs are excluded.
     *
     * Supports three query contexts (latest / baseline / edition) via the same
     * pattern used by findRoots().
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId - When set, baselineId must also be set
     * @param {string|null} domain    - Optional domain key filter
     * @returns {Promise<Array<{itemId, code, title, versionId}>>}
     */
    async findOrphanONs(transaction, baselineId = null, editionId = null, domain = null) {
        try {
            let cypher, params = {};

            if (baselineId === null) {
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE version.type = 'ON'
                      AND version.maturity <> 'NO_SHOW'
                      AND NOT EXISTS { MATCH (:${this.versionLabel})-[:IMPLEMENTS]->(item) }
                      AND NOT EXISTS { MATCH (:${this.versionLabel})-[:REFINES]->(item) }
                `;
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                params.baselineId = numericBaselineId;
                cypher = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                      AND version.type = 'ON'
                      AND version.maturity <> 'NO_SHOW'
                      AND NOT EXISTS { MATCH (:${this.versionLabel})-[:IMPLEMENTS]->(item) }
                      AND NOT EXISTS { MATCH (:${this.versionLabel})-[:REFINES]->(item) }
                `;
                if (editionId !== null) {
                    cypher += `  AND $editionId IN r.editions\n`;
                    params.editionId = this.normalizeId(editionId);
                }
            }

            if (domain !== null) {
                cypher += `  AND version.domain = $domain\n`;
                params.domain = domain;
            }

            cypher += `
                    RETURN id(item) AS itemId, item.code AS code, item.title AS title,
                           id(version) AS versionId
                    ORDER BY item.title
            `;

            const result = await transaction.run(cypher, params);
            return result.records.map(r => ({
                itemId:    this.normalizeId(r.get('itemId')),
                code:      r.get('code'),
                title:     r.get('title'),
                versionId: this.normalizeId(r.get('versionId')),
            }));
        } catch (error) {
            throw new StoreError(`Failed to find orphan ONs: ${error.message}`, error);
        }
    }

    /**
     * Find ORs that neither implement any ON nor refine any parent OR.
     * NO_SHOW ORs are excluded.
     *
     * Supports three query contexts (latest / baseline / edition) via the same
     * pattern used by findRoots().
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId - When set, baselineId must also be set
     * @param {string|null} domain    - Optional domain key filter
     * @returns {Promise<Array<{itemId, code, title, versionId}>>}
     */
    async findUntraceableORs(transaction, baselineId = null, editionId = null, domain = null) {
        try {
            let cypher, params = {};

            if (baselineId === null) {
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE version.type = 'OR'
                      AND version.maturity <> 'NO_SHOW'
                      AND NOT EXISTS { MATCH (version)-[:IMPLEMENTS]->(:${this.nodeLabel}) }
                      AND NOT EXISTS { MATCH (version)-[:REFINES]->(:${this.nodeLabel}) }
                `;
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                params.baselineId = numericBaselineId;
                cypher = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                      AND version.type = 'OR'
                      AND version.maturity <> 'NO_SHOW'
                      AND NOT EXISTS { MATCH (version)-[:IMPLEMENTS]->(:${this.nodeLabel}) }
                      AND NOT EXISTS { MATCH (version)-[:REFINES]->(:${this.nodeLabel}) }
                `;
                if (editionId !== null) {
                    cypher += `  AND $editionId IN r.editions\n`;
                    params.editionId = this.normalizeId(editionId);
                }
            }

            if (domain !== null) {
                cypher += `  AND version.domain = $domain\n`;
                params.domain = domain;
            }

            cypher += `
                    RETURN id(item) AS itemId, item.code AS code, item.title AS title,
                           id(version) AS versionId
                    ORDER BY item.title
            `;

            const result = await transaction.run(cypher, params);
            return result.records.map(r => ({
                itemId:    this.normalizeId(r.get('itemId')),
                code:      r.get('code'),
                title:     r.get('title'),
                versionId: this.normalizeId(r.get('versionId')),
            }));
        } catch (error) {
            throw new StoreError(`Failed to find untraceable ORs: ${error.message}`, error);
        }
    }

    // =========================================================================
    // Narrative generator methods — called exclusively by OperationalRequirementService
    // =========================================================================

    /**
     * Fetch all (ON, ReferenceDocument, note) triples in a single query.
     * Used by the strategic-traceability generated block to build the ref doc → ON map
     * without N+1 queries.
     *
     * NO_SHOW ONs are excluded. Supports latest / baseline / edition contexts.
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId - When set, baselineId must also be set
     * @returns {Promise<Array<{ itemId, code, title, docId, note }>>}
     */
    async findONStrategicDocumentRefs(transaction, baselineId = null, editionId = null) {
        try {
            let cypher, params = {};

            if (baselineId === null) {
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE version.type = 'ON'
                      AND version.maturity <> 'NO_SHOW'
                    MATCH (version)-[ref:REFERENCES]->(doc:ReferenceDocument)
                `;
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                params.baselineId = numericBaselineId;
                cypher = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                      AND version.type = 'ON'
                      AND version.maturity <> 'NO_SHOW'
                `;
                if (editionId !== null) {
                    cypher += `  AND $editionId IN r.editions\n`;
                    params.editionId = this.normalizeId(editionId);
                }
                cypher += `
                    MATCH (version)-[ref:REFERENCES]->(doc:ReferenceDocument)
                `;
            }

            cypher += `
                RETURN id(item) AS itemId, item.code AS code, item.title AS title,
                       id(doc) AS docId, ref.note AS note
                ORDER BY item.title
            `;

            const result = await transaction.run(cypher, params);
            return result.records.map(r => ({
                itemId: this.normalizeId(r.get('itemId')),
                code:   r.get('code'),
                title:  r.get('title'),
                docId:  this.normalizeId(r.get('docId')),
                note:   r.get('note') ?? null,
            }));
        } catch (error) {
            throw new StoreError(`Failed to find ON strategic document refs: ${error.message}`, error);
        }
    }

    /**
     * Aggregate ON/OR counts grouped by type × maturity for the given context.
     * NO_SHOW items are excluded — counts reflect published content only.
     * Supports latest / baseline / edition contexts.
     *
     * Called exclusively by OperationalRequirementService.getEditionStats().
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId - When set, baselineId must also be set
     * @returns {Promise<Array<{ type: string, maturity: string, count: number }>>}
     */
    /**
     * Aggregate ON/OR counts grouped by domain × type × maturity for the given context.
     * NO_SHOW items are excluded. Returns a richer result than the previous type × maturity
     * grouping — callers derive both global stats and per-domain stats from this single query.
     *
     * Called by OperationalRequirementService.getEditionStats() (sums across domains)
     * and OperationalRequirementService.getEditionStatsByDomain() (groups by domain).
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId
     * @returns {Promise<Array<{ domain: string, type: string, maturity: string, count: number }>>}
     */
    async getMaturityCounts(transaction, baselineId = null, editionId = null) {
        try {
            let cypher, params = {};

            if (baselineId === null) {
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE version.maturity <> 'NO_SHOW'
                `;
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                params.baselineId = numericBaselineId;
                cypher = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                      AND version.maturity <> 'NO_SHOW'
                `;
                if (editionId !== null) {
                    cypher += `  AND $editionId IN r.editions\n`;
                    params.editionId = this.normalizeId(editionId);
                }
            }

            cypher += `
                RETURN version.domain AS domain, version.type AS type, version.maturity AS maturity, count(*) AS count
                ORDER BY domain, type, maturity
            `;

            const result = await transaction.run(cypher, params);
            return result.records.map(r => ({
                domain:  r.get('domain'),
                type:    r.get('type'),
                maturity: r.get('maturity'),
                count:   this.normalizeId(r.get('count')),
            }));
        } catch (error) {
            throw new StoreError(`Failed to get maturity counts: ${error.message}`, error);
        }
    }

    /**
     * Aggregate ON/OR counts grouped by domain × type for the given context.
     * NO_SHOW items are excluded. Used to populate per-chapter counts in the
     * portfolio table generated block.
     * Supports latest / baseline / edition contexts.
     *
     * Called exclusively by OperationalRequirementService.getEditionStatsByDomain().
     *
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId
     * @returns {Promise<Array<{ domain: string, type: string, count: number }>>}
     */
    async getCountsByDomain(transaction, baselineId = null, editionId = null) {
        try {
            let cypher, params = {};

            if (baselineId === null) {
                cypher = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE version.maturity <> 'NO_SHOW'
                `;
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                params.baselineId = numericBaselineId;
                cypher = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId
                      AND version.maturity <> 'NO_SHOW'
                `;
                if (editionId !== null) {
                    cypher += `  AND $editionId IN r.editions
`;
                    params.editionId = this.normalizeId(editionId);
                }
            }

            cypher += `
                RETURN version.domain AS domain, version.type AS type, count(*) AS count
                ORDER BY domain, type
            `;

            const result = await transaction.run(cypher, params);
            return result.records.map(r => ({
                domain: r.get('domain'),
                type:   r.get('type'),
                count:  this.normalizeId(r.get('count')),
            }));
        } catch (error) {
            throw new StoreError(`Failed to get counts by domain: ${error.message}`, error);
        }
    }
}
// Note: appended before closing brace — replace last line