/**
 * @file narrative.js
 * @description Narrative sub-activity. Editorial workspace for chapter narrative
 * and O* organisation within ODIP editions.
 *
 * Layout:
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │ Left panel (TOC)     │ Body (right panel)           │
 *   │                      │                              │
 *   │ ODIP scope:          │ chapter narrative (R/O)      │
 *   │   chapter tree       │   or topic card list         │
 *   │   expand/collapse    │   or O* detail               │
 *   │   select / dive →    │                              │
 *   │                      │                              │
 *   │ Chapter scope:       │ chapter narrative (default)  │
 *   │   ← back             │   or topic card list         │
 *   │   chapter title ←    │   or O* detail               │
 *   │   topic → O*s        │                              │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * Scope state machine:
 *   'odip'    — full chapter tree
 *   'chapter' — single chapter TOC; default: chapter narrative
 *
 * Edit (Elaborate only): always as popup, consistent with elaborate/os.
 *
 * SubPath routing:
 *   []               → ODIP scope (chapter tree)
 *   ['{chapterId}']  → chapter scope (dive directly into chapter)
 *
 * Query parameters:
 *   ?theme={topicPath}  → after diving, select matching topic in chapter TOC
 *
 * URL updates:
 *   Dive into chapter → pushState /{base}/narrative/{chapterId}
 *   Climb via button  → pushState /{base}/narrative
 *   Climb via back    → no history entry (popstate already updated URL)
 *
 * Context from app.getDatasetContext():
 *   { type: 'live' }               → isEditable: true  (Elaborate)
 *   { type: 'edition', editionId } → isEditable: false (Explore)
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { dom } from '../../../../shared/utils.js';
import { normalizeId } from '../../../../shared/src/index.js';
import MasterDetail from '../../../../components/master-detail.js';
import ChapterToc from './chapter-toc.js';
import ChapterBody from './chapter-body.js';

export default class NarrativeActivity {
    /** @param {import('../../../../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container        = null;
        this._masterDetail    = null;
        this._toc             = null;
        this._body            = null;
        this._chapters        = [];
        this._chapterMap      = new Map();
        this._isEditable      = false;

        // Scope state
        this._scope           = 'odip';   // 'odip' | 'chapter'
        this._selectedChapter = null;     // chapter currently dived into
        this._odipSelection   = null;     // last ODIP-scope selection (chapter itemId)
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /**
     * @param {HTMLElement} container
     * @param {string[]}    subPath
     */
    async render(container, subPath = []) {
        this.container = container;

        const ctx = this.app.getDatasetContext();
        this._isEditable = ctx?.type === 'live';

        this.container.innerHTML = '<div class="narrative-loading"><p>Loading…</p></div>';

        try {
            this._chapters   = await this.app.getChapters();
            this._chapterMap = new Map(this._chapters.map(c => [normalizeId(c.itemId), c]));
        } catch (error) {
            errorHandler.handle(error, 'narrative');
            this.container.innerHTML =
                '<div class="activity-placeholder"><p>Failed to load chapters.</p></div>';
            return;
        }

        this._scope           = 'odip';
        this._selectedChapter = null;
        this._odipSelection   = null;

        this._renderShell();

        const chapterId = this._parseChapterId(subPath);
        if (chapterId != null) {
            const chapter = this._chapterMap.get(chapterId)
                ?? this._chapters.find(c => normalizeId(c.itemId) === chapterId)
                ?? null;
            if (chapter) {
                await this._diveIntoChapter(chapter, /* pushState */ false);
                // Select topic if ?theme= query param is present
                const topic = new URLSearchParams(window.location.search).get('theme');
                if (topic) this._selectTopic(topic);
                return;
            }
        }

        // Default: ODIP scope
        this._toc.renderOdip(this._chapters, null);
        this._body.renderOdipPlaceholder();
    }

    async handleSubPath(subPath) {
        // If chapters not yet loaded fall back to full render
        if (!this._chapters.length || !this._toc || !this._body) {
            return this.render(this.container, subPath);
        }

        const chapterId = this._parseChapterId(subPath);

        if (chapterId == null) {
            this._climbToOdip();
            return;
        }

        const chapter = this._chapterMap.get(chapterId)
            ?? this._chapters.find(c => normalizeId(c.itemId) === chapterId)
            ?? null;

        if (!chapter) return;

        if (this._scope === 'chapter' &&
            this._selectedChapter &&
            normalizeId(this._selectedChapter.itemId) === chapterId) {
            // Already in this chapter — nothing to do
            return;
        }

        await this._diveIntoChapter(chapter, /* pushState */ false);
        // Select topic if ?theme= query param is present
        const topic = new URLSearchParams(window.location.search).get('theme');
        if (topic) this._selectTopic(topic);
    }

    async cleanup() {
        this._toc?.cleanup?.();
        this._body?.cleanup?.();
        this._masterDetail?.cleanup();
        this._masterDetail    = null;
        this._toc             = null;
        this._body            = null;
        this._chapters        = [];
        this._chapterMap      = new Map();
        this._selectedChapter = null;
        this._odipSelection   = null;
        this.container        = null;
    }

    // -------------------------------------------------------------------------
    // Shell
    // -------------------------------------------------------------------------

    _renderShell() {
        this.container.innerHTML = `
            <div class="narrative-activity">
                <div class="narrative-content" id="narrativeContent"></div>
            </div>
        `;

        const contentEl = dom.find('#narrativeContent', this.container);

        this._masterDetail = new MasterDetail(contentEl, { initialRatio: 0.28 });
        this._masterDetail.render();

        this._toc = new ChapterToc(this._masterDetail.listContainer, {
            isEditable:           this._isEditable,
            chapters:             this._chapters,
            chapterMap:           this._chapterMap,
            onOdipSelect:         (entry)   => this._handleOdipSelect(entry),
            onDive:               (chapter) => this._diveIntoChapter(chapter),
            onClimb:              ()        => this._climbToOdip(true),
            onChapterSelect:      (entry)   => this._handleChapterTocSelect(entry),
            buildOrderedChapters: ()        => this._buildOrderedChapters(),
            onHierarchyChange:    (hier)    => this._handleHierarchyChange(hier),
            onUnclassifiedChange: (hier)    => this._handleUnclassifiedChange(hier),
        });

        this._body = new ChapterBody(this._masterDetail.detailContainer, {
            app:              this.app,
            isEditable:       this._isEditable,
            onSaved:          (_id) => { /* versionId updated in place */ },
            onChapterSelect:  (entry) => this._handleChapterTocSelect(entry),
        });
    }

    // -------------------------------------------------------------------------
    // ODIP scope — chapter tree interactions
    // -------------------------------------------------------------------------

    /**
     * User selected a node in ODIP scope (chapter, topic, or O*).
     * Body always shown read-only — no editing from ODIP full TOC.
     * @param {{ type: string, chapter: object, topic?: object, ostar?: object }} entry
     */
    async _handleOdipSelect(entry) {
        const chapter = entry.chapter;
        this._odipSelection = chapter.itemId;

        const full = await this._loadChapter(chapter);
        if (!full) return;

        if (entry.type === 'chapter') {
            this._body.renderSelectionRead({ type: 'chapter' }, full, true);
        } else if (entry.type === 'topic') {
            this._body.renderSelectionRead({ type: 'topic', topic: entry.topic }, full, true);
        } else if (entry.type === 'ostar') {
            this._body.renderSelectionRead({ type: 'ostar', ostar: entry.ostar }, full, true);
        }
    }

    /**
     * User clicked dive (→) on a chapter node. Switches to chapter scope and
     * renders the chapter narrative by default.
     * @param {object}  chapter
     * @param {boolean} [pushState=true]
     */
    async _diveIntoChapter(chapter, pushState = true) {
        const full = await this._loadChapter(chapter);
        if (!full) return;

        this._scope           = 'chapter';
        this._selectedChapter = full;

        if (pushState) {
            const chapterId = normalizeId(full.itemId);
            window.history.pushState({}, '', `${this._basePath()}/${chapterId}`);
        }

        const unassigned = await this._computeUnassignedOStars(full);
        await this._toc.renderChapter(full, unassigned);
        this._body.renderSelectionRead({ type: 'chapter' }, full);
    }

    // -------------------------------------------------------------------------
    // Chapter scope — climb back to ODIP
    // -------------------------------------------------------------------------

    /**
     * Select a topic entry in the chapter TOC by its anchor path value.
     * Called after diving into a chapter via an n-ref link with a topic segment.
     *
     * Anchor format from source JSON: theme_{chapterPos}_{topicSeq}
     * where topicSeq is a 1-based counter starting at 2 for the first topic.
     * Zero-based index into osHierarchy.topics = last numeric suffix − 2.
     *
     * Silently ignores unresolvable topic paths.
     * @param {string} topicPath — anchor value from the n-ref (e.g. 'theme_2_2_2')
     * @private
     */
    /**
     * Select a topic in the chapter TOC by its numeric ID.
     * Called after n-ref navigation with a topic segment.
     * @param {string} topicId — numeric topic ID (e.g. '1', '2')
     * @private
     */
    _selectTopic(topicId) {
        if (!this._selectedChapter || !topicId) return;

        const topics = this._selectedChapter.osHierarchy?.topics;
        if (!topics?.length) return;

        const idx = topics.findIndex(t => t.id === topicId);
        if (idx < 0) {
            console.debug('[NarrativeActivity] _selectTopic: no topic with id', topicId);
            return;
        }

        this._toc.selectTopicByIndex(idx);
    }

    async _climbToOdip(viaButton = false) {
        this._selectedChapter = null;
        this._scope           = 'odip';

        if (viaButton) {
            window.history.pushState({}, '', this._basePath());
        }

        this._toc.renderOdip(this._chapters, this._odipSelection);

        // Restore the body for the previously selected chapter, if any —
        // matching the TOC highlight. Read-only: ODIP scope never edits.
        if (this._odipSelection != null) {
            const selId  = normalizeId(this._odipSelection);
            const chapter = this._chapterMap.get(selId)
                ?? this._chapters.find(c => normalizeId(c.itemId) === selId)
                ?? null;
            const full = chapter ? await this._loadChapter(chapter) : null;
            if (full) {
                this._body.renderSelectionRead({ type: 'chapter' }, full, true);
                return;
            }
        }

        this._body.renderOdipPlaceholder();
    }

    // -------------------------------------------------------------------------
    // Chapter scope — TOC selection
    // -------------------------------------------------------------------------

    /**
     * User clicked a TOC entry in chapter scope (topic, O*, or chapter title),
     * or navigated from a body O* card. Updates TOC selection and renders body.
     * @param {object} entry
     */
    _handleChapterTocSelect(entry) {
        if (entry.type === 'ostar' && entry.ostar?.id != null) {
            this._toc.setActiveByItemId(entry.ostar.id);
        }
        this._body.renderSelectionRead(entry, this._selectedChapter);
    }

    // -------------------------------------------------------------------------
    // Hierarchy DnD save
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterToc after each successful drag-and-drop mutation.
     * Serializes the render-shape hierarchy to the write shape and PATCHes the chapter.
     * Updates _selectedChapter.osHierarchy in place on success.
     * @param {object[]} hierarchy — render-shape topic array from ChapterToc._hierarchy
     */
    async _handleHierarchyChange(hierarchy) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));

        try {
            const updated = await apiClient.patchChapter(chapter.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: chapter.versionId,
            });
            if (updated?.versionId) chapter.versionId = updated.versionId;
            // Persist the enriched read-shape so subsequent dives don't reload stale data.
            // Server returns enriched topics; if absent fall back to write shape so at least
            // ids are consistent.
            if (updated?.osHierarchy) {
                chapter.osHierarchy = updated.osHierarchy;
            }
        } catch (error) {
            errorHandler.handle(error, 'narrative-hierarchy-save');
        }
    }

    /**
     * Called by ChapterToc when an O* moves into or out of the <unclassified> bucket.
     * The mutated hierarchy (without the unclassified O*) is already applied client-side.
     * We PATCH the chapter, then recompute unassigned O*s and re-render the TOC so the
     * bucket reflects the new state without a full chapter reload.
     * @param {object[]} hierarchy — mutated render-shape hierarchy
     */
    async _handleUnclassifiedChange(hierarchy) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));

        try {
            const updated = await apiClient.patchChapter(chapter.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: chapter.versionId,
            });
            if (updated?.versionId) chapter.versionId = updated.versionId;
            if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
        } catch (error) {
            errorHandler.handle(error, 'narrative-unclassified-save');
            return;
        }

        // Use the render-shape hierarchy passed by ChapterToc directly.
        // Re-parsing from chapter.osHierarchy would lose code/title if the PATCH
        // response contains write-shape (integer) arrays instead of enriched objects.
        this._toc._hierarchy = hierarchy;

        // Mark chapter as needing a fresh server fetch on next dive so the
        // in-memory osHierarchy is re-enriched from the server projection.
        chapter._fullyLoaded = false;

        // Recompute unclassified from the updated O* cache and re-render.
        const unassigned = await this._computeUnassignedOStars(chapter);
        this._toc._unassignedOStars = unassigned;
        this._toc._renderChapterTree();
    }

    /**
     * Convert a single render-shape topic node back to the write shape.
     * Render shape:  { topic, items: [{ id, type, ... }], subTopics: [...], narrative? }
     * Write shape:   { id, topic, narrative, ons: [int], ors: [int], ocs: [int], subtopics: [...] }
     *
     * The topic `id` is preserved from the original osHierarchy so that n-ref
     * marks that reference topic IDs remain valid after reordering.
     * If a topic node has no id (e.g. freshly created client-side), it is omitted
     * and the server will assign one on the next full load.
     *
     * @param {object} node — render-shape topic node
     * @returns {object}    — write-shape topic node
     */
    _hierarchyToWrite(node) {
        const ons = [];
        const ors = [];
        const ocs = [];

        for (const item of node.items ?? []) {
            const id   = parseInt(item.id ?? item.itemId, 10);
            const type = (item.type ?? 'OR').toUpperCase();
            if (!Number.isFinite(id)) continue;
            if (type === 'ON')      ons.push(id);
            else if (type === 'OC') ocs.push(id);
            else                    ors.push(id);
        }

        const result = {
            topic:     node.topic ?? '',
            narrative: node.narrative ?? null,
            ons,
            ors,
            ocs,
            subtopics: (node.subTopics ?? []).map(s => this._hierarchyToWrite(s)),
        };

        // Preserve the stable topic id if present
        if (node.id != null) result.id = node.id;

        return result;
    }

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Unclassified O* computation
    // -------------------------------------------------------------------------

    /**
     * Collect all O* item IDs already referenced in the osHierarchy tree.
     * @param {object[]} topics
     * @returns {Set<number>}
     */
    _collectHierarchyIds(topics) {
        const ids = new Set();
        const walk = (nodes) => {
            for (const t of nodes ?? []) {
                for (const item of [...(t.ons ?? []), ...(t.ors ?? []), ...(t.ocs ?? [])]) {
                    const id = item?.id ?? item?.itemId ?? item;
                    if (id != null) ids.add(Number(id));
                }
                walk(t.subtopics ?? []);
            }
        };
        walk(topics);
        return ids;
    }

    /**
     * Compute O*s in the chapter's domain not referenced in any hierarchy topic.
     * Returns [] for pure narrative chapters (no domain).
     * @param {object} chapter
     * @returns {Promise<Array>}
     */
    async _computeUnassignedOStars(chapter) {
        if (!chapter.domain) return [];
        const allOStars   = await this.app.getOStars();
        const assignedIds = this._collectHierarchyIds(chapter.osHierarchy?.topics ?? []);
        return allOStars
            .filter(o => o.domain === chapter.domain && !assignedIds.has(Number(o.itemId)))
            .map(o => ({
                id:     Number(o.itemId),
                itemId: Number(o.itemId),
                type:   (o.type ?? 'on').toUpperCase(),
                code:   o.code  ?? null,
                title:  o.title ?? null,
            }));
    }

    /**
     * Ensures full chapter data is loaded (osHierarchy, narrative).
     * Updates chapter in-place and marks _fullyLoaded.
     * @param {object} chapter
     * @returns {Promise<object|null>}
     */
    async _loadChapter(chapter) {
        if (chapter._fullyLoaded) return chapter;
        try {
            const fetched = await apiClient.getChapter(chapter.itemId);
            // Preserve config-owned fields (title, domain, position) from the list
            const { title, domain, position } = chapter;
            Object.assign(chapter, fetched);
            if (title    != null) chapter.title    = title;
            if (domain   != null) chapter.domain   = domain;
            if (position != null) chapter.position = position;
            chapter._fullyLoaded = true;
            return chapter;
        } catch (error) {
            errorHandler.handle(error, 'narrative-chapter-load');
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    /**
     * Base path for this sub-activity, incorporating edition ID for Explore.
     * @returns {string}
     */
    _basePath() {
        const ctx = this.app.getDatasetContext();
        return ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/narrative`
            : '/elaborate/narrative';
    }

    /**
     * Extract and validate a chapter ID from subPath[0].
     * @param {string[]} subPath
     * @returns {number|null}
     */
    _parseChapterId(subPath) {
        const id = parseInt(subPath?.[0], 10);
        return Number.isFinite(id) ? id : null;
    }

    _buildOrderedChapters() {
        const pcode = c => c.parentCode ?? c.parentKey ?? null;
        const byParent = new Map();
        for (const c of this._chapters) {
            const key = pcode(c);
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(c);
        }
        for (const group of byParent.values()) {
            group.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
        const result = [];
        const walk = (parentCode, depth) => {
            for (const c of (byParent.get(parentCode) ?? [])) {
                result.push({ chapter: c, depth });
                walk(c.code, depth + 1);
            }
        };
        walk(null, 0);
        return result;
    }
}