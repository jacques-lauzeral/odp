import { async as asyncUtils } from '../shared/utils.js';
import AnnotatedMultiselectManager from './annotated-multiselect-manager.js';
import ReferenceListManager from './reference-list-manager.js';
import ReferenceManager from './reference-manager.js';
import RichTextComponent from './rich-text-component.js';
import { buildLinkProvider } from './link-provider.js';
import { odipConfirm } from './user-dialogs.js';
import { openChangeSetCommitDialog } from './change-set-commit-dialog.js';

/**
 * CollectionEntityForm - Business-agnostic form rendering and modal management
 * Base class for entity-specific forms using inheritance
 *
 * Updated to support:
 * - annotated-reference-list field type for document references
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

        // Annotated reference list managers storage
        this.annotatedMultiselectManagers = {};

        // NEW: Reference list managers storage
        this.referenceListManagers = {};

        // Single-select reference managers (ReferenceManager)
        this.referenceManagers = {};

        // RichTextComponent instances storage
        this.richTextComponents = {};

        // Modified indicator flag — set when form data is changed or restored
        this._isDirty = false;

        // Optional navigation callback for read mode — enables navigable reference links.
        // Signature: onNavigate(ref: { id, code, title, type }) => void
        // Provided by RequirementDetails / ChangeDetails; absent in edit popup context.
        this.onNavigate = context.onNavigate || null;

        // Optional internal-link handler for read-only rich text (n-ref / o-ref / d-ref clicks).
        // Provided by RequirementDetails / ChangeDetails via context.onInternalLink.
        this._onInternalLink = context.onInternalLink || null;

        // Optional post-save callback — called after successful create or edit.
        // Signature: (result, mode) where mode is 'create' | 'edit'.
        // Provided by callers that need to react to the saved entity (e.g. NarrativeActivity).
        this._onSaved = context.onSaved ?? null;

        // Link provider for reference authoring in edit mode — lazily built from context.app.
        this._linkProvider = null;

        // Initialize tab delegation once
        this.initTabDelegation();
    }

    initTabDelegation() {
        // Prevent multiple bindings — one document-level listener shared across all instances.
        if (CollectionEntityForm._tabDelegationInitialized) {
            return;
        }

        // Single event listener for all tab headers anywhere in the document.
        // Updates the static _activeInstance so the correct form instance tracks currentTabIndex.
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-header')) {
                const tabIndex = e.target.dataset.tab;
                const container = e.target.closest('.form-tabs, .item-details, .modal');
                if (container && tabIndex !== undefined) {
                    const active = CollectionEntityForm._activeInstance;
                    if (active) {
                        active.switchTabInContainer(container, tabIndex);
                        active.currentTabIndex = parseInt(tabIndex, 10);
                    }
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
        // Retained for backward compatibility with any subclass that has not yet
        // adopted the edit-config pattern. Returns empty array by default.
        return [];
    }

    /**
     * Hydrate a raw field entry from the edit config with bound runtime functions.
     * Converts optionsKey / formatKey / computeKey / renderKey string references
     * into actual bound methods on the form instance.
     * Override in subclasses (RequirementForm, ChangeForm).
     * @param {object} field
     * @returns {object} hydrated field
     */
    hydrateField(field) {
        return field;
    }

    /**
     * Return a cached flat Map<key, hydratedFieldDef> built from the edit config.
     * All consumers (validateForm, collectFormData, manager init, restoreVersionToForm)
     * call this instead of getFieldDefinitions().
     */
    _getFieldMap() {
        if (!this._fieldMapCache) {
            this._fieldMapCache = this._buildFieldMap();
        }
        return this._fieldMapCache;
    }

    getReadConfig() {
        // Override in subclasses to provide a layout config for read mode.
        // When non-null, _generateFormFromConfig() is used instead of the legacy path.
        // Shape: { sections: Array }
        return null;
    }

    getEditConfig() {
        // Override in subclasses to provide a layout config for edit/create mode.
        // When non-null, _generateFormFromConfig() is used instead of the legacy path.
        // Shape: { sections: Array }
        return null;
    }

    /**
     * Whether a save through this form is a versioned write that must commit under a
     * change set (LCM). Default true — every O* form. Non-versioned forms (ODIP editions,
     * change sets themselves) override this to return false to skip the commit gate.
     * @returns {boolean}
     */
    requiresChangeSet() {
        return true;
    }

    getFormTitle(mode, item = null) {
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

    async showCreateModal(initialData = null) {
        this.currentMode = 'create';
        this.currentItem = null;
        const form = await this.generateForm('create', initialData);
        this.showModal(form, 'create');

        // Initialize managers after modal is shown
        this.initializeAnnotatedMultiselects();
        this.initializeReferenceListManagers();
        this.initializeReferenceManagers();
        this.initializeRichTextEditors();
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
        this.initializeReferenceManagers();
        this.initializeRichTextEditors();
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
        this.initializeReferenceManagers();

        // Initialize read-only richtext fields
        this.initializeRichTextReadOnly();
    }

    async generateReadOnlyView(item, preserveTabIndex = false) {
        const transformedItem = this.transformDataForRead(item);
        return await this.generateForm('read', transformedItem, preserveTabIndex);
    }

    /**
     * Initialize all read-only managers after injecting generateReadOnlyView HTML
     * into a non-modal container (details panel, planning pane, etc.).
     *
     * Temporarily sets currentModal to the container so all manager initializers
     * can locate their placeholders, then clears it.
     *
     * @param {HTMLElement} container - The element containing the injected HTML
     * @param {object} item - The item whose data was rendered
     */
    initializeReadOnlyInPanel(container, item) {
        // Mark this instance as active so the shared tab delegation listener
        // updates the correct currentTabIndex.
        CollectionEntityForm._activeInstance = this;

        this.currentModal = container;
        this.currentItem  = item;
        this.currentMode  = 'read';

        this.initializeAnnotatedMultiselects();
        this.initializeReferenceListManagers();
        this.initializeReferenceManagers();
        this.initializeRichTextReadOnly(container);

        this.currentModal = null;
    }

    // ====================
    // FORM GENERATION
    // ====================

    async generateForm(mode, item = null, preserveTabIndex = false) {
        const layoutConfig = mode === 'read' ? this.getReadConfig() : this.getEditConfig();
        if (layoutConfig) {
            return await this._generateFormFromConfig(layoutConfig, mode, item, preserveTabIndex);
        }

        // ── Legacy path ───────────────────────────────────────────────────────
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
            if (!this.isSectionVisible(section, mode, item)) return;

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
            if (!this.isSectionVisible(section, mode, item)) continue;

            const isActive = visibleTabIndex === activeTabIndex;
            html += `<div class="tab-panel ${isActive ? 'active' : ''}" data-tab="${visibleTabIndex}">`;

            const visibleFields = this.getVisibleFields(section.fields || [section], mode, item);
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

    getVisibleFields(fields, mode, item = null) {
        return fields.filter(field => {
            if (field.modes && !field.modes.includes(mode)) return false;
            if (field.visibleWhen && item) return field.visibleWhen(item, mode);
            return true;
        });
    }

    isSectionVisible(section, mode, item = null) {
        const fields = (section.fields || [section]).filter(field =>
            !field.modes || field.modes.includes(mode)
        );
        return fields.length > 0;
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
            return await this.renderEditableField(field, value);
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

        // Special handling for annotated-reference-list
        if (field.type === 'annotated-reference-list') {
            return this.renderAnnotatedMultiselectReadOnly(field, value);
        }

        // Special handling for reference-list: emit detail-field wrapper + label +
        // placeholder so initializeReferenceListManagers can hydrate it (read-only mode)
        if (field.type === 'reference-list') {
            const fieldId = `field-${field.key.replace(/\./g, '-')}`;
            return `
                <div class="detail-field detail-field--block">
                    <label>${this.escapeHtml(field.label)}</label>
                    ${this.renderReferenceListField(field, fieldId, value, false)}
                </div>
            `;
        }

        // Special handling for reference (single-select typeahead): same pattern
        if (field.type === 'reference') {
            const fieldId = `field-${field.key.replace(/\./g, '-')}`;
            return `
                <div class="detail-field detail-field--block">
                    <label>${this.escapeHtml(field.label)}</label>
                    ${this.renderReferenceField(field, fieldId, value, false)}
                </div>
            `;
        }

        // Special handling for richtext
        if (field.type === 'richtext') {
            return this.renderRichtextReadOnly(field, value);
        }

        // static-label: always render fixed text, ignore value
        if (field.type === 'static-label') {
            return `
                <div class="detail-field">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value detail-value--muted">${this.escapeHtml(field.staticText || '')}</div>
                </div>
            `;
        }

        // tentative: render formatted [start, end] array or raw string
        if (field.type === 'tentative') {
            const display = Array.isArray(value)
                ? (value[0] === value[1] ? String(value[0]) : `${value[0]}-${value[1]}`)
                : (value || '');
            if (!display) return '';
            return `
                <div class="detail-field">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">${this.escapeHtml(display)}</div>
                </div>
            `;
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

        // Scalar types render label left-of-input; spatially extended types render label above.
        const SCALAR_TYPES = new Set(['text', 'number', 'select', 'tentative', 'reference']);
        const isInline = SCALAR_TYPES.has(field.type);

        let html = `<div class="form-group${isInline ? ' form-group--inline' : ''}" data-field="${field.key}">`;

        // Label
        html += `<label for="${fieldId}">${this.escapeHtml(field.label)}`;
        if (field.required) html += ' <span class="required">*</span>';
        html += `</label>`;

        // Help text above field (not shown for inline scalar fields — placeholder carries the hint)
        if (field.helpTextAbove && !isInline) {
            html += `<small class="form-text">${this.escapeHtml(field.helpTextAbove)}</small>`;
        }

        // Render input based on type
        html += await this.renderInput(field, fieldId, value, required);

        // Help text below field (suppressed for inline scalar fields)
        if (field.helpText && !isInline) {
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
                    class="odip-input odip-input--standard" 
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
                    class="odip-input odip-input--standard odip-input--textarea" 
                    rows="${rows}" 
                    ${required}
                    ${field.placeholder ? `placeholder="${this.escapeHtml(field.placeholder)}"` : ''}
                    ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}>${this.escapeHtml(value || '')}</textarea>`;

            case 'richtext':
                // Render container for RichTextComponent and hidden input for form data
                const editorRows = field.rows || 4;
                const minHeight = editorRows * 24;
                const initialValue = value ? value.replace(/"/g, '&quot;') : '';
                return `<div id="${fieldId}"
                    class="richtext-edit-placeholder"
                    data-field-key="${field.key}"
                    data-initial-value="${initialValue}"
                    data-placeholder="${this.escapeHtml(field.placeholder || '')}"
                    style="min-height: ${minHeight}px;"></div>
                <input type="hidden"
                    name="${field.key}"
                    id="${fieldId}-data">`;
            case 'select':
                let html = `<select id="${fieldId}" name="${field.key}" class="odip-input odip-input--standard" ${required}>`;

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

            case 'reference-list':
                // Always use ReferenceListManager for consistent editing pattern
                return this.renderReferenceListField(field, fieldId, value, required);

            case 'reference':
                // Single-select typeahead via ReferenceManager
                return this.renderReferenceField(field, fieldId, value, required);

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
                    class="odip-input odip-input--standard" 
                    value="${value || ''}" 
                    ${required}
                    ${field.min ? `min="${field.min}"` : ''}
                    ${field.max ? `max="${field.max}"` : ''}>`;

            case 'hidden':
                return `<input type="hidden" name="${field.key}" value="${this.escapeHtml(value || '')}">`;

            case 'annotated-reference-list':
                // Render placeholder for annotated-reference-list
                return this.renderAnnotatedMultiselectField(field, fieldId, value, required);

            case 'history':
                // Render mount point for HistoryTab component
                return '<div id="history-tab-container" class="history-tab-container"></div>';

            case 'static-label':
                // Read-only informational label — no input, no name, not submitted
                return `<div class="form-static-label detail-value--muted">${this.escapeHtml(field.staticText || '')}</div>`;

            case 'tentative':
                // Single text input — user types "YYYY" or "YYYY-ZZZZ"
                // Value arriving here is already a formatted string (transformDataForEdit converts array → string)
                return `<input type="text"
                    id="${fieldId}"
                    name="${field.key}"
                    class="odip-input odip-input--standard"
                    value="${this.escapeHtml(value || '')}"
                    ${required}
                    ${field.placeholder ? `placeholder="${this.escapeHtml(field.placeholder)}"` : ''}
                    pattern="^\\d{4}(-\\d{4})?$">`;

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
                    class="odip-input odip-input--standard" 
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

        const placeholders = this.currentModal.querySelectorAll('.reference-list-placeholder');

        placeholders.forEach(placeholder => {
            const fieldKey = placeholder.dataset.fieldKey;
            const fieldId  = placeholder.dataset.fieldId;

            const field = this._getFieldMap().get(fieldKey);
            if (!field || field.type !== 'reference-list') return;

            const value = field.compute
                ? field.compute(this.currentItem)
                : this.getFieldValue(this.currentItem, field);

            const isReadOnly = this.currentMode === 'read' || field.readOnly === true;

            // For read-only derived fields (refinedBy, implementedByORs, implementedByOCs, etc.)
            // the extended projection already returns full objects {id, title, code, type}.
            // Synthesise options directly from the value rather than fetching a full catalog —
            // no separate options method is needed and there is no ID-without-label mismatch.
            const optionsPromise = (isReadOnly && Array.isArray(value) && value.length > 0 && value[0]?.title != null)
                ? Promise.resolve(value.map(r => ({
                    value: r.id ?? r.itemId,
                    label: r.code ? `${r.code} \u2014 ${r.title}` : (r.title ?? String(r.id ?? r.itemId)),
                })))
                : this.getFieldOptions(field);

            optionsPromise.then(options => {
                const onNavigate = this.onNavigate;
                const manager = new ReferenceListManager({
                    fieldId: fieldId,
                    options: options,
                    initialValue: value || [],
                    placeholder: field.placeholder || 'Search items...',
                    emptyMessage: isReadOnly ? 'None' : (field.emptyMessage || 'No items selected'),
                    readOnly: isReadOnly,
                    onItemClick: (isReadOnly && onNavigate)
                        ? (id, option) => {
                            const rawType = (field.formatArgs && field.formatArgs[0]) || 'OR';
                            const entityType = rawType === 'OC' || rawType === 'change' ? 'oc'
                                : rawType === 'ON' || rawType === 'on'      ? 'on'
                                    : 'or';
                            onNavigate({ id: option.value, label: option.label, entityType });
                        }
                        : null,
                    onChange: (newValue) => {
                        console.log(`${fieldKey} changed:`, newValue);
                        if (this.currentMode === 'edit' || this.currentMode === 'create') {
                            this.markDirty();
                        }
                    }
                });

                manager.render(placeholder);
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
    // REFERENCE MANAGER SUPPORT (single-select typeahead)
    // ====================

    renderReferenceField(field, fieldId, value, required) {
        return `
            <div id="${fieldId}-container"
                 class="reference-manager-placeholder"
                 data-field-key="${field.key}"
                 data-field-id="${fieldId}">
            </div>
        `;
    }

    initializeReferenceManagers() {
        if (!this.currentModal) return;

        const placeholders = this.currentModal.querySelectorAll('.reference-manager-placeholder');

        placeholders.forEach(placeholder => {
            const fieldKey = placeholder.dataset.fieldKey;
            const fieldId  = placeholder.dataset.fieldId;

            const field = this._getFieldMap().get(fieldKey);
            if (!field || field.type !== 'reference') return;

            const rawValue  = this.getFieldValue(this.currentItem, field);
            const initialId = Array.isArray(rawValue) && rawValue.length > 0
                ? rawValue[0]?.id ?? rawValue[0]
                : null;

            const isReadOnly = this.currentMode === 'read' || field.readOnly === true;
            const onNavigate = this.onNavigate;
            this.getFieldOptions(field).then(options => {
                const manager = new ReferenceManager({
                    fieldId,
                    options,
                    initialValue: initialId,
                    placeholder: field.placeholder || 'Type to search...',
                    readOnly: isReadOnly,
                    onItemClick: (isReadOnly && onNavigate)
                        ? (id, option) => {
                            const rawType = (field.formatArgs && field.formatArgs[0]) || 'OR';
                            const entityType = rawType === 'OC' || rawType === 'change' ? 'oc'
                                : rawType === 'ON' || rawType === 'on'      ? 'on'
                                    : 'or';
                            onNavigate({ id: option.value, label: option.label, entityType });
                        }
                        : null,
                    onChange: () => {
                        if (this.currentMode === 'edit' || this.currentMode === 'create') {
                            this.markDirty();
                        }
                    }
                });
                manager.render(placeholder);
                this.referenceManagers[fieldKey] = manager;
            });
        });
    }

    cleanupReferenceManagers() {
        Object.values(this.referenceManagers).forEach(m => {
            if (m && typeof m.destroy === 'function') m.destroy();
        });
        this.referenceManagers = {};
    }

    // ====================
    // ANNOTATED MULTISELECT SUPPORT
    // ====================

    renderAnnotatedMultiselectField(field, fieldId, value, required) {
        // Render placeholder container - actual manager will be instantiated after DOM insertion
        return `
            <div id="${fieldId}-container" 
                 class="annotated-reference-list-placeholder" 
                 data-field-key="${field.key}"
                 data-field-id="${fieldId}">
                <!-- AnnotatedMultiselectManager will be inserted here -->
            </div>
        `;
    }

    /**
     * Resolve description and url for an annotated ref item from setupData.
     * Uses field.setupEntity to identify the collection (e.g. 'referenceDocuments').
     * Returns { description, url } — both may be undefined.
     */
    _resolveAnnotatedRefMeta(field, refId) {
        const setupData = this.context?.setupData;
        if (!setupData || !field.setupEntity) return {};
        const collection = setupData[field.setupEntity];
        if (!Array.isArray(collection)) return {};
        // eslint-disable-next-line eqeqeq
        const match = collection.find(e => e.id == refId);
        if (!match) return {};
        return {
            description: match.description || undefined,
            url: match.url || undefined
        };
    }

    renderAnnotatedMultiselectReadOnly(field, value) {
        if (!value || !Array.isArray(value) || value.length === 0) {
            return `
                <div class="detail-field detail-field--block">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">None</div>
                </div>
            `;
        }

        const sorted = [...value].sort((a, b) => {
            const ta = (a?.title || a?.name || a?.id || '').toLowerCase();
            const tb = (b?.title || b?.name || b?.id || '').toLowerCase();
            return ta.localeCompare(tb);
        });

        const formatted = sorted.map(ref => {
            const { description, url } = this._resolveAnnotatedRefMeta(field, ref.id);
            const titleText = ref.title || ref.name || ref.id;
            const tooltip = description ? ` title="${this.escapeHtml(description)}"` : '';

            const titleEl = url
                ? `<a class="annotated-ref-link" href="${this.escapeHtml(url)}" target="_blank" rel="noopener"${tooltip}>${this.escapeHtml(titleText)}</a>`
                : `<span class="annotated-ref-title"${tooltip}>${this.escapeHtml(titleText)}</span>`;

            const note = ref.note && ref.note.trim()
                ? `<div class="annotated-ref-note">${this.escapeHtml(ref.note)}</div>`
                : '';
            return `<div class="annotated-ref-item">
                <span class="annotated-ref-bullet">&#8226;</span>
                <div class="annotated-ref-body">${titleEl}${note}</div>
            </div>`;
        }).join('');

        return `
            <div class="detail-field detail-field--block">
                <label>${this.escapeHtml(field.label)}</label>
                <div class="detail-value annotated-ref-list">${formatted}</div>
            </div>
        `;
    }

    renderRichtextReadOnly(field, value) {
        // Parse stringified TipTap JSON from Neo4j
        let docValue;
        try {
            docValue = JSON.parse(value);
        } catch (e) {
            console.warn(`Failed to parse richtext value for ${field.key}:`, e);
            return `
                <div class="detail-field detail-field--block">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">${this.escapeHtml(value)}</div>
                </div>
            `;
        }

        // Handle empty richtext — TipTap empty doc has no content or a single empty paragraph
        const isEmpty = !docValue
            || docValue.type !== 'doc'
            || !Array.isArray(docValue.content)
            || docValue.content.length === 0
            || (docValue.content.length === 1
                && docValue.content[0].type === 'paragraph'
                && (!docValue.content[0].content || docValue.content[0].content.length === 0));

        if (isEmpty) {
            if (!field.required) return '';
            return `
                <div class="detail-field detail-field--block">
                    <label>${this.escapeHtml(field.label)}</label>
                    <div class="detail-value">-</div>
                </div>
            `;
        }

        // Return placeholder that will be mounted with read-only RichTextComponent after DOM insertion
        const escapedJson = this.escapeHtml(JSON.stringify(docValue));
        return `
            <div class="detail-field detail-field--block">
                <label>${this.escapeHtml(field.label)}</label>
                <div class="detail-value richtext-content">
                    <div class="richtext-readonly-placeholder" data-tiptap-json="${escapedJson}" data-field-key="${field.key}"></div>
                </div>
            </div>
        `;
    }

    /**
     * Convert a flat array of setup entities (carrying parentId from the store)
     * into a ReferenceManager-compatible node tree.
     *
     * All nodes are selectable (value = entity id). Children are sorted by name.
     * Entities whose parentId references an unknown id are promoted to root.
     *
     * @param {object[]} items  — e.g. setupData.referenceDocuments or .stakeholderCategories
     * @param {function} [getLabel]  — optional (item) => string; defaults to item.name
     * @returns {object[]}  root nodes with nested children[]
     */
    _buildTreeNodes(items, getLabel) {
        return ReferenceManager.buildTreeNodes(items, getLabel);
    }

    initializeAnnotatedMultiselects() {
        if (!this.currentModal) return;

        const placeholders = this.currentModal.querySelectorAll('.annotated-reference-list-placeholder');

        placeholders.forEach(placeholder => {
            const fieldKey = placeholder.dataset.fieldKey;
            const fieldId  = placeholder.dataset.fieldId;

            const field = this._getFieldMap().get(fieldKey);
            if (!field || field.type !== 'annotated-reference-list') return;

            const value    = this.getFieldValue(this.currentItem, field);
            const isReadOnly = this.currentMode === 'read' || field.readOnly === true;

            this.getFieldOptions(field).then(options => {
                // If the setup entity carries parentId, build a proper node tree
                // instead of a flat options list — AnnotatedMultiselectManager
                // accepts both; nodes take precedence.
                const setupData  = this.context?.setupData;
                const collection = field.setupEntity && setupData?.[field.setupEntity];
                const useTree    = Array.isArray(collection) && collection.some(e => e.parentId != null);

                const managerConfig = {
                    fieldId:      fieldId,
                    initialValue: value || [],
                    maxNoteLength: field.maxNoteLength || 200,
                    placeholder:  field.placeholder || 'Select items...',
                    noteLabel:    field.noteLabel || 'Note (optional)',
                    helpText:     field.helpText || '',
                    readOnly:     isReadOnly,
                    onChange: (newValue) => {
                        console.log(`${fieldKey} changed:`, newValue);
                        if (this.currentMode === 'edit' || this.currentMode === 'create') {
                            this.markDirty();
                        }
                    }
                };

                if (useTree) {
                    const getLabel = field.setupEntity === 'referenceDocuments'
                        ? (item) => item.version ? `${item.name} (${item.version})` : item.name
                        : undefined;
                    managerConfig.nodes = this._buildTreeNodes(collection, getLabel);
                } else {
                    managerConfig.options = options;
                }

                const manager = new AnnotatedMultiselectManager(managerConfig);

                manager.render(placeholder);
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

    // ====================
    // RICH TEXT COMPONENTS
    // ====================

    initializeRichTextEditors() {
        if (!this.currentModal) return;

        const placeholders = this.currentModal.querySelectorAll('.richtext-edit-placeholder');

        placeholders.forEach(placeholder => {
            const fieldKey       = placeholder.dataset.fieldKey;
            const initialValue   = placeholder.dataset.initialValue || '';
            const placeholderText = placeholder.dataset.placeholder || '';

            const field = this._getFieldMap().get(fieldKey);
            if (!field) return;

            const hiddenInput = this.currentModal.querySelector(`#${placeholder.id}-data`);
            if (!hiddenInput) {
                console.warn(`No hidden input found for richtext field: ${fieldKey}`);
                return;
            }

            const component = new RichTextComponent({
                readOnly: false,
                headings: field.headings ?? false,
                images:   field.images   ?? true,
                tables:   field.tables   ?? true,
                placeholder: placeholderText,
                linkProvider: this._getLinkProvider(),
                onChange: (jsonString) => {
                    hiddenInput.value = jsonString ?? '';
                    if (this.currentMode === 'edit' || this.currentMode === 'create') {
                        this.markDirty();
                    }
                },
            });

            component.mount(placeholder);

            if (initialValue) {
                component.setValue(initialValue);
            }

            // Sync hidden input with initial value
            hiddenInput.value = component.getValue() ?? '';

            this.richTextComponents[fieldKey] = component;
        });
    }

    /**
     * Mount read-only RichTextComponent instances into richtext-readonly-placeholder elements.
     * Called after read-mode HTML is injected into a container (panel or modal).
     * @param {HTMLElement} [container] — defaults to currentModal
     */
    initializeRichTextReadOnly(container = null) {
        const searchRoot = container || this.currentModal;
        if (!searchRoot) return;

        const placeholders = searchRoot.querySelectorAll('.richtext-readonly-placeholder');

        placeholders.forEach(placeholder => {
            const jsonString = placeholder.getAttribute('data-tiptap-json');
            const fieldKey   = placeholder.getAttribute('data-field-key');

            if (!jsonString) {
                console.warn(`No TipTap JSON found for richtext placeholder: ${fieldKey}`);
                return;
            }

            try {
                const component = new RichTextComponent({
                    readOnly: true,
                    onInternalLink: this._onInternalLink || null,
                });
                component.mount(placeholder);
                component.setValue(jsonString);
                // Prevent focus theft in panel context
                component.blur();
            } catch (e) {
                console.error(`Failed to initialize read-only richtext for ${fieldKey}:`, e);
                placeholder.innerHTML = '<em>Error rendering content</em>';
            }
        });
    }

    cleanupRichTextComponents() {
        Object.values(this.richTextComponents).forEach(component => {
            if (component && typeof component.destroy === 'function') {
                component.destroy();
            }
        });
        this.richTextComponents = {};
    }

    /**
     * Return the shared link provider for reference authoring in edit mode.
     * Lazily built from context.app on first call; returns null when no app is available.
     * @returns {object|null}
     * @private
     */
    _getLinkProvider() {
        if (!this.context.app) return null;
        if (!this._linkProvider) {
            this._linkProvider = buildLinkProvider(this.context.app);
        }
        return this._linkProvider;
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

        const transformedItem = this.transformDataForEdit(this.currentItem);

        for (const [, field] of this._getFieldMap()) {
            if (field.readOnly || field.type === 'history' || field.type === 'static-label') continue;

            // Managers need raw objects; plain inputs/richtext need the transformed (ID-normalised) value
            const rawValue         = this.getFieldValue(this.currentItem, field);
            const transformedValue = this.getFieldValue(transformedItem, field);

            switch (field.type) {
                case 'richtext': {
                    const component = this.richTextComponents[field.key];
                    if (!component) break;
                    component.setValue(transformedValue ?? null);
                    // Sync hidden input
                    const hiddenInput = this.currentModal.querySelector(`#field-${field.key}-data`);
                    if (hiddenInput) hiddenInput.value = component.getValue() ?? '';
                    break;
                }

                case 'annotated-reference-list': {
                    // Use rawValue: manager expects [{id, note, ...}] objects, not plain IDs
                    const manager = this.annotatedMultiselectManagers[field.key];
                    if (manager && typeof manager.destroy === 'function') manager.destroy();
                    delete this.annotatedMultiselectManagers[field.key];

                    const placeholder = this.currentModal.querySelector(
                        `.annotated-reference-list-placeholder[data-field-key="${field.key}"]`
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

                case 'reference-list': {
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
                            emptyMessage: this.currentMode === 'read' ? 'None' : (field.emptyMessage || 'No items selected'),
                            readOnly: false,
                            onChange: (newValue) => console.log(`${field.key} changed:`, newValue)
                        });
                        mgr.render(placeholder);
                        this.referenceListManagers[field.key] = mgr;
                    });
                    break;
                }

                case 'reference': {
                    const mgr = this.referenceManagers[field.key];
                    if (mgr && typeof mgr.destroy === 'function') mgr.destroy();
                    delete this.referenceManagers[field.key];

                    const placeholder = this.currentModal.querySelector(
                        `.reference-manager-placeholder[data-field-key="${field.key}"]`
                    );
                    if (!placeholder) break;

                    const initialId = Array.isArray(rawValue) && rawValue.length > 0
                        ? rawValue[0]?.id ?? rawValue[0]
                        : null;

                    this.getFieldOptions(field).then(options => {
                        const newMgr = new ReferenceManager({
                            fieldId: placeholder.dataset.fieldId,
                            options,
                            initialValue: initialId,
                            placeholder: field.placeholder || 'Type to search...',
                            readOnly: false,
                            onChange: () => this.markDirty()
                        });
                        newMgr.render(placeholder);
                        this.referenceManagers[field.key] = newMgr;
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
        const title = this.getFormTitle(mode, this.currentItem);
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
        CollectionEntityForm._activeInstance = this;

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
        this.cleanupReferenceManagers();
        this.cleanupRichTextComponents();

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

        // LCM commit gate — every *versioned* write commits under a change set. The dialog
        // offers the active change set (confirm), lets the user pick another or create one,
        // and optionally attach a note. Cancelling aborts the save and leaves the form open.
        // Non-versioned forms (editions, change sets) opt out via requiresChangeSet().
        if (this.requiresChangeSet()) {
            const commit = await openChangeSetCommitDialog(this.context.app, { allowNote: true });
            if (!commit) return;
            dataToSave.changeSetId = commit.changeSetId;
            if (commit.note) dataToSave.note = commit.note;
        }

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

            // Notify caller if a post-save callback was provided
            this._onSaved?.(result, this.currentMode);

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

        // Sync all RichTextComponent values to hidden inputs before collecting data
        Object.entries(this.richTextComponents).forEach(([fieldKey, component]) => {
            const hiddenInput = form.querySelector(`input[name="${fieldKey}"]`);
            if (hiddenInput && component) {
                hiddenInput.value = component.getValue() ?? '';
            }
        });

        const formData = new FormData(form);
        const data = {};

        for (const [, field] of this._getFieldMap()) {
            if (field.readOnly) continue;
            if (field.type === 'static-label') continue;
            // editableOnlyOnCreate fields render read-only outside create — nothing to collect.
            if (field.editableOnlyOnCreate && this.currentMode !== 'create') continue;

            // Special handling for annotated-reference-list
            if (field.type === 'annotated-reference-list') {
                const manager = this.annotatedMultiselectManagers[field.key];
                if (manager) {
                    data[field.key] = manager.getValue();
                    console.log("CollectionEntityForm.collectFormData %s (annotated): %s", field.key, JSON.stringify(data[field.key]));
                }
                continue;
            }

            // Single-select reference (ReferenceManager) — wrap value in array
            if (field.type === 'reference') {
                const mgr = this.referenceManagers[field.key];
                if (mgr) {
                    const val = mgr.getValue();
                    data[field.key] = val != null ? [val] : [];
                    console.log('CollectionEntityForm.collectFormData %s (reference): %s', field.key, JSON.stringify(data[field.key]));
                }
                continue;
            }

            // Special handling for reference-list with ReferenceListManager
            if (field.type === 'reference-list') {
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

        for (const [, field] of this._getFieldMap()) {
            if (field.readOnly) continue;
            if (field.type === 'static-label') continue;
            // editableOnlyOnCreate fields are immutable (read-only) outside create — don't validate.
            if (field.editableOnlyOnCreate && mode !== 'create') continue;

            const value = data[field.key];

            if (field.required && !value) {
                errors.push({ field: field.key, message: `${field.label} is required` });
            }

            if (field.validate) {
                const validation = await field.validate(value, data, this.context);
                if (!validation.valid) {
                    errors.push({ field: field.key, message: validation.message || `${field.label} is invalid` });
                }
            }
        }
        console.log('CollectionEntityForm.validateForm field-error-count: ', errors.length);

        const customValidation = await this.onValidate(data, this.currentMode, this.currentItem);
        console.log('CollectionEntityForm.validateForm customValidation: ', customValidation.valid);
        if (!customValidation.valid) {
            if (customValidation.errors) {
                errors.push(...customValidation.errors);
            } else if (customValidation.message) {
                errors.push({ message: customValidation.message });
            }
        }

        return { valid: errors.length === 0, errors };
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
    // CONFIG-DRIVEN RENDERING
    // ====================

    /**
     * Main renderer for layout-config-driven forms.
     * Called by generateForm() when getReadConfig() / getEditConfig() returns non-null.
     */
    async _generateFormFromConfig(config, mode, item, preserveTabIndex = false) {
        const fieldMap = this._getFieldMap();

        const activeTabIndex = preserveTabIndex
            ? (this.context?.currentTabIndex ?? this.currentTabIndex)
            : 0;

        // Visible sections for this mode
        const visibleSections = config.sections.filter(s =>
            this._isSectionVisibleFromConfig(s, item, mode)
        );

        // Tab headers
        let html = `<div class="form-tabs"><div class="tab-headers">`;
        visibleSections.forEach((section, idx) => {
            const isActive = idx === activeTabIndex;
            html += `<button type="button" class="tab-header ${isActive ? 'active' : ''}"
                             data-tab="${idx}">
                ${this.escapeHtml(section.title)}
            </button>`;
        });
        html += `</div><div class="tab-contents">`;

        // Tab panels
        for (let idx = 0; idx < visibleSections.length; idx++) {
            const section  = visibleSections[idx];
            const isActive = idx === activeTabIndex;
            html += `<div class="tab-panel ${isActive ? 'active' : ''}" data-tab="${idx}">`;
            for (const entry of section.fields) {
                html += await this._renderConfigEntry(entry, item, fieldMap, mode);
            }
            html += `</div>`;
        }

        html += `</div></div>`;
        return html;
    }

    /**
     * Build a flat Map<key, hydratedFieldDef> from the edit config.
     * Iterates all sections and row entries; calls hydrateField() on each.
     * Result is cached by _getFieldMap() — do not call directly.
     */
    _buildFieldMap() {
        const map = new Map();
        const editConfig = this.getEditConfig();
        if (!editConfig) return map;

        for (const section of editConfig.sections) {
            for (const entry of section.fields) {
                const entries = entry.row ? entry.row : [entry];
                for (const e of entries) {
                    if (e.key && !map.has(e.key)) {
                        map.set(e.key, this.hydrateField(e));
                    }
                }
            }
        }
        return map;
    }

    /**
     * Render a single layout entry — either a bare field or a { row: [...] } wrapper.
     */
    async _renderConfigEntry(entry, item, fieldMap, mode) {
        if (entry.row) {
            return await this._renderConfigRow(entry, item, fieldMap, mode);
        }
        if (!this._resolveEntryVisible(entry, item)) return '';
        const fieldDef = this._resolveFieldDef(entry, fieldMap);
        if (!fieldDef) return '';
        const value = this.getFieldValue(item, fieldDef);
        if (entry.hideIfNullOrEmpty && this._isNullOrEmpty(value)) return '';
        return await this.renderField(fieldDef, value, mode);
    }

    /**
     * True when a field value should count as "empty" for hideIfNullOrEmpty:
     * null/undefined, empty string, or empty array.
     */
    _isNullOrEmpty(value) {
        if (value == null) return true;
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'string') return value.trim() === '';
        return false;
    }

    /**
     * Render a { row: [...] } layout entry.
     * Single visible child → collapses to full-width. No visible children → emits nothing.
     */
    async _renderConfigRow(rowEntry, item, fieldMap, mode) {
        const rowEntries = rowEntry.row;
        const inline     = rowEntry.valueInline === true;

        const visibleEntries = rowEntries.filter(e => {
            if (!this._resolveEntryVisible(e, item)) return false;
            if (e.hideIfNullOrEmpty) {
                const fieldDef = fieldMap.get(e.key);
                if (fieldDef && this._isNullOrEmpty(this.getFieldValue(item, fieldDef))) return false;
            }
            return true;
        });
        if (visibleEntries.length === 0) return '';

        const rowClass = inline ? 'form-row form-row--inline' : 'form-row';

        // Single visible field: still wrap so inline styling applies, but no need for columns
        if (visibleEntries.length === 1 && !inline) {
            const fieldDef = this._resolveFieldDef(visibleEntries[0], fieldMap);
            if (!fieldDef) return '';
            return await this.renderField(fieldDef, this.getFieldValue(item, fieldDef), mode);
        }

        let html = `<div class="${rowClass}">`;
        for (const entry of visibleEntries) {
            const fieldDef = this._resolveFieldDef(entry, fieldMap);
            if (!fieldDef) continue;
            html += `<div class="form-row__col">`;
            html += await this.renderField(fieldDef, this.getFieldValue(item, fieldDef), mode);
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    /**
     * Merge a layout entry's overrides into the field def from the catalog.
     * Only readOnly is overridable from the layout.
     */
    _resolveFieldDef(entry, fieldMap) {
        const base = fieldMap.get(entry.key);
        if (!base) {
            console.warn(`[CollectionEntityForm] No field definition for key '${entry.key}'`);
            return null;
        }
        if (entry.readOnly === undefined) return base;
        return { ...base, readOnly: entry.readOnly };
    }

    /**
     * Evaluate a layout entry's visibleWhen against the current item.
     * Accepts: undefined (always visible), 'ON', 'OR', or a function (item) => bool.
     */
    _resolveEntryVisible(entry, item) {
        if (!entry.visibleWhen) return true;
        if (!item) return true;
        if (typeof entry.visibleWhen === 'function') return entry.visibleWhen(item);
        if (entry.visibleWhen === 'ON') return item.type === 'ON';
        if (entry.visibleWhen === 'OR') return item.type === 'OR';
        return true;
    }

    /**
     * A section is visible if:
     *  - its optional modes[] includes the current mode (or modes is absent), AND
     *  - at least one of its field entries is visible for the current item.
     */
    _isSectionVisibleFromConfig(section, item, mode) {
        if (section.modes && !section.modes.includes(mode)) return false;
        return section.fields.some(entry => {
            if (entry.row) return entry.row.some(e => this._resolveEntryVisible(e, item));
            return this._resolveEntryVisible(entry, item);
        });
    }

    /**
     * Attach confirmation-dialog interceptors to fields marked confirmOnChange: true
     * in the edit config. Call once the modal DOM is ready (from onModalReady or
     * immediately after super.showEditModal / super.showCreateModal resolves).
     *
     * @param {{ sections: Array } | null} editConfig
     */
    _attachConfirmOnChangeListeners(editConfig) {
        if (!this.currentModal || !editConfig) return;
        // Edit-only: a confirmOnChange field guards a *re-assignment* from an existing
        // value. In create mode there is no prior value (and currentItem is null), so
        // the confirmation is both semantically wrong and would read a placeholder type.
        if (this.currentMode !== 'edit') return;
        for (const section of editConfig.sections) {
            for (const entry of section.fields) {
                const entries = entry.row ? entry.row : [entry];
                for (const e of entries) {
                    if (!e.confirmOnChange) continue;
                    const input = this.currentModal.querySelector(`[name="${e.key}"]`);
                    if (!input) continue;
                    let prevValue = input.value;
                    input.addEventListener('focus', () => { prevValue = input.value; });
                    input.addEventListener('change', async (evt) => {
                        const type = this.currentItem?.type ?? 'item';
                        const confirmed = await odipConfirm(
                            `Do you really want to re-assign this ${type} to another domain?`
                        );
                        if (!confirmed) {
                            input.value = prevValue;
                            evt.stopImmediatePropagation();
                        } else {
                            prevValue = input.value;
                        }
                    });
                }
            }
        }
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