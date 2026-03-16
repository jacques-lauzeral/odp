import { apiClient } from '../../shared/api-client.js';
import TreeTableEntity from '../../components/odp/tree-table-entity.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay
} from '/shared/src/index.js';

/**
 * ONPlanning - ON Deployment and Implementation Plan
 *
 * Coordinates the three-pane ON Plan layout:
 *   - Left  : ON tree (TreeTableEntity, refines-based path builder)
 *   - Centre : ON Gantt (GanttGrid, year-based temporal view)
 *   - Right  : Selected ON details (RequirementForm read-only + Implemented By tab)
 *
 * Owns data loading, selection sync, and pane coordination.
 * GanttGrid is a stub reference until abstract-timeline-grid.js / gantt-grid.js are implemented.
 */
export default class ONPlanning {
    constructor(app, setupData, options = {}) {
        this.app = app;
        this.setupData = setupData;
        this.editionContext = options.editionContext || 'repository';

        this.container = null;

        // Loaded data
        this.onData = [];       // All ONs fetched from API
        this.orData = [];       // All ORs (for Implemented By resolution)

        // Pane component instances (populated in render())
        this.onTree = null;     // TreeTableEntity
        this.ganttGrid = null;  // GanttGrid (stub - wired when component exists)
        this.detailForm = null; // RequirementForm read-only (stub)

        // Shared selection state
        this.selectedON = null;

        // Expanded ON ids in the tree (drives Gantt row visibility)
        this.expandedONIds = new Set();
    }

    // ====================
    // LIFECYCLE
    // ====================

    async render(container) {
        this.container = container;

        try {
            this.renderLayout();
            await this.loadData();
            this.initializeTree();
            this.initializeGantt();
            this.renderTree();
            this.renderGantt();
        } catch (error) {
            console.error('ONPlanning: render failed', error);
            this.renderError(error);
        }
    }

    onDeactivated() {
        // Preserve state before tab switch - nothing to do at skeleton stage
    }

    cleanup() {
        if (this.onTree?.cleanup) this.onTree.cleanup();
        if (this.ganttGrid?.cleanup) this.ganttGrid.cleanup();
        this.container = null;
        this.onTree = null;
        this.ganttGrid = null;
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

        const [requirements] = await Promise.all([
            apiClient.get(`/operational-requirements${queryString}`)
        ]);

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
            if (edition.baseline?.id) queryParams.baseline = edition.baseline.id;
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
                <!-- Left pane: ON tree -->
                <div class="on-plan-tree-pane" id="onTreePane">
                    <div class="pane-header">Operational Needs</div>
                    <div class="pane-content" id="onTreeContent">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <p>Loading ONs...</p>
                        </div>
                    </div>
                </div>

                <!-- Centre pane: Gantt -->
                <div class="on-plan-gantt-pane" id="onGanttPane">
                    <div class="pane-header">Implementation Plan</div>
                    <div class="pane-content" id="onGanttContent">
                        <div class="loading-state">
                            <div class="spinner"></div>
                            <p>Loading Gantt...</p>
                        </div>
                    </div>
                </div>

                <!-- Right pane: Details -->
                <div class="on-plan-details-pane" id="onDetailsPane">
                    <div class="pane-content" id="onDetailsContent">
                        <div class="no-selection-message">
                            <div class="icon">📋</div>
                            <h3>No ON selected</h3>
                            <p>Select an Operational Need from the tree to view its details.</p>
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
    // ON TREE (left pane)
    // ====================

    initializeTree() {
        this.onTree = new TreeTableEntity(this.app, {}, {
            pathBuilder: (on, onMap) => this.buildONPath(on, onMap),
            typeRenderers: {
                'drg-folder': {
                    icon: '📁',
                    iconColor: '#666',
                    expandable: true,
                    label: (pathItem) => pathItem.value
                },
                'on-node': {
                    icon: '🎯',
                    iconColor: '#2563eb',
                    expandable: (node) => Object.keys(node.children).length > 0,
                    label: (pathItem) => pathItem.value
                }
            },
            columns: [
                { label: 'Operational Need', width: '100%' }
            ],
            filterMatchers: this.getFilterMatchers(),
            onItemSelect: (on) => this.handleONSelect(on),
            onDataLoaded: (count) => console.log(`ONTree: ${count} ONs visible`)
        });
    }

    /**
     * Build typed path for a single ON.
     * Path: [drg-folder] → (parent-on-node →)* on-node
     *
     * @param {Object} on      - The ON entity
     * @param {Map}    onMap   - id → ON lookup map
     * @returns {Array}        - Typed path array for TreeTableEntity
     */
    buildONPath(on, onMap) {
        const path = [];

        // DrG folder (top-level grouping)
        if (on.drg) {
            path.push({
                type: 'drg-folder',
                id: `drg-${on.drg}`,
                value: getDraftingGroupDisplay(on.drg) || on.drg
            });
        }

        // Walk refines chain to build parent ON path segments
        // Collect ancestor ids bottom-up, then reverse for top-down path
        const ancestors = [];
        let currentId = on.refinesId ?? on.refines?.id ?? null;

        while (currentId) {
            const parent = onMap.get(currentId);
            if (!parent || ancestors.includes(currentId)) break; // guard against cycles
            ancestors.unshift(currentId);
            currentId = parent.refinesId ?? parent.refines?.id ?? null;
        }

        ancestors.forEach(ancestorId => {
            const ancestor = onMap.get(ancestorId);
            if (ancestor) {
                path.push({
                    type: 'on-node',
                    id: `on-${ancestor.itemId || ancestor.id}`,
                    value: ancestor.code
                        ? `${ancestor.code} – ${ancestor.title}`
                        : ancestor.title,
                    entityId: ancestor.itemId || ancestor.id
                });
            }
        });

        // The ON itself (leaf)
        path.push({
            type: 'on-node',
            id: `on-${on.itemId || on.id}`,
            value: on.code
                ? `${on.code} – ${on.title}`
                : on.title,
            entityId: on.itemId || on.id
        });

        return path;
    }

    getFilterMatchers() {
        return {
            drg: (on, value) => !value || on.drg === value,
            strategicDocument: (on, value) => {
                if (!value) return true;
                return (on.strategicDocuments || []).some(d =>
                    String(d.id || d) === String(value)
                );
            }
        };
    }

    renderTree() {
        const treeContainer = this.container.querySelector('#onTreeContent');
        if (!treeContainer || !this.onTree) return;

        this.onTree.render(treeContainer);
        this.onTree.setData(this.onData);
    }

    // ====================
    // GANTT (centre pane)
    // ====================

    initializeGantt() {
        // GanttGrid is a stub until abstract-timeline-grid.js / gantt-grid.js are implemented.
        // The instance will be created here once the component exists:
        //
        // this.ganttGrid = new GanttGrid(this.app, {}, {
        //     minYear: 2025,
        //     maxYear: 2045,
        //     onItemSelect: (on) => this.handleONSelect(on)
        // });
        this.ganttGrid = null;
    }

    renderGantt() {
        const ganttContainer = this.container.querySelector('#onGanttContent');
        if (!ganttContainer) return;

        if (!this.ganttGrid) {
            // Placeholder until GanttGrid is implemented
            ganttContainer.innerHTML = `
                <div class="planning-placeholder">
                    <div class="icon">📅</div>
                    <p>Gantt view — coming in next step.</p>
                </div>
            `;
            return;
        }

        this.ganttGrid.render(ganttContainer);
        this.ganttGrid.setData(this.getVisibleONs());
    }

    /**
     * Returns the ONs that should appear as rows in the Gantt:
     * root ONs + children of expanded ON nodes.
     */
    getVisibleONs() {
        return this.onData.filter(on => {
            const parentId = on.refinesId ?? on.refines?.id ?? null;
            if (!parentId) return true;                       // root ON always visible
            return this.expandedONIds.has(String(parentId)); // child visible if parent expanded
        });
    }

    // ====================
    // SELECTION & DETAILS (right pane)
    // ====================

    handleONSelect(on) {
        this.selectedON = on;

        // Sync tree selection
        if (this.onTree) {
            // TreeTableEntity.selectItem is not yet exposed — will be wired in next step
        }

        // Sync Gantt selection
        if (this.ganttGrid?.selectItem) {
            this.ganttGrid.selectItem(on.itemId || on.id);
        }

        this.renderDetails(on);
    }

    renderDetails(on) {
        const detailsContainer = this.container.querySelector('#onDetailsContent');
        if (!detailsContainer) return;

        // RequirementForm read-only + Implemented By tab stub
        // Full implementation in next step — placeholder for now
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
                    ${implementedBy.map(or => `<li>${or.code ? `${or.code} – ` : ''}${or.title}</li>`).join('') || '<li><em>None</em></li>'}
                </ul>
            </div>
        `;
    }

    /**
     * Derive ORs that implement the selected ON via the implements relationship.
     */
    getImplementedBy(on) {
        const onId = String(on.itemId || on.id);
        return this.orData.filter(or => {
            const implementedONs = or.implementedONs || [];
            return implementedONs.some(ref => String(ref.id || ref) === onId);
        });
    }

    formatTentative(tentative) {
        if (!Array.isArray(tentative) || tentative.length === 0) return '—';
        const [start, end] = tentative;
        return start === end ? String(start) : `${start}–${end}`;
    }
}