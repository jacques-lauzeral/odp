/**
 * AnnotatedMultiselectManager
 *
 * Manages a multiselect field where each selected item can have an optional note/annotation.
 * Used for document references and other annotated relationships.
 *
 * Data Structure: Array of {id: string, title: string, note: string|null}
 *
 * Features:
 * - Dropdown selector for adding items
 * - Selected items displayed as tags with note indicators
 * - Modal popup for editing notes (max 200 chars)
 * - Visual distinction between items with/without notes
 */

export default class AnnotatedMultiselectManager {
    constructor(config) {
        // Validate required config
        if (!config.fieldId) {
            throw new Error('AnnotatedMultiselectManager requires fieldId');
        }

        this.config = {
            fieldId: config.fieldId,
            options: config.options || [],              // {value, label}[]
            initialValue: config.initialValue || [],    // {id, title, note}[]
            maxNoteLength: config.maxNoteLength || 200,
            placeholder: config.placeholder || 'Select items...',
            noteLabel: config.noteLabel || 'Note (optional)',
            helpText: config.helpText || '',
            onChange: config.onChange || (() => {}),
            readOnly: config.readOnly || false
        };

        // Internal state
        this.selectedItems = this.normalizeInitialValue(config.initialValue);
        this.container = null;
        this.modal = null;
        this.editingItemId = null;

        // Bound event handlers for cleanup
        this.boundHandlers = {
            dropdownChange: null,
            removeClick: null,
            noteClick: null,
            modalCancel: null,
            modalSave: null,
            modalClose: null,
            noteInput: null
        };
    }

    // ====================
    // INITIALIZATION
    // ====================

    normalizeInitialValue(value) {
        if (!value || !Array.isArray(value)) return [];

        return value.map(item => ({
            id: item.id,
            title: item.title || item.name || item.id,
            note: this.normalizeNote(item.note)
        }));
    }

    normalizeNote(note) {
        if (!note || typeof note !== 'string') return null;
        const trimmed = note.trim();
        return trimmed === '' ? null : trimmed;
    }

    // ====================
    // RENDERING
    // ====================

    render(container) {
        this.container = container;

        const html = `
            <div class="annotated-multiselect" id="${this.config.fieldId}">
                ${this.renderDropdown()}
                ${this.renderSelectedItems()}
                ${this.renderHiddenInput()}
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents();

        return container;
    }

    renderDropdown() {
        if (this.config.readOnly) return '';

        const availableOptions = this.getAvailableOptions();

        return `
            <div class="multiselect-dropdown">
                <select 
                    class="form-control" 
                    id="${this.config.fieldId}-dropdown"
                    ${availableOptions.length === 0 ? 'disabled' : ''}>
                    <option value="">${this.config.placeholder}</option>
                    ${availableOptions.map(opt => `
                        <option value="${opt.value}">${this.escapeHtml(opt.label)}</option>
                    `).join('')}
                </select>
                ${this.config.helpText ? `
                    <small class="form-text text-muted">${this.escapeHtml(this.config.helpText)}</small>
                ` : ''}
            </div>
        `;
    }

    renderSelectedItems() {
        if (this.selectedItems.length === 0) {
            return `
                <div class="selected-items-container" id="${this.config.fieldId}-selected">
                    <div class="empty-state-inline">
                        <span class="text-muted">No items selected</span>
                    </div>
                </div>
            `;
        }

        return `
            <div class="selected-items-container" id="${this.config.fieldId}-selected">
                <div class="selected-items-label">Selected Items:</div>
                <div class="selected-items-list">
                    ${this.selectedItems.map(item => this.renderSelectedItem(item)).join('')}
                </div>
            </div>
        `;
    }

    renderSelectedItem(item) {
        const hasNote = item.note !== null && item.note !== '';
        const noteIconClass = hasNote ? 'has-note' : 'no-note';
        const noteTitle = hasNote ? `Note: ${item.note}` : 'Add note';

        return `
            <div class="selected-item-tag" data-item-id="${item.id}">
                <span class="item-title" title="${this.escapeHtml(item.title)}">
                    ${this.escapeHtml(this.truncate(item.title, 40))}
                </span>
                ${!this.config.readOnly ? `
                    <button 
                        type="button" 
                        class="btn-note ${noteIconClass}" 
                        data-item-id="${item.id}"
                        title="${this.escapeHtml(noteTitle)}">
                        📝
                    </button>
                    <button 
                        type="button" 
                        class="btn-remove" 
                        data-item-id="${item.id}"
                        title="Remove">
                        ×
                    </button>
                ` : hasNote ? `
                    <span class="note-indicator" title="${this.escapeHtml(item.note)}">📝</span>
                ` : ''}
            </div>
        `;
    }

    renderHiddenInput() {
        // Store the actual data in a hidden input for form submission
        const jsonValue = JSON.stringify(this.selectedItems);
        return `
            <input 
                type="hidden" 
                id="${this.config.fieldId}-data" 
                name="${this.config.fieldId}"
                value='${this.escapeHtml(jsonValue)}'>
        `;
    }

    // ====================
    // EVENT HANDLING
    // ====================

    bindEvents() {
        if (this.config.readOnly) return;

        // Dropdown change - add item
        const dropdown = this.container.querySelector(`#${this.config.fieldId}-dropdown`);
        if (dropdown) {
            this.boundHandlers.dropdownChange = (e) => this.handleAddItem(e);
            dropdown.addEventListener('change', this.boundHandlers.dropdownChange);
        }

        // Delegate events for dynamic buttons
        const selectedContainer = this.container.querySelector(`#${this.config.fieldId}-selected`);
        if (selectedContainer) {
            this.boundHandlers.removeClick = (e) => {
                if (e.target.classList.contains('btn-remove')) {
                    const itemId = e.target.dataset.itemId;
                    this.handleRemoveItem(itemId);
                }
            };

            this.boundHandlers.noteClick = (e) => {
                if (e.target.classList.contains('btn-note')) {
                    const itemId = e.target.dataset.itemId;
                    this.handleEditNote(itemId);
                }
            };

            selectedContainer.addEventListener('click', this.boundHandlers.removeClick);
            selectedContainer.addEventListener('click', this.boundHandlers.noteClick);
        }
    }

    handleAddItem(event) {
        const dropdown = event.target;
        const selectedValue = dropdown.value;

        if (!selectedValue) return;

        // Find option details
        const option = this.config.options.find(opt => opt.value === selectedValue);
        if (!option) return;

        // Check if already selected
        if (this.selectedItems.some(item => item.id === selectedValue)) {
            dropdown.value = '';
            return;
        }

        // Add new item
        this.selectedItems.push({
            id: selectedValue,
            title: option.label,
            note: null
        });

        // Reset dropdown
        dropdown.value = '';

        // Refresh display
        this.refresh();

        // Trigger change callback
        this.config.onChange(this.getValue());
    }

    handleRemoveItem(itemId) {
        this.selectedItems = this.selectedItems.filter(item => item.id !== itemId);

        // Refresh display
        this.refresh();

        // Trigger change callback
        this.config.onChange(this.getValue());
    }

    handleEditNote(itemId) {
        const item = this.selectedItems.find(i => i.id === itemId);
        if (!item) return;

        this.showNoteModal(item);
    }

    // ====================
    // MODAL HANDLING
    // ====================

    showNoteModal(item) {
        this.editingItemId = item.id;

        const modalHtml = this.renderNoteModal(item);

        // Create modal element
        const modalDiv = document.createElement('div');
        modalDiv.innerHTML = modalHtml;
        this.modal = modalDiv.firstElementChild;

        // Append to body
        document.body.appendChild(this.modal);

        // Bind modal events
        this.bindModalEvents();

        // Focus textarea
        setTimeout(() => {
            const textarea = this.modal.querySelector('#note-input');
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
        }, 100);
    }

    renderNoteModal(item) {
        const currentNote = item.note || '';
        const charCount = currentNote.length;

        return `
            <div class="modal-overlay" data-modal="note-editor">
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h4>Add Note for "${this.escapeHtml(this.truncate(item.title, 50))}"</h4>
                        <button type="button" class="modal-close" data-action="close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="note-input">${this.config.noteLabel}</label>
                            <textarea 
                                id="note-input" 
                                class="form-control" 
                                rows="4" 
                                maxlength="${this.config.maxNoteLength}"
                                placeholder="Add context about this reference...">${this.escapeHtml(currentNote)}</textarea>
                            <small class="form-text">
                                <span id="char-count">${charCount}</span>/${this.config.maxNoteLength} characters
                            </small>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                        <button type="button" class="btn btn-primary" data-action="save">Save</button>
                    </div>
                </div>
            </div>
        `;
    }

    bindModalEvents() {
        if (!this.modal) return;

        // Character counter
        const textarea = this.modal.querySelector('#note-input');
        const charCount = this.modal.querySelector('#char-count');

        if (textarea && charCount) {
            this.boundHandlers.noteInput = () => {
                charCount.textContent = textarea.value.length;
            };
            textarea.addEventListener('input', this.boundHandlers.noteInput);
        }

        // Cancel button
        const cancelBtn = this.modal.querySelector('[data-action="cancel"]');
        if (cancelBtn) {
            this.boundHandlers.modalCancel = () => this.closeNoteModal();
            cancelBtn.addEventListener('click', this.boundHandlers.modalCancel);
        }

        // Save button
        const saveBtn = this.modal.querySelector('[data-action="save"]');
        if (saveBtn) {
            this.boundHandlers.modalSave = () => this.saveNote();
            saveBtn.addEventListener('click', this.boundHandlers.modalSave);
        }

        // Close button
        const closeBtn = this.modal.querySelector('[data-action="close"]');
        if (closeBtn) {
            this.boundHandlers.modalClose = () => this.closeNoteModal();
            closeBtn.addEventListener('click', this.boundHandlers.modalClose);
        }

        // ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeNoteModal();
            }
        };
        document.addEventListener('keydown', escHandler);

        // Store for cleanup
        this.modal._escHandler = escHandler;

        // Click overlay to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeNoteModal();
            }
        });
    }

    saveNote() {
        if (!this.modal || !this.editingItemId) return;

        const textarea = this.modal.querySelector('#note-input');
        if (!textarea) return;

        const noteText = textarea.value.trim();

        // Find and update item
        const item = this.selectedItems.find(i => i.id === this.editingItemId);
        if (item) {
            item.note = this.normalizeNote(noteText);
        }

        // Close modal
        this.closeNoteModal();

        // Refresh display
        this.refresh();

        // Trigger change callback
        this.config.onChange(this.getValue());
    }

    closeNoteModal() {
        if (!this.modal) return;

        // Remove ESC handler
        if (this.modal._escHandler) {
            document.removeEventListener('keydown', this.modal._escHandler);
        }

        // Remove modal
        this.modal.remove();
        this.modal = null;
        this.editingItemId = null;
    }

    // ====================
    // REFRESH & UPDATE
    // ====================

    refresh() {
        if (!this.container) return;

        const selectedContainer = this.container.querySelector(`#${this.config.fieldId}-selected`);
        if (selectedContainer) {
            selectedContainer.outerHTML = this.renderSelectedItems();
        }

        const hiddenInput = this.container.querySelector(`#${this.config.fieldId}-data`);
        if (hiddenInput) {
            hiddenInput.value = JSON.stringify(this.selectedItems);
        }

        // Update dropdown options
        if (!this.config.readOnly) {
            const dropdown = this.container.querySelector(`#${this.config.fieldId}-dropdown`);
            if (dropdown) {
                const currentValue = dropdown.value;
                const availableOptions = this.getAvailableOptions();

                dropdown.innerHTML = `
                    <option value="">${this.config.placeholder}</option>
                    ${availableOptions.map(opt => `
                        <option value="${opt.value}">${this.escapeHtml(opt.label)}</option>
                    `).join('')}
                `;

                dropdown.disabled = availableOptions.length === 0;
                dropdown.value = currentValue;
            }
        }

        // Re-bind events for new elements
        this.unbindContainerEvents();
        this.bindEvents();
    }

    unbindContainerEvents() {
        const selectedContainer = this.container?.querySelector(`#${this.config.fieldId}-selected`);
        if (selectedContainer && this.boundHandlers.removeClick) {
            selectedContainer.removeEventListener('click', this.boundHandlers.removeClick);
        }
        if (selectedContainer && this.boundHandlers.noteClick) {
            selectedContainer.removeEventListener('click', this.boundHandlers.noteClick);
        }
    }

    // ====================
    // DATA ACCESS
    // ====================

    getValue() {
        // Return array of {id, title, note}
        return this.selectedItems.map(item => ({
            id: item.id,
            title: item.title,
            note: item.note
        }));
    }

    setValue(value) {
        this.selectedItems = this.normalizeInitialValue(value);
        this.refresh();
    }

    getAvailableOptions() {
        // Filter out already selected items
        const selectedIds = new Set(this.selectedItems.map(item => item.id));
        return this.config.options.filter(opt => !selectedIds.has(opt.value));
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
        return div.innerHTML;
    }

    // ====================
    // CLEANUP
    // ====================

    destroy() {
        // Unbind container events
        this.unbindContainerEvents();

        // Unbind dropdown
        const dropdown = this.container?.querySelector(`#${this.config.fieldId}-dropdown`);
        if (dropdown && this.boundHandlers.dropdownChange) {
            dropdown.removeEventListener('change', this.boundHandlers.dropdownChange);
        }

        // Close any open modal
        this.closeNoteModal();

        // Clear references
        this.container = null;
        this.selectedItems = [];
        this.boundHandlers = {};
    }
}