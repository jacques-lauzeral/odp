/**
 * @file chapter-body.js
 * @description Chapter body — right panel of the Narrative activity.
 *
 * Three render methods:
 *
 *   renderOdipPlaceholder()
 *     → Shown at ODIP scope before any chapter is selected.
 *
 *   renderSelectionRead(entry, chapter, forceReadOnly?)
 *     → Renders a single TOC entry:
 *         entry.type === 'chapter'    → chapter narrative (editable or R/O)
 *         entry.type === 'topic'      → topic header + O* card list
 *         entry.type === 'unassigned' → unassigned O* list
 *         entry.type === 'ostar'      → O* detail view (RequirementDetails / ChangeDetails)
 *
 * Edit (Elaborate only): always as popup, consistent with elaborate/os.
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import RichTextComponent from '../../../../components/rich-text-component.js';

export default class ChapterBody {
    /**
     * @param {HTMLElement} container
     * @param {object}   options
     * @param {object}   options.app
     * @param {boolean}  options.isEditable
     * @param {Function} options.onSaved             — (chapterId) after successful narrative patch
     */
    constructor(container, options = {}) {
        this.container   = container;
        this._app        = options.app;
        this._isEditable = options.isEditable ?? false;
        this._onSaved    = options.onSaved ?? (() => {});

        this._richText       = null;
        this._currentChapter = null;
        this._dirty          = false;
        this._saving         = false;

        this._requirementDetails = null;
        this._changeDetails      = null;
    }

    // =========================================================================
    // Public render methods
    // =========================================================================

    /**
     * ODIP scope placeholder — no chapter selected yet.
     */
    renderOdipPlaceholder() {
        this._destroyRichText();
        this._currentChapter = null;
        this.container.innerHTML = `
            <div class="master-detail__placeholder">
                <p class="master-detail__placeholder-text">Select a chapter or dive in to read</p>
            </div>
        `;
    }

    /**
     * Render a single TOC entry.
     * @param {object}  entry
     * @param {object}  chapter
     * @param {boolean} [forceReadOnly=false] — true when called from ODIP scope
     */
    async renderSelectionRead(entry, chapter, forceReadOnly = false) {
        await this._autoSaveIfDirty();
        this._destroyRichText();
        this._currentChapter = chapter;

        const editable = this._isEditable && !forceReadOnly;

        if (entry.type === 'chapter') {
            this._renderChapterNarrative(chapter, editable);
        } else if (entry.type === 'topic') {
            this._renderTopic(entry.topic);
        } else if (entry.type === 'unassigned') {
            this._renderUnassigned(entry.items ?? []);
        } else if (entry.type === 'ostar') {
            await this._renderOStar(entry.ostar);
        }
    }

    clear() {
        this._autoSaveIfDirty();
        this._destroyRichText();
        this._currentChapter = null;
        this.container.innerHTML = `
            <div class="master-detail__placeholder">
                <p class="master-detail__placeholder-text">Select an entry in the TOC</p>
            </div>
        `;
    }

    cleanup() {
        this._destroyRichText();
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();
        this.container              = null;
        this._requirementDetails    = null;
        this._changeDetails         = null;
        this._currentChapter        = null;
    }

    // =========================================================================
    // Selection-read renderers
    // =========================================================================

    _renderChapterNarrative(chapter, editable) {
        const title = this._esc(chapter.title ?? chapter.code ?? '');

        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    <h2 class="chapter-body__title">${title}</h2>
                    ${editable ? `
                        <div class="chapter-body__actions">
                            <button class="odip-btn odip-btn--primary chapter-body__save" disabled>Save</button>
                            <span class="chapter-body__status"></span>
                        </div>
                    ` : ''}
                </div>
                <div class="chapter-body__editor-wrap">
                    <div id="chapterNarrativeEditor" class="chapter-body__editor"></div>
                </div>
            </div>
        `;

        const editorEl = this.container.querySelector('#chapterNarrativeEditor');
        this._initRichTextNarrative(editorEl, chapter.narrative, editable);

        if (editable) {
            this.container.querySelector('.chapter-body__save')
                ?.addEventListener('click', () => this._saveNarrative(chapter));
        }
    }

    _renderTopic(topic) {
        const items = topic?.items ?? [];
        const title = this._esc(topic?.topic ?? '');

        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    <h3 class="chapter-body__title chapter-body__title--topic">${title}</h3>
                </div>
                <div class="chapter-body__ostar-list">
                    ${items.length === 0
            ? '<p class="chapter-body__empty">No O*s assigned to this topic.</p>'
            : items.map(item => this._renderOStarCard(item)).join('')}
                </div>
            </div>
        `;
        this._attachOStarCardListeners();
    }

    _renderUnassigned(items) {
        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    <h3 class="chapter-body__title chapter-body__title--topic">
                        ⚠ Unassigned O*s (${items.length})
                    </h3>
                </div>
                <p class="chapter-body__unassigned-hint">
                    These O*s belong to this chapter's domain but are not assigned to any topic.
                </p>
                <div class="chapter-body__ostar-list">
                    ${items.length === 0
            ? '<p class="chapter-body__empty">No unassigned O*s.</p>'
            : items.map(item => this._renderOStarCard(item)).join('')}
                </div>
            </div>
        `;
        this._attachOStarCardListeners();
    }

    async _renderOStar(ostar) {
        if (!ostar?.id) {
            this.container.innerHTML =
                '<div class="chapter-body"><p class="chapter-body__empty">O* not found.</p></div>';
            return;
        }

        const type = (ostar.type ?? 'OR').toUpperCase();
        this.container.innerHTML =
            '<div class="chapter-body chapter-body--ostar"><div class="chapter-body__ostar-detail" id="chapterOStarDetail"></div></div>';
        const detailEl = this.container.querySelector('#chapterOStarDetail');
        const config   = this._buildOStarConfig();

        if (type === 'OC') {
            await this._ensureChangeDetails(config);
            await this._changeDetails.render(detailEl, ostar.id, 'panel', {});
        } else {
            await this._ensureRequirementDetails(config);
            await this._requirementDetails.render(detailEl, ostar.id, 'panel', {});
        }
    }

    _renderOStarCard(item) {
        const id    = item.id ?? item.itemId ?? '';
        const type  = (item.type ?? 'OR').toUpperCase();
        const code  = item.code  ?? '';
        const title = item.title ?? String(id);
        const label = code ? `${code} — ${title}` : title;
        const cls   = type === 'ON' ? 'ostar-type-on'
            : type === 'OR'         ? 'ostar-type-or'
                : type === 'OC'         ? 'ostar-type-oc'
                    :                         'ostar-type-other';

        return `
            <div class="chapter-body__ostar-card" data-id="${this._esc(String(id))}" data-type="${type}">
                <span class="chapter-body__ostar-badge ${cls}">${type}</span>
                <span class="chapter-body__ostar-label">${this._esc(label)}</span>
                ${this._isEditable
            ? `<button class="odip-btn odip-btn--sm chapter-body__ostar-edit"
                               data-id="${this._esc(String(id))}" data-type="${type}">Edit</button>`
            : ''}
            </div>
        `;
    }

    _attachOStarCardListeners() {
        this.container.querySelectorAll('.chapter-body__ostar-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                this._openOStarEdit(btn.dataset.id, btn.dataset.type);
            });
        });
    }

    // =========================================================================
    // O* edit popup
    // =========================================================================

    async _openOStarEdit(id, type) {
        const ostar = { id, type };
        await this._renderOStar(ostar);
        const config = this._buildOStarConfig();
        if ((type ?? '').toUpperCase() === 'OC') {
            await this._ensureChangeDetails(config);
            await this._changeDetails._openEditPopup();
        } else {
            await this._ensureRequirementDetails(config);
            await this._requirementDetails._openEditPopup();
        }
    }

    _buildOStarConfig() {
        return { mode: this._isEditable ? 'edit' : 'read', dataSource: 'live' };
    }

    async _ensureRequirementDetails(config) {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('../os/requirement-details.js');
            this._requirementDetails = new RequirementDetails(this._app, config);
        }
    }

    async _ensureChangeDetails(config) {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('../os/change-details.js');
            this._changeDetails = new ChangeDetails(this._app, config);
        }
    }

    // =========================================================================
    // Narrative save
    // =========================================================================

    _initRichTextNarrative(el, deltaJson, editable) {
        this._richText = new RichTextComponent({
            readOnly:    !editable,
            headings:    true,
            images:      true,
            tables:      true,
            placeholder: 'Write chapter narrative…',
            onChange: () => {
                if (!editable) return;
                this._dirty = true;
                const saveBtn = this.container?.querySelector('.chapter-body__save');
                if (saveBtn) saveBtn.disabled = false;
            },
        });

        this._richText.mount(el);
        el.classList.add('rich-text-component--fill');

        if (deltaJson) {
            this._richText.setValue(typeof deltaJson === 'string' ? deltaJson : JSON.stringify(deltaJson));
        }

        if (!editable) {
            this._richText.blur();
        }
    }

    async _saveNarrative(chapter) {
        if (!this._richText || this._saving) return;
        this._saving = true;

        const saveBtn  = this.container?.querySelector('.chapter-body__save');
        const statusEl = this.container?.querySelector('.chapter-body__status');
        if (saveBtn)  saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';

        try {
            const narrative = this._richText.getValue() ?? '';
            const updated = await apiClient.patchChapter(chapter.itemId, {
                narrative,
                expectedVersionId: chapter.versionId,
            });
            if (updated?.versionId) chapter.versionId = updated.versionId;
            if (updated?.narrative) chapter.narrative  = updated.narrative;
            this._dirty  = false;
            this._saving = false;
            if (statusEl) {
                statusEl.textContent = '✓ Saved';
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
            }
            this._onSaved(chapter.itemId);
        } catch (error) {
            this._saving = false;
            errorHandler.handle(error, 'chapter-body-save');
            const statusEl2 = this.container?.querySelector('.chapter-body__status');
            const saveBtn2  = this.container?.querySelector('.chapter-body__save');
            if (statusEl2) statusEl2.textContent = '⚠ Save failed';
            if (saveBtn2)  saveBtn2.disabled = false;
        }
    }

    async _autoSaveIfDirty() {
        if (this._dirty && this._currentChapter) {
            await this._saveNarrative(this._currentChapter);
        }
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    _destroyRichText() {
        if (this._richText) {
            this._richText.destroy();
            this._richText = null;
        }
        this._dirty  = false;
        this._saving = false;
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}