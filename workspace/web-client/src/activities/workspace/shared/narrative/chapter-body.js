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
 *         entry.type === 'chapter'    → chapter narrative (Quill, editable or R/O)
 *         entry.type === 'topic'      → topic header + O* card list
 *         entry.type === 'unassigned' → unassigned O* list
 *         entry.type === 'ostar'      → O* detail view (RequirementDetails / ChangeDetails)
 *
 *   renderSequential(chapter)
 *     → Full scrollable document: narrative block → topic sections → O* cards.
 *       Each section has data-seq-key anchors for scroll sync.
 *       Edit buttons on narrative block and O* cards (Elaborate only) open edit popup.
 *       IntersectionObserver drives TOC highlight via onVisibleKeyChange callback.
 *
 * Sync lifecycle:
 *   startSync()  — starts IntersectionObserver; called by NarrativeActivity
 *   stopSync()   — disconnects observer
 *
 * Edit: always as popup (consistent with elaborate/os). No inline mode.
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
     * @param {Function} options.onVisibleKeyChange  — (key) for body→TOC scroll sync
     */
    constructor(container, options = {}) {
        this.container   = container;
        this._app        = options.app;
        this._isEditable = options.isEditable ?? false;
        this._onSaved    = options.onSaved            ?? (() => {});
        this._onVisibleKeyChange = options.onVisibleKeyChange ?? (() => {});

        this._richText       = null;
        this._currentChapter = null;
        this._dirty          = false;
        this._saving         = false;

        this._observer       = null;   // IntersectionObserver for sequential sync

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
        this._stopObserver();
        this._destroyRichText();
        this._currentChapter = null;
        this.container.innerHTML = `
            <div class="master-detail__placeholder">
                <p class="master-detail__placeholder-text">Select a chapter or dive in to read</p>
            </div>
        `;
    }

    /**
     * Render a single TOC entry (selection-read mode, or ODIP scope chapter select).
     * @param {object}  entry
     * @param {object}  chapter
     * @param {boolean} [forceReadOnly=false] — true when called from ODIP scope
     */
    async renderSelectionRead(entry, chapter, forceReadOnly = false) {
        await this._autoSaveIfDirty();
        this._stopObserver();
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

    /**
     * Render the full sequential document for a chapter.
     * @param {object} chapter
     */
    async renderSequential(chapter) {
        await this._autoSaveIfDirty();
        this._stopObserver();
        this._destroyRichText();
        this._currentChapter = chapter;

        // osHierarchy items are pre-enriched server-side: { id, type, code, title }
        const hierarchy = this._parseHierarchy(chapter);
        const editable  = this._isEditable;
        const title    = this._esc(chapter.title ?? chapter.code ?? '');

        // Build the sequential document
        let html = `<div class="chapter-body chapter-body--sequential" id="chapterBodySeq">`;

        // ── Narrative section ─────────────────────────────────────────────────
        html += `
            <section class="seq-section seq-section--narrative" data-seq-key="narrative">
                <div class="seq-section__header">
                    <h2 class="seq-section__title">${title}</h2>
                    ${editable ? `
                        <div class="seq-section__actions">
                            <button class="odip-btn odip-btn--sm seq-section__edit-btn"
                                    data-edit-type="narrative" title="Edit narrative">Edit</button>
                            <button class="odip-btn odip-btn--primary odip-btn--sm chapter-body__save"
                                    style="display:none" disabled>Save</button>
                            <span class="chapter-body__status"></span>
                        </div>
                    ` : ''}
                </div>
                <div class="seq-section__narrative-wrap">
                    <div id="seqNarrativeEditor" class="chapter-body__editor"></div>
                </div>
            </section>
        `;

        // ── Topic / O* sections ───────────────────────────────────────────────
        hierarchy.forEach((topic, ti) => {
            html += this._renderSeqTopic(topic, ti, null, editable);
        });

        html += `</div>`;  // chapter-body--sequential

        this.container.innerHTML = html;

        // Initialise Quill for narrative
        const editorEl = this.container.querySelector('#seqNarrativeEditor');
        if (editorEl) {
            this._initRichTextNarrative(editorEl, chapter.narrative, editable);
        }

        // Wire save button for sequential narrative edit
        if (editable) {
            this._attachSeqNarrativeListeners(chapter);
        }

        // Wire O* card clicks (edit popup)
        this._attachSeqCardListeners();
    }

    /**
     * Start IntersectionObserver for sequential scroll→TOC sync.
     * Called by NarrativeActivity when sync is toggled on.
     */
    startSync() {
        this._stopObserver();
        const sections = this.container?.querySelectorAll('[data-seq-key]');
        if (!sections?.length) return;

        this._observer = new IntersectionObserver((entries) => {
            // Find the topmost intersecting section
            let topEntry = null;
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                if (!topEntry || e.boundingClientRect.top < topEntry.boundingClientRect.top) {
                    topEntry = e;
                }
            }
            if (topEntry) {
                const key = topEntry.target.dataset.seqKey;
                if (key) this._onVisibleKeyChange(key);
            }
        }, {
            root:       this.container,
            threshold:  0.1,
            rootMargin: '0px 0px -60% 0px',
        });

        sections.forEach(s => this._observer.observe(s));
    }

    /**
     * Stop IntersectionObserver.
     */
    stopSync() {
        this._stopObserver();
    }

    clear() {
        this._autoSaveIfDirty();
        this._stopObserver();
        this._destroyRichText();
        this._currentChapter = null;
        this.container.innerHTML = `
            <div class="master-detail__placeholder">
                <p class="master-detail__placeholder-text">Select an entry in the TOC</p>
            </div>
        `;
    }

    cleanup() {
        this._stopObserver();
        this._destroyRichText();
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();
        this.container              = null;
        this._requirementDetails    = null;
        this._changeDetails         = null;
        this._currentChapter        = null;
    }

    // =========================================================================
    // Sequential section renderers
    // =========================================================================

    _renderSeqTopic(topic, topicIndex, parentIndex, editable) {
        const key   = parentIndex != null
            ? `subtopic-${parentIndex}-${topicIndex}`
            : `topic-${topicIndex}`;
        const title = this._esc(topic.topic ?? '');
        const depth = parentIndex != null ? 'seq-section--subtopic' : 'seq-section--topic';

        let html = `
            <section class="seq-section ${depth}" data-seq-key="${key}">
                <div class="seq-section__header">
                    <h3 class="seq-section__topic-title">${title}</h3>
                </div>
        `;

        // O* cards in this topic
        if (topic.items?.length) {
            html += `<div class="seq-section__ostar-list">`;
            topic.items.forEach(item => {
                html += this._renderSeqOStarCard(item, editable);
            });
            html += `</div>`;
        } else {
            html += `<p class="seq-section__empty">No O*s assigned to this topic.</p>`;
        }

        // Sub-topics
        (topic.subTopics ?? []).forEach((sub, si) => {
            html += this._renderSeqTopic(sub, si, topicIndex, editable);
        });

        html += `</section>`;
        return html;
    }

    _renderSeqOStarCard(item, editable) {
        const id    = String(item.id ?? item.itemId ?? '');
        const type  = (item.type ?? 'OR').toUpperCase();
        const code  = item.code  ?? '';
        const title = item.title ?? id;
        const label = code ? `${code} — ${title}` : title;
        const cls   = type === 'ON' ? 'ostar-type-on'
            : type === 'OR'         ? 'ostar-type-or'
                : type === 'OC'         ? 'ostar-type-oc'
                    :                         'ostar-type-other';

        return `
            <div class="seq-ostar-card" data-id="${this._esc(id)}" data-type="${type}">
                <span class="chapter-body__ostar-badge ${cls}">${type}</span>
                <span class="chapter-body__ostar-label">${this._esc(label)}</span>
                ${editable ? `
                    <button class="odip-btn odip-btn--sm seq-ostar-card__edit"
                            data-id="${this._esc(id)}" data-type="${type}">Edit</button>
                ` : ''}
            </div>
        `;
    }

    // =========================================================================
    // Sequential event wiring
    // =========================================================================

    _attachSeqNarrativeListeners(chapter) {
        // Edit button shows/hides the inline save row (Quill already editable)
        const editBtn = this.container.querySelector('[data-edit-type="narrative"]');
        const saveBtn = this.container.querySelector('.chapter-body__save');
        if (editBtn && saveBtn) {
            editBtn.addEventListener('click', () => {
                saveBtn.style.display = '';
                editBtn.style.display = 'none';
            });
            saveBtn.addEventListener('click', () => this._saveNarrative(chapter));
        }
    }

    _attachSeqCardListeners() {
        this.container.querySelectorAll('.seq-ostar-card__edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id   = btn.dataset.id;
                const type = btn.dataset.type;
                this._openOStarEdit(id, type);
            });
        });
    }

    // =========================================================================
    // Selection-read renderers (unchanged from prior design)
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
    // Hierarchy helpers (mirror of ChapterToc)
    // =========================================================================

    _parseHierarchy(chapter) {
        let raw = chapter?.osHierarchy ?? chapter?.jsonOsHierarchy ?? null;
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { raw = null; }
        }
        if (!raw) return [];
        const topics = Array.isArray(raw) ? raw : (raw.topics ?? []);
        return topics.map(t => this._normaliseTopic(t));
    }

    _normaliseTopic(t) {
        const mapItem = (raw, impliedType) =>
            (raw && typeof raw === 'object')
                ? { id: raw.id, type: raw.type ?? impliedType, code: raw.code ?? null, title: raw.title ?? null }
                : { id: raw,    type: impliedType,             code: null,             title: null };
        return {
            topic:     t.topic,
            items:     [
                ...(t.ons ?? []).map(o => mapItem(o, 'ON')),
                ...(t.ors ?? []).map(o => mapItem(o, 'OR')),
                ...(t.ocs ?? []).map(o => mapItem(o, 'OC')),
            ],
            subTopics: (t.subtopics ?? []).map(s => this._normaliseTopic(s)),
        };
    }


    // =========================================================================
    // Internal helpers
    // =========================================================================

    _stopObserver() {
        this._observer?.disconnect();
        this._observer = null;
    }

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