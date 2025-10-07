import { normalizeId, idsEqual } from '../../../../shared/src/index.js';

/**
 * AnnotatedMultiselectManager
 *
 * Manages a multiselect field where each selected item can have an optional note/annotation.
 * Used for document references and other annotated relationships.
 *
 * Data Structure: Array of {id: string|number, title: string, note: string|null}
 *
 * Features:
 * - Table view with inline editing per row
 * - Footer controls for adding new items
 * - Each row independently editable
 */

export default class AnnotatedMultiselectManager {
    constructor(config) {
        if (!config.fieldId) {
            throw new Error('AnnotatedMultiselectManager requires fieldId');
        }

        this.config = {
            fieldId: config.fieldId,
            options: config.options || [],
            initialValue: config.initialValue || [],
            maxNoteLength: config.maxNoteLength || 200,
            placeholder: config.placeholder || 'Select items...',
            noteLabel: config.noteLabel || 'Note (optional)',
            onChange: config.onChange || (() => {}),
            readOnly: config.readOnly || false
        };

        this.selectedItems = this.normalizeInitialValue(config.initialValue);
        this.container = null;
        this.editingRowId = null;
        this.boundHandlers = {};
    }

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

    render(container) {
        this.container = container;

        const html = `
            <div class="annotated-multiselect" id="${this.config.fieldId}">
                ${this.renderTable()}
                ${this.renderFooter()}
                ${this.renderHiddenInput()}
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents();
        return container;
    }

    renderTable() {
        return `
            <div class="annotated-table-container">
                <table class="annotated-table">
                    <thead>
                        <tr>
                            <th>Document</th>
                            <th>Note</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="${this.config.fieldId}-tbody">
                        ${this.selectedItems.length === 0 ?
            this.renderEmptyRow() :
            this.selectedItems.map(item => this.renderTableRow(item)).join('')
        }
                    </tbody>
                </table>
            </div>
        `;
    }

    renderEmptyRow() {
        return `
            <tr class="empty-row">
                <td colspan="3" class="empty-state">No documents selected</td>
            </tr>
        `;
    }

    renderTableRow(item) {
        const isEditing = this.editingRowId !== null && idsEqual(this.editingRowId, item.id);

        if (isEditing) {
            return `
                <tr class="table-row editing" data-item-id="${item.id}">
                    <td class="cell-document">
                        <span class="document-title">${this.escapeHtml(item.title)}</span>
                    </td>
                    <td class="cell-note">
                        <input 
                            type="text" 
                            class="form-control form-control-sm edit-note-input" 
                            data-item-id="${item.id}"
                            value="${this.escapeHtml(item.note || '')}"
                            maxlength="${this.config.maxNoteLength}">
                    </td>
                    <td class="cell-actions">
                        <button 
                            type="button" 
                            class="btn btn-sm btn-primary btn-save" 
                            data-item-id="${item.id}">
                            Save
                        </button>
                        <button 
                            type="button" 
                            class="btn btn-sm btn-secondary btn-cancel" 
                            data-item-id="${item.id}">
                            Cancel
                        </button>
                    </td>
                </tr>
            `;
        }

        return `
            <tr class="table-row" data-item-id="${item.id}">
                <td class="cell-document">
                    <span class="document-title">${this.escapeHtml(item.title)}</span>
                </td>
                <td class="cell-note">
                    ${item.note ?
            `<span class="note-text">${this.escapeHtml(item.note)}</span>` :
            `<span class="note-empty">No note</span>`
        }
                </td>
                <td class="cell-actions">
                    ${!this.config.readOnly ? `
                        <button 
                            type="button" 
                            class="btn btn-sm btn-secondary btn-edit" 
                            data-item-id="${item.id}">
                            Edit
                        </button>
                        <button 
                            type="button" 
                            class="btn btn-sm btn-danger btn-remove" 
                            data-item-id="${item.id}">
                            Remove
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }

    renderFooter() {
        if (this.config.readOnly) return '';

        const availableOptions = this.getAvailableOptions();

        return `
            <div class="annotated-footer">
                <div class="footer-selector">
                    <select 
                        class="form-control form-control-sm" 
                        id="${this.config.fieldId}-dropdown"
                        ${availableOptions.length === 0 ? 'disabled' : ''}>
                        <option value="">${this.config.placeholder}</option>
                        ${availableOptions.map(opt => `
                            <option value="${opt.value}">${this.escapeHtml(opt.label)}</option>
                        `).join('')}
                    </select>
                </div>
                <div class="footer-note">
                    <input 
                        type="text" 
                        class="form-control form-control-sm" 
                        id="${this.config.fieldId}-note"
                        placeholder="${this.config.noteLabel}"
                        maxlength="${this.config.maxNoteLength}">
                </div>
                <div class="footer-action">
                    <button 
                        type="button" 
                        class="btn btn-sm btn-primary" 
                        id="${this.config.fieldId}-add">
                        Add
                    </button>
                </div>
            </div>
        `;
    }

    renderHiddenInput() {
        const jsonValue = JSON.stringify(this.selectedItems);
        return `
            <input 
                type="hidden" 
                id="${this.config.fieldId}-data" 
                name="${this.config.fieldId}"
                value='${this.escapeHtml(jsonValue)}'>
        `;
    }

    bindEvents() {
        if (this.config.readOnly) return;

        // Footer add button
        const addBtn = this.container.querySelector(`#${this.config.fieldId}-add`);
        if (addBtn) {
            this.boundHandlers.addClick = () => this.handleAdd();
            addBtn.addEventListener('click', this.boundHandlers.addClick);
        }

        // Delegate table events
        const tbody = this.container.querySelector(`#${this.config.fieldId}-tbody`);
        if (tbody) {
            this.boundHandlers.tableClick = (e) => this.handleTableClick(e);
            tbody.addEventListener('click', this.boundHandlers.tableClick);
        }
    }

    handleTableClick(e) {
        const target = e.target;
        const itemIdStr = target.dataset.itemId;

        if (!itemIdStr) return;

        // Normalize ID using shared utility
        const itemId = normalizeId(itemIdStr);

        if (target.classList.contains('btn-edit')) {
            this.handleEditRow(itemId);
        } else if (target.classList.contains('btn-save')) {
            this.handleSaveRow(itemId);
        } else if (target.classList.contains('btn-cancel')) {
            this.handleCancelEdit(itemId);
        } else if (target.classList.contains('btn-remove')) {
            this.handleRemoveRow(itemId);
        }
    }

    handleAdd() {
        const dropdown = this.container.querySelector(`#${this.config.fieldId}-dropdown`);
        const noteInput = this.container.querySelector(`#${this.config.fieldId}-note`);

        if (!dropdown || !noteInput) return;

        const selectedValue = dropdown.value;
        if (!selectedValue) {
            alert('Please select a document');
            return;
        }

        const option = this.config.options.find(opt => opt.value == selectedValue);
        if (!option) return;

        if (this.selectedItems.some(item => idsEqual(item.id, selectedValue))) {
            alert('This document is already selected');
            return;
        }

        this.selectedItems.push({
            id: option.value,
            title: option.label,
            note: this.normalizeNote(noteInput.value)
        });

        dropdown.value = '';
        noteInput.value = '';

        this.refresh();
        this.config.onChange(this.getValue());
    }

    handleEditRow(itemId) {
        this.editingRowId = itemId;
        this.refreshTable();
    }

    handleSaveRow(itemId) {
        const input = this.container.querySelector(`.edit-note-input[data-item-id="${itemId}"]`);
        if (!input) return;

        const item = this.selectedItems.find(i => idsEqual(i.id, itemId));
        if (item) {
            item.note = this.normalizeNote(input.value);
        }

        this.editingRowId = null;
        this.refreshTable();
        this.config.onChange(this.getValue());
    }

    handleCancelEdit(itemId) {
        this.editingRowId = null;
        this.refreshTable();
    }

    handleRemoveRow(itemId) {
        this.selectedItems = this.selectedItems.filter(item => !idsEqual(item.id, itemId));

        if (idsEqual(this.editingRowId, itemId)) {
            this.editingRowId = null;
        }

        this.refresh();
        this.config.onChange(this.getValue());
    }

    refreshTable() {
        const tbody = this.container.querySelector(`#${this.config.fieldId}-tbody`);
        if (tbody) {
            tbody.innerHTML = this.selectedItems.length === 0 ?
                this.renderEmptyRow() :
                this.selectedItems.map(item => this.renderTableRow(item)).join('');
        }
    }

    refresh() {
        this.refreshTable();

        // Update footer dropdown
        const dropdown = this.container.querySelector(`#${this.config.fieldId}-dropdown`);
        if (dropdown) {
            const availableOptions = this.getAvailableOptions();
            dropdown.innerHTML = `
                <option value="">${this.config.placeholder}</option>
                ${availableOptions.map(opt => `
                    <option value="${opt.value}">${this.escapeHtml(opt.label)}</option>
                `).join('')}
            `;
            dropdown.disabled = availableOptions.length === 0;
        }

        // Update hidden input
        const hiddenInput = this.container.querySelector(`#${this.config.fieldId}-data`);
        if (hiddenInput) {
            hiddenInput.value = JSON.stringify(this.selectedItems);
        }
    }

    getValue() {
        return this.selectedItems.map(item => ({
            id: item.id,
            title: item.title,
            note: item.note
        }));
    }

    setValue(value) {
        this.selectedItems = this.normalizeInitialValue(value);
        this.editingRowId = null;
        this.refresh();
    }

    getAvailableOptions() {
        const selectedIds = new Set(this.selectedItems.map(item => item.id));
        return this.config.options.filter(opt => !selectedIds.has(opt.value));
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        const addBtn = this.container?.querySelector(`#${this.config.fieldId}-add`);
        if (addBtn && this.boundHandlers.addClick) {
            addBtn.removeEventListener('click', this.boundHandlers.addClick);
        }

        const tbody = this.container?.querySelector(`#${this.config.fieldId}-tbody`);
        if (tbody && this.boundHandlers.tableClick) {
            tbody.removeEventListener('click', this.boundHandlers.tableClick);
        }

        this.container = null;
        this.selectedItems = [];
        this.boundHandlers = {};
        this.editingRowId = null;
    }
}