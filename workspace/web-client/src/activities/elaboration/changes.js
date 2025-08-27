import CollectionEntity from '../../components/odp/collection-entity.js';
import ChangeForm from './change-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';
import { format } from '../../shared/utils.js';

export default class ChangesEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Initialize collection with custom column types (unchanged)
        const customColumnTypes = {
            ...odpColumnTypes,
            'milestone-wave': {
                render: (value, column, item, context) => {
                    const wave = this.extractWaveFromMilestones(item);
                    if (!wave) return '-';
                    return odpColumnTypes.wave.render(wave, column, item, context);
                },
                filter: (value, filterValue, column) => {
                    if (!filterValue) return true;
                    const wave = this.extractWaveFromMilestones({ milestones: value });
                    if (!wave) return false;
                    return odpColumnTypes.wave.filter(wave, filterValue, column);
                },
                getFilterOptions: (column, context) => odpColumnTypes.wave.getFilterOptions(column, context),
                sort: (a, b, column) => {
                    const waveA = this.extractWaveFromMilestones({ milestones: a });
                    const waveB = this.extractWaveFromMilestones({ milestones: b });
                    return odpColumnTypes.wave.sort(waveA, waveB, column);
                }
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

        // CHANGED: Initialize form using new inheritance pattern
        this.form = new ChangeForm(entityConfig, setupData);

        // Listen for save events
        document.addEventListener('entitySaved', async(e) => {
            if (e.detail.entityType === 'Operational Changes') {
                await this.collection.refresh();
            }
        });
    }

    // ====================
    // COLLECTION CONFIGURATION
    // ====================

    getFilterConfig() {
        return [
            {
                key: 'title',
                label: 'Title Pattern',
                type: 'text',
                placeholder: 'Search in title...'
            },
            {
                key: 'milestones',
                label: 'Wave',
                type: 'select',
                options: this.buildWaveOptions()
            },
            {
                key: 'visibility',
                label: 'Visibility',
                type: 'select',
                options: [
                    { value: '', label: 'All Visibility' },
                    { value: 'NETWORK', label: 'NETWORK' },
                    { value: 'NM', label: 'NM' }
                ]
            },
            {
                key: 'satisfiesRequirements',
                label: 'Satisfies Requirements',
                type: 'text',
                placeholder: 'Requirement ID or title...'
            },
            {
                key: 'supersedsRequirements',
                label: 'Supersedes Requirements',
                type: 'text',
                placeholder: 'Requirement ID or title...'
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
                label: 'Wave',
                width: '100px',
                sortable: true,
                type: 'milestone-wave'
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

    buildWaveOptions() {
        const baseOptions = [{ value: '', label: 'All Waves' }];

        if (!this.setupData?.waves) {
            return baseOptions;
        }

        const waveOptions = this.setupData.waves.map(wave => ({
            value: wave.id,
            label: `${wave.year} Q${wave.quarter}`
        }));

        return baseOptions.concat(waveOptions);
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

        const detailsHtml = await this.form.generateReadOnlyView(item);
        detailsContainer.innerHTML = `
        <div class="details-sticky-header">
            <div class="item-title-section">
                <h3 class="item-title">${item.title || `${item.type || 'Item'} ${item.itemId}`}</h3>
                <span class="item-id">${item.type ? `[${item.type}] ` : ''}${item.itemId}</span>
            </div>
            <div class="details-actions">
                <button class="btn btn-primary btn-sm" id="editItemBtn">Edit</button>
                <!-- Placeholder for future Delete button -->
            </div>
        </div>
        <div class="details-scrollable-content">
            ${detailsHtml}
        </div>
        `;

        // Bind edit button
        const editBtn = detailsContainer.querySelector('#editItemBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.handleEdit(item));
        }
    }

    // ====================
    // PUBLIC INTERFACE
    // ====================

    async render(container) {
        this.container = container;
        await this.collection.render(container);
    }

    async refresh() {
        await this.collection.refresh();
    }

    handleFilter(filterKey, filterValue) {
        // Special handling for wave filter (filters by milestones)
        if (filterKey === 'wave') {
            filterKey = 'milestones';
        }

        // Special handling for requirement reference filters
        if (filterKey === 'satisfiesRequirements' || filterKey === 'supersedsRequirements') {
            // These are entity reference lists, filter will check title/id
            this.collection.handleFilter(filterKey, filterValue);
        } else {
            this.collection.handleFilter(filterKey, filterValue);
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