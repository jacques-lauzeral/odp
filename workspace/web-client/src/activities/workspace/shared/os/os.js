/**
 * @file os.js
 * @description O* workspace orchestrator. Unified list of ONs, ORs, and OCs.
 * Routes between list view and detail pages, owns search box, filter bar,
 * grouping controls, data loading, and entity component lifecycle.
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
 *   │ View controls (grouping, counts)                     │
 *   │ MasterDetail: list column | detail panel             │
 *   └──────────────────────────────────────────────────────┘
 *
 * Plain page ↔ master detail navigation:
 *   'Full page' button (panel mode)  — pushes /{base}/os/{type}/{id}
 *   'In collection' button (page mode) — navigates to /{base}/os?perspective=coll&selected={id}
 *   'In narrative' button (page mode)  — navigates to /{base}/narrative/{chapterId}?o-star={id}
 *   On list render, ?perspective and ?selected are consumed once to restore state.
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { dom } from '../../../../shared/utils.js';
import MasterDetail from '../../../../components/master-detail.js';
import FilterBar from '../../../../components/filter-bar.js';
import {
    MaturityLevel,
    getMaturityLevelDisplay,
    normalizeId,
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
        this._domains = [];

        // Listen for saves from any O* form — covers toolbar create buttons
        // where the form is instantiated directly without going through a detail view.
        this._entitySavedHandler = (e) => this._handlePanelSaved(e.detail?.entity, e.detail?.mode);
        document.addEventListener('entitySaved', this._entitySavedHandler);
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
        // If navigating back to the list view
        if (!subPath || subPath.length === 0) {
            if (this._inPageMode) {
                // Full-page detail was shown — rebuild list
                this._inPageMode = false;
                return this._renderList();
            }
            if (this.masterDetail && this._ostarEntity) {
                // Panel mode — clear detail and restore
                this.masterDetail.clearDetail();
                this._ostarEntity.onActivated();
                return;
            }
            return this._renderList();
        }
        return this.render(this.container, subPath);
    }

    cleanup() {
        if (this._entitySavedHandler) {
            document.removeEventListener('entitySaved', this._entitySavedHandler);
            this._entitySavedHandler = null;
        }
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
            this.setupData = { stakeholderCategories: [], referenceDocuments: [], waves: [] };
        }

        try {
            this._domains = await this.app.getDomains();
        } catch (error) {
            errorHandler.handle(error, 'os-domains');
            this._domains = [];
        }

        this._buildListShell();
        this._mountSearchBox();
        this._mountFilterBar();
        await this._prepareOStarEntity();
        this._ostarEntity.onActivated();
        await this._loadData();

        // Consume one-shot restore hints from ?perspective and ?selected
        this._restoreFromSearchParams();
    }

    _buildListShell() {
        this.container.innerHTML = `
            <div class="os-activity">
                <div class="os-toolbar" id="osToolbar">
                    <div class="os-toolbar__filters" id="osFilters"></div>
                    <div class="os-toolbar__search" id="osSearch"></div>
                    <div class="os-toolbar__create" id="osCreateActions"></div>
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

        // Create buttons — only in live (non-read-only) context
        if (!this._isReadOnly()) {
            const createEl = dom.find('#osCreateActions', this.container);
            if (createEl) {
                createEl.innerHTML = `
                    <button class="odip-btn odip-btn--create" id="toolbarCreateON">+ ON</button>
                    <button class="odip-btn odip-btn--create" id="toolbarCreateOR">+ OR</button>
                    <button class="odip-btn odip-btn--create" id="toolbarCreateOC">+ OC</button>
                `;
                createEl.querySelector('#toolbarCreateON')?.addEventListener('click', () => this._ostarEntity?._handleCreate('ON'));
                createEl.querySelector('#toolbarCreateOR')?.addEventListener('click', () => this._ostarEntity?._handleCreate('OR'));
                createEl.querySelector('#toolbarCreateOC')?.addEventListener('click', () => this._ostarEntity?._handleCreate('OC'));
            }
        }
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
        if (this._ostarEntity) {
            // Reconnect to new masterDetail list container after a rebuild
            this._ostarEntity.container = this.masterDetail.listContainer;
            return;
        }
        const { default: OStarEntity } = await import('./o-star-entity.js');
        this._ostarEntity = new OStarEntity(this.app, this.setupData, {
            domains:                 this._domains,
            onItemSelect:            (item) => this._handleItemSelect(item),
            getViewControlsEl:       ()     => this._viewControlsEl,
            isReadOnly:              this._isReadOnly(),
            onViewControlsRendered:  ()     => this._updateSummary(),
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
        const el = dom.find('#osSummaryText', this.container);
        if (!el) return;
        const { ON, OR, OC } = this._counts;
        el.textContent = `${ON} ONs · ${OR} ORs · ${OC} OCs`;
    }

    _buildQueryParams() {
        const params = {};
        const ctx    = this.app.getDatasetContext();

        if (ctx?.type === 'edition') params.edition = ctx.editionId;
        if (this._searchText)        params.text     = this._searchText;

        // Map unified filter keys to listOStars param shape
        const keyMap = {
            implements: 'implements',
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
    // Search params restore (one-shot, consumed on list render)
    // -------------------------------------------------------------------------

    /**
     * Read ?selected from the current URL and restore list state.
     * Called once after _renderList() + _loadData() complete.
     * Cleans the params from the URL via replaceState after consuming them.
     * ?perspective is accepted for URL compatibility but ignored — only collection exists.
     */
    _restoreFromSearchParams() {
        const sp         = new URLSearchParams(window.location.search);
        const selectedId = sp.has('selected') ? parseInt(sp.get('selected'), 10) : null;

        if (selectedId == null) return;

        // Resolve selected item and trigger panel render
        const item = !isNaN(selectedId)
            ? (this._ostarEntity.data.find(i => (i.itemId ?? i.id) === selectedId) ?? null)
            : null;

        if (item) {
            this._ostarEntity.sharedState.selectedItem = item;
            this._ostarEntity.renderFromCache();
            this._handleItemSelect(item);
        }

        // Clean search params from URL without adding a history entry
        window.history.replaceState(null, '', window.location.pathname);
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
                key: 'domain', label: 'Domain', inputType: 'select',
                options: this._domains.map(d => ({ value: d.key, label: d.title })),
            },
            {
                key: 'maturity', label: 'Maturity', inputType: 'select',
                options: Object.keys(MaturityLevel).map(k => ({ value: k, label: getMaturityLevelDisplay(k) })),
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
        const id   = item.itemId ?? item.id;
        const isOC = item.type === 'OC' || (!item.type && item.code?.startsWith('OC-'));

        if (isOC) {
            await this._renderChangeDetailInPanel(id);
        } else {
            await this._renderRequirementDetailInPanel(id);
        }
    }

    // -------------------------------------------------------------------------
    // Detail — panel mode
    // -------------------------------------------------------------------------

    async _renderRequirementDetailInPanel(id) {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('./requirement-details.js');
            this._requirementDetails = new RequirementDetails(this.app, this._buildConfig());
        }
        await this._requirementDetails.render(this.masterDetail.detailContainer, id, 'panel', {
            onFullPage: (item) => this._navigateToFullPage(item),
            onDelete:   (item) => this._handlePanelDeleted(item),
        });
    }

    async _renderChangeDetailInPanel(id) {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('./change-details.js');
            this._changeDetails = new ChangeDetails(this.app, this._buildConfig());
        }
        await this._changeDetails.render(this.masterDetail.detailContainer, id, 'panel', {
            onFullPage: (item) => this._navigateToFullPage(item, 'oc'),
            onDelete:   (item) => this._handlePanelDeleted(item),
        });
    }

    /**
     * Called after any save from the detail panel (edit or create).
     * Re-fetches the list, then — on create — selects the new item if it
     * survives the current filters, or clears the panel if it is hidden.
     * @param {object} result — saved entity returned by the API
     * @param {string} mode   — 'create' | 'edit'
     */
    async _handlePanelSaved(result, mode) {
        await this._loadData();

        if (mode !== 'create') return;

        const id = result?.itemId ?? result?.id ?? null;
        if (id == null) return;

        const found = this._ostarEntity?.data.find(
            item => (item.itemId ?? item.id) === id
        ) ?? null;

        if (found) {
            this._ostarEntity.sharedState.selectedItem = found;
            this._ostarEntity.renderFromCache();   // re-render list with selection highlighted
            await this._handleItemSelect(found);
        } else {
            // New item is hidden by current filters — clear panel
            this._ostarEntity.sharedState.selectedItem = null;
            this.masterDetail.clearDetail();
        }
    }

    /**
     * Called after a successful soft-delete from the panel detail view.
     * Clears the detail panel and selection, then reloads the list so the
     * deleted item disappears from the active (non-deleted) face.
     * @param {object} _item — the deleted entity (unused; reload is authoritative)
     */
    async _handlePanelDeleted(_item) {
        this._ostarEntity.sharedState.selectedItem = null;
        this.masterDetail.clearDetail();
        await this._loadData();
    }

    /**
     * Called after a successful soft-delete from the full-page detail view.
     * Navigates back to the collection (no selection restore — the item is gone);
     * the list reload on render reflects the deletion.
     */
    _navigateToListAfterDelete() {
        this._inPageMode = false;
        this.app.navigate(this._basePath());
    }

    // -------------------------------------------------------------------------
    // Detail — page mode (direct URL or inter-O* navigation)
    // -------------------------------------------------------------------------

    async _renderRequirementDetail(id) {
        if (!this._requirementDetails) {
            const { default: RequirementDetails } = await import('./requirement-details.js');
            this._requirementDetails = new RequirementDetails(this.app, this._buildConfig());
        }
        this._inPageMode = true;
        await this._requirementDetails.render(this.container, id, 'page', {
            onFullPage:      null,
            onInCollection:  (item) => this._navigateToList(item),
            onInNarrative:   (item) => this._navigateToNarrative(item),
            onDelete:        ()     => this._navigateToListAfterDelete(),
        });
    }

    async _renderChangeDetail(id) {
        if (!this._changeDetails) {
            const { default: ChangeDetails } = await import('./change-details.js');
            this._changeDetails = new ChangeDetails(this.app, this._buildConfig());
        }
        this._inPageMode = true;
        await this._changeDetails.render(this.container, id, 'page', {
            onFullPage:      null,
            onInCollection:  (item) => this._navigateToList(item),
            onInNarrative:   (item) => this._navigateToNarrative(item),
            onDelete:        ()     => this._navigateToListAfterDelete(),
        });
    }

    // -------------------------------------------------------------------------
    // Plain page ↔ master detail navigation
    // -------------------------------------------------------------------------

    /**
     * Navigate from panel detail to full-page detail.
     * Pushes /{base}/os/{type}/{id} to browser history.
     * @param {object} item
     * @param {string} [segment]
     */
    _navigateToFullPage(item, segment) {
        const id = item.itemId ?? item.id;
        const entityType = segment
            ?? (item.type === 'OC' || item.code?.startsWith('OC-') ? 'oc'
                : item.type === 'ON' ? 'on' : 'or');
        this.app.navigate(`${this._basePath()}/${entityType}/${id}`);
    }

    /**
     * Navigate from full-page detail back to the master detail list,
     * restoring the selection via one-shot search params.
     * @param {object} item
     */
    _navigateToList(item) {
        const id = item.itemId ?? item.id;
        this.app.navigate(`${this._basePath()}?perspective=coll&selected=${id}`);
    }

    /**
     * Navigate from full-page detail to the Narrative activity, landing on the
     * chapter that owns the O*'s domain and selecting the O* in the TOC.
     * Falls back to the Narrative root if no matching chapter is found.
     * @param {object} item — full O* entity (must have domain field)
     */
    async _navigateToNarrative(item) {
        const itemId  = item.itemId ?? item.id;
        const ctx     = this.app.getDatasetContext();
        const base    = ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/narrative`
            : '/elaborate/narrative';

        try {
            const chapters = await this.app.getChapters();
            const chapter  = item.domain
                ? (chapters.find(c => c.domain === item.domain) ?? null)
                : null;
            if (chapter) {
                const param  = item.type === 'ON' ? 'on' : item.type === 'OR' ? 'or' : 'oc';
                this.app.navigate(`${base}/${normalizeId(chapter.itemId)}?${param}=${itemId}`);
            } else {
                this.app.navigate(base);
            }
        } catch {
            this.app.navigate(base);
        }
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
        const ctx = this.app.getDatasetContext();
        return ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/os`
            : '/elaborate/os';
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