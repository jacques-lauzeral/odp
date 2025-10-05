import CollectionEntity from '../../components/odp/collection-entity.js';
import ChangeForm from './change-form.js';
import TimelineGrid from '../../components/odp/timeline-grid.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';
import { format } from '../../shared/utils.js';
import {
    Visibility,
    getVisibilityDisplay,
    DraftingGroup,
    getDraftingGroupDisplay
} from '/shared/src/index.js';

export default class ChangesEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Perspective tracking
        this.currentPerspective = 'collection';
        this.timelineGrid = null;

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
                    // Client-side filtering - check if any milestone targets the filtered wave
                    const waves = this.extractAllWavesFromMilestones({ milestones: value });
                    return waves.some(wave => wave.id.toString() === filterValue.toString());
                },
                sort: (a, b, column) => {
                    const wavesA = this.extractAllWavesFromMilestones({ milestones: a });
                    const wavesB = this.extractAllWavesFromMilestones({ milestones: b });

                    // Sort by first wave (or empty if no waves)
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
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate(),
            onRefresh: () => this.handleRefresh(),
            getEmptyStateMessage: () => ({
                icon: '🔄',
                title: 'No Changes Yet',
                description: 'Start creating operational changes to define implementation activities and milestones.',
                createButtonText: 'Create First Change',
                showCreateButton: true
            })
        });

        // Initialize form using new inheritance pattern
        this.form = new ChangeForm(entityConfig, setupData);

        // Listen for save events
        document.addEventListener('entitySaved', async(e) => {
            if (e.detail.entityType === 'Operational Changes') {
                await this.collection.refresh();

                // Update timeline if in temporal view
                if (this.currentPerspective === 'temporal' && this.timelineGrid) {
                    this.timelineGrid.setData(this.collection.data);
                }
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

        // Sort waves by year/quarter
        return waves.sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.quarter - b.quarter;
        });
    }

    // ====================
    // STATE MANAGEMENT - NEW METHODS FOR CENTRALIZED STATE
    // ====================

    applySharedState(sharedState) {
        console.log('ChangesEntity.applySharedState:', sharedState);

        // Apply filters to collection
        if (sharedState.filters && this.collection) {
            this.collection.currentFilters = { ...sharedState.filters };
        }

        // Apply selection
        if (sharedState.selectedItem && this.collection) {
            this.collection.selectedItem = sharedState.selectedItem;
        }

        // Apply grouping
        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }

        // Apply temporal state to timeline if in temporal perspective
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

        // Re-render to reflect state
        if (this.currentPerspective === 'collection') {
            this.collection.applyFilters();
        } else if (this.currentPerspective === 'temporal' && this.timelineGrid) {
            this.timelineGrid.setData(this.collection.data);
        }
    }

    syncFilters(filters) {
        console.log('ChangesEntity.syncFilters:', filters);

        if (this.collection) {
            this.collection.currentFilters = { ...filters };
            this.collection.applyFilters();

            // Update timeline data if in temporal view
            if (this.currentPerspective === 'temporal' && this.timelineGrid) {
                this.timelineGrid.setData(this.collection.filteredData || this.collection.data);
            }
        }
    }

    // ====================
    // PERSPECTIVE SWITCHING - UPDATED FOR CENTRALIZED STATE
    // ====================

    handlePerspectiveSwitch(perspective, sharedState) {
        console.log(`ChangesEntity.handlePerspectiveSwitch to ${perspective} with shared state:`, sharedState);

        if (perspective === this.currentPerspective) {
            return; // Already in this perspective
        }

        this.currentPerspective = perspective;

        if (perspective === 'temporal') {
            this.renderTemporalView(sharedState);
        } else if (perspective === 'collection') {
            this.renderCollectionView(sharedState);
        }
    }

    renderTemporalView(sharedState) {
        if (!this.container) return;

        console.log('ChangesEntity.renderTemporalView with shared state:', sharedState);

        // Create temporal layout - full width timeline (no left panel)
        this.container.innerHTML = `
            <div class="temporal-view-container">
                <div class="temporal-timeline-area" id="temporalTimelineArea">
                    <!-- TimelineGrid will render here -->
                </div>
            </div>
        `;

        // Initialize timeline grid component
        const timelineContainer = this.container.querySelector('#temporalTimelineArea');
        this.timelineGrid = new TimelineGrid(this.app, this.entityConfig, this.setupData, {
            onItemSelect: (item) => this.handleTimelineItemSelect(item),
            onMilestoneSelect: (item, milestone) => this.handleTimelineMilestoneSelect(item, milestone)
        });
        this.timelineGrid.render(timelineContainer);

        // Apply shared state to timeline
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

        // Set data from collection (filtered or all)
        const dataToShow = this.collection?.filteredData || this.collection?.data || [];
        this.timelineGrid.setData(dataToShow);

        // Restore selection if any
        if (sharedState?.selectedItem) {
            const itemId = this.getItemId(sharedState.selectedItem);
            if (itemId) {
                this.timelineGrid.selectItem(itemId);
            }
        }
    }

    renderCollectionView(sharedState) {
        if (!this.container) return;

        console.log('ChangesEntity.renderCollectionView with shared state:', sharedState);
        console.log('Collection current filters before render:', this.collection.currentFilters);
        console.log('Collection current grouping before render:', this.collection.currentGrouping);

        // Apply shared state FIRST, then render
        if (sharedState) {
            // Apply filters before rendering
            if (sharedState.filters) {
                this.collection.currentFilters = { ...sharedState.filters };
            }

            // Apply grouping before rendering
            if (sharedState.grouping) {
                this.collection.currentGrouping = sharedState.grouping;
            }
        }

        // Now render with state already applied
        this.collection.render(this.container);

        // Restore selection after render with debug logging
        if (sharedState?.selectedItem) {
            const itemId = this.getItemId(sharedState.selectedItem);
            console.log('Attempting to restore selection - itemId:', itemId);
            console.log('Available items in collection:', this.collection.data.map(d => this.getItemId(d)));

            if (itemId) {
                this.collection.selectItem(itemId);
                console.log('Selection restored - selected item:', this.collection.selectedItem);
            }
        }
    }

    handleTimelineItemSelect(item) {
        console.log('Timeline item selected:', item?.itemId || item?.id);

        // Update details panel
        this.handleItemSelect(item);

        // Update the collection's selectedItem to keep it in sync
        if (this.collection) {
            this.collection.selectedItem = item;
        }

        // Notify parent of selection change
        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    handleTimelineMilestoneSelect(item, milestone) {
        console.log('Timeline milestone selected:', {
            change: item?.itemId || item?.id,
            milestone: milestone?.milestoneKey || milestone?.id
        });

        // Show change in details panel with milestone emphasized
        this.handleItemSelect(item);

        // Store selected milestone for potential details panel emphasis
        this.selectedMilestone = milestone;

        // Notify parent of selection change
        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    // ====================
    // COLLECTION CONFIGURATION (Updated for new fields)
    // ====================

    getFilterConfig() {
        return [
            {
                key: 'text',
                label: 'Full Text Search',
                type: 'text',
                placeholder: 'Search across title, purpose, and implementation details...'  // Updated placeholder
            },
            {
                key: 'visibility',
                label: 'Visibility',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'NETWORK', label: getVisibilityDisplay('NETWORK') },
                    { value: 'NM', label: getVisibilityDisplay('NM') }
                ]
            },
            {
                key: 'drg',  // NEW FILTER
                label: 'Drafting Group',
                type: 'select',
                options: this.buildDraftingGroupOptions()
            },
            {
                key: 'stakeholderCategory',
                label: 'Stakeholder (via Requirements)',
                type: 'select',
                options: this.buildOptionsFromSetupData('stakeholderCategories')
            },
            {
                key: 'dataCategory',
                label: 'Data (via Requirements)',
                type: 'select',
                options: this.buildOptionsFromSetupData('dataCategories')
            },
            {
                key: 'milestones',
                label: 'Wave',
                type: 'select',
                options: this.buildWaveOptions()
            }
        ];
    }

    getColumnConfig() {
        return [
            {
                key: 'itemId',
                label: 'ID',
                width: '80px',
                sortable: true,
                type: 'text'
            },
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                sortable: true,
                type: 'text'
            },
            {
                key: 'drg',  // NEW COLUMN
                label: 'DRG',
                width: '120px',
                sortable: true,
                type: 'drafting-group'
            },
            {
                key: 'milestones',
                label: 'Waves',
                width: '120px',
                sortable: true,
                type: 'milestone-waves'
            },
            {
                key: 'visibility',
                label: 'Visibility',
                width: '100px',
                sortable: true,
                type: 'visibility'
            },
            {
                key: 'satisfiesRequirements',
                label: 'Satisfies',
                width: '150px',
                sortable: false,
                type: 'entity-reference-list',
                maxDisplay: 2,
                noneLabel: 'No Requirements',
                groupPrefix: 'Satisfies'
            },
            {
                key: 'supersedsRequirements',
                label: 'Supersedes',
                width: '150px',
                sortable: false,
                type: 'entity-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Superseded',
                groupPrefix: 'Supersedes'
            },
            {
                key: 'createdBy',
                label: 'Updated By',
                width: '130px',
                sortable: true,
                type: 'text'
            },
            {
                key: 'createdAt',
                label: 'Updated',
                width: '110px',
                sortable: true,
                type: 'date'
            }
        ];
    }

    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'drg', label: 'Drafting Group' },  // NEW GROUPING OPTION
            { key: 'milestones', label: 'Wave' },
            { key: 'visibility', label: 'Visibility' },
            { key: 'satisfiesRequirements', label: 'Satisfies Requirements' },
            { key: 'supersedsRequirements', label: 'Supersedes Requirements' }
        ];
    }

    // ====================
    // HELPER METHODS (Updated with new options)
    // ====================

    buildDraftingGroupOptions(emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        // Build options from shared DraftingGroup enum
        const drgOptions = Object.keys(DraftingGroup).map(key => ({
            value: key,
            label: getDraftingGroupDisplay(key)
        }));

        return baseOptions.concat(drgOptions);
    }

    buildWaveOptions(emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        if (!this.setupData?.waves) {
            return baseOptions;
        }

        const waveOptions = this.setupData.waves.map(wave => ({
            value: wave.id,
            label: `${wave.year} Q${wave.quarter}`
        }));

        return baseOptions.concat(waveOptions);
    }

    buildOptionsFromSetupData(entityName, emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        if (!this.setupData?.[entityName]) {
            return baseOptions;
        }

        const labelKey = entityName === 'regulatoryAspects' ? 'title' : 'name';
        const setupOptions = this.setupData[entityName].map(entity => ({
            value: entity.id,
            label: entity[labelKey] || entity.name || entity.id
        }));

        return baseOptions.concat(setupOptions);
    }

    getItemId(item) {
        return item?.itemId || item?.id || null;
    }

    // ====================
    // EVENT HANDLERS - UPDATED TO WORK WITH CENTRALIZED STATE
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
        // Update details panel
        this.updateDetailsPanel(item);

        // Notify parent activity of selection change
        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    handleRefresh() {
        console.log('Changes refreshed');
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

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
            <div class="details-scrollable-content">
                ${detailsHtml}
            </div>
        `;

        // Bind details button
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
    // PUBLIC INTERFACE - UPDATED FOR CENTRALIZED STATE
    // ====================

    async render(container) {
        this.container = container;

        // Always start with collection view
        await this.collection.render(container);
        this.currentPerspective = 'collection';
    }

    async refresh() {
        await this.collection.refresh();

        // If in temporal view, update timeline data
        if (this.currentPerspective === 'temporal' && this.timelineGrid) {
            this.timelineGrid.setData(this.collection.data);
        }
    }

    handleFilter(filterKey, filterValue) {
        // Apply filter to collection
        this.collection.handleFilter(filterKey, filterValue);

        // Notify parent activity of filter change
        if (this.app.currentActivity?.updateSharedFilters) {
            this.app.currentActivity.updateSharedFilters(this.collection.currentFilters);
        }

        // If in temporal view, update timeline data with filtered results
        if (this.currentPerspective === 'temporal' && this.timelineGrid) {
            this.timelineGrid.setData(this.collection.filteredData || this.collection.data);
        }
    }

    handleGrouping(groupBy) {
        // Special handling for wave grouping (groups by milestones)
        if (groupBy === 'wave') {
            groupBy = 'milestones';
        }

        this.collection.handleGrouping(groupBy);

        // Notify parent activity of grouping change
        if (this.app.currentActivity?.sharedState) {
            this.app.currentActivity.sharedState.grouping = groupBy;
        }
    }

    cleanup() {
        // Clean up timeline components
        if (this.timelineGrid) {
            this.timelineGrid.cleanup();
            this.timelineGrid = null;
        }

        // Existing cleanup
        this.collection.cleanup();
        this.container = null;
    }

    // ====================
    // MILESTONE MANAGEMENT
    // ====================

    async addMilestone(changeId, milestone) {
        try {
            const response = await apiClient.post(
                `${this.entityConfig.endpoint}/${changeId}/milestones`,
                milestone
            );
            await this.refresh();
            return response;
        } catch (error) {
            console.error('Failed to add milestone:', error);
            throw error;
        }
    }

    async updateMilestone(changeId, milestoneId, milestone) {
        try {
            const response = await apiClient.put(
                `${this.entityConfig.endpoint}/${changeId}/milestones/${milestoneId}`,
                milestone
            );
            await this.refresh();
            return response;
        } catch (error) {
            console.error('Failed to update milestone:', error);
            throw error;
        }
    }

    async deleteMilestone(changeId, milestoneId) {
        try {
            await apiClient.delete(
                `${this.entityConfig.endpoint}/${changeId}/milestones/${milestoneId}`
            );
            await this.refresh();
        } catch (error) {
            console.error('Failed to delete milestone:', error);
            throw error;
        }
    }
}