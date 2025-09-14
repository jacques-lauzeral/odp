/**
 * TimelineGrid - Temporal visualization component for operational changes
 * Displays changes as horizontal rows with milestone intersections at wave dates
 */
export default class TimelineGrid {
    constructor(app, entityConfig, setupData, options = {}) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Timeline state
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.selectedMilestone = null;
        this.timeWindow = {
            start: null,
            end: null
        };

        // Options and event handlers
        this.onItemSelect = options.onItemSelect || (() => {});
        this.onMilestoneSelect = options.onMilestoneSelect || (() => {});

        // Default time window: 3 years from now
        this.initializeTimeWindow();
    }

    initializeTimeWindow() {
        const now = new Date();
        const threeYearsLater = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate());

        if (this.setupData?.waves) {
            const relevantWaves = this.setupData.waves.filter(wave => {
                const waveDate = new Date(wave.year, (wave.quarter - 1) * 3, 1);
                return waveDate >= now && waveDate <= threeYearsLater;
            });

            if (relevantWaves.length > 0) {
                const firstWave = relevantWaves[0];
                const lastWave = relevantWaves[relevantWaves.length - 1];

                this.timeWindow.start = new Date(firstWave.year, (firstWave.quarter - 1) * 3, 1);
                this.timeWindow.end = new Date(lastWave.year, (lastWave.quarter - 1) * 3 + 3, 0);
            } else {
                // Fallback if no waves in range
                this.timeWindow.start = now;
                this.timeWindow.end = threeYearsLater;
            }
        } else {
            this.timeWindow.start = now;
            this.timeWindow.end = threeYearsLater;
        }
    }

    // ====================
    // PUBLIC API
    // ====================

    async render(container) {
        this.container = container;
        this.renderContent();
    }

    setData(data) {
        this.data = Array.isArray(data) ? data : [];
        this.filteredData = [...this.data];
        this.renderContent();
    }

    setFilters(filters) {
        // Apply filters to data (for now, just copy all data)
        this.filteredData = [...this.data];
        this.renderContent();
    }

    updateTimeWindow(startDate, endDate) {
        this.timeWindow.start = startDate;
        this.timeWindow.end = endDate;
        this.renderContent();
    }

    selectItem(itemId) {
        const item = this.data.find(d => this.getItemId(d) === parseInt(itemId, 10));
        if (item) {
            this.selectedItem = item;
            this.selectedMilestone = null;
            this.updateSelectionUI();
            this.onItemSelect(item);
        }
    }

    selectMilestone(itemId, milestoneKey) {
        const item = this.data.find(d => this.getItemId(d) === parseInt(itemId, 10));
        if (item) {
            const milestone = item.milestones?.find(m =>
                m.milestoneKey === milestoneKey || m.id === milestoneKey
            );
            if (milestone) {
                this.selectedItem = item;
                this.selectedMilestone = milestone;
                this.updateSelectionUI();
                this.onMilestoneSelect(item, milestone);
            }
        }
    }

    // ====================
    // RENDERING
    // ====================

    renderContent() {
        if (!this.container) return;

        if (this.filteredData.length === 0) {
            this.renderEmptyState();
            return;
        }

        const visibleWaves = this.getVisibleWaves();

        this.container.innerHTML = `
            <div class="timeline-grid-container">
                <div class="timeline-header">
                    ${this.renderTimelineHeader(visibleWaves)}
                </div>
                <div class="timeline-body">
                    ${this.filteredData.map(change => this.renderChangeRow(change, visibleWaves)).join('')}
                </div>
            </div>
        `;

        this.bindEvents();
        this.updateSelectionUI();
    }

    renderTimelineHeader(waves) {
        return `
            <div class="timeline-header-row">
                <div class="timeline-label-column">
                    <div class="timeline-label-header">Changes</div>
                </div>
                <div class="timeline-waves-container">
                    ${waves.map((wave, index) => `
                        <div class="timeline-wave-header" 
                             data-wave-id="${wave.id}"
                             style="left: ${this.calculateWavePosition(index, waves.length)}%">
                            <div class="wave-label">${wave.year} Q${wave.quarter}</div>
                            <div class="wave-line"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderChangeRow(change, waves) {
        const itemId = this.getItemId(change);
        const isSelected = this.selectedItem && this.getItemId(this.selectedItem) === itemId;

        return `
            <div class="timeline-change-row ${isSelected ? 'selected' : ''}" data-item-id="${itemId}">
                <div class="timeline-change-label" data-item-id="${itemId}">
                    <div class="change-title">${this.escapeHtml(change.title || `Change ${itemId}`)}</div>
                    <div class="change-id">${itemId}</div>
                </div>
                <div class="timeline-change-timeline">
                    <div class="timeline-base-line"></div>
                    ${this.renderMilestones(change, waves)}
                    ${this.renderConnectors(change, waves)}
                </div>
            </div>
        `;
    }

    renderMilestones(change, waves) {
        if (!change.milestones || change.milestones.length === 0) {
            return '';
        }

        const itemId = this.getItemId(change);

        return change.milestones.map(milestone => {
            const wave = this.findMilestoneWave(milestone);
            if (!wave) return '';

            const waveIndex = waves.findIndex(w => w.id === wave.id);
            if (waveIndex === -1) return '';

            const milestoneKey = milestone.milestoneKey || milestone.id;
            const isSelected = this.selectedMilestone &&
                (this.selectedMilestone.milestoneKey === milestoneKey || this.selectedMilestone.id === milestoneKey);

            return `
                <div class="timeline-milestone ${isSelected ? 'selected' : ''}" 
                     style="left: ${this.calculateWavePosition(waveIndex, waves.length)}%"
                     data-item-id="${itemId}"
                     data-milestone-key="${milestoneKey}"
                     title="${this.escapeHtml(milestone.title || 'Milestone')}">
                    ${this.renderPixmap(milestone.eventTypes || [])}
                </div>
            `;
        }).join('');
    }

    renderConnectors(change, waves) {
        if (!change.milestones || change.milestones.length <= 1) {
            return '';
        }

        // Sort milestones by wave date
        const sortedMilestones = change.milestones
            .map(m => ({ milestone: m, wave: this.findMilestoneWave(m) }))
            .filter(item => item.wave)
            .sort((a, b) => {
                if (a.wave.year !== b.wave.year) return a.wave.year - b.wave.year;
                return a.wave.quarter - b.wave.quarter;
            });

        if (sortedMilestones.length <= 1) return '';

        const connectors = [];
        for (let i = 0; i < sortedMilestones.length - 1; i++) {
            const currentWave = sortedMilestones[i].wave;
            const nextWave = sortedMilestones[i + 1].wave;

            const currentIndex = waves.findIndex(w => w.id === currentWave.id);
            const nextIndex = waves.findIndex(w => w.id === nextWave.id);

            if (currentIndex !== -1 && nextIndex !== -1) {
                const startPos = this.calculateWavePosition(currentIndex, waves.length);
                const endPos = this.calculateWavePosition(nextIndex, waves.length);

                connectors.push(`
                    <div class="timeline-connector" 
                         style="left: ${startPos}%; width: ${endPos - startPos}%"></div>
                `);
            }
        }

        return connectors.join('');
    }

    renderPixmap(eventTypes) {
        // Simple pixmap implementation - 3x3 grid
        // For now, just show filled squares for any event type
        const hasApiEvents = eventTypes.some(t => t.includes('API'));
        const hasUiEvents = eventTypes.some(t => t.includes('UI'));
        const hasServiceEvents = eventTypes.some(t => t.includes('SERVICE'));

        return `
            <div class="pixmap">
                <div class="pixmap-row">
                    <div class="pixmap-cell ${hasApiEvents ? 'filled' : ''}"></div>
                    <div class="pixmap-cell ${hasUiEvents ? 'filled' : ''}"></div>
                    <div class="pixmap-cell ${hasServiceEvents ? 'filled' : ''}"></div>
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        this.container.innerHTML = `
            <div class="timeline-empty-state">
                <div class="icon">📅</div>
                <h3>No Changes to Display</h3>
                <p>Apply filters to show changes in the timeline view.</p>
            </div>
        `;
    }

    // ====================
    // EVENT HANDLING
    // ====================

    bindEvents() {
        if (!this.container) return;

        // Change row selection
        const changeLabels = this.container.querySelectorAll('.timeline-change-label');
        changeLabels.forEach(label => {
            label.addEventListener('click', (e) => {
                const itemId = e.currentTarget.dataset.itemId;
                this.selectItem(itemId);
            });
        });

        // Milestone selection
        const milestones = this.container.querySelectorAll('.timeline-milestone');
        milestones.forEach(milestone => {
            milestone.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent change selection
                const itemId = e.currentTarget.dataset.itemId;
                const milestoneKey = e.currentTarget.dataset.milestoneKey;
                this.selectMilestone(itemId, milestoneKey);
            });
        });
    }

    updateSelectionUI() {
        if (!this.container) return;

        // Update change row selection
        const changeRows = this.container.querySelectorAll('.timeline-change-row');
        changeRows.forEach(row => {
            const itemId = parseInt(row.dataset.itemId, 10);
            const isSelected = this.selectedItem && this.getItemId(this.selectedItem) === itemId;
            row.classList.toggle('selected', isSelected);
        });

        // Update milestone selection
        const milestones = this.container.querySelectorAll('.timeline-milestone');
        milestones.forEach(milestone => {
            const milestoneKey = milestone.dataset.milestoneKey;
            const isSelected = this.selectedMilestone &&
                (this.selectedMilestone.milestoneKey === milestoneKey ||
                    this.selectedMilestone.id === milestoneKey);
            milestone.classList.toggle('selected', isSelected);
        });
    }

    // ====================
    // HELPER METHODS
    // ====================

    getVisibleWaves() {
        if (!this.setupData?.waves) return [];

        return this.setupData.waves.filter(wave => {
            const waveDate = new Date(wave.year, (wave.quarter - 1) * 3, 1);
            return waveDate >= this.timeWindow.start && waveDate <= this.timeWindow.end;
        }).sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.quarter - b.quarter;
        });
    }

    findMilestoneWave(milestone) {
        if (milestone.wave) return milestone.wave;

        if (milestone.waveId && this.setupData?.waves) {
            return this.setupData.waves.find(w => w.id === milestone.waveId);
        }

        return null;
    }

    calculateWavePosition(waveIndex, totalWaves) {
        if (totalWaves <= 1) return 50;

        // Distribute waves evenly across the timeline
        const padding = 5; // 5% padding on each side
        const usableWidth = 100 - (padding * 2);
        const position = padding + (waveIndex / (totalWaves - 1)) * usableWidth;

        return Math.round(position * 100) / 100; // Round to 2 decimal places
    }

    getItemId(item) {
        return item?.itemId || item?.id || null;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====================
    // CLEANUP
    // ====================

    cleanup() {
        this.container = null;
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.selectedMilestone = null;
    }
}