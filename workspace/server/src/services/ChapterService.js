import { VersionedItemService } from './VersionedItemService.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    chapterStore
} from '../store/index.js';

/**
 * ChapterService provides versioned CRUD operations for Chapter entities.
 *
 * Chapters are config-owned (no create/delete via API — bootstrap-only).
 * Only narrative and jsonOsHierarchy are user-maintained.
 *
 * Inherits from VersionedItemService:
 * - update(itemId, payload, expectedVersionId, userId)
 * - patch(itemId, patchPayload, expectedVersionId, userId)
 * - getById(itemId, userId, editionId?, projection?)
 * - getByIdAndVersion(itemId, versionNumber, userId)
 * - getVersionHistory(itemId, userId)
 *
 * Does NOT expose: create(), delete() — chapters are bootstrap-only.
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
            return chapters;
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
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
     * @override
     */
    async _computePatchedPayload(current, patchPayload) {
        return {
            narrative: patchPayload.narrative !== undefined ? patchPayload.narrative : current.narrative,
            jsonOsHierarchy: patchPayload.jsonOsHierarchy !== undefined ? patchPayload.jsonOsHierarchy : current.jsonOsHierarchy,
        };
    }

    /**
     * @override
     */
    _getDeltaFieldNames() {
        return ['narrative'];
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Validate chapter update/patch payload.
     * Only narrative and jsonOsHierarchy are user-editable.
     *
     * @param {object} payload
     */
    _validateChapterPayload(payload) {
        if (payload.narrative !== undefined && payload.narrative !== null &&
            typeof payload.narrative !== 'string') {
            throw new Error('Validation failed: narrative must be a string');
        }
        if (payload.jsonOsHierarchy !== undefined && payload.jsonOsHierarchy !== null) {
            this._validateOsHierarchy(payload.jsonOsHierarchy);
        }
    }

    /**
     * Validate OsHierarchy structure.
     * @param {object} hierarchy
     */
    _validateOsHierarchy(hierarchy) {
        if (typeof hierarchy !== 'object' || hierarchy === null) {
            throw new Error('Validation failed: jsonOsHierarchy must be an object');
        }
        if (!Array.isArray(hierarchy.topics)) {
            throw new Error('Validation failed: jsonOsHierarchy must have a topics array');
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