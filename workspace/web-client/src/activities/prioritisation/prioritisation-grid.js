/**
 * prioritisation-grid.js
 *
 * PrioritisationGrid — Kanban-style (wave × DrG) planning board.
 *
 * Layout:
 *   Columns  = DrGs (left to right) + "Global" total column (rightmost)
 *   Rows     = waves ordered bottom=nearest, top=furthest
 *              + Backlog row pinned at the very bottom
 *   Each row is individually collapsible.
 *
 * OC cards:
 *   Height proportional to cost (logarithmic scale via cardHeight()).
 *   Drag-and-drop between wave rows within the same DrG column.
 *   Dragging from/to backlog assigns/removes OPS_DEPLOYMENT milestone.
 *
 * Load indicator bar:
 *   Horizontal bar at bottom of each cell.
 *   Fill ratio = consumed / available. Colour: green / orange / red / empty.
 *   In collapsed row: bar IS the row content.
 *
 * Constructor options:
 * {
 *   waves:     Wave[]
 *   drgs:      string[]          ordered DrG enum values
 *   matrix:    AggregationMatrix from buildMatrix()
 *   allOcs:    OC[]
 *   onShiftOC: (oc, targetWaveId | null) => void   null = move to backlog
 *   onOpenOC:  (oc) => void
 * }
 *
 * Public API:
 *   render(container)
 *   update({ waves, matrix, allOcs })
 *   cleanup()
 */
import { getDraftingGroupDisplay, idsEqual } from '/shared/src/index.js';
import {
    classifyLoad,
    cardHeight,
    checkDependencyViolations
} from '../../shared/src/model/bandwidth-aggregation.js';

const BACKLOG_ROW_ID = '__backlog__';

export default class PrioritisationGrid {
    constructor(options) {
        this.waves     = options.waves     || [];
        this.drgs      = options.drgs      || [];
        this.matrix    = options.matrix;
        this.allOcs    = options.allOcs    || [];
        this.onShiftOC = options.onShiftOC || (() => {});
        this.onOpenOC  = options.onOpenOC  || (() => {});

        this.container   = null;
        this._collapsed  = new Set();   // Set of waveId | BACKLOG_ROW_ID
        this._dragState  = null;        // { oc, sourceWaveId }

        this._onDragStart  = this._onDragStart.bind(this);
        this._onDragOver   = this._onDragOver.bind(this);
        this._onDragLeave  = this._onDragLeave.bind(this);
        this._onDrop       = this._onDrop.bind(this);
        this._onDragEnd    = this._onDragEnd.bind(this);
    }

    // =========================================================================
    // PUBLIC
    // =========================================================================

    render(container) {
        this.container = container;
        this._draw();
    }

    update({ waves, matrix, allOcs }) {
        if (waves)  this.waves  = waves;
        if (matrix) this.matrix = matrix;
        if (allOcs) this.allOcs = allOcs;
        this._draw();
    }

    cleanup() {
        this.container = null;
    }

    // =========================================================================
    // DRAW
    // =========================================================================

    _draw() {
        if (!this.container) return;

        // Waves ordered: furthest at top (index 0), nearest at bottom (last)
        const orderedWaves = this._sortedWaves();

        this.container.innerHTML = `
            <div class="prio-board">
                ${this._renderColumnHeaders()}
                <div class="prio-board__wave-rows">
                    ${orderedWaves.map(w => this._renderWaveRow(w)).join('')}
                </div>
                ${this._renderBacklogRow()}
            </div>
        `;

        this._bindEvents();
    }

    // =========================================================================
    // COLUMN HEADERS
    // =========================================================================

    _renderColumnHeaders() {
        const drgHeaders = this.drgs.map(drg => `
            <div class="prio-col-header" data-drg="${drg}">
                ${_esc(getDraftingGroupDisplay(drg) || drg)}
            </div>
        `).join('');

        return `
            <div class="prio-board__col-headers">
                <div class="prio-col-header prio-col-header--label"></div>
                ${drgHeaders}
                <div class="prio-col-header prio-col-header--global">Global</div>
            </div>
        `;
    }

    // =========================================================================
    // WAVE ROW
    // =========================================================================

    _renderWaveRow(wave) {
        const collapsed  = this._collapsed.has(wave.id);
        const waveLabel  = `${wave.year}#${wave.sequenceNumber}`;
        const waveGlobal = this.matrix.waveGlobal.get(String(wave.id))
            || { consumed: 0, available: 0, ocs: [] };

        return `
            <div class="prio-row ${collapsed ? 'prio-row--collapsed' : ''}"
                 data-wave-id="${wave.id}">

                <!-- Row label -->
                <div class="prio-row__label">
                    <button class="prio-row__toggle"
                            data-toggle-wave="${wave.id}"
                            title="${collapsed ? 'Expand' : 'Collapse'}">
                        ${collapsed ? '▶' : '▼'}
                    </button>
                    <span class="prio-row__wave-label">${waveLabel}</span>
                </div>

                <!-- DrG cells -->
                ${this.drgs.map(drg => this._renderCell(wave.id, drg)).join('')}

                <!-- Global total cell -->
                ${this._renderGlobalCell(wave.id, waveGlobal)}
            </div>
        `;
    }

    _renderCell(waveId, drg) {
        const waveMap  = this.matrix.cells.get(String(waveId));
        const cellData = waveMap?.get(drg) || { consumed: 0, available: 0, ocs: [] };
        const load     = classifyLoad(cellData.consumed, cellData.available);
        const ratio    = cellData.available > 0
            ? Math.min(1, cellData.consumed / cellData.available)
            : (cellData.consumed > 0 ? 1 : 0);

        const cards = cellData.ocs.map(oc => this._renderCard(oc, waveId)).join('');

        return `
            <div class="prio-cell"
                 data-wave-id="${waveId}"
                 data-drg="${drg}"
                 data-drop-target="true">
                <div class="prio-cell__cards">${cards}</div>
                ${this._renderLoadBar(ratio, load, cellData.consumed, cellData.available)}
            </div>
        `;
    }

    _renderGlobalCell(waveId, cellData) {
        const load  = classifyLoad(cellData.consumed, cellData.available);
        const ratio = cellData.available > 0
            ? Math.min(1, cellData.consumed / cellData.available)
            : (cellData.consumed > 0 ? 1 : 0);
        return `
            <div class="prio-cell prio-cell--global">
                <div class="prio-cell__summary">
                    <span class="prio-cell__mw">${cellData.consumed} / ${cellData.available} MW</span>
                </div>
                ${this._renderLoadBar(ratio, load, cellData.consumed, cellData.available)}
            </div>
        `;
    }

    // =========================================================================
    // BACKLOG ROW
    // =========================================================================

    _renderBacklogRow() {
        const collapsed = this._collapsed.has(BACKLOG_ROW_ID);
        const unplanned = this.matrix.unplanned;

        // Group unplanned OCs by DrG
        const byDrg = new Map();
        for (const oc of unplanned) {
            const drg = oc.drg || '__none__';
            if (!byDrg.has(drg)) byDrg.set(drg, []);
            byDrg.get(drg).push(oc);
        }

        const cells = this.drgs.map(drg => {
            const ocs   = byDrg.get(drg) || [];
            const cards = ocs.map(oc => this._renderCard(oc, null)).join('');
            return `
                <div class="prio-cell prio-cell--backlog"
                     data-wave-id="${BACKLOG_ROW_ID}"
                     data-drg="${drg}"
                     data-drop-target="true">
                    <div class="prio-cell__cards">${cards}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="prio-row prio-row--backlog ${collapsed ? 'prio-row--collapsed' : ''}"
                 data-wave-id="${BACKLOG_ROW_ID}">
                <div class="prio-row__label">
                    <button class="prio-row__toggle"
                            data-toggle-wave="${BACKLOG_ROW_ID}"
                            title="${collapsed ? 'Expand' : 'Collapse'}">
                        ${collapsed ? '▶' : '▼'}
                    </button>
                    <span class="prio-row__wave-label">
                        Backlog
                        <span class="prio-row__backlog-count">${unplanned.length}</span>
                    </span>
                </div>
                ${cells}
                <div class="prio-cell prio-cell--global prio-cell--backlog">
                    <span class="prio-cell__mw">${unplanned.length} OC${unplanned.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
        `;
    }

    // =========================================================================
    // OC CARD
    // =========================================================================

    _renderCard(oc, waveId) {
        const height  = cardHeight(oc.cost ?? 0);
        const maturity = (oc.maturity || '').toLowerCase();
        const costLabel = oc.cost != null ? `${oc.cost} MW` : '— MW';
        const hasDeps = Array.isArray(oc.dependencies) && oc.dependencies.length > 0;

        return `
            <div class="prio-card prio-card--${maturity}"
                 style="height: ${height}rem"
                 draggable="true"
                 data-oc-id="${oc.itemId}"
                 data-oc-wave="${waveId || ''}"
                 data-oc-drg="${oc.drg || ''}"
                 title="${_esc(oc.title || oc.itemId)}">
                <div class="prio-card__inner">
                    <span class="prio-card__title">${_esc(oc.title || oc.itemId)}</span>
                    <span class="prio-card__cost">${costLabel}</span>
                    ${hasDeps ? '<span class="prio-card__deps-icon" title="Has dependencies">⛓</span>' : ''}
                </div>
                <button class="prio-card__open"
                        data-open-oc="${oc.itemId}"
                        title="Open OC detail">↗</button>
            </div>
        `;
    }

    // =========================================================================
    // LOAD BAR
    // =========================================================================

    _renderLoadBar(ratio, load, consumed, available) {
        const pct     = Math.round(ratio * 100);
        const tooltip = available > 0
            ? `${consumed} / ${available} MW (${pct}%)`
            : consumed > 0 ? `${consumed} MW (no bandwidth defined)` : 'No load';

        return `
            <div class="prio-load-bar" title="${tooltip}">
                <div class="prio-load-bar__fill prio-load-bar__fill--${load}"
                     style="width: ${pct}%"></div>
            </div>
        `;
    }

    // =========================================================================
    // EVENTS
    // =========================================================================

    _bindEvents() {
        if (!this.container) return;

        // Row toggle (collapse/expand)
        this.container.querySelectorAll('[data-toggle-wave]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const waveId = btn.dataset.toggleWave;
                if (this._collapsed.has(waveId)) {
                    this._collapsed.delete(waveId);
                } else {
                    this._collapsed.add(waveId);
                }
                this._draw();
            });
        });

        // Open OC detail
        this.container.querySelectorAll('[data-open-oc]').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const ocId = btn.dataset.openOc;
                const oc   = this.allOcs.find(o => idsEqual(o.itemId, ocId));
                if (oc) this.onOpenOC(oc);
            });
        });

        // Drag-and-drop
        this.container.querySelectorAll('[draggable="true"]').forEach(card => {
            card.addEventListener('dragstart', this._onDragStart);
            card.addEventListener('dragend',   this._onDragEnd);
        });

        this.container.querySelectorAll('[data-drop-target="true"]').forEach(cell => {
            cell.addEventListener('dragover',  this._onDragOver);
            cell.addEventListener('dragleave', this._onDragLeave);
            cell.addEventListener('drop',      this._onDrop);
        });
    }

    // =========================================================================
    // DRAG AND DROP
    // =========================================================================

    _onDragStart(e) {
        const card   = e.currentTarget;
        const ocId   = card.dataset.ocId;
        const waveId = card.dataset.ocWave || null;
        const oc     = this.allOcs.find(o => idsEqual(o.itemId, ocId));
        if (!oc) return;

        this._dragState = { oc, sourceWaveId: waveId || null };
        card.classList.add('prio-card--dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ocId);
    }

    _onDragEnd(e) {
        e.currentTarget.classList.remove('prio-card--dragging');
        this.container?.querySelectorAll('.prio-cell--drag-over')
            .forEach(el => el.classList.remove('prio-cell--drag-over'));
        this._dragState = null;
    }

    _onDragOver(e) {
        if (!this._dragState) return;
        const cell  = e.currentTarget;
        const cellDrg    = cell.dataset.drg;
        const sourceDrg  = this._dragState.oc.drg;

        // Only allow drop within same DrG column
        if (cellDrg !== sourceDrg) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('prio-cell--drag-over');
    }

    _onDragLeave(e) {
        e.currentTarget.classList.remove('prio-cell--drag-over');
    }

    _onDrop(e) {
        e.preventDefault();
        const cell = e.currentTarget;
        cell.classList.remove('prio-cell--drag-over');

        if (!this._dragState) return;

        const { oc, sourceWaveId } = this._dragState;
        const targetWaveId = cell.dataset.waveId === BACKLOG_ROW_ID
            ? null
            : cell.dataset.waveId;
        const cellDrg = cell.dataset.drg;

        // Guard: same DrG only
        if (cellDrg !== oc.drg) return;

        // No-op: dropped onto same wave
        if (targetWaveId === sourceWaveId) return;

        // Dependency check (skip if moving to backlog)
        if (targetWaveId) {
            const { violated, offenders } =
                checkDependencyViolations(oc, targetWaveId, this.allOcs, this.waves);
            if (violated) {
                this._showDependencyWarning(oc, offenders, () => {
                    this.onShiftOC(oc, targetWaveId);
                });
                return;
            }
        }

        this.onShiftOC(oc, targetWaveId);
    }

    // =========================================================================
    // DEPENDENCY WARNING
    // =========================================================================

    _showDependencyWarning(oc, offenders, onConfirm) {
        const names = offenders.map(o => _esc(o.title || o.id)).join(', ');
        const overlay = document.createElement('div');
        overlay.className = 'prio-warning-overlay';
        overlay.innerHTML = `
            <div class="prio-warning">
                <h4>Dependency Warning</h4>
                <p>
                    Shifting <strong>${_esc(oc.title || oc.id)}</strong> may violate
                    dependencies with: <strong>${names}</strong>.
                </p>
                <p>Do you want to proceed anyway?</p>
                <div class="prio-warning__actions">
                    <button class="btn btn-secondary" data-action="cancel">Cancel</button>
                    <button class="btn btn-danger"    data-action="confirm">Shift anyway</button>
                </div>
            </div>
        `;

        overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
            overlay.remove();
            onConfirm();
        });
        overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
            overlay.remove();
        });

        (this.container || document.body).appendChild(overlay);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    _sortedWaves() {
        // Sort descending by (year, sequenceNumber) so nearest wave is last (bottom)
        return [...this.waves].sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return b.sequenceNumber - a.sequenceNumber;
        });
    }
}

function _esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}