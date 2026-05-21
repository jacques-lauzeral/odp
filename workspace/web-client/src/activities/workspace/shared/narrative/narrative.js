/**
 * @file narrative.js
 * @description Narrative sub-activity. Editorial workspace for chapter narrative
 * and O* organisation within ODIP editions.
 *
 * Layout:
 *   ┌──────────────────────┬──────────────────────────────┐
 *   │ Chapter selector     │ Body (right panel)           │
 *   │ (top of left panel)  │                              │
 *   ├──────────────────────┤ Default: chapter narrative   │
 *   │ TOC — O*s only:      │ On O* select: O* detail      │
 *   │ topics → O*s         │                              │
 *   │ Unassigned bucket    │                              │
 *   └──────────────────────┴──────────────────────────────┘
 *
 * Selection model:
 *   Chapter change   → TOC re-renders, body shows chapter narrative
 *   TOC O* click     → body shows O* detail
 *   TOC topic click  → body shows topic O* list
 *   No selection     → body shows chapter narrative (default)
 *
 * Context/mode from app.getDatasetContext():
 *   { type: 'live' }               → isEditable: true  (Elaborate)
 *   { type: 'edition', editionId } → isEditable: false (Explore)
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { dom } from '../../../../shared/utils.js';
import MasterDetail from '../../../../components/master-detail.js';
import ChapterToc from './chapter-toc.js';
import ChapterBody from './chapter-body.js';

export default class NarrativeActivity {
    /** @param {import('../../../../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container     = null;
        this._masterDetail = null;
        this._toc          = null;
        this._body         = null;
        this._chapters     = [];
        this._chapterMap   = new Map();
        this._selectedChapter = null;
        this._isEditable   = false;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;

        const ctx = this.app.getDatasetContext();
        this._isEditable = ctx?.type === 'live';

        this.container.innerHTML = '<div class="narrative-loading"><p>Loading…</p></div>';

        try {
            this._chapters = await this.app.getChapters();
            this._chapterMap = new Map(this._chapters.map(c => [c.itemId, c]));
        } catch (error) {
            errorHandler.handle(error, 'narrative');
            this.container.innerHTML = `
                <div class="activity-placeholder"><p>Failed to load chapters.</p></div>
            `;
            return;
        }

        this._renderShell();
        this.app.header.setBreadcrumb([{ label: 'Narrative' }]);

        // Auto-select first root chapter
        const firstRoot = this._chapters.find(c => c.parentItemId == null);
        if (firstRoot) this._selectChapter(firstRoot);
    }

    async handleSubPath(subPath) {
        return this.render(this.container, subPath);
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
        this.container        = null;
    }

    // -------------------------------------------------------------------------
    // Shell — no toolbar row; chapter selector lives in the left panel header
    // -------------------------------------------------------------------------

    _renderShell() {
        this.container.innerHTML = `
            <div class="narrative-activity">
                <div class="narrative-content" id="narrativeContent"></div>
            </div>
        `;

        const contentEl = dom.find('#narrativeContent', this.container);

        this._masterDetail = new MasterDetail(contentEl, { initialRatio: 0.30 });
        this._masterDetail.render();

        this._toc = new ChapterToc(this._masterDetail.listContainer, {
            isEditable:           this._isEditable,
            chapters:             this._chapters,
            chapterMap:           this._chapterMap,
            onChapterChange:      (chapter) => this._selectChapter(chapter),
            onSelect:             (entry)   => this._handleTocSelect(entry),
            buildOrderedChapters: ()        => this._buildOrderedChapters(),
        });
        this._toc.renderSelector();

        this._body = new ChapterBody(this._masterDetail.detailContainer, {
            app:        this.app,
            isEditable: this._isEditable,
            onSaved:    (_chapterId) => { /* versionId updated in place */ },
        });
    }

    // -------------------------------------------------------------------------
    // Chapter ordering
    // -------------------------------------------------------------------------

    _buildOrderedChapters() {
        const byParent = new Map();
        for (const c of this._chapters) {
            const key = c.parentItemId ?? null;
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(c);
        }
        for (const group of byParent.values()) {
            group.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
        const result = [];
        const walk = (parentId, depth) => {
            for (const c of (byParent.get(parentId) ?? [])) {
                result.push({ chapter: c, depth });
                walk(c.itemId, depth + 1);
            }
        };
        walk(null, 0);
        return result;
    }

    // -------------------------------------------------------------------------
    // Chapter selection — fetches full chapter, renders TOC + narrative default
    // -------------------------------------------------------------------------

    async _selectChapter(chapter) {
        this._selectedChapter = chapter;
        this.app.header.setBreadcrumb([
            { label: 'Narrative' },
            { label: chapter.title ?? chapter.key ?? '' },
        ]);

        let full = chapter;
        if (!full._fullyLoaded) {
            try {
                const fetched        = await apiClient.getChapter(chapter.itemId);
                const cachedTitle    = chapter.title;
                const cachedDomain   = chapter.domain;
                const cachedPosition = chapter.position;
                Object.assign(chapter, fetched);
                if (cachedTitle)    chapter.title    = cachedTitle;
                if (cachedDomain)   chapter.domain   = cachedDomain;
                if (cachedPosition != null) chapter.position = cachedPosition;
                chapter._fullyLoaded = true;
                full = chapter;
            } catch (error) {
                errorHandler.handle(error, 'narrative-chapter-load');
                return;
            }
        }

        // Render TOC (O*s only) and show narrative as default body
        this._toc.renderChapter(full);
        this._body.renderNarrative(full);
    }

    // -------------------------------------------------------------------------
    // TOC selection handler
    // -------------------------------------------------------------------------

    _handleTocSelect(entry) {
        this._body.render(entry, this._selectedChapter);
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}