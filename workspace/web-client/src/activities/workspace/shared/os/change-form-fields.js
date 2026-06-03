/**
 * change-form-fields.js
 *
 * Two configs drive all change form rendering, validation, and data collection:
 *
 *   changeEditConfig — full field metadata + edit/create layout.
 *   changeReadConfig — layout only (key + row hints); metadata looked up from edit config field map.
 *
 * optionsKey / formatKey / renderKey are string references resolved against
 * the form instance by hydrateField() in ChangeForm.
 */

// ─── Read config ─────────────────────────────────────────────────────────────

export const changeReadConfig = {
    header: [
        { key: 'code'  },
        { key: 'title' },
    ],
    sections: [
        {
            title: 'Main',
            fields: [
                { key: 'implementedORs', hideIfNullOrEmpty: true },
                { key: 'decommissionedORs', hideIfNullOrEmpty: true },
                { row: [
                        { key: 'maturity' },
                        { key: 'cost'     },
                    ]},
                { key: 'purpose' },
                { key: 'initialState' },
                { key: 'finalState' },
                { key: 'details' },
                { key: 'dependencies', hideIfNullOrEmpty: true },
                { key: 'privateNotes' },
            ],
        },
        {
            title: 'Planning',
            fields: [
                { key: 'milestones' },
            ],
        },
        {
            title: 'Metadata',
            fields: [
                { row: [
                        { key: 'itemId'  },
                        { key: 'version' },
                    ]},
                { key: '_history' },
            ],
        },
    ],
};

// ─── Edit config ──────────────────────────────────────────────────────────────

export const changeEditConfig = {
    sections: [
        {
            title: 'Main',
            fields: [
                {
                    key: 'title',
                    label: 'Title',
                    type: 'text',
                    required: true,
                    placeholder: 'Enter a clear, concise title for this change',
                    validate: (value) => {
                        if (!value || value.length < 3)  return { valid: false, message: 'Title must be at least 3 characters long' };
                        if (value.length > 200)          return { valid: false, message: 'Title must be less than 200 characters' };
                        return { valid: true };
                    },
                },
                {
                    key: 'domain',
                    label: 'Domain',
                    type: 'select',
                    required: true,
                    optionsKey: 'getDomainOptions',
                    helpText: 'Select the domain for this change',
                    formatKey: 'formatDomain',
                    confirmOnChange: true,
                },
                {
                    key: 'implementedORs',
                    label: 'Implements Requirements',
                    type: 'reference-list',
                    required: false,
                    size: 5,
                    optionsKey: 'getRequirementOptions',
                    helpText: 'Select OR requirements that this change implements',
                    formatKey: 'formatEntityReferences',
                    formatArgs: ['requirement'],
                },
                {
                    key: 'decommissionedORs',
                    label: 'Decommissions Requirements',
                    type: 'reference-list',
                    required: false,
                    size: 5,
                    optionsKey: 'getRequirementOptions',
                    helpText: 'Select OR requirements that this change decommissions',
                    formatKey: 'formatEntityReferences',
                    formatArgs: ['requirement'],
                },
                { row: [
                        {
                            key: 'maturity',
                            label: 'Maturity',
                            type: 'select',
                            required: true,
                            optionsKey: 'getMaturityOptions',
                            helpText: 'Maturity level of this change',
                        },
                        {
                            key: 'cost',
                            label: 'Cost',
                            type: 'number',
                            required: false,
                            placeholder: 'Integer value in MW',
                            helpText: 'Indicative implementation cost in MW',
                        },
                    ]},
                {
                    key: 'purpose',
                    label: 'Purpose',
                    type: 'richtext',
                    required: true,
                    rows: 6,
                    placeholder: 'Describe the purpose of this operational change...',
                    helpText: 'Explain what this change aims to achieve and why it is needed',
                    validate: (value) => {
                        if (!value || value.length < 3) return { valid: false, message: 'Purpose must be at least 3 characters long' };
                        return { valid: true };
                    },
                },
                {
                    key: 'initialState',
                    label: 'Initial State',
                    type: 'richtext',
                    required: false,
                    rows: 5,
                    placeholder: 'Describe the current state before implementing this change...',
                    helpText: 'Detail the existing situation, processes, or systems that will be changed',
                },
                {
                    key: 'finalState',
                    label: 'Final State',
                    type: 'richtext',
                    required: false,
                    rows: 5,
                    placeholder: 'Describe the expected state after implementing this change...',
                    helpText: 'Detail the target situation, processes, or systems after the change is complete',
                },
                {
                    key: 'details',
                    label: 'Implementation Details',
                    type: 'richtext',
                    required: false,
                    rows: 6,
                    placeholder: 'Provide detailed information about how this change will be implemented...',
                    helpText: 'Include technical details, dependencies, constraints, and implementation approach',
                },
                {
                    key: 'dependencies',
                    label: 'Dependencies',
                    type: 'reference-list',
                    required: false,
                    size: 5,
                    optionsKey: 'getDependencyChangeOptions',
                    helpText: 'OCs that must be implemented before this OC',
                    formatKey: 'formatEntityReferences',
                    formatArgs: ['change'],
                },
                {
                    key: 'privateNotes',
                    label: 'Private Notes',
                    type: 'richtext',
                    required: false,
                    rows: 3,
                    placeholder: 'Internal notes (not for publication)...',
                    helpText: 'Private notes for internal use only',
                },
            ],
        },
        {
            title: 'Planning',
            fields: [
                {
                    key: 'milestones',
                    label: 'Milestones',
                    type: 'custom',
                    required: false,
                    renderKey: 'renderMilestonesField',
                    helpText: 'Manage milestones using the 5 standard milestone event types',
                },
            ],
        },
        {
            title: 'Metadata',
            modes: ['edit'],
            fields: [
                { row: [
                        { key: 'itemId',  label: 'ID',      type: 'text', readOnly: true },
                        { key: 'version', label: 'Version', type: 'text', readOnly: true },
                    ]},
                { key: '_history', label: 'Version History', type: 'history', readOnly: true },
            ],
        },
    ],
};

// ─── Ancillary exports (used by ChangeForm save/transform logic) ──────────────

export const changeFormTitles = {
    create:  'Create Operational Change',
    edit:    'Edit Operational Change',
    read:    'Operational Change Details',
    default: 'Operational Change',
};

/** Reference-list fields that must always be present as arrays on save */
export const requiredIdentifierArrayFields = [
    'implementedORs',
    'decommissionedORs',
];

/** Text fields that must always be present (even if empty string) on save */
export const requiredTextFields = [
    'title',
    'purpose',
    'maturity',
];

/** Optional text fields that must be present (even if empty string) on save */
export const optionalTextFields = [
    'initialState',
    'finalState',
    'details',
];

export const changeDefaults = {
    maturity: 'DRAFT',
};