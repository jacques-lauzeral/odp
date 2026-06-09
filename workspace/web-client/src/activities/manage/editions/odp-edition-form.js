import { CollectionEntityForm } from '../../../components/collection-entity-form.js';
import { apiClient } from '../../../shared/api-client.js';

/**
 * ODPEditionForm — ODIP Edition create form.
 * Uses the config-based pattern (getEditConfig / getReadConfig).
 * Editions are immutable once created — no edit mode.
 */
export default class ODPEditionForm extends CollectionEntityForm {

    constructor(entityConfig, supportData) {
        super(entityConfig, { supportData });
        this.supportData = supportData;
    }

    // -------------------------------------------------------------------------
    // Config pattern — required overrides
    // -------------------------------------------------------------------------

    hydrateField(field) {
        // No string-ref bindings needed — options are inline arrays or functions
        return field;
    }

    getEditConfig() {
        return {
            sections: [
                {
                    title: 'Edition',
                    fields: [
                        {
                            key: 'title',
                            label: 'Title',
                            type: 'text',
                            required: true,
                            placeholder: 'Enter a descriptive title for this edition',
                            validate: (value) => {
                                if (!value || value.trim().length < 3)
                                    return { valid: false, message: 'Title must be at least 3 characters' };
                                if (value.length > 100)
                                    return { valid: false, message: 'Title must be less than 100 characters' };
                                return { valid: true };
                            }
                        },
                        {
                            key: 'type',
                            label: 'Type',
                            type: 'radio',
                            required: true,
                            options: [
                                { value: 'DRAFT',    label: 'DRAFT — Work in progress' },
                                { value: 'OFFICIAL', label: 'OFFICIAL — Published version' },
                            ],
                        },
                    ],
                },
                {
                    title: 'Content rules',
                    fields: [
                        {
                            key: 'baselineId',
                            label: 'Baseline',
                            type: 'select',
                            required: false,
                            options: () => this._getBaselineOptions(),
                            helpText: 'Leave empty to create a new baseline automatically',
                        },
                        {
                            key: 'startDate',
                            label: 'Start date',
                            type: 'date',
                            required: false,
                            helpText: 'Optional lower bound (yyyy-mm-dd) for OC milestone and ON tentative filtering',
                            validate: (value) => {
                                if (!value) return { valid: true };
                                if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
                                    return { valid: false, message: 'Date must be in yyyy-mm-dd format' };
                                return { valid: true };
                            },
                        },
                        {
                            key: 'minONMaturity',
                            label: 'Min ON maturity',
                            type: 'radio',
                            required: false,
                            options: [
                                { value: 'DRAFT',    label: 'DRAFT' },
                                { value: 'ADVANCED', label: 'ADVANCED' },
                                { value: 'MATURE',   label: 'MATURE' },
                            ],
                            helpText: 'Minimum ON maturity gate for edition content selection',
                        },
                    ],
                },
            ],
        };
    }

    getReadConfig() {
        // Not used — detail view is rendered directly in EditionsActivity
        return null;
    }

    // -------------------------------------------------------------------------
    // Form lifecycle overrides
    // -------------------------------------------------------------------------

    getFormTitle(mode) {
        return 'Create ODIP Edition';
    }

    transformDataForSave(data) {
        const out = { ...data };
        if (!out.type)          out.type = 'DRAFT';
        if (!out.minONMaturity) out.minONMaturity = 'DRAFT';
        if (out.baselineId)     out.baselineId = parseInt(out.baselineId, 10);
        else                    delete out.baselineId;
        if (!out.startDate)     delete out.startDate;
        return out;
    }

    async onSave(data, mode) {
        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        }
        throw new Error('ODIP Editions cannot be updated once created');
    }

    async onValidate(data) {
        const errors = [];
        if (data.baselineId) {
            const id = parseInt(data.baselineId, 10);
            const found = this.supportData?.baselines?.find(b => parseInt(b.id, 10) === id);
            if (!found) errors.push({ field: 'baselineId', message: 'Selected baseline not found' });
        }
        return { valid: errors.length === 0, errors };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    _getBaselineOptions() {
        const base = [{ value: '', label: 'Create new baseline automatically' }];
        if (!this.supportData?.baselines) return base;
        return base.concat(
            this.supportData.baselines.map(b => ({
                value: parseInt(b.id, 10),
                label: `${b.title || `Baseline ${b.id}`} (${new Date(b.createdAt).toLocaleDateString()})`,
            }))
        );
    }
}