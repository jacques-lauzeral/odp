/**
 * @file explore.js
 * @description Explore workspace shell. Edition context, R/O mode.
 *
 * The edition ID is the first URL segment after /explore:
 *   /explore/{editionId}/os
 *   /explore/{editionId}/plan
 *   etc.
 *
 * ExploreActivity owns dataset context for the edition — it calls
 * app.setDatasetContext() on mount, not HomeActivity.
 *
 * Renders a persistent level-2 tab strip and a sub-activity mount point.
 * Tab strip stays across sub-activity transitions; only the sub-container is swapped.
 *
 * Sub-path routing (after the edition ID segment):
 *   []                  → os (default)
 *   ['os', ...]         → OsActivity
 *   ['plan', ...]       → PlanActivity
 *   ['quality', ...]    → QualityActivity
 *   ['narrative', ...]  → NarrativeActivity
 *   ['setup', ...]      → SetupActivity
 *
 * Edition change detection:
 *   handleSubPath compares the incoming edition ID against _currentEditionId.
 *   If different, cleanup() + render() are called to fully re-initialize the shell.
 */
import { errorHandler } from '../../../shared/error-handler.js';
import { dom } from '../../../shared/utils.js';

const SUB_ACTIVITIES = {
    os:        () => import('../shared/os/os.js'),
    plan:      () => import('../shared/plan/plan.js'),
    quality:   () => import('../shared/quality/quality.js'),
    narrative: () => import('../shared/narrative/narrative.js'),
    setup:     () => import('../setup/setup.js'),
};

const TABS = [
    { key: 'os',        label: 'O*s'       },
    { key: 'narrative', label: 'Narrative' },
    { key: 'plan',      label: 'Plan'      },
    { key: 'quality',   label: 'Quality'   },
    { key: 'setup',     label: 'Setup'     },
];

const DEFAULT_SUB = 'os';

export default class ExploreActivity {
    /** @param {import('../../../app.js').App} app */
    constructor(app) {
        this.app = app;
        this.container       = null;
        this.subContainer    = null;
        this._subActivities  = {};
        this._currentSubName = null;
        this._currentEditionId = null;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        const editionId = this._extractEditionId(subPath);
        if (!editionId) { this.app.navigate('/'); return; }

        this._currentEditionId = editionId;
        this.app.setDatasetContext({ type: 'edition', editionId });

        this.container = container;
        this._renderShell();
        return this._route(subPath.slice(1));
    }

    async handleSubPath(subPath) {
        const editionId = this._extractEditionId(subPath);
        if (!editionId) { this.app.navigate('/'); return; }

        if (editionId !== this._currentEditionId) {
            await this.cleanup();
            await this.render(this.app.container, subPath);
            return;
        }

        return this._route(subPath.slice(1));
    }

    async cleanup() {
        for (const sub of Object.values(this._subActivities)) {
            await sub.cleanup?.();
        }
        this._subActivities    = {};
        this._currentSubName   = null;
        this._currentEditionId = null;
        this.container         = null;
        this.subContainer      = null;
    }

    // -------------------------------------------------------------------------
    // Shell
    // -------------------------------------------------------------------------

    _renderShell() {
        const basePath = `/explore/${this._currentEditionId}`;

        this.container.innerHTML = `
            <div class="workspace-shell">
                <nav class="interaction-tabs workspace-shell__tabs" id="workspace-tabs">
                    ${TABS.map(t => `
                        <button
                            class="interaction-tab"
                            data-sub="${t.key}"
                            data-path="${basePath}/${t.key}"
                        ><span class="interaction-tab__name">${t.label}</span></button>
                    `).join('')}
                    <span class="workspace-shell__mode-badge workspace-shell__mode-badge--ro">Edition ${this._currentEditionId} · Read only</span>
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

        // Redirect bare /explore/{editionId} to /explore/{editionId}/os
        if (!subPath[0] || !SUB_ACTIVITIES[subPath[0]]) {
            window.history.replaceState({}, '', `/explore/${this._currentEditionId}/${subName}`);
        }

        this._updateActiveTab(subName);

        try {
            const sub = await this._getSub(subName);
            if (this._currentSubName === subName && sub.handleSubPath) {
                await sub.handleSubPath(subSubPath);
            } else {
                await sub.render(this.subContainer, subSubPath);
                this._currentSubName = subName;
            }
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

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    /**
     * Extract and validate the edition ID from the first subPath segment.
     * @param {string[]} subPath
     * @returns {number|null}
     */
    _extractEditionId(subPath) {
        const id = parseInt(subPath[0], 10);
        return Number.isFinite(id) ? id : null;
    }
}