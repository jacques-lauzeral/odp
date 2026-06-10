import { VersionedItemService } from './VersionedItemService.js';
import {
    createTransaction,
    commitTransaction,
    rollbackTransaction,
    chapterStore,
} from '../store/index.js';
import OperationalRequirementService from './OperationalRequirementService.js';
import OperationalChangeService from './OperationalChangeService.js';
import ReferenceDocumentService from './ReferenceDocumentService.js';
import { StrategicTraceabilityGenerator } from './narrative/generators/StrategicTraceabilityGenerator.js';
import { PortfolioTableGenerator } from './narrative/generators/PortfolioTableGenerator.js';
import { getChapterByCode, getChapters } from '../config/loader.js';
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
 * - generatedBlocks is server-owned — never written by clients.
 *   Populated at edition creation via storeGeneratedBlocks(); resolved on demand
 *   for preview via resolveGeneratedContent().
 * - Config-owned fields (domain, position, parentCode, generatedBlocks IDs) are merged
 *   here from edition-config after every store read, keyed on item.code.
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
            // generatedBlocks is server-owned — never inherited from patchPayload
            generatedBlocks: current.generatedBlocks ?? null,
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
            domain:              configEntry?.domain            ?? null,
            position:            configEntry?.position          ?? null,
            parentCode:          configEntry?.parentKey         ?? configEntry?.parentCode ?? null,
            availableBlockIds:   configEntry?.generatedBlocks   ?? [],
            availableStringKeys: configEntry?.generatedStrings  ?? [],
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

    // -------------------------------------------------------------------------
    // Generated content (blocks + strings)
    // -------------------------------------------------------------------------

    /**
     * Resolve all generated content for a chapter in a single call.
     * Returns both block content (TipTap node arrays) and inline string values.
     * Ephemeral — result is NOT persisted. Used for ODIP-level preview in
     * elaborate mode and by the publication pipeline.
     *
     * Block and string resolution run in parallel.
     *
     * @param {number} itemId
     * @param {number|null} editionId
     * @param {string} userId
     * @returns {Promise<{ blocks: object, strings: object }>}
     *   blocks:  { [blockId]: node[] }  — TipTap node arrays ready for splicing
     *   strings: { [key]: string }      — inline string values ready for substitution
     */
    async resolveGeneratedContent(itemId, editionId, userId) {
        const chapter = await this.getById(itemId, userId, editionId, 'extended');
        if (!chapter) throw new Error(`Chapter ${itemId} not found`);

        const [blocks, strings] = await Promise.all([
            this._resolveAllBlocks(chapter.narrative, editionId, userId),
            this._resolveStringKeys(chapter.availableStringKeys ?? [], editionId, userId),
        ]);

        return { blocks, strings };
    }

    /**
     * Resolve all generated-block marks found in a narrative.
     *
     * @param {string|null} narrative
     * @param {number|null} editionId
     * @param {string} userId
     * @returns {Promise<object>} { [blockId]: node[] }
     */
    async _resolveAllBlocks(narrative, editionId, userId) {
        const blockIds = this._extractGeneratedBlockIds(narrative);
        if (blockIds.length === 0) return {};
        const entries = await Promise.all(
            blockIds.map(async id => [id, await this._resolveBlock(id, editionId, userId)])
        );
        return Object.fromEntries(entries);
    }

    /**
     * Build the { refDoc → [ON] } map used by narrative generators.
     * Uses a single query to fetch all (ON, ReferenceDocument, note) triples,
     * then groups them in memory. No N+1 queries.
     *
     * @param {number|null} editionId
     * @param {string} userId
     * @returns {Promise<{ refDocs: object[], onsByRefDocId: Map<number, object[]> }>}
     */
    async _buildRefDocMap(editionId, userId) {
        const [refDocs, refs] = await Promise.all([
            ReferenceDocumentService.listItems(userId),
            OperationalRequirementService.getONStrategicDocumentRefs(userId, editionId),
        ]);

        // Group refs by docId — each entry carries itemId, code, title, note
        const onsByRefDocId = new Map();
        for (const ref of refs) {
            const docId = normalizeId(ref.docId);
            if (!onsByRefDocId.has(docId)) onsByRefDocId.set(docId, []);
            onsByRefDocId.get(docId).push({
                itemId:   ref.itemId,
                code:     ref.code,
                title:    ref.title,
                _refNote: ref.note,
            });
        }

        return { refDocs, onsByRefDocId };
    }

    /**
     * Resolve a single generated block by ID.
     *
     * @param {string} blockId
     * @param {number|null} editionId
     * @param {string} userId
     * @returns {Promise<object[]>} TipTap node array — splice into narrative at placeholder position
     */
    async _resolveBlock(blockId, editionId, userId) {
        switch (blockId) {
            case 'strategic-traceability': {
                const { refDocs, onsByRefDocId } = await this._buildRefDocMap(editionId, userId);
                return StrategicTraceabilityGenerator.generate(refDocs, onsByRefDocId);
            }
            case 'portfolio-table': {
                const rows = await this._buildPortfolioTableData(editionId, userId);
                return PortfolioTableGenerator.generate(rows);
            }
            default:
                throw new Error(`Unknown generated block ID: ${blockId}`);
        }
    }

    /**
     * Build the portfolio table row data from edition config and DB stats.
     *
     * Row order follows edition.json: parent chapters appear before their
     * sub-chapters. Parent containers (no domain) get null ON/OR counts.
     * Chapters without domain that have no sub-chapters (intro, wayforward,
     * annexes) are excluded.
     *
     * @param {number|null} editionId
     * @param {string} userId
     * @returns {Promise<Array<object>>}
     */
    async _buildPortfolioTableData(editionId, userId) {
        const allChapters  = getChapters();
        const dbChapters   = await this.getAll(userId);
        const itemIdByCode = new Map(dbChapters.map(c => [c.code, c.itemId]));

        const statsByDomain = await OperationalRequirementService.getEditionStatsByDomain(
            userId, editionId
        );

        // Map top-level key → position for building sub-chapter numbers (e.g. "2.1")
        const topLevelPosition = new Map(
            allChapters.filter(c => !c.parentKey).map(c => [c.key, c.position])
        );

        // Set of keys that are parent containers (have at least one sub-chapter)
        const parentKeys = new Set(
            allChapters.filter(c => c.parentKey).map(c => c.parentKey)
        );

        const rows = [];
        for (const chapter of allChapters) {
            const isParent = parentKeys.has(chapter.key);
            // Include: chapters with a domain, or parent containers
            if (!chapter.domain && !isParent) continue;

            const itemId = itemIdByCode.get(chapter.key);
            if (!itemId) continue; // not bootstrapped — skip

            const number = chapter.parentKey
                ? `${topLevelPosition.get(chapter.parentKey)}.${chapter.position}`
                : String(chapter.position);

            let onCount, orCount;
            if (chapter.domain) {
                // Leaf domain chapter — direct stats lookup
                const stats = statsByDomain.get(chapter.domain);
                onCount = String(stats?.onTotal ?? 0);
                orCount = String(stats?.orTotal ?? 0);
            } else {
                // Parent container — sum stats across all child domains
                const children = allChapters.filter(c => c.parentKey === chapter.key && c.domain);
                const onTotal  = children.reduce((s, c) => s + (statsByDomain.get(c.domain)?.onTotal ?? 0), 0);
                const orTotal  = children.reduce((s, c) => s + (statsByDomain.get(c.domain)?.orTotal ?? 0), 0);
                onCount = String(onTotal);
                orCount = String(orTotal);
            }

            rows.push({
                number,
                title:        chapter.title,
                itemId,
                onCount,
                orCount,
                primaryScope: chapter.primaryScope ?? '',
                isAggregate:  isParent,
            });
        }

        return rows;
    }

    /**
     * Resolve a set of generated-string keys into their string values.
     * Config-derived keys (chapter-count, sub-chapter-count) are computed
     * locally; all O* count keys share a single getEditionStats() call.
     *
     * @param {string[]} keys
     * @param {number|null} editionId
     * @param {string} userId
     * @returns {Promise<object>} { [key]: string }
     */
    async _resolveStringKeys(keys, editionId, userId) {
        const result = {};

        const configKeys = ['chapter-count', 'sub-chapter-count'];
        const needsConfig = keys.some(k => configKeys.includes(k));
        if (needsConfig) {
            const { chapterCount, subChapterCount } = this._resolveConfigCounts();
            if (keys.includes('chapter-count'))     result['chapter-count']     = String(chapterCount);
            if (keys.includes('sub-chapter-count')) result['sub-chapter-count'] = String(subChapterCount);
        }

        const statsKeys = keys.filter(k => !configKeys.includes(k));
        if (statsKeys.length > 0) {
            const stats = await OperationalRequirementService.getEditionStats(userId, editionId);
            const statsMap = {
                'on-total-count':    String(stats.onTotalCount),
                'on-draft-count':    String(stats.onDraftCount),
                'on-advanced-count': String(stats.onAdvancedCount),
                'on-mature-count':   String(stats.onMatureCount),
                'or-total-count':    String(stats.orTotalCount),
                'or-draft-count':    String(stats.orDraftCount),
                'or-advanced-count': String(stats.orAdvancedCount),
                'or-mature-count':   String(stats.orMatureCount),
            };
            for (const key of statsKeys) {
                if (key in statsMap) result[key] = statsMap[key];
            }
        }

        return result;
    }

    /**
     * Derive chapter and sub-chapter counts from edition config.
     * - chapterCount    = top-level chapters that carry a domain and have no sub-chapters
     *                     (i.e. standalone domain chapters, excluding parent containers)
     * - subChapterCount = all sub-chapters across all parent chapters
     *
     * @returns {{ chapterCount: number, subChapterCount: number }}
     */
    _resolveConfigCounts() {
        const allChapters = getChapters();
        return {
            chapterCount:    allChapters.filter(c => c.domain && !c.parentKey).length,
            subChapterCount: allChapters.filter(c => !!c.parentKey).length,
        };
    }

    /**
     * Extract all unique generated-block IDs from a TipTap narrative JSON string.
     *
     * @param {string|null} narrative
     * @returns {string[]}
     */
    _extractGeneratedBlockIds(narrative) {
        if (!narrative) return [];
        try {
            const doc = typeof narrative === 'string' ? JSON.parse(narrative) : narrative;
            const ids = new Set();
            this._walkTipTap(doc, ids);
            return [...ids];
        } catch {
            return [];
        }
    }

    /**
     * Recursively walk a TipTap document collecting generated-block mark IDs.
     *
     * @param {object} node
     * @param {Set<string>} ids
     */
    _walkTipTap(node, ids) {
        if (!node) return;
        if (node.marks) {
            for (const mark of node.marks) {
                if (mark.type === 'generated-block' && mark.attrs?.id) {
                    ids.add(mark.attrs.id);
                }
            }
        }
        if (Array.isArray(node.content)) {
            for (const child of node.content) {
                this._walkTipTap(child, ids);
            }
        }
    }

    /**
     * Substitute generated-block marks in a TipTap narrative JSON string with
     * the resolved node arrays. Server-side equivalent of the client-side
     * _substituteGeneratedBlocks — used by ODPEditionService before publication.
     *
     * @param {string} narrativeJson   — TipTap JSON string (chapter narrative)
     * @param {object} generatedBlocks — { [blockId]: node[] }
     * @returns {string} — merged TipTap JSON string
     */
    _substituteNarrativeBlocks(narrativeJson, generatedBlocks) {
        try {
            const doc = JSON.parse(narrativeJson);
            if (doc.type !== 'doc' || !Array.isArray(doc.content)) return narrativeJson;

            const substitute = (nodes) => {
                const result = [];
                for (const node of nodes) {
                    // Check if this block node (paragraph etc.) contains only a
                    // generated-block mark text node — if so replace the whole block.
                    if (Array.isArray(node.content)) {
                        const blockMark = node.content.length === 1
                            ? node.content[0].marks?.find(m => m.type === 'generated-block')
                            : null;
                        if (blockMark) {
                            const blockId = blockMark.attrs?.id;
                            const resolved = blockId && generatedBlocks[blockId];
                            if (resolved && Array.isArray(resolved) && resolved.length > 0) {
                                result.push(...resolved);
                                continue;
                            }
                        }
                        result.push({ ...node, content: substitute(node.content) });
                    } else {
                        result.push(node);
                    }
                }
                return result;
            };

            return JSON.stringify({ ...doc, content: substitute(doc.content) });
        } catch {
            return narrativeJson;
        }
    }

    /**
     * Substitute generated-string marks in a TipTap narrative JSON string with
     * their resolved plain-text values. Walks the document recursively; each
     * text node carrying a generated-string mark is replaced with a plain text
     * node containing the resolved value (mark removed).
     * Used by ODPEditionService before publication.
     *
     * @param {string} narrativeJson    — TipTap JSON string (chapter narrative)
     * @param {object} generatedStrings — { [key]: string }
     * @returns {string} — merged TipTap JSON string
     */
    _substituteNarrativeStrings(narrativeJson, generatedStrings) {
        try {
            const doc = JSON.parse(narrativeJson);
            if (doc.type !== 'doc' || !Array.isArray(doc.content)) return narrativeJson;

            const substituteInline = (nodes) => nodes.map(node => {
                if (node.type === 'text' && Array.isArray(node.marks)) {
                    const stringMark = node.marks.find(m => m.type === 'generated-string');
                    if (stringMark) {
                        const key = stringMark.attrs?.key;
                        if (key !== undefined && key in generatedStrings) {
                            return { type: 'text', text: generatedStrings[key] };
                        }
                    }
                }
                if (Array.isArray(node.content)) {
                    return { ...node, content: substituteInline(node.content) };
                }
                return node;
            });

            return JSON.stringify({ ...doc, content: substituteInline(doc.content) });
        } catch {
            return narrativeJson;
        }
    }
}

export default new ChapterService();