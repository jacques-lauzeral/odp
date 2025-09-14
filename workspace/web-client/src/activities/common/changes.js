import CollectionEntity from '../../components/odp/collection-entity.js';
import ChangeForm from './change-form.js';
import TimelineGrid from '../../components/odp/timeline-grid.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';
import { format } from '../../shared/utils.js';

export default class ChangesEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Perspective tracking
        this.currentPerspective = 'collection';
        this.timelineGrid = null;

        // Initialize collection with custom column types (unchanged)
        const customColumnTypes = {
            ...odpColumnTypes,
            'milestone-waves': {  // Renamed
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
    // PERSPECTIVE SWITCHING
    // ====================

    handlePerspectiveSwitch(perspective) {
        console.log(`ChangesEntity.handlePerspectiveSwitch to ${perspective}`);

        if (perspective === this.currentPerspective) {
            return; // Already in this perspective
        }

        this.currentPerspective = perspective;

        if (perspective === 'temporal') {
            this.renderTemporalView();
        } else if (perspective === 'collection') {
            this.renderCollectionView();
        }
    }

    renderTemporalView() {
        if (!this.container) return;

        console.log('ChangesEntity.renderTemporalView - rendering temporal view');

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

        // Set data from collection
        if (this.collection?.data) {
            this.timelineGrid.setData(this.collection.data);
        }
    }

    renderCollectionView() {
        if (!this.container) return;

        console.log('ChangesEntity.renderCollectionView - rendering collection view');

        // Re-render the collection component
        this.collection.render(this.container);
    }

    handleTimelineItemSelect(item) {
        console.log('Timeline item selected:', item?.itemId || item?.id);

        // Update details panel (reuse existing logic)
        this.handleItemSelect(item);

        // Sync selection with collection if in collection view
        if (this.currentPerspective === 'collection' && this.collection) {
            this.collection.selectedItem = item;
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
    }

    // ====================
    // COLLECTION CONFIGURATION - ENHANCED FOR SERVER-SIDE FILTERING
    // ====================

    getFilterConfig() {
        return [
            // Changed: Replace 'title' pattern matching with server-side 'text' full-text search
            {
                key: 'text',
                label: 'Full Text Search',
                type: 'text',
                placeholder: 'Search across title and description...'
            },
            {
                key: 'visibility',
                label: 'Visibility',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'NETWORK', label: 'NETWORK' },
                    { value: 'NM', label: 'NM' }
                ]
            },
            // New: Add indirect category filtering via requirements
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
            // Keep: Existing wave filter (already working)
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
            { key: 'milestones', label: 'Wave' },
            { key: 'visibility', label: 'Visibility' },
            { key: 'satisfiesRequirements', label: 'Satisfies Requirements' },
            { key: 'supersedsRequirements', label: 'Supersedes Requirements' }
        ];
    }

    // ====================
    // HELPER METHODS
    // ====================

    extractWaveFromMilestones(item) {
        if (!item?.milestones || !Array.isArray(item.milestones) || item.milestones.length === 0) {
            return null;
        }

        // Find the first milestone with a wave
        const milestoneWithWave = item.milestones.find(m => m.wave || m.waveId);
        if (!milestoneWithWave) return null;

        // Return wave object or ID
        if (milestoneWithWave.wave) {
            return milestoneWithWave.wave;
        }

        // If only waveId, find in setup data
        if (milestoneWithWave.waveId && this.setupData?.waves) {
            return this.setupData.waves.find(w => w.id === milestoneWithWave.waveId);
        }

        return milestoneWithWave.waveId;
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
        // Show read-only modal in review mode
        this.form.showReadOnlyModal(item || this.collection.selectedItem);
    }

    handleItemSelect(item) {
        // Update details panel
        this.updateDetailsPanel(item);
    }

    handleRefresh() {
        // Any additional refresh logic
        console.log('Changes refreshed');
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        const isReviewMode = this.app.currentActivity?.config?.mode === 'review';
        const detailsButtonText = isReviewMode ? 'Review' : 'Edit';
        const detailsHtml = await this.form.generateReadOnlyView(item);
        detailsContainer.innerHTML = `
        <div class="details-sticky-header">
            <div class="item-title-section">
                <h3 class="item-title">${item.title || `${item.type || 'Item'} ${item.itemId}`}</h3>
                <span class="item-id">${item.type ? `[${item.type}] ` : ''}${item.itemId}</span>
            </div>
            <div class="details-actions">
                <button class="btn btn-primary btn-sm" id="detailsBtn">${detailsButtonText}</button>
                <!-- Placeholder for future Delete button -->
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
    // PUBLIC INTERFACE
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
        // Apply filter to collection first
        this.collection.handleFilter(filterKey, filterValue);

        // If in temporal view, update timeline data
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
    }

    handleEditModeToggle(enabled) {
        // Future: Handle inline editing mode
        console.log('Edit mode:', enabled);
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