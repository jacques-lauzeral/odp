/**
 * @file chapter-toc.js
 * @description Chapter TOC — left panel of the Narrative activity.
 *
 * Two render modes driven by NarrativeActivity scope state:
 *
 * ODIP scope  — renderOdip(chapters, selectedItemId)
 *   Collapsible chapter tree. Each node supports three interactions:
 *     • label click  → onOdipSelect(chapter)   [selection-read in body]
 *     • chevron      → expand / collapse subtree
 *     • dive button  → onDive(chapter)          [switches to chapter scope]
 *   Collapse of a node that contains the current selection moves selection
 *   to the collapsed parent.
 *
 * Chapter scope — renderChapter(chapter)
 *   Single chapter TOC: back control + topic/subtopic/O* tree.
 *   Node click → onChapterSelect(entry).
 *   setActiveKey(key)  — highlights a node (body→TOC sync).
 *   scrollToKey(key)   — scrolls the tree to bring a node into view.
 *
 * All itemId comparisons use normalizeId() from shared/utils.js to handle
 * mixed int / string / Neo4j Integer values safely.
 */
import { errorHandler } from '../../../../shared/error-handler.js';
import { normalizeId } from '../../../../shared/src/index.js';

export default class ChapterToc {
    /**
     * @param {HTMLElement} container
     * @param {object}   options
     * @param {boolean}  options.isEditable
     * @param {object[]} options.chapters              — flat chapter list
     * @param {Map}      options.chapterMap            — itemId → chapter (raw keys)
     * @param {Function} options.onOdipSelect          — (chapter) ODIP scope label click
     * @param {Function} options.onDive                — (chapter) dive into chapter
     * @param {Function} options.onClimb               — () climb back to ODIP scope
     * @param {Function} options.onChapterSelect       — (entry) chapter scope node click
     * @param {Function} options.buildOrderedChapters  — () → { chapter, depth }[]
     */
    constructor(container, options = {}) {
        this.container             = container;
        this._isEditable           = options.isEditable           ?? false;
        this._chapters             = options.chapters             ?? [];
        this._chapterMap           = options.chapterMap           ?? new Map();
        this._onOdipSelect         = options.onOdipSelect         ?? (() => {});
        this._onDive               = options.onDive               ?? (() => {});
        this._onClimb              = options.onClimb              ?? (() => {});
        this._onChapterSelect      = options.onChapterSelect      ?? (() => {});
        this._buildOrderedChapters = options.buildOrderedChapters ?? (() => []);

        // ODIP scope state — all ids stored as normalizeId() integers
        this._collapsedIds  = new Set();
        this._odipActiveId  = null;

        // Chapter scope state
        this._chapter          = null;
        this._activeKey        = null;
        this._unassignedOStars = [];
        this._collapsedTopics  = new Set();  // string keys e.g. 'topic-0'
        this._hierarchy        = [];
    }

    // =========================================================================
    // ODIP scope
    // =========================================================================

    /**
     * @param {object[]}    chapters
     * @param {*|null}      selectedId  — raw itemId (any type) or null
     */
    renderOdip(chapters, selectedId = null) {
        this._chapters    = chapters;
        this._odipActiveId = selectedId != null ? normalizeId(selectedId) : null;

        this.container.innerHTML = `
            <div class="chapter-toc chapter-toc--odip" id="chapterTocOdip">
                <div class="chapter-toc__odip-header">
                    <span class="chapter-toc__odip-title">ODIP Chapters</span>
                </div>
                <div class="chapter-toc__tree" id="chapterTocTree"></div>
            </div>
        `;

        // Attach once on the stable shell — survives treeEl re-renders
        this.container.querySelector('#chapterTocOdip')
            .addEventListener('click', (e) => this._handleOdipClick(e));

        this._renderOdipTree();
    }

    _renderOdipTree() {
        const treeEl = this.container.querySelector('#chapterTocTree');
        if (!treeEl) return;

        // Build parent→children map keyed by code string (parentKey / parentCode).
        const pcode = c => c.parentCode ?? c.parentKey ?? null;
        const byParent = new Map();
        for (const c of this._chapters) {
            const pid = pcode(c);
            if (!byParent.has(pid)) byParent.set(pid, []);
            byParent.get(pid).push(c);
        }
        for (const group of byParent.values()) {
            group.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }

        // Build chapter number map: code → display prefix e.g. "1.2"
        const numberMap = this._buildNumberMap(byParent);

        const html = this._renderOdipLevel(null, byParent, numberMap, 0);
        treeEl.innerHTML = html || '<div class="chapter-toc__empty">No chapters defined.</div>';
        this._odipByParent = byParent;   // stored for _handleOdipClick
    }

    _handleOdipClick(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action  = btn.dataset.action;
        const nid     = parseInt(btn.dataset.nid, 10);
        const chapter = this._resolveChapter(nid);
        if (!chapter) return;

        const treeEl = this.container?.querySelector('#chapterTocTree');

        if (action === 'select') {
            this._odipActiveId = nid;
            if (treeEl) this._refreshOdipActive(treeEl);
            this._onOdipSelect({ type: 'chapter', chapter });
        } else if (action === 'toggle') {
            const code = btn.dataset.code;
            if (this._collapsedIds.has(code)) {
                this._collapsedIds.delete(code);
            } else {
                this._collapsedIds.add(code);
                if (this._odipActiveId != null &&
                    this._isDescendant(this._odipActiveId, code, this._odipByParent)) {
                    this._odipActiveId = nid;
                }
            }
            this._renderOdipTree();
        } else if (action === 'dive') {
            this._onDive(chapter);
        }
    }

    /**
     * Find an O* item by id across all topics/subtopics in the hierarchy.
     */
    _findOStarById(itemId, hierarchy) {
        const search = (topics) => {
            for (const t of topics ?? []) {
                for (const item of t.items ?? []) {
                    if (String(item.id) === String(itemId)) return item;
                }
                const found = search(t.subTopics ?? []);
                if (found) return found;
            }
            return null;
        };
        return search(hierarchy);
    }

    /**
     * Build map of chapter code → display number ("1", "1.1", "2.3.1" …).
     * @param {Map} byParent  keyed by parentCode string (null for roots)
     * @returns {Map<string, string>}
     */
    _buildNumberMap(byParent) {
        const map = new Map();
        const walk = (parentCode, prefix) => {
            const children = byParent.get(parentCode) ?? [];
            children.forEach((c, i) => {
                const num = prefix ? `${prefix}.${i + 1}` : String(i + 1);
                map.set(c.code, num);
                walk(c.code, num);
            });
        };
        walk(null, '');
        return map;
    }

    _renderOdipLevel(parentCode, byParent, numberMap, depth) {
        const children = byParent.get(parentCode) ?? [];
        return children.map(chapter => {
            const code        = chapter.code;
            const nid         = normalizeId(chapter.itemId);
            const hasChildren = (byParent.get(code) ?? []).length > 0;
            const collapsed   = this._collapsedIds.has(code);
            const active      = this._odipActiveId === nid;
            const indent      = depth * 14;
            const num         = numberMap.get(code) ? `${numberMap.get(code)}. ` : '';
            const title       = this._esc(`${num}${chapter.title ?? code}`);

            const chevron = hasChildren
                ? `<button class="chapter-toc__chevron" data-action="toggle" data-code="${this._esc(code)}" data-nid="${nid}"
                           title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▶' : '▼'}</button>`
                : `<span class="chapter-toc__chevron-placeholder"></span>`;

            const subtree = hasChildren && !collapsed
                ? `<div class="chapter-toc__children">${this._renderOdipLevel(code, byParent, numberMap, depth + 1)}</div>`
                : '';

            return `
                <div class="chapter-toc__chapter-node">
                    <div class="chapter-toc__chapter-row ${active ? 'chapter-toc__chapter-row--active' : ''}"
                         style="padding-left:${indent + 6}px">
                        ${chevron}
                        <button class="chapter-toc__chapter-label" data-action="select" data-nid="${nid}"
                                title="${title}">${title}</button>
                        <button class="chapter-toc__dive-btn" data-action="dive" data-nid="${nid}"
                                title="Open chapter">→</button>
                    </div>
                    ${subtree}
                </div>`;
        }).join('');
    }

    _isDescendant(childNid, ancestorCode, byParent) {
        for (const c of (byParent.get(ancestorCode) ?? [])) {
            if (normalizeId(c.itemId) === childNid) return true;
            if (this._isDescendant(childNid, c.code, byParent)) return true;
        }
        return false;
    }

    _refreshOdipActive(treeEl) {
        treeEl.querySelectorAll('.chapter-toc__chapter-row').forEach(row => {
            const btn = row.querySelector('[data-action="select"]');
            const nid = btn ? parseInt(btn.dataset.nid, 10) : NaN;
            row.classList.toggle('chapter-toc__chapter-row--active', nid === this._odipActiveId);
        });
    }

    /** Resolve a chapter from normalised integer id. */
    _resolveChapter(nid) {
        for (const c of this._chapters) {
            try { if (normalizeId(c.itemId) === nid) return c; } catch { /* skip */ }
        }
        return null;
    }

    // =========================================================================
    // Chapter scope
    // =========================================================================

    async renderChapter(chapter) {
        this._chapter          = chapter;
        this._activeKey        = null;
        this._unassignedOStars = [];
        this._collapsedTopics  = new Set();
        this._hierarchy        = [];

        const title = this._esc(chapter.title ?? chapter.code ?? '');

        this.container.innerHTML = `
            <div class="chapter-toc chapter-toc--chapter" id="chapterTocChapter">
                <div class="chapter-toc__chapter-header">
                    <button class="chapter-toc__back-btn" id="chapterTocBack">← Chapters</button>
                    <button class="chapter-toc__chapter-name chapter-toc__chapter-name--btn" id="chapterTocNarrative" title="${title}">${title}</button>
                </div>
                <div class="chapter-toc__tree" id="chapterTocTree"></div>
            </div>
        `;

        this.container.querySelector('#chapterTocBack')
            ?.addEventListener('click', () => this._onClimb());

        this.container.querySelector('#chapterTocNarrative')
            ?.addEventListener('click', () => this._onChapterSelect({ type: 'chapter', chapter }));

        // Attach once on the stable shell — survives treeEl re-renders
        this.container.querySelector('#chapterTocChapter')
            .addEventListener('click', (e) => this._handleChapterClick(e));

        // osHierarchy items are pre-enriched server-side: { id, type, code, title }
        const hierarchy = this._parseHierarchy(chapter);
        this._hierarchy = hierarchy;
        this._renderChapterTree();
    }

    _renderChapterTree() {
        const treeEl    = this.container?.querySelector('#chapterTocTree');
        if (!treeEl) return;
        const hierarchy = this._hierarchy;

        const hasTopics     = hierarchy.length > 0;
        const hasUnassigned = this._unassignedOStars.length > 0;

        treeEl.innerHTML = [
            ...hierarchy.map((topic, ti) => this._renderTopic(topic, ti)),
            hasUnassigned ? this._renderUnassignedBucket() : '',
            (!hasTopics && !hasUnassigned) ? '<div class="chapter-toc__empty">No O*s in this chapter.</div>' : '',
        ].join('');
    }

    _handleChapterClick(e) {
        const toggler = e.target.closest('[data-toggle-key]');
        if (toggler) {
            const key = toggler.dataset.toggleKey;
            if (this._collapsedTopics.has(key)) {
                this._collapsedTopics.delete(key);
            } else {
                if (this._activeKey === key || this._activeKey?.startsWith(key + '-')) {
                    this._activeKey = null;
                }
                this._collapsedTopics.add(key);
            }
            this._renderChapterTree();
            return;
        }
        const btn = e.target.closest('.chapter-toc__entry');
        if (btn) this._handleChapterEntryClick(btn);
    }

    _renderTopic(topic, topicIndex) {
        const key         = `topic-${topicIndex}`;
        const collapsed   = this._collapsedTopics.has(key);
        const hasChildren = (topic.subTopics?.length > 0) || (topic.items?.length > 0);

        return `
            <div class="chapter-toc__topic-group">
                <button class="chapter-toc__entry chapter-toc__entry--topic"
                        data-key="${key}" data-type="topic" data-topic-index="${topicIndex}"
                        data-sub-path="">
                    ${hasChildren
            ? `<span class="chapter-toc__topic-toggle" data-toggle-key="${key}">${collapsed ? '▶' : '▼'}</span>`
            : `<span class="chapter-toc__topic-toggle-placeholder"></span>`}
                    <span class="chapter-toc__entry-label">${this._esc(topic.topic ?? '')}</span>
                </button>
                ${collapsed ? '' : [
            ...(topic.items ?? []).map((item, ii) => this._renderOStarEntry(item, topicIndex, [], ii)),
            ...(topic.subTopics ?? []).map((sub, si) => this._renderSubtopicNode(sub, topicIndex, [si])),
        ].join('')}
            </div>`;
    }

    /**
     * Recursively render a subtopic node at any depth.
     * @param {object}   node        — normalised topic node
     * @param {number}   topicIndex  — top-level topic index (always)
     * @param {number[]} subPath     — path of sub-indices from the top-level topic, e.g. [1] or [1, 2]
     */
    _renderSubtopicNode(node, topicIndex, subPath) {
        const subPathStr  = subPath.join('-');
        const key         = `subtopic-${topicIndex}-${subPathStr}`;
        const collapsed   = this._collapsedTopics.has(key);
        const hasChildren = (node.items?.length > 0) || (node.subTopics?.length > 0);

        return `
            <div class="chapter-toc__subtopic-group">
                <button class="chapter-toc__entry chapter-toc__entry--subtopic"
                        data-key="${key}" data-type="topic"
                        data-topic-index="${topicIndex}" data-sub-path="${subPathStr}">
                    ${hasChildren
            ? `<span class="chapter-toc__topic-toggle" data-toggle-key="${key}">${collapsed ? '▶' : '▼'}</span>`
            : `<span class="chapter-toc__topic-toggle-placeholder"></span>`}
                    <span class="chapter-toc__entry-label">${this._esc(node.topic ?? '')}</span>
                </button>
                ${collapsed || !hasChildren ? '' : [
            ...(node.items ?? []).map((item, ii) => this._renderOStarEntry(item, topicIndex, subPath, ii)),
            ...(node.subTopics ?? []).map((sub, si) => this._renderSubtopicNode(sub, topicIndex, [...subPath, si])),
        ].join('')}
            </div>`;
    }

    /**
     * Render a single O* entry button.
     * @param {object}   item        — normalised O* item { id, type, code, title }
     * @param {number}   topicIndex  — top-level topic index
     * @param {number[]} subPath     — sub-index path ([] for direct topic items)
     * @param {number}   itemIndex   — index within the owning node's items array
     */
    _renderOStarEntry(item, topicIndex, subPath, itemIndex) {
        const subPathStr = subPath.join('-');
        const key        = `ostar-${topicIndex}-${subPathStr || 'x'}-${itemIndex}`;
        const type       = (item.type ?? 'OR').toUpperCase();
        const code       = item.code  ?? '';
        const title      = item.title ?? String(item.id ?? item.itemId ?? '');
        const label      = code ? `${code} — ${title}` : title;

        return `
            <button class="chapter-toc__entry chapter-toc__entry--ostar"
                    data-key="${key}" data-type="ostar"
                    data-item-id="${this._esc(String(item.id ?? item.itemId ?? ''))}"
                    data-item-type="${type}"
                    data-topic-index="${topicIndex}"
                    data-sub-path="${subPathStr}"
                    data-item-index="${itemIndex}">
                ${this._typeBadge(type)}
                <span class="chapter-toc__entry-label chapter-toc__entry-label--ostar"
                      title="${this._esc(label)}">${this._esc(label)}</span>
            </button>`;
    }

    _renderUnassignedBucket() {
        const items = this._unassignedOStars;
        return `
            <div class="chapter-toc__topic-group">
                <button class="chapter-toc__entry chapter-toc__entry--topic chapter-toc__entry--unassigned"
                        data-key="_unassigned" data-type="unassigned">
                    <span class="chapter-toc__topic-toggle-placeholder"></span>
                    <span class="chapter-toc__entry-label">⚠ Unassigned (${items.length})</span>
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
                        </button>`;
        }).join('')}
            </div>`;
    }

    _handleChapterEntryClick(btn) {
        const key  = btn.dataset.key;
        const type = btn.dataset.type;
        this.setActiveKey(key);
        const entry = this._buildEntry(btn, type);
        if (entry) this._onChapterSelect(entry);
    }

    /**
     * Resolve a normalised topic node by traversing the hierarchy via topicIndex + subPath.
     * @param {number}   ti       — top-level topic index
     * @param {number[]} subPath  — sub-index path ([] means the top-level topic itself)
     * @returns {object|null}
     */
    _resolveTopicByPath(ti, subPath) {
        let node = this._hierarchy[ti] ?? null;
        for (const si of subPath) {
            node = node?.subTopics?.[si] ?? null;
        }
        return node;
    }

    _buildEntry(btn, type) {
        if (type === 'unassigned') {
            return { type: 'unassigned', chapter: this._chapter, items: this._unassignedOStars };
        }
        if (type === 'topic') {
            const ti      = parseInt(btn.dataset.topicIndex, 10);
            const subPath = btn.dataset.subPath ? btn.dataset.subPath.split('-').map(Number) : [];
            const topic   = this._resolveTopicByPath(ti, subPath);
            return { type: 'topic', topic, chapter: this._chapter };
        }
        if (type === 'ostar') {
            if (btn.dataset.unassignedIndex !== undefined) {
                const ii = parseInt(btn.dataset.unassignedIndex, 10);
                return { type: 'ostar', ostar: this._normaliseOStar(this._unassignedOStars[ii]), topic: null, chapter: this._chapter };
            }
            const ti      = parseInt(btn.dataset.topicIndex, 10);
            const subPath = btn.dataset.subPath ? btn.dataset.subPath.split('-').map(Number) : [];
            const ii      = parseInt(btn.dataset.itemIndex, 10);
            const topic   = this._resolveTopicByPath(ti, subPath);
            return { type: 'ostar', ostar: topic?.items?.[ii], topic, chapter: this._chapter };
        }
        return null;
    }

    // =========================================================================
    // External sync API
    // =========================================================================

    setActiveKey(key) {
        this._activeKey = key;
        this.container?.querySelectorAll('.chapter-toc__entry').forEach(b => {
            b.classList.toggle('chapter-toc__entry--active', b.dataset.key === key);
        });
    }

    scrollToKey(key) {
        const btn = this.container?.querySelector(`[data-key="${CSS.escape(key)}"]`);
        btn?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /**
     * Set active state by O* item id — used when navigation originates from the body.
     * Searches the hierarchy data model to find which topic/subtopic path contains the
     * item, expands any collapsed ancestors, re-renders the tree, then highlights the
     * entry and scrolls it into view.
     * @param {string|number} itemId
     */
    setActiveByItemId(itemId) {
        const targetId = String(itemId);

        // Walk the hierarchy tree. Each recursive call handles one level.
        // topicIdx: the top-level topic index (fixed once we enter a topic).
        // subPath:  array of sub-indices from the top-level topic downward.
        // Returns the ordered ancestor key list, or null if not found.
        const findAncestors = (nodes, topicIdx, subPath) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                const ti   = topicIdx ?? i;
                const sp   = [...subPath, i];
                const key  = subPath.length === 0 ? `topic-${i}` : `subtopic-${ti}-${sp.slice(1).join('-')}`;

                for (const item of node.items ?? []) {
                    if (String(item.id ?? item.itemId ?? '') === targetId) return [key];
                }

                const child = findAncestors(node.subTopics ?? [], ti, sp);
                if (child) return [key, ...child];
            }
            return null;
        };

        const ancestors = findAncestors(this._hierarchy, null, []);

        let expanded = false;
        for (const key of ancestors ?? []) {
            if (this._collapsedTopics.has(key)) {
                this._collapsedTopics.delete(key);
                expanded = true;
            }
        }

        if (expanded) this._renderChapterTree();

        const target = this.container?.querySelector(
            `.chapter-toc__entry[data-item-id="${CSS.escape(targetId)}"]`
        );
        if (!target) return;
        const key = target.dataset.key;
        if (key) {
            this.setActiveKey(key);
            this.scrollToKey(key);
        }
    }

    // =========================================================================
    // Shared helpers
    // =========================================================================

    cleanup() {
        this.container         = null;
        this._chapter          = null;
        this._activeKey        = null;
        this._unassignedOStars = [];
        this._collapsedTopics  = new Set();
        this._hierarchy        = [];
    }


    /**
     * Normalise a stored topic to the render shape used throughout this file.
     * Server enriches ons/ors/ocs as { id, type, code, title } objects.
     * Fall back to bare-id shape for backward compat if plain integers arrive.
     */
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

    _typeBadge(type) {
        const cls = type === 'ON' ? 'ostar-type-on' : type === 'OR' ? 'ostar-type-or' : type === 'OC' ? 'ostar-type-oc' : 'ostar-type-other';
        return `<span class="chapter-toc__type-badge ${cls}">${type}</span>`;
    }

    _esc(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}