import CollectionEntityForm from '../../components/odp/collection-entity-forms.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * ChangeForm - Operational Change form configuration and handling
 * Matches the API schema exactly for OperationalChangeRequest
 */
export default class ChangeForm {
    constructor(entityConfig, setupData) {
        this.entityConfig = entityConfig;
        this.setupData = setupData;

        // Cache for requirements
        this.requirementsCache = null;
        this.requirementsCacheTime = 0;
        this.cacheTimeout = 60000; // 1 minute cache

        // Initialize the base form
        this.form = new CollectionEntityForm({
            endpoint: entityConfig.endpoint,
            context: { setupData },

            getFieldDefinitions: () => this.getFieldDefinitions(),
            getFormTitle: (mode) => this.getFormTitle(mode),
            transformDataForSave: (data, mode, item) => this.transformDataForSave(data, mode, item),
            transformDataForEdit: (item) => this.transformDataForEdit(item),
            onSave: (data, mode, item) => this.saveChange(data, mode, item),
            onValidate: (data, mode, item) => this.validateChange(data, mode, item)
        });
    }

    // ====================
    // FIELD DEFINITIONS
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
                        required: true,
                        render: (field, fieldId, value, required) => this.renderMilestonesField(field, fieldId, value, required),
                        format: (value) => this.formatMilestones(value),
                        helpText: 'Define at least one milestone with its target wave'
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
                        required: true,
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
                        required: true,
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

    // ====================
    // CUSTOM FIELD RENDERING
    // ====================

    renderMilestonesField(field, fieldId, value, required) {
        // For read mode, just format the milestones
        if (field.modes.includes('read') && !field.modes.includes('edit')) {
            return `<div class="milestones-display">${this.formatMilestones(value)}</div>`;
        }

        // For edit/create mode, render milestone editor
        const milestones = value || [];

        let html = `
            <div class="milestones-editor" id="${fieldId}">
                <div class="milestones-list">
        `;

        if (milestones.length === 0) {
            // Start with one empty milestone for new changes
            html += this.renderMilestoneRow({}, 0);
        } else {
            milestones.forEach((milestone, index) => {
                html += this.renderMilestoneRow(milestone, index);
            });
        }

        html += `
                </div>
                <button type="button" class="btn btn-secondary btn-sm add-milestone-btn" data-field="${fieldId}">
                    + Add Milestone
                </button>
            </div>
        `;

        // Note: Event binding would need to be handled after rendering
        setTimeout(() => this.bindMilestoneEvents(fieldId), 0);

        return html;
    }

    renderMilestoneRow(milestone, index) {
        const waves = this.getWaveOptions();

        return `
            <div class="milestone-row" data-index="${index}">
                <div class="milestone-fields">
                    <input type="text" 
                        name="milestones[${index}].title" 
                        placeholder="Milestone title"
                        value="${this.escapeHtml(milestone.title || '')}"
                        class="form-control milestone-title"
                        required>
                    
                    <textarea 
                        name="milestones[${index}].description" 
                        placeholder="Milestone description"
                        class="form-control milestone-description"
                        rows="2"
                        required>${this.escapeHtml(milestone.description || '')}</textarea>
                    
                    <select name="milestones[${index}].waveId" 
                        class="form-control milestone-wave"
                        required>
                        <option value="">Select wave...</option>
                        ${waves.map(wave => `
                            <option value="${wave.value}" ${milestone.waveId === wave.value ? 'selected' : ''}>
                                ${this.escapeHtml(wave.label)}
                            </option>
                        `).join('')}
                    </select>
                    
                    <input type="text" 
                        name="milestones[${index}].eventTypes" 
                        placeholder="Event types (comma-separated)"
                        value="${this.escapeHtml(milestone.eventTypes ? milestone.eventTypes.join(', ') : '')}"
                        class="form-control milestone-event-types"
                        required>
                    <small class="form-text">e.g., API_PUBLICATION, API_TEST_DEPLOYMENT, UI_TEST_DEPLOYMENT, SERVICE_ACTIVATION</small>
                    
                    <button type="button" class="btn btn-danger btn-sm remove-milestone-btn" data-index="${index}">
                        Remove Milestone
                    </button>
                </div>
            </div>
        `;
    }

    bindMilestoneEvents(fieldId) {
        const container = document.getElementById(fieldId);
        if (!container) return;

        // Add milestone button
        const addBtn = container.querySelector('.add-milestone-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const list = container.querySelector('.milestones-list');
                const newIndex = list.children.length;
                const newRow = document.createElement('div');
                newRow.innerHTML = this.renderMilestoneRow({}, newIndex);
                list.appendChild(newRow.firstElementChild);
            });
        }

        // Remove milestone buttons
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-milestone-btn')) {
                const row = e.target.closest('.milestone-row');
                row.remove();
                // Re-index remaining milestones
                this.reindexMilestones(container);
            }
        });
    }

    reindexMilestones(container) {
        const rows = container.querySelectorAll('.milestone-row');
        rows.forEach((row, index) => {
            row.dataset.index = index;
            // Update all input names
            row.querySelectorAll('[name^="milestones["]').forEach(input => {
                input.name = input.name.replace(/milestones\[\d+\]/, `milestones[${index}]`);
            });
        });
    }

    formatMilestones(milestones) {
        if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
            return 'No milestones defined';
        }

        return milestones.map(m => {
            const wave = this.getWaveDisplay(m.waveId || m.wave);
            const eventTypes = m.eventTypes ? `(${m.eventTypes.join(', ')})` : '';
            return `<strong>${m.title}:</strong> ${m.description}<br>Wave: ${wave} ${eventTypes}`;
        }).join('<br><br>');
    }

    // ====================
    // DATA OPTIONS
    // ====================

    getWaveOptions() {
        if (!this.setupData?.waves) {
            return [];
        }

        return this.setupData.waves.map(wave => ({
            value: parseInt(wave.id, 10),  // Convert to number
            label: `${wave.year} Q${wave.quarter}`
        }));
    }

    getWaveDisplay(waveId) {
        if (!waveId) return 'Not assigned';

        const wave = this.setupData?.waves?.find(w => w.id === waveId);
        if (wave) {
            return `${wave.year} Q${wave.quarter}`;
        }
        return waveId;
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
    // DATA TRANSFORMATION
    // ====================

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Process milestones from form inputs
        if (transformed.milestones) {
            // Parse milestone data from form
            const milestoneData = this.parseMilestoneFormData(transformed);

            // Transform to API format
            transformed.milestones = milestoneData.map(m => ({
                title: m.title || '',
                description: m.description || '',
                waveId: m.waveId || null,
                eventTypes: m.eventTypes ? m.eventTypes.split(',').map(e => e.trim()).filter(e => e) : []
            }));

            // Remove empty milestones
            transformed.milestones = transformed.milestones.filter(m =>
                m.title && m.description && m.waveId
            );
        } else {
            // Ensure milestones array exists
            transformed.milestones = [];
        }

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

    parseMilestoneFormData(formData) {
        const milestones = [];
        const milestoneIndices = new Set();

        // Find all milestone indices
        Object.keys(formData).forEach(key => {
            const match = key.match(/milestones\[(\d+)\]/);
            if (match) {
                milestoneIndices.add(parseInt(match[1]));
            }
        });

        // Build milestone objects
        milestoneIndices.forEach(index => {
            const milestone = {
                title: formData[`milestones[${index}].title`],
                description: formData[`milestones[${index}].description`],
                waveId: formData[`milestones[${index}].waveId`],
                eventTypes: formData[`milestones[${index}].eventTypes`]
            };
            milestones.push(milestone);
        });

        return milestones;
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
                    return typeof ref === 'string' && /^\d+$/.test(ref) ? parseInt(ref, 10) : ref;                });
            }
        });

        // Process milestones
        if (transformed.milestones && Array.isArray(transformed.milestones)) {
            transformed.milestones = transformed.milestones.map(m => ({
                title: m.title || '',
                description: m.description || '',
                waveId: m.waveId || m.wave?.id ? parseInt(m.waveId || m.wave?.id, 10) : null,
                eventTypes: Array.isArray(m.eventTypes) ? m.eventTypes : []
            }));
        }

        return transformed;
    }

    // ====================
    // VALIDATION
    // ====================

    async validateChange(data, mode, item) {
        const errors = [];

        // Validate milestones
        if (!data.milestones || !Array.isArray(data.milestones) || data.milestones.length === 0) {
            errors.push({
                field: 'milestones',
                message: 'At least one milestone must be defined'
            });
        } else {
            data.milestones.forEach((milestone, index) => {
                if (!milestone.title || !milestone.title.trim()) {
                    errors.push({
                        field: `milestones[${index}].title`,
                        message: `Milestone ${index + 1} must have a title`
                    });
                }
                if (!milestone.description || !milestone.description.trim()) {
                    errors.push({
                        field: `milestones[${index}].description`,
                        message: `Milestone ${index + 1} must have a description`
                    });
                }
                if (!milestone.waveId) {
                    errors.push({
                        field: `milestones[${index}].waveId`,
                        message: `Milestone ${index + 1} must have a target wave`
                    });
                }
                if (!milestone.eventTypes || milestone.eventTypes.length === 0) {
                    errors.push({
                        field: `milestones[${index}].eventTypes`,
                        message: `Milestone ${index + 1} must have at least one event type`
                    });
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // ====================
    // SAVE OPERATION
    // ====================

    async saveChange(data, mode, item) {
        // Clear cache when saving
        this.requirementsCache = null;

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

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text.toString();
        return div.innerHTML;
    }

    // ====================
    // PUBLIC API
    // ====================

    async showCreateModal() {
        await this.form.showCreateModal();
    }

    async showEditModal(item) {
        await this.form.showEditModal(item);
    }

    async showReadOnlyModal(item) {
        await this.form.showReadOnlyModal(item);
    }

    async generateReadOnlyView(item) {
        return await this.form.generateForm('read', item);
    }
}