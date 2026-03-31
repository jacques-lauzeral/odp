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
    constructor(app, setupData, requirements, options = {}) {
        this.app = app;
        this.setupData = setupData;
        this.requirements = requirements || [];
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

        // Reload grid when an ON is saved
        this._onEntitySaved = async (e) => {
            if (e.detail?.entityType !== 'Operational Requirements') return;
            const requirements = await this._reloadRequirements();
            if (requirements) {
                this.requirements = requirements;
                this.onData = requirements.filter(r => r.type === 'ON');
                // Preserve expansion state across re-feed
                const snapshot = this.temporalGrid?.snapshotExpandedState();
                this._feedTemporalGrid();
                if (snapshot) this.temporalGrid.restoreExpandedState(snapshot);
                // Refresh details if the saved ON is currently selected
                if (this.selectedON) {
                    const fresh = this.onData.find(
                        o => String(o.itemId || o.id) === String(this.selectedON.itemId || this.selectedON.id)
                    );
                    if (fresh) {
                        this.selectedON = fresh;
                        this.renderDetails(fresh);
                    }
                }
            }
        };
        document.addEventListener('entitySaved', this._onEntitySaved);
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

    _escapeHtml(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    cleanup() {
        if (this._onEntitySaved) {
            document.removeEventListener('entitySaved', this._onEntitySaved);
            this._onEntitySaved = null;
        }
        if (this.temporalGrid?.cleanup) this.temporalGrid.cleanup();
        this.container = null;
        this.temporalGrid = null;
        this.requirementForm = null;
    }

    // ====================
    // DATA LOADING
    // ====================

    async loadData() {
        this.onData = this.requirements.filter(r => r.type === 'ON');
        console.log(`ONPlanning: ${this.onData.length} ONs from preloaded requirements`);
    }

    async _reloadRequirements() {
        try {
            const { apiClient } = await import('../../shared/api-client.js');
            return await apiClient.get('/operational-requirements');
        } catch (e) {
            console.error('ONPlanning: failed to reload requirements', e);
            return null;
        }
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
            { endpoint: '/operational-requirements', name: 'Operational Requirements' },
            {
                setupData: this.setupData,
                getSetupData: () => this.setupData,
                getRequirements: () => this.requirements
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
     *   group (top, aggregate)    — DrG (alphabetical by display label)
     *   group (nested, aggregate) — path[0] folder, only when >1 root ONs share the folder
     *   group/flat                — root ON: group if has refining children, flat (addRow) if leaf
     *   child                     — refining ON, always under its parent root ON group
     *
     * Promotion rule: a path[0] folder containing exactly one root ON is suppressed —
     * the ON (and its children) are emitted directly under the DrG group.
     *
     * Aggregate timeline: DrG and folder groups receive a computed [min-start, max-end]
     * milestone span derived from all ONs they contain (including refining ONs).
     */
    _feedTemporalGrid() {
        if (!this.temporalGrid) return;
        this.temporalGrid.clearRows();

        // Helper: is this ON a root (no refinesParents)?
        const isRoot = (on) => !on.refinesParents || on.refinesParents.length === 0;

        // Helper: parent id string for a refining ON
        const parentIdOf = (on) => {
            if (!on.refinesParents || on.refinesParents.length === 0) return null;
            const ref = on.refinesParents[0];
            return String(ref.itemId || ref.id || ref);
        };

        // Helper: path[0] folder label, or null
        const pathFolderOf = (on) =>
            (Array.isArray(on.path) && on.path.length > 0) ? on.path[0] : null;

        // Helper: build aggregate [min-start, max-end] milestones for a set of ONs
        const aggregateMilestones = (ons) => {
            const years = ons
                .filter(on => Array.isArray(on.tentative) && on.tentative.length === 2)
                .flatMap(on => on.tentative);
            if (years.length === 0) return [];
            const minY = Math.min(...years);
            const maxY = Math.max(...years);
            return [
                { label: 'Start', description: 'Earliest implementation start',
                    eventTypes: ['period-start'], date: new Date(minY, 0, 1) },
                { label: 'End',   description: 'Latest implementation end',
                    eventTypes: ['period-end'],   date: new Date(maxY + 1, 0, 1) }
            ];
        };

        // Helper: emit a root ON row + its refining children immediately after
        const emitRootOn = (rootOn, allOnsInDrg, parentGroupId) => {
            const groupId    = String(rootOn.itemId || rootOn.id);
            const label      = rootOn.code ? `${rootOn.code} – ${rootOn.title}` : rootOn.title;
            const milestones = this._buildMilestones(rootOn);

            const children = allOnsInDrg
                .filter(on => parentIdOf(on) === groupId)
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

            if (children.length > 0) {
                this.temporalGrid.addGroupRow(groupId, label, milestones, parentGroupId);
                children.forEach(child => {
                    const childId    = String(child.itemId || child.id);
                    const childLabel = child.code ? `${child.code} – ${child.title}` : child.title;
                    this.temporalGrid.addChildRow(childId, groupId, childLabel, this._buildMilestones(child));
                });
            } else {
                this.temporalGrid.addRow(groupId, label, milestones, parentGroupId);
            }
        };

        // Helper: emit all rows for one DrG
        const emitDrgOns = (ons, drgId) => {
            const roots            = ons.filter(isRoot);
            const rootsWithPath    = roots.filter(on => pathFolderOf(on) !== null);
            const rootsWithoutPath = roots.filter(on => pathFolderOf(on) === null);

            // Group roots-with-path by path[0]
            const byFolder = new Map();
            rootsWithPath.forEach(on => {
                const folder = pathFolderOf(on);
                if (!byFolder.has(folder)) byFolder.set(folder, []);
                byFolder.get(folder).push(on);
            });

            // Emit path folders alphabetically; promote single-ON folders
            [...byFolder.keys()].sort((a, b) => a.localeCompare(b)).forEach(folder => {
                const folderOns = byFolder.get(folder);
                if (folderOns.length > 1) {
                    const folderId        = `${drgId}:folder:${folder}`;
                    const folderMilestones = aggregateMilestones(folderOns);
                    this.temporalGrid.addGroupRow(folderId, folder, folderMilestones, drgId, true);
                    folderOns
                        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                        .forEach(root => emitRootOn(root, ons, folderId));
                } else {
                    // Single-ON folder: promote directly under DrG group
                    emitRootOn(folderOns[0], ons, drgId);
                }
            });

            // Root ONs without a path go directly under DrG group
            rootsWithoutPath
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                .forEach(root => emitRootOn(root, ons, drgId));
        };

        // Group ONs by DrG, sort DrG keys alphabetically by display label
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

        [...byDrg.keys()].sort((a, b) => {
            const la = getDraftingGroupDisplay(a) || a;
            const lb = getDraftingGroupDisplay(b) || b;
            return la.localeCompare(lb);
        }).forEach(drg => {
            const drgLabel      = getDraftingGroupDisplay(drg) || drg;
            const drgOns        = byDrg.get(drg);
            const drgMilestones = aggregateMilestones(drgOns);
            this.temporalGrid.addGroupRow(`drg:${drg}`, drgLabel, drgMilestones, null, true);
            emitDrgOns(drgOns, `drg:${drg}`);
        });

        // ONs with no DrG
        if (noDrg.length > 0) {
            this.temporalGrid.addGroupRow('drg:none', '(No DrG)', aggregateMilestones(noDrg), null, true);
            noDrg.filter(isRoot)
                .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
                .forEach(root => emitRootOn(root, noDrg, 'drg:none'));
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
        if (!on) {
            this.selectedON = null;
            this._renderBlankDetails();
            return;
        }
        this.selectedON = on;
        this.renderDetails(on);
    }

    _renderBlankDetails() {
        const detailsContainer = this.container?.querySelector('#onDetailsContent');
        if (!detailsContainer) return;
        detailsContainer.innerHTML = `
            <div class="no-selection-message">
                <div class="icon">📋</div>
                <h3>No ON selected</h3>
                <p>Select an Operational Need to view its details.</p>
            </div>
        `;
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

        // Read tab index from the form instance — updated by CollectionEntityForm's
        // global tab delegation handler, which is the authoritative source of truth.
        const currentTab = this.requirementForm.currentTabIndex ?? 0;

        detailsContainer.innerHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
            </div>
        `;

        try {
            const html = await this.requirementForm.generateReadOnlyView(on, true);

            detailsContainer.innerHTML = `
                <div class="details-sticky-header">
                    <div class="item-title-section">
                        <h3 class="item-title">${this._escapeHtml(on.title || `ON ${on.itemId}`)}</h3>
                        <span class="item-id">[${on.code || on.itemId}]</span>
                    </div>
                    <div class="details-actions">
                        <button class="btn btn-primary btn-sm" id="onEditBtn">Edit</button>
                    </div>
                </div>
                <div class="details-scrollable-content">${html}</div>
            `;

            this.requirementForm.initializeReadOnlyInPanel(detailsContainer, on);

            // Re-bind tab clicks directly — the global delegation handler closes over
            // the first-instantiated form, which may not be requirementForm. This ensures
            // requirementForm.currentTabIndex is always updated when tabs are clicked here.
            detailsContainer.querySelectorAll('.tab-header').forEach(header => {
                header.addEventListener('click', () => {
                    this.requirementForm.currentTabIndex = parseInt(header.dataset.tab, 10);
                });
            });

            detailsContainer.querySelector('#onEditBtn')
                ?.addEventListener('click', () => this.requirementForm.showEditModal(on));

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