import {BaseStore} from './base-store.js';
import {StoreError, StoreErrorCode} from './transaction.js';
import {AuditEventStore} from './audit-event-store.js';

/**
 * Maps a lifecycleFace dataset-selector value to the lifecycle edge that anchors
 * the read. The live dataset is walked from exactly one of these edges.
 */
export const LIFECYCLE_FACE_EDGE = {
    active:         'LATEST_VERSION',
    released:       'RELEASED_VERSION',
    decommissioned: 'DECOMMISSIONED_VERSION',
    deleted:        'DELETED_VERSION',
};

export class VersionedItemStore extends BaseStore {
    constructor(driver, itemLabel, versionLabel) {
        super(driver, itemLabel);
        this.versionLabel = versionLabel;
        this.auditEventStore = new AuditEventStore(driver);
    }

    // Abstract methods that concrete stores must implement

    async _extractRelationshipIdsFromInput(data) {
        throw new Error('_extractRelationshipIdsFromInput must be implemented by concrete store');
    }

    async _buildRelationshipReferences(versionId, transaction) {
        throw new Error('_buildRelationshipReferences must be implemented by concrete store');
    }

    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        throw new Error('_createRelationshipsFromIds must be implemented by concrete store');
    }

    /**
     * Build optimized query for findAll with multi-context and content filtering support.
     * @abstract
     * @param {number|null} baselineId - Optional baseline context
     * @param {object} filters - Content filtering parameters; may include editionId
     * @param {string[]|null} fields - Projection field list
     * @returns {object} Query object with cypher and params
     */
    buildFindAllQuery(baselineId, filters, fields) {
        throw new Error('buildFindAllQuery must be implemented by concrete store');
    }

    /**
     * Find all live items that reference the given item via an inbound relationship.
     * "Live" means the referencing item's version holds LATEST_VERSION. The set of
     * relationship types inspected is entity-specific, so concrete stores implement this.
     * Returns OperationalEntityReference[] — {id, code, title, type}.
     * @abstract
     * @param {number} itemId
     * @param {Transaction} transaction
     * @returns {Promise<Array<{id:number, code:string, title:string, type:string}>>}
     */
    async findInboundReferences(itemId, transaction) {
        throw new Error('findInboundReferences must be implemented by concrete store');
    }

    /**
     * Find the maximum code number for a given entity type and domain combination
     * @param {string} entityType - 'ON', 'OR', or 'OC'
     * @param {string} domain - Domain key (e.g. 'ASM_ATFCM')
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<number>} Maximum code number found (0 if none exist)
     */
    async _findMaxCodeNumber(entityType, domain, transaction) {
        try {
            const codePrefix = `${entityType}-${domain}-`;

            const result = await transaction.run(`
                MATCH (item:${this.nodeLabel})
                WHERE item.code STARTS WITH $codePrefix
                RETURN item.code as code
                ORDER BY item.code DESC
                LIMIT 1
            `, { codePrefix });

            if (result.records.length === 0) {
                return 0;
            }

            const maxCode = result.records[0].get('code');
            const numericPart = maxCode.substring(maxCode.lastIndexOf('-') + 1);
            return parseInt(numericPart, 10);
        } catch (error) {
            throw new StoreError(`Failed to find max code number: ${error.message}`, error);
        }
    }

    /**
     * Generate a unique code for an entity
     * @param {string} entityType - 'ON', 'OR', or 'OC'
     * @param {string} domain - Domain key (e.g. 'ASM_ATFCM')
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<string>} Generated code (e.g., "ON-ASM_ATFCM-0001")
     */
    async _generateCode(entityType, domain, transaction) {
        const maxNumber = await this._findMaxCodeNumber(entityType, domain, transaction);
        const nextNumber = maxNumber + 1;
        const paddedNumber = nextNumber.toString().padStart(4, '0');
        return `${entityType}-${domain}-${paddedNumber}`;
    }

    /**
     * Get entity type prefix for code generation
     * @abstract
     * @param {object} data - Entity data
     * @returns {string} Entity type prefix ('ON', 'OR', or 'OC')
     */
    _getEntityTypeForCode(data) {
        throw new Error('_getEntityTypeForCode must be implemented by concrete store');
    }

    /**
     * Prepare input data before writing to Neo4j.
     * Override in subclasses to serialize complex fields (e.g. object → JSON string).
     * Called on contentData after relationship extraction, before SET version += $contentData.
     *
     * @param {object} contentData - Version content fields to be written
     * @returns {object} Prepared content data (may be mutated or replaced)
     */
    _prepareInput(contentData) {
        return contentData;
    }

    /**
     * Prepare output data after reading from Neo4j.
     * Override in subclasses to deserialize complex fields (e.g. JSON string → object).
     * Called on the assembled item before returning from find methods.
     *
     * @param {object} item - Assembled item object
     * @returns {object} Prepared item (may be mutated or replaced)
     */
    _prepareOutput(item) {
        return item;
    }

    async create(data, transaction, changeSetCommit) {
        try {
            const { title, ...versionData } = data;

            // Extract relationships from version data (null currentVersionId = create path)
            const { relationshipIds, ...contentData } = await this._extractRelationshipIdsFromInput(versionData, null, transaction);

            // Generate code if domain is provided
            let code = null;
            if (contentData.domain) {
                const entityType = this._getEntityTypeForCode(data);
                code = await this._generateCode(entityType, contentData.domain, transaction);
            }

            // Create Item node with code. No createdAt/createdBy — audit lives on AuditEvent.
            // No status field — lifecycle state is edge-derived (LATEST_VERSION / DELETED_VERSION etc.).
            const itemResult = await transaction.run(`
                CREATE (item:${this.nodeLabel} {
                    title: $title,
                    _label: $title
                    ${code ? ', code: $code' : ''}
                })
                RETURN id(item) as itemId
            `, { title, ...(code && { code }) });

            const itemId = this.normalizeId(itemResult.records[0].get('itemId'));

            // Create first ItemVersion node — content only, no audit stamps.
            const versionResult = await transaction.run(`
                CREATE (version:${this.versionLabel} {
                    version: 1,
                    _label: "1"
                })
                SET version += $contentData
                RETURN id(version) as versionId
            `, { contentData: this._prepareInput(contentData) });

            const versionId = this.normalizeId(versionResult.records[0].get('versionId'));

            // Create Item-Version relationships
            await transaction.run(`
                MATCH (item:${this.nodeLabel}), (version:${this.versionLabel})
                WHERE id(item) = $itemId AND id(version) = $versionId
                CREATE (version)-[:VERSION_OF]->(item)
                CREATE (item)-[:LATEST_VERSION]->(version)
            `, { itemId, versionId });

            // Create item relationships from ID arrays
            await this._createRelationshipsFromIds(versionId, relationshipIds, transaction);

            // LCM / audit — validate the set is OPEN, then record the CREATE event in-transaction.
            const csSnapshot = await this._validateOpenChangeSet(changeSetCommit, transaction);
            await this.auditEventStore.log('CREATE', {
                id: itemId,
                type: this._resolveAuditTargetType(contentData),
                code,
                title,
                version: 1,
            }, this._auditCommit(changeSetCommit, csSnapshot), transaction);

            // Return complete item with relationships as Reference objects
            const completeItem = await this.findById(itemId, transaction);
            return completeItem;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    async update(itemId, data, expectedVersionId, transaction, changeSetCommit) {
        try {
            const numericItemId = this.normalizeId(itemId);
            const numericExpectedVersionId = this.normalizeId(expectedVersionId);

            const { title, expectedVersionId: _, ...versionData } = data;

            // Get current latest version info and validate expectedVersionId
            const currentResult = await transaction.run(`
                MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(currentVersion:${this.versionLabel})
                WHERE id(item) = $itemId
                RETURN id(currentVersion) as currentVersionId, currentVersion.version as currentVersion,
                       item.title as currentTitle, item.code as code
            `, { itemId: numericItemId });

            if (currentResult.records.length === 0) {
                throw new StoreError('Item not found');
            }

            const record = currentResult.records[0];
            const currentVersionId = this.normalizeId(record.get('currentVersionId'));
            const currentVersion = record.get('currentVersion');
            const currentVersionNumeric = this.normalizeId(currentVersion);
            const currentTitle = record.get('currentTitle');
            const code = record.get('code');

            if (currentVersionId !== numericExpectedVersionId) {
                throw new StoreError('Outdated item version');
            }

            // Extract relationships from input data (currentVersionId provided for milestone inheritance)
            const { relationshipIds, ...contentData } = await this._extractRelationshipIdsFromInput(versionData, currentVersionId, transaction);

            // Sanitize contentData
            if ('versionId' in contentData) {
                delete contentData.versionId;
            }

            const newVersion = currentVersionNumeric + 1;
            const effectiveTitle = (title && title !== currentTitle) ? title : currentTitle;

            // Update Item title if provided
            if (title && title !== currentTitle) {
                await transaction.run(`
                    MATCH (item:${this.nodeLabel})
                    WHERE id(item) = $itemId
                    SET item.title = $title, item._label = $title
                `, { itemId: numericItemId, title });
            }

            // Create new ItemVersion — content only, no audit stamps.
            const versionResult = await transaction.run(`
                CREATE (version:${this.versionLabel} {
                    version: $newVersion,
                    _label: toString($newVersion)
                })
                SET version += $contentData
                RETURN id(version) as versionId
            `, { newVersion, contentData: this._prepareInput(contentData) });

            const versionId = this.normalizeId(versionResult.records[0].get('versionId'));

            // LCM / audit — validate the set is OPEN, then record the UPDATE event in-transaction.
            const csSnapshot = await this._validateOpenChangeSet(changeSetCommit, transaction);
            await this.auditEventStore.log('UPDATE', {
                id: numericItemId,
                type: this._resolveAuditTargetType(contentData),
                code,
                title: effectiveTitle,
                version: newVersion,
            }, this._auditCommit(changeSetCommit, csSnapshot), transaction);

            // Update Item-Version relationships
            await transaction.run(`
                MATCH (item:${this.nodeLabel})
                WHERE id(item) = $itemId
                OPTIONAL MATCH (item)-[oldLatest:LATEST_VERSION]->(:${this.versionLabel})
                DELETE oldLatest
                WITH item
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                CREATE (version)-[:VERSION_OF]->(item)
                CREATE (item)-[:LATEST_VERSION]->(version)
            `, { itemId: numericItemId, versionId });

            await this._createRelationshipsFromIds(versionId, relationshipIds, transaction);

            const completeItem = await this.findById(itemId, transaction);
            return completeItem;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    /**
     * Find item by ID with optional context.
     * Exactly one of baselineId or editionId may be provided, or neither (live dataset).
     * When editionId is provided, baselineId must also be provided (resolved by service via resolveContext).
     * In the live dataset (baselineId null), lifecycleFace selects which lifecycle edge anchors
     * the read: 'active' (default) | 'released' | 'decommissioned' | 'deleted'. lifecycleFace is
     * mutually exclusive with baselineId — it is ignored when a baseline context is supplied
     * (baseline snapshots are historical and carry no live lifecycle face).
     * Returns null if the item is not found, not in the baseline, not in the edition, or not on the requested face.
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId
     * @param {string} lifecycleFace - Live-dataset face: 'active' (default) | 'released' | 'decommissioned' | 'deleted'
     * @returns {Promise<object|null>}
     */
    async findById(itemId, transaction, baselineId = null, editionId = null, lifecycleFace = 'active') {
        try {
            const numericItemId = this.normalizeId(itemId);

            let query, params;

            if (baselineId === null) {
                // Live dataset — anchor on the lifecycle-face edge.
                const anchorEdge = LIFECYCLE_FACE_EDGE[lifecycleFace];
                if (!anchorEdge) {
                    throw new StoreError(`Unknown lifecycleFace '${lifecycleFace}'`);
                }
                query = `
                    MATCH (item:${this.nodeLabel})-[:${anchorEdge}]->(version:${this.versionLabel})
                    WHERE id(item) = $itemId
                    RETURN id(item) as itemId, item.title as title, item.code as code,
                           id(version) as versionId, version.version as version,
                           version { .* } as versionData
                `;
                params = { itemId: numericItemId };
            } else if (editionId === null) {
                // Baseline context, no edition filter
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId AND id(item) = $itemId
                    RETURN id(item) as itemId, item.title as title, item.code as code,
                           id(version) as versionId, version.version as version,
                           version { .* } as versionData
                `;
                params = { baselineId: this.normalizeId(baselineId), itemId: numericItemId };
            } else {
                // Edition context — baseline + edition membership check
                query = `
                    MATCH (baseline:Baseline)-[r:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId AND id(item) = $itemId
                      AND $editionId IN r.editions
                    RETURN id(item) as itemId, item.title as title, item.code as code,
                           id(version) as versionId, version.version as version,
                           version { .* } as versionData
                `;
                params = {
                    baselineId: this.normalizeId(baselineId),
                    itemId: numericItemId,
                    editionId: this.normalizeId(editionId)
                };
            }

            const result = await transaction.run(query, params);

            if (result.records.length === 0) {
                return null;
            }

            const rec = result.records[0];
            const versionData = rec.get('versionData');

            delete versionData.version;

            const baseItem = {
                itemId: this.normalizeId(rec.get('itemId')),
                title: rec.get('title'),
                code: rec.get('code'),
                versionId: this.normalizeId(rec.get('versionId')),
                version: this.normalizeId(rec.get('version')),
                ...versionData
            };

            const relationshipReferences = await this._buildRelationshipReferences(baseItem.versionId, transaction);
            const enriched = { ...baseItem, ...relationshipReferences };

            // Lifecycle status is a live-dataset concept — computed only outside baseline context.
            // Baseline snapshots are historical and carry no current lifecycle face.
            if (baselineId === null) {
                enriched.lifecycleStatus = await this._computeLifecycleStatus(baseItem.itemId, transaction);
            }

            return this._prepareOutput(enriched);
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID: ${error.message}`, error);
        }
    }

    async findByIdAndVersion(itemId, versionNumber, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);
            const numericVersionNumber = this.normalizeId(versionNumber);
            const result = await transaction.run(`
                MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
                WHERE id(item) = $itemId AND version.version = $versionNumber
                RETURN id(item) as itemId, item.title as title, item.code as code,
                       id(version) as versionId, version.version as version,
                       version { .* } as versionData
            `, { itemId: numericItemId, versionNumber: numericVersionNumber });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const versionData = record.get('versionData');

            delete versionData.version;

            const baseItem = {
                itemId: this.normalizeId(record.get('itemId')),
                title: record.get('title'),
                code: record.get('code'),
                versionId: this.normalizeId(record.get('versionId')),
                version: this.normalizeId(record.get('version')),
                ...versionData
            };

            const relationshipReferences = await this._buildRelationshipReferences(baseItem.versionId, transaction);
            const enriched = { ...baseItem, ...relationshipReferences };
            return this._prepareOutput(enriched);
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID and version: ${error.message}`, error);
        }
    }


    /**
     * Find all items with optional context and projection.
     * MUST be implemented by concrete stores.
     * @abstract
     * @param {Transaction} transaction
     * @param {number|null} baselineId - Baseline context; mutually exclusive with editionId in filters
     * @param {object} filters - Content filters; may include editionId
     * @param {string} projection
     * @returns {Promise<Array<object>>}
     */
    async findAll(transaction, baselineId = null, filters = {}, projection = 'standard') {
        throw new Error('findAll must be implemented by concrete store');
    }

    // ---------------------------------------------------------------------------
    // Lifecycle transitions and status — Phase B
    // ---------------------------------------------------------------------------

    /**
     * Soft delete: move the item from the Active face to the Deleted face.
     * Removes LATEST_VERSION and adds DELETED_VERSION on the same version node,
     * then logs a DELETE AuditEvent in the same transaction.
     *
     * Lifecycle-state guard only (Active state required): refuses if the item
     * holds no LATEST_VERSION. The blocking-reference precondition is enforced by
     * the service layer before this is called — the store does not re-check it.
     *
     * @param {number} itemId
     * @param {{changeSetId:(number|string), note?:string}} changeSetCommit
     * @param {Transaction} transaction
     * @returns {Promise<{itemId:number, version:number}>}
     */
    async softDelete(itemId, changeSetCommit, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);

            const current = await transaction.run(`
                MATCH (item:${this.nodeLabel})-[latest:LATEST_VERSION]->(version:${this.versionLabel})
                WHERE id(item) = $itemId
                RETURN id(version) as versionId, version.version as version,
                       item.title as title, item.code as code, version.type as type
            `, { itemId: numericItemId });

            if (current.records.length === 0) {
                throw new StoreError('Item not found or not in Active state — cannot soft delete');
            }

            const rec = current.records[0];
            const versionNumber = this.normalizeId(rec.get('version'));
            const title = rec.get('title');
            const code = rec.get('code');
            const type = rec.get('type');

            // Move the edge: LATEST_VERSION → DELETED_VERSION on the same version node.
            await transaction.run(`
                MATCH (item:${this.nodeLabel})-[latest:LATEST_VERSION]->(version:${this.versionLabel})
                WHERE id(item) = $itemId
                DELETE latest
                CREATE (item)-[:DELETED_VERSION]->(version)
            `, { itemId: numericItemId });

            const csSnapshot = await this._validateOpenChangeSet(changeSetCommit, transaction);
            await this.auditEventStore.log('DELETE', {
                id: numericItemId,
                type: this._resolveAuditTargetType({ type }),
                code,
                title,
                version: versionNumber,
            }, this._auditCommit(changeSetCommit, csSnapshot), transaction);

            return { itemId: numericItemId, version: versionNumber };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to soft delete ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    /**
     * Restore: move the item from the Deleted face back to the Active face.
     * Removes DELETED_VERSION and re-adds LATEST_VERSION on the same version node,
     * then logs a RESTORE AuditEvent in the same transaction.
     *
     * Lifecycle-state guard only (Deleted state required): refuses if the item
     * holds no DELETED_VERSION.
     *
     * @param {number} itemId
     * @param {{changeSetId:(number|string), note?:string}} changeSetCommit
     * @param {Transaction} transaction
     * @returns {Promise<{itemId:number, version:number}>}
     */
    async restore(itemId, changeSetCommit, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);

            const current = await transaction.run(`
                MATCH (item:${this.nodeLabel})-[deleted:DELETED_VERSION]->(version:${this.versionLabel})
                WHERE id(item) = $itemId
                RETURN id(version) as versionId, version.version as version,
                       item.title as title, item.code as code, version.type as type
            `, { itemId: numericItemId });

            if (current.records.length === 0) {
                throw new StoreError('Item not found or not in Deleted state — cannot restore');
            }

            const rec = current.records[0];
            const versionNumber = this.normalizeId(rec.get('version'));
            const title = rec.get('title');
            const code = rec.get('code');
            const type = rec.get('type');

            // Move the edge back: DELETED_VERSION → LATEST_VERSION on the same version node.
            await transaction.run(`
                MATCH (item:${this.nodeLabel})-[deleted:DELETED_VERSION]->(version:${this.versionLabel})
                WHERE id(item) = $itemId
                DELETE deleted
                CREATE (item)-[:LATEST_VERSION]->(version)
            `, { itemId: numericItemId });

            const csSnapshot = await this._validateOpenChangeSet(changeSetCommit, transaction);
            await this.auditEventStore.log('RESTORE', {
                id: numericItemId,
                type: this._resolveAuditTargetType({ type }),
                code,
                title,
                version: versionNumber,
            }, this._auditCommit(changeSetCommit, csSnapshot), transaction);

            return { itemId: numericItemId, version: versionNumber };
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to restore ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    /**
     * Compute the LifecycleStatus structure for an item from lifecycle-edge presence.
     * The four flags are independent; at most two co-occur (e.g. active + released).
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @returns {Promise<{active:boolean, released:boolean, decommissioned:boolean, deleted:boolean}>}
     */
    async _computeLifecycleStatus(itemId, transaction) {
        const numericItemId = this.normalizeId(itemId);
        const result = await transaction.run(`
            MATCH (item:${this.nodeLabel})
            WHERE id(item) = $itemId
            RETURN EXISTS { (item)-[:LATEST_VERSION]->() }         as active,
                   EXISTS { (item)-[:RELEASED_VERSION]->() }       as released,
                   EXISTS { (item)-[:DECOMMISSIONED_VERSION]->() } as decommissioned,
                   EXISTS { (item)-[:DELETED_VERSION]->() }        as deleted
        `, { itemId: numericItemId });

        if (result.records.length === 0) {
            throw new StoreError('Item not found — cannot compute lifecycle status');
        }
        const rec = result.records[0];
        return {
            active:         rec.get('active'),
            released:       rec.get('released'),
            decommissioned: rec.get('decommissioned'),
            deleted:        rec.get('deleted'),
        };
    }

    // Helper methods

    _buildReference(record, titleField = 'title') {
        const ref = {
            id: this.normalizeId(record.get('id')),
            title: record.get(titleField),
            code: record.get('code')
        };

        const additionalFields = ['type', 'name', 'year', 'sequenceNumber', 'implementationDate'];
        additionalFields.forEach(field => {
            try {
                const value = record.get(field);
                if (value !== null && value !== undefined) {
                    ref[field] = value;
                }
            } catch (e) {
                // Field not present in result - ignore
            }
        });

        return ref;
    }

    async _validateReferences(label, ids, transaction) {
        if (!Array.isArray(ids) || ids.length === 0) return;

        const normalizedIds = ids.map(id => this.normalizeId(id));

        const result = await transaction.run(`
            MATCH (item:${label})
            WHERE id(item) IN $ids
            RETURN id(item) as foundId
        `, { ids: normalizedIds });

        const foundIds = new Set(
            result.records.map(record => this.normalizeId(record.get('foundId')))
        );

        const missingIds = normalizedIds.filter(id => !foundIds.has(id));

        if (missingIds.length > 0) {
            throw new StoreError(
                `${label} validation failed: ${missingIds.length} item(s) not found. ` +
                `Missing IDs: [${missingIds.join(', ')}]`
            );
        }
    }

    // ---------------------------------------------------------------------------
    // Change-set validation and audit — LCM
    // ---------------------------------------------------------------------------

    /**
     * Validate that the supplied change set exists and is OPEN, and return a
     * frozen snapshot of its denormalised fields for the AuditEvent. Fail-fast.
     *
     * @param {{changeSetId:(number|string), note?:string}} changeSetCommit
     * @param {Transaction} transaction
     * @returns {Promise<{code:string, title:string, classifier:string}>} CS snapshot at commit time
     */
    async _validateOpenChangeSet(changeSetCommit, transaction) {
        if (!changeSetCommit || changeSetCommit.changeSetId === undefined
            || changeSetCommit.changeSetId === null || changeSetCommit.changeSetId === '') {
            // Request-shape error — rides the routes' existing 'Validation failed:' → 400 arm.
            // Expected to be unreachable: malformed writes are normally rejected before the
            // transaction opens. This is the in-transaction backstop.
            throw new StoreError('Validation failed: changeSetCommit.changeSetId is required for every versioned write');
        }
        const changeSetId = this.normalizeId(changeSetCommit.changeSetId);
        const result = await transaction.run(`
            MATCH (cs:ChangeSet)
            WHERE id(cs) = $changeSetId
            RETURN cs.status as status, cs.code as code, cs.title as title, cs.classifier as classifier
        `, { changeSetId });
        if (result.records.length === 0) {
            throw new StoreError(`ChangeSet ${changeSetId} not found`, null, StoreErrorCode.CHANGESET_NOT_FOUND);
        }
        const rec = result.records[0];
        if (rec.get('status') !== 'OPEN') {   // ChangeSetStatus.OPEN
            throw new StoreError(`ChangeSet ${changeSetId} is not OPEN — cannot commit a new version to it`, null, StoreErrorCode.CHANGESET_CLOSED);
        }
        return { code: rec.get('code'), title: rec.get('title'), classifier: rec.get('classifier') };
    }

    /**
     * Assemble the audit commit fragment passed to AuditEventStore.log — the
     * frozen change-set snapshot plus the write-time changeSetId and per-object note.
     *
     * @param {{changeSetId:(number|string), note?:string}} changeSetCommit
     * @param {{code:string, title:string, classifier:string}} csSnapshot
     * @returns {{changeSetId:number, code:string, title:string, classifier:string, note:string}}
     */
    _auditCommit(changeSetCommit, csSnapshot) {
        return {
            changeSetId: this.normalizeId(changeSetCommit.changeSetId),
            code:        csSnapshot.code,
            title:       csSnapshot.title,
            classifier:  csSnapshot.classifier,
            note:        changeSetCommit.note ?? null,
        };
    }

    /**
     * Resolve the AuditEvent targetType for this store's items. Mirrors the
     * itemType resolution used by the change-set member feed: OC/Chapter from the
     * node label, otherwise the requirement's ON/OR type from the version content.
     *
     * @param {object} contentData - the version content (carries `type` for requirements)
     * @returns {string} AuditTargetType key
     */
    _resolveAuditTargetType(contentData) {
        if (this.nodeLabel === 'OperationalChange') return 'OC';
        if (this.nodeLabel === 'Chapter') return 'CHAPTER';
        return contentData.type;   // 'ON' | 'OR'
    }
}