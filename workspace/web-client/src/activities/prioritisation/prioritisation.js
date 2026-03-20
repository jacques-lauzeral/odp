/**
 * prioritisation.js
 *
 * Prioritisation Activity — OC bandwidth balancing workspace.
 * Route: /prioritisation
 *
 * Loads OCs, waves, bandwidths. Builds aggregation matrix.
 * Renders PrioritisationGrid. Handles OC wave shifts via API.
 */
import { apiClient }    from '../../shared/api-client.js';
import { errorHandler } from '../../shared/error-handler.js';
import { DraftingGroup } from '/shared/src/index.js';
import PrioritisationGrid from './prioritisation-grid.js';
import { buildMatrix }  from '../../shared/src/model/bandwidth-aggregation.js';

// Ordered DrG rows
const DRG_ORDER = Object.values(DraftingGroup);

export default class PrioritisationActivity {
    constructor(app) {
        this.app        = app;
        this.container  = null;
        this.ocs        = [];
        this.waves      = [];
        this.bandwidths = [];
        this.matrix     = null;
        this.grid       = null;
    }

    // =========================================================================
    // LIFECYCLE
    // =========================================================================

    async render(container, subPath = []) {
        this.container = container;
        try {
            this._renderLoading();
            await this._loadData();
            this._computeMatrix();
            this._renderUI();
        } catch (error) {
            console.error('PrioritisationActivity: render failed', error);
            this._renderError(error);
        }
    }

    cleanup() {
        if (this.grid?.cleanup) this.grid.cleanup();
        this.container  = null;
        this.grid       = null;
        this.ocs        = [];
        this.waves      = [];
        this.bandwidths = [];
        this.matrix     = null;
    }

    // =========================================================================
    // DATA
    // =========================================================================

    async _loadData() {
        const [ocs, waves, bandwidths] = await Promise.all([
            apiClient.get('/operational-changes'),
            apiClient.get('/waves'),
            apiClient.get('/bandwidths')
        ]);
        this.ocs        = ocs        || [];
        this.waves      = waves      || [];
        this.bandwidths = bandwidths || [];
    }

    _computeMatrix() {
        this.matrix = buildMatrix(
            this.ocs,
            this.waves,
            this.bandwidths,
            DRG_ORDER
        );
    }

    // =========================================================================
    // RENDERING
    // =========================================================================

    _renderLoading() {
        this.container.innerHTML = `
            <div class="prioritisation-activity">
                <div class="prioritisation-workspace">
                    <div class="loading">
                        <div class="spinner"></div>
                        <p>Loading prioritisation data…</p>
                    </div>
                </div>
            </div>
        `;
    }

    _renderError(error) {
        this.container.innerHTML = `
            <div class="prioritisation-activity">
                <div class="prioritisation-workspace">
                    <div class="error-container">
                        <h3>Failed to Load Prioritisation</h3>
                        <p>${error.message}</p>
                        <button class="btn btn-primary"
                                onclick="window.location.reload()">Reload</button>
                    </div>
                </div>
            </div>
        `;
    }

    _renderUI() {
        this.container.innerHTML = `
            <div class="prioritisation-activity">
                <div class="prioritisation-workspace">

                    <div class="prioritisation-toolbar">
                        <span class="prioritisation-toolbar__title">
                            OC Prioritisation &amp; Bandwidth Planning
                        </span>
                        <button class="btn btn-secondary btn-sm" id="prioRefreshBtn">
                            ↻ Refresh
                        </button>
                    </div>

                    <div class="prioritisation-board-container" id="prioBoardContainer">
                    </div>

                </div>
            </div>
        `;

        const boardContainer = this.container.querySelector('#prioBoardContainer');
        this.grid = new PrioritisationGrid({
            waves:     this.waves,
            drgs:      DRG_ORDER,
            matrix:    this.matrix,
            allOcs:    this.ocs,
            onShiftOC: (oc, targetWaveId) => this._handleShiftOC(oc, targetWaveId),
            onOpenOC:  (oc) => this._handleOpenOC(oc)
        });
        this.grid.render(boardContainer);

        this.container.querySelector('#prioRefreshBtn')
            .addEventListener('click', () => this._refresh());
    }

    // =========================================================================
    // ACTIONS
    // =========================================================================

    async _handleShiftOC(oc, targetWaveId) {
        // targetWaveId === null means move to backlog (remove OPS_DEPLOYMENT milestone)
        try {
            const milestone = (oc.milestones || []).find(
                m => Array.isArray(m.eventTypes) &&
                    m.eventTypes.includes('OPS_DEPLOYMENT')
            );

            if (targetWaveId === null) {
                // Remove OPS_DEPLOYMENT milestone → move to backlog
                if (milestone) {
                    await apiClient.delete(
                        `/operational-changes/${oc.id}/milestones/${milestone.key}`,
                        { expectedVersionId: oc.versionId }
                    );
                }
            } else if (milestone) {
                // Update existing OPS_DEPLOYMENT milestone wave
                await apiClient.put(
                    `/operational-changes/${oc.id}/milestones/${milestone.key}`,
                    {
                        expectedVersionId: oc.versionId,
                        name:       milestone.name,
                        eventTypes: milestone.eventTypes,
                        waveId:     targetWaveId
                    }
                );
            } else {
                // Create new OPS_DEPLOYMENT milestone
                await apiClient.post(
                    `/operational-changes/${oc.id}/milestones`,
                    {
                        expectedVersionId: oc.versionId,
                        name:       'OPS Deployment',
                        eventTypes: ['OPS_DEPLOYMENT'],
                        waveId:     targetWaveId
                    }
                );
            }

            await this._refresh();
        } catch (error) {
            errorHandler.handle(error, 'prioritisation-shift-oc');
        }
    }

    _handleOpenOC(oc) {
        this.app.navigateTo(`/elaboration/changes/${oc.id}`);
    }

    async _refresh() {
        try {
            await this._loadData();
            this._computeMatrix();
            this.grid.update({
                waves:  this.waves,
                matrix: this.matrix,
                allOcs: this.ocs
            });
        } catch (error) {
            errorHandler.handle(error, 'prioritisation-refresh');
        }
    }
}