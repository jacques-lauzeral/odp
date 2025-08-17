/**
 * CollectionEntityForm - Business-agnostic form rendering and modal management
 * Base class for entity-specific forms using inheritance
 */
export class CollectionEntityForm {
    constructor(entityConfig, context = {}) {
        this.entityConfig = entityConfig;
        this.endpoint = entityConfig?.endpoint;
        this.context = context;

        // Modal reference
        this.currentModal = null;
        this.currentMode = null;
        this.currentItem = null;
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
    }

    async showEditModal(item) {
        if (!item) {
            console.warn('No item provided for editing');
            return;
        }

        this.currentMode = 'edit';
        this.currentItem = item;
        const transformedItem = this.transformDataForEdit(item);
        const form = await this.generateForm('edit', transformedItem);
        this.showModal(form, 'edit');
    }

    async showReadOnlyModal(item) {
        if (!item) {
            console.warn('No item provided for viewing');
            return;
        }

        this.currentMode = 'read';
        this.currentItem = item;
        const transformedItem = this.transformDataForEdit(item);
        const form = await this.generateForm('read', transformedItem);
        this.showModal(form, 'read');
    }

    async generateReadOnlyView(item) {
        const transformedItem = this.transformDataForEdit(item);
        return await this.generateForm('read', transformedItem);
    }

    // ====================
    // FORM GENERATION
    // ====================

    async generateForm(mode, item = null) {
        const fields = this.getFieldDefinitions();
        const sections = this.groupFieldsIntoSections(fields);

        let html = '';

        for (const section of sections) {
            const visibleFields = this.getVisibleFields(section.fields || [section], mode);
            if (visibleFields.length === 0) continue;

            if (section.title) {
                html += `<fieldset class="form-section">
                    <legend>${this.escapeHtml(section.title)}</legend>`;
            }

            for (const field of visibleFields) {
                html += await this.renderField(field, this.getFieldValue(item, field), mode);
            }

            if (section.title) {
                html += `</fieldset>`;
            }
        }

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
                const size = field.size || 4;
                let multiHtml = `<select 
                    id="${fieldId}" 
                    name="${field.key}" 
                    class="form-control" 
                    multiple 
                    size="${size}">`;

                const multiOptions = await this.getFieldOptions(field);
                const selectedValues = Array.isArray(value) ? value : [];

                for (const option of multiOptions) {
                    const optValue = typeof option === 'object' ? option.value : option;
                    const optLabel = typeof option === 'object' ? option.label : option;
                    const selected = selectedValues.includes(optValue) ? 'selected' : '';
                    multiHtml += `<option value="${this.escapeHtml(optValue)}" ${selected}>
                        ${this.escapeHtml(optLabel)}
                    </option>`;
                }
                multiHtml += `</select>`;
                return multiHtml;

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

        // Default
        return this.escapeHtml(value.toString());
    }

    // ====================
    // MODAL MANAGEMENT
    // ====================

    showModal(formContent, mode) {
        const title = this.getFormTitle(mode);
        const showFooter = mode !== 'read';

        const modalHtml = `
            <div class="modal-overlay" id="${mode}-modal">
                <div class="modal modal-large">
                    <div class="modal-header">
                        <h3 class="modal-title">${this.escapeHtml(title)}</h3>
                        <button class="modal-close" data-action="close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="${mode}-form" novalidate>
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

        // Remove any existing modal
        this.closeModal();

        // Add new modal
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.currentModal = document.getElementById(`${mode}-modal`);

        // Attach events
        this.attachModalEvents();

        // Focus first input
        if (mode !== 'read') {
            this.focusFirstInput();
        }
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

        // Escape key
        this.escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.handleCancel();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);

        // Form validation on input
        const form = this.currentModal.querySelector('form');
        if (form) {
            form.addEventListener('input', (e) => {
                this.clearFieldError(e.target);
            });
        }
    }

    closeModal() {
        if (this.currentModal) {
            this.currentModal.remove();
            this.currentModal = null;
        }

        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }

        this.currentMode = null;
        this.currentItem = null;
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

            if (field.type === 'multiselect') {
                // Collect all selected options
                const select = form.querySelector(`[name="${field.key}"]`);
                if (select) {
                    // Convert to numbers if they look like IDs
                    data[field.key] = Array.from(select.selectedOptions).map(opt => {
                        const val = opt.value;
                        // Only convert to number if it's a numeric string
                        return /^\d+$/.test(val) ? parseInt(val, 10) : val;
                    });
                }
            } else if (field.type === 'checkbox') {
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
            if (field.required && (mode==='create' || !field.editableOnlyOnCreate) && !value) {
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
                messageEl.style.display = 'none';
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

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}