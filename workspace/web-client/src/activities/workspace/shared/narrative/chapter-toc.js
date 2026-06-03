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
     * @param {Function} options.onHierarchyChange     — (hierarchy) fired after each DnD mutation (Elaborate only)
     * @param {Function} options.onUnclassifiedChange  — (hierarchy) fired when an O* moves into/out of unclassified
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
        this._onHierarchyChange    = options.onHierarchyChange    ?? (() => {});
        this._onUnclassifiedChange = options.onUnclassifiedChange ?? (() => {});
        this._onAddTheme           = options.onAddTheme           ?? (() => {});
        this._onAddOStar           = options.onAddOStar           ?? (() => {});

        // ODIP scope state — all ids stored as normalizeId() integers
        this._collapsedIds  = new Set();
        this._odipActiveId  = null;

        // Chapter scope state
        this._chapter          = null;
        this._activeKey        = null;
        this._unassignedOStars = [];
        this._collapsedTopics  = new Set();  // string keys e.g. 'topic-0'
        this._hierarchy        = [];

        // Drag-and-drop state (chapter scope, Elaborate only)
        this._drag = null;  // { path, nodeType } | null
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

    async renderChapter(chapter, unassignedOStars = []) {
        this._chapter          = chapter;
        this._activeKey        = null;
        this._unassignedOStars = unassignedOStars;
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
        const shell = this.container.querySelector('#chapterTocChapter');
        shell.addEventListener('click', (e) => this._handleChapterClick(e));

        if (this._isEditable) {
            shell.addEventListener('dragstart',  (e) => this._handleDragStart(e));
            shell.addEventListener('dragover',   (e) => this._handleDragOver(e));
            shell.addEventListener('dragleave',  (e) => this._handleDragLeave(e));
            shell.addEventListener('drop',       (e) => this._handleDrop(e));
            shell.addEventListener('dragend',    (e) => this._handleDragEnd(e));
        }

        // osHierarchy items are pre-enriched server-side: { id, type, code, title }
        const hierarchy = this._parseHierarchy(chapter);
        this._hierarchy = hierarchy;
        this._renderChapterTree();
    }

    _renderChapterTree() {
        const treeEl    = this.container?.querySelector('#chapterTocTree');
        if (!treeEl) return;
        const hierarchy = this._hierarchy;

        const hasTopics = hierarchy.length > 0;

        // Chapter-root drop strip (Elaborate only) — drop a topic here to make it
        // a top-level topic (reparent to chapter root).
        const rootStrip = this._isEditable
            ? '<div class="chapter-toc__root-drop" data-drop-path="root" data-drop-node-type="root"></div>'
            : '';

        // <unclassified> bucket — always present at top when chapter has a domain;
        // visibility is gated by NarrativeActivity (only injected for domain chapters).
        const unclassifiedBucket = this._renderUnassignedBucket();

        treeEl.innerHTML = [
            unclassifiedBucket,
            rootStrip,
            ...hierarchy.map((topic, ti) => this._renderTopic(topic, ti, 0)),
            (!hasTopics && !this._unassignedOStars.length)
                ? '<div class="chapter-toc__empty">No O*s in this chapter.</div>'
                : '',
        ].join('');
    }

    /**
     * Rebuild the chapter tree while preserving the active selection highlight
     * and the scroll position. Used after out-of-band hierarchy updates
     * (O* create/edit, theme create) so the user's place in the tree is kept.
     */
    refreshTree() {
        // Scroll lives on the scrollable ancestor (.chapter-toc, overflow-y:auto)
        const scroller = this.container?.querySelector('.chapter-toc--chapter')
            ?? this.container?.querySelector('#chapterTocTree');
        const scrollTop = scroller?.scrollTop ?? 0;

        this._renderChapterTree();

        if (scroller) scroller.scrollTop = scrollTop;

        // Build-time entry markup does not carry the active class — re-apply it.
        if (this._activeKey) {
            this.container
                ?.querySelector(`.chapter-toc__entry[data-key="${CSS.escape(this._activeKey)}"]`)
                ?.classList.add('chapter-toc__entry--active');
        }
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

    _renderTopic(topic, topicIndex, depth = 0) {
        const key         = `topic-${topicIndex}`;
        const collapsed   = this._collapsedTopics.has(key);
        const hasChildren = (topic.subTopics?.length > 0) || (topic.items?.length > 0);
        const draggable   = this._isEditable ? 'draggable="true"' : '';
        const dragPath    = this._isEditable ? `data-drag-path="t:${topicIndex}" data-drag-node-type="topic"` : '';
        const indent      = this._tocIndent(depth, false);

        return `
            <div class="chapter-toc__topic-group">
                <button class="chapter-toc__entry chapter-toc__entry--topic chapter-toc__drop-zone"
                        data-key="${key}" data-type="topic" data-topic-index="${topicIndex}"
                        data-sub-path="" data-drop-path="t:${topicIndex}" data-drop-node-type="topic"
                        style="padding-left:${indent}px"
                        ${draggable} ${dragPath}>
                    ${hasChildren
            ? `<span class="chapter-toc__topic-toggle" data-toggle-key="${key}">${collapsed ? '▶' : '▼'}</span>`
            : `<span class="chapter-toc__topic-toggle-placeholder"></span>`}
                    <span class="chapter-toc__entry-label">${this._esc(topic.topic ?? '')}</span>
                </button>
                ${collapsed ? '' : [
            ...(topic.items ?? []).map((item, ii) => this._renderOStarEntry(item, topicIndex, [], ii, depth)),
            ...(topic.subTopics ?? []).map((sub, si) => this._renderSubtopicNode(sub, topicIndex, [si], depth + 1)),
        ].join('')}
            </div>`;
    }

    /**
     * Recursively render a subtopic node at any depth.
     * @param {object}   node        — normalised topic node
     * @param {number}   topicIndex  — top-level topic index (always)
     * @param {number[]} subPath     — path of sub-indices from the top-level topic, e.g. [1] or [1, 2]
     * @param {number}   depth       — nesting depth (1 = first subtopic level)
     */
    _renderSubtopicNode(node, topicIndex, subPath, depth = 1) {
        const subPathStr  = subPath.join('-');
        const key         = `subtopic-${topicIndex}-${subPathStr}`;
        const collapsed   = this._collapsedTopics.has(key);
        const hasChildren = (node.items?.length > 0) || (node.subTopics?.length > 0);
        const dragPath    = `t:${this._encodeTPath(topicIndex, subPath)}`;
        const draggable   = this._isEditable ? 'draggable="true"' : '';
        const dragAttrs   = this._isEditable ? `data-drag-path="${dragPath}" data-drag-node-type="topic"` : '';
        const indent      = this._tocIndent(depth, false);

        return `
            <div class="chapter-toc__subtopic-group">
                <button class="chapter-toc__entry chapter-toc__entry--subtopic chapter-toc__drop-zone"
                        data-key="${key}" data-type="topic"
                        data-topic-index="${topicIndex}" data-sub-path="${subPathStr}"
                        data-drop-path="${dragPath}" data-drop-node-type="topic"
                        style="padding-left:${indent}px"
                        ${draggable} ${dragAttrs}>
                    ${hasChildren
            ? `<span class="chapter-toc__topic-toggle" data-toggle-key="${key}">${collapsed ? '▶' : '▼'}</span>`
            : `<span class="chapter-toc__topic-toggle-placeholder"></span>`}
                    <span class="chapter-toc__entry-label">${this._esc(node.topic ?? '')}</span>
                </button>
                ${collapsed || !hasChildren ? '' : [
            ...(node.items ?? []).map((item, ii) => this._renderOStarEntry(item, topicIndex, subPath, ii, depth)),
            ...(node.subTopics ?? []).map((sub, si) => this._renderSubtopicNode(sub, topicIndex, [...subPath, si], depth + 1)),
        ].join('')}
            </div>`;
    }

    /**
     * Render a single O* entry button.
     * @param {object}   item        — normalised O* item { id, type, code, title }
     * @param {number}   topicIndex  — top-level topic index
     * @param {number[]} subPath     — sub-index path ([] for direct topic items)
     * @param {number}   itemIndex   — index within the owning node's items array
     * @param {number}   depth       — nesting depth of the owning topic (0 = top-level topic)
     */
    _renderOStarEntry(item, topicIndex, subPath, itemIndex, depth = 0) {
        const subPathStr  = subPath.join('-');
        const key         = `ostar-${topicIndex}-${subPathStr || 'x'}-${itemIndex}`;
        const type        = (item.type ?? 'OR').toUpperCase();
        const code        = item.code  ?? '';
        const title       = item.title ?? String(item.id ?? item.itemId ?? '');
        const label       = code ? `${code} — ${title}` : title;
        const topicPart   = this._encodeTPath(topicIndex, subPath);
        const dragPath    = `o:${topicPart}:${itemIndex}`;
        const draggable   = this._isEditable ? 'draggable="true"' : '';
        const dragAttrs   = this._isEditable ? `data-drag-path="${dragPath}" data-drag-node-type="ostar"` : '';
        const indent      = this._tocIndent(depth, true);

        return `
            <button class="chapter-toc__entry chapter-toc__entry--ostar"
                    data-key="${key}" data-type="ostar"
                    data-item-id="${this._esc(String(item.id ?? item.itemId ?? ''))}"
                    data-item-type="${type}"
                    data-topic-index="${topicIndex}"
                    data-sub-path="${subPathStr}"
                    data-item-index="${itemIndex}"
                    style="padding-left:${indent}px"
                    ${draggable} ${dragAttrs}>
                ${this._typeBadge(type)}
                <span class="chapter-toc__entry-label chapter-toc__entry-label--ostar"
                      title="${this._esc(label)}">${this._esc(label)}</span>
            </button>`;
    }

    _renderUnassignedBucket() {
        const items     = this._unassignedOStars;
        const key       = '_unassigned';
        const collapsed = this._collapsedTopics.has(key);
        const hasItems  = items.length > 0;
        const toggle    = hasItems
            ? `<span class="chapter-toc__topic-toggle" data-toggle-key="${key}">${collapsed ? '▶' : '▼'}</span>`
            : `<span class="chapter-toc__topic-toggle-placeholder"></span>`;

        // Drop-zone attrs: topics and hierarchy O*s can be dropped onto the bucket header
        const dropAttrs = this._isEditable
            ? `data-drop-path="_unclassified" data-drop-node-type="unclassified"`
            : '';

        const indent = this._tocIndent(0, false);

        const itemsHtml = (hasItems && !collapsed)
            ? items.map((item, ii) => {
                const type  = (item.type ?? 'ON').toUpperCase();
                const code  = item.code  ?? '';
                const title = item.title ?? String(item.itemId ?? item.id ?? '');
                const label = code ? `${code} — ${title}` : title;
                const ikey  = `unassigned-${ii}`;
                const dragAttrs = this._isEditable
                    ? `draggable="true" data-drag-path="u:${ii}" data-drag-node-type="unclassified"`
                    : '';
                return `
                    <button class="chapter-toc__entry chapter-toc__entry--ostar"
                            data-key="${ikey}" data-type="ostar"
                            data-item-id="${this._esc(String(item.itemId ?? item.id ?? ''))}"
                            data-item-type="${type}"
                            data-unassigned-index="${ii}"
                            style="padding-left:${this._tocIndent(0, true)}px"
                            ${dragAttrs}>
                        ${this._typeBadge(type)}
                        <span class="chapter-toc__entry-label chapter-toc__entry-label--ostar"
                              title="${this._esc(label)}">${this._esc(label)}</span>
                    </button>`;
            }).join('')
            : '';

        return `
            <div class="chapter-toc__topic-group chapter-toc__unclassified-group">
                <button class="chapter-toc__entry chapter-toc__entry--topic chapter-toc__entry--unassigned chapter-toc__drop-zone"
                        data-key="${key}" data-type="unassigned"
                        style="padding-left:${indent}px"
                        ${dropAttrs}>
                    ${toggle}
                    <span class="chapter-toc__entry-label">&lt;unclassified&gt;${hasItems ? ` (${items.length})` : ''}</span>
                </button>
                ${itemsHtml}
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
    // Drag-and-drop (chapter scope, Elaborate only)
    // =========================================================================

    /**
     * Encode a topic path array into the canonical drag-path string segment.
     * Top-level topic at index 2 → "2"
     * Subtopic at topicIndex=2, subPath=[1,0] → "2.1.0"
     * @param {number}   topicIndex
     * @param {number[]} subPath
     * @returns {string}
     */
    _encodeTPath(topicIndex, subPath) {
        return subPath.length ? `${topicIndex}.${subPath.join('.')}` : `${topicIndex}`;
    }

    /**
     * Decode a topic path string into { topicIndex, subPath }.
     * "2"     → { topicIndex: 2, subPath: [] }
     * "2.1.0" → { topicIndex: 2, subPath: [1, 0] }
     * @param {string} tpath
     * @returns {{ topicIndex: number, subPath: number[] }}
     */
    _decodeTPath(tpath) {
        const parts = tpath.split('.').map(Number);
        return { topicIndex: parts[0], subPath: parts.slice(1) };
    }

    /**
     * Parse a full drag-path attribute value.
     * Topic:         "t:2"      → { nodeType: 'topic',       topicIndex: 2, subPath: [] }
     * Topic:         "t:2.1.0"  → { nodeType: 'topic',       topicIndex: 2, subPath: [1,0] }
     * Hierarchy O*:  "o:2.1:3"  → { nodeType: 'ostar',       topicIndex: 2, subPath: [1], itemIndex: 3 }
     * Unclassified:  "u:5"      → { nodeType: 'unclassified', itemIndex: 5 }
     * @param {string} path
     * @returns {object|null}
     */
    _parseDragPath(path) {
        if (!path) return null;
        if (path.startsWith('t:')) {
            const { topicIndex, subPath } = this._decodeTPath(path.slice(2));
            return { nodeType: 'topic', topicIndex, subPath };
        }
        if (path.startsWith('o:')) {
            const rest  = path.slice(2);
            const last  = rest.lastIndexOf(':');
            const tpath = rest.slice(0, last);
            const ii    = parseInt(rest.slice(last + 1), 10);
            const { topicIndex, subPath } = this._decodeTPath(tpath);
            return { nodeType: 'ostar', topicIndex, subPath, itemIndex: ii };
        }
        if (path.startsWith('u:')) {
            return { nodeType: 'unclassified', itemIndex: parseInt(path.slice(2), 10) };
        }
        return null;
    }

    _handleDragStart(e) {
        const el = e.target.closest('[data-drag-path]');
        if (!el) return;
        const path     = el.dataset.dragPath;
        const nodeType = el.dataset.dragNodeType;
        this._drag = { path, nodeType };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', path);
        el.classList.add('chapter-toc__entry--dragging');
    }

    _handleDragOver(e) {
        if (!this._drag) return;

        const dragIsOStar        = this._drag.nodeType === 'ostar';
        const dragIsUnclassified = this._drag.nodeType === 'unclassified';
        const dragIsTopicMove    = !dragIsOStar && !dragIsUnclassified;

        // Valid drop targets:
        //   - topic buttons (.chapter-toc__drop-zone)       — for topics, hierarchy O*s, unclassified O*s
        //   - hierarchy O* entries (.chapter-toc__entry--ostar)  — for hierarchy O* before/after
        //   - chapter-root strip (.chapter-toc__root-drop)  — topic drags only
        const zone = e.target.closest(
            '.chapter-toc__drop-zone, .chapter-toc__entry--ostar, .chapter-toc__root-drop'
        );
        if (!zone) return;

        const zoneIsOStar         = zone.classList.contains('chapter-toc__entry--ostar');
        const zoneIsRoot          = zone.classList.contains('chapter-toc__root-drop');
        const zoneIsUnclassified  = zone.dataset.dropPath === '_unclassified';
        const zoneIsHierarchyTopic = zone.classList.contains('chapter-toc__drop-zone') && !zoneIsUnclassified;

        // Routing rules:
        // - Topic drags: only to topic drop-zones or root strip; not to O* entries or unclassified bucket
        // - Hierarchy O*: to other hierarchy O* entries (before/after) or any hierarchy topic drop-zone (append);
        //   unclassified O* child entries are not independent drop targets — skip them
        // - Unclassified O*: to hierarchy topic drop-zones only; not to root strip, O* entries, or the bucket itself
        const zoneIsUnclassifiedChild = zoneIsOStar && zone.dataset.dragPath?.startsWith('u:');
        if (dragIsTopicMove   && (zoneIsOStar || zoneIsUnclassified)) return;
        if (dragIsOStar       && zoneIsRoot) return;
        if (dragIsOStar       && zoneIsUnclassifiedChild) return;  // skip unclassified O* children
        if (dragIsUnclassified && (zoneIsRoot || zoneIsOStar || zoneIsUnclassified)) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        let position;
        if (dragIsTopicMove) {
            if (zoneIsRoot) {
                position = 'root';
            } else {
                const rect  = zone.getBoundingClientRect();
                const relY  = e.clientY - rect.top;
                const third = rect.height / 3;
                position = relY < third       ? 'before'
                    : relY > third * 2   ? 'after'
                        :                      'into';
            }
        } else if (dragIsOStar) {
            if (zoneIsOStar) {
                const rect = zone.getBoundingClientRect();
                position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
            } else {
                position = 'into';
            }
        } else {
            // Unclassified O* dragged onto a topic drop-zone → assign to that topic
            position = zoneIsUnclassified ? 'into' : 'into';
        }

        this._clearDropIndicators();
        if (position === 'before')     zone.classList.add('chapter-toc__drop--before');
        else if (position === 'after') zone.classList.add('chapter-toc__drop--after');
        else if (position === 'root')  zone.classList.add('chapter-toc__drop--root');
        else                           zone.classList.add('chapter-toc__drop--into');
        zone.dataset.dropPosition = position;
    }

    _handleDragLeave(e) {
        const zone = e.target.closest(
            '.chapter-toc__drop-zone, .chapter-toc__entry--ostar, .chapter-toc__root-drop'
        );
        if (zone && !zone.contains(e.relatedTarget)) {
            zone.classList.remove(
                'chapter-toc__drop--before', 'chapter-toc__drop--after',
                'chapter-toc__drop--into', 'chapter-toc__drop--root'
            );
            delete zone.dataset.dropPosition;
        }
    }

    _handleDrop(e) {
        e.preventDefault();
        if (!this._drag) return;

        const zone = e.target.closest(
            '.chapter-toc__drop-zone, .chapter-toc__entry--ostar, .chapter-toc__root-drop'
        );
        if (!zone) { this._cancelDrag(); return; }

        const dropPosition = zone.dataset.dropPosition ?? 'into';
        const dropPath     = zone.dataset.dropPath ?? zone.dataset.dragPath ?? null;
        if (!dropPath || dropPath === this._drag.path) { this._cancelDrag(); return; }

        const src = this._parseDragPath(this._drag.path);
        if (!src) { this._cancelDrag(); return; }

        // ── Unclassified O* dragged onto a hierarchy topic → assign to theme ──
        if (src.nodeType === 'unclassified') {
            if (dropPath === '_unclassified') { this._cancelDrag(); return; }
            const dst = this._parseDragPath(dropPath);
            if (!dst || dst.nodeType !== 'topic') { this._cancelDrag(); return; }
            const item = this._unassignedOStars[src.itemIndex];
            if (!item) { this._cancelDrag(); return; }
            // Insert into hierarchy — append to dst topic's items, then sort
            const h = this._cloneHierarchy(this._hierarchy);
            const dstNode = this._resolveTopicNode(h, dst);
            if (!dstNode) { this._cancelDrag(); return; }
            if (!Array.isArray(dstNode.items)) dstNode.items = [];
            dstNode.items.push({ id: item.id ?? item.itemId, type: item.type, code: item.code, title: item.title });
            dstNode.items = this._sortItemsByType(dstNode.items);
            this._clearDropIndicators();
            this._drag = null;
            this._onUnclassifiedChange(h);
            return;
        }

        // ── Hierarchy O* dragged onto <unclassified> bucket (header or child entry) ──
        if (src.nodeType === 'ostar') {
            const dst = this._parseDragPath(dropPath);
            if (dropPath === '_unclassified' || dst?.nodeType === 'unclassified') {
                const h = this._cloneHierarchy(this._hierarchy);
                const srcNode = this._resolveTopicNode(h, { topicIndex: src.topicIndex, subPath: src.subPath });
                if (!srcNode) { this._cancelDrag(); return; }
                srcNode.items.splice(src.itemIndex, 1);
                this._clearDropIndicators();
                this._drag = null;
                this._onUnclassifiedChange(h);
                return;
            }
        }

        // ── Root strip ──
        if (dropPath === 'root') {
            if (src.nodeType !== 'topic') { this._cancelDrag(); return; }
            const mutated = this._applyTopicToRoot(this._cloneHierarchy(this._hierarchy), src);
            this._commitMutation(mutated);
            return;
        }

        // ── Normal hierarchy moves ──
        const dst = this._parseDragPath(dropPath);
        if (!dst) { this._cancelDrag(); return; }

        if (src.nodeType === 'topic' &&
            (this._isAncestorPath(src, dst) || this._isSamePath(src, dst))) {
            this._cancelDrag();
            return;
        }

        const mutated = this._applyDrop(src, dst, dropPosition);
        this._commitMutation(mutated);
    }

    /**
     * Commit a mutated hierarchy: update state, re-render, fire change callback.
     * No-op cancel if mutation failed.
     * @param {object[]|null} mutated
     */
    _commitMutation(mutated) {
        if (!mutated) { this._cancelDrag(); return; }
        this._hierarchy = mutated;
        this._clearDropIndicators();
        this._drag = null;
        this._renderChapterTree();
        this._onHierarchyChange(this._hierarchy);
    }

    _handleDragEnd(e) {
        this._cancelDrag();
    }

    _cancelDrag() {
        this._clearDropIndicators();
        // Remove dragging class from any element still holding it
        this.container?.querySelectorAll('.chapter-toc__entry--dragging')
            .forEach(el => el.classList.remove('chapter-toc__entry--dragging'));
        this._drag = null;
    }

    _clearDropIndicators() {
        this.container?.querySelectorAll(
            '.chapter-toc__drop--before, .chapter-toc__drop--after, .chapter-toc__drop--into, .chapter-toc__drop--root'
        ).forEach(el => {
            el.classList.remove(
                'chapter-toc__drop--before', 'chapter-toc__drop--after',
                'chapter-toc__drop--into', 'chapter-toc__drop--root'
            );
            delete el.dataset.dropPosition;
        });
    }

    /**
     * Returns true if candidateAncestor is a proper ancestor of candidate in the topic tree.
     * Used to prevent dropping a topic onto one of its own descendants.
     * @param {{ topicIndex: number, subPath: number[] }} ancestor
     * @param {{ topicIndex: number, subPath: number[] }} candidate
     */
    _isAncestorPath(ancestor, candidate) {
        if (ancestor.topicIndex !== candidate.topicIndex) return false;
        const ap = ancestor.subPath;
        const cp = candidate.subPath;
        if (ap.length >= cp.length) return false;
        return ap.every((v, i) => cp[i] === v);
    }

    /**
     * Returns true if two topic paths refer to the same node.
     * @param {{ topicIndex: number, subPath: number[] }} a
     * @param {{ topicIndex: number, subPath: number[] }} b
     */
    _isSamePath(a, b) {
        return a.topicIndex === b.topicIndex
            && a.subPath.length === b.subPath.length
            && a.subPath.every((v, i) => b.subPath[i] === v);
    }

    // -------------------------------------------------------------------------
    // Hierarchy mutation
    // -------------------------------------------------------------------------

    /**
     * Deep-clone the render-shape hierarchy array.
     * @param {object[]} hierarchy
     * @returns {object[]}
     */
    _cloneHierarchy(hierarchy) {
        return JSON.parse(JSON.stringify(hierarchy));
    }

    /**
     * Resolve the array and index for a given path within the hierarchy.
     * Returns { parentArray, index } so the caller can splice.
     * @param {object[]} hierarchy
     * @param {{ topicIndex: number, subPath: number[] }} parsed
     * @returns {{ parentArray: object[], index: number } | null}
     */
    _resolveParentArray(hierarchy, { topicIndex, subPath }) {
        if (subPath.length === 0) {
            return { parentArray: hierarchy, index: topicIndex };
        }
        // Walk down to the immediate parent
        let node = hierarchy[topicIndex] ?? null;
        for (let i = 0; i < subPath.length - 1; i++) {
            node = node?.subTopics?.[subPath[i]] ?? null;
        }
        if (!node) return null;
        const lastIdx = subPath[subPath.length - 1];
        return { parentArray: node.subTopics, index: lastIdx };
    }

    /**
     * Resolve the topic node that will receive a dropped O* (the drop target topic).
     * @param {object[]} hierarchy
     * @param {{ topicIndex: number, subPath: number[] }} dst
     * @returns {object|null}
     */
    _resolveTopicNode(hierarchy, { topicIndex, subPath }) {
        let node = hierarchy[topicIndex] ?? null;
        for (const si of subPath) {
            node = node?.subTopics?.[si] ?? null;
        }
        return node;
    }

    /**
     * Apply a drop operation to a cloned hierarchy and return the mutated copy.
     * Returns null if the operation is not valid.
     *
     * @param {{ nodeType, topicIndex, subPath, itemIndex? }} src
     * @param {{ nodeType, topicIndex, subPath }}             dst
     * @param {'before'|'into'|'after'}                      position
     * @returns {object[]|null}
     */
    _applyDrop(src, dst, position) {
        const h = this._cloneHierarchy(this._hierarchy);

        if (src.nodeType === 'topic') {
            return this._applyTopicDrop(h, src, dst, position);
        }
        if (src.nodeType === 'ostar') {
            return this._applyOStarDrop(h, src, dst, position);
        }
        return null;
    }

    /**
     * Move a topic node to a destination, by one of three gestures:
     *   'into'           → reparent as the LAST child of dst (no order preserved)
     *   'before'/'after' → insert as a sibling of dst, before or after it
     *
     * All references (src node + parent array, dst node + parent array) are
     * resolved BEFORE any mutation. We then splice src out and re-insert relative
     * to the dst node found by identity (indexOf). Because we hold live object
     * references, the splice never invalidates them — no index arithmetic.
     *
     * @param {object[]} h — cloned hierarchy
     * @param {{ topicIndex, subPath }} src
     * @param {{ topicIndex, subPath }} dst
     * @param {'into'|'before'|'after'} position
     * @returns {object[]|null}
     */
    _applyTopicDrop(h, src, dst, position) {
        // Resolve everything on the un-mutated clone.
        const srcRef = this._resolveParentArray(h, src);
        if (!srcRef) return null;
        const srcNode = srcRef.parentArray?.[srcRef.index];
        if (!srcNode) return null;

        if (position === 'into') {
            const dstNode = this._resolveTopicNode(h, dst);
            if (!dstNode) return null;
            srcRef.parentArray.splice(srcRef.index, 1);
            if (!Array.isArray(dstNode.subTopics)) dstNode.subTopics = [];
            dstNode.subTopics.push(srcNode);
            return h;
        }

        // before / after: insert as sibling of dst within dst's parent array
        const dstRef = this._resolveParentArray(h, dst);
        if (!dstRef) return null;
        const dstNode = dstRef.parentArray?.[dstRef.index];
        if (!dstNode) return null;

        // Splice src out first (references stay valid).
        srcRef.parentArray.splice(srcRef.index, 1);

        // Re-find dst's current index by identity — robust to the splice above
        // having shifted indices when src and dst shared a parent array.
        const dstParent = dstRef.parentArray;
        const dstIdx = dstParent.indexOf(dstNode);
        if (dstIdx < 0) return null;

        const insertAt = position === 'before' ? dstIdx : dstIdx + 1;
        dstParent.splice(insertAt, 0, srcNode);
        return h;
    }

    /**
     * Reparent a topic node to chapter root (append as last top-level topic).
     * @param {object[]} h — cloned hierarchy
     * @param {{ topicIndex, subPath }} src
     * @returns {object[]|null}
     */
    _applyTopicToRoot(h, src) {
        const srcRef  = this._resolveParentArray(h, src);
        if (!srcRef) return null;
        const srcNode = srcRef.parentArray?.[srcRef.index];
        if (!srcNode) return null;

        srcRef.parentArray.splice(srcRef.index, 1);
        h.push(srcNode);
        return h;
    }

    /**
     * Move an O* item positionally within or between topics.
     * After insertion the owning topic's items array is re-sorted ON → OR → OC,
     * with the dropped item placed at the requested position within its type group.
     *
     * Drop rules:
     *   - dst.nodeType === 'ostar' + position 'before'/'after' → insert relative to that item
     *   - dst.nodeType === 'topic' + position 'into'           → append to end of type group
     *
     * @param {object[]} h — cloned hierarchy
     * @param {{ topicIndex, subPath, itemIndex }}        src
     * @param {{ nodeType, topicIndex, subPath, itemIndex? }} dst
     * @param {'before'|'after'|'into'}                   position
     */
    _applyOStarDrop(h, src, dst, position) {
        // Extract source item
        const srcNode = this._resolveTopicNode(h, { topicIndex: src.topicIndex, subPath: src.subPath });
        if (!srcNode) return null;
        const [item] = (srcNode.items ?? []).splice(src.itemIndex, 1);
        if (!item) return null;

        // Resolve destination topic node
        // dst is either an ostar entry (nodeType 'ostar') or a topic drop-zone (nodeType 'topic')
        const dstTopicPath = { topicIndex: dst.topicIndex, subPath: dst.subPath };
        const dstNode = this._resolveTopicNode(h, dstTopicPath);
        if (!dstNode) return null;
        if (!Array.isArray(dstNode.items)) dstNode.items = [];

        if (dst.nodeType === 'ostar' && dst.itemIndex != null) {
            // Adjust dst itemIndex if src and dst share the same topic and src preceded dst
            let dstIdx = dst.itemIndex;
            const sameNode =
                src.topicIndex === dst.topicIndex &&
                src.subPath.length === dst.subPath.length &&
                src.subPath.every((v, i) => dst.subPath[i] === v);
            if (sameNode && src.itemIndex < dstIdx) dstIdx -= 1;

            const insertAt = position === 'before' ? dstIdx : dstIdx + 1;
            dstNode.items.splice(insertAt, 0, item);
        } else {
            // Dropping on a topic row → append (type sort will place it correctly)
            dstNode.items.push(item);
        }

        // Enforce ON → OR → OC order within the destination topic,
        // preserving relative order within each type group.
        dstNode.items = this._sortItemsByType(dstNode.items);

        return h;
    }

    /**
     * Sort an items array by type group: ON first, then OR, then OC.
     * Relative order within each group is preserved (stable sort).
     * @param {object[]} items
     * @returns {object[]}
     */
    _sortItemsByType(items) {
        const rank = { ON: 0, OR: 1, OC: 2 };
        return [...items].sort((a, b) => {
            const ra = rank[(a.type ?? 'OR').toUpperCase()] ?? 1;
            const rb = rank[(b.type ?? 'OR').toUpperCase()] ?? 1;
            return ra - rb;
        });
    }

    // =========================================================================

    setActiveKey(key) {
        this._activeKey = key;
        this.container?.querySelectorAll('.chapter-toc__entry').forEach(b => {
            b.classList.toggle('chapter-toc__entry--active', b.dataset.key === key);
        });
    }

    /**
     * Programmatically select a top-level topic by its zero-based index.
     * Equivalent to the user clicking the topic button in the TOC.
     * Used by NarrativeActivity._selectTopic() after n-ref navigation.
     * @param {number} idx — zero-based index into osHierarchy.topics
     */
    selectTopicByIndex(idx) {
        const key = `topic-${idx}`;
        const btn = this.container?.querySelector(`.chapter-toc__entry[data-key="${key}"]`);
        if (btn) {
            this._handleChapterEntryClick(btn);
        } else {
            // TOC not yet rendered or collapsed — resolve directly and fire callback
            const topic = this._resolveTopicByPath(idx, []);
            if (!topic) return;
            this.setActiveKey(key);
            this._onChapterSelect({ type: 'topic', topic, chapter: this._chapter });
        }
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
    // Action helpers (chapter scope, Elaborate only)
    // =========================================================================

    /**
     * Returns the topic path { topicIndex, subPath } of the currently active
     * topic or subtopic entry, or null if no topic is selected (e.g. chapter
     * narrative or O* entry is active).
     * Used to determine the insertion point for +Theme and +O* actions.
     * @returns {{ topicIndex: number, subPath: number[] } | null}
     */
    _getActiveTopicPath() {
        if (!this._activeKey) return null;

        // Top-level topic: "topic-{n}"
        const topicMatch = this._activeKey.match(/^topic-(\d+)$/);
        if (topicMatch) {
            return { topicIndex: parseInt(topicMatch[1], 10), subPath: [] };
        }

        // Subtopic: "subtopic-{topicIndex}-{sub1}-{sub2}-…"
        const subMatch = this._activeKey.match(/^subtopic-(\d+)-(.+)$/);
        if (subMatch) {
            const topicIndex = parseInt(subMatch[1], 10);
            const subPath    = subMatch[2].split('-').map(Number);
            return { topicIndex, subPath };
        }

        return null;
    }

    /**
     * Compute the next free topic id across the full hierarchy tree.
     * IDs are positive integers assigned as strings ("1", "2", …).
     * Mirrors the server-side DFS counter from DistributedEditionImporter.
     * @param {object[]} hierarchy — render-shape topic array
     * @returns {string}
     */
    _nextFreeTopicId(hierarchy) {
        let max = 0;
        const walk = (nodes) => {
            for (const n of nodes ?? []) {
                const id = parseInt(n.id, 10);
                if (Number.isFinite(id) && id > max) max = id;
                walk(n.subTopics ?? []);
            }
        };
        walk(hierarchy);
        return String(max + 1);
    }

    // =========================================================================


    cleanup() {
        this.container         = null;
        this._chapter          = null;
        this._activeKey        = null;
        this._unassignedOStars = [];
        this._collapsedTopics  = new Set();
        this._hierarchy        = [];
        this._drag             = null;
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
        const node = {
            id:        t.id ?? null,
            topic:     t.topic,
            narrative: t.narrative ?? null,
            items:    [
                ...(t.ons ?? []).map(o => mapItem(o, 'ON')),
                ...(t.ors ?? []).map(o => mapItem(o, 'OR')),
                ...(t.ocs ?? []).map(o => mapItem(o, 'OC')),
            ],
            subTopics: (t.subtopics ?? []).map(s => this._normaliseTopic(s)),
        };
        return node;
    }

    /**
     * Compute the padding-left value (px) for a TOC entry at a given nesting depth.
     * Base indent (topic at depth 0): 16px. Each additional level adds 12px.
     * O* entries add a further 20px on top of the owning topic's indent.
     * @param {number}  depth  — 0 = top-level topic, 1 = first subtopic level, …
     * @param {boolean} isOStar
     * @returns {number}
     */
    _tocIndent(depth, isOStar) {
        const base = 16 + depth * 12;
        return isOStar ? base + 20 : base;
    }

    _typeBadge(type) {
        const cls = type === 'ON' ? 'ostar-type-on' : type === 'OR' ? 'ostar-type-or' : type === 'OC' ? 'ostar-type-oc' : 'ostar-type-other';
        return `<span class="chapter-toc__type-badge ${cls}">${type}</span>`;
    }

    _esc(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}