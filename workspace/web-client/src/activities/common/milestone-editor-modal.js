import { apiClient } from '../../shared/api-client.js';

/**
 * MilestoneEditorModal - Pure utility class for milestone form generation and API operations
 * NO LONGER MANAGES MODALS - that's handled by ChangeForm using the modal stack
 * This class only provides form content generation and data operations
 *
 * Updated to support milestone UUID-based keys (milestoneKey) and enhanced API responses
 */
export class MilestoneEditorModal {
    constructor(changeId, setupData, parentForm) {
        this.changeId = changeId;
        this.setupData = setupData;
        this.parentForm = parentForm; // Reference to parent ChangeForm

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
    // FORM CONTENT GENERATION ONLY
    // ====================

    generateFormContent(mode, milestone = null) {
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
    // DATA COLLECTION AND VALIDATION UTILITIES
    // ====================

    collectFormData(form) {
        console.log('MilestoneEditorModal.collectFormData - called');

        // Get form values directly by field names/IDs
        const titleInput = form.querySelector('#milestone-title') || form.querySelector('input[name="title"]');
        const descriptionInput = form.querySelector('#milestone-description') || form.querySelector('textarea[name="description"]');
        const waveInput = form.querySelector('#milestone-wave') || form.querySelector('select[name="waveId"]');

        // Get selected event types from tag selector
        const eventTypesSelector = form.querySelector('#event-types-selector');
        const selectedEventTypes = eventTypesSelector ?
            JSON.parse(eventTypesSelector.dataset.selected || '[]') : [];

        // Also check for any changes made during this session (live tags)
        const tags = form.querySelectorAll('.tag[data-event-type]');
        const currentEventTypes = Array.from(tags).map(tag => tag.dataset.eventType);

        const data = {
            title: titleInput ? titleInput.value.trim() : '',
            description: descriptionInput ? descriptionInput.value.trim() : '',
            waveId: waveInput && waveInput.value ? waveInput.value : null,
            eventTypes: currentEventTypes.length > 0 ? currentEventTypes : selectedEventTypes
        };

        console.log('MilestoneEditorModal.collectFormData - collected data:', data);
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
            eventTypes: formData.eventTypes || [],
            waveId: formData.waveId ? parseInt(formData.waveId, 10) : null
        };

        // Add expected version ID for updates (optimistic locking)
        // Get current OC version from parent form
        const currentItem = this.parentForm?.currentItem;
        if (currentItem?.versionId) {
            data.expectedVersionId = currentItem.versionId;
        }

        return data;
    }

    // ====================
    // API OPERATIONS (updated for UUID-based keys and enhanced responses)
    // ====================

    async createMilestone(milestoneData) {
        console.log('MilestoneEditorModal.createMilestone - called with data:', milestoneData);

        try {
            const result = await apiClient.createMilestone(this.changeId, milestoneData);
            console.log('MilestoneEditorModal.createMilestone - API result:', result);

            // API now returns both milestone and operationalChange info
            if (result && result.operationalChange) {
                console.log('MilestoneEditorModal.createMilestone - updating parent form version info:', {
                    versionId: result.operationalChange.versionId,
                    version: result.operationalChange.version
                });

                // Update parent form's current item with new version info
                if (this.parentForm && this.parentForm.currentItem) {
                    this.parentForm.currentItem.versionId = result.operationalChange.versionId;
                    this.parentForm.currentItem.version = result.operationalChange.version;
                }
            }

            return result;
        } catch (error) {
            console.error('MilestoneEditorModal.createMilestone - API error:', error);
            throw error;
        }
    }

    async updateMilestone(milestoneKey, milestoneData) {
        console.log('MilestoneEditorModal.updateMilestone - called with milestoneKey:', milestoneKey, 'data:', milestoneData);

        try {
            const result = await apiClient.updateMilestone(this.changeId, milestoneKey, milestoneData);
            console.log('MilestoneEditorModal.updateMilestone - API result:', result);

            // API now returns both milestone and operationalChange info
            if (result && result.operationalChange) {
                console.log('MilestoneEditorModal.updateMilestone - updating parent form version info:', {
                    versionId: result.operationalChange.versionId,
                    version: result.operationalChange.version
                });

                // Update parent form's current item with new version info
                if (this.parentForm && this.parentForm.currentItem) {
                    this.parentForm.currentItem.versionId = result.operationalChange.versionId;
                    this.parentForm.currentItem.version = result.operationalChange.version;
                }
            }

            return result;
        } catch (error) {
            console.error('MilestoneEditorModal.updateMilestone - API error:', error);
            throw error;
        }
    }

    async deleteMilestone(milestoneKey, expectedVersionId) {
        console.log('MilestoneEditorModal.deleteMilestone - called with milestoneKey:', milestoneKey);

        try {
            // Delete operation uses milestoneKey in URL path
            await apiClient.deleteMilestone(this.changeId, milestoneKey, expectedVersionId);
            console.log('MilestoneEditorModal.deleteMilestone - completed successfully');

            // Note: Delete operation returns 204 No Content, so no version info to update
            // The parent form will need to refresh the operational change to get updated version

        } catch (error) {
            console.error('MilestoneEditorModal.deleteMilestone - API error:', error);
            throw error;
        }
    }

    async getMilestones() {
        console.log('MilestoneEditorModal.getMilestones - called');

        try {
            const result = await apiClient.getMilestones(this.changeId);
            console.log('MilestoneEditorModal.getMilestones - API result:', result);
            return result;
        } catch (error) {
            console.error('MilestoneEditorModal.getMilestones - API error:', error);
            throw error;
        }
    }

    // ====================
    // MILESTONE KEY UTILITIES (new)
    // ====================

    /**
     * Extract milestone key from milestone object, with fallback for backwards compatibility
     */
    getMilestoneKey(milestone) {
        if (!milestone) return null;

        // Prefer milestoneKey, fall back to id for backwards compatibility
        return milestone.milestoneKey || milestone.id;
    }

    /**
     * Check if milestone has stable UUID-based key
     */
    hasStableMilestoneKey(milestone) {
        return milestone && milestone.milestoneKey && milestone.milestoneKey.startsWith('ms_');
    }

    /**
     * Find milestone in array by key (milestoneKey or id)
     */
    findMilestoneByKey(milestones, key) {
        if (!milestones || !Array.isArray(milestones) || !key) {
            return null;
        }

        return milestones.find(m =>
            (m.milestoneKey && m.milestoneKey === key) ||
            (m.id && m.id.toString() === key.toString())
        );
    }

    // ====================
    // EVENT TYPE MANAGEMENT UTILITIES
    // ====================

    addEventTypeToSelector(eventType, selectorElement) {
        if (!selectorElement) return false;

        const currentTypes = JSON.parse(selectorElement.dataset.selected || '[]');
        if (!currentTypes.includes(eventType)) {
            currentTypes.push(eventType);
            selectorElement.dataset.selected = JSON.stringify(currentTypes);
            this.refreshEventTypeDisplay(selectorElement);
            return true;
        }
        return false;
    }

    removeEventTypeFromSelector(eventType, selectorElement) {
        if (!selectorElement) return false;

        const currentTypes = JSON.parse(selectorElement.dataset.selected || '[]');
        const filteredTypes = currentTypes.filter(type => type !== eventType);
        selectorElement.dataset.selected = JSON.stringify(filteredTypes);
        this.refreshEventTypeDisplay(selectorElement);
        return true;
    }

    refreshEventTypeDisplay(selectorElement) {
        if (!selectorElement) return;

        const currentTypes = JSON.parse(selectorElement.dataset.selected || '[]');

        const selectedContainer = selectorElement.querySelector('#selected-event-types');
        const dropdown = selectorElement.querySelector('#event-type-dropdown');

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
    // CONVENIENCE METHODS FOR PARENT FORM
    // ====================

    getFormTitle(mode) {
        switch (mode) {
            case 'create':
                return 'Create Milestone';
            case 'edit':
                return 'Edit Milestone';
            default:
                return 'Milestone';
        }
    }

    getFormMode(mode) {
        // Convert from parent form modes to milestone-specific modes
        switch (mode) {
            case 'create':
            case 'create-milestone':
                return 'create';
            case 'edit':
            case 'edit-milestone':
                return 'edit';
            default:
                return mode;
        }
    }

    // ====================
    // VERSION TRACKING HELPERS (new)
    // ====================

    /**
     * Extract version info from API response
     */
    extractVersionInfo(apiResponse) {
        if (!apiResponse || !apiResponse.operationalChange) {
            return null;
        }

        return {
            versionId: apiResponse.operationalChange.versionId,
            version: apiResponse.operationalChange.version,
            itemId: apiResponse.operationalChange.itemId
        };
    }

    /**
     * Update parent form with new version information
     */
    updateParentFormVersion(versionInfo) {
        if (!this.parentForm || !this.parentForm.currentItem || !versionInfo) {
            return false;
        }

        console.log('MilestoneEditorModal.updateParentFormVersion - updating with:', versionInfo);

        this.parentForm.currentItem.versionId = versionInfo.versionId;
        this.parentForm.currentItem.version = versionInfo.version;

        return true;
    }

    /**
     * Get current operational change version for optimistic locking
     */
    getCurrentVersion() {
        const currentItem = this.parentForm?.currentItem;

        return {
            versionId: currentItem?.versionId,
            version: currentItem?.version,
            itemId: currentItem?.itemId || currentItem?.id
        };
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

    // ====================
    // DEPRECATED METHODS - NO LONGER USED
    // These methods have been removed as they were part of the independent modal system:
    // - showModal()
    // - showCreateModal()
    // - showEditModal()
    // - attachEvents()
    // - handleSave()
    // - handleCancel()
    // - closeMilestoneModal()
    // - bindEventTypeSelector()
    //
    // Modal management is now handled entirely by ChangeForm using the CollectionEntityForm modal stack
    // ====================
}