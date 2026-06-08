import { normalizeId, idsEqual } from '/shared/src/index.js';
import ReferenceManager from './reference-manager.js';

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
            nodes: config.nodes || ReferenceManager.buildTreeNodes(config.options || []),
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
        this._pickerRM = null;   // ReferenceManager instance for tree picker
        this.boundHandlers = {};
    }

    normalizeInitialValue(value) {
        if (!value || !Array.isArray(value)) return [];
        return value.map(item => ({
            id: item.id,
            title: item.title || item.id,
            note: this.normalizeNote(item.note)
        }));
    }

    normalizeNote(note) {
        if (!note || typeof note !== 'string') return undefined;
        const trimmed = note.trim();
        return trimmed === '' ? undefined : trimmed;
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
                            <th>Item</th>
                            <th>Note</th>
                            ${!this.config.readOnly ? '<th>Actions</th>' : ''}
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
        const colspan = this.config.readOnly ? 2 : 3;
        return `
            <tr class="empty-row">
                <td colspan="${colspan}" class="empty-state" style="padding: var(--space-3);">No items selected</td>
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
                        <textarea
                            class="odip-input edit-note-input"
                            data-item-id="${item.id}"
                            rows="3"
                            maxlength="${this.config.maxNoteLength}">${this.escapeHtml(item.note || '')}</textarea>
                    </td>
                    <td class="cell-actions">
                        <button 
                            type="button" 
                            class="odip-btn odip-btn--primary btn-save" 
                            data-item-id="${item.id}">
                            Save
                        </button>
                        <button 
                            type="button" 
                            class="odip-btn btn-cancel" 
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
            `<span class="note-text" style="white-space: pre-line;">${this.escapeHtml(item.note)}</span>` :
            `<span class="note-empty">No note</span>`
        }
                </td>
                ${!this.config.readOnly ? `
                <td class="cell-actions">
                    <button 
                        type="button" 
                        class="odip-btn btn-edit" 
                        data-item-id="${item.id}">
                        Edit
                    </button>
                    <button 
                        type="button" 
                        class="odip-btn odip-btn--danger btn-remove" 
                        data-item-id="${item.id}">
                        Remove
                    </button>
                </td>
                ` : ''}
            </tr>
        `;
    }

    renderFooter() {
        if (this.config.readOnly) return '';

        return `
            <div class="annotated-footer">
                <div class="footer-picker" id="${this.config.fieldId}-picker-host">
                    <!-- ReferenceManager tree picker mounted here -->
                </div>
                <div class="footer-note">
                    <input 
                        type="text" 
                        class="odip-input" 
                        id="${this.config.fieldId}-note"
                        placeholder="${this.config.noteLabel}"
                        maxlength="${this.config.maxNoteLength}">
                </div>
                <div class="footer-action">
                    <button 
                        type="button" 
                        class="odip-btn odip-btn--primary" 
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

        // Mount ReferenceManager tree picker into footer picker host
        this._mountPicker();

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

    _mountPicker() {
        const host = this.container.querySelector(`#${this.config.fieldId}-picker-host`);
        if (!host) return;

        // Destroy previous instance if re-mounting
        this._pickerRM?.destroy();

        const availableNodes = this._getAvailableNodes();

        this._pickerRM = new ReferenceManager({
            fieldId:     `${this.config.fieldId}-picker`,
            nodes:       availableNodes,
            placeholder: this.config.placeholder,
            noneLabel:   'Nothing selected',
            readOnly:    false,
        });
        this._pickerRM.render(host);
    }

    _remountPicker() {
        // Rebuild available nodes (excludes already-selected items) and re-mount picker
        this._mountPicker();
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
        const noteInput = this.container.querySelector(`#${this.config.fieldId}-note`);
        if (!noteInput) return;

        const selectedValue = this._pickerRM?.getValue();
        if (!selectedValue && selectedValue !== 0) {
            alert('Please select an item');
            return;
        }

        if (this.selectedItems.some(item => idsEqual(item.id, selectedValue))) {
            alert('This item is already selected');
            return;
        }

        // Find label by walking the nodes tree
        const node = this._findNodeByValue(selectedValue, this.config.nodes);
        const label = node ? node.label : String(selectedValue);

        this.selectedItems.push({
            id: selectedValue,
            title: label,
            note: this.normalizeNote(noteInput.value)
        });

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

        // Remount picker with updated available nodes (excludes newly added items)
        this._remountPicker();

        // Update hidden input
        const hiddenInput = this.container.querySelector(`#${this.config.fieldId}-data`);
        if (hiddenInput) {
            hiddenInput.value = JSON.stringify(this.selectedItems);
        }
    }

    getValue() {
        return this.selectedItems.map(item => {
            const result = {
                id: item.id,
                title: item.title
            };
            if (item.note !== undefined) {
                result.note = item.note;
            }
            return result;
        });
    }

    setValue(value) {
        this.selectedItems = this.normalizeInitialValue(value);
        this.editingRowId = null;
        this.refresh();
    }

    /**
     * Return a copy of the node tree with already-selected items removed.
     * Non-selectable parent nodes are preserved even when all their children
     * are selected, so the hierarchy remains navigable.
     */
    _getAvailableNodes() {
        const selectedIds = new Set(this.selectedItems.map(item => normalizeId(item.id)));
        return this._filterAvailableNodes(this.config.nodes, selectedIds);
    }

    _filterAvailableNodes(nodes, selectedIds) {
        return nodes.map(node => {
            const kids = node.children ?? node._children ?? [];
            const filteredKids = kids.length ? this._filterAvailableNodes(kids, selectedIds) : [];
            // Selectable and already selected — suppress this node
            if (node.value != null && selectedIds.has(normalizeId(node.value))) {
                // Keep as non-selectable header if it has remaining children
                if (filteredKids.length) {
                    return { ...node, value: null, children: filteredKids, _children: undefined };
                }
                return null;
            }
            return { ...node, children: filteredKids.length ? filteredKids : (kids.length ? kids : undefined), _children: undefined };
        }).filter(Boolean);
    }

    /**
     * Walk the full node tree to find a node by value.
     */
    _findNodeByValue(value, nodes) {
        for (const node of nodes) {
            if (node.value != null && idsEqual(node.value, value)) return node;
            const kids = node.children ?? node._children ?? [];
            if (kids.length) {
                const found = this._findNodeByValue(value, kids);
                if (found) return found;
            }
        }
        return null;
    }

    // Kept for backward compatibility — callers that pass options still work
    getAvailableOptions() {
        return this._getAvailableNodes()
            .filter(n => n.value != null)
            .map(n => ({ value: n.value, label: n.label }));
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

        this._pickerRM?.destroy();
        this._pickerRM = null;

        this.container = null;
        this.selectedItems = [];
        this.boundHandlers = {};
        this.editingRowId = null;
    }
}