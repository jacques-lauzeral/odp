import { async as asyncUtils } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class AbstractInteractionActivity {
    constructor(app, config) {
        this.app = app;
        this.container = null;
        this.currentEntity = 'requirements'; // Default to requirements
        this.currentEntityComponent = null;
        this.setupData = null;
        this.loading = true;

        // Configuration from child classes
        this.config = {
            activityName: 'ODP Interaction',
            context: 'Repository',
            description: 'Interact with ODP content',
            mode: 'edit', // 'edit' or 'review'
            dataSource: 'repository', // 'repository' or editionId
            ...config
        };

        // Entity configuration for ODP Interaction Activities
        this.entities = {
            'requirements': {
                name: 'Operational Requirements',
                endpoint: '/operational-requirements',
                context: this.config.context
            },
            'changes': {
                name: 'Operational Changes',
                endpoint: '/operational-changes',
                context: this.config.context
            }
        };

        // Entity counts for tab badges
        this.entityCounts = {
            'requirements': 0,
            'changes': 0
        };
    }

    async render(container, subPath = []) {
        this.container = container;

        // Parse entity from subPath
        if (subPath.length > 0 && this.entities[subPath[0]]) {
            this.currentEntity = subPath[0];
        }

        try {
            // Show loading state first
            this.renderLoadingState();

            // Load setup data
            await this.loadSetupData();

            // Load entity counts with edition context
            await this.loadEntityCounts();

            // Render the activity
            this.renderUI();

            // Load current entity
            await this.loadCurrentEntity();

        } catch (error) {
            console.error(`Failed to render ${this.config.activityName} Activity:`, error);
            this.renderError(error);
        }
    }

    renderLoadingState() {
        const activityClass = this.config.activityName.toLowerCase();
        const contextLabel = this.getContextLabel();

        this.container.innerHTML = `
            <div class="${activityClass}-activity">
                <div class="${activityClass}-header">
                    <h1>
                        ODP ${this.config.activityName}
                        <span class="context-label">${contextLabel}</span>
                    </h1>
                    <p>${this.config.description}</p>
                </div>
                
                <div class="${activityClass}-workspace">
                    <div class="collection-container">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <p>Loading setup data...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadSetupData() {
        try {
            // Load all setup entities in parallel
            const [
                stakeholderCategories,
                dataCategories,
                regulatoryAspects,
                services,
                waves
            ] = await Promise.all([
                apiClient.get('/stakeholder-categories'),
                apiClient.get('/data-categories'),
                apiClient.get('/regulatory-aspects'),
                apiClient.get('/services'),
                apiClient.get('/waves')
            ]);

            this.setupData = {
                stakeholderCategories: stakeholderCategories || [],
                dataCategories: dataCategories || [],
                regulatoryAspects: regulatoryAspects || [],
                services: services || [],
                waves: waves || []
            };

            this.loading = false;

        } catch (error) {
            this.loading = false;
            throw new Error(`Failed to load setup data: ${error.message}`);
        }
    }

    renderUI() {
        const activityClass = this.config.activityName.toLowerCase();
        const contextLabel = this.getContextLabel();

        // FIXED: Use consistent tab styling across all interaction activities
        // Use 'interaction' as base class instead of activity-specific classes
        this.container.innerHTML = `
            <div class="${activityClass}-activity">
                <div class="${activityClass}-header">
                    <h1>
                        ODP ${this.config.activityName}
                        <span class="context-label">${contextLabel}</span>
                    </h1>
                    <p>${this.config.description}</p>
                </div>
                
                <div class="interaction-tabs">
                    ${Object.entries(this.entities).map(([key, entity]) => `
                        <button 
                            class="interaction-tab ${key === this.currentEntity ? 'interaction-tab--active' : ''}"
                            data-entity="${key}"
                        >
                            <span class="interaction-tab__name">${entity.name}</span>
                            <span class="interaction-tab__count" id="${key}-count">${this.entityCounts[key] || 0}</span>
                        </button>
                    `).join('')}
                </div>
                
                <div class="${activityClass}-workspace">
                    <div class="collection-container">
                        <div class="collection-filters" id="collectionFilters">
                            <!-- Dynamic filters will be rendered here -->
                        </div>
                        
                        <div class="collection-actions">
                            <div class="${activityClass}-actions">
                                ${this.renderActionButtons()}
                            </div>
                        </div>
                        
                        <div class="collection-list">
                            <div class="collection-content" id="entityContent">
                                <div class="collection-loading">
                                    <div class="spinner"></div>
                                    <p>Loading ${this.entities[this.currentEntity].name.toLowerCase()}...</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="collection-details">
                            <div class="details-content" id="detailsContent">
                                <div class="no-selection-message">
                                    <div class="icon">📄</div>
                                    <h3>No item selected</h3>
                                    <p>Select an item from the list to view its details</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindEvents();
    }

    renderActionButtons() {
        // Force subclasses to implement their own action buttons
        throw new Error(`renderActionButtons() must be implemented by ${this.constructor.name}`);
    }

    getContextLabel() {
        if (this.config.dataSource === 'repository') {
            return this.config.context;
        } else if (this.config.dataSource && this.config.dataSource !== 'repository') {
            // Assume it's an edition ID
            return `Edition: ${this.config.editionTitle || this.config.dataSource}`;
        }
        return this.config.context;
    }

    bindEvents() {
        // FIXED: Use consistent interaction-tab class for event binding
        // Entity tab switching
        const tabs = this.container.querySelectorAll('.interaction-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const entity = e.currentTarget.dataset.entity;
                if (entity !== this.currentEntity) {
                    this.switchEntity(entity);
                }
            });
        });

        // Action buttons
        const createBtn = this.container.querySelector('#createEntity');
        const exportBtn = this.container.querySelector('#exportContent');
        const commentBtn = this.container.querySelector('#commentMode');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExport());
        }
        if (commentBtn) {
            commentBtn.addEventListener('click', () => this.handleCommentMode());
        }

        // Dynamic filter and grouping controls will be bound when entity loads
    }

    async switchEntity(entity) {
        if (!this.entities[entity]) {
            console.error('Unknown entity:', entity);
            return;
        }

        // Clean up current entity component
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        this.currentEntity = entity;

        // Clear details panel when switching entities
        const detailsContainer = this.container.querySelector('#detailsContent');
        if (detailsContainer) {
            detailsContainer.innerHTML = `
            <div class="no-selection-message">
                <div class="icon">📄</div>
                <h3>No item selected</h3>
                <p>Select an item from the list to view its details</p>
            </div>
        `;
        }

        // Update URL
        const activityName = this.config.activityName.toLowerCase();
        const newPath = `/${activityName}/${entity}`;
        window.history.pushState(null, '', newPath);

        // FIXED: Update active tab using consistent class names
        const tabs = this.container.querySelectorAll('.interaction-tab');
        tabs.forEach(tab => {
            if (tab.dataset.entity === entity) {
                tab.classList.add('interaction-tab--active');
            } else {
                tab.classList.remove('interaction-tab--active');
            }
        });

        // Update create button text (if in edit mode)
        if (this.config.mode === 'edit') {
            const createBtn = this.container.querySelector('#createEntity');
            if (createBtn) {
                createBtn.textContent = `+ New ${this.getSingularEntityName(entity)}`;
            }
        }

        // Load new entity
        await this.loadCurrentEntity();
    }

    async loadCurrentEntity() {
        try {
            const entityConfig = this.entities[this.currentEntity];

            // Dynamic import the entity component from common directory
            const entityModule = await import(`../common/${this.currentEntity}.js`);
            const EntityComponent = entityModule.default;

            // Create entity component with mode configuration
            const entityOptions = {
                mode: this.config.mode,
                dataSource: this.config.dataSource,
                editionContext: this.config.editionContext
            };

            // Create and render the entity component with setup data and options
            this.currentEntityComponent = new EntityComponent(this.app, entityConfig, this.setupData, entityOptions);

            const contentContainer = this.container.querySelector('#entityContent');
            if (contentContainer) {
                await this.currentEntityComponent.render(contentContainer);

                // After entity is loaded, render dynamic controls
                this.renderDynamicControls();

                // FIXED: Update count badge after entity loads its filtered data
                await this.updateEntityCountAfterLoad(this.currentEntity);
            }

        } catch (error) {
            console.error(`Failed to load ${this.currentEntity} component:`, error);
            this.renderEntityError(error);
        }
    }

    // FIXED: Resolve edition context before loading counts
    async loadEntityCounts() {
        try {
            const promises = Object.entries(this.entities).map(async ([key, entity]) => {
                try {
                    let endpoint = entity.endpoint;

                    // Check if we have edition context that needs resolution
                    if (this.config.dataSource &&
                        this.config.dataSource !== 'repository' &&
                        this.config.dataSource !== 'Repository' &&
                        typeof this.config.dataSource === 'string' &&
                        this.config.dataSource.match(/^\d+$/)) {

                        console.log(`Loading count for ${key} with edition context: ${this.config.dataSource}`);

                        // Step 1: Fetch the edition details to get baseline and wave references
                        const edition = await apiClient.get(`/odp-editions/${this.config.dataSource}`);

                        // Step 2: Build query parameters from resolved context
                        const queryParams = {};
                        if (edition.baseline?.id) {
                            queryParams.baseline = edition.baseline.id;
                        }
                        if (edition.startsFromWave?.id) {
                            queryParams.fromWave = edition.startsFromWave.id;
                        }

                        // Step 3: Append query parameters if we have any
                        if (Object.keys(queryParams).length > 0) {
                            const queryString = new URLSearchParams(queryParams).toString();
                            endpoint = `${endpoint}?${queryString}`;
                        }
                    }

                    const response = await apiClient.get(endpoint);
                    this.entityCounts[key] = Array.isArray(response) ? response.length : 0;
                    console.log(`Loaded count for ${key}: ${this.entityCounts[key]}`);
                } catch (error) {
                    console.warn(`Failed to load count for ${key}:`, error);
                    this.entityCounts[key] = 0;
                }
            });

            await Promise.all(promises);
        } catch (error) {
            console.error('Failed to load entity counts:', error);
        }
    }

    // FIXED: Update individual count with proper edition context resolution
    async updateEntityCountAfterLoad(entityType) {
        try {
            const badge = this.container.querySelector(`#${entityType}-count`);
            if (!badge) return;

            // Get count from the loaded entity component if available
            if (this.currentEntityComponent?.collection?.data) {
                const count = this.currentEntityComponent.collection.data.length;
                badge.textContent = count || '0';
                this.entityCounts[entityType] = count;
                console.log(`Updated ${entityType} count from loaded data: ${count}`);
                return;
            }

            // Fallback to API call with edition context resolution
            const entity = this.entities[entityType];
            if (entity) {
                let endpoint = entity.endpoint;

                if (this.config.dataSource &&
                    this.config.dataSource !== 'repository' &&
                    this.config.dataSource !== 'Repository' &&
                    typeof this.config.dataSource === 'string' &&
                    this.config.dataSource.match(/^\d+$/)) {

                    // Resolve edition context
                    const edition = await apiClient.get(`/odp-editions/${this.config.dataSource}`);
                    const queryParams = {};
                    if (edition.baseline?.id) {
                        queryParams.baseline = edition.baseline.id;
                    }
                    if (edition.startsFromWave?.id) {
                        queryParams.fromWave = edition.startsFromWave.id;
                    }

                    if (Object.keys(queryParams).length > 0) {
                        const queryString = new URLSearchParams(queryParams).toString();
                        endpoint = `${endpoint}?${queryString}`;
                    }
                }

                const response = await apiClient.get(endpoint);
                const count = Array.isArray(response) ? response.length : 0;
                badge.textContent = count || '0';
                this.entityCounts[entityType] = count;
            }
        } catch (error) {
            // Silently fail count updates - not critical
            console.warn(`Failed to update ${entityType} count:`, error);
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
            
            <div class="perspective-toggle">
                <button class="perspective-option perspective-option--active" data-perspective="collection">
                    📋 Collection
                </button>
                <button class="perspective-option" data-perspective="hierarchical" disabled title="Coming soon">
                    📁 Hierarchical
                </button>
                <button class="perspective-option" data-perspective="temporal" disabled title="Coming soon">
                    📅 Temporal
                </button>
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
                input.addEventListener('input', asyncUtils.debounce((e) => {
                    this.handleSpecificFilter(filterKey, e.target.value);
                }, 300));
            } else if (input.tagName === 'SELECT') {
                input.addEventListener('change', (e) => {
                    this.handleSpecificFilter(filterKey, e.target.value);
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

        // Perspective toggle (placeholder for future)
        const perspectiveButtons = this.container.querySelectorAll('.perspective-option');
        perspectiveButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const perspective = e.currentTarget.dataset.perspective;
                if (perspective === 'collection') {
                    // Already active - no action needed
                    return;
                }
                // Future: Handle hierarchical and temporal perspectives
                console.log(`${perspective} perspective not yet implemented`);
            });
        });
    }

    handleSpecificFilter(filterKey, filterValue) {
        if (this.currentEntityComponent?.handleFilter) {
            this.currentEntityComponent.handleFilter(filterKey, filterValue);
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
            this.handleSpecificFilter(filterKey, '');
        });
    }

    // Event handlers for Collection perspective
    handleFilter(filterText) {
        // Legacy method - now handled by handleSpecificFilter
        if (this.currentEntityComponent?.handleTextFilter) {
            this.currentEntityComponent.handleTextFilter(filterText);
        }
    }

    handleGrouping(groupBy) {
        if (this.currentEntityComponent?.handleGrouping) {
            this.currentEntityComponent.handleGrouping(groupBy);
        }
    }

    handleCreate() {
        if (this.config.mode !== 'edit') return;

        if (this.currentEntityComponent?.handleCreate) {
            this.currentEntityComponent.handleCreate();
        }
    }

    handleExport() {
        if (this.config.mode !== 'review') return;

        // TODO: Implement export functionality
        console.log('Export functionality not yet implemented');
    }

    handleCommentMode() {
        if (this.config.mode !== 'review') return;

        // TODO: Implement comment mode functionality
        console.log('Comment mode functionality not yet implemented');
    }

    renderError(error) {
        const activityClass = this.config.activityName.toLowerCase();

        this.container.innerHTML = `
            <div class="${activityClass}-activity">
                <div class="${activityClass}-header">
                    <h1>
                        ODP ${this.config.activityName}
                        <span class="context-label">${this.getContextLabel()}</span>
                    </h1>
                    <p>${this.config.description}</p>
                </div>
                
                <div class="${activityClass}-workspace">
                    <div class="error-container">
                        <h3>Failed to Load ${this.config.activityName} Activity</h3>
                        <p>An error occurred while loading the ${this.config.activityName.toLowerCase()} interface.</p>
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
        const contentContainer = this.container.querySelector('#entityContent');
        if (contentContainer) {
            contentContainer.innerHTML = `
                <div class="error-state">
                    <h3>Failed to Load ${this.entities[this.currentEntity].name}</h3>
                    <p>Error: ${error.message}</p>
                    <button class="btn btn-secondary" onclick="window.location.reload()">
                        Reload Page
                    </button>
                </div>
            `;
        }
    }

    getSingularEntityName(entityKey) {
        const entityMap = {
            'requirements': 'Requirement',
            'changes': 'Change'
        };
        return entityMap[entityKey] || 'Item';
    }

    getSetupData() {
        return this.setupData;
    }

    isLoading() {
        return this.loading;
    }

    cleanup() {
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        // Clear references
        this.container = null;
        this.currentEntityComponent = null;
        this.setupData = null;
    }
}