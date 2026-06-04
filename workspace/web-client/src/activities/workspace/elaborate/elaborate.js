/**
 * @file elaborate.js
 * @description Elaborate workspace shell. Live dataset context, R/W mode.
 *
 * Renders a persistent level-2 tab strip and a sub-activity mount point.
 * Tab strip stays across sub-activity transitions; only the sub-container is swapped.
 *
 * Sub-path routing:
 *   []                  → os (default)
 *   ['os', ...]         → OsActivity
 *   ['plan', ...]       → PlanActivity
 *   ['quality', ...]    → QualityActivity
 *   ['narrative', ...] → NarrativeActivity
 *   ['setup', ...]      → SetupActivity
 */
import { errorHandler } from '../../../shared/error-handler.js';
import { dom } from '../../../shared/utils.js';

const SUB_ACTIVITIES = {
    os:      () => import('../shared/os/os.js'),
    plan:    () => import('../shared/plan/plan.js'),
    quality: () => import('../shared/quality/quality.js'),
    narrative: () => import('../shared/narrative/narrative.js'),
    setup:   () => import('../setup/setup.js'),
};

const TABS = [
    { key: 'os',        label: 'O*s'       },
    { key: 'narrative', label: 'Narrative' },
    { key: 'plan',      label: 'Plan'      },
    { key: 'quality',   label: 'Quality'   },
    { key: 'setup',     label: 'Setup'     },
];

const DEFAULT_SUB = 'os';
const BASE_PATH   = '/elaborate';

export default class ElaborateActivity {
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
        this.app.setDatasetContext({ type: 'live' });
        this.container = container;
        this._renderShell();
        return this._route(subPath);
    }

    async handleSubPath(subPath) {
        return this._route(subPath);
    }

    /**
     * Called by App._loadActivity before switching away from this workspace.
     * Forwards to the current sub-activity's canDeactivate() if present.
     * @returns {Promise<boolean>}
     */
    async canDeactivate() {
        const currentSub = this._subActivities[this._currentSubName];
        if (currentSub?.canDeactivate) {
            return currentSub.canDeactivate();
        }
        return true;
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
                    <span class="workspace-shell__mode-badge workspace-shell__mode-badge--rw">Live dataset · Editable</span>
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
        console.log('elaborate._route', subPath, '_currentSubName:', this._currentSubName, 'subName:', subName, 'subSubPath:', subSubPath);

        // Redirect bare /elaborate to /elaborate/os
        if (!subPath[0] || !SUB_ACTIVITIES[subPath[0]]) {
            window.history.replaceState({}, '', `${BASE_PATH}/${subName}`);
        }

        this._updateActiveTab(subName);

        // Guard: if the current sub-activity has unsaved changes, ask before leaving.
        // canDeactivate() is implemented by NarrativeActivity; other sub-activities
        // don't define it and are always safe to leave.
        if (this._currentSubName !== subName) {
            const currentSub = this._subActivities[this._currentSubName];
            if (currentSub?.canDeactivate) {
                const allowed = await currentSub.canDeactivate();
                if (!allowed) {
                    // Restore the active tab highlight to the current sub-activity
                    this._updateActiveTab(this._currentSubName);
                    return;
                }
            }
        }

        try {
            const sub = await this._getSub(subName);
            if (this._currentSubName === subName && sub.handleSubPath) {
                await sub.handleSubPath(subSubPath);
            } else {
                await sub.render(this.subContainer, subSubPath);
                this._currentSubName = subName;
            }
        } catch (error) {
            errorHandler.handle(error, `elaborate-${subName}`);
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