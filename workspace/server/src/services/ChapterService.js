import { VersionedItemService } from './VersionedItemService.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    chapterStore
} from '../store/index.js';
import { getChapterByCode } from '../config/loader.js';

/**
 * ChapterService provides versioned CRUD operations for Chapter entities.
 *
 * Chapters are config-owned (no create/delete via API — bootstrap-only).
 * Only narrative and osHierarchy are user-maintained.
 *
 * Inherits from VersionedItemService:
 * - update(itemId, payload, expectedVersionId, userId)
 * - patch(itemId, patchPayload, expectedVersionId, userId)
 * - getById(itemId, userId, editionId?, projection?)
 * - getByIdAndVersion(itemId, versionNumber, userId)
 * - getVersionHistory(itemId, userId)
 *
 * Does NOT expose: create(), delete() — chapters are bootstrap-only.
 *
 * Field contract:
 * - Callers pass and receive osHierarchy (object or null).
 * - Serialization to/from jsonOsHierarchy is handled exclusively by ChapterStore.
 * - Config-owned fields (domain, position, parentKey) are merged here
 *   from edition-config after every store read, keyed on item.code.
 */
export class ChapterService extends VersionedItemService {
    constructor() {
        super(chapterStore);
    }

    /**
     * List all chapters (latest versions, with config-owned fields merged).
     *
     * @param {string} userId
     * @returns {Promise<Array<object>>}
     */
    async getAll(userId) {
        const tx = createTransaction(userId);
        try {
            const chapters = await this.getStore().findAll(tx);
            await commitTransaction(tx);
            return chapters.map(c => this._mergeConfigFields(c));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * @override — merges config fields after store read.
     */
    async getById(itemId, userId, editionId = null, projection = 'standard') {
        const result = await super.getById(itemId, userId, editionId, projection);
        return result ? this._mergeConfigFields(result) : null;
    }

    /**
     * @override — merges config fields after store read.
     */
    async getByIdAndVersion(itemId, versionNumber, userId) {
        const result = await super.getByIdAndVersion(itemId, versionNumber, userId);
        return result ? this._mergeConfigFields(result) : null;
    }

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    /**
     * Create is not supported — chapters are bootstrap-only.
     * @override
     */
    async _validateCreatePayload(_payload) {
        throw new Error('Chapter creation via API is not supported — chapters are managed by server bootstrap');
    }

    /**
     * @override
     */
    async _validateUpdatePayload(payload, _itemId) {
        this._validateChapterPayload(payload);
    }

    /**
     * Merge patch fields into current chapter state.
     * Both current and patchPayload use osHierarchy (object) — store handles serialization.
     *
     * @override
     * @param {object} current - Current chapter state from store (osHierarchy as object)
     * @param {object} patchPayload - Partial update payload (osHierarchy as object)
     * @returns {object}
     */
    async _computePatchedPayload(current, patchPayload) {
        return {
            narrative: patchPayload.narrative !== undefined ? patchPayload.narrative : current.narrative,
            osHierarchy: patchPayload.osHierarchy !== undefined ? patchPayload.osHierarchy : current.osHierarchy,
        };
    }

    /**
     * @override
     */
    _getDeltaFieldNames() {
        return ['narrative'];
    }

    // -------------------------------------------------------------------------
    // Config field merging
    // -------------------------------------------------------------------------

    /**
     * Merge config-owned fields (domain, position, parentKey) from edition-config.
     * Keyed on item.code (= chapter key stored at bootstrap).
     * Fields absent in config are set to null — does not throw for unknown codes
     * so that DB/config drift is visible rather than fatal at read time.
     *
     * @param {object} item
     * @returns {object}
     */
    _mergeConfigFields(item) {
        const configEntry = getChapterByCode(item.code);
        return {
            ...item,
            domain: configEntry?.domain ?? null,
            position: configEntry?.position ?? null,
            parentKey: configEntry?.parentKey ?? null,
        };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Validate chapter update/patch payload.
     * Only narrative and osHierarchy are user-editable.
     *
     * @param {object} payload
     */
    _validateChapterPayload(payload) {
        if (payload.narrative !== undefined && payload.narrative !== null &&
            typeof payload.narrative !== 'string') {
            throw new Error('Validation failed: narrative must be a string');
        }
        if (payload.osHierarchy !== undefined && payload.osHierarchy !== null) {
            this._validateOsHierarchy(payload.osHierarchy);
        }
    }

    /**
     * Validate OsHierarchy structure.
     * @param {object} hierarchy
     */
    _validateOsHierarchy(hierarchy) {
        if (typeof hierarchy !== 'object' || hierarchy === null) {
            throw new Error('Validation failed: osHierarchy must be an object');
        }
        if (!Array.isArray(hierarchy.topics)) {
            throw new Error('Validation failed: osHierarchy must have a topics array');
        }
        for (const topic of hierarchy.topics) {
            this._validateOsHierarchyTopic(topic);
        }
    }

    /**
     * Validate a single OsHierarchyTopic recursively.
     * @param {object} topic
     */
    _validateOsHierarchyTopic(topic) {
        if (typeof topic.topic !== 'string' || topic.topic.trim() === '') {
            throw new Error('Validation failed: each osHierarchy topic must have a non-empty topic string');
        }
        for (const field of ['ons', 'ors', 'ocs']) {
            if (!Array.isArray(topic[field])) {
                throw new Error(`Validation failed: osHierarchy topic.${field} must be an array`);
            }
            for (const id of topic[field]) {
                if (!Number.isInteger(id)) {
                    throw new Error(`Validation failed: osHierarchy topic.${field} must contain integers`);
                }
            }
        }
        if (topic.subtopics !== undefined) {
            if (!Array.isArray(topic.subtopics)) {
                throw new Error('Validation failed: osHierarchy topic.subtopics must be an array');
            }
            for (const sub of topic.subtopics) {
                this._validateOsHierarchyTopic(sub);
            }
        }
    }
}

export default new ChapterService();