import CollectionEntityForm from '../../components/odp/collection-entity-forms.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * RequirementForm - Operational Requirement form configuration and handling
 * Encapsulates all form-related logic for requirements
 */
export default class RequirementForm {
    constructor(entityConfig, setupData) {
        this.entityConfig = entityConfig;
        this.setupData = setupData;

        // Cache for parent requirements
        this.parentRequirementsCache = null;
        this.parentRequirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache

        // Initialize the base form
        this.form = new CollectionEntityForm({
            endpoint: entityConfig.endpoint,
            context: { setupData },

            getFieldDefinitions: () => this.getFieldDefinitions(),
            getFormTitle: (mode) => this.getFormTitle(mode),
            transformDataForSave: (data, mode, item) => this.transformDataForSave(data, mode, item),
            transformDataForEdit: (item) => this.transformDataForEdit(item),
            onSave: (data, mode, item) => this.saveRequirement(data, mode, item),
            onValidate: (data, mode, item) => this.validateRequirement(data, mode, item)
        });
    }

    // ====================
    // FIELD DEFINITIONS
    // ====================

    getFieldDefinitions() {
        return [
            // Basic Information Section
            {
                title: 'Basic Information',
                fields: [
                    {
                        key: 'itemId',
                        label: 'ID',
                        type: 'text',
                        modes: ['read', 'edit'],
                        readOnly: true
                    },
                    {
                        key: 'version',
                        label: 'Version',
                        type: 'text',
                        modes: ['read'],
                        computed: true
                    },
                    {
                        key: 'type',
                        label: 'Type',
                        type: 'radio',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        editableOnlyOnCreate: true,
                        options: [
                            { value: 'ON', label: 'ON (Operational Need)' },
                            { value: 'OR', label: 'OR (Operational Requirement)' }
                        ],
                        helpTextAbove: 'Select ON for high-level operational needs, OR for specific requirements'
                    },
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        placeholder: 'Enter a clear, concise title for this requirement',
                        validate: (value) => {
                            if (!value || value.length < 5) {
                                return { valid: false, message: 'Title must be at least 5 characters long' };
                            }
                            if (value.length > 200) {
                                return { valid: false, message: 'Title must be less than 200 characters' };
                            }
                            return { valid: true };
                        }
                    },
                    {
                        key: 'statement',
                        label: 'Statement',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        rows: 6,
                        placeholder: 'Describe the operational need or requirement in detail...',
                        helpText: 'Provide a complete description of what is needed and why',
                        validate: (value) => {
                            if (!value || value.length < 20) {
                                return { valid: false, message: 'Statement must be at least 20 characters long' };
                            }
                            return { valid: true };
                        }
                    },
                    {
                        key: 'rationale',
                        label: 'Rationale',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        rows: 4,
                        placeholder: 'Explain the reasoning behind this requirement...',
                        helpText: 'Why is this requirement necessary? What problem does it solve?'
                    },
                    {
                        key: 'description',
                        label: 'Additional Description',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        rows: 3,
                        placeholder: 'Any additional context or clarification...'
                    },
                    {
                        key: 'references',
                        label: 'References',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        rows: 2,
                        placeholder: 'External references, documents, or links...'
                    }
                ]
            },

            // Impact Categories Section
            {
                title: 'Impact Categories',
                fields: [
                    {
                        key: 'impactsStakeholderCategories',
                        label: 'Stakeholder Categories',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 4,
                        options: () => this.getSetupDataOptions('stakeholderCategories'),
                        helpText: 'Select all stakeholder categories affected by this requirement',
                        format: (value) => this.formatMultiSetupData(value, 'stakeholderCategories')
                    },
                    {
                        key: 'impactsData',
                        label: 'Data Categories',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 4,
                        options: () => this.getSetupDataOptions('dataCategories'),
                        helpText: 'Select all data categories impacted by this requirement',
                        format: (value) => this.formatMultiSetupData(value, 'dataCategories')
                    },
                    {
                        key: 'impactsRegulatoryAspects',
                        label: 'Regulatory Aspects',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 4,
                        options: () => this.getSetupDataOptions('regulatoryAspects'),
                        helpText: 'Select all regulatory aspects relevant to this requirement',
                        format: (value) => this.formatMultiSetupData(value, 'regulatoryAspects')
                    },
                    {
                        key: 'impactsServices',
                        label: 'Services',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 4,
                        options: () => this.getSetupDataOptions('services'),
                        helpText: 'Select all services affected by this requirement',
                        format: (value) => this.formatMultiSetupData(value, 'services')
                    }
                ]
            },

            // Relationships Section
            {
                title: 'Relationships',
                fields: [
                    {
                        key: 'refinesParents',
                        label: 'Refines (Parent Requirements)',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 5,
                        options: async () => await this.getParentRequirementOptions(),
                        helpText: 'Select parent requirements that this requirement refines or elaborates',
                        format: (value) => this.formatEntityReferences(value),
                        visible: (item, mode) => {
                            // Show for all ORs, optional for ONs
                            if (mode === 'create') {
                                // In create mode, check the current form value
                                const typeRadio = document.querySelector('input[name="type"]:checked');
                                return !typeRadio || typeRadio.value === 'OR';
                            }
                            return item?.type === 'OR';
                        }
                    }
                ]
            },

            // Metadata Section (read-only)
            {
                title: 'Metadata',
                fields: [
                    {
                        key: 'lastUpdatedBy',
                        label: 'Last Updated By',
                        type: 'text',
                        modes: ['read'],
                        computed: true
                    },
                    {
                        key: 'lastUpdatedAt',
                        label: 'Last Updated',
                        type: 'date',
                        modes: ['read'],
                        computed: true,
                        format: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleString();
                        }
                    },
                    {
                        key: 'createdBy',
                        label: 'Created By',
                        type: 'text',
                        modes: ['read'],
                        computed: true
                    },
                    {
                        key: 'createdAt',
                        label: 'Created',
                        type: 'date',
                        modes: ['read'],
                        computed: true,
                        format: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleString();
                        }
                    },
                    {
                        key: 'versionId',
                        label: 'Version ID',
                        type: 'hidden',
                        modes: ['edit']
                    },
                    {
                        key: 'expectedVersionId',
                        label: 'Expected Version ID',
                        type: 'hidden',
                        modes: ['edit']
                    }
                ]
            }
        ];
    }

    getFormTitle(mode) {
        switch (mode) {
            case 'create':
                return 'Create Operational Requirement';
            case 'edit':
                return 'Edit Operational Requirement';
            case 'read':
                return 'Operational Requirement Details';
            default:
                return 'Operational Requirement';
        }
    }

    // ====================
    // DATA OPTIONS
    // ====================

    getSetupDataOptions(entityName) {
        if (!this.setupData?.[entityName]) {
            return [];
        }

        const labelKey = entityName === 'regulatoryAspects' ? 'title' : 'name';

        return this.setupData[entityName].map(entity => ({
            value: entity.id,
            label: entity[labelKey] || entity.name || entity.id
        }));
    }

    async getParentRequirementOptions() {
        try {
            // Use cache if available and not expired
            const now = Date.now();
            if (this.parentRequirementsCache && (now - this.parentRequirementsCacheTime) < this.cacheTimeout) {
                return this.parentRequirementsCache;
            }

            // Load all requirements
            const requirements = await apiClient.get(this.entityConfig.endpoint);

            // Build options - typically ONs are parents, but allow any requirement
            const options = requirements
                .map(req => ({
                    value: req.itemId || req.id,
                    label: `[${req.type}] ${req.itemId}: ${req.title}`,
                    group: req.type // For potential grouping in the future
                }))
                .sort((a, b) => {
                    // Sort ONs first, then by ID
                    if (a.group !== b.group) {
                        return a.group === 'ON' ? -1 : 1;
                    }
                    return a.label.localeCompare(b.label);
                });

            // Cache the results
            this.parentRequirementsCache = options;
            this.parentRequirementsCacheTime = now;

            return options;

        } catch (error) {
            console.error('Failed to load parent requirements:', error);
            return [];
        }
    }

    // ====================
    // DATA TRANSFORMATION
    // ====================

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Clean up empty arrays
        const arrayFields = [
            'impactsStakeholderCategories',
            'impactsData',
            'impactsRegulatoryAspects',
            'impactsServices',
            'refinesParents'
        ];

        arrayFields.forEach(key => {
            if (transformed[key] && Array.isArray(transformed[key])) {
                if (transformed[key].length === 0) {
                    delete transformed[key];
                }
            }
        });

        // Clean up empty strings
        Object.keys(transformed).forEach(key => {
            if (transformed[key] === '') {
                delete transformed[key];
            }
        });

        // Add version ID for optimistic locking on edit (only if item exists)
        if (mode === 'edit' && item) {
            transformed.expectedVersionId = item.versionId || item.expectedVersionId;
        }

        return transformed;
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Extract IDs from object references if needed
        const arrayFields = [
            'impactsStakeholderCategories',
            'impactsData',
            'impactsRegulatoryAspects',
            'impactsServices',
            'refinesParents'
        ];

        arrayFields.forEach(field => {
            if (transformed[field] && Array.isArray(transformed[field])) {
                transformed[field] = transformed[field].map(value => {
                    if (typeof value === 'object' && value !== null) {
                        return value.itemId || value.id || value;
                    }
                    return value;
                });
            }
        });

        return transformed;
    }

    // ====================
    // VALIDATION
    // ====================

    async validateRequirement(data, mode, item) {
        const errors = [];

        // Type-specific validation
        if (data.type === 'OR') {
            // ORs typically should refine an ON
            if (!data.refinesParents || data.refinesParents.length === 0) {
                // This is a warning, not an error - ORs can exist without parents
                console.warn('Operational Requirement does not refine any parent requirements');
            }
        }

        // Check for at least one impact category
        const hasImpact =
            (data.impactsStakeholderCategories && data.impactsStakeholderCategories.length > 0) ||
            (data.impactsData && data.impactsData.length > 0) ||
            (data.impactsRegulatoryAspects && data.impactsRegulatoryAspects.length > 0) ||
            (data.impactsServices && data.impactsServices.length > 0);

        if (!hasImpact) {
            // Warning, not error
            console.warn('No impact categories selected');
        }

        // Check for duplicate title (in production, this would be an API call)
        // For now, just a placeholder

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ====================
    // SAVE OPERATION
    // ====================

    async saveRequirement(data, mode, item) {
        // Clear cache when saving as it might affect parent options
        this.parentRequirementsCache = null;

        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            if (!item) {
                throw new Error('No item provided for update');
            }
            const itemId = item.itemId || item.id;
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }

    // ====================
    // FORMAT HELPERS
    // ====================

    formatMultiSetupData(values, entityName) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return '-';
        }

        const entities = this.setupData?.[entityName] || [];
        const labelKey = entityName === 'regulatoryAspects' ? 'title' : 'name';

        const names = values.map(id => {
            const entity = entities.find(e => e.id === id);
            return entity ? (entity[labelKey] || entity.name) : id;
        });

        return names.join(', ');
    }

    formatEntityReferences(values) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return '-';
        }

        return values.map(ref => {
            if (typeof ref === 'object' && ref !== null) {
                const type = ref.type ? `[${ref.type}] ` : '';
                return `${type}${ref.title || ref.name || ref.id}`;
            }
            return ref;
        }).join(', ');
    }

    // ====================
    // PUBLIC API
    // ====================

    showCreateModal() {
        this.form.showCreateModal();
    }

    showEditModal(item) {
        this.form.showEditModal(item);
    }

    showReadOnlyModal(item) {
        this.form.showReadOnlyModal(item);
    }

    generateReadOnlyView(item) {
        return this.form.generateForm('read', item);
    }
}