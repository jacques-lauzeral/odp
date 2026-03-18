// Core application class with routing and activity management
import { errorHandler } from './shared/error-handler.js';
import { apiClient } from './shared/api-client.js';
import { endpoints } from './config/api.js';
import Header from './components/common/header.js';

const CONNECTION_CHECK_INTERVAL = 60000;

export class App {
    constructor(container) {
        this.container = container;
        this.currentActivity = null;
        this.activities = new Map();
        this.user = null;
        this.header = null;
        this.connectionCheckInterval = null;
    }

    async initialize() {
        console.log('Initializing ODIP Web Client...');

        // Connect API client to app for user header
        apiClient.setApp(this);

        // Create header
        this.header = new Header(this);
        const headerContainer = document.getElementById('header-container');
        if (headerContainer) {
            this.header.render(headerContainer);
        }

        // Set up routing
        this.setupRouting();

        // Start connection monitoring
        this.startConnectionMonitoring();

        // Load current route
        await this.handleRoute();

        console.log('ODIP Web Client initialized successfully');
    }

    startConnectionMonitoring() {
        this.checkConnection();
        this.connectionCheckInterval = setInterval(() => this.checkConnection(), CONNECTION_CHECK_INTERVAL);
    }

    async checkConnection() {
        try {
            await apiClient.get(endpoints.health);
            this.dispatchConnectionEvent('connected');
        } catch {
            this.dispatchConnectionEvent('disconnected');
        }
    }

    dispatchConnectionEvent(status) {
        window.dispatchEvent(new CustomEvent('connection:change', { detail: { status } }));
    }

    setupRouting() {
        // Listen for URL changes
        window.addEventListener('popstate', () => this.handleRoute());

        // Override link clicks for internal navigation
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.getAttribute('href')?.startsWith('/')) {
                event.preventDefault();
                this.navigateTo(link.getAttribute('href'));
            }
        });
    }

    async handleRoute() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(segment => segment.length > 0);

        try {
            if (segments.length === 0) {
                await this.loadActivity('landing');
            } else if (segments[0] === 'setup') {
                await this.loadActivity('setup', segments.slice(1));
            } else if (segments[0] === 'elaboration') {
                await this.loadActivity('elaboration', segments.slice(1));
            } else if (segments[0] === 'planning') {
                await this.loadActivity('planning', segments.slice(1));
            } else if (segments[0] === 'publication') {
                await this.loadActivity('publication', segments.slice(1));
            } else if (segments[0] === 'review') {
                await this.loadActivity('review', segments.slice(1));
            } else {
                this.navigateTo('/');
                return;
            }

            if (this.header) {
                this.header.onRouteChange();
            }
        } catch (error) {
            errorHandler.handle(error, 'routing');
            this.navigateTo('/');
        }
    }

    async loadActivity(activityName, subPath = []) {
        if (this.currentActivity?.name === activityName) {
            if (this.currentActivity.handleSubPath) {
                await this.currentActivity.handleSubPath(subPath);
            }
            return;
        }

        try {
            let activity = this.activities.get(activityName);

            if (!activity) {
                const module = await import(`./activities/${activityName}/${activityName}.js`);
                const ActivityClass = module.default || module[this.capitalize(activityName)];
                activity = new ActivityClass(this);
                this.activities.set(activityName, activity);
            }

            if (this.currentActivity?.cleanup) {
                await this.currentActivity.cleanup();
            }

            this.currentActivity = activity;
            this.currentActivity.name = activityName;

            await activity.render(this.container, subPath);

        } catch (error) {
            console.error(`Failed to load activity: ${activityName}`, error);
            errorHandler.handle(error, `activity-${activityName}`);

            if (activityName !== 'landing') {
                this.navigateTo('/');
            }
        }
    }

    navigateTo(path) {
        if (window.location.pathname !== path) {
            window.history.pushState({}, '', path);
        }
        this.handleRoute();
    }

    navigate(path) {
        this.navigateTo(path);
    }

    setUser(userData) {
        this.user = userData;
        console.log('User set:', userData.name);
        if (this.header) {
            this.header.onUserChange();
        }
    }

    getUser() {
        return this.user;
    }

    cleanup() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}