/**
 * @file explore.js
 * @description Explore workspace shell. Edition context, R/O mode.
 * Edition ID is read from app.getDatasetContext() on each render.
 *
 * Sub-path routing mirrors Elaborate exactly — same sub-activities,
 * same routing logic. Context difference (live vs edition, R/W vs R/O)
 * is transparent to sub-activities via app.getDatasetContext().
 *
 *   []                  → os (default)
 *   ['os', ...]         → OsActivity
 *   ['plan', ...]       → PlanActivity (dummy)
 *   ['setup', ...]      → SetupActivity (dummy — read-only setup view)
 *   ['quality', ...]    → QualityActivity (dummy)
 *   ['notes', ...]      → NotesActivity (dummy)
 */
import { errorHandler } from '../../../shared/error-handler.js';

const SUB_ACTIVITIES = {
    os:      () => import('../shared/os/os.js'),
    plan:    () => import('../shared/plan/plan.js'),
    setup:   () => import('../setup/setup.js'),
    quality: () => import('../shared/quality/quality.js'),
    notes:   () => import('../shared/notes/notes.js'),
};

const DEFAULT_SUB = 'os';

export default class ExploreActivity {
    /**
     * @param {import('../../../app.js').App} app
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
            errorHandler.handle(error, `explore-${subName}`);
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