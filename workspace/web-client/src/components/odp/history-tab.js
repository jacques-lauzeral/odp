/**
 * history-tab.js
 * Standalone HistoryTab component for versioned entities (OR, OC)
 *
 * Responsibilities:
 * - Lazy-load version history from API on first tab activation
 * - Render a tabular version list with createdAt, createdBy
 * - Support "Diff vs previous" per-row button and checkbox multi-select + "Diff selected" button
 * - Open a stub diff popup (implementation deferred)
 *
 * Usage:
 *   const historyTab = new HistoryTab(apiClient);
 *   // On tab activation (called once per modal open):
 *   historyTab.attach(containerElement, 'operational-requirements', itemId);
 */

export class HistoryTab {
    /**
     * @param {object} apiClient - The shared apiClient instance
     */
    constructor(apiClient) {
        this.apiClient = apiClient;

        // State
        this._container = null;
        this._entityType = null;
        this._itemId = null;
        this._versions = [];      // [{version, versionId, createdAt, createdBy}, ...]
        this._loaded = false;
        this._loading = false;

        // Bound handlers stored for cleanup
        this._onDiffClick = this._onDiffClick.bind(this);
        this._onCheckboxChange = this._onCheckboxChange.bind(this);
        this._onDiffSelectedClick = this._onDiffSelectedClick.bind(this);
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    /**
     * Attach to a DOM container and trigger first load.
     * Safe to call multiple times (idempotent after first load).
     *
     * @param {HTMLElement} container
     * @param {string} entityType  e.g. 'operational-requirements' | 'operational-changes'
     * @param {string|number} itemId
     */
    async attach(container, entityType, itemId) {
        this._container = container;
        this._entityType = entityType;
        this._itemId = itemId;

        if (this._loaded) {
            // Data already available (preloaded) — render immediately
            this._render();
            return;
        }

        if (this._loading) {
            // Preload in progress — poll until done then render
            const wait = () => new Promise(resolve => setTimeout(resolve, 50));
            while (this._loading) await wait();
            this._render();
            return;
        }

        await this._load();
    }

    /**
     * Reset state – call when the parent modal is closed so the next
     * open triggers a fresh fetch.
     */
    /**
     * Preload version history as soon as the item is known — before tab activation.
     * attach() will reuse the cached result and render immediately.
     *
     * @param {string} entityType
     * @param {string|number} itemId
     */
    preload(entityType, itemId) {
        if (!itemId) return;
        if (this._loading || this._loaded) return;

        this._entityType = entityType;
        this._itemId = itemId;
        // Fire-and-forget — result cached in this._versions / this._loaded
        this._load();
    }

    reset() {
        this._container = null;
        this._entityType = null;
        this._itemId = null;
        this._versions = [];
        this._loaded = false;
        this._loading = false;
    }

    // ─────────────────────────────────────────────────────────────
    // DATA LOADING
    // ─────────────────────────────────────────────────────────────

    async _load() {
        if (this._loading) return;
        this._loading = true;

        this._renderLoading();

        try {
            // GET /{entityType}/{id}/versions  → array of VersionHistory
            const versions = await this.apiClient.get(
                `/${this._entityType}/${this._itemId}/versions`
            );

            // API returns newest-first; we keep that order (v_latest at top)
            this._versions = Array.isArray(versions) ? versions : [];
            this._loaded = true;
            this._render();
        } catch (err) {
            console.error('HistoryTab: failed to load versions', err);
            this._renderError(err);
        } finally {
            this._loading = false;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RENDERING
    // ─────────────────────────────────────────────────────────────

    _renderLoading() {
        if (!this._container) return;
        this._container.innerHTML = `
            <div class="history-tab-loading">
                <span class="loading-spinner"></span>
                Loading version history…
            </div>
        `;
    }

    _renderError(err) {
        if (!this._container) return;
        this._container.innerHTML = `
            <div class="history-tab-error alert alert-error">
                <strong>Error loading history:</strong>
                ${this._escape(err?.message || 'Unknown error')}
            </div>
        `;
    }

    _render() {
        if (!this._container) return;

        const versions = this._versions;

        if (versions.length === 0) {
            this._container.innerHTML = `
                <div class="history-tab-empty">No version history available.</div>
            `;
            return;
        }

        // Build table rows (newest first = index 0)
        const rows = versions.map((v, idx) => {
            const isFirst = idx === versions.length - 1; // oldest = cannot diff vs previous
            const prevDisabled = isFirst ? 'disabled title="No previous version"' : '';
            const versionLabel = v.version !== undefined ? `v${v.version}` : `#${idx + 1}`;

            return `
                <tr data-version="${this._escape(String(v.version))}">
                    <td class="history-col-check">
                        <input
                            type="checkbox"
                            class="history-version-checkbox"
                            data-version="${this._escape(String(v.version))}"
                            aria-label="Select version ${this._escape(versionLabel)}"
                        >
                    </td>
                    <td class="history-col-version">${this._escape(versionLabel)}</td>
                    <td class="history-col-date">${this._formatDate(v.createdAt)}</td>
                    <td class="history-col-author">${this._escape(v.createdBy || '—')}</td>
                    <td class="history-col-actions">
                        <button
                            type="button"
                            class="btn btn-xs btn-secondary history-diff-prev-btn"
                            data-version="${this._escape(String(v.version))}"
                            ${prevDisabled}
                        >
                            Diff vs previous
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        this._container.innerHTML = `
            <div class="history-tab">
                <div class="history-tab-toolbar">
                    <button
                        type="button"
                        class="btn btn-secondary btn-sm history-diff-selected-btn"
                        id="history-diff-selected-btn"
                        disabled
                        title="Select exactly 2 versions to compare"
                    >
                        Diff selected
                    </button>
                    <span class="history-tab-hint">Select 2 versions to compare, or use "Diff vs previous" on any row.</span>
                </div>
                <div class="history-table-wrapper">
                    <table class="history-table">
                        <thead>
                            <tr>
                                <th class="history-col-check"></th>
                                <th class="history-col-version">Version</th>
                                <th class="history-col-date">Created</th>
                                <th class="history-col-author">By</th>
                                <th class="history-col-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this._attachEvents();
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT HANDLING
    // ─────────────────────────────────────────────────────────────

    _attachEvents() {
        if (!this._container) return;

        // Per-row "Diff vs previous" buttons
        this._container.querySelectorAll('.history-diff-prev-btn').forEach(btn => {
            btn.addEventListener('click', this._onDiffClick);
        });

        // Checkboxes for multi-select diff
        this._container.querySelectorAll('.history-version-checkbox').forEach(cb => {
            cb.addEventListener('change', this._onCheckboxChange);
        });

        // "Diff selected" toolbar button
        const diffSelectedBtn = this._container.querySelector('#history-diff-selected-btn');
        if (diffSelectedBtn) {
            diffSelectedBtn.addEventListener('click', this._onDiffSelectedClick);
        }
    }

    _onDiffClick(e) {
        const btn = e.currentTarget;
        const versionNum = parseInt(btn.dataset.version, 10);
        const prevVersion = versionNum - 1; // sequential versioning guaranteed by backend

        this._showDiffPopup(versionNum, prevVersion);
    }

    _onCheckboxChange() {
        const checked = this._getCheckedVersions();
        const diffSelectedBtn = this._container?.querySelector('#history-diff-selected-btn');
        if (diffSelectedBtn) {
            const canDiff = checked.length === 2;
            diffSelectedBtn.disabled = !canDiff;
            diffSelectedBtn.title = canDiff
                ? `Compare v${checked[0]} with v${checked[1]}`
                : 'Select exactly 2 versions to compare';
        }
    }

    _onDiffSelectedClick() {
        const checked = this._getCheckedVersions();
        if (checked.length !== 2) return;

        // Ensure higher version is "versionA" (left/newer side)
        const [vA, vB] = checked[0] > checked[1]
            ? [checked[0], checked[1]]
            : [checked[1], checked[0]];

        this._showDiffPopup(vA, vB);
    }

    _getCheckedVersions() {
        if (!this._container) return [];
        return Array.from(
            this._container.querySelectorAll('.history-version-checkbox:checked')
        ).map(cb => parseInt(cb.dataset.version, 10));
    }

    // ─────────────────────────────────────────────────────────────
    // DIFF POPUP (STUB)
    // ─────────────────────────────────────────────────────────────

    /**
     * Show a diff popup between two versions.
     * Currently a stub – diff content will be implemented in a future phase.
     *
     * @param {number} versionA - Newer version (left side)
     * @param {number} versionB - Older version (right side)
     */
    _showDiffPopup(versionA, versionB) {
        console.log(`HistoryTab: opening diff popup v${versionB} → v${versionA}`);

        // Remove any existing diff popup
        document.getElementById('history-diff-popup')?.remove();

        const popupId = 'history-diff-popup';
        const zIndex = 2000; // above main modal (1000) and nested modals

        const popupHtml = `
            <div class="modal-overlay history-diff-overlay" id="${popupId}" style="z-index: ${zIndex}">
                <div class="modal modal-large history-diff-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            Version Diff — v${versionB} → v${versionA}
                        </h3>
                        <button class="modal-close" id="history-diff-close">&times;</button>
                    </div>
                    <div class="modal-body history-diff-body">
                        <div class="history-diff-stub">
                            <div class="history-diff-stub-icon">⏳</div>
                            <p>
                                Diff between <strong>v${versionB}</strong> and
                                <strong>v${versionA}</strong> will be shown here.
                            </p>
                            <p class="history-diff-stub-note">
                                Diff implementation is planned for a future phase.
                            </p>
                            <div class="history-diff-stub-meta">
                                <span>Comparing: <code>${this._escape(this._entityType)}/${this._escape(String(this._itemId))}</code></span>
                                <span>v${versionB} ← → v${versionA}</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" id="history-diff-close-btn">Close</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', popupHtml);

        const popup = document.getElementById(popupId);

        // Close handlers
        const close = () => popup.remove();
        popup.querySelector('#history-diff-close').addEventListener('click', close);
        popup.querySelector('#history-diff-close-btn').addEventListener('click', close);

        // Close on overlay click (outside modal box)
        popup.addEventListener('click', (e) => {
            if (e.target === popup) close();
        });

        // Close on Escape
        const onEsc = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────

    _escape(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _formatDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    }
}