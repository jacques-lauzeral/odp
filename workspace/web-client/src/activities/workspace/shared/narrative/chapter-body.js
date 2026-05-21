/**
 * @file chapter-body.js
 * @description Chapter body — right panel of the Narrative activity.
 *
 * Renders the content of the selected TOC entry:
 *
 *   entry.type === 'chapter'
 *     → Chapter narrative block (Quill editor, editable or read-only)
 *
 *   entry.type === 'topic'
 *     → Topic header + list of O* cards (read-only summary)
 *
 *   entry.type === 'ostar'
 *     → Single O* detail view (RequirementDetails or ChangeDetails, panel mode)
 *
 * Single active editor constraint: only one element editable at a time.
 * Activating a new element auto-saves the current one if dirty.
 *
 * Quill toolbar for narrative (headings enabled):
 *   [H1][H2][H3] | [B][I] | [ul][ol] | [link]
 *
 * Quill toolbar for O* rich text fields (no headings — owned by form layer).
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';

export default class ChapterBody {
    /**
     * @param {HTMLElement} container
     * @param {object}   options
     * @param {object}   options.app
     * @param {boolean}  options.isEditable
     * @param {Function} options.onSaved   — called with chapterId after successful patch
     */
    constructor(container, options = {}) {
        this.container   = container;
        this._app        = options.app;
        this._isEditable = options.isEditable ?? false;
        this._onSaved    = options.onSaved ?? (() => {});

        this._quill          = null;   // active Quill instance
        this._currentEntry   = null;
        this._currentChapter = null;
        this._dirty          = false;
        this._saving         = false;

        // O* detail instances — lazily created, reused
        this._requirementDetails = null;
        this._changeDetails      = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /**
     * Render chapter narrative — default body state when no O* is selected.
     * Called directly by NarrativeActivity on chapter change.
     * @param {object} chapter
     */
    async renderNarrative(chapter) {
        await this._autoSaveIfDirty();
        this._currentEntry   = { type: 'chapter' };
        this._currentChapter = chapter;
        this._destroyQuill();
        this._renderChapterNarrative(chapter);
    }

    /**
     * Render body for the given TOC entry (topic, ostar, unassigned).
     * @param {object} entry   — { type, topic?, ostar?, items? }
     * @param {object} chapter — current full chapter object
     */
    async render(entry, chapter) {
        await this._autoSaveIfDirty();

        this._currentEntry   = entry;
        this._currentChapter = chapter;

        this._destroyQuill();

        if (entry.type === 'topic') {
            this._renderTopic(entry.topic, chapter);
        } else if (entry.type === 'unassigned') {
            this._renderUnassigned(entry.items ?? []);
        } else if (entry.type === 'ostar') {
            await this._renderOStar(entry.ostar);
        }
    }

    /**
     * Clear the body panel — restore placeholder.
     */
    clear() {
        this._autoSaveIfDirty();
        this._destroyQuill();
        this._currentEntry   = null;
        this._currentChapter = null;
        this.container.innerHTML = `
            <div class="master-detail__placeholder">
                <p class="master-detail__placeholder-text">Select an entry in the TOC</p>
            </div>
        `;
    }

    cleanup() {
        this._destroyQuill();
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();
        this.container              = null;
        this._requirementDetails    = null;
        this._changeDetails         = null;
        this._currentEntry          = null;
        this._currentChapter        = null;
    }

    // -------------------------------------------------------------------------
    // Chapter narrative
    // -------------------------------------------------------------------------

    _renderChapterNarrative(chapter) {
        const title = this._esc(chapter.title ?? chapter.key ?? '');

        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    <h2 class="chapter-body__title">${title}</h2>
                    ${this._isEditable ? `
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
        this._initQuillNarrative(editorEl, chapter.narrative, this._isEditable);

        if (this._isEditable) {
            this._attachSaveListener(chapter);
        }
    }

    _initQuillNarrative(el, deltaJson, editable) {
        // Quill loaded globally via index.html script tag
        const toolbarOptions = editable ? [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link'],
            ['clean'],
        ] : false;

        this._quill = new Quill(el, {
            theme:    'snow',
            readOnly: !editable,
            modules:  { toolbar: toolbarOptions },
        });

        if (deltaJson) {
            try {
                const delta = typeof deltaJson === 'string' ? JSON.parse(deltaJson) : deltaJson;
                this._quill.setContents(delta, 'silent');
            } catch {
                // Non-Delta content — set as plain text
                this._quill.setText(String(deltaJson), 'silent');
            }
        }

        // Fix: Quill steals focus on init even in read-only mode
        if (!editable) {
            this._quill.root.blur();
        }

        if (editable) {
            this._quill.on('text-change', () => {
                this._dirty = true;
                const saveBtn = this.container.querySelector('.chapter-body__save');
                if (saveBtn) saveBtn.disabled = false;
            });
        }
    }

    _attachSaveListener(chapter) {
        this.container.querySelector('.chapter-body__save')
            ?.addEventListener('click', () => this._saveNarrative(chapter));
    }

    async _saveNarrative(chapter) {
        if (!this._quill || this._saving) return;

        this._saving = true;
        const saveBtn  = this.container.querySelector('.chapter-body__save');
        const statusEl = this.container.querySelector('.chapter-body__status');
        if (saveBtn)  saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';

        try {
            const delta   = JSON.stringify(this._quill.getContents());
            const updated = await apiClient.patchChapter(chapter.itemId, {
                narrative:         delta,
                expectedVersionId: chapter.versionId,
            });
            // Update versionId in place so subsequent saves use correct optimistic lock
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
            if (statusEl) statusEl.textContent = '⚠ Save failed';
            if (saveBtn)  saveBtn.disabled = false;
        }
    }

    // -------------------------------------------------------------------------
    // Unassigned O*s view
    // -------------------------------------------------------------------------

    _renderUnassigned(items) {
        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    <h3 class="chapter-body__title chapter-body__title--topic">
                        ⚠ Unassigned O*s (${items.length})
                    </h3>
                </div>
                <p class="chapter-body__unassigned-hint">
                    These O*s belong to this chapter's domain but are not assigned to any topic in the osHierarchy.
                </p>
                <div class="chapter-body__ostar-list">
                    ${items.length === 0
            ? '<p class="chapter-body__empty">No unassigned O*s.</p>'
            : items.map(item => this._renderOStarCard(item)).join('')
        }
                </div>
            </div>
        `;

        this._attachOStarCardListeners();
    }

    // -------------------------------------------------------------------------
    // Topic view
    // -------------------------------------------------------------------------

    _renderTopic(topic, chapter) {
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
            : items.map(item => this._renderOStarCard(item)).join('')
        }
                </div>
            </div>
        `;

        this._attachOStarCardListeners();
    }

    _renderOStarCard(item) {
        const id    = item.id ?? item.itemId ?? '';
        const type  = (item.type ?? 'OR').toUpperCase();
        const code  = item.code  ?? '';
        const title = item.title ?? String(id);
        const label = code ? `${code} — ${title}` : title;
        const cls   = type === 'ON' ? 'ostar-type-on'
            : type === 'OR' ? 'ostar-type-or'
                : type === 'OC' ? 'ostar-type-oc'
                    : 'ostar-type-other';

        return `
            <div class="chapter-body__ostar-card" data-id="${this._esc(String(id))}" data-type="${type}">
                <span class="chapter-body__ostar-badge ${cls}">${type}</span>
                <span class="chapter-body__ostar-label">${this._esc(label)}</span>
                ${this._isEditable
            ? `<button class="odip-btn chapter-body__ostar-edit" data-id="${this._esc(String(id))}" data-type="${type}">Edit</button>`
            : ''}
            </div>
        `;
    }

    _attachOStarCardListeners() {
        this.container.querySelectorAll('.chapter-body__ostar-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id   = btn.dataset.id;
                const type = btn.dataset.type;
                this._openOStarEdit(id, type);
            });
        });
    }

    // -------------------------------------------------------------------------
    // O* detail view
    // -------------------------------------------------------------------------

    async _renderOStar(ostar) {
        if (!ostar?.id) {
            this.container.innerHTML = '<div class="chapter-body"><p class="chapter-body__empty">O* not found.</p></div>';
            return;
        }

        const type = (ostar.type ?? 'OR').toUpperCase();
        this.container.innerHTML = '<div class="chapter-body chapter-body--ostar"><div class="chapter-body__ostar-detail" id="chapterOStarDetail"></div></div>';
        const detailEl = this.container.querySelector('#chapterOStarDetail');

        const config = this._buildOStarConfig();

        if (type === 'OC') {
            await this._ensureChangeDetails(config);
            await this._changeDetails.render(detailEl, ostar.id, 'panel', {});
        } else {
            await this._ensureRequirementDetails(config);
            await this._requirementDetails.render(detailEl, ostar.id, 'panel', {});
        }
    }

    async _openOStarEdit(id, type) {
        // Render the detail view first — this loads item into the details instance.
        // Then open the edit popup on the loaded instance.
        const ostar = { id, type };
        await this._renderOStar(ostar);
        const config = this._buildOStarConfig();
        if (type === 'OC') {
            await this._ensureChangeDetails(config);
            await this._changeDetails._openEditPopup();
        } else {
            await this._ensureRequirementDetails(config);
            await this._requirementDetails._openEditPopup();
        }
    }

    _buildOStarConfig() {
        return {
            mode:       this._isEditable ? 'edit' : 'read',
            dataSource: 'live',
        };
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

    // -------------------------------------------------------------------------
    // Auto-save
    // -------------------------------------------------------------------------

    async _autoSaveIfDirty() {
        if (this._dirty && this._currentChapter && this._currentEntry?.type === 'chapter') {
            await this._saveNarrative(this._currentChapter);
        }
    }

    // -------------------------------------------------------------------------
    // Quill cleanup
    // -------------------------------------------------------------------------

    _destroyQuill() {
        if (this._quill) {
            // Remove Quill DOM — container will be replaced on next render
            this._quill = null;
        }
        this._dirty  = false;
        this._saving = false;
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