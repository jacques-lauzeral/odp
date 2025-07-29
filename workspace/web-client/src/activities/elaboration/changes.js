import CollectionEntity from '../../components/odp/collection-entity.js';
import { format } from '../../shared/utils.js';

export default class ChangesEntity extends CollectionEntity {
    constructor(app, entityConfig, setupData) {
        super(app, entityConfig, setupData);
        this.setupData = setupData;
    }

    // FIXED: Changes-specific filter configuration
    getFilterConfig() {
        return [
            {
                key: 'title',
                label: 'Title Pattern',
                type: 'text',
                placeholder: 'Search in title...'
            },
            {
                key: 'wave',
                label: 'Wave',
                type: 'select',
                options: this.getWaveOptions()
            },
            {
                key: 'satisfies',
                label: 'Satisfies Requirements',
                type: 'text',
                placeholder: 'Requirement ID or title...'
            },
            {
                key: 'supersedes',
                label: 'Supersedes Requirements',
                type: 'text',
                placeholder: 'Requirement ID or title...'
            }
        ];
    }

    // Helper method to build wave options from setup data
    getWaveOptions() {
        const baseOptions = [{ value: '', label: 'All Waves' }];
        if (this.setupData?.waves) {
            const setupOptions = this.setupData.waves.map(wave => ({
                value: wave.id || `${wave.year}-${wave.quarter}`,
                label: this.formatWaveLabel(wave)
            }));
            return baseOptions.concat(setupOptions);
        }
        return baseOptions;
    }

    formatWaveLabel(wave) {
        if (wave.year && wave.quarter) {
            return `${wave.year} Q${wave.quarter}`;
        }
        return wave.name || wave.id || 'Unknown Wave';
    }

    // FIXED: Changes-specific column configuration
    getColumnConfig() {
        return [
            {
                key: 'itemId',
                label: 'ID',
                width: '80px',
                sortable: true
            },
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                sortable: true
            },
            {
                key: 'wave',
                label: 'Wave',
                width: '80px',
                sortable: true,
                render: 'badge'
            },
            {
                key: 'visibility',
                label: 'Visibility',
                width: '100px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'satisfies',
                label: 'Satisfies Requirements',
                width: '150px',
                sortable: true,
                render: 'list'
            },
            {
                key: 'supersedes',
                label: 'Supersedes Requirements',
                width: '150px',
                sortable: true,
                render: 'list'
            },
            {
                key: 'lastUpdatedBy',
                label: 'Updated By',
                width: '130px',
                sortable: true
            },
            {
                key: 'lastUpdatedAt',
                label: 'Updated',
                width: '110px',
                sortable: true,
                render: 'date'
            }
        ];
    }

    // FIXED: Changes-specific grouping configuration
    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'wave', label: 'Wave' },
            { key: 'satisfies', label: 'Satisfies Requirements' },
            { key: 'supersedes', label: 'Supersedes Requirements' }
        ];
    }

    // FIXED: Override for Changes-specific value extraction
    getItemValue(item, key) {
        switch (key) {
            case 'itemId':
                return item.itemId || item.id;
            case 'wave':
                // FIXED: Extract wave from milestones that have a wave assigned
                if (item.milestones && Array.isArray(item.milestones)) {
                    // Find the first milestone with a wave
                    const milestoneWithWave = item.milestones.find(m => m.wave);
                    if (milestoneWithWave && milestoneWithWave.wave) {
                        const wave = milestoneWithWave.wave;
                        return wave.name || wave.title || `${wave.year}.${wave.quarter}` || wave.id;
                    }
                }
                // Fallback to direct wave properties
                if (item.wave) {
                    return typeof item.wave === 'object' ? item.wave.id || item.wave.name : item.wave;
                }
                if (item.targetWave) {
                    return typeof item.targetWave === 'object' ? item.targetWave.id || item.targetWave.name : item.targetWave;
                }
                return null;
            case 'visibility':
                return item.visibility || item.scope || null;
            case 'satisfies':
                // Handle satisfies relationships (contains Requirements)
                let satisfiesArray = [];
                if (Array.isArray(item.satisfiesRequirements)) {
                    satisfiesArray = item.satisfiesRequirements;
                } else if (item.satisfiesRequirements) {
                    satisfiesArray = [item.satisfiesRequirements];
                }

                // Return the array of requirement objects
                return satisfiesArray;
            case 'supersedes':
                // FIXED: Use correct API field 'supersedsRequirements' (contains Requirements, not Changes)
                let supersedesArray = [];

                if (Array.isArray(item.supersedsRequirements)) {
                    supersedesArray = item.supersedsRequirements;
                } else if (item.supersedsRequirements) {
                    supersedesArray = [item.supersedsRequirements];
                }

                // Return the array of requirement objects (not changes)
                return supersedesArray;
            case 'lastUpdatedBy':
                return item.lastUpdatedBy || item.updatedBy || item.createdBy;
            case 'lastUpdatedAt':
                return item.lastUpdatedAt || item.updatedAt || item.createdAt;
            default:
                return super.getItemValue(item, key);
        }
    }

    // FIXED: Override for Changes-specific grouping
    getGroupInfo(item, groupBy) {
        const value = this.getItemValue(item, groupBy);

        switch (groupBy) {
            case 'wave':
                return {
                    key: value || 'unassigned',
                    title: this.formatWaveGroupTitle(value)
                };
            case 'satisfies':
                if (!value || !Array.isArray(value) || value.length === 0) {
                    return {
                        key: 'no-requirements',
                        title: 'No Requirements Satisfied'
                    };
                }
                // Group by first requirement title
                const firstReq = value[0];
                const firstReqDisplay = firstReq?.title || firstReq?.name || firstReq?.id || 'Unknown';
                return {
                    key: firstReqDisplay,
                    title: `Satisfies: ${firstReqDisplay}`
                };
            case 'supersedes':
                if (!value || !Array.isArray(value) || value.length === 0) {
                    return {
                        key: 'no-supersedes',
                        title: 'No Requirements Superseded'
                    };
                }
                // Group by first superseded requirement title
                const firstSuperseded = value[0];
                const firstSupersededDisplay = firstSuperseded?.title || firstSuperseded?.name || firstSuperseded?.id || 'Unknown';
                return {
                    key: firstSupersededDisplay,
                    title: `Supersedes: ${firstSupersededDisplay}`
                };
            default:
                return super.getGroupInfo(item, groupBy);
        }
    }

    // Helper method to get display value from relationship object
    getDisplayValue(item) {
        if (!item) return 'Unknown';
        if (typeof item === 'string') return item;
        if (typeof item === 'object') {
            return item.title || item.name || item.id || 'Unknown';
        }
        return item.toString();
    }

    formatWaveGroupTitle(waveValue) {
        if (!waveValue) return 'Unassigned Wave';

        // Try to find the wave in setup data for proper formatting
        if (this.setupData?.waves) {
            const wave = this.setupData.waves.find(w =>
                (w.id === waveValue) ||
                (`${w.year}-${w.quarter}` === waveValue) ||
                (w.name === waveValue)
            );
            if (wave) {
                return this.formatWaveLabel(wave);
            }
        }

        return `Wave ${waveValue}`;
    }

    // Override for Changes-specific group priorities
    getGroupPriority(key, groupBy) {
        if (groupBy === 'wave') {
            if (key === 'unassigned') return 99;

            // Try to find wave in setup data for proper ordering
            if (this.setupData?.waves) {
                const wave = this.setupData.waves.find(w =>
                    (w.id === key) ||
                    (`${w.year}-${w.quarter}` === key) ||
                    (w.name === key)
                );
                if (wave) {
                    // Sort by year and quarter
                    return (wave.year * 10) + (wave.quarter || 0);
                }
            }

            // Fallback: try to parse as number
            const numericValue = parseInt(key);
            return isNaN(numericValue) ? 50 : numericValue;
        }

        if (groupBy === 'satisfies' || groupBy === 'supersedes') {
            if (key.startsWith('no-') || key === 'Unknown') return 99;
            return 0; // Keep alphabetical order for requirements/changes
        }

        return super.getGroupPriority(key, groupBy);
    }

    // FIXED: Override cell rendering for Changes-specific styling
    renderCellValue(item, column) {
        const value = this.getItemValue(item, column.key);

        // Custom rendering for wave
        if (column.key === 'wave') {
            return this.renderWave(value);
        }

        // Custom rendering for visibility
        if (column.key === 'visibility') {
            return this.renderVisibility(value);
        }

        // FIXED: Custom rendering for satisfies/supersedes
        if (column.key === 'satisfies' || column.key === 'supersedes') {
            return this.renderRelationshipList(value);
        }

        return super.renderCellValue(item, column);
    }

    renderWave(wave) {
        if (!wave) return '-';

        // Try to format using setup data
        const displayValue = this.formatWaveGroupTitle(wave);
        return `<span class="item-badge wave-badge">${this.escapeHtml(displayValue)}</span>`;
    }

    renderVisibility(visibility) {
        if (!visibility) return '-';
        const visibilityClasses = {
            'NM': 'visibility-nm',
            'NETWORK': 'visibility-network',
            'public': 'visibility-public',
            'internal': 'visibility-internal',
            'restricted': 'visibility-restricted',
            'confidential': 'visibility-confidential'
        };
        const visibilityLabels = {
            'NM': 'NM',
            'NETWORK': 'Network',
            'public': 'Public',
            'internal': 'Internal',
            'restricted': 'Restricted',
            'confidential': 'Confidential'
        };

        const cssClass = visibilityClasses[visibility] || 'visibility-other';
        const label = visibilityLabels[visibility] || format.entityName(visibility);

        return `<span class="item-status ${cssClass}">${label}</span>`;
    }

    // FIXED: Improved relationship list rendering for Requirements
    renderRelationshipList(relationships) {
        if (!relationships || !Array.isArray(relationships) || relationships.length === 0) {
            return '-';
        }

        // Show first few items, with "..." if more
        const displayItems = relationships.slice(0, 2);
        const remainingCount = relationships.length - displayItems.length;

        let html = displayItems.map(req => {
            // Handle requirement objects with id, title, type properties
            const displayValue = req?.title || req?.name || req?.id || 'Unknown';
            return `<span class="relationship-item">${this.escapeHtml(displayValue)}</span>`;
        }).join(', ');

        if (remainingCount > 0) {
            html += `, <span class="relationship-more">+${remainingCount} more</span>`;
        }

        return html;
    }

    // Override for Changes-specific text filtering
    matchesTextFilter(item, query) {
        const lowerQuery = query.toLowerCase();
        return (
            (item.title?.toLowerCase().includes(lowerQuery)) ||
            (item.name?.toLowerCase().includes(lowerQuery)) ||
            (item.description?.toLowerCase().includes(lowerQuery)) ||
            (item.implementationNotes?.toLowerCase().includes(lowerQuery)) ||
            (item.milestone?.toLowerCase().includes(lowerQuery))
        );
    }

    // FIXED: Override for Changes-specific field filtering
    matchesFieldFilter(item, key, value) {
        if (key === 'wave') {
            const itemValue = this.getItemValue(item, key);
            if (!itemValue) return false;

            const lowerValue = value.toLowerCase();
            const itemString = itemValue.toString().toLowerCase();

            // Also check if the display name matches
            const displayValue = this.formatWaveGroupTitle(itemValue);

            return itemString.includes(lowerValue) || displayValue.toLowerCase().includes(lowerValue);
        }

        if (key === 'satisfies' || key === 'supersedes') {
            const itemValue = this.getItemValue(item, key);
            if (!itemValue || !Array.isArray(itemValue) || itemValue.length === 0) {
                return false;
            }

            const lowerValue = value.toLowerCase();
            return itemValue.some(req => {
                // Handle requirement objects
                const id = req?.id?.toString().toLowerCase();
                const title = req?.title?.toLowerCase();
                const name = req?.name?.toLowerCase();

                return (id && id.includes(lowerValue)) ||
                    (title && title.includes(lowerValue)) ||
                    (name && name.includes(lowerValue));
            });
        }

        return super.matchesFieldFilter(item, key, value);
    }

    // FIXED: Override for Changes-specific additional details
    renderAdditionalDetails(item) {
        const details = [];

        if (item.description) {
            details.push(`
                <div class="detail-field">
                    <label>Description</label>
                    <p>${this.escapeHtml(item.description)}</p>
                </div>
            `);
        }

        if (item.milestone) {
            details.push(`
                <div class="detail-field">
                    <label>Milestone</label>
                    <p>${this.escapeHtml(item.milestone)}</p>
                </div>
            `);
        }

        if (item.implementationNotes) {
            details.push(`
                <div class="detail-field">
                    <label>Implementation Notes</label>
                    <p>${this.escapeHtml(item.implementationNotes)}</p>
                </div>
            `);
        }

        if (item.impactLevel) {
            details.push(`
                <div class="detail-field">
                    <label>Impact Level</label>
                    <p>${this.formatImpactLevel(item.impactLevel)}</p>
                </div>
            `);
        }

        // Show wave details with setup data
        const waveValue = this.getItemValue(item, 'wave');
        if (waveValue) {
            const waveDisplay = this.formatWaveGroupTitle(waveValue);
            details.push(`
                <div class="detail-field">
                    <label>Target Wave</label>
                    <p>${this.escapeHtml(waveDisplay)}</p>
                </div>
            `);
        }

        // FIXED: Show requirement relationships with proper titles
        const satisfies = this.getItemValue(item, 'satisfies');
        if (satisfies && Array.isArray(satisfies) && satisfies.length > 0) {
            const satisfiesDisplay = satisfies.map(req => req?.title || req?.name || req?.id || 'Unknown').join(', ');
            details.push(`
                <div class="detail-field">
                    <label>Satisfies Requirements</label>
                    <p>${this.escapeHtml(satisfiesDisplay)}</p>
                </div>
            `);
        }

        const supersedes = this.getItemValue(item, 'supersedes');
        if (supersedes && Array.isArray(supersedes) && supersedes.length > 0) {
            const supersedesDisplay = supersedes.map(req => req?.title || req?.name || req?.id || 'Unknown').join(', ');
            details.push(`
                <div class="detail-field">
                    <label>Supersedes Requirements</label>
                    <p>${this.escapeHtml(supersedesDisplay)}</p>
                </div>
            `);
        }

        return details.join('');
    }

    formatImpactLevel(level) {
        const levels = {
            'low': 'Low Impact',
            'medium': 'Medium Impact',
            'high': 'High Impact',
            'critical': 'Critical Impact'
        };
        return levels[level] || format.entityName(level);
    }

    // Override for Changes-specific empty state
    getEmptyStateIcon() {
        return '🔄';
    }

    getEmptyStateTitle() {
        return 'No Changes Yet';
    }

    getEmptyStateMessage() {
        return 'Start creating operational changes to define implementation activities and milestones.';
    }

    getCreateFirstButtonText() {
        return 'Create First Change';
    }
}