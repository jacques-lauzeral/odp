import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { HistoryTab } from '../../components/odp/history-tab.js';
import { apiClient } from '../../shared/api-client.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay,
    getOperationalRequirementTypeDisplay,
    MaturityLevel,
    getMaturityLevelDisplay
} from '/shared/src/index.js';
import {
    requirementFieldDefinitions,
    requirementFormTitles,
    requiredIdentifierArrayFields,
    requiredAnnotatedReferenceArrayFields,
    requiredTextFields,
    requirementDefaults
} from './requirement-form-fields.js';

/**
 * RequirementForm - Operational Requirement form configuration and handling
 * Extends CollectionEntityForm using inheritance pattern
 * Field definitions extracted to requirement-form-fields.js for better separation
 */
export default class RequirementForm extends CollectionEntityForm {
    constructor(entityConfig, context) {
        super(entityConfig, context);

        this.setupData = context?.setupData || context;

        // Cache for parent requirements, ON requirements, and dependency requirements
        this.parentRequirementsCache = null;
        this.parentRequirementsCacheTime = 0;
        this.onRequirementsCache = null;
        this.onRequirementsCacheTime = 0;
        this.dependencyRequirementsCache = null;
        this.dependencyRequirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache

        // HistoryTab – lazy-loads version history when the History tab is activated
        this.historyTab = new HistoryTab(apiClient);
    }

    // ====================
    // OVERRIDE VIRTUAL METHODS
    // ====================

    getFieldDefinitions() {
        return requirementFieldDefinitions.map(section => ({
            ...section,
            fields: section.fields.map(field => this.hydrateField(field))
        }));
    }

    hydrateField(field) {
        const hydrated = { ...field };

        if (field.optionsKey && this[field.optionsKey]) {
            hydrated.options = this[field.optionsKey].bind(this);
        }

        if (field.formatKey && this[field.formatKey]) {
            if (field.formatArgs) {
                hydrated.format = (value) => this[field.formatKey](value, ...field.formatArgs);
            } else {
                hydrated.format = (value) => this[field.formatKey](value);
            }
        }

        return hydrated;
    }

    getFormTitle(mode) {
        return requirementFormTitles[mode] || requirementFormTitles.default;
    }

    loadHistory(item, readOnly = false, allowViewVersion = false) {
        this.historyTab = new HistoryTab(apiClient, {
            readOnly,
            onRestore: readOnly ? undefined : async (versionId, versionNumber) => {
                try {
                    const versionData = await apiClient.get(
                        `/operational-requirements/${item.itemId}/versions/${versionNumber}`
                    );
                    this.restoreVersionToForm(versionData);
                } catch (err) {
                    console.error('[RequirementForm] Failed to fetch version for restore:', err);
                }
            },
            onViewVersion: !allowViewVersion ? undefined : async (versionId, versionNumber) => {
                try {
                    const versionData = await apiClient.get(
                        `/operational-requirements/${item.itemId}/versions/${versionNumber}`
                    );
                    await this.showReadOnlyModal(versionData);
                } catch (err) {
                    console.error('[RequirementForm] Failed to fetch version for view:', err);
                }
            }
        });

        if (!item?.itemId) return;

        this.historyTab.preload('operational-requirements', item.itemId);

        if (this._historyObserver) {
            this._historyObserver.disconnect();
            this._historyObserver = null;
        }
    }

    loadHistoryWithObserver(item, readOnly = false) {
        this.loadHistory(item, readOnly, true);

        if (!item?.itemId) return;

        this._historyObserver = new MutationObserver(() => {
            const container = document.getElementById('history-tab-container');
            if (!container) return;

            this._historyObserver.disconnect();
            this._historyObserver = null;

            this.historyTab.attach(container, 'operational-requirements', item.itemId);
        });

        this._historyObserver.observe(document.body, { childList: true, subtree: true });
    }

    attachHistory(entityType, itemId) {
        const container = this.currentModal?.querySelector('#history-tab-container');
        this.historyTab.attach(container, entityType, itemId);
    }

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Add version ID for optimistic locking on edit
        if (mode === 'edit' && item) {
            transformed.type = item.type; // type cannot change on edit
            transformed.expectedVersionId = item.versionId || item.expectedVersionId;
        }

        // Ensure all required identifier array fields are present
        requiredIdentifierArrayFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null || !Array.isArray(transformed[key])) {
                transformed[key] = [];
            }
        });

        // Ensure all required annotated reference array fields are present
        requiredAnnotatedReferenceArrayFields.forEach(key => {
            if (transformed[key] && Array.isArray(transformed[key])) {
                transformed[key] = transformed[key].map(value => ({ id: value.id, note: value.note }));
            } else {
                transformed[key] = [];
            }
        });

        // Handle path field - convert from textarea input to array
        if (typeof transformed.path === 'string') {
            transformed.path = transformed.path
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        }

        // Handle tentative field - parse "YYYY" or "YYYY-ZZZZ" into [start, end]
        if (transformed.tentative !== undefined && transformed.tentative !== null) {
            if (typeof transformed.tentative === 'string' && transformed.tentative.trim()) {
                transformed.tentative = this.parseTentative(transformed.tentative.trim());
            } else if (!Array.isArray(transformed.tentative)) {
                transformed.tentative = null;
            }
        }

        // Ensure all required text fields are present
        requiredTextFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = '';
            }
        });

        // Handle DrG field
        if (transformed.drg === '' || transformed.drg === null) {
            transformed.drg = null;
        }

        // Type-specific field clearing
        if (transformed.type === 'ON') {
            // OR-only fields must be cleared for ONs
            transformed.implementedONs = [];
            transformed.dependencies = [];
            transformed.impactedStakeholders = [];
            transformed.impactedDomains = [];
            transformed.nfrs = undefined;
        } else {
            // ON-only fields must be cleared for ORs
            transformed.strategicDocuments = [];
            transformed.tentative = undefined;
        }

        // Remove static-label field from payload
        delete transformed.additionalDocumentation;

        return transformed;
    }

    transformDataForRead(item) {
        if (!item) return {};
        return { ...item };
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Handle path - convert array to comma-separated string for textarea editing
        if (transformed.path && Array.isArray(transformed.path)) {
            transformed.path = transformed.path.join(', ');
        }

        // Handle tentative - convert [start, end] array to display string for text input
        if (transformed.tentative && Array.isArray(transformed.tentative)) {
            transformed.tentative = this.formatTentative(transformed.tentative);
        }

        // Extract IDs from object references for multiselect fields
        const idArrayFields = [
            'refinesParents',
            'implementedONs',
            'dependencies',
            'impactedDomains'
        ];

        idArrayFields.forEach(field => {
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
        // Clear requirement caches on save
        this.parentRequirementsCache = null;
        this.onRequirementsCache = null;
        this.dependencyRequirementsCache = null;

        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            if (!item) throw new Error('No item provided for update');
            const itemId = parseInt(item.itemId || item.id, 10);
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }

    async onValidate(data, mode, item) {
        const errors = [];

        if (data.drg && !Object.keys(DraftingGroup).includes(data.drg)) {
            errors.push({ field: 'drg', message: 'Invalid drafting group selected' });
        }

        if (data.maturity && !Object.keys(MaturityLevel).includes(data.maturity)) {
            errors.push({ field: 'maturity', message: 'Invalid maturity level selected' });
        }

        if (data.type === 'ON' && data.implementedONs && data.implementedONs.length > 0) {
            errors.push({ field: 'implementedONs', message: 'ON-type requirements cannot implement other requirements' });
        }

        if (data.type === 'ON' && data.dependencies && data.dependencies.length > 0) {
            errors.push({ field: 'dependencies', message: 'ON-type requirements cannot have OR dependencies' });
        }

        if (data.tentative && Array.isArray(data.tentative)) {
            const [start, end] = data.tentative;
            if (start > end) {
                errors.push({ field: 'tentative', message: 'Start year must be less than or equal to end year' });
            }
        }

        return { valid: errors.length === 0, errors };
    }

    onCancel() {
        console.log('RequirementForm cancelled');
    }

    // ====================
    // OPTIONS GENERATORS
    // ====================

    getTypeOptions() {
        return [
            { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
            { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
        ];
    }

    getMaturityOptions() {
        const options = [];
        Object.keys(MaturityLevel).forEach(key => {
            options.push({ value: key, label: getMaturityLevelDisplay(key) });
        });
        return options;
    }

    getDraftingGroupOptions() {
        const options = [{ value: '', label: 'Not assigned' }];
        Object.keys(DraftingGroup).forEach(key => {
            options.push({ value: key, label: getDraftingGroupDisplay(key) });
        });
        return options;
    }

    getStakeholderCategoryOptions() {
        return this.getSetupDataOptions('stakeholderCategories');
    }

    getDomainOptions() {
        return this.getSetupDataOptions('domains');
    }

    getReferenceDocumentOptions() {
        if (!this.setupData?.referenceDocuments) return [];
        return this.setupData.referenceDocuments.map(doc => ({
            value: doc.id,
            label: doc.version ? `${doc.name} (${doc.version})` : doc.name
        }));
    }

    getSetupDataOptions(entityName) {
        if (!this.setupData?.[entityName]) return [];
        return this.setupData[entityName].map(entity => ({
            value: parseInt(entity.id, 10),
            label: entity.name || entity.title || entity.id
        }));
    }

    async getParentRequirementOptions() {
        try {
            const now = Date.now();
            if (this.parentRequirementsCache && (now - this.parentRequirementsCacheTime) < this.cacheTimeout) {
                return this.parentRequirementsCache;
            }

            const requirements = await apiClient.get(this.entityConfig.endpoint);
            const options = requirements
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),
                    label: `${req.code}: ${req.title}`,
                    group: req.type
                }))
                .sort((a, b) => {
                    if (a.group !== b.group) return a.group === 'ON' ? -1 : 1;
                    return a.label.localeCompare(b.label);
                });

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
            const now = Date.now();
            if (this.onRequirementsCache && (now - this.onRequirementsCacheTime) < this.cacheTimeout) {
                return this.onRequirementsCache;
            }

            const requirements = await apiClient.get(this.entityConfig.endpoint);
            const options = requirements
                .filter(req => req.type === 'ON')
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),
                    label: `${req.code}: ${req.title}`
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            this.onRequirementsCache = options;
            this.onRequirementsCacheTime = now;
            return options;
        } catch (error) {
            console.error('Failed to load ON requirements:', error);
            return [];
        }
    }

    async getDependencyRequirementOptions() {
        try {
            const now = Date.now();
            if (this.dependencyRequirementsCache && (now - this.dependencyRequirementsCacheTime) < this.cacheTimeout) {
                return this.dependencyRequirementsCache;
            }

            const requirements = await apiClient.get(this.entityConfig.endpoint);
            const options = requirements
                .filter(req => req.type === 'OR')
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),
                    label: `${req.code}: ${req.title}`
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            this.dependencyRequirementsCache = options;
            this.dependencyRequirementsCacheTime = now;
            return options;
        } catch (error) {
            console.error('Failed to load dependency requirements:', error);
            return [];
        }
    }

    // ====================
    // FORMAT HELPERS
    // ====================

    formatDraftingGroup(value) {
        return value ? getDraftingGroupDisplay(value) : 'Not assigned';
    }

    formatEntityReferences(values, expectedType = null) {
        if (!values || !Array.isArray(values) || values.length === 0) return 'None';

        return values.map(ref => {
            if (typeof ref === 'object' && ref !== null) {
                const code = ref.code ? `[${ref.code}] ` : '[...]';
                const title = ref.title || ref.name || ref.id;
                return `${code} ${title}`;
            }
            return ref;
        }).join(', ');
    }

    formatAnnotatedReferences(values) {
        if (!values || !Array.isArray(values) || values.length === 0) return 'None';

        return values.map(ref => {
            const title = ref.title || ref.name || ref.id || 'Unknown';
            const note = ref.note ? ` (${ref.note})` : '';
            return `${title}${note}`;
        }).join(', ');
    }

    /**
     * Format [start, end] tentative array for display.
     * [2026, 2026] → "2026", [2026, 2028] → "2026-2028"
     */
    formatTentative(value) {
        if (!value || !Array.isArray(value) || value.length < 2) return '';
        const [start, end] = value;
        return start === end ? String(start) : `${start}-${end}`;
    }

    /**
     * Parse tentative text input into [start, end] array.
     * "2026" → [2026, 2026], "2026-2028" → [2026, 2028]
     */
    parseTentative(text) {
        if (!text) return null;
        const rangeMatch = text.match(/^(\d{4})-(\d{4})$/);
        if (rangeMatch) {
            return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
        }
        const yearMatch = text.match(/^(\d{4})$/);
        if (yearMatch) {
            const year = parseInt(yearMatch[1], 10);
            return [year, year];
        }
        return null;
    }

    // ====================
    // CONDITIONAL FIELD VISIBILITY
    // ====================

    updateFieldVisibility(formData) {
        const type = formData.type;

        // Fields that are OR-only
        const orOnlyFields = ['implementedONs', 'dependencies', 'impactedStakeholders', 'impactedDomains', 'nfrs'];
        orOnlyFields.forEach(fieldKey => {
            const el = this.currentModal?.querySelector(`[data-field="${fieldKey}"]`);
            if (el) el.style.display = type === 'OR' ? 'block' : 'none';
        });

        // Fields that are ON-only
        const onOnlyFields = ['strategicDocuments', 'tentative'];
        onOnlyFields.forEach(fieldKey => {
            const el = this.currentModal?.querySelector(`[data-field="${fieldKey}"]`);
            if (el) el.style.display = type === 'ON' ? 'block' : 'none';
        });

        // Section-level visibility for "Operational Need" section
        const onSection = this.currentModal?.querySelector('[data-section="Operational Need"]');
        if (onSection) onSection.style.display = type === 'ON' ? 'block' : 'none';

        // Clear OR-only fields when switching to ON
        if (type === 'ON') {
            orOnlyFields.forEach(fieldKey => {
                const select = this.currentModal?.querySelector(`[data-field="${fieldKey}"] select`);
                if (select) Array.from(select.options).forEach(opt => opt.selected = false);
            });
        }

        // Clear ON-only fields when switching to OR
        if (type === 'OR') {
            onOnlyFields.forEach(fieldKey => {
                const input = this.currentModal?.querySelector(`[data-field="${fieldKey}"] input, [data-field="${fieldKey}"] select`);
                if (input) input.value = '';
            });
        }
    }

    // ====================
    // EVENT BINDING
    // ====================

    bindTypeChangeEvents() {
        const typeInputs = this.currentModal?.querySelectorAll('input[name="type"]');
        if (typeInputs) {
            typeInputs.forEach(input => {
                input.addEventListener('change', () => {
                    const form = this.currentModal.querySelector('form');
                    const formData = this.collectFormData(form);
                    this.updateFieldVisibility(formData);
                });
            });
        }
    }

    // ====================
    // ENHANCED MODAL METHODS
    // ====================

    async showCreateModal() {
        this.context.onModalReady = () => {
            this.bindTypeChangeEvents();
            this.updateFieldVisibility({ type: requirementDefaults.type });
        };
        await super.showCreateModal();
    }

    async showEditModal(item) {
        this.loadHistory(item, false);
        this.context.onModalReady = () => {
            this.bindTypeChangeEvents();
            this.updateFieldVisibility({ type: item?.type || requirementDefaults.type });
        };
        await super.showEditModal(item);
        this.attachHistory('operational-requirements', item.itemId);
    }

    // ====================
    // PUBLIC API
    // ====================

    async showReadOnlyModal(item) {
        this.loadHistory(item, true);
        await super.showReadOnlyModal(item);
        this.attachHistory('operational-requirements', item.itemId);
    }

    async generateReadOnlyView(item, preserveTabIndex = false) {
        this.loadHistoryWithObserver(item, true);
        return await super.generateReadOnlyView(item, preserveTabIndex);
    }
}