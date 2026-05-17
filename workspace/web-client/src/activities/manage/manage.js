/**
 * @file manage.js
 * @description Manage activity shell. Restricted to integrators.
 *
 * Sub-path routing:
 *   []                    → editions (default)
 *   ['editions', ...]     → EditionsActivity
 *   ['admin', ...]        → AdminActivity (dummy)
 */
import { errorHandler } from '../../shared/error-handler.js';

const SUB_ACTIVITIES = {
    editions: () => import('./editions/editions.js'),
    admin:    () => import('./admin/admin.js'),
};

const DEFAULT_SUB = 'editions';

export default class ManageActivity {
    /**
     * @param {import('../../app.js').App} app
     */
    constructor(app) {
        this.app = app;
        this.container = null;
        this._subActivities  = {};
        this._currentSubName = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;
        return this._route(subPath);
    }

    async handleSubPath(subPath) {
        return this._route(subPath);
    }

    async cleanup() {
        for (const sub of Object.values(this._subActivities)) {
            await sub.cleanup?.();
        }
        this._subActivities  = {};
        this._currentSubName = null;
        this.container       = null;
    }

    // -------------------------------------------------------------------------
    // Routing
    // -------------------------------------------------------------------------

    async _route(subPath) {
        const subName    = (subPath[0] && SUB_ACTIVITIES[subPath[0]]) ? subPath[0] : DEFAULT_SUB;
        const subSubPath = subPath[0] === subName ? subPath.slice(1) : subPath;

        try {
            const sub = await this._getSub(subName);
            await sub.render(this.container, subSubPath);
            this._currentSubName = subName;
        } catch (error) {
            errorHandler.handle(error, `manage-${subName}`);
        }
    }

    async _getSub(name) {
        if (!this._subActivities[name]) {
            const loader = SUB_ACTIVITIES[name];
            if (!loader) throw new Error(`No sub-activity registered for: ${name}`);
            const { default: SubClass } = await loader();
            this._subActivities[name] = new SubClass(this.app);
        }
        return this._subActivities[name];
    }
}