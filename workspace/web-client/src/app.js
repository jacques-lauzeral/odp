/**
 * @file app.js
 * @description Core application class. Owns connection monitoring, activity lifecycle,
 * and user state. Navigation is delegated to Router.
 */
import { errorHandler } from './shared/error-handler.js';
import { apiClient } from './shared/api-client.js';
import { endpoints } from './config/api.js';
import { Router } from './shared/router.js';
import Header from './components/header.js';

const CONNECTION_CHECK_INTERVAL = 60000;

/**
 * Load an activity module by key.
 * Import paths must be string literals for Vite's static analyser — no variable imports.
 * @param {string} activityKey
 * @returns {Promise<object>} ES module
 */
async function loadActivityModule(activityKey) {
    switch (activityKey) {
        case 'home':      return import('./activities/home/home.js');
        case 'elaborate': return import('./activities/workspace/elaborate/elaborate.js');
        case 'explore':   return import('./activities/workspace/explore/explore.js');
        case 'manage':    return import('./activities/manage/manage.js');
        case 'converse':  return import('./activities/converse/converse.js');
        default: throw new Error(`No module registered for activity key: ${activityKey}`);
    }
}

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
        this._setupData = null;        // lazy-loaded shared cache
        this._setupDataPromise = null; // in-flight guard
        this._domains = null;          // config-derived domain list, cached permanently
        this._domainsPromise = null;   // in-flight guard
        this._chapters = null;         // config-driven chapter list, cached permanently
        this._chaptersPromise = null;  // in-flight guard
        this._ostars = null;           // O* summary list, TTL-refreshed
        this._ostarsLoadedAt = null;   // timestamp of last successful fetch
        this._ostarsPromise = null;    // in-flight guard
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
            this.header.restoreUser();
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
                const module = await loadActivityModule(activityKey);
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
        if (this.header) this.header.onUserChange();
        // Refresh Home if active — Live Dataset row visibility depends on user state
        if (this.currentActivity?.name === 'home') {
            this.currentActivity.onUserChange();
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
        if (this.header) this.header.onContextChange();
    }

    /**
     * Returns the active dataset context, or null if none selected yet.
     * @returns {{ type: 'live' }|{ type: 'edition', editionId: number }|null}
     */
    getDatasetContext() {
        return this.datasetContext;
    }

    // -------------------------------------------------------------------------
    // Setup data (public — lazy-loaded, shared cache)
    // -------------------------------------------------------------------------

    /**
     * Returns setup data, fetching from the server on first call.
     * Subsequent calls return the cached result. Parallel calls share one fetch.
     *
     * Shape: { stakeholderCategories, referenceDocuments, waves }
     *
     * @returns {Promise<object>}
     */
    async getSetupData() {
        if (this._setupData) return this._setupData;

        if (this._setupDataPromise) return this._setupDataPromise;

        this._setupDataPromise = Promise.all([
            apiClient.get('/stakeholder-categories'),
            apiClient.get('/reference-documents'),
            apiClient.get('/waves'),
        ]).then(([stakeholderCategories, referenceDocuments, waves]) => {
            this._setupData = {
                stakeholderCategories: stakeholderCategories ?? [],
                referenceDocuments:    referenceDocuments    ?? [],
                waves:                 waves                 ?? [],
            };
            this._setupDataPromise = null;
            return this._setupData;
        }).catch(error => {
            this._setupDataPromise = null;
            throw error;
        });

        return this._setupDataPromise;
    }

    /**
     * Invalidate the setup data cache. Call after any setup entity CRUD operation
     * so the next consumer gets fresh data.
     */
    invalidateSetupData() {
        this._setupData = null;
        this._setupDataPromise = null;
    }

    // -------------------------------------------------------------------------
    // Domains (public — config-derived, cached permanently)
    // -------------------------------------------------------------------------

    /**
     * Returns domain list derived from chapter config, fetching on first call.
     * Domains are config-driven and stable at runtime — never invalidated.
     * Parallel calls share one in-flight fetch.
     *
     * Shape: { key: string, title: string }[]
     *
     * @returns {Promise<Array<{ key: string, title: string }>>}
     */
    async getDomains() {
        if (this._domains) return this._domains;

        if (this._domainsPromise) return this._domainsPromise;

        this._domainsPromise = apiClient.get('/chapters').then(chapters => {
            const seen = new Set();
            this._domains = (chapters ?? [])
                .filter(c => c.domain && !seen.has(c.domain) && seen.add(c.domain))
                .map(c => ({ key: c.domain, title: c.title ?? c.domain }));
            this._domainsPromise = null;
            return this._domains;
        }).catch(error => {
            this._domainsPromise = null;
            throw error;
        });

        return this._domainsPromise;
    }

    // -------------------------------------------------------------------------
    // Chapters (public — config-driven, cached permanently)
    // -------------------------------------------------------------------------

    /**
     * Returns all chapters with their osHierarchy, fetching on first call.
     * Chapters are config-driven and stable at runtime — never invalidated.
     * Parallel calls share one in-flight fetch.
     *
     * @returns {Promise<Array>}
     */
    async getChapters() {
        if (this._chapters) return this._chapters;

        if (this._chaptersPromise) return this._chaptersPromise;

        this._chaptersPromise = apiClient.listChapters().then(chapters => {
            this._chapters = chapters ?? [];
            this._chaptersPromise = null;
            return this._chapters;
        }).catch(error => {
            this._chaptersPromise = null;
            throw error;
        });

        return this._chaptersPromise;
    }

    // -------------------------------------------------------------------------
    // O* summary list (public — TTL-refreshed, 5 minutes)
    // -------------------------------------------------------------------------

    /**
     * Returns all O* as summary objects { itemId, type, code, title, domain }, fetching
     * on first call. Serves stale data while re-fetching in the background after
     * the TTL (5 minutes). Parallel calls share one in-flight fetch.
     *
     * @returns {Promise<Array<{itemId: number, type: string, code: string, title: string, domain: string|null}>>}
     */
    async getOStars() {
        const TTL = 5 * 60 * 1000;
        const stale = this._ostarsLoadedAt && (Date.now() - this._ostarsLoadedAt) > TTL;

        if (this._ostars && !stale) return this._ostars;

        if (this._ostars && stale && !this._ostarsPromise) {
            // Stale-while-revalidate: serve existing data, refresh in background
            this._fetchOStars().catch(err => console.warn('[App] background O* refresh failed:', err));
            return this._ostars;
        }

        if (this._ostarsPromise) return this._ostarsPromise;

        return this._fetchOStars();
    }

    /** @private */
    async _fetchOStars() {
        this._ostarsPromise = apiClient.listOStars().then(ostars => {
            this._ostars = (ostars ?? []).map(o => ({
                itemId: o.itemId ?? o.id,
                type:   o.type?.toLowerCase(),
                code:   o.code,
                title:  o.title,
                domain: o.domain ?? null,
            }));
            this._ostarsLoadedAt = Date.now();
            this._ostarsPromise  = null;
            return this._ostars;
        }).catch(error => {
            this._ostarsPromise = null;
            throw error;
        });
        return this._ostarsPromise;
    }

    /**
     * Find a single O* summary by itemId. Returns null if not found.
     * @param {number|string} itemId
     * @returns {Promise<{itemId: number, type: string, code: string, title: string}|null>}
     */
    async findOStar(itemId) {
        const ostars = await this.getOStars();
        return ostars.find(o => o.itemId === Number(itemId)) ?? null;
    }

    /**
     * Invalidate the O* cache. Call after any O* create/update/delete operation.
     */
    invalidateOStars() {
        this._ostars        = null;
        this._ostarsLoadedAt = null;
        this._ostarsPromise  = null;
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