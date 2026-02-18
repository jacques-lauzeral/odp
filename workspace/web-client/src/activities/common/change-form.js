import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { HistoryTab } from '../../components/odp/history-tab.js';
import { apiClient } from '../../shared/api-client.js';
import {
    DraftingGroup,
    getDraftingGroupDisplay,
    getVisibilityDisplay,
    MilestoneEventType
} from '/shared/src/index.js';
import { MilestoneManager } from './change-form-milestone.js';
import {
    changeFieldDefinitions,
    changeFormTitles,
    requiredIdentifierArrayFields,
    requiredTextFields,
    optionalTextFields,
    changeDefaults
} from './change-form-fields.js';

/**
 * ChangeForm - Operational Change form configuration and handling
 * Extends CollectionEntityForm using inheritance pattern
 * Updated for Phase 19:
 * - Field definitions extracted to change-form-fields.js
 * - Milestone management extracted to change-form-milestone.js
 * - Added: privateNotes, path, documentReferences, dependsOnChanges fields
 *
 * BUG FIX: Fixed rich text field rendering in edit mode by correcting options binding
 */
export default class ChangeForm extends CollectionEntityForm {
    constructor(entityConfig, context) {
        super(entityConfig, context);

        // Cache for requirements
        this.requirementsCache = null;
        this.requirementsCacheTime = 0;

        // Cache for change dependencies
        this.dependencyChangesCache = null;
        this.dependencyChangesCacheTime = 0;

        this.cacheTimeout = 60000; // 1 minute cache

        // Initialize milestone manager
        this.milestoneManager = new MilestoneManager(
            this,
            Object.keys(MilestoneEventType)
        );

        // HistoryTab - lazy-loads version history when the History tab is activated
        this.historyTab = new HistoryTab(apiClient);


    }

    // ====================
    // OVERRIDE VIRTUAL METHODS
    // ====================

    getFieldDefinitions() {
        // Hydrate configuration with runtime logic
        return changeFieldDefinitions.map(section => ({
            ...section,
            fields: section.fields.map(field => this.hydrateField(field))
        }));
    }

    /**
     * Hydrate a field configuration with runtime functions
     * Converts optionsKey/formatKey/renderKey references to actual functions
     */
    hydrateField(field) {
        const hydrated = { ...field };

        // Bind options function if specified by key
        // FIX: Use bind() instead of arrow wrapper to preserve async function detection
        if (field.optionsKey && this[field.optionsKey]) {
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

        // Bind render function if specified by key (for custom fields)
        if (field.renderKey && field.key === 'milestones') {
            hydrated.render = (field, fieldId, value, required) =>
                this.milestoneManager.renderMilestonesField(field, fieldId, value, required);
        }

        return hydrated;
    }

    getFormTitle(mode) {
        return changeFormTitles[mode] || changeFormTitles.default;
    }

    /**
     * Load version history as soon as the form is populated with an item.
     * Uses a MutationObserver to detect when #history-tab-container enters the DOM,
     * then renders immediately. Works in both modal and detail-panel (non-modal) mode.
     */
    loadHistory(item) {
        if (!item?.itemId) return;

        // Reset previous state
        this.historyTab.reset();

        // Start fetching immediately
        this.historyTab.preload('operational-changes', item.itemId);

        // Disconnect any previous observer
        if (this._historyObserver) {
            this._historyObserver.disconnect();
            this._historyObserver = null;
        }

        // Observe the DOM for #history-tab-container to appear
        this._historyObserver = new MutationObserver(() => {
            const container = document.getElementById('history-tab-container');
            if (!container) return;

            this._historyObserver.disconnect();
            this._historyObserver = null;

            this.historyTab.attach(container, 'operational-changes', item.itemId);
        });

        this._historyObserver.observe(document.body, { childList: true, subtree: true });
    }

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Remove milestones from data - managed independently
        delete transformed.milestones;

        // Ensure all required array fields are present
        requiredIdentifierArrayFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = [];
            }
            if (!Array.isArray(transformed[key])) {
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

        // Ensure all required text fields are present
        [...requiredTextFields, ...optionalTextFields].forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = '';
            }
        });

        // Handle DrG field
        if (transformed.drg !== undefined) {
            if (transformed.drg === '' || transformed.drg === null) {
                transformed.drg = null;
            }
        }

        // Set default visibility if not set
        if (!transformed.visibility) {
            transformed.visibility = changeDefaults.visibility;
        }

        // Add version ID for optimistic locking on edit
        if (mode === 'edit' && item) {
            transformed.expectedVersionId = item.versionId || item.expectedVersionId;
        }

        return transformed;
    }

    transformDataForRead(item) {
        if (!item) return {};

        const transformed = { ...item };


        // Store milestones in milestone manager
        this.milestoneManager.setMilestones(transformed.milestones || []);

        return transformed;
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Handle path - convert array to comma-separated string for textarea editing
        if (transformed.path && Array.isArray(transformed.path)) {
            transformed.path = transformed.path.join(', ');
        }

        // Extract IDs from object references
        const referenceFields = ['satisfiesRequirements', 'supersedsRequirements', 'dependsOnChanges'];

        referenceFields.forEach(field => {
            if (transformed[field] && Array.isArray(transformed[field])) {
                transformed[field] = transformed[field].map(ref => {
                    if (typeof ref === 'object' && ref !== null) {
                        const id = ref.itemId || ref.id || ref;
                        return typeof id === 'string' ? parseInt(id, 10) : id;
                    }
                    return typeof ref === 'string' && /^\d+$/.test(ref) ? parseInt(ref, 10) : ref;
                });
            }
        });

        // documentReferences - keep full {id, title, note} structure for annotated-multiselect
        // The annotated-multiselect manager expects this format

        // Store milestones in milestone manager
        this.milestoneManager.setMilestones(transformed.milestones || []);

        return transformed;
    }

    async onSave(data, mode, item) {
        // Clear caches when saving
        this.requirementsCache = null;
        this.dependencyChangesCache = null;

        if (mode === 'create') {
            const result = await apiClient.post(this.entityConfig.endpoint, data);
            if (result) {
                this.currentItem = result;
            }
            return result;
        } else {
            if (!item) {
                throw new Error('No item provided for update');
            }
            const itemId = parseInt(item.itemId || item.id, 10);
            const result = await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
            if (result) {
                this.currentItem = result;
            }
            return result;
        }
    }

    async onValidate(data, mode, item) {
        const errors = [];

        // Validate title
        if (!data.title || data.title.length < 3) {
            errors.push({ field: 'title', message: 'Title must be at least 3 characters long' });
        }

        // Validate purpose
        if (!data.purpose || data.purpose.length < 3) {
            errors.push({ field: 'purpose', message: 'Purpose must be at least 3 characters long' });
        }

        // Validate visibility
        if (!data.visibility) {
            errors.push({ field: 'visibility', message: 'Visibility is required' });
        } else if (!['NM', 'NETWORK'].includes(data.visibility)) {
            errors.push({ field: 'visibility', message: 'Invalid visibility value' });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ====================
    // OPTIONS PROVIDERS (Referenced by field config)
    // ====================

    getVisibilityOptions() {
        return [
            { value: 'NM', label: getVisibilityDisplay('NM') },
            { value: 'NETWORK', label: getVisibilityDisplay('NETWORK') }
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

    async getRequirementOptions() {
        try {
            // Use cache if available
            const now = Date.now();
            if (this.requirementsCache && (now - this.requirementsCacheTime) < this.cacheTimeout) {
                return this.requirementsCache;
            }

            // Load all requirements
            const response = await apiClient.get('/operational-requirements');
            const requirements = Array.isArray(response) ? response : [];

            const options = requirements.map(req => ({
                value: parseInt(req.itemId || req.id, 10),
                label: `${req.code}: ${req.title}`
            }));

            // Cache the results
            this.requirementsCache = options;
            this.requirementsCacheTime = now;

            return options;

        } catch (error) {
            console.error('Failed to load requirements:', error);
            return [];
        }
    }

    async getDependencyChangeOptions() {
        try {
            // Use cache if available
            const now = Date.now();
            if (this.dependencyChangesCache && (now - this.dependencyChangesCacheTime) < this.cacheTimeout) {
                return this.dependencyChangesCache;
            }

            // Load all changes for dependency selection
            const response = await apiClient.get('/operational-changes');
            const changes = Array.isArray(response) ? response : [];

            const options = changes.map(change => ({
                value: parseInt(change.itemId || change.id, 10),
                label: `${change.code}: ${change.title}`
            }));

            // Cache the results
            this.dependencyChangesCache = options;
            this.dependencyChangesCacheTime = now;

            return options;

        } catch (error) {
            console.error('Failed to load changes for dependencies:', error);
            return [];
        }
    }

    async getDocumentOptions() {
        if (!this.context?.setupData?.documents) {
            return [];
        }

        const options = this.context.setupData.documents.map(doc => ({
            value: doc.id,
            label: doc.name || doc.title || doc.id
        }));

        console.log('getDocumentOptions - returning options:', options);
        return options;
    }

    // ====================
    // FORMAT HELPERS (Referenced by field config)
    // ====================

    formatDraftingGroup(value) {
        return value ? getDraftingGroupDisplay(value) : 'Not assigned';
    }

    formatEntityReferences(values, type) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

        return values.map(ref => {
            if (typeof ref === 'object' && ref !== null) {
                const code = ref.code ? `[${ref.code}] ` : '[...]';
                return `${code} ${ref.title}`;
            }
            return ref;
        }).join(', ');
    }

    formatAnnotatedReferences(values) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

        return values.map(ref => {
            const title = ref.title || ref.name || ref.id || 'Unknown';
            const note = ref.note ? ` (${ref.note})` : '';
            return `${title}${note}`;
        }).join(', ');
    }

    // ====================
    // OVERRIDE: MILESTONE SAVE HANDLING
    // ====================

    async handleSave() {
        console.log('ChangeForm.handleSave - called');

        // Check if this is a milestone save - delegate to milestone manager
        if (this.currentMode === 'create-milestone' || this.currentMode === 'edit-milestone') {
            return await this.milestoneManager.handleSave();
        }

        // Otherwise, use parent save handling
        return await super.handleSave();
    }

    // ====================
    // ENHANCED MODAL METHODS
    // ====================

    async showEditModal(item) {
        this.loadHistory(item);
        console.log('ChangeForm.showEditModal - item:', item?.itemId);
        await super.showEditModal(item);

        // Load milestones after modal is shown
        if (item && (item.itemId || item.id)) {
            await this.milestoneManager.refreshMilestones();

            // Bind milestone events after DOM is ready
            setTimeout(() => {
                this.milestoneManager.bindEvents(this.currentModal);
            }, 100);
        }
    }

    async showReadOnlyModal(item) {
        this.loadHistory(item);
        await super.showReadOnlyModal(item);

        // Load milestones for read-only view
        if (item && (item.itemId || item.id)) {
            await this.milestoneManager.refreshMilestones();
        }
    }

    showNestedModal(formContent, mode) {
        const previousMode = this.currentMode;
        this.currentMode = mode;

        super.showNestedModal(formContent, mode);

        // Bind event type selector for milestone forms
        if (mode === 'create-milestone' || mode === 'edit-milestone') {
            setTimeout(() => {
                this.milestoneManager.bindEventTypeSelector();
            }, 100);
        }
    }

    renderReadOnlyField(field, value) {
        // Handle milestones specially in read-only mode
        if (field.key === 'milestones') {
            return this.milestoneManager.renderMilestonesField(field, `readonly-${field.key}`, value, false);
        }

        // For all other fields, use parent's read-only rendering
        return super.renderReadOnlyField ? super.renderReadOnlyField(field, value) : null;
    }

    async reloadCurrentItem() {
        if (!this.currentItem) return;

        try {
            const itemId = this.currentItem.itemId || this.currentItem.id;
            console.log('ChangeForm.reloadCurrentItem - reloading item:', itemId);

            const updatedItem = await apiClient.get(`${this.entityConfig.endpoint}/${itemId}`);

            this.currentItem = updatedItem;
            this.milestoneManager.setMilestones(updatedItem.milestones || []);

            console.log('ChangeForm.reloadCurrentItem - reloaded successfully, new version:', this.currentItem.version);

        } catch (error) {
            console.error('Failed to reload current item:', error);
            throw error;
        }
    }

    // ====================
    // PUBLIC API
    // ====================

    async showCreateModal() {
        await super.showCreateModal();
    }

    async generateReadOnlyView(item, preserveTabIndex = false) {
        this.loadHistory(item);
        return await super.generateReadOnlyView(item, preserveTabIndex);
    }

}