import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';

/**
 * Store for Chapter items with versioning.
 * Chapters are config-owned (creation via bootstrap only; no delete).
 * User-maintained fields: narrative, osHierarchy.
 *
 * Item node fields: code (= chapter key), title.
 * Version node fields: narrative, jsonOsHierarchy.
 *
 * Config-owned fields (domain, position, parentKey) are merged by ChapterService.
 *
 * Serialization contract:
 *   - Callers pass and receive osHierarchy (object or null).
 *   - _prepareInput serializes osHierarchy → jsonOsHierarchy before Neo4j writes.
 *   - _prepareOutput deserializes jsonOsHierarchy → osHierarchy after reads.
 *   - jsonOsHierarchy is never visible above the store layer.
 *
 * Relationships: none (Chapter has no graph relationships to other entities).
 */
export class ChapterStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'Chapter', 'ChapterVersion');
    }

    /**
     * Code generation not applicable for chapters — code = chapter key, set at bootstrap.
     * @override
     */
    _getEntityTypeForCode(_data) {
        return null;
    }

    /**
     * No relationships on Chapter versions.
     * @override
     */
    async _extractRelationshipIdsFromInput(data, _currentVersionId, _transaction) {
        return { relationshipIds: {}, ...data };
    }

    /**
     * No relationships on Chapter versions.
     * @override
     */
    async _buildRelationshipReferences(_versionId, _transaction) {
        return {};
    }

    /**
     * No relationships on Chapter versions.
     * @override
     */
    async _createRelationshipsFromIds(_versionId, _relationshipIds, _transaction) {
        // nothing to do
    }

    /**
     * Serialize osHierarchy object → jsonOsHierarchy string before writing to Neo4j.
     *
     * @override
     * @param {object} contentData
     * @returns {object}
     */
    _prepareInput(contentData) {
        const { osHierarchy, ...rest } = contentData;
        return {
            ...rest,
            jsonOsHierarchy: osHierarchy !== undefined
                ? (osHierarchy !== null ? JSON.stringify(osHierarchy) : null)
                : (rest.jsonOsHierarchy ?? undefined),
        };
    }

    /**
     * Deserialize jsonOsHierarchy string → osHierarchy object after reading from Neo4j.
     *
     * @override
     * @param {object} item
     * @returns {object}
     */
    _prepareOutput(item) {
        const { jsonOsHierarchy, ...rest } = item;
        return {
            ...rest,
            osHierarchy: jsonOsHierarchy ? JSON.parse(jsonOsHierarchy) : null,
        };
    }

    /**
     * Build query for findAll — returns all chapters ordered by item ID.
     * @override
     */
    buildFindAllQuery(_baselineId, _filters, _fields) {
        return {
            cypher: `
                MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                RETURN id(item) as itemId,
                       item.code as code,
                       item.title as title,
                       id(version) as versionId,
                       version.version as version,
                       version.createdAt as createdAt,
                       version.createdBy as createdBy,
                       version.narrative as narrative,
                       version.jsonOsHierarchy as jsonOsHierarchy
                ORDER BY id(item)
            `,
            params: {}
        };
    }

    /**
     * Find all chapters. Config-owned fields are merged by ChapterService.
     *
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>}
     */
    async findAll(transaction) {
        try {
            const { cypher, params } = this.buildFindAllQuery(null, {}, null);
            const result = await transaction.run(cypher, params);
            return result.records.map(record => this._prepareOutput(this._buildChapterItem(record)));
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find all Chapters: ${error.message}`, error);
        }
    }

    /**
     * Find a chapter by its stable code (= chapter key from edition.json).
     * Used by bootstrap to check existence before creating.
     *
     * @param {string} code - Stable chapter code/key
     * @param {Transaction} transaction
     * @returns {Promise<object|null>}
     */
    async findByCode(code, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (item:${this.nodeLabel} {code: $code})-[:LATEST_VERSION]->(version:${this.versionLabel})
                RETURN id(item) as itemId,
                       item.code as code,
                       item.title as title,
                       id(version) as versionId,
                       version.version as version,
                       version.createdAt as createdAt,
                       version.createdBy as createdBy,
                       version.narrative as narrative,
                       version.jsonOsHierarchy as jsonOsHierarchy
            `, { code });

            if (result.records.length === 0) return null;
            return this._prepareOutput(this._buildChapterItem(result.records[0]));
        } catch (error) {
            throw new StoreError(`Failed to find Chapter by code '${code}': ${error.message}`, error);
        }
    }

    /**
     * Create a chapter item node — bootstrap only.
     * code (= chapter key) and title are stored on the item node.
     * narrative and jsonOsHierarchy are stored on the version node (user-maintained).
     *
     * @param {string} code - Stable chapter key from edition.json
     * @param {string} title - Chapter title from edition.json
     * @param {Transaction} transaction
     * @returns {Promise<object>}
     */
    async createChapter(code, title, transaction) {
        try {
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            const itemResult = await transaction.run(`
                CREATE (item:${this.nodeLabel} {
                    code: $code,
                    title: $title,
                    _label: $title,
                    createdAt: $createdAt,
                    createdBy: $createdBy
                })
                RETURN id(item) as itemId
            `, { code, title, createdAt, createdBy });

            const itemId = this.normalizeId(itemResult.records[0].get('itemId'));

            const versionResult = await transaction.run(`
                CREATE (version:${this.versionLabel} {
                    version: 1,
                    _label: "1",
                    createdAt: $createdAt,
                    createdBy: $createdBy,
                    narrative: '',
                    jsonOsHierarchy: null
                })
                RETURN id(version) as versionId
            `, { createdAt, createdBy });

            const versionId = this.normalizeId(versionResult.records[0].get('versionId'));

            await transaction.run(`
                MATCH (item:${this.nodeLabel}), (version:${this.versionLabel})
                WHERE id(item) = $itemId AND id(version) = $versionId
                CREATE (version)-[:VERSION_OF]->(item)
                CREATE (item)-[:LATEST_VERSION]->(version)
            `, { itemId, versionId });

            return await this.findById(itemId, transaction);
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to create Chapter '${code}': ${error.message}`, error);
        }
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /**
     * Build a raw chapter item object from a Neo4j record.
     * Does not apply _prepareOutput or config merging — callers handle that.
     *
     * @param {Record} record
     * @returns {object}
     */
    _buildChapterItem(record) {
        return {
            itemId: this.normalizeId(record.get('itemId')),
            code: record.get('code'),
            title: record.get('title') || null,
            versionId: this.normalizeId(record.get('versionId')),
            version: this.normalizeId(record.get('version')),
            createdAt: record.get('createdAt'),
            createdBy: record.get('createdBy'),
            narrative: record.get('narrative') || '',
            jsonOsHierarchy: record.get('jsonOsHierarchy') || null,
        };
    }
}