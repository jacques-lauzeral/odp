import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';
import { getProjectionFields } from '../../../shared/src/index.js';

/**
 * Store for OperationalRequirement items with versioning and relationship management.
 * Handles REFINES, IMPACTS_STAKEHOLDER, IMPACTS_DOMAIN, REFERENCES (ON only),
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
     * @param {number|null} baselineId - Baseline context (null = latest versions)
     * @param {object} filters - Content filters; may include editionId
     * @param {string[]|null} fields - Projection field list (null = include all)
     * @returns {{cypher: string, params: object}}
     */
    buildFindAllQuery(baselineId, filters, fields = null) {
        try {
            console.log(`[ORStore.buildFindAllQuery] baselineId: ${baselineId}, filters: ${JSON.stringify(filters)}`);
            const includeField = fields ? (f => fields.includes(f)) : () => true;

            let cypher, params = {};
            let whereConditions = [];

            if (baselineId === null) {
                // Latest versions query
                cypher = `
                MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
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
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:IMPACTS_DOMAIN]->(d:Domain)
                    WHERE id(d) = $domain
                }`);
                    params.domain = this.normalizeId(filters.domain);
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
            if (includeField('impactedDomains')) {
                cypher += `
            OPTIONAL MATCH (version)-[dRel:IMPACTS_DOMAIN]->(dom:Domain)
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
                'type', 'drg', 'maturity', 'path', 'tentative',
                'statement', 'rationale', 'flows', 'nfrs', 'privateNotes', 'additionalDocumentation'
            ].filter(includeField);

            cypher += `
            RETURN
                id(item) as itemId,
                item.code as code,
                item.title as title,
                id(version) as versionId,
                version.version as version,
                version.createdAt as createdAt,
                version.createdBy as createdBy,
                ${versionFields.map(f => `version.${f} as ${f}`).join(',\n                ')}
                ${includeField('refinesParents') ? `,
                collect(DISTINCT CASE WHEN parent IS NOT NULL
                    THEN {id: id(parent), code: parent.code, title: parent.title, type: parentVersion.type}
                    ELSE NULL END) as refinesParents` : ''}
                ${includeField('impactedStakeholders') ? `,
                collect(DISTINCT CASE WHEN sc IS NOT NULL
                    THEN {id: id(sc), title: sc.name, note: scRel.note}
                    ELSE NULL END) as impactedStakeholders` : ''}
                ${includeField('impactedDomains') ? `,
                collect(DISTINCT CASE WHEN dom IS NOT NULL
                    THEN {id: id(dom), title: dom.name, note: dRel.note}
                    ELSE NULL END) as impactedDomains` : ''}
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
     * @returns {Promise<Array<object>>}
     */
    async findAll(transaction, baselineId = null, filters = {}, projection = 'standard') {
        try {
            if (projection === 'extended') {
                throw new StoreError("Projection 'extended' is not valid on findAll — use findById");
            }

            const fields = getProjectionFields('requirement', projection);
            const includeField = f => fields.includes(f);

            const queryObj = this.buildFindAllQuery(baselineId, filters, fields);
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
                    createdAt: record.get('createdAt'),
                    createdBy: record.get('createdBy'),
                };

                const scalarVersionFields = [
                    'type', 'drg', 'maturity', 'path', 'tentative',
                    'statement', 'rationale', 'flows', 'nfrs', 'privateNotes', 'additionalDocumentation'
                ];
                for (const f of scalarVersionFields) {
                    if (includeField(f)) {
                        item[f] = record.get(f);
                    }
                }

                const relFields = [
                    'refinesParents', 'impactedStakeholders', 'impactedDomains',
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
            impactedDomains,
            implementedONs,
            strategicDocuments,
            dependencies,
            ...contentData
        } = data;

        return {
            relationshipIds: {
                refinesParents: refinesParents || [],
                impactedStakeholders: impactedStakeholders || [],
                impactedDomains: impactedDomains || [],
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

            const domainResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[rel:IMPACTS_DOMAIN]->(target:Domain)
                WHERE id(version) = $versionId
                RETURN id(target) as id, target.name as title, rel.note as note
                ORDER BY target.name
            `, { versionId });
            const impactedDomains = domainResult.records.map(record => ({
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

            return { refinesParents, impactedStakeholders, impactedDomains, implementedONs, strategicDocuments, dependencies };
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
                impactedDomains = [],
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
            await this._createAnnotatedRelationships(versionId, 'IMPACTS_DOMAIN', 'Domain', impactedDomains, transaction);

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
     * Find requirements that impact a specific item
     * @param {string} targetLabel - 'StakeholderCategory' | 'Domain'
     * @param {number} targetId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @returns {Promise<Array<object>>}
     */
    async findRequirementsThatImpact(targetLabel, targetId, transaction, baselineId = null) {
        try {
            const normalizedTargetId = this.normalizeId(targetId);
            const relType = targetLabel === 'StakeholderCategory' ? 'IMPACTS_STAKEHOLDER' : 'IMPACTS_DOMAIN';
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
}