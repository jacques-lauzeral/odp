import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { HistoryTab } from '../../components/odp/history-tab.js';
import { apiClient } from '../../shared/api-client.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay,
    getOperationalRequirementTypeDisplay
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

        // Extract setupData from context (which contains setupData, currentTabIndex, onTabChange)
        this.setupData = context?.setupData || context;



        // Cache for parent requirements, ON requirements, and all requirements
        this.parentRequirementsCache = null;
        this.parentRequirementsCacheTime = 0;
        this.onRequirementsCache = null;
        this.onRequirementsCacheTime = 0;
        this.dependencyRequirementsCache = null;
        this.dependencyRequirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache

        // HistoryTab – lazy-loads version history when the History tab is activated
        // readOnly is set dynamically via loadHistory() based on the calling context
        this.historyTab = new HistoryTab(apiClient);
    }

    // ====================
    // OVERRIDE VIRTUAL METHODS
    // ====================

    getFieldDefinitions() {
        // Hydrate configuration with runtime logic
        return requirementFieldDefinitions.map(section => ({
            ...section,
            fields: section.fields.map(field => this.hydrateField(field))
        }));
    }

    /**
     * Hydrate a field configuration with runtime functions
     * Converts optionsKey/formatKey references to actual functions
     */
    /**
     * Hydrate a field configuration with runtime functions
     * Converts optionsKey/formatKey references to actual functions
     */
    hydrateField(field) {
        const hydrated = { ...field };

        // Bind options function if specified by key
        if (field.optionsKey && this[field.optionsKey]) {
            // Bind the method directly - no wrapping needed
            hydrated.options = this[field.optionsKey].bind(this);
        }

        // Bind format function if specified by key
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

    /**
     * Load version history as soon as the form is populated with an item.
     * Uses a MutationObserver to detect when #history-tab-container enters the DOM
     * (after the caller injects the generated HTML), then renders immediately.
     * Works in both modal and detail-panel (non-modal) mode.
     */
    loadHistory(item, readOnly = false) {
        // Re-create with correct readOnly mode
        this.historyTab = new HistoryTab(apiClient, { readOnly });

        if (!item?.itemId) return;

        // Start fetching immediately
        this.historyTab.preload('operational-requirements', item.itemId);

        // Disconnect any previous observer
        if (this._historyObserver) {
            this._historyObserver.disconnect();
            this._historyObserver = null;
        }
    }

    loadHistoryWithObserver(item, readOnly = false) {
        this.loadHistory(item, readOnly);

        if (!item?.itemId) return;

        // Observe the DOM for #history-tab-container to appear (detail panel / non-modal)
        this._historyObserver = new MutationObserver(() => {
            const container = document.getElementById('history-tab-container');
            if (!container) return;

            this._historyObserver.disconnect();
            this._historyObserver = null;

            this.historyTab.attach(container, 'operational-requirements', item.itemId);
        });

        this._historyObserver.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * Attach the history tab to its container once the modal DOM is ready.
     * Only used in modal scenarios.
     */
    attachHistory(entityType, itemId) {
        const container = this.currentModal?.querySelector('#history-tab-container');
        this.historyTab.attach(container, entityType, itemId);
    }

    transformDataForSave(data, mode, item) {
        console.log('RequirementForm.transformDataForSave in');
        const transformed = { ...data };

        // Add version ID for optimistic locking on edit (only if item exists)
        if (mode === 'edit' && item) {
            transformed.type = item.type; // Type cannot be changed on edit
            transformed.expectedVersionId = item.versionId || item.expectedVersionId;
        }

        // Ensure all required array fields are present (even if empty)
        requiredIdentifierArrayFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = [];
            }
            if (!Array.isArray(transformed[key])) {
                transformed[key] = [];
            }
        });

        requiredAnnotatedReferenceArrayFields.forEach(key => {
            if (transformed[key] && Array.isArray(transformed[key])) {
                transformed[key] = transformed[key].map(value => {
                    // If already an object, keep it
                    return { id: value.id, note: value.note };
                });
            } else {
                return []
            }
        });

        // Handle path field - convert from textarea input to array
        if (typeof transformed.path === 'string') {
            transformed.path = transformed.path
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        }

        // Ensure all required text fields are present (even if empty)
        requiredTextFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = '';
            }
        });

        // Handle DrG field - ensure it's either a valid DrG key or null
        if (transformed.drg !== undefined) {
            if (transformed.drg === '' || transformed.drg === null) {
                transformed.drg = null;
            }
        }

        // Validation: implementedONs should only be present for OR-type requirements
        if (transformed.type !== 'OR') {
            transformed.implementedONs = [];
        }

        console.log('RequirementForm.transformDataForSave data: ', JSON.stringify(transformed));

        return transformed;
    }

    transformDataForRead(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Handle path display - keep as array for format function
        // No transformation needed for read mode

        // Extract IDs from object references for relationship fields only
        // Impact fields (impactsStakeholderCategories, impactsData, impactsServices)
        // are now annotated and should keep {id, title, note} structure
        const relationshipFields = [
            'refinesParents',
            'implementedONs',
            'dependsOnRequirements'
        ];

        // Impact fields and documentReferences - keep full {id, title, note} structure for annotated-multiselect
        // No transformation needed

        return transformed;
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Handle path - convert array to comma-separated string for textarea editing
        if (transformed.path && Array.isArray(transformed.path)) {
            transformed.path = transformed.path.join(', ');
        }

        // Extract IDs from object references for multiselect fields
        const arrayFields = [
            'impactsStakeholderCategories',
            'impactsData',
            'impactsServices',
            'refinesParents',
            'implementedONs',
            'dependsOnRequirements'
        ];

        arrayFields.forEach(field => {
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

        // documentReferences - keep full {id, title, note} structure for annotated-multiselect
        // The annotated-multiselect manager expects this format

        return transformed;
    }

    async onSave(data, mode, item) {
        console.log("RequirementForm.onSave in - mode: %s", mode);

        // Clear caches when saving as it might affect relationship options
        this.parentRequirementsCache = null;
        this.onRequirementsCache = null;
        this.dependencyRequirementsCache = null;

        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            if (!item) {
                throw new Error('No item provided for update');
            }
            const itemId = parseInt(item.itemId || item.id, 10);
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }

    async onValidate(data, mode, item) {
        console.log('RequirementForm.onValidate');
        const errors = [];

        // Validate DrG field if provided
        if (data.drg && !Object.keys(DraftingGroup).includes(data.drg)) {
            errors.push({
                field: 'drg',
                message: 'Invalid drafting group selected'
            });
        }

        // Validate implementedONs - should only be present for OR-type requirements
        if (data.type === 'OR' && data.implementedONs && Array.isArray(data.implementedONs)) {
            // Additional validation could be added here to ensure referenced ONs exist
        } else if (data.type === 'ON' && data.implementedONs && data.implementedONs.length > 0) {
            errors.push({
                field: 'implementedONs',
                message: 'ON-type requirements cannot implement other requirements'
            });
        }

        console.log('RequirementForm.onValidate - error count: %d', errors.length);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    onCancel() {
        console.log('RequirementForm cancelled');
    }

    // ====================
    // OPTIONS GENERATORS (Referenced by field config)
    // ====================

    getTypeOptions() {
        return [
            { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
            { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
        ];
    }

    getDraftingGroupOptions() {
        const options = [{ value: '', label: 'Not assigned' }];

        Object.keys(DraftingGroup).forEach(key => {
            options.push({
                value: key,
                label: getDraftingGroupDisplay(key)
            });
        });

        return options;
    }

    getStakeholderCategoryOptions() {
        return this.getSetupDataOptions('stakeholderCategories');
    }

    getDataCategoryOptions() {
        return this.getSetupDataOptions('dataCategories');
    }

    getServiceOptions() {
        return this.getSetupDataOptions('services');
    }

    getSetupDataOptions(entityName) {
        if (!this.setupData?.[entityName]) {
            return [];
        }

        return this.setupData[entityName].map(entity => ({
            value: parseInt(entity.id, 10),
            label: entity.name || entity.title || entity.id
        }));
    }

    async getDocumentOptions() {
        if (!this.setupData?.documents) {
            return [];
        }

        return this.setupData.documents.map(doc => ({
            value: doc.id,
            label: doc.name || doc.title || doc.id
        }));
    }

    async getParentRequirementOptions() {
        try {
            // Use cache if available and not expired
            const now = Date.now();
            if (this.parentRequirementsCache && (now - this.parentRequirementsCacheTime) < this.cacheTimeout) {
                return this.parentRequirementsCache;
            }

            // Load all requirements
            const requirements = await apiClient.get(this.entityConfig.endpoint);

            // Build options - allow any requirement as parent
            const options = requirements
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),
                    label: `${req.code}: ${req.title}`,
                    group: req.type
                }))
                .sort((a, b) => {
                    // Sort ONs first, then by ID
                    if (a.group !== b.group) {
                        return a.group === 'ON' ? -1 : 1;
                    }
                    return a.label.localeCompare(b.label);
                });

            // Cache the results
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
            // Use cache if available and not expired
            const now = Date.now();
            if (this.onRequirementsCache && (now - this.onRequirementsCacheTime) < this.cacheTimeout) {
                return this.onRequirementsCache;
            }

            // Load all requirements and filter for ON-type only
            const requirements = await apiClient.get(this.entityConfig.endpoint);
            const onRequirements = requirements.filter(req => req.type === 'ON');

            // Build options for ON-type requirements
            const options = onRequirements
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),
                    label: `${req.code}: ${req.title}`
                }))
                .sort((a, b) => a.label.localeCompare(b.label));

            // Cache the results
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
            // Use cache if available and not expired
            const now = Date.now();
            if (this.dependencyRequirementsCache && (now - this.dependencyRequirementsCacheTime) < this.cacheTimeout) {
                return this.dependencyRequirementsCache;
            }

            // Load all requirements for dependency selection
            const requirements = await apiClient.get(this.entityConfig.endpoint);

            // Build options - any requirement can be a dependency
            const options = requirements
                .map(req => ({
                    value: parseInt(req.itemId || req.id, 10),
                    label: `${req.code}: ${req.title}`,
                    group: req.type
                }))
                .sort((a, b) => {
                    // Sort ONs first, then by ID
                    if (a.group !== b.group) {
                        return a.group === 'ON' ? -1 : 1;
                    }
                    return a.label.localeCompare(b.label);
                });

            // Cache the results
            this.dependencyRequirementsCache = options;
            this.dependencyRequirementsCacheTime = now;

            return options;

        } catch (error) {
            console.error('Failed to load dependency requirements:', error);
            return [];
        }
    }

    // ====================
    // FORMAT HELPERS (Referenced by field config)
    // ====================

    formatDraftingGroup(value) {
        return value ? getDraftingGroupDisplay(value) : 'Not assigned';
    }

    formatMultiSetupData(values, entityName) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

        const entities = this.setupData?.[entityName] || [];

        const names = values.map(id => {
            const entity = entities.find(e => e.id === id);
            return entity ? (entity.name || entity.title) : id;
        });

        return names.join(', ');
    }

    formatEntityReferences(values, expectedType = null) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

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
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

        return values.map(ref => {
            const title = ref.title || ref.id || 'Unknown';
            const note = ref.note ? ` (${ref.note})` : '';
            return `${title}${note}`;
        }).join(', ');
    }

    // ====================
    // CONDITIONAL FIELD VISIBILITY HANDLING
    // ====================

    updateFieldVisibility(formData) {
        // Handle conditional visibility for implementedONs field
        const implementedONsSection = this.currentModal?.querySelector('[data-field="implementedONs"]');
        if (implementedONsSection) {
            const isORType = formData.type === 'OR';
            implementedONsSection.style.display = isORType ? 'block' : 'none';

            // Clear implementedONs if changing to ON type
            if (!isORType) {
                const implementedONsInput = implementedONsSection.querySelector('select');
                if (implementedONsInput) {
                    // Clear all selections
                    Array.from(implementedONsInput.options).forEach(option => {
                        option.selected = false;
                    });
                }
            }
        }
    }

    // ====================
    // EVENT BINDING HELPERS
    // ====================

    bindTypeChangeEvents() {
        const typeInputs = this.currentModal?.querySelectorAll('input[name="type"]');
        if (typeInputs) {
            typeInputs.forEach(input => {
                input.addEventListener('change', (e) => {
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
        // Set up the callback to execute after modal is fully initialized
        this.context.onModalReady = () => {
            this.bindTypeChangeEvents();
            this.updateFieldVisibility({ type: requirementDefaults.type });
        };

        await super.showCreateModal();
    }

    async showEditModal(item) {
        this.loadHistory(item, false);
        // Set up the callback to execute after modal is fully initialized
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