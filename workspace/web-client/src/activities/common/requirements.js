import CollectionEntity from '../../components/odp/collection-entity.js';
import TreeTableEntity from '../../components/odp/tree-table-entity.js';
import RequirementForm from './requirement-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import {
    getOperationalRequirementTypeDisplay,
    getDraftingGroupDisplay
} from '/shared/src/index.js';

/**
 * RequirementsEntity - Requirements collection management with multi-perspective support
 * Supports both Collection and Tree perspectives with parent-owned data pattern
 * UPDATED: Parent manages data loading, distributes to perspectives via setData()
 */
export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Multi-perspective support
        this.currentPerspective = 'collection'; // 'collection' | 'tree'
        this.data = []; // PARENT-OWNED: Single source of truth for all perspectives

        // Lifecycle state
        this.isActive = false; // Tracks if this entity view is currently active

        // Local shared state for this entity
        this.sharedState = {
            filters: [],
            selectedItem: null,
            grouping: 'none',
            currentTabIndex: 0
        };

        // Initialize collection perspective
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { setupData },
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            getEmptyStateMessage: () => ({
                icon: '📋',
                title: 'No Requirements Yet',
                description: 'Start creating operational requirements to define system needs and behaviors.',
            })
        });

        // Initialize tree perspective
        this.tree = new TreeTableEntity(app, entityConfig, {
            pathBuilder: (entity, entityMap) => this.buildRequirementTreePath(entity, entityMap),
            typeRenderers: this.getTreeTypeRenderers(),
            columns: this.getTreeColumns(),
            columnTypes: odpColumnTypes,
            context: { setupData },
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate(),
            onDataLoaded: (data) => {
                console.log('Tree data loaded:', data.length);
            }
        });

        // Initialize form using inheritance pattern with tab change callback
        this.form = new RequirementForm(entityConfig, {
            setupData,
            currentTabIndex: 0,
            onTabChange: (index) => {
                this.sharedState.currentTabIndex = index;
            }
        });
    }

    // ====================
    // STATE MANAGEMENT - CENTRALIZED STATE
    // ====================

    applySharedState(sharedState) {
        console.log('RequirementsEntity.applySharedState:', sharedState);


        // Apply selection (shared across perspectives)
        if (sharedState.selectedItem) {
            this.collection.selectedItem = sharedState.selectedItem;
            this.tree.selectedItem = sharedState.selectedItem;
        }

        // Apply grouping (collection only)
        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }

        // Apply tab index to form context
        if (sharedState.currentTabIndex !== undefined && this.form) {
            this.sharedState.currentTabIndex = sharedState.currentTabIndex;
            this.form.context.currentTabIndex = sharedState.currentTabIndex;
        }

        // Re-render current perspective with the filters already applied above
        if (this.currentPerspective === 'tree') {
            this.tree.render(this.container);
        } else {
            this.collection.renderContent();
        }
    }

    // ====================
    // COLLECTION CONFIGURATION
    // ====================

    getColumnConfig() {
        return [
            {
                key: 'code',
                label: 'Code',
                width: 'auto',
                sortable: true,
                type: 'text'
            },
            {
                key: 'type',
                label: 'Type',
                width: '80px',
                sortable: true,
                type: 'requirement-type',
                groupPriority: { 'ON': 1, 'OR': 2 }
            },
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                sortable: true,
                type: 'text'
            },
            {
                key: 'drg',
                label: 'DrG',
                width: '120px',
                sortable: true,
                type: 'drafting-group'
            },
            {
                key: 'refinesParents',
                label: 'Refines',
                width: '150px',
                sortable: false,
                type: 'entity-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Refinement',
                groupPrefix: 'Refines'
            },
            {
                key: 'implementedONs',
                label: 'Implements',
                width: '150px',
                sortable: false,
                type: 'implemented-ons',
                maxDisplay: 1,
                noneLabel: 'No Implementation',
                groupPrefix: 'Implements'
            },
            {
                key: 'dependsOnRequirements',
                label: 'Depends On',
                width: '150px',
                sortable: false,
                type: 'entity-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Dependencies',
                groupPrefix: 'Depends On'
            },
            {
                key: 'documentReferences',
                label: 'Documents',
                width: '150px',
                sortable: false,
                type: 'annotated-reference-list',
                maxDisplay: 2,
                noneLabel: 'No Documents'
            },
            {
                key: 'impactsData',
                label: 'Data',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'dataCategories',
                renderMode: 'inline',
                noneLabel: 'No Data Impact'
            },
            {
                key: 'impactsStakeholderCategories',
                label: 'Stakeholder',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'stakeholderCategories',
                renderMode: 'inline',
                noneLabel: 'No Stakeholder Impact'
            },
            {
                key: 'impactsServices',
                label: 'Services',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'services',
                renderMode: 'inline',
                noneLabel: 'No Services Impact'
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
            { key: 'type', label: 'Type' },
            { key: 'drg', label: 'Drafting Group' },
            { key: 'refinesParents', label: 'Refines' },
            { key: 'implementedONs', label: 'Implements' },
            { key: 'dependsOnRequirements', label: 'Dependencies' },
            { key: 'documentReferences', label: 'Document References' },
            { key: 'impactsData', label: 'Data Impact' },
            { key: 'impactsStakeholderCategories', label: 'Stakeholder Impact' },
            { key: 'impactsServices', label: 'Services Impact' }
        ];
    }


    // ====================
    // TREE CONFIGURATION
    // ====================

    /**
     * Build organizational path nodes from path array
     * Returns org-folder nodes only (no DrG, no requirement node)
     *
     * @param {string} drg - Drafting group for ID generation
     * @param {Array} pathArray - Array of path segments (e.g., ['Operations', 'Ground'])
     * @returns {Array} Array of org-folder path nodes
     */
    buildPathTreePath(drg, pathArray) {
        if (!pathArray || !Array.isArray(pathArray) || pathArray.length === 0) {
            return [];
        }

        return pathArray.map((segment, index) => {
            const pathPrefix = pathArray.slice(0, index + 1).join('/');
            return {
                type: 'org-folder',
                value: segment,
                id: `${drg || 'no-drg'}:path:${pathPrefix}`
            };
        });
    }

    /**
     * Build complete tree path for a requirement
     *
     * Path construction rules (mutually exclusive):
     * 1. If path[] defined: DrG → Organizational Folders → Requirement
     * 2. Else if refinesParent defined: Parent's complete tree-path → Requirement
     * 3. Else: DrG → Requirement (root-level)
     *
     * @param {Object} requirement - The requirement entity
     * @param {Map} entityMap - Map of all requirements by ID for parent lookup
     * @returns {Array} Complete tree path from DrG to requirement
     */
    buildRequirementTreePath(requirement, entityMap) {
        const path = [];

        // Level 1: DrG (Drafting Group) root folder - ALWAYS included
        if (requirement.drg) {
            const drgDisplay = getDraftingGroupDisplay(requirement.drg);
            path.push({
                type: 'drg',
                value: drgDisplay,
                id: `drg:${requirement.drg}`
            });
        }

        // MUTUALLY EXCLUSIVE: Either organizational path OR parent chain
        if (requirement.path && Array.isArray(requirement.path) && requirement.path.length > 0) {
            // Case 1: Organizational path folders
            const orgNodes = this.buildPathTreePath(requirement.drg, requirement.path);
            path.push(...orgNodes);
        } else if (requirement.refinesParents && requirement.refinesParents.length > 0) {
            // Case 2: Recursive parent chain - inherit parent's complete path
            const parentRef = requirement.refinesParents[0];
            const parentId = parentRef.itemId || parentRef.id || parentRef;
            const parent = entityMap ? entityMap.get(parentId) : null;
            if (parent) {
                // Recursively build parent's complete tree path
                const parentPath = this.buildRequirementTreePath(parent, entityMap);

                // Extract parent's middle nodes (skip DrG at [0]) and parent node itself
                // We already added DrG above, so we take everything from index 1 onwards
                if (parentPath.length > 1) {
                    path.push(...parentPath.slice(1));
                }
            }
        }
        // Case 3: Neither path nor refinesParent - requirement goes directly under DrG

        // Final level: The requirement itself - ALWAYS included
        path.push({
            type: requirement.type === 'ON' ? 'on-node' : 'or-node',
            value: requirement.title,
            id: requirement.itemId || requirement.id,
            entity: requirement
        });

        return path;
    }

    /**
     * Type renderers for different node types in tree
     * Keys must match the 'type' field in path objects
     */
    getTreeTypeRenderers() {
        return {
            'drg': {
                icon: '📁',
                iconColor: '#dc3545',
                expandable: true,
                label: (pathItem) => pathItem.value
            },
            'org-folder': {
                icon: '📂',
                iconColor: '#ffc107',
                expandable: true,
                label: (pathItem) => pathItem.value
            },
            'on-node': {
                icon: '🔷',
                iconColor: '#007bff',
                expandable: (node) => node.children && Object.keys(node.children).length > 0,
                label: (pathItem) => pathItem.value
            },
            'or-node': {
                icon: '🟩',
                iconColor: '#10b981',
                expandable: (node) => node.children && Object.keys(node.children).length > 0,
                label: (pathItem) => pathItem.value
            }
        };
    }

    /**
     * Column configuration for tree table
     */
    getTreeColumns() {
        return [
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                appliesTo: ['drg', 'org-folder', 'on-node', 'or-node']
            },
            {
                key: 'code',
                label: 'Code',
                width: 'auto',
                appliesTo: ['on-node', 'or-node'],
                type: 'text'
            },
            {
                key: 'implementedONs',
                label: 'Implements',
                width: '150px',
                appliesTo: ['or-node'],
                type: 'implemented-ons',
                maxDisplay: 1,
                noneLabel: 'No Implementation'
            },
            {
                key: 'dependsOnRequirements',
                label: 'Depends On',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                type: 'entity-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Dependencies'
            },
            {
                key: 'documentReferences',
                label: 'Documents',
                width: '100px',
                appliesTo: ['on-node', 'or-node'],
                type: 'annotated-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Documents'
            },
            {
                key: 'impactsData',
                label: 'Data',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                type: 'multi-setup-reference',
                setupEntity: 'dataCategories',
                renderMode: 'inline',
                noneLabel: 'No Data Impact'
            },
            {
                key: 'impactsStakeholderCategories',
                label: 'Stakeholder',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                type: 'multi-setup-reference',
                setupEntity: 'stakeholderCategories',
                renderMode: 'inline',
                noneLabel: 'No Stakeholder Impact'
            },
            {
                key: 'impactsServices',
                label: 'Services',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                type: 'multi-setup-reference',
                setupEntity: 'services',
                renderMode: 'inline',
                noneLabel: 'No Service Impact'
            },
            {
                key: 'updatedBy',
                label: 'Updated By',
                width: '100px',
                appliesTo: ['on-node', 'or-node'],
                type: 'text'
            },
            {
                key: 'updatedAt',
                label: 'Updated',
                width: '100px',
                appliesTo: ['on-node', 'or-node'],
                type: 'date'
            }
        ];
    }

    // ====================
    // UTILITY METHODS
    // ====================

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ====================
    // FILTER MATCHERS
    // ====================

    /**
     * Called by the activity when FilterBar fires 'filtersChanged'.
     * Propagates the new filter array to both active perspectives.
     *
     * @param {Array} activeFilters  Array of { key, label, value, displayValue }
     */
    handleFilterChange(activeFilters) {
        // Store on shared state so perspective switches preserve filters.
        // No client-side filtering: the activity's _applyFiltersToEntities already
        // triggers a server-side reload via updateAllBadges, which returns
        // pre-filtered data. applyFilters() on the collection is therefore a no-op here.
        this.sharedState.filters = activeFilters;
    }

    // ====================
    // RENDERING
    // ====================

    /**
     * UPDATED: Render with specified perspective
     */
    async render(container, perspective = 'collection') {
        this.container = container;
        this.currentPerspective = perspective;

        console.log(`RequirementsEntity: Rendering ${perspective} perspective`);

        // Distribute data to perspectives
        this.collection.setData(this.data);
        this.tree.setData(this.data);

        // Render active perspective
        if (perspective === 'tree') {
            this.tree.render(container);
        } else {
            this.collection.render(container);
        }
    }

    // ====================
    // EVENT HANDLERS
    // ====================

    async handleItemSelect(item) {
        console.log('RequirementsEntity.handleItemSelect:', item);

        // Render details first
        this.renderDetails(item);

        // Then update shared state
        this.sharedState.selectedItem = item;

        // Notify activity for cross-perspective sync
        if (this.app.currentActivity?.updateSharedSelection) {
            this.app.currentActivity.updateSharedSelection(item);
        }
    }

    async renderDetails(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        const currentTab = this.getCurrentTabInPanel(detailsContainer);
        const isReviewMode = this.app.currentActivity?.config?.mode === 'review';
        const detailsButtonText = isReviewMode ? 'Review' : 'Edit';
        const detailsHtml = await this.form.generateReadOnlyView(item, true);

        detailsContainer.innerHTML = `
            <div class="details-sticky-header">
                <div class="item-title-section">
                    <h3 class="item-title">${this.escapeHtml(item.title || `${item.type || 'Requirement'} ${item.itemId}`)}</h3>
                    <span class="item-id">${item.type ? `[${getOperationalRequirementTypeDisplay(item.type)}] ` : ''}${item.itemId}</span>
                </div>
                <div class="details-actions">
                    <button class="btn btn-primary btn-sm" id="detailsBtn">${detailsButtonText}</button>
                </div>
            </div>
            <div class="details-scrollable-content">${detailsHtml}</div>
        `;

        // Initialize richtext fields after HTML insertion
        this.form.initializeRichtextReadOnly(detailsContainer);

        if (currentTab !== null && currentTab !== 0) {
            this.switchTabInPanel(detailsContainer, currentTab);
        }

        const detailsBtn = detailsContainer.querySelector('#detailsBtn');
        if (detailsBtn) {
            if (isReviewMode) {
                detailsBtn.addEventListener('click', () => this.handleReview(item));
            } else {
                detailsBtn.addEventListener('click', () => this.handleEdit(item));
            }
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

    async handleCreate() {
        console.log('RequirementsEntity.handleCreate');
        this.form.showCreateModal();
    }

    async handleEdit(item) {
        console.log('RequirementsEntity.handleEdit:', item);

        // Restore tab state
        if (this.sharedState.currentTabIndex !== undefined) {
            this.form.context.currentTabIndex = this.sharedState.currentTabIndex;
        }

        this.form.showEditModal(item);
    }

    handleReview(item) {
        this.form.showReadOnlyModal(item || this.sharedState.selectedItem);
    }

    // ====================
    // DATA MANAGEMENT
    // ====================


    /**
     * Handle perspective switching from activity
     */
    handlePerspectiveSwitch(perspective, sharedState) {
        console.log(`RequirementsEntity: Switching to ${perspective} perspective`);

        if (perspective === this.currentPerspective) {
            return; // Already in this perspective
        }

        this.currentPerspective = perspective;

        // Update perspective button UI
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (viewControlsContainer) {
            const perspectiveButtons = viewControlsContainer.querySelectorAll('.perspective-option');
            perspectiveButtons.forEach(button => {
                if (button.dataset.perspective === perspective) {
                    button.classList.add('perspective-option--active');
                } else {
                    button.classList.remove('perspective-option--active');
                }
            });
        }

        // Apply shared state to new perspective
        if (sharedState) {
            this.applySharedState(sharedState);
        }

        // Re-render with current perspective
        this.render(this.container, perspective);
    }


    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);

        // Update shared state
        this.sharedState.grouping = groupBy;
    }

    cleanup() {
        this.collection.cleanup();
        if (this.tree) {
            this.tree.container = null;
        }
        this.container = null;
    }

    // ====================
    // REQUIREMENT-SPECIFIC OPERATIONS
    // ====================

    async getRequirementHierarchy(rootId = null) {
        try {
            // Get all requirements
            const allRequirements = this.data;

            // Build hierarchy
            const hierarchy = [];
            const requirementsById = {};

            // Index by ID
            allRequirements.forEach(req => {
                const id = req.itemId || req.id;
                requirementsById[id] = { ...req, children: [], implementers: [] };
            });

            // Build refinement tree
            allRequirements.forEach(req => {
                const refinesParents = req.refinesParents || [];
                if (refinesParents.length === 0) {
                    // Root requirement
                    if (!rootId || (req.itemId || req.id) === rootId) {
                        hierarchy.push(requirementsById[req.itemId || req.id]);
                    }
                } else {
                    // Child requirement
                    refinesParents.forEach(parent => {
                        const parentId = parent.itemId || parent.id || parent;
                        if (requirementsById[parentId]) {
                            requirementsById[parentId].children.push(requirementsById[req.itemId || req.id]);
                        }
                    });
                }

                // Build implementation relationships
                if (req.type === 'OR' && req.implementedONs) {
                    req.implementedONs.forEach(on => {
                        const onId = on.itemId || on.id || on;
                        if (requirementsById[onId]) {
                            requirementsById[onId].implementers.push(requirementsById[req.itemId || req.id]);
                        }
                    });
                }
            });

            return hierarchy;
        } catch (error) {
            console.error('Failed to build requirement hierarchy:', error);
            return [];
        }
    }

    // ====================
    // LIFECYCLE NOTIFICATIONS - Phase 1
    // ====================

    /**
     * Called when requirements data has been updated (loaded/filtered)
     * @param {Array} data - The new requirements data
     * @param {number} count - Total count of requirements
     */
    onDataUpdated(data, count) {
        console.log('RequirementsEntity.onDataUpdated:', { count, isActive: this.isActive });

        // Update internal data cache
        this.data = [...data];

        // If this view is currently active, render the data
        if (this.isActive) {
            this.renderFromCache();
        }
    }

    /**
     * Render current perspective from cached data
     */
    renderFromCache() {
        if (!this.container) {
            console.warn('RequirementsEntity.renderFromCache: No container available');
            return;
        }

        console.log(`RequirementsEntity.renderFromCache: Rendering ${this.currentPerspective} with ${this.data.length} items`);

        // Distribute data to perspectives
        this.collection.setData(this.data);
        this.tree.setData(this.data);

        // Render active perspective
        if (this.currentPerspective === 'tree') {
            this.tree.render(this.container);
        } else {
            this.collection.render(this.container);
        }
    }

    /**
     * Called when this entity view becomes active (user switches to this tab)
     */
    onActivated() {
        console.log('RequirementsEntity.onActivated');
        this.isActive = true;

        // Render view controls
        this.renderViewControls();

        // Render from cache if we have data
        if (this.data && this.data.length > 0) {
            this.renderFromCache();
        }
    }

    /**
     * Render view-specific controls (perspective selector, grouping, actions)
     */
    renderViewControls() {
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (!viewControlsContainer) {
            console.warn('RequirementsEntity.renderViewControls: No viewControls container');
            return;
        }

        const groupingConfig = this.getGroupingConfig();
        const isReviewMode = this.app.currentActivity?.config?.mode === 'review';

        viewControlsContainer.innerHTML = `
            <div class="perspective-controls">
                <div class="perspective-toggle">
                    <button class="perspective-option ${this.currentPerspective === 'collection' ? 'perspective-option--active' : ''}" 
                            data-perspective="collection">
                        📋 Collection
                    </button>
                    <button class="perspective-option ${this.currentPerspective === 'tree' ? 'perspective-option--active' : ''}" 
                            data-perspective="tree">
                        🌳 Tree
                    </button>
                </div>
            </div>
            
            <div class="collection-actions-and-grouping">
                <div class="grouping-section">
                    <label for="groupBy">Group by:</label>
                    <select id="groupBy" class="form-control group-select">
                        ${groupingConfig.map(option => `
                            <option value="${option.key || option.value}" 
                                    ${(option.key || option.value) === this.sharedState.grouping ? 'selected' : ''}>
                                ${option.label}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                ${!isReviewMode ? `
                    <div class="actions-section">
                        <button class="btn btn-primary" id="createEntity">
                            <span class="btn-icon">+</span> New Requirement
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        this.bindViewControlEvents();
    }

    /**
     * Bind events for view controls
     */
    bindViewControlEvents() {
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (!viewControlsContainer) return;

        // Perspective switching
        const perspectiveButtons = viewControlsContainer.querySelectorAll('.perspective-option');
        perspectiveButtons.forEach(button => {
            button.addEventListener('click', () => {
                const perspective = button.dataset.perspective;
                this.handlePerspectiveSwitch(perspective, this.sharedState);
            });
        });

        // Grouping
        const groupBySelect = viewControlsContainer.querySelector('#groupBy');
        if (groupBySelect) {
            groupBySelect.addEventListener('change', (e) => {
                this.handleGrouping(e.target.value);
            });
        }

        // Create button
        const createBtn = viewControlsContainer.querySelector('#createEntity');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }
    }

    /**
     * Called when this entity view becomes inactive (user switches away)
     */
    onDeactivated() {
        console.log('RequirementsEntity.onDeactivated');
        this.isActive = false;

        // Clear view controls
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (viewControlsContainer) {
            viewControlsContainer.innerHTML = '';
        }
    }
}