import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for OperationalRequirement items with versioning and relationship management.
 * Handles REFINES, IMPACTS_STAKEHOLDER, IMPACTS_DOMAIN, REFERENCES (ON only),
 * IMPLEMENTS (OR only), and DEPENDS_ON (OR only) relationships.
 * Supports baseline, wave filtering, and content filtering for multi-context operations.
 */
export class OperationalRequirementStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'OperationalRequirement', 'OperationalRequirementVersion');
    }

    /**
     * Get entity type prefix for code generation
     * Returns 'ON' or 'OR' based on the type field in data
     * @param {object} data - Entity data
     * @returns {string} Entity type prefix ('ON' or 'OR')
     */
    _getEntityTypeForCode(data) {
        // The type field determines if this is ON or OR
        return data.type || 'OR'; // Default to 'OR' if not specified
    }


    /**
     * Optimized buildFindAllQuery for OperationalRequirementStore
     * Loads ALL items with ALL relationships in a SINGLE query
     * Eliminates N+1 query problem
     */
    buildFindAllQuery(baselineId, fromWaveId, filters) {
        try {
            let cypher, params = {};
            let whereConditions = [];

            // Base query structure with relationship loading
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

            // Apply content filtering conditions (existing logic - unchanged)
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
                if (filters.document && Array.isArray(filters.document) && filters.document.length > 0) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:REFERENCES]->(doc:ReferenceDocument) 
                    WHERE id(doc) IN $document
                }`);
                    params.document = filters.document.map(id => this.normalizeId(id));
                }
                if (filters.stakeholderCategory && Array.isArray(filters.stakeholderCategory) && filters.stakeholderCategory.length > 0) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:IMPACTS_STAKEHOLDER]->(sc:StakeholderCategory) 
                    WHERE id(sc) IN $stakeholderCategory
                }`);
                    params.stakeholderCategory = filters.stakeholderCategory.map(id => this.normalizeId(id));
                }
                if (filters.domain !== undefined && filters.domain !== null) {
                    whereConditions.push(`EXISTS {
                    MATCH (version)-[:IMPACTS_DOMAIN|HAS_DOMAIN]->(d:Domain)
                    WHERE id(d) = $domain
                }`);
                    params.domain = this.normalizeId(filters.domain);
                }

                // Relationship-based filtering
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

            // *** KEY OPTIMIZATION: Load ALL relationships in OPTIONAL MATCH clauses ***
            cypher += `
            
            OPTIONAL MATCH (version)-[:REFINES]->(parent:${this.nodeLabel})-[:LATEST_VERSION]->(parentVersion:${this.versionLabel})
            
            OPTIONAL MATCH (version)-[scRel:IMPACTS_STAKEHOLDER]->(sc:StakeholderCategory)
            
            OPTIONAL MATCH (version)-[dRel:IMPACTS_DOMAIN]->(dom:Domain)
            
            OPTIONAL MATCH (version)-[:IMPLEMENTS]->(on:${this.nodeLabel})-[:LATEST_VERSION]->(onVersion:${this.versionLabel})
            WHERE onVersion.type = 'ON'
            
            OPTIONAL MATCH (version)-[docRel:REFERENCES]->(doc:ReferenceDocument)
            
            OPTIONAL MATCH (version)-[:DEPENDS_ON]->(depReq:${this.nodeLabel})-[:LATEST_VERSION]->(depReqVersion:${this.versionLabel})
            
            RETURN 
                id(item) as itemId, 
                item.code as code,
                item.title as title,
                id(version) as versionId, 
                version.version as version,
                version.createdAt as createdAt, 
                version.createdBy as createdBy,
                version { .* } as versionData,
                
                collect(DISTINCT CASE WHEN parent IS NOT NULL 
                    THEN {id: id(parent), code: parent.code, title: parent.title, type: parentVersion.type} 
                    ELSE NULL END) as refinesParents,
                
                collect(DISTINCT CASE WHEN sc IS NOT NULL 
                    THEN {id: id(sc), title: sc.name, note: scRel.note} 
                    ELSE NULL END) as impactedStakeholders,
                
                collect(DISTINCT CASE WHEN dom IS NOT NULL 
                    THEN {id: id(dom), title: dom.name, note: dRel.note} 
                    ELSE NULL END) as impactedDomains,
                
                collect(DISTINCT CASE WHEN on IS NOT NULL 
                    THEN {id: id(on), code: on.code, title: on.title, type: onVersion.type} 
                    ELSE NULL END) as implementedONs,
                
                collect(DISTINCT CASE WHEN doc IS NOT NULL 
                    THEN {id: id(doc), title: doc.name, note: docRel.note} 
                    ELSE NULL END) as strategicDocuments,
                
                collect(DISTINCT CASE WHEN depReq IS NOT NULL 
                    THEN {id: id(depReq), code: depReq.code, title: depReq.title} 
                    ELSE NULL END) as dependencies
                
            ORDER BY item.title
        `;

            return { cypher, params };
        } catch (error) {
            throw new StoreError(`Failed to build find all query: ${error.message}`, error);
        }
    }

    /**
     * Refactored findAll - uses single query with aggregated relationships
     * No more N+1 queries!
     */
    async findAll(transaction, baselineId = null, fromWaveId = null, filters = {}) {
        try {
            // Step 1: Execute single optimized query
            const queryObj = this.buildFindAllQuery(baselineId, null, filters);
            const result = await transaction.run(queryObj.cypher, queryObj.params);

            // Step 2: Transform records (relationships already loaded)
            const items = [];
            for (const record of result.records) {
                const versionData = record.get('versionData');
                delete versionData.version;
                delete versionData.createdAt;
                delete versionData.createdBy;

                const item = {
                    itemId: this.normalizeId(record.get('itemId')),
                    title: record.get('title'),
                    code: record.get('code'),
                    versionId: this.normalizeId(record.get('versionId')),
                    version: this.normalizeId(record.get('version')),
                    createdAt: record.get('createdAt'),
                    createdBy: record.get('createdBy'),
                    ...versionData,

                    // Relationships already aggregated in query - just filter nulls
                    refinesParents: this._filterNullsAndNormalize(record.get('refinesParents')),
                    impactedStakeholders: this._filterNullsAndNormalize(record.get('impactedStakeholders')),
                    impactedDomains: this._filterNullsAndNormalize(record.get('impactedDomains')),
                    implementedONs: this._filterNullsAndNormalize(record.get('implementedONs')),
                    strategicDocuments: this._filterNullsAndNormalize(record.get('strategicDocuments')),
                    dependencies: this._filterNullsAndNormalize(record.get('dependencies'))
                };

                items.push(item);
            }

            // Step 3: Apply wave filtering (unchanged)
            if (fromWaveId !== null) {
                const acceptedReqIds = await this._computeWaveFilteredRequirements(
                    fromWaveId,
                    transaction,
                    baselineId
                );
                return items.filter(item => acceptedReqIds.has(item.itemId));
            }

            return items;
        } catch (error) {
            throw new StoreError(`Failed to find all ${this.nodeLabel}s: ${error.message}`, error);
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
                // Normalize all ID fields
                const normalized = { ...item };
                if (normalized.id !== undefined) {
                    normalized.id = this.normalizeId(normalized.id);
                }
                if (normalized.itemId !== undefined) {
                    normalized.itemId = this.normalizeId(normalized.itemId);
                }
                if (normalized.versionId !== undefined) {
                    normalized.versionId = this.normalizeId(normalized.versionId);
                }
                if (normalized.version !== undefined) {
                    normalized.version = this.normalizeId(normalized.version);
                }
                return normalized;
            });
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
                impactedStakeholders: impactedStakeholders || [],   // OR only — {id, note?}
                impactedDomains: impactedDomains || [],             // OR only — {id, note?}
                implementedONs: implementedONs || [],               // OR only — item IDs
                strategicDocuments: strategicDocuments || [],       // ON only — {id, note?}
                dependencies: dependencies || []                    // OR only — item IDs
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
            // REFINES relationships (to OperationalRequirement Items)
            const refinesResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:REFINES]->(parent:OperationalRequirement)-[:LATEST_VERSION]->(parentVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(parent) as id, parent.title as title, parent.code as code, parentVersion.type as type
                ORDER BY parent.title
            `, { versionId });
            const refinesParents = refinesResult.records.map(record => this._buildReference(record));

            // IMPACTS_STAKEHOLDER relationships (with note) — OR only
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

            // IMPACTS_DOMAIN relationships (with note) — OR only
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

            // IMPLEMENTS relationships (to ON-type requirements) — OR only
            const implementedONsResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:IMPLEMENTS]->(target:OperationalRequirement)-[:LATEST_VERSION]->(targetVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId AND targetVersion.type = 'ON'
                RETURN id(target) as id, target.title as title, target.code as code, targetVersion.type as type
                ORDER BY target.title
            `, { versionId });
            const implementedONs = implementedONsResult.records.map(record => this._buildReference(record));

            // REFERENCES relationships to ReferenceDocuments (with note) — ON only
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

            // DEPENDS_ON relationships (Version -> Item) — OR only
            const dependsOnResult = await transaction.run(`
                MATCH (version:${this.versionLabel})-[:DEPENDS_ON]->(reqItem:OperationalRequirement)-[:LATEST_VERSION]->(reqVersion:OperationalRequirementVersion)
                WHERE id(version) = $versionId
                RETURN id(reqItem) as id, reqItem.title as title, reqItem.code as code
                ORDER BY reqItem.title
            `, { versionId });
            const dependencies = dependsOnResult.records.map(record => this._buildReference(record));

            return {
                refinesParents,
                impactedStakeholders,
                impactedDomains,
                implementedONs,
                strategicDocuments,
                dependencies
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

            OPTIONAL MATCH (version)-[:REFINES]->(parent:OperationalRequirement)
            WITH version, collect(id(parent)) as refinesParents

            OPTIONAL MATCH (version)-[scRel:IMPACTS_STAKEHOLDER]->(sc:StakeholderCategory)
            WITH version, refinesParents, collect({id: id(sc), note: scRel.note}) as impactedStakeholders

            OPTIONAL MATCH (version)-[dRel:IMPACTS_DOMAIN]->(d:Domain)
            WITH version, refinesParents, impactedStakeholders, collect({id: id(d), note: dRel.note}) as impactedDomains

            OPTIONAL MATCH (version)-[:IMPLEMENTS]->(ion:OperationalRequirement)
            WITH version, refinesParents, impactedStakeholders, impactedDomains, collect(id(ion)) as implementedONs

            OPTIONAL MATCH (version)-[ref:REFERENCES]->(doc:ReferenceDocument)
            WITH version, refinesParents, impactedStakeholders, impactedDomains, implementedONs,
                 collect({id: id(doc), note: ref.note}) as strategicDocuments

            OPTIONAL MATCH (version)-[:DEPENDS_ON]->(depReq:OperationalRequirement)

            RETURN refinesParents, impactedStakeholders, impactedDomains, implementedONs,
                   strategicDocuments, collect(id(depReq)) as dependencies
        `, { versionId });

            if (result.records.length === 0) {
                return {
                    refinesParents: [],
                    impactedStakeholders: [],
                    impactedDomains: [],
                    implementedONs: [],
                    strategicDocuments: [],
                    dependencies: []
                };
            }

            const record = result.records[0];
            return {
                refinesParents: record.get('refinesParents').map(id => this.normalizeId(id, 'refinesParents')),
                impactedStakeholders: record.get('impactedStakeholders')
                    .filter(ref => ref.id !== null).map(ref => ({
                        id: this.normalizeId(ref.id, 'impactedStakeholders'),
                        note: ref.note || ''
                    })),
                impactedDomains: record.get('impactedDomains')
                    .filter(ref => ref.id !== null).map(ref => ({
                        id: this.normalizeId(ref.id, 'impactedDomains'),
                        note: ref.note || ''
                    })),
                implementedONs: record.get('implementedONs').map(id => this.normalizeId(id, 'implementedONs')),
                strategicDocuments: record.get('strategicDocuments')
                    .filter(ref => ref.id !== null).map(ref => ({
                        id: this.normalizeId(ref.id, 'strategicDocuments'),
                        note: ref.note || ''
                    })),
                dependencies: record.get('dependencies').map(id => this.normalizeId(id, 'dependencies'))
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

            // Create REFINES relationships
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

            // Create IMPACTS_STAKEHOLDER relationships (OR only)
            await this._createAnnotatedRelationships(versionId, 'IMPACTS_STAKEHOLDER', 'StakeholderCategory', impactedStakeholders, transaction);

            // Create IMPACTS_DOMAIN relationships (OR only)
            await this._createAnnotatedRelationships(versionId, 'IMPACTS_DOMAIN', 'Domain', impactedDomains, transaction);

            // Create IMPLEMENTS relationships (OR only)
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

            // Create REFERENCES relationships to ReferenceDocuments (ON only)
            await this._createAnnotatedRelationships(versionId, 'REFERENCES', 'ReferenceDocument', strategicDocuments, transaction);

            // Create DEPENDS_ON relationships (OR only)
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
     * @private
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


    /**
     * Compute set of requirement IDs that pass wave filter (multi-hop expansion)
     * Optimized: runs complex queries once instead of per-requirement
     *
     * Logic:
     * 1. Find OCs with milestones at/after fromWave
     * 2. Find requirements directly implemented/decommissioned by those OCs
     * 3. Climb up the hierarchy via REFINES/IMPLEMENTS relationships (up to 3 levels)
     *
     * LIMITATIONS:
     * - Fixed depth of 3 hops (directReq -> parent -> grandparent -> great-grandparent)
     * - Cannot use variable-length patterns [:REFINES|IMPLEMENTS*0..] because the path
     *   alternates between Item and Version nodes (Version -> Item -> Version -> Item)
     * - Deeper hierarchies (>3 levels) will be truncated
     * - If your requirement hierarchies exceed 3 levels, increase the hop count below
     */
    async _computeWaveFilteredRequirements(fromWaveId, transaction, baselineId = null) {
        try {
            const normalizedFromWaveId = this.normalizeId(fromWaveId);
            let query, params;

            if (baselineId === null) {
                query = `
                MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                
                // Step 1: Find OCs with milestones at/after fromWave
                MATCH (change:OperationalChange)-[:LATEST_VERSION]->(changeVersion:OperationalChangeVersion)
                WHERE EXISTS {
                    MATCH (changeVersion)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                    WHERE (targetWave.year > fromWave.year)
                       OR (targetWave.year = fromWave.year AND 
                           COALESCE(targetWave.sequenceNumber, 0) >= COALESCE(fromWave.sequenceNumber, 0))
                }
                
                // Step 2: Find requirements directly implemented/decommissioned by these OCs
                MATCH (changeVersion)-[:IMPLEMENTS|DECOMMISSIONS]->(directReq:OperationalRequirement)
                MATCH (directReq)-[:LATEST_VERSION]->(directReqVersion:OperationalRequirementVersion)
                
                // Step 3: Multi-hop expansion (3 levels)
                
                // Hop 1: Direct parents/ONs
                OPTIONAL MATCH (reachable1:OperationalRequirement)-[:LATEST_VERSION]->(reachable1Version:OperationalRequirementVersion)
                WHERE (directReqVersion)-[:REFINES|IMPLEMENTS]->(reachable1)
                
                // Hop 2: Grandparents/parent ONs
                OPTIONAL MATCH (reachable2:OperationalRequirement)-[:LATEST_VERSION]->(reachable2Version:OperationalRequirementVersion)
                WHERE (reachable1Version)-[:REFINES|IMPLEMENTS]->(reachable2)
                
                // Hop 3: Great-grandparents/grandparent ONs
                OPTIONAL MATCH (reachable3:OperationalRequirement)-[:LATEST_VERSION]->(reachable3Version:OperationalRequirementVersion)
                WHERE (reachable2Version)-[:REFINES|IMPLEMENTS]->(reachable3)
                
                RETURN collect(DISTINCT id(directReq)) + 
                       collect(DISTINCT id(reachable1)) + 
                       collect(DISTINCT id(reachable2)) + 
                       collect(DISTINCT id(reachable3)) as acceptedReqIds
            `;
                params = { fromWaveId: normalizedFromWaveId };
            } else {
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                MATCH (fromWave:Wave) WHERE id(fromWave) = $fromWaveId
                MATCH (baseline:Baseline)-[:HAS_ITEMS]->(changeVersion:OperationalChangeVersion)
                      -[:VERSION_OF]->(change:OperationalChange)
                WHERE id(baseline) = $baselineId
                AND EXISTS {
                    MATCH (changeVersion)<-[:BELONGS_TO]-(milestone)-[:TARGETS]->(targetWave:Wave)
                    WHERE (targetWave.year > fromWave.year)
                       OR (targetWave.year = fromWave.year AND 
                           COALESCE(targetWave.sequenceNumber, 0) >= COALESCE(fromWave.sequenceNumber, 0))
                }
                
                // Step 2: Find requirements satisfied/superseded by these OCs
                MATCH (changeVersion)-[:IMPLEMENTS|DECOMMISSIONS]->(directReq:OperationalRequirement)
                MATCH (baseline)-[:HAS_ITEMS]->(directReqVersion:OperationalRequirementVersion)
                      -[:VERSION_OF]->(directReq)
                
                // Step 3: Multi-hop expansion (3 levels) within baseline
                
                // Hop 1: Direct parents/ONs
                OPTIONAL MATCH (baseline)-[:HAS_ITEMS]->(reachable1Version:OperationalRequirementVersion)
                              -[:VERSION_OF]->(reachable1:OperationalRequirement)
                WHERE (directReqVersion)-[:REFINES|IMPLEMENTS]->(reachable1)
                
                // Hop 2: Grandparents/parent ONs
                OPTIONAL MATCH (baseline)-[:HAS_ITEMS]->(reachable2Version:OperationalRequirementVersion)
                              -[:VERSION_OF]->(reachable2:OperationalRequirement)
                WHERE (reachable1Version)-[:REFINES|IMPLEMENTS]->(reachable2)
                
                // Hop 3: Great-grandparents/grandparent ONs
                OPTIONAL MATCH (baseline)-[:HAS_ITEMS]->(reachable3Version:OperationalRequirementVersion)
                              -[:VERSION_OF]->(reachable3:OperationalRequirement)
                WHERE (reachable2Version)-[:REFINES|IMPLEMENTS]->(reachable3)
                
                RETURN collect(DISTINCT id(directReq)) + 
                       collect(DISTINCT id(reachable1)) + 
                       collect(DISTINCT id(reachable2)) + 
                       collect(DISTINCT id(reachable3)) as acceptedReqIds
            `;
                params = { fromWaveId: normalizedFromWaveId, baselineId: numericBaselineId };
            }

            const result = await transaction.run(query, params);
            const reqIds = result.records[0]?.get('acceptedReqIds') || [];

            // Filter out null values that may come from optional matches
            return new Set(reqIds.filter(id => id !== null).map(id => this.normalizeId(id)));
        } catch (error) {
            throw new StoreError(
                `Failed to compute wave-filtered requirements: ${error.message}`,
                error
            );
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
     * @param {string} targetLabel - Target item label ('StakeholderCategories', 'Data', 'Services')
     * @param {number} targetId - Target item ID
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @returns {Promise<Array<object>>} Requirements that impact the target with Reference structure
     */
    async findRequirementsThatImpact(targetLabel, targetId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const normalizedTargetId = this.normalizeId(targetId);

            // Determine relationship type based on target label
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