/**
 * @file o-star-entity.js
 * @description Unified O* list component — ONs, ORs, and OCs in a single result set.
 * Supports Collection (flat + grouping) and Tree perspectives.
 * Owned and orchestrated by os.js — no back-references to app.currentActivity.
 *
 * Injected callbacks (required):
 *   onItemSelect(item)      — called when user selects a row
 *   getViewControlsEl()     — returns the HTMLElement where view controls are mounted
 *   isReadOnly              — boolean; true in Explore context
 *
 * Column set:
 *   Both perspectives: Type · Code · Title · Maturity · Implements · Strategic Documents · Impacted Stakeholders
 *   Collection only:   Domain · Refines
 *   Tree:              Domain implicit from tree structure
 *
 * Grouping (collection only): Type · Domain · Maturity
 *
 * Tree structure:
 *   Domain → ONs → refined ORs
 *   OCs appended below in domain groups (flat)
 */
import CollectionEntity from '../../../../components/collection-entity.js';
import TreeTableEntity from '../../../../components/tree-table-entity.js';
import { odpColumnTypes } from '../../../../components/odp-column-types.js';
import {
    getMaturityLevelDisplay,
    MaturityLevel,
} from '/shared/src/index.js';

export default class OStarEntity {
    /**
     * @param {import('../../../../app.js').App} app
     * @param {object} setupData
     * @param {object} options
     * @param {Function} options.onItemSelect      - (item) => void
     * @param {Function} options.getViewControlsEl - () => HTMLElement|null
     * @param {boolean}  options.isReadOnly        - true in Explore/review context
     * @param {Function} options.onViewControlsRendered - () => void
     */
    constructor(app, setupData, options = {}) {
        this.app       = app;
        this.setupData = setupData;
        this._domains  = options.domains ?? [];

        this._onItemSelect            = options.onItemSelect            ?? (() => {});
        this._getViewControlsEl       = options.getViewControlsEl       ?? (() => null);
        this._isReadOnly              = options.isReadOnly              ?? false;
        this._onViewControlsRendered  = options.onViewControlsRendered  ?? (() => {});

        this.container          = null;
        this.currentPerspective = 'collection';
        this.data               = [];
        this.isActive           = false;

        this.sharedState = {
            selectedItem: null,
            grouping:     'none',
        };

        this.collection = new CollectionEntity(app, { endpoint: null }, {
            columnTypes:      odpColumnTypes,
            context:          { setupData },
            getColumnConfig:  () => this._getCollectionColumns(),
            getGroupingConfig: () => this._getGroupingConfig(),
            onItemSelect:     (item) => this._handleItemSelect(item),
            getEmptyStateMessage: () => ({
                icon:        '🔍',
                title:       'No O*s found',
                description: 'Adjust filters or create new entities.',
            }),
        });

        this.tree = new TreeTableEntity(app, { endpoint: null }, {
            pathBuilder:   (entity, entityMap) => this._buildTreePath(entity, entityMap),
            typeRenderers: this._getTreeTypeRenderers(),
            columns:       this._getTreeColumns(),
            columnTypes:   odpColumnTypes,
            context:       { setupData },
            onItemSelect:  (item) => this._handleItemSelect(item),
        });
    }

    // -------------------------------------------------------------------------
    // Column definitions
    // -------------------------------------------------------------------------

    static _cols() {
        return {
            type: {
                key: 'type', label: 'Type', width: '60px',
                type: 'o-star-type', sortable: true,
                appliesTo: ['on-node', 'or-node', 'oc-node'],
            },
            code: {
                key: 'code', label: 'Code', width: '140px',
                type: 'text', sortable: true,
                appliesTo: ['on-node', 'or-node', 'oc-node'],
            },
            title: {
                key: 'title', label: 'Title', width: 'auto',
                type: 'text', sortable: true,
                appliesTo: ['drg', 'org-folder', 'on-node', 'or-node', 'oc-node'],
            },
            maturity: {
                key: 'maturity', label: 'Maturity', width: '90px',
                type: 'text', sortable: true,
                appliesTo: ['on-node', 'or-node', 'oc-node'],
            },
            domain: {
                key: 'domain', label: 'Domain', width: '120px',
                type: 'text', sortable: true,
                render: (value) => value ? (this._domains.find(d => d.key === value)?.title ?? value) : '—',
                appliesTo: ['on-node', 'or-node', 'oc-node'],
            },
            refinesParents: {
                key: 'refinesParents', label: 'Refines', width: '160px',
                type: 'entity-reference-list', sortable: false, maxDisplay: 1,
                appliesTo: ['on-node', 'or-node'],
            },
            implements: {
                key: 'implements', label: 'Implements', width: '160px',
                type: 'o-star-implements', sortable: false, maxDisplay: 2,
                appliesTo: ['or-node', 'oc-node'],
            },
            strategicDocuments: {
                key: 'strategicDocuments', label: 'Strategic Docs', width: '140px',
                type: 'annotated-reference-list', sortable: false, maxDisplay: 2,
                setupEntity: 'referenceDocuments',
                appliesTo: ['on-node'],
            },
            impactedStakeholders: {
                key: 'impactedStakeholders', label: 'Stakeholders', width: '120px',
                type: 'annotated-reference-list', sortable: false, maxDisplay: 2,
                setupEntity: 'stakeholderCategories',
                appliesTo: ['or-node', 'oc-node'],
            },

        };
    }

    _getCollectionColumns() {
        const c = OStarEntity._cols();
        return [
            c.type, c.code, c.title, c.maturity, c.domain,
            c.refinesParents, c.implements,
            c.strategicDocuments, c.impactedStakeholders,
        ];
    }

    _getTreeColumns() {
        const c = OStarEntity._cols();
        return [
            c.title, c.code, c.maturity,
            c.implements,
            c.strategicDocuments, c.impactedStakeholders,
        ];
    }

    _getGroupingConfig() {
        return [
            { key: 'none',     label: 'No grouping'   },
            { key: 'type',     label: 'Type'          },
            { key: 'domain',   label: 'Domain'        },
            { key: 'maturity', label: 'Maturity'      },
        ];
    }

    // -------------------------------------------------------------------------
    // Tree path builder
    // -------------------------------------------------------------------------

    _buildTreePath(entity, entityMap) {
        const id       = entity.itemId ?? entity.id;
        const nodeType = entity.type === 'OC' ? 'oc-node'
            : entity.type === 'OR' ? 'or-node'
                : 'on-node';
        const leaf = {
            type:     nodeType,
            value:    entity.title ?? entity.code ?? String(id ?? '?'),
            id:       id,
            entityId: id,
            entity:   entity,
        };

        // OCs — flat under their domain group
        if (entity.type === 'OC') {
            const domainKey   = entity.domain ?? 'no-domain';
            const domainLabel = entity.domain ? (this._domains.find(d => d.key === entity.domain)?.title ?? entity.domain) : '—';
            return [
                { type: 'drg', value: domainLabel, id: `domain:${domainKey}` },
                leaf,
            ];
        }

        // ONs and ORs — domain → (parent ON leaf) → entity leaf
        const path = [];

        if (entity.domain) {
            path.push({ type: 'drg', value: this._domains.find(d => d.key === entity.domain)?.title ?? entity.domain, id: `domain:${entity.domain}` });
        }

        if (entity.refinesParents?.length) {
            const parentRef = entity.refinesParents[0];
            const parentId  = parentRef?.itemId ?? parentRef?.id ?? parentRef;
            const parent    = entityMap?.get(parentId);
            if (parent) {
                const parentPath = this._buildTreePath(parent, entityMap);
                if (parentPath.length > 1) {
                    const parentLeaf = parentPath[parentPath.length - 1];
                    if (parentLeaf && !parentLeaf.entityId) parentLeaf.entityId = parent.itemId ?? parent.id;
                    path.push(...parentPath.slice(1));
                }
            }
        }

        path.push(leaf);
        return path;
    }

    _getTreeTypeRenderers() {
        return {
            drg: {
                icon: '📁', iconColor: '#1F3864', expandable: true,
                label: (p) => p.value,
            },
            'org-folder': {
                icon: '📂', iconColor: '#6b7280', expandable: true,
                label: (p) => p.value,
            },
            'on-node': {
                icon: '<span class="item-badge ostar-type-on">ON</span>', iconColor: '',
                expandable: (n) => n.children && Object.keys(n.children).length > 0,
                label: (p) => p.value,
            },
            'or-node': {
                icon: '<span class="item-badge ostar-type-or">OR</span>', iconColor: '',
                expandable: (n) => n.children && Object.keys(n.children).length > 0,
                label: (p) => p.value,
            },
            'oc-node': {
                icon: '<span class="item-badge ostar-type-oc">OC</span>', iconColor: '',
                expandable: (n) => n.children && Object.keys(n.children).length > 0,
                label: (p) => p.value,
            },
        };
    }

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    onDataUpdated(data) {
        // Pre-compute virtual 'implements' field — merges implementedONs (OR) and implementedORs (OC)
        data.forEach(item => {
            item.implements = item.implementedONs?.length ? item.implementedONs
                : item.implementedORs?.length ? item.implementedORs
                    : [];
        });
        this.data = [...data];
        if (this.isActive) this.renderFromCache();
    }

    _autoExpandFirstLevel() {
        if (!this.tree.treeData) return;
        Object.values(this.tree.treeData.children).forEach(node => {
            node.expanded = true;
            this.tree.expandedNodes.add(node.id);
        });
    }

    // -------------------------------------------------------------------------
    // Rendering
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

    renderFromCache() {
        if (!this.container) return;
        this.collection.setData(this.data);
        this.tree.setData(this.data);
        // Auto-expand first level (DrG folders) after tree is built
        this._autoExpandFirstLevel();
        if (this.currentPerspective === 'tree') {
            this.tree.render(this.container);
        } else {
            this.collection.render(this.container);
        }
        this._restoreSelection();
    }

    renderViewControls() {
        const el = this._getViewControlsEl();
        if (!el) return;

        const isCollection = this.currentPerspective === 'collection';

        el.innerHTML = `
            <div class="ostar-controls">
                <div class="ostar-controls__perspective">
                    <button class="ostar-perspective-btn${isCollection ? ' ostar-perspective-btn--active' : ''}"
                            data-perspective="collection">Collection</button>
                    <button class="ostar-perspective-btn${!isCollection ? ' ostar-perspective-btn--active' : ''}"
                            data-perspective="tree">Tree</button>
                </div>
                ${isCollection ? `
                <div class="ostar-controls__grouping">
                    <label class="ostar-controls__label" for="ostarGroupBy">Group by</label>
                    <select id="ostarGroupBy" class="ostar-controls__select">
                        ${this._getGroupingConfig().map(o =>
            `<option value="${o.key}" ${o.key === this.sharedState.grouping ? 'selected' : ''}>${o.label}</option>`
        ).join('')}
                    </select>
                </div>` : ''}
                <span class="os-summary__text" id="osSummaryText"></span>
            </div>
        `;

        el.querySelectorAll('.ostar-perspective-btn').forEach(btn => {
            btn.addEventListener('click', () => this._switchPerspective(btn.dataset.perspective));
        });

        el.querySelector('#ostarGroupBy')?.addEventListener('change', (e) => {
            this.sharedState.grouping = e.target.value;
            this.collection.handleGrouping(e.target.value);
        });

        this._onViewControlsRendered();
    }

    /**
     * Programmatically switch perspective — called by OsActivity when restoring
     * state from ?perspective search param. Equivalent to a user click on the
     * perspective toggle button.
     * @param {'collection'|'tree'} perspective
     */
    setPerspective(perspective) {
        if (perspective !== 'collection' && perspective !== 'tree') return;
        this._switchPerspective(perspective);
    }

    _switchPerspective(perspective) {
        if (perspective === this.currentPerspective) return;
        this.currentPerspective = perspective;
        this.renderViewControls();
        this.renderFromCache();

        const selected   = this.sharedState.selectedItem;
        const selectedId = this._getItemId(selected);

        if (perspective === 'tree' && selected) {
            this._expandToItem(selectedId);
            this.tree.render(this.container);
            this._restoreSelection();
            this.tree.scrollToItem(selectedId);
        } else if (perspective === 'collection' && selected) {
            this._restoreSelection();
            this._scrollCollectionToItem(selectedId);
        }
    }

    // -------------------------------------------------------------------------
    // Event handlers
    // -------------------------------------------------------------------------

    _handleItemSelect(item) {
        this.sharedState.selectedItem = item;
        this._onItemSelect(item);
    }

    async _handleCreate(type) {
        if (type === 'OC') {
            const { default: ChangeForm } = await import('./change-form.js');
            const form = new ChangeForm(
                { endpoint: '/operational-changes' },
                { setupData: this.setupData, domains: this._domains, getSetupData: () => this.setupData, getRequirements: () => this.data }
            );
            form.showCreateModal();
        } else {
            const { default: RequirementForm } = await import('./requirement-form.js');
            const form = new RequirementForm(
                { endpoint: '/operational-requirements' },
                { setupData: this.setupData, domains: this._domains, getSetupData: () => this.setupData, getRequirements: () => this.data }
            );
            form.showCreateModal({ defaultType: type });
        }
    }

    /**
     * Expand all ancestor nodes in the tree that contain the item with the given itemId.
     * @param {string|number} itemId
     */
    _expandToItem(itemId) {
        if (!this.tree.treeData || itemId == null) return;

        const expand = (node) => {
            // Check if any descendant leaf matches
            const hasTarget = (n) => {
                if (n.entity && this._getItemId(n.entity) === itemId) return true;
                return Object.values(n.children).some(hasTarget);
            };
            if (!hasTarget(node)) return false;
            node.expanded = true;
            this.tree.expandedNodes.add(node.id);
            Object.values(node.children).forEach(expand);
            return true;
        };

        Object.values(this.tree.treeData.children).forEach(expand);
    }

    /**
     * Scroll the collection list so the selected row is visible.
     * @param {string|number} itemId
     */
    _scrollCollectionToItem(itemId) {
        if (!this.container || itemId == null) return;
        const row = this.container.querySelector(`.collection-row[data-item-id="${itemId}"]`);
        if (!row) return;
        row.scrollIntoView({ block: 'nearest' });
    }

    _restoreSelection() {
        const selected   = this.sharedState.selectedItem;
        if (!selected) return;
        const selectedId = this._getItemId(selected);
        if (selectedId == null) return;

        if (this.currentPerspective === 'tree') {
            this.tree.selectedItem = selected;
            this.container?.querySelectorAll('.tree-row').forEach(row => {
                row.classList.toggle('selected', row.dataset.itemId === String(selectedId));
            });
        } else {
            this.collection.selectedItem = selected;
            this.container?.querySelectorAll('.collection-row').forEach(row => {
                row.classList.toggle('collection-row--selected', row.dataset.itemId === String(selectedId));
            });
        }
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _getItemId(item) {
        return item?.itemId ?? item?.id ?? null;
    }

    cleanup() {
        this.collection.cleanup();
        if (this.tree) this.tree.container = null;
        this.container = null;
    }
}