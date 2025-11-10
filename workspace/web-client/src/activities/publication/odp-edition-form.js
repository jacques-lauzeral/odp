import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * ODPEditionForm - ODP Edition form configuration and handling
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
                        key: 'startsFromWave',
                        label: 'Starts From Wave',
                        type: 'select',
                        modes: ['create', 'read'],
                        required: true,
                        options: () => this.getWaveOptions(),
                        helpText: 'Select the first wave for which this edition will provide information',
                        format: (value) => this.formatWave(value)
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
                return 'Create ODP Edition';
            case 'read':
                return 'ODP Edition Details';
            default:
                return 'ODP Edition';
        }
    }

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Ensure required fields are present
        if (!transformed.title) transformed.title = '';
        if (!transformed.type) transformed.type = 'DRAFT';

        // Convert string IDs to numbers for API
        if (transformed.baselineId) {
            transformed.baselineId = parseInt(transformed.baselineId, 10);
        }

        // Handle startsFromWave - could be object or ID depending on source
        if (transformed.startsFromWave) {
            if (typeof transformed.startsFromWave === 'object') {
                transformed.startsFromWaveId = parseInt(transformed.startsFromWave.id, 10);
            } else {
                transformed.startsFromWaveId = parseInt(transformed.startsFromWave, 10);
            }
            delete transformed.startsFromWave; // Remove object, keep only ID for API
        }

        return transformed;
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Extract baseline and wave IDs from references for form value binding
        // The select fields need the ID value, but we keep the object for formatting
        if (transformed.baseline && typeof transformed.baseline === 'object') {
            transformed.baselineId = transformed.baseline.id;
        }

        // For startsFromWave, the field key is 'startsFromWave' and value is the object
        // The select will use the object's id property automatically
        // No transformation needed - keep the object as-is for format function

        return transformed;
    }

    async onSave(data, mode, item) {
        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            throw new Error('ODP Editions cannot be updated once created');
        }
    }

    async onValidate(data, mode, item) {
        const errors = [];

        // Validate baseline exists (only if provided)
        if (data.baselineId) {
            const baselineId = parseInt(data.baselineId, 10);
            const baseline = this.supportData?.baselines?.find(b => parseInt(b.id, 10) === baselineId);
            if (!baseline) {
                errors.push({
                    field: 'baselineId',
                    message: 'Selected baseline not found'
                });
            }
        }

        // Validate wave exists - handle both object and ID
        let waveId = null;
        if (data.startsFromWave) {
            if (typeof data.startsFromWave === 'object') {
                waveId = parseInt(data.startsFromWave.id, 10);
            } else {
                waveId = parseInt(data.startsFromWave, 10);
            }
        }

        if (waveId) {
            const wave = this.supportData?.waves?.find(w => parseInt(w.id, 10) === waveId);
            if (!wave) {
                errors.push({
                    field: 'startsFromWave',
                    message: 'Selected wave not found'
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
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

    getWaveOptions() {
        if (!this.supportData?.waves) {
            return [{ value: '', label: 'No waves available' }];
        }

        return this.supportData.waves
            .map(wave => ({
                value: parseInt(wave.id, 10),
                label: wave.name,
                sortKey: (wave.year * 10) + (wave.quarter || 0)
            }))
            .sort((a, b) => a.sortKey - b.sortKey);
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

    formatWave(value) {
        if (!value) return 'No wave';

        if (typeof value === 'object' && value !== null) {
            return value.name;
        }

        // Look up in support data
        if (this.supportData?.waves) {
            const wave = this.supportData.waves.find(w => w.id === value);
            if (wave) {
                return wave.name;
            }
        }

        return `Wave ${value}`;
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