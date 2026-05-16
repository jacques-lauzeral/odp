/**
 * @file header.js
 * @description Global site header for ODIP Space. Owns nav tab rendering (role-gated),
 * connect form (name + role, persisted to localStorage), connection status indicator,
 * and mobile menu toggle.
 *
 * Nav tabs:
 *   Home      — always visible, always enabled
 *   Elaborate — always visible, disabled when no user
 *   Explore   — always visible, always enabled
 *   Manage    — visible only to integrators, disabled when no user
 *
 * Active tab is derived from app.activeSegment() on each route change — no path parsing here.
 */
import { dom } from '../../shared/utils.js';

const STORAGE_KEY = 'odip-space-user';

const ROLES = [
    { value: 'contributor', label: 'Contributor' },
    { value: 'reviewer',    label: 'Reviewer'    },
    { value: 'integrator',  label: 'Integrator'  },
];

/** @type {Array<{ segment: string, label: string, path: string, protected: boolean, integratorsOnly: boolean }>} */
const NAV_TABS = [
    { segment: '',          label: 'Home',      path: '/',          protected: false, integratorsOnly: false },
    { segment: 'elaborate', label: 'Elaborate', path: '/elaborate', protected: true,  integratorsOnly: false },
    { segment: 'explore',   label: 'Explore',   path: '/explore',   protected: false, integratorsOnly: false },
    { segment: 'manage',    label: 'Manage',    path: '/manage',    protected: true,  integratorsOnly: true  },
];

export default class Header {
    /**
     * @param {import('../../app.js').App} app
     */
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    render(container) {
        this.container = container;
        container.innerHTML = this._buildHtml();
        this._attachEventListeners();
        this._restoreUser();
        this.updateActiveTab();
    }

    _buildHtml() {
        const navItems = NAV_TABS
            .filter(tab => !tab.integratorsOnly || this._isIntegrator())
            .map(tab => {
                const disabled = tab.protected && !this.app.getUser();
                return `<button
                    class="odp-header__nav-item${disabled ? ' odp-header__nav-item--disabled' : ''}"
                    data-segment="${tab.segment}"
                    data-path="${tab.path}"
                    ${disabled ? 'disabled' : ''}
                >${tab.label}</button>`;
            })
            .join('');

        const user = this.app.getUser();

        return `
            <header class="odp-header">
                <div class="odp-header__brand">
                    <h1 class="odp-header__title">ODIP Space</h1>
                </div>

                <nav class="odp-header__nav">
                    ${navItems}
                </nav>

                <div class="odp-header__context">
                    <div class="odp-header__connect">
                        <input
                            class="odp-header__connect-name"
                            id="header-connect-name"
                            type="text"
                            placeholder="Your name"
                            value="${user?.name ?? ''}"
                            autocomplete="off"
                        >
                        <select class="odp-header__connect-role" id="header-connect-role">
                            <option value="">— role —</option>
                            ${ROLES.map(r => `<option value="${r.value}"${user?.role === r.value ? ' selected' : ''}>${r.label}</option>`).join('')}
                        </select>
                        <button class="odp-header__connect-btn" id="header-connect-btn">
                            ${user ? 'Update' : 'Connect'}
                        </button>
                        ${user ? `<button class="odp-header__disconnect-btn" id="header-disconnect-btn">Disconnect</button>` : ''}
                    </div>

                    <div class="odp-header__status" id="header-status">
                        <span class="status-indicator status-indicator--checking"></span>
                        <span class="status-text">Checking...</span>
                    </div>
                </div>

                <button class="odp-header__mobile-toggle" id="mobile-nav-toggle">
                    <span class="hamburger-line"></span>
                    <span class="hamburger-line"></span>
                    <span class="hamburger-line"></span>
                </button>
            </header>
        `;
    }

    // -------------------------------------------------------------------------
    // Event listeners
    // -------------------------------------------------------------------------

    _attachEventListeners() {
        // Nav tabs
        dom.findAll('[data-path]', this.container).forEach(button => {
            button.addEventListener('click', () => {
                if (!button.disabled) {
                    this.app.navigate(button.dataset.path);
                }
            });
        });

        // Connect button
        const connectBtn = dom.find('#header-connect-btn', this.container);
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this._handleConnect());
        }

        // Disconnect button (may not exist when no user)
        const disconnectBtn = dom.find('#header-disconnect-btn', this.container);
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this._handleDisconnect());
        }

        // Submit connect form on Enter in name field
        const nameInput = dom.find('#header-connect-name', this.container);
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._handleConnect();
            });
        }

        // Mobile toggle
        const mobileToggle = dom.find('#mobile-nav-toggle', this.container);
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => this._toggleMobileMenu());
        }

        // Connection monitoring
        window.addEventListener('connection:change', (e) => {
            this._updateConnectionStatus(e.detail.status);
        });
    }

    // -------------------------------------------------------------------------
    // Connect / disconnect
    // -------------------------------------------------------------------------

    _handleConnect() {
        const name = dom.find('#header-connect-name', this.container)?.value.trim();
        const role = dom.find('#header-connect-role', this.container)?.value;

        if (!name || !role) return;

        const userData = { name, role };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(userData));
        this.app.setUser(userData);
    }

    _handleDisconnect() {
        localStorage.removeItem(STORAGE_KEY);
        this.app.setUser(null);
    }

    _restoreUser() {
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

    /** Called by App after setUser(). Full re-render to reflect role-gated tabs and form state. */
    onUserChange() {
        this.render(this.container);
        // Re-sync initial connection status after re-render
        this._updateConnectionStatus(this.app.getConnectionStatus());
    }

    /** Called by Router (via App) after every route change. */
    onRouteChange() {
        this.updateActiveTab();
    }

    // -------------------------------------------------------------------------
    // Active tab
    // -------------------------------------------------------------------------

    updateActiveTab() {
        const segment = this.app.activeSegment();
        dom.findAll('.odp-header__nav-item', this.container).forEach(btn => {
            const active = btn.dataset.segment === segment;
            btn.classList.toggle('odp-header__nav-item--active', active);
        });
    }

    // -------------------------------------------------------------------------
    // Connection status
    // -------------------------------------------------------------------------

    _updateConnectionStatus(status) {
        const statusElement = dom.find('#header-status', this.container);
        if (!statusElement) return;

        const indicator = dom.find('.status-indicator', statusElement);
        const text = dom.find('.status-text', statusElement);

        indicator.className = 'status-indicator';

        switch (status) {
            case 'connected':
                indicator.classList.add('status-indicator--connected');
                text.textContent = 'Connected';
                break;
            case 'disconnected':
                indicator.classList.add('status-indicator--disconnected');
                text.textContent = 'Disconnected';
                break;
            default:
                indicator.classList.add('status-indicator--checking');
                text.textContent = 'Checking...';
        }
    }

    // -------------------------------------------------------------------------
    // Mobile menu
    // -------------------------------------------------------------------------

    _toggleMobileMenu() {
        dom.find('.odp-header__nav', this.container)
            ?.classList.toggle('odp-header__nav--mobile-open');
        dom.find('.odp-header__mobile-toggle', this.container)
            ?.classList.toggle('odp-header__mobile-toggle--active');
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    _isIntegrator() {
        return this.app.getUser()?.role === 'integrator';
    }
}