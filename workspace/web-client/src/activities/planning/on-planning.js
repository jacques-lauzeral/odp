import { apiClient } from '../../shared/api-client.js';
import TemporalGrid from '../../components/odp/temporal-grid.js';
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
 *   Right : Selected ON details (stub — RequirementForm to follow)
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
        this.onData = [];   // All ONs
        this.orData = [];   // All ORs (for Implemented By)

        // Component instances
        this.temporalGrid = null;
        this.detailForm = null;  // RequirementForm stub

        // Selection
        this.selectedON = null;
    }

    // ====================
    // LIFECYCLE
    // ====================

    async render(container) {
        this.container = container;
        try {
            this.renderLayout();
            await this.loadData();
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
        this.detailForm = null;
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
        this.orData = (requirements || []).filter(r => r.type === 'OR');

        console.log(`ONPlanning: loaded ${this.onData.length} ONs, ${this.orData.length} ORs`);
    }

    async buildQueryParams() {
        const queryParams = {};
        if (this.editionContext &&
            this.editionContext !== 'repository' &&
            typeof this.editionContext === 'string' &&
            this.editionContext.match(/^\d+$/)) {
            const edition = await apiClient.get(`/odp-editions/${this.editionContext}`);
            if (edition.baseline?.id)      queryParams.baseline = edition.baseline.id;
            if (edition.startsFromWave?.id) queryParams.fromWave = edition.startsFromWave.id;
        }
        return queryParams;
    }

    // ====================
    // LAYOUT
    // ====================

    renderLayout() {
        this.container.innerHTML = `
            <div class="on-plan-layout">
                <!-- Left pane: temporal grid -->
                <div class="on-plan-grid-pane" id="onGridPane">
                    <div class="pane-content" id="onGridContent">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <p>Loading plan...</p>
                        </div>
                    </div>
                </div>

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
            // Re-feed on zoom change (rows unchanged, just re-render positions)
            this._feedTemporalGrid();
        });
    }

    renderTemporalGrid() {
        const gridContainer = this.container.querySelector('#onGridContent');
        if (!gridContainer || !this.temporalGrid) return;

        const { startYear, endYear } = this._resolveTimeInterval();
        this.temporalGrid.setTimeInterval(startYear, endYear);
        this.temporalGrid.setTicks(this._buildYearTicks(startYear, endYear));

        // Feed rows before render so grid has data on first _render() call
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

        // Build an ON lookup by id for parent resolution
        const onById = new Map();
        this.onData.forEach(on => {
            onById.set(String(on.itemId || on.id), on);
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

            // Children: ONs whose first refinesParent is this root
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
                // No children — flat row, not expandable
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
                eventTypes: ['period-end'], date: new Date(endYear, 0, 1)
            }
        ];
    }

    _resolveTimeInterval() {
        const years = this.onData
            .filter(on => Array.isArray(on.tentative) && on.tentative.length === 2)
            .flatMap(on => on.tentative);

        if (years.length > 0) {
            return { startYear: Math.min(...years), endYear: Math.max(...years) };
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

    renderDetails(on) {
        const detailsContainer = this.container.querySelector('#onDetailsContent');
        if (!detailsContainer) return;

        const implementedBy = this.getImplementedBy(on);

        detailsContainer.innerHTML = `
            <div class="on-details-stub">
                <h3>${on.code ? `${on.code} – ` : ''}${on.title}</h3>
                <p><strong>DrG:</strong> ${on.drg || '—'}</p>
                <p><strong>Maturity:</strong> ${on.maturity || '—'}</p>
                <p><strong>Tentative:</strong> ${this.formatTentative(on.tentative)}</p>
                <hr>
                <h4>Implemented By (${implementedBy.length} ORs)</h4>
                <ul>
                    ${implementedBy.map(or =>
            `<li>${or.code ? `${or.code} – ` : ''}${or.title}</li>`
        ).join('') || '<li><em>None</em></li>'}
                </ul>
            </div>
        `;
    }

    getImplementedBy(on) {
        const onId = String(on.itemId || on.id);
        return this.orData.filter(or =>
            (or.implementedONs || []).some(ref => String(ref.id || ref) === onId)
        );
    }

    formatTentative(tentative) {
        return formatTentativeArray(tentative) || '—';
    }
}