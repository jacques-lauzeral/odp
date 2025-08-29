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

        // Edition count for display
        this.editionCount = 0;
    }

    async render(container, subPath = []) {
        this.container = container;

        try {
            // Show loading state first
            this.renderLoadingState();

            // Load support data (baselines and waves)
            await this.loadSupportData();

            // Load edition count
            await this.loadEditionCount();

            // Render the activity
            this.renderUI();

            // Load ODP editions entity
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
                    <h1>
                        ODP Publication
                        <span class="publication-context">Edition Management</span>
                    </h1>
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
            // Load baselines and waves in parallel
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

    renderUI() {
        this.container.innerHTML = `
            <div class="publication-activity">
                <div class="publication-header">
                    <h1>
                        ODP Publication
                        <span class="publication-context">Edition Management</span>
                    </h1>
                    <p>Create and manage ODP editions for deployment planning</p>
                    <div class="publication-stats">
                        <span class="edition-count">${this.editionCount} editions</span>
                    </div>
                </div>
                
                <div class="publication-workspace">
                    <div class="collection-container">
                        <div class="collection-filters" id="collectionFilters">
                            <!-- Dynamic filters will be rendered here -->
                        </div>
                        
                        <div class="collection-actions">
                            <div class="publication-actions">
                                <button class="btn btn-primary action-create" id="createEdition">
                                    + New Edition
                                </button>
                            </div>
                        </div>
                        
                        <div class="collection-list">
                            <div class="collection-content" id="editionsContent">
                                <div class="collection-loading">
                                    <div class="spinner"></div>
                                    <p>Loading editions...</p>
                                </div>
                            </div>
                        </div>
                        
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

    bindEvents() {
        // Create edition button
        const createBtn = this.container.querySelector('#createEdition');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }
    }

    async loadEditionsEntity() {
        try {
            // Create and render the editions entity component
            this.currentEntityComponent = new ODPEditionsEntity(
                this.app,
                this.entityConfig,
                this.supportData
            );

            const contentContainer = this.container.querySelector('#editionsContent');
            if (contentContainer) {
                await this.currentEntityComponent.render(contentContainer);

                // After entity is loaded, render dynamic controls
                this.renderDynamicControls();

                // Update edition count
                await this.updateEditionCount();
            }

        } catch (error) {
            console.error('Failed to load editions entity:', error);
            this.renderEntityError(error);
        }
    }

    async loadEditionCount() {
        try {
            const response = await apiClient.get(this.entityConfig.endpoint);
            this.editionCount = Array.isArray(response) ? response.length : 0;
        } catch (error) {
            console.warn('Failed to load edition count:', error);
            this.editionCount = 0;
        }
    }

    async updateEditionCount() {
        try {
            const countSpan = this.container.querySelector('.edition-count');
            if (!countSpan) return;

            const response = await apiClient.get(this.entityConfig.endpoint);
            const count = Array.isArray(response) ? response.length : 0;
            countSpan.textContent = `${count} editions`;
            this.editionCount = count;
        } catch (error) {
            console.warn('Failed to update edition count:', error);
        }
    }

    renderDynamicControls() {
        if (!this.currentEntityComponent) return;

        const filtersContainer = this.container.querySelector('#collectionFilters');
        if (!filtersContainer) return;

        // Get configurations from current entity
        const filterConfig = this.currentEntityComponent.getFilterConfig ?
            this.currentEntityComponent.getFilterConfig() : [];
        const groupingConfig = this.currentEntityComponent.getGroupingConfig ?
            this.currentEntityComponent.getGroupingConfig() : [];

        // Render dynamic filter and grouping controls
        filtersContainer.innerHTML = `
            <div class="group-controls">
                <label for="groupBy">Group by:</label>
                <select id="groupBy" class="form-control group-select">
                    ${groupingConfig.map(option => `
                        <option value="${option.key}">${option.label}</option>
                    `).join('')}
                </select>
            </div>
            
            <div class="filter-controls">
                ${filterConfig.map(filter => this.renderFilterControl(filter)).join('')}
                <button class="filter-clear" id="clearAllFilters" title="Clear all filters">Clear All</button>
            </div>
        `;

        // Bind events for dynamic controls
        this.bindDynamicEvents();
    }

    renderFilterControl(filter) {
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
    }

    bindDynamicEvents() {
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

    handleFilter(filterKey, filterValue) {
        if (this.currentEntityComponent?.handleFilter) {
            this.currentEntityComponent.handleFilter(filterKey, filterValue);
        }
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

    clearAllFilters() {
        // Clear all filter inputs
        const filterInputs = this.container.querySelectorAll('[data-filter-key]');
        filterInputs.forEach(input => {
            if (input.type === 'text') {
                input.value = '';
            } else if (input.tagName === 'SELECT') {
                input.selectedIndex = 0;
            }

            // Trigger clear for each filter
            const filterKey = input.dataset.filterKey;
            this.handleFilter(filterKey, '');
        });
    }

    // Handle Read edition action (navigate to Read activity with edition context)
    handleReadEdition(edition) {
        if (edition && edition.id) {
            this.app.navigateTo(`/read?edition=${edition.id}`);
        }
    }

    renderError(error) {
        this.container.innerHTML = `
            <div class="publication-activity">
                <div class="publication-header">
                    <h1>
                        ODP Publication
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
        const contentContainer = this.container.querySelector('#editionsContent');
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

    // Utility function for debouncing
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

        // Clear references
        this.container = null;
        this.currentEntityComponent = null;
        this.supportData = null;
    }
}