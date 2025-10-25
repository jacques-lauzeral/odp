import { async as asyncUtils } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';
import {
    MilestoneEventType,
    getMilestoneEventDisplay
} from '/shared/src/index.js';

export default class AbstractInteractionActivity {
    constructor(app, config) {
        this.app = app;
        this.container = null;
        this.currentEntity = 'requirements'; // Default to requirements
        this.currentEntityComponent = null;
        this.currentPerspective = 'collection'; // Track current perspective
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

        // NEW: Entity counts with type breakdowns
        this.entityCounts = {
            'requirements': { ON: 0, OR: 0, total: 0 },
            'changes': { total: 0 }
        };

        // Centralized state management for perspective coordination
        this.sharedState = {
            filters: {},
            selectedItem: null,
            grouping: 'none',
            // Temporal-specific state
            timeWindow: { start: null, end: null },
            eventTypeFilters: ['ANY']
        };

        // Available event types from shared enum (5 specific milestone events)
        this.availableEventTypes = Object.keys(MilestoneEventType);

        // Cache for filtered entity data (to avoid re-fetching when switching tabs)
        this.cachedEntityData = {
            requirements: null,
            changes: null
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

            // Initialize temporal state
            this.initializeTimeWindow();

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
                services,
                documents,
                waves
            ] = await Promise.all([
                apiClient.get('/stakeholder-categories'),
                apiClient.get('/data-categories'),
                apiClient.get('/services'),
                apiClient.get('/documents'),
                apiClient.get('/waves')
            ]);

            this.setupData = {
                stakeholderCategories: stakeholderCategories || [],
                dataCategories: dataCategories || [],
                services: services || [],
                documents: documents || [],
                waves: waves || []
            };

            this.loading = false;

        } catch (error) {
            this.loading = false;
            throw new Error(`Failed to load setup data: ${error.message}`);
        }
    }

    initializeTimeWindow() {
        const now = new Date();
        const threeYearsLater = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate());

        if (this.setupData?.waves && this.setupData.waves.length > 0) {
            // Find waves in the next 3 years
            const relevantWaves = this.setupData.waves.filter(wave => {
                const waveDate = new Date(wave.year, (wave.quarter - 1) * 3, 1);
                return waveDate >= now && waveDate <= threeYearsLater;
            });

            if (relevantWaves.length > 0) {
                // Sort waves by date
                relevantWaves.sort((a, b) => {
                    if (a.year !== b.year) return a.year - b.year;
                    return a.quarter - b.quarter;
                });

                const firstWave = relevantWaves[0];
                const lastWave = relevantWaves[relevantWaves.length - 1];

                this.sharedState.timeWindow.start = new Date(firstWave.year, (firstWave.quarter - 1) * 3, 1);
                this.sharedState.timeWindow.end = new Date(lastWave.year, (lastWave.quarter - 1) * 3 + 3, 0);
            } else {
                // Fallback if no waves in range
                this.sharedState.timeWindow.start = now;
                this.sharedState.timeWindow.end = threeYearsLater;
            }
        } else {
            this.sharedState.timeWindow.start = now;
            this.sharedState.timeWindow.end = threeYearsLater;
        }
    }

    // State preservation methods
    preserveCurrentState() {
        // Read current filter values from UI inputs (the actual source of truth)
        const filterInputs = this.container.querySelectorAll('[data-filter-key]');
        const currentFilters = {};

        filterInputs.forEach(input => {
            const filterKey = input.dataset.filterKey;
            let filterValue = '';

            if (input.type === 'text') {
                filterValue = input.value;
            } else if (input.tagName === 'SELECT') {
                filterValue = input.value;
            }

            if (filterValue && filterValue !== '') {
                currentFilters[filterKey] = filterValue;
            }
        });

        this.sharedState.filters = currentFilters;

        // Preserve selection and grouping from collection if available
        if (this.currentEntityComponent?.collection) {
            this.sharedState.selectedItem = this.currentEntityComponent.collection.selectedItem;
            this.sharedState.grouping = this.currentEntityComponent.collection.currentGrouping;
        }

        console.log('Preserved shared state:', this.sharedState);
        console.log('Preserved filters from UI:', currentFilters);
    }

    restoreStateToNewPerspective() {
        if (!this.currentEntityComponent) return;

        // Pass shared state to the entity component
        if (this.currentEntityComponent.applySharedState) {
            this.currentEntityComponent.applySharedState(this.sharedState);
        }

        console.log('Restored shared state to perspective:', this.currentPerspective);
    }

    updateSharedFilters(filters) {
        this.sharedState.filters = { ...filters };

        // Notify current perspective of filter changes
        if (this.currentEntityComponent?.syncFilters) {
            this.currentEntityComponent.syncFilters(this.sharedState.filters);
        }
    }

    updateSharedSelection(selectedItem) {
        this.sharedState.selectedItem = selectedItem;

        // Update details panel
        if (this.currentEntityComponent?.updateDetailsPanel) {
            this.currentEntityComponent.updateDetailsPanel(selectedItem);
        }
    }

    renderUI() {
        const activityClass = this.config.activityName.toLowerCase();
        const contextLabel = this.getContextLabel();

        // NEW LAYOUT: Filters above tabs, details panel extends upward
        this.container.innerHTML = `
            <div class="${activityClass}-activity">
                <div class="${activityClass}-header">
                    <h1>
                        ODP ${this.config.activityName}
                        <span class="context-label">${contextLabel}</span>
                    </h1>
                    <p>${this.config.description}</p>
                </div>
                
                <!-- NEW: Activity-level filters - FULL WIDTH -->
                <div class="activity-filters" id="activityFilters">
                    <!-- Dynamic filters will be rendered here -->
                </div>
                
                <div class="${activityClass}-workspace">
                    <div class="interaction-tabs">
                        ${Object.entries(this.entities).map(([key, entity]) => `
                            <button 
                                class="interaction-tab ${key === this.currentEntity ? 'interaction-tab--active' : ''}"
                                data-entity="${key}"
                            >
                                ${this.formatTabLabel(key)}
                            </button>
                        `).join('')}
                    </div>
                    
                    <div class="collection-container" id="mainContainer">
                        <!-- LEFT COLUMN: Perspective, grouping, actions, and list -->
                        <div class="collection-left-column">
                            <div class="perspective-controls" id="perspectiveControls">
                                <!-- Dynamic perspective controls will be rendered here -->
                            </div>
                            
                            <div class="collection-actions-and-grouping" id="actionsAndGrouping">
                                <!-- Grouping and action buttons will be rendered here -->
                            </div>
                            
                            <div class="collection-list">
                                <div class="collection-content" id="entityContent">
                                    <div class="collection-loading">
                                        <div class="spinner"></div>
                                        <p>Loading ${this.entities[this.currentEntity].name.toLowerCase()}...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- RIGHT COLUMN: Details panel (extends from tabs down) -->
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

    // Format complete tab label with counts
    formatTabLabel(entityKey) {
        const counts = this.entityCounts[entityKey];

        if (entityKey === 'requirements') {
            return `<span id="${entityKey}-count">Operational Needs: ${counts.ON} | Requirements: ${counts.OR}</span>`;
        } else if (entityKey === 'changes') {
            return `<span id="${entityKey}-count">Operational Changes: ${counts.total}</span>`;
        }

        return '<span>Unknown</span>';
    }

    renderActionButtons() {
        // Only show create button in edit mode
        if (this.config.mode !== 'edit') {
            return '';
        }

        const singularName = this.getSingularEntityName(this.currentEntity);

        return `
            <button class="btn btn-primary" id="createEntity">
                <span class="btn-icon">+</span>
                New ${singularName}
            </button>
        `;
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

        // Reset to collection perspective when switching entities
        this.currentPerspective = 'collection';

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

        // Update active tab using consistent class names
        const tabs = this.container.querySelectorAll('.interaction-tab');
        tabs.forEach(tab => {
            if (tab.dataset.entity === entity) {
                tab.classList.add('interaction-tab--active');
            } else {
                tab.classList.remove('interaction-tab--active');
            }
        });

        // Re-render dynamic controls to update button
        if (this.config.mode === 'edit') {
            this.renderDynamicControls();
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

            // Inject cached data BEFORE setting up callbacks or rendering
            if (this.cachedEntityData[this.currentEntity]) {
                console.log(`Injecting cached data for ${this.currentEntity}:`, this.cachedEntityData[this.currentEntity].length, 'items');
                // UPDATED: Set data on parent entity, which will distribute to perspectives
                this.currentEntityComponent.data = [...this.cachedEntityData[this.currentEntity]];
            }

            // Pass onDataLoaded callback to collection entity
            if (this.currentEntityComponent.collection) {
                this.currentEntityComponent.collection.onDataLoaded = (data) => {
                    this.updateBadgeFromData(this.currentEntity, data);
                };
            }

            const contentContainer = this.container.querySelector('#entityContent');
            if (contentContainer) {
                await this.currentEntityComponent.render(contentContainer);

                // After entity is loaded, render dynamic controls
                this.renderDynamicControls();

                // Update count badge after entity loads its filtered data
                await this.updateEntityCountAfterLoad(this.currentEntity);
            }

        } catch (error) {
            console.error(`Failed to load ${this.currentEntity} component:`, error);
            this.renderEntityError(error);
        }
    }

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

                        // Resolve edition context to baseline and wave IDs
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

                    // Calculate type breakdowns
                    if (key === 'requirements') {
                        const onCount = response.filter(item => item.type === 'ON').length;
                        const orCount = response.filter(item => item.type === 'OR').length;
                        this.entityCounts[key] = {
                            ON: onCount,
                            OR: orCount,
                            total: response.length
                        };
                    } else if (key === 'changes') {
                        this.entityCounts[key] = {
                            total: response.length
                        };
                    }

                    console.log(`Loaded count for ${key}:`, this.entityCounts[key]);
                } catch (error) {
                    console.warn(`Failed to load count for ${key}:`, error);
                    if (key === 'requirements') {
                        this.entityCounts[key] = { ON: 0, OR: 0, total: 0 };
                    } else {
                        this.entityCounts[key] = { total: 0 };
                    }
                }
            });

            await Promise.all(promises);
        } catch (error) {
            console.error('Failed to load entity counts:', error);
        }
    }

    // Update badge from loaded data (called by collection's onDataLoaded callback)
    updateBadgeFromData(entityType, data) {
        console.log(`updateBadgeFromData called for ${entityType} with ${data.length} items`);

        const badge = this.container.querySelector(`#${entityType}-count`);
        if (!badge) {
            console.warn(`Badge element not found for ${entityType}`);
            return;
        }

        // Calculate counts based on entity type
        if (entityType === 'requirements') {
            const onCount = data.filter(item => item.type === 'ON').length;
            const orCount = data.filter(item => item.type === 'OR').length;

            this.entityCounts[entityType] = {
                ON: onCount,
                OR: orCount,
                total: data.length
            };

            badge.textContent = `Operational Needs: ${onCount} | Requirements: ${orCount}`;
        } else if (entityType === 'changes') {
            this.entityCounts[entityType] = {
                total: data.length
            };

            badge.textContent = `Operational Changes: ${data.length}`;
        }

        console.log(`Updated ${entityType} badge:`, this.entityCounts[entityType]);
    }

    async updateEntityCountAfterLoad(entityType) {
        try {
            const badge = this.container.querySelector(`#${entityType}-count`);
            if (!badge) return;

            // Get count from the loaded entity component if available
            if (this.currentEntityComponent?.data) {
                const data = this.currentEntityComponent.data;
                this.updateBadgeFromData(entityType, data);
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
                this.updateBadgeFromData(entityType, response);
            }
        } catch (error) {
            // Silently fail count updates - not critical
            console.warn(`Failed to update ${entityType} count:`, error);
        }
    }

    renderDynamicControls() {
        if (!this.currentEntityComponent) return;

        // Get configurations from current entity
        const filterConfig = this.currentEntityComponent.getFilterConfig ?
            this.currentEntityComponent.getFilterConfig() : [];
        const groupingConfig = this.currentEntityComponent.getGroupingConfig ?
            this.currentEntityComponent.getGroupingConfig() : [];

        // ===== ACTIVITY-LEVEL FILTERS (Full Width) =====
        const activityFiltersContainer = this.container.querySelector('#activityFilters');
        if (activityFiltersContainer) {
            activityFiltersContainer.innerHTML = `
                <div class="filter-controls">
                    ${filterConfig.map(filter => this.renderFilterControl(filter)).join('')}
                    <button class="filter-clear" id="clearAllFilters" title="Clear all filters">Clear All</button>
                </div>
            `;

            // Populate filter inputs with preserved values
            Object.entries(this.sharedState.filters).forEach(([filterKey, filterValue]) => {
                if (filterValue) {
                    const input = activityFiltersContainer.querySelector(`[data-filter-key="${filterKey}"]`);
                    if (input) {
                        input.value = filterValue;
                    }
                }
            });
        }

        // ===== PERSPECTIVE CONTROLS =====
        const perspectiveContainer = this.container.querySelector('#perspectiveControls');
        if (perspectiveContainer) {
            perspectiveContainer.innerHTML = `
                <div class="perspective-toggle">
                    <button class="perspective-option ${this.currentPerspective === 'collection' ? 'perspective-option--active' : ''}" data-perspective="collection">
                        📋 Collection
                    </button>
                    <button class="perspective-option ${this.currentPerspective === 'tree' ? 'perspective-option--active' : ''}" data-perspective="tree"
        ${this.currentEntity !== 'requirements' ? 'disabled title="Only available for requirements"' : ''}>
    🌳 Tree
                    </button>
                    <button class="perspective-option ${this.currentPerspective === 'temporal' ? 'perspective-option--active' : ''}" data-perspective="temporal" 
                            ${this.currentEntity !== 'changes' ? 'disabled title="Only available for changes"' : ''}>
                        📅 Temporal
                    </button>
                </div>
                
                ${this.renderTemporalControls()}
            `;
        }

        // ===== GROUPING AND ACTIONS (Left column only) =====
        const actionsAndGroupingContainer = this.container.querySelector('#actionsAndGrouping');
        if (actionsAndGroupingContainer) {
            const activityClass = this.config.activityName.toLowerCase();
            actionsAndGroupingContainer.innerHTML = `
                <div class="grouping-section">
                    <label for="groupBy">Group by:</label>
                    <select id="groupBy" class="form-control group-select">
                        ${groupingConfig.map(option => `
                            <option value="${option.key}" ${option.key === this.sharedState.grouping ? 'selected' : ''}>${option.label}</option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="actions-section">
                    <div class="${activityClass}-actions">
                        ${this.renderActionButtons()}
                    </div>
                </div>
            `;
        }

        // Bind events for dynamic controls
        this.bindDynamicEvents();
    }

    renderTemporalControls() {
        // Only show temporal controls when temporal perspective is active and entity is changes
        if (this.currentPerspective !== 'temporal' || this.currentEntity !== 'changes') {
            return '';
        }

        const availableWaves = this.getAvailableWaves();
        const startWave = this.findClosestWave(this.sharedState.timeWindow.start, availableWaves);
        const endWave = this.findClosestWave(this.sharedState.timeWindow.end, availableWaves);

        return `
        <div class="temporal-controls">
            <div class="time-window-controls">
                <label for="start-wave">From:</label>
                <select id="start-wave" class="form-control">
                    ${availableWaves.map(wave => `
                        <option value="${wave.id}" ${startWave && startWave.id === wave.id ? 'selected' : ''}>
                            ${wave.year} Q${wave.quarter}
                        </option>
                    `).join('')}
                </select>
                
                <label for="end-wave">To:</label>
                <select id="end-wave" class="form-control">
                    ${availableWaves.map(wave => `
                        <option value="${wave.id}" ${endWave && endWave.id === wave.id ? 'selected' : ''}>
                            ${wave.year} Q${wave.quarter}
                        </option>
                    `).join('')}
                </select>
            </div>
            
            <div class="event-type-controls">
                <div class="event-type-filters">
                    ${this.renderEventTypeLabels()}
                    <button class="btn-icon" id="addEventType" title="Add event type filter">+</button>
                </div>
            </div>
        </div>
    `;
    }

    renderEventTypeLabels() {
        const activeTypes = this.sharedState.eventTypeFilters.filter(f => f !== 'ANY');

        if (activeTypes.length === 0 || this.sharedState.eventTypeFilters.includes('ANY')) {
            return '<span class="event-type-label all-types">All Events</span>';
        }

        return activeTypes.map(eventType => `
        <span class="event-type-label" data-event-type="${eventType}">
            ${this.formatEventTypeName(eventType)}
            <button class="label-remove" data-event-type="${eventType}" title="Remove filter">×</button>
        </span>
    `).join('');
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
        // Create button (dynamically rendered)
        const createBtn = this.container.querySelector('#createEntity');
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

        // Perspective toggle handling
        const perspectiveButtons = this.container.querySelectorAll('.perspective-option');
        perspectiveButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const perspective = e.currentTarget.dataset.perspective;
                if (e.currentTarget.disabled) return;

                this.handlePerspectiveSwitch(perspective);
            });
        });

        // Temporal controls (only when temporal perspective is active)
        const temporalControls = this.container.querySelector('.temporal-controls');
        if (temporalControls) {
            this.bindTemporalEvents();
        }
    }

    bindTemporalEvents() {
        // Time window controls
        const startWaveSelect = this.container.querySelector('#start-wave');
        const endWaveSelect = this.container.querySelector('#end-wave');

        if (startWaveSelect) {
            startWaveSelect.addEventListener('change', () => {
                this.updateTimeWindow();
            });
        }

        if (endWaveSelect) {
            endWaveSelect.addEventListener('change', () => {
                this.updateTimeWindow();
            });
        }

        // Event type controls
        const addEventTypeBtn = this.container.querySelector('#addEventType');
        if (addEventTypeBtn) {
            addEventTypeBtn.addEventListener('click', (e) => {
                this.showEventTypeDropdown(e.target);
            });
        }

        // Event type label removal
        const removeButtons = this.container.querySelectorAll('.label-remove');
        removeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const eventType = e.target.dataset.eventType;
                this.removeEventTypeFilter(eventType);
            });
        });
    }

    handlePerspectiveSwitch(perspective) {
        console.log(`Switching to ${perspective} perspective for ${this.currentEntity}`);

        if (perspective === this.currentPerspective) {
            return; // Already in this perspective
        }

        // Preserve current state before switching
        this.preserveCurrentState();

        this.currentPerspective = perspective;

        // Update UI - toggle active perspective button
        const perspectiveButtons = this.container.querySelectorAll('.perspective-option');
        perspectiveButtons.forEach(button => {
            if (button.dataset.perspective === perspective) {
                button.classList.add('perspective-option--active');
            } else {
                button.classList.remove('perspective-option--active');
            }
        });

        // Re-render controls to show/hide temporal controls
        this.renderDynamicControls();

        // Pass shared state to entity component
        if (this.currentEntityComponent?.handlePerspectiveSwitch) {
            this.currentEntityComponent.handlePerspectiveSwitch(perspective, this.sharedState);
        } else {
            console.log(`${perspective} perspective not yet implemented for ${this.currentEntity}`);
        }

        // Restore state to new perspective
        this.restoreStateToNewPerspective();
    }

    updateTimeWindow() {
        const startWaveSelect = this.container.querySelector('#start-wave');
        const endWaveSelect = this.container.querySelector('#end-wave');

        if (!startWaveSelect || !endWaveSelect) return;

        const startWaveId = parseInt(startWaveSelect.value, 10);
        const endWaveId = parseInt(endWaveSelect.value, 10);

        const availableWaves = this.getAvailableWaves();
        const startWave = availableWaves.find(w => String(w.id) === String(startWaveId));
        const endWave = availableWaves.find(w => String(w.id) === String(endWaveId));

        if (startWave && endWave) {
            this.sharedState.timeWindow.start = new Date(startWave.year, (startWave.quarter - 1) * 3, 1);
            this.sharedState.timeWindow.end = new Date(endWave.year, (endWave.quarter - 1) * 3 + 3, 0);

            // Ensure start is before end
            if (this.sharedState.timeWindow.start > this.sharedState.timeWindow.end) {
                [this.sharedState.timeWindow.start, this.sharedState.timeWindow.end] =
                    [this.sharedState.timeWindow.end, this.sharedState.timeWindow.start];
            }

            // Notify timeline component
            if (this.currentEntityComponent?.timelineGrid) {
                this.currentEntityComponent.timelineGrid.updateTimeWindow(
                    this.sharedState.timeWindow.start,
                    this.sharedState.timeWindow.end
                );
            }
        }
    }

    showEventTypeDropdown(button) {
        // Get available event types (not currently selected)
        const currentTypes = this.sharedState.eventTypeFilters.includes('ANY') ?
            [] : this.sharedState.eventTypeFilters;

        const availableTypes = this.availableEventTypes.filter(type =>
            !currentTypes.includes(type)
        );

        if (availableTypes.length === 0) {
            return; // No more types to add
        }

        // Create a simple dropdown menu
        const dropdown = document.createElement('div');
        dropdown.className = 'event-type-dropdown';
        dropdown.innerHTML = availableTypes.map(type => `
            <div class="dropdown-item" data-event-type="${type}">
                ${this.formatEventTypeName(type)}
            </div>
        `).join('');

        // Position dropdown near button
        const rect = button.getBoundingClientRect();
        dropdown.style.position = 'absolute';
        dropdown.style.top = `${rect.bottom + 4}px`;
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.zIndex = '1000';

        document.body.appendChild(dropdown);

        // Bind dropdown events
        dropdown.addEventListener('click', (e) => {
            if (e.target.classList.contains('dropdown-item')) {
                const eventType = e.target.dataset.eventType;
                this.addEventTypeFilter(eventType);
                dropdown.remove();
            }
        });

        // Remove dropdown on outside click
        const removeDropdown = (e) => {
            if (!dropdown.contains(e.target) && e.target !== button) {
                dropdown.remove();
                document.removeEventListener('click', removeDropdown);
            }
        };
        setTimeout(() => document.addEventListener('click', removeDropdown), 100);
    }

    addEventTypeFilter(eventType) {
        // Validate event type is one of the 5 allowed types
        if (!this.availableEventTypes.includes(eventType)) {
            console.warn('Invalid event type:', eventType);
            return;
        }

        // Remove 'ANY' filter when adding specific types
        if (this.sharedState.eventTypeFilters.includes('ANY')) {
            this.sharedState.eventTypeFilters = [eventType];
        } else {
            this.sharedState.eventTypeFilters.push(eventType);
        }

        this.notifyEventTypeFilterChange();
        this.renderDynamicControls(); // Re-render to update labels
    }

    removeEventTypeFilter(eventType) {
        this.sharedState.eventTypeFilters = this.sharedState.eventTypeFilters.filter(f => f !== eventType);

        // If no specific types left, default back to ANY
        if (this.sharedState.eventTypeFilters.length === 0) {
            this.sharedState.eventTypeFilters = ['ANY'];
        }

        this.notifyEventTypeFilterChange();
        this.renderDynamicControls(); // Re-render to update labels
    }

    notifyEventTypeFilterChange() {
        // Notify timeline component of filter changes
        if (this.currentEntityComponent?.timelineGrid) {
            this.currentEntityComponent.timelineGrid.setMilestoneFilters(this.sharedState.eventTypeFilters);
        }
    }

    // ====================
    // MULTI-BADGE UPDATE SYSTEM
    // ====================

    async updateAllBadges(filters) {
        console.log('Updating all badges with filters:', filters);

        // Fire both queries in parallel - they update independently
        this.updateRequirementsBadge(filters);
        this.updateChangesBadge(filters);
    }

    async updateRequirementsBadge(filters) {
        const badge = this.container.querySelector('#requirements-count');
        if (!badge) return;

        try {
            // Show loading state
            badge.innerHTML = '<span class="badge-loading">⟳</span>';
            badge.classList.remove('badge-error');

            // Build endpoint with filters
            let endpoint = this.entities.requirements.endpoint;
            const queryParams = await this.buildQueryParams(filters);

            if (Object.keys(queryParams).length > 0) {
                const queryString = new URLSearchParams(queryParams).toString();
                endpoint = `${endpoint}?${queryString}`;
            }

            // Fetch filtered data
            const response = await apiClient.get(endpoint);
            const onCount = response.filter(item => item.type === 'ON').length;
            const orCount = response.filter(item => item.type === 'OR').length;

            // Cache the data for reuse when switching tabs
            this.cachedEntityData.requirements = [...response];

            // Update badge with counts
            this.entityCounts.requirements = {
                ON: onCount,
                OR: orCount,
                total: response.length
            };

            badge.textContent = `Operational Needs: ${onCount} | Requirements: ${orCount}`;
            badge.classList.remove('badge-loading');

            console.log('Requirements badge updated:', { onCount, orCount });
        } catch (error) {
            console.error('Failed to update requirements badge:', error);
            badge.textContent = 'Error';
            badge.classList.add('badge-error');
            badge.classList.remove('badge-loading');
        }
    }

    async updateChangesBadge(filters) {
        const badge = this.container.querySelector('#changes-count');
        if (!badge) return;

        try {
            // Show loading state
            badge.innerHTML = '<span class="badge-loading">⟳</span>';
            badge.classList.remove('badge-error');

            // Build endpoint with filters
            let endpoint = this.entities.changes.endpoint;
            const queryParams = await this.buildQueryParams(filters);

            if (Object.keys(queryParams).length > 0) {
                const queryString = new URLSearchParams(queryParams).toString();
                endpoint = `${endpoint}?${queryString}`;
            }

            // Fetch filtered data
            const response = await apiClient.get(endpoint);
            const count = response.length;

            // Cache the data for reuse when switching tabs
            this.cachedEntityData.changes = [...response];

            // Update badge with count
            this.entityCounts.changes = { total: count };

            badge.textContent = `Operational Changes: ${count}`;
            badge.classList.remove('badge-loading');

            console.log('Changes badge updated:', { count });
        } catch (error) {
            console.error('Failed to update changes badge:', error);
            badge.textContent = 'Error';
            badge.classList.add('badge-error');
            badge.classList.remove('badge-loading');
        }
    }

    async buildQueryParams(filters) {
        const queryParams = {};

        // Add edition context if available
        const editionContext = this.config.dataSource;
        if (editionContext &&
            editionContext !== 'repository' &&
            editionContext !== 'Repository' &&
            typeof editionContext === 'string' &&
            editionContext.match(/^\d+$/)) {

            const edition = await apiClient.get(`/odp-editions/${editionContext}`);
            if (edition.baseline?.id) {
                queryParams.baseline = edition.baseline.id;
            }
            if (edition.startsFromWave?.id) {
                queryParams.fromWave = edition.startsFromWave.id;
            }
        }

        // Add content filters
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

    handleSpecificFilter(filterKey, filterValue) {
        // Update shared state
        this.sharedState.filters[filterKey] = filterValue;

        // Update the visible entity's collection
        if (this.currentEntityComponent?.handleFilter) {
            this.currentEntityComponent.handleFilter(filterKey, filterValue);
        }

        // Update all badges with current filters
        this.updateAllBadges(this.sharedState.filters);
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

        // Update all badges with no filters
        this.updateAllBadges({});
    }

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

    // Helper methods for temporal controls
    getAvailableWaves() {
        if (!this.setupData?.waves) return [];

        // Return all waves sorted by date
        return [...this.setupData.waves].sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.quarter - b.quarter;
        });
    }

    findClosestWave(date, waves) {
        if (!waves || waves.length === 0) return null;

        let closest = waves[0];
        let closestDiff = Math.abs(date.getTime() - this.getWaveDate(closest).getTime());

        for (const wave of waves) {
            const waveDate = this.getWaveDate(wave);
            const diff = Math.abs(date.getTime() - waveDate.getTime());

            if (diff < closestDiff) {
                closest = wave;
                closestDiff = diff;
            }
        }

        return closest;
    }

    getWaveDate(wave) {
        return new Date(wave.year, (wave.quarter - 1) * 3, 1);
    }

    formatEventTypeName(eventType) {
        // Use shared enum display function
        return getMilestoneEventDisplay(eventType);
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