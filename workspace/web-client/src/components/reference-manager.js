import { normalizeId, idsEqual } from '/shared/src/index.js';

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
        const rm = this._rm();
        if (!rm) return;
        // Replace only the tree div — input element is left untouched to preserve focus.
        const treeEl = rm.querySelector('.reference-manager-tree');
        if (treeEl) {
            const nodes = this._filterTerm.trim()
                ? this._filterNodes(this._roots, this._filterTerm.toLowerCase())
                : this._roots;
            treeEl.innerHTML = nodes.length > 0
                ? this._renderNodes(nodes, '', 0)
                : this._filterTerm
                    ? '<div class="reference-manager-no-results">No matching items</div>'
                    : '';
        } else {
            this._rerender();
        }
        this._syncHidden();
    }

    // ─── Inner content ───────────────────────────────────────────────────────

    _renderInner() {
        if (this.selectedId != null) return this._renderChip();
        if (this._readOnly) {
            return `<span class="reference-manager-none">${this._esc(this._noneLabel)}</span>`;
        }
        return this._renderBrowse();
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

        return `<span class="selected-chip">
                    ${this._esc(label)}
                    <button type="button" class="chip-remove" title="Remove">×</button>
                </span>`;
    }

    // ─── Browse area (filter + tree) ─────────────────────────────────────────

    _renderBrowse() {
        const nodes = this._filterTerm.trim()
            ? this._filterNodes(this._roots, this._filterTerm.toLowerCase())
            : this._roots;

        return `
            <div class="reference-manager-browse">
                <input type="text"
                       id="${this._eid('search')}"
                       class="odip-input reference-manager-input"
                       placeholder="${this._esc(this._placeholder)}"
                       value="${this._esc(this._filterTerm)}"
                       autocomplete="off">
                <div class="reference-manager-tree">
                    ${nodes.length > 0
            ? this._renderNodes(nodes, '', 0)
            : this._filterTerm
                ? '<div class="reference-manager-no-results">No matching items</div>'
                : ''}
                </div>
            </div>`;
    }

    /**
     * Render a list of nodes at a given indent depth.
     * @param {object[]} nodes
     * @param {string}   pathPrefix   dot-separated index path of parent, '' for root
     * @param {number}   depth
     * @returns {string}
     */
    _renderNodes(nodes, pathPrefix, depth) {
        return nodes.map((node, idx) => {
            const path     = pathPrefix ? `${pathPrefix}.${idx}` : String(idx);
            const hasKids  = this._nodeHasChildren(node);
            const expanded = this._expandedPaths.has(path);
            const loading  = this._loadingPaths.has(path);
            const selectable = node.value != null;
            const isSelected = selectable && idsEqual(node.value, this.selectedId);

            const indent = depth * 16; // px per level

            const expandBtn = hasKids
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
                           data-path="${this._esc(path)}"
                   >${this._esc(displayLabel)}</button>`
                : `<span class="rm-node-label rm-node-label--header">${this._esc(displayLabel)}</span>`;

            const children = (expanded && !loading)
                ? this._renderExpandedChildren(node, path, depth)
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

    _renderExpandedChildren(node, path, depth) {
        const kids = node._children ?? node.children ?? [];
        if (!kids.length) return '';
        return `<div class="rm-node-children">
                    ${this._renderNodes(kids, path, depth + 1)}
                </div>`;
    }

    // ─── Filtering ───────────────────────────────────────────────────────────

    /**
     * Return a filtered subset of nodes whose label (or any descendant label)
     * matches the term. Matched nodes are returned with matching children only.
     * Lazy nodes that haven't been expanded are included if their own label matches.
     * @param {object[]} nodes
     * @param {string}   term  lowercase
     * @returns {object[]}
     */
    _filterNodes(nodes, term) {
        const result = [];
        for (const node of nodes) {
            const selfMatch = node.label.toLowerCase().includes(term);
            const kids = node._children ?? node.children ?? [];
            const filteredKids = kids.length ? this._filterNodes(kids, term) : [];
            if (selfMatch || filteredKids.length) {
                result.push({ ...node, _children: filteredKids.length ? filteredKids : (node._children ?? node.children) });
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
        // ── Chip remove ──────────────────────────────────────────────────────
        if (e.target.classList.contains('chip-remove')) {
            this.selectedId    = null;
            this._selectedNode = null;
            this._filterTerm   = '';
            this._rerender();
            this._onChange(null);
            this.container.querySelector('.reference-manager-input')?.focus();
            return;
        }

        // ── Expand/collapse toggle ────────────────────────────────────────────
        const expandBtn = e.target.closest('.rm-expand-btn');
        if (expandBtn) {
            e.stopPropagation();
            const path = expandBtn.dataset.path;
            this._toggleExpand(path);
            return;
        }

        // ── Node label selection ──────────────────────────────────────────────
        const labelBtn = e.target.closest('.rm-node-label[data-value]');
        if (labelBtn) {
            const raw  = labelBtn.dataset.value;
            const node = this._nodeAtPath(labelBtn.dataset.path);
            this.selectedId    = this._normalizeValue(raw);
            this._selectedNode = node ?? null;
            this._filterTerm   = '';
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
            this._filterTerm = '';
            this._rerenderTree();
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
            this._loadingPaths.add(path);
            this._rerenderTree();
            Promise.resolve(node.onExpand(node)).then(children => {
                node._children = children ?? [];
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
        return options.map(o => ({ value: o.value, label: o.label, leaf: true }));
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
            if (node.value != null && idsEqual(node.value, value)) return node;
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
        return normalizeId(value);
    }

    _esc(text) {
        if (text === null || text === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }
}