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
import { buildLinkProvider } from '../../../../components/link-provider.js';

export default class ChapterBody {
    /**
     * @param {HTMLElement} container
     * @param {object}   options
     * @param {object}   options.app
     * @param {boolean}  options.isEditable
     * @param {Function} options.onSaved             — (chapterId) after successful narrative patch
     */
    constructor(container, options = {}) {
        this.container        = container;
        this._app             = options.app;
        this._isEditable      = options.isEditable ?? false;
        this._onSaved                = options.onSaved                ?? (() => {});
        this._onChapterSelect        = options.onChapterSelect        ?? (() => {});
        this._onTopicNarrativeSave   = options.onTopicNarrativeSave   ?? (() => {});
        this._onTopicTitleSave       = options.onTopicTitleSave       ?? (() => {});
        this._onThemeDelete          = options.onThemeDelete          ?? (() => {});
        this._onOStarSaved           = options.onOStarSaved           ?? (() => {});

        this._richText       = null;
        this._currentChapter = null;
        this._dirty          = false;
        this._saving         = false;

        this._requirementDetails = null;
        this._changeDetails      = null;
        this._linkProvider       = null;
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
        const items      = topic?.items     ?? [];
        const subTopics  = topic?.subTopics ?? [];
        const title      = topic?.topic     ?? '';
        const narrative  = topic?.narrative ?? null;
        const editable   = this._isEditable;
        const topicId    = topic?.id        ?? null;
        const isEmpty    = items.length === 0 && subTopics.length === 0;

        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    ${editable ? `
                        <input class="odip-input chapter-body__topic-title"
                               id="topicTitleInput"
                               type="text"
                               value="${this._esc(title)}"
                               placeholder="Theme title…"
                               maxlength="200" />
                        <div class="chapter-body__actions">
                            ${isEmpty ? `
                                <button class="odip-btn odip-btn--danger chapter-body__topic-delete"
                                        title="Delete this theme">Delete theme</button>
                            ` : ''}
                            <button class="odip-btn odip-btn--primary chapter-body__topic-save" disabled>Save</button>
                            <span class="chapter-body__status"></span>
                        </div>
                    ` : `
                        <h3 class="chapter-body__title chapter-body__title--topic">${this._esc(title)}</h3>
                    `}
                </div>
                <div class="chapter-body__topic-narrative">
                    <div id="topicNarrativeEditor" class="chapter-body__editor"></div>
                </div>
                <div class="chapter-body__ostar-list">
                    ${items.length === 0
            ? '<p class="chapter-body__empty">No O*s assigned to this topic.</p>'
            : items.map(item => this._renderOStarCard(item)).join('')}
                </div>
            </div>
        `;

        // Title input — save on blur or Enter
        if (editable) {
            const titleInput = this.container.querySelector('#topicTitleInput');
            if (titleInput) {
                const markDirty = () => {
                    this._dirty = true;
                    const saveBtn = this.container?.querySelector('.chapter-body__topic-save');
                    if (saveBtn) saveBtn.disabled = false;
                };
                titleInput.addEventListener('input', markDirty);
                titleInput.addEventListener('blur', () => {
                    if (this._dirty) this._saveTopicTitle(topicId, titleInput);
                });
                titleInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { e.preventDefault(); titleInput.blur(); }
                    if (e.key === 'Escape') {
                        titleInput.value = title;  // revert
                        this._dirty = false;
                        const saveBtn = this.container?.querySelector('.chapter-body__topic-save');
                        if (saveBtn) saveBtn.disabled = true;
                        titleInput.blur();
                    }
                });
            }

            this.container.querySelector('.chapter-body__topic-delete')
                ?.addEventListener('click', () => this._deleteTheme(topicId));

            this.container.querySelector('.chapter-body__topic-save')
                ?.addEventListener('click', () => this._saveTopicNarrative(topic, topicId));
        }

        const narrativeEl = this.container.querySelector('#topicNarrativeEditor');

        if (editable) {
            this._richText = new RichTextComponent({
                readOnly:    false,
                headings:    true,
                images:      true,
                tables:      true,
                placeholder: 'Write theme narrative…',
                linkProvider: (this._linkProvider ??= buildLinkProvider(this._app)),
                onChange: () => {
                    this._dirty = true;
                    const saveBtn = this.container?.querySelector('.chapter-body__topic-save');
                    if (saveBtn) saveBtn.disabled = false;
                },
                onInternalLink: (type, value) => this._handleInternalLink(type, value),
            });
            this._richText.mount(narrativeEl);
            narrativeEl.classList.add('rich-text-component--fill');
            if (narrative) {
                this._richText.setValue(typeof narrative === 'string' ? narrative : JSON.stringify(narrative));
            }
        } else {
            if (narrative) {
                const rt = new RichTextComponent({ readOnly: true });
                rt.mount(narrativeEl);
                rt.setValue(typeof narrative === 'string' ? narrative : JSON.stringify(narrative));
                rt.blur();
            } else {
                narrativeEl.classList.add('chapter-body__editor--empty');
            }
        }

        this._attachOStarCardListeners();
    }

    _renderUnassigned(items) {
        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded">
                <div class="chapter-body__header">
                    <h3 class="chapter-body__title chapter-body__title--topic">
                        &lt;unclassified&gt; (${items.length})
                    </h3>
                </div>
                <p class="chapter-body__unassigned-hint">
                    These O*s belong to this chapter's domain but are not yet assigned to any theme.
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

        const callbacks = {
            onFullPage: (item) => this._navigateToFullPage(item),
            onSaved:    (result, mode) => this._onOStarSaved(result, mode),
        };

        if (type === 'OC') {
            await this._ensureChangeDetails(config);
            await this._changeDetails.render(detailEl, ostar.id, 'panel', callbacks);
        } else {
            await this._ensureRequirementDetails(config);
            await this._requirementDetails.render(detailEl, ostar.id, 'panel', callbacks);
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
            <div class="chapter-body__ostar-card chapter-body__ostar-card--link"
                 data-id="${this._esc(String(id))}" data-type="${type}"
                 data-item-id="${this._esc(String(id))}" data-item-type="${type}"
                 role="button" tabindex="0">
                <span class="chapter-body__ostar-badge ${cls}">${type}</span>
                <span class="chapter-body__ostar-label">${this._esc(label)}</span>
            </div>
        `;
    }

    _attachOStarCardListeners() {
        this.container.querySelectorAll('.chapter-body__ostar-card--link').forEach(card => {
            const select = () => {
                const id   = card.dataset.itemId;
                const type = card.dataset.itemType;
                this._onChapterSelect({ type: 'ostar', ostar: { id, type }, chapter: this._currentChapter });
            };
            card.addEventListener('click', select);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
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
            linkProvider: editable
                ? (this._linkProvider ??= buildLinkProvider(this._app))
                : null,
            onChange: () => {
                if (!editable) return;
                this._dirty = true;
                const saveBtn = this.container?.querySelector('.chapter-body__save');
                if (saveBtn) saveBtn.disabled = false;
            },
            onInternalLink: (type, value) => this._handleInternalLink(type, value),
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

    /**
     * Save an edited topic title on blur/Enter.
     * Delegates to NarrativeActivity via onTopicTitleSave.
     * @param {string} topicId
     * @param {HTMLInputElement} inputEl
     */
    async _saveTopicTitle(topicId, inputEl) {
        if (this._saving) return;
        const newTitle = inputEl.value.trim();
        if (!newTitle) {
            // Revert to original value if left empty
            inputEl.value = inputEl.defaultValue;
            this._dirty = false;
            const saveBtn = this.container?.querySelector('.chapter-body__topic-save');
            if (saveBtn) saveBtn.disabled = true;
            return;
        }

        this._saving = true;
        const statusEl = this.container?.querySelector('.chapter-body__status');
        if (statusEl) statusEl.textContent = 'Saving…';

        try {
            await this._onTopicTitleSave(topicId, newTitle);
            // Update the input's baseline value so a subsequent blur doesn't re-save
            inputEl.defaultValue = newTitle;
            this._dirty  = false;
            this._saving = false;
            if (statusEl) {
                statusEl.textContent = '✓ Saved';
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
            }
        } catch (error) {
            this._saving = false;
            errorHandler.handle(error, 'chapter-body-topic-title-save');
            const statusEl2 = this.container?.querySelector('.chapter-body__status');
            if (statusEl2) statusEl2.textContent = '⚠ Save failed';
        }
    }

    /**
     * Delete the current empty theme topic.
     * Delegates to NarrativeActivity via onThemeDelete.
     * @param {string} topicId
     */
    async _deleteTheme(topicId) {
        if (this._saving) return;
        await this._onThemeDelete(topicId);
    }

    /**
     * Save the current rich text value as the narrative for a theme topic.
     * Delegates to NarrativeActivity via onTopicNarrativeSave — the activity
     * owns the chapter version and full hierarchy needed for the PATCH.
     * @param {object} topic   — render-shape topic node (for label/fallback)
     * @param {string} topicId — stable topic id used to locate the node in hierarchy
     */
    async _saveTopicNarrative(topic, topicId) {
        if (!this._richText || this._saving) return;
        this._saving = true;

        const saveBtn  = this.container?.querySelector('.chapter-body__topic-save');
        const statusEl = this.container?.querySelector('.chapter-body__status');
        if (saveBtn)  saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';

        try {
            const narrative = this._richText.getValue() ?? '';
            await this._onTopicNarrativeSave(topicId, narrative);
            this._dirty  = false;
            this._saving = false;
            if (statusEl) {
                statusEl.textContent = '✓ Saved';
                setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
            }
        } catch (error) {
            this._saving = false;
            errorHandler.handle(error, 'chapter-body-topic-save');
            const statusEl2 = this.container?.querySelector('.chapter-body__status');
            const saveBtn2  = this.container?.querySelector('.chapter-body__topic-save');
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

    /**
     * Handle internal link clicks from narrative rich text.
     *
     * n-ref value: {chapterId}[/{topicId}]
     *   Navigates directly to {base}/narrative/{chapterId}[?theme={topicId}]
     *   No chapter lookup required — value is already the opaque itemId.
     *
     * o-ref: navigates to {base}/elaborate/{itemId}
     * d-ref: navigates to {base}/setup/reference-documents/{id}
     *
     * @param {'n-ref'|'o-ref'|'d-ref'} type
     * @param {string} value
     * @private
     */
    _handleInternalLink(type, value) {
        if (!value) return;

        const ctx  = this._app?.getDatasetContext?.();
        const base = ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}`
            : '/elaborate';

        if (type === 'n-ref') {
            const slashIdx  = value.indexOf('/');
            const chapterId = slashIdx >= 0 ? value.slice(0, slashIdx) : value;
            const topicPath = slashIdx >= 0 ? value.slice(slashIdx + 1) : null;

            const path = topicPath
                ? `${base}/narrative/${chapterId}?theme=${encodeURIComponent(topicPath)}`
                : `${base}/narrative/${chapterId}`;

            this._app.navigate(path);
            return;
        }

        if (type === 'o-ref') {
            this._app.findOStar(value).then(ostar => {
                if (!ostar) {
                    console.warn('[ChapterBody] o-ref: O* not found for itemId', value);
                    return;
                }
                this._app.navigate(`${base}/os/${ostar.type}/${value}`);
            }).catch(() => {
                console.warn('[ChapterBody] o-ref: failed to resolve O* for itemId', value);
            });
            return;
        }

        if (type === 'd-ref') {
            this._app.navigate(`${base}/setup/reference-documents/${value}`);
        }
    }

    /**
     * Navigate from the Narrative panel to the full-page O* detail view in the
     * O* workspace — mirrors the 'Full page' button behaviour in os.js.
     * @param {object} item — full O* entity from RequirementDetails / ChangeDetails
     */
    _navigateToFullPage(item) {
        const id      = item.itemId ?? item.id;
        const segment = item.type === 'OC' || item.code?.startsWith('OC-') ? 'oc'
            : item.type === 'ON' ? 'on'
                : 'or';
        const ctx  = this._app?.getDatasetContext?.();
        const base = ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/os`
            : '/elaborate/os';
        this._app.navigate(`${base}/${segment}/${id}`);
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}