import { apiClient } from '../../shared/api-client.js';
import ODPEditionsEntity from './odp-editions.js';

export default class PublicationActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.currentEntityComponent = null;
        this.supportData = null;
        this.loading = true;

        // Single entity configuration
        this.entityConfig = {
            name: 'ODP Editions',
            endpoint: '/odp-editions',
            context: 'publication'
        };

        // State management
        this.editionCount = 0;
        this.editions = [];
        this.filters = {};
    }

    async render(container, subPath = []) {
        this.container = container;

        try {
            // Show loading state first
            this.renderLoadingState();

            // Load support data (baselines and waves)
            await this.loadSupportData();

            // Load editions data
            await this.loadEditions(this.filters);

            // Render the activity UI
            this.renderUI();

            // Create and render the entity component
            await this.loadEditionsEntity();

        } catch (error) {
            console.error('Failed to render Publication Activity:', error);
            this.renderError(error);
        }
    }

    renderLoadingState() {
        this.container.innerHTML = `
            <div class="publication-activity">
                <div class="publication-header">
                    <h1> ODP Publication  </h1>
                    <p>Create and manage ODP editions for deployment planning</p>
                </div>
                
                <div class="publication-workspace">
                    <div class="collection-container">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <p>Loading publication data...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadSupportData() {
        try {
            const [baselines, waves] = await Promise.all([
                apiClient.get('/baselines'),
                apiClient.get('/waves')
            ]);

            this.supportData = {
                baselines: baselines || [],
                waves: waves || []
            };

            this.loading = false;

        } catch (error) {
            this.loading = false;
            throw new Error(`Failed to load support data: ${error.message}`);
        }
    }

    async loadEditions(filters = {}) {
        try {
            let endpoint = this.entityConfig.endpoint;
            const queryParams = this.buildQueryParams(filters);

            if (Object.keys(queryParams).length > 0) {
                const queryString = new URLSearchParams(queryParams).toString();
                endpoint = `${endpoint}?${queryString}`;
            }

            const response = await apiClient.get(endpoint);
            this.editions = Array.isArray(response) ? response : [];
            this.editionCount = this.editions.length;

            console.log('Editions loaded:', this.editionCount);

            // Inject data to entity component if it exists
            if (this.currentEntityComponent) {
                this.currentEntityComponent.setData(this.editions);
            }

            // Update count badge
            this.updateEditionCountBadge();

        } catch (error) {
            console.error('Failed to load editions:', error);
            this.editions = [];
            this.editionCount = 0;
            throw error;
        }
    }

    buildQueryParams(filters) {
        const queryParams = {};

        if (filters && Object.keys(filters).length > 0) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value && value !== '') {
                    if (Array.isArray(value)) {
                        queryParams[key] = value.join(',');
                    } else {
                        queryParams[key] = value;
                    }
                }
            });
        }

        return queryParams;
    }

    renderUI() {
        this.container.innerHTML = `
            <div class="publication-activity">
                <div class="publication-header">
                    <h1>
                        Publication
                    </h1>
                    <p>Create and manage ODP editions for deployment planning</p>
                    <div class="publication-stats">
                        <span class="edition-count">${this.editionCount} editions</span>
                    </div>
                </div>
                
                <div class="publication-workspace">
                    <!-- Activity-level filters above workspace -->
                    <div class="activity-filters" id="activityFilters">
                        <div class="filter-controls">
                            ${this.renderFilterControls()}
                            <button class="filter-clear" id="clearAllFilters" title="Clear all filters">Clear All</button>
                        </div>
                    </div>

                    <div class="collection-container">
                        <!-- Left column: actions/grouping + list -->
                        <div class="collection-left-column">
                            <div class="collection-actions-and-grouping">
                                <div class="actions-section">
                                    <div class="publication-actions">
                                        <button class="btn btn-primary action-create" id="createEdition">
                                            + New Edition
                                        </button>
                                    </div>
                                </div>
                                <div class="grouping-section">
                                    <label for="groupBy">Group by:</label>
                                    <select id="groupBy" class="form-control group-select">
                                        ${this.renderGroupingOptions()}
                                    </select>
                                </div>
                            </div>
                            
                            <div class="collection-list" id="collectionList">
                                <div class="collection-loading">
                                    <div class="spinner"></div>
                                    <p>Loading editions...</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Right column: details panel -->
                        <div class="collection-details">
                            <div class="details-content" id="detailsContent">
                                <div class="no-selection-message">
                                    <div class="icon">📋</div>
                                    <h3>No edition selected</h3>
                                    <p>Select an edition from the list to view its details</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    renderFilterControls() {
        const filterConfig = this.getFilterConfig();

        return filterConfig.map(filter => {
            switch (filter.type) {
                case 'text':
                    return `
                        <div class="filter-group">
                            <label for="filter-${filter.key}">${filter.label}:</label>
                            <input 
                                type="text" 
                                id="filter-${filter.key}"
                                data-filter-key="${filter.key}"
                                class="form-control filter-input" 
                                placeholder="${filter.placeholder || `Filter by ${filter.label.toLowerCase()}...`}"
                            >
                        </div>
                    `;
                case 'select':
                    return `
                        <div class="filter-group">
                            <label for="filter-${filter.key}">${filter.label}:</label>
                            <select 
                                id="filter-${filter.key}"
                                data-filter-key="${filter.key}"
                                class="form-control filter-select"
                            >
                                ${filter.options.map(option => {
                        if (typeof option === 'string') {
                            return `<option value="${option}">${option}</option>`;
                        } else {
                            return `<option value="${option.value}">${option.label}</option>`;
                        }
                    }).join('')}
                            </select>
                        </div>
                    `;
                default:
                    return '';
            }
        }).join('');
    }

    renderGroupingOptions() {
        const groupingConfig = this.getGroupingConfig();

        return groupingConfig.map(option =>
            `<option value="${option.key}">${option.label}</option>`
        ).join('');
    }

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
                key: 'startsFromWave',
                label: 'Wave',
                type: 'select',
                options: this.buildWaveOptions()
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

    buildWaveOptions() {
        const baseOptions = [{ value: '', label: 'All Waves' }];

        if (!this.supportData?.waves) {
            return baseOptions;
        }

        const waveOptions = this.supportData.waves.map(wave => ({
            value: wave.id,
            label: wave.name || `${wave.year}.${wave.quarter}`
        }));

        return baseOptions.concat(waveOptions);
    }

    bindEvents() {
        // Create edition button
        const createBtn = this.container.querySelector('#createEdition');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }

        // Grouping control
        const groupSelect = this.container.querySelector('#groupBy');
        if (groupSelect) {
            groupSelect.addEventListener('change', (e) => {
                this.handleGrouping(e.target.value);
            });
        }

        // Filter controls
        const filterInputs = this.container.querySelectorAll('[data-filter-key]');
        filterInputs.forEach(input => {
            const filterKey = input.dataset.filterKey;

            if (input.type === 'text') {
                input.addEventListener('input', this.debounce((e) => {
                    this.handleFilter(filterKey, e.target.value);
                }, 300));
            } else if (input.tagName === 'SELECT') {
                input.addEventListener('change', (e) => {
                    this.handleFilter(filterKey, e.target.value);
                });
            }
        });

        // Clear all filters
        const clearAllBtn = this.container.querySelector('#clearAllFilters');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                this.clearAllFilters();
            });
        }
    }

    async loadEditionsEntity() {
        try {
            // Create the editions entity component
            this.currentEntityComponent = new ODPEditionsEntity(
                this.app,
                this.entityConfig,
                this.supportData
            );

            const contentContainer = this.container.querySelector('#collectionList');
            if (contentContainer) {
                // Inject current data to entity
                this.currentEntityComponent.setData(this.editions);

                // Render the entity
                await this.currentEntityComponent.render(contentContainer);
            }

        } catch (error) {
            console.error('Failed to load editions entity:', error);
            this.renderEntityError(error);
        }
    }

    updateEditionCountBadge() {
        const countSpan = this.container?.querySelector('.edition-count');
        if (countSpan) {
            countSpan.textContent = `${this.editionCount} editions`;
        }
    }

    async handleFilter(filterKey, filterValue) {
        // Update filter state
        if (filterValue && filterValue !== '') {
            this.filters[filterKey] = filterValue;
        } else {
            delete this.filters[filterKey];
        }

        console.log('Filter changed:', { filterKey, filterValue, allFilters: this.filters });

        // Reload editions with current filters
        await this.loadEditions(this.filters);
    }

    handleGrouping(groupBy) {
        if (this.currentEntityComponent?.handleGrouping) {
            this.currentEntityComponent.handleGrouping(groupBy);
        }
    }

    handleCreate() {
        if (this.currentEntityComponent?.handleCreate) {
            this.currentEntityComponent.handleCreate();
        }
    }

    async clearAllFilters() {
        // Clear all filter inputs
        const filterInputs = this.container.querySelectorAll('[data-filter-key]');
        filterInputs.forEach(input => {
            if (input.type === 'text') {
                input.value = '';
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            }
        });

        // Clear filter state
        this.filters = {};

        // Reload editions with no filters
        await this.loadEditions({});
    }

    renderError(error) {
        this.container.innerHTML = `
            <div class="publication-activity">
                <div class="publication-header">
                    <h1>
                        Publication
                        <span class="publication-context">Edition Management</span>
                    </h1>
                    <p>Create and manage ODP editions for deployment planning</p>
                </div>
                
                <div class="publication-workspace">
                    <div class="error-container">
                        <h3>Failed to Load Publication Activity</h3>
                        <p>An error occurred while loading the publication interface.</p>
                        <p><strong>Error:</strong> ${error.message}</p>
                        <button class="btn btn-primary" onclick="window.location.reload()">
                            Reload Page
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    renderEntityError(error) {
        const contentContainer = this.container.querySelector('#collectionList');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="error-state">
                    <h3>Failed to Load ODP Editions</h3>
                    <p>Error: ${error.message}</p>
                    <button class="btn btn-secondary" onclick="window.location.reload()">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }

    getSupportData() {
        return this.supportData;
    }

    isLoading() {
        return this.loading;
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    cleanup() {
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        this.container = null;
        this.currentEntityComponent = null;
        this.supportData = null;
        this.editions = [];
        this.filters = {};
    }
}