import CollectionEntity from '../../components/odp/collection-entity.js';
import ODPEditionForm from './odp-edition-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';

export default class ODPEditionsEntity {
    constructor(app, entityConfig, supportData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.supportData = supportData;
        this.container = null;
        this.data = [];

        // Initialize collection with ODP column types
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { supportData },
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
                await this.handleRefresh();
            }
        });
    }

    // ====================
    // DATA INJECTION
    // ====================

    setData(editions) {
        this.data = Array.isArray(editions) ? editions : [];
        console.log('ODPEditionsEntity.setData:', this.data.length);

        // Inject data to collection
        this.collection.setData(this.data);
    }

    // ====================
    // COLLECTION CONFIGURATION
    // ====================

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
                type: 'entity-reference',
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
            { key: 'startsFromWave', label: 'Wave' }
        ];
    }

    // ====================
    // EVENT HANDLERS
    // ====================

    handleCreate() {
        this.form.showCreateModal();
    }

    handleReviewEdition(item) {
        if (item && item.id) {
            this.app.navigateTo(`/review/edition/${item.id}`);
        }
    }

    handleItemSelect(item) {
        this.updateDetailsPanel(item);
    }

    handleRefresh() {
        // Notify parent activity to reload data
        if (this.app.currentActivity?.loadEditions) {
            this.app.currentActivity.loadEditions(this.app.currentActivity.filters);
        }
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        // Preserve current tab before re-rendering
        const currentTab = this.getCurrentTabInPanel(detailsContainer);

        const detailsHtml = await this.form.generateReadOnlyView(item);
        detailsContainer.innerHTML = `
            <div class="details-sticky-header">
                <div class="item-title-section">
                    <h3 class="item-title">${item.title || `Edition ${item.id}`}</h3>
                    <span class="item-id">[${item.type}] ${item.id}</span>
                </div>
                <div class="details-actions">
                    <button class="btn btn-primary btn-sm" id="reviewEditionBtn">Review Edition</button>
                </div>
            </div>
            <div class="details-scrollable-content">
                ${detailsHtml}
            </div>
        `;

        // Restore tab if it was not the first tab
        if (currentTab !== null && currentTab !== 0) {
            this.switchTabInPanel(detailsContainer, currentTab);
        }

        const reviewBtn = detailsContainer.querySelector('#reviewEditionBtn');
        if (reviewBtn) {
            reviewBtn.addEventListener('click', () => this.handleReviewEdition(item));
        }
    }

    getCurrentTabInPanel(container) {
        const activeTab = container.querySelector('.tab-header.active');
        return activeTab ? parseInt(activeTab.getAttribute('data-tab'), 10) : 0;
    }

    switchTabInPanel(container, tabIndex) {
        const headers = container.querySelectorAll('.tab-header');
        const panels = container.querySelectorAll('.tab-panel');

        headers.forEach((header, index) => {
            header.classList.toggle('active', index === tabIndex);
        });

        panels.forEach((panel, index) => {
            panel.classList.toggle('active', index === tabIndex);
        });
    }

    // ====================
    // PUBLIC INTERFACE
    // ====================

    async render(container) {
        this.container = container;
        await this.collection.render(container);
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
        this.data = [];
    }
}