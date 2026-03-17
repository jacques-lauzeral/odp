/**
 * TemporalGrid - Generic calendar-based temporal visualisation component.
 *
 * Row hierarchy:
 *   separator  — full-width label, no timeline track, visual section header
 *   group      — label + timeline track + expand/collapse toggle
 *   child      — indented label + timeline track, visibility controlled by parent
 *   timeline   — flat label + timeline track (no hierarchy)
 *
 * Public API
 * ----------
 * setTimeInterval(startYear, endYear)
 * setTicks(ticks)
 * setMilestoneRendering(spec)
 * addSeparatorRow(id, label)
 * addGroupRow(id, label, milestones)
 * addChildRow(id, parentId, label, milestones)
 * addTimeLine(id, label, milestones)
 * updateTimeLine(id, milestones)
 * removeRow(id)
 * clearRows()
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
    // PUBLIC API — MILESTONE RENDERING
    // =========================================================================

    setMilestoneRendering(spec) {
        this.renderingSpec = spec;
    }

    // =========================================================================
    // PUBLIC API — ROW MANAGEMENT
    // =========================================================================

    addSeparatorRow(id, label) {
        const key = String(id);
        const existing = this.rows.get(key);
        this.rows.set(key, {
            id: key, kind: 'separator', label: label || '', milestones: [],
            expanded: existing?.expanded ?? true
        });
        this._render();
    }

    addGroupRow(id, label, milestones = []) {
        const key = String(id);
        const existing = this.rows.get(key);
        this.rows.set(key, {
            id: key, kind: 'group', label: label || '',
            milestones: milestones.map(m => this._normaliseMilestone(m)),
            expanded: existing?.expanded ?? true
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
    addRow(id, label, milestones = []) {
        this.rows.set(String(id), {
            id: String(id), kind: 'timeline', label: label || '',
            milestones: milestones.map(m => this._normaliseMilestone(m))
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
            <div class="temporal-grid">
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
                </div>
            </div>
        `;

        this._bindEvents();
        this._updateSelectionUI();
    }

    _renderAllRows(visibleTicks) {
        const html = [];
        let currentSeparatorExpanded = true; // true until a collapsed separator is encountered

        for (const row of this.rows.values()) {
            if (row.kind === 'separator') {
                currentSeparatorExpanded = row.expanded;
                html.push(this._renderRowHtml(row, visibleTicks));
                continue;
            }

            // Skip all non-separator rows when their owning separator is collapsed
            if (!currentSeparatorExpanded) continue;

            // Skip child rows when their parent group is collapsed
            if (row.kind === 'child') {
                const parent = this.rows.get(row.parentId);
                if (parent && !parent.expanded) continue;
            }

            html.push(this._renderRowHtml(row, visibleTicks));
        }
        return html.join('');
    }

    // =========================================================================
    // INTERNAL — ROW RENDERING
    // =========================================================================

    _renderRowHtml(row, visibleTicks) {
        switch (row.kind) {
            case 'separator': return this._renderSeparatorRowHtml(row);
            case 'group':     return this._renderGroupRowHtml(row, visibleTicks);
            case 'child':     return this._renderChildRowHtml(row, visibleTicks);
            case 'timeline':  return this._renderTimelineRowHtml(row, visibleTicks);
            default:          return '';
        }
    }

    _renderSeparatorRowHtml(row) {
        const toggleIcon = row.expanded ? '▼' : '▶';
        return `
            <div class="temporal-separator-row" data-row-id="${this._escapeAttr(row.id)}">
                <span class="temporal-toggle-icon" data-toggle-id="${this._escapeAttr(row.id)}">${toggleIcon}</span>
                <span class="temporal-separator-label">${this._escapeHtml(row.label)}</span>
            </div>
        `;
    }

    _renderGroupRowHtml(row, visibleTicks) {
        const isSelected = this.selectedId === row.id;
        const toggleIcon = row.expanded ? '▼' : '▶';
        return `
            <div class="temporal-row temporal-group-row ${isSelected ? 'temporal-row--selected' : ''}"
                 data-row-id="${this._escapeAttr(row.id)}" data-kind="group">
                <div class="temporal-row-label temporal-group-label">
                    <span class="temporal-toggle-icon" data-toggle-id="${this._escapeAttr(row.id)}">${toggleIcon}</span>
                    <span class="temporal-label-text">${this._escapeHtml(row.label)}</span>
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
        return `
            <div class="temporal-row temporal-child-row ${isSelected ? 'temporal-row--selected' : ''}"
                 data-row-id="${this._escapeAttr(row.id)}" data-kind="child"
                 data-parent-id="${this._escapeAttr(row.parentId)}">
                <div class="temporal-row-label temporal-child-label">
                    <span class="temporal-label-text">${this._escapeHtml(row.label)}</span>
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
        return `
            <div class="temporal-row ${isSelected ? 'temporal-row--selected' : ''}"
                 data-row-id="${this._escapeAttr(row.id)}" data-kind="timeline">
                <div class="temporal-row-label">
                    <span class="temporal-label-text">${this._escapeHtml(row.label)}</span>
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
        `;
    }

    _bindZoomEvents() {
        if (!this.container) return;
        const input = this.container.querySelector('#temporalZoomInput');
        if (!input) return;
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
                             style="left: ${this._datePosition(tick.date, visibleTicks)}%">
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

    _handleRowClick(id) {
        this.selectedId = id;
        this._updateSelectionUI();
        this.selectionListeners.forEach(fn => fn(id));
    }

    _toggleGroup(id) {
        const row = this.rows.get(String(id));
        if (!row || (row.kind !== 'group' && row.kind !== 'separator')) return;
        const body = this.container?.querySelector('#temporalBody');
        const scrollTop = body ? body.scrollTop : 0;
        row.expanded = !row.expanded;
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