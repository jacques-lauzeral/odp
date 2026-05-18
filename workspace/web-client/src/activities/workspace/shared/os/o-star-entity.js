/**
 * @file o-star-entity.js
 * @description Unified O* list component — ONs, ORs, and OCs in a single result set.
 * Supports Collection (flat + grouping) and Tree perspectives.
 * Owned and orchestrated by os.js — no back-references to app.currentActivity.
 *
 * Injected callbacks (required):
 *   onItemSelect(item)      — called when user selects a row
 *   getViewControlsEl()     — returns the HTMLElement where view controls are mounted
 *   isReadOnly              — boolean; true in Explore context (hides create buttons)
 *
 * Column set:
 *   Both perspectives: Type · Code · Title · Maturity · Implements · Strategic Documents · Impacted Stakeholders · Impacted Domain
 *   Collection only:   Owner Domain · Refines
 *   Tree:              Owner Domain implicit from tree structure
 *
 * Grouping (collection only): Type · Owner Domain (drg) · Maturity
 *
 * Tree structure:
 *   DrG → path folders → ONs → refined ORs
 *   OCs appended below in DrG groups (flat)
 */
import CollectionEntity from '../../../../components/collection-entity.js';
import TreeTableEntity from '../../../../components/tree-table-entity.js';
import { odpColumnTypes } from '../../../../components/odp-column-types.js';
import {
    getDraftingGroupDisplay,
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
     */
    constructor(app, setupData, options = {}) {
        this.app       = app;
        this.setupData = setupData;

        this._onItemSelect      = options.onItemSelect      ?? (() => {});
        this._getViewControlsEl = options.getViewControlsEl ?? (() => null);
        this._isReadOnly        = options.isReadOnly        ?? false;

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
            drg: {
                key: 'drg', label: 'Owner Domain', width: '120px',
                type: 'drafting-group', sortable: true,
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
            impactedDomains: {
                key: 'impactedDomains', label: 'Impacted Domain', width: '120px',
                type: 'annotated-reference-list', sortable: false, maxDisplay: 2,
                setupEntity: 'domains',
                appliesTo: ['or-node', 'oc-node'],
            },
        };
    }

    _getCollectionColumns() {
        const c = OStarEntity._cols();
        return [
            c.type, c.code, c.title, c.maturity, c.drg,
            c.refinesParents, c.implements,
            c.strategicDocuments, c.impactedStakeholders, c.impactedDomains,
        ];
    }

    _getTreeColumns() {
        const c = OStarEntity._cols();
        return [
            c.code, c.title, c.maturity,
            c.implements,
            c.strategicDocuments, c.impactedStakeholders, c.impactedDomains,
        ];
    }

    _getGroupingConfig() {
        return [
            { key: 'none',     label: 'No grouping'   },
            { key: 'type',     label: 'Type'          },
            { key: 'drg',      label: 'Owner Domain'  },
            { key: 'maturity', label: 'Maturity'      },
        ];
    }

    // -------------------------------------------------------------------------
    // Tree path builder
    // -------------------------------------------------------------------------

    _buildTreePath(entity, entityMap) {
        // OCs — flat under their DrG group
        if (entity.type === 'OC' || (!entity.type && entity.code?.startsWith('OC-'))) {
            return [
                { type: 'drg', value: getDraftingGroupDisplay(entity.drg) ?? entity.drg ?? '—', id: `drg:${entity.drg}` },
            ];
        }

        // ONs and ORs — DrG → path folders → ON → refined ORs
        const path = [];

        if (entity.drg) {
            path.push({ type: 'drg', value: getDraftingGroupDisplay(entity.drg) ?? entity.drg, id: `drg:${entity.drg}` });
        }

        if (entity.refinesParents?.length) {
            // Nested under parent — path derived from REFINES relationship
            const parentId = entity.refinesParents[0]?.id ?? entity.refinesParents[0];
            const parent   = entityMap?.get(String(parentId));
            if (parent) {
                const parentPath = this._buildTreePath(parent, entityMap);
                return [...parentPath, { type: 'on-node', value: parent.code ?? String(parentId), id: `item:${parentId}` }];
            }
        }

        if (entity.path?.length) {
            entity.path.forEach((segment, idx) => {
                path.push({
                    type:  'org-folder',
                    value: segment,
                    id:    `${entity.drg ?? 'no-drg'}:path:${entity.path.slice(0, idx + 1).join('/')}`,
                });
            });
        }

        return path;
    }

    _getTreeTypeRenderers() {
        return {
            drg:        (node) => `<span class="tree-group-label">${node.value}</span>`,
            'org-folder': (node) => `<span class="tree-folder-label">📁 ${node.value}</span>`,
            'on-node':  (node) => `<span class="tree-item-label tree-item-label--on">${node.value}</span>`,
            'or-node':  (node) => `<span class="tree-item-label tree-item-label--or">${node.value}</span>`,
            'oc-node':  (node) => `<span class="tree-item-label tree-item-label--oc">${node.value}</span>`,
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
                ${!this._isReadOnly ? `
                <div class="ostar-controls__actions">
                    <button class="btn btn-primary btn-sm" id="createON">+ ON</button>
                    <button class="btn btn-primary btn-sm" id="createOR">+ OR</button>
                    <button class="btn btn-primary btn-sm" id="createOC">+ OC</button>
                </div>` : ''}
            </div>
        `;

        el.querySelectorAll('.perspective-option').forEach(btn => {
            btn.addEventListener('click', () => this._switchPerspective(btn.dataset.perspective));
        });

        el.querySelector('#ostarGroupBy')?.addEventListener('change', (e) => {
            this.sharedState.grouping = e.target.value;
            this.collection.handleGrouping(e.target.value);
        });

        // Create buttons — forms loaded lazily when clicked
        el.querySelector('#createON')?.addEventListener('click', () => this._handleCreate('ON'));
        el.querySelector('#createOR')?.addEventListener('click', () => this._handleCreate('OR'));
        el.querySelector('#createOC')?.addEventListener('click', () => this._handleCreate('OC'));
    }

    _switchPerspective(perspective) {
        if (perspective === this.currentPerspective) return;
        this.currentPerspective = perspective;
        this.renderViewControls();
        this.renderFromCache();
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
                { setupData: this.setupData, getSetupData: () => this.setupData, getRequirements: () => this.data }
            );
            form.showCreateModal();
        } else {
            const { default: RequirementForm } = await import('./requirement-form.js');
            const form = new RequirementForm(
                { endpoint: '/operational-requirements' },
                { setupData: this.setupData, getSetupData: () => this.setupData, getRequirements: () => this.data }
            );
            form.showCreateModal({ defaultType: type });
        }
    }

    _restoreSelection() {
        const selected   = this.sharedState.selectedItem;
        if (!selected) return;
        const selectedId = this._getItemId(selected);
        if (selectedId == null) return;

        if (this.currentPerspective === 'tree') {
            this.tree.selectedItem = selected;
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