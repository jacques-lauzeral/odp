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

    async _extractRelationshipIdsFromVersion(versionId, transaction) {
        throw new Error('_extractRelationshipIdsFromVersion must be implemented by concrete store');
    }

    async _createRelationshipsFromIds(versionId, relationshipIds, transaction) {
        throw new Error('_createRelationshipsFromIds must be implemented by concrete store');
    }

    /**
     * Build optimized query for findAll with multi-context and content filtering support
     * @abstract
     * @param {number|null} baselineId - Optional baseline context
     * @param {number|null} fromWaveId - Optional wave filtering
     * @param {object} filters - Content filtering parameters
     * @returns {object} Query object with cypher and params
     */
    buildFindAllQuery(baselineId, fromWaveId, filters) {
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
            // Extract the numeric part from "XX-YYY-####"
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

            // Extract relationships from version data
            const { relationshipIds, ...contentData } = await this._extractRelationshipIdsFromInput(versionData);

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

            // Get complete item with relationships as Reference objects
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

            const { title, expectedVersionId: _, ...versionData } = data; // Remove expectedVersionId
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            // Extract relationships from input data
            const { relationshipIds, ...contentData } = await this._extractRelationshipIdsFromInput(versionData);

            // Sanitize contentData - prevent mismatch between received versionId and id(version)
            console.log(`VersionItemStore.update() data: ${contentData}`);
            if ('versionId' in contentData) {
                delete contentData.versionId;
            }
            console.log(`VersionItemStore.update() sanitized data: ${contentData}`);


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

            const newVersion = currentVersionNumeric + 1;

            // Update Item title if provided
            if (title && title !== currentTitle) {
                await transaction.run(`
                    MATCH (item:${this.nodeLabel})
                    WHERE id(item) = $itemId
                    SET item.title = $title, item._label = $title
                `, { itemId: numericItemId, title });
            }

            // Create new ItemVersion (starts with no relationships)
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

            // Update Item-Version relationships (no property update needed)
            await transaction.run(`
                MATCH (item:${this.nodeLabel})
                WHERE id(item) = $itemId
                
                // Remove old LATEST_VERSION relationship
                OPTIONAL MATCH (item)-[oldLatest:LATEST_VERSION]->(:${this.versionLabel})
                DELETE oldLatest
                
                WITH item  // Required to carry item forward after DELETE
                
                // Create new relationships
                MATCH (version:${this.versionLabel})
                WHERE id(version) = $versionId
                CREATE (version)-[:VERSION_OF]->(item)
                CREATE (item)-[:LATEST_VERSION]->(version)
            `, { itemId: numericItemId, versionId });

            // Determine final relationships (inheritance + override logic)
            let finalRelationshipIds;
            if (this._hasAnyRelationshipIds(relationshipIds)) {
                // Use provided relationships (override)
                finalRelationshipIds = relationshipIds;
            } else {
                // Inherit relationships from previous version
                finalRelationshipIds = await this._extractRelationshipIdsFromVersion(numericExpectedVersionId, transaction);
            }

            // Create relationships for new version (new version starts with no relationships)
            await this._createRelationshipsFromIds(versionId, finalRelationshipIds, transaction);

            // Get complete item with relationships as Reference objects
            const completeItem = await this.findById(itemId, transaction);
            return completeItem;
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to update ${this.nodeLabel}: ${error.message}`, error);
        }
    }

    async findById(itemId, transaction, baselineId = null, fromWaveId = null) {
        try {
            const numericItemId = this.normalizeId(itemId);

            let query, params;

            if (baselineId === null) {
                // Latest version query
                query = `
                    MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                    WHERE id(item) = $itemId
                    RETURN id(item) as itemId, item.title as title, item.code as code,
                           id(version) as versionId, version.version as version,
                           version.createdAt as createdAt, version.createdBy as createdBy,
                           version { .* } as versionData
                `;
                params = { itemId: numericItemId };
            } else {
                // Baseline version query
                const numericBaselineId = this.normalizeId(baselineId);
                query = `
                    MATCH (baseline:Baseline)-[:HAS_ITEMS]->(version:${this.versionLabel})-[:VERSION_OF]->(item:${this.nodeLabel})
                    WHERE id(baseline) = $baselineId AND id(item) = $itemId
                    RETURN id(item) as itemId, item.title as title, item.code as code,
                           id(version) as versionId, version.version as version,
                           version.createdAt as createdAt, version.createdBy as createdBy,
                           version { .* } as versionData
                `;
                params = { baselineId: numericBaselineId, itemId: numericItemId };
            }

            const result = await transaction.run(query, params);

            if (result.records.length === 0) {
                return null;
            }

            const record = result.records[0];
            const versionData = record.get('versionData');

            // Remove internal properties from version data
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

            // Get relationships as Reference objects
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

            // Remove internal properties from version data
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

            // Get relationships as Reference objects for this specific version
            const relationshipReferences = await this._buildRelationshipReferences(baseItem.versionId, transaction);

            return { ...baseItem, ...relationshipReferences };
        } catch (error) {
            throw new StoreError(`Failed to find ${this.nodeLabel} by ID and version: ${error.message}`, error);
        }
    }

    async findVersionHistory(itemId, transaction) {
        try {
            const numericItemId = this.normalizeId(itemId);

            // First check if item exists
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
     * Find all items (latest versions, baseline context, wave filtered, and content filtered)
     * MUST be implemented by concrete stores with optimized query patterns
     * @abstract
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline ID for historical context
     * @param {number|null} fromWaveId - Optional wave ID for filtering
     * @param {object} filters - Optional content filtering parameters
     * @returns {Promise<Array<object>>} Array of items with all relationships
     */
    async findAll(transaction, baselineId = null, fromWaveId = null, filters = {}) {
        throw new Error('findAll must be implemented by concrete store');
    }

    /**
     * Check if item passes wave filter - abstract method for concrete stores to implement
     * @abstract
     * @param {number} itemId - Item ID
     * @param {number} fromWaveId - Wave ID for filtering
     * @param {Transaction} transaction - Transaction instance
     * @param {number|null} baselineId - Optional baseline context
     * @returns {Promise<boolean>} True if item passes wave filter
     */
    async _checkWaveFilter(itemId, fromWaveId, transaction, baselineId = null) {
        throw new Error('_checkWaveFilter must be implemented by concrete store');
    }

    // Helper methods for concrete stores to use

    // Check if any relationship IDs are provided
    _hasAnyRelationshipIds(relationshipIds) {
        if (!relationshipIds || typeof relationshipIds !== 'object') return false;
        return Object.keys(relationshipIds).some(key => {
            const value = relationshipIds[key];
            return Array.isArray(value) ? value.length > 0 : value != null;
        });
    }

    // Helper to build Reference objects from Neo4j results
    _buildReference(record, titleField = 'title') {
        const ref = {
            id: this.normalizeId(record.get('id')),
            title: record.get(titleField),
            code: record.get('code')
        };

        // Add additional fields if present
        const additionalFields = ['type', 'name', 'year', 'quarter', 'date'];
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

    // Helper to validate referenced items exist
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