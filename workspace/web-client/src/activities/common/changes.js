import CollectionEntity from '../../components/odp/collection-entity.js';
import ChangeForm from './change-form.js';
import TimelineGrid from '../../components/odp/timeline-grid.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';


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
        this.timelineGrid = null;

        // Lifecycle state
        this.isActive = false; // Tracks if this entity view is currently active

        // Local shared state for this entity
        this.sharedState = {
            filters: {},
            selectedItem: null,
            grouping: 'none',
            timeWindow: null,
            eventTypeFilters: ['ANY'],
            currentTabIndex: 0
        };

        // Initialize collection with custom column types
        const customColumnTypes = {
            ...odpColumnTypes,
            'milestone-waves': {
                render: (value, column, item, context) => {
                    const waves = this.extractAllWavesFromMilestones(item);
                    if (!waves || waves.length === 0) return '-';

                    const waveLabels = waves.map(wave => {
                        if (wave.year && wave.quarter) {
                            return `${wave.year} Q${wave.quarter}`;
                        }
                        return wave.name || 'Unknown';
                    });

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
                wave = this.setupData.waves.find(w => w.id === milestone.waveId);
            }

            if (wave && !seenWaveIds.has(wave.id)) {
                waves.push(wave);
                seenWaveIds.add(wave.id);
            }
        });

        return waves.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.quarter - b.quarter;
        });
    }

    // ====================
    // STATE MANAGEMENT
    // ====================

    applySharedState(sharedState) {
        console.log('ChangesEntity.applySharedState:', sharedState);

        if (sharedState.filters && this.collection) {
            this.collection.currentFilters = { ...sharedState.filters };
        }

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

        if (this.currentPerspective === 'temporal' && this.timelineGrid) {
            if (sharedState.timeWindow) {
                this.timelineGrid.updateTimeWindow(
                    sharedState.timeWindow.start,
                    sharedState.timeWindow.end
                );
            }
            if (sharedState.eventTypeFilters) {
                this.timelineGrid.setMilestoneFilters(sharedState.eventTypeFilters);
            }
        }

        if (this.currentPerspective === 'collection') {
            this.collection.applyFilters();
        } else if (this.currentPerspective === 'temporal' && this.timelineGrid) {
            this.timelineGrid.setData(this.collection.filteredData || this.data);
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
        } else if (perspective === 'collection') {
            this.renderCollectionView(this.sharedState);
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
        this.timelineGrid = new TimelineGrid(this.app, this.entityConfig, this.setupData, {
            onItemSelect: (item) => this.handleTimelineItemSelect(item),
            onMilestoneSelect: (item, milestone) => this.handleTimelineMilestoneSelect(item, milestone)
        });
        this.timelineGrid.render(timelineContainer);

        if (sharedState) {
            if (sharedState.timeWindow) {
                this.timelineGrid.updateTimeWindow(
                    sharedState.timeWindow.start,
                    sharedState.timeWindow.end
                );
            }
            if (sharedState.eventTypeFilters) {
                this.timelineGrid.setMilestoneFilters(sharedState.eventTypeFilters);
            }
        }

        const dataToShow = this.collection?.filteredData || this.data;
        this.timelineGrid.setData(dataToShow);

        if (sharedState?.selectedItem) {
            const itemId = this.getItemId(sharedState.selectedItem);
            if (itemId) {
                this.timelineGrid.selectItem(itemId);
            }
        }
    }

    renderCollectionView(sharedState) {
        if (!this.container) return;

        if (sharedState) {
            if (sharedState.filters) {
                this.collection.currentFilters = { ...sharedState.filters };
            }
            if (sharedState.grouping) {
                this.collection.currentGrouping = sharedState.grouping;
            }
            if (sharedState.currentTabIndex !== undefined) {
                this.form.context.currentTabIndex = sharedState.currentTabIndex;
            }
        }

        this.collection.setData(this.data);
        this.collection.render(this.container);

        if (sharedState?.selectedItem) {
            const itemId = this.getItemId(sharedState.selectedItem);
            if (itemId) {
                this.collection.selectItem(itemId);
            }
        }
    }

    handleTimelineItemSelect(item) {
        this.handleItemSelect(item);
        if (this.collection) {
            this.collection.selectedItem = item;
        }
        this.sharedState.selectedItem = item;

        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    handleTimelineMilestoneSelect(item, milestone) {
        this.handleItemSelect(item);
        this.selectedMilestone = milestone;
        this.sharedState.selectedItem = item;

        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    // ====================
    // CONFIGURATION
    // ====================

    getColumnConfig() {
        return [
            { key: 'code', label: 'ode', width: 'auto', sortable: true, type: 'text' },
            { key: 'title', label: 'Title', width: 'auto', sortable: true, type: 'text' },
            { key: 'visibility', label: 'Visibility', width: '100px', sortable: true, type: 'visibility' },
            { key: 'drg', label: 'DRG', width: '120px', sortable: true, type: 'drafting-group' },
            { key: 'milestones', label: 'Waves', width: '150px', sortable: true, type: 'milestone-waves' },
            { key: 'satisfiedRequirements', label: 'Satisfies', width: '150px', sortable: false, type: 'entity-reference-list', maxDisplay: 2 },
            { key: 'supersedesRequirements', label: 'Supersedes', width: '150px', sortable: false, type: 'entity-reference-list', maxDisplay: 2 },
            { key: 'impactsData', label: 'Data Impact', width: '150px', sortable: false, type: 'setup-reference-list', setupKey: 'dataCategories', maxDisplay: 2 },
            { key: 'impactsStakeholderCategories', label: 'Stakeholder Impact', width: '180px', sortable: false, type: 'setup-reference-list', setupKey: 'stakeholderCategories', maxDisplay: 2 },
            { key: 'impactsServices', label: 'Services Impact', width: '150px', sortable: false, type: 'setup-reference-list', setupKey: 'services', maxDisplay: 2 },
            { key: 'updatedBy', label: 'Updated By', width: '120px', sortable: false, type: 'text' },
            { key: 'updatedAt', label: 'Updated', width: '120px', sortable: true, type: 'date' }
        ];
    }

    getGroupingConfig() {
        return [
            { value: 'none', label: 'No Grouping' },
            { key: 'visibility', label: 'Group by Visibility' },
            { key: 'drg', label: 'Group by DRG' },
            { key: 'wave', label: 'Group by Wave' },
            { key: 'impactsData', label: 'Group by Data Impact' },
            { key: 'impactsStakeholderCategories', label: 'Group by Stakeholder Impact' },
            { key: 'impactsServices', label: 'Group by Services Impact' }
        ];
    }


    getItemId(item) {
        return item?.itemId || item?.id || null;
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
        if (this.timelineGrid) {
            this.timelineGrid.cleanup();
            this.timelineGrid = null;
        }

        this.collection.cleanup();
        this.container = null;
    }

    // ====================
    // LIFECYCLE NOTIFICATIONS - Phase 1
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
     * Render current perspective from cached data
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