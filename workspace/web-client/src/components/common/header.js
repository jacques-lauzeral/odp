import { dom } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class Header {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.connectionCheckInterval = null;
        this.connectionStatus = 'checking';
    }

    render(container) {
        this.container = container;

        const headerHtml = `
            <header class="odp-header">
                <div class="odp-header__brand">
                    <h1 class="odp-header__title">ODP</h1>
                </div>
                
                <nav class="odp-header__nav">
                    <button class="odp-header__nav-item" data-activity="landing">Landing</button>
                    <button class="odp-header__nav-item" data-activity="setup">Setup</button>
                    <button class="odp-header__nav-item" data-activity="read">Read</button>
                    <button class="odp-header__nav-item" data-activity="elaboration">Elaboration</button>
                </nav>
                
                <div class="odp-header__context">
                    <span class="odp-header__user" id="header-user">Guest</span>
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

        container.innerHTML = headerHtml;
        this.attachEventListeners();
        this.startConnectionMonitoring();
        this.updateUserDisplay();
        this.updateActiveActivity();
    }

    attachEventListeners() {
        // Activity navigation
        const navButtons = dom.findAll('[data-activity]', this.container);
        navButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const activity = e.target.dataset.activity;
                this.navigateToActivity(activity);
            });
        });

        // Mobile menu toggle
        const mobileToggle = dom.find('#mobile-nav-toggle', this.container);
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                this.toggleMobileMenu();
            });
        }
    }

    navigateToActivity(activity) {
        const path = activity === 'landing' ? '/' : `/${activity}`;
        this.app.navigate(path);
    }

    updateActiveActivity() {
        const currentPath = window.location.pathname;
        const currentActivity = this.getCurrentActivityFromPath(currentPath);

        // Remove previous active states
        const navItems = dom.findAll('.odp-header__nav-item', this.container);
        navItems.forEach(item => item.classList.remove('odp-header__nav-item--active'));

        // Set current active state
        const activeItem = dom.find(`[data-activity="${currentActivity}"]`, this.container);
        if (activeItem) {
            activeItem.classList.add('odp-header__nav-item--active');
        }
    }

    getCurrentActivityFromPath(path) {
        if (path === '/') return 'landing';
        const segments = path.split('/').filter(s => s.length > 0);
        return segments[0] || 'landing';
    }

    updateUserDisplay() {
        const userName = this.app.user?.name || 'Guest';
        const userElement = dom.find('#header-user', this.container);
        if (userElement) {
            userElement.textContent = userName;
        }
    }

    async startConnectionMonitoring() {
        await this.checkConnection();

        this.connectionCheckInterval = setInterval(async () => {
            await this.checkConnection();
        }, 10000);
    }

    async checkConnection() {
        try {
            await apiClient.get('/hello');
            this.updateConnectionStatus('connected');
        } catch (error) {
            this.updateConnectionStatus('disconnected');
        }
    }

    updateConnectionStatus(status) {
        this.connectionStatus = status;
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
            case 'checking':
                indicator.classList.add('status-indicator--checking');
                text.textContent = 'Checking...';
                break;
        }
    }

    toggleMobileMenu() {
        const nav = dom.find('.odp-header__nav', this.container);
        const toggle = dom.find('.odp-header__mobile-toggle', this.container);

        nav.classList.toggle('odp-header__nav--mobile-open');
        toggle.classList.toggle('odp-header__mobile-toggle--active');
    }

    onUserChange() {
        this.updateUserDisplay();
    }

    onRouteChange() {
        this.updateActiveActivity();
    }

    cleanup() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }
}