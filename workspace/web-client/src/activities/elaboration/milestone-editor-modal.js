import { apiClient } from '../../shared/api-client.js';

/**
 * MilestoneEditorModal - Modal component for adding/editing milestones
 * Uses tag/label pattern for event types multichoice
 */
export class MilestoneEditorModal {
    constructor(changeId, setupData, parentForm) {
        this.changeId = changeId;
        this.setupData = setupData;
        this.parentForm = parentForm; // Reference to parent ChangeForm

        this.currentMilestone = null;
        this.currentMode = null; // 'create' or 'edit'
        this.selectedEventTypes = [];

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
    // PUBLIC API
    // ====================

    async showCreateModal() {
        console.log('MilestoneEditorModal.showCreateModal - called');

        this.currentMode = 'create';
        this.currentMilestone = null;
        this.selectedEventTypes = [];

        const form = this.generateForm('create');
        console.log('MilestoneEditorModal.showCreateModal - form generated');

        this.showModal(form, 'Create Milestone');
        console.log('MilestoneEditorModal.showCreateModal - modal shown');
    }

    async showEditModal(milestone) {
        if (!milestone) {
            console.warn('No milestone provided for editing');
            return;
        }

        this.currentMode = 'edit';
        this.currentMilestone = milestone;
        this.selectedEventTypes = [...(milestone.eventTypes || [])];

        const form = this.generateForm('edit', milestone);
        this.showModal(form, 'Edit Milestone');
    }

    // ====================
    // FORM GENERATION
    // ====================

    generateForm(mode, milestone = null) {
        const isEdit = mode === 'edit';
        const title = milestone?.title || '';
        const description = milestone?.description || '';
        const waveId = milestone?.wave?.id || milestone?.waveId || '';

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
                    <div class="tag-selector" id="event-types-selector">
                        <div class="selected-tags" id="selected-event-types">
                            ${this.renderSelectedEventTypes()}
                        </div>
                        <div class="add-tag-container">
                            <select id="event-type-dropdown" class="form-control">
                                <option value="">+ Add Event Type</option>
                                ${this.renderAvailableEventTypes()}
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

    renderSelectedEventTypes() {
        return this.selectedEventTypes.map(eventType => `
            <span class="tag" data-event-type="${eventType}">
                ${this.formatEventType(eventType)}
                <button type="button" class="tag-remove" data-event-type="${eventType}" title="Remove">×</button>
            </span>
        `).join('');
    }

    renderAvailableEventTypes() {
        const available = this.availableEventTypes.filter(type =>
            !this.selectedEventTypes.includes(type)
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
    // MODAL MANAGEMENT
    // ====================

    showModal(formContent, title) {
        console.log('MilestoneEditorModal.showModal - called with title:', title);

        // Create a completely independent modal
        const modalId = `milestone-modal-${Date.now()}`;
        const modalHtml = `
            <div class="modal-overlay" id="${modalId}" style="z-index: 2000;">
                <div class="modal" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" id="milestone-close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="milestone-form" novalidate>
                            ${formContent}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" id="milestone-cancel-btn">Cancel</button>
                        <button type="button" class="btn btn-primary" id="milestone-save-btn">
                            ${this.currentMode === 'create' ? 'Create Milestone' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add modal to DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.milestoneModal = document.getElementById(modalId);

        console.log('MilestoneEditorModal.showModal - created independent modal');

        // Attach events
        this.attachEvents();
    }

    // ====================
    // EVENT HANDLING
    // ====================

    attachEvents() {
        console.log('MilestoneEditorModal.attachEvents - called');

        if (!this.milestoneModal) {
            console.error('MilestoneEditorModal.attachEvents - no milestone modal found');
            return;
        }

        // Attach to our specific milestone buttons
        const saveButton = this.milestoneModal.querySelector('#milestone-save-btn');
        const cancelButton = this.milestoneModal.querySelector('#milestone-cancel-btn');
        const closeButton = this.milestoneModal.querySelector('#milestone-close-btn');

        console.log('MilestoneEditorModal.attachEvents - saveButton found:', !!saveButton);
        console.log('MilestoneEditorModal.attachEvents - cancelButton found:', !!cancelButton);
        console.log('MilestoneEditorModal.attachEvents - closeButton found:', !!closeButton);

        if (saveButton) {
            saveButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('MilestoneEditorModal - save button clicked');
                this.handleSave();
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('MilestoneEditorModal - cancel button clicked');
                this.handleCancel();
            });
        }

        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('MilestoneEditorModal - close button clicked');
                this.handleCancel();
            });
        }

        // Event type dropdown change
        const dropdown = this.milestoneModal.querySelector('#event-type-dropdown');
        console.log('MilestoneEditorModal.attachEvents - dropdown found:', !!dropdown);
        if (dropdown) {
            dropdown.addEventListener('change', (e) => {
                console.log('MilestoneEditorModal.attachEvents - dropdown changed:', e.target.value);
                if (e.target.value) {
                    this.addEventType(e.target.value);
                    e.target.value = ''; // Reset dropdown
                }
            });
        }

        // Tag removal clicks
        this.milestoneModal.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                console.log('MilestoneEditorModal.attachEvents - tag remove clicked:', e.target.dataset.eventType);
                const eventType = e.target.dataset.eventType;
                this.removeEventType(eventType);
            }
        });

        // Form input validation
        const form = this.milestoneModal.querySelector('#milestone-form');
        console.log('MilestoneEditorModal.attachEvents - form found:', !!form);
        if (form) {
            form.addEventListener('input', (e) => {
                this.clearFieldError(e.target);
            });
        }

        console.log('MilestoneEditorModal.attachEvents - all events attached');
    }

    addEventType(eventType) {
        if (!this.selectedEventTypes.includes(eventType)) {
            this.selectedEventTypes.push(eventType);
            this.refreshEventTypeDisplay();
        }
    }

    removeEventType(eventType) {
        this.selectedEventTypes = this.selectedEventTypes.filter(type => type !== eventType);
        this.refreshEventTypeDisplay();
    }

    refreshEventTypeDisplay() {
        const selectedContainer = document.getElementById('selected-event-types');
        const dropdown = document.getElementById('event-type-dropdown');

        if (selectedContainer) {
            selectedContainer.innerHTML = this.renderSelectedEventTypes();
        }

        if (dropdown) {
            // Preserve current dropdown state
            const currentValue = dropdown.value;
            dropdown.innerHTML = `<option value="">+ Add Event Type</option>${this.renderAvailableEventTypes()}`;
            dropdown.value = currentValue;
        }
    }

    // ====================
    // FORM HANDLING
    // ====================

    async handleSave() {
        console.log('MilestoneEditorModal.handleSave - called');

        // Get the form from our independent modal
        const form = this.milestoneModal.querySelector('#milestone-form');

        if (!form) {
            console.error('MilestoneEditorModal.handleSave - form not found in milestone modal');
            return;
        }

        console.log('MilestoneEditorModal.handleSave - form found');

        // Clear previous errors
        this.clearAllErrors();

        // Collect form data
        const formData = this.collectFormData(form);
        console.log('MilestoneEditorModal.handleSave - formData:', formData);

        // Validate
        const validation = this.validateMilestone(formData);
        console.log('MilestoneEditorModal.handleSave - validation:', validation);

        if (!validation.valid) {
            console.log('MilestoneEditorModal.handleSave - validation failed');
            this.showValidationErrors(validation.errors);
            return;
        }

        // Prepare milestone data
        const milestoneData = this.prepareMilestoneData(formData);
        console.log('MilestoneEditorModal.handleSave - milestoneData:', milestoneData);

        try {
            let result;
            console.log('MilestoneEditorModal.handleSave - mode:', this.currentMode);

            if (this.currentMode === 'create') {
                console.log('MilestoneEditorModal.handleSave - calling createMilestone');
                result = await apiClient.createMilestone(this.changeId, milestoneData);
            } else {
                console.log('MilestoneEditorModal.handleSave - calling updateMilestone');
                result = await apiClient.updateMilestone(
                    this.changeId,
                    this.currentMilestone.id,
                    milestoneData
                );
            }

            console.log('MilestoneEditorModal.handleSave - API result:', result);

            // Close our independent modal
            this.closeMilestoneModal();

            // Refresh milestone list in parent form
            if (this.parentForm.refreshMilestones) {
                console.log('MilestoneEditorModal.handleSave - refreshing milestone list');
                await this.parentForm.refreshMilestones();
            }

            console.log('MilestoneEditorModal.handleSave - save completed successfully');

        } catch (error) {
            console.error('MilestoneEditorModal.handleSave - API error:', error);
            this.showFormError(error.message || 'Failed to save milestone. Please try again.');
        }
    }

    collectFormData(form) {
        console.log('MilestoneEditorModal.collectFormData - called');
        console.log('MilestoneEditorModal.collectFormData - form element:', form);
        console.log('MilestoneEditorModal.collectFormData - form HTML:', form ? form.innerHTML.substring(0, 500) + '...' : 'no form');

        // Get form values directly by field names/IDs
        const titleInput = form.querySelector('#milestone-title') || form.querySelector('input[name="title"]');
        const descriptionInput = form.querySelector('#milestone-description') || form.querySelector('textarea[name="description"]');
        const waveInput = form.querySelector('#milestone-wave') || form.querySelector('select[name="waveId"]');

        console.log('MilestoneEditorModal.collectFormData - titleInput found:', !!titleInput);
        console.log('MilestoneEditorModal.collectFormData - titleInput element:', titleInput);
        console.log('MilestoneEditorModal.collectFormData - descriptionInput found:', !!descriptionInput);
        console.log('MilestoneEditorModal.collectFormData - waveInput found:', !!waveInput);

        // Debug: check all inputs in the form
        const allInputs = form.querySelectorAll('input, textarea, select');
        console.log('MilestoneEditorModal.collectFormData - all inputs in form:', allInputs.length);
        allInputs.forEach((input, index) => {
            console.log(`Input ${index}:`, {
                tagName: input.tagName,
                type: input.type,
                id: input.id,
                name: input.name,
                value: input.value
            });
        });

        const data = {
            title: titleInput ? titleInput.value.trim() : '',
            description: descriptionInput ? descriptionInput.value.trim() : '',
            waveId: waveInput ? waveInput.value || null : null,
            eventTypes: this.selectedEventTypes
        };

        console.log('MilestoneEditorModal.collectFormData - collected data:', data);
        console.log('MilestoneEditorModal.collectFormData - title value:', titleInput?.value);
        console.log('MilestoneEditorModal.collectFormData - description value:', descriptionInput?.value);
        console.log('MilestoneEditorModal.collectFormData - wave value:', waveInput?.value);

        return data;
    }

    validateMilestone(data) {
        const errors = [];

        // Title is required (minimum 1 character)
        if (!data.title || data.title.trim().length === 0) {
            errors.push({
                field: 'title',
                message: 'Title is required'
            });
        }

        // Description can be empty (no validation needed)
        // Event types are optional (no validation needed)

        return {
            valid: errors.length === 0,
            errors
        };
    }

    prepareMilestoneData(formData) {
        const data = {
            title: formData.title,
            description: formData.description,
            eventTypes: formData.eventTypes,
            waveId: formData.waveId ? parseInt(formData.waveId, 10) : null
        };

        // Add expected version ID for updates (optimistic locking)
        if (this.currentMode === 'edit') {
            // Get current OC version from parent form
            const currentItem = this.parentForm.currentItem;
            if (currentItem?.versionId) {
                data.expectedVersionId = currentItem.versionId;
            }
        } else {
            // For creates, also need expected version ID
            const currentItem = this.parentForm.currentItem;
            if (currentItem?.versionId) {
                data.expectedVersionId = currentItem.versionId;
            }
        }

        return data;
    }

    // ====================
    // VALIDATION & ERROR HANDLING
    // ====================

    showValidationErrors(errors) {
        errors.forEach(error => {
            if (error.field) {
                this.showFieldError(error.field, error.message);
            } else {
                this.showFormError(error.message);
            }
        });
    }

    showFieldError(fieldKey, message) {
        const formGroup = document.querySelector(`[data-field="${fieldKey}"]`);
        if (!formGroup) return;

        formGroup.classList.add('has-error');
        const messageEl = formGroup.querySelector('.validation-message');
        if (messageEl) {
            messageEl.textContent = message;
            messageEl.style.display = 'block';
        }
    }

    clearFieldError(input) {
        const formGroup = input.closest('.form-group');
        if (!formGroup) return;

        formGroup.classList.remove('has-error');
        const messageEl = formGroup.querySelector('.validation-message');
        if (messageEl) {
            messageEl.textContent = '';
            messageEl.style.display = 'none';
        }
    }

    clearAllErrors() {
        const formGroups = document.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.classList.remove('has-error');
            const messageEl = group.querySelector('.validation-message');
            if (messageEl) {
                messageEl.textContent = '';
                messageEl.style.display = 'none';
            }
        });

        // Clear form-level error
        const formError = document.querySelector('.form-error');
        if (formError) {
            formError.remove();
        }
    }

    showFormError(message) {
        const form = document.getElementById('milestone-form');
        if (!form) return;

        // Remove existing error
        const existingError = form.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }

        // Add new error
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error';
        errorDiv.innerHTML = `
            <div class="alert alert-error">
                <strong>Error:</strong> ${this.escapeHtml(message)}
            </div>
        `;
        form.insertBefore(errorDiv, form.firstChild);
    }

    handleCancel() {
        console.log('MilestoneEditorModal.handleCancel - called');
        this.closeMilestoneModal();
    }

    closeMilestoneModal() {
        console.log('MilestoneEditorModal.closeMilestoneModal - called');
        if (this.milestoneModal) {
            console.log('MilestoneEditorModal.closeMilestoneModal - removing modal');
            document.body.removeChild(this.milestoneModal);
            this.milestoneModal = null;
            console.log('MilestoneEditorModal.closeMilestoneModal - modal removed');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}