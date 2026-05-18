/**
 * @file changes.js
 * @description Operational Changes list component. Supports Collection and Temporal
 * perspectives. Owned and orchestrated by os.js — no back-references to
 * app.currentActivity.
 *
 * Injected callbacks (required):
 *   onItemSelect(item)      — called when user selects a row; os.js navigates to detail page
 *   getViewControlsEl()     — returns the HTMLElement where view controls are mounted
 *   isReadOnly              — boolean; true in Explore context (hides create button)
 */
import CollectionEntity from '../../../../components/collection-entity.js';
import ChangeForm from './change-form.js';
import TemporalGrid from '../../../../components/temporal-grid.js';
import { odpColumnTypes } from '../../../../components/odp-column-types.js';
import { getDraftingGroupDisplay } from '/shared/src/index.js';

export default class ChangesEntity {
    /**
     * @param {import('../../app.js').App} app
     * @param {{ endpoint: string }} entityConfig
     * @param {object} setupData
     * @param {object} options
     * @param {Function} options.onItemSelect      - (item) => void
     * @param {Function} options.getViewControlsEl - () => HTMLElement|null
     * @param {boolean}  options.isReadOnly        - true in Explore/review context
     */
    constructor(app, entityConfig, setupData, options = {}) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;

        // Injected callbacks — no back-references to app.currentActivity
        this._onItemSelect      = options.onItemSelect      ?? (() => {});
        this._getViewControlsEl = options.getViewControlsEl ?? (() => null);
        this._isReadOnly        = options.isReadOnly        ?? false;

        this.container          = null;
        this.currentPerspective = 'collection';
        this.data               = [];
        this.temporalGrid       = null;
        this.isActive           = false;

        this.sharedState = {
            filters:        [],
            selectedItem:   null,
            grouping:       'none',
            timeWindow:     null,
            currentTabIndex: 0
        };

        // Custom column types
        const customColumnTypes = {
            ...odpColumnTypes,
            'milestone-waves': {
                render: (value) => {
                    const waves = this.extractAllWavesFromMilestones({ milestones: value });
                    if (!waves.length) return '-';
                    return waves.map(w => w.year && w.sequenceNumber ? `${w.year}#${w.sequenceNumber}` : 'Unknown').join(', ');
                },
                filter: (value, filterValue) => {
                    if (!filterValue) return true;
                    const waves = this.extractAllWavesFromMilestones({ milestones: value });
                    return waves.some(w => w.id.toString() === filterValue.toString());
                },
                sort: (a, b) => {
                    const wa = this.extractAllWavesFromMilestones({ milestones: a });
                    const wb = this.extractAllWavesFromMilestones({ milestones: b });
                    const fa = wa[0], fb = wb[0];
                    if (!fa && !fb) return 0;
                    if (!fa) return 1;
                    if (!fb) return -1;
                    return odpColumnTypes.wave.sort(fa, fb);
                },
                getFilterOptions: (column, context) => odpColumnTypes.wave.getFilterOptions(column, context)
            }
        };

        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes:       customColumnTypes,
            context:           { setupData },
            getColumnConfig:   () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect:      (item) => this._handleItemSelect(item),
            getEmptyStateMessage: () => ({ icon: '🔄', title: 'No Changes Yet', showCreateButton: true })
        });

        this.form = new ChangeForm(entityConfig, {
            setupData,
            currentTabIndex: 0,
            onTabChange: (index) => { this.sharedState.currentTabIndex = index; }
        });
    }

    // -------------------------------------------------------------------------
    // Wave helpers
    // -------------------------------------------------------------------------

    extractAllWavesFromMilestones(item) {
        if (!item?.milestones?.length) return [];
        const waves = [];
        const seen  = new Set();
        item.milestones.forEach(m => {
            const wave = this.findMilestoneWave(m);
            if (wave && !seen.has(wave.id)) { waves.push(wave); seen.add(wave.id); }
        });
        return waves.sort((a, b) => a.year !== b.year ? a.year - b.year : (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
    }

    findMilestoneWave(milestone) {
        if (milestone.wave) return milestone.wave;
        if (milestone.waveId && this.setupData?.waves) {
            return this.setupData.waves.find(w => String(w.id) === String(milestone.waveId)) ?? null;
        }
        return null;
    }

    calculateOptimalTimeWindow() {
        if (!this.setupData?.waves?.length) return null;
        const now = new Date();
        const future = this.setupData.waves
            .map(w => ({ wave: w, date: w.implementationDate ? new Date(w.implementationDate) : new Date(w.year, 0, 1) }))
            .filter(x => x.date >= now)
            .sort((a, b) => a.date - b.date);
        if (!future.length) return null;
        return { startYear: future[0].wave.year, endYear: future[future.length - 1].wave.year };
    }

    // -------------------------------------------------------------------------
    // State management
    // -------------------------------------------------------------------------

    applySharedState(sharedState) {
        if (sharedState.selectedItem && this.collection) {
            this.collection.selectedItem = sharedState.selectedItem;
        }
        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }
        if (sharedState.currentTabIndex !== undefined && this.form) {
            this.sharedState.currentTabIndex  = sharedState.currentTabIndex;
            this.form.context.currentTabIndex = sharedState.currentTabIndex;
        }
        if (this.currentPerspective === 'temporal' && this.temporalGrid && sharedState.timeWindow?.startYear) {
            const { startYear, endYear } = sharedState.timeWindow;
            this.temporalGrid.setTimeInterval(startYear, endYear);
            this.temporalGrid.setTicks(this._buildWaveTicks(startYear, endYear));
            this._feedTemporalGrid(startYear, endYear);
        }
        if (this.currentPerspective === 'collection') {
            this.collection.renderContent();
        }
    }

    // -------------------------------------------------------------------------
    // Column / grouping configuration
    // -------------------------------------------------------------------------

    getColumnConfig() {
        return [
            { key: 'code',          label: 'Code',      width: '120px', sortable: true,  type: 'text' },
            { key: 'maturity',      label: 'Maturity',  width: '80px',  sortable: true,  type: 'text' },
            { key: 'title',         label: 'Title',     width: 'auto',  sortable: true,  type: 'text' },
            { key: 'drg',           label: 'DrG',       width: '120px', sortable: true,  type: 'drafting-group' },
            { key: 'implementedORs', label: 'Implements', width: '200px', sortable: false, type: 'entity-reference-list', maxDisplay: 8 },
            { key: 'dependencies',  label: 'Depends On', width: '200px', sortable: false, type: 'entity-reference-list', maxDisplay: 5 },
            { key: 'cost',          label: 'Cost',      width: '80px',  sortable: true,  type: 'text' },
        ];
    }

    getGroupingConfig() {
        return [
            { key: 'none',     label: 'No Grouping' },
            { key: 'maturity', label: 'Group by Maturity' },
            { key: 'drg',      label: 'Group by DrG' },
            { key: 'wave',     label: 'Group by Wave' },
        ];
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    async render(container, perspective = 'collection') {
        this.container          = container;
        this.currentPerspective = perspective;
        if (perspective === 'temporal') {
            this.renderTemporalView(this.sharedState);
        } else {
            this.collection.setData(this.data);
            await this.collection.render(container);
        }
    }

    renderViewControls() {
        const el = this._getViewControlsEl();
        if (!el) return;

        const groupingConfig = this.getGroupingConfig();

        el.innerHTML = `
            <div class="perspective-controls">
                <div class="perspective-toggle">
                    <button class="perspective-option ${this.currentPerspective === 'collection' ? 'perspective-option--active' : ''}"
                            data-perspective="collection">📋 Collection</button>
                    <button class="perspective-option ${this.currentPerspective === 'temporal' ? 'perspective-option--active' : ''}"
                            data-perspective="temporal">📅 Temporal</button>
                </div>
            </div>
            <div class="collection-actions-and-grouping">
                <div class="grouping-section">
                    <label for="groupBy">Group by:</label>
                    <select id="groupBy" class="form-control group-select">
                        ${groupingConfig.map(o => `<option value="${o.key ?? o.value}" ${(o.key ?? o.value) === this.sharedState.grouping ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                </div>
                ${!this._isReadOnly ? `
                    <div class="actions-section">
                        <button class="btn btn-primary" id="createEntity">
                            <span class="btn-icon">+</span> New Change
                        </button>
                    </div>` : ''}
            </div>
        `;

        this._bindViewControlEvents(el);
    }

    _bindViewControlEvents(el) {
        el.querySelectorAll('.perspective-option').forEach(btn => {
            btn.addEventListener('click', () => this._handlePerspectiveSwitch(btn.dataset.perspective));
        });
        el.querySelector('#groupBy')?.addEventListener('change', (e) => this.handleGrouping(e.target.value));
        el.querySelector('#createEntity')?.addEventListener('click', () => this._handleCreate());
    }

    // -------------------------------------------------------------------------
    // Temporal perspective
    // -------------------------------------------------------------------------

    renderTemporalView(sharedState) {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="temporal-view-container">
                <div class="temporal-timeline-area" id="temporalTimelineArea"></div>
            </div>
        `;

        const timelineContainer = this.container.querySelector('#temporalTimelineArea');

        this.temporalGrid = new TemporalGrid({ minYear: 2020, maxYear: 2045 });

        this.temporalGrid.setMilestoneRendering({
            mode: 'pixmap', rows: 1, cols: 3,
            eventTypes: {
                'API_PUBLICATION':     { row: 0, col: 0, colour: '#3b82f6' },
                'API_TEST_DEPLOYMENT': { row: 0, col: 0, colour: '#3b82f6' },
                'API_DECOMMISSIONING': { row: 0, col: 0, colour: '#3b82f6' },
                'UI_TEST_DEPLOYMENT':  { row: 0, col: 1, colour: '#8b5cf6' },
                'OPS_DEPLOYMENT':      { row: 0, col: 2, colour: '#10b981' },
            }
        });

        this.temporalGrid.addSelectionListener((entityId) => {
            const item = this.data.find(d => String(this.getItemId(d)) === String(entityId));
            if (item) { this._handleItemSelect(item); this.collection.selectedItem = item; }
        });

        this.temporalGrid.addTimeIntervalUpdateListener((startYear, endYear) => {
            this.sharedState.timeWindow = { startYear, endYear };
            this.temporalGrid.setTicks(this._buildWaveTicks(startYear, endYear));
            this._feedTemporalGrid(startYear, endYear);
        });

        const { startYear, endYear } = this._resolveTimeWindow(sharedState);
        this.temporalGrid.setTimeInterval(startYear, endYear);
        this.temporalGrid.setTicks(this._buildWaveTicks(startYear, endYear));
        this._feedTemporalGrid(startYear, endYear);
        this.temporalGrid.render(timelineContainer);

        if (this.sharedState.selectedItem) {
            this.temporalGrid.setTimeLineSelected(String(this.getItemId(this.sharedState.selectedItem)), true);
        }
    }

    _resolveTimeWindow(sharedState) {
        if (sharedState?.timeWindow?.startYear) return sharedState.timeWindow;
        const optimal = this.calculateOptimalTimeWindow();
        if (optimal) return optimal;
        const now = new Date().getFullYear();
        return { startYear: now, endYear: now + 3 };
    }

    _buildWaveTicks(startYear, endYear) {
        if (!this.setupData?.waves) return [];
        const start = new Date(startYear, 0, 1);
        const end   = new Date(endYear + 1, 0, 1);
        return this.setupData.waves
            .map(w => ({ wave: w, date: w.implementationDate ? new Date(w.implementationDate) : new Date(w.year, 0, 1) }))
            .filter(({ date }) => date >= start && date < end)
            .sort((a, b) => a.date - b.date)
            .map(({ wave, date }) => ({ label: wave.sequenceNumber ? `${wave.year}.${wave.sequenceNumber}` : String(wave.year), date }));
    }

    _feedTemporalGrid(startYear, endYear) {
        if (!this.temporalGrid) return;
        this.temporalGrid.clearRows();

        const start = new Date(startYear, 0, 1);
        const end   = new Date(endYear + 1, 0, 1);

        const visibleChanges = [];
        this.data.forEach(change => {
            if (!change.milestones?.length) return;
            const visibleMilestones = change.milestones.filter(m => {
                const wave = this.findMilestoneWave(m);
                if (!wave) return false;
                const date = wave.implementationDate ? new Date(wave.implementationDate) : new Date(wave.year, 0, 1);
                return date >= start && date < end;
            });
            if (visibleMilestones.length) {
                visibleChanges.push({
                    change,
                    milestones: visibleMilestones.map(m => {
                        const wave = this.findMilestoneWave(m);
                        const date = wave.implementationDate ? new Date(wave.implementationDate) : new Date(wave.year, 0, 1);
                        return { label: m.name || m.title || '', description: m.description || '', eventTypes: m.eventTypes || [], date };
                    })
                });
            }
        });

        const byDrg = new Map();
        visibleChanges.forEach(({ change, milestones }) => {
            const drg = change.drg || 'NM';
            if (!byDrg.has(drg)) byDrg.set(drg, []);
            byDrg.get(drg).push({ change, milestones });
        });

        const sortedDrgs = [...byDrg.keys()].sort((a, b) => {
            const la = getDraftingGroupDisplay(a) || a;
            const lb = getDraftingGroupDisplay(b) || b;
            return la.localeCompare(lb);
        });

        sortedDrgs.forEach(drg => {
            const drgLabel = getDraftingGroupDisplay(drg) || drg;
            const drgRowId = `drg-${drg}`;
            this.temporalGrid.addGroupRow(drgRowId, drgLabel, []);

            byDrg.get(drg).forEach(({ change, milestones }) => {
                const rowId = String(this.getItemId(change));
                this.temporalGrid.addRow(rowId, change.title || change.code || rowId, milestones, { parentId: drgRowId });
            });
        });
    }

    // -------------------------------------------------------------------------
    // Lifecycle notifications (called by os.js)
    // -------------------------------------------------------------------------

    onActivated() {
        this.isActive = true;
        this.renderViewControls();
        if (this.data.length > 0) this.renderFromCache();
    }

    onDeactivated() {
        this.isActive = false;
        const el = this._getViewControlsEl();
        if (el) el.innerHTML = '';
    }

    onDataUpdated(data) {
        this.data = [...data];
        if (this.isActive) this.renderFromCache();
    }

    renderFromCache() {
        if (!this.container) return;
        if (this.currentPerspective === 'temporal') {
            this.renderTemporalView(this.sharedState);
        } else {
            this.collection.setData(this.data);
            this.collection.render(this.container);
            this._restoreSelectionAfterRender();
        }
    }

    _restoreSelectionAfterRender() {
        const selected = this.sharedState.selectedItem;
        if (!selected) return;
        const selectedId = this.getItemId(selected);
        if (selectedId == null) return;
        this.collection.selectItem(selectedId);
    }

    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------

    _handleItemSelect(item) {
        this.sharedState.selectedItem = item;
        this._onItemSelect(item);
    }

    _handleCreate() {
        this.form.showCreateModal();
    }

    _handlePerspectiveSwitch(perspective) {
        if (perspective === this.currentPerspective) return;
        this.currentPerspective = perspective;

        const el = this._getViewControlsEl();
        if (el) {
            el.querySelectorAll('.perspective-option').forEach(btn => {
                btn.classList.toggle('perspective-option--active', btn.dataset.perspective === perspective);
            });
        }

        if (perspective === 'temporal') {
            this.renderTemporalView(this.sharedState);
        } else {
            this.renderCollectionView(this.sharedState);
        }
    }

    renderCollectionView(sharedState) {
        if (sharedState) this.sharedState = { ...this.sharedState, ...sharedState };
        this.collection.setData(this.data);
        this.collection.render(this.container);
        this._restoreSelectionAfterRender();
    }

    handleGrouping(groupBy) {
        if (groupBy === 'wave') groupBy = 'milestones';
        this.collection.handleGrouping(groupBy);
        this.sharedState.grouping = groupBy;
    }

    handleFilterChange(activeFilters) {
        this.sharedState.filters = activeFilters;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    getItemId(item) {
        return item?.itemId || item?.id || null;
    }

    cleanup() {
        if (this.temporalGrid) { this.temporalGrid.cleanup(); this.temporalGrid = null; }
        this.collection.cleanup();
        this.container = null;
    }
}