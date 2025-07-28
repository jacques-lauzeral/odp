import CollectionEntity from '../../components/odp/collection-entity.js';
import { format } from '../../shared/utils.js';

export default class RequirementsEntity extends CollectionEntity {
    constructor(app, entityConfig, setupData) {
        super(app, entityConfig, setupData);
        this.setupData = setupData;
    }

    // Requirements-specific filter configuration using setup data
    getFilterConfig() {
        return [
            {
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                    { value: '', label: 'All Types' },
                    { value: 'ON', label: 'ON (Operational Need)' },
                    { value: 'OR', label: 'OR (Operational Requirement)' }
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
                options: this.getDataCategoryOptions()
            },
            {
                key: 'impact.stakeholder',
                label: 'Stakeholder Impact',
                type: 'select',
                options: this.getStakeholderCategoryOptions()
            },
            {
                key: 'impact.regulatory',
                label: 'Regulatory Impact',
                type: 'select',
                options: this.getRegulatoryAspectOptions()
            },
            {
                key: 'impact.services',
                label: 'Services Impact',
                type: 'select',
                options: this.getServicesOptions()
            }
        ];
    }

    // Helper methods to build filter options from setup data
    getDataCategoryOptions() {
        const baseOptions = [{ value: '', label: 'Any Data Category' }];
        if (this.setupData?.dataCategories) {
            const setupOptions = this.setupData.dataCategories.map(category => ({
                value: category.id || category.name,
                label: category.name
            }));
            return baseOptions.concat(setupOptions);
        }
        return baseOptions;
    }

    getStakeholderCategoryOptions() {
        const baseOptions = [{ value: '', label: 'Any Stakeholder Category' }];
        if (this.setupData?.stakeholderCategories) {
            const setupOptions = this.setupData.stakeholderCategories.map(category => ({
                value: category.id || category.name,
                label: category.name
            }));
            return baseOptions.concat(setupOptions);
        }
        return baseOptions;
    }

    getRegulatoryAspectOptions() {
        const baseOptions = [{ value: '', label: 'Any Regulatory Aspect' }];
        if (this.setupData?.regulatoryAspects) {
            const setupOptions = this.setupData.regulatoryAspects.map(aspect => ({
                value: aspect.id || aspect.name,
                label: aspect.name
            }));
            return baseOptions.concat(setupOptions);
        }
        return baseOptions;
    }

    getServicesOptions() {
        const baseOptions = [{ value: '', label: 'Any Service' }];
        if (this.setupData?.services) {
            const setupOptions = this.setupData.services.map(service => ({
                value: service.id || service.name,
                label: service.name
            }));
            return baseOptions.concat(setupOptions);
        }
        return baseOptions;
    }

    // Requirements-specific column configuration
    getColumnConfig() {
        return [
            {
                key: 'itemId',
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

    // Override for Requirements-specific value extraction (fixed ID mapping)
    getItemValue(item, key) {
        switch (key) {
            case 'itemId':
                return item.itemId || item.id;
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
                return {
                    key: value || 'none',
                    title: `Data: ${this.formatImpactValue(value, 'dataCategories')}`
                };
            case 'impact.stakeholder':
                return {
                    key: value || 'none',
                    title: `Stakeholder: ${this.formatImpactValue(value, 'stakeholderCategories')}`
                };
            case 'impact.regulatory':
                return {
                    key: value || 'none',
                    title: `Regulatory: ${this.formatImpactValue(value, 'regulatoryAspects')}`
                };
            case 'impact.services':
                return {
                    key: value || 'none',
                    title: `Services: ${this.formatImpactValue(value, 'services')}`
                };
            default:
                return super.getGroupInfo(item, groupBy);
        }
    }

    formatTypeGroupTitle(type) {
        const typeTitles = {
            'ON': 'Operational Needs',
            'OR': 'Operational Requirements',
            'unknown': 'Type Not Specified'
        };
        return typeTitles[type] || format.entityName(type);
    }

    formatImpactValue(value, setupDataKey) {
        if (!value) return 'Not Specified';

        if (this.setupData?.[setupDataKey]) {
            const item = this.setupData[setupDataKey].find(item =>
                (item.id === value) || (item.name === value)
            );
            if (item) return item.name;
        }

        return value;
    }

    // Override for Requirements-specific group priorities
    getGroupPriority(key, groupBy) {
        if (groupBy === 'type') {
            const priorities = {
                'ON': 1,
                'OR': 2,
                'unknown': 3
            };
            return priorities[key] || 99;
        }

        if (groupBy.startsWith('impact.')) {
            if (key === 'none') return 99;
            return 0; // Keep alphabetical order for impact categories
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
            const impactType = column.key.split('.')[1];
            return this.renderImpactLevel(value, impactType);
        }

        return super.renderCellValue(item, column);
    }

    renderRequirementType(type) {
        if (!type) return '-';
        const typeClasses = {
            'ON': 'req-type-on',
            'OR': 'req-type-or'
        };
        const typeLabels = {
            'ON': 'ON',
            'OR': 'OR'
        };

        const cssClass = typeClasses[type] || 'req-type-other';
        const label = typeLabels[type] || format.entityName(type);

        return `<span class="item-badge ${cssClass}">${label}</span>`;
    }

    renderImpactLevel(value, impactType) {
        if (!value) return '-';

        // Display the formatted name from setup data
        const displayValue = this.formatImpactValue(value, this.getSetupDataKeyForImpactType(impactType));

        return `<span class="item-status impact-${impactType}">${this.escapeHtml(displayValue)}</span>`;
    }

    getSetupDataKeyForImpactType(impactType) {
        const keyMap = {
            'data': 'dataCategories',
            'stakeholder': 'stakeholderCategories',
            'regulatory': 'regulatoryAspects',
            'services': 'services'
        };
        return keyMap[impactType] || 'dataCategories';
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

    // Override for Requirements-specific field filtering
    matchesFieldFilter(item, key, value) {
        if (key.startsWith('impact.')) {
            const itemValue = this.getItemValue(item, key);
            if (!itemValue) return false;

            // Support both ID and name matching
            const lowerValue = value.toLowerCase();
            const itemString = itemValue.toString().toLowerCase();

            // Also check if the display name matches
            const impactType = key.split('.')[1];
            const displayValue = this.formatImpactValue(itemValue, this.getSetupDataKeyForImpactType(impactType));

            return itemString.includes(lowerValue) || displayValue.toLowerCase().includes(lowerValue);
        }

        return super.matchesFieldFilter(item, key, value);
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

        // Show impact details with setup data names
        const impacts = ['data', 'stakeholder', 'regulatory', 'services'];
        impacts.forEach(impactType => {
            const value = this.getItemValue(item, `impact.${impactType}`);
            if (value) {
                const displayValue = this.formatImpactValue(value, this.getSetupDataKeyForImpactType(impactType));
                details.push(`
                    <div class="detail-field">
                        <label>${format.entityName(impactType)} Impact</label>
                        <p>${this.escapeHtml(displayValue)}</p>
                    </div>
                `);
            }
        });

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