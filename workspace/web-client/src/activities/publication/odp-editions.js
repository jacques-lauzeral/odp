import CollectionEntity from '../../components/odp/collection-entity.js';
import ODPEditionForm from './odp-edition-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';

export default class ODPEditionsEntity {
    constructor(app, entityConfig, supportData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.supportData = supportData;
        this.container = null;

        // Initialize collection with ODP column types
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { supportData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate(),
            onRefresh: () => this.handleRefresh(),
            getEmptyStateMessage: () => ({
                icon: '📋',
                title: 'No Editions Yet',
                description: 'Start creating ODP editions to publish deployment plans.',
                createButtonText: 'Create First Edition',
                showCreateButton: true
            })
        });

        // Initialize form
        this.form = new ODPEditionForm(entityConfig, supportData);

        // Listen for save events
        document.addEventListener('entitySaved', async (e) => {
            if (e.detail.entityType === 'ODP Editions') {
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
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                    { value: '', label: 'All Types' },
                    { value: 'DRAFT', label: 'DRAFT' },
                    { value: 'OFFICIAL', label: 'OFFICIAL' }
                ]
            },
            {
                key: 'title',
                label: 'Title Pattern',
                type: 'text',
                placeholder: 'Search in title...'
            },
            {
                key: 'baseline',
                label: 'Baseline',
                type: 'select',
                options: this.buildBaselineOptions()
            },
            {
                key: 'startsFromWave',
                label: 'Wave',
                type: 'select',
                options: this.buildWaveOptions()
            }
        ];
    }

    getColumnConfig() {
        return [
            {
                key: 'id',
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
                key: 'type',
                label: 'Type',
                width: '100px',
                sortable: true,
                type: 'enum',
                enumLabels: {
                    'DRAFT': 'Draft',
                    'OFFICIAL': 'Official'
                },
                enumStyles: {
                    'DRAFT': 'item-badge edition-draft',
                    'OFFICIAL': 'item-badge edition-official'
                },
                groupPriority: { 'DRAFT': 1, 'OFFICIAL': 2 }
            },
            {
                key: 'startsFromWave',
                label: 'Starts From Wave',
                width: '140px',
                sortable: true,
                type: 'wave',
                noneLabel: 'No Wave'
            },
            {
                key: 'createdBy',
                label: 'Created By',
                width: '130px',
                sortable: true,
                type: 'text'
            },
            {
                key: 'createdAt',
                label: 'Created',
                width: '110px',
                sortable: true,
                type: 'date'
            }
        ];
    }

    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'type', label: 'Type' },
            { key: 'baseline', label: 'Baseline' },
            { key: 'startsFromWave', label: 'Wave' }
        ];
    }

    // ====================
    // HELPER METHODS
    // ====================

    buildBaselineOptions() {
        const baseOptions = [{ value: '', label: 'All Baselines' }];

        if (!this.supportData?.baselines) {
            return baseOptions;
        }

        const baselineOptions = this.supportData.baselines.map(baseline => ({
            value: baseline.id,
            label: baseline.title || `Baseline ${baseline.id}`
        }));

        return baseOptions.concat(baselineOptions);
    }

    buildWaveOptions() {
        const baseOptions = [{ value: '', label: 'All Waves' }];

        if (!this.supportData?.waves) {
            return baseOptions;
        }

        const waveOptions = this.supportData.waves.map(wave => ({
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

    handleRead(item) {
        if (item && item.id) {
            // Navigate to Read activity with edition context
            this.app.navigateTo(`/read?edition=${item.id}`);
        }
    }

    handleItemSelect(item) {
        // Update details panel
        this.updateDetailsPanel(item);
    }

    handleRefresh() {
        console.log('Editions refreshed');
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        const detailsHtml = await this.form.generateReadOnlyView(item);
        detailsContainer.innerHTML = `
            <div class="details-sticky-header">
                <div class="item-title-section">
                    <h3 class="item-title">${item.title || `Edition ${item.id}`}</h3>
                    <span class="item-id">[${item.type}] ${item.id}</span>
                </div>
                <div class="details-actions">
                    <button class="btn btn-primary btn-sm" id="readEditionBtn">Read Edition</button>
                </div>
            </div>
            <div class="details-scrollable-content">
                ${detailsHtml}
            </div>
        `;

        // Bind read button
        const readBtn = detailsContainer.querySelector('#readEditionBtn');
        if (readBtn) {
            readBtn.addEventListener('click', () => this.handleRead(item));
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
        this.collection.handleFilter(filterKey, filterValue);
    }

    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);
    }

    cleanup() {
        this.collection.cleanup();
        this.container = null;
    }
}