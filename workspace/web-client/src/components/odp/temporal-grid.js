/**
 * TemporalGrid - Generic calendar-based temporal visualisation component.
 *
 * Row hierarchy:
 *   group      — label + timeline track + expand/collapse toggle; supports one
 *                level of nesting via optional parentId (parent must be a group)
 *   child      — indented label + timeline track, visibility controlled by parent group
 *   timeline   — flat label + timeline track (no hierarchy)
 *
 * Group nesting (two levels max):
 *   addGroupRow(drgId, label, milestones)            — top-level group (DrG)
 *   addGroupRow(folderId, label, milestones, drgId)  — nested group (path folder)
 *   addChildRow(onId, rootOnId, label, milestones)   — child of a group
 *
 * Visibility rules:
 *   - A collapsed top-level group hides all nested groups and children beneath it
 *   - A collapsed nested group hides its children but not sibling nested groups
 *
 * Public API
 * ----------
 * setTimeInterval(startYear, endYear)
 * setTicks(ticks)
 * setMilestoneRendering(spec)
 * addGroupRow(id, label, milestones, parentId?)
 * addChildRow(id, parentId, label, milestones)
 * addRow(id, label, milestones, parentId?)
 * updateRow(id, milestones)
 * removeRow(id)
 * clearRows()
 * expandAll()              expand level-1 groups, collapse level-2
 * collapseAll()            collapse all groups to level-1 only
 * snapshotExpandedState()  → Map<id, boolean>
 * restoreExpandedState(snapshot)
 * addSelectionListener(fn)
 * setTimeLineSelected(id, boolean)
 * getSelectedTimeLine()
 * addTimeIntervalUpdateListener(fn)
 * getTimeInterval()
 * render(container)
 * cleanup()
 */
export default class TemporalGrid {

    constructor(options = {}) {
        this.minYear = options.minYear ?? 2025;
        this.maxYear = options.maxYear ?? 2045;
        this.startYear = options.startYear ?? new Date().getFullYear();
        this.endYear   = options.endYear   ?? (this.startYear + 4);
        this.ticks = [];
        this.renderingSpec = null;
        // Label column width in px — user-resizable via drag handle
        this.labelWidth = 220;
        // Insertion-ordered Map of rows
        // { id, kind, label, milestones, parentId?, expanded? }
        this.rows = new Map();
        this.selectedId = null;
        this.selectionListeners = [];
        this.timeIntervalListeners = [];
        this.container = null;
    }

    // =========================================================================
    // PUBLIC API — TIME INTERVAL
    // =========================================================================

    setTimeInterval(startYear, endYear) {
        if (startYear > endYear) return;
        this.startYear = Math.max(startYear, this.minYear);
        this.endYear   = Math.min(endYear,   this.maxYear);
        this.timeIntervalListeners.forEach(fn => fn(this.startYear, this.endYear));
        this._render();
    }

    setTicks(ticks) {
        this.ticks = Array.isArray(ticks) ? [...ticks] : [];
        this._render();
    }

    getTimeInterval() {
        return { startYear: this.startYear, endYear: this.endYear };
    }

    addTimeIntervalUpdateListener(fn) {
        if (typeof fn === 'function') this.timeIntervalListeners.push(fn);
    }

    // =========================================================================
    // PUBLIC API — EXPANSION CONTROL
    // =========================================================================

    /**
     * Expand all level-1 groups (reveals direct children — folders and pathless ONs).
     * Level-2 groups are collapsed so only immediate children of level-1 are visible.
     */
    expandAll() {
        this.rows.forEach(row => {
            if (row.kind === 'group') {
                row.expanded = !row.parentId; // level-1 expanded, level-2 collapsed
            }
        });
        this._render();
    }

    /** Collapse all groups — only level-1 rows remain visible. */
    collapseAll() {
        this.rows.forEach(row => {
            if (row.kind === 'group') row.expanded = false;
        });
        this._render();
    }

    /**
     * Return a snapshot of current expanded states: Map<id, boolean>.
     * Use before clearRows() to preserve state across re-feeds.
     */
    snapshotExpandedState() {
        const snapshot = new Map();
        this.rows.forEach(row => {
            if (row.kind === 'group') snapshot.set(row.id, row.expanded);
        });
        return snapshot;
    }

    /**
     * Restore expanded states from a snapshot produced by snapshotExpandedState().
     * Must be called after all rows have been re-added.
     */
    restoreExpandedState(snapshot) {
        if (!snapshot) return;
        this.rows.forEach(row => {
            if (row.kind === 'group' && snapshot.has(row.id)) {
                row.expanded = snapshot.get(row.id);
            }
        });
        this._render();
    }

    // =========================================================================
    // PUBLIC API — MILESTONE RENDERING
    // =========================================================================

    setMilestoneRendering(spec) {
        this.renderingSpec = spec;
    }

    // =========================================================================
    // PUBLIC API — ROW MANAGEMENT
    // =========================================================================

    addGroupRow(id, label, milestones = [], parentId = null, aggregate = false) {
        const key = String(id);
        const existing = this.rows.get(key);
        // Default expanded state: level 1 (no parent) starts collapsed; level 2 starts expanded.
        // Existing state always wins (preserves user interaction across re-renders).
        const defaultExpanded = parentId ? true : false;
        this.rows.set(key, {
            id: key, kind: 'group', label: label || '',
            milestones: milestones.map(m => this._normaliseMilestone(m)),
            expanded: existing?.expanded ?? defaultExpanded,
            parentId: parentId ? String(parentId) : null,
            aggregate
        });
        this._render();
    }

    addChildRow(id, parentId, label, milestones = []) {
        this.rows.set(String(id), {
            id: String(id), kind: 'child', label: label || '',
            milestones: milestones.map(m => this._normaliseMilestone(m)),
            parentId: String(parentId)
        });
        this._render();
    }

    /**
     * Add a flat row (no hierarchy).
     * @param {string|number} id
     * @param {string}        label
     * @param {Array}         milestones
     */
    addRow(id, label, milestones = [], parentId = null) {
        this.rows.set(String(id), {
            id: String(id), kind: 'timeline', label: label || '',
            milestones: milestones.map(m => this._normaliseMilestone(m)),
            parentId: parentId ? String(parentId) : null
        });
        this._render();
    }

    /**
     * Replace milestones for any existing row.
     * @param {string|number} id
     * @param {Array}         milestones
     */
    updateRow(id, milestones = []) {
        const row = this.rows.get(String(id));
        if (!row) return;
        row.milestones = milestones.map(m => this._normaliseMilestone(m));
        this._render();
    }

    removeRow(id) {
        const key = String(id);
        this.rows.delete(key);
        if (this.selectedId === key) this.selectedId = null;
        this._render();
    }

    clearRows() {
        this.rows.clear();
        this.selectedId = null;
        this._render();
    }

    // =========================================================================
    // PUBLIC API — SELECTION
    // =========================================================================

    addSelectionListener(fn) {
        if (typeof fn === 'function') this.selectionListeners.push(fn);
    }

    setTimeLineSelected(id, selected) {
        const key = String(id);
        this.selectedId = selected ? key : (this.selectedId === key ? null : this.selectedId);
        this._updateSelectionUI();
    }

    getSelectedTimeLine() {
        return this.selectedId;
    }

    // =========================================================================
    // PUBLIC API — LIFECYCLE
    // =========================================================================

    render(container) {
        this.container = container;
        this._render();
    }

    cleanup() {
        this.container = null;
        this.rows.clear();
        this.selectionListeners = [];
        this.timeIntervalListeners = [];
        this.selectedId = null;
        this.ticks = [];
        this.renderingSpec = null;
    }

    // =========================================================================
    // INTERNAL — FULL RENDER
    // =========================================================================

    _render() {
        if (!this.container) return;

        if (this.rows.size === 0) {
            this._renderEmpty();
            return;
        }

        const visibleTicks = this._getVisibleTicks();

        this.container.innerHTML = `
            <div class="temporal-grid" style="--temporal-label-width: ${this.labelWidth}px">
                <div class="temporal-zoom-bar">
                    ${this._renderZoomControl()}
                </div>
                <div class="temporal-grid-inner">
                    <div class="temporal-header">
                        ${this._renderHeader(visibleTicks)}
                    </div>
                    <div class="temporal-body" id="temporalBody">
                        ${this._renderAllRows(visibleTicks)}
                    </div>
                    <div class="temporal-resize-handle" id="temporalResizeHandle" title="Drag to resize"></div>
                </div>
            </div>
        `;

        this._bindEvents();
        this._updateSelectionUI();
    }

    /**
     * Walk ancestors of a row upward; return false if any ancestor is collapsed.
     */
    _isRowVisible(row) {
        let current = row;
        while (current.parentId) {
            const parent = this.rows.get(current.parentId);
            if (!parent) break;
            if (!parent.expanded) return false;
            current = parent;
        }
        return true;
    }

    /**
     * Compute depth of a row (0 = top-level, 1 = one parent, 2 = two parents).
     */
    _rowDepth(row) {
        let depth = 0;
        let current = row;
        while (current.parentId) {
            const parent = this.rows.get(current.parentId);
            if (!parent) break;
            depth++;
            current = parent;
        }
        return depth;
    }

    /**
     * For a given row, collect the ordered list of sibling rows that share the
     * same parent (or are all top-level), used to determine last-child status
     * for tree-line rendering.
     */
    _siblingsOf(row) {
        return [...this.rows.values()].filter(r => {
            if (r.kind === 'group' && !r.parentId) {
                // top-level groups: siblings of each other
                return !row.parentId && r.kind === 'group';
            }
            return r.parentId === row.parentId;
        });
    }

    /**
     * Build tree-line prefix HTML for a row.
     * Uses box-drawing characters rendered in a fixed-width label prefix area.
     *
     * depth 0 (DrG group)    : no prefix
     * depth 1 (folder/ON)    : └─ or ├─ depending on last-child
     * depth 2 (child/leaf ON): │  └─ or │  ├─
     */
    _renderTreePrefix(row, depth) {
        if (depth === 0) return '';

        const siblings = this._siblingsOf(row);
        // Only count visible siblings (don't count hidden kinds that won't render)
        const visibleSiblings = siblings.filter(s => this._isRowVisible(s));
        const isLast = visibleSiblings.length === 0 ||
            visibleSiblings[visibleSiblings.length - 1]?.id === row.id;

        if (depth === 1) {
            const elbow = isLast ? '└' : '├';
            return `<span class="temporal-tree-prefix temporal-tree-d1"
                         aria-hidden="true">${elbow}─</span>`;
        }

        // depth 2: need to know if the parent is last among its siblings too
        const parent = row.parentId ? this.rows.get(row.parentId) : null;
        let parentIsLast = true;
        if (parent) {
            const parentSiblings = this._siblingsOf(parent)
                .filter(s => this._isRowVisible(s));
            parentIsLast = parentSiblings.length === 0 ||
                parentSiblings[parentSiblings.length - 1]?.id === parent.id;
        }
        const parentPipe = parentIsLast ? ' ' : '│';
        const elbow = isLast ? '└' : '├';
        return `<span class="temporal-tree-prefix temporal-tree-d2"
                     aria-hidden="true">${parentPipe} ${elbow}─</span>`;
    }

    _renderAllRows(visibleTicks) {
        const html = [];
        for (const row of this.rows.values()) {
            if (!this._isRowVisible(row)) continue;
            html.push(this._renderRowHtml(row, visibleTicks));
        }
        return html.join('');
    }

    // =========================================================================
    // INTERNAL — ROW RENDERING
    // =========================================================================

    _renderRowHtml(row, visibleTicks) {
        switch (row.kind) {
            case 'group':    return this._renderGroupRowHtml(row, visibleTicks);
            case 'child':    return this._renderChildRowHtml(row, visibleTicks);
            case 'timeline': return this._renderTimelineRowHtml(row, visibleTicks);
            default:         return '';
        }
    }

    _renderGroupRowHtml(row, visibleTicks) {
        const isSelected = this.selectedId === row.id;
        const toggleIcon = row.expanded ? '▼' : '▶';
        const depth = this._rowDepth(row);
        const levelClass = depth === 0 ? 'temporal-group-row--top' : 'temporal-group-row--nested';
        const aggregateClass = row.aggregate ? 'temporal-group-row--aggregate' : '';
        const treePrefix = this._renderTreePrefix(row, depth);
        return `
            <div class="temporal-row temporal-group-row ${levelClass} ${aggregateClass} ${isSelected ? 'temporal-row--selected' : ''}"
                 data-row-id="${this._escapeAttr(row.id)}" data-kind="group" data-depth="${depth}"
                 ${row.parentId ? `data-parent-id="${this._escapeAttr(row.parentId)}"` : ''}>
                <div class="temporal-row-label temporal-group-label">
                    ${treePrefix}
                    <span class="temporal-toggle-icon" data-toggle-id="${this._escapeAttr(row.id)}">${toggleIcon}</span>
                    <span class="temporal-label-text"
                          title="${this._escapeAttr(row.label)}">${this._escapeHtml(row.label)}</span>
                </div>
                <div class="temporal-row-track">
                    <div class="temporal-row-baseline"></div>
                    ${this._renderConnectors(row.milestones, visibleTicks)}
                    ${this._renderMilestones(row.milestones, visibleTicks)}
                </div>
            </div>
        `;
    }

    _renderChildRowHtml(row, visibleTicks) {
        const isSelected = this.selectedId === row.id;
        const depth = this._rowDepth(row);
        const treePrefix = this._renderTreePrefix(row, depth);
        return `
            <div class="temporal-row temporal-child-row ${isSelected ? 'temporal-row--selected' : ''}"
                 data-row-id="${this._escapeAttr(row.id)}" data-kind="child" data-depth="${depth}"
                 data-parent-id="${this._escapeAttr(row.parentId)}">
                <div class="temporal-row-label temporal-child-label">
                    ${treePrefix}
                    <span class="temporal-toggle-spacer" aria-hidden="true"></span>
                    <span class="temporal-label-text"
                          title="${this._escapeAttr(row.label)}">${this._escapeHtml(row.label)}</span>
                </div>
                <div class="temporal-row-track">
                    <div class="temporal-row-baseline"></div>
                    ${this._renderConnectors(row.milestones, visibleTicks)}
                    ${this._renderMilestones(row.milestones, visibleTicks)}
                </div>
            </div>
        `;
    }

    _renderTimelineRowHtml(row, visibleTicks) {
        const isSelected = this.selectedId === row.id;
        const depth = this._rowDepth(row);
        const treePrefix = depth > 0 ? this._renderTreePrefix(row, depth) : '';
        return `
            <div class="temporal-row ${isSelected ? 'temporal-row--selected' : ''}"
                 data-row-id="${this._escapeAttr(row.id)}" data-kind="timeline" data-depth="${depth}">
                <div class="temporal-row-label">
                    ${treePrefix}
                    <span class="temporal-toggle-spacer" aria-hidden="true"></span>
                    <span class="temporal-label-text"
                          title="${this._escapeAttr(row.label)}">${this._escapeHtml(row.label)}</span>
                </div>
                <div class="temporal-row-track">
                    <div class="temporal-row-baseline"></div>
                    ${this._renderConnectors(row.milestones, visibleTicks)}
                    ${this._renderMilestones(row.milestones, visibleTicks)}
                </div>
            </div>
        `;
    }

    // =========================================================================
    // INTERNAL — ZOOM CONTROL
    // =========================================================================

    _renderZoomControl() {
        const current = this.startYear === this.endYear
            ? String(this.startYear)
            : `${this.startYear}-${this.endYear}`;
        return `
            <div class="temporal-zoom-control">
                <label class="temporal-zoom-label">Period:</label>
                <input type="text" class="temporal-zoom-input form-control"
                    id="temporalZoomInput" value="${current}"
                    placeholder="YYYY or YYYY-ZZZZ"
                    title="Enter a year (e.g. 2027) or range (e.g. 2026-2031)"/>
                <span class="temporal-zoom-hint">${this.minYear}–${this.maxYear}</span>
            </div>
            <div class="temporal-expansion-controls">
                <button class="temporal-expand-btn" data-expand="all"   title="Expand all groups">⊞ Expand all</button>
                <button class="temporal-expand-btn" data-collapse="all" title="Collapse all groups">⊟ Collapse all</button>
            </div>
        `;
    }

    _bindZoomEvents() {
        if (!this.container) return;
        const input = this.container.querySelector('#temporalZoomInput');
        if (input) {
            input.addEventListener('change', () => {
                const parsed = this._parseYearPeriod(input.value.trim());
                if (parsed) {
                    this.setTimeInterval(parsed.startYear, parsed.endYear);
                } else {
                    input.value = this.startYear === this.endYear
                        ? String(this.startYear)
                        : `${this.startYear}-${this.endYear}`;
                }
            });
        }

        this.container.querySelectorAll('.temporal-expand-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.expand === 'all')   this.expandAll();
                else if (btn.dataset.collapse === 'all') this.collapseAll();
            });
        });
    }

    _parseYearPeriod(str) {
        if (!str) return null;
        const single = str.match(/^(\d{4})$/);
        if (single) {
            const y = parseInt(single[1], 10);
            if (y >= this.minYear && y <= this.maxYear) return { startYear: y, endYear: y };
        }
        const range = str.match(/^(\d{4})-(\d{4})$/);
        if (range) {
            const s = parseInt(range[1], 10);
            const e = parseInt(range[2], 10);
            if (s <= e && s >= this.minYear && e <= this.maxYear) return { startYear: s, endYear: e };
        }
        return null;
    }

    // =========================================================================
    // INTERNAL — HEADER
    // =========================================================================

    _renderHeader(visibleTicks) {
        return `
            <div class="temporal-header-row">
                <div class="temporal-row-label-header"></div>
                <div class="temporal-axis">
                    ${visibleTicks.map(tick => `
                        <div class="temporal-tick-header"
                             style="left: ${this._datePosition(tick.date, visibleTicks)}%"
                             title="${this._escapeAttr(tick.date.toLocaleDateString('en-GB'))}">
                            <div class="temporal-tick-label">${this._escapeHtml(tick.label)}</div>
                            <div class="temporal-tick-line"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // =========================================================================
    // INTERNAL — MILESTONE RENDERING
    // =========================================================================

    _renderMilestones(milestones, visibleTicks) {
        if (!milestones || milestones.length === 0) return '';
        if (!this.renderingSpec) return '';
        return milestones
            .filter(m => this._isDateVisible(m.date))
            .map(m => {
                const pos = this._datePosition(m.date, visibleTicks);
                if (pos === null) return '';
                const markerHtml = this.renderingSpec.mode === 'pixmap'
                    ? this._renderPixmap(m) : this._renderIcon(m);
                const tooltip = [m.label, m.description].filter(Boolean).join(' — ');
                return `<div class="temporal-milestone" style="left: ${pos}%"
                             title="${this._escapeAttr(tooltip)}">${markerHtml}</div>`;
            })
            .join('');
    }

    _renderIcon(milestone) {
        const spec = this.renderingSpec;
        for (const eventType of (milestone.eventTypes || [])) {
            const def = spec.eventTypes?.[eventType];
            if (def) {
                return `<span class="temporal-milestone-icon"
                              style="color: ${this._escapeAttr(def.colour || '#6b7280')}">
                            ${this._escapeHtml(def.icon || '●')}
                        </span>`;
            }
        }
        return `<span class="temporal-milestone-icon" style="color:#6b7280">●</span>`;
    }

    _renderPixmap(milestone) {
        const spec = this.renderingSpec;
        const rows = spec.rows || 1;
        const cols = spec.cols || 1;
        const matrix = Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => ({ colour: '#e5e7eb', active: false }))
        );
        for (const eventType of (milestone.eventTypes || [])) {
            const def = spec.eventTypes?.[eventType];
            if (def && def.row < rows && def.col < cols) {
                matrix[def.row][def.col] = { colour: def.colour || '#6b7280', active: true };
            }
        }
        const cellsHtml = matrix.map(row =>
            row.map(cell => `
                <div class="temporal-pixmap-cell ${cell.active ? 'temporal-pixmap-cell--active' : ''}"
                     style="${cell.active ? `background-color: ${this._escapeAttr(cell.colour)}` : ''}"></div>
            `).join('')
        ).join('');
        return `<div class="temporal-pixmap"
                     style="grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr);">
                    ${cellsHtml}
                </div>`;
    }

    // =========================================================================
    // INTERNAL — CONNECTOR LINES
    // =========================================================================

    _renderConnectors(milestones, visibleTicks) {
        if (!milestones || milestones.length < 2) return '';
        const visible = milestones.filter(m => this._isDateVisible(m.date)).sort((a, b) => a.date - b.date);
        if (visible.length < 2) return '';
        const connectors = [];
        for (let i = 0; i < visible.length - 1; i++) {
            const posA = this._datePosition(visible[i].date, visibleTicks);
            const posB = this._datePosition(visible[i + 1].date, visibleTicks);
            if (posA === null || posB === null) continue;
            connectors.push(`<div class="temporal-connector"
                                  style="left: ${posA}%; width: ${posB - posA}%"></div>`);
        }
        return connectors.join('');
    }

    // =========================================================================
    // INTERNAL — EMPTY STATE
    // =========================================================================

    _renderEmpty() {
        this.container.innerHTML = `
            <div class="temporal-empty-state">
                <div class="temporal-empty-icon">📅</div>
                <h3>No Data to Display</h3>
                <p>No timeline rows have been added.</p>
            </div>
        `;
    }

    // =========================================================================
    // INTERNAL — EVENT BINDING
    // =========================================================================

    _bindEvents() {
        if (!this.container) return;
        this._bindZoomEvents();
        this._bindResizeHandle();

        const body = this.container.querySelector('#temporalBody');
        if (!body) return;

        body.querySelectorAll('.temporal-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.temporal-toggle-icon')) return;
                const id = row.dataset.rowId;
                if (id) this._handleRowClick(id);
            });
        });

        body.querySelectorAll('.temporal-toggle-icon').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this._toggleGroup(toggle.dataset.toggleId);
            });
        });
    }

    _bindResizeHandle() {
        const handle = this.container.querySelector('#temporalResizeHandle');
        if (!handle) return;

        let startX = 0;
        let startWidth = 0;

        const onMouseMove = (e) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(80, Math.min(500, startWidth + delta));
            this.labelWidth = newWidth;
            // Update CSS variable live without full re-render
            const grid = this.container.querySelector('.temporal-grid');
            if (grid) grid.style.setProperty('--temporal-label-width', `${newWidth}px`);
            handle.style.left = `${newWidth}px`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startWidth = this.labelWidth;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    _handleRowClick(id) {
        this.selectedId = id;
        this._updateSelectionUI();
        this.selectionListeners.forEach(fn => fn(id));
    }

    _toggleGroup(id) {
        const row = this.rows.get(String(id));
        if (!row || row.kind !== 'group') return;
        const body = this.container?.querySelector('#temporalBody');
        const scrollTop = body ? body.scrollTop : 0;
        const expanding = !row.expanded;
        row.expanded = expanding;
        // When expanding, collapse direct child groups so only immediate children appear
        if (expanding) {
            this.rows.forEach(r => {
                if (r.kind === 'group' && r.parentId === row.id) {
                    r.expanded = false;
                }
            });
        }
        this._render();
        const newBody = this.container?.querySelector('#temporalBody');
        if (newBody) newBody.scrollTop = scrollTop;
    }

    // =========================================================================
    // INTERNAL — SELECTION UI
    // =========================================================================

    _updateSelectionUI() {
        if (!this.container) return;
        this.container.querySelectorAll('.temporal-row').forEach(row => {
            row.classList.toggle('temporal-row--selected', row.dataset.rowId === this.selectedId);
        });
    }

    // =========================================================================
    // INTERNAL — GEOMETRY
    // =========================================================================

    _getVisibleTicks() {
        const start = new Date(this.startYear, 0, 1);
        const end   = new Date(this.endYear + 1, 0, 1);
        return this.ticks.filter(t => t.date >= start && t.date < end);
    }

    _isDateVisible(date) {
        if (!(date instanceof Date)) return false;
        const start = new Date(this.startYear, 0, 1);
        const end   = new Date(this.endYear + 1, 0, 1);
        return date >= start && date < end;
    }

    _datePosition(date, visibleTicks) {
        if (!(date instanceof Date)) return null;
        const intervalStart = new Date(this.startYear, 0, 1).getTime();
        const intervalEnd   = new Date(this.endYear + 1, 0, 1).getTime();
        const span = intervalEnd - intervalStart;
        if (span === 0) return null;
        const padding = 5;
        const usable  = 100 - padding * 2;
        return padding + ((date.getTime() - intervalStart) / span) * usable;
    }

    // =========================================================================
    // INTERNAL — UTILITIES
    // =========================================================================

    _normaliseMilestone(m) {
        return {
            label:      m.label       || '',
            description: m.description || '',
            eventTypes: Array.isArray(m.eventTypes) ? m.eventTypes : [],
            date:       m.date instanceof Date ? m.date : new Date(m.date)
        };
    }

    _escapeHtml(str) {
        if (str == null) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    _escapeAttr(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}