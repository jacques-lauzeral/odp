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
 */
export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        this.currentPerspective = 'collection';
        this.data = [];
        this.isActive = false;

        this.sharedState = {
            filters: [],
            selectedItem: null,
            grouping: 'none',
            currentTabIndex: 0
        };

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

        this.form = new RequirementForm(entityConfig, {
            setupData,
            currentTabIndex: 0,
            onTabChange: (index) => {
                this.sharedState.currentTabIndex = index;
            }
        });
    }

    // ====================
    // STATE MANAGEMENT
    // ====================

    applySharedState(sharedState) {
        if (sharedState.selectedItem) {
            this.collection.selectedItem = sharedState.selectedItem;
            this.tree.selectedItem = sharedState.selectedItem;
        }

        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }

        if (sharedState.currentTabIndex !== undefined && this.form) {
            this.sharedState.currentTabIndex = sharedState.currentTabIndex;
            this.form.context.currentTabIndex = sharedState.currentTabIndex;
        }

        if (this.currentPerspective === 'tree') {
            this.tree.render(this.container);
        } else {
            this.collection.renderContent();
        }
    }

    // ====================
    // COLUMN DEFINITIONS
    // ====================

    /**
     * Unified column specification — single source of truth for all column metadata.
     * Fields present: key, label, width, type, sortable, appliesTo,
     *                 groupPriority, groupPrefix, maxDisplay, noneLabel
     * Callers cherry-pick by name; unused fields are ignored by renderers.
     */
    static _cols() {
        return {
            code: {
                key: 'code', label: 'Code', width: '120px',
                type: 'text', sortable: true,
                appliesTo: ['on-node', 'or-node']
            },
            type: {
                key: 'type', label: 'Type', width: '80px',
                type: 'requirement-type', sortable: true,
                groupPriority: { 'ON': 1, 'OR': 2 },
                appliesTo: ['on-node', 'or-node']
            },
            maturity: {
                key: 'maturity', label: 'Maturity', width: '100px',
                type: 'text', sortable: true,
                appliesTo: ['on-node', 'or-node']
            },
            title: {
                key: 'title', label: 'Title', width: 'auto',
                type: 'text', sortable: true,
                appliesTo: ['drg', 'org-folder', 'on-node', 'or-node']
            },
            drg: {
                key: 'drg', label: 'DrG', width: '120px',
                type: 'drafting-group', sortable: true,
                appliesTo: ['on-node', 'or-node']
            },
            refinesParents: {
                key: 'refinesParents', label: 'Refines', width: '200px',
                type: 'entity-reference-list', sortable: false,
                maxDisplay: 1, groupPrefix: 'Refines',
                appliesTo: ['on-node', 'or-node']
            },
            implementedONs: {
                key: 'implementedONs', label: 'Implements', width: '150px',
                type: 'implemented-ons', sortable: false,
                maxDisplay: 3, groupPrefix: 'Implements',
                appliesTo: ['on-node']
            },
            dependencies: {
                key: 'dependencies', label: 'Depends On', width: '120px',
                type: 'entity-reference-list', sortable: false,
                maxDisplay: 3, groupPrefix: 'Depends On',
                appliesTo: ['on-node']
            },
            impactedStakeholders: {
                key: 'impactedStakeholders', label: 'Stakeholders', width: '120px',
                type: 'annotated-reference-list', sortable: false,
                maxDisplay: 3,
                appliesTo: ['on-node']
            },
            impactedDomains: {
                key: 'impactedDomains', label: 'Domains', width: '120px',
                type: 'annotated-reference-list', sortable: false,
                maxDisplay: 3,
                appliesTo: ['on-node']
            },
            strategicDocuments: {
                key: 'strategicDocuments', label: 'Strategic', width: '120px',
                type: 'annotated-reference-list', sortable: false,
                maxDisplay: 3,
                appliesTo: ['on-node']
            },
            updatedBy: {
                key: 'updatedBy', label: 'Updated By', width: '100px',
                type: 'text', sortable: false,
                appliesTo: ['on-node', 'or-node']
            },
            updatedAt: {
                key: 'updatedAt', label: 'Updated', width: '100px',
                type: 'date', sortable: false,
                appliesTo: ['on-node', 'or-node']
            }
        };
    }

    // ====================
    // COLLECTION CONFIGURATION
    // ====================

    getColumnConfig() {
        const c = RequirementsEntity._cols();
        return [
            'code', 'type', 'maturity', 'title', 'drg',
            'strategicDocuments', 'implementedONs', 'dependencies',
            'impactedStakeholders', 'impactedDomains'
        ].map(k => c[k]);
    }

    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'type', label: 'Type' },
            { key: 'maturity', label: 'Maturity' },
            { key: 'drg', label: 'Drafting Group' },
            { key: 'strategicDocuments', label: 'Strategic' },
            { key: 'refinesParents', label: 'Refines' },
            { key: 'implementedONs', label: 'Implements' },
            { key: 'dependencies', label: 'Dependencies' },
            { key: 'impactedStakeholders', label: 'Stakeholder Impact' },
            { key: 'impactedDomains', label: 'Domain Impact' }
        ];
    }

    // ====================
    // TREE CONFIGURATION
    // ====================

    buildPathTreePath(drg, pathArray) {
        if (!pathArray || !Array.isArray(pathArray) || pathArray.length === 0) return [];

        return pathArray.map((segment, index) => {
            const pathPrefix = pathArray.slice(0, index + 1).join('/');
            return {
                type: 'org-folder',
                value: segment,
                id: `${drg || 'no-drg'}:path:${pathPrefix}`
            };
        });
    }

    buildRequirementTreePath(requirement, entityMap) {
        const path = [];

        if (requirement.drg) {
            path.push({
                type: 'drg',
                value: getDraftingGroupDisplay(requirement.drg),
                id: `drg:${requirement.drg}`
            });
        }

        if (requirement.path && Array.isArray(requirement.path) && requirement.path.length > 0) {
            path.push(...this.buildPathTreePath(requirement.drg, requirement.path));
        } else if (requirement.refinesParents && requirement.refinesParents.length > 0) {
            const parentRef = requirement.refinesParents[0];
            const parentId = parentRef.itemId || parentRef.id || parentRef;
            const parent = entityMap ? entityMap.get(parentId) : null;
            if (parent) {
                const parentPath = this.buildRequirementTreePath(parent, entityMap);
                if (parentPath.length > 1) {
                    path.push(...parentPath.slice(1));
                }
            }
        }

        path.push({
            type: requirement.type === 'ON' ? 'on-node' : 'or-node',
            value: requirement.title,
            id: requirement.itemId || requirement.id,
            entity: requirement
        });

        return path;
    }

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
                icon: '🎯',
                iconColor: '#007bff',
                expandable: (node) => node.children && Object.keys(node.children).length > 0,
                label: (pathItem) => pathItem.value
            },
            'or-node': {
                icon: '📋',
                iconColor: '#10b981',
                expandable: (node) => node.children && Object.keys(node.children).length > 0,
                label: (pathItem) => pathItem.value
            }
        };
    }

    getTreeColumns() {
        const c = RequirementsEntity._cols();
        return [
            'title', 'code', 'maturity', 'implementedONs', 'dependencies',
            'impactedStakeholders', 'impactedDomains', 'updatedBy', 'updatedAt'
        ].map(k => c[k]);
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

    getItemId(item) {
        return item?.itemId || item?.id || null;
    }

    // ====================
    // FILTER MATCHERS
    // ====================

    handleFilterChange(activeFilters) {
        this.sharedState.filters = activeFilters;
    }

    // ====================
    // RENDERING
    // ====================

    async render(container, perspective = 'collection') {
        this.container = container;
        this.currentPerspective = perspective;

        this.collection.setData(this.data);
        this.tree.setData(this.data);

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
        this.renderDetails(item);
        this.sharedState.selectedItem = item;

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

        headers.forEach((header, index) => header.classList.toggle('active', index === tabIndex));
        panels.forEach((panel, index) => panel.classList.toggle('active', index === tabIndex));
    }

    async handleCreate() {
        this.form.showCreateModal();
    }

    async handleEdit(item) {
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

    handlePerspectiveSwitch(perspective, sharedState) {
        if (perspective === this.currentPerspective) return;

        this.currentPerspective = perspective;

        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (viewControlsContainer) {
            viewControlsContainer.querySelectorAll('.perspective-option').forEach(button => {
                button.classList.toggle('perspective-option--active', button.dataset.perspective === perspective);
            });
        }

        if (sharedState) this.applySharedState(sharedState);

        this.render(this.container, perspective).then(() => {
            this._restoreSelectionAfterRender();
        });
    }

    _restoreSelectionAfterRender() {
        const selected = this.sharedState.selectedItem;
        if (!selected) return;

        const selectedId = this.getItemId(selected);
        if (selectedId == null) return;

        const freshItem = this.data.find(d => this.getItemId(d) === selectedId) || selected;

        if (this.currentPerspective === 'tree') {
            this.tree.selectedItem = freshItem;
        } else {
            this.collection.selectedItem = freshItem;
            const rows = this.container?.querySelectorAll('.collection-row');
            rows?.forEach(row => {
                row.classList.toggle('collection-row--selected', row.dataset.itemId === String(selectedId));
            });
        }

        this.renderDetails(freshItem);
    }

    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);
        this.sharedState.grouping = groupBy;
    }

    cleanup() {
        this.collection.cleanup();
        if (this.tree) this.tree.container = null;
        this.container = null;
    }

    // ====================
    // LIFECYCLE NOTIFICATIONS
    // ====================

    onDataUpdated(data, count) {
        this.data = [...data];
        if (this.isActive) this.renderFromCache();
    }

    renderFromCache() {
        if (!this.container) return;

        this.collection.setData(this.data);
        this.tree.setData(this.data);

        if (this.currentPerspective === 'tree') {
            this.tree.render(this.container);
        } else {
            this.collection.render(this.container);
        }

        this._restoreSelectionAfterRender();
    }

    onActivated() {
        this.isActive = true;
        this.renderViewControls();
        if (this.data && this.data.length > 0) this.renderFromCache();
    }

    renderViewControls() {
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (!viewControlsContainer) return;

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

    bindViewControlEvents() {
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (!viewControlsContainer) return;

        viewControlsContainer.querySelectorAll('.perspective-option').forEach(button => {
            button.addEventListener('click', () => {
                this.handlePerspectiveSwitch(button.dataset.perspective, this.sharedState);
            });
        });

        const groupBySelect = viewControlsContainer.querySelector('#groupBy');
        if (groupBySelect) {
            groupBySelect.addEventListener('change', (e) => this.handleGrouping(e.target.value));
        }

        const createBtn = viewControlsContainer.querySelector('#createEntity');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }
    }

    onDeactivated() {
        this.isActive = false;
        const viewControlsContainer = this.app.currentActivity?.container?.querySelector('#viewControls');
        if (viewControlsContainer) viewControlsContainer.innerHTML = '';
    }
}