/**
 * change-form-fields.js
 * Pure configuration for ChangeForm field definitions
 * Separated from business logic for better maintainability
 */

/**
 * Field definitions configuration for Operational Change forms
 * This is pure declarative configuration - no logic, no state
 *
 * Special field properties:
 * - optionsKey: References a method name on the form instance
 * - formatKey: References a method name on the form instance
 */
export const changeFieldDefinitions = [
    // Header Section
    {
        title: 'Header',
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
                key: 'title',
                label: 'Title',
                type: 'text',
                modes: ['create', 'read', 'edit'],
                required: true,
                placeholder: 'Enter a clear, concise title for this change',
                validate: (value) => {
                    if (!value || value.length < 3) {
                        return { valid: false, message: 'Title must be at least 3 characters long' };
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
                helpText: 'Select the drafting group responsible for this change',
                formatKey: 'formatDraftingGroup'
            }
        ]
    },

    // Details Section
    {
        title: 'Details',
        fields: [
            {
                key: 'purpose',
                label: 'Purpose',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: true,
                rows: 6,
                placeholder: 'Describe the purpose of this operational change...',
                helpText: 'Explain what this change aims to achieve and why it is needed',
                validate: (value) => {
                    if (!value || value.length < 3) {
                        return { valid: false, message: 'Purpose must be at least 3 characters long' };
                    }
                    return { valid: true };
                }
            },
            {
                key: 'initialState',
                label: 'Initial State',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 5,
                placeholder: 'Describe the current state before implementing this change...',
                helpText: 'Detail the existing situation, processes, or systems that will be changed'
            },
            {
                key: 'finalState',
                label: 'Final State',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 5,
                placeholder: 'Describe the expected state after implementing this change...',
                helpText: 'Detail the target situation, processes, or systems after the change is complete'
            },
            {
                key: 'details',
                label: 'Implementation Details',
                type: 'richtext',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 6,
                placeholder: 'Provide detailed information about how this change will be implemented...',
                helpText: 'Include technical details, dependencies, constraints, and implementation approach'
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
                key: 'implementedORs',
                label: 'Implements Requirements',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                optionsKey: 'getRequirementOptions',
                helpText: 'Select OR requirements that this change implements',
                formatKey: 'formatEntityReferences',
                formatArgs: ['requirement']
            },
            {
                key: 'decommissionedORs',
                label: 'Decommissions Requirements',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                optionsKey: 'getRequirementOptions',
                helpText: 'Select OR requirements that this change decommissions',
                formatKey: 'formatEntityReferences',
                formatArgs: ['requirement']
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
                helpText: 'Maturity level of this change'
            },
            {
                key: 'cost',
                label: 'Cost',
                type: 'number',
                modes: ['create', 'read', 'edit'],
                required: false,
                placeholder: 'Integer value in MW',
                helpText: 'Indicative implementation cost in MW'
            },
            {
                key: 'dependencies',
                label: 'Dependencies',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                optionsKey: 'getDependencyChangeOptions',
                helpText: 'OCs that must be implemented before this OC',
                formatKey: 'formatEntityReferences'
            },
            {
                key: 'milestones',
                label: 'Milestones',
                type: 'custom',
                modes: ['create', 'read', 'edit'],
                required: false,
                renderKey: 'renderMilestonesField',
                format: (value) => {
                    if (!value || !Array.isArray(value) || value.length === 0) {
                        return 'No milestones defined';
                    }
                    return '';
                },
                helpText: 'Manage milestones using the 5 standard milestone event types'
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
export const changeFormTitles = {
    create: 'Create Operational Change',
    edit: 'Edit Operational Change',
    read: 'Operational Change Details',
    default: 'Operational Change'
};

/**
 * Required identifier array fields that must always be present (even if empty)
 */
export const requiredIdentifierArrayFields = [
    'implementedORs',
    'decommissionedORs'
];

/**
 * Required text fields that must always be present (even if empty)
 */
export const requiredTextFields = [
    'title',
    'purpose',
    'maturity'
];

/**
 * Optional text fields
 */
export const optionalTextFields = [
    'initialState',
    'finalState',
    'details',
    'cost'
];

/**
 * Default values for new changes
 */
export const changeDefaults = {
    maturity: 'DRAFT'
};