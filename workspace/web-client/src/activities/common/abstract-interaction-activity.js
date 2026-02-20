import { async as asyncUtils } from '../../shared/utils.js';
import FilterBar from '../../components/odp/filter-bar.js';
import { apiClient } from '../../shared/api-client.js';
import {
    DraftingGroup,
    getOperationalRequirementTypeDisplay,
    getDraftingGroupDisplay,
    MilestoneEventType,
    getMilestoneEventDisplay
} from '/shared/src/index.js';

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
            activityName: 'Interaction',
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
            filters: [],        // array form: [{ key, label, value, displayValue }] – for FilterBar.setFilters()
            filtersObject: {},  // object form: { key: value } – for buildQueryParams()
            selectedItem: null,
            grouping: 'none',
            // Temporal-specific state (milestone event type filters only)
            eventTypeFilters: ['ANY']
        };

        // FilterBar instance – created in renderDynamicControls, held here so
        // preserveCurrentState and clearAllFilters can reach it without a DOM query.
        this.filterBar = null;

        // Available event types from shared enum (5 specific milestone events)
        this.availableEventTypes = Object.keys(MilestoneEventType);

        // Cache for filtered entity data (to avoid re-fetching when switching tabs)
        this.cachedEntityData = {
            requirements: null,
            changes: null
        };

        // Listen for entity save events and reload the appropriate entity with current filters
        document.addEventListener('entitySaved', async (e) => {
            // Only handle if this is the currently active activity
            if (this !== this.app.currentActivity) {
                return;
            }

            const entityType = e.detail.entityType;
            console.log(`AbstractInteractionActivity: entitySaved event received for ${entityType}`);

            // Use the object form of filters so buildQueryParams receives the correct input
            const currentFiltersObject = this.sharedState.filtersObject || {};

            if (entityType === 'Operational Requirements') {
                await this.loadRequirements(currentFiltersObject);
            } else if (entityType === 'Operational Changes') {
                await this.loadChanges(currentFiltersObject);
            }
        });
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

            // Render the activity UI (creates badge elements)
            this.renderUI();

            // Create components for BOTH entities FIRST
            await this.prepareAllEntities();

            // Load data for BOTH entities - notifies entities via onDataUpdated()
            await this.updateAllBadges({});

            // Activate and render the current entity component
            await this.renderCurrentEntity();

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
                        ${this.config.activityName}
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

    // State preservation methods
    preserveCurrentState() {
        // Read filter state directly from FilterBar (single source of truth)
        if (this.filterBar) {
            this.sharedState.filters = this.filterBar.getFilters();
        }

        // Preserve selection and grouping from collection if available
        if (this.currentEntityComponent?.collection) {
            this.sharedState.selectedItem = this.currentEntityComponent.collection.selectedItem;
            this.sharedState.grouping = this.currentEntityComponent.collection.currentGrouping;
        }

        console.log('Preserved shared state:', this.sharedState);
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

        // NEW LAYOUT: Filters above tabs, view controls managed by entities
        this.container.innerHTML = `
            <div class="${activityClass}-activity">
                <div class="${activityClass}-header">
                    <h1>
                        ${this.config.activityName}
                        <span class="context-label">${contextLabel}</span>
                    </h1>
                    <p>${this.config.description}</p>
                </div>
                
                <!-- Activity-level filters - FULL WIDTH -->
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
                        <!-- LEFT COLUMN: View controls and content -->
                        <div class="collection-left-column">
                            <!-- View-specific controls (perspective, grouping, actions) -->
                            <div class="view-controls" id="viewControls">
                                <!-- Entity views render their controls here -->
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

        // Preserve current state before switching
        this.preserveCurrentState();

        // Notify current entity it's being deactivated
        if (this.currentEntityComponent?.onDeactivated) {
            this.currentEntityComponent.onDeactivated();
        }

        // Clean up current entity component
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        this.currentEntity = entity;

        // Switch to the pre-created component for this entity
        this.currentEntityComponent = this.entityComponents[entity];

        // Store container reference BEFORE activation (entity needs it to render)
        const contentContainer = this.container.querySelector('#entityContent');
        if (contentContainer) {
            this.currentEntityComponent.container = contentContainer;
        }

        // Notify new entity it's being activated (this triggers render)
        if (this.currentEntityComponent?.onActivated) {
            this.currentEntityComponent.onActivated();
        }

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

        // Apply shared state to the new entity (filters, selection, grouping)
        if (this.currentEntityComponent.applySharedState) {
            this.currentEntityComponent.applySharedState(this.sharedState);
        }

        // Re-render dynamic controls to update button and restore filter UI
        this.renderDynamicControls();
    }

    /**
     * Create entity components for BOTH requirements and changes
     * Both components are created upfront so tab switching is instant
     */
    async prepareAllEntities() {
        try {
            // Store all entity components in a map
            this.entityComponents = {};

            // Create components for BOTH entity types
            for (const entityKey of ['requirements', 'changes']) {
                const entityConfig = this.entities[entityKey];

                // Dynamic import the entity component
                const entityModule = await import(`../common/${entityKey}.js`);
                const EntityComponent = entityModule.default;

                // Create entity component with mode configuration
                const entityOptions = {
                    mode: this.config.mode,
                    dataSource: this.config.dataSource,
                    editionContext: this.config.editionContext
                };

                // Create entity component with setup data and options
                const entityComponent = new EntityComponent(this.app, entityConfig, this.setupData, entityOptions);

                // Store the component
                this.entityComponents[entityKey] = entityComponent;

                console.log(`Entity component prepared for ${entityKey}`);
            }

            // Set currentEntityComponent to point to the currently selected entity
            this.currentEntityComponent = this.entityComponents[this.currentEntity];

        } catch (error) {
            console.error('Failed to prepare entity components:', error);
            throw error;
        }
    }

    /**
     * Initialize and activate the current entity component
     * This happens during initial render after components are prepared and data is loaded
     */
    async renderCurrentEntity() {
        try {
            if (!this.currentEntityComponent) {
                throw new Error('Entity component not prepared');
            }

            // Store container reference
            const contentContainer = this.container.querySelector('#entityContent');
            if (!contentContainer) {
                throw new Error('Entity content container not found');
            }

            this.currentEntityComponent.container = contentContainer;

            // Notify current entity it's being activated (initial load)
            if (this.currentEntityComponent.onActivated) {
                this.currentEntityComponent.onActivated();
            }

            // Render dynamic controls
            this.renderDynamicControls();

            console.log(`Entity initialized for ${this.currentEntity}`);

        } catch (error) {
            console.error(`Failed to initialize ${this.currentEntity} component:`, error);
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
    // ====================
    // FILTER CONFIGURATION (ACTIVITY-LEVEL SHARED)
    // ====================

    /**
     * Activity-level filter configuration - union of all entity filters
     * All filters are always shown regardless of current entity
     * Entities ignore filters they don't understand
     */
    /**
     * Filter type definitions consumed by FilterBar.
     *
     * inputType values:
     *   'select'  – low-cardinality: renders a dropdown of static options
     *   'text'    – free text input with no suggestions
     *   'suggest' – text input with debounced suggestion box
     *              (options[] used for client-side matching;
     *               fetchSuggestionsCallback used for entity-search keys)
     *
     * These definitions are shared across all entity types (requirements + changes).
     * Entity-specific filter matchers in requirements.js / changes.js silently
     * ignore keys that don't apply to their data model.
     */
    getFilterConfig() {
        return [
            {
                key: 'type',
                label: 'Type',
                inputType: 'select',
                options: [
                    { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
                    { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
                ]
            },
            {
                key: 'text',
                label: 'Full Text',
                inputType: 'text',
                placeholder: 'Search title, code, statement...'
            },
            {
                key: 'drg',
                label: 'Drafting Group',
                inputType: 'select',
                options: this.buildDraftingGroupOptions()
            },
            {
                key: 'stakeholderCategory',
                label: 'Stakeholder Impact',
                inputType: 'suggest',
                placeholder: 'Type to search stakeholders...',
                options: this.buildOptionsFromSetupData('stakeholderCategories')
            },
            {
                key: 'service',
                label: 'Service Impact',
                inputType: 'suggest',
                placeholder: 'Type to search services...',
                options: this.buildOptionsFromSetupData('services')
            },
            {
                key: 'dataCategory',
                label: 'Data Impact',
                inputType: 'suggest',
                placeholder: 'Type to search data categories...',
                options: this.buildOptionsFromSetupData('dataCategories')
            },
            {
                key: 'document',
                label: 'Document Reference',
                inputType: 'suggest',
                placeholder: 'Type to search documents...',
                options: this.buildOptionsFromSetupData('documents')
            },
            {
                key: 'refines',
                label: 'Refines',
                inputType: 'suggest',
                placeholder: 'Search by code or title...',
                options: []   // populated via fetchSuggestionsCallback
            },
            {
                key: 'dependsOn',
                label: 'Depends On',
                inputType: 'suggest',
                placeholder: 'Search by code or title...',
                options: []
            },
            {
                key: 'satisfies',
                label: 'Satisfies',
                inputType: 'suggest',
                placeholder: 'Search by code or title...',
                options: []
            },
            {
                key: 'implementedON',
                label: 'Implements',
                inputType: 'suggest',
                placeholder: 'Search by code or title...',
                options: []   // populated via fetchSuggestionsCallback
            }
        ];
    }


    /**
     * Build filter options from setup data
     */
    buildOptionsFromSetupData(entityName, emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];
        if (!this.setupData?.[entityName]) return baseOptions;

        const setupOptions = this.setupData[entityName].map(entity => ({
            value: entity.id,
            label: entity.name || entity.id
        }));

        return baseOptions.concat(setupOptions);
    }

    buildDraftingGroupOptions() {
        const options = [{ value: '', label: 'Any' }];
        Object.keys(DraftingGroup).forEach(key => {
            options.push({
                value: key, // Send enum key (e.g., "NM_B2B")
                label: getDraftingGroupDisplay(DraftingGroup[key]) // Display text (e.g., "NM B2B")
            });
        });
        return options;
    }

    renderDynamicControls() {
        if (!this.currentEntityComponent) return;

        // ===== ACTIVITY-LEVEL FILTERS (Full Width) =====
        const activityFiltersContainer = this.container.querySelector('#activityFilters');
        if (activityFiltersContainer) {
            // Build FilterBar with current entity's filter config and setup data
            this.filterBar = new FilterBar(this.getFilterConfig(), this.setupData);

            // Wire entity-search suggestions for high-cardinality filters
            this.filterBar.fetchSuggestionsCallback = (key, query) =>
                this._fetchFilterSuggestions(key, query);

            // Restore preserved filter state
            if (this.sharedState.filters && this.sharedState.filters.length > 0) {
                this.filterBar.setFilters(this.sharedState.filters);
            }

            // Render the bar into the container
            this.filterBar.render(activityFiltersContainer);

            // Listen for filter changes and propagate to current entity
            activityFiltersContainer.addEventListener('filtersChanged', (e) => {
                // Store both forms: array for FilterBar restoration, object for API calls
                this.sharedState.filters = e.detail.filtersArray;
                this.sharedState.filtersObject = e.detail.filters;
                this._applyFiltersToEntities(e.detail.filters);
            });
        }
    }

    handlePerspectiveSwitch(perspective) {
        console.log(`Switching to ${perspective} perspective for ${this.currentEntity}`);

        // Delegate to entity - it manages its own perspective state and rendering
        if (this.currentEntityComponent?.handlePerspectiveSwitch) {
            this.currentEntityComponent.handlePerspectiveSwitch(perspective, this.sharedState);
        } else {
            console.warn(`${perspective} perspective not implemented for ${this.currentEntity}`);
        }
    }

    notifyEventTypeFilterChange() {
        // Notify timeline component of filter changes
        if (this.currentEntityComponent?.timelineGrid) {
            this.currentEntityComponent.timelineGrid.setMilestoneFilters(this.sharedState.eventTypeFilters);
        }
    }

    async updateAllBadges(filters) {
        console.log('Loading all entity data with filters:', filters);

        // Fire both queries in parallel and wait for both to complete
        await Promise.all([
            this.loadRequirements(filters),
            this.loadChanges(filters)
        ]);
    }

    async loadRequirements(filters) {
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

            // Update cache
            this.cachedEntityData.requirements = [...response];

            // Update badge with counts
            this.entityCounts.requirements = {
                ON: onCount,
                OR: orCount,
                total: response.length
            };

            badge.textContent = `Operational Needs: ${onCount} | Requirements: ${orCount}`;
            badge.classList.remove('badge-loading');

            console.log('Requirements loaded:', { onCount, orCount });

            // Notify requirements entity
            if (this.entityComponents?.requirements) {
                this.entityComponents.requirements.onDataUpdated(response, response.length);
            }

        } catch (error) {
            console.error('Failed to load requirements:', error);
            badge.textContent = 'Error';
            badge.classList.add('badge-error');
            badge.classList.remove('badge-loading');
        }
    }

    async loadChanges(filters) {
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

            // Update cache
            this.cachedEntityData.changes = [...response];

            // Update badge with count
            this.entityCounts.changes = { total: count };

            badge.textContent = `Operational Changes: ${count}`;
            badge.classList.remove('badge-loading');

            console.log('Changes loaded:', { count });

            // Notify changes entity
            if (this.entityComponents?.changes) {
                this.entityComponents.changes.onDataUpdated(response, count);
            }

        } catch (error) {
            console.error('Failed to load changes:', error);
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
        // Some FilterBar keys differ from API parameter names - map them here.
        const keyMap = {
            refines: 'refinesParent',   // FilterBar: 'refines' → API: 'refinesParent'
            satisfies: 'satisfiesOR'    // FilterBar: 'satisfies' → API: 'satisfiesOR'
        };
        // Keys that should never be forwarded as content filters
        const skipKeys = new Set();

        if (filters && Object.keys(filters).length > 0) {
            Object.entries(filters).forEach(([key, value]) => {
                if (skipKeys.has(key)) return;
                if (value && value !== '') {
                    const apiKey = keyMap[key] || key;
                    if (Array.isArray(value)) {
                        queryParams[apiKey] = value.join(',');
                    } else {
                        queryParams[apiKey] = value;
                    }
                }
            });
        }

        return queryParams;
    }

    /**
     * Propagate the current filter state (flat object form) to the active entity
     * and trigger a server-side reload via updateAllBadges.
     *
     * Called by FilterBar's filtersChanged event and by clearAllFilters.
     *
     * @param {Object} filtersObject  Plain { key: value } map for buildQueryParams
     */
    _applyFiltersToEntities(filtersObject) {
        // Trigger server-side reload; buildQueryParams maps filter keys to API params.
        this.updateAllBadges(filtersObject);
    }

    clearAllFilters() {
        if (this.filterBar) {
            this.filterBar.clearAll();
            // filtersChanged event fires automatically, which calls _applyFiltersToEntities
        }
        this.sharedState.filtersObject = {};
        this.updateAllBadges({});
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
                        ${this.config.activityName}
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

    /**
     * Fetch entity-search suggestions for high-cardinality filter types.
     * Called by FilterBar.fetchSuggestionsCallback.
     *
     * For setup-data-backed types (stakeholder, service, etc.) suggestions come
     * from the static options list already built into getFilterConfig() – FilterBar
     * handles those itself.  This method handles entity-reference searches
     * (refines, dependsOn, satisfies) that need a live query.
     *
     * @param {string} key    Filter key (e.g. 'refines', 'dependsOn', 'satisfies')
     * @param {string} query  Current text input value
     * @returns {Array}       Array of { value, label }
     */
    async _fetchFilterSuggestions(key, query) {
        if (!query || query.length < 2) return [];

        try {
            // Map filter key to the appropriate search endpoint
            const endpointMap = {
                refines: '/operational-requirements',
                dependsOn: '/operational-requirements',
                satisfies: '/operational-requirements',
                implementedON: '/operational-requirements'
            };

            const endpoint = endpointMap[key];
            if (!endpoint) return [];

            const results = await apiClient.get(
                `${endpoint}?title=${encodeURIComponent(query)}&limit=10`
            );

            return (results || []).map(item => ({
                value: (item.itemId || item.id).toString(),
                label: `[${item.type || '?'}] ${item.code ? item.code + ' – ' : ''}${item.title}`
            }));
        } catch (e) {
            console.warn('FilterBar suggestion fetch failed:', e);
            return [];
        }
    }

    cleanup() {
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        // Clear references
        this.container = null;
        this.currentEntityComponent = null;
        this.setupData = null;
        this.filterBar = null;
    }
}