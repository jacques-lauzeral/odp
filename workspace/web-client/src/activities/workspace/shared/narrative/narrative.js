/**
 * @file narrative.js
 * @description Narrative sub-activity. Editorial workspace for chapter narrative
 * and O* organisation within ODIP editions.
 *
 * Layout:
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │ Left panel (TOC)     │ Body (right panel)           │
 *   │                      │                              │
 *   │ ODIP scope:          │ selection-read:              │
 *   │   chapter tree       │   chapter narrative (R/O)    │
 *   │   expand/collapse    │   or topic card list         │
 *   │   select / dive →    │   or O* detail               │
 *   │                      │                              │
 *   │ Chapter scope:       │ sequential:                  │
 *   │   ← back             │   narrative → topics → O*s  │
 *   │   narrative (select) │   edit buttons (Elaborate)   │
 *   │   topic → O*s        │                              │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * Scope state machine:
 *   'odip'    — full chapter tree; default mode: selection-read
 *   'chapter' — single chapter TOC; default mode: sequential
 *
 * Body modes (chapter scope only):
 *   'sequential'     — full scrollable document; TOC sync available
 *   'selection-read' — single selected entry
 *
 * Edit (Elaborate only): always as popup, consistent with elaborate/os.
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

        // Body mode (chapter scope)
        this._mode            = 'sequential';  // 'sequential' | 'selection-read'
        this._syncEnabled     = false;
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

        this._scope             = 'odip';
        this._selectedChapter   = null;
        this._odipSelection     = null;
        this._mode              = 'sequential';
        this._syncEnabled       = false;

        this._renderShell();
        this.app.header.setBreadcrumb([{ label: 'Narrative' }]);

        // Start in ODIP scope — show chapter tree, no pre-selection
        this._toc.renderOdip(this._chapters, null);
        this._body.renderOdipPlaceholder();
    }

    async handleSubPath(subPath) {
        return this.render(this.container, subPath);
    }

    async cleanup() {
        this._body?.stopSync?.();
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
            onOdipSelect:         (chapter) => this._handleOdipSelect(chapter),
            onDive:               (chapter) => this._diveIntoChapter(chapter),
            onClimb:              ()         => this._climbToOdip(),
            onChapterSelect:      (entry)    => this._handleChapterTocSelect(entry),
            buildOrderedChapters: ()         => this._buildOrderedChapters(),
        });

        this._body = new ChapterBody(this._masterDetail.detailContainer, {
            app:               this.app,
            isEditable:        this._isEditable,
            onSaved:           (_id) => { /* versionId updated in place */ },
            onVisibleKeyChange: (key) => this._handleBodyVisibleKey(key),
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
        this.app.header.setBreadcrumb([
            { label: 'Narrative' },
            { label: chapter.title ?? chapter.code ?? '' },
        ]);

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
     * User clicked dive (→) on a chapter node.
     * Switches to chapter scope.
     * @param {object} chapter
     */
    async _diveIntoChapter(chapter) {
        const full = await this._loadChapter(chapter);
        if (!full) return;

        this._scope           = 'chapter';
        this._selectedChapter = full;
        this._mode            = 'sequential';
        this._syncEnabled     = false;

        this.app.header.setBreadcrumb([
            { label: 'Narrative' },
            { label: full.title ?? full.code ?? '' },
        ]);

        await this._toc.renderChapter(full);
        await this._body.renderSequential(full);
        this._renderModeControls();
    }

    // -------------------------------------------------------------------------
    // Chapter scope — climb back to ODIP
    // -------------------------------------------------------------------------

    _climbToOdip() {
        this._body?.stopSync?.();
        this._scope           = 'chapter';   // will become 'odip' below
        this._selectedChapter = null;
        this._mode            = 'sequential';
        this._syncEnabled     = false;
        this._scope           = 'odip';

        this.app.header.setBreadcrumb([{ label: 'Narrative' }]);
        this._toc.renderOdip(this._chapters, this._odipSelection);
        this._body.renderOdipPlaceholder();
        this._removeModeControls();
    }

    // -------------------------------------------------------------------------
    // Chapter scope — TOC selection
    // -------------------------------------------------------------------------

    /**
     * User clicked a TOC entry in chapter scope.
     * Switches body to selection-read and updates mode toggle.
     * @param {object} entry
     */
    _handleChapterTocSelect(entry) {
        this._mode = 'selection-read';
        this._body.stopSync?.();
        this._syncEnabled = false;
        this._body.renderSelectionRead(entry, this._selectedChapter);
        this._updateModeControls();
    }

    // -------------------------------------------------------------------------
    // Mode controls (chapter scope only)
    // -------------------------------------------------------------------------

    _renderModeControls() {
        this._removeModeControls();
        const bar = document.createElement('div');
        bar.className = 'narrative-mode-bar';
        bar.id        = 'narrativeModeBar';
        bar.innerHTML = `
            <div class="narrative-mode-bar__modes">
                <button class="odip-btn narrative-mode-bar__btn narrative-mode-bar__btn--active"
                        id="narrativeModeSeq" title="Sequential read">≡ Sequential</button>
                <button class="odip-btn narrative-mode-bar__btn"
                        id="narrativeModeSelect" title="Selection read">◻ Selection</button>
            </div>
            <div class="narrative-mode-bar__sync" id="narrativeSyncWrap" style="display:none">
                <button class="odip-btn narrative-mode-bar__btn narrative-mode-bar__btn--sync"
                        id="narrativeSyncBtn" title="Synchronise TOC and body scroll">⇄ Sync</button>
            </div>
        `;
        // Insert above the MasterDetail content area
        const contentEl = dom.find('#narrativeContent', this.container);
        contentEl?.parentElement?.insertBefore(bar, contentEl);
        this._attachModeListeners();
    }

    _removeModeControls() {
        dom.find('#narrativeModeBar', this.container)?.remove();
    }

    _updateModeControls() {
        const seqBtn    = dom.find('#narrativeModeSeq',    this.container);
        const selBtn    = dom.find('#narrativeModeSelect', this.container);
        const syncWrap  = dom.find('#narrativeSyncWrap',   this.container);
        if (!seqBtn) return;

        const isSeq = this._mode === 'sequential';
        seqBtn.classList.toggle('narrative-mode-bar__btn--active', isSeq);
        selBtn.classList.toggle('narrative-mode-bar__btn--active', !isSeq);
        if (syncWrap) syncWrap.style.display = isSeq ? '' : 'none';

        const syncBtn = dom.find('#narrativeSyncBtn', this.container);
        if (syncBtn) {
            syncBtn.classList.toggle('narrative-mode-bar__btn--sync-on', this._syncEnabled);
            syncBtn.textContent = this._syncEnabled ? '⇄ Sync ✓' : '⇄ Sync';
        }
    }

    _attachModeListeners() {
        dom.find('#narrativeModeSeq', this.container)?.addEventListener('click', async () => {
            if (this._mode === 'sequential') return;
            this._mode = 'sequential';
            await this._body.renderSequential(this._selectedChapter);
            this._updateModeControls();
        });

        dom.find('#narrativeModeSelect', this.container)?.addEventListener('click', () => {
            if (this._mode === 'selection-read') return;
            this._mode = 'selection-read';
            this._body.stopSync?.();
            this._syncEnabled = false;
            this._body.renderSelectionRead({ type: 'chapter' }, this._selectedChapter);
            this._updateModeControls();
        });

        dom.find('#narrativeSyncBtn', this.container)?.addEventListener('click', () => {
            this._syncEnabled = !this._syncEnabled;
            if (this._syncEnabled) {
                this._body.startSync?.();
            } else {
                this._body.stopSync?.();
            }
            this._updateModeControls();
        });
    }

    // -------------------------------------------------------------------------
    // Body → TOC sync callback
    // -------------------------------------------------------------------------

    /**
     * Called by ChapterBody IntersectionObserver when the topmost visible
     * section changes in sequential mode.
     * @param {string} key
     */
    _handleBodyVisibleKey(key) {
        if (this._mode === 'sequential' && this._syncEnabled) {
            this._toc.setActiveKey(key);
        }
    }

    // -------------------------------------------------------------------------
    // Chapter data loading
    // -------------------------------------------------------------------------

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
    // Chapter ordering (for TOC)
    // -------------------------------------------------------------------------

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