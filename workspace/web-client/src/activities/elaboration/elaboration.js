import { async as asyncUtils } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class ElaborationActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.currentEntity = 'requirements'; // Default to requirements
        this.currentEntityComponent = null;

        // Entity configuration for Elaboration Activity
        this.entities = {
            'requirements': {
                name: 'Operational Requirements',
                endpoint: '/operational-requirements',
                context: 'repository'
            },
            'changes': {
                name: 'Operational Changes',
                endpoint: '/operational-changes',
                context: 'repository'
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
            await this.loadEntityCounts();
            this.renderUI();
            await this.loadCurrentEntity();
        } catch (error) {
            console.error('Failed to render Elaboration Activity:', error);
            this.renderError(error);
        }
    }

    renderUI() {
        this.container.innerHTML = `
            <div class="elaboration-activity">
                <div class="elaboration-header">
                    <h1>
                        ODP Elaboration
                        <span class="repository-context">Repository</span>
                    </h1>
                    <p>Create and edit operational requirements and changes for the next ODP edition</p>
                </div>
                
                <div class="elaboration-tabs">
                    ${Object.entries(this.entities).map(([key, entity]) => `
                        <button 
                            class="elaboration-tab ${key === this.currentEntity ? 'elaboration-tab--active' : ''}"
                            data-entity="${key}"
                        >
                            <span class="elaboration-tab__name">${entity.name}</span>
                            <span class="elaboration-tab__count">${this.entityCounts[key] || 0}</span>
                        </button>
                    `).join('')}
                </div>
                
                <div class="elaboration-workspace">
                    <div class="collection-container">
                        <div class="collection-filters">
                            <div class="group-controls">
                                <label for="groupBy">Group by:</label>
                                <select id="groupBy" class="form-control group-select">
                                    <option value="status">Status</option>
                                    <option value="type">Type</option>
                                    <option value="wave">Wave</option>
                                    <option value="none">No grouping</option>
                                </select>
                            </div>
                            
                            <div class="filter-controls">
                                <input 
                                    type="text" 
                                    id="filterText" 
                                    class="form-control filter-input" 
                                    placeholder="Search content..."
                                >
                                <button class="filter-clear" id="clearFilter" title="Clear filter">×</button>
                            </div>
                            
                            <div class="perspective-toggle">
                                <button class="perspective-option perspective-option--active" data-perspective="collection">
                                    Collection
                                </button>
                                <button class="perspective-option" data-perspective="hierarchical" disabled title="Coming soon">
                                    Hierarchical
                                </button>
                                <button class="perspective-option" data-perspective="temporal" disabled title="Coming soon">
                                    Temporal
                                </button>
                            </div>
                        </div>
                        
                        <div class="collection-actions">
                            <div class="edit-mode-toggle">
                                <input type="checkbox" id="editInCollection" />
                                <label for="editInCollection">Edit in Collection View</label>
                            </div>
                            
                            <div class="elaboration-actions">
                                <button class="btn btn-primary action-create" id="createEntity">
                                    + New ${this.getSingularEntityName(this.currentEntity)}
                                </button>
                                <button class="btn btn-secondary action-import" id="importEntity">
                                    Import
                                </button>
                                <button class="btn btn-secondary action-export" id="exportEntity">
                                    Export
                                </button>
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
                            <div class="details-header">
                                <h3 class="details-title">Details</h3>
                            </div>
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

    bindEvents() {
        // Entity tab switching
        const tabs = this.container.querySelectorAll('.elaboration-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const entity = e.currentTarget.dataset.entity;
                if (entity !== this.currentEntity) {
                    this.switchEntity(entity);
                }
            });
        });

        // Filter controls
        const filterInput = this.container.querySelector('#filterText');
        const clearFilter = this.container.querySelector('#clearFilter');
        const groupSelect = this.container.querySelector('#groupBy');

        if (filterInput) {
            filterInput.addEventListener('input', asyncUtils.debounce((e) => {
                this.handleFilter(e.target.value);
            }, 300));
        }

        if (clearFilter) {
            clearFilter.addEventListener('click', () => {
                filterInput.value = '';
                this.handleFilter('');
            });
        }

        if (groupSelect) {
            groupSelect.addEventListener('change', (e) => {
                this.handleGrouping(e.target.value);
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

        // Action buttons
        const createBtn = this.container.querySelector('#createEntity');
        const importBtn = this.container.querySelector('#importEntity');
        const exportBtn = this.container.querySelector('#exportEntity');
        const editToggle = this.container.querySelector('#editInCollection');

        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => this.handleImport());
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.handleExport());
        }

        if (editToggle) {
            editToggle.addEventListener('change', (e) => {
                this.handleEditModeToggle(e.target.checked);
            });
        }
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

        // Update URL
        const newPath = `/elaboration/${entity}`;
        window.history.pushState(null, '', newPath);

        // Update active tab
        const tabs = this.container.querySelectorAll('.elaboration-tab');
        tabs.forEach(tab => {
            if (tab.dataset.entity === entity) {
                tab.classList.add('elaboration-tab--active');
            } else {
                tab.classList.remove('elaboration-tab--active');
            }
        });

        // Update create button text
        const createBtn = this.container.querySelector('#createEntity');
        if (createBtn) {
            createBtn.textContent = `+ New ${this.getSingularEntityName(entity)}`;
        }

        // Load new entity
        await this.loadCurrentEntity();
    }

    async loadCurrentEntity() {
        try {
            const entityConfig = this.entities[this.currentEntity];

            // Dynamic import the entity component
            const entityModule = await import(`./${this.currentEntity}.js`);
            const EntityComponent = entityModule.default;

            // Create and render the entity component
            this.currentEntityComponent = new EntityComponent(this.app, entityConfig);

            const contentContainer = this.container.querySelector('#entityContent');
            if (contentContainer) {
                await this.currentEntityComponent.render(contentContainer);
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
                    const response = await apiClient.get(entity.endpoint);
                    this.entityCounts[key] = Array.isArray(response) ? response.length : 0;
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

    // Event handlers for Collection perspective
    handleFilter(filterText) {
        if (this.currentEntityComponent?.handleFilter) {
            this.currentEntityComponent.handleFilter(filterText);
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

    handleImport() {
        // Placeholder for import functionality
        console.log('Import functionality not yet implemented');
    }

    handleExport() {
        if (this.currentEntityComponent?.handleExport) {
            this.currentEntityComponent.handleExport();
        }
    }

    handleEditModeToggle(enabled) {
        if (this.currentEntityComponent?.handleEditModeToggle) {
            this.currentEntityComponent.handleEditModeToggle(enabled);
        }
    }

    renderError(error) {
        this.container.innerHTML = `
            <div class="error-container">
                <h1>Failed to Load Elaboration Activity</h1>
                <p>An error occurred while loading the elaboration interface.</p>
                <details>
                    <summary>Error details</summary>
                    <pre>${error.message}\n${error.stack}</pre>
                </details>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    Reload Page
                </button>
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

    cleanup() {
        if (this.currentEntityComponent?.cleanup) {
            this.currentEntityComponent.cleanup();
        }

        // Clear references
        this.container = null;
        this.currentEntityComponent = null;
    }
}