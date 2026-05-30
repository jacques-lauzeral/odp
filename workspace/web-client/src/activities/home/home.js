/**
 * @file home.js
 * @description Home activity for ODIP Space. Dataset context selection gateway.
 *
 * Responsibilities:
 * - Fetch and display the edition list (all types, no filter)
 * - Always show the Live Dataset row; disabled (non-clickable) when no user is identified
 * - On selection: navigate to the appropriate workspace
 *
 * Dataset context shape stored on App:
 *   { type: 'live' }
 *   { type: 'edition', editionId: number }
 *
 * Navigation:
 *   Live Dataset selected → app.setDatasetContext({ type: 'live' }) → /elaborate
 *   Edition selected      → /explore/{editionId}  (ExploreActivity sets context on mount)
 *
 * Re-render triggers:
 *   - Initial mount (render)
 *   - User change (App calls onUserChange) — Live Dataset row appears/disappears
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

    /**
     * Called by App after setUser(). Re-renders in place using cached edition data
     * so the Live Dataset row appears or disappears without a network round-trip.
     */
    onUserChange() {
        if (!this.container) return;
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
        // Live Dataset row — only interactive when user is identified
        const liveRow = dom.find('.home__live-row', this.container);
        if (liveRow && !liveRow.classList.contains('home__live-row--disabled')) {
            liveRow.addEventListener('click', () => this._selectLive());
        }

        // Edition rows
        dom.findAll('.home__edition-row', this.container).forEach(row => {
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
        this.app.navigate(`/explore/${editionId}`);
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _buildLoadingHtml() {
        return `<div class="home"><div class="home__loading">Loading…</div></div>`;
    }

    _buildHtml() {
        const user = this.app.getUser();

        return `
            <div class="home">
                <div class="home__list">
                    ${this._buildLiveRow(!!user)}
                    ${this._buildEditionRows()}
                </div>
            </div>
        `;
    }

    /**
     * @param {boolean} enabled — true when a user is identified
     */
    _buildLiveRow(enabled) {
        const disabledClass = enabled ? '' : ' home__live-row--disabled';
        const tabindex = enabled ? '0' : '-1';
        return `
            <div class="home__live-row home__row${disabledClass}" role="button" tabindex="${tabindex}">
                <div class="home__row-left">
                    <span class="home__row-title">ODIP Dataset</span>
                    <span class="home__row-meta">${enabled ? 'Live — continuously evolving' : 'Sign in to access the live dataset'}</span>
                </div>
                <span class="home__row-chevron">›</span>
            </div>
        `;
    }

    _buildEditionRows() {
        if (this.editions.length === 0) {
            return `<p class="home__empty">No editions available.</p>`;
        }

        const sorted = this.editions
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Group by createdAt year, preserving sort order
        const byYear = new Map();
        for (const edition of sorted) {
            const year = edition.createdAt
                ? new Date(edition.createdAt).getFullYear()
                : 'Unknown';
            if (!byYear.has(year)) byYear.set(year, []);
            byYear.get(year).push(edition);
        }

        return [...byYear.entries()]
            .map(([year, editions]) => `
                <div class="home__year-group">
                    <div class="home__year-label">${year}</div>
                    ${editions.map(e => this._buildEditionRow(e)).join('')}
                </div>
            `)
            .join('');
    }

    /**
     * @param {object} edition
     * @param {string} edition.id
     * @param {string} edition.title
     * @param {string} edition.type  — 'DRAFT' | 'OFFICIAL'
     * @param {string} edition.createdAt
     * @returns {string}
     */
    _buildEditionRow(edition) {
        const date = edition.createdAt
            ? new Date(edition.createdAt).toLocaleDateString('en-GB', {
                year: 'numeric', month: 'short', day: 'numeric'
            })
            : '—';

        const badge = edition.type === 'OFFICIAL'
            ? `<span class="home__badge home__badge--official">Official</span>`
            : `<span class="home__badge home__badge--draft">Draft</span>`;

        return `
            <div class="home__edition-row home__row" data-edition-id="${edition.id}" role="button" tabindex="0">
                <div class="home__row-left">
                    <span class="home__row-title">${this._esc(edition.title ?? '')}</span>
                    <span class="home__row-meta">${date}</span>
                </div>
                <div class="home__row-right">
                    ${badge}
                    <span class="home__row-chevron">›</span>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    /** @param {string} str */
    _esc(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// ---------------------------------------------------------------------------
// Local dom helper (mirrors shared/utils.js pattern for self-contained use)
// ---------------------------------------------------------------------------
const dom = {
    find: (sel, ctx = document) => ctx.querySelector(sel),
    findAll: (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel)),
};