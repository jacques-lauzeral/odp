import { async as asyncUtils } from '../../shared/utils.js';
import AnnotatedMultiselectManager from './annotated-multiselect-manager.js';
import ReferenceListManager from './reference-list-manager.js';

/**
 * CollectionEntityForm - Business-agnostic form rendering and modal management
 * Base class for entity-specific forms using inheritance
 *
 * Updated to support:
 * - annotated-multiselect field type for document references
 * - reference-list-manager for large multiselect lists (replaces native select multiple)
 */
export class CollectionEntityForm {
    constructor(entityConfig, context = {}) {
        this.entityConfig = entityConfig;
        this.endpoint = entityConfig?.endpoint;
        this.context = context;

        // Modal stack for nested modals
        this.modalStack = [];
        this.currentModal = null;
        this.currentMode = null;
        this.currentItem = null;

        // Tab state tracking
        this.currentTabIndex = 0; // Track the currently selected tab

        // Annotated multiselect managers storage
        this.annotatedMultiselectManagers = {};

        // NEW: Reference list managers storage
        this.referenceListManagers = {};

        // Quill rich text editors storage
        this.quillEditors = {};

        // Modified indicator flag — set when form data is changed or restored
        this._isDirty = false;

        // Initialize tab delegation once
        this.initTabDelegation();
    }

    initTabDelegation() {
        // Prevent multiple bindings
        if (CollectionEntityForm._tabDelegationInitialized) {
            return;
        }

        // Single event listener for all tab headers anywhere in the document.
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-header')) {
                const tabIndex = e.target.dataset.tab;
                const container = e.target.closest('.form-tabs, .item-details, .modal');
                if (container && tabIndex !== undefined) {
                    this.switchTabInContainer(container, tabIndex);
                    this.currentTabIndex = parseInt(tabIndex, 10);
                }
            }
        });

        CollectionEntityForm._tabDelegationInitialized = true;
    }

    switchTabInContainer(container, tabIndex) {
        // Update headers within this container
        container.querySelectorAll('.tab-header').forEach(header => {
            header.classList.toggle('active', header.dataset.tab === tabIndex);
        });

        // Update panels within this container
        container.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.tab === tabIndex);
        });
    }

    // ====================
    // VIRTUAL METHODS - Override in subclasses
    // ====================

    getFieldDefinitions() {
        // Override in subclasses to provide field definitions
        return [];
    }

    getFormTitle(mode) {
        // Override in subclasses for custom titles
        switch (mode) {
            case 'create':
                return 'Create Item';
            case 'edit':
                return 'Edit Item';
            case 'read':
                return 'Item Details';
            default:
                return 'Item';
        }
    }

    transformDataForSave(data, mode, item) {
        // Override in subclasses for custom data transformation
        return data;
    }

    transformDataForRead(item) {
        // Override in subclasses for custom data transformation
        return item || {};
    }

    transformDataForEdit(item) {
        // Override in subclasses for custom data transformation
        return item || {};
    }

    async onSave(data, mode, item) {
        // Override in subclasses for custom save logic
        throw new Error('onSave() must be implemented by subclass');
    }

    async onValidate(data, mode, item) {
        // Override in subclasses for custom validation
        return { valid: true };
    }

    onCancel() {
        // Override in subclasses for custom cancel logic
    }

    // ====================
    // PUBLIC API
    // ====================

    async showCreateModal() {
        this.currentMode = 'create';
        this.currentItem = null;
        const form = await this.generateForm('create', null);
        this.showModal(form, 'create');

        // Initialize managers after modal is shown
        this.initializeAnnotatedMultiselects();
        this.initializeReferenceListManagers();
        this.initializeQuillEditors();
    }

    async showEditModal(item) {
        console.log("CollectionEntityForm.showEditModal");
        if (!item) {
            console.warn('No item provided for editing');
            return;
        }

        this.currentMode = 'edit';
        this.currentItem = item;
        const transformedItem = this.transformDataForEdit(item);
        const form = await this.generateForm('edit', transformedItem);
        this.showModal(form, 'edit');

        // Initialize managers after modal is shown
        this.initializeAnnotatedMultiselects();
        this.initializeReferenceListManagers();
        this.initializeQuillEditors();
    }

    async showReadOnlyModal(item) {
        if (!item) {
            console.warn('No item provided for viewing');
            return;
        }

        this.currentMode = 'read';
        this.currentItem = item;
        const transformedItem = this.transformDataForRead(item);
        const form = await this.generateForm('read', transformedItem);
        this.showModal(form, 'read');

        // Initialize managers for read-only mode (if needed)
        this.initializeAnnotatedMultiselects();
        this.initializeReferenceListManagers();

        // Initialize read-only richtext fields with disabled Quill editors
        this.initializeRichtextReadOnly();
    }

    async generateReadOnlyView(item, preserveTabIndex = false) {
        const transformedItem = this.transformDataForRead(item);
        return await this.generateForm('read', transformedItem, preserveTabIndex);
    }

    // ====================
    // FORM GENERATION
    // ====================

    async generateForm(mode, item = null, preserveTabIndex = false) {
        const fields = this.getFieldDefinitions();
        const sections = this.groupFieldsIntoSections(fields);

        // NEW: Read from context first, then fall back to instance state
        const activeTabIndex = preserveTabIndex
            ? (this.context?.currentTabIndex ?? this.currentTabIndex)
            : 0;

        // Tab structure
        let html = `
        <div class="form-tabs">
            <div class="tab-headers">
    `;

        // Generate tab headers
        let visibleTabIndex = 0;
        sections.forEach((section, index) => {
            const visibleFields = this.getVisibleFields(section.fields || [section], mode);
            if (visibleFields.length === 0) return;

            const isActive = visibleTabIndex === activeTabIndex;
            html += `
            <button type="button" class="tab-header ${isActive ? 'active' : ''}" 
                    data-tab="${visibleTabIndex}">
                ${this.escapeHtml(section.title)}
            </button>
        `;
            visibleTabIndex++;
        });

        html += `</div><div class="tab-contents">`;

        // Generate tab content panels
        visibleTabIndex = 0;
        for (const section of sections) {
            const visibleFields = this.getVisibleFields(section.fields || [section], mode);
            if (visibleFields.length === 0) continue;

            const isActive = visibleTabIndex === activeTabIndex;
            html += `<div class="tab-panel ${isActive ? 'active' : ''}" data-tab="${visibleTabIndex}">`;

            for (const field of visibleFields) {
                console.log('generateForm ' + mode + '/' + section.title + '/' + field.key);
                html += await this.renderField(field, this.getFieldValue(item, field), mode);
            }

            html += `</div>`;
            visibleTabIndex++;
        }

        html += `</div></div>`;
        return html;
    }

    groupFieldsIntoSections(fields) {
        // Default: no sections. Subclasses can override for grouped fields
        return fields;
    }

    getVisibleFields(fields, mode) {
        return fields.filter(field => {
            if (!field.modes) return true;
            return field.modes.includes(mode);
        });
    }

    getFieldValue(item, field) {
        if (!item) return field.defaultValue || null;

        // Handle nested keys like 'impact.data'
        if (field.key.includes('.')) {
            const parts = field.key.split('.');
            let value = item;
            for (const part of parts) {
                value = value?.[part];
            }
            return value;
        }

        return item[field.key] ?? field.defaultValue ?? null;
    }

    // ====================
    // FIELD RENDERING
    // ====================

    async renderField(field, value, mode) {
        // Skip computed fields in create/edit modes
        if (field.computed && (mode === 'create' || mode === 'edit')) {
            return '';
        }

        // Handle conditional visibility
        if (field.visible && !field.visible(this.currentItem, mode)) {
            return '';
        }

        // Read-only mode
        if (mode === 'read') {
            return this.renderReadOnlyField(field, value);
        }

        // Create mode
        if (mode === 'create') {
            if (field.computed || field.readOnly) return '';
            return await this.renderEditableField(field, null);
        }

        // Edit mode
        if (mode === 'edit') {
            if (field.computed) return '';
            if (field.readOnly || field.editableOnlyOnCreate) {
                return this.renderReadOnlyField(field, value);
            }
            return await this.renderEditableField(field, value);
        }

        return '';
    }

    renderReadOnlyField(field, value) {
        // Special handling for history tab - always render the mount point
        if (field.type === 'history') {
            return '<div id="history-tab-container" class="history-tab-container"></div>';
        }

        // Special handling for annotated-multiselect
        if (field.type === 'annotated-multiselect') {
            return this.renderAnnotatedMultiselectReadOnly(field, value);
        }

        // Special handling for richtext
        if (field.type === 'richtext') {
            return this.renderRichtextReadOnly(field, value);
        }

        // Skip empty optional fields
        if (!field.required && !value) {
            return '';
        }

        const displayValue = this.formatFieldValue(field, value);

        return `
            <div class="detail-field">
                <label>${this.escapeHtml(field.label)}</label>
                <div class="detail-value">${displayValue}</div>
            </div>
        `;
    }

    async renderEditableField(field, value) {
        const fieldId = `field-${field.key.replace(/\./g, '-')}`;
        const required = field.required ? 'required' : '';

        let html = `<div class="form-group" data-field="${field.key}">`;

        // Label
        html += `<label for="${fieldId}">${this.escapeHtml(field.label)}`;
        if (field.required) html += ' <span class="required">*</span>';
        html += `</label>`;

        // Help text above field
        if (field.helpTextAbove) {
            html += `<small class="form-text">${this.escapeHtml(field.helpTextAbove)}</small>`;
        }

        // Render input based on type
        html += await this.renderInput(field, fieldId, value, required);

        // Help text below field
        if (field.helpText) {
            html += `<small class="form-text">${this.escapeHtml(field.helpText)}</small>`;
        }

        // Validation message placeholder
        html += `<div class="validation-message"></div>`;

        html += `</div>`;
        return html;
    }

    async renderInput(field, fieldId, value, required) {
        switch (field.type) {
            case 'text':
            case 'email':
            case 'url':
            case 'number':
                return `<input type="${field.type}" 
                    id="${fieldId}" 
                    name="${field.key}" 
                    class="form-control" 
                    value="${this.escapeHtml(value || '')}" 
                    ${required}
                    ${field.placeholder ? `placeholder="${this.escapeHtml(field.placeholder)}"` : ''}
                    ${field.min !== undefined ? `min="${field.min}"` : ''}
                    ${field.max !== undefined ? `max="${field.max}"` : ''}
                    ${field.pattern ? `pattern="${field.pattern}"` : ''}>`;

            case 'textarea':
                const rows = field.rows || 4;
                return `<textarea 
                    id="${fieldId}" 
                    name="${field.key}" 
                    class="form-control" 
                    rows="${rows}" 
                    ${required}
                    ${field.placeholder ? `placeholder="${this.escapeHtml(field.placeholder)}"` : ''}
                    ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}>${this.escapeHtml(value || '')}</textarea>`;

            case 'richtext':
                // Render container for Quill editor and hidden input for form data
                const editorRows = field.rows || 4;
                const minHeight = editorRows * 24; // Approximate line height
                // Base64 encode the value to safely pass JSON through HTML attribute
                const encodedValue = value ? btoa(encodeURIComponent(value)) : '';
                return `<div id="${fieldId}" 
                    class="quill-editor" 
                    data-field-key="${field.key}"
                    data-initial-value="${encodedValue}"
                    data-placeholder="${this.escapeHtml(field.placeholder || '')}"
                    style="min-height: ${minHeight}px;"></div>
                <input type="hidden" 
                    name="${field.key}" 
                    id="${fieldId}-data">`;
            case 'select':
                let html = `<select id="${fieldId}" name="${field.key}" class="form-control" ${required}>`;

                // Add empty option if not required or specified
                if (!field.required || field.includeEmpty) {
                    html += `<option value="">${field.emptyLabel || 'Select...'}</option>`;
                }

                const options = await this.getFieldOptions(field);
                for (const option of options) {
                    const optValue = typeof option === 'object' ? option.value : option;
                    const optLabel = typeof option === 'object' ? option.label : option;
                    const selected = value == optValue ? 'selected' : '';
                    html += `<option value="${this.escapeHtml(optValue)}" ${selected}>
                        ${this.escapeHtml(optLabel)}
                    </option>`;
                }
                html += `</select>`;
                return html;

            case 'multiselect':
                // Always use ReferenceListManager for consistent editing pattern
                return this.renderReferenceListField(field, fieldId, value, required);

            case 'radio':
                let radioHtml = `<div class="radio-group">`;
                const radioOptions = await this.getFieldOptions(field);

                for (const option of radioOptions) {
                    const optValue = typeof option === 'object' ? option.value : option;
                    const optLabel = typeof option === 'object' ? option.label : option;
                    const checked = value == optValue ? 'checked' : '';
                    const radioId = `${fieldId}-${optValue}`;

                    radioHtml += `
                        <label class="radio-label">
                            <input type="radio" 
                                id="${radioId}" 
                                name="${field.key}" 
                                value="${this.escapeHtml(optValue)}" 
                                ${checked} 
                                ${required}>
                            <span>${this.escapeHtml(optLabel)}</span>
                        </label>`;
                }
                radioHtml += `</div>`;
                return radioHtml;

            case 'checkbox':
                const checked = value ? 'checked' : '';
                return `
                    <label class="checkbox-label">
                        <input type="checkbox" 
                            id="${fieldId}" 
                            name="${field.key}" 
                            value="true"
                            ${checked}>
                        <span>${field.checkboxLabel || 'Enabled'}</span>
                    </label>`;

            case 'date':
                return `<input type="date" 
                    id="${fieldId}" 
                    name="${field.key}" 
                    class="form-control" 
                    value="${value || ''}" 
                    ${required}
                    ${field.min ? `min="${field.min}"` : ''}
                    ${field.max ? `max="${field.max}"` : ''}>`;

            case 'hidden':
                return `<input type="hidden" name="${field.key}" value="${this.escapeHtml(value || '')}">`;

            case 'annotated-multiselect':
                // Render placeholder for annotated-multiselect
                return this.renderAnnotatedMultiselectField(field, fieldId, value, required);

            case 'history':
                // Render mount point for HistoryTab component
                return '<div id="history-tab-container" class="history-tab-container"></div>';

            case 'custom':
                // Allow field to render itself
                if (field.render) {
                    return field.render(field, fieldId, value, required);
                }
                return '';

            default:
                // Fallback to text input
                return `<input type="text" 
                    id="${fieldId}" 
                    name="${field.key}" 
                    class="form-control" 
                    value="${this.escapeHtml(value || '')}" 
                    ${required}>`;
        }
    }

    // ====================
    // NEW: REFERENCE LIST MANAGER SUPPORT
    // ====================

    renderReferenceListField(field, fieldId, value, required) {
        // Render placeholder container - actual manager will be instantiated after DOM insertion
        return `
            <div id="${fieldId}-container" 
                 class="reference-list-placeholder" 
                 data-field-key="${field.key}"
                 data-field-id="${fieldId}">
                <!-- ReferenceListManager will be inserted here -->
            </div>
        `;
    }

    initializeReferenceListManagers() {
        if (!this.currentModal) return;

        // Find all reference-list placeholders
        const placeholders = this.currentModal.querySelectorAll('.reference-list-placeholder');

        placeholders.forEach(placeholder => {
            const fieldKey = placeholder.dataset.fieldKey;
            const fieldId = placeholder.dataset.fieldId;

            // Find field definition
            const fields = this.getFieldDefinitions();
            const allFields = [];
            for (const section of fields) {
                if (section.fields) {
                    allFields.push(...section.fields);
                } else {
                    allFields.push(section);
                }
            }

            const field = allFields.find(f => f.key === fieldKey);
            if (!field || field.type !== 'multiselect') return;

            // Get current value
            const value = this.getFieldValue(this.currentItem, field);

            // Get options (resolve async if needed)
            this.getFieldOptions(field).then(options => {
                // Create manager
                const manager = new ReferenceListManager({
                    fieldId: fieldId,
                    options: options,
                    initialValue: value || [],
                    placeholder: field.placeholder || 'Search items...',
                    emptyMessage: field.emptyMessage || 'No items selected',
                    readOnly: this.currentMode === 'read',
                    onChange: (newValue) => {
                        console.log(`${fieldKey} changed:`, newValue);
                        if (this.currentMode === 'edit' || this.currentMode === 'create') {
                            this.markDirty();
                        }
                    }
                });

                // Render manager into placeholder
                manager.render(placeholder);

                // Store manager instance
                this.referenceListManagers[fieldKey] = manager;
            });
        });
    }

    cleanupReferenceListManagers() {
        // Destroy all manager instances
        Object.values(this.referenceListManagers).forEach(manager => {
            if (manager && typeof manager.destroy === 'function') {
                manager.destroy();
            }
        });

        // Clear storage
        this.referenceListManagers = {};
    }

    // ====================
    // ANNOTATED MULTISELECT SUPPORT
    // ====================

    renderAnnotatedMultiselectField(field, fieldId, value, required) {
        // Render placeholder container - actual manager will be instantiated after DOM insertion
        return `
            <div id="${fieldId}-container" 
                 class="annotated-multiselect-placeholder" 
                 data-field-key="${field.key}"
                 data-field-id="${fieldId}">
                <!-- AnnotatedMultiselectManager will be inserted here -->
            </div>
        `;
    }

    renderAnnotatedMultiselectReadOnly(field, value) {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return `
                <div class="detail-field">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">None</div>
                </div>
            `;
        }

        const formatted = value.map(ref => {
            const title = this.escapeHtml(ref.title || ref.id);
            const note = ref.note && ref.note.trim() ? ` <span class="note-badge">[${this.escapeHtml(ref.note)}]</span>` : '';
            return `<div class="ref-item">${title}${note}</div>`;
        }).join('');

        return `
            <div class="detail-field">
                <label>${this.escapeHtml(field.label)}</label>
                <div class="detail-value">${formatted}</div>
            </div>
        `;
    }

    renderRichtextReadOnly(field, value) {
        // Parse stringified Delta from Neo4j
        let deltaValue;
        try {
            deltaValue = JSON.parse(value);
        } catch (e) {
            console.warn(`Failed to parse richtext value for ${field.key}:`, e);
            // Treat as plain text fallback
            return `
                <div class="detail-field">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">${this.escapeHtml(value)}</div>
                </div>
            `;
        }

        // Handle empty richtext
        if (!deltaValue || !deltaValue.ops || deltaValue.ops.length === 0) {
            if (!field.required) {
                return ''; // Skip optional empty fields
            }
            return `
                <div class="detail-field">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">-</div>
                </div>
            `;
        }

        // Return placeholder that will be enhanced with disabled Quill editor after DOM insertion
        // Store Delta JSON in data attribute for post-processing
        const deltaJson = this.escapeHtml(JSON.stringify(deltaValue));
        return `
            <div class="detail-field">
                <label>${this.escapeHtml(field.label)}</label>
                <div class="detail-value richtext-content">
                    <div class="richtext-placeholder" data-delta="${deltaJson}" data-field-key="${field.key}"></div>
                </div>
            </div>
        `;
    }

    initializeAnnotatedMultiselects() {
        if (!this.currentModal) return;

        // Find all annotated-multiselect placeholders
        const placeholders = this.currentModal.querySelectorAll('.annotated-multiselect-placeholder');

        placeholders.forEach(placeholder => {
            const fieldKey = placeholder.dataset.fieldKey;
            const fieldId = placeholder.dataset.fieldId;

            // Find field definition
            const fields = this.getFieldDefinitions();
            const allFields = [];
            for (const section of fields) {
                if (section.fields) {
                    allFields.push(...section.fields);
                } else {
                    allFields.push(section);
                }
            }

            const field = allFields.find(f => f.key === fieldKey);
            if (!field || field.type !== 'annotated-multiselect') return;

            // Get current value
            const value = this.getFieldValue(this.currentItem, field);

            // Get options (resolve async if needed)
            this.getFieldOptions(field).then(options => {
                // Create manager
                const manager = new AnnotatedMultiselectManager({
                    fieldId: fieldId,
                    options: options,
                    initialValue: value || [],
                    maxNoteLength: field.maxNoteLength || 200,
                    placeholder: field.placeholder || 'Select items...',
                    noteLabel: field.noteLabel || 'Note (optional)',
                    helpText: field.helpText || '',
                    readOnly: this.currentMode === 'read',
                    onChange: (newValue) => {
                        console.log(`${fieldKey} changed:`, newValue);
                        if (this.currentMode === 'edit' || this.currentMode === 'create') {
                            this.markDirty();
                        }
                    }
                });

                // Render manager into placeholder
                manager.render(placeholder);

                // Store manager instance
                this.annotatedMultiselectManagers[fieldKey] = manager;
            });
        });
    }

    cleanupAnnotatedMultiselects() {
        // Destroy all manager instances
        Object.values(this.annotatedMultiselectManagers).forEach(manager => {
            if (manager && typeof manager.destroy === 'function') {
                manager.destroy();
            }
        });

        // Clear storage
        this.annotatedMultiselectManagers = {};
    }

    /**
     * Initialize read-only richtext fields with disabled Quill editors
     * Called after modal is rendered in read mode, or after non-modal content is inserted
     * @param {HTMLElement} container - Optional container to search within (defaults to currentModal)
     */
    initializeRichtextReadOnly(container = null) {
        const searchRoot = container || this.currentModal;

        if (!searchRoot) {
            console.warn('No container provided for richtext initialization');
            return;
        }

        if (typeof Quill === 'undefined') {
            console.warn('Quill is not loaded. Rich text will not render properly.');
            return;
        }

        // Find all richtext placeholders
        const placeholders = searchRoot.querySelectorAll('.richtext-placeholder');

        placeholders.forEach(placeholder => {
            const deltaJson = placeholder.getAttribute('data-delta');
            const fieldKey = placeholder.getAttribute('data-field-key');

            if (!deltaJson) {
                console.warn(`No delta data found for richtext placeholder: ${fieldKey}`);
                return;
            }

            try {
                // Parse Delta JSON
                const deltaValue = JSON.parse(deltaJson);

                // Create Quill editor in the placeholder with minimal configuration
                const quillEditor = new Quill(placeholder, {
                    theme: null, // No theme for most compact rendering
                    readOnly: true // Use readOnly instead of disable for cleaner rendering
                });

                // Set content
                quillEditor.setContents(deltaValue);

                // Optional: Add styling to indicate read-only state
                placeholder.classList.add('richtext-readonly');

            } catch (e) {
                console.error(`Failed to initialize read-only richtext for ${fieldKey}:`, e);
                placeholder.innerHTML = '<em>Error rendering content</em>';
            }
        });
    }

    // ====================
    // QUILL RICH TEXT EDITORS
    // ====================

    initializeQuillEditors() {
        if (!this.currentModal) return;
        if (typeof Quill === 'undefined') {
            console.warn('Quill is not loaded. Rich text editing will not be available.');
            return;
        }

        // Find all quill-editor containers
        const containers = this.currentModal.querySelectorAll('.quill-editor');

        containers.forEach(container => {
            const fieldKey = container.dataset.fieldKey;
            const placeholder = container.dataset.placeholder || '';
            const hiddenInput = this.currentModal.querySelector(`#${container.id}-data`);

            if (!hiddenInput) {
                console.warn(`No hidden input found for richtext field: ${fieldKey}`);
                return;
            }

            // Decode base64 value from data attribute
            let initialContent = {ops: []};
            try {
                const encodedValue = container.dataset.initialValue;
                if (encodedValue) {
                    const decodedValue = decodeURIComponent(atob(encodedValue));
                    initialContent = JSON.parse(decodedValue);
                }
            } catch (e) {
                console.warn(`Failed to parse initial content for ${fieldKey}:`, e);
            }

            // Create Quill instance
            const quill = new Quill(container, {
                theme: 'snow',
                placeholder: placeholder,
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline'],
                        ['code', 'code-block'],  // inline code + code block
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        ['image']
                    ]
                }
            });

            // Set initial content
            if (initialContent && initialContent.ops) {
                quill.setContents(initialContent);
            }

            // Sync to hidden input on change
            quill.on('text-change', () => {
                const delta = quill.getContents();
                hiddenInput.value = JSON.stringify(delta);
                if (this.currentMode === 'edit' || this.currentMode === 'create') {
                    this.markDirty();
                }
            });

            // Store editor instance
            this.quillEditors[fieldKey] = quill;

            console.log(`Initialized Quill editor for field: ${fieldKey}`);
        });
    }

    cleanupQuillEditors() {
        // Destroy all Quill editor instances
        Object.values(this.quillEditors).forEach(quill => {
            if (quill && typeof quill.disable === 'function') {
                quill.disable();
            }
        });

        // Clear storage
        this.quillEditors = {};
    }

    // ====================
    // VERSION RESTORE
    // ====================

    /**
     * Restore a historical version's content into the live edit form.
     *
     * The restore is purely client-side: form fields are repopulated with the
     * restored version's data. The server-side transaction only happens when
     * the user saves normally.
     *
     * Invariant: currentItem.versionId (the optimistic lock token for the
     * latest version) is preserved so that the save creates a new version
     * on top of the current latest, not on top of the restored version.
     *
     * @param {object} versionData - Full entity object returned by
     *   GET /{entityType}/{itemId}/versions/{versionNumber}
     */
    restoreVersionToForm(versionData) {
        if (!this.currentItem || !this.currentModal) {
            console.error('restoreVersionToForm: no active edit form');
            return;
        }

        // Preserve the optimistic lock token — it must stay as the latest version's id
        const preservedVersionId = this.currentItem.versionId;

        // Merge restored field values into currentItem, keeping identity/lock fields
        this.currentItem = {
            ...this.currentItem,       // keeps itemId, versionId, version, title, code, etc.
            ...versionData,            // overwrites editable content fields
            versionId:  preservedVersionId,          // restore lock token
            itemId:     this.currentItem.itemId,     // restore stable identity
        };

        // transformedItem is used for plain inputs/selects (strips objects to IDs, normalises arrays).
        // Managers (multiselect, annotated-multiselect) must receive the raw API objects from
        // this.currentItem — exactly as initializeReferenceListManagers / initializeAnnotatedMultiselects
        // do on initial load — because their normalizeInitialValue expects {id, ...} objects, not plain numbers.
        const transformedItem = this.transformDataForEdit(this.currentItem);
        const fields = this.getFieldDefinitions();
        const allFields = [];
        for (const section of fields) {
            if (section.fields) allFields.push(...section.fields);
            else allFields.push(section);
        }

        for (const field of allFields) {
            if (field.computed || field.readOnly || field.editableOnlyOnCreate || field.type === 'history') continue;

            // Managers need raw objects; plain inputs/richtext need the transformed (ID-normalised) value
            const rawValue         = this.getFieldValue(this.currentItem, field);
            const transformedValue = this.getFieldValue(transformedItem, field);

            switch (field.type) {
                case 'richtext': {
                    // Use transformedValue: richtext is stored as JSON string in the transformed item
                    const quill = this.quillEditors[field.key];
                    if (!quill) break;
                    let delta = { ops: [] };
                    try {
                        if (transformedValue && typeof transformedValue === 'string') {
                            delta = JSON.parse(transformedValue);
                        } else if (transformedValue && typeof transformedValue === 'object') {
                            delta = transformedValue;
                        }
                    } catch (e) {
                        console.warn(`restoreVersionToForm: failed to parse richtext for ${field.key}`, e);
                    }
                    quill.setContents(delta);
                    // Sync hidden input
                    const hiddenInput = this.currentModal.querySelector(`#field-${field.key}-data`);
                    if (hiddenInput) hiddenInput.value = JSON.stringify(quill.getContents());
                    break;
                }

                case 'annotated-multiselect': {
                    // Use rawValue: manager expects [{id, note, ...}] objects, not plain IDs
                    const manager = this.annotatedMultiselectManagers[field.key];
                    if (manager && typeof manager.destroy === 'function') manager.destroy();
                    delete this.annotatedMultiselectManagers[field.key];

                    const placeholder = this.currentModal.querySelector(
                        `.annotated-multiselect-placeholder[data-field-key="${field.key}"]`
                    );
                    if (!placeholder) break;

                    this.getFieldOptions(field).then(options => {
                        const mgr = new AnnotatedMultiselectManager({
                            fieldId: placeholder.dataset.fieldId,
                            options,
                            initialValue: rawValue || [],
                            maxNoteLength: field.maxNoteLength || 200,
                            placeholder: field.placeholder || 'Select items...',
                            noteLabel: field.noteLabel || 'Note (optional)',
                            helpText: field.helpText || '',
                            readOnly: false,
                            onChange: (newValue) => console.log(`${field.key} changed:`, newValue)
                        });
                        mgr.render(placeholder);
                        this.annotatedMultiselectManagers[field.key] = mgr;
                    });
                    break;
                }

                case 'multiselect': {
                    // Use rawValue: manager expects [{id, title, ...}] objects, not plain IDs
                    const manager = this.referenceListManagers[field.key];
                    if (manager && typeof manager.destroy === 'function') manager.destroy();
                    delete this.referenceListManagers[field.key];

                    const placeholder = this.currentModal.querySelector(
                        `.reference-list-placeholder[data-field-key="${field.key}"]`
                    );
                    if (!placeholder) break;

                    this.getFieldOptions(field).then(options => {
                        const mgr = new ReferenceListManager({
                            fieldId: placeholder.dataset.fieldId,
                            options,
                            initialValue: rawValue || [],
                            placeholder: field.placeholder || 'Search items...',
                            emptyMessage: field.emptyMessage || 'No items selected',
                            readOnly: false,
                            onChange: (newValue) => console.log(`${field.key} changed:`, newValue)
                        });
                        mgr.render(placeholder);
                        this.referenceListManagers[field.key] = mgr;
                    });
                    break;
                }

                default: {
                    // Plain input / select / textarea / date — use transformedValue (normalised)
                    const input = this.currentModal.querySelector(`[name="${field.key}"], #field-${field.key}`);
                    if (!input) break;
                    input.value = transformedValue ?? '';
                    break;
                }
            }
        }

        // Switch to the first content tab so the user sees the repopulated fields immediately
        this.switchTab(0);

        // Mark the form as modified
        this.markDirty();

        // Confirm dialog so the user knows the form now shows the restored content
        const restoredVersion = versionData.version ?? '?';
        this._showRestoreNotice(restoredVersion);

        console.log(`[CollectionEntityForm] Form populated with restored version data (preserving versionId=${preservedVersionId})`);
    }

    // ====================
    // FIELD OPTIONS & FORMATTING
    // ====================

    async getFieldOptions(field) {
        if (typeof field.options === 'function') {
            const result = await field.options(this.context, this.currentItem, this.currentMode);
            return result || [];
        }
        return field.options || [];
    }

    formatFieldValue(field, value) {
        // Allow custom formatting
        if (field.format) {
            return field.format(value, this.context);
        }

        // Handle null/undefined
        if (value === null || value === undefined) {
            return '-';
        }

        // Handle arrays
        if (Array.isArray(value)) {
            if (value.length === 0) return '-';
            return value.map(v => this.escapeHtml(v)).join(', ');
        }

        // Handle booleans
        if (typeof value === 'boolean') {
            return value ? 'Yes' : 'No';
        }

        // Handle dates
        if (field.type === 'date' && value) {
            try {
                return new Date(value).toLocaleDateString();
            } catch (e) {
                return this.escapeHtml(value);
            }
        }

        // Handle textareas - preserve line breaks
        if (field.type === 'textarea') {
            const escaped = this.escapeHtml(value.toString());
            return escaped.replace(/\n/g, '<br>');
        }

        // Default
        return this.escapeHtml(value.toString());
    }

    switchTab(tabIndex) {
        if (!this.currentModal) return;
        this.switchTabInContainer(this.currentModal, String(tabIndex));
        this.currentTabIndex = parseInt(tabIndex, 10);
    }

    // ====================
    // MODAL MANAGEMENT WITH STACK SUPPORT
    // ====================

    showModal(formContent, mode, isNested = false) {
        console.log("CollectionEntityForm.showModal - mode:", mode, "isNested:", isNested);
        const title = this.getFormTitle(mode);
        const showFooter = mode !== 'read';
        const modalId = `${mode}-modal-${Date.now()}`;

        // Calculate z-index based on modal stack depth
        const baseZIndex = 1000;
        const zIndex = baseZIndex + (this.modalStack.length * 10);

        console.log("CollectionEntityForm.showModal - zIndex:", zIndex, "stack depth:", this.modalStack.length);

        const modalHtml = `
        <div class="modal-overlay" id="${modalId}" style="z-index: ${zIndex}">
            <div class="modal modal-large">
                <div class="modal-header">
                    <h3 class="modal-title">${this.escapeHtml(title)}</h3>
                    <button class="modal-close" data-action="close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="${mode}-form-${Date.now()}" novalidate>
                        ${formContent}
                    </form>
                </div>
                ${showFooter ? `
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">
                            ${mode === 'create' ? 'Create' : 'Save Changes'}
                        </button>
                    </div>
                ` : `
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" data-action="close">Close</button>
                    </div>
                `}
            </div>
        </div>
    `;

        // Add new modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalElement = document.getElementById(modalId);

        // Push to stack if this is a nested modal
        if (isNested && this.currentModal) {
            console.log("CollectionEntityForm.showModal - pushing to stack:", {
                element: this.currentModal.id,
                mode: this.currentMode,
                item: this.currentItem?.itemId || this.currentItem?.id
            });
            this.modalStack.push({
                element: this.currentModal,
                mode: this.currentMode,
                item: this.currentItem
            });
        }

        // Set as current modal
        this.currentModal = modalElement;

        // Attach events
        this.attachModalEvents();

        // Focus first input
        if (mode !== 'read') {
            this.focusFirstInput();
        }

        // NEW: Signal that modal is fully initialized and ready
        if (this.context?.onModalReady) {
            this.context.onModalReady();
        }
    }

    showNestedModal(formContent, mode) {
        console.log("CollectionEntityForm.showNestedModal - called with mode:", mode);
        this.showModal(formContent, mode, true);
    }

    attachModalEvents() {
        if (!this.currentModal) return;

        // Click events - bind to this instance
        this.currentModal.addEventListener('click', async (e) => {
            const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

            if (action === 'close') {
                this.handleCancel();
            } else if (action === 'save') {
                await this.handleSave();
            }
        });

        // Escape key - only for top modal
        if (this.modalStack.length === 0) {
            this.escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    this.handleCancel();
                }
            };
            document.addEventListener('keydown', this.escapeHandler);
        }

        // Form validation on input + modified indicator
        const form = this.currentModal.querySelector('form');
        if (form) {
            form.addEventListener('input', (e) => {
                this.clearFieldError(e.target);
                if (this.currentMode === 'edit' || this.currentMode === 'create') {
                    this.markDirty();
                }
            });
        }

    }

    // ====================
    // MODIFIED INDICATOR
    // ====================

    /**
     * Mark the form as having unsaved changes.
     * Adds a visual badge to the modal title.
     */
    markDirty() {
        if (this._isDirty) return; // already marked
        this._isDirty = true;
        const titleEl = this.currentModal?.querySelector('.modal-title');
        if (titleEl && !titleEl.querySelector('.modal-dirty-badge')) {
            titleEl.insertAdjacentHTML('beforeend', ' <span class="modal-dirty-badge" title="Unsaved changes">●</span>');
        }
    }

    /**
     * Clear the modified indicator (called on close/re-open).
     */
    _clearDirty() {
        this._isDirty = false;
        // Badge lives in the DOM which is destroyed on close, so no explicit removal needed
    }

    // ====================
    // RESTORE NOTICE DIALOG
    // ====================

    /**
     * Show a small confirmation dialog after a version restore.
     * The user dismisses it manually — no auto-close — so they have time to read.
     * @param {string|number} restoredVersion
     */
    _showRestoreNotice(restoredVersion) {
        const id = 'odp-restore-notice';
        document.getElementById(id)?.remove();

        document.body.insertAdjacentHTML('beforeend', `
            <div class="history-popup-overlay" id="${id}">
                <div class="history-popup history-popup--narrow">
                    <div class="history-popup-header">
                        <h3 class="history-popup-title">Restore preview</h3>
                    </div>
                    <div class="history-popup-body">
                        <p>
                            The form now shows the content of
                            <span class="history-version-badge">v${this.escapeHtml(String(restoredVersion))}</span>.
                        </p>
                        <p>Review the restored content, then <strong>Save</strong> to create a new version.</p>
                    </div>
                    <div class="history-popup-footer">
                        <button type="button" class="btn btn-primary btn-sm" id="${id}-ok">Got it</button>
                    </div>
                </div>
            </div>
        `);

        document.getElementById(`${id}-ok`)?.addEventListener('click', () => {
            document.getElementById(id)?.remove();
        }, { once: true });
    }

    closeModal() {
        console.log("CollectionEntityForm.closeModal - called");
        console.log("CollectionEntityForm.closeModal - stack length:", this.modalStack.length);

        // Cleanup managers before closing
        this.cleanupAnnotatedMultiselects();
        this.cleanupReferenceListManagers();
        this.cleanupQuillEditors();

        this._clearDirty();
        this.currentTabIndex = 0;

        if (this.currentModal) {
            console.log("CollectionEntityForm.closeModal - removing current modal:", this.currentModal.id);
            this.currentModal.remove();
        }

        // Check if we have a parent modal to restore
        if (this.modalStack.length > 0) {
            const parentModal = this.modalStack.pop();
            console.log("CollectionEntityForm.closeModal - restoring parent modal:", {
                elementId: parentModal.element.id,
                mode: parentModal.mode,
                itemId: parentModal.item?.itemId || parentModal.item?.id
            });

            this.currentModal = parentModal.element;
            this.currentMode = parentModal.mode;
            this.currentItem = parentModal.item;

            console.log("CollectionEntityForm.closeModal - restored to parent modal");
        } else {
            this.currentModal = null;
            this.currentMode = null;
            this.currentItem = null;

            // Remove escape handler only when closing the root modal
            if (this.escapeHandler) {
                document.removeEventListener('keydown', this.escapeHandler);
                this.escapeHandler = null;
                console.log("CollectionEntityForm.closeModal - removed escape handler");
            }
            console.log("CollectionEntityForm.closeModal - closed root modal");
        }
    }

    focusFirstInput() {
        if (!this.currentModal) return;

        const firstInput = this.currentModal.querySelector(
            'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), textarea, select'
        );

        if (firstInput) {
            firstInput.focus();
        }
    }

    // ====================
    // FORM SUBMISSION
    // ====================

    async handleSave() {
        console.log('CollectionEntityForm.handleSave');
        const form = this.currentModal.querySelector('form');
        if (!form) return;

        // Clear previous errors
        this.clearAllErrors();

        // Collect form data
        const formData = this.collectFormData(form);

        // Validate
        const validation = await this.validateForm(formData, this.currentMode);
        console.log("CollectionEntityForm.handleSave valid: ", validation.valid);
        if (!validation.valid) {
            this.showValidationErrors(validation.errors);
            return;
        }

        // Transform data
        const dataToSave = this.transformDataForSave(formData, this.currentMode, this.currentItem);

        try {
            // Save
            const result = await this.onSave(dataToSave, this.currentMode, this.currentItem);

            // Emit event after successful save
            const event = new CustomEvent('entitySaved', {
                detail: {
                    entity: result,
                    mode: this.currentMode,
                    entityType: this.entityConfig.name
                }
            });
            document.dispatchEvent(event);

            // Close modal on success
            this.closeModal();
        } catch (error) {
            console.error('Failed to save:', error);
            this.showFormError(error.message || 'Failed to save. Please try again.');
        }
    }

    handleCancel() {
        this.onCancel();
        this.closeModal();
    }

    collectFormData(form) {
        console.log('CollectionEntityForm.collectFormData');

        // Sync all Quill editors to hidden inputs before collecting data
        Object.entries(this.quillEditors).forEach(([fieldKey, quill]) => {
            const hiddenInput = form.querySelector(`input[name="${fieldKey}"]`);
            if (hiddenInput && quill) {
                const delta = quill.getContents();
                hiddenInput.value = JSON.stringify(delta);
            }
        });

        const formData = new FormData(form);
        const data = {};
        const fields = this.getFieldDefinitions();

        // Flatten fields from sections
        const allFields = [];
        for (const section of fields) {
            if (section.fields) {
                allFields.push(...section.fields);
            } else {
                allFields.push(section);
            }
        }

        for (const field of allFields) {
            // Skip computed and read-only fields
            if (field.computed) continue;
            if (this.currentMode === 'edit' && field.editableOnlyOnCreate) continue;

            // Special handling for annotated-multiselect
            if (field.type === 'annotated-multiselect') {
                const manager = this.annotatedMultiselectManagers[field.key];
                if (manager) {
                    data[field.key] = manager.getValue();
                    console.log("CollectionEntityForm.collectFormData %s (annotated): %s", field.key, JSON.stringify(data[field.key]));
                }
                continue;
            }

            // NEW: Special handling for multiselect with ReferenceListManager
            if (field.type === 'multiselect') {
                // Check if this field uses ReferenceListManager
                const manager = this.referenceListManagers[field.key];
                if (manager) {
                    data[field.key] = manager.getValue();
                    console.log("CollectionEntityForm.collectFormData %s (reference-list): %s", field.key, JSON.stringify(data[field.key]));
                } else {
                    // Fallback to native select
                    const select = form.querySelector(`[name="${field.key}"]`);
                    if (select) {
                        // Convert to numbers if they look like IDs
                        data[field.key] = Array.from(select.selectedOptions).map(opt => {
                            const val = opt.value;
                            // Only convert to number if it's a numeric string
                            return /^\d+$/.test(val) ? parseInt(val, 10) : val;
                        });
                    }
                }
                continue;
            }

            if (field.type === 'checkbox') {
                // Handle checkbox as boolean
                const checkbox = form.querySelector(`[name="${field.key}"]`);
                data[field.key] = checkbox ? checkbox.checked : false;
            } else if (field.type === 'number') {
                // Parse number fields
                const value = formData.get(field.key);
                if (value !== null && value !== '') {
                    data[field.key] = parseFloat(value);
                }
            } else {
                // Regular fields
                const value = formData.get(field.key);
                if (value !== null && value !== '') {
                    // Convert to number if it's a select field with numeric value
                    if (field.type === 'select' && /^\d+$/.test(value)) {
                        data[field.key] = parseInt(value, 10);
                    } else {
                        data[field.key] = value;
                    }
                }
            }
            console.log("CollectionEntityForm.collectFormData %s: %s", field.key, data[field.key]);
        }

        return data;
    }

    // ====================
    // VALIDATION
    // ====================

    async validateForm(data, mode) {
        console.log('CollectionEntityForm.validateForm ', mode);
        const errors = [];
        const fields = this.getFieldDefinitions();

        // Flatten fields from sections
        const allFields = [];
        for (const section of fields) {
            if (section.fields) {
                allFields.push(...section.fields);
            } else {
                allFields.push(section);
            }
        }

        // Field-level validation
        for (const field of allFields) {
            if (field.computed) continue;

            const value = data[field.key];

            // Required validation
            if (field.required && (this.currentMode === 'create' || !field.editableOnlyOnCreate) && !value) {
                errors.push({
                    field: field.key,
                    message: `${field.label} is required`
                });
            }

            // Custom validation
            if (field.validate) {
                const validation = await field.validate(value, data, this.context);
                if (!validation.valid) {
                    errors.push({
                        field: field.key,
                        message: validation.message || `${field.label} is invalid`
                    });
                }
            }
        }
        console.log('CollectionEntityForm.validateForm field-error-count: ', errors.length);

        // Form-level validation
        const customValidation = await this.onValidate(data, this.currentMode, this.currentItem);
        console.log('CollectionEntityForm.validateForm customValidation: ', customValidation.valid);
        if (!customValidation.valid) {
            if (customValidation.errors) {
                errors.push(...customValidation.errors);
            } else if (customValidation.message) {
                errors.push({ message: customValidation.message });
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    showValidationErrors(errors) {
        for (const error of errors) {
            if (error.field) {
                this.showFieldError(error.field, error.message);
            } else {
                this.showFormError(error.message);
            }
        }
    }

    showFieldError(fieldKey, message) {
        console.log('CollectionEntityForm.showFieldError %s: %s', fieldKey, message);
        const formGroup = this.currentModal.querySelector(`[data-field="${fieldKey}"]`);
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
        if (!this.currentModal) return;

        const formGroups = this.currentModal.querySelectorAll('.form-group');
        formGroups.forEach(group => {
            group.classList.remove('has-error');
            const messageEl = group.querySelector('.validation-message');
            if (messageEl) {
                messageEl.textContent = '';
                messageEl.style = 'none';
            }
        });

        // Clear form-level error
        const formError = this.currentModal.querySelector('.form-error');
        if (formError) {
            formError.remove();
        }
    }

    showFormError(message) {
        const form = this.currentModal.querySelector('form');
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

    // ====================
    // UTILITIES
    // ====================

    truncate(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;');
    }
}