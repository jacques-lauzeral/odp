import CollectionEntity from '../../components/odp/collection-entity.js';
import ChangeForm from './change-form.js';
import TemporalGrid from '../../components/odp/temporal-grid.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import {
    getDraftingGroupDisplay
} from '/shared/src/index.js';


/**
 * ChangesEntity - Operational Changes collection management with multi-perspective support
 * Supports both Collection and Temporal perspectives with parent-owned data pattern
 * UPDATED: Parent manages data loading, distributes to perspectives via setData()
 */
export default class ChangesEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Multi-perspective support
        this.currentPerspective = 'collection'; // 'collection' | 'temporal'
        this.data = []; // PARENT-OWNED: Single source of truth for all perspectives
        this.temporalGrid = null;

        // Lifecycle state
        this.isActive = false; // Tracks if this entity view is currently active

        // Local shared state for this entity
        this.sharedState = {
            filters: [],
            selectedItem: null,
            grouping: 'none',
            timeWindow: null,
            currentTabIndex: 0
        };

        // Initialize collection with custom column types
        const customColumnTypes = {
            ...odpColumnTypes,
            'milestone-waves': {
                render: (value, column, item, context) => {
                    const waves = this.extractAllWavesFromMilestones({ milestones: value });
                    if (!waves || waves.length === 0) return '-';

                    const waveLabels = waves.map(wave => wave.name || 'Unknown');

                    return waveLabels.join(', ');
                },
                filter: (value, filterValue, column) => {
                    if (!filterValue) return true;
                    const waves = this.extractAllWavesFromMilestones({ milestones: value });
                    return waves.some(wave => wave.id.toString() === filterValue.toString());
                },
                sort: (a, b, column) => {
                    const wavesA = this.extractAllWavesFromMilestones({ milestones: a });
                    const wavesB = this.extractAllWavesFromMilestones({ milestones: b });

                    const firstWaveA = wavesA[0];
                    const firstWaveB = wavesB[0];

                    if (!firstWaveA && !firstWaveB) return 0;
                    if (!firstWaveA) return 1;
                    if (!firstWaveB) return -1;

                    return odpColumnTypes.wave.sort(firstWaveA, firstWaveB, column);
                },
                getFilterOptions: (column, context) => odpColumnTypes.wave.getFilterOptions(column, context)
            }
        };

        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: customColumnTypes,
            context: { setupData },
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            getEmptyStateMessage: () => ({
                icon: '🔄',
                title: 'No Changes Yet',
                showCreateButton: true
            })
        });

        this.form = new ChangeForm(entityConfig, {
            setupData,
            currentTabIndex: 0,
            onTabChange: (index) => {
                this.sharedState.currentTabIndex = index;
            }
        });
    }

    extractAllWavesFromMilestones(item) {
        console.log(`extractAllWavesFromMilestones ${JSON.stringify(item)}`);
        if (!item?.milestones || !Array.isArray(item.milestones) || item.milestones.length === 0) {
            return [];
        }

        const waves = [];
        const seenWaveIds = new Set();

        item.milestones.forEach(milestone => {
            let wave = null;

            if (milestone.wave) {
                wave = milestone.wave;
            } else if (milestone.waveId && this.setupData?.waves) {
                wave = this.setupData.waves.find(w => String(w.id) === String(milestone.waveId));
            }

            if (wave && !seenWaveIds.has(wave.id)) {
                waves.push(wave);
                seenWaveIds.add(wave.id);
            }
        });

        return waves.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return (a.sequenceNumber || 0) - (b.sequenceNumber || 0);
        });
    }

    /**
     * Calculate optimal time window showing all future setup waves.
     * @returns {{ startYear: number, endYear: number } | null}
     */
    calculateOptimalTimeWindow() {
        if (!this.setupData?.waves || this.setupData.waves.length === 0) return null;

        const now = new Date();

        const futureWaves = this.setupData.waves
            .map(wave => ({
                wave,
                date: wave.implementationDate
                    ? new Date(wave.implementationDate)
                    : new Date(wave.year, 0, 1)
            }))
            .filter(item => item.date >= now)
            .sort((a, b) => a.date - b.date);

        if (futureWaves.length === 0) return null;

        return {
            startYear: futureWaves[0].wave.year,
            endYear:   futureWaves[futureWaves.length - 1].wave.year
        };
    }

    /**
     * Find wave for a milestone
     * @param {Object} milestone - Milestone object
     * @returns {Object|null} Wave object or null
     */
    findMilestoneWave(milestone) {
        if (milestone.wave) return milestone.wave;

        if (milestone.waveId && this.setupData?.waves) {
            return this.setupData.waves.find(w => String(w.id) === String(milestone.waveId));
        }

        return null;
    }

    // ====================
    // UTILITY METHODS
    // ====================

    getItemId(item) {
        return item?.itemId || item?.id || null;
    }

    // ====================
    // STATE MANAGEMENT
    // ====================

    applySharedState(sharedState) {
        console.log('ChangesEntity.applySharedState:', sharedState);

        if (sharedState.selectedItem && this.collection) {
            this.collection.selectedItem = sharedState.selectedItem;
        }

        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }

        if (sharedState.currentTabIndex !== undefined && this.form) {
            this.sharedState.currentTabIndex = sharedState.currentTabIndex;
            this.form.context.currentTabIndex = sharedState.currentTabIndex;
        }

        if (this.currentPerspective === 'temporal' && this.temporalGrid) {
            if (sharedState.timeWindow?.startYear) {
                this.temporalGrid.setTimeInterval(
                    sharedState.timeWindow.startYear,
                    sharedState.timeWindow.endYear
                );
                this.temporalGrid.setTicks(
                    this._buildWaveTicks(sharedState.timeWindow.startYear, sharedState.timeWindow.endYear)
                );
                this._feedTemporalGrid(sharedState.timeWindow.startYear, sharedState.timeWindow.endYear);
            }
        }

        if (this.currentPerspective === 'collection') {
            this.collection.renderContent();
        }
    }

    // ====================
    // PERSPECTIVE SWITCHING
    // ====================

    handlePerspectiveSwitch(perspective, sharedState) {
        console.log(`ChangesEntity.handlePerspectiveSwitch to ${perspective}`);

        if (perspective === this.currentPerspective) {
            return; // Already in this perspective
        }

        this.currentPerspective = perspective;

        // Update perspective button UI
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (viewControlsContainer) {
            const perspectiveButtons = viewControlsContainer.querySelectorAll('.perspective-option');
            perspectiveButtons.forEach(button => {
                if (button.dataset.perspective === perspective) {
                    button.classList.add('perspective-option--active');
                } else {
                    button.classList.remove('perspective-option--active');
                }
            });
        }

        if (sharedState) {
            this.sharedState = { ...this.sharedState, ...sharedState };
        }

        if (perspective === 'temporal') {
            this.renderTemporalView(this.sharedState);
            // Timeline selectItem fires onItemSelect which calls handleItemSelect ->
            // updateDetailsPanel, so no separate _restoreSelectionAfterRender needed here.
        } else if (perspective === 'collection') {
            this.renderCollectionView(this.sharedState);
            // renderCollectionView calls collection.selectItem which fires onItemSelect,
            // but only when there is a selectedItem - handled inside renderCollectionView.
        }
    }

    renderTemporalView(sharedState) {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="temporal-view-container">
                <div class="temporal-timeline-area" id="temporalTimelineArea"></div>
            </div>
        `;

        const timelineContainer = this.container.querySelector('#temporalTimelineArea');

        // Create and configure TemporalGrid
        this.temporalGrid = new TemporalGrid({
            minYear: 2020,
            maxYear: 2045
        });

        // Register OC pixmap rendering spec
        this.temporalGrid.setMilestoneRendering({
            mode: 'pixmap',
            rows: 1,
            cols: 3,
            eventTypes: {
                'API_PUBLICATION':     { row: 0, col: 0, colour: '#3b82f6' },
                'API_TEST_DEPLOYMENT': { row: 0, col: 0, colour: '#3b82f6' },
                'API_DECOMMISSIONING': { row: 0, col: 0, colour: '#3b82f6' },
                'UI_TEST_DEPLOYMENT':  { row: 0, col: 1, colour: '#8b5cf6' },
                'OPS_DEPLOYMENT':      { row: 0, col: 2, colour: '#10b981' }
            }
        });

        // Register selection listener
        this.temporalGrid.addSelectionListener((entityId) => {
            this.handleTimelineItemSelect(entityId);
        });

        // React to user zoom changes — recompute ticks and re-filter data
        this.temporalGrid.addTimeIntervalUpdateListener((startYear, endYear) => {
            this.sharedState.timeWindow = { startYear, endYear };
            const ticks = this._buildWaveTicks(startYear, endYear);
            this.temporalGrid.setTicks(ticks);
            this._feedTemporalGrid(startYear, endYear);
        });

        // Determine initial time window
        const window = this._resolveTimeWindow(sharedState);
        const { startYear, endYear } = window;

        // Set time interval and ticks
        this.temporalGrid.setTimeInterval(startYear, endYear);
        this.temporalGrid.setTicks(this._buildWaveTicks(startYear, endYear));

        // Feed data before render so rows exist when render() calls _render()
        this._feedTemporalGrid(startYear, endYear);

        // Mount
        this.temporalGrid.render(timelineContainer);

        // Restore selection
        if (this.sharedState.selectedItem) {
            const itemId = String(this.getItemId(this.sharedState.selectedItem));
            this.temporalGrid.setTimeLineSelected(itemId, true);
        }
    }

    /**
     * Compute the initial time window from sharedState or optimal wave range.
     * Returns { startYear, endYear }.
     */
    _resolveTimeWindow(sharedState) {
        if (sharedState?.timeWindow?.startYear) {
            return sharedState.timeWindow;
        }
        const optimal = this.calculateOptimalTimeWindow();
        if (optimal) {
            return {
                startYear: optimal.startYear,
                endYear:   optimal.endYear
            };
        }
        const now = new Date().getFullYear();
        return { startYear: now, endYear: now + 3 };
    }

    /**
     * Build wave tick descriptors for the given year range.
     * Only waves whose date falls within [startYear, endYear] are included.
     */
    _buildWaveTicks(startYear, endYear) {
        if (!this.setupData?.waves) return [];
        const start = new Date(startYear, 0, 1);
        const end   = new Date(endYear + 1, 0, 1);

        return this.setupData.waves
            .map(wave => ({
                wave,
                date: wave.implementationDate
                    ? new Date(wave.implementationDate)
                    : new Date(wave.year, 0, 1)
            }))
            .filter(({ date }) => date >= start && date < end)
            .sort((a, b) => a.date - b.date)
            .map(({ wave, date }) => ({
                label: wave.sequenceNumber
                    ? `${wave.year}.${wave.sequenceNumber}`
                    : String(wave.year),
                date
            }));
    }

    /**
     * Feed filtered change data into the TemporalGrid as timeline rows.
     */
    _feedTemporalGrid(startYear, endYear) {
        if (!this.temporalGrid) return;

        this.temporalGrid.clearRows();

        const start = new Date(startYear, 0, 1);
        const end   = new Date(endYear + 1, 0, 1);

        // Build visible change rows — filter to those with milestones in window
        const visibleChanges = [];
        this.data.forEach(change => {
            if (!change.milestones || change.milestones.length === 0) return;

            const visibleMilestones = change.milestones.filter(m => {
                const wave = this.findMilestoneWave(m);
                if (!wave) return false;
                const date = wave.implementationDate
                    ? new Date(wave.implementationDate)
                    : new Date(wave.year, 0, 1);
                return date >= start && date < end;
            });

            if (visibleMilestones.length === 0) return;

            visibleChanges.push({
                change,
                milestones: visibleMilestones.map(m => {
                    const wave = this.findMilestoneWave(m);
                    const date = wave.implementationDate
                        ? new Date(wave.implementationDate)
                        : new Date(wave.year, 0, 1);
                    return {
                        label:      m.name || m.title || '',
                        description: m.description || '',
                        eventTypes: m.eventTypes || [],
                        date
                    };
                })
            });
        });

        // Group by DrG — alphabetical by DrG display name; no-DrG under 'NM'
        const byDrg = new Map();
        visibleChanges.forEach(({ change, milestones }) => {
            const drg = change.drg || 'NM';
            if (!byDrg.has(drg)) byDrg.set(drg, []);
            byDrg.get(drg).push({ change, milestones });
        });

        // Sort DrG keys alphabetically by display name
        const sortedDrgs = [...byDrg.keys()].sort((a, b) => {
            const labelA = getDraftingGroupDisplay(a) || a;
            const labelB = getDraftingGroupDisplay(b) || b;
            return labelA.localeCompare(labelB);
        });

        // Emit separator + rows per DrG
        sortedDrgs.forEach(drg => {
            const drgLabel = getDraftingGroupDisplay(drg) || drg;
            this.temporalGrid.addSeparatorRow(`drg:${drg}`, drgLabel);

            byDrg.get(drg)
                .sort((a, b) => (a.change.title || '').localeCompare(b.change.title || ''))
                .forEach(({ change, milestones }) => {
                    const entityId = String(this.getItemId(change));
                    const label = change.code
                        ? `${change.code} – ${change.title}`
                        : (change.title || entityId);
                    this.temporalGrid.addRow(entityId, label, milestones);
                });
        });
    }

    renderCollectionView(sharedState) {
        if (!this.container) return;

        if (sharedState) {
            if (sharedState.grouping) {
                this.collection.currentGrouping = sharedState.grouping;
            }
            if (sharedState.currentTabIndex !== undefined) {
                this.form.context.currentTabIndex = sharedState.currentTabIndex;
            }
        }

        this.collection.setData(this.data);
        this.collection.render(this.container);

        // Restore selection
        if (this.sharedState.selectedItem) {
            const itemId = this.getItemId(this.sharedState.selectedItem);
            if (itemId) {
                const freshItem = this.data.find(d => this.getItemId(d) === itemId);
                if (freshItem) {
                    this.sharedState.selectedItem = freshItem;
                }
                this.collection.selectItem(itemId);
            }
        }
    }

    /**
     * Re-render details panel after a data reload, using fresh data from this.data.
     * Called by renderFromCache when there is an active selection.
     */
    _restoreSelectionAfterRender() {
        const selected = this.sharedState.selectedItem;
        if (!selected) return;

        const selectedId = this.getItemId(selected);
        if (selectedId == null) return;

        // Look up the item in the current data (may be fresher than the stored reference)
        const freshItem = this.data.find(d => this.getItemId(d) === selectedId) || selected;

        // Update stored reference
        this.sharedState.selectedItem = freshItem;

        if (this.currentPerspective === 'temporal' && this.temporalGrid) {
            this.temporalGrid.setTimeLineSelected(String(selectedId), true);
        } else {
            // selectItem fires onItemSelect → updateDetailsPanel
            this.collection.selectItem(selectedId);
        }
    }

    handleTimelineItemSelect(entityId) {
        const item = this.data.find(d => String(this.getItemId(d)) === String(entityId));
        if (!item) return;
        this.handleItemSelect(item);
        if (this.collection) {
            this.collection.selectedItem = item;
        }
        this.sharedState.selectedItem = item;

        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    // ====================
    // FILTER MATCHERS
    // ====================

    /**
     * Called by the activity when FilterBar fires 'filtersChanged'.
     * Propagates the new filter array to the collection perspective and,
     * if temporal is active, re-feeds the timeline with the filtered data.
     *
     * @param {Array} activeFilters  Array of { key, label, value, displayValue }
     */
    handleFilterChange(activeFilters) {
        // Store on shared state so perspective switches preserve filters.
        // No client-side filtering: the activity's _applyFiltersToEntities already
        // triggers a server-side reload via updateAllBadges, which returns
        // pre-filtered data. applyFilters() on the collection is therefore a no-op here.
        this.sharedState.filters = activeFilters;
    }

    // ====================
    // CONFIGURATION
    // ====================

    getColumnConfig() {
        return [
            { key: 'code', label: 'Code', width: '120px', sortable: true, type: 'text' },
            { key: 'maturity', label: 'Maturity', width: '80px', sortable: true, type: 'text' },
            { key: 'title', label: 'Title', width: 'auto', sortable: true, type: 'text' },
            { key: 'drg', label: 'DrG', width: '120px', sortable: true, type: 'drafting-group' },
            { key: 'implementedORs', label: 'Implements', width: '200px', sortable: false, type: 'entity-reference-list', maxDisplay: 8 },
            { key: 'dependencies', label: 'Depends On', width: '200px', sortable: false, type: 'entity-reference-list', maxDisplay: 5 },
            { key: 'cost', label: 'Cost', width: '80px', sortable: true, type: 'text' }
        ];
    }

    getGroupingConfig() {
        return [
            { value: 'none', label: 'No Grouping' },
            { key: 'maturity', label: 'Group by Maturity' },
            { key: 'drg', label: 'Group by DrG' },
            { key: 'wave', label: 'Group by Wave' }
        ];
    }

    // ====================
    // EVENT HANDLERS
    // ====================

    handleCreate() {
        this.form.showCreateModal();
    }

    handleEdit(item) {
        this.form.showEditModal(item || this.collection.selectedItem);
    }

    handleReview(item) {
        this.form.showReadOnlyModal(item || this.collection.selectedItem);
    }

    handleItemSelect(item) {
        this.updateDetailsPanel(item);
        this.sharedState.selectedItem = item;

        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    getCurrentTabInPanel(container) {
        const activeTab = container.querySelector('.tab-header.active');
        return activeTab ? parseInt(activeTab.dataset.tab, 10) : 0;
    }

    switchTabInPanel(container, tabIndex) {
        container.querySelectorAll('.tab-header').forEach(h =>
            h.classList.toggle('active', h.dataset.tab === tabIndex.toString()));
        container.querySelectorAll('.tab-panel').forEach(p =>
            p.classList.toggle('active', p.dataset.tab === tabIndex.toString()));

        this.form.context.currentTabIndex = tabIndex;
        this.sharedState.currentTabIndex = tabIndex;
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        const currentTab = this.getCurrentTabInPanel(detailsContainer);
        const isReviewMode = this.app.currentActivity?.config?.mode === 'review';
        const detailsButtonText = isReviewMode ? 'Review' : 'Edit';
        const detailsHtml = await this.form.generateReadOnlyView(item, true);

        detailsContainer.innerHTML = `
        <div class="details-sticky-header">
            <div class="item-title-section">
                <h3 class="item-title">${item.title || `${item.type || 'Item'} ${item.itemId}`}</h3>
                <span class="item-id">${item.type ? `[${item.type}] ` : ''}${item.itemId}</span>
            </div>
            <div class="details-actions">
                <button class="btn btn-primary btn-sm" id="detailsBtn">${detailsButtonText}</button>
            </div>
        </div>
        <div class="details-scrollable-content">${detailsHtml}</div>
    `;

        // Initialize richtext fields after HTML insertion
        this.form.initializeRichtextReadOnly(detailsContainer);

        if (currentTab !== null && currentTab !== 0) {
            this.switchTabInPanel(detailsContainer, currentTab);
        }

        const detailsBtn = detailsContainer.querySelector('#detailsBtn');
        if (detailsBtn) {
            if (isReviewMode) {
                detailsBtn.addEventListener('click', () => this.handleReview(item));
            } else {
                detailsBtn.addEventListener('click', () => this.handleEdit(item));
            }
        }
    }

    // ====================
    // PUBLIC INTERFACE - PARENT-OWNED DATA PATTERN
    // ====================

    async render(container, perspective = 'collection') {
        this.container = container;
        this.currentPerspective = perspective;


        if (perspective === 'temporal') {
            this.renderTemporalView(this.sharedState);
        } else {
            this.collection.setData(this.data);
            await this.collection.render(container);
        }
    }


    handleGrouping(groupBy) {
        if (groupBy === 'wave') {
            groupBy = 'milestones';
        }

        this.collection.handleGrouping(groupBy);
        this.sharedState.grouping = groupBy;
    }

    cleanup() {
        if (this.temporalGrid) {
            this.temporalGrid.cleanup();
            this.temporalGrid = null;
        }

        this.collection.cleanup();
        this.container = null;
    }

    // ====================
    // LIFECYCLE NOTIFICATIONS
    // ====================

    /**
     * Called when changes data has been updated (loaded/filtered)
     * @param {Array} data - The new changes data
     * @param {number} count - Total count of changes
     */
    onDataUpdated(data, count) {
        console.log('ChangesEntity.onDataUpdated:', { count, isActive: this.isActive });

        // Update internal data cache
        this.data = [...data];

        // If this view is currently active, render the data
        if (this.isActive) {
            this.renderFromCache();
        }
    }

    /**
     * Render current perspective from cached data, then restore selection.
     */
    renderFromCache() {
        if (!this.container) {
            console.warn('ChangesEntity.renderFromCache: No container available');
            return;
        }

        console.log(`ChangesEntity.renderFromCache: Rendering ${this.currentPerspective} with ${this.data.length} items`);

        // Render based on perspective
        if (this.currentPerspective === 'temporal') {
            this.renderTemporalView(this.sharedState);
        } else {
            this.collection.setData(this.data);
            this.collection.render(this.container);
            // Re-select previously selected item and refresh details panel
            this._restoreSelectionAfterRender();
        }
    }

    /**
     * Called when this entity view becomes active (user switches to this tab)
     */
    onActivated() {
        console.log('ChangesEntity.onActivated');
        this.isActive = true;

        // Render view controls
        this.renderViewControls();

        // Render from cache if we have data
        if (this.data && this.data.length > 0) {
            this.renderFromCache();
        }
    }

    /**
     * Render view-specific controls (perspective selector, grouping, actions)
     */
    renderViewControls() {
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (!viewControlsContainer) {
            console.warn('ChangesEntity.renderViewControls: No viewControls container');
            return;
        }

        const groupingConfig = this.getGroupingConfig();
        const isReviewMode = this.app.currentActivity?.config?.mode === 'review';

        viewControlsContainer.innerHTML = `
            <div class="perspective-controls">
                <div class="perspective-toggle">
                    <button class="perspective-option ${this.currentPerspective === 'collection' ? 'perspective-option--active' : ''}" 
                            data-perspective="collection">
                        📋 Collection
                    </button>
                    <button class="perspective-option ${this.currentPerspective === 'temporal' ? 'perspective-option--active' : ''}" 
                            data-perspective="temporal">
                        📅 Temporal
                    </button>
                </div>
            </div>
            
            <div class="collection-actions-and-grouping">
                <div class="grouping-section">
                    <label for="groupBy">Group by:</label>
                    <select id="groupBy" class="form-control group-select">
                        ${groupingConfig.map(option => `
                            <option value="${option.key || option.value}" 
                                    ${(option.key || option.value) === this.sharedState.grouping ? 'selected' : ''}>
                                ${option.label}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                ${!isReviewMode ? `
                    <div class="actions-section">
                        <button class="btn btn-primary" id="createEntity">
                            <span class="btn-icon">+</span> New Change
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        this.bindViewControlEvents();
    }

    /**
     * Bind events for view controls
     */
    bindViewControlEvents() {
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (!viewControlsContainer) return;

        // Perspective switching
        const perspectiveButtons = viewControlsContainer.querySelectorAll('.perspective-option');
        perspectiveButtons.forEach(button => {
            button.addEventListener('click', () => {
                const perspective = button.dataset.perspective;
                this.handlePerspectiveSwitch(perspective, this.sharedState);
            });
        });

        // Grouping
        const groupBySelect = viewControlsContainer.querySelector('#groupBy');
        if (groupBySelect) {
            groupBySelect.addEventListener('change', (e) => {
                this.handleGrouping(e.target.value);
            });
        }

        // Create button
        const createBtn = viewControlsContainer.querySelector('#createEntity');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }
    }

    /**
     * Called when this entity view becomes inactive (user switches away)
     */
    onDeactivated() {
        console.log('ChangesEntity.onDeactivated');
        this.isActive = false;

        // Clear view controls
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (viewControlsContainer) {
            viewControlsContainer.innerHTML = '';
        }
    }
}