/**
 * @file explore.js
 * @description Explore workspace shell. Edition context, R/O mode.
 * Edition ID is read from app.getDatasetContext() on each render.
 *
 * Renders a persistent level-2 tab strip and a sub-activity mount point.
 * Tab strip stays across sub-activity transitions; only the sub-container is swapped.
 *
 * Sub-path routing mirrors Elaborate exactly — same sub-activities and tabs.
 * Context difference (live vs edition, R/W vs R/O) is transparent to
 * sub-activities via app.getDatasetContext().
 *
 *   []                  → os (default)
 *   ['os', ...]         → OsActivity
 *   ['plan', ...]       → PlanActivity
 *   ['quality', ...]    → QualityActivity
 *   ['notes', ...]      → NotesActivity
 *   ['setup', ...]      → SetupActivity
 */
import { errorHandler } from '../../../shared/error-handler.js';
import { dom } from '../../../shared/utils.js';

const SUB_ACTIVITIES = {
    os:      () => import('../shared/os/os.js'),
    plan:    () => import('../shared/plan/plan.js'),
    quality: () => import('../shared/quality/quality.js'),
    notes:   () => import('../shared/notes/notes.js'),
    setup:   () => import('../setup/setup.js'),
};

const TABS = [
    { key: 'os',      label: 'O*s'     },
    { key: 'plan',    label: 'Plan'    },
    { key: 'quality', label: 'Quality' },
    { key: 'notes',   label: 'Notes'   },
    { key: 'setup',   label: 'Setup'   },
];

const DEFAULT_SUB = 'os';
const BASE_PATH   = '/explore';

export default class ExploreActivity {
    /** @param {import('../../../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container    = null;
        this.subContainer = null;
        this._subActivities  = {};
        this._currentSubName = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;
        this._renderShell();
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
        this.subContainer    = null;
    }

    // -------------------------------------------------------------------------
    // Shell
    // -------------------------------------------------------------------------

    _renderShell() {
        this.container.innerHTML = `
            <div class="workspace-shell">
                <nav class="interaction-tabs workspace-shell__tabs" id="workspace-tabs">
                    ${TABS.map(t => `
                        <button
                            class="interaction-tab"
                            data-sub="${t.key}"
                            data-path="${BASE_PATH}/${t.key}"
                        ><span class="interaction-tab__name">${t.label}</span></button>
                    `).join('')}
                </nav>
                <div class="workspace-shell__content" id="workspace-content"></div>
            </div>
        `;
        this.subContainer = dom.find('#workspace-content', this.container);
        this._attachTabListeners();
    }

    _attachTabListeners() {
        dom.findAll('.interaction-tab', this.container).forEach(btn => {
            btn.addEventListener('click', () => {
                this.app.navigate(btn.dataset.path);
            });
        });
    }

    _updateActiveTab(subName) {
        dom.findAll('.interaction-tab', this.container).forEach(btn => {
            btn.classList.toggle('interaction-tab--active', btn.dataset.sub === subName);
        });
    }

    // -------------------------------------------------------------------------
    // Routing
    // -------------------------------------------------------------------------

    async _route(subPath) {
        const subName    = (subPath[0] && SUB_ACTIVITIES[subPath[0]]) ? subPath[0] : DEFAULT_SUB;
        const subSubPath = subPath[0] === subName ? subPath.slice(1) : subPath;

        // Redirect bare /explore to /explore/os
        if (!subPath[0] || !SUB_ACTIVITIES[subPath[0]]) {
            window.history.replaceState({}, '', `${BASE_PATH}/${subName}`);
        }

        this._updateActiveTab(subName);

        try {
            const sub = await this._getSub(subName);
            await sub.render(this.subContainer, subSubPath);
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