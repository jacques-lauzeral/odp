import { apiClient } from '../../shared/api-client.js';
import TemporalGrid from '../../components/odp/temporal-grid.js';
import RequirementForm from '../common/requirement-form.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay
} from '/shared/src/index.js';
import { formatTentativeArray } from '/shared/src/model/year-period.js';

/**
 * ONPlanning - ON Deployment and Implementation Plan
 *
 * Two-pane layout:
 *   Left  : TemporalGrid (separator/group/child rows, year-based axis)
 *   Right : Selected ON details (RequirementForm read-only view)
 *
 * Row hierarchy in TemporalGrid:
 *   separator  → DrG label (e.g. "NM B2B")
 *   group      → root ON (refinesParents empty), collapsible
 *   child      → ON with refinesParents, indented under its parent group
 */
export default class ONPlanning {
    constructor(app, setupData, options = {}) {
        this.app = app;
        this.setupData = setupData;
        this.editionContext = options.editionContext || 'repository';

        this.container = null;

        // Loaded data
        this.onData = [];

        // Component instances
        this.temporalGrid = null;
        this.requirementForm = null;

        // Selection
        this.selectedON = null;

        // Preserved tab index across selection changes
        this.currentTabIndex = 0;

        // Pane split ratio: fraction of width allocated to temporal grid (0.2–0.9)
        this.splitRatio = 0.67;
    }

    // ====================
    // LIFECYCLE
    // ====================

    async render(container) {
        this.container = container;
        try {
            this.renderLayout();
            await this.loadData();
            this.initializeRequirementForm();
            this.initializeTemporalGrid();
            this.renderTemporalGrid();
        } catch (error) {
            console.error('ONPlanning: render failed', error);
            this.renderError(error);
        }
    }

    onDeactivated() {}

    cleanup() {
        if (this.temporalGrid?.cleanup) this.temporalGrid.cleanup();
        this.container = null;
        this.temporalGrid = null;
        this.requirementForm = null;
    }

    // ====================
    // DATA LOADING
    // ====================

    async loadData() {
        const queryParams = await this.buildQueryParams();
        const queryString = Object.keys(queryParams).length > 0
            ? '?' + new URLSearchParams(queryParams).toString()
            : '';

        const requirements = await apiClient.get(`/operational-requirements${queryString}`);
        this.onData = (requirements || []).filter(r => r.type === 'ON');

        console.log(`ONPlanning: loaded ${this.onData.length} ONs`);
    }

    async buildQueryParams() {
        const queryParams = {};
        if (this.editionContext &&
            this.editionContext !== 'repository' &&
            typeof this.editionContext === 'string' &&
            this.editionContext.match(/^\d+$/)) {
            const edition = await apiClient.get(`/odp-editions/${this.editionContext}`);
            if (edition.baseline?.id)       queryParams.baseline = edition.baseline.id;
            if (edition.startsFromWave?.id) queryParams.fromWave = edition.startsFromWave.id;
        }
        return queryParams;
    }

    // ====================
    // LAYOUT
    // ====================

    renderLayout() {
        this.container.innerHTML = `
            <div class="on-plan-layout" id="onPlanLayout"
                 style="grid-template-columns: ${this.splitRatio}fr 4px ${1 - this.splitRatio}fr">
                <!-- Left pane: temporal grid -->
                <div class="on-plan-grid-pane" id="onGridPane">
                    <div class="pane-content" id="onGridContent">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <p>Loading plan...</p>
                        </div>
                    </div>
                </div>

                <!-- Pane resize divider -->
                <div class="on-plan-split-divider" id="onPlanSplitDivider" title="Drag to resize"></div>

                <!-- Right pane: details -->
                <div class="on-plan-details-pane" id="onDetailsPane">
                    <div class="pane-content" id="onDetailsContent">
                        <div class="no-selection-message">
                            <div class="icon">📋</div>
                            <h3>No ON selected</h3>
                            <p>Select an Operational Need to view its details.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._bindSplitDivider();
    }

    renderError(error) {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="error-state">
                <h3>Failed to Load ON Plan</h3>
                <p>Error: ${error.message}</p>
            </div>
        `;
    }

    _bindSplitDivider() {
        const divider = this.container.querySelector('#onPlanSplitDivider');
        const layout  = this.container.querySelector('#onPlanLayout');
        if (!divider || !layout) return;

        let startX = 0;
        let startRatio = 0;

        const onMouseMove = (e) => {
            const totalWidth = layout.getBoundingClientRect().width;
            if (totalWidth === 0) return;
            const delta = e.clientX - startX;
            const newRatio = Math.max(0.2, Math.min(0.85, startRatio + delta / totalWidth));
            this.splitRatio = newRatio;
            layout.style.gridTemplateColumns = `${newRatio}fr 4px ${1 - newRatio}fr`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };

        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startRatio = this.splitRatio;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    // ====================
    // REQUIREMENT FORM
    // ====================

    initializeRequirementForm() {
        this.requirementForm = new RequirementForm(
            { endpoint: '/operational-requirements' },
            {
                setupData: this.setupData,
                currentTabIndex: this.currentTabIndex,
                onTabChange: (index) => {
                    this.currentTabIndex = index;
                }
            }
        );
    }

    // ====================
    // TEMPORAL GRID
    // ====================

    initializeTemporalGrid() {
        this.temporalGrid = new TemporalGrid({
            minYear: 2025,
            maxYear: 2045
        });

        this.temporalGrid.setMilestoneRendering({
            mode: 'icon',
            eventTypes: {
                'period-start': { icon: '▶', colour: '#2563eb' },
                'period-end':   { icon: '◀', colour: '#2563eb' }
            }
        });

        this.temporalGrid.addSelectionListener((id) => {
            this.handleGridSelect(id);
        });

        this.temporalGrid.addTimeIntervalUpdateListener(() => {
            this._feedTemporalGrid();
        });
    }

    renderTemporalGrid() {
        const gridContainer = this.container.querySelector('#onGridContent');
        if (!gridContainer || !this.temporalGrid) return;

        const { startYear, endYear } = this._resolveTimeInterval();
        this.temporalGrid.setTimeInterval(startYear, endYear);
        this.temporalGrid.setTicks(this._buildYearTicks(startYear, endYear));

        this._feedTemporalGrid();

        this.temporalGrid.render(gridContainer);
    }

    /**
     * Build all rows from ON data and feed into TemporalGrid.
     *
     * Row structure:
     *   separator  — one per distinct DrG value
     *   group      — root ONs (refinesParents empty), expandable
     *   child      — ONs with a refinesParents entry, nested under parent group
     *
     * Ordering within each DrG: root ONs first (alphabetical by title),
     * then children immediately after their parent group.
     */
    _feedTemporalGrid() {
        if (!this.temporalGrid) return;
        this.temporalGrid.clearRows();

        // Group ONs by DrG
        const byDrg = new Map();
        const noDrg = [];

        this.onData.forEach(on => {
            if (on.drg) {
                if (!byDrg.has(on.drg)) byDrg.set(on.drg, []);
                byDrg.get(on.drg).push(on);
            } else {
                noDrg.push(on);
            }
        });

        // Helper: determine if an ON is a root (no refinesParents)
        const isRoot = (on) => !on.refinesParents || on.refinesParents.length === 0;

        // Helper: get parent id string
        const parentIdOf = (on) => {
            if (!on.refinesParents || on.refinesParents.length === 0) return null;
            const ref = on.refinesParents[0];
            return String(ref.itemId || ref.id || ref);
        };

        // Helper: emit group row + its children (or flat row if no children)
        const emitGroup = (rootOn, allOnsInDrg) => {
            const groupId = String(rootOn.itemId || rootOn.id);
            const label = rootOn.code ? `${rootOn.code} – ${rootOn.title}` : rootOn.title;
            const milestones = this._buildMilestones(rootOn);

            const children = allOnsInDrg
                .filter(on => parentIdOf(on) === groupId)
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

            if (children.length > 0) {
                this.temporalGrid.addGroupRow(groupId, label, milestones);
                children.forEach(child => {
                    const childId = String(child.itemId || child.id);
                    const childLabel = child.code ? `${child.code} – ${child.title}` : child.title;
                    this.temporalGrid.addChildRow(childId, groupId, childLabel, this._buildMilestones(child));
                });
            } else {
                this.temporalGrid.addRow(groupId, label, milestones);
            }
        };

        // Emit rows per DrG
        byDrg.forEach((ons, drg) => {
            const drgLabel = getDraftingGroupDisplay(drg) || drg;
            this.temporalGrid.addSeparatorRow(`drg:${drg}`, drgLabel);

            const roots = ons
                .filter(isRoot)
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

            roots.forEach(root => emitGroup(root, ons));
        });

        // ONs with no DrG — emit as flat group rows
        if (noDrg.length > 0) {
            this.temporalGrid.addSeparatorRow('drg:none', '(No DrG)');
            noDrg.filter(isRoot)
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                .forEach(root => emitGroup(root, noDrg));
        }

        // Restore selection
        if (this.selectedON) {
            this.temporalGrid.setTimeLineSelected(
                String(this.selectedON.itemId || this.selectedON.id), true
            );
        }
    }

    /**
     * Build period-start / period-end milestones from an ON's tentative field.
     */
    _buildMilestones(on) {
        if (!Array.isArray(on.tentative) || on.tentative.length < 2) return [];
        const [startYear, endYear] = on.tentative;
        return [
            {
                label: 'Start', description: 'Expected implementation start',
                eventTypes: ['period-start'], date: new Date(startYear, 0, 1)
            },
            {
                label: 'End', description: 'Expected implementation end',
                eventTypes: ['period-end'], date: new Date(endYear + 1, 0, 1)
            }
        ];
    }

    _resolveTimeInterval() {
        const years = this.onData
            .filter(on => Array.isArray(on.tentative) && on.tentative.length === 2)
            .flatMap(on => on.tentative);

        if (years.length > 0) {
            return { startYear: Math.min(...years), endYear: Math.max(...years) + 1 };
        }
        const now = new Date().getFullYear();
        return { startYear: now, endYear: now + 4 };
    }

    _buildYearTicks(startYear, endYear) {
        const ticks = [];
        for (let y = startYear; y <= endYear; y++) {
            ticks.push({ label: String(y), date: new Date(y, 0, 1) });
        }
        return ticks;
    }

    // ====================
    // SELECTION & DETAILS
    // ====================

    handleGridSelect(id) {
        const on = this.onData.find(o => String(o.itemId || o.id) === String(id));
        if (!on) return;
        this.selectedON = on;
        this.renderDetails(on);
    }

    getCurrentTabInPanel(container) {
        const activeTab = container.querySelector('.tab-header.active');
        return activeTab ? parseInt(activeTab.dataset.tab, 10) : 0;
    }

    switchTabInPanel(container, tabIndex) {
        container.querySelectorAll('.tab-header').forEach(h =>
            h.classList.toggle('active', h.dataset.tab === tabIndex.toString()));
        container.querySelectorAll('.tab-panel').forEach(p =>
            p.classList.toggle('active', p.dataset.tab === tabIndex.toString()));

        this.requirementForm.context.currentTabIndex = tabIndex;
        this.currentTabIndex = tabIndex;
    }

    async renderDetails(on) {
        const detailsContainer = this.container.querySelector('#onDetailsContent');
        if (!detailsContainer || !this.requirementForm) return;

        const currentTab = this.getCurrentTabInPanel(detailsContainer);

        detailsContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
            </div>
        `;

        try {
            this.requirementForm.context.currentTabIndex = currentTab;
            const html = await this.requirementForm.generateReadOnlyView(on, true);

            detailsContainer.innerHTML = html;

            // Point currentModal at the details container so all initializers
            // can locate their placeholders via the standard currentModal queries.
            this.requirementForm.currentModal = detailsContainer;
            this.requirementForm.currentItem  = on;
            this.requirementForm.currentMode  = 'read';

            this.requirementForm.initializeAnnotatedMultiselects();
            this.requirementForm.initializeReferenceListManagers();
            this.requirementForm.initializeReferenceManagers();
            this.requirementForm.initializeRichtextReadOnly(detailsContainer);

            // Restore currentModal to null — ONPlanning does not own a modal.
            this.requirementForm.currentModal = null;

            if (currentTab !== null && currentTab !== 0) {
                this.switchTabInPanel(detailsContainer, currentTab);
            }

        } catch (error) {
            console.error('ONPlanning: failed to render ON details', error);
            detailsContainer.innerHTML = `
                <div class="error-state">
                    <p>Failed to load details: ${error.message}</p>
                </div>
            `;
        }
    }
}