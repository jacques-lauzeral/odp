/**
 * requirement-form-fields.js
 * Pure configuration for RequirementForm field definitions
 * Separated from business logic for better maintainability
 */

/**
 * Field definitions configuration for Operational Requirement forms
 * This is pure declarative configuration - no logic, no state
 *
 * Special field properties:
 * - optionsKey: References a method name on the form instance
 * - formatKey: References a method name on the form instance
 * - visibleWhen: Function that determines field visibility based on form data
 */
export const requirementFieldDefinitions = [
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
                optionsKey: 'getTypeOptions',
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
                optionsKey: 'getDraftingGroupOptions',
                helpText: 'Select the drafting group responsible for this requirement',
                formatKey: 'formatDraftingGroup'
            }
        ]
    },

    // Requirement Details Section
    {
        title: 'Requirement Details',
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
                key: 'privateNotes',
                label: 'Private Notes',
                type: 'textarea',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 3,
                placeholder: 'Internal notes (not for publication)...',
                helpText: 'Private notes for internal use only'
            },
            {
                key: 'path',
                label: 'Path',
                type: 'textarea',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 2,
                placeholder: 'Enter path elements separated by commas (e.g., "Technical Aspects, Service Lifecycle, Versioning")',
                helpText: 'Organizational path for this requirement (comma-separated)',
                format: (value) => {
                    if (!value || !Array.isArray(value) || value.length === 0) return 'No path';
                    return value.join(' > ');
                }
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
                type: 'annotated-multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                maxNoteLength: 200,
                placeholder: 'Select stakeholder categories...',
                noteLabel: 'Impact Note',
                optionsKey: 'getStakeholderCategoryOptions',
                helpText: 'Select affected stakeholder categories and optionally add notes about the nature of the impact'
            },
            {
                key: 'impactsData',
                label: 'Data Categories',
                type: 'annotated-multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                maxNoteLength: 200,
                placeholder: 'Select data categories...',
                noteLabel: 'Impact Note',
                optionsKey: 'getDataCategoryOptions',
                helpText: 'Select impacted data categories and optionally add notes about the nature of the impact'
            },
            {
                key: 'impactsServices',
                label: 'Services',
                type: 'annotated-multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                maxNoteLength: 200,
                placeholder: 'Select services...',
                noteLabel: 'Impact Note',
                optionsKey: 'getServiceOptions',
                helpText: 'Select affected services and optionally add notes about the nature of the impact'
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
                optionsKey: 'getParentRequirementOptions',
                helpText: 'Select parent requirements that this requirement refines',
                formatKey: 'formatEntityReferences'
            },
            {
                key: 'implementedONs',
                label: 'Implements (ON Requirements)',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                visibleWhen: (data) => data.type === 'OR', // Only show for OR-type requirements
                optionsKey: 'getONRequirementOptions',
                helpText: 'Select ON-type requirements that this OR requirement implements',
                formatKey: 'formatEntityReferences',
                formatArgs: ['ON']
            },
            {
                key: 'dependsOnRequirements',
                label: 'Depends On (Requirements)',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                optionsKey: 'getDependencyRequirementOptions',
                helpText: 'Select requirements that this requirement depends on (follows latest version automatically)',
                formatKey: 'formatEntityReferences'
            }
        ]
    },

    // Document References Section
    {
        title: 'Document References',
        fields: [
            {
                key: 'documentReferences',
                label: 'Document References',
                type: 'annotated-multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                maxNoteLength: 200,
                placeholder: 'Select documents...',
                noteLabel: 'Reference Note',
                optionsKey: 'getDocumentOptions',
                helpText: 'Select documents and optionally add notes about their relevance',
                formatKey: 'formatAnnotatedReferences'
            }
        ]
    },

    // Metadata Section
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

/**
 * Form titles configuration
 */
export const requirementFormTitles = {
    create: 'Create Operational Requirement',
    edit: 'Edit Operational Requirement',
    read: 'Operational Requirement Details',
    default: 'Operational Requirement'
};

/**
 * Required identifier array fields that must always be present (even if empty)
 */
export const requiredIdentifierArrayFields = [
    'refinesParents',
    'implementedONs',
    'dependsOnRequirements'
];

/**
 * Required annotated reference array fields that must always be present (even if empty)
 */
export const requiredAnnotatedReferenceArrayFields = [
    'impactsStakeholderCategories',
    'impactsData',
    'impactsServices',
    'documentReferences'
];

/**
 * Required text fields that must always be present (even if empty)
 */
export const requiredTextFields = [
    'title',
    'type',
    'statement',
    'rationale',
    'privateNotes'
];

/**
 * Default values for new requirements
 */
export const requirementDefaults = {
    type: 'ON'
};