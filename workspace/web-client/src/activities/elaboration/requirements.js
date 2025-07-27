import CollectionEntity from '../../components/odp/collection-entity.js';
import { format } from '../../shared/utils.js';

export default class RequirementsEntity extends CollectionEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    // Requirements-specific filter configuration
    getFilterConfig() {
        return [
            {
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                    { value: '', label: 'All Types' },
                    { value: 'functional', label: 'Functional' },
                    { value: 'non-functional', label: 'Non-Functional' },
                    { value: 'constraint', label: 'Constraint' }
                ]
            },
            {
                key: 'title',
                label: 'Title Pattern',
                type: 'text',
                placeholder: 'Search in title...'
            },
            {
                key: 'impact.data',
                label: 'Data Impact',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'high', label: 'High' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'low', label: 'Low' },
                    { value: 'none', label: 'None' }
                ]
            },
            {
                key: 'impact.stakeholder',
                label: 'Stakeholder Impact',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'high', label: 'High' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'low', label: 'Low' },
                    { value: 'none', label: 'None' }
                ]
            },
            {
                key: 'impact.regulatory',
                label: 'Regulatory Impact',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'high', label: 'High' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'low', label: 'Low' },
                    { value: 'none', label: 'None' }
                ]
            },
            {
                key: 'impact.services',
                label: 'Services Impact',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'high', label: 'High' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'low', label: 'Low' },
                    { value: 'none', label: 'None' }
                ]
            }
        ];
    }

    // Requirements-specific column configuration
    getColumnConfig() {
        return [
            {
                key: 'id',
                label: 'ID',
                width: '80px',
                sortable: true
            },
            {
                key: 'type',
                label: 'Type',
                width: '120px',
                sortable: true,
                render: 'badge'
            },
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                sortable: true
            },
            {
                key: 'parent',
                label: 'Parent',
                width: '100px',
                sortable: true
            },
            {
                key: 'impact.data',
                label: 'Data Impact',
                width: '100px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'impact.stakeholder',
                label: 'Stakeholder Impact',
                width: '120px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'impact.regulatory',
                label: 'Regulatory Impact',
                width: '120px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'impact.services',
                label: 'Services Impact',
                width: '110px',
                sortable: true,
                render: 'status'
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

    // Requirements-specific grouping configuration
    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'type', label: 'Type' },
            { key: 'parent', label: 'Parent' },
            { key: 'impact.data', label: 'Data Impact' },
            { key: 'impact.stakeholder', label: 'Stakeholder Impact' },
            { key: 'impact.regulatory', label: 'Regulatory Impact' },
            { key: 'impact.services', label: 'Services Impact' }
        ];
    }

    // Override for Requirements-specific value extraction
    getItemValue(item, key) {
        switch (key) {
            case 'parent':
                return item.parentId || item.parent?.title || item.parent?.name || null;
            case 'lastUpdatedBy':
                return item.lastUpdatedBy || item.updatedBy || item.createdBy;
            case 'lastUpdatedAt':
                return item.lastUpdatedAt || item.updatedAt || item.createdAt;
            default:
                return super.getItemValue(item, key);
        }
    }

    // Override for Requirements-specific grouping
    getGroupInfo(item, groupBy) {
        const value = this.getItemValue(item, groupBy);

        switch (groupBy) {
            case 'type':
                return {
                    key: value || 'unknown',
                    title: this.formatTypeGroupTitle(value)
                };
            case 'parent':
                return {
                    key: value || 'no-parent',
                    title: value ? `Parent: ${value}` : 'No Parent'
                };
            case 'impact.data':
            case 'impact.stakeholder':
            case 'impact.regulatory':
            case 'impact.services':
                const impactType = groupBy.split('.')[1];
                return {
                    key: value || 'none',
                    title: `${this.formatImpactLabel(impactType)}: ${this.formatImpactLevel(value)}`
                };
            default:
                return super.getGroupInfo(item, groupBy);
        }
    }

    formatTypeGroupTitle(type) {
        const typeTitles = {
            'functional': 'Functional Requirements',
            'non-functional': 'Non-Functional Requirements',
            'constraint': 'Constraint Requirements',
            'unknown': 'Type Not Specified'
        };
        return typeTitles[type] || format.entityName(type);
    }

    formatImpactLabel(impactType) {
        const labels = {
            'data': 'Data',
            'stakeholder': 'Stakeholder',
            'regulatory': 'Regulatory',
            'services': 'Services'
        };
        return labels[impactType] || format.entityName(impactType);
    }

    formatImpactLevel(level) {
        const levels = {
            'high': 'High Impact',
            'medium': 'Medium Impact',
            'low': 'Low Impact',
            'none': 'No Impact'
        };
        return levels[level] || 'Not Specified';
    }

    // Override for Requirements-specific group priorities
    getGroupPriority(key, groupBy) {
        if (groupBy === 'type') {
            const priorities = {
                'functional': 1,
                'non-functional': 2,
                'constraint': 3,
                'unknown': 4
            };
            return priorities[key] || 99;
        }

        if (groupBy.startsWith('impact.')) {
            const priorities = {
                'high': 1,
                'medium': 2,
                'low': 3,
                'none': 4
            };
            return priorities[key] || 99;
        }

        return super.getGroupPriority(key, groupBy);
    }

    // Override cell rendering for Requirements-specific styling
    renderCellValue(item, column) {
        const value = this.getItemValue(item, column.key);

        // Custom rendering for requirement types
        if (column.key === 'type') {
            return this.renderRequirementType(value);
        }

        // Custom rendering for impact columns
        if (column.key.startsWith('impact.')) {
            return this.renderImpactLevel(value);
        }

        return super.renderCellValue(item, column);
    }

    renderRequirementType(type) {
        if (!type) return '-';
        const typeClasses = {
            'functional': 'req-type-functional',
            'non-functional': 'req-type-nonfunctional',
            'constraint': 'req-type-constraint'
        };
        const typeLabels = {
            'functional': 'Functional',
            'non-functional': 'Non-Functional',
            'constraint': 'Constraint'
        };

        const cssClass = typeClasses[type] || 'req-type-other';
        const label = typeLabels[type] || format.entityName(type);

        return `<span class="item-badge ${cssClass}">${label}</span>`;
    }

    renderImpactLevel(level) {
        if (!level) return '-';
        const impactClasses = {
            'high': 'impact-high',
            'medium': 'impact-medium',
            'low': 'impact-low',
            'none': 'impact-none'
        };
        const impactLabels = {
            'high': 'High',
            'medium': 'Medium',
            'low': 'Low',
            'none': 'None'
        };

        const cssClass = impactClasses[level] || 'impact-unknown';
        const label = impactLabels[level] || level;

        return `<span class="item-status ${cssClass}">${label}</span>`;
    }

    // Override for Requirements-specific text filtering
    matchesTextFilter(item, query) {
        const lowerQuery = query.toLowerCase();
        return (
            (item.title?.toLowerCase().includes(lowerQuery)) ||
            (item.name?.toLowerCase().includes(lowerQuery)) ||
            (item.description?.toLowerCase().includes(lowerQuery)) ||
            (item.rationale?.toLowerCase().includes(lowerQuery)) ||
            (item.statement?.toLowerCase().includes(lowerQuery))
        );
    }

    // Override for Requirements-specific additional details
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

        if (item.rationale) {
            details.push(`
                <div class="detail-field">
                    <label>Rationale</label>
                    <p>${this.escapeHtml(item.rationale)}</p>
                </div>
            `);
        }

        if (item.statement) {
            details.push(`
                <div class="detail-field">
                    <label>Statement</label>
                    <p>${this.escapeHtml(item.statement)}</p>
                </div>
            `);
        }

        return details.join('');
    }

    // Override for Requirements-specific empty state
    getEmptyStateIcon() {
        return '📋';
    }

    getEmptyStateTitle() {
        return 'No Requirements Yet';
    }

    getEmptyStateMessage() {
        return 'Start creating operational requirements to define system needs and behaviors.';
    }

    getCreateFirstButtonText() {
        return 'Create First Requirement';
    }
}