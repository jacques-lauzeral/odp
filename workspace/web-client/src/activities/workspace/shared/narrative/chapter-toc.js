/**
 * @file chapter-toc.js
 * @description Chapter TOC — left panel of the Narrative activity.
 *
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │ [chapter selector — dropdown]   │  ← chapter header
 *   │ [domain badge if applicable]    │
 *   ├─────────────────────────────────┤
 *   │ Topic                           │  ← tree: O*s only
 *   │   ON · title                    │
 *   │   OR · title                    │
 *   │ Sub-topic                       │
 *   │   OR · title                    │
 *   │ ⚠ Unassigned (n)               │
 *   │   ON · title                    │
 *   └─────────────────────────────────┘
 *
 * No "Narrative" root entry — narrative is the default body state.
 * Selecting a chapter fires onChapterChange(chapter).
 * Selecting a topic or O* fires onSelect(entry).
 *
 * entry shapes:
 *   { type: 'topic',      topic, chapter }
 *   { type: 'ostar',      ostar, topic, chapter }
 *   { type: 'unassigned', items, chapter }
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';

export default class ChapterToc {
    /**
     * @param {HTMLElement} container
     * @param {object}   options
     * @param {boolean}  options.isEditable
     * @param {object[]} options.chapters            — flat chapter list
     * @param {Map}      options.chapterMap          — itemId → chapter
     * @param {Function} options.onChapterChange     — called with chapter on selector change
     * @param {Function} options.onSelect            — called with entry on tree selection
     * @param {Function} options.buildOrderedChapters — returns { chapter, depth }[]
     */
    constructor(container, options = {}) {
        this.container             = container;
        this._isEditable           = options.isEditable           ?? false;
        this._chapters             = options.chapters             ?? [];
        this._chapterMap           = options.chapterMap           ?? new Map();
        this._onChapterChange      = options.onChapterChange      ?? (() => {});
        this._onSelect             = options.onSelect             ?? (() => {});
        this._buildOrderedChapters = options.buildOrderedChapters ?? (() => []);

        this._chapter          = null;
        this._activeKey        = null;
        this._unassignedOStars = [];
    }

    // -------------------------------------------------------------------------
    // Initial render — chapter selector only, no chapter selected yet
    // -------------------------------------------------------------------------

    /**
     * Called once by NarrativeActivity after shell mount.
     * Renders the selector; tree area shown after first renderChapter().
     */
    renderSelector(selectedItemId = null) {
        const ordered = this._buildOrderedChapters();
        this.container.innerHTML = `
            <div class="chapter-toc">
                <div class="chapter-toc__selector-wrap">
                    <select class="odip-input chapter-toc__chapter-select" id="chapterTocSelect">
                        ${ordered.map(({ chapter, depth }) => {
            const indent  = '— '.repeat(depth);
            const title   = chapter.title ?? chapter.key ?? String(chapter.itemId);
            const domain  = chapter.domain ? ` [${chapter.domain}]` : '';
            const sel     = chapter.itemId === selectedItemId ? ' selected' : '';
            return `<option value="${this._esc(String(chapter.itemId))}"${sel}>${this._esc(indent + title + domain)}</option>`;
        }).join('')}
                    </select>
                </div>
                <div class="chapter-toc__tree" id="chapterTocTree"></div>
            </div>
        `;
        this._attachSelectorListener();
    }

    // -------------------------------------------------------------------------
    // Chapter render — called by NarrativeActivity after chapter is loaded
    // -------------------------------------------------------------------------

    async renderChapter(chapter) {
        this._chapter          = chapter;
        this._activeKey        = null;
        this._unassignedOStars = [];

        // Ensure selector exists (first render) or update selected value
        if (!this.container.querySelector('.chapter-toc__chapter-select')) {
            this.renderSelector(chapter.itemId);
        } else {
            const sel = this.container.querySelector('.chapter-toc__chapter-select');
            if (sel) sel.value = String(chapter.itemId);
        }

        // Update domain badge
        this._renderDomainBadge(chapter);

        // Fetch O*s for domain chapters
        const hierarchy = this._parseHierarchy(chapter);
        if (chapter.domain) {
            try {
                const params     = { domain: chapter.domain };
                console.log('[ChapterToc] fetching O*s for domain:', chapter.domain);
                const oStars     = await apiClient.listOStars(params);
                console.log('[ChapterToc] listOStars result:', oStars?.length);
                const normalised = (oStars ?? []).map(o => ({
                    ...o,
                    id:   o.id   ?? o.itemId,
                    type: o.type ?? 'OC',
                }));
                const assignedIds = new Set(this._collectAssignedIds(hierarchy));
                this._unassignedOStars = normalised.filter(o =>
                    !assignedIds.has(String(o.itemId ?? o.id))
                );
            } catch (error) {
                errorHandler.handle(error, 'chapter-toc-ostar-load');
            }
        }

        this._renderTree(hierarchy);
    }

    cleanup() {
        this.container         = null;
        this._chapter          = null;
        this._activeKey        = null;
        this._unassignedOStars = [];
    }

    // -------------------------------------------------------------------------
    // Domain badge
    // -------------------------------------------------------------------------

    _renderDomainBadge(chapter) {
        const wrap = this.container.querySelector('.chapter-toc__selector-wrap');
        if (!wrap) return;
        wrap.querySelector('.chapter-toc__domain-badge')?.remove();
        if (chapter.domain) {
            const badge = document.createElement('span');
            badge.className   = 'chapter-toc__domain-badge';
            badge.textContent = chapter.domain;
            wrap.appendChild(badge);
        }
    }

    // -------------------------------------------------------------------------
    // Tree rendering — O*s only (no chapter root entry)
    // -------------------------------------------------------------------------

    _renderTree(hierarchy) {
        const treeEl = this.container.querySelector('#chapterTocTree');
        if (!treeEl) return;

        const hasTopics     = hierarchy.length > 0;
        const hasUnassigned = this._unassignedOStars.length > 0;

        treeEl.innerHTML = `
            ${hierarchy.map((topic, ti) => this._renderTopic(topic, ti)).join('')}
            ${hasUnassigned ? this._renderUnassignedBucket() : ''}
            ${!hasTopics && !hasUnassigned ? `
                <div class="chapter-toc__empty">No O*s in this chapter.</div>
            ` : ''}
        `;

        this._attachTreeListeners();
    }

    _renderTopic(topic, topicIndex) {
        const key          = `topic-${topicIndex}`;
        const hasSubTopics = topic.subTopics?.length > 0;
        const hasItems     = topic.items?.length > 0;

        return `
            <div class="chapter-toc__topic-group">
                <button class="chapter-toc__entry chapter-toc__entry--topic"
                        data-key="${key}" data-type="topic" data-topic-index="${topicIndex}">
                    <span class="chapter-toc__entry-icon">▸</span>
                    <span class="chapter-toc__entry-label">${this._esc(topic.topic ?? '')}</span>
                </button>
                ${hasSubTopics ? topic.subTopics.map((sub, si) =>
            this._renderSubTopic(sub, topicIndex, si)
        ).join('') : ''}
                ${hasItems ? topic.items.map((item, ii) =>
            this._renderOStar(item, topicIndex, null, ii)
        ).join('') : ''}
            </div>
        `;
    }

    _renderSubTopic(subTopic, topicIndex, subIndex) {
        const key      = `subtopic-${topicIndex}-${subIndex}`;
        const hasItems = subTopic.items?.length > 0;

        return `
            <div class="chapter-toc__subtopic-group">
                <button class="chapter-toc__entry chapter-toc__entry--subtopic"
                        data-key="${key}" data-type="topic"
                        data-topic-index="${topicIndex}" data-sub-index="${subIndex}">
                    <span class="chapter-toc__entry-icon">▸</span>
                    <span class="chapter-toc__entry-label">${this._esc(subTopic.topic ?? '')}</span>
                </button>
                ${hasItems ? subTopic.items.map((item, ii) =>
            this._renderOStar(item, topicIndex, subIndex, ii)
        ).join('') : ''}
            </div>
        `;
    }

    _renderOStar(item, topicIndex, subIndex, itemIndex) {
        const key   = `ostar-${topicIndex}-${subIndex ?? 'x'}-${itemIndex}`;
        const type  = (item.type ?? 'OR').toUpperCase();
        const code  = item.code  ?? '';
        const title = item.title ?? String(item.id ?? item.itemId ?? '');
        const label = code ? `${code} — ${title}` : title;

        return `
            <button class="chapter-toc__entry chapter-toc__entry--ostar"
                    data-key="${key}" data-type="ostar"
                    data-item-id="${this._esc(String(item.id ?? item.itemId ?? ''))}"
                    data-item-type="${type}"
                    data-topic-index="${topicIndex}"
                    data-sub-index="${subIndex ?? ''}"
                    data-item-index="${itemIndex}">
                ${this._typeBadge(type)}
                <span class="chapter-toc__entry-label chapter-toc__entry-label--ostar"
                      title="${this._esc(label)}">${this._esc(label)}</span>
            </button>
        `;
    }

    _renderUnassignedBucket() {
        const items = this._unassignedOStars;
        return `
            <div class="chapter-toc__topic-group">
                <button class="chapter-toc__entry chapter-toc__entry--topic chapter-toc__entry--unassigned"
                        data-key="_unassigned" data-type="unassigned">
                    <span class="chapter-toc__entry-icon">⚠</span>
                    <span class="chapter-toc__entry-label">Unassigned (${items.length})</span>
                </button>
                ${items.map((item, ii) => {
            const type  = (item.type ?? 'OC').toUpperCase();
            const code  = item.code  ?? '';
            const title = item.title ?? String(item.itemId ?? '');
            const label = code ? `${code} — ${title}` : title;
            const key   = `unassigned-${ii}`;
            return `
                        <button class="chapter-toc__entry chapter-toc__entry--ostar"
                                data-key="${key}" data-type="ostar"
                                data-item-id="${this._esc(String(item.itemId ?? item.id ?? ''))}"
                                data-item-type="${type}"
                                data-unassigned-index="${ii}">
                            ${this._typeBadge(type)}
                            <span class="chapter-toc__entry-label chapter-toc__entry-label--ostar"
                                  title="${this._esc(label)}">${this._esc(label)}</span>
                        </button>
                    `;
        }).join('')}
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Event handling
    // -------------------------------------------------------------------------

    _attachSelectorListener() {
        this.container.querySelector('#chapterTocSelect')
            ?.addEventListener('change', (e) => {
                const id      = parseInt(e.target.value, 10);
                const chapter = this._chapterMap.get(id);
                if (chapter) this._onChapterChange(chapter);
            });
    }

    _attachTreeListeners() {
        this.container.querySelectorAll('.chapter-toc__entry').forEach(btn => {
            btn.addEventListener('click', () => this._handleEntryClick(btn));
        });
    }

    _handleEntryClick(btn) {
        const key  = btn.dataset.key;
        const type = btn.dataset.type;

        this._activeKey = key;
        this.container.querySelectorAll('.chapter-toc__entry').forEach(b => {
            b.classList.toggle('chapter-toc__entry--active', b.dataset.key === key);
        });

        const entry = this._buildEntry(btn, type);
        if (entry) this._onSelect(entry);
    }

    _buildEntry(btn, type) {
        const hierarchy = this._parseHierarchy(this._chapter);

        if (type === 'unassigned') {
            return { type: 'unassigned', chapter: this._chapter, items: this._unassignedOStars };
        }

        if (type === 'topic') {
            const ti       = parseInt(btn.dataset.topicIndex, 10);
            const si       = btn.dataset.subIndex !== '' ? parseInt(btn.dataset.subIndex, 10) : null;
            const topicObj = hierarchy[ti];
            const topic    = si != null ? topicObj?.subTopics?.[si] : topicObj;
            return { type: 'topic', topic, chapter: this._chapter };
        }

        if (type === 'ostar') {
            if (btn.dataset.unassignedIndex !== undefined) {
                const ii    = parseInt(btn.dataset.unassignedIndex, 10);
                const ostar = this._normaliseOStar(this._unassignedOStars[ii]);
                return { type: 'ostar', ostar, topic: null, chapter: this._chapter };
            }
            const ti       = parseInt(btn.dataset.topicIndex, 10);
            const si       = btn.dataset.subIndex !== '' ? parseInt(btn.dataset.subIndex, 10) : null;
            const ii       = parseInt(btn.dataset.itemIndex, 10);
            const topicObj = hierarchy[ti];
            const topic    = si != null ? topicObj?.subTopics?.[si] : topicObj;
            const item     = topic?.items?.[ii];
            return { type: 'ostar', ostar: item, topic, chapter: this._chapter };
        }

        return null;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    _collectAssignedIds(hierarchy) {
        const ids = [];
        const walk = (topics) => {
            for (const t of topics ?? []) {
                for (const item of t.items ?? []) {
                    ids.push(String(item.id ?? item.itemId ?? ''));
                }
                walk(t.subTopics ?? []);
            }
        };
        walk(hierarchy);
        return ids;
    }

    _normaliseOStar(ostar) {
        if (!ostar) return ostar;
        return { ...ostar, id: ostar.id ?? ostar.itemId };
    }

    _parseHierarchy(chapter) {
        let raw = chapter?.osHierarchy ?? chapter?.jsonOsHierarchy ?? [];
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch { raw = []; }
        }
        return Array.isArray(raw) ? raw : [];
    }

    _typeBadge(type) {
        const cls = type === 'ON' ? 'ostar-type-on'
            : type === 'OR' ? 'ostar-type-or'
                : type === 'OC' ? 'ostar-type-oc'
                    : 'ostar-type-other';
        return `<span class="chapter-toc__type-badge ${cls}">${type}</span>`;
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}