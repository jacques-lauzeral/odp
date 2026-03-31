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
        title: 'General',
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
                key: 'code',
                label: 'Code',
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

    // Details Section
    {
        title: 'Details',
        fields: [
            {
                key: 'statement',
                label: 'Statement',
                type: 'richtext',
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
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: true,
                rows: 4,
                placeholder: 'Explain the reasoning behind this requirement...',
                helpText: 'Why is this requirement necessary? What problem does it solve?'
            },
            {
                key: 'flows',
                label: 'Flow Descriptions and Flow Examples',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 4,
                placeholder: 'Describe operational flows or flow examples that illustrate the requirement...',
                helpText: 'Optional flow or flow example descriptions'
            },
            {
                key: 'nfrs',
                label: 'NFRs',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 3,
                visibleWhen: (data) => data.type === 'OR',
                placeholder: 'Non-functional requirements as seen from business perspective...',
                helpText: 'Optional operational NFRs relevant to this requirement'
            },
            {
                key: 'privateNotes',
                label: 'Private Notes',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 3,
                placeholder: 'Internal notes (not for publication)...',
                helpText: 'Private notes for internal use only'
            }
        ]
    },

    // Traceability Section
    {
        title: 'Traceability',
        fields: [
            {
                key: 'strategicDocuments',
                label: 'Strategic Documents',
                type: 'annotated-reference-list',
                modes: ['create', 'read', 'edit'],
                required: false,
                visibleWhen: (data, mode) => data.type === 'ON' || (['read', 'edit'].includes(mode) && data.strategicDocuments?.length > 0),
                maxNoteLength: 200,
                placeholder: 'Select strategic documents...',
                noteLabel: 'Note',
                optionsKey: 'getReferenceDocumentOptions',
                setupEntity: 'referenceDocuments',
                helpText: 'Strategic documents for this operational need',
                formatKey: 'formatAnnotatedReferences'
            },
            {
                key: 'refinesParents',
                label: 'Refines (Parent)',
                type: 'reference',
                modes: ['create', 'read', 'edit'],
                required: false,
                optionsKey: 'getParentRequirementOptions',
                placeholder: 'Type to search parent...',
                helpText: 'Select the parent',
                formatKey: 'formatEntityReferences'
            },
            {
                key: 'refinedBy',
                label: 'Refined By',
                type: 'reference-list',
                modes: ['read'],
                required: false,
                optionsKey: 'getAllRequirementOptions',
                computeKey: '_computeRefinedByIds',
                helpText: 'Requirements that refine this one',
                formatKey: 'formatEntityReferences'
            },
            {
                key: 'implementedONs',
                label: 'Implements (ONs)',
                type: 'reference-list',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                visibleWhen: (data) => data.type === 'OR',
                optionsKey: 'getONRequirementOptions',
                helpText: 'Select ONs that this OR implements',
                formatKey: 'formatEntityReferences',
                formatArgs: ['ON']
            },
            {
                key: 'implementedBy',
                label: 'Implemented By (ORs)',
                type: 'reference-list',
                modes: ['read'],
                required: false,
                size: 5,
                visibleWhen: (data) => data.type === 'ON',
                optionsKey: 'getImplementedByOptions',
                computeKey: '_computeImplementedByIds',
                helpText: 'ORs that implement this ON',
                formatKey: 'formatEntityReferences',
                formatArgs: ['OR']
            }
        ]
    },

    // Impact Section
    {
        title: 'Impact',
        fields: [
            {
                key: 'impactedStakeholders',
                label: 'Stakeholder Categories',
                type: 'annotated-reference-list',
                modes: ['create', 'read', 'edit'],
                required: false,
                visibleWhen: (data) => data.type === 'OR',
                maxNoteLength: 200,
                placeholder: 'Select stakeholder categories...',
                noteLabel: 'Note',
                optionsKey: 'getStakeholderCategoryOptions',
                setupEntity: 'stakeholderCategories',
                helpText: 'Select affected stakeholder categories and optionally add notes about the nature of the impact'
            },
            {
                key: 'impactedDomains',
                label: 'Domains',
                type: 'annotated-reference-list',
                modes: ['create', 'read', 'edit'],
                required: false,
                visibleWhen: (data) => data.type === 'OR',
                maxNoteLength: 200,
                placeholder: 'Select impacted domains...',
                noteLabel: 'Note',
                optionsKey: 'getDomainOptions',
                setupEntity: 'domains',
                helpText: 'Select business domains impacted by this operational requirement',
                formatKey: 'formatAnnotatedReferences'
            }
        ]
    },

    // Planning Section
    {
        title: 'Planning',
        fields: [
            {
                key: 'maturity',
                label: 'Maturity',
                type: 'select',
                modes: ['create', 'read', 'edit'],
                required: true,
                optionsKey: 'getMaturityOptions',
                helpText: 'Maturity level of this requirement'
            },
            {
                key: 'tentative',
                label: 'Tentative Implementation Time',
                type: 'tentative',
                modes: ['create', 'read', 'edit'],
                required: false,
                visibleWhen: (data) => data.type === 'ON',
                placeholder: 'e.g. 2026 or 2026-2028',
                helpText: 'Year or year range (YYYY or YYYY-ZZZZ). A single year means start = end.',
                formatKey: 'formatTentative'
            },
            {
                key: 'dependencies',
                label: 'Dependencies',
                type: 'reference-list',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                visibleWhen: (data) => data.type === 'OR',
                optionsKey: 'getDependencyRequirementOptions',
                helpText: 'ORs that must be implemented before this OR',
                formatKey: 'formatEntityReferences'
            }
        ]
    },

    // Documentation Section
    {
        title: 'Documentation',
        fields: [
            {
                key: 'additionalDocumentation',
                label: 'Additional Documentation',
                type: 'static-label',
                modes: ['create', 'read', 'edit'],
                staticText: 'Not available yet'
            }
        ]
    },

    // History Section
    {
        title: 'History',
        fields: [
            {
                key: '_history',
                label: 'Version History',
                type: 'history',
                modes: ['read', 'edit'],
                readOnly: true
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
    'dependencies'
];

/**
 * Required annotated reference array fields that must always be present (even if empty)
 */
export const requiredAnnotatedReferenceArrayFields = [
    'impactedStakeholders',
    'impactedDomains',
    'strategicDocuments'
];

/**
 * Required text fields that must always be present (even if empty)
 */
export const requiredTextFields = [
    'title',
    'type',
    'statement',
    'rationale',
    'privateNotes',
    'maturity'
];

/**
 * Default values for new requirements
 */
export const requirementDefaults = {
    type: 'ON',
    maturity: 'DRAFT'
};