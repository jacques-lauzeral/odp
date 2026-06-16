import { normalizeId, idsEqual } from '/shared/src/index.js';

/** Returns true if value can be treated as a plain integer id. */
const _isIntegerId = (v) => v !== null && v !== undefined && /^\d+$/.test(String(v));

/**
 * @file reference-manager.js
 * @description Inline single-select component supporting both flat option lists
 * and hierarchical trees with lazy node expansion.
 *
 * ## Backward compatibility
 * Callers that pass `options: [{value, label}, ...]` continue to work unchanged.
 * The flat array is auto-converted to a tree of leaf nodes internally.
 *
 * ## Tree mode
 * Pass `nodes` instead of (or in addition to) `options`:
 *
 *   nodes: [
 *     {
 *       value,        {string|number|null}  Selection value. null = non-selectable header.
 *       label,        {string}              Display label.
 *       leaf,         {boolean}             When true, no expand arrow is shown.
 *       children,     {Node[]|undefined}    Pre-populated static children.
 *       onExpand,     {() => Promise<Node[]>|undefined}
 *                                           Async loader; result is cached on the node.
 *     },
 *     ...
 *   ]
 *
 * Any node with a non-null value is selectable regardless of whether it has children.
 * Nodes with children or onExpand get an expand/collapse toggle.
 * onExpand is called at most once — result is cached on node._children.
 *
 * ## Search
 * A filter input is shown above the tree (edit mode). Typing filters across all
 * statically known labels (loaded nodes). Lazy nodes that have not yet been
 * expanded are not searched (their parent label remains visible if it matches).
 * Clearing the filter restores the full tree with its current expand state.
 *
 * ## Config
 *   fieldId      {string}    Required.
 *   options      {Array}     Flat [{value, label}] — auto-converted to leaf nodes.
 *   nodes        {Array}     Tree nodes (takes precedence over options).
 *   initialValue {*}         Single id or null/undefined.
 *   placeholder  {string}    Filter input placeholder.
 *   noneLabel    {string}    Label when nothing selected (read-only, default 'None').
 *   readOnly     {boolean}   Chip-only display when true.
 *   onChange     {Function}  Called with raw value string (or null) on selection.
 *   onItemClick  {Function}  (id, node) => void — navigable chip in read mode.
 *
 * ## Public API
 *   render(container)  Mount into container element.
 *   getValue()         Return current selected id (normalised) or null.
 *   setValue(value)    Replace selection programmatically.
 *   destroy()          Remove listeners and clear container reference.
 */
export default class ReferenceManager {

    constructor(config) {
        if (!config.fieldId) throw new Error('ReferenceManager requires fieldId');

        this._fieldId     = config.fieldId;
        this._placeholder = config.placeholder || 'Type to filter…';
        this._noneLabel   = config.noneLabel   || 'None';
        this._readOnly    = config.readOnly    || false;
        this._onChange    = config.onChange    || (() => {});
        this._onItemClick = config.onItemClick || null;

        // Build root node list — nodes take precedence; options is the flat fallback.
        this._roots = config.nodes
            ? config.nodes
            : this._flatToNodes(config.options || []);

        // Expand state keyed by node identity (using index path string)
        // _expandedPaths: Set<string>  where path = '0', '0.2', '0.2.1' etc.
        this._expandedPaths = new Set();

        // Nodes currently loading (path string → Promise)
        this._loadingPaths = new Set();

        this.selectedId    = this._normalizeValue(config.initialValue);
        this._selectedNode = null;  // cached node for chip label — avoids tree search after lazy expansion
        this._filterTerm   = '';
        this.container     = null;
        this._handlers     = {};
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    render(container) {
        this.container = container;
        this._mount();
        this._bindEvents();
        return container;
    }

    getValue() {
        return this.selectedId;
    }

    setValue(value) {
        this.selectedId    = this._normalizeValue(value);
        this._selectedNode = null;
        this._filterTerm   = '';
        this._rerender();
    }

    destroy() {
        if (this.container) {
            this.container.removeEventListener('click',   this._handlers.click);
            this.container.removeEventListener('input',   this._handlers.input);
            this.container.removeEventListener('keydown', this._handlers.keydown);
            this.container.querySelector(`#${this._eid('popup')}`)?.remove();
            this.container = null;
        }
        this.selectedId  = null;
        this._filterTerm = '';
        this._handlers   = {};
    }

    // ─── Mount / rerender ────────────────────────────────────────────────────

    _mount() {
        this.container.innerHTML = `
            <div class="reference-manager" id="${this._eid('rm')}">
                ${this._renderInner()}
                <input type="hidden"
                       id="${this._eid('data')}"
                       name="${this._fieldId}"
                       value="${this._esc(this.selectedId ?? '')}">
            </div>`;
    }

    _rerender() {
        const rm = this._rm();
        if (!rm) return;
        rm.innerHTML = `
            ${this._renderInner()}
            <input type="hidden"
                   id="${this._eid('data')}"
                   name="${this._fieldId}"
                   value="${this._esc(this.selectedId ?? '')}">`;
    }

    _rerenderTree() {
        const treeEl = this.container?.querySelector(`#${this._eid('popup')} .reference-manager-tree`);
        if (treeEl) {
            treeEl.innerHTML = this._renderTreeBody();
        }
    }

    // ─── Inner content ───────────────────────────────────────────────────────

    _renderInner() {
        if (this._readOnly) {
            return this.selectedId != null
                ? this._renderChip()
                : `<span class="reference-manager-none">${this._esc(this._noneLabel)}</span>`;
        }
        // Edit mode: compact selection (if any) + a button that opens the picker popup.
        // The multi-root tree lives in the popup, not inline.
        if (this.selectedId != null) {
            return `${this._renderChip()}
                    <button type="button" class="odip-btn odip-btn--primary rm-pick-btn">Change</button>`;
        }
        return `<span class="empty-state-inline">${this._esc(this._noneLabel)}</span>
                <button type="button" class="odip-btn odip-btn--primary rm-pick-btn">Select</button>`;
    }

    // ─── Chip ─────────────────────────────────────────────────────────────────

    _renderChip() {
        const node  = this._selectedNode ?? this._findNode(this.selectedId, this._roots);
        const label = node ? node.label : `ID ${this.selectedId}`;

        if (this._readOnly) {
            if (this._onItemClick) {
                return `<span class="selected-chip selected-chip--link"
                              data-item-id="${this._esc(String(this.selectedId))}"
                              role="link" tabindex="0"
                              title="Open ${this._esc(label)}"
                        >${this._esc(label)}</span>`;
            }
            return `<span class="selected-chip">${this._esc(label)}</span>`;
        }

        return `<span class="selected-chip"${node?.title ? ` title="${this._esc(node.title)}"` : ''}>
                    ${this._esc(label)}
                    <button type="button" class="chip-remove" title="Remove">×</button>
                </span>`;
    }

    // ─── Picker popup (filter + multi-root tree) ────────────────────────────

    _renderTreeBody() {
        const term = this._filterTerm.trim().toLowerCase();
        if (term) {
            const nodes = this._filterNodesWithPath(this._roots, term, []);
            return nodes.length > 0
                ? this._renderNodes(nodes, '', 0, true)
                : '<div class="reference-manager-no-results">No matching items</div>';
        }
        return this._roots.length > 0
            ? this._renderNodes(this._roots, '', 0, false)
            : '';
    }

    _showPopup() {
        this._filterTerm = '';

        const popup = document.createElement('div');
        popup.className = 'search-popup-overlay';
        popup.id = this._eid('popup');
        popup.innerHTML = `
            <div class="search-popup rm-picker-popup">
                <div class="search-popup-header">
                    <input type="text"
                           id="${this._eid('search')}"
                           class="odip-input search-input reference-manager-input"
                           placeholder="${this._esc(this._placeholder)}"
                           autocomplete="off">
                    <button type="button" class="odip-btn btn-cancel-search">Cancel</button>
                </div>
                <div class="search-popup-results">
                    <div class="reference-manager-tree">
                        ${this._renderTreeBody()}
                    </div>
                </div>
            </div>`;
        this.container.appendChild(popup);

        popup.querySelector(`#${this._eid('search')}`)?.focus();
    }

    _hidePopup() {
        this._filterTerm = '';
        this.container?.querySelector(`#${this._eid('popup')}`)?.remove();
    }

    /**
     * Render a list of nodes at a given indent depth.
     * @param {object[]} nodes
     * @param {string}   pathPrefix   dot-separated index path of parent, '' for root
     * @param {number}   depth
     * @param {boolean}  forceExpand  when true (filter active), always render children expanded
     * @returns {string}
     */
    _renderNodes(nodes, pathPrefix, depth, forceExpand = false) {
        return nodes.map((node, idx) => {
            const path     = pathPrefix ? `${pathPrefix}.${idx}` : String(idx);
            const hasKids  = this._nodeHasChildren(node);
            const expanded = forceExpand || this._expandedPaths.has(path);
            const loading  = !forceExpand && this._loadingPaths.has(path);
            const selectable = node.value != null;
            const isSelected = selectable && (
                _isIntegerId(node.value) && _isIntegerId(this.selectedId)
                    ? idsEqual(node.value, this.selectedId)
                    : String(node.value) === String(this.selectedId)
            );

            const indent = depth * 16; // px per level

            // In filter mode: no expand toggle — all matched nodes render fully expanded
            const expandBtn = forceExpand
                ? `<span class="rm-expand-spacer"></span>`
                : hasKids
                    ? `<button type="button"
                               class="rm-expand-btn${loading ? ' rm-expand-btn--loading' : ''}"
                               data-path="${this._esc(path)}"
                               title="${expanded ? 'Collapse' : 'Expand'}"
                       >${loading ? '…' : expanded ? '▾' : '▸'}</button>`
                    : `<span class="rm-expand-spacer"></span>`;

            const displayLabel = node.displayLabel ?? node.label;

            const labelEl = selectable
                ? `<button type="button"
                           class="rm-node-label${isSelected ? ' rm-node-label--selected' : ''}"
                           data-value="${this._esc(String(node.value))}"
                           data-label="${this._esc(node.label)}"
                           data-path="${this._esc(path)}"
                           ${node.title ? `title="${this._esc(node.title)}"` : ''}
                   >${this._esc(displayLabel)}</button>`
                : `<span class="rm-node-label ${node._contextOnly ? 'rm-node-label--context' : 'rm-node-label--header'}">${this._esc(displayLabel)}</span>`;

            const children = (expanded && !loading)
                ? this._renderExpandedChildren(node, path, depth, forceExpand)
                : '';

            return `<div class="rm-node" style="padding-left:${indent}px" data-node-path="${this._esc(path)}">
                        <div class="rm-node-row">
                            ${expandBtn}
                            ${labelEl}
                        </div>
                        ${children}
                    </div>`;
        }).join('');
    }

    _renderExpandedChildren(node, path, depth, forceExpand = false) {
        const kids = node._children ?? node.children ?? [];
        if (!kids.length) return '';
        return `<div class="rm-node-children">
                    ${this._renderNodes(kids, path, depth + 1, forceExpand)}
                </div>`;
    }

    // ─── Filtering ───────────────────────────────────────────────────────────

    /**
     * Path-aware filter: a node is included if the term matches any segment
     * of its full ancestor path (including itself).
     *
     * Examples for term "NM":
     *   Network / NM / FMP  → included (NM matches ancestor)
     *   Network / NM        → included (self match)
     *   NSP / SO1           → excluded (no path segment matches)
     *
     * Ancestors that don't match themselves are kept as non-selectable context
     * headers so the hierarchy remains readable.
     *
     * @param {object[]} nodes
     * @param {string}   term        lowercase search term
     * @param {string[]} ancestorLabels  labels of all ancestors (empty at root)
     * @returns {object[]}
     */
    _filterNodesWithPath(nodes, term, ancestorLabels) {
        const result = [];
        for (const node of nodes) {
            const kids = node._children ?? node.children ?? [];
            const pathLabels = [...ancestorLabels, node.label.toLowerCase()];

            // A node matches if any segment in its full path contains the term
            const pathMatch = pathLabels.some(seg => seg.includes(term));

            if (pathMatch) {
                // Include this node with all its descendants (fully expanded).
                // _origin points to the real root-tree node so that _toggleExpand
                // populates _children on the correct object.
                result.push({ ...node, _origin: node, _children: kids.length ? kids : undefined });
            } else {
                // This node itself doesn't match — recurse into children;
                // keep this node as a non-selectable context header if kids match
                const matchedKids = kids.length
                    ? this._filterNodesWithPath(kids, term, pathLabels)
                    : [];
                if (matchedKids.length) {
                    result.push({ ...node, _origin: node, value: null, _contextOnly: true, _children: matchedKids });
                }
            }
        }
        return result;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    _bindEvents() {
        if (this._readOnly) {
            if (this._onItemClick) {
                this._handlers.click = e => this._handleReadOnlyClick(e);
                this.container.addEventListener('click', this._handlers.click);
            }
            return;
        }

        this._handlers.click   = e => this._handleClick(e);
        this._handlers.input   = e => this._handleInput(e);
        this._handlers.keydown = e => this._handleKeydown(e);

        this.container.addEventListener('click',   this._handlers.click);
        this.container.addEventListener('input',   this._handlers.input);
        this.container.addEventListener('keydown', this._handlers.keydown);
    }

    _handleReadOnlyClick(e) {
        e.stopPropagation();
        const chip = e.target.closest('[data-item-id]');
        if (!chip) return;
        const id   = this._normalizeValue(chip.dataset.itemId);
        const node = this._findNode(id, this._roots);
        if (node) this._onItemClick(id, node);
    }

    _handleClick(e) {
        // ── Open picker popup ─────────────────────────────────────────────────
        if (e.target.closest('.rm-pick-btn')) {
            this._showPopup();
            return;
        }

        // ── Cancel button or backdrop click ───────────────────────────────────
        if (e.target.classList.contains('btn-cancel-search') ||
            e.target.classList.contains('search-popup-overlay')) {
            this._hidePopup();
            return;
        }

        // ── Chip remove ──────────────────────────────────────────────────────
        if (e.target.classList.contains('chip-remove')) {
            this.selectedId    = null;
            this._selectedNode = null;
            this._filterTerm   = '';
            this._rerender();
            this._onChange(null);
            return;
        }

        // ── Expand/collapse toggle (inside popup) ─────────────────────────────
        const expandBtn = e.target.closest('.rm-expand-btn');
        if (expandBtn) {
            e.stopPropagation();
            const path = expandBtn.dataset.path;
            this._toggleExpand(path);
            return;
        }

        // ── Node label selection (inside popup) ───────────────────────────────
        const labelBtn = e.target.closest('.rm-node-label[data-value]');
        if (labelBtn) {
            const raw  = labelBtn.dataset.value;
            const node = this._findNode(this._normalizeValue(raw), this._roots)
                ?? this._nodeAtPath(labelBtn.dataset.path)
                ?? { label: labelBtn.dataset.label ?? raw };
            this.selectedId    = this._normalizeValue(raw);
            this._selectedNode = node ?? null;
            this._filterTerm   = '';
            this._hidePopup();
            this._rerender();
            this._onChange(raw, node);
            return;
        }
    }

    _handleInput(e) {
        if (e.target.classList.contains('reference-manager-input')) {
            this._filterTerm = e.target.value;
            this._rerenderTree();
        }
    }

    _handleKeydown(e) {
        if (e.key === 'Escape' && e.target.classList.contains('reference-manager-input')) {
            this._hidePopup();
        }
    }

    // ─── Expand / lazy load ──────────────────────────────────────────────────

    /**
     * Toggle expand state for the node at the given path string.
     * If the node has an onExpand callback and hasn't been loaded yet, load it first.
     * @param {string} path
     */
    _toggleExpand(path) {
        const node = this._nodeAtPath(path);
        if (!node) return;

        if (this._expandedPaths.has(path)) {
            this._expandedPaths.delete(path);
            this._rerenderTree();
            return;
        }

        // Already has loaded children — just expand
        if (node._children || node.children?.length) {
            this._expandedPaths.add(path);
            this._rerenderTree();
            return;
        }

        // Lazy load via onExpand
        if (typeof node.onExpand === 'function') {
            // node may be a filtered copy — always write _children back to the
            // original root-tree node so _findNode can locate descendants.
            const target = node._origin ?? node;
            this._loadingPaths.add(path);
            this._rerenderTree();
            Promise.resolve(node.onExpand(node)).then(children => {
                target._children = children ?? [];
                this._loadingPaths.delete(path);
                this._expandedPaths.add(path);
                this._rerenderTree();
            }).catch(err => {
                console.error(`[ReferenceManager] onExpand failed for path ${path}:`, err);
                this._loadingPaths.delete(path);
                this._rerenderTree();
            });
            return;
        }

        // Leaf — nothing to expand
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Convert flat [{value, label}] array to leaf node tree.
     * @param {object[]} options
     * @returns {object[]}
     */
    _flatToNodes(options) {
        return options.map(o => ({ value: o.value, label: o.label, title: o.title, leaf: true }));
    }

    /**
     * Returns true if the node has children (static or lazy).
     * @param {object} node
     */
    _nodeHasChildren(node) {
        if (node.leaf) return false;
        if (node._children?.length) return true;
        if (node.children?.length) return true;
        if (typeof node.onExpand === 'function') return true;
        return false;
    }

    /**
     * Walk the tree to find a node by its selection value.
     * Searches both static children and already-loaded lazy children.
     * @param {*}        value
     * @param {object[]} nodes
     * @returns {object|null}
     */
    _findNode(value, nodes) {
        for (const node of nodes) {
            if (node.value != null) {
                const match = _isIntegerId(value) && _isIntegerId(node.value)
                    ? idsEqual(node.value, value)
                    : String(node.value) === String(value);
                if (match) return node;
            }
            const kids = node._children ?? node.children ?? [];
            if (kids.length) {
                const found = this._findNode(value, kids);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Walk the root tree using a dot-separated index path to retrieve a node.
     * @param {string} path  e.g. '0', '2.1', '0.3.2'
     * @returns {object|null}
     */
    _nodeAtPath(path) {
        const parts = path.split('.').map(Number);
        let nodes = this._roots;
        let node  = null;
        for (const idx of parts) {
            if (!nodes || idx >= nodes.length) return null;
            node  = nodes[idx];
            nodes = node._children ?? node.children ?? [];
        }
        return node;
    }

    _syncHidden() {
        const hidden = this._rm()?.querySelector(`#${this._eid('data')}`);
        if (hidden) hidden.value = this.selectedId ?? '';
    }

    _rm()       { return this.container?.querySelector(`#${this._eid('rm')}`); }
    _eid(suf)   { return `${this._fieldId}-${suf}`; }

    _normalizeValue(value) {
        if (value === null || value === undefined || value === '') return null;
        if (!_isIntegerId(value)) return String(value); // composite / non-integer values pass through
        return normalizeId(value);
    }

    _esc(text) {
        if (text === null || text === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }

    // ─── Static utilities ─────────────────────────────────────────────────────

    /**
     * Convert a flat array of items carrying `parentId` into a
     * ReferenceManager-compatible node tree.
     *
     * All nodes are selectable (value = item id). Children are sorted
     * alphabetically. Items whose parentId references an unknown id are
     * promoted to root. Falls back to flat leaf nodes when no item carries
     * a parentId (safe for unstructured datasets).
     *
     * @param {object[]} items      — flat array; each item must have `id`
     * @param {function} [getLabel] — optional (item) => string label;
     *                               defaults to item.name ?? item.title ?? String(item.id)
     * @returns {object[]}  root nodes with nested `children[]` (pruned on leaves)
     */
    static buildTreeNodes(items, getLabel) {
        if (!items?.length) return [];

        const labelOf = getLabel ?? (item => item.name ?? item.title ?? String(item.id));
        const hasHierarchy = items.some(item => item.parentId != null);

        if (!hasHierarchy) {
            return items.map(item => ({
                value: normalizeId(item.id),
                label: labelOf(item),
                leaf:  true,
            }));
        }

        const byId  = new Map(items.map(item => [String(item.id), item]));
        const nodes = new Map(items.map(item => [String(item.id), {
            value:    normalizeId(item.id),
            label:    labelOf(item),
            children: [],
        }]));

        const roots = [];
        for (const item of items) {
            const node = nodes.get(String(item.id));
            if (item.parentId != null && byId.has(String(item.parentId))) {
                nodes.get(String(item.parentId)).children.push(node);
            } else {
                roots.push(node);
            }
        }

        const sortAndPrune = (list) => {
            list.sort((a, b) => a.label.localeCompare(b.label));
            list.forEach(n => {
                if (n.children.length) sortAndPrune(n.children);
                else delete n.children;
            });
        };
        sortAndPrune(roots);

        return roots;
    }
}