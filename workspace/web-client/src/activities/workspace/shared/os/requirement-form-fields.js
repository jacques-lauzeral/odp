/**
 * requirement-form-fields.js
 *
 * Two configs drive all requirement form rendering, validation, and data collection:
 *
 *   requirementEditConfig — full field metadata + edit/create layout.
 *                           Single source of truth for type, label, options,
 *                           validation, placeholder, helpText, visibleWhen, etc.
 *                           Also drives validateForm, collectFormData, and manager init.
 *
 *   requirementReadConfig — layout only (key + visibleWhen + row hints).
 *                           Metadata is looked up from the edit config field map at render time.
 *
 * optionsKey / formatKey / computeKey are string references resolved against the
 * form instance by hydrateField() in RequirementForm.
 */

// ─── Read config ─────────────────────────────────────────────────────────────

/**
 * header      — rendered as info strip above tabs; keys suppressed from section bodies.
 * row         — side-by-side pair; collapses to full-width when only one child is visible.
 * visibleWhen — 'ON' | 'OR' evaluated against item.type.
 */
export const requirementReadConfig = {
    sections: [
        {
            title: 'Main',
            fields: [
                { row: [
                    { key: 'refinesParents', hideIfNullOrEmpty: true },
                    ],
                    valueInline: true },
                { key: 'implementedONs', visibleWhen: 'OR', hideIfNullOrEmpty: true },
                { row: [
                    { key: 'tentative', visibleWhen: 'ON' },
                    ],
                    valueInline: true},
                { row: [
                    { key: 'maturity',  },
                    ],
                    valueInline: true},
                { key: 'statement' },
                { key: 'rationale' },
                { key: 'flows' },
                { key: 'nfrs',                 visibleWhen: 'OR' },
                { key: 'dependencies',         visibleWhen: 'OR', hideIfNullOrEmpty: true },
                { key: 'strategicDocuments',   visibleWhen: 'ON' },
                { key: 'impactedStakeholders', visibleWhen: 'OR' },
                { key: 'privateNotes' },
            ],
        },
        {
            title: 'Derived',
            fields: [
                { key: 'refinedBy' },
                { key: 'implementedByORs', visibleWhen: 'ON' },
                { key: 'implementedByOCs', visibleWhen: 'OR' },
            ],
        },
        {
            title: 'Metadata',
            fields: [
                { key: 'itemId'  },
                { key: 'version' },
                { key: '_history' },
            ],
        },
    ],
};

// ─── Edit config ──────────────────────────────────────────────────────────────

/**
 * Full field metadata lives here — type, label, required, options, validation,
 * placeholder, helpText — alongside layout hints (visibleWhen, confirmOnChange,
 * readOnly, row).
 *
 * sections.modes  — restricts section to listed modes ('create' | 'edit');
 *                   absent means both.
 * confirmOnChange — field change intercepted; user must confirm to proceed.
 * readOnly        — display-only in edit mode; hidden in create.
 * computeKey      — method name on the form instance used to derive value from item.
 */
export const requirementEditConfig = {
    sections: [
        {
            title: 'Main',
            fields: [
                {
                    key: 'domain',
                    label: 'Domain',
                    type: 'select',
                    required: true,
                    optionsKey: 'getDomainOptions',
                    helpText: 'Select the domain for this requirement',
                    formatKey: 'formatDomain',
                    confirmOnChange: true,
                },
                {
                    key: 'title',
                    label: 'Title',
                    type: 'text',
                    required: true,
                    placeholder: 'Enter a clear, concise title for this requirement',
                    validate: (value) => {
                        if (!value || value.length < 4) return {
                            valid: false,
                            message: 'Title must be at least 4 characters long'
                        };
                        if (value.length > 200) return {
                            valid: false,
                            message: 'Title must be less than 200 characters'
                        };
                        return {valid: true};
                    },
                },
                {
                    key: 'refinesParents',
                    label: 'Refines (Parent)',
                    type: 'reference',
                    required: false,
                    optionsKey: 'getParentRequirementOptions',
                    placeholder: 'Type to search parent...',
                    helpText: 'Select the parent',
                    formatKey: 'formatEntityReferences',
                },
                {
                    key: 'implementedONs',
                    label: 'Implements (ONs)',
                    type: 'reference-list',
                    required: false,
                    size: 5,
                    visibleWhen: 'OR',
                    optionsKey: 'getONRequirementOptions',
                    helpText: 'Select ONs that this OR implements',
                    formatKey: 'formatEntityReferences',
                    formatArgs: ['ON'],
                },
                {
                    key: 'maturity',
                    label: 'Maturity',
                    type: 'select',
                    required: true,
                    optionsKey: 'getMaturityOptions',
                    helpText: 'Maturity level of this requirement',
                },
                {
                    key: 'tentative',
                    label: 'Tentative Implementation Time',
                    type: 'tentative',
                    required: false,
                    visibleWhen: 'ON',
                    placeholder: 'e.g. 2026 or 2026-2028',
                    helpText: 'Year or year range (YYYY or YYYY-ZZZZ). A single year means start = end.',
                    formatKey: 'formatTentative',
                },
                {
                    key: 'statement',
                    label: 'Statement',
                    type: 'richtext',
                    required: true,
                    rows: 6,
                    placeholder: 'Describe the operational need or requirement in detail...',
                    helpText: 'Provide a complete description of what is needed',
                    validate: (value) => {
                        if (!value || value.length < 8) return { valid: false, message: 'Statement must be at least 8 characters long' };
                        return { valid: true };
                    },
                },
                {
                    key: 'rationale',
                    label: 'Rationale',
                    type: 'richtext',
                    required: true,
                    rows: 4,
                    placeholder: 'Explain the reasoning behind this requirement...',
                    helpText: 'Why is this requirement necessary? What problem does it solve?',
                },
                {
                    key: 'flows',
                    label: 'Flow Descriptions and Flow Examples',
                    type: 'richtext',
                    required: false,
                    rows: 4,
                    placeholder: 'Describe operational flows or flow examples that illustrate the requirement...',
                    helpText: 'Optional flow or flow example descriptions',
                },
                {
                    key: 'nfrs',
                    label: 'NFRs',
                    type: 'richtext',
                    required: false,
                    rows: 3,
                    visibleWhen: 'OR',
                    placeholder: 'Non-functional requirements as seen from business perspective...',
                    helpText: 'Optional operational NFRs relevant to this requirement',
                },
                {
                    key: 'dependencies',
                    label: 'Dependencies',
                    type: 'reference-list',
                    required: false,
                    size: 5,
                    visibleWhen: 'OR',
                    optionsKey: 'getDependencyRequirementOptions',
                    helpText: 'ORs that must be implemented before this OR',
                    formatKey: 'formatEntityReferences',
                },
                {
                    key: 'strategicDocuments',
                    label: 'Strategic Documents',
                    type: 'annotated-reference-list',
                    required: false,
                    visibleWhen: 'ON',
                    maxNoteLength: 200,
                    placeholder: 'Select strategic documents...',
                    noteLabel: 'Note',
                    optionsKey: 'getReferenceDocumentOptions',
                    setupEntity: 'referenceDocuments',
                    helpText: 'Strategic documents for this operational need',
                    formatKey: 'formatAnnotatedReferences',
                },
                {
                    key: 'impactedStakeholders',
                    label: 'Impacted Stakeholders',
                    type: 'annotated-reference-list',
                    required: false,
                    visibleWhen: 'OR',
                    maxNoteLength: 200,
                    placeholder: 'Select stakeholder categories...',
                    noteLabel: 'Note',
                    optionsKey: 'getStakeholderCategoryOptions',
                    setupEntity: 'stakeholderCategories',
                    helpText: 'Select affected stakeholder categories and optionally add notes about the nature of the impact',
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
            title: 'Derived',
            modes: ['edit'],
            fields: [
                {
                    key: 'refinedBy',
                    label: 'Refined By',
                    type: 'reference-list',
                    required: false,
                    readOnly: true,
                    optionsKey: 'getAllRequirementOptions',
                    computeKey: '_computeRefinedByIds',
                    helpText: 'Requirements that refine this one',
                    formatKey: 'formatEntityReferences',
                },
                {
                    key: 'implementedByORs',
                    label: 'Implemented By (ORs)',
                    type: 'reference-list',
                    required: false,
                    readOnly: true,
                    visibleWhen: 'ON',
                    size: 5,
                    optionsKey: 'getImplementedByOptions',
                    computeKey: '_computeImplementedByIds',
                    helpText: 'ORs that implement this ON',
                    formatKey: 'formatEntityReferences',
                    formatArgs: ['OR'],
                },
                {
                    key: 'implementedByOCs',
                    label: 'Implemented By (OCs)',
                    type: 'reference-list',
                    required: false,
                    readOnly: true,
                    visibleWhen: 'OR',
                    size: 5,
                    optionsKey: 'getImplementedByOCOptions',
                    computeKey: '_computeImplementedByOCIds',
                    helpText: 'OCs that implement this OR',
                    formatKey: 'formatEntityReferences',
                    formatArgs: ['OC'],
                },
            ],
        },
        {
            title: 'Metadata',
            modes: ['edit'],
            fields: [
                { key: 'itemId',  label: 'ID',      type: 'text', readOnly: true },
                { key: 'version', label: 'Version', type: 'text', readOnly: true },
                { key: '_history', label: 'Version History', type: 'history', readOnly: true },
            ],
        },
    ],
};

// ─── Ancillary exports (used by RequirementForm save/transform logic) ─────────

export const requirementFormTitles = {
    create: 'Create Operational Requirement',
    edit:   'Edit Operational Requirement',
    read:   'Operational Requirement Details',
    default: 'Operational Requirement',
};

/** Reference-list fields that must always be present as arrays on save */
export const requiredIdentifierArrayFields = [
    'refinesParents',
    'implementedONs',
    'dependencies',
];

/** Annotated-reference-list fields that must always be present as arrays on save */
export const requiredAnnotatedReferenceArrayFields = [
    'impactedStakeholders',
    'strategicDocuments',
];

/** Text fields that must always be present (even if empty string) on save */
export const requiredTextFields = [
    'title',
    'type',
    'statement',
    'rationale',
    'privateNotes',
    'maturity',
];

export const requirementDefaults = {
    type:    'ON',
    maturity: 'DRAFT',
};