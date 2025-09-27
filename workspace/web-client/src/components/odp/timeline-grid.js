import {
    MilestoneEventType,
    getMilestoneEventTypeDisplay
} from '../../../../shared/src/index.js';

/**
 * TimelineGrid - Temporal visualization component for operational changes
 * Displays changes as horizontal rows with milestone intersections at wave dates
 * Updated for model evolution: uses shared MilestoneEventType enum with 5 specific events
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
        this.milestoneFilters = ['ANY']; // Default to show all milestone types

        // Options and event handlers
        this.onItemSelect = options.onItemSelect || (() => {});
        this.onMilestoneSelect = options.onMilestoneSelect || (() => {});
        this.onMilestoneFilterChange = options.onMilestoneFilterChange || (() => {});

        // Available event types from shared enum (5 specific milestone events)
        this.availableEventTypes = Object.keys(MilestoneEventType);

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
        this.applyFilters();
        this.renderContent();
    }

    syncWithCollectionData(collectionData, collectionFilters = {}) {
        // Apply collection-level filters to timeline data
        let filteredData = collectionData || [];

        // Apply any additional collection filters that affect timeline
        // (This allows timeline to stay in sync with collection filtering)
        this.setData(filteredData);
    }

    setFilters(filters) {
        // Apply filters to data (for now, just copy all data)
        this.filteredData = [...this.data];
        this.renderContent();
    }

    updateTimeWindow(startDate, endDate) {
        console.log(`TimelineGrid.updateTimeWindow [${startDate}, ${endDate}]`);
        this.timeWindow.start = startDate;
        this.timeWindow.end = endDate;
        this.renderContent();
    }

    setMilestoneFilters(filters) {
        // Validate filters against available event types
        const validFilters = filters?.filter(filter =>
            filter === 'ANY' || this.availableEventTypes.includes(filter)
        ) || ['ANY'];

        this.milestoneFilters = validFilters.length > 0 ? validFilters : ['ANY'];
        this.applyFilters();
        this.renderContent();

        // Notify parent of filter change if callback exists
        if (this.onMilestoneFilterChange) {
            this.onMilestoneFilterChange(this.milestoneFilters);
        }
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
    // FILTERING
    // ====================

    applyFilters() {
        this.filteredData = this.data.filter(change => {
            // Apply milestone filtering if not showing all types
            if (!this.milestoneFilters.includes('ANY') && this.milestoneFilters.length > 0) {
                // Check if change has any milestones with the filtered event types
                const hasMatchingMilestone = change.milestones?.some(milestone => {
                    if (!milestone.eventTypes || milestone.eventTypes.length === 0) {
                        return false;
                    }

                    // Validate event types and check if any match the filter
                    const validEventTypes = milestone.eventTypes.filter(eventType =>
                        this.availableEventTypes.includes(eventType)
                    );

                    return validEventTypes.some(eventType =>
                        this.milestoneFilters.includes(eventType)
                    );
                });

                if (!hasMatchingMilestone) {
                    return false;
                }
            }

            return true;
        });
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
            console.log(`No milestones for change ${this.getItemId(change)}`);
            return '';
        }

        const itemId = this.getItemId(change);
        console.log(`Rendering ${change.milestones.length} milestones for change ${itemId}`);

        const renderedMilestones = change.milestones.map((milestone, index) => {
            // Find the wave for this milestone
            const wave = this.findMilestoneWave(milestone);
            if (!wave) {
                console.log(`No wave found for milestone ${index}:`, milestone);
                return '';
            }

            // Find wave position in visible waves
            const waveIndex = waves.findIndex(w => String(w.id) === String(wave.id));
            if (waveIndex === -1) {
                console.log(`Wave ${wave.id} (${wave.year} Q${wave.quarter}) not in visible range for milestone ${index}`);
                return '';
            }

            // Apply milestone filtering - check if this milestone should be visible
            if (!this.shouldShowMilestone(milestone)) {
                console.log(`Milestone ${index} filtered out by event type filter`);
                return '';
            }

            // Calculate position
            const position = this.calculateWavePosition(waveIndex, waves.length);

            // Get milestone identifiers
            const milestoneKey = milestone.milestoneKey || milestone.id || `milestone-${index}`;
            const milestoneTitle = milestone.title || `Milestone ${index + 1}`;

            // Check if this milestone is selected
            const isSelected = this.selectedMilestone &&
                (this.selectedMilestone.milestoneKey === milestoneKey ||
                    this.selectedMilestone.id === milestoneKey ||
                    this.selectedMilestone === milestone);

            // Generate pixmap HTML
            const pixmapHtml = this.renderPixmap(milestone.eventTypes || []);

            // Build the complete milestone HTML
            const milestoneHtml = `
            <div class="timeline-milestone ${isSelected ? 'selected' : ''}" 
                 style="left: ${position}%;"
                 data-item-id="${itemId}"
                 data-milestone-key="${milestoneKey}"
                 title="${this.escapeHtml(milestoneTitle)} (${wave.year} Q${wave.quarter})">
                ${pixmapHtml}
            </div>
        `;

            console.log(`Rendered milestone ${index} at ${position}%:`, {
                milestoneKey,
                waveId: wave.id,
                waveLabel: `${wave.year} Q${wave.quarter}`,
                eventTypes: milestone.eventTypes,
                position,
                isSelected
            });

            return milestoneHtml;
        });

        const validMilestones = renderedMilestones.filter(html => html !== '');
        console.log(`Change ${itemId}: ${change.milestones.length} total milestones, ${validMilestones.length} rendered`);

        return validMilestones.join('');
    }

    renderPixmap(eventTypes) {
        if (!eventTypes || eventTypes.length === 0) {
            console.log('No event types for pixmap, rendering empty');
            return `
            <div class="pixmap">
                <div class="pixmap-row">
                    <div class="pixmap-cell api-cell" title="API Events"></div>
                    <div class="pixmap-cell ui-cell" title="UI Events"></div>
                    <div class="pixmap-cell service-cell" title="Service Events"></div>
                </div>
            </div>
        `;
        }

        // Validate event types against shared enum and filter out invalid ones
        const validEventTypes = eventTypes.filter(eventType =>
            this.availableEventTypes.includes(eventType)
        );

        // Enhanced pixmap implementation with column semantics for the 5 specific event types
        const hasApiPublication = validEventTypes.includes('API_PUBLICATION');
        const hasApiTest = validEventTypes.includes('API_TEST_DEPLOYMENT');
        const hasApiDecommission = validEventTypes.includes('API_DECOMMISSIONING');
        const hasUiTest = validEventTypes.includes('UI_TEST_DEPLOYMENT');
        const hasOpsDeployment = validEventTypes.includes('OPS_DEPLOYMENT');

        console.log('Rendering pixmap with valid event types:', validEventTypes);

        // Build tooltip content using shared display function
        const apiEvents = validEventTypes.filter(t => t.includes('API')).map(t => getMilestoneEventTypeDisplay(t));
        const uiEvents = validEventTypes.filter(t => t.includes('UI')).map(t => getMilestoneEventTypeDisplay(t));
        const opsEvents = validEventTypes.filter(t => t.includes('OPS')).map(t => getMilestoneEventTypeDisplay(t));

        return `
        <div class="pixmap">
            <div class="pixmap-row">
                <div class="pixmap-cell api-cell ${hasApiPublication ? 'filled api-publication' : ''} ${hasApiTest ? 'filled api-test' : ''} ${hasApiDecommission ? 'filled api-decommission' : ''}" 
                     title="API Events: ${apiEvents.join(', ') || 'None'}"></div>
                <div class="pixmap-cell ui-cell ${hasUiTest ? 'filled ui-test' : ''}" 
                     title="UI Events: ${uiEvents.join(', ') || 'None'}"></div>
                <div class="pixmap-cell ops-cell ${hasOpsDeployment ? 'filled ops-deployment' : ''}" 
                     title="Operations Events: ${opsEvents.join(', ') || 'None'}"></div>
            </div>
        </div>
    `;
    }

    shouldShowMilestone(milestone) {
        // If showing all types, always show milestone
        if (this.milestoneFilters.includes('ANY')) {
            return true;
        }

        // If no event types on milestone, don't show when filtering
        if (!milestone.eventTypes || milestone.eventTypes.length === 0) {
            return false;
        }

        // Validate event types and show if any valid event types match the filter
        const validEventTypes = milestone.eventTypes.filter(eventType =>
            this.availableEventTypes.includes(eventType)
        );

        return validEventTypes.some(eventType =>
            this.milestoneFilters.includes(eventType)
        );
    }

    renderConnectors(change, waves) {
        if (!change.milestones || change.milestones.length <= 1) {
            return '';
        }

        // Filter milestones based on current milestone filters
        const visibleMilestones = change.milestones.filter(m => this.shouldShowMilestone(m));

        if (visibleMilestones.length <= 1) {
            return '';
        }

        // Sort visible milestones by wave date
        const sortedMilestones = visibleMilestones
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

            const currentIndex = waves.findIndex(w => String(w.id) === String(currentWave.id));
            const nextIndex = waves.findIndex(w => String(w.id) === String(nextWave.id));

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

    renderEmptyState() {
        const hasFilters = !this.milestoneFilters.includes('ANY') && this.milestoneFilters.length > 0;

        this.container.innerHTML = `
            <div class="timeline-empty-state">
                <div class="icon">📅</div>
                <h3>${hasFilters ? 'No Matching Changes' : 'No Changes to Display'}</h3>
                <p>${hasFilters ? 'No changes match the selected milestone filters.' : 'Apply filters to show changes in the timeline view.'}</p>
                ${hasFilters ? '<p><em>Try adjusting the event type filters or time window.</em></p>' : ''}
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
            return this.setupData.waves.find(w => String(w.id) === String(milestone.waveId));
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

    // ====================
    // EXTERNAL STATE CONTROL
    // ====================

    setFiltersFromExternal(filters) {
        // Apply collection filters to timeline data
        this.setData(this.data); // Re-filter current data
    }

    setSelectedItemFromExternal(item) {
        if (!item) return;

        const itemId = this.getItemId(item);
        if (itemId) {
            this.selectItem(itemId);
        }
    }

    setMilestoneFiltersFromExternal(eventTypeFilters) {
        this.setMilestoneFilters(eventTypeFilters);
    }

    // ====================
    // EVENT TYPE VALIDATION (NEW)
    // ====================

    /**
     * Check if an event type is valid according to shared enum
     */
    isValidEventType(eventType) {
        return this.availableEventTypes.includes(eventType);
    }

    /**
     * Filter out invalid event types from an array
     */
    filterValidEventTypes(eventTypes) {
        if (!Array.isArray(eventTypes)) return [];
        return eventTypes.filter(eventType => this.isValidEventType(eventType));
    }

    /**
     * Get display name for event type using shared enum
     */
    getEventTypeDisplay(eventType) {
        return getMilestoneEventTypeDisplay(eventType);
    }

    /**
     * Get all available event types for UI purposes
     */
    getAllEventTypes() {
        return [...this.availableEventTypes];
    }
}