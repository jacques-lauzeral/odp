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
 *   Topic narrative — editable inline when topic is selected; saved via onTopicFullSave
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
import { openChangeSetCommitDialog } from '../../../../components/change-set-commit-dialog.js';
import { odipUnsavedChanges } from '../../../../components/user-dialogs.js';
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
        this._allOStarsCache  = null;   // last-loaded full O* list, reused during buffered hierarchy sessions

        // beforeunload guard — registered when Elaborate shell is active
        this._beforeUnloadHandler = null;

        // Edit-session mutual exclusion (Elaborate only).
        //   null         — nothing being edited
        //   'narrative'   — chapter or topic narrative open in the body (owned by ChapterBody._dirty)
        //   'hierarchy'   — buffered DnD session in the TOC (owned by _pendingHierarchy)
        // At most one may be active at a time; the body and the TOC each consult
        // this before allowing their own edit affordance to start.
        this._editSession = null;

        // Buffered hierarchy session state. While 'hierarchy' is active, drag-and-drop
        // mutations accumulate here (render-shape topic array) instead of PATCHing on
        // every drop. Save serialises one PATCH; Cancel discards and restores from the
        // chapter's last-saved osHierarchy.
        this._pendingHierarchy = null;
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

        // Tear down any previously mounted shell before re-rendering.
        // NarrativeActivity instances are cached by ElaborateActivity — render()
        // may be called again on the same instance when the user returns to the
        // Narrative tab. Without this, a second ChapterBody + RichTextComponent
        // is created alongside the old one, producing duplicate click listeners.
        if (this._body || this._toc) {
            if (this._beforeUnloadHandler) {
                window.removeEventListener('beforeunload', this._beforeUnloadHandler);
                this._beforeUnloadHandler = null;
            }
            this._toc?.cleanup?.();
            this._masterDetail?.cleanup();
            this._body?.cleanup?.();
            this._toc          = null;
            this._body         = null;
            this._masterDetail = null;
        }

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
        this._editSession     = null;
        this._pendingHierarchy = null;

        this._renderShell();
        this._updateToolbarNav();

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
        this._updateToolbarNav();
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
            // Already in this chapter — consume query params and select topic/O* if present.
            const sp    = new URLSearchParams(window.location.search);
            const topic = sp.get('theme');
            const onId  = sp.get('on');
            const orId  = sp.get('or');
            const ocId  = sp.get('oc');
            if (topic)       this._selectTopic(topic);
            else if (onId)   await this._selectOStar(onId, 'ON');
            else if (orId)   await this._selectOStar(orId, 'OR');
            else if (ocId)   await this._selectOStar(ocId, 'OC');
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

    /**
     * Called by App._loadActivity before switching away from this activity.
     * Returns false (and shows the unsaved-changes dialog) when there are pending
     * edits — either a narrative/topic edit in ChapterBody, or a buffered
     * hierarchy session in the TOC — so the user can save or discard before leaving.
     * @returns {Promise<boolean>}
     */
    async canDeactivate() {
        return this._guardAllSessions();
    }

    /**
     * Unified navigation guard covering both edit-session types.
     *
     * The body owns the 'narrative' session (its own _dirty flag + dialog), so we
     * delegate there first — that path is unchanged from before. The 'hierarchy'
     * session is owned here (buffered drops have no body dirty state), so we run a
     * dedicated Save/Discard/Cancel prompt for it.
     *
     * Only one session can be active at a time (mutual exclusion), so at most one
     * branch ever does real work; the other is a cheap pass-through.
     *
     * @returns {Promise<boolean>} true → navigation may proceed; false → stay
     */
    async _guardAllSessions() {
        // Narrative/topic edits — delegate to the body's existing guard.
        if (this._body && !await this._body._guardNavigation()) return false;

        // Buffered hierarchy session — guard here.
        if (this._editSession === 'hierarchy' && this._pendingHierarchy) {
            return this._guardHierarchySession();
        }
        return true;
    }

    /**
     * Save/Discard/Cancel prompt for a pending (buffered) hierarchy session.
     * @returns {Promise<boolean>} true → may proceed; false → cancelled, stay
     */
    async _guardHierarchySession() {
        const answer = await odipUnsavedChanges(
            'You have unsaved theme/structure changes. What would you like to do?'
        );
        if (answer === 'cancel') return false;
        if (answer === 'discard') {
            this._cancelHierarchySession();
            return true;
        }
        // answer === 'save'
        try {
            await this._saveHierarchySession();
            return true;
        } catch {
            // Error already surfaced by the save method; block navigation.
            return false;
        }
    }

    async cleanup() {
        if (this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
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
        this._editSession     = null;
        this._pendingHierarchy = null;
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

    /**
     * Render the breadcrumb trail in the left nav slot of the toolbar.
     * ODIP scope:    ODIP  (non-clickable)
     * Chapter scope: ODIP (clickable → climb) › Chapter Title (clickable → chapter narrative)
     */
    _updateToolbarNav() {
        const navEl = this.container?.querySelector('#narrativeToolbarNav');
        if (!navEl) return;

        const basePath = this._basePath();

        if (this._scope === 'chapter' && this._selectedChapter) {
            const title = this._selectedChapter.title ?? this._selectedChapter.code ?? '';
            // Use <button> elements — avoids the router's global <a href> click interceptor
            // which would trigger a second canDeactivate/unsaved-changes dialog.
            navEl.innerHTML = `
                <nav class="breadcrumb" aria-label="Breadcrumb">
                    <button class="breadcrumb__item breadcrumb__item--link" id="narrativeCrumbOdip">ODIP</button>
                    <span class="breadcrumb__separator">›</span>
                    <button class="breadcrumb__item breadcrumb__item--current" id="narrativeCrumbChapter"
                            title="${title.replace(/"/g, '&quot;')}">${title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</button>
                </nav>`;
            navEl.querySelector('#narrativeCrumbOdip')
                ?.addEventListener('click', () => this._climbToOdip(true));
            navEl.querySelector('#narrativeCrumbChapter')
                ?.addEventListener('click', () =>
                    this._handleChapterTocSelect({ type: 'chapter', chapter: this._selectedChapter })
                );
        } else {
            // ODIP scope — single non-clickable root crumb
            navEl.innerHTML = `
                <nav class="breadcrumb" aria-label="Breadcrumb">
                    <span class="breadcrumb__item breadcrumb__item--current">ODIP</span>
                </nav>`;
        }
    }

    _renderShell() {
        this.container.innerHTML = `
            <div class="narrative-activity">
                <div class="narrative-activity__toolbar">
                    <div class="narrative-activity__toolbar-nav" id="narrativeToolbarNav"></div>
                    <div class="narrative-activity__toolbar-actions">
                        ${this._isEditable ? `
                        <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddTheme" disabled>+ Theme</button>
                        <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddOn"    disabled>+ ON</button>
                        <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddOr"    disabled>+ OR</button>
                        <button class="odip-btn odip-btn--create narrative-activity__action" id="narrativeAddOc"    disabled>+ OC</button>
                        ` : ''}
                    </div>
                </div>
                <div class="narrative-content" id="narrativeContent"></div>
            </div>
        `;

        this.container.querySelector('#narrativeAddTheme')
            ?.addEventListener('click', () => this._handleAddTheme(this._toc._getActiveTopicPath()));
        this.container.querySelector('#narrativeAddOn')
            ?.addEventListener('click', () => this._handleAddOStar('ON', this._toc._getActiveTopicPath()));
        this.container.querySelector('#narrativeAddOr')
            ?.addEventListener('click', () => this._handleAddOStar('OR', this._toc._getActiveTopicPath()));
        this.container.querySelector('#narrativeAddOc')
            ?.addEventListener('click', () => this._handleAddOStar('OC', this._toc._getActiveTopicPath()));

        const contentEl = dom.find('#narrativeContent', this.container);

        this._masterDetail = new MasterDetail(contentEl, { initialRatio: 0.20 });
        this._masterDetail.render();

        this._toc = new ChapterToc(this._masterDetail.listContainer, {
            isEditable:           this._isEditable,
            chapters:             this._chapters,
            chapterMap:           this._chapterMap,
            onOdipSelect:         (entry)   => this._handleOdipSelect(entry),
            onDive:               (chapter) => this._diveIntoChapter(chapter),
            onClimb:              ()        => this._climbToOdip(true),
            onFocusOdip:          ()        => this.container?.querySelector('#chapterTocOdip')?.focus({ preventScroll: true }),
            onChapterSelect:      (entry)   => this._handleChapterTocSelect(entry),
            buildOrderedChapters: ()        => this._buildOrderedChapters(),
            onHierarchyChange:    (hier)    => this._handleHierarchyChange(hier),
            onUnclassifiedChange: (hier)    => this._handleUnclassifiedChange(hier),
            onAddTheme:           (path)    => this._handleAddTheme(path),
            onAddOStar:           (type, path) => this._handleAddOStar(type, path),
            // LCM edit-session coordination (2c)
            onHierarchySessionSave:   ()    => this._saveHierarchySession(),
            onHierarchySessionCancel: ()    => this._cancelHierarchySession(),
            // Consulted by the TOC before it lets a drag start: a drag may only begin
            // when no narrative edit is open (mutual exclusion). A hierarchy session
            // already being active is fine — that's the session the drag extends.
            canStartHierarchyEdit:    ()    => this._editSession !== 'narrative',
        });

        this._body = new ChapterBody(this._masterDetail.detailContainer, {
            app:                    this.app,
            isEditable:             this._isEditable,
            onSaved:                (_id) => { /* versionId updated in place */ },
            onChapterSelect:        (entry) => this._handleChapterTocSelect(entry),
            onTopicFullSave:        (topicId, title, narrative) => this._handleTopicFullSave(topicId, title, narrative),
            onChapterNarrativeSave: (narrative)           => this._handleChapterNarrativeSave(narrative),
            onThemeDelete:          (topicId)             => this._handleThemeDelete(topicId),
            onOStarSaved:           (result, mode) => this._handleOStarSaved(result, mode),
            onOStarDeleted:         (item)         => this._handleOStarDeleted(item),
            // LCM edit-session coordination (2c) — the body opens/closes the
            // 'narrative' session so the TOC can refuse to start a drag meanwhile.
            onEditSessionStart:     ()      => this._beginNarrativeSession(),
            onEditSessionEnd:       ()      => this._endNarrativeSession(),
            // Consulted by the body before it lets an Edit button activate: a
            // narrative edit may only begin when no hierarchy session is buffered.
            canStartNarrativeEdit:  ()      => this._editSession !== 'hierarchy',
        });

        // Safety net: warn on browser-level navigation (F5, tab close, address bar)
        // when unsaved changes exist. Only registered in Elaborate (editable) mode.
        if (this._isEditable) {
            this._beforeUnloadHandler = (e) => {
                const bodyDirty      = this._body?._dirty;
                const hierarchyDirty = this._editSession === 'hierarchy' && this._pendingHierarchy;
                if (bodyDirty || hierarchyDirty) {
                    e.preventDefault();
                    e.returnValue = '';  // required for Chrome
                }
            };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        }
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

        // Reset scroll after render — rAF ensures TipTap has mounted before resetting
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._masterDetail.detailContainer.scrollTop = 0;
        }));
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
        this._updateToolbarNav();

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
        this._toc.setActiveByTopicId(topicId);
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
        if (!await this._guardAllSessions()) return;

        this._selectedChapter = null;
        this._scope           = 'odip';

        this._setToolbarEnabled(false);
        this._updateToolbarNav();

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
        } else if (entry.type === 'subtopic-by-id' && entry.topicId != null) {
            // Navigation from a subtheme card in the body — delegate to TOC which
            // resolves the node, expands ancestors, highlights, and re-fires as 'topic'.
            this._toc.setActiveByTopicId(entry.topicId);
            return;  // setActiveByTopicId fires onChapterSelect which re-enters here as 'topic'
        }
        this._body.renderSelectionRead(entry, this._selectedChapter);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            this._masterDetail.detailContainer.scrollTop = 0;
        }));
    }

    // -------------------------------------------------------------------------
    // Edit-session lifecycle (2c) — mutual exclusion between narrative & hierarchy
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterBody when the user enters edit mode on a chapter or topic
     * narrative. Marks the 'narrative' session active so the TOC refuses to start
     * a drag until the body session closes.
     */
    _beginNarrativeSession() {
        this._editSession = 'narrative';
        this._toc?.setHierarchyEditLocked?.(true);
    }

    /**
     * Called by ChapterBody when a narrative/topic edit closes (saved or cancelled).
     * Clears the session and re-enables hierarchy editing in the TOC.
     */
    _endNarrativeSession() {
        if (this._editSession === 'narrative') this._editSession = null;
        this._toc?.setHierarchyEditLocked?.(false);
    }

    /**
     * Called by ChapterToc on the FIRST buffered drag of a hierarchy session.
     * Marks the 'hierarchy' session active so the body disables its Edit buttons,
     * and seeds the pending buffer from the TOC's current render-shape hierarchy.
     * @param {object[]} hierarchy — render-shape topic array (already mutated by the drop)
     */
    _beginHierarchySession(hierarchy) {
        this._editSession      = 'hierarchy';
        this._pendingHierarchy = hierarchy;
        this._body?.setNarrativeEditLocked?.(true);
    }

    /**
     * Persist the buffered hierarchy session as a single PATCH under one change set.
     * Fetch-fresh for the latest versionId, run the commit gate once, PATCH, then
     * sync state and clear the session. Throws on failure so guards can block nav.
     * @returns {Promise<void>}
     */
    async _saveHierarchySession() {
        const chapter = this._selectedChapter;
        if (!chapter || !this._pendingHierarchy) {
            this._clearHierarchySession();
            return;
        }

        // One commit prompt for the whole session.
        const commit = await openChangeSetCommitDialog(this.app, { allowNote: true });
        if (!commit) throw new Error('commit-cancelled');  // keep session; block nav

        const fresh = await apiClient.getChapter(chapter.itemId);
        this._mergeChapterConfig(chapter, fresh);

        const writeTopics = this._pendingHierarchy.map(t => this._hierarchyToWrite(t));

        let updated;
        try {
            updated = await apiClient.patchChapter(fresh.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: fresh.versionId,
                changeSetId:       commit.changeSetId,
                ...(commit.note ? { note: commit.note } : {}),
            });
        } catch (error) {
            if (error?.status === 409 || error?.response?.status === 409) {
                // Stale buffer — discard, reload, inform. Nothing left to save, so
                // navigation may proceed (do not re-throw).
                await this._handleDndConflict(chapter);
                return;
            }
            throw error;  // other errors block navigation via the guard
        }

        if (updated?.versionId)   chapter.versionId   = updated.versionId;
        if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
        chapter._fullyLoaded = true;

        // Re-parse from the authoritative server response and re-render.
        const unassigned = await this._computeUnassignedOStars(chapter);
        this._toc._hierarchy        = this._toc._parseHierarchy(chapter);
        this._toc._unassignedOStars = unassigned;

        this._clearHierarchySession();
        this._toc.refreshTree();
    }

    /**
     * Discard a buffered hierarchy session: restore the TOC from the chapter's
     * last-saved osHierarchy and clear the session.
     */
    _cancelHierarchySession() {
        const chapter = this._selectedChapter;
        this._clearHierarchySession();
        if (!chapter) return;
        this._toc._hierarchy = this._toc._parseHierarchy(chapter);
        this._toc.refreshTree();
    }

    /**
     * Reset session bookkeeping (no rendering, no network). Shared teardown for
     * both save and cancel.
     */
    _clearHierarchySession() {
        this._editSession      = null;
        this._pendingHierarchy = null;
        this._toc?.endHierarchySession?.();
        this._body?.setNarrativeEditLocked?.(false);
    }


    /**
     * Called by ChapterToc after each successful drag-and-drop mutation.
     *
     * 2c: drops are now BUFFERED, not PATCHed per-drop. The TOC has already applied
     * the mutation to its own _hierarchy and re-rendered; we capture that render-shape
     * array as the pending buffer and (on the first drop) open the hierarchy session.
     * The single PATCH happens later in _saveHierarchySession().
     * @param {object[]} hierarchy — render-shape topic array from ChapterToc._hierarchy
     */
    _handleHierarchyChange(hierarchy) {
        if (!this._selectedChapter) return;
        if (this._editSession !== 'hierarchy') {
            this._beginHierarchySession(hierarchy);
        } else {
            this._pendingHierarchy = hierarchy;
        }
    }

    /**
     * Called by ChapterToc when an O* moves into or out of the <unclassified> bucket.
     *
     * 2c: also buffered. The TOC has applied the mutation to its own _hierarchy; we
     * recompute the unclassified bucket against the pending state (so it reflects the
     * move) and re-render, but defer the PATCH to _saveHierarchySession().
     * @param {object[]} hierarchy — mutated render-shape hierarchy
     */
    async _handleUnclassifiedChange(hierarchy) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        if (this._editSession !== 'hierarchy') {
            this._beginHierarchySession(hierarchy);
        } else {
            this._pendingHierarchy = hierarchy;
        }

        // The TOC already holds the mutated state; recompute the unclassified bucket
        // from the pending hierarchy so a moved O* leaves/enters the bucket visually.
        this._toc._hierarchy = hierarchy;
        const unassigned = this._computeUnassignedFromHierarchy(chapter, hierarchy);
        this._toc._unassignedOStars = unassigned;
        this._toc._renderChapterTree();
    }

    /**
     * Compute the unclassified bucket against an IN-MEMORY hierarchy (the pending
     * buffer), not the server state. Mirrors _computeUnassignedOStars but takes the
     * topic array directly so buffered moves are reflected before any PATCH.
     * @param {object} chapter
     * @param {object[]} hierarchy — render-shape topic array
     * @returns {Array}
     */
    _computeUnassignedFromHierarchy(chapter, hierarchy) {
        if (!chapter.domain) return [];
        const assignedIds = new Set();
        const walk = (nodes) => {
            for (const t of nodes ?? []) {
                for (const item of t.items ?? []) {
                    const id = item?.id ?? item?.itemId ?? item;
                    if (id != null) assignedIds.add(Number(id));
                }
                walk(t.subTopics ?? []);
            }
        };
        walk(hierarchy);

        const allOStars = this._allOStarsCache ?? [];
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

    // -------------------------------------------------------------------------
    // Concurrent-edit (409) handling for the buffered hierarchy save
    // -------------------------------------------------------------------------

    /**
     * Called when the buffered hierarchy PATCH returns 409 (someone else edited the
     * chapter between our fetch-fresh and our PATCH). Discards the pending buffer,
     * reloads the chapter, re-renders the TOC, resets the body, and tells the user.
     * @param {object} chapter
     */
    async _handleDndConflict(chapter) {
        this._clearHierarchySession();
        chapter._fullyLoaded = false;
        const fresh = await this._loadChapter(chapter);
        if (!fresh) return;

        const unassigned = await this._computeUnassignedOStars(fresh);
        await this._toc.renderChapter(fresh, unassigned);

        // Restore body to chapter narrative to reset any stale topic view
        this._body.renderSelectionRead({ type: 'chapter' }, fresh);

        errorHandler.handle(
            { message: 'The chapter was modified by someone else — your structure changes were not applied.' },
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

        const commit = await this._commitFor();
        if (!commit) return;  // commit cancelled — abort

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
                ...commit,
            });

            if (updated?.versionId) chapter.versionId = updated.versionId;
            if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
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
                    app:             this.app,
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
                    app:             this.app,
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

        // If there's no topic to place into, the O* simply stays unclassified —
        // no chapter version is written, so no commit gate is needed.
        if (activePath == null) {
            try {
                this.app.invalidateOStars?.();
                const unassigned = await this._computeUnassignedOStars(chapter);
                this._toc._hierarchy = this._toc._parseHierarchy(chapter);
                this._toc._unassignedOStars = unassigned;
                this._toc.refreshTree();
            } catch (error) {
                errorHandler.handle(error, 'narrative-insert-ostar');
            }
            return;
        }

        const commit = await this._commitFor();
        if (!commit) {
            // Placement cancelled — the O* exists but stays unclassified. Refresh the
            // bucket so it appears there rather than vanishing.
            this.app.invalidateOStars?.();
            const unassigned = await this._computeUnassignedOStars(chapter);
            this._toc._hierarchy = this._toc._parseHierarchy(chapter);
            this._toc._unassignedOStars = unassigned;
            this._toc.refreshTree();
            return;
        }

        try {
            const fresh = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, fresh);

            const hierarchy = this._toc._parseHierarchy(fresh);

            const node = this._resolveHierarchyNode(hierarchy, activePath);
            if (node) {
                node.items = node.items ?? [];
                node.items.push({ id: newId, type: newType, code: result.code ?? null, title: result.title ?? null });
                // Enforce ON → OR → OC order
                node.items = this._toc._sortItemsByType(node.items);
            }

            const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));
            const updated = await apiClient.patchChapter(fresh.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: fresh.versionId,
                ...commit,
            });

            if (updated?.versionId) chapter.versionId = updated.versionId;
            if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
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
     * Re-sync the TOC with the server's current state of the selected chapter.
     *
     * Re-fetches the chapter (authoritative source for the enriched osHierarchy and
     * the current versionId), merges config-owned fields, invalidates the O* cache,
     * recomputes the unassigned bucket, and refreshes the tree while preserving the
     * active selection and scroll position.
     *
     * Shared by every trigger that mutates the chapter's osHierarchy underneath us:
     *   - an O* edit/create from its detail view (_handleOStarSaved)
     *   - an O* soft delete, which the server cascades into an osHierarchy excise
     *     and a new chapter version (_handleOStarDeleted)
     *   - an O* domain change, same cascade (also reaches us via _handleOStarSaved)
     *
     * The chapter re-fetch is what keeps the local versionId in step with the
     * server-side cascade — without it the next structure/narrative PATCH would
     * fetch-fresh anyway, but the displayed tree would be stale until then.
     *
     * @param {string} errorContext — tag for errorHandler on failure
     */
    async _refreshSelectedChapterTree(errorContext) {
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
            errorHandler.handle(error, errorContext);
        }
    }

    /**
     * Called by ChapterBody after an O* is saved from its detail view (edit or create).
     * Re-fetches the chapter so a changed title — or a domain change, which the server
     * cascades into an osHierarchy excise — is reflected in the tree.
     * @param {object} _result — saved O* entity (unused; chapter re-fetch is authoritative)
     * @param {string} _mode   — 'create' | 'edit'
     */
    async _handleOStarSaved(_result, _mode) {
        await this._refreshSelectedChapterTree('narrative-ostar-saved');
    }

    /**
     * Called by ChapterBody after an O* is soft-deleted from its detail view. The body
     * has already cleared itself to the placeholder; here we re-sync the tree so the
     * deleted card drops out of its topic / the unassigned bucket. The server has
     * cascaded the delete into an osHierarchy excise + new chapter version, so the
     * re-fetch also brings the local versionId current.
     * @param {object} _item — the deleted O* (unused; chapter re-fetch is authoritative)
     */
    async _handleOStarDeleted(_item) {
        await this._refreshSelectedChapterTree('narrative-ostar-deleted');
    }

    // -------------------------------------------------------------------------
    // Chapter narrative save
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterBody when the user saves the chapter narrative.
     * Runs the commit gate, then fetch-fresh → PATCH narrative + changeSetId.
     * Syncs versionId / narrative back into _selectedChapter on success.
     * Throws on commit-cancel or error so ChapterBody keeps the edit open and
     * _guardNavigation can block navigation.
     * @param {string} narrative — serialised TipTap JSON string
     */
    async _handleChapterNarrativeSave(narrative) {
        const chapter = this._selectedChapter;
        if (!chapter) throw new Error('No chapter selected');

        const commit = await this._commitFor();
        if (!commit) throw new Error('commit-cancelled');  // abort; body keeps edit open

        const fresh = await apiClient.getChapter(chapter.itemId);
        this._mergeChapterConfig(chapter, fresh);

        const updated = await apiClient.patchChapter(fresh.itemId, {
            narrative,
            expectedVersionId: fresh.versionId,
            ...commit,
        });

        if (updated?.versionId) chapter.versionId = updated.versionId;
        if (updated?.narrative) chapter.narrative  = updated.narrative;
        chapter._fullyLoaded = true;
    }

    // -------------------------------------------------------------------------
    // Topic save (title + narrative combined)
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterBody when user saves a topic (title and/or narrative).
     * Always a single fetch-fresh → mutate both fields → PATCH to avoid
     * version conflicts that would arise from two sequential patches.
     *
     * Post-save:
     *   - Syncs both fields into the live _hierarchy so subsequent re-renders
     *     reflect the saved state without a full chapter reload.
     *   - Calls refreshTree() only when the title changed (label update needed).
     *
     * @param {string}      topicId   — stable topic id (from osHierarchy topic node)
     * @param {string}      title     — new topic title
     * @param {string|null} narrative — serialised TipTap JSON string, or null
     */
    async _handleTopicFullSave(topicId, title, narrative) {
        const chapter = this._selectedChapter;
        if (!chapter) throw new Error('No chapter selected');

        const commit = await this._commitFor();
        if (!commit) throw new Error('commit-cancelled');  // abort; body keeps edit open

        const fresh = await apiClient.getChapter(chapter.itemId);
        this._mergeChapterConfig(chapter, fresh);

        const hierarchy = this._toc._parseHierarchy(fresh);

        const found = this._findTopicById(hierarchy, topicId);
        if (!found) throw new Error(`Topic ${topicId} not found in hierarchy`);

        const titleChanged = found.topic !== title;
        found.topic     = title;
        found.narrative = narrative;

        const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));
        const updated = await apiClient.patchChapter(fresh.itemId, {
            osHierarchy:       { topics: writeTopics },
            expectedVersionId: fresh.versionId,
            ...commit,
        });

        if (updated?.versionId) chapter.versionId = updated.versionId;
        if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
        chapter._fullyLoaded = true;

        // Sync into live _hierarchy
        const liveNode = this._findTopicById(this._toc._hierarchy, topicId);
        if (liveNode) {
            liveNode.topic     = title;
            liveNode.narrative = narrative;
        }

        // Refresh TOC label only when the title actually changed
        if (titleChanged) this._toc.refreshTree();
    }

    /**
     * Called by ChapterBody when user clicks "Delete theme" on an empty topic.
     * Uses fetch-fresh pattern: GET latest chapter, remove topic node, PATCH.
     * Falls back to chapter narrative view after deletion.
     * Guard: refuses to delete if the topic still has items or subtopics (defensive,
     * the button should not appear in that case).
     * @param {string} topicId
     */
    async _handleThemeDelete(topicId) {
        const chapter = this._selectedChapter;
        if (!chapter) return;

        const commit = await this._commitFor();
        if (!commit) return;  // commit cancelled — abort

        try {
            const fresh = await apiClient.getChapter(chapter.itemId);
            this._mergeChapterConfig(chapter, fresh);

            const hierarchy = this._toc._parseHierarchy(fresh);

            // Defensive guard — refuse to delete a non-empty topic
            const target = this._findTopicById(hierarchy, topicId);
            if (!target) return;
            if ((target.items?.length ?? 0) > 0 || (target.subTopics?.length ?? 0) > 0) {
                console.warn('[NarrativeActivity] _handleThemeDelete: topic is not empty, aborting');
                return;
            }

            const removed = this._removeTopicById(hierarchy, topicId);
            if (!removed) return;

            const writeTopics = hierarchy.map(t => this._hierarchyToWrite(t));
            const updated = await apiClient.patchChapter(fresh.itemId, {
                osHierarchy:       { topics: writeTopics },
                expectedVersionId: fresh.versionId,
                ...commit,
            });

            if (updated?.versionId) chapter.versionId = updated.versionId;
            if (updated?.osHierarchy) chapter.osHierarchy = updated.osHierarchy;
            chapter._fullyLoaded = true;

            // Rebuild TOC and navigate body back to chapter narrative
            const unassigned = await this._computeUnassignedOStars(chapter);
            this._toc._hierarchy = this._toc._parseHierarchy(chapter);
            this._toc._unassignedOStars = unassigned;
            this._toc.refreshTree();
            this._toc.setActiveKey(null);
            this._body.renderSelectionRead({ type: 'chapter' }, chapter);
        } catch (error) {
            errorHandler.handle(error, 'narrative-theme-delete');
        }
    }

    // -------------------------------------------------------------------------
    // Hierarchy utilities
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // Commit gate (LCM)
    // -------------------------------------------------------------------------

    /**
     * Run the shared LCM commit gate once for a single logical chapter write.
     * Returns the commit fields to spread into a patchChapter payload, or null if
     * the user cancelled (callers must abort the write on null).
     *
     * Every chapter PATCH requires changeSetId (ChapterPatchRequest.required), so
     * this gate fronts every chapter write path: narrative, topic, +Theme, +O*
     * insert, delete-theme, and the buffered hierarchy session.
     * @returns {Promise<{changeSetId: string, note?: string} | null>}
     */
    async _commitFor() {
        const commit = await openChangeSetCommitDialog(this.app, { allowNote: true });
        if (!commit) return null;
        return commit.note
            ? { changeSetId: commit.changeSetId, note: commit.note }
            : { changeSetId: commit.changeSetId };
    }

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
     * DFS removal of a topic node by its stable id string.
     * Mutates the array in place. Returns true if the node was found and removed.
     * @param {object[]} nodes
     * @param {string}   topicId
     * @returns {boolean}
     */
    _removeTopicById(nodes, topicId) {
        for (let i = 0; i < (nodes?.length ?? 0); i++) {
            if (String(nodes[i].id) === String(topicId)) {
                nodes.splice(i, 1);
                return true;
            }
            if (this._removeTopicById(nodes[i].subTopics ?? [], topicId)) return true;
        }
        return false;
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
        this._allOStarsCache = allOStars;  // reused by _computeUnassignedFromHierarchy during buffered sessions
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