import { DiffPopup } from './diff-popup.js';

/**
 * history-tab.js
 * Standalone HistoryTab component for versioned entities (ON, OR, OC, Chapter)
 *
 * Phase A revision — history is now the audit event timeline fetched from
 * GET /audit-events?targetId= rather than the removed version-list endpoint.
 * Every field is frozen on the AuditEvent at write time; no hydration hop on read.
 *
 * Responsibilities:
 * - Lazy-load the audit event timeline on first tab activation
 * - Render one row per event: version, action, date, actor, CS code, note
 * - Per version-producing row (targetVersion != null):
 *     Diff button (all except first version)
 *     Restore button (all except current latest version, edit mode only)
 * - Diff: opens DiffPopup with a versions array derived from the event list
 * - Restore: confirmation dialog → onRestore callback (loads version into form)
 *
 * Usage:
 *   const historyTab = new HistoryTab(apiClient, {
 *       onRestore:     (versionId, versionNumber) => { ... },
 *       onViewVersion: (versionId, versionNumber) => { ... },
 *   });
 *   // On tab activation:
 *   historyTab.attach(containerElement, 'operational-requirements', itemId);
 */

export class HistoryTab {
    /**
     * @param {object} apiClient
     * @param {object} [callbacks]
     * @param {Function} [callbacks.onDiff]        - (versionNumber) => void
     * @param {Function} [callbacks.onRestore]     - (versionId, versionNumber) => void
     * @param {Function} [callbacks.onViewVersion] - (versionId, versionNumber) => void
     * @param {boolean}  [callbacks.readOnly]
     */
    constructor(apiClient, callbacks = {}) {
        this.apiClient = apiClient;

        this._diffPopup = new DiffPopup(apiClient);

        // Default onDiff passes a versions array derived from the event list
        // so DiffPopup gets the same { id, version } shape it previously received.
        this.onDiff = callbacks.onDiff || ((versionNumber) => {
            this._diffPopup.open(this._entityType, this._itemId, versionNumber, this._versionsForDiff());
        });
        this.onRestore     = callbacks.onRestore     || ((versionId, versionNumber) => console.log(`[HistoryTab] Restore: versionId=${versionId} versionNumber=${versionNumber}`));
        this.onViewVersion = callbacks.onViewVersion || null;
        this.readOnly      = callbacks.readOnly      || false;

        // State
        this._container  = null;
        this._entityType = null;   // still needed for DiffPopup and Restore fetch path
        this._itemId     = null;
        this._events     = [];     // AuditEventRow[], ascending by timestamp (oldest first from API)
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
     * @param {HTMLElement}   container
     * @param {string}        entityType  e.g. 'operational-requirements'
     * @param {string|number} itemId
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
            // _load() already in flight — it will call _render() when done
            // since _container is now set, the render will go to the right place
            return;
        }

        await this._load();
    }

    /**
     * Preload audit events before tab activation so attach() renders immediately.
     * entityType is kept for backward compatibility and DiffPopup / Restore use.
     *
     * @param {string}        entityType
     * @param {string|number} itemId
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
        this._events     = [];
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
            const events = await this.apiClient.getAuditEvents({ targetId: this._itemId });
            this._events = Array.isArray(events) ? events : [];
            this._loaded = true;
            if (this._container) this._render();
        } catch (err) {
            console.error('HistoryTab: failed to load audit events', err);
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
                Loading history…
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
        // Display newest-first; API returns ascending by timestamp (oldest first)
        const events = [...this._events].reverse();

        if (events.length === 0) {
            this._container.innerHTML = `
                <div class="history-tab-empty">No history available.</div>
            `;
            return;
        }

        const latestVersion = this._latestVersion();

        const rows = events.map((e) => {
            const hasVersion      = e.targetVersion != null;
            const isLatestVersion = hasVersion && e.targetVersion === latestVersion;
            const isFirstVersion  = hasVersion && e.targetVersion === 1;

            // Version badge / link
            const verCell = hasVersion
                ? (this.onViewVersion
                    ? `<button
                            type="button"
                            class="history-version-badge history-version-badge--link"
                            data-version-id="${this._escape(String(e.versionId ?? ''))}"
                            data-version-number="${this._escape(String(e.targetVersion))}"
                            title="View v${e.targetVersion}"
                        >v${e.targetVersion}</button>`
                    : `<span class="history-version-badge history-version-badge--static">v${e.targetVersion}</span>`)
                : `<span class="history-version-badge history-version-badge--none">—</span>`;

            // Action badge
            const actionBadge = `<span class="history-action-badge history-action-badge--${this._escape((e.action ?? '').toLowerCase())}">${this._escape(e.action ?? '—')}</span>`;

            // Change-set code + frozen title
            const csCell = e.changeSetCode
                ? `<span class="history-cs-code">${this._escape(e.changeSetCode)}</span>${e.changeSetTitle ? `<span class="history-cs-title"> — ${this._escape(e.changeSetTitle)}</span>` : ''}`
                : '<span class="history-cs-code history-cs-code--none">—</span>';

            // Per-action buttons — only for version-producing events
            const diffBtn = (hasVersion && !isFirstVersion) ? `
                <button
                    type="button"
                    class="btn btn-sm btn-secondary history-btn-diff"
                    data-version-id="${this._escape(String(e.versionId ?? ''))}"
                    data-version-number="${this._escape(String(e.targetVersion))}"
                >Diff</button>` : '';

            const restoreBtn = (hasVersion && !isLatestVersion && !this.readOnly) ? `
                <button
                    type="button"
                    class="btn btn-sm btn-warning history-btn-restore"
                    data-version-id="${this._escape(String(e.versionId ?? ''))}"
                    data-version-number="${this._escape(String(e.targetVersion))}"
                >Restore</button>` : '';

            return `
                <div class="history-row${isLatestVersion ? ' history-row--latest' : ''}"
                     data-version-id="${this._escape(String(e.versionId ?? ''))}">
                    <div class="history-row-meta">
                        ${verCell}
                        ${isLatestVersion ? '<span class="history-latest-badge">Latest</span>' : ''}
                        ${actionBadge}
                        <span class="history-row-date">${this._formatDate(e.timestamp)}</span>
                        <span class="history-row-author">${this._escape(e.userId || '—')}</span>
                        <span class="history-row-cs">${csCell}</span>
                        <span class="history-row-note">${e.note ? `— ${this._escape(e.note)}` : ''}</span>
                    </div>
                    <div class="history-row-actions">${diffBtn}${restoreBtn}</div>
                </div>
            `;
        }).join('');

        this._container.innerHTML = `
            <div class="history-tab">
                <div class="history-list">
                    <div class="history-row history-row--header">
                        <div class="history-row-meta">
                            <span class="history-col-title">Version history</span>
                        </div>
                        <div class="history-row-actions"></div>
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
    // DIFF — direct launch via DiffPopup
    // ─────────────────────────────────────────────────────────────

    _showDiffConfirm(versionId, versionNumber) {
        this.onDiff(Number(versionNumber));
    }

    // ─────────────────────────────────────────────────────────────
    // RESTORE CONFIRMATION POPUP
    // ─────────────────────────────────────────────────────────────

    _showRestoreConfirm(versionId, versionNumber) {
        this._removePopup('history-restore-confirm-popup');

        const latestVersion = this._latestVersion();

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
                                ${latestVersion != null ? `(<strong>v${latestVersion}</strong>)` : ''}.
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

        popup.querySelector('.history-btn-confirm-restore')?.addEventListener('click', () => {
            this.onRestore(versionId, versionNumber);
            this._removePopup('history-restore-confirm-popup');
        });

        this._bindPopupClose(popup, 'history-restore-confirm-popup');
    }

    // ─────────────────────────────────────────────────────────────
    // POPUP HELPERS
    // ─────────────────────────────────────────────────────────────

    _bindPopupClose(popup, popupId) {
        popup.querySelectorAll('[data-action="cancel"]').forEach(btn => {
            btn.addEventListener('click', () => this._removePopup(popupId));
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) this._removePopup(popupId);
        });

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
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────

    /**
     * Highest targetVersion across all events; null if no version-producing events exist.
     */
    _latestVersion() {
        let max = null;
        for (const e of this._events) {
            if (e.targetVersion != null && (max === null || e.targetVersion > max)) {
                max = e.targetVersion;
            }
        }
        return max;
    }

    /**
     * Versions array compatible with DiffPopup — derived from version-producing events,
     * sorted newest-first. Only events with both targetVersion and versionId are included.
     */
    _versionsForDiff() {
        return this._events
            .filter(e => e.targetVersion != null && e.versionId != null)
            .map(e => ({ id: e.versionId, version: e.targetVersion }))
            .sort((a, b) => b.version - a.version);
    }

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