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
 *
 * Unsaved-changes guard:
 *   In Elaborate mode, navigating away from an edited chapter narrative or topic
 *   (title and/or narrative) triggers a Save / Discard / Cancel dialog.
 *   _guardNavigation() returns true if navigation may proceed, false to stay.
 *   All navigation paths (TOC select, internal link, cleanup) go through this guard.
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import RichTextComponent from '../../../../components/rich-text-component.js';
import { buildLinkProvider } from '../../../../components/link-provider.js';
import { odipConfirm, odipUnsavedChanges } from '../../../../components/user-dialogs.js';

export default class ChapterBody {
    /**
     * @param {HTMLElement} container
     * @param {object}   options
     * @param {object}   options.app
     * @param {boolean}  options.isEditable
     * @param {Function} options.onSaved             — (chapterId) after successful narrative patch
     * @param {Function} options.onTopicFullSave     — (topicId, title, narrative) single PATCH for topic title+narrative
     */
    constructor(container, options = {}) {
        this.container        = container;
        this._app             = options.app;
        this._isEditable      = options.isEditable ?? false;
        this._onSaved                = options.onSaved                ?? (() => {});
        this._onChapterSelect        = options.onChapterSelect        ?? (() => {});
        this._onTopicFullSave        = options.onTopicFullSave        ?? (() => {});
        this._onThemeDelete          = options.onThemeDelete          ?? (() => {});
        this._onOStarSaved           = options.onOStarSaved           ?? (() => {});

        this._richText       = null;
        this._currentChapter = null;
        this._currentEntry   = null;   // last entry passed to renderSelectionRead
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
        this._currentEntry   = null;
        this.container.innerHTML = `
            <div class="master-detail__placeholder">
                <p class="master-detail__placeholder-text">Select a chapter or dive in to read</p>
            </div>
        `;
    }

    /**
     * Render a single TOC entry.
     * Guards unsaved changes before switching view.
     * @param {object}  entry
     * @param {object}  chapter
     * @param {boolean} [forceReadOnly=false] — true when called from ODIP scope
     */
    async renderSelectionRead(entry, chapter, forceReadOnly = false) {
        if (!await this._guardNavigation()) return;
        this._destroyRichText();
        this._currentChapter = chapter;
        this._currentEntry   = entry;

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
        this._guardNavigation().then(proceed => {
            if (!proceed) return;
            this._destroyRichText();
            this._currentChapter = null;
            this._currentEntry   = null;
            this.container.innerHTML = `
                <div class="master-detail__placeholder">
                    <p class="master-detail__placeholder-text">Select an entry in the TOC</p>
                </div>
            `;
        });
    }

    cleanup() {
        // Silent discard on teardown — beforeunload covers browser-level navigation
        this._destroyRichText();
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();
        this.container              = null;
        this._requirementDetails    = null;
        this._changeDetails         = null;
        this._currentChapter        = null;
        this._currentEntry          = null;
    }

    // =========================================================================
    // Selection-read renderers
    // =========================================================================

    _renderChapterNarrative(chapter, editable) {
        const title = this._esc(chapter.title ?? chapter.code ?? '');

        this.container.innerHTML = `
            <div class="chapter-body chapter-body--padded${editable ? '' : ' chapter-body--readonly'}">
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
        this._initRichTextNarrative(editorEl, chapter, editable);

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
            <div class="chapter-body chapter-body--padded${editable ? ' chapter-body--topic' : ' chapter-body--readonly'}">
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
                    ${items.map(item => this._renderOStarCard(item)).join('')}
                </div>
                ${subTopics.length > 0 ? `
                <div class="chapter-body__subtopic-list">
                    ${subTopics.map(sub => this._renderSubthemeCard(sub)).join('')}
                </div>
                ` : ''}
            </div>
        `;

        // Title input — mark dirty on input; save on blur or Enter
        if (editable) {
            const titleInput = this.container.querySelector('#topicTitleInput');
            if (titleInput) {
                const markDirty = () => {
                    this._dirty = true;
                    const saveBtn = this.container?.querySelector('.chapter-body__topic-save');
                    if (saveBtn) saveBtn.disabled = false;
                };
                titleInput.addEventListener('input', markDirty);
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
                ?.addEventListener('click', () => this._saveTopicFull(topic, topicId));
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
            narrativeEl.classList.add('rich-text-component--capped');
            if (narrative) {
                this._richText.setValue(typeof narrative === 'string' ? narrative : JSON.stringify(narrative));
            }
        } else {
            if (narrative) {
                const rt = new RichTextComponent({ readOnly: true, headings: true, images: true, tables: true });
                rt.mount(narrativeEl);
                rt.setValue(typeof narrative === 'string' ? narrative : JSON.stringify(narrative));
                rt.blur();
            } else {
                narrativeEl.classList.add('chapter-body__editor--empty');
            }
        }

        this._attachOStarCardListeners();
        this._attachSubthemeCardListeners();
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

    _renderSubthemeCard(subTopic) {
        const id    = this._esc(String(subTopic?.id ?? ''));
        const label = this._esc(subTopic?.topic ?? '');
        const count = (subTopic?.items?.length ?? 0) + (subTopic?.subTopics?.length ?? 0);
        const hint  = count > 0 ? ` (${count})` : '';
        return `
            <div class="chapter-body__subtopic-card chapter-body__subtopic-card--link"
                 data-topic-id="${id}"
                 role="button" tabindex="0">
                <span class="chapter-body__subtopic-icon">▸</span>
                <span class="chapter-body__subtopic-label">${label}${hint}</span>
            </div>
        `;
    }

    _attachSubthemeCardListeners() {
        this.container.querySelectorAll('.chapter-body__subtopic-card--link').forEach(card => {
            const select = () => {
                const topicId = card.dataset.topicId;
                this._onChapterSelect({ type: 'subtopic-by-id', topicId, chapter: this._currentChapter });
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
    // Unsaved-changes guard
    // =========================================================================

    /**
     * If there are unsaved changes, show the Save / Discard / Cancel dialog.
     * Returns true if navigation may proceed, false if the user cancelled.
     *
     * Save path:
     *   - chapter entry → _saveNarrative()
     *   - topic entry   → _saveTopicFull() (title + narrative in one PATCH)
     * On save error the error is surfaced by the existing save methods and
     * navigation is blocked (returns false).
     *
     * @returns {Promise<boolean>}
     */
    async _guardNavigation() {
        if (!this._dirty) return true;

        const answer = await odipUnsavedChanges('You have unsaved changes. What would you like to do?');

        if (answer === 'cancel') return false;

        if (answer === 'discard') {
            this._dirty = false;
            return true;
        }

        // answer === 'save'
        try {
            await this._saveCurrentEntry();
            return true;
        } catch {
            // Error already surfaced by the save method
            return false;
        }
    }

    /**
     * Save whatever is currently rendered (chapter narrative or topic full).
     * Throws on failure so _guardNavigation can return false.
     * @returns {Promise<void>}
     */
    async _saveCurrentEntry() {
        const entry   = this._currentEntry;
        const chapter = this._currentChapter;
        if (!entry || !chapter) return;

        if (entry.type === 'chapter') {
            await this._saveNarrative(chapter);
        } else if (entry.type === 'topic') {
            const topicId = entry.topic?.id ?? null;
            await this._saveTopicFull(entry.topic, topicId);
        }
    }

    // =========================================================================
    // Narrative save
    // =========================================================================

    _initRichTextNarrative(el, chapter, editable) {
        const narrative         = chapter.narrative ?? null;
        const availableBlockIds = chapter.availableBlockIds ?? [];
        const hasBlocks         = availableBlockIds.length > 0;

        this._richText = new RichTextComponent({
            readOnly:          !editable,
            headings:          true,
            images:            true,
            tables:            true,
            placeholder:       'Write chapter narrative…',
            availableBlockIds: editable ? availableBlockIds : [],
            linkProvider:      editable
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

        if (narrative) {
            this._richText.setValue(typeof narrative === 'string' ? narrative : JSON.stringify(narrative));
        }

        if (!editable) {
            this._richText.blur();
            // In read-only mode, resolve generated-block placeholders on-the-fly
            // if this chapter declares any block IDs.
            if (hasBlocks) {
                this._resolveAndSubstituteBlocks(chapter);
            }
        }
    }

    /**
     * Resolve generated-block marks by calling the server endpoint, then
     * substitute placeholders in the rendered narrative.
     * Always on-the-fly — no stored blocks.
     *
     * @param {object} chapter
     */
    async _resolveAndSubstituteBlocks(chapter) {
        try {
            const generatedBlocks = await apiClient.post(
                `/chapters/${chapter.itemId}/resolve-generated-blocks`
            );
            if (!this._richText) return;  // component was destroyed while resolving

            const narrative = this._richText._editor?.getJSON();
            if (!narrative) return;

            const merged = this._substituteGeneratedBlocks(
                JSON.stringify(narrative), generatedBlocks
            );
            this._richText.setValue(merged);
            this._richText.blur();
        } catch (error) {
            // Resolution failed — chips remain visible; non-fatal
            console.warn('[ChapterBody] Failed to resolve generated blocks:', error);
        }
    }

    /**
     * Substitute generated-block marks in a TipTap narrative JSON string with
     * the resolved node arrays from generatedBlocks.
     *
     * Walks the doc content array; when a text node carrying a generated-block
     * mark is found, it is replaced by the stored node array for that block ID.
     * Nodes with unknown or missing block IDs are left as-is (chip still visible).
     *
     * @param {string} narrativeJson     — TipTap JSON string (chapter narrative)
     * @param {object} generatedBlocks   — { [blockId]: node[] }
     * @returns {string} — merged TipTap JSON string
     */
    _substituteGeneratedBlocks(narrativeJson, generatedBlocks) {
        try {
            const doc = JSON.parse(narrativeJson);
            if (doc.type !== 'doc' || !Array.isArray(doc.content)) return narrativeJson;

            const substitute = (nodes) => {
                const result = [];
                for (const node of nodes) {
                    const blockMark = node.marks?.find(m => m.type === 'generated-block');
                    if (blockMark) {
                        const blockId = blockMark.attrs?.id;
                        const resolved = blockId && generatedBlocks[blockId];
                        if (resolved && Array.isArray(resolved) && resolved.length > 0) {
                            result.push(...resolved);
                            continue;
                        }
                        // No resolved content — keep placeholder node as-is
                    }
                    // Recurse into block nodes (paragraphs, lists, etc.)
                    if (Array.isArray(node.content)) {
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
            throw error;  // re-throw so _guardNavigation can block navigation
        }
    }

    /**
     * Save both topic title and narrative in a single PATCH via onTopicFullSave.
     * Reads the current title input value and rich text value from the DOM.
     * @param {object} topic   — render-shape topic node
     * @param {string} topicId — stable topic id
     */
    async _saveTopicFull(topic, topicId) {
        if (this._saving) return;
        this._saving = true;

        const saveBtn  = this.container?.querySelector('.chapter-body__topic-save');
        const statusEl = this.container?.querySelector('.chapter-body__status');
        if (saveBtn)  saveBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';

        const titleInput = this.container?.querySelector('#topicTitleInput');
        const newTitle   = titleInput?.value.trim() || topic?.topic || '';
        const narrative  = this._richText?.getValue() ?? null;

        try {
            await this._onTopicFullSave(topicId, newTitle, narrative);
            if (titleInput) titleInput.defaultValue = newTitle;
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
            throw error;  // re-throw so _guardNavigation can block navigation
        }
    }

    /**
     * Delete the current empty theme topic.
     * Delegates to NarrativeActivity via onThemeDelete.
     * @param {string} topicId
     */
    async _deleteTheme(topicId) {
        if (this._saving) return;
        const confirmed = await odipConfirm('Do you really want to delete this theme?');
        if (!confirmed) return;
        await this._onThemeDelete(topicId);
    }

    // =========================================================================
    // Internal link navigation
    // =========================================================================

    /**
     * Handle internal link clicks from narrative rich text.
     * Ctrl+Click in edit mode triggers navigation through the unsaved-changes guard.
     *
     * n-ref value: {chapterId}[/{topicId}]
     *   Navigates directly to {base}/narrative/{chapterId}[?theme={topicId}]
     *
     * o-ref: navigates to {base}/os/{type}/{itemId}
     * d-ref: navigates to {base}/setup/reference-documents/{id}
     *
     * @param {'n-ref'|'o-ref'|'d-ref'} type
     * @param {string} value
     * @private
     */
    async _handleInternalLink(type, value) {
        if (!value) return;

        if (!await this._guardNavigation()) return;

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