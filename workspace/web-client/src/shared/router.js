/**
 * @file router.js
 * @description Client-side router for ODIP Space. Owns the route table, prefix matching,
 * navigation, and popstate handling. Does not manage activity lifecycle — delegates to App
 * via the onNavigate callback.
 *
 * Route table entries:
 * @typedef {Object} Route
 * @property {string}   prefix      - URL prefix matched against window.location.pathname
 * @property {string}   activityKey - Logical key passed to onNavigate (maps to activity loader)
 * @property {boolean}  protected   - If true, redirect to '/' when no user is set
 *
 * Routes are matched in declaration order — more specific prefixes must come first.
 */

/** @type {Route[]} */
const ROUTES = [
    { prefix: '/elaborate', activityKey: 'elaborate', protected: true  },
    { prefix: '/explore',   activityKey: 'explore',   protected: false },
    { prefix: '/manage',    activityKey: 'manage',    protected: true  },
    { prefix: '/converse', activityKey: 'converse', protected: false },
    { prefix: '/',          activityKey: 'home',      protected: false },
];

export class Router {
    /**
     * @param {object}   options
     * @param {Function} options.onNavigate  - Called with (activityKey, subPath[]) on each route resolution
     * @param {Function} options.getUser     - Returns current user object or null
     * @param {Function} options.onRouteChange - Called after every successful route resolution (e.g. for Header update)
     */
    constructor({ onNavigate, getUser, onRouteChange }) {
        this._onNavigate = onNavigate;
        this._getUser = getUser;
        this._onRouteChange = onRouteChange;
        this._activeSegment = '';
    }

    /**
     * Attach popstate listener and resolve the initial route.
     * Call once during App.initialize().
     */
    start() {
        window.addEventListener('popstate', () => this._handleRoute());
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (link && link.getAttribute('href')?.startsWith('/')) {
                event.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });
        return this._handleRoute();
    }

    /**
     * Navigate to a path, pushing a history entry.
     * @param {string} path
     */
    navigate(path) {
        if (window.location.pathname !== path) {
            window.history.pushState({}, '', path);
        }
        return this._handleRoute();
    }

    /**
     * The first path segment of the currently active route (e.g. 'elaborate', 'manage').
     * Empty string on Home. Used by Header to derive the active nav tab without coupling
     * to the router's internal route table.
     * @returns {string}
     */
    activeSegment() {
        return this._activeSegment;
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    async _handleRoute() {
        const path = window.location.pathname;
        const route = this._match(path);

        if (!route) {
            this.navigate('/');
            return;
        }

        if (route.protected && !this._getUser()) {
            this.navigate('/');
            return;
        }

        this._activeSegment = route.prefix === '/' ? '' : route.prefix.replace(/^\//, '');

        const subPath = path
            .slice(route.prefix.length)
            .split('/')
            .filter(s => s.length > 0);

        await this._onNavigate(route.activityKey, subPath);
        this._onRouteChange();
    }

    /**
     * Find the first route whose prefix matches the given path.
     * @param {string} path
     * @returns {Route|undefined}
     */
    _match(path) {
        return ROUTES.find(route =>
            route.prefix === '/'
                ? true
                : path === route.prefix || path.startsWith(route.prefix + '/')
        );
    }
}