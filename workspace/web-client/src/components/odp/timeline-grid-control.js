/**
 * TimelineGridControl - Collapsible control panel for timeline configuration
 * Handles time bounds and milestone filtering for the timeline view
 */
export default class TimelineGridControl {
    constructor(setupData, options = {}) {
        this.setupData = setupData;
        this.container = null;
        this.isCollapsed = false;

        // Current settings
        this.timeWindow = {
            start: null,
            end: null
        };
        this.milestoneFilters = ['ANY']; // Default to show all milestone types

        // Event handlers
        this.onTimeWindowChange = options.onTimeWindowChange || (() => {});
        this.onMilestoneFilterChange = options.onMilestoneFilterChange || (() => {});

        // Available milestone event types (from API schema)
        this.availableEventTypes = [
            'API_PUBLICATION',
            'API_TEST_DEPLOYMENT',
            'UI_TEST_DEPLOYMENT',
            'SERVICE_ACTIVATION',
            'API_DECOMMISSIONING',
            'OTHER'
        ];

        // Initialize default time window
        this.initializeTimeWindow();
    }

    initializeTimeWindow() {
        const now = new Date();
        const threeYearsLater = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate());

        if (this.setupData?.waves && this.setupData.waves.length > 0) {
            // Find waves in the next 3 years
            const relevantWaves = this.setupData.waves.filter(wave => {
                const waveDate = new Date(wave.year, (wave.quarter - 1) * 3, 1);
                return waveDate >= now && waveDate <= threeYearsLater;
            });

            if (relevantWaves.length > 0) {
                // Sort waves by date
                relevantWaves.sort((a, b) => {
                    if (a.year !== b.year) return a.year - b.year;
                    return a.quarter - b.quarter;
                });

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

    render(container) {
        this.container = container;
        this.renderContent();
    }

    collapse() {
        this.isCollapsed = true;
        this.renderContent();
    }

    expand() {
        this.isCollapsed = false;
        this.renderContent();
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;
        this.renderContent();
    }

    getTimeWindow() {
        return { ...this.timeWindow };
    }

    getMilestoneFilters() {
        return [...this.milestoneFilters];
    }

    // ====================
    // RENDERING
    // ====================

    renderContent() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="timeline-control-panel ${this.isCollapsed ? 'collapsed' : 'expanded'}">
                ${this.renderHeader()}
                ${this.isCollapsed ? '' : this.renderExpandedContent()}
            </div>
        `;

        this.bindEvents();
    }

    renderHeader() {
        return `
            <div class="control-panel-header">
                <button class="collapse-toggle" title="${this.isCollapsed ? 'Expand controls' : 'Collapse controls'}">
                    <span class="toggle-icon">${this.isCollapsed ? '▶' : '◀'}</span>
                </button>
                <div class="active-filters-summary">
                    ${this.renderActiveFiltersSummary()}
                </div>
            </div>
        `;
    }

    renderActiveFiltersSummary() {
        if (!this.isCollapsed) return '';

        // Show compact summary of active milestone filters
        const activeTypes = this.milestoneFilters.filter(f => f !== 'ANY');
        if (activeTypes.length === 0) {
            return `<span class="filter-badge">All Events</span>`;
        }

        return activeTypes.map(type => {
            const shortName = this.getShortEventTypeName(type);
            return `<span class="filter-badge">${shortName}</span>`;
        }).join('');
    }

    renderExpandedContent() {
        const availableWaves = this.getAvailableWaves();

        return `
            <div class="control-panel-content">
                <div class="control-section">
                    <h4 class="control-section-title">Time Window</h4>
                    ${this.renderTimeWindowControls(availableWaves)}
                </div>
                
                <div class="control-section">
                    <h4 class="control-section-title">Milestone Events</h4>
                    ${this.renderMilestoneFilterControls()}
                </div>
            </div>
        `;
    }

    renderTimeWindowControls(availableWaves) {
        if (!availableWaves || availableWaves.length === 0) {
            return `
                <div class="control-group">
                    <p class="no-waves-message">No waves available for timeline</p>
                </div>
            `;
        }

        // Find currently selected waves
        const startWave = this.findClosestWave(this.timeWindow.start, availableWaves);
        const endWave = this.findClosestWave(this.timeWindow.end, availableWaves);

        return `
            <div class="control-group">
                <label for="start-wave">From Wave:</label>
                <select id="start-wave" class="form-control">
                    ${availableWaves.map(wave => `
                        <option value="${wave.id}" ${startWave && startWave.id === wave.id ? 'selected' : ''}>
                            ${wave.year} Q${wave.quarter}
                        </option>
                    `).join('')}
                </select>
            </div>
            
            <div class="control-group">
                <label for="end-wave">To Wave:</label>
                <select id="end-wave" class="form-control">
                    ${availableWaves.map(wave => `
                        <option value="${wave.id}" ${endWave && endWave.id === wave.id ? 'selected' : ''}>
                            ${wave.year} Q${wave.quarter}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }

    renderMilestoneFilterControls() {
        const isAnySelected = this.milestoneFilters.includes('ANY');

        return `
            <div class="milestone-filter-controls">
                <div class="control-group">
                    <label class="checkbox-label">
                        <input type="checkbox" 
                               id="filter-any" 
                               value="ANY" 
                               ${isAnySelected ? 'checked' : ''}>
                        <span>Show All Event Types</span>
                    </label>
                </div>
                
                ${this.availableEventTypes.map(eventType => {
            const isChecked = !isAnySelected && this.milestoneFilters.includes(eventType);
            const isDisabled = isAnySelected;

            return `
                        <div class="control-group">
                            <label class="checkbox-label ${isDisabled ? 'disabled' : ''}">
                                <input type="checkbox" 
                                       class="event-type-filter"
                                       value="${eventType}" 
                                       ${isChecked ? 'checked' : ''}
                                       ${isDisabled ? 'disabled' : ''}>
                                <span>${this.formatEventTypeName(eventType)}</span>
                            </label>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    // ====================
    // EVENT HANDLING
    // ====================

    bindEvents() {
        if (!this.container) return;

        // Collapse/expand toggle
        const toggleBtn = this.container.querySelector('.collapse-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleCollapse();
            });
        }

        if (this.isCollapsed) return; // No other events to bind when collapsed

        // Time window controls
        const startWaveSelect = this.container.querySelector('#start-wave');
        const endWaveSelect = this.container.querySelector('#end-wave');

        if (startWaveSelect) {
            startWaveSelect.addEventListener('change', () => {
                this.updateTimeWindow();
            });
        }

        if (endWaveSelect) {
            endWaveSelect.addEventListener('change', () => {
                this.updateTimeWindow();
            });
        }

        // Milestone filter controls
        const anyCheckbox = this.container.querySelector('#filter-any');
        if (anyCheckbox) {
            anyCheckbox.addEventListener('change', (e) => {
                this.handleAnyFilterChange(e.target.checked);
            });
        }

        const eventTypeCheckboxes = this.container.querySelectorAll('.event-type-filter');
        eventTypeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.handleEventTypeFilterChange();
            });
        });
    }

    updateTimeWindow() {
        const startWaveSelect = this.container.querySelector('#start-wave');
        const endWaveSelect = this.container.querySelector('#end-wave');

        if (!startWaveSelect || !endWaveSelect) return;

        const startWaveId = parseInt(startWaveSelect.value, 10);
        const endWaveId = parseInt(endWaveSelect.value, 10);

        const availableWaves = this.getAvailableWaves();
        const startWave = availableWaves.find(w => w.id === startWaveId);
        const endWave = availableWaves.find(w => w.id === endWaveId);

        if (startWave && endWave) {
            this.timeWindow.start = new Date(startWave.year, (startWave.quarter - 1) * 3, 1);
            this.timeWindow.end = new Date(endWave.year, (endWave.quarter - 1) * 3 + 3, 0);

            // Ensure start is before end
            if (this.timeWindow.start > this.timeWindow.end) {
                [this.timeWindow.start, this.timeWindow.end] = [this.timeWindow.end, this.timeWindow.start];
            }

            this.onTimeWindowChange(this.timeWindow.start, this.timeWindow.end);
        }
    }

    handleAnyFilterChange(isChecked) {
        if (isChecked) {
            this.milestoneFilters = ['ANY'];
        } else {
            this.milestoneFilters = [];
        }

        this.onMilestoneFilterChange(this.milestoneFilters);
        this.renderContent(); // Re-render to update disabled state
    }

    handleEventTypeFilterChange() {
        const checkboxes = this.container.querySelectorAll('.event-type-filter:checked');
        this.milestoneFilters = Array.from(checkboxes).map(cb => cb.value);

        // If no specific types selected, default back to ANY
        if (this.milestoneFilters.length === 0) {
            this.milestoneFilters = ['ANY'];
        }

        this.onMilestoneFilterChange(this.milestoneFilters);

        // Update the ANY checkbox state
        const anyCheckbox = this.container.querySelector('#filter-any');
        if (anyCheckbox) {
            anyCheckbox.checked = this.milestoneFilters.includes('ANY');
        }
    }

    // ====================
    // HELPER METHODS
    // ====================

    getAvailableWaves() {
        if (!this.setupData?.waves) return [];

        // Return all waves sorted by date
        return [...this.setupData.waves].sort((a, b) => {
            if (a.year !== b.year) return a.year - b.year;
            return a.quarter - b.quarter;
        });
    }

    findClosestWave(date, waves) {
        if (!waves || waves.length === 0) return null;

        let closest = waves[0];
        let closestDiff = Math.abs(date.getTime() - this.getWaveDate(closest).getTime());

        for (const wave of waves) {
            const waveDate = this.getWaveDate(wave);
            const diff = Math.abs(date.getTime() - waveDate.getTime());

            if (diff < closestDiff) {
                closest = wave;
                closestDiff = diff;
            }
        }

        return closest;
    }

    getWaveDate(wave) {
        return new Date(wave.year, (wave.quarter - 1) * 3, 1);
    }

    formatEventTypeName(eventType) {
        // Convert API enum to display format
        return eventType.replace(/_/g, ' ').toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    getShortEventTypeName(eventType) {
        // Create short names for collapsed view
        const shortNames = {
            'API_PUBLICATION': 'API-P',
            'API_TEST_DEPLOYMENT': 'API-T',
            'UI_TEST_DEPLOYMENT': 'UI-T',
            'SERVICE_ACTIVATION': 'SRV',
            'API_DECOMMISSIONING': 'API-D',
            'OTHER': 'OTH'
        };

        return shortNames[eventType] || eventType.substring(0, 3);
    }

    // ====================
    // CLEANUP
    // ====================

    cleanup() {
        this.container = null;
    }
}