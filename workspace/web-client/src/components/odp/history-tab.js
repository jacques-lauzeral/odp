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
 *       onRestore: (versionId) => { ... }
 *   });
 *   // On tab activation:
 *   historyTab.attach(containerElement, 'operational-requirements', itemId);
 */

export class HistoryTab {
    /**
     * @param {object} apiClient        - The shared apiClient instance
     * @param {object} [callbacks]
     * @param {Function} [callbacks.onDiff]    - (versionId, compareVersionId) => void
     * @param {Function} [callbacks.onRestore] - (versionId) => void
     */
    constructor(apiClient, callbacks = {}) {
        this.apiClient = apiClient;

        this._diffPopup = new DiffPopup(apiClient);

        this.onDiff    = callbacks.onDiff    || ((vA, vB) => {
            this._diffPopup.open(this._entityType, this._itemId, vA, vB);
        });
        this.onRestore = callbacks.onRestore || ((vId) => console.log(`[HistoryTab] Restore: version=${vId}`));
        this.readOnly  = callbacks.readOnly  || false;

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
                        <span class="history-version-badge">${this._escape(versionLabel)}</span>
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
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // DIFF CONFIRMATION POPUP
    // ─────────────────────────────────────────────────────────────

    /**
     * Show the diff confirmation popup.
     * Pre-selects the previous version as the comparison target.
     *
     * @param {string} versionId      - ID of the version to diff
     * @param {string} versionNumber  - Display version number
     */
    _showDiffConfirm(versionId, versionNumber) {
        this._removePopup('history-diff-confirm-popup');

        const versions  = this._versions;

        // Find target index by versionNumber
        const targetIdx = versions.findIndex(v => String(v.version) === String(versionNumber));

        // Only versions older than the target (higher index = older in newest-first array)
        const olderVersions = versions.slice(targetIdx + 1);

        // All older versions, first one (previous) pre-selected
        const compareSelectOptions = olderVersions
            .map((v, idx) => {
                const isPreselected = idx === 0;
                return `<option value="${this._escape(String(v.version))}" ${isPreselected ? 'selected' : ''}>v${this._escape(String(v.version))} — ${this._formatDate(v.createdAt)} · ${this._escape(v.createdBy || '—')}</option>`;
            }).join('');

        const popupHtml = `
            <div class="history-popup-overlay" id="history-diff-confirm-popup">
                <div class="history-popup history-popup--narrow">
                    <div class="history-popup-header">
                        <h3 class="history-popup-title">Compare <span class="history-version-badge">v${this._escape(versionNumber)}</span> with…</h3>
                        <button type="button" class="history-popup-close" data-action="cancel">&times;</button>
                    </div>
                    <div class="history-popup-body">
                        <select class="form-control history-compare-select" id="history-compare-select">
                            ${compareSelectOptions}
                        </select>
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-secondary btn-sm" data-action="cancel">Cancel</button>
                        <button type="button" class="btn btn-primary btn-sm history-btn-confirm-diff">Compare</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', popupHtml);
        const popup = document.getElementById('history-diff-confirm-popup');

        popup.querySelector('.history-btn-confirm-diff')?.addEventListener('click', () => {
            const compareVersion = popup.querySelector('#history-compare-select').value;
            console.log(`[HistoryTab] Diff confirmed: v${versionNumber} vs v${compareVersion}`);
            this.onDiff(Number(versionNumber), Number(compareVersion));
            this._removePopup('history-diff-confirm-popup');
        });

        this._bindPopupClose(popup, 'history-diff-confirm-popup');
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
                                Restoring <strong>v${this._escape(versionNumber)}</strong> will create a new version
                                based on this snapshot, overriding the current content
                                ${latestVersion ? `(<strong>v${this._escape(String(latestVersion.version))}</strong>)` : ''}.
                                This action cannot be undone.
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
            this.onRestore(versionId);
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