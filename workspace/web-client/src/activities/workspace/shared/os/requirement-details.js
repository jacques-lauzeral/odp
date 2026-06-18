/**
 * @file requirement-details.js
 * @description Read-only detail view for an Operational Requirement (ON or OR).
 *
 * Owns the shell: breadcrumb, toolbar, edit button.
 * Delegates body rendering to RequirementForm.generateReadOnlyView() — single
 * source of truth for field layout, tabs, and rich text rendering.
 *
 * Two modes:
 *   'panel' — rendered into MasterDetail right column; no back button;
 *             outer breadcrumb owned by os.js; inter-O* links navigate full page.
 *             'Full page' action available — calls onFullPage(item).
 *   'page'  — rendered into full container; back button + standalone breadcrumb.
 *             'In collection' and 'In narrative' actions available — call onInCollection(item)
 *             and onInNarrative(item) respectively.
 *
 * API call:
 *   GET /operational-requirements/{id}?projection=extended
 *   GET /operational-requirements/{id}?projection=extended&edition={editionId}
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';
import { runSoftDelete } from './os-delete.js';

export default class RequirementDetails {
    /**
     * @param {import('../../../../app.js').App} app
     * @param {{ mode: string, dataSource: string }} config  — from OsActivity._buildConfig()
     */
    constructor(app, config) {
        this.app    = app;
        this.config = config;

        this._onFullPage     = null;
        this._onInCollection = null;
        this._onInNarrative  = null;
        this._onDelete       = null;

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

    async render(container, id, mode = 'page', callbacks = {}) {
        this.container = container;
        this._mode     = mode;
        this._id       = id;
        this._callbacks = callbacks;

        // Re-inject callbacks on every render — ensures correct wiring
        // regardless of whether the instance is newly created or cached.
        this._onFullPage     = callbacks.onFullPage     ?? null;
        this._onInCollection = callbacks.onInCollection ?? null;
        this._onInNarrative  = callbacks.onInNarrative  ?? null;
        this._onDelete       = callbacks.onDelete       ?? null;
        this._onSaved        = callbacks.onSaved        ?? null;

        this.container.innerHTML = this._buildLoadingHtml();

        try {
            const [item, setupData, domains] = await Promise.all([
                this._fetch(id),
                this.app.getSetupData(),
                this.app.getDomains(),
            ]);

            this.item       = item;
            this._setupData = setupData;
            this._domains   = domains;

            const formExisted = this._form != null;
            await this._ensureForm(setupData);

            // Render shell
            this.container.innerHTML = this._buildShellHtml(item);

            // Inject tabbed body from form — preserve active tab on re-renders
            const bodyEl   = this.container.querySelector('#osDetailBody');
            const bodyHtml = await this._form.generateReadOnlyView(item, formExisted);
            bodyEl.innerHTML = bodyHtml;

            // Initialise Quill editors and reference managers inside the body
            this._form.initializeReadOnlyInPanel(bodyEl, item);

            this._attachEventListeners();
        } catch (error) {
            errorHandler.handle(error, 'requirement-details');
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
        return apiClient.get(`/operational-requirements/${id}`, { params });
    }

    // -------------------------------------------------------------------------
    // Form initialisation
    // -------------------------------------------------------------------------

    async _ensureForm(setupData) {
        if (this._form) return;
        const { default: RequirementForm } = await import('./requirement-form.js');
        const entityConfig = { endpoint: '/operational-requirements' };
        this._form = new RequirementForm(entityConfig, {
            setupData,
            domains:         this._domains ?? [],
            app:             this.app,
            getSetupData:    () => this._setupData,
            // Synthesise a minimal requirements list from extended projection fields
            // so that ReferenceListManager can resolve labels for refinedBy / implementedBy chips.
            getRequirements: () => {
                const item = this.item;
                if (!item) return [];
                return [
                    ...(item.implementedByORs ?? []),
                    ...(item.refinedBy ?? []),
                    ...(item.requiredByORs ?? []),
                ].map(r => ({
                    itemId: r.id ?? r.itemId,
                    id:     r.id ?? r.itemId,
                    title:  r.title ?? '',
                    code:   r.code  ?? '',
                    type:   r.type  ?? 'OR',
                }));
            },
            onNavigate:        (ref)         => this._navigateToRef(ref),
            onInternalLink:    (type, value) => this._handleInternalLink(type, value),
            onSaved:           (result, mode) => this._handleSaved(result, mode),
        });
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        this.container.querySelector('.os-detail__edit')
            ?.addEventListener('click', () => this._openEditPopup());

        this.container.querySelector('.os-detail__full-page')
            ?.addEventListener('click', () => this._onFullPage?.(this.item));

        this.container.querySelector('.os-detail__in-collection')
            ?.addEventListener('click', () => this._onInCollection?.(this.item));

        this.container.querySelector('.os-detail__in-narrative')
            ?.addEventListener('click', () => this._onInNarrative?.(this.item));

        this.container.querySelector('.os-detail__delete')
            ?.addEventListener('click', () => this._handleDelete());
    }

    // -------------------------------------------------------------------------
    // Navigation
    // -------------------------------------------------------------------------

    async _openEditPopup() {
        await this._ensureForm(this._setupData ?? await this.app.getSetupData());
        await this._form.showEditModal(this.item);
    }

    /**
     * Soft-delete this item. Runs the shared commit + API + 409 flow; on success
     * forwards to the parent's onDelete(item) so it can clear its own panel/list.
     * The view itself does no list/panel cleanup — that is the parent's concern.
     */
    async _handleDelete() {
        if (!this.item) return;
        const deleted = await runSoftDelete(this.app, this.item);
        if (deleted) this._onDelete?.(this.item);
    }

    /**
     * Called after the edit modal saves. Re-renders this panel with fresh data
     * so the displayed fields reflect the edit, then forwards the save upward
     * (e.g. to NarrativeActivity for TOC label refresh).
     * @param {object} result — saved entity
     * @param {string} mode   — 'create' | 'edit'
     */
    async _handleSaved(result, mode) {
        const forward = this._onSaved;
        // Re-render the panel from the server to pick up the saved changes.
        if (this.container && this._id != null) {
            await this.render(this.container, this._id, this._mode, this._callbacks);
        }
        forward?.(result, mode);
    }

    // -------------------------------------------------------------------------
    // Reference navigation
    // -------------------------------------------------------------------------

    /**
     * Handle internal link clicks from rich text fields.
     * @param {'n-ref'|'o-ref'|'d-ref'} type
     * @param {string} value
     * @private
     */
    _handleInternalLink(type, value) {
        if (!value) return;
        const ctx  = this.app.getDatasetContext();
        const base = ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/os`
            : '/elaborate/os';

        if (type === 'n-ref') {
            const slashIdx  = value.indexOf('/');
            const chapterId = slashIdx >= 0 ? value.slice(0, slashIdx) : value;
            const topicPath = slashIdx >= 0 ? value.slice(slashIdx + 1) : null;
            const ctxBase   = ctx?.type === 'edition' ? `/explore/${ctx.editionId}` : '/elaborate';
            const path      = topicPath
                ? `${ctxBase}/narrative/${chapterId}?theme=${encodeURIComponent(topicPath)}`
                : `${ctxBase}/narrative/${chapterId}`;
            this.app.navigate(path);
            return;
        }

        if (type === 'o-ref') {
            this.app.findOStar(value).then(ostar => {
                if (!ostar) { console.warn('[RequirementDetails] o-ref: O* not found', value); return; }
                this.app.navigate(`${base}/${ostar.type}/${value}`);
            }).catch(() => console.warn('[RequirementDetails] o-ref: resolution failed', value));
            return;
        }

        if (type === 'd-ref') {
            const ctxBase = ctx?.type === 'edition' ? `/explore/${ctx.editionId}` : '/elaborate';
            this.app.navigate(`${ctxBase}/setup/reference-documents/${value}`);
        }
    }

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
        const isEditable       = this.config.mode === 'edit';
        const showFullPage     = this._mode === 'panel' && this._onFullPage     != null;
        const showInCollection = this._mode === 'page'  && this._onInCollection != null;
        const showInNarrative  = this._mode === 'page'  && this._onInNarrative  != null;
        const showDelete       = isEditable && this._onDelete != null;

        return `
            <div class="os-detail${this._mode === 'page' ? ' os-detail--page' : ''}">
                <div class="os-detail__toolbar">
                    <span class="os-detail__title">${this._esc(item.code ? `${item.code} — ${item.title ?? ''}` : (item.title ?? ''))}</span>
                    <div class="os-detail__actions">
                        ${isEditable
            ? '<button class="odip-btn odip-btn--primary os-detail__edit">Edit</button>'
            : ''}
                        ${showFullPage
            ? '<button class="odip-btn os-detail__full-page">Full page</button>'
            : ''}
                        ${showInCollection
            ? '<button class="odip-btn os-detail__in-collection">In collection</button>'
            : ''}
                        ${showInNarrative
            ? '<button class="odip-btn os-detail__in-narrative">In narrative</button>'
            : ''}
                        ${showDelete
            ? '<button class="odip-btn odip-btn--danger os-detail__delete">Delete</button>'
            : ''}
                    </div>
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
                    <p>Failed to load requirement: ${this._esc(error.message)}</p>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _basePath() {
        const ctx = this.app.getDatasetContext();
        return ctx?.type === 'edition'
            ? `/explore/${ctx.editionId}/os`
            : '/elaborate/os';
    }

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}