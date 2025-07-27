import CollectionEntity from '../../components/odp/collection-entity.js';
import { format } from '../../shared/utils.js';

export default class ChangesEntity extends CollectionEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    // Changes-specific filter configuration
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
                options: [
                    { value: '', label: 'All Waves' },
                    { value: '1', label: 'Wave 1' },
                    { value: '2', label: 'Wave 2' },
                    { value: '3', label: 'Wave 3' },
                    { value: '4', label: 'Wave 4' },
                    { value: '5', label: 'Wave 5' }
                ]
            },
            {
                key: 'satisfies',
                label: 'Satisfies',
                type: 'text',
                placeholder: 'Requirement ID or title...'
            },
            {
                key: 'supersedes',
                label: 'Supersedes',
                type: 'text',
                placeholder: 'Change ID or title...'
            }
        ];
    }

    // Changes-specific column configuration
    getColumnConfig() {
        return [
            {
                key: 'id',
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
                label: 'Satisfies',
                width: '120px',
                sortable: true,
                render: 'list'
            },
            {
                key: 'supersedes',
                label: 'Supersedes',
                width: '120px',
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

    // Changes-specific grouping configuration
    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'wave', label: 'Wave' },
            { key: 'satisfies', label: 'Satisfies (Requirements)' },
            { key: 'supersedes', label: 'Supersedes (Changes)' }
        ];
    }

    // Override for Changes-specific value extraction
    getItemValue(item, key) {
        switch (key) {
            case 'wave':
                return item.wave || item.targetWave || null;
            case 'visibility':
                return item.visibility || item.scope || null;
            case 'satisfies':
                // Handle both array and single value
                if (Array.isArray(item.satisfies)) {
                    return item.satisfies;
                } else if (item.satisfies) {
                    return [item.satisfies];
                } else if (item.requirements) {
                    return Array.isArray(item.requirements) ? item.requirements : [item.requirements];
                }
                return [];
            case 'supersedes':
                // Handle both array and single value
                if (Array.isArray(item.supersedes)) {
                    return item.supersedes;
                } else if (item.supersedes) {
                    return [item.supersedes];
                } else if (item.replacedChanges) {
                    return Array.isArray(item.replacedChanges) ? item.replacedChanges : [item.replacedChanges];
                }
                return [];
            case 'lastUpdatedBy':
                return item.lastUpdatedBy || item.updatedBy || item.createdBy;
            case 'lastUpdatedAt':
                return item.lastUpdatedAt || item.updatedAt || item.createdAt;
            default:
                return super.getItemValue(item, key);
        }
    }

    // Override for Changes-specific grouping
    getGroupInfo(item, groupBy) {
        const value = this.getItemValue(item, groupBy);

        switch (groupBy) {
            case 'wave':
                return {
                    key: value || 'unassigned',
                    title: value ? `Wave ${value}` : 'Unassigned Wave'
                };
            case 'satisfies':
                if (!value || value.length === 0) {
                    return {
                        key: 'no-requirements',
                        title: 'No Requirements Satisfied'
                    };
                }
                // Group by first requirement for simplicity
                const firstReq = Array.isArray(value) ? value[0] : value;
                return {
                    key: firstReq,
                    title: `Satisfies: ${firstReq}`
                };
            case 'supersedes':
                if (!value || value.length === 0) {
                    return {
                        key: 'no-supersedes',
                        title: 'No Changes Superseded'
                    };
                }
                // Group by first superseded change for simplicity
                const firstChange = Array.isArray(value) ? value[0] : value;
                return {
                    key: firstChange,
                    title: `Supersedes: ${firstChange}`
                };
            default:
                return super.getGroupInfo(item, groupBy);
        }
    }

    // Override for Changes-specific group priorities
    getGroupPriority(key, groupBy) {
        if (groupBy === 'wave') {
            if (key === 'unassigned') return 99;
            return parseInt(key) || 0;
        }

        if (groupBy === 'satisfies' || groupBy === 'supersedes') {
            if (key.startsWith('no-')) return 99;
            return 0; // Keep alphabetical order for requirements/changes
        }

        return super.getGroupPriority(key, groupBy);
    }

    // Override cell rendering for Changes-specific styling
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

        // Custom rendering for satisfies/supersedes
        if (column.key === 'satisfies' || column.key === 'supersedes') {
            return this.renderRelationshipList(value);
        }

        return super.renderCellValue(item, column);
    }

    renderWave(wave) {
        if (!wave) return '-';
        return `<span class="item-badge wave-badge">Wave ${wave}</span>`;
    }

    renderVisibility(visibility) {
        if (!visibility) return '-';
        const visibilityClasses = {
            'public': 'visibility-public',
            'internal': 'visibility-internal',
            'restricted': 'visibility-restricted',
            'confidential': 'visibility-confidential'
        };
        const visibilityLabels = {
            'public': 'Public',
            'internal': 'Internal',
            'restricted': 'Restricted',
            'confidential': 'Confidential'
        };

        const cssClass = visibilityClasses[visibility] || 'visibility-other';
        const label = visibilityLabels[visibility] || format.entityName(visibility);

        return `<span class="item-status ${cssClass}">${label}</span>`;
    }

    renderRelationshipList(relationships) {
        if (!relationships || relationships.length === 0) return '-';

        const items = Array.isArray(relationships) ? relationships : [relationships];
        if (items.length === 0) return '-';

        // Show first few items, with "..." if more
        const displayItems = items.slice(0, 2);
        const remainingCount = items.length - displayItems.length;

        let html = displayItems.map(item => {
            // Handle both ID and object references
            const displayValue = typeof item === 'object' ? (item.title || item.name || item.id) : item;
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

    // Override for Changes-specific field filtering
    matchesFieldFilter(item, key, value) {
        if (key === 'satisfies' || key === 'supersedes') {
            const itemValue = this.getItemValue(item, key);
            if (!itemValue || itemValue.length === 0) return false;

            const lowerValue = value.toLowerCase();
            return itemValue.some(rel => {
                const displayValue = typeof rel === 'object' ? (rel.title || rel.name || rel.id) : rel;
                return displayValue?.toString().toLowerCase().includes(lowerValue);
            });
        }

        return super.matchesFieldFilter(item, key, value);
    }

    // Override for Changes-specific additional details
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

        // Show full lists in details
        const satisfies = this.getItemValue(item, 'satisfies');
        if (satisfies && satisfies.length > 0) {
            details.push(`
                <div class="detail-field">
                    <label>Satisfies Requirements</label>
                    <p>${satisfies.map(req => {
                const displayValue = typeof req === 'object' ? (req.title || req.name || req.id) : req;
                return this.escapeHtml(displayValue);
            }).join(', ')}</p>
                </div>
            `);
        }

        const supersedes = this.getItemValue(item, 'supersedes');
        if (supersedes && supersedes.length > 0) {
            details.push(`
                <div class="detail-field">
                    <label>Supersedes Changes</label>
                    <p>${supersedes.map(change => {
                const displayValue = typeof change === 'object' ? (change.title || change.name || change.id) : change;
                return this.escapeHtml(displayValue);
            }).join(', ')}</p>
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