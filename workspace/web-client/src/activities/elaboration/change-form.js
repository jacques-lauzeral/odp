import CollectionEntityForm from '../../components/odp/collection-entity-forms.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * ChangeForm - Operational Change form configuration and handling
 * Encapsulates all form-related logic for changes
 */
export default class ChangeForm {
    constructor(entityConfig, setupData) {
        this.entityConfig = entityConfig;
        this.setupData = setupData;

        // Cache for requirements and changes
        this.requirementsCache = null;
        this.requirementsCacheTime = 0;
        this.changesCache = null;
        this.changesCacheTime = 0;
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
                        key: 'implementationNotes',
                        label: 'Implementation Notes',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        rows: 4,
                        placeholder: 'Technical notes, considerations, or implementation guidance...',
                        helpText: 'Additional technical details for implementation teams'
                    },
                    {
                        key: 'visibility',
                        label: 'Visibility',
                        type: 'radio',
                        modes: ['create', 'read', 'edit'],
                        options: [
                            { value: 'public', label: 'Public - Visible to all stakeholders' },
                            { value: 'internal', label: 'Internal - NM internal use only' },
                            { value: 'restricted', label: 'Restricted - Limited access' }
                        ],
                        defaultValue: 'public',
                        helpTextAbove: 'Control who can see this change'
                    }
                ]
            },

            // Planning Section
            {
                title: 'Planning & Milestones',
                fields: [
                    {
                        key: 'milestones',
                        label: 'Milestones',
                        type: 'custom',
                        modes: ['create', 'read', 'edit'],
                        render: (field, fieldId, value, required) => this.renderMilestonesField(field, fieldId, value, required),
                        format: (value) => this.formatMilestones(value),
                        helpText: 'Define key milestones and their target waves'
                    },
                    {
                        key: 'impactLevel',
                        label: 'Impact Level',
                        type: 'select',
                        modes: ['create', 'read', 'edit'],
                        options: [
                            { value: '', label: 'Not Specified' },
                            { value: 'low', label: 'Low - Minor impact' },
                            { value: 'medium', label: 'Medium - Moderate impact' },
                            { value: 'high', label: 'High - Significant impact' },
                            { value: 'critical', label: 'Critical - Major system change' }
                        ],
                        helpText: 'Assess the overall impact of this change'
                    },
                    {
                        key: 'priority',
                        label: 'Priority',
                        type: 'select',
                        modes: ['create', 'read', 'edit'],
                        options: [
                            { value: '', label: 'Not Set' },
                            { value: 'low', label: 'Low' },
                            { value: 'medium', label: 'Medium' },
                            { value: 'high', label: 'High' },
                            { value: 'urgent', label: 'Urgent' }
                        ]
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
                        size: 5,
                        options: async () => await this.getRequirementOptions(),
                        helpText: 'Select requirements that this change satisfies or implements',
                        format: (value) => this.formatEntityReferences(value, 'requirement')
                    },
                    {
                        key: 'supersedsRequirements',
                        label: 'Supersedes Requirements',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 3,
                        options: async () => await this.getRequirementOptions(),
                        helpText: 'Select requirements that this change supersedes or replaces',
                        format: (value) => this.formatEntityReferences(value, 'requirement')
                    },
                    {
                        key: 'relatedChanges',
                        label: 'Related Changes',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 3,
                        options: async () => await this.getChangeOptions(),
                        helpText: 'Select other changes that are related to this one',
                        format: (value) => this.formatEntityReferences(value, 'change')
                    },
                    {
                        key: 'dependencies',
                        label: 'Dependencies',
                        type: 'multiselect',
                        modes: ['create', 'read', 'edit'],
                        size: 3,
                        options: async () => await this.getChangeOptions(),
                        helpText: 'Select changes that must be completed before this one',
                        format: (value) => this.formatEntityReferences(value, 'change')
                    }
                ]
            },

            // Status Section
            {
                title: 'Status & Progress',
                fields: [
                    {
                        key: 'status',
                        label: 'Status',
                        type: 'select',
                        modes: ['create', 'read', 'edit'],
                        options: [
                            { value: 'draft', label: 'Draft - Under development' },
                            { value: 'review', label: 'Review - Awaiting approval' },
                            { value: 'approved', label: 'Approved - Ready for implementation' },
                            { value: 'in_progress', label: 'In Progress - Being implemented' },
                            { value: 'completed', label: 'Completed - Fully implemented' },
                            { value: 'cancelled', label: 'Cancelled - Will not be implemented' }
                        ],
                        defaultValue: 'draft'
                    },
                    {
                        key: 'completionPercentage',
                        label: 'Completion (%)',
                        type: 'number',
                        modes: ['create', 'read', 'edit'],
                        min: 0,
                        max: 100,
                        placeholder: '0-100',
                        helpText: 'Estimated completion percentage'
                    },
                    {
                        key: 'notes',
                        label: 'Status Notes',
                        type: 'textarea',
                        modes: ['create', 'read', 'edit'],
                        rows: 3,
                        placeholder: 'Additional notes about current status...'
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

        milestones.forEach((milestone, index) => {
            html += this.renderMilestoneRow(milestone, index);
        });

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
                <input type="text" 
                    name="milestones[${index}].name" 
                    placeholder="Milestone name"
                    value="${this.escapeHtml(milestone.name || '')}"
                    class="form-control milestone-name">
                
                <select name="milestones[${index}].wave" 
                    class="form-control milestone-wave">
                    <option value="">Select wave...</option>
                    ${waves.map(wave => `
                        <option value="${wave.value}" ${milestone.waveId === wave.value ? 'selected' : ''}>
                            ${this.escapeHtml(wave.label)}
                        </option>
                    `).join('')}
                </select>
                
                <select name="milestones[${index}].status" 
                    class="form-control milestone-status">
                    <option value="planned" ${milestone.status === 'planned' ? 'selected' : ''}>Planned</option>
                    <option value="in_progress" ${milestone.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="completed" ${milestone.status === 'completed' ? 'selected' : ''}>Completed</option>
                    <option value="delayed" ${milestone.status === 'delayed' ? 'selected' : ''}>Delayed</option>
                </select>
                
                <button type="button" class="btn btn-danger btn-sm remove-milestone-btn" data-index="${index}">
                    Remove
                </button>
            </div>
        `;
    }

    bindMilestoneEvents(fieldId) {
        // This would be called to bind events for the milestone editor
        // In practice, this might need to be handled differently depending on the framework
        console.log('Milestone events would be bound here for field:', fieldId);
    }

    formatMilestones(milestones) {
        if (!milestones || !Array.isArray(milestones) || milestones.length === 0) {
            return 'No milestones defined';
        }

        return milestones.map(m => {
            const wave = this.getWaveDisplay(m.waveId || m.wave);
            const status = m.status ? `(${m.status})` : '';
            return `${m.name}: ${wave} ${status}`;
        }).join('<br>');
    }

    // ====================
    // DATA OPTIONS
    // ====================

    getWaveOptions() {
        if (!this.setupData?.waves) {
            return [];
        }

        return this.setupData.waves.map(wave => ({
            value: wave.id,
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
                value: req.itemId || req.id,
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

    async getChangeOptions() {
        try {
            // Use cache if available
            const now = Date.now();
            if (this.changesCache && (now - this.changesCacheTime) < this.cacheTimeout) {
                return this.changesCache;
            }

            // Load all changes
            const response = await apiClient.get(this.entityConfig.endpoint);
            const changes = Array.isArray(response) ? response : [];

            const options = changes.map(change => ({
                value: change.itemId || change.id,
                label: `${change.itemId}: ${change.title}`
            }));

            // Cache the results
            this.changesCache = options;
            this.changesCacheTime = now;

            return options;

        } catch (error) {
            console.error('Failed to load changes:', error);
            return [];
        }
    }

    // ====================
    // DATA TRANSFORMATION
    // ====================

    transformDataForSave(data, mode, item) {
        const transformed = { ...data };

        // Process milestones
        if (transformed.milestones) {
            // Clean up milestone data
            transformed.milestones = transformed.milestones
                .filter(m => m.name && m.name.trim()) // Remove empty milestones
                .map(m => ({
                    name: m.name,
                    waveId: m.wave || m.waveId,
                    status: m.status || 'planned'
                }));

            if (transformed.milestones.length === 0) {
                delete transformed.milestones;
            }
        }

        // Clean up empty arrays
        const arrayFields = [
            'satisfiesRequirements',
            'supersedsRequirements',
            'relatedChanges',
            'dependencies'
        ];

        arrayFields.forEach(key => {
            if (transformed[key] && Array.isArray(transformed[key])) {
                if (transformed[key].length === 0) {
                    delete transformed[key];
                }
            }
        });

        // Clean up empty strings
        Object.keys(transformed).forEach(key => {
            if (transformed[key] === '') {
                delete transformed[key];
            }
        });

        // Convert completion percentage to number
        if (transformed.completionPercentage !== undefined) {
            transformed.completionPercentage = parseInt(transformed.completionPercentage, 10);
            if (isNaN(transformed.completionPercentage)) {
                delete transformed.completionPercentage;
            }
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
            'supersedsRequirements',
            'relatedChanges',
            'dependencies'
        ];

        referenceFields.forEach(field => {
            if (transformed[field] && Array.isArray(transformed[field])) {
                transformed[field] = transformed[field].map(ref => {
                    if (typeof ref === 'object' && ref !== null) {
                        return ref.itemId || ref.id || ref;
                    }
                    return ref;
                });
            }
        });

        // Process milestones
        if (transformed.milestones && Array.isArray(transformed.milestones)) {
            transformed.milestones = transformed.milestones.map(m => ({
                name: m.name,
                waveId: m.waveId || m.wave?.id,
                status: m.status || 'planned'
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
        if (data.milestones && Array.isArray(data.milestones)) {
            data.milestones.forEach((milestone, index) => {
                if (!milestone.name || !milestone.name.trim()) {
                    errors.push({
                        field: `milestones[${index}]`,
                        message: `Milestone ${index + 1} must have a name`
                    });
                }
            });
        }

        // Validate status transitions
        if (mode === 'edit' && item) {
            if (item.status === 'completed' && data.status !== 'completed') {
                errors.push({
                    field: 'status',
                    message: 'Cannot change status from completed to another status'
                });
            }
        }

        // Validate completion percentage with status
        if (data.status === 'completed' && data.completionPercentage !== 100) {
            console.warn('Status is completed but completion percentage is not 100%');
        }

        // Check for circular dependencies
        if (data.dependencies && Array.isArray(data.dependencies)) {
            const currentId = item?.itemId || item?.id;
            if (currentId && data.dependencies.includes(currentId)) {
                errors.push({
                    field: 'dependencies',
                    message: 'A change cannot depend on itself'
                });
            }
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
        // Clear caches when saving
        this.requirementsCache = null;
        this.changesCache = null;

        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            if (!item) {
                throw new Error('No item provided for update');
            }
            const itemId = item.itemId || item.id;
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }

    // ====================
    // FORMAT HELPERS
    // ====================

    formatEntityReferences(values, type) {
        if (!values || !Array.isArray(values) || values.length === 0) {
            return '-';
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

    showCreateModal() {
        this.form.showCreateModal();
    }

    showEditModal(item) {
        this.form.showEditModal(item);
    }

    showReadOnlyModal(item) {
        this.form.showReadOnlyModal(item);
    }

    generateReadOnlyView(item) {
        return this.form.generateForm('read', item);
    }
}