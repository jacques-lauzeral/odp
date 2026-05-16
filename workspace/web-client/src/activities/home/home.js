/**
 * @file home.js
 * @description Home activity for ODIP Space. Dataset context selection gateway.
 *
 * Responsibilities:
 * - Fetch and display the edition list (all types, no filter)
 * - Show the Live Dataset tile only when a user is identified
 * - On selection: set app dataset context and navigate to the appropriate workspace
 *
 * Dataset context shape stored on App:
 *   { type: 'live' }
 *   { type: 'edition', editionId: number }
 *
 * Navigation:
 *   Live Dataset selected → app.setDatasetContext({ type: 'live' })            → /elaborate
 *   Edition selected      → app.setDatasetContext({ type: 'edition', editionId }) → /explore
 */
import { apiClient } from '../../shared/api-client.js';
import { errorHandler } from '../../shared/error-handler.js';
import { endpoints } from '../../config/api.js';

export default class HomeActivity {
    /**
     * @param {import('../../app.js').App} app
     */
    constructor(app) {
        this.app = app;
        this.container = null;
        this.editions = [];
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container) {
        this.container = container;
        this.container.innerHTML = this._buildLoadingHtml();

        try {
            this.editions = await apiClient.listEntities(endpoints.odpEditions);
        } catch (error) {
            errorHandler.handle(error, 'home-editions-fetch');
            this.editions = [];
        }

        this.container.innerHTML = this._buildHtml();
        this._attachEventListeners();
    }

    cleanup() {
        this.container = null;
        this.editions = [];
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        // Live Dataset tile (only rendered when user is identified)
        const liveBtn = this.container.querySelector('.home__live-btn');
        if (liveBtn) {
            liveBtn.addEventListener('click', () => this._selectLive());
        }

        // Edition rows
        this.container.querySelectorAll('.home__edition-row').forEach(row => {
            row.addEventListener('click', () => {
                const editionId = Number(row.dataset.editionId);
                this._selectEdition(editionId);
            });
        });
    }

    // -------------------------------------------------------------------------
    // Selection handlers
    // -------------------------------------------------------------------------

    _selectLive() {
        this.app.setDatasetContext({ type: 'live' });
        this.app.navigate('/elaborate');
    }

    _selectEdition(editionId) {
        this.app.setDatasetContext({ type: 'edition', editionId });
        this.app.navigate('/explore');
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _buildLoadingHtml() {
        return `<div class="home"><div class="loading"><p>Loading…</p></div></div>`;
    }

    _buildHtml() {
        const user = this.app.getUser();

        return `
            <div class="home">
                <div class="home__content">

                    ${user ? this._buildLiveTile() : ''}

                    <section class="home__editions">
                        <h2 class="home__section-title">Editions</h2>
                        ${this._buildEditionList()}
                    </section>

                </div>
            </div>
        `;
    }

    _buildLiveTile() {
        return `
            <section class="home__live">
                <div class="home__live-tile">
                    <div class="home__live-info">
                        <h2 class="home__live-title">Live Dataset</h2>
                        <p class="home__live-desc">Working data — latest versions of all O*s.</p>
                    </div>
                    <button class="btn btn-primary home__live-btn">Elaborate</button>
                </div>
            </section>
        `;
    }

    _buildEditionList() {
        if (this.editions.length === 0) {
            return `<p class="home__empty">No editions available.</p>`;
        }

        const rows = this.editions
            .slice()
            .sort((a, b) => b.id - a.id)
            .map(edition => this._buildEditionRow(edition))
            .join('');

        return `
            <table class="home__edition-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Title</th>
                        <th>Start Date</th>
                        <th>Created by</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    _buildEditionRow(edition) {
        const date = edition.createdAt
            ? new Date(edition.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
            : '—';

        return `
            <tr class="home__edition-row" data-edition-id="${edition.id}" title="Explore edition ${edition.id}">
                <td class="home__edition-id">${edition.id}</td>
                <td class="home__edition-title">${this._esc(edition.title ?? '')}</td>
                <td>${this._esc(edition.startDate ?? '—')}</td>
                <td>${this._esc(edition.createdBy ?? '—')}</td>
                <td>${date}</td>
            </tr>
        `;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    /** Escape HTML special characters to prevent XSS. */
    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}