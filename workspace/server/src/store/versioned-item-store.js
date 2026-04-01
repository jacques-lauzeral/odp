import {BaseStore} from './base-store.js';
import {StoreError} from './transaction.js';

export class VersionedItemStore extends BaseStore {
    constructor(driver, itemLabel, versionLabel) {
        super(driver, itemLabel);
        this.versionLabel = versionLabel;
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
     * Find the maximum code number for a given entity type and DRG combination
     * @param {string} entityType - 'ON', 'OR', or 'OC'
     * @param {string} drg - Drafting Group enum value
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<number>} Maximum code number found (0 if none exist)
     */
    async _findMaxCodeNumber(entityType, drg, transaction) {
        try {
            const codePrefix = `${entityType}-${drg}-`;

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
     * @param {string} drg - Drafting Group enum value
     * @param {Transaction} transaction - Transaction instance
     * @returns {Promise<string>} Generated code (e.g., "ON-IDL-0001")
     */
    async _generateCode(entityType, drg, transaction) {
        const maxNumber = await this._findMaxCodeNumber(entityType, drg, transaction);
        const nextNumber = maxNumber + 1;
        const paddedNumber = nextNumber.toString().padStart(4, '0');
        return `${entityType}-${drg}-${paddedNumber}`;
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

    async create(data, transaction) {
        try {
            const { title, ...versionData } = data;
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            // Extract relationships from version data (null currentVersionId = create path)
            const { relationshipIds, ...contentData } = await this._extractRelationshipIdsFromInput(versionData, null, transaction);

            // Generate code if drg is provided
            let code = null;
            if (contentData.drg) {
                const entityType = this._getEntityTypeForCode(data);
                code = await this._generateCode(entityType, contentData.drg, transaction);
            }

            // Create Item node with code
            const itemResult = await transaction.run(`
                CREATE (item:${this.nodeLabel} {
                    title: $title,
                    _label: $title,
                    createdAt: $createdAt,
                    createdBy: $createdBy
                    ${code ? ', code: $code' : ''}
                })
                RETURN id(item) as itemId
            `, { title, createdAt, createdBy, ...(code && { code }) });

            const itemId = this.normalizeId(itemResult.records[0].get('itemId'));

            // Create first ItemVersion node
            const versionResult = await transaction.run(`
                CREATE (version:${this.versionLabel} {
                    version: 1,
                    _label: "1",
                    createdAt: $createdAt,
                    createdBy: $createdBy
                })
                SET version += $contentData
                RETURN id(version) as versionId
            `, { createdAt, createdBy, contentData });

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

            // Return complete item with relationships as Reference objects
            const completeItem = await this.findById(itemId, transaction);
            return completeItem;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    async update(itemId, data, expectedVersionId, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);
            const numericExpectedVersionId = this.normalizeId(expectedVersionId);

            const { title, expectedVersionId: _, ...versionData } = data;
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            // Get current latest version info and validate expectedVersionId
            const currentResult = await transaction.run(`
                MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(currentVersion:${this.versionLabel})
                WHERE id(item) = $itemId
                RETURN id(currentVersion) as currentVersionId, currentVersion.version as currentVersion, item.title as currentTitle
            `, { itemId: numericItemId });

            if (currentResult.records.length === 0) {
                throw new StoreError('Item not found');
            }

            const record = currentResult.records[0];
            const currentVersionId = this.normalizeId(record.get('currentVersionId'));
            const currentVersion = record.get('currentVersion');
            const currentVersionNumeric = this.normalizeId(currentVersion);
            const currentTitle = record.get('currentTitle');

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

            // Update Item title if provided
            if (title && title !== currentTitle) {
                await transaction.run(`
                    MATCH (item:${this.nodeLabel})
                    WHERE id(item) = $itemId
                    SET item.title = $title, item._label = $title
                `, { itemId: numericItemId, title });
            }

            // Create new ItemVersion
            const versionResult = await transaction.run(`
                CREATE (version:${this.versionLabel} {
                    version: $newVersion,
                    _label: toString($newVersion),
                    createdAt: $createdAt,
                    createdBy: $createdBy
                })
                SET version += $contentData
                RETURN id(version) as versionId
            `, { newVersion, createdAt, createdBy, contentData });

            const versionId = this.normalizeId(versionResult.records[0].get('versionId'));

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
     * Exactly one of baselineId or editionId may be provided, or neither (latest version).
     * When editionId is provided, baselineId must also be provided (resolved by service via resolveContext).
     * Returns null if the item is not found, not in the baseline, or not in the edition.
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId
     * @returns {Promise<object|null>}
     */
    async findById(itemId, transaction, baselineId = null, editionId = null) {
        try {
            const numericItemId = this.normalizeId(itemId);

            let query, params;

            if (baselineId === null) {
                // Latest version — no context
                query = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE id(item) = $itemId
                    RETURN id(item) as itemId, item.title as title, item.code as code,
                           id(version) as versionId, version.version as version,
                           version.createdAt as createdAt, version.createdBy as createdBy,
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
                           version.createdAt as createdAt, version.createdBy as createdBy,
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
                           version.createdAt as createdAt, version.createdBy as createdBy,
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
            delete versionData.createdAt;
            delete versionData.createdBy;

            const baseItem = {
                itemId: this.normalizeId(rec.get('itemId')),
                title: rec.get('title'),
                code: rec.get('code'),
                versionId: this.normalizeId(rec.get('versionId')),
                version: this.normalizeId(rec.get('version')),
                createdAt: rec.get('createdAt'),
                createdBy: rec.get('createdBy'),
                ...versionData
            };

            const relationshipReferences = await this._buildRelationshipReferences(baseItem.versionId, transaction);
            return { ...baseItem, ...relationshipReferences };
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
                       version.createdAt as createdAt, version.createdBy as createdBy,
                       version { .* } as versionData
            `, { itemId: numericItemId, versionNumber: numericVersionNumber });

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
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

            const relationshipReferences = await this._buildRelationshipReferences(baseItem.versionId, transaction);
            return { ...baseItem, ...relationshipReferences };
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID and version: ${error.message}`, error);
        }
    }

    async findVersionHistory(itemId, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);

            const itemExists = await this.exists(numericItemId, transaction);
            if (!itemExists) {
                throw new StoreError('Item not found');
            }

            const result = await transaction.run(`
                MATCH (item:${this.nodeLabel})<-[:VERSION_OF]-(version:${this.versionLabel})
                WHERE id(item) = $itemId
                RETURN id(version) as versionId, version.version as version,
                       version.createdAt as createdAt, version.createdBy as createdBy
                ORDER BY version.version DESC
            `, { itemId: numericItemId });

            if (result.records.length === 0) {
                throw new StoreError('Data integrity error: Item exists but has no versions');
            }

            return result.records.map(record => ({
                versionId: this.normalizeId(record.get('versionId')),
                version: this.normalizeId(record.get('version')),
                createdAt: record.get('createdAt'),
                createdBy: record.get('createdBy')
            }));
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find version history for ${this.nodeLabel}: ${error.message}`, error);
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
}