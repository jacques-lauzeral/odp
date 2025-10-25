import CollectionEntity from '../../components/odp/collection-entity.js';
import TreeTableEntity from '../../components/odp/tree-table-entity.js';
import RequirementForm from './requirement-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';
import {
    OperationalRequirementType,
    getOperationalRequirementTypeDisplay,
    DraftingGroup,
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

        // Local shared state for this entity
        this.sharedState = {
            filters: {},
            selectedItem: null,
            grouping: 'none',
            currentTabIndex: 0
        };

        // Initialize collection perspective
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { setupData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onRefresh: () => this.handleRefresh(),
            onFilterChange: (filters) => this.handleFilterChange(filters),
            getEmptyStateMessage: () => ({
                icon: '📋',
                title: 'No Requirements Yet',
                description: 'Start creating operational requirements to define system needs and behaviors.',
            })
        });

        // Initialize tree perspective
        this.tree = new TreeTableEntity(app, entityConfig, {
            pathBuilder: (entity) => this.buildTreePath(entity),
            typeRenderers: this.getTreeTypeRenderers(),
            columns: this.getTreeColumns(),
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

        // Listen for save events
        document.addEventListener('entitySaved', async(e) => {
            if (e.detail.entityType === 'Operational Requirements') {
                await this.refresh();
            }
        });
    }

    // ====================
    // STATE MANAGEMENT - CENTRALIZED STATE
    // ====================

    applySharedState(sharedState) {
        console.log('RequirementsEntity.applySharedState:', sharedState);

        // Apply filters to both perspectives
        if (sharedState.filters) {
            this.collection.currentFilters = { ...sharedState.filters };
            this.tree.currentFilters = { ...sharedState.filters };
        }

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

        // Re-render current perspective
        if (this.currentPerspective === 'tree') {
            this.tree.applyFilters();
        } else {
            this.collection.applyFilters();
        }
    }

    syncFilters(filters) {
        console.log('RequirementsEntity.syncFilters:', filters);

        if (this.collection) {
            this.collection.currentFilters = { ...filters };
            this.collection.applyFilters();
        }

        if (this.tree) {
            this.tree.currentFilters = { ...filters };
            this.tree.applyFilters();
        }
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
                    { value: '', label: 'Any' },
                    { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
                    { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
                ]
            },
            {
                key: 'text',
                label: 'Full Text Search',
                type: 'text',
                placeholder: 'Search across title, statement, rationale...'
            },
            {
                key: 'drg',
                label: 'Drafting Group',
                type: 'select',
                options: this.buildDraftingGroupOptions()
            },
            {
                key: 'dataCategory',
                label: 'Data Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('dataCategories')
            },
            {
                key: 'stakeholderCategory',
                label: 'Stakeholder Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('stakeholderCategories')
            },
            {
                key: 'service',
                label: 'Services Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('services')
            },
            {
                key: 'document',
                label: 'Document Reference',
                type: 'select',
                options: this.buildOptionsFromSetupData('documents')
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
                label: 'DRG',
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

    buildOptionsFromSetupData(key) {
        const options = [{ value: '', label: 'Any' }];
        if (this.setupData && this.setupData[key]) {
            this.setupData[key].forEach(item => {
                options.push({
                    value: item.id,
                    label: item.name || item.title
                });
            });
        }
        return options;
    }

    // ====================
    // TREE CONFIGURATION
    // ====================

    /**
     * Build tree path for requirement
     * Path format: Type > Parent Chain > Requirement
     */
    // ====================
    // TREE CONFIGURATION
    // ====================

    /**
     * Build tree path for requirement
     * Returns typed path objects for TreeTableEntity
     * Path structure: DrG → Organizational Folders → Parent Requirements → Requirement
     */
    buildTreePath(requirement) {
        const path = [];

        // Level 1: DrG (Drafting Group) root folder
        if (requirement.drg) {
            const drgDisplay = getDraftingGroupDisplay(requirement.drg);
            path.push({
                type: 'drg',
                value: drgDisplay,
                id: `drg:${requirement.drg}`
            });
        }

        // Level 2: Organizational path folders (from path array field)
        if (requirement.path && Array.isArray(requirement.path)) {
            requirement.path.forEach((segment, index) => {
                const pathPrefix = requirement.path.slice(0, index + 1).join('/');
                path.push({
                    type: 'org-folder',
                    value: segment,
                    id: `${requirement.drg || 'no-drg'}:path:${pathPrefix}`
                });
            });
        }

        // Level 3: Build parent chain from REFINES relationships
        const parentChain = this.getParentChainTyped(requirement);
        path.push(...parentChain);

        // Final level: The requirement itself
        path.push({
            type: requirement.type === 'ON' ? 'on-node' : 'or-node',
            value: requirement.title,
            id: requirement.itemId || requirement.id,
            entity: requirement
        });

        return path;
    }

    /**
     * Build typed parent chain for tree hierarchy
     * Follows REFINES relationships up to root
     */
    getParentChainTyped(requirement) {
        const chain = [];
        const visited = new Set();

        const buildChain = (req) => {
            if (!req || !req.refinesParents || req.refinesParents.length === 0) {
                return;
            }

            // Take first parent (primary refinement)
            const parentRef = req.refinesParents[0];
            const parentId = parentRef.itemId || parentRef.id || parentRef;

            // Prevent cycles
            if (visited.has(parentId)) return;
            visited.add(parentId);

            const parent = this.data.find(r =>
                (r.itemId || r.id) === parentId
            );

            if (parent) {
                buildChain(parent); // Recurse up
                chain.push({
                    type: parent.type === 'ON' ? 'on-node' : 'or-node',
                    value: parent.title,
                    id: parent.itemId || parent.id,
                    entity: parent
                });
            }
        };

        buildChain(requirement);
        return chain;
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
                key: 'implementedONs',
                label: 'Implements',
                width: '150px',
                appliesTo: ['or-node'],
                render: (node) => {
                    if (!node.entity || !node.entity.implementedONs || node.entity.implementedONs.length === 0) {
                        return '-';
                    }
                    const displayItems = node.entity.implementedONs.slice(0, 2);
                    const remaining = node.entity.implementedONs.length - displayItems.length;

                    let html = displayItems.map(ref => {
                        const title = ref?.title || ref?.id || 'Unknown';
                        return `<span class="reference-item">${this.escapeHtml(title)}</span>`;
                    }).join(', ');

                    if (remaining > 0) {
                        html += `, <span class="reference-more">+${remaining}</span>`;
                    }
                    return html;
                }
            },
            {
                key: 'dependsOnRequirements',
                label: 'Depends On',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    if (!node.entity || !node.entity.dependsOnRequirements || node.entity.dependsOnRequirements.length === 0) {
                        return '-';
                    }
                    const count = node.entity.dependsOnRequirements.length;
                    return count === 1 ? '1 dep' : `${count} deps`;
                }
            },
            {
                key: 'documentReferences',
                label: 'Documents',
                width: '100px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    if (!node.entity || !node.entity.documentReferences || node.entity.documentReferences.length === 0) {
                        return '-';
                    }
                    return `${node.entity.documentReferences.length} docs`;
                }
            },
            {
                key: 'impactsData',
                label: 'Data',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    if (!node.entity || !node.entity.impactsData || node.entity.impactsData.length === 0) {
                        return '-';
                    }
                    return this.renderSetupDataList(node.entity.impactsData, 'dataCategories', 1);
                }
            },
            {
                key: 'impactsStakeholderCategories',
                label: 'Stakeholder',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    if (!node.entity || !node.entity.impactsStakeholderCategories || node.entity.impactsStakeholderCategories.length === 0) {
                        return '-';
                    }
                    return this.renderSetupDataList(node.entity.impactsStakeholderCategories, 'stakeholderCategories', 1);
                }
            },
            {
                key: 'impactsServices',
                label: 'Services',
                width: '120px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    if (!node.entity || !node.entity.impactsServices || node.entity.impactsServices.length === 0) {
                        return '-';
                    }
                    return this.renderSetupDataList(node.entity.impactsServices, 'services', 1);
                }
            },
            {
                key: 'updatedBy',
                label: 'Updated By',
                width: '100px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    return node.entity?.updatedBy ? this.escapeHtml(node.entity.updatedBy) : '-';
                }
            },
            {
                key: 'updatedAt',
                label: 'Updated',
                width: '100px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => {
                    return node.entity?.updatedAt ? this.formatDate(node.entity.updatedAt) : '-';
                }
            }
        ];
    }

    // Helper methods for tree rendering
    renderSetupDataList(ids, setupKey, maxDisplay = 1) {
        if (!this.setupData || !this.setupData[setupKey]) {
            return ids.length.toString();
        }

        const displayItems = ids.slice(0, maxDisplay);
        const remaining = ids.length - displayItems.length;

        const names = displayItems.map(id => {
            const item = this.setupData[setupKey].find(s => s.id === id);
            return item ? (item.name || item.title || id) : id;
        });

        let html = names.map(name => this.escapeHtml(name)).join(', ');

        if (remaining > 0) {
            html += ` <span class="reference-more">+${remaining}</span>`;
        }

        return html;
    }

    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

        // Initial data load if needed
        if (this.data.length === 0) {
            await this.loadData();
        }

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

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

    async handleDelete(item) {
        const confirmed = await this.app.confirmDialog(
            'Delete Requirement',
            `Are you sure you want to delete requirement "${item.itemId} - ${item.title}"? This action cannot be undone.`
        );

        if (confirmed) {
            try {
                await apiClient.delete(`/${this.entityConfig.endpoint}/${item.id}`);
                await this.refresh();
                this.app.showNotification('Requirement deleted successfully', 'success');
            } catch (error) {
                console.error('Failed to delete requirement:', error);
                this.app.showNotification('Failed to delete requirement', 'error');
            }
        }
    }

    async handleRefresh() {
        console.log('RequirementsEntity.handleRefresh');
        await this.refresh();
    }

    // ====================
    // DATA MANAGEMENT
    // ====================

    /**
     * UPDATED: Parent loads data from API with server-side filtering
     */
    async loadData() {
        try {
            let endpoint = this.entityConfig.endpoint;
            if (!endpoint) {
                console.warn('RequirementsEntity: No endpoint configured');
                this.data = [];
                return;
            }

            const queryParams = {};

            // Add edition context (baseline/wave) if present
            const editionContext = this.app?.currentActivity?.config?.dataSource;
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

            // Add content filters from collection's current filters
            if (this.collection && this.collection.currentFilters) {
                Object.entries(this.collection.currentFilters).forEach(([key, value]) => {
                    if (value && value !== '') {
                        queryParams[key] = value;
                    }
                });
            }

            // Build endpoint with query parameters
            if (Object.keys(queryParams).length > 0) {
                const queryString = new URLSearchParams(queryParams).toString();
                endpoint = `${endpoint}?${queryString}`;
            }

            console.log(`RequirementsEntity: Loading data from ${endpoint}`);
            const response = await apiClient.get(endpoint);
            this.data = Array.isArray(response) ? response : [];

            console.log(`RequirementsEntity: Loaded ${this.data.length} requirements`);
        } catch (error) {
            console.error('Failed to load requirements data:', error);
            this.data = [];
            throw error;
        }
    }

    /**
     * UPDATED: Refresh data and update all perspectives
     */
    async refresh() {
        await this.loadData();

        // Update both perspectives with refreshed data
        this.collection.setData(this.data);
        this.tree.setData(this.data);

        // Re-render active perspective
        if (this.currentPerspective === 'tree') {
            this.tree.applyFilters();
        } else {
            this.collection.applyFilters();
        }

        // Invalidate form caches
        if (this.form.parentRequirementsCache) {
            this.form.parentRequirementsCache = null;
        }
        if (this.form.onRequirementsCache) {
            this.form.onRequirementsCache = null;
        }
        if (this.form.dependencyRequirementsCache) {
            this.form.dependencyRequirementsCache = null;
        }
    }

    /**
     * Handle perspective switching from activity
     */
    handlePerspectiveSwitch(perspective, sharedState) {
        console.log(`RequirementsEntity: Switching to ${perspective} perspective`);
        this.currentPerspective = perspective;

        // Apply shared state to new perspective
        if (sharedState) {
            this.applySharedState(sharedState);
        }

        // Re-render with current perspective
        this.render(this.container, perspective);
    }

    async handleFilterChange(filters) {
        console.log('RequirementsEntity.handleFilterChange:', filters);

        // Update shared state
        this.sharedState.filters = { ...filters };

        // Reload data from server with new filters
        await this.loadData();

        // Update both perspectives with new data
        this.collection.setData(this.data);
        this.tree.setData(this.data);
    }

    handleFilter(filterKey, filterValue) {
        // Delegate to collection - it will trigger onFilterChange callback
        this.collection.handleFilter(filterKey, filterValue);
    }

    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);

        // Update shared state
        this.sharedState.grouping = groupBy;
    }

    handleEditModeToggle(enabled) {
        // Future: Handle inline editing mode
        console.log('Edit mode:', enabled);
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

    async getImplementationSummary() {
        try {
            const summary = {
                totalONs: 0,
                totalORs: 0,
                implementedONs: 0,
                unimplementedONs: 0,
                implementationsByDRG: {}
            };

            const allRequirements = this.data;

            // Count by type
            allRequirements.forEach(req => {
                if (req.type === 'ON') {
                    summary.totalONs++;
                } else if (req.type === 'OR') {
                    summary.totalORs++;
                }
            });

            // Count implemented ONs
            const implementedONIds = new Set();
            allRequirements.forEach(req => {
                if (req.type === 'OR' && req.implementedONs) {
                    req.implementedONs.forEach(on => {
                        const onId = on.itemId || on.id || on;
                        implementedONIds.add(onId);
                    });
                }
            });

            summary.implementedONs = implementedONIds.size;
            summary.unimplementedONs = summary.totalONs - summary.implementedONs;

            // Count implementations by DRG
            allRequirements.forEach(req => {
                if (req.type === 'OR' && req.implementedONs && req.implementedONs.length > 0) {
                    const drg = req.drg || 'Unassigned';
                    if (!summary.implementationsByDRG[drg]) {
                        summary.implementationsByDRG[drg] = 0;
                    }
                    summary.implementationsByDRG[drg] += req.implementedONs.length;
                }
            });

            return summary;
        } catch (error) {
            console.error('Failed to calculate implementation summary:', error);
            return null;
        }
    }

    async getImpactSummary() {
        try {
            const summary = {
                stakeholder: {},
                data: {},
                services: {}
            };

            this.data.forEach(req => {
                // Count stakeholder impacts
                (req.impactsStakeholderCategories || []).forEach(id => {
                    summary.stakeholder[id] = (summary.stakeholder[id] || 0) + 1;
                });

                // Count data impacts
                (req.impactsData || []).forEach(id => {
                    summary.data[id] = (summary.data[id] || 0) + 1;
                });

                // Count services impacts
                (req.impactsServices || []).forEach(id => {
                    summary.services[id] = (summary.services[id] || 0) + 1;
                });
            });

            return summary;
        } catch (error) {
            console.error('Failed to calculate impact summary:', error);
            return null;
        }
    }
}