/**
 * @file requirement-details.js
 * @description Full-page read-only detail view for an Operational Requirement (ON or OR).
 *
 * Fetches the requirement using the extended projection to obtain all forward and
 * reverse-traversal reference fields. Renders a single scrollable page with section
 * headings. Inter-O* references are rendered as navigable links.
 *
 * In Elaborate context (live dataset): an Edit button opens the existing RequirementForm
 * popup. In Explore context (edition): no edit action is available.
 *
 * API call:
 *   GET /operational-requirements/{id}?projection=extended
 *   GET /operational-requirements/{id}?projection=extended&edition={editionId}
 */
import { apiClient } from '../../../../shared/api-client.js';
import { errorHandler } from '../../../../shared/error-handler.js';

export default class RequirementDetails {
    /**
     * @param {import('../../../../app.js').App} app
     * @param {{ mode: string, dataSource: string }} config  — from OsActivity._buildConfig()
     */
    constructor(app, config) {
        this.app = app;
        this.config = config;
        this.container = null;
        this.item = null;

        // Lazy-loaded form for edit popup (Elaborate only)
        this._form = null;
        this._setupData = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, id) {
        this.container = container;
        this.container.innerHTML = this._buildLoadingHtml();

        try {
            this.item = await this._fetch(id);
            this.container.innerHTML = this._buildHtml(this.item);
            this._attachEventListeners();
        } catch (error) {
            errorHandler.handle(error, 'requirement-details');
            this.container.innerHTML = this._buildErrorHtml(error);
        }
    }

    cleanup() {
        this.container = null;
        this.item = null;
        this._form = null;
        this._setupData = null;
    }

    // -------------------------------------------------------------------------
    // Data fetching
    // -------------------------------------------------------------------------

    async _fetch(id) {
        const ctx = this.app.getDatasetContext();
        const params = { projection: 'extended' };
        if (ctx?.type === 'edition') {
            params.edition = ctx.editionId;
        }
        return apiClient.get(`/operational-requirements/${id}`, { params });
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        // Back button
        this.container.querySelector('.os-detail__back')
            ?.addEventListener('click', () => this._navigateBack());

        // Edit button (Elaborate only)
        this.container.querySelector('.os-detail__edit')
            ?.addEventListener('click', () => this._openEditPopup());

        // Navigable O* reference links
        this.container.querySelectorAll('[data-os-navigate]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const path = el.dataset.osNavigate;
                this.app.navigate(path);
            });
        });
    }

    // -------------------------------------------------------------------------
    // Navigation
    // -------------------------------------------------------------------------

    _navigateBack() {
        const base = window.location.pathname.startsWith('/explore')
            ? '/explore/os'
            : '/elaborate/os';
        this.app.navigate(base);
    }

    async _openEditPopup() {
        if (!this._form) {
            const [
                { default: RequirementForm },
                setupData
            ] = await Promise.all([
                import('./requirement-form.js'),
                this._loadSetupData()
            ]);

            const entityConfig = { endpoint: '/operational-requirements' };
            this._form = new RequirementForm(entityConfig, {
                setupData,
                getSetupData: () => setupData,
                getRequirements: () => [],
            });
            this._setupData = setupData;
        }

        await this._form.showEditModal(this.item);
    }

    async _loadSetupData() {
        if (this._setupData) return this._setupData;
        const [stakeholderCategories, domains, referenceDocuments, waves] = await Promise.all([
            apiClient.get('/stakeholder-categories'),
            apiClient.get('/domains'),
            apiClient.get('/reference-documents'),
            apiClient.get('/waves'),
        ]);
        return { stakeholderCategories, domains, referenceDocuments, waves };
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _buildLoadingHtml() {
        return `<div class="os-detail"><div class="loading"><p>Loading…</p></div></div>`;
    }

    _buildErrorHtml(error) {
        return `
            <div class="os-detail">
                <div class="error-container">
                    <p>Failed to load requirement: ${this._esc(error.message)}</p>
                    <button class="btn btn-secondary os-detail__back">Back</button>
                </div>
            </div>
        `;
    }

    _buildHtml(item) {
        const isEditable = this.config.mode === 'edit';
        const typeLabel = item.type === 'ON' ? 'Operational Need' : 'Operational Requirement';

        return `
            <div class="os-detail">
                <div class="os-detail__toolbar">
                    <button class="btn btn-secondary os-detail__back">← Back</button>
                    <div class="os-detail__identity">
                        <span class="os-detail__code">${this._esc(item.code ?? '')}</span>
                        <span class="os-detail__type-badge">${typeLabel}</span>
                        <span class="os-detail__maturity">${this._esc(item.maturity ?? '')}</span>
                    </div>
                    ${isEditable ? `<button class="btn btn-primary os-detail__edit">Edit</button>` : ''}
                </div>

                <div class="os-detail__body">
                    <h1 class="os-detail__title">${this._esc(item.title ?? '')}</h1>

                    ${this._buildSection('General', this._buildGeneralFields(item))}
                    ${this._buildSection('Details', this._buildDetailFields(item))}
                    ${this._buildSection('Traceability', this._buildTraceabilityFields(item))}
                    ${item.type === 'OR' ? this._buildSection('Impact', this._buildImpactFields(item)) : ''}
                    ${this._buildSection('Planning', this._buildPlanningFields(item))}
                </div>
            </div>
        `;
    }

    _buildSection(title, content) {
        if (!content) return '';
        return `
            <section class="os-detail__section">
                <h2 class="os-detail__section-title">${title}</h2>
                <div class="os-detail__section-body">${content}</div>
            </section>
        `;
    }

    _buildGeneralFields(item) {
        return `
            ${this._field('ID', item.itemId)}
            ${this._field('Version', item.version)}
            ${this._field('Drafting Group', item.drg)}
            ${this._field('Path', item.path?.join(' > ') || '—')}
            ${this._field('Created by', item.createdBy)}
            ${this._field('Created', item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—')}
        `;
    }

    _buildDetailFields(item) {
        return `
            ${this._richField('Statement', item.statement)}
            ${this._richField('Rationale', item.rationale)}
            ${item.flows ? this._richField('Flows', item.flows) : ''}
            ${item.type === 'OR' && item.nfrs ? this._richField('NFRs', item.nfrs) : ''}
        `;
    }

    _buildTraceabilityFields(item) {
        const base = this._basePath();
        const parts = [];

        if (item.type === 'ON') {
            parts.push(this._field('Strategic Documents', this._renderAnnotatedRefs(item.strategicDocuments)));
            parts.push(this._field('Refined By', this._renderEntityRefs(item.refinedBy, base, 'requirement')));
            parts.push(this._field('Implemented By (ORs)', this._renderEntityRefs(item.implementedByORs, base, 'requirement')));
            parts.push(this._field('Implemented By (OCs)', this._renderEntityRefs(item.implementedByOCs, base, 'change')));
        }

        if (item.type === 'OR') {
            parts.push(this._field('Refines (Parent)', this._renderEntityRefs(item.refinesParents, base, 'requirement')));
            parts.push(this._field('Refined By', this._renderEntityRefs(item.refinedBy, base, 'requirement')));
            parts.push(this._field('Implements (ONs)', this._renderEntityRefs(item.implementedONs, base, 'requirement')));
            parts.push(this._field('Implemented By (OCs)', this._renderEntityRefs(item.implementedByOCs, base, 'change')));
            parts.push(this._field('Decommissioned By (OCs)', this._renderEntityRefs(item.decommissionedByOCs, base, 'change')));
            parts.push(this._field('Required By (ORs)', this._renderEntityRefs(item.requiredByORs, base, 'requirement')));
        }

        return parts.join('');
    }

    _buildImpactFields(item) {
        return `
            ${this._field('Stakeholder Categories', this._renderAnnotatedRefs(item.impactedStakeholders))}
            ${this._field('Domains', this._renderAnnotatedRefs(item.impactedDomains))}
        `;
    }

    _buildPlanningFields(item) {
        const base = this._basePath();
        return `
            ${this._field('Maturity', item.maturity)}
            ${item.type === 'ON' && item.tentative ? this._field('Tentative', this._renderTentative(item.tentative)) : ''}
            ${item.type === 'OR' ? this._field('Dependencies', this._renderEntityRefs(item.dependencies, base, 'requirement')) : ''}
        `;
    }

    // -------------------------------------------------------------------------
    // Field renderers
    // -------------------------------------------------------------------------

    _field(label, value) {
        const display = (value === null || value === undefined || value === '') ? '—' : value;
        return `
            <div class="os-detail__field">
                <dt class="os-detail__field-label">${label}</dt>
                <dd class="os-detail__field-value">${display}</dd>
            </div>
        `;
    }

    _richField(label, value) {
        if (!value) return '';
        // Rich text is stored as Quill Delta JSON — render as preformatted plain text for now.
        // Full Delta rendering will be addressed in a future phase.
        let display;
        try {
            const delta = JSON.parse(value);
            display = this._esc(
                (delta.ops || []).map(op => (typeof op.insert === 'string' ? op.insert : '')).join('')
            );
        } catch {
            display = this._esc(value);
        }
        return `
            <div class="os-detail__field os-detail__field--rich">
                <dt class="os-detail__field-label">${label}</dt>
                <dd class="os-detail__field-value os-detail__field-value--rich">${display}</dd>
            </div>
        `;
    }

    /**
     * Render an array of OperationalEntityReference as navigable links.
     * @param {Array<{id, code, title, type}>} refs
     * @param {string} basePath  e.g. '/elaborate/os'
     * @param {'requirement'|'change'} entityType
     * @returns {string} HTML
     */
    _renderEntityRefs(refs, basePath, entityType) {
        if (!refs?.length) return '—';
        return refs.map(ref => {
            const label = `[${this._esc(ref.code ?? ref.id)}] ${this._esc(ref.title ?? '')}`;
            const path = `${basePath}/${entityType}/${ref.id}`;
            return `<a class="os-detail__ref-link" href="${path}" data-os-navigate="${path}">${label}</a>`;
        }).join('');
    }

    /**
     * Render an array of AnnotatedReference (no navigation — setup entities).
     * @param {Array<{id, title, note}>} refs
     * @returns {string} HTML
     */
    _renderAnnotatedRefs(refs) {
        if (!refs?.length) return '—';
        return refs.map(ref => {
            const title = this._esc(ref.title ?? ref.id ?? '');
            const note = ref.note ? `<span class="os-detail__ref-note"> — ${this._esc(ref.note)}</span>` : '';
            return `<div class="os-detail__annotated-ref">${title}${note}</div>`;
        }).join('');
    }

    _renderTentative(tentative) {
        if (!Array.isArray(tentative) || tentative.length < 2) return '—';
        const [start, end] = tentative;
        return start === end ? String(start) : `${start}–${end}`;
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