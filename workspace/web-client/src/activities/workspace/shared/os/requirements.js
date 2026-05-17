/**
 * @file requirements.js
 * @description Operational Requirements list component. Supports Collection and Tree
 * perspectives. Owned and orchestrated by os.js — no back-references to
 * app.currentActivity.
 *
 * Injected callbacks (required):
 *   onItemSelect(item)      — called when user selects a row; os.js navigates to detail page
 *   getViewControlsEl()     — returns the HTMLElement where view controls are mounted
 *   isReadOnly              — boolean; true in Explore context (hides create button)
 */
import CollectionEntity from '../../../../components/odp/collection-entity.js';
import TreeTableEntity from '../../../../components/odp/tree-table-entity.js';
import RequirementForm from './requirement-form.js';
import { odpColumnTypes } from '../../../../components/odp/odp-column-types.js';
import {
    getOperationalRequirementTypeDisplay,
    getDraftingGroupDisplay
} from '/shared/src/index.js';

export default class RequirementsEntity {
    /**
     * @param {import('../../app.js').App} app
     * @param {{ endpoint: string }} entityConfig
     * @param {object} setupData
     * @param {object} options
     * @param {Function} options.onItemSelect      - (item) => void
     * @param {Function} options.getViewControlsEl - () => HTMLElement|null
     * @param {boolean}  options.isReadOnly        - true in Explore/review context
     */
    constructor(app, entityConfig, setupData, options = {}) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;

        // Injected callbacks — no back-references to app.currentActivity
        this._onItemSelect      = options.onItemSelect      ?? (() => {});
        this._getViewControlsEl = options.getViewControlsEl ?? (() => null);
        this._isReadOnly        = options.isReadOnly        ?? false;

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
            getColumnConfig:   () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect:      (item) => this._handleItemSelect(item),
            getEmptyStateMessage: () => ({
                icon: '📋',
                title: 'No Requirements Yet',
                description: 'Start creating operational requirements to define system needs and behaviors.',
            })
        });

        this.tree = new TreeTableEntity(app, entityConfig, {
            pathBuilder:   (entity, entityMap) => this.buildRequirementTreePath(entity, entityMap),
            typeRenderers: this.getTreeTypeRenderers(),
            columns:       this.getTreeColumns(),
            columnTypes:   odpColumnTypes,
            context:       { setupData },
            onItemSelect:  (item) => this._handleItemSelect(item),
            onCreate:      () => this._handleCreate(),
            onDataLoaded:  (data) => { console.log('Tree data loaded:', data.length); }
        });

        this.form = new RequirementForm(entityConfig, {
            setupData,
            getSetupData:  () => this.setupData,
            getRequirements: () => this.data,
            currentTabIndex: 0,
            onTabChange: (index) => {
                this.sharedState.currentTabIndex = index;
            }
        });
    }

    // -------------------------------------------------------------------------
    // State management
    // -------------------------------------------------------------------------

    applySharedState(sharedState) {
        if (sharedState.selectedItem) {
            this.collection.selectedItem = sharedState.selectedItem;
            this.tree.selectedItem       = sharedState.selectedItem;
        }
        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }
        if (sharedState.currentTabIndex !== undefined && this.form) {
            this.sharedState.currentTabIndex        = sharedState.currentTabIndex;
            this.form.context.currentTabIndex       = sharedState.currentTabIndex;
        }
        if (this.currentPerspective === 'tree') {
            this.tree.render(this.container);
        } else {
            this.collection.renderContent();
        }
    }

    // -------------------------------------------------------------------------
    // Column definitions
    // -------------------------------------------------------------------------

    static _cols() {
        return {
            code:               { key: 'code',               label: 'Code',          width: '120px', type: 'text',                    sortable: true,  appliesTo: ['on-node', 'or-node'] },
            type:               { key: 'type',               label: 'Type',          width: '80px',  type: 'requirement-type',        sortable: true,  groupPriority: { 'ON': 1, 'OR': 2 }, appliesTo: ['on-node', 'or-node'] },
            maturity:           { key: 'maturity',           label: 'Maturity',      width: '100px', type: 'text',                    sortable: true,  appliesTo: ['on-node', 'or-node'] },
            title:              { key: 'title',              label: 'Title',         width: 'auto',  type: 'text',                    sortable: true,  appliesTo: ['drg', 'org-folder', 'on-node', 'or-node'] },
            drg:                { key: 'drg',                label: 'DrG',           width: '120px', type: 'drafting-group',           sortable: true,  appliesTo: ['on-node', 'or-node'] },
            refinesParents:     { key: 'refinesParents',     label: 'Refines',       width: '200px', type: 'entity-reference-list',   sortable: false, maxDisplay: 1,  groupPrefix: 'Refines',      appliesTo: ['on-node', 'or-node'] },
            implementedONs:     { key: 'implementedONs',     label: 'Implements',    width: '150px', type: 'implemented-ons',         sortable: false, maxDisplay: 3,  groupPrefix: 'Implements',   appliesTo: ['or-node'] },
            dependencies:       { key: 'dependencies',       label: 'Depends On',    width: '120px', type: 'entity-reference-list',   sortable: false, maxDisplay: 3,  groupPrefix: 'Depends On',   appliesTo: ['or-node'] },
            impactedStakeholders: { key: 'impactedStakeholders', label: 'Stakeholders', width: '120px', type: 'annotated-reference-list', sortable: false, maxDisplay: 3, setupEntity: 'stakeholderCategories', appliesTo: ['or-node'] },
            impactedDomains:    { key: 'impactedDomains',    label: 'Domains',       width: '120px', type: 'annotated-reference-list', sortable: false, maxDisplay: 3, setupEntity: 'domains',      appliesTo: ['or-node'] },
            strategicDocuments: { key: 'strategicDocuments', label: 'Strategic',     width: '120px', type: 'annotated-reference-list', sortable: false, maxDisplay: 3, setupEntity: 'referenceDocuments', appliesTo: ['on-node'] },
            updatedBy:          { key: 'updatedBy',          label: 'Updated By',    width: '100px', type: 'text',                    sortable: false, appliesTo: ['on-node', 'or-node'] },
            updatedAt:          { key: 'updatedAt',          label: 'Updated',       width: '100px', type: 'date',                    sortable: false, appliesTo: ['on-node', 'or-node'] },
        };
    }

    getColumnConfig() {
        const c = RequirementsEntity._cols();
        return ['code', 'type', 'maturity', 'title', 'drg',
            'strategicDocuments', 'implementedONs', 'dependencies',
            'impactedStakeholders', 'impactedDomains'].map(k => c[k]);
    }

    getGroupingConfig() {
        return [
            { key: 'none',                 label: 'No grouping' },
            { key: 'type',                 label: 'Type' },
            { key: 'maturity',             label: 'Maturity' },
            { key: 'drg',                  label: 'Drafting Group' },
            { key: 'strategicDocuments',   label: 'Strategic' },
            { key: 'refinesParents',       label: 'Refines' },
            { key: 'implementedONs',       label: 'Implements' },
            { key: 'dependencies',         label: 'Dependencies' },
            { key: 'impactedStakeholders', label: 'Stakeholder Impact' },
            { key: 'impactedDomains',      label: 'Domain Impact' },
        ];
    }

    // -------------------------------------------------------------------------
    // Tree configuration
    // -------------------------------------------------------------------------

    buildPathTreePath(drg, pathArray) {
        if (!pathArray?.length) return [];
        return pathArray.map((segment, index) => ({
            type:  'org-folder',
            value: segment,
            id:    `${drg || 'no-drg'}:path:${pathArray.slice(0, index + 1).join('/')}`
        }));
    }

    buildRequirementTreePath(requirement, entityMap) {
        const path = [];

        if (requirement.drg) {
            path.push({ type: 'drg', value: getDraftingGroupDisplay(requirement.drg), id: `drg:${requirement.drg}` });
        }

        if (requirement.path?.length) {
            path.push(...this.buildPathTreePath(requirement.drg, requirement.path));
        } else if (requirement.refinesParents?.length) {
            const parentRef = requirement.refinesParents[0];
            const parentId  = parentRef.itemId || parentRef.id || parentRef;
            const parent    = entityMap?.get(parentId);
            if (parent) {
                const parentPath = this.buildRequirementTreePath(parent, entityMap);
                if (parentPath.length > 1) {
                    const parentLeaf = parentPath[parentPath.length - 1];
                    if (parentLeaf && !parentLeaf.entityId) parentLeaf.entityId = parent.itemId || parent.id;
                    path.push(...parentPath.slice(1));
                }
            }
        }

        path.push({
            type:     requirement.type === 'ON' ? 'on-node' : 'or-node',
            value:    requirement.title,
            id:       requirement.itemId || requirement.id,
            entityId: requirement.itemId || requirement.id,
            entity:   requirement
        });

        return path;
    }

    getTreeTypeRenderers() {
        return {
            'drg':        { icon: '📁', iconColor: '#dc3545', expandable: true, label: (p) => p.value },
            'org-folder': { icon: '📂', iconColor: '#ffc107', expandable: true, label: (p) => p.value },
            'on-node':    { icon: '🎯', iconColor: '#007bff', expandable: (n) => n.children && Object.keys(n.children).length > 0, label: (p) => p.value },
            'or-node':    { icon: '📋', iconColor: '#10b981', expandable: (n) => n.children && Object.keys(n.children).length > 0, label: (p) => p.value },
        };
    }

    getTreeColumns() {
        const c = RequirementsEntity._cols();
        return ['title', 'code', 'maturity', 'strategicDocuments',
            'implementedONs', 'dependencies', 'impactedStakeholders', 'impactedDomains'].map(k => c[k]);
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    async render(container, perspective = 'collection') {
        this.container          = container;
        this.currentPerspective = perspective;

        this.collection.setData(this.data);
        this.tree.setData(this.data);

        if (perspective === 'tree') {
            this.tree.render(container);
        } else {
            this.collection.render(container);
        }
    }

    renderViewControls() {
        const el = this._getViewControlsEl();
        if (!el) return;

        const groupingConfig = this.getGroupingConfig();

        el.innerHTML = `
            <div class="perspective-controls">
                <div class="perspective-toggle">
                    <button class="perspective-option ${this.currentPerspective === 'collection' ? 'perspective-option--active' : ''}"
                            data-perspective="collection">📋 Collection</button>
                    <button class="perspective-option ${this.currentPerspective === 'tree' ? 'perspective-option--active' : ''}"
                            data-perspective="tree">🌳 Tree</button>
                </div>
            </div>
            <div class="collection-actions-and-grouping">
                <div class="grouping-section">
                    <label for="groupBy">Group by:</label>
                    <select id="groupBy" class="form-control group-select">
                        ${groupingConfig.map(o => `<option value="${o.key}" ${o.key === this.sharedState.grouping ? 'selected' : ''}>${o.label}</option>`).join('')}
                    </select>
                </div>
                ${!this._isReadOnly ? `
                    <div class="actions-section">
                        <button class="btn btn-primary" id="createEntity">
                            <span class="btn-icon">+</span> New Requirement
                        </button>
                    </div>` : ''}
            </div>
        `;

        this._bindViewControlEvents(el);
    }

    _bindViewControlEvents(el) {
        el.querySelectorAll('.perspective-option').forEach(btn => {
            btn.addEventListener('click', () => this._handlePerspectiveSwitch(btn.dataset.perspective));
        });

        el.querySelector('#groupBy')?.addEventListener('change', (e) => this.handleGrouping(e.target.value));
        el.querySelector('#createEntity')?.addEventListener('click', () => this._handleCreate());
    }

    // -------------------------------------------------------------------------
    // Lifecycle notifications (called by os.js)
    // -------------------------------------------------------------------------

    onActivated() {
        this.isActive = true;
        this.renderViewControls();
        if (this.data.length > 0) this.renderFromCache();
    }

    onDeactivated() {
        this.isActive = false;
        const el = this._getViewControlsEl();
        if (el) el.innerHTML = '';
    }

    onDataUpdated(data) {
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

    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------

    _handleItemSelect(item) {
        this.sharedState.selectedItem = item;
        this._onItemSelect(item);
    }

    _handleCreate() {
        this.form.showCreateModal();
    }

    _handlePerspectiveSwitch(perspective) {
        if (perspective === this.currentPerspective) return;
        this.currentPerspective = perspective;

        const el = this._getViewControlsEl();
        if (el) {
            el.querySelectorAll('.perspective-option').forEach(btn => {
                btn.classList.toggle('perspective-option--active', btn.dataset.perspective === perspective);
            });
        }

        this.render(this.container, perspective).then(() => this._restoreSelectionAfterRender());
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
            this.container?.querySelectorAll('.collection-row').forEach(row => {
                row.classList.toggle('collection-row--selected', row.dataset.itemId === String(selectedId));
            });
        }
    }

    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);
        this.sharedState.grouping = groupBy;
    }

    handleFilterChange(activeFilters) {
        this.sharedState.filters = activeFilters;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    getItemId(item) {
        return item?.itemId || item?.id || null;
    }

    escapeHtml(str) {
        if (str == null) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    cleanup() {
        this.collection.cleanup();
        if (this.tree) this.tree.container = null;
        this.container = null;
    }
}