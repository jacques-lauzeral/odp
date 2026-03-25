import { apiClient } from '../../shared/api-client.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay
} from '/shared/src/index.js';

/**
 * PlanningActivity - Deployment and Implementation Planning
 *
 * Top-level activity providing two planning perspectives:
 *   - ON Plan (Phase 1): ON tree + Gantt + details panel  [active]
 *   - OC Plan (Phase 2): placeholder                      [disabled]
 *
 * Owns setup data loading, edition context resolution, tab switching,
 * and delegates pane coordination to ONPlanning.
 */
export default class PlanningActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.setupData = null;
        this.currentTab = 'on-plan';

        // ONPlanning instance - created on first ON Plan activation
        this.onPlanEntity = null;

        // Edition context (resolved from edition picker, same as Elaboration)
        this.editionContext = 'repository';
    }

    // ====================
    // LIFECYCLE
    // ====================

    async render(container, subPath = []) {
        this.container = container;

        try {
            this.renderLoadingState();
            await this.loadSetupData();
            this.renderUI();
            this.bindEvents();
            await this.activateTab(this.currentTab);
        } catch (error) {
            console.error('Failed to render Planning Activity:', error);
            this.renderError(error);
        }
    }

    cleanup() {
        if (this.onPlanEntity?.cleanup) {
            this.onPlanEntity.cleanup();
        }
        this.container = null;
        this.onPlanEntity = null;
        this.setupData = null;
    }

    // ====================
    // SETUP DATA
    // ====================

    async loadSetupData() {
        try {
            const [
                stakeholderCategories,
                domains,
                referenceDocuments,
                waves,
                requirements
            ] = await Promise.all([
                apiClient.get('/stakeholder-categories'),
                apiClient.get('/domains'),
                apiClient.get('/reference-documents'),
                apiClient.get('/waves'),
                apiClient.get('/operational-requirements')
            ]);

            this.setupData = {
                stakeholderCategories: stakeholderCategories || [],
                domains: domains || [],
                referenceDocuments: referenceDocuments || [],
                waves: waves || [],
                requirements: requirements || []
            };
        } catch (error) {
            throw new Error(`Failed to load setup data: ${error.message}`);
        }
    }

    // ====================
    // RENDERING
    // ====================

    renderLoadingState() {
        this.container.innerHTML = `
            <div class="planning-activity">
                <div class="planning-workspace">
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>Loading setup data...</p>
                    </div>
                </div>
            </div>
        `;
    }

    renderUI() {
        this.container.innerHTML = `
            <div class="planning-activity">
                <div class="planning-workspace">
                    <!-- Tab bar -->
                    <div class="interaction-tabs">
                        <button class="interaction-tab interaction-tab--active" data-tab="on-plan">
                            ON Deployment &amp; Implementation Plan
                        </button>
                        <button class="interaction-tab interaction-tab--disabled" data-tab="oc-plan" disabled title="Coming soon">
                            OC Deployment &amp; Implementation Plan
                        </button>
                    </div>

                    <!-- Tab content -->
                    <div class="planning-tab-content" id="planningTabContent">
                        <!-- Populated by activateTab() -->
                    </div>
                </div>
            </div>
        `;
    }

    renderError(error) {
        this.container.innerHTML = `
            <div class="planning-activity">
                <div class="planning-workspace">
                    <div class="error-container">
                        <h3>Failed to Load Planning Activity</h3>
                        <p><strong>Error:</strong> ${error.message}</p>
                        <button class="btn btn-primary" onclick="window.location.reload()">
                            Reload Page
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // ====================
    // TAB MANAGEMENT
    // ====================

    bindEvents() {
        const tabs = this.container.querySelectorAll('.interaction-tab:not(.interaction-tab--disabled)');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabKey = e.currentTarget.dataset.tab;
                if (tabKey !== this.currentTab) {
                    this.switchTab(tabKey);
                }
            });
        });
    }

    async switchTab(tabKey) {
        // Deactivate current tab entity
        if (this.currentTab === 'on-plan' && this.onPlanEntity?.onDeactivated) {
            this.onPlanEntity.onDeactivated();
        }

        this.currentTab = tabKey;

        // Update tab active state
        this.container.querySelectorAll('.interaction-tab').forEach(tab => {
            tab.classList.toggle('interaction-tab--active', tab.dataset.tab === tabKey);
        });

        await this.activateTab(tabKey);
    }

    async activateTab(tabKey) {
        const contentContainer = this.container.querySelector('#planningTabContent');
        if (!contentContainer) return;

        if (tabKey === 'on-plan') {
            await this.activateONPlan(contentContainer);
        } else if (tabKey === 'oc-plan') {
            this.renderOCPlanPlaceholder(contentContainer);
        }
    }

    // ====================
    // ON PLAN TAB
    // ====================

    async activateONPlan(container) {
        // Lazy-create ONPlanning on first activation
        if (!this.onPlanEntity) {
            const { default: ONPlanning } = await import('./on-planning.js');
            this.onPlanEntity = new ONPlanning(this.app, this.setupData, {
                editionContext: this.editionContext
            });
        }

        await this.onPlanEntity.render(container);
    }

    // ====================
    // OC PLAN TAB (placeholder)
    // ====================

    renderOCPlanPlaceholder(container) {
        container.innerHTML = `
            <div class="planning-placeholder">
                <div class="icon">🚧</div>
                <h3>OC Deployment &amp; Implementation Plan</h3>
                <p>This perspective is planned for a future release.</p>
            </div>
        `;
    }

    // ====================
    // EDITION CONTEXT (future: wire to edition picker)
    // ====================

    async buildQueryParams() {
        const queryParams = {};

        if (this.editionContext &&
            this.editionContext !== 'repository' &&
            typeof this.editionContext === 'string' &&
            this.editionContext.match(/^\d+$/)) {

            const edition = await apiClient.get(`/odp-editions/${this.editionContext}`);
            if (edition.baseline?.id) queryParams.baseline = edition.baseline.id;
            if (edition.startsFromWave?.id) queryParams.fromWave = edition.startsFromWave.id;
        }

        return queryParams;
    }
}