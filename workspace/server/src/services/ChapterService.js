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
import { PortfolioChartGenerator } from './narrative/generators/PortfolioChartGenerator.js';
import { getChapterByCode, getChapters } from '../config/loader.js';
import { normalizeId } from '../../../shared/src/index.js';

/**
 * ChapterService provides versioned CRUD operations for Chapter entities.
 *
 * Chapters are config-owned (no create/delete via API — bootstrap-only).
 * Only narrative and osHierarchy are user-maintained.
 *
 * Inherits from VersionedItemService:
 * - update(itemId, payload, expectedVersionId, user)
 * - patch(itemId, patchPayload, expectedVersionId, user)
 * - getById(itemId, user, editionId?, projection?)
 * - getByIdAndVersion(itemId, versionNumber, user)
 *
 * History is served by AuditEventService.getItemHistory (Phase A) — not here.
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
     * @param {object} user — {id, role}
     * @returns {Promise<Array<object>>}
     */
    async getAll(user) {
        const tx = createTransaction(user.id, user.role);
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
    async update(itemId, payload, expectedVersionId, user) {
        await super.update(itemId, payload, expectedVersionId, user);
        return this.getById(itemId, user);
    }

    /**
     * @override — enriches the response after the base write so PATCH returns
     * the same read-shape as GET (osHierarchy items as {id, type, code, title}).
     */
    async patch(itemId, patchPayload, expectedVersionId, user) {
        await super.patch(itemId, patchPayload, expectedVersionId, user);
        return this.getById(itemId, user);
    }

    /**
     * @override — merges config fields and enriches osHierarchy after store read.
     * Chapters have no lifecycle; lifecycleFace is carried for base-signature
     * alignment and passed through (ChapterStore ignores it).
     */
    async getById(itemId, user, editionId = null, projection = 'extended', lifecycleFace = 'active') {
        const result = await super.getById(itemId, user, editionId, projection, lifecycleFace);
        if (!result) return null;
        const merged = this._mergeConfigFields(result);
        if (!this._hasHierarchyItems(merged.osHierarchy)) return merged;
        // Domain-scoped O* map: only O*s belonging to this chapter's domain, resolved in
        // the same context (live or edition) as the chapter read. Refs in osHierarchy that
        // fall outside this set — a soft-deleted O*, or one moved to another domain — are
        // dropped on read and logged (Mechanism 2). The intersection runs in every context
        // so the edition view matches what the user saw at capture time.
        const oStarMap = await this._buildOStarMap(user, merged.domain, editionId);
        return {
            ...merged,
            osHierarchy: this._enrichOsHierarchy(merged.osHierarchy, oStarMap, merged.code),
        };
    }

    /**
     * @override — merges config fields after store read (no enrichment on version history).
     */
    async getByIdAndVersion(itemId, versionNumber, user) {
        const result = await super.getByIdAndVersion(itemId, versionNumber, user);
        return result ? this._mergeConfigFields(result) : null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle — not applicable to chapters.
    // Chapters are config-owned scaffolding with no lifecycle edges beyond
    // LATEST_VERSION; these transitions/reads are overridden to throw, parallel
    // to ChapterStore's softDelete/restore/findInboundReferences overrides.
    // -------------------------------------------------------------------------

    async softDelete() {
        throw new Error('Validation failed: chapters cannot be soft deleted');
    }

    async restore() {
        throw new Error('Validation failed: chapters cannot be restored');
    }

    async getInboundReferences() {
        throw new Error('Validation failed: chapters have no lifecycle inbound-reference check');
    }

    /**
     * @override — chapters carry no domain and never cascade. The inherited no-op
     * is sufficient; this explicit override documents that a chapter write never
     * triggers a further chapter excise.
     */
    async _detachFromChapterOsHierarchy() {
        // no-op — chapters are not domain-scoped O* containers of themselves
    }

    // -------------------------------------------------------------------------
    // osHierarchy referential-integrity cascade (write path)
    //
    // Called by OperationalRequirementService / OperationalChangeService when an O*
    // leaves a domain chapter's scope (soft delete, or domain change). Runs inside
    // the triggering transaction so the chapter excise and the O* write commit
    // atomically. Writes a NEW ChapterVersion (append-only model preserved — any
    // ChapterVersion already captured by an edition is untouched) reusing the
    // triggering operation's changeSetCommit so the chapter edit is audited under
    // the same change set as the O* event that caused it.
    // -------------------------------------------------------------------------

    /**
     * Remove every reference to `itemId` from the osHierarchy of the chapter that
     * owns `domain`. No-op when the domain has no chapter, the chapter has no
     * osHierarchy, or the ref is not present. Writes a new ChapterVersion only when
     * the hierarchy actually changed.
     *
     * @param {number} itemId — the O* leaving the domain
     * @param {string} domain — the domain whose chapter must drop the ref
     * @param {object} changeSetCommit — {changeSetId, note} of the triggering op
     * @param {Transaction} tx — the live triggering transaction
     * @returns {Promise<void>}
     */
    async exciseOStarFromChapter(itemId, domain, changeSetCommit, tx) {
        if (!domain) return;

        const chapterConfig = getChapters().find(c => c.domain === domain);
        if (!chapterConfig) return;

        const chapter = await this.getStore().findByCode(chapterConfig.key, tx);
        if (!chapter || !chapter.osHierarchy) return;

        const targetId = normalizeId(itemId);
        const { hierarchy, changed } = this._removeOStarFromHierarchy(chapter.osHierarchy, targetId);
        if (!changed) return;

        await this.getStore().update(
            chapter.itemId,
            { narrative: chapter.narrative, osHierarchy: hierarchy },
            chapter.versionId,
            tx,
            changeSetCommit
        );
    }

    /**
     * Pure transform: return a copy of `hierarchy` with every occurrence of
     * `targetId` removed from ons/ors/ocs across all topics and subtopics, plus a
     * `changed` flag. Topics themselves are retained even if emptied — theme removal
     * is a separate, user-driven action (a domain change / delete must not silently
     * delete a topic).
     *
     * @param {object} hierarchy — { topics: OsHierarchyTopic[] } (write shape: bare ids)
     * @param {number} targetId — normalised id to strip
     * @returns {{ hierarchy: object, changed: boolean }}
     */
    _removeOStarFromHierarchy(hierarchy, targetId) {
        let changed = false;

        const stripArray = (ids) => {
            if (!Array.isArray(ids)) return ids;
            const kept = ids.filter(id => normalizeId(id) !== targetId);
            if (kept.length !== ids.length) changed = true;
            return kept;
        };

        const stripTopic = (topic) => ({
            ...topic,
            ons:       stripArray(topic.ons),
            ors:       stripArray(topic.ors),
            ocs:       stripArray(topic.ocs),
            subtopics: (topic.subtopics ?? []).map(stripTopic),
        });

        const next = {
            ...hierarchy,
            topics: (hierarchy.topics ?? []).map(stripTopic),
        };
        return { hierarchy: next, changed };
    }

    /**
     * Build a single lookup map of normalised itemId → {id, type, code, title}
     * from the requirements (ON + OR) and changes (OC) belonging to `domain`,
     * resolved in the given context (live when editionId is null, otherwise the
     * edition snapshot).
     *
     * Delegates to OperationalRequirementService and OperationalChangeService so
     * transaction lifecycle is owned by the service layer — no raw store calls.
     * Uses 'summary' projection to avoid fetching rich-text fields.
     *
     * The map is the live (or edition) domain O* set; it is the yardstick the read
     * filter intersects osHierarchy against. An O* absent from it is stale relative
     * to the chapter (soft-deleted, or moved to another domain) and is dropped.
     *
     * @param {object} user — {id, role}
     * @param {string|null} domain — chapter domain; null on pure narrative chapters
     * @param {number|null} editionId — context selector (null = live)
     * @returns {Promise<Map<number, {id: number, type: string, code: string, title: string}>>}
     */
    async _buildOStarMap(user, domain, editionId = null) {
        const filters = domain ? { domain } : {};
        const [requirements, changes] = await Promise.all([
            OperationalRequirementService.getAll(user, editionId, filters, 'summary').catch(() => []),
            OperationalChangeService.getAll(user, editionId, filters, 'summary').catch(() => []),
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
     * in ons/ors/ocs arrays with {id, type, code, title} objects, dropping any
     * id absent from the domain-scoped O* map (a stale ref: soft-deleted O*, or
     * one moved to another domain). Dropped ids are collected and logged once per
     * chapter at WARN — the filtering is invisible to the user but observable in
     * the server logs, and a signal that the write-time cascade missed a case or
     * that pre-existing dirty data exists.
     *
     * The stored structure uses bare ids on write; this enrichment is read-only and
     * does not affect the persisted form. The cascade (write path) is what actually
     * removes stale refs from storage; this filter only tolerates them on read.
     *
     * @param {object} hierarchy  — { topics: OsHierarchyTopic[] }
     * @param {Map}    oStarMap   — normalised itemId → {id, type, code, title}
     * @param {string} chapterCode — for the WARN log
     * @returns {object}
     */
    _enrichOsHierarchy(hierarchy, oStarMap, chapterCode) {
        if (!hierarchy?.topics) return hierarchy;
        const dropped = [];
        const enriched = {
            ...hierarchy,
            topics: hierarchy.topics.map(t => this._enrichTopic(t, oStarMap, dropped)),
        };
        if (dropped.length > 0) {
            console.warn(
                `[ChapterService] osHierarchy: dropped ${dropped.length} stale ref(s) ` +
                `in chapter ${chapterCode}: [${dropped.join(', ')}]`
            );
        }
        return enriched;
    }

    /**
     * Enrich a single topic recursively, dropping stale refs into `dropped`.
     * @param {object} topic
     * @param {Map}    oStarMap
     * @param {number[]} dropped — accumulator for ids not found in the map
     * @returns {object}
     */
    _enrichTopic(topic, oStarMap, dropped) {
        return {
            ...topic,
            ons:       this._resolveOStarArray(topic.ons, 'ON', oStarMap, dropped),
            ors:       this._resolveOStarArray(topic.ors, 'OR', oStarMap, dropped),
            ocs:       this._resolveOStarArray(topic.ocs, 'OC', oStarMap, dropped),
            subtopics: (topic.subtopics ?? []).map(sub => this._enrichTopic(sub, oStarMap, dropped)),
        };
    }

    /**
     * Resolve and filter one O* id array: keep ids present in the map (enriched),
     * drop the rest into `dropped`. Order is preserved.
     *
     * @param {number[]} ids
     * @param {string} impliedType — 'ON' | 'OR' | 'OC'
     * @param {Map} oStarMap
     * @param {number[]} dropped
     * @returns {Array<{id, type, code, title}>}
     */
    _resolveOStarArray(ids, impliedType, oStarMap, dropped) {
        const out = [];
        for (const rawId of (ids ?? [])) {
            const resolved = this._resolveOStarItem(rawId, impliedType, oStarMap);
            if (resolved) out.push(resolved);
            else dropped.push(rawId);
        }
        return out;
    }

    /**
     * Resolve a bare integer id to an enriched O* item, or null when the id is
     * absent from the domain-scoped map (stale ref — the caller drops and logs it).
     *
     * @param {number} rawId
     * @param {string} impliedType  — 'ON' | 'OR' | 'OC' (from array context)
     * @param {Map}    oStarMap
     * @returns {{ id: number, type: string, code: string, title: string }|null}
     */
    _resolveOStarItem(rawId, impliedType, oStarMap) {
        try {
            const nid = normalizeId(rawId);
            return oStarMap.get(nid) ?? null;
        } catch {
            return null;
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
     * @param {object} user — {id, role}
     * @returns {Promise<{ blocks: object, strings: object }>}
     *   blocks:  { [blockId]: node[] }  — TipTap node arrays ready for splicing
     *   strings: { [key]: string }      — inline string values ready for substitution
     */
    async resolveGeneratedContent(itemId, editionId, user) {
        const chapter = await this.getById(itemId, user, editionId, 'extended');
        if (!chapter) throw new Error(`Chapter ${itemId} not found`);

        const [blocks, strings] = await Promise.all([
            this._resolveAllBlocks(chapter.narrative, editionId, user),
            this._resolveStringKeys(chapter.availableStringKeys ?? [], editionId, user),
        ]);

        return { blocks, strings };
    }

    /**
     * Resolve all generated-block marks found in a narrative.
     *
     * @param {string|null} narrative
     * @param {number|null} editionId
     * @param {object} user — {id, role}
     * @returns {Promise<object>} { [blockId]: node[] }
     */
    async _resolveAllBlocks(narrative, editionId, user) {
        const blockIds = this._extractGeneratedBlockIds(narrative);
        if (blockIds.length === 0) return {};
        const entries = await Promise.all(
            blockIds.map(async id => [id, await this._resolveBlock(id, editionId, user)])
        );
        return Object.fromEntries(entries);
    }

    /**
     * Build the { refDoc → [ON] } map used by narrative generators.
     * Uses a single query to fetch all (ON, ReferenceDocument, note) triples,
     * then groups them in memory. No N+1 queries.
     *
     * @param {number|null} editionId
     * @param {object} user — {id, role}
     * @returns {Promise<{ refDocs: object[], onsByRefDocId: Map<number, object[]> }>}
     */
    async _buildRefDocMap(editionId, user) {
        const [refDocs, refs] = await Promise.all([
            ReferenceDocumentService.listItems(user),
            OperationalRequirementService.getONStrategicDocumentRefs(user, editionId),
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
     * @param {object} user — {id, role}
     * @returns {Promise<object[]>} TipTap node array — splice into narrative at placeholder position
     */
    async _resolveBlock(blockId, editionId, user) {
        switch (blockId) {
            case 'strategic-traceability': {
                const { refDocs, onsByRefDocId } = await this._buildRefDocMap(editionId, user);
                return StrategicTraceabilityGenerator.generate(refDocs, onsByRefDocId);
            }
            case 'portfolio-table': {
                const rows = await this._buildPortfolioTableData(editionId, user);
                return PortfolioTableGenerator.generate(rows);
            }
            case 'portfolio-chart': {
                const rows = await this._buildPortfolioChartData(editionId, user);
                return PortfolioChartGenerator.generate(rows);
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
     * @param {object} user — {id, role}
     * @returns {Promise<Array<object>>}
     */
    async _buildPortfolioTableData(editionId, user) {
        const allChapters  = getChapters();
        const dbChapters   = await this.getAll(user);
        const itemIdByCode = new Map(dbChapters.map(c => [c.code, c.itemId]));

        const statsByDomain = await OperationalRequirementService.getEditionStatsByDomain(
            user, editionId
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
     * @param {object} user — {id, role}
     * @returns {Promise<object>} { [key]: string }
     */
    /**
     * Build the chart row data from edition config and DB stats.
     * Only leaf domain chapters are included — no parent containers.
     *
     * @param {number|null} editionId
     * @param {object} user — {id, role}
     * @returns {Promise<Array<{ number, title, on, or }>>}
     */
    async _buildPortfolioChartData(editionId, user) {
        const allChapters   = getChapters();
        const statsByDomain = await OperationalRequirementService.getEditionStatsByDomain(
            user, editionId
        );

        const topLevelPosition = new Map(
            allChapters.filter(c => !c.parentKey).map(c => [c.key, c.position])
        );

        const rows = [];
        for (const chapter of allChapters) {
            if (!chapter.domain) continue;

            const number = chapter.parentKey
                ? `${topLevelPosition.get(chapter.parentKey)}.${chapter.position}`
                : String(chapter.position);

            const stats = statsByDomain.get(chapter.domain) ?? {
                onDraft: 0, onAdvanced: 0, onMature: 0,
                orDraft: 0, orAdvanced: 0, orMature: 0,
            };

            rows.push({
                number,
                title: chapter.title,
                on: { draft: stats.onDraft, advanced: stats.onAdvanced, mature: stats.onMature },
                or: { draft: stats.orDraft, advanced: stats.orAdvanced, mature: stats.orMature },
            });
        }

        return rows;
    }

    async _resolveStringKeys(keys, editionId, user) {
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
            const stats = await OperationalRequirementService.getEditionStats(user, editionId);
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