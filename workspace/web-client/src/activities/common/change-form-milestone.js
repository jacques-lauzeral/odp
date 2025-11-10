import { apiClient } from '../../shared/api-client.js';
import { getMilestoneEventDisplay } from '/shared/src/index.js';

/**
 * MilestoneManager - Handles milestone CRUD operations for ChangeForm
 * Extracted from change-form.js for better separation of concerns
 * Manages the 5-event milestone system with wave assignments
 */
export class MilestoneManager {
    constructor(parentForm, context, availableEventTypes) {

        console.log('MilestoneManager.new setupData:', JSON.stringify(context.setupData));

        this.parentForm = parentForm;
        this.setupData = context.setupData;
        this.availableEventTypes = availableEventTypes;
        this.milestones = [];
        this._eventsBound = false;
        this._clickHandler = null;
    }

    // ====================
    // PUBLIC API
    // ====================

    /**
     * Get current milestones array
     */
    getMilestones() {
        return this.milestones;
    }

    /**
     * Set milestones array (called when loading item data)
     */
    setMilestones(milestones) {
        this.milestones = milestones || [];
    }

    /**
     * Render the milestones field for the form
     */
    renderMilestonesField(field, fieldId, value, required) {
        const isReadMode = this.parentForm.currentMode === 'read';
        const itemId = this.parentForm.currentItem?.itemId || this.parentForm.currentItem?.id;

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
        html += this.renderTable(isReadMode, !!itemId);
        html += `</div>`;

        return html;
    }

    /**
     * Bind event handlers for milestone interactions
     */
    bindEvents(container) {
        console.log('MilestoneManager.bindEvents - called');

        if (this._eventsBound) {
            console.log('MilestoneManager.bindEvents - already bound, skipping');
            return;
        }

        const milestonesSection = container?.querySelector('.milestones-section');
        console.log('MilestoneManager.bindEvents - found milestonesSection:', !!milestonesSection);

        if (milestonesSection) {
            // Remove any existing listeners first
            if (this._clickHandler) {
                milestonesSection.removeEventListener('click', this._clickHandler);
            }

            // Create bound handler
            this._clickHandler = (e) => {
                console.log('MilestoneManager._clickHandler - clicked element:', e.target.id, e.target.className);

                if (e.target.id === 'add-milestone-btn') {
                    console.log('Add milestone button clicked');
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleAdd();
                    return;
                }

                const milestoneKey = e.target.dataset.milestoneKey;
                if (milestoneKey) {
                    console.log('Milestone action clicked:', milestoneKey, e.target.className);
                    e.preventDefault();
                    e.stopPropagation();

                    if (e.target.classList.contains('edit-milestone')) {
                        this.handleEdit(milestoneKey);
                    } else if (e.target.classList.contains('delete-milestone')) {
                        this.handleDelete(milestoneKey);
                    }
                }
            };

            // Add single event listener
            milestonesSection.addEventListener('click', this._clickHandler);
            console.log('MilestoneManager.bindEvents - event listener attached');
            this._eventsBound = true;
        }
    }

    /**
     * Unbind event handlers
     */
    unbindEvents(container) {
        const milestonesSection = container?.querySelector('.milestones-section');
        if (milestonesSection && this._clickHandler) {
            milestonesSection.removeEventListener('click', this._clickHandler);
        }
        this._eventsBound = false;
        this._clickHandler = null;
    }

    /**
     * Refresh milestone list from server
     */
    async refreshMilestones() {
        const currentItem = this.parentForm.currentItem;
        if (!currentItem) return;

        try {
            const changeId = currentItem.itemId || currentItem.id;
            this.milestones = await apiClient.getMilestones(changeId);

            // Re-render milestone table
            const tbody = this.parentForm.currentModal?.querySelector('#milestones-tbody');
            if (tbody) {
                const isReadMode = this.parentForm.currentMode === 'read';
                const hasItemId = !!(currentItem?.itemId || currentItem?.id);

                if (this.milestones && this.milestones.length > 0) {
                    tbody.innerHTML = this.milestones.map((milestone, index) =>
                        this.renderRow(milestone, index, isReadMode, hasItemId)
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

            // Rebind events after table update
            this._eventsBound = false;
            this.bindEvents(this.parentForm.currentModal);

        } catch (error) {
            console.error('Failed to refresh milestones:', error);
        }
    }

    // ====================
    // MILESTONE HANDLERS
    // ====================

    async handleAdd() {
        console.log('MilestoneManager.handleAdd - called');

        if (!this.parentForm.currentItem) {
            console.error('No current item for milestone creation');
            return;
        }

        const formContent = this.generateForm('create');
        this.parentForm.showNestedModal(formContent, 'create-milestone');
    }

    async handleEdit(milestoneKey) {
        const milestone = this.milestones.find(m =>
            (m.milestoneKey && m.milestoneKey === milestoneKey) ||
            (m.id && m.id.toString() === milestoneKey.toString())
        );

        if (!milestone) {
            console.error('Milestone not found:', milestoneKey);
            return;
        }

        const formContent = this.generateForm('edit', milestone);

        // Store milestone for save operation
        this.parentForm._editingMilestone = milestone;

        this.parentForm.showNestedModal(formContent, 'edit-milestone');
    }

    async handleDelete(milestoneKey) {
        const milestone = this.milestones.find(m =>
            (m.milestoneKey && m.milestoneKey === milestoneKey) ||
            (m.id && m.id.toString() === milestoneKey.toString())
        );

        if (!milestone) return;

        const confirmed = confirm(`Delete milestone "${milestone.title}"?`);
        if (!confirmed) return;

        try {
            const changeId = this.parentForm.currentItem.itemId || this.parentForm.currentItem.id;
            const expectedVersionId = this.parentForm.currentItem.versionId;

            const keyToUse = milestone.milestoneKey || milestone.id;
            await apiClient.deleteMilestone(changeId, keyToUse, expectedVersionId);

            await this.refreshMilestones();

            console.log('Milestone deleted successfully');
        } catch (error) {
            console.error('Failed to delete milestone:', error);
            alert('Failed to delete milestone: ' + (error.message || 'Unknown error'));
        }
    }

    /**
     * Handle milestone save operation (called from parent form)
     */
    async handleSave() {
        console.log('MilestoneManager.handleSave - called');

        const currentModal = this.parentForm.currentModal;
        if (!currentModal) {
            console.error('No current modal for milestone save');
            return;
        }

        const form = currentModal.querySelector('form');
        if (!form) {
            console.error('No form found in milestone modal');
            return;
        }

        // Clear previous errors
        this.parentForm.clearAllErrors();

        // Collect form data
        const formData = this.collectFormData(form);

        // Validate
        const validation = this.validateMilestone(formData);
        if (!validation.valid) {
            this.parentForm.showValidationErrors(validation.errors);
            return;
        }

        // Prepare milestone data
        const milestoneData = this.prepareData(formData);

        try {
            let result;

            if (this.parentForm.currentMode === 'create-milestone') {
                result = await apiClient.createMilestone(
                    this.parentForm.currentItem.itemId || this.parentForm.currentItem.id,
                    milestoneData
                );

                if (result && result.operationalChange) {
                    this.parentForm.currentItem.versionId = result.operationalChange.versionId;
                    this.parentForm.currentItem.version = result.operationalChange.version;
                }
            } else {
                const keyToUse = this.parentForm._editingMilestone.milestoneKey ||
                    this.parentForm._editingMilestone.id;
                result = await apiClient.updateMilestone(
                    this.parentForm.currentItem.itemId || this.parentForm.currentItem.id,
                    keyToUse,
                    milestoneData
                );

                if (result && result.operationalChange) {
                    this.parentForm.currentItem.versionId = result.operationalChange.versionId;
                    this.parentForm.currentItem.version = result.operationalChange.version;
                }
            }

            console.log('Milestone saved successfully');

            // Close nested modal
            this.parentForm.closeModal();

            // Refresh milestone list
            await this.refreshMilestones();

        } catch (error) {
            console.error('Failed to save milestone:', error);
            this.parentForm.showFormError(error.message || 'Failed to save milestone. Please try again.');
        }
    }

    // ====================
    // RENDERING METHODS
    // ====================

    renderTable(isReadMode, hasItemId) {
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
                html += this.renderRow(milestone, index, isReadMode, hasItemId);
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

    renderRow(milestone, index, isReadMode, hasItemId) {
        const title = this.escapeHtml(milestone.title || '');
        const wave = this.formatWave(milestone.wave);
        const eventTypes = this.formatEventTypes(milestone.eventTypes);

        const rowClass = index % 2 === 0 ? 'even' : 'odd';

        let html = `<tr class="milestone-row ${rowClass}">`;
        html += `<td class="milestone-title" title="${title}">${this.truncateText(title, 30)}</td>`;
        html += `<td class="milestone-wave">${wave}</td>`;
        html += `<td class="milestone-events">${eventTypes}</td>`;

        if (!isReadMode && hasItemId) {
            const milestoneKey = milestone.milestoneKey || milestone.id;
            html += `
                <td class="milestone-actions">
                    <button type="button" class="btn-icon edit-milestone" 
                            data-milestone-key="${milestoneKey}" 
                            title="Edit milestone">✏️</button>
                    <button type="button" class="btn-icon delete-milestone" 
                            data-milestone-key="${milestoneKey}"
                            title="Delete milestone">🗑️</button>
                </td>
            `;
        }

        html += `</tr>`;
        return html;
    }

    generateForm(mode, milestone = null) {
        const isEdit = mode === 'edit';
        const title = milestone?.title || '';
        const description = milestone?.description || '';
        const waveId = milestone?.wave?.id || milestone?.waveId || '';
        const selectedEventTypes = milestone?.eventTypes || [];

        return `
            <div class="milestone-form">
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

                <div class="form-group" data-field="waveId">
                    <label for="milestone-wave">Target Wave</label>
                    <select id="milestone-wave" name="waveId" class="form-control">
                        <option value="">Not assigned</option>
                        ${this.renderWaveOptions(waveId)}
                    </select>
                    <small class="form-text">Select the deployment wave for this milestone</small>
                    <div class="validation-message"></div>
                </div>

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
                    <small class="form-text">Select from the 5 standard milestone event types</small>
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
            const label = `${wave.name}`;
            return `<option value="${waveId}" ${selected}>${this.escapeHtml(label)}</option>`;
        }).join('');
    }

    renderSelectedEventTypes(selectedEventTypes) {
        return selectedEventTypes.map(eventType => `
            <span class="tag milestone-event-tag" data-event-type="${eventType}">
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

    // ====================
    // EVENT TYPE TAG MANAGEMENT
    // ====================

    bindEventTypeSelector() {
        const dropdown = document.querySelector('#event-type-dropdown');
        if (dropdown) {
            dropdown.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.addEventType(e.target.value);
                    e.target.value = '';
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const eventType = e.target.dataset.eventType;
                this.removeEventType(eventType);
            }
        });
    }

    addEventType(eventType) {
        if (!this.availableEventTypes.includes(eventType)) {
            console.warn('Invalid event type:', eventType);
            return;
        }

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
            const currentValue = dropdown.value;
            dropdown.innerHTML = `<option value="">+ Add Event Type</option>${this.renderAvailableEventTypes(currentTypes)}`;
            dropdown.value = currentValue;
        }
    }

    // ====================
    // DATA PROCESSING
    // ====================

    collectFormData(form) {
        const titleInput = form.querySelector('#milestone-title');
        const descriptionInput = form.querySelector('#milestone-description');
        const waveInput = form.querySelector('#milestone-wave');

        const eventTypesSelector = form.querySelector('#event-types-selector');
        const selectedEventTypes = eventTypesSelector ?
            JSON.parse(eventTypesSelector.dataset.selected || '[]') : [];

        const tags = form.querySelectorAll('.tag[data-event-type]');
        const currentEventTypes = Array.from(tags).map(tag => tag.dataset.eventType);

        return {
            title: titleInput ? titleInput.value.trim() : '',
            description: descriptionInput ? descriptionInput.value.trim() : '',
            waveId: waveInput && waveInput.value ? waveInput.value : null,
            eventTypes: currentEventTypes.length > 0 ? currentEventTypes : selectedEventTypes
        };
    }

    validateMilestone(data) {
        const errors = [];

        if (!data.title || data.title.trim().length === 0) {
            errors.push({
                field: 'title',
                message: 'Title is required'
            });
        }

        if (data.eventTypes && Array.isArray(data.eventTypes)) {
            const invalidEventTypes = data.eventTypes.filter(eventType =>
                !this.availableEventTypes.includes(eventType)
            );

            if (invalidEventTypes.length > 0) {
                errors.push({
                    field: 'eventTypes',
                    message: `Invalid event types: ${invalidEventTypes.join(', ')}`
                });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    prepareData(formData) {
        const data = {
            title: formData.title,
            description: formData.description,
            eventTypes: formData.eventTypes || [],
            waveId: formData.waveId ? parseInt(formData.waveId, 10) : null
        };

        data.eventTypes = data.eventTypes.filter(eventType =>
            this.availableEventTypes.includes(eventType)
        );

        const currentItem = this.parentForm.currentItem;
        if (currentItem?.versionId) {
            data.expectedVersionId = currentItem.versionId;
        }

        return data;
    }

    // ====================
    // FORMATTING HELPERS
    // ====================

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

        const formatted = eventTypes.map(type => getMilestoneEventDisplay(type));
        const joined = formatted.join(', ');
        return this.truncateText(joined, 40);
    }

    formatEventType(eventType) {
        return getMilestoneEventDisplay(eventType);
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}