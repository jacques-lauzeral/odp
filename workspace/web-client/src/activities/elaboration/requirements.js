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
                key: 'refinesParents',
                label: 'Refines',
                width: '120px',
                sortable: true
            },
            {
                key: 'impactsData',
                label: 'Data Impact',
                width: '100px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'impactsStakeholderCategories',
                label: 'Stakeholder Impact',
                width: '120px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'impactsRegulatoryAspects',
                label: 'Regulatory Impact',
                width: '120px',
                sortable: true,
                render: 'status'
            },
            {
                key: 'impactsServices',
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
            { key: 'refinesParents', label: 'Refines' },
            { key: 'impactsData', label: 'Data Impact' },
            { key: 'impactsStakeholderCategories', label: 'Stakeholder Impact' },
            { key: 'impactsRegulatoryAspects', label: 'Regulatory Impact' },
            { key: 'impactsServices', label: 'Services Impact' }
        ];
    }

    // Override for Requirements-specific value extraction (fixed ID mapping)
    getItemValue(item, key) {
        switch (key) {
            case 'itemId':
                return item.itemId || item.id;
            case 'refinesParents':
                // Return the full array for cell rendering
                return item.refinesParents || [];
            case 'impactsData':
                return item.impactsData || [];
            case 'impactsStakeholderCategories':
                return item.impactsStakeholderCategories || [];
            case 'impactsRegulatoryAspects':
                return item.impactsRegulatoryAspects || [];
            case 'impactsServices':
                return item.impactsServices || [];
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
            case 'refinesParents':
                // For grouping, use first refined requirement's title
                if (Array.isArray(value) && value.length > 0) {
                    const firstRefine = value[0];
                    const title = firstRefine.title || firstRefine;
                    return {
                        key: title || 'no-refines',
                        title: `Refines: ${title}`
                    };
                }
                return {
                    key: 'no-refines',
                    title: 'No Refinement'
                };
            case 'impactsData':
                // For grouping, use first impact item if array has content
                if (Array.isArray(value) && value.length > 0) {
                    const firstImpact = value[0];
                    const displayName = firstImpact?.title || firstImpact?.name || firstImpact;
                    return {
                        key: displayName || 'none',
                        title: `Data: ${displayName || 'Not Specified'}`
                    };
                }
                return {
                    key: 'none',
                    title: 'Data: Not Specified'
                };
            case 'impactsStakeholderCategories':
                // For grouping, use first impact item if array has content
                if (Array.isArray(value) && value.length > 0) {
                    const firstImpact = value[0];
                    const displayName = firstImpact?.title || firstImpact?.name || firstImpact;
                    return {
                        key: displayName || 'none',
                        title: `Stakeholder: ${displayName || 'Not Specified'}`
                    };
                }
                return {
                    key: 'none',
                    title: 'Stakeholder: Not Specified'
                };
            case 'impactsRegulatoryAspects':
                // For grouping, use first impact item if array has content
                if (Array.isArray(value) && value.length > 0) {
                    const firstImpact = value[0];
                    const displayName = firstImpact?.title || firstImpact?.name || firstImpact;
                    return {
                        key: displayName || 'none',
                        title: `Regulatory: ${displayName || 'Not Specified'}`
                    };
                }
                return {
                    key: 'none',
                    title: 'Regulatory: Not Specified'
                };
            case 'impactsServices':
                // For grouping, use first impact item if array has content
                if (Array.isArray(value) && value.length > 0) {
                    const firstImpact = value[0];
                    const displayName = firstImpact?.title || firstImpact?.name || firstImpact;
                    return {
                        key: displayName || 'none',
                        title: `Services: ${displayName || 'Not Specified'}`
                    };
                }
                return {
                    key: 'none',
                    title: 'Services: Not Specified'
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

        if (groupBy.startsWith('impacts')) {
            if (key === 'none') return 99;
            return 0; // Keep alphabetical order for impact categories
        }

        if (groupBy === 'refinesParents') {
            if (key === 'no-refines') return 99;
            return 0; // Keep alphabetical order for refined requirements
        }

        return super.getGroupPriority(key, groupBy);
    }

    // Override cell rendering for Requirements-specific styling
    renderCellValue(item, column) {
        const value = this.getItemValue(item, column.key);

        // Custom rendering for refines (multiline)
        if (column.key === 'refinesParents') {
            const cellContent = this.renderRefinesCell(value);
            // Add CSS class for multiline rendering
            return `<div class="multiline-cell">${cellContent}</div>`;
        }

        // Custom rendering for impact columns (multiline)
        if (column.key.startsWith('impacts')) {
            const cellContent = this.renderImpactCell(value, column.key);
            // Add CSS class for multiline rendering
            return `<div class="multiline-cell">${cellContent}</div>`;
        }

        // Custom rendering for requirement types
        if (column.key === 'type') {
            return this.renderRequirementType(value);
        }

        // Custom rendering for impact columns
        if (column.key.startsWith('impacts')) {
            const impactType = this.getImpactTypeFromKey(column.key);
            return this.renderImpactLevel(value, impactType);
        }

        return super.renderCellValue(item, column);
    }

    renderRefinesCell(refinesArray) {
        if (!Array.isArray(refinesArray) || refinesArray.length === 0) {
            return '-';
        }

        // Get titles from refines array and join with newlines for multiline display
        const titles = refinesArray.map(refine => {
            const title = refine.title || refine;
            return this.escapeHtml(title);
        });

        return titles.join('\n');
    }

    renderImpactCell(impactArray, fieldKey) {
        if (!Array.isArray(impactArray) || impactArray.length === 0) {
            return '-';
        }

        // Get display names from impact objects and join with newlines for multiline display
        const displayNames = impactArray.map(impact => {
            // Handle both object references and direct values
            const displayName = impact?.title || impact?.name || impact;
            return this.escapeHtml(displayName);
        });

        return displayNames.join('\n');
    }

    getImpactTypeFromKey(fieldKey) {
        // Extract impact type from field key (e.g., 'impactsStakeholderCategories' -> 'stakeholder')
        const typeMap = {
            'impactsData': 'data',
            'impactsStakeholderCategories': 'stakeholder',
            'impactsRegulatoryAspects': 'regulatory',
            'impactsServices': 'services'
        };
        return typeMap[fieldKey] || 'data';
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

        // For single values, display the formatted name from setup data
        if (!Array.isArray(value)) {
            const displayValue = this.formatImpactValue(value, this.getSetupDataKeyForImpactType(impactType));
            return `<span class="item-status impact-${impactType}">${this.escapeHtml(displayValue)}</span>`;
        }

        // For arrays (shouldn't happen in this context, but handle gracefully)
        return this.renderImpactCell(value, `impacts${impactType}`);
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
        if (key.startsWith('impacts')) {
            const itemValue = this.getItemValue(item, key);
            if (!itemValue || itemValue.length === 0) return false;

            // Support both ID and name matching for impact arrays
            const lowerValue = value.toLowerCase();
            const impactType = this.getImpactTypeFromKey(key);
            const setupDataKey = this.getSetupDataKeyForImpactType(impactType);

            return itemValue.some(impact => {
                // Handle object references
                const displayName = impact?.title || impact?.name || impact;
                return displayName?.toString().toLowerCase().includes(lowerValue);
            });
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
        const impacts = ['impactsData', 'impactsStakeholderCategories', 'impactsRegulatoryAspects', 'impactsServices'];
        const impactLabels = {
            'impactsData': 'Data Impact',
            'impactsStakeholderCategories': 'Stakeholder Impact',
            'impactsRegulatoryAspects': 'Regulatory Impact',
            'impactsServices': 'Services Impact'
        };

        impacts.forEach(impactKey => {
            const value = this.getItemValue(item, impactKey);
            if (Array.isArray(value) && value.length > 0) {
                // Handle object references - get titles/names from objects
                const displayNames = value.map(impact =>
                    impact?.title || impact?.name || impact
                ).join(', ');

                details.push(`
                    <div class="detail-field">
                        <label>${impactLabels[impactKey]}</label>
                        <p>${this.escapeHtml(displayNames)}</p>
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