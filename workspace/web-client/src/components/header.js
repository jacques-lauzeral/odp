/**
 * @file header.js
 * @description Global site header for ODIP Space. Two-row layout:
 *   Row 1 — logo (spans both rows) · brand · [Manage] · Connect/username · server dot
 *   Row 2 — breadcrumb trail
 *
 * Public API:
 *   header.setBreadcrumb(crumbs)  — update breadcrumb trail; called by every activity
 *   header.onUserChange()         — re-render after setUser()
 *   header.onContextChange()      — re-render after setDatasetContext()
 *   header.onRouteChange()        — no-op (breadcrumb is set by activities directly)
 *
 * Crumb shape: { label: string, path?: string }
 *   Last crumb has no path (current page, non-clickable).
 *
 * User identification:
 *   Anonymous → "Connect" button → connect popup
 *   Identified → username display → connect popup (update / disconnect)
 *
 * Manage button:
 *   Visible only to integrators. Rendered in row 1 right cluster.
 */
import { dom } from '../shared/utils.js';
import { openChangeSetCommitDialog } from './change-set-commit-dialog.js';
import logoUrl from '../assets/odip-space-logo.svg';
import { UserRole } from '/shared/src/index.js';

const STORAGE_KEY = 'odip-space-user';

const ROLE_LABELS = {
    [UserRole.DOMAIN_WRITER]: 'Domain Writer',
    [UserRole.ICDM]:          'iCDM',
    [UserRole.INTEGRATOR]:    'Integrator',
};

/** @type {Array<{ segment: string, label: string, path: string }>} */
const NAV_TABS = [
    { segment: '',               label: 'Home',          path: '/'              },
    { segment: 'elaborate',      label: 'Elaborate',     path: '/elaborate'     },
    { segment: 'explore',        label: 'Explore',       path: '/explore'       },
    { segment: 'converse',  label: 'Converse', path: '/converse' },
    { segment: 'manage',         label: 'Manage',        path: '/manage'        },
];

export default class Header {
    /** @param {import('../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    render(container) {
        this.container = container; // Note: restoreUser() is called once by App.initialize(), not here
        container.innerHTML = this._buildHtml();
        this._attachEventListeners();
        this._updateActiveTab();
    }

    // -------------------------------------------------------------------------
    // HTML
    // -------------------------------------------------------------------------

    _buildHtml() {
        const user = this.app.getUser();
        const isIntegrator = user?.role === UserRole.INTEGRATOR;

        return `
            <header class="odp-header">
                <img class="odp-header__logo" src="${logoUrl}" alt="ODIP Space">
                <div class="odp-header__rows">
                    <div class="odp-header__row-top">
                        <span class="odp-header__title">ODIP Space</span>
                        <nav class="odp-header__nav">
                            ${this._buildNavItems()}
                        </nav>
                        <div class="odp-header__right">
                            ${this._buildChangeSetChip()}
                            <button class="odp-header__user-btn${user ? ' odp-header__user-btn--identified' : ''}"
                                id="header-user-btn"
                                ${user?.role === UserRole.DOMAIN_WRITER && user.domains?.length ? `title="Domains: ${this._esc(user.domains.join(', '))}"` : ''}>
                                ${user ? `${this._esc(user.email)} — ${this._esc(ROLE_LABELS[user.role] ?? user.role)}` : 'Connect'}
                            </button>
                            <div class="odp-header__status" title="Server connection">
                                <span class="status-dot status-dot--checking"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <!-- Connect popup -->
            <div class="odp-connect-overlay" id="connect-overlay" hidden>
                <div class="odp-connect-popup" role="dialog" aria-modal="true" aria-label="User identification">
                    <div class="odp-connect-popup__header">
                        <h2 class="odp-connect-popup__title">Identify yourself</h2>
                        <button class="odp-connect-popup__close" id="connect-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="odp-connect-popup__body">
                        <label class="odp-connect-popup__label" for="connect-email">Email address</label>
                        <input class="odp-connect-popup__input" id="connect-email" type="text"
                            placeholder="your.name@eurocontrol.int" value="${user?.email ?? ''}" autocomplete="off">
                        <p class="odp-connect-popup__error" id="connect-error" hidden></p>
                    </div>
                    <div class="odp-connect-popup__footer">
                        ${user ? `<button class="btn btn-secondary" id="connect-disconnect">Disconnect</button>` : ''}
                        <button class="btn btn-primary" id="connect-submit">${user ? 'Update' : 'Connect'}</button>
                    </div>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Nav tabs
    // -------------------------------------------------------------------------

    _buildNavItems() {
        const user = this.app.getUser();
        const ctx  = this.app.getDatasetContext();

        return NAV_TABS
            .filter(tab => {
                if (tab.segment === 'elaborate') return ctx?.type === 'live';
                if (tab.segment === 'explore')   return ctx?.type === 'edition';
                if (tab.segment === 'manage')    return user?.role === UserRole.INTEGRATOR || user?.role === UserRole.ICDM;
                return true;
            })
            .map(tab => `
                <button class="odp-header__nav-item" data-path="${tab.path}" data-segment="${tab.segment}">
                    ${tab.label}
                </button>
            `)
            .join('');
    }

    // -------------------------------------------------------------------------
    // Active change set chip (live context only)
    // -------------------------------------------------------------------------

    _buildChangeSetChip() {
        const ctx = this.app.getDatasetContext();
        if (ctx?.type !== 'live') return '';   // editing only happens in Elaborate; hidden in Explore
        const cs = this.app.getActiveChangeSet();
        const label = cs ? this._esc(cs.title) : 'none';
        return `
            <button class="odp-header__user-btn${cs ? ' odp-header__user-btn--identified' : ''}" id="header-cs-chip"
                title="Active change set — click to change the default offered when you save">
                <span style="opacity:0.6;">Change set:</span> ${label}
            </button>`;
    }

    // -------------------------------------------------------------------------
    // Active tab
    // -------------------------------------------------------------------------

    _updateActiveTab() {
        const segment = this.app.activeSegment();
        dom.findAll('.odp-header__nav-item', this.container).forEach(btn => {
            btn.classList.toggle('odp-header__nav-item--active', btn.dataset.segment === segment);
        });
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        // Nav tabs
        dom.findAll('[data-path]', this.container).forEach(btn => {
            btn.addEventListener('click', () => this.app.navigate(btn.dataset.path));
        });

        dom.find('#header-user-btn', this.container)
            ?.addEventListener('click', () => this._openPopup());

        dom.find('#header-cs-chip', this.container)
            ?.addEventListener('click', () => openChangeSetCommitDialog(this.app, { mode: 'select' }));

        dom.find('#connect-close', this.container)
            ?.addEventListener('click', () => this._closePopup());

        dom.find('#connect-overlay', this.container)
            ?.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) this._closePopup();
            });

        dom.find('#connect-submit', this.container)
            ?.addEventListener('click', () => this._handleConnect());

        dom.find('#connect-disconnect', this.container)
            ?.addEventListener('click', () => this._handleDisconnect());

        dom.find('#connect-email', this.container)
            ?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._handleConnect(); });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._closePopup();
        });

        window.addEventListener('connection:change', (e) => {
            this._updateConnectionStatus(e.detail.status);
        });
    }

    // -------------------------------------------------------------------------
    // Popup
    // -------------------------------------------------------------------------

    _openPopup() {
        dom.find('#connect-overlay', this.container)?.removeAttribute('hidden');
        dom.find('#connect-name', this.container)?.focus();
    }

    _closePopup() {
        dom.find('#connect-overlay', this.container)?.setAttribute('hidden', '');
    }

    // -------------------------------------------------------------------------
    // Connect / disconnect
    // -------------------------------------------------------------------------

    async _handleConnect() {
        const emailInput = dom.find('#connect-email', this.container);
        const errorEl    = dom.find('#connect-error', this.container);
        const email = emailInput?.value.trim();
        if (!email) return;

        // Clear previous inline error
        if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }

        try {
            const userData = await this.app.apiClient.post('/auth/identify', { email });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
            this.app.setUser(userData);
            this._closePopup();
        } catch (error) {
            if (error.status === 401) {
                // Inline error — do NOT let this reach the global toast
                if (errorEl) { errorEl.textContent = 'Email address not recognised.'; errorEl.hidden = false; }
            } else {
                this._closePopup();
                throw error; // bubble to global error handler
            }
        }
    }

    _handleDisconnect() {
        localStorage.removeItem(STORAGE_KEY);
        this.app.setUser(null);
        this._closePopup();
    }

    async restoreUser() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored);
            // Discard legacy shape (pre-RBA: { name, role } with no email)
            if (!parsed?.email) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }
            // Re-validate against server — catches users removed from users.yaml
            const userData = await this.app.apiClient.post('/auth/identify', { email: parsed.email });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
            this.app.setUser(userData);
        } catch (error) {
            // 401 → removed from whitelist; any other error → fail silently, stay anonymous
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    // -------------------------------------------------------------------------
    // Public hooks called by App
    // -------------------------------------------------------------------------

    onUserChange() {
        this.render(this.container);
        this._updateConnectionStatus(this.app.getConnectionStatus());
    }

    onContextChange() {
        this.render(this.container);
        this._updateConnectionStatus(this.app.getConnectionStatus());
    }

    /** Re-render after the active change set changes (chip label). */
    onChangeSetChange() {
        this.render(this.container);
        this._updateConnectionStatus(this.app.getConnectionStatus());
    }

    /** Update active tab highlight on route change. */
    onRouteChange() {
        this._updateActiveTab();
    }

    // -------------------------------------------------------------------------
    // Connection status
    // -------------------------------------------------------------------------

    _updateConnectionStatus(status) {
        const dot = dom.find('.status-dot', this.container);
        if (!dot) return;
        dot.className = 'status-dot';
        switch (status) {
            case 'connected':    dot.classList.add('status-dot--connected');    break;
            case 'disconnected': dot.classList.add('status-dot--disconnected'); break;
            default:             dot.classList.add('status-dot--checking');     break;
        }
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}