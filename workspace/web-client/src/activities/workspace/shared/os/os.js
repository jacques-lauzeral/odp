/**
 * @file os.js
 * @description O* workspace orchestrator. Routes between list view and detail pages,
 * owns tab switching, filter bar, data loading, and entity component lifecycle.
 * Replaces AbstractInteractionActivity — no inheritance, no back-references.
 *
 * SubPath routing:
 *   []                        → list view (Requirements + Changes tabs)
 *   ['requirement', '{id}']   → RequirementDetails full page
 *   ['change', '{id}']        → ChangeDetails full page
 *
 * Context/mode from app.getDatasetContext():
 *   { type: 'live' }               → isReadOnly: false
 *   { type: 'edition', editionId } → isReadOnly: true
 *
 * Layout (list view):
 *   ┌──────────────────────────────────────────────────────┐
 *   │ Filter bar (full width)                              │
 *   │ Tab bar: Requirements | Changes                      │
 *   │ View controls (perspective, grouping, create)        │
 *   │ MasterDetail: list column | navigate hint            │
 *   └──────────────────────────────────────────────────────┘
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import MasterDetail from '../../../../components/master-detail.js';
import FilterBar from '../../../../components/odp/filter-bar.js';
import {
    getOperationalRequirementTypeDisplay,
    getDraftingGroupDisplay,
    MaturityLevel,
    getMaturityLevelDisplay,
} from '/shared/src/index.js';

const ENTITY_KEYS = ['requirements', 'changes'];

const ENTITY_CONFIG = {
    requirements: { name: 'Operational Requirements', endpoint: '/operational-requirements' },
    changes:      { name: 'Operational Changes',      endpoint: '/operational-changes'      },
};

export default class OsActivity {
    /**
     * @param {import('../../../../app.js').App} app
     */
    constructor(app) {
        this.app = app;
        this.container = null;

        // List view state
        this.currentTab      = 'requirements';
        this.setupData       = null;
        this.filterBar       = null;
        this.masterDetail    = null;
        this._viewControlsEl = null;

        this.sharedState = {
            filtersObject: {},
            filters:       [],
        };

        this.entityCounts = {
            requirements: { ON: 0, OR: 0, total: 0 },
            changes:      { total: 0 },
        };

        this._entityComponents   = {};
        this._requirementDetails = null;
        this._changeDetails      = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;

        try {
            const { entityType, id } = this._parseSubPath(subPath);

            if (entityType === 'requirement' && id !== null) {
                await this._renderRequirementDetail(id);
            } else if (entityType === 'change' && id !== null) {
                await this._renderChangeDetail(id);
            } else {
                await this._renderList(subPath);
            }
        } catch (error) {
            errorHandler.handle(error, 'os');
        }
    }

    async handleSubPath(subPath) {
        return this.render(this.container, subPath);
    }

    cleanup() {
        this.filterBar?.destroy?.();
        this.masterDetail?.cleanup();
        Object.values(this._entityComponents).forEach(c => c.cleanup?.());
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();

        this.filterBar           = null;
        this.masterDetail        = null;
        this._entityComponents   = {};
        this._requirementDetails = null;
        this._changeDetails      = null;
        this.setupData           = null;
        this.container           = null;
    }

    // -------------------------------------------------------------------------
    // List view
    // -------------------------------------------------------------------------

    async _renderList(subPath) {
        this.container.innerHTML = this._buildLoadingHtml();

        try {
            this.setupData = await this.app.getSetupData();
        } catch (error) {
            errorHandler.handle(error, 'os-setup-data');
            this.setupData = { stakeholderCategories: [], domains: [], referenceDocuments: [], waves: [] };
        }

        if (subPath.length > 0 && ENTITY_KEYS.includes(subPath[0])) {
            this.currentTab = subPath[0];
        }

        this._buildListShell();
        this._mountFilterBar();
        await this._prepareEntityComponents();
        await this._loadData(this.sharedState.filtersObject);
        await this._activateTab(this.currentTab);
    }

    _buildListShell() {
        this.container.innerHTML = `
            <div class="os-activity">
                <div class="os-filters" id="osFilters"></div>
                <div class="os-tabs" id="osTabs">
                    ${ENTITY_KEYS.map(key => `
                        <button
                            class="interaction-tab ${key === this.currentTab ? 'interaction-tab--active' : ''}"
                            data-tab="${key}"
                            id="osTab-${key}">
                            ${this._tabLabel(key)}
                        </button>
                    `).join('')}
                </div>
                <div class="os-view-controls" id="osViewControls"></div>
                <div class="os-content" id="osContent"></div>
            </div>
        `;

        this._viewControlsEl = this.container.querySelector('#osViewControls');

        this.container.querySelectorAll('.interaction-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.tab !== this.currentTab) {
                    this._switchTab(btn.dataset.tab);
                }
            });
        });

        const contentEl = this.container.querySelector('#osContent');
        this.masterDetail = new MasterDetail(contentEl, {
            initialRatio: 0.67,
            placeholderHtml: `
                <div class="master-detail__placeholder">
                    <div class="master-detail__placeholder-icon">🔍</div>
                    <p class="master-detail__placeholder-text">Select an item to open its detail page</p>
                </div>
            `,
        });
        this.masterDetail.render();
    }

    _mountFilterBar() {
        const filtersEl = this.container.querySelector('#osFilters');
        if (!filtersEl) return;

        this.filterBar = new FilterBar(filtersEl, {
            filters: this._getFilterConfig(),
            fetchSuggestionsCallback: (key, query) => this._fetchFilterSuggestions(key, query),
        });

        filtersEl.addEventListener('filtersChanged', (e) => {
            const filtersArray  = e.detail?.filters ?? [];
            const filtersObject = Object.fromEntries(filtersArray.map(f => [f.key, f.value]));
            this.sharedState.filters       = filtersArray;
            this.sharedState.filtersObject = filtersObject;
            this._loadData(filtersObject);
        });
    }

    // -------------------------------------------------------------------------
    // Tab management
    // -------------------------------------------------------------------------

    async _activateTab(tabKey) {
        this.currentTab = tabKey;

        this.container.querySelectorAll('.interaction-tab').forEach(btn => {
            btn.classList.toggle('interaction-tab--active', btn.dataset.tab === tabKey);
        });

        ENTITY_KEYS.forEach(key => {
            if (key !== tabKey) this._entityComponents[key]?.onDeactivated?.();
        });

        const entity = this._entityComponents[tabKey];
        if (entity) {
            entity.container = this.masterDetail.listContainer;
            entity.onActivated?.();
        }
    }

    async _switchTab(tabKey) {
        this._entityComponents[this.currentTab]?.onDeactivated?.();
        await this._activateTab(tabKey);
        window.history.replaceState({}, '', `${this._basePath()}/${tabKey}`);
    }

    _updateTabLabels() {
        ENTITY_KEYS.forEach(key => {
            const el = this.container?.querySelector(`#osTab-${key}`);
            if (el) el.innerHTML = this._tabLabel(key);
        });
    }

    _tabLabel(key) {
        if (key === 'requirements') {
            const { ON, OR } = this.entityCounts.requirements;
            return `<span>Operational Needs: ${ON} | Requirements: ${OR}</span>`;
        }
        return `<span>Operational Changes: ${this.entityCounts.changes.total}</span>`;
    }

    // -------------------------------------------------------------------------
    // Entity component preparation
    // -------------------------------------------------------------------------

    async _prepareEntityComponents() {
        const isReadOnly = this._isReadOnly();

        for (const key of ENTITY_KEYS) {
            if (this._entityComponents[key]) continue;

            const modulePath = key === 'requirements' ? './requirements.js' : './changes.js';
            const { default: EntityClass } = await import(modulePath);

            this._entityComponents[key] = new EntityClass(
                this.app,
                ENTITY_CONFIG[key],
                this.setupData,
                {
                    onItemSelect:      (item) => this._handleItemSelect(item, key),
                    getViewControlsEl: ()     => this._viewControlsEl,
                    isReadOnly,
                }
            );
        }
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    async _loadData(filtersObject = {}) {
        await Promise.all(
            ENTITY_KEYS.map(key => this._loadEntityData(key, filtersObject).catch(err => {
                errorHandler.handle(err, `os-load-${key}`);
            }))
        );
    }

    async _loadEntityData(key, filtersObject) {
        const params = this._buildQueryParams(filtersObject);
        const data   = await apiClient.listEntities(ENTITY_CONFIG[key].endpoint, params);
        const list   = Array.isArray(data) ? data : [];

        if (key === 'requirements') {
            this.entityCounts.requirements = {
                ON:    list.filter(i => i.type === 'ON').length,
                OR:    list.filter(i => i.type === 'OR').length,
                total: list.length,
            };
        } else {
            this.entityCounts.changes = { total: list.length };
        }

        this._entityComponents[key]?.onDataUpdated?.(list);
        this._updateTabLabels();
    }

    // -------------------------------------------------------------------------
    // Item selection → navigate to detail page
    // -------------------------------------------------------------------------

    _handleItemSelect(item, tabKey) {
        const entityType = tabKey === 'requirements' ? 'requirement' : 'change';
        const id         = item.itemId ?? item.id;
        this.app.navigate(`${this._basePath()}/${entityType}/${id}`);
    }

    // -------------------------------------------------------------------------
    // Detail pages
    // -------------------------------------------------------------------------

    async _renderRequirementDetail(id) {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('./requirement-details.js');
            this._requirementDetails = new RequirementDetails(this.app, this._buildConfig());
        }
        await this._requirementDetails.render(this.container, id);
    }

    async _renderChangeDetail(id) {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('./change-details.js');
            this._changeDetails = new ChangeDetails(this.app, this._buildConfig());
        }
        await this._changeDetails.render(this.container, id);
    }

    // -------------------------------------------------------------------------
    // Filter configuration
    // -------------------------------------------------------------------------

    _getFilterConfig() {
        return [
            {
                key: 'type', label: 'Type', inputType: 'select',
                options: ['ON', 'OR'].map(v => ({ value: v, label: getOperationalRequirementTypeDisplay(v) })),
            },
            {
                key: 'maturity', label: 'Maturity', inputType: 'select',
                options: Object.keys(MaturityLevel).map(k => ({ value: k, label: getMaturityLevelDisplay(k) })),
            },
            {
                key: 'drg', label: 'DrG', inputType: 'select',
                options: (this.setupData?.domains ?? []).map(d => ({ value: d.id, label: getDraftingGroupDisplay(d.id) ?? d.id })),
            },
            { key: 'title',    label: 'Title',    inputType: 'text'    },
            { key: 'text',     label: 'Text',     inputType: 'text'    },
            {
                key: 'stakeholderCategory', label: 'Stakeholder', inputType: 'select',
                options: (this.setupData?.stakeholderCategories ?? []).map(s => ({ value: s.id, label: s.name })),
            },
            {
                key: 'domain', label: 'Domain', inputType: 'suggest',
                options: (this.setupData?.domains ?? []).map(d => ({ value: d.id, label: d.name })),
            },
            {
                key: 'strategicDocument', label: 'Strategic Doc', inputType: 'suggest',
                options: (this.setupData?.referenceDocuments ?? []).map(r => ({ value: r.id, label: r.name })),
            },
            { key: 'refines',     label: 'Refines',      inputType: 'suggest' },
            { key: 'implements',  label: 'Implements',   inputType: 'suggest' },
            { key: 'dependency',  label: 'Depends On',   inputType: 'suggest' },
            { key: 'implementsOR', label: 'Implements OR', inputType: 'suggest' },
        ];
    }

    async _fetchFilterSuggestions(key, query) {
        if (!query || query.length < 2) return [];
        const endpointMap = {
            refines:      '/operational-requirements',
            implements:   '/operational-requirements',
            dependency:   '/operational-requirements',
            implementsOR: '/operational-requirements',
        };
        const endpoint = endpointMap[key];
        if (!endpoint) return [];
        try {
            const results = await apiClient.get(`${endpoint}?title=${encodeURIComponent(query)}&limit=10`);
            return (results ?? []).map(item => ({
                value: String(item.itemId ?? item.id),
                label: `[${item.type ?? '?'}] ${item.code ? item.code + ' – ' : ''}${item.title}`,
            }));
        } catch {
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // Query params
    // -------------------------------------------------------------------------

    _buildQueryParams(filtersObject = {}) {
        const params = {};
        const ctx    = this.app.getDatasetContext();

        if (ctx?.type === 'edition') params.edition = ctx.editionId;

        const keyMap = {
            refines:      'refinesParent',
            implements:   'implementedON',
            implementsOR: 'implementsOR',
        };

        Object.entries(filtersObject).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') return;
            params[keyMap[key] ?? key] = Array.isArray(value) ? value.join(',') : value;
        });

        return params;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _buildConfig() {
        const ctx = this.app.getDatasetContext();
        const isEdition = ctx?.type === 'edition';
        return {
            mode:       isEdition ? 'review' : 'edit',
            dataSource: isEdition ? String(ctx.editionId) : 'repository',
        };
    }

    _isReadOnly() {
        return this.app.getDatasetContext()?.type === 'edition';
    }

    _basePath() {
        return window.location.pathname.startsWith('/explore') ? '/explore/os' : '/elaborate/os';
    }

    _parseSubPath(subPath) {
        if (subPath.length >= 2) {
            const entityType = subPath[0];
            const id         = parseInt(subPath[1], 10);
            if ((entityType === 'requirement' || entityType === 'change') && !isNaN(id)) {
                return { entityType, id };
            }
        }
        return { entityType: null, id: null };
    }

    _buildLoadingHtml() {
        return `<div class="os-activity"><div class="loading"><p>Loading…</p></div></div>`;
    }
}