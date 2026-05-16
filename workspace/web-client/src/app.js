/**
 * @file app.js
 * @description Core application class. Owns connection monitoring, activity lifecycle,
 * and user state. Navigation is delegated to Router.
 */
import { errorHandler } from './shared/error-handler.js';
import { apiClient } from './shared/api-client.js';
import { endpoints } from './config/api.js';
import { Router } from './shared/router.js';
import Header from './components/common/header.js';

const CONNECTION_CHECK_INTERVAL = 60000;

/**
 * Activity loader map — maps activityKey to the module path used by dynamic import.
 * Nested paths (workspace shells, manage) are explicit here; no path convention assumed.
 *
 * @type {Map<string, string>}
 */
const ACTIVITY_PATHS = new Map([
    ['home',      './activities/home/home.js'],
    ['elaborate', './activities/workspace/elaborate/elaborate.js'],
    ['explore',   './activities/workspace/explore/explore.js'],
    ['manage',    './activities/manage/manage.js'],
]);

export class App {
    /**
     * @param {HTMLElement} container - The main activity mount point (#activity-container)
     */
    constructor(container) {
        this.container = container;
        this.currentActivity = null;
        this.activities = new Map();
        this.user = null;
        this.datasetContext = null;
        this.header = null;
        this.router = null;
        this.connectionCheckInterval = null;
        this.connectionStatus = 'checking';
    }

    async initialize() {
        console.log('Initializing ODIP Space...');

        apiClient.setApp(this);

        this.header = new Header(this);
        const headerContainer = document.getElementById('header-container');
        if (headerContainer) {
            this.header.render(headerContainer);
        }

        this.router = new Router({
            onNavigate:    (activityKey, subPath) => this._loadActivity(activityKey, subPath),
            getUser:       () => this.user,
            onRouteChange: () => { if (this.header) this.header.onRouteChange(); },
        });

        this.startConnectionMonitoring();

        await this.router.start();

        console.log('ODIP Space initialized successfully');
    }

    // -------------------------------------------------------------------------
    // Navigation (public — used by activities and Header)
    // -------------------------------------------------------------------------

    /**
     * Navigate to a path.
     * @param {string} path
     */
    navigate(path) {
        return this.router.navigate(path);
    }

    /**
     * The first path segment of the active route. Empty string on Home.
     * Forwarded from Router — Header calls this to derive the active tab.
     * @returns {string}
     */
    activeSegment() {
        return this.router ? this.router.activeSegment() : '';
    }

    // -------------------------------------------------------------------------
    // Activity lifecycle (private)
    // -------------------------------------------------------------------------

    /**
     * Load and mount an activity by key. Skips reload if the same activity is already active.
     * @param {string}   activityKey
     * @param {string[]} subPath
     */
    async _loadActivity(activityKey, subPath = []) {
        if (this.currentActivity?.name === activityKey) {
            if (this.currentActivity.handleSubPath) {
                await this.currentActivity.handleSubPath(subPath);
            }
            return;
        }

        try {
            let activity = this.activities.get(activityKey);

            if (!activity) {
                const modulePath = ACTIVITY_PATHS.get(activityKey);
                if (!modulePath) {
                    throw new Error(`No module path registered for activity key: ${activityKey}`);
                }
                const module = await import(modulePath);
                const ActivityClass = module.default ?? module[this._capitalize(activityKey)];
                activity = new ActivityClass(this);
                this.activities.set(activityKey, activity);
            }

            if (this.currentActivity?.cleanup) {
                await this.currentActivity.cleanup();
            }

            this.currentActivity = activity;
            this.currentActivity.name = activityKey;

            await activity.render(this.container, subPath);

        } catch (error) {
            console.error(`Failed to load activity: ${activityKey}`, error);
            errorHandler.handle(error, `activity-${activityKey}`);

            if (activityKey !== 'home') {
                this.router.navigate('/');
            }
        }
    }

    // -------------------------------------------------------------------------
    // User management (public)
    // -------------------------------------------------------------------------

    /**
     * Set the active user. Triggers header refresh.
     * @param {{ name: string, role: string }|null} userData
     */
    setUser(userData) {
        this.user = userData;
        console.log('User set:', userData?.name ?? null);
        if (this.header) {
            this.header.onUserChange();
        }
    }

    /** @returns {{ name: string, role: string }|null} */
    getUser() {
        return this.user;
    }

    // -------------------------------------------------------------------------
    // Dataset context (public)
    // -------------------------------------------------------------------------

    /**
     * Set the active dataset context. Called by HomeActivity on selection.
     * @param {{ type: 'live' }|{ type: 'edition', editionId: number }} context
     */
    setDatasetContext(context) {
        this.datasetContext = context;
    }

    /**
     * Returns the active dataset context, or null if none selected yet.
     * @returns {{ type: 'live' }|{ type: 'edition', editionId: number }|null}
     */
    getDatasetContext() {
        return this.datasetContext;
    }

    // -------------------------------------------------------------------------
    // Connection monitoring (private)
    // -------------------------------------------------------------------------

    startConnectionMonitoring() {
        this._checkConnection();
        this.connectionCheckInterval = setInterval(() => this._checkConnection(), CONNECTION_CHECK_INTERVAL);
    }

    async _checkConnection() {
        try {
            await apiClient.get(endpoints.health);
            this._dispatchConnectionEvent('connected');
        } catch {
            this._dispatchConnectionEvent('disconnected');
        }
    }

    _dispatchConnectionEvent(status) {
        this.connectionStatus = status;
        window.dispatchEvent(new CustomEvent('connection:change', { detail: { status } }));
    }

    getConnectionStatus() {
        return this.connectionStatus;
    }

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------

    cleanup() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    /** @param {string} str @returns {string} */
    _capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}