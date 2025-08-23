import { CollectionEntityForm } from '../../components/odp/collection-entity-form.js';
import { apiClient } from '../../shared/api-client.js';
import { MilestoneEditorModal } from './milestone-editor-modal.js';

/**
 * ChangeForm - Operational Change form configuration and handling
 * Extends CollectionEntityForm using inheritance pattern
 * Matches the API schema exactly for OperationalChangeRequest
 */
export default class ChangeForm extends CollectionEntityForm {
    constructor(entityConfig, setupData) {
        // Call parent constructor with appropriate context
        super(entityConfig, { setupData });

        // DEBUG: Check if MilestoneEditorModal imported correctly
        console.log('ChangeForm constructor - MilestoneEditorModal available:', typeof MilestoneEditorModal);

        this.setupData = setupData;

        // Cache for requirements
        this.requirementsCache = null;
        this.requirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache

        // Milestone management
        this.milestones = [];
        this.milestoneEditor = null;
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
                this.initializeMilestoneEditor();
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
        console.log('ChangeForm.renderMilestonesTable - called');
        console.log('ChangeForm.renderMilestonesTable - currentMode:', this.currentMode);
        console.log('ChangeForm.renderMilestonesTable - currentItem:', this.currentItem);

        const isReadMode = this.currentMode === 'read';
        const itemId = this.currentItem?.itemId || this.currentItem?.id;

        console.log('ChangeForm.renderMilestonesTable - isReadMode:', isReadMode, 'itemId:', itemId);

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
            console.log('ChangeForm.renderMilestonesTable - Add button will be rendered');
        } else if (!isReadMode && !itemId) {
            html += `
                <div class="milestones-header">
                    <span class="milestones-label">Milestones:</span>
                    <small class="form-text text-muted">Save the change first to manage milestones</small>
                </div>
            `;
            console.log('ChangeForm.renderMilestonesTable - Save first message will be rendered');
        } else {
            html += `<div class="milestones-header"><span class="milestones-label">Milestones:</span></div>`;
            console.log('ChangeForm.renderMilestonesTable - Read-only header will be rendered');
        }

        // Milestone table
        html += this.renderMilestoneTable(isReadMode, !!itemId);

        html += `</div>`;

        // Note: Event binding moved to showEditModal to ensure DOM is ready
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
    // MILESTONE EVENT HANDLING
    // ====================

    bindMilestoneEvents() {
        console.log('ChangeForm.bindMilestoneEvents - called');

        // Initialize milestone editor if not already done
        this.initializeMilestoneEditor();

        // Debug: Check what's in the DOM
        const milestonesSection = document.querySelector('.milestones-section');
        console.log('ChangeForm.bindMilestoneEvents - milestonesSection found:', !!milestonesSection);

        if (milestonesSection) {
            console.log('ChangeForm.bindMilestoneEvents - milestonesSection HTML:', milestonesSection.innerHTML);
        }

        // Add milestone button
        const addBtn = document.getElementById('add-milestone-btn');
        console.log('ChangeForm.bindMilestoneEvents - addBtn found:', !!addBtn);

        // Try alternative selector
        const addBtnAlt = document.querySelector('.milestones-section button');
        console.log('ChangeForm.bindMilestoneEvents - addBtnAlt found:', !!addBtnAlt);

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                console.log('Add milestone button clicked');
                this.handleAddMilestone();
            });
        } else if (addBtnAlt) {
            console.log('ChangeForm.bindMilestoneEvents - Using alternative button selector');
            addBtnAlt.addEventListener('click', () => {
                console.log('Add milestone button clicked (alt)');
                this.handleAddMilestone();
            });
        }

        // Edit/Delete milestone buttons
        const tbody = document.getElementById('milestones-tbody');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const milestoneId = e.target.dataset.milestoneId;
                if (!milestoneId) return;

                if (e.target.classList.contains('edit-milestone')) {
                    this.handleEditMilestone(milestoneId);
                } else if (e.target.classList.contains('delete-milestone')) {
                    this.handleDeleteMilestone(milestoneId);
                }
            });
        }
    }

    initializeMilestoneEditor() {
        console.log('ChangeForm.initializeMilestoneEditor - called');
        console.log('ChangeForm.initializeMilestoneEditor - currentItem:', this.currentItem);

        if (!this.milestoneEditor && this.currentItem) {
            const changeId = this.currentItem.itemId || this.currentItem.id;
            console.log('ChangeForm.initializeMilestoneEditor - creating editor with changeId:', changeId);
            this.milestoneEditor = new MilestoneEditorModal(changeId, this.setupData, this);
            console.log('ChangeForm.initializeMilestoneEditor - editor created:', !!this.milestoneEditor);
        }
    }

    async handleAddMilestone() {
        console.log('ChangeForm.handleAddMilestone - called');
        console.log('ChangeForm.handleAddMilestone - milestoneEditor:', !!this.milestoneEditor);

        if (this.milestoneEditor) {
            console.log('ChangeForm.handleAddMilestone - calling showCreateModal');
            await this.milestoneEditor.showCreateModal();
        } else {
            console.error('ChangeForm.handleAddMilestone - no milestone editor available');
        }
    }

    async handleEditMilestone(milestoneId) {
        const milestone = this.milestones.find(m => m.id.toString() === milestoneId.toString());
        if (milestone && this.milestoneEditor) {
            await this.milestoneEditor.showEditModal(milestone);
        }
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
    // MILESTONE REFRESH (Called by MilestoneEditorModal)
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
            this.bindMilestoneEvents();
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

        // IMPORTANT: Bind milestone events AFTER modal is fully rendered
        setTimeout(() => {
            console.log('ChangeForm.showEditModal - Binding events after modal render');
            this.bindMilestoneEvents();
        }, 100); // Slightly longer delay to ensure DOM is ready
    }

    async showReadOnlyModal(item) {
        await super.showReadOnlyModal(item);

        // Load milestones for read-only view
        if (item && (item.itemId || item.id)) {
            await this.refreshMilestones();
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