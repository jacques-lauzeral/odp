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
 * Elaborate-only actions (chapter scope):
 *   + Theme  — prompts for title, creates new topic in hierarchy (child of active topic or root)
 *   + ON/OR/OC — opens create modal; on save inserts new O* into active topic (or unclassified)
 *   Topic narrative — editable inline when topic is selected; saved via onTopicNarrativeSave
 *
 * Write paths:
 *   DnD reorder     — PATCH with current versionId; 409 → reload + user message
 *   Theme create    — fetch-fresh → insert → PATCH
 *   O* insert       — fetch-fresh → insert → PATCH (after O* created server-side)
 *   Topic narrative — fetch-fresh → mutate narrative → PATCH
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

        // Cached setup data and domains — loaded once, used for O* create forms
        this._setupData       = null;
        this._domains         = [];
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
                // Consume one-shot query params — ?theme and ?on/?or/?oc are mutually exclusive
                const sp      = new URLSearchParams(window.location.search);
                const topic   = sp.get('theme');
                const onId    = sp.get('on');
                const orId    = sp.get('or');
                const ocId    = sp.get('oc');
                if (topic)       this._selectTopic(topic);
                else if (onId)   await this._selectOStar(onId, 'ON');
                else if (orId)   await this._selectOStar(orId, 'OR');
                else if (ocId)   await this._selectOStar(ocId, 'OC');
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
        // Consume one-shot query params — ?theme and ?on/?or/?oc are mutually exclusive
        const sp      = new URLSearchParams(window.location.search);
        const topic   = sp.get('theme');
        const onId    = sp.get('on');
        const orId    = sp.get('or');
        const ocId    = sp.get('oc');
        if (topic)       this._selectTopic(topic);
        else if (onId)   await this._selectOStar(onId, 'ON');
        else if (orId)   await this._selectOStar(orId, 'OR');
        else if (ocId)   await this._selectOStar(ocId, 'OC');
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

    /**
     * Enable or disable the narrative toolbar action buttons.
     * Buttons only exist in Elaborate (isEditable) context.
     * @param {boolean} enabled
     */
    _setToolbarEnabled(enabled) {
        this.container?.querySelectorAll('.narrative-activity__action').forEach(btn => {
            btn.disabled = !enabled;
        });
    }

    _renderShell() {
        this.container.innerHTML = `
            <div class="narrative-activity">
                ${this._isEditable ? `
                <div class="narrative-activity__toolbar">
                    <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddTheme" disabled>+ Theme</button>
                    <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddOn"    disabled>+ ON</button>
                    <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddOr"    disabled>+ OR</button>
                    <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddOc"    disabled>+ OC</button>
                </div>` : ''}
                <div class="narrative-content" id="narrativeContent"></div>
            </div>
        `;

        if (this._isEditable) {
            this.container.querySelector('#narrativeAddTheme')
                ?.addEventListener('click', () => this._handleAddTheme(this._toc._getActiveTopicPath()));
            this.container.querySelector('#narrativeAddOn')
                ?.addEventListener('click', () => this._handleAddOStar('ON', this._toc._getActiveTopicPath()));
            this.container.querySelector('#narrativeAddOr')
                ?.addEventListener('click', () => this._handleAddOStar('OR', this._toc._getActiveTopicPath()));
            this.container.querySelector('#narrativeAddOc')
                ?.addEventListener('click', () => this._handleAddOStar('OC', this._toc._getActiveTopicPath()));
        }

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
            onAddTheme:           (path)    => this._handleAddTheme(path),
            onAddOStar:           (type, path) => this._handleAddOStar(type, path),
        });

        this._body = new ChapterBody(this._masterDetail.detailContainer, {
            app:                    this.app,
            isEditable:             this._isEditable,
            onSaved:                (_id) => { /* versionId updated in place */ },
            onChapterSelect:        (entry) => this._handleChapterTocSelect(entry),
            onTopicNarrativeSave:   (topicId, narrative) => this._handleTopicNarrativeSave(topicId, narrative),
            onOStarSaved:           (result, mode) => this._handleOStarSaved(result, mode),
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

        this._setToolbarEnabled(true);

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

    /**
     * Select an O* in the chapter TOC by its itemId and render it in the body.
     * Called after diving into a chapter via a typed query param (?on=, ?or=, ?oc=).
     * Expands ancestor topics in the TOC via setActiveByItemId(), then renders
     * the O* detail view in the body panel.
     * @param {string|number} ostarId
     * @private
     */
    async _selectOStar(ostarId, type) {
        if (!this._selectedChapter || !ostarId) return;
        const id = parseInt(ostarId, 10);
        if (!Number.isFinite(id)) return;

        this._toc.setActiveByItemId(id);

        this._body.renderSelectionRead(
            { type: 'ostar', ostar: { id, type: type.toUpperCase() } },
            this._selectedChapter,
        );
    }

    async _climbToOdip(viaButton = false) {
        this._selectedChapter = null;
        this._scope           = 'odip';

        this._setToolbarEnabled(false);

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
            if (updated?.osHierarchy) {
                chapter.osHierarchy = updated.osHierarchy;
            }
        } catch (error) {
            if (error?.status === 409 || error?.response?.status === 409) {
                await this._handleDndConflict(chapter);
            } else {
                errorHandler.handle(error, 'narrative-hierarchy-save');
            }
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
            if (error?.status === 409 || error?.response?.status === 409) {
                await this._handleDndConflict(chapter);
                return;
            }
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

    // -------------------------------------------------------------------------
    // DnD conflict handling
    // -------------------------------------------------------------------------

    /**
     * Called when a PATCH returns 409 (concurrent edit detected during DnD).
     * Reloads the chapter from server, resets client state, re-renders TOC,
     * and informs the user that their change was not applied.
     * @param {object} chapter
     */
    async _handleDndConflict(chapter) {
        chapter._fullyLoaded = false;
        const fresh = await this._loadChapter(chapter);
        if (!fresh) return;

        const unassigned = await this._computeUnassignedOStars(fresh);
        await this._toc.renderChapter(fresh, unassigned);

        // Restore body to chapter narrative to reset any stale topic view
        this._body.renderSelectionRead({ type: 'chapter' }, fresh);

        // Notify user — use a simple banner approach consistent with errorHandler
        errorHandler.handle(
            { message: 'The chapter was modified by someone else — your change was not applied.' },
            'narrative-dnd-conflict'
        );
    }

    // -------------------------------------------------------------------------
    // + Theme
    // -------------------------------------------------------------------------

    /**
     * Called when user clicks + Theme in the chapter TOC.
     * Shows a minimal title modal, then on confirm:
     *   1. Fetches fresh chapter version
     *   2. Inserts new topic into hierarchy (child of active topic or root)
     *   3. PATCHes chapter
     *   4. Re-renders TOC
     * @param {{ topicIndex: number, subPath: number[] } | null} activePath
     */
    async _handleAddTheme(activePath) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        const title = await this._promptThemeTitle();
        if (!title) return;  // user cancelled

        try {
            const fresh = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, fresh);

            const hierarchy = this._toc._parseHierarchy(fresh);
            const newId     = this._toc._nextFreeTopicId(hierarchy);
            const newTopic  = { id: newId, topic: title, narrative: null, items: [], subTopics: [] };

            if (activePath != null) {
                const parent = this._resolveHierarchyNode(hierarchy, activePath);
                if (parent) {
                    parent.subTopics = parent.subTopics ?? [];
                    parent.subTopics.push(newTopic);
                } else {
                    hierarchy.push(newTopic);
                }
            } else {
                hierarchy.push(newTopic);
            }

            const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));
            const updated = await apiClient.patchChapter(fresh.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: fresh.versionId,
            });

            if (updated?.versionId) chapter.versionId = updated.versionId;

            // Re-fetch to get guaranteed enriched osHierarchy
            const enriched = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, enriched);
            chapter._fullyLoaded = true;

            const unassigned = await this._computeUnassignedOStars(chapter);
            this._toc._hierarchy = this._toc._parseHierarchy(chapter);
            this._toc._unassignedOStars = unassigned;
            this._toc.refreshTree();
        } catch (error) {
            errorHandler.handle(error, 'narrative-add-theme');
        }
    }

    /**
     * Show a minimal modal prompting for a theme title.
     * Reuses the existing modal-overlay / modal CSS from layout-components.css.
     * Resolves to the trimmed title string, or null if cancelled.
     * @returns {Promise<string|null>}
     */
    _promptThemeTitle() {
        return new Promise((resolve) => {
            document.querySelector('.narrative-theme-prompt')?.remove();

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay narrative-theme-prompt';
            overlay.style.zIndex = '2000';
            overlay.innerHTML = `
                <div class="modal" style="max-width:420px;width:100%">
                    <div class="modal-header">
                        <h3 class="modal-title">New Theme</h3>
                        <button class="modal-close" id="themePromptClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <label class="odip-form__label" for="themePromptInput"
                               style="display:block;margin-bottom:var(--space-2);font-size:var(--font-size-sm)">
                            Theme title
                        </label>
                        <input id="themePromptInput"
                               class="odip-input odip-input--standard"
                               style="width:100%"
                               type="text"
                               placeholder="Enter theme title…"
                               maxlength="200" />
                    </div>
                    <div class="modal-footer">
                        <button class="odip-btn odip-btn--standard" id="themePromptCancel">Cancel</button>
                        <button class="odip-btn odip-btn--primary odip-btn--standard" id="themePromptSave">Save</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const input     = overlay.querySelector('#themePromptInput');
            const saveBtn   = overlay.querySelector('#themePromptSave');
            const cancelBtn = overlay.querySelector('#themePromptCancel');
            const closeBtn  = overlay.querySelector('#themePromptClose');

            const confirm = () => {
                const val = input.value.trim();
                overlay.remove();
                resolve(val || null);
            };
            const cancel = () => {
                overlay.remove();
                resolve(null);
            };

            saveBtn.addEventListener('click', confirm);
            cancelBtn.addEventListener('click', cancel);
            closeBtn.addEventListener('click', cancel);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  { e.preventDefault(); confirm(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            });

            requestAnimationFrame(() => input.focus());
        });
    }

    // -------------------------------------------------------------------------
    // + O* (ON / OR / OC)
    // -------------------------------------------------------------------------

    /**
     * Called when user clicks + ON / + OR / + OC in the chapter TOC.
     * Opens the appropriate create modal. On successful save:
     *   1. Fetches fresh chapter version
     *   2. Inserts new O* itemId into active topic items (or leaves unclassified if no topic)
     *   3. PATCHes chapter osHierarchy
     *   4. Refreshes unassigned list and re-renders TOC
     * @param {'ON'|'OR'|'OC'} type
     * @param {{ topicIndex: number, subPath: number[] } | null} activePath
     */
    async _handleAddOStar(type, activePath) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        // Ensure setup data loaded
        if (!this._setupData) {
            try {
                [this._setupData, this._domains] = await Promise.all([
                    this.app.getSetupData(),
                    this.app.getDomains(),
                ]);
            } catch (error) {
                errorHandler.handle(error, 'narrative-add-ostar-setup');
                return;
            }
        }

        const onSaved = async (result) => {
            await this._insertOStarIntoHierarchy(chapter, result, activePath);
        };

        if (type === 'OC') {
            const { default: ChangeForm } = await import('../os/change-form.js');
            const form = new ChangeForm(
                { endpoint: '/operational-changes' },
                {
                    setupData:       this._setupData,
                    domains:         this._domains,
                    getSetupData:    () => this._setupData,
                    getRequirements: () => [],
                    onSaved,
                }
            );
            form.showCreateModal({ domain: chapter.domain });
        } else {
            const { default: RequirementForm } = await import('../os/requirement-form.js');
            const form = new RequirementForm(
                { endpoint: '/operational-requirements' },
                {
                    setupData:       this._setupData,
                    domains:         this._domains,
                    getSetupData:    () => this._setupData,
                    getRequirements: () => [],
                    onSaved,
                }
            );
            form.showCreateModal({ defaultType: type, domain: chapter.domain });
        }
    }

    /**
     * Insert a newly created O* into the chapter osHierarchy.
     * Uses fetch-fresh pattern to avoid version conflicts.
     * If activePath resolves to a topic, inserts into that topic's items.
     * Otherwise leaves the O* unclassified (hierarchy unchanged, unassigned refreshed).
     * @param {object} chapter
     * @param {object} result   — created O* entity from server
     * @param {{ topicIndex: number, subPath: number[] } | null} activePath
     */
    async _insertOStarIntoHierarchy(chapter, result, activePath) {
        const newId   = Number(result.itemId ?? result.id);
        const newType = (result.type ?? 'OR').toUpperCase();

        try {
            const fresh = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, fresh);

            const hierarchy = this._toc._parseHierarchy(fresh);

            if (activePath != null) {
                const node = this._resolveHierarchyNode(hierarchy, activePath);
                if (node) {
                    node.items = node.items ?? [];
                    node.items.push({ id: newId, type: newType, code: result.code ?? null, title: result.title ?? null });
                    // Enforce ON → OR → OC order
                    node.items = this._toc._sortItemsByType(node.items);
                }
            }
            // If no activePath — O* left unclassified, hierarchy unchanged

            const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));
            const updated = await apiClient.patchChapter(fresh.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: fresh.versionId,
            });

            if (updated?.versionId) chapter.versionId = updated.versionId;

            // Re-fetch to get guaranteed enriched osHierarchy (PATCH response may return write-shape)
            const enriched = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, enriched);
            chapter._fullyLoaded = true;

            // Invalidate O* cache so new entity appears
            this.app.invalidateOStars?.();

            const unassigned = await this._computeUnassignedOStars(chapter);
            this._toc._hierarchy = this._toc._parseHierarchy(chapter);
            this._toc._unassignedOStars = unassigned;
            this._toc.refreshTree();
        } catch (error) {
            errorHandler.handle(error, 'narrative-insert-ostar');
        }
    }

    // -------------------------------------------------------------------------
    // O* edit/save — refresh TOC label without losing selection or scroll
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterBody after an O* is saved from its detail view (edit or create).
     * Re-fetches the chapter to pick up the enriched hierarchy (so a changed title
     * shows in the tree), then refreshes the TOC tree while preserving the active
     * selection and scroll position.
     * @param {object} _result — saved O* entity (unused; chapter re-fetch is authoritative)
     * @param {string} _mode   — 'create' | 'edit'
     */
    async _handleOStarSaved(_result, _mode) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        try {
            const enriched = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, enriched);
            chapter._fullyLoaded = true;

            this.app.invalidateOStars?.();

            const unassigned = await this._computeUnassignedOStars(chapter);
            this._toc._hierarchy = this._toc._parseHierarchy(chapter);
            this._toc._unassignedOStars = unassigned;
            this._toc.refreshTree();
        } catch (error) {
            errorHandler.handle(error, 'narrative-ostar-saved');
        }
    }

    // -------------------------------------------------------------------------
    // Topic narrative save
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterBody when user saves a theme narrative.
     * Uses fetch-fresh pattern: GET latest chapter, mutate target topic narrative, PATCH.
     * @param {string} topicId  — stable topic id (from osHierarchy topic node)
     * @param {string} narrative — serialised TipTap/Quill JSON string
     */
    async _handleTopicNarrativeSave(topicId, narrative) {
        const chapter = this._selectedChapter;
        if (!chapter) throw new Error('No chapter selected');

        const fresh = await apiClient.getChapter(chapter.itemId);
        this._mergeChapterConfig(chapter, fresh);

        const hierarchy = this._toc._parseHierarchy(fresh);

        // DFS to find topic by id and mutate narrative
        const found = this._findTopicById(hierarchy, topicId);
        if (!found) throw new Error(`Topic ${topicId} not found in hierarchy`);
        found.narrative = narrative;

        const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));
        const updated = await apiClient.patchChapter(fresh.itemId, {
            osHierarchy:       { topics: writeTopics },
            expectedVersionId: fresh.versionId,
        });

        if (updated?.versionId) chapter.versionId = updated.versionId;
        if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
        chapter._fullyLoaded = true;

        // Sync narrative into live _hierarchy so TOC re-renders reflect it
        const liveNode = this._findTopicById(this._toc._hierarchy, topicId);
        if (liveNode) liveNode.narrative = narrative;
    }

    // -------------------------------------------------------------------------
    // Hierarchy utilities
    // -------------------------------------------------------------------------

    /**
     * Merge config-owned fields (title, domain, position) from the cached chapter
     * into a freshly fetched chapter object, then sync itemId / versionId back.
     * @param {object} cached — the in-memory chapter (config fields authoritative)
     * @param {object} fresh  — just fetched from server
     */
    _mergeChapterConfig(cached, fresh) {
        if (cached.title    != null) fresh.title    = cached.title;
        if (cached.domain   != null) fresh.domain   = cached.domain;
        if (cached.position != null) fresh.position = cached.position;
        // Sync version back to cached so subsequent writes use the right versionId
        cached.versionId    = fresh.versionId;
        cached.osHierarchy  = fresh.osHierarchy;
        cached._fullyLoaded = true;
    }

    /**
     * Resolve a render-shape topic node by { topicIndex, subPath }.
     * @param {object[]} hierarchy
     * @param {{ topicIndex: number, subPath: number[] }} path
     * @returns {object|null}
     */
    _resolveHierarchyNode(hierarchy, { topicIndex, subPath }) {
        let node = hierarchy[topicIndex] ?? null;
        for (const si of subPath) {
            node = node?.subTopics?.[si] ?? null;
        }
        return node;
    }

    /**
     * DFS search for a topic node by its stable id string.
     * @param {object[]} nodes
     * @param {string}   topicId
     * @returns {object|null}
     */
    _findTopicById(nodes, topicId) {
        for (const n of nodes ?? []) {
            if (String(n.id) === String(topicId)) return n;
            const found = this._findTopicById(n.subTopics ?? [], topicId);
            if (found) return found;
        }
        return null;
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
        const ctx       = this.app.getDatasetContext();
        const editionId = ctx?.type === 'edition' ? ctx.editionId : null;

        // Cache hit: already fully loaded for the same context (live or specific edition)
        if (chapter._fullyLoaded && chapter._fullyLoadedEditionId === editionId) return chapter;

        try {
            const params  = editionId != null ? { edition: editionId } : {};
            const fetched = await apiClient.getChapter(chapter.itemId, params);
            // Preserve config-owned fields (title, domain, position) from the list
            const { title, domain, position } = chapter;
            Object.assign(chapter, fetched);
            if (title    != null) chapter.title    = title;
            if (domain   != null) chapter.domain   = domain;
            if (position != null) chapter.position = position;
            chapter._fullyLoaded          = true;
            chapter._fullyLoadedEditionId = editionId;   // null for live
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