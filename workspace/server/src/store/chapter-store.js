import { VersionedItemStore } from './versioned-item-store.js';
import { StoreError } from './transaction.js';
import { getChapterByKey } from '../../../shared/src/index.js';

/**
 * Store for Chapter items with versioning.
 * Chapters are config-owned (creation via bootstrap only; no delete).
 * User-maintained fields: narrative, jsonOsHierarchy.
 * Config-owned fields (title, domain, position, key, parentId) are merged from
 * edition-config at read time — they are not stored on the version node.
 *
 * Relationships: none (Chapter has no graph relationships to other entities).
 */
export class ChapterStore extends VersionedItemStore {
    constructor(driver) {
        super(driver, 'Chapter', 'ChapterVersion');
    }

    /**
     * Code generation not applicable for chapters.
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
     * Build query for findAll — returns all chapters ordered by item ID.
     * @override
     */
    buildFindAllQuery(_baselineId, _filters, _fields) {
        return {
            cypher: `
                MATCH (item:${this.nodeLabel})-[:LATEST_VERSION]->(version:${this.versionLabel})
                RETURN id(item) as itemId,
                       item.key as key,
                       item.parentItemId as parentItemId,
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
     * Find all chapters. Config-owned fields (title, domain, position, parentKey)
     * are merged from edition-config at read time.
     *
     * @param {Transaction} transaction
     * @returns {Promise<Array<object>>}
     */
    async findAll(transaction) {
        try {
            const { cypher, params } = this.buildFindAllQuery(null, {}, null);
            const result = await transaction.run(cypher, params);
            return result.records.map(record => this._buildChapterItem(record));
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find all Chapters: ${error.message}`, error);
        }
    }

    /**
     * Find a chapter by its stable config key.
     * Used by bootstrap to check existence before creating.
     *
     * @param {string} key - Stable chapter key from edition.json
     * @param {Transaction} transaction
     * @returns {Promise<object|null>}
     */
    async findByKey(key, transaction) {
        try {
            const result = await transaction.run(`
                MATCH (item:${this.nodeLabel} {key: $key})-[:LATEST_VERSION]->(version:${this.versionLabel})
                RETURN id(item) as itemId,
                       item.key as key,
                       item.parentItemId as parentItemId,
                       id(version) as versionId,
                       version.version as version,
                       version.createdAt as createdAt,
                       version.createdBy as createdBy,
                       version.narrative as narrative,
                       version.jsonOsHierarchy as jsonOsHierarchy
            `, { key });

            if (result.records.length === 0) return null;
            return this._buildChapterItem(result.records[0]);
        } catch (error) {
            throw new StoreError(`Failed to find Chapter by key '${key}': ${error.message}`, error);
        }
    }

    /**
     * Find a chapter by item ID with optional baseline/edition context.
     * Config-owned fields merged from edition-config at read time.
     *
     * @param {number} itemId
     * @param {Transaction} transaction
     * @param {number|null} baselineId
     * @param {number|null} editionId
     * @returns {Promise<object|null>}
     */
    async findById(itemId, transaction, baselineId = null, editionId = null) {
        try {
            const baseResult = await super.findById(itemId, transaction, baselineId, editionId);
            if (!baseResult) return null;
            return this._mergeConfigFields(baseResult);
        } catch (error) {
            if (error instanceof StoreError) throw error;
            throw new StoreError(`Failed to find Chapter by ID: ${error.message}`, error);
        }
    }

    /**
     * Create a chapter item node — bootstrap only.
     * key and parentItemId are stored on the item node (stable config identifiers).
     * narrative and jsonOsHierarchy are stored on the version node (user-maintained).
     *
     * @param {string} key - Stable chapter key from edition.json
     * @param {number|null} parentItemId - Parent chapter item ID (null for top-level)
     * @param {Transaction} transaction
     * @returns {Promise<object>}
     */
    async createChapter(key, parentItemId, transaction) {
        try {
            const createdAt = new Date().toISOString();
            const createdBy = transaction.getUserId();

            const itemResult = await transaction.run(`
                CREATE (item:${this.nodeLabel} {
                    key: $key,
                    parentItemId: $parentItemId,
                    createdAt: $createdAt,
                    createdBy: $createdBy
                })
                RETURN id(item) as itemId
            `, { key, parentItemId, createdAt, createdBy });

            const itemId = this.normalizeId(itemResult.records[0].get('itemId'));

            const versionResult = await transaction.run(`
                CREATE (version:${this.versionLabel} {
                    version: 1,
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
            throw new StoreError(`Failed to create Chapter '${key}': ${error.message}`, error);
        }
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /**
     * Build a chapter item object from a Neo4j record and merge config-owned fields.
     * @param {Record} record
     * @returns {object}
     */
    _buildChapterItem(record) {
        const item = {
            itemId: this.normalizeId(record.get('itemId')),
            key: record.get('key'),
            parentItemId: record.get('parentItemId'),
            versionId: this.normalizeId(record.get('versionId')),
            version: this.normalizeId(record.get('version')),
            createdAt: record.get('createdAt'),
            createdBy: record.get('createdBy'),
            narrative: record.get('narrative') || '',
            jsonOsHierarchy: record.get('jsonOsHierarchy') || null,
        };
        return this._mergeConfigFields(item);
    }

    /**
     * Merge config-owned fields (title, domain, position, parentKey) from edition-config.
     * Fields absent in config are set to null — does not throw for unknown keys
     * so that DB/config drift is visible rather than fatal at read time.
     *
     * @param {object} item
     * @returns {object}
     */
    _mergeConfigFields(item) {
        const configEntry = getChapterByKey(item.key);
        return {
            ...item,
            title: configEntry?.title ?? null,
            domain: configEntry?.domain ?? null,
            position: configEntry?.position ?? null,
            parentKey: configEntry?.parentKey ?? null,
        };
    }
}