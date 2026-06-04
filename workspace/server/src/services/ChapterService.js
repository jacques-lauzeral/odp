import { VersionedItemService } from './VersionedItemService.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    chapterStore,
} from '../store/index.js';
import OperationalRequirementService from './OperationalRequirementService.js';
import OperationalChangeService from './OperationalChangeService.js';
import { getChapterByCode } from '../config/loader.js';
import { normalizeId } from '../../../shared/src/index.js';

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
 * - Config-owned fields (domain, position, parentCode) are merged here
 *   from edition-config after every store read, keyed on item.code.
 * - osHierarchy items are enriched on read: bare integer ids replaced with
 *   { id, type, code, title } objects resolved from O* stores.
 *   On write, callers still send bare integer ids — validation unchanged.
 */
export class ChapterService extends VersionedItemService {
    constructor() {
        super(chapterStore);
    }

    /**
     * List all chapters (latest versions, config-owned fields merged).
     * Uses 'standard' projection — narrative and osHierarchy are excluded.
     * O* enrichment is not performed on the list path; retrieve individual
     * chapters via getById (which uses 'extended' projection) when full
     * content is needed.
     *
     * @param {string} userId
     * @returns {Promise<Array<object>>}
     */
    async getAll(userId) {
        const tx = createTransaction(userId);
        try {
            const chapters = await this.getStore().findAll(tx, 'standard');
            await commitTransaction(tx);
            return chapters.map(c => this._mergeConfigFields(c));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * @override — enriches the response after the base write so PUT returns
     * the same read-shape as GET (osHierarchy items as {id, type, code, title}).
     */
    async update(itemId, payload, expectedVersionId, userId) {
        await super.update(itemId, payload, expectedVersionId, userId);
        return this.getById(itemId, userId);
    }

    /**
     * @override — enriches the response after the base write so PATCH returns
     * the same read-shape as GET (osHierarchy items as {id, type, code, title}).
     */
    async patch(itemId, patchPayload, expectedVersionId, userId) {
        await super.patch(itemId, patchPayload, expectedVersionId, userId);
        return this.getById(itemId, userId);
    }

    /**
     * @override — merges config fields and enriches osHierarchy after store read.
     */
    async getById(itemId, userId, editionId = null, projection = 'extended') {
        const result = await super.getById(itemId, userId, editionId, projection);
        if (!result) return null;
        const merged = this._mergeConfigFields(result);
        if (!this._hasHierarchyItems(merged.osHierarchy)) return merged;
        const oStarMap = await this._buildOStarMap(userId);
        return {
            ...merged,
            osHierarchy: this._enrichOsHierarchy(merged.osHierarchy, oStarMap),
        };
    }

    /**
     * @override — merges config fields after store read (no enrichment on version history).
     */
    async getByIdAndVersion(itemId, versionNumber, userId) {
        const result = await super.getByIdAndVersion(itemId, versionNumber, userId);
        return result ? this._mergeConfigFields(result) : null;
    }

    // -------------------------------------------------------------------------
    // O* enrichment
    // -------------------------------------------------------------------------

    /**
     * Build a single lookup map of normalised itemId → {id, type, code, title}
     * from all requirements (ON + OR) and all changes (OC) in one pass.
     *
     * Delegates to OperationalRequirementService and OperationalChangeService so
     * transaction lifecycle is owned by the service layer — no raw store calls.
     * Uses 'summary' projection to avoid fetching rich-text fields.
     *
     * @param {string} userId
     * @returns {Promise<Map<number, {id: number, type: string, code: string, title: string}>>}
     */
    async _buildOStarMap(userId) {
        const [requirements, changes] = await Promise.all([
            OperationalRequirementService.getAll(userId, null, {}, 'summary').catch(() => []),
            OperationalChangeService.getAll(userId, null, {}, 'summary').catch(() => []),
        ]);

        const map = new Map();
        for (const r of requirements) {
            const nid = normalizeId(r.itemId);
            map.set(nid, { id: nid, type: r.type, code: r.code, title: r.title });
        }
        for (const c of changes) {
            const nid = normalizeId(c.itemId);
            map.set(nid, { id: nid, type: 'OC', code: c.code, title: c.title });
        }
        return map;
    }

    /**
     * Recursively enrich an OsHierarchy object — replace bare integer ids
     * in ons/ors/ocs arrays with {id, type, code, title} objects.
     * Unknown ids are preserved as {id, type, code: null, title: null}.
     *
     * The stored structure uses bare ids on write; this enrichment is
     * read-only and does not affect the persisted form.
     *
     * @param {object} hierarchy  — { topics: OsHierarchyTopic[] }
     * @param {Map}    oStarMap   — normalised itemId → {id, type, code, title}
     * @returns {object}
     */
    _enrichOsHierarchy(hierarchy, oStarMap) {
        if (!hierarchy?.topics) return hierarchy;
        return {
            ...hierarchy,
            topics: hierarchy.topics.map(t => this._enrichTopic(t, oStarMap)),
        };
    }

    /**
     * Enrich a single topic recursively.
     * @param {object} topic
     * @param {Map}    oStarMap
     * @returns {object}
     */
    _enrichTopic(topic, oStarMap) {
        return {
            ...topic,
            ons:       (topic.ons ?? []).map(id => this._resolveOStarItem(id, 'ON',  oStarMap)),
            ors:       (topic.ors ?? []).map(id => this._resolveOStarItem(id, 'OR',  oStarMap)),
            ocs:       (topic.ocs ?? []).map(id => this._resolveOStarItem(id, 'OC',  oStarMap)),
            subtopics: (topic.subtopics ?? []).map(sub => this._enrichTopic(sub, oStarMap)),
        };
    }

    /**
     * Resolve a bare integer id to an enriched O* item.
     * Falls back gracefully if id not found in map.
     *
     * @param {number} rawId
     * @param {string} impliedType  — 'ON' | 'OR' | 'OC' (from array context)
     * @param {Map}    oStarMap
     * @returns {{ id: number, type: string, code: string|null, title: string|null }}
     */
    _resolveOStarItem(rawId, impliedType, oStarMap) {
        try {
            const nid = normalizeId(rawId);
            const found = oStarMap.get(nid);
            if (found) return found;
            return { id: nid, type: impliedType, code: null, title: null };
        } catch {
            return { id: rawId, type: impliedType, code: null, title: null };
        }
    }

    /**
     * Returns true if the osHierarchy contains any O* id references.
     * @param {object|null} hierarchy
     * @returns {boolean}
     */
    _hasHierarchyItems(hierarchy) {
        if (!hierarchy?.topics) return false;
        const check = (topics) => topics.some(t =>
            (t.ons?.length > 0) || (t.ors?.length > 0) || (t.ocs?.length > 0) ||
            check(t.subtopics ?? [])
        );
        return check(hierarchy.topics);
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
     * @param {object} current      — Current chapter state from store (osHierarchy as object)
     * @param {object} patchPayload — Partial update payload (osHierarchy as object)
     * @returns {object}
     */
    async _computePatchedPayload(current, patchPayload) {
        return {
            narrative:   patchPayload.narrative   !== undefined ? patchPayload.narrative   : current.narrative,
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
     * Merge config-owned fields (domain, position, parentCode) from edition-config.
     * Keyed on item.code. parentKey renamed to parentCode for consistency.
     * Fields absent in config are set to null.
     *
     * @param {object} item
     * @returns {object}
     */
    _mergeConfigFields(item) {
        const configEntry = getChapterByCode(item.code);
        return {
            ...item,
            domain:     configEntry?.domain     ?? null,
            position:   configEntry?.position   ?? null,
            parentCode: configEntry?.parentKey  ?? configEntry?.parentCode ?? null,
        };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Validate chapter update/patch payload.
     * Only narrative and osHierarchy are user-editable.
     * osHierarchy items are validated as bare integer ids on write.
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
     * Validate OsHierarchy structure (write path — items are bare integer ids).
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
     * Validate a single OsHierarchyTopic recursively (write path).
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