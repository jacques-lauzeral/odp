import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * ChangeForm - Operational Change form configuration and handling
 * Extends CollectionEntityForm using inheritance pattern
 * Matches the API schema exactly for OperationalChangeRequest
 */
export default class ChangeForm extends CollectionEntityForm {
    constructor(entityConfig, setupData) {
        // Call parent constructor with appropriate context
        super(entityConfig, { setupData });

        this.setupData = setupData;

        // Cache for requirements
        this.requirementsCache = null;
        this.requirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache

        // Milestone management
        this.milestones = [];

        // Available event types from API schema
        this.availableEventTypes = [
            'API_PUBLICATION',
            'API_TEST_DEPLOYMENT',
            'UI_TEST_DEPLOYMENT',
            'SERVICE_ACTIVATION',
            'API_DECOMMISSIONING',
            'OTHER'
        ];
    }

    // ====================
    // OVERRIDE VIRTUAL METHODS
    // ====================

    getFieldDefinitions() {
        return [
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
                        modes: ['read'],
                        computed: true
                    },
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        placeholder: 'Enter a clear, concise title for this change',
                        validate: (value) => {
                            if (!value || value.length < 5) {
                                return { valid: false, message: 'Title must be at least 5 characters long' };
                            }
                            if (value.length > 200) {
                                return { valid: false, message: 'Title must be less than 200 characters' };
                            }
                            return { valid: true };
                        }
                    },
                    {
                        key: 'description',
                        label: 'Description',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        rows: 6,
                        placeholder: 'Describe the operational change in detail...',
                        helpText: 'Provide a complete description of what will change and how',
                        validate: (value) => {
                            if (!value || value.length < 20) {
                                return { valid: false, message: 'Description must be at least 20 characters long' };
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
                        options: [
                            { value: 'NM', label: 'NM - Network Manager internal' },
                            { value: 'NETWORK', label: 'NETWORK - Visible to network' }
                        ],
                        defaultValue: 'NETWORK',
                        helpTextAbove: 'Control who can see this change'
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
                        render: (field, fieldId, value, required) => this.renderMilestonesTable(field, fieldId, value, required),
                        helpText: 'Manage milestones for this operational change'
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
                        options: async () => await this.getRequirementOptions(),
                        helpText: 'Select requirements that this change satisfies (use empty array if none)',
                        format: (value) => this.formatEntityReferences(value, 'requirement')
                    },
                    {
                        key: 'supersedsRequirements',
                        label: 'Supersedes Requirements',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        required: false,
                        size: 5,
                        options: async () => await this.getRequirementOptions(),
                        helpText: 'Select requirements that this change supersedes (use empty array if none)',
                        format: (value) => this.formatEntityReferences(value, 'requirement')
                    }
                ]
            },

            // Metadata Section (read-only)
            {
                title: 'Metadata',
                fields: [
                    {
                        key: 'lastUpdatedBy',
                        label: 'Last Updated By',
                        type: 'text',
                        modes: ['read'],
                        computed: true
                    },
                    {
                        key: 'lastUpdatedAt',
                        label: 'Last Updated',
                        type: 'date',
                        modes: ['read'],
                        computed: true,
                        format: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleString();
                        }
                    },
                    {
                        key: 'createdBy',
                        label: 'Created By',
                        type: 'text',
                        modes: ['read'],
                        computed: true
                    },
                    {
                        key: 'createdAt',
                        label: 'Created',
                        type: 'date',
                        modes: ['read'],
                        computed: true,
                        format: (value) => {
                            if (!value) return '-';
                            return new Date(value).toLocaleString();
                        }
                    },
                    {
                        key: 'versionId',
                        label: 'Version ID',
                        type: 'hidden',
                        modes: ['edit']
                    },
                    {
                        key: 'expectedVersionId',
                        label: 'Expected Version ID',
                        type: 'hidden',
                        modes: ['edit']
                    }
                ]
            }
        ];
    }

    getFormTitle(mode) {
        switch (mode) {
            case 'create':
                return 'Create Operational Change';
            case 'edit':
                return 'Edit Operational Change';
            case 'read':
                return 'Operational Change Details';
            default:
                return 'Operational Change';
        }
    }

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Remove milestones from data - they're managed independently
        delete transformed.milestones;

        // Ensure all required array fields are present (even if empty)
        const requiredArrayFields = [
            'satisfiesRequirements',
            'supersedsRequirements'
        ];

        requiredArrayFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = [];
            }
            if (!Array.isArray(transformed[key])) {
                transformed[key] = [];
            }
        });

        // Ensure all required text fields are present
        const requiredTextFields = ['title', 'description', 'visibility'];

        requiredTextFields.forEach(key => {
            if (transformed[key] === undefined || transformed[key] === null) {
                transformed[key] = '';
            }
        });

        // Set default visibility if not set
        if (!transformed.visibility) {
            transformed.visibility = 'NETWORK';
        }

        // Add version ID for optimistic locking on edit
        if (mode === 'edit' && item) {
            transformed.expectedVersionId = item.versionId || item.expectedVersionId;
        }

        return transformed;
    }

    transformDataForEdit(item) {
        if (!item) return {};

        const transformed = { ...item };

        // Extract IDs from object references
        const referenceFields = [
            'satisfiesRequirements',
            'supersedsRequirements'
        ];

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

        // Store milestones separately (not part of form data)
        this.milestones = transformed.milestones || [];

        return transformed;
    }

    async onSave(data, mode, item) {
        // Clear cache when saving
        this.requirementsCache = null;

        if (mode === 'create') {
            const result = await apiClient.post(this.entityConfig.endpoint, data);
            // After creation, update current item for milestone operations
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
            // Update current item after successful save
            if (result) {
                this.currentItem = result;
            }
            return result;
        }
    }

    async onValidate(data, mode, item) {
        const errors = [];
        // No milestone validation here since they're managed independently
        return {
            valid: errors.length === 0,
            errors
        };
    }

    onCancel() {
        // Custom cancel logic if needed
        console.log('ChangeForm cancelled');
    }

    // ====================
    // MILESTONE TABLE RENDERING
    // ====================

    renderMilestonesTable(field, fieldId, value, required) {
        const isReadMode = this.currentMode === 'read';
        const itemId = this.currentItem?.itemId || this.currentItem?.id;

        let html = `<div class="milestones-section" id="${fieldId}">`;

        // Section header with Add button (only in edit/create modes)
        if (!isReadMode && itemId) {
            html += `
                <div class="milestones-header">
                    <span class="milestones-label">Milestones:</span>
                    <button type="button" class="btn btn-secondary btn-sm" id="add-milestone-btn">
                        + Add Milestone
                    </button>
                </div>
            `;
        } else if (!isReadMode && !itemId) {
            html += `
                <div class="milestones-header">
                    <span class="milestones-label">Milestones:</span>
                    <small class="form-text text-muted">Save the change first to manage milestones</small>
                </div>
            `;
        } else {
            html += `<div class="milestones-header"><span class="milestones-label">Milestones:</span></div>`;
        }

        // Milestone table
        html += this.renderMilestoneTable(isReadMode, !!itemId);

        html += `</div>`;

        return html;
    }

    renderMilestoneTable(isReadMode, hasItemId) {
        let html = `
            <table class="milestones-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Wave</th>
                        <th>Event Types</th>
        `;

        if (!isReadMode && hasItemId) {
            html += `<th>Actions</th>`;
        }

        html += `
                    </tr>
                </thead>
                <tbody id="milestones-tbody">
        `;

        if (this.milestones && this.milestones.length > 0) {
            this.milestones.forEach((milestone, index) => {
                html += this.renderMilestoneRow(milestone, index, isReadMode, hasItemId);
            });
        } else {
            const colspan = (!isReadMode && hasItemId) ? 4 : 3;
            html += `
                <tr class="empty-state">
                    <td colspan="${colspan}" class="text-center text-muted">
                        No milestones defined yet
                    </td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>
        `;

        return html;
    }

    renderMilestoneRow(milestone, index, isReadMode, hasItemId) {
        const title = this.escapeHtml(milestone.title || '');
        const wave = this.formatWave(milestone.wave);
        const eventTypes = this.formatEventTypes(milestone.eventTypes);

        // Apply zebra striping
        const rowClass = index % 2 === 0 ? 'even' : 'odd';

        let html = `<tr class="milestone-row ${rowClass}">`;
        html += `<td class="milestone-title" title="${title}">${this.truncateText(title, 30)}</td>`;
        html += `<td class="milestone-wave">${wave}</td>`;
        html += `<td class="milestone-events">${eventTypes}</td>`;

        if (!isReadMode && hasItemId) {
            html += `
                <td class="milestone-actions">
                    <button type="button" class="btn-icon edit-milestone" 
                            data-milestone-id="${milestone.id}" 
                            title="Edit milestone">✏️</button>
                    <button type="button" class="btn-icon delete-milestone" 
                            data-milestone-id="${milestone.id}"
                            title="Delete milestone">🗑️</button>
                </td>
            `;
        }

        html += `</tr>`;
        return html;
    }

    formatWave(wave) {
        if (!wave) return 'Not assigned';

        if (wave.year && wave.quarter) {
            return `${wave.year} Q${wave.quarter}`;
        }

        return wave.name || 'Not assigned';
    }

    formatEventTypes(eventTypes) {
        if (!eventTypes || eventTypes.length === 0) {
            return '-';
        }

        const formatted = eventTypes.map(type =>
            type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
        );

        const joined = formatted.join(', ');
        return this.truncateText(joined, 40);
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    // ====================
    // MILESTONE EVENT HANDLING - INTEGRATED WITH MODAL STACK
    // ====================

    bindMilestoneEvents() {
        console.log('ChangeForm.bindMilestoneEvents - called');

        // PREVENT MULTIPLE BINDINGS
        if (this._milestoneEventsBound) {
            console.log('ChangeForm.bindMilestoneEvents - already bound, skipping');
            return;
        }

        // Add milestone button - use event delegation to avoid multiple bindings
        const milestonesSection = document.querySelector('.milestones-section');
        if (milestonesSection) {
            // Remove any existing listeners first
            milestonesSection.removeEventListener('click', this._milestoneClickHandler);

            // Create bound handler
            this._milestoneClickHandler = (e) => {
                if (e.target.id === 'add-milestone-btn') {
                    console.log('Add milestone button clicked');
                    this.handleAddMilestone();
                }

                const milestoneId = e.target.dataset.milestoneId;
                if (milestoneId) {
                    if (e.target.classList.contains('edit-milestone')) {
                        this.handleEditMilestone(milestoneId);
                    } else if (e.target.classList.contains('delete-milestone')) {
                        this.handleDeleteMilestone(milestoneId);
                    }
                }
            };

            // Add single event listener
            milestonesSection.addEventListener('click', this._milestoneClickHandler);
        }
        this._milestoneEventsBound = true;
    }

    // ====================
    // NEW: INTEGRATED MILESTONE FORM GENERATION
    // ====================

    generateMilestoneForm(mode, milestone = null) {
        const isEdit = mode === 'edit';
        const title = milestone?.title || '';
        const description = milestone?.description || '';
        const waveId = milestone?.wave?.id || milestone?.waveId || '';
        const selectedEventTypes = milestone?.eventTypes || [];

        return `
            <div class="milestone-form">
                <!-- Title Field -->
                <div class="form-group" data-field="title">
                    <label for="milestone-title">Title <span class="required">*</span></label>
                    <input type="text" 
                        id="milestone-title" 
                        name="title" 
                        class="form-control" 
                        value="${this.escapeHtml(title)}"
                        placeholder="Enter milestone title"
                        required>
                    <div class="validation-message"></div>
                </div>

                <!-- Description Field -->
                <div class="form-group" data-field="description">
                    <label for="milestone-description">Description</label>
                    <textarea 
                        id="milestone-description" 
                        name="description" 
                        class="form-control" 
                        rows="3"
                        placeholder="Describe this milestone...">${this.escapeHtml(description)}</textarea>
                    <div class="validation-message"></div>
                </div>

                <!-- Wave Selection -->
                <div class="form-group" data-field="waveId">
                    <label for="milestone-wave">Target Wave</label>
                    <select id="milestone-wave" name="waveId" class="form-control">
                        <option value="">Not assigned</option>
                        ${this.renderWaveOptions(waveId)}
                    </select>
                    <small class="form-text">Select the deployment wave for this milestone</small>
                    <div class="validation-message"></div>
                </div>

                <!-- Event Types with Tag/Label Pattern -->
                <div class="form-group" data-field="eventTypes">
                    <label>Event Types</label>
                    <div class="tag-selector" id="event-types-selector" data-selected='${JSON.stringify(selectedEventTypes)}'>
                        <div class="selected-tags" id="selected-event-types">
                            ${this.renderSelectedEventTypes(selectedEventTypes)}
                        </div>
                        <div class="add-tag-container">
                            <select id="event-type-dropdown" class="form-control">
                                <option value="">+ Add Event Type</option>
                                ${this.renderAvailableEventTypes(selectedEventTypes)}
                            </select>
                        </div>
                    </div>
                    <small class="form-text">Select one or more event types for this milestone</small>
                    <div class="validation-message"></div>
                </div>
            </div>
        `;
    }

    renderWaveOptions(selectedWaveId) {
        if (!this.setupData?.waves) {
            return '';
        }

        return this.setupData.waves.map(wave => {
            const waveId = wave.id.toString();
            const selected = selectedWaveId && selectedWaveId.toString() === waveId ? 'selected' : '';
            const label = `${wave.year} Q${wave.quarter}`;
            return `<option value="${waveId}" ${selected}>${this.escapeHtml(label)}</option>`;
        }).join('');
    }

    renderSelectedEventTypes(selectedEventTypes) {
        return selectedEventTypes.map(eventType => `
            <span class="tag" data-event-type="${eventType}">
                ${this.formatEventType(eventType)}
                <button type="button" class="tag-remove" data-event-type="${eventType}" title="Remove">×</button>
            </span>
        `).join('');
    }

    renderAvailableEventTypes(selectedEventTypes) {
        const available = this.availableEventTypes.filter(type =>
            !selectedEventTypes.includes(type)
        );

        return available.map(eventType => `
            <option value="${eventType}">${this.formatEventType(eventType)}</option>
        `).join('');
    }

    formatEventType(eventType) {
        // Convert API enum to display format
        return eventType.replace(/_/g, ' ').toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    // ====================
    // MILESTONE HANDLERS - USING NESTED MODALS
    // ====================

    async handleAddMilestone() {
        console.log('ChangeForm.handleAddMilestone - called');

        if (!this.currentItem) {
            console.error('No current item for milestone creation');
            return;
        }

        const formContent = this.generateMilestoneForm('create');
        this.showNestedModal(formContent, 'create-milestone');
    }

    async handleEditMilestone(milestoneId) {
        const milestone = this.milestones.find(m => m.id.toString() === milestoneId.toString());
        if (!milestone) {
            console.error('Milestone not found:', milestoneId);
            return;
        }

        const formContent = this.generateMilestoneForm('edit', milestone);

        // Store milestone for save operation
        this._editingMilestone = milestone;

        this.showNestedModal(formContent, 'edit-milestone');
    }

    async handleDeleteMilestone(milestoneId) {
        const milestone = this.milestones.find(m => m.id.toString() === milestoneId.toString());
        if (!milestone) return;

        const confirmed = confirm(`Delete milestone "${milestone.title}"?`);
        if (!confirmed) return;

        try {
            const changeId = this.currentItem.itemId || this.currentItem.id;
            const expectedVersionId = this.currentItem.versionId;

            await apiClient.deleteMilestone(changeId, milestoneId, expectedVersionId);

            // Refresh milestone list
            await this.refreshMilestones();

            console.log('Milestone deleted successfully');
        } catch (error) {
            console.error('Failed to delete milestone:', error);
            alert('Failed to delete milestone: ' + (error.message || 'Unknown error'));
        }
    }

    // ====================
    // OVERRIDE: NESTED MODAL HANDLING
    // ====================

    async handleSave() {
        // Check if this is a milestone save
        if (this.currentMode === 'create-milestone' || this.currentMode === 'edit-milestone') {
            return await this.handleMilestoneSave();
        }

        // Otherwise, use parent save handling
        return await super.handleSave();
    }

    async handleMilestoneSave() {
        console.log('ChangeForm.handleMilestoneSave - called');

        if (!this.currentModal) {
            console.error('No current modal for milestone save');
            return;
        }

        const form = this.currentModal.querySelector('form');
        if (!form) {
            console.error('No form found in milestone modal');
            return;
        }

        // Clear previous errors
        this.clearAllErrors();

        // Collect form data
        const formData = this.collectMilestoneFormData(form);

        // Validate
        const validation = this.validateMilestone(formData);
        if (!validation.valid) {
            this.showValidationErrors(validation.errors);
            return;
        }

        // Prepare milestone data
        const milestoneData = this.prepareMilestoneData(formData);

        try {
            let result;

            if (this.currentMode === 'create-milestone') {
                result = await apiClient.createMilestone(
                    this.currentItem.itemId || this.currentItem.id,
                    milestoneData
                );
            } else {
                result = await apiClient.updateMilestone(
                    this.currentItem.itemId || this.currentItem.id,
                    this._editingMilestone.id,
                    milestoneData
                );
            }

            console.log('Milestone saved successfully');

            // Close nested modal
            this.closeModal();

            // Refresh milestone list
            await this.refreshMilestones();

        } catch (error) {
            console.error('Failed to save milestone:', error);
            this.showFormError(error.message || 'Failed to save milestone. Please try again.');
        }
    }

    collectMilestoneFormData(form) {
        // Get basic form values
        const titleInput = form.querySelector('#milestone-title');
        const descriptionInput = form.querySelector('#milestone-description');
        const waveInput = form.querySelector('#milestone-wave');

        // Get selected event types from tag selector
        const eventTypesSelector = form.querySelector('#event-types-selector');
        const selectedEventTypes = eventTypesSelector ?
            JSON.parse(eventTypesSelector.dataset.selected || '[]') : [];

        // Also check for any changes made during this session
        const tags = form.querySelectorAll('.tag[data-event-type]');
        const currentEventTypes = Array.from(tags).map(tag => tag.dataset.eventType);

        const data = {
            title: titleInput ? titleInput.value.trim() : '',
            description: descriptionInput ? descriptionInput.value.trim() : '',
            waveId: waveInput && waveInput.value ? waveInput.value : null,
            eventTypes: currentEventTypes.length > 0 ? currentEventTypes : selectedEventTypes
        };

        return data;
    }

    validateMilestone(data) {
        const errors = [];

        // Title is required
        if (!data.title || data.title.trim().length === 0) {
            errors.push({
                field: 'title',
                message: 'Title is required'
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    prepareMilestoneData(formData) {
        const data = {
            title: formData.title,
            description: formData.description,
            eventTypes: formData.eventTypes || [],
            waveId: formData.waveId ? parseInt(formData.waveId, 10) : null
        };

        // Add expected version ID for updates (optimistic locking)
        const currentItem = this.currentItem;
        if (currentItem?.versionId) {
            data.expectedVersionId = currentItem.versionId;
        }

        return data;
    }

    // ====================
    // MILESTONE REFRESH
    // ====================

    async refreshMilestones() {
        if (!this.currentItem) return;

        try {
            const changeId = this.currentItem.itemId || this.currentItem.id;
            this.milestones = await apiClient.getMilestones(changeId);

            // Re-render milestone table
            const tbody = document.getElementById('milestones-tbody');
            if (tbody) {
                const isReadMode = this.currentMode === 'read';
                const hasItemId = !!(this.currentItem?.itemId || this.currentItem?.id);

                if (this.milestones && this.milestones.length > 0) {
                    tbody.innerHTML = this.milestones.map((milestone, index) =>
                        this.renderMilestoneRow(milestone, index, isReadMode, hasItemId)
                    ).join('');
                } else {
                    const colspan = (!isReadMode && hasItemId) ? 4 : 3;
                    tbody.innerHTML = `
                        <tr class="empty-state">
                            <td colspan="${colspan}" class="text-center text-muted">
                                No milestones defined yet
                            </td>
                        </tr>
                    `;
                }
            }

            // Rebind events after milestone list update
            if (!this._milestoneEventsBound) {
                this.bindMilestoneEvents();
                this._milestoneEventsBound = true;
            }
        } catch (error) {
            console.error('Failed to refresh milestones:', error);
        }
    }

    // ====================
    // ENHANCED MODAL METHODS
    // ====================

    async showEditModal(item) {
        await super.showEditModal(item);

        // Load milestones after modal is shown
        if (item && (item.itemId || item.id)) {
            await this.refreshMilestones();
        }
    }

    async showReadOnlyModal(item) {
        await super.showReadOnlyModal(item);

        // Load milestones for read-only view
        if (item && (item.itemId || item.id)) {
            await this.refreshMilestones();
        }
    }

    showNestedModal(formContent, mode) {
        // Store the current milestone editing mode
        const previousMode = this.currentMode;
        this.currentMode = mode;

        // Call parent's showNestedModal method
        super.showNestedModal(formContent, mode);

        // Bind event type selector events for milestone forms
        if (mode === 'create-milestone' || mode === 'edit-milestone') {
            setTimeout(() => {
                this.bindEventTypeSelector();
            }, 100);
        }
    }

    bindEventTypeSelector() {
        // Event type dropdown change
        const dropdown = document.querySelector('#event-type-dropdown');
        if (dropdown) {
            dropdown.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.addEventType(e.target.value);
                    e.target.value = ''; // Reset dropdown
                }
            });
        }

        // Tag removal clicks
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const eventType = e.target.dataset.eventType;
                this.removeEventType(eventType);
            }
        });
    }

    addEventType(eventType) {
        const eventTypesSelector = document.querySelector('#event-types-selector');
        if (!eventTypesSelector) return;

        const currentTypes = JSON.parse(eventTypesSelector.dataset.selected || '[]');
        if (!currentTypes.includes(eventType)) {
            currentTypes.push(eventType);
            eventTypesSelector.dataset.selected = JSON.stringify(currentTypes);
            this.refreshEventTypeDisplay();
        }
    }

    removeEventType(eventType) {
        const eventTypesSelector = document.querySelector('#event-types-selector');
        if (!eventTypesSelector) return;

        const currentTypes = JSON.parse(eventTypesSelector.dataset.selected || '[]');
        const filteredTypes = currentTypes.filter(type => type !== eventType);
        eventTypesSelector.dataset.selected = JSON.stringify(filteredTypes);
        this.refreshEventTypeDisplay();
    }

    refreshEventTypeDisplay() {
        const eventTypesSelector = document.querySelector('#event-types-selector');
        if (!eventTypesSelector) return;

        const currentTypes = JSON.parse(eventTypesSelector.dataset.selected || '[]');

        const selectedContainer = document.getElementById('selected-event-types');
        const dropdown = document.getElementById('event-type-dropdown');

        if (selectedContainer) {
            selectedContainer.innerHTML = this.renderSelectedEventTypes(currentTypes);
        }

        if (dropdown) {
            // Preserve current dropdown state
            const currentValue = dropdown.value;
            dropdown.innerHTML = `<option value="">+ Add Event Type</option>${this.renderAvailableEventTypes(currentTypes)}`;
            dropdown.value = currentValue;
        }
    }

    // ====================
    // DATA OPTIONS HELPERS
    // ====================

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
                value: parseInt(req.itemId || req.id, 10),  // Convert to number
                label: `[${req.type}] ${req.itemId}: ${req.title}`
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

    // ====================
    // FORMAT HELPERS
    // ====================

    formatEntityReferences(values, type) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return 'None';
        }

        return values.map(ref => {
            if (typeof ref === 'object' && ref !== null) {
                const prefix = type === 'requirement' && ref.type ? `[${ref.type}] ` : '';
                return `${prefix}${ref.title || ref.name || ref.id}`;
            }
            return ref;
        }).join(', ');
    }

    // ====================
    // PUBLIC API (convenience methods)
    // ====================

    async showCreateModal() {
        await super.showCreateModal();
    }

    async generateReadOnlyView(item) {
        return await super.generateReadOnlyView(item);
    }

    // ====================
    // UTILITIES
    // ====================

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}