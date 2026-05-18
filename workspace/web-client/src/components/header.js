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
import { buildBreadcrumb, attachBreadcrumbListeners } from './breadcrumb.js';

const STORAGE_KEY = 'odip-space-user';

const ROLES = [
    { value: 'contributor', label: 'Contributor' },
    { value: 'reviewer',    label: 'Reviewer'    },
    { value: 'integrator',  label: 'Integrator'  },
];

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
        /** @type {Array<{ label: string, path?: string }>} */
        this._crumbs = [];
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    render(container) {
        this.container = container; // Note: restoreUser() is called once by App.initialize(), not here
        container.innerHTML = this._buildHtml();
        this._attachEventListeners();
        this._renderBreadcrumb();
    }

    // -------------------------------------------------------------------------
    // Public API — called by activities
    // -------------------------------------------------------------------------

    /**
     * Update the breadcrumb trail.
     * @param {Array<{ label: string, path?: string }>} crumbs
     */
    setBreadcrumb(crumbs) {
        this._crumbs = crumbs;
        this._renderBreadcrumb();
    }

    // -------------------------------------------------------------------------
    // HTML
    // -------------------------------------------------------------------------

    _buildHtml() {
        const user = this.app.getUser();
        const isIntegrator = user?.role === 'integrator';

        return `
            <header class="odp-header">
                <img class="odp-header__logo" src="/assets/odip-space-logo.svg" alt="ODIP Space">
                <div class="odp-header__rows">
                    <div class="odp-header__row-top">
                        <span class="odp-header__title">ODIP Space</span>
                        <nav class="odp-header__nav">
                            ${this._buildNavItems()}
                        </nav>
                        <div class="odp-header__right">
                            <button class="odp-header__user-btn${user ? ' odp-header__user-btn--identified' : ''}" id="header-user-btn">
                                ${user ? this._esc(user.name) : 'Connect'}
                            </button>
                            <div class="odp-header__status" title="Server connection">
                                <span class="status-dot status-dot--checking"></span>
                            </div>
                        </div>
                    </div>
                    <div class="odp-header__row-bottom" id="header-breadcrumb"></div>
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
                        <label class="odp-connect-popup__label" for="connect-name">Name</label>
                        <input class="odp-connect-popup__input" id="connect-name" type="text"
                            placeholder="Your name" value="${user?.name ?? ''}" autocomplete="off">
                        <label class="odp-connect-popup__label" for="connect-role">Role</label>
                        <select class="odp-connect-popup__select" id="connect-role">
                            <option value="">— select role —</option>
                            ${ROLES.map(r => `<option value="${r.value}"${user?.role === r.value ? ' selected' : ''}>${r.label}</option>`).join('')}
                        </select>
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
    // Breadcrumb
    // -------------------------------------------------------------------------

    _renderBreadcrumb() {
        const el = dom.find('#header-breadcrumb', this.container);
        if (!el) return;
        el.innerHTML = buildBreadcrumb(this._crumbs);
        attachBreadcrumbListeners(el, this.app);
        this._updateActiveTab();
    }

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

        dom.find('#connect-name', this.container)
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

    _handleConnect() {
        const name = dom.find('#connect-name', this.container)?.value.trim();
        const role = dom.find('#connect-role', this.container)?.value;
        if (!name || !role) return;
        const userData = { name, role };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        this.app.setUser(userData);
        this._closePopup();
    }

    _handleDisconnect() {
        localStorage.removeItem(STORAGE_KEY);
        this.app.setUser(null);
        this._closePopup();
    }

    restoreUser() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const userData = JSON.parse(stored);
                if (userData?.name && userData?.role) {
                    this.app.setUser(userData);
                }
            }
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    // -------------------------------------------------------------------------
    // Public hooks called by App
    // -------------------------------------------------------------------------

    onUserChange() {
        this.render(this.container);
        this._updateConnectionStatus(this.app.getConnectionStatus());
        this._renderBreadcrumb();
    }

    onContextChange() {
        this.render(this.container);
        this._updateConnectionStatus(this.app.getConnectionStatus());
        this._renderBreadcrumb();
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