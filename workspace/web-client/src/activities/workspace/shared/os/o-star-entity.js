/**
 * @file o-star-entity.js
 * @description Unified O* list component — ONs, ORs, and OCs in a single result set.
 * Supports the Collection perspective (flat + grouping).
 * Owned and orchestrated by os.js — no back-references to app.currentActivity.
 *
 * Injected callbacks (required):
 *   onItemSelect(item)      — called when user selects a row
 *   getViewControlsEl()     — returns the HTMLElement where view controls are mounted
 *   isReadOnly              — boolean; true in Explore context
 *
 * Column set:
 *   Type · Code · Title · Maturity · Domain · Refines · Implements · Strategic Documents · Impacted Stakeholders
 *
 * Grouping: Type · Domain · Maturity
 */
import CollectionEntity from '../../../../components/collection-entity.js';
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

        this.container = null;
        this.data      = [];
        this.isActive  = false;

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

    _getGroupingConfig() {
        return [
            { key: 'none',     label: 'No grouping'   },
            { key: 'type',     label: 'Type'          },
            { key: 'domain',   label: 'Domain'        },
            { key: 'maturity', label: 'Maturity'      },
        ];
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
        this.collection.render(this.container);
        this._restoreSelection();
    }

    renderViewControls() {
        const el = this._getViewControlsEl();
        if (!el) return;

        el.innerHTML = `
            <div class="ostar-controls">
                <div class="ostar-controls__grouping">
                    <label class="ostar-controls__label" for="ostarGroupBy">Group by</label>
                    <select id="ostarGroupBy" class="ostar-controls__select">
                        ${this._getGroupingConfig().map(o =>
            `<option value="${o.key}" ${o.key === this.sharedState.grouping ? 'selected' : ''}>${o.label}</option>`
        ).join('')}
                    </select>
                </div>
                <span class="os-summary__text" id="osSummaryText"></span>
            </div>
        `;

        el.querySelector('#ostarGroupBy')?.addEventListener('change', (e) => {
            this.sharedState.grouping = e.target.value;
            this.collection.handleGrouping(e.target.value);
        });

        this._onViewControlsRendered();
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
                { setupData: this.setupData, domains: this._domains, app: this.app, getSetupData: () => this.setupData, getRequirements: () => this.data }
            );
            form.showCreateModal();
        } else {
            const { default: RequirementForm } = await import('./requirement-form.js');
            const form = new RequirementForm(
                { endpoint: '/operational-requirements' },
                { setupData: this.setupData, domains: this._domains, app: this.app, getSetupData: () => this.setupData, getRequirements: () => this.data }
            );
            form.showCreateModal({ defaultType: type });
        }
    }

    _restoreSelection() {
        const selected = this.sharedState.selectedItem;
        if (!selected) return;
        const selectedId = this._getItemId(selected);
        if (selectedId == null) return;
        this.collection.selectedItem = selected;
        let selectedRow = null;
        this.container?.querySelectorAll('.collection-row').forEach(row => {
            const isSelected = row.dataset.itemId === String(selectedId);
            row.classList.toggle('collection-row--selected', isSelected);
            if (isSelected) selectedRow = row;
        });
        selectedRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _getItemId(item) {
        return item?.itemId ?? item?.id ?? null;
    }

    cleanup() {
        this.collection.cleanup();
        this.container = null;
    }
}