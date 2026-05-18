import { DiffPopup } from './diff-popup.js';

/**
 * history-tab.js
 * Standalone HistoryTab component for versioned entities (OR, OC)
 *
 * Responsibilities:
 * - Lazy-load version history from API on first tab activation
 * - Render a list of version rows with createdAt, createdBy
 * - Per-row: Diff button (always) + Restore button (hidden on latest version)
 * - Diff: confirmation popup with version selector pre-set to previous version
 * - Restore: confirmation dialog warning that current version will be overridden
 * - Confirmed actions fire onDiff / onRestore callbacks (stub: console.log)
 *
 * Usage:
 *   const historyTab = new HistoryTab(apiClient, {
 *       onDiff: (versionId, compareVersionId) => { ... },
 *       onRestore: (versionId, versionNumber) => { ... },
 *       onViewVersion: (versionId, versionNumber) => { ... }
 *   });
 *   // On tab activation:
 *   historyTab.attach(containerElement, 'operational-requirements', itemId);
 */

export class HistoryTab {
    /**
     * @param {object} apiClient        - The shared apiClient instance
     * @param {object} [callbacks]
     * @param {Function} [callbacks.onDiff]    - (versionId, compareVersionId) => void
     * @param {Function} [callbacks.onRestore]     - (versionId, versionNumber) => void
     * @param {Function} [callbacks.onViewVersion] - (versionId, versionNumber) => void
     */
    constructor(apiClient, callbacks = {}) {
        this.apiClient = apiClient;

        this._diffPopup = new DiffPopup(apiClient);

        // onDiff(versionNumber) — DiffPopup receives the full versions array
        // and picks the default comparison target (previous version) itself.
        this.onDiff = callbacks.onDiff || ((versionNumber) => {
            this._diffPopup.open(this._entityType, this._itemId, versionNumber, this._versions);
        });
        this.onRestore     = callbacks.onRestore     || ((versionId, versionNumber) => console.log(`[HistoryTab] Restore: versionId=${versionId} versionNumber=${versionNumber}`));
        this.onViewVersion = callbacks.onViewVersion || null;
        this.readOnly      = callbacks.readOnly      || false;

        // State
        this._container  = null;
        this._entityType = null;
        this._itemId     = null;
        this._versions   = [];   // [{ id, versionNumber, createdAt, createdBy }, ...] newest-first
        this._loaded     = false;
        this._loading    = false;
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────

    /**
     * Attach to a DOM container and trigger first load.
     * Safe to call multiple times (idempotent after first load).
     *
     * @param {HTMLElement}    container
     * @param {string}         entityType  e.g. 'operational-requirements'
     * @param {string|number}  itemId
     */
    async attach(container, entityType, itemId) {
        this._container  = container;
        this._entityType = entityType;
        this._itemId     = itemId;

        if (this._loaded) {
            this._render();
            return;
        }

        if (this._loading) {
            // _load() is already in flight — it will call _render() when done
            // since _container is now set, the render will go to the right place
            return;
        }

        await this._load();
    }

    /**
     * Preload version history before tab activation so attach() renders immediately.
     *
     * @param {string}         entityType
     * @param {string|number}  itemId
     */
    preload(entityType, itemId) {
        if (!itemId) return;
        if (this._loading || this._loaded) return;

        this._entityType = entityType;
        this._itemId     = itemId;
        this._load(); // fire-and-forget
    }

    /**
     * Reset state — call when the parent modal closes so the next open triggers a fresh fetch.
     */
    reset() {
        this._container  = null;
        this._entityType = null;
        this._itemId     = null;
        this._versions   = [];
        this._loaded     = false;
        this._loading    = false;
    }

    // ─────────────────────────────────────────────────────────────
    // DATA LOADING
    // ─────────────────────────────────────────────────────────────

    async _load() {
        this._loading = true;

        if (this._container) this._renderLoading();

        try {
            const versions = await this.apiClient.get(
                `/${this._entityType}/${this._itemId}/versions`
            );
            this._versions = Array.isArray(versions) ? versions : [];
            this._loaded   = true;
            if (this._container) this._render();
        } catch (err) {
            console.error('HistoryTab: failed to load versions', err);
            if (this._container) this._renderError(err);
        } finally {
            this._loading = false;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RENDERING
    // ─────────────────────────────────────────────────────────────

    _renderLoading() {
        this._container.innerHTML = `
            <div class="history-tab-loading">
                <span class="loading-spinner"></span>
                Loading version history…
            </div>
        `;
    }

    _renderError(err) {
        this._container.innerHTML = `
            <div class="history-tab-error alert alert-error">
                <strong>Error loading history:</strong>
                ${this._escape(err?.message || 'Unknown error')}
            </div>
        `;
    }

    _render() {
        const versions = this._versions;

        if (versions.length === 0) {
            this._container.innerHTML = `
                <div class="history-tab-empty">No version history available.</div>
            `;
            return;
        }

        // versions[0] = latest (newest-first from API)
        const rows = versions.map((v, idx) => {
            const isLatest  = idx === 0;
            const isOldest  = idx === versions.length - 1;
            const versionLabel = `v${v.version}`;

            return `
                <div class="history-row${isLatest ? ' history-row--latest' : ''}" data-version-id="${this._escape(String(v.id))}">
                    <div class="history-row-meta">
                        ${this.onViewVersion ? `
                        <button
                            type="button"
                            class="history-version-badge history-version-badge--link"
                            data-version-id="${this._escape(String(v.id))}"
                            data-version-number="${this._escape(String(v.version))}"
                            title="View v${this._escape(String(v.version))}"
                        >${this._escape(versionLabel)}</button>
                        ` : `<span class="history-version-badge history-version-badge--static">${this._escape(versionLabel)}</span>`}
                        ${isLatest ? '<span class="history-latest-badge">Latest</span>' : ''}
                        <span class="history-row-date">${this._formatDate(v.createdAt)}</span>
                        <span class="history-row-author">${this._escape(v.createdBy || '—')}</span>
                    </div>
                    <div class="history-row-actions">
                        ${!isOldest ? `
                        <button
                            type="button"
                            class="btn btn-sm btn-secondary history-btn-diff"
                            data-version-id="${this._escape(String(v.id))}"
                            data-version-number="${this._escape(String(v.version))}"
                        >
                            Diff
                        </button>
                        ` : ''}
                        ${(!isLatest && !this.readOnly) ? `
                        <button
                            type="button"
                            class="btn btn-sm btn-warning history-btn-restore"
                            data-version-id="${this._escape(String(v.id))}"
                            data-version-number="${this._escape(String(v.version))}"
                        >
                            Restore
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        this._container.innerHTML = `
            <div class="history-tab">
                <div class="history-list">
                    <div class="history-row history-row--header">
                        <div class="history-row-meta">
                            <span class="history-col-title history-col-version">Version</span>
                            <span class="history-col-title history-col-date">Created</span>
                            <span class="history-col-title history-col-author">By</span>
                        </div>
                        <div class="history-row-actions">
                            <span class="history-col-title">Actions</span>
                        </div>
                    </div>
                    ${rows}
                </div>
            </div>
        `;

        this._attachEvents();
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT HANDLING
    // ─────────────────────────────────────────────────────────────

    _attachEvents() {
        this._container.addEventListener('click', (e) => {
            const diffBtn    = e.target.closest('.history-btn-diff');
            const restoreBtn = e.target.closest('.history-btn-restore');
            const versionBtn = e.target.closest('.history-version-badge--link');

            if (diffBtn) {
                this._showDiffConfirm(
                    diffBtn.dataset.versionId,
                    diffBtn.dataset.versionNumber
                );
            } else if (restoreBtn) {
                this._showRestoreConfirm(
                    restoreBtn.dataset.versionId,
                    restoreBtn.dataset.versionNumber
                );
            } else if (versionBtn && this.onViewVersion) {
                this.onViewVersion(
                    versionBtn.dataset.versionId,
                    versionBtn.dataset.versionNumber
                );
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // DIFF — direct launch, no intermediate confirm popup
    // ─────────────────────────────────────────────────────────────

    /**
     * Launch the diff directly. The DiffPopup handles version selection internally.
     *
     * @param {string} versionId      - Node ID of the version (unused here, kept for symmetry)
     * @param {string} versionNumber  - Version number of the row clicked
     */
    _showDiffConfirm(versionId, versionNumber) {
        this.onDiff(Number(versionNumber));
    }

    // ─────────────────────────────────────────────────────────────
    // RESTORE CONFIRMATION POPUP
    // ─────────────────────────────────────────────────────────────

    /**
     * Show the restore confirmation dialog.
     *
     * @param {string} versionId      - ID of the version to restore
     * @param {string} versionNumber  - Display version number
     */
    _showRestoreConfirm(versionId, versionNumber) {
        this._removePopup('history-restore-confirm-popup');

        const latestVersion = this._versions[0];

        const popupHtml = `
            <div class="history-popup-overlay" id="history-restore-confirm-popup">
                <div class="history-popup history-popup--narrow">
                    <div class="history-popup-header">
                        <h3 class="history-popup-title">Restore <span class="history-version-badge">v${this._escape(versionNumber)}</span>?</h3>
                        <button type="button" class="history-popup-close" data-action="cancel">&times;</button>
                    </div>
                    <div class="history-popup-body">
                        <div class="history-restore-warning">
                            <span class="history-restore-warning-icon">⚠️</span>
                            <p>
                                The form will be populated with the content of
                                <strong>v${this._escape(versionNumber)}</strong>,
                                replacing the current content
                                ${latestVersion ? `(<strong>v${this._escape(String(latestVersion.version))}</strong>)` : ''}.
                            </p>
                            <p>
                                The restore will only be finalised when you <strong>save</strong> the form.
                                You can review and adjust the restored content before saving.
                            </p>
                        </div>
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Cancel</button>
                        <button
                            type="button"
                            class="btn btn-danger btn-sm history-btn-confirm-restore"
                            data-version-id="${this._escape(versionId)}"
                            data-version-number="${this._escape(versionNumber)}"
                        >
                            Restore v${this._escape(versionNumber)}
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', popupHtml);
        const popup = document.getElementById('history-restore-confirm-popup');

        // Confirm
        popup.querySelector('.history-btn-confirm-restore')?.addEventListener('click', () => {
            console.log(`[HistoryTab] Restore confirmed: v${versionNumber} (id=${versionId})`);
            this.onRestore(versionId, versionNumber);
            this._removePopup('history-restore-confirm-popup');
        });

        // Cancel / overlay
        this._bindPopupClose(popup, 'history-restore-confirm-popup');
    }

    // ─────────────────────────────────────────────────────────────
    // POPUP HELPERS
    // ─────────────────────────────────────────────────────────────

    _bindPopupClose(popup, popupId) {
        // Cancel buttons and × button
        popup.querySelectorAll('[data-action="cancel"]').forEach(btn => {
            btn.addEventListener('click', () => this._removePopup(popupId));
        });

        // Click on overlay backdrop
        popup.addEventListener('click', (e) => {
            if (e.target === popup) this._removePopup(popupId);
        });

        // Escape key
        const onEsc = (e) => {
            if (e.key === 'Escape') {
                this._removePopup(popupId);
                document.removeEventListener('keydown', onEsc);
            }
        };
        document.addEventListener('keydown', onEsc);
    }

    _removePopup(popupId) {
        document.getElementById(popupId)?.remove();
    }

    // ─────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────

    _escape(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
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