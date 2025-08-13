import CollectionEntityForm from '../../components/odp/collection-entity-forms.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * RequirementForm - Operational Requirement form configuration and handling
 * Matches the API schema exactly for OperationalRequirementRequest
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
                    }
                ]
            },

            // Content Section
            {
                title: 'Requirement Content',
                fields: [
                    {
                        key: 'statement',
                        label: 'Statement',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        rows: 6,
                        placeholder: 'Describe the operational need or requirement in detail...',
                        helpText: 'Provide a complete description of what is needed',
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
                        required: true,
                        rows: 4,
                        placeholder: 'Explain the reasoning behind this requirement...',
                        helpText: 'Why is this requirement necessary? What problem does it solve?'
                    },
                    {
                        key: 'references',
                        label: 'References',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        rows: 3,
                        placeholder: 'External references, documents, standards, or links...',
                        helpText: 'Include any relevant external documentation or standards'
                    },
                    {
                        key: 'risksAndOpportunities',
                        label: 'Risks and Opportunities',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        rows: 4,
                        placeholder: 'Describe potential risks and opportunities associated with this requirement...',
                        helpText: 'What risks does this address? What opportunities does it create?'
                    },
                    {
                        key: 'flows',
                        label: 'Flows',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        rows: 4,
                        placeholder: 'Describe the operational flows or processes...',
                        helpText: 'How does this requirement affect operational flows?'
                    },
                    {
                        key: 'flowExamples',
                        label: 'Flow Examples',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        rows: 4,
                        placeholder: 'Provide specific examples of the flows described above...',
                        helpText: 'Concrete examples help clarify the requirement'
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
                        required: false,
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
                        required: false,
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
                        required: false,
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
                        required: false,
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
                        required: false,
                        size: 5,
                        options: async () => await this.getParentRequirementOptions(),
                        helpText: 'Select parent requirements that this requirement refines (use empty array if none)',
                        format: (value) => this.formatEntityReferences(value)
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
            value: parseInt(entity.id, 10),  // Convert to number
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

            // Build options - allow any requirement as parent
            const options = requirements
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),  // Convert to number
                    label: `[${req.type}] ${req.itemId}: ${req.title}`,
                    group: req.type
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
        console.log('Requirementform.transformDataForSave in')
        const transformed = { ...data };

        // Ensure all required array fields are present (even if empty)
        const requiredArrayFields = [
            'refinesParents',
            'impactsStakeholderCategories',
            'impactsData',
            'impactsRegulatoryAspects',
            'impactsServices'
        ];

        requiredArrayFields.forEach(key => {
            // If field is undefined or null, set to empty array
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = [];
            }
            // Ensure it's an array
            if (!Array.isArray(transformed[key])) {
                transformed[key] = [];
            }
        });

        // Ensure all required text fields are present (even if empty)
        const requiredTextFields = [
            'title', 'type', 'statement', 'rationale',
            'references', 'risksAndOpportunities', 'flows', 'flowExamples'
        ];

        requiredTextFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = '';
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
                        const id = value.itemId || value.id || value;
                        return typeof id === 'string' ? parseInt(id, 10) : id;
                    }
                    return typeof value === 'string' && /^\d+$/.test(value) ? parseInt(value, 10) : value;
                });
            }
        });

        return transformed;
    }

    // ====================
    // VALIDATION
    // ====================

    async validateRequirement(data, mode, item) {
        console.log('RequirementForm.validateRequirement in')
        const errors = [];

        // All required fields are marked in the field definitions
        // The form framework will handle required field validation

        // placeholder for additional business logic validation

        console.log('RequirementForm.validateRequirement out - error count: %d', errors.length)

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ====================
    // SAVE OPERATION
    // ====================

    async saveRequirement(data, mode, item) {
        console.log("Requirementform.saveRequirement in - mode: %s", mode);
        // Clear cache when saving as it might affect parent options
        this.parentRequirementsCache = null;

        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            if (!item) {
                throw new Error('No item provided for update');
            }
            const itemId = parseInt(item.itemId || item.id, 10);
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);        }
    }

    // ====================
    // FORMAT HELPERS
    // ====================

    formatMultiSetupData(values, entityName) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
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
            return 'None';
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

    async showCreateModal() {
        await this.form.showCreateModal();
    }

    async showEditModal(item) {
        await this.form.showEditModal(item);
    }

    async showReadOnlyModal(item) {
        await this.form.showReadOnlyModal(item);
    }

    async generateReadOnlyView(item) {
        return await this.form.generateForm('read', item);
    }
}