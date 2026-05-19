/**
 * @file change-details.js
 * @description Read-only detail view for an Operational Change (OC).
 *
 * Owns the shell: breadcrumb, toolbar, edit button.
 * Delegates body rendering to ChangeForm.generateReadOnlyView() — single
 * source of truth for field layout, tabs, and rich text rendering.
 *
 * Two modes:
 *   'panel' — rendered into MasterDetail right column; no back button;
 *             outer breadcrumb owned by os.js; inter-O* links navigate full page.
 *   'page'  — rendered into full container; back button + standalone breadcrumb.
 *
 * API call:
 *   GET /operational-changes/{id}?projection=extended
 *   GET /operational-changes/{id}?projection=extended&edition={editionId}
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';

export default class ChangeDetails {
    /**
     * @param {import('../../../../app.js').App} app
     * @param {{ mode: string, dataSource: string }} config — from OsActivity._buildConfig()
     */
    constructor(app, config) {
        this.app    = app;
        this.config = config;

        this.container = null;
        this.item      = null;
        this._mode     = 'page'; // 'panel' | 'page'

        // Form — initialised on first render, reused for edit popup
        this._form      = null;
        this._setupData = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, id, mode = 'page') {
        this.container = container;
        this._mode     = mode;
        this.container.innerHTML = this._buildLoadingHtml();

        try {
            const [item, setupData] = await Promise.all([
                this._fetch(id),
                this.app.getSetupData(),
            ]);

            this.item       = item;
            this._setupData = setupData;

            await this._ensureForm(setupData);

            // Render shell
            this.container.innerHTML = this._buildShellHtml(item);

            // Set header breadcrumb
            this.app.header.setBreadcrumb(this._buildCrumbs(item));

            // Inject tabbed body from form
            const bodyEl   = this.container.querySelector('#osDetailBody');
            const bodyHtml = await this._form.generateReadOnlyView(item);
            bodyEl.innerHTML = bodyHtml;

            // Initialise Quill editors and reference managers inside the body
            this._form.initializeReadOnlyInPanel(bodyEl, item);

            this._attachEventListeners();
        } catch (error) {
            errorHandler.handle(error, 'change-details');
            this.container.innerHTML = this._buildErrorHtml(error);
        }
    }

    cleanup() {
        this.container = null;
        this.item      = null;
    }

    // -------------------------------------------------------------------------
    // Data fetching
    // -------------------------------------------------------------------------

    async _fetch(id) {
        const ctx    = this.app.getDatasetContext();
        const params = { projection: 'extended' };
        if (ctx?.type === 'edition') params.edition = ctx.editionId;
        return apiClient.get(`/operational-changes/${id}`, { params });
    }

    // -------------------------------------------------------------------------
    // Form initialisation
    // -------------------------------------------------------------------------

    async _ensureForm(setupData) {
        if (this._form) return;
        const { default: ChangeForm } = await import('./change-form.js');
        const entityConfig = { endpoint: '/operational-changes' };
        this._form = new ChangeForm(entityConfig, {
            setupData,
            getSetupData:    () => this._setupData,
            getRequirements: () => [],
            onNavigate: (ref) => this._navigateToRef(ref),
        });
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        this.container.querySelector('.os-detail__edit')
            ?.addEventListener('click', () => this._openEditPopup());
    }

    // -------------------------------------------------------------------------
    // Navigation
    // -------------------------------------------------------------------------

    async _openEditPopup() {
        await this._ensureForm(this._setupData ?? await this.app.getSetupData());
        await this._form.showEditModal(this.item);
    }

    // -------------------------------------------------------------------------
    // Reference navigation
    // -------------------------------------------------------------------------

    _navigateToRef(ref) {
        const raw = ref.entityType ?? 'or';
        const segment = raw === 'OC' || raw === 'change' || raw === 'oc' ? 'oc'
            : raw === 'ON' || raw === 'on'                     ? 'on'
                : 'or';
        const base = this._basePath();
        this.app.navigate(`${base}/${segment}/${ref.id}`);
    }

    // -------------------------------------------------------------------------
    // Shell rendering
    // -------------------------------------------------------------------------

    _buildShellHtml(item) {
        const isEditable = this.config.mode === 'edit';

        return `
            <div class="os-detail">
<div class="os-detail__toolbar">
                    ${this._mode === 'page'
            ? '<button class="btn btn-secondary os-detail__back">← Back</button>'
            : ''}
                    <div class="os-detail__identity">
                        <span class="os-detail__code">${this._esc(item.code ?? '')}</span>
                        <span class="os-detail__type-badge">Operational Change</span>
                        <span class="os-detail__maturity">${this._esc(item.maturity ?? '')}</span>
                    </div>
                    ${isEditable
            ? '<button class="btn btn-primary os-detail__edit">Edit</button>'
            : ''}
                </div>
                <div class="os-detail__body" id="osDetailBody"></div>
            </div>
        `;
    }

    _buildCrumbs(item) {
        const base  = this._basePath();
        const code  = item.code ?? '';
        const title = item.title ?? String(item.itemId ?? item.id ?? '');
        const label = code ? `${code} — ${title}` : title;
        return [
            { label: 'O*s', path: base },
            { label },
        ];
    }

    _buildLoadingHtml() {
        return `<div class="os-detail"><div class="loading"><p>Loading…</p></div></div>`;
    }

    _buildErrorHtml(error) {
        return `
            <div class="os-detail">
                <div class="error-container">
                    <p>Failed to load change: ${this._esc(error.message)}</p>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _basePath() {
        return window.location.pathname.startsWith('/explore') ? '/explore/os' : '/elaborate/os';
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}