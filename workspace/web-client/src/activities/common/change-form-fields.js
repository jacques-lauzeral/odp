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
 * - optionsKey: References a method name on the form instance (e.g., 'getDraftingGroupOptions')
 * - formatKey: References a method name on the form instance (e.g., 'formatEntityReferences')
 */
export const changeFieldDefinitions = [
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
                key: 'visibility',
                label: 'Visibility',
                type: 'radio',
                modes: ['create', 'read', 'edit'],
                required: true,
                // Options will be populated by form using getVisibilityDisplay
                optionsKey: 'getVisibilityOptions',
                defaultValue: 'NETWORK',
                helpTextAbove: 'Control who can see this change'
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

    // Change Details Section
    {
        title: 'Change Details',
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
            },
            {
                key: 'path',
                label: 'Path',
                type: 'textarea',
                modes: ['create', 'read', 'edit'],
                required: false,
                rows: 2,
                placeholder: 'Enter path elements separated by commas (e.g., "Deployment, Phase 1, Infrastructure")',
                helpText: 'Organizational path for this change (comma-separated)',
                format: (value) => {
                    if (!value || !Array.isArray(value) || value.length === 0) return 'No path';
                    return value.join(' > ');
                }
            }
        ]
    },

    // Milestones Section
    {
        title: 'Milestones',
        fields: [
            {
                key: 'milestones',
                label: 'Milestones',
                type: 'custom',
                modes: ['create', 'read', 'edit'],
                required: false,
                // Render function will be bound by form using milestoneManager
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

    // Relationships Section
    {
        title: 'Relationships',
        fields: [
            {
                key: 'satisfiesRequirements',
                label: 'Satisfies Requirements',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                optionsKey: 'getRequirementOptions',
                helpText: 'Select requirements that this change satisfies (use empty array if none)',
                formatKey: 'formatEntityReferences',
                formatArgs: ['requirement']
            },
            {
                key: 'supersedsRequirements',
                label: 'Supersedes Requirements',
                type: 'multiselect',
                modes: ['create', 'read', 'edit'],
                required: false,
                size: 5,
                optionsKey: 'getRequirementOptions',
                helpText: 'Select requirements that this change supersedes (use empty array if none)',
                formatKey: 'formatEntityReferences',
                formatArgs: ['requirement']
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

    // History Section
    // Rendered by HistoryTab component – lazy-loaded on tab activation.
    // The form must call historyTab.attach(container, entityType, itemId)
    // in its onTabChange handler when this tab becomes active.
    {
        title: 'History',
        fields: [
            {
                key: '_history',
                label: 'Version History',
                type: 'history',
                // Visible in read and edit modes (not relevant for create)
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
    'satisfiesRequirements',
    'supersedsRequirements'
];

/**
 * Required annotated reference array fields that must always be present (even if empty)
 */
export const requiredAnnotatedReferenceArrayFields = [
    'documentReferences'
];

/**
 * Required text fields that must always be present (even if empty)
 */
export const requiredTextFields = [
    'title',
    'purpose',
    'visibility'
];

/**
 * Optional text fields
 */
export const optionalTextFields = [
    'initialState',
    'finalState',
    'details'
];

/**
 * Default values for new changes
 */
export const changeDefaults = {
    visibility: 'NETWORK'
};