import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * ODPEditionForm - ODIP Edition form configuration and handling
 * Extends CollectionEntityForm using inheritance pattern
 * Matches the API schema for ODPEditionRequest
 */
export default class ODPEditionForm extends CollectionEntityForm {
    constructor(entityConfig, supportData) {
        super(entityConfig, { supportData });
        this.supportData = supportData;
    }

    // ====================
    // OVERRIDE VIRTUAL METHODS
    // ====================

    getFieldDefinitions() {
        return [
            // Basic Information Section
            {
                title: 'Edition Information',
                fields: [
                    {
                        key: 'id',
                        label: 'ID',
                        type: 'text',
                        modes: ['read'],
                        readOnly: true
                    },
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        modes: ['create', 'read'],
                        required: true,
                        placeholder: 'Enter a descriptive title for this edition',
                        validate: (value) => {
                            if (!value || value.length < 3) {
                                return { valid: false, message: 'Title must be at least 3 characters long' };
                            }
                            if (value.length > 100) {
                                return { valid: false, message: 'Title must be less than 100 characters' };
                            }
                            return { valid: true };
                        }
                    },
                    {
                        key: 'type',
                        label: 'Type',
                        type: 'radio',
                        modes: ['create', 'read'],
                        required: true,
                        options: [
                            { value: 'DRAFT', label: 'DRAFT - Work in progress' },
                            { value: 'OFFICIAL', label: 'OFFICIAL - Published version' }
                        ],
                        helpTextAbove: 'Select the edition type based on maturity and intended use'
                    }
                ]
            },

            // Configuration Section
            {
                title: 'Edition Configuration',
                fields: [
                    {
                        key: 'baselineId',
                        label: 'Baseline',
                        type: 'select',
                        modes: ['create', 'read'],
                        required: false,
                        options: () => this.getBaselineOptions(),
                        helpText: 'Optional: Select an existing baseline or leave empty to create a new one automatically',
                        format: (value) => this.formatBaseline(value)
                    },
                    {
                        key: 'startDate',
                        label: 'Start Date',
                        type: 'date',
                        modes: ['create', 'read'],
                        required: false,
                        helpText: 'Optional: lower bound date for OC milestone filtering and ON tentative period filtering (yyyy-mm-dd)',
                        validate: (value) => {
                            if (!value) return { valid: true };
                            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                                return { valid: false, message: 'Date must be in yyyy-mm-dd format' };
                            }
                            return { valid: true };
                        }
                    },
                    {
                        key: 'minONMaturity',
                        label: 'Min ON Maturity',
                        type: 'radio',
                        modes: ['create', 'read'],
                        required: false,
                        defaultValue: 'DRAFT',
                        options: [
                            { value: 'DRAFT', label: 'DRAFT' },
                            { value: 'ADVANCED', label: 'ADVANCED' },
                            { value: 'MATURE', label: 'MATURE' }
                        ],
                        helpText: 'Minimum ON maturity level for edition content selection'
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
                        modes: ['read'],
                        readOnly: true
                    },
                    {
                        key: 'createdAt',
                        label: 'Created',
                        type: 'date',
                        modes: ['read'],
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
                return 'Create ODIP Edition';
            case 'read':
                return 'ODIP Edition Details';
            default:
                return 'ODIP Edition';
        }
    }

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        if (!transformed.title) transformed.title = '';
        if (!transformed.type) transformed.type = 'DRAFT';

        if (transformed.baselineId) {
            transformed.baselineId = parseInt(transformed.baselineId, 10);
        }

        if (!transformed.minONMaturity) {
            transformed.minONMaturity = 'DRAFT';
        }

        return transformed;
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Extract baseline ID from reference for form value binding
        if (transformed.baseline && typeof transformed.baseline === 'object') {
            transformed.baselineId = transformed.baseline.id;
        }

        // Default minONMaturity to DRAFT if not set
        if (!transformed.minONMaturity) {
            transformed.minONMaturity = 'DRAFT';
        }

        return transformed;
    }

    async onSave(data, mode, item) {
        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            throw new Error('ODIP Editions cannot be updated once created');
        }
    }

    async onValidate(data, mode, item) {
        const errors = [];

        if (data.baselineId) {
            const baselineId = parseInt(data.baselineId, 10);
            const baseline = this.supportData?.baselines?.find(b => parseInt(b.id, 10) === baselineId);
            if (!baseline) {
                errors.push({ field: 'baselineId', message: 'Selected baseline not found' });
            }
        }

        return { valid: errors.length === 0, errors };
    }

    onCancel() {
        console.log('Edition form cancelled');
    }

    // ====================
    // DATA OPTIONS HELPERS
    // ====================

    getBaselineOptions() {
        const baseOptions = [{ value: '', label: 'Create new baseline automatically' }];

        if (!this.supportData?.baselines) {
            return baseOptions;
        }

        const baselineOptions = this.supportData.baselines.map(baseline => ({
            value: parseInt(baseline.id, 10),
            label: `${baseline.title || `Baseline ${baseline.id}`} (${new Date(baseline.createdAt).toLocaleDateString()})`
        }));

        return baseOptions.concat(baselineOptions);
    }

    // ====================
    // FORMAT HELPERS
    // ====================

    formatBaseline(value) {
        if (!value) return 'No baseline';

        if (typeof value === 'object' && value !== null) {
            const title = value.title || `Baseline ${value.id}`;
            const date = value.createdAt ? new Date(value.createdAt).toLocaleDateString() : '';
            return date ? `${title} (${date})` : title;
        }

        // Look up in support data
        if (this.supportData?.baselines) {
            const baseline = this.supportData.baselines.find(b => b.id === value);
            if (baseline) {
                return this.formatBaseline(baseline);
            }
        }

        return `Baseline ${value}`;
    }

    // ====================
    // PUBLIC API
    // ====================

    async showCreateModal() {
        await super.showCreateModal();
    }

    async generateReadOnlyView(item) {
        return await super.generateReadOnlyView(item);
    }
}