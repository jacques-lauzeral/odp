/**
 * @file editions.js
 * @description Editions sub-activity. Lists ODIP editions; creates new ones;
 * shows edition detail with Explore and Export actions.
 *
 * Layout mirrors the OS workspace:
 *   Top toolbar  — (empty left) + "+ Edition" create button right
 *   MasterDetail — left: edition cards / right: os-detail shell (toolbar + body)
 *
 * Detail toolbar (os-detail__toolbar):
 *   title (flex:1)  |  Explore  Export
 *
 * Export triggers a modal dialog — format checkboxes + Run button.
 */
import MasterDetail    from '../../../components/master-detail.js';
import ODPEditionForm  from './odp-edition-form.js';
import { apiClient }   from '../../../shared/api-client.js';
import { errorHandler } from '../../../shared/error-handler.js';
import { dom }         from '../../../shared/utils.js';

export default class EditionsActivity {

    /** @param {import('../../../app.js').App} app */
    constructor(app) {
        this.app           = app;
        this.container     = null;
        this._masterDetail = null;
        this._editions     = [];
        this._baselines    = [];
        this._selectedId   = null;
        this._form         = null;   // ODPEditionForm — lazy
        this._exporting    = false;  // guard against double-submit
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;
        this._renderShell();
        await this._load();
    }

    async handleSubPath(subPath) {}

    async cleanup() {
        this._masterDetail?.cleanup();
        this._masterDetail = null;
        this.container     = null;
        this._selectedId   = null;
    }

    // -------------------------------------------------------------------------
    // Shell — mirrors OS toolbar + MasterDetail structure
    // -------------------------------------------------------------------------

    _renderShell() {
        this.container.innerHTML = `
            <div class="editions-activity">
                <div class="os-toolbar editions-toolbar">
                    <div class="os-toolbar__filters"></div>
                    <div class="os-toolbar__create">
                        <button class="odip-btn odip-btn--create" id="editions-create-btn">+ Edition</button>
                    </div>
                </div>
                <div class="editions-master-detail" id="editions-md-mount"></div>
            </div>
        `;

        this._masterDetail = new MasterDetail(
            dom.find('#editions-md-mount', this.container),
            { initialRatio: 0.30 }
        );
        this._masterDetail.render();

        dom.find('#editions-create-btn', this.container)
            .addEventListener('click', () => this._handleCreate());
    }

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    async _load() {
        this._renderListLoading();
        try {
            [this._editions, this._baselines] = await Promise.all([
                apiClient.get('/odp-editions'),
                apiClient.get('/baselines'),
            ]);
            this._renderList();
            if (this._selectedId) this._selectById(this._selectedId);
        } catch (err) {
            errorHandler.handle(err, 'editions-load');
        }
    }

    // -------------------------------------------------------------------------
    // Left panel — edition list
    // -------------------------------------------------------------------------

    _renderListLoading() {
        this._masterDetail.listContainer.innerHTML =
            '<div class="editions-list-loading">Loading…</div>';
    }

    _renderList() {
        const list = this._masterDetail.listContainer;
        if (!this._editions.length) {
            list.innerHTML = '<div class="editions-empty"><p>No editions yet.</p></div>';
            return;
        }
        list.innerHTML = this._editions.map(e => this._editionCardHtml(e)).join('');
        list.querySelectorAll('.edition-card').forEach(card => {
            card.addEventListener('click', () => this._selectById(card.dataset.id));
        });
    }

    _editionCardHtml(edition) {
        const active    = String(edition.id) === String(this._selectedId) ? 'edition-card--selected' : '';
        const typeClass = edition.type === 'OFFICIAL' ? 'edition-badge--official' : 'edition-badge--draft';
        const date      = edition.createdAt ? new Date(edition.createdAt).toLocaleDateString() : '—';
        return `
            <div class="edition-card ${active}" data-id="${edition.id}">
                <div class="edition-card__header">
                    <span class="edition-card__title">${_esc(edition.title)}</span>
                    <span class="edition-badge ${typeClass}">${edition.type}</span>
                </div>
                <div class="edition-card__meta">${date}</div>
            </div>`;
    }

    _selectById(id) {
        this._selectedId = id;
        this._masterDetail.listContainer.querySelectorAll('.edition-card').forEach(c => {
            c.classList.toggle('edition-card--selected', String(c.dataset.id) === String(id));
        });
        const edition = this._editions.find(e => String(e.id) === String(id));
        if (edition) this._renderDetail(edition);
    }

    // -------------------------------------------------------------------------
    // Right panel — detail (os-detail shell pattern)
    // -------------------------------------------------------------------------

    _renderDetail(edition) {
        const typeClass   = edition.type === 'OFFICIAL' ? 'edition-badge--official' : 'edition-badge--draft';
        const baseline    = edition.baseline?.title ?? '—';
        const startDate   = edition.startDate    ?? '—';
        const minMaturity = edition.minONMaturity ?? '—';
        const date        = edition.createdAt ? new Date(edition.createdAt).toLocaleString() : '—';

        this._masterDetail.setDetail(`
            <div class="os-detail edition-detail">
                <div class="os-detail__toolbar">
                    <span class="os-detail__title">${_esc(edition.title)}</span>
                    <div class="os-detail__actions">
                        <button class="odip-btn edition-detail__explore" id="ed-explore-btn">Explore</button>
                        <button class="odip-btn edition-detail__export"  id="ed-export-btn">Export</button>
                    </div>
                </div>
                <div class="os-detail__body edition-detail__body">
                    <dl class="edition-detail__dl">
                        <dt>Created</dt>        <dd>${date}</dd>
                        <dt>Created by</dt>     <dd>${_esc(edition.createdBy ?? '—')}</dd>
                        <dt>Type</dt>           <dd><span class="edition-badge ${typeClass}">${edition.type}</span></dd>
                        <dt>Baseline</dt>       <dd>${_esc(baseline)}</dd>
                        <dt>Start date</dt>     <dd>${_esc(startDate)}</dd>
                        <dt>Min ON maturity</dt><dd>${_esc(minMaturity)}</dd>
                    </dl>
                </div>
            </div>
        `);

        const dc = this._masterDetail.detailContainer;
        dc.querySelector('#ed-explore-btn')
            ?.addEventListener('click', () => this._handleExplore(edition));
        dc.querySelector('#ed-export-btn')
            ?.addEventListener('click', () => this._handleExportModal(edition));
    }

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    _handleExplore(edition) {
        this.app.navigate(`/explore/${edition.id}`);
    }

    _handleExportModal(edition) {
        // Remove any existing modal
        document.querySelector('.edition-export-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay edition-export-overlay';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">Export — ${_esc(edition.title)}</h3>
                </div>
                <div class="modal-body">
                    <p class="edition-export-modal__hint">Select one or more formats:</p>
                    <div class="edition-export-modal__formats">
                        <label class="edition-export-modal__format">
                            <input type="checkbox" name="fmt" value="pdf"> PDF
                        </label>
                        <label class="edition-export-modal__format">
                            <input type="checkbox" name="fmt" value="word"> Word
                        </label>
                        <label class="edition-export-modal__format">
                            <input type="checkbox" name="fmt" value="website"> Website
                        </label>
                    </div>
                    <div class="edition-export-modal__results" id="exportResults"></div>
                </div>
                <div class="modal-footer">
                    <button class="odip-btn odip-btn--standard" id="exportCancelBtn">Cancel</button>
                    <button class="odip-btn odip-btn--primary odip-btn--standard" id="exportRunBtn">Run</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#exportCancelBtn')
            .addEventListener('click', () => overlay.remove());

        overlay.querySelector('#exportRunBtn')
            .addEventListener('click', () => this._runExport(edition, overlay));
    }

    async _runExport(edition, overlay) {
        if (this._exporting) return;

        const checked = [...overlay.querySelectorAll('input[name="fmt"]:checked')]
            .map(cb => cb.value);

        if (!checked.length) return;

        this._exporting = true;
        const runBtn    = overlay.querySelector('#exportRunBtn');
        const cancelBtn = overlay.querySelector('#exportCancelBtn');
        const results   = overlay.querySelector('#exportResults');

        runBtn.disabled    = true;
        runBtn.textContent = 'Running…';
        cancelBtn.disabled = true;
        results.innerHTML  = '';

        // Build combined options object
        const options = {};
        if (checked.includes('pdf'))     options.pdfFlat  = {};
        if (checked.includes('word'))    options.wordFlat = {};
        if (checked.includes('website')) options.website  = true;

        try {
            const result = await apiClient.publishEdition(edition.id, options);

            const lines = checked.map(fmt => {
                const url = _resultUrl(result, fmt, apiClient.baseUrl);
                const label = { pdf: 'PDF', word: 'Word', website: 'Website' }[fmt];
                return url
                    ? `<div class="edition-export-modal__result edition-export-modal__result--ok">
                           ✓ ${label} — <a href="${url}" target="_blank">Open</a>
                       </div>`
                    : `<div class="edition-export-modal__result edition-export-modal__result--ok">
                           ✓ ${label}
                       </div>`;
            });
            results.innerHTML = lines.join('');
        } catch (err) {
            const msg = err.status === 409
                ? 'Export already in progress — please retry later'
                : `Export failed: ${_esc(err.message)}`;
            results.innerHTML =
                `<div class="edition-export-modal__result edition-export-modal__result--error">${msg}</div>`;
        } finally {
            this._exporting    = false;
            runBtn.disabled    = false;
            runBtn.textContent = 'Run';
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Close';
        }
    }

    async _handleCreate() {
        if (!this._form) {
            const entityConfig = { endpoint: '/odp-editions', name: 'ODIP Editions' };
            this._form = new ODPEditionForm(entityConfig, { baselines: this._baselines });
            document.addEventListener('entitySaved', async () => { await this._load(); });
        } else {
            this._form.supportData = { baselines: this._baselines };
        }
        await this._form.showCreateModal();
    }
}

// -------------------------------------------------------------------------
// Module-private helpers
// -------------------------------------------------------------------------

function _esc(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _resultUrl(result, format, baseUrl) {
    switch (format) {
        case 'pdf':     return result.pdfFlatUrl  ? `${baseUrl}${result.pdfFlatUrl}`  : null;
        case 'word':    return result.wordFlatUrl ? `${baseUrl}${result.wordFlatUrl}` : null;
        case 'website': return result.siteUrl     ? `${baseUrl}${result.siteUrl}`     : null;
        default:        return null;
    }
}
