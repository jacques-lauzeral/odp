/**
 * @file os.js
 * @description O* workspace orchestrator. Unified list of ONs, ORs, and OCs.
 * Routes between list view and detail pages, owns search box, filter bar,
 * perspective/grouping controls, data loading, and entity component lifecycle.
 *
 * SubPath routing:
 *   []                      → list view
 *   ['on', '{id}']          → RequirementDetails in panel (ON)
 *   ['or', '{id}']          → RequirementDetails in panel (OR)
 *   ['oc', '{id}']          → ChangeDetails in panel (OC)
 *   page-mode detail:       → full page via app.navigate from detail links
 *
 * Context/mode from app.getDatasetContext():
 *   { type: 'live' }               → isReadOnly: false
 *   { type: 'edition', editionId } → isReadOnly: true
 *
 * Layout (list view):
 *   ┌──────────────────────────────────────────────────────┐
 *   │ Search box (full width)                              │
 *   │ Filter bar (full width)                              │
 *   │ View controls (perspective, grouping, create)        │
 *   │ MasterDetail: list column | detail panel             │
 *   └──────────────────────────────────────────────────────┘
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { dom } from '../../../../shared/utils.js';
import MasterDetail from '../../../../components/master-detail.js';
import FilterBar from '../../../../components/filter-bar.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay,
    MaturityLevel,
    getMaturityLevelDisplay,
} from '/shared/src/index.js';

export default class OsActivity {
    /**
     * @param {import('../../../../app.js').App} app
     */
    constructor(app) {
        this.app = app;
        this.container = null;

        this.setupData    = null;
        this.filterBar    = null;
        this.masterDetail = null;
        this._viewControlsEl = null;
        this._ostarEntity    = null;
        this._requirementDetails = null;
        this._changeDetails      = null;

        this._searchText    = '';
        this._filtersObject = {};
        this._searchDebounce = null;
        this._counts = { ON: 0, OR: 0, OC: 0 };
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;

        try {
            const { entityType, id } = this._parseSubPath(subPath);

            if (entityType === 'on' || entityType === 'or') {
                await this._renderRequirementDetail(id);
            } else if (entityType === 'oc') {
                await this._renderChangeDetail(id);
            } else {
                await this._renderList();
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
        this._ostarEntity?.cleanup?.();
        this._requirementDetails?.cleanup?.();
        this._changeDetails?.cleanup?.();
        clearTimeout(this._searchDebounce);

        this.filterBar           = null;
        this.masterDetail        = null;
        this._ostarEntity        = null;
        this._requirementDetails = null;
        this._changeDetails      = null;
        this.setupData           = null;
        this.container           = null;
    }

    // -------------------------------------------------------------------------
    // List view
    // -------------------------------------------------------------------------

    async _renderList() {
        this.container.innerHTML = this._buildLoadingHtml();

        try {
            this.setupData = await this.app.getSetupData();
        } catch (error) {
            errorHandler.handle(error, 'os-setup-data');
            this.setupData = { stakeholderCategories: [], domains: [], referenceDocuments: [], waves: [] };
        }

        this._buildListShell();
        this._mountSearchBox();
        this._mountFilterBar();
        await this._prepareOStarEntity();
        this.app.header.setBreadcrumb([{ label: 'O*s' }]);
        await this._loadData();
        this._ostarEntity.onActivated();
    }

    _buildListShell() {
        this.container.innerHTML = `
            <div class="os-activity">
                <div class="os-toolbar" id="osToolbar">
                    <div class="os-toolbar__filters" id="osFilters"></div>
                    <div class="os-toolbar__summary" id="osSummary"></div>
                    <div class="os-toolbar__search" id="osSearch"></div>
                </div>
                <div class="os-view-controls" id="osViewControls"></div>
                <div class="os-content" id="osContent"></div>
            </div>
        `;

        this._viewControlsEl = dom.find('#osViewControls', this.container);

        const contentEl = dom.find('#osContent', this.container);
        this.masterDetail = new MasterDetail(contentEl, {
            initialRatio: 0.67,
            placeholderHtml: `
                <div class="master-detail__placeholder">
                    <div class="master-detail__placeholder-icon">🔍</div>
                    <p class="master-detail__placeholder-text">Select an O* to view details</p>
                </div>
            `,
        });
        this.masterDetail.render();
    }

    _mountSearchBox() {
        const el = dom.find('#osSearch', this.container);
        if (!el) return;

        el.innerHTML = `
            <div class="os-search__box">
                <input
                    class="os-search__input"
                    id="osSearchInput"
                    type="search"
                    placeholder="Search ONs, ORs, OCs…"
                    autocomplete="off"
                    value="${this._esc(this._searchText)}"
                >
            </div>
        `;

        dom.find('#osSearchInput', el)?.addEventListener('input', (e) => {
            clearTimeout(this._searchDebounce);
            this._searchDebounce = setTimeout(() => {
                this._searchText = e.target.value.trim();
                this._loadData();
            }, 300);
        });
    }

    _mountFilterBar() {
        const filtersEl = dom.find('#osFilters', this.container);
        if (!filtersEl) return;

        this.filterBar = new FilterBar(this._getFilterConfig(), this.setupData);
        this.filterBar.fetchSuggestionsCallback = (key, query) => this._fetchFilterSuggestions(key, query);
        this.filterBar.render(filtersEl);

        filtersEl.addEventListener('filtersChanged', (e) => {
            // e.detail.filters is the flat object { key: value }
            this._filtersObject = e.detail?.filters ?? {};
            this._loadData();
        });
    }

    async _prepareOStarEntity() {
        if (this._ostarEntity) return;
        const { default: OStarEntity } = await import('./o-star-entity.js');
        this._ostarEntity = new OStarEntity(this.app, this.setupData, {
            onItemSelect:      (item) => this._handleItemSelect(item),
            getViewControlsEl: ()     => this._viewControlsEl,
            isReadOnly:        this._isReadOnly(),
        });
        this._ostarEntity.container = this.masterDetail.listContainer;
    }

    // -------------------------------------------------------------------------
    // Data loading
    // -------------------------------------------------------------------------

    async _loadData() {
        try {
            const params = this._buildQueryParams();
            const raw    = await apiClient.listOStars(params);
            const data   = Array.isArray(raw) ? raw : [];
            // Normalise type — OCs have no type field from the API
            data.forEach(item => { if (!item.type) item.type = 'OC'; });
            this._counts = {
                ON: data.filter(i => i.type === 'ON').length,
                OR: data.filter(i => i.type === 'OR').length,
                OC: data.filter(i => i.type === 'OC').length,
            };
            this._updateSummary();
            this._ostarEntity?.onDataUpdated(data);
        } catch (error) {
            errorHandler.handle(error, 'os-load');
        }
    }

    _updateSummary() {
        const el = dom.find('#osSummary', this.container);
        if (!el) return;
        const { ON, OR, OC } = this._counts;
        el.innerHTML = `<span class="os-summary__text">${ON} ONs &nbsp;·&nbsp; ${OR} ORs &nbsp;·&nbsp; ${OC} OCs</span>`;
    }

    _buildQueryParams() {
        const params = {};
        const ctx    = this.app.getDatasetContext();

        if (ctx?.type === 'edition') params.edition = ctx.editionId;
        if (this._searchText)        params.text     = this._searchText;

        // Map unified filter keys to listOStars param shape
        const keyMap = {
            implements: 'implements',
            drg:        'drg',
            type:       'type',
            maturity:   'maturity',
            domain:     'domain',
            stakeholderCategory: 'stakeholderCategory',
            strategicDocument:   'strategicDocument',
        };

        Object.entries(this._filtersObject).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') return;
            const mapped = keyMap[key] ?? key;
            params[mapped] = Array.isArray(value) ? value.join(',') : value;
        });

        return params;
    }

    // -------------------------------------------------------------------------
    // Filter configuration
    // -------------------------------------------------------------------------

    _getFilterConfig() {
        return [
            {
                key: 'type', label: 'Type', inputType: 'select',
                options: [
                    { value: 'ON', label: 'ON' },
                    { value: 'OR', label: 'OR' },
                    { value: 'OC', label: 'OC' },
                ],
            },
            {
                key: 'drg', label: 'Owner Domain', inputType: 'select',
                options: Object.values(DraftingGroup).map(k => ({ value: k, label: getDraftingGroupDisplay(k) ?? k })),
            },
            {
                key: 'maturity', label: 'Maturity', inputType: 'select',
                options: Object.keys(MaturityLevel).map(k => ({ value: k, label: getMaturityLevelDisplay(k) })),
            },
            {
                key: 'domain', label: 'Impacted Domain', inputType: 'suggest',
                options: (this.setupData?.domains ?? []).map(d => ({ value: d.id, label: d.name })),
            },
            {
                key: 'stakeholderCategory', label: 'Stakeholder', inputType: 'suggest',
                options: (this.setupData?.stakeholderCategories ?? []).map(s => ({ value: s.id, label: s.name })),
            },
            {
                key: 'implements', label: 'Implements', inputType: 'suggest',
            },
            {
                key: 'strategicDocument', label: 'Strategic Doc', inputType: 'suggest',
                options: (this.setupData?.referenceDocuments ?? []).map(r => ({ value: r.id, label: r.name })),
            },
        ];
    }

    async _fetchFilterSuggestions(key, query) {
        if (!query || query.length < 2) return [];
        if (key === 'implements') {
            try {
                const results = await apiClient.get(`/operational-requirements`, { params: { title: query, limit: 10 } });
                return (results ?? []).map(item => ({
                    value: String(item.itemId ?? item.id),
                    label: `[${item.type ?? '?'}] ${item.code ? item.code + ' — ' : ''}${item.title}`,
                }));
            } catch { return []; }
        }
        return [];
    }

    // -------------------------------------------------------------------------
    // Item selection → render detail in panel
    // -------------------------------------------------------------------------

    async _handleItemSelect(item) {
        const id         = item.itemId ?? item.id;
        const isOC       = item.type === 'OC' || (!item.type && item.code?.startsWith('OC-'));
        const entityType = isOC ? 'oc' : (item.type === 'ON' ? 'on' : 'or');

        const code  = item.code ?? '';
        const title = item.title ?? String(id ?? '');
        this.app.header.setBreadcrumb([
            { label: 'O*s', path: `${this._basePath()}` },
            { label: code ? `${code} — ${title}` : title },
        ]);

        if (isOC) {
            await this._renderChangeDetailInPanel(id);
        } else {
            await this._renderRequirementDetailInPanel(id);
        }

        window.history.replaceState({}, '', `${this._basePath()}/${entityType}/${id}`);
    }

    // -------------------------------------------------------------------------
    // Detail — panel mode
    // -------------------------------------------------------------------------

    async _renderRequirementDetailInPanel(id) {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('./requirement-details.js');
            this._requirementDetails = new RequirementDetails(this.app, this._buildConfig());
        }
        await this._requirementDetails.render(this.masterDetail.detailContainer, id, 'panel');
    }

    async _renderChangeDetailInPanel(id) {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('./change-details.js');
            this._changeDetails = new ChangeDetails(this.app, this._buildConfig());
        }
        await this._changeDetails.render(this.masterDetail.detailContainer, id, 'panel');
    }

    // -------------------------------------------------------------------------
    // Detail — page mode (direct URL or inter-O* navigation)
    // -------------------------------------------------------------------------

    async _renderRequirementDetail(id) {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('./requirement-details.js');
            this._requirementDetails = new RequirementDetails(this.app, this._buildConfig());
        }
        await this._requirementDetails.render(this.container, id, 'page');
    }

    async _renderChangeDetail(id) {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('./change-details.js');
            this._changeDetails = new ChangeDetails(this.app, this._buildConfig());
        }
        await this._changeDetails.render(this.container, id, 'page');
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
            if (['on', 'or', 'oc'].includes(entityType) && !isNaN(id)) {
                return { entityType, id };
            }
        }
        return { entityType: null, id: null };
    }

    _buildLoadingHtml() {
        return `<div class="os-activity"><div class="loading"><p>Loading…</p></div></div>`;
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}