import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { apiClient } from '../../shared/api-client.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay,
    OperationalRequirementType,
    getOperationalRequirementTypeDisplay
} from '/shared/src/index.js';

/**
 * RequirementForm - Operational Requirement form configuration and handling
 * Extends CollectionEntityForm using inheritance pattern
 * Updated for model evolution: DRG field and implementedONs relationships
 */
export default class RequirementForm extends CollectionEntityForm {
    constructor(entityConfig, setupData) {
        // Call parent constructor with appropriate context
        super(entityConfig, { setupData });

        this.setupData = setupData;

        // Cache for parent requirements and ON requirements
        this.parentRequirementsCache = null;
        this.parentRequirementsCacheTime = 0;
        this.onRequirementsCache = null;
        this.onRequirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache
    }

    // ====================
    // OVERRIDE VIRTUAL METHODS
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
                        modes: ['read', 'edit'],
                        readOnly: true
                    },
                    {
                        key: 'type',
                        label: 'Type',
                        type: 'radio',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        editableOnlyOnCreate: true,
                        options: [
                            { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
                            { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
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
                            if (!value || value.length < 4) {
                                return { valid: false, message: 'Title must be at least 4 characters long' };
                            }
                            if (value.length > 200) {
                                return { valid: false, message: 'Title must be less than 200 characters' };
                            }
                            return { valid: true };
                        }
                    },
                    {
                        key: 'drg',
                        label: 'Drafting Group',
                        type: 'select',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        options: () => this.getDraftingGroupOptions(),
                        helpText: 'Select the drafting group responsible for this requirement',
                        format: (value) => value ? getDraftingGroupDisplay(value) : 'Not assigned'
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
                            if (!value || value.length < 8) {
                                return { valid: false, message: 'Statement must be at least 8 characters long' };
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
                    }
                ]
            },

            // Flows Section
            {
                title: 'Flows',
                fields: [
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

            // Impact Section
            {
                title: 'Impact',
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

            // Relationships Section (Enhanced with implementedONs)
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
                    },
                    {
                        key: 'implementedONs',
                        label: 'Implements (ON Requirements)',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        size: 5,
                        visibleWhen: (data) => data.type === 'OR', // Only show for OR-type requirements
                        options: async () => await this.getONRequirementOptions(),
                        helpText: 'Select ON-type requirements that this OR requirement implements',
                        format: (value) => this.formatEntityReferences(value, 'ON')
                    }
                ]
            },

            // Metadata Section (read-only)
            {
                title: 'Metadata',
                fields: [
                    {
                        key: 'createdBy',
                        label: 'Created By',
                        type: 'text',
                        modes: ['read', 'edit'],
                        readOnly: true
                    },
                    {
                        key: 'createdAt',
                        label: 'Created',
                        type: 'date',
                        modes: ['read', 'edit'],
                        readOnly: true,
                        format: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleString();
                        }
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

    transformDataForSave(data, mode, item) {
        console.log('RequirementForm.transformDataForSave in');
        const transformed = { ...data };

        // Add version ID for optimistic locking on edit (only if item exists)
        if (mode === 'edit' && item) {
            transformed.type = item.type; // Type cannot be changed on edit
            transformed.expectedVersionId = item.versionId || item.expectedVersionId;
        }

        console.log('RequirementForm.transformDataForSave data: ', JSON.stringify(transformed));
        // Ensure all required array fields are present (even if empty)
        const requiredArrayFields = [
            'refinesParents',
            'implementedONs',
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

        // Handle DRG field - ensure it's either a valid DRG key or null
        if (transformed.drg !== undefined) {
            if (transformed.drg === '' || transformed.drg === null) {
                transformed.drg = null;
            }
        }

        // Validation: implementedONs should only be present for OR-type requirements
        if (transformed.type !== 'OR') {
            transformed.implementedONs = [];
        }

        return transformed;
    }

    transformDataForRead(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Extract IDs from object references if needed
        const arrayFields = [
            'impactsStakeholderCategories',
            'impactsData',
            'impactsRegulatoryAspects',
            'impactsServices',
            'refinesParents',
            'implementedONs'
        ];

        arrayFields.forEach(field => {
            if (transformed[field] && Array.isArray(transformed[field])) {
                transformed[field] = transformed[field].map(value => {
                    if (typeof value === 'object' && value !== null) {
                        return value.itemTitle || value.title || value;
                    }
                    return typeof value === 'string' && /^\d+$/.test(value) ? parseInt(value, 10) : value;
                });
            }
        });

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
            'refinesParents',
            'implementedONs'
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

    async onSave(data, mode, item) {
        console.log("RequirementForm.onSave in - mode: %s", mode);

        // Clear caches when saving as it might affect relationship options
        this.parentRequirementsCache = null;
        this.onRequirementsCache = null;

        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            if (!item) {
                throw new Error('No item provided for update');
            }
            const itemId = parseInt(item.itemId || item.id, 10);
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }

    async onValidate(data, mode, item) {
        console.log('RequirementForm.onValidate');
        const errors = [];

        // Validate DRG field if provided
        if (data.drg && !Object.keys(DraftingGroup).includes(data.drg)) {
            errors.push({
                field: 'drg',
                message: 'Invalid drafting group selected'
            });
        }

        // Validate implementedONs - should only be present for OR-type requirements
        if (data.type === 'OR' && data.implementedONs && Array.isArray(data.implementedONs)) {
            // Additional validation could be added here to ensure referenced ONs exist
            // This would require an API call to validate the references
        } else if (data.type === 'ON' && data.implementedONs && data.implementedONs.length > 0) {
            errors.push({
                field: 'implementedONs',
                message: 'ON-type requirements cannot implement other requirements'
            });
        }

        console.log('RequirementForm.onValidate - error count: %d', errors.length);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    onCancel() {
        // Custom cancel logic if needed
        console.log('RequirementForm cancelled');
    }

    // ====================
    // DATA OPTIONS HELPERS
    // ====================

    getDraftingGroupOptions() {
        // Build options from shared DraftingGroup enum
        const options = [{ value: '', label: 'Not assigned' }];

        Object.keys(DraftingGroup).forEach(key => {
            options.push({
                value: key,
                label: getDraftingGroupDisplay(key)
            });
        });

        return options;
    }

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

    async getONRequirementOptions() {
        try {
            // Use cache if available and not expired
            const now = Date.now();
            if (this.onRequirementsCache && (now - this.onRequirementsCacheTime) < this.cacheTimeout) {
                return this.onRequirementsCache;
            }

            // Load all requirements and filter for ON-type only
            const requirements = await apiClient.get(this.entityConfig.endpoint);
            const onRequirements = requirements.filter(req => req.type === 'ON');

            // Build options for ON-type requirements
            const options = onRequirements
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),  // Convert to number
                    label: `[ON] ${req.itemId}: ${req.title}`
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            // Cache the results
            this.onRequirementsCache = options;
            this.onRequirementsCacheTime = now;

            return options;

        } catch (error) {
            console.error('Failed to load ON requirements:', error);
            return [];
        }
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

    formatEntityReferences(values, expectedType = null) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

        return values.map(ref => {
            if (typeof ref === 'object' && ref !== null) {
                const type = ref.type ? `[${ref.type}] ` : '';
                const title = ref.title || ref.name || ref.id;
                return `${type}${title}`;
            }
            return ref;
        }).join(', ');
    }

    // ====================
    // CONDITIONAL FIELD VISIBILITY HANDLING
    // ====================

    updateFieldVisibility(formData) {
        // Handle conditional visibility for implementedONs field
        const implementedONsSection = this.currentModal?.querySelector('[data-field="implementedONs"]');
        if (implementedONsSection) {
            const isORType = formData.type === 'OR';
            implementedONsSection.style.display = isORType ? 'block' : 'none';

            // Clear implementedONs if changing to ON type
            if (!isORType) {
                const implementedONsInput = implementedONsSection.querySelector('select');
                if (implementedONsInput) {
                    // Clear all selections
                    Array.from(implementedONsInput.options).forEach(option => {
                        option.selected = false;
                    });
                }
            }
        }
    }

    // Override to handle conditional field updates
    async showCreateModal() {
        await super.showCreateModal();

        // Bind type change event to update field visibility
        const typeInputs = this.currentModal?.querySelectorAll('input[name="type"]');
        if (typeInputs) {
            typeInputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    const formData = this.collectFormData();
                    this.updateFieldVisibility(formData);
                });
            });
        }

        // Set initial visibility based on default type
        this.updateFieldVisibility({ type: 'ON' }); // Default to ON
    }

    async showEditModal(item) {
        await super.showEditModal(item);

        // Bind type change event to update field visibility
        const typeInputs = this.currentModal?.querySelectorAll('input[name="type"]');
        if (typeInputs) {
            typeInputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    const formData = this.collectFormData();
                    this.updateFieldVisibility(formData);
                });
            });
        }

        // Set initial visibility based on item type
        this.updateFieldVisibility({ type: item?.type || 'ON' });
    }

    // ====================
    // PUBLIC API (convenience methods)
    // ====================

    async showReadOnlyModal(item) {
        await super.showReadOnlyModal(item);
    }

    async generateReadOnlyView(item) {
        return await super.generateReadOnlyView(item);
    }
}