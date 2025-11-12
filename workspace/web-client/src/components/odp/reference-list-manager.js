import { normalizeId, idsEqual } from '../../../../shared/src/index.js';

/**
 * ReferenceListManager
 *
 * Manages a multiselect field with inline chip display and search popup.
 *
 * Default view: Inline list of removable chips + Add button
 * On Add click: Search popup appears with filter input and results
 */

export default class ReferenceListManager {
    constructor(config) {
        if (!config.fieldId) {
            throw new Error('ReferenceListManager requires fieldId');
        }

        this.config = {
            fieldId: config.fieldId,
            options: config.options || [],           // [{value, label}, ...]
            initialValue: config.initialValue || [], // [id1, id2, ...]
            placeholder: config.placeholder || 'Search items...',
            emptyMessage: config.emptyMessage || 'No items selected',
            onChange: config.onChange || (() => {}),
            readOnly: config.readOnly || false
        };

        this.selectedIds = this.normalizeInitialValue(config.initialValue);
        this.container = null;
        this.searchActive = false;
        this.searchTerm = '';
        this.boundHandlers = {};
    }

    normalizeInitialValue(value) {
        if (!value || !Array.isArray(value)) return [];

        return value.map((item, index) => {
            if (typeof item !== 'object' || item === null) {
                throw new Error(`Expected object at index ${index}, got: ${typeof item}`);
            }

            if (item.id === undefined) {
                throw new Error(`Object at index ${index} does not have id property: ${JSON.stringify(item)}`);
            }

            return normalizeId(item.id);
        });
    }

    render(container) {
        this.container = container;

        const html = `
            <div class="reference-list-manager" id="${this.config.fieldId}">
                <div class="reference-list-inline" id="${this.config.fieldId}-inline">
                    ${this.renderInlineContent()}
                </div>
                ${this.renderHiddenInput()}
            </div>
        `;

        container.innerHTML = html;
        this.bindEvents();
        return container;
    }

    renderInlineContent() {
        let html = '';

        // Render chips
        if (this.selectedIds.length === 0) {
            html += '<span class="empty-state-inline">No items selected</span>';
        } else {
            html += this.selectedIds.map(id => this.renderChip(id)).join('');
        }

        // Render buttons
        if (!this.config.readOnly) {
            html += this.renderButtons();
        }

        return html;
    }

    renderChip(id) {
        const option = this.config.options.find(opt => idsEqual(opt.value, id));

        if (!option) {
            throw new Error(`ReferenceListManager: Option not found for ID ${id}. This indicates a data consistency issue.`);
        }

        if (this.config.readOnly) {
            return `<span class="selected-chip">${this.escapeHtml(option.label)}</span>`;
        }

        return `
            <span class="selected-chip">
                ${this.escapeHtml(option.label)}
                <button 
                    type="button" 
                    class="chip-remove" 
                    data-item-id="${id}"
                    title="Remove">×</button>
            </span>
        `;
    }

    renderButtons() {
        const availableOptions = this.getAvailableOptions();
        const hasAvailable = availableOptions.length > 0;

        return `
            <button 
                type="button" 
                class="btn btn-sm btn-primary btn-add-inline" 
                ${!hasAvailable ? 'disabled' : ''}>
                + Add
            </button>
            ${this.selectedIds.length > 0 ? `
                <button 
                    type="button" 
                    class="btn btn-sm btn-secondary btn-clear-inline">
                    Clear All
                </button>
            ` : ''}
        `;
    }

    renderSearchPopup() {
        return `
            <div class="search-popup">
                <div class="search-popup-header">
                    <input 
                        type="text" 
                        class="form-control search-input" 
                        id="${this.config.fieldId}-search-input"
                        placeholder="${this.config.placeholder}"
                        value="${this.escapeHtml(this.searchTerm)}"
                        autocomplete="off">
                    <button 
                        type="button" 
                        class="btn btn-sm btn-secondary btn-cancel-search">
                        Cancel
                    </button>
                </div>
                <div class="search-popup-results">
                    ${this.renderSearchResults()}
                </div>
            </div>
        `;
    }

    renderSearchResults() {
        const filteredOptions = this.getFilteredOptions();

        if (filteredOptions.length === 0) {
            return `<div class="search-result-empty">${this.searchTerm ? 'No matching items found' : 'No items available'}</div>`;
        }

        // Limit to 50 results
        const maxDisplay = 50;
        const displayOptions = filteredOptions.slice(0, maxDisplay);
        const hasMore = filteredOptions.length > maxDisplay;

        let html = displayOptions.map(opt => `
            <div class="search-result-item" data-item-id="${opt.value}">
                ${this.escapeHtml(opt.label)}
            </div>
        `).join('');

        if (hasMore) {
            html += `<div class="search-result-more">... ${filteredOptions.length - maxDisplay} more (refine search)</div>`;
        }

        return html;
    }

    renderHiddenInput() {
        const jsonValue = JSON.stringify(this.selectedIds);
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

        const inlineContainer = this.container.querySelector(`#${this.config.fieldId}-inline`);
        if (inlineContainer) {
            this.boundHandlers.inlineClick = (e) => this.handleInlineClick(e);
            inlineContainer.addEventListener('click', this.boundHandlers.inlineClick);
        }
    }

    handleInlineClick(e) {
        const target = e.target;

        if (target.classList.contains('chip-remove')) {
            const itemId = normalizeId(target.dataset.itemId);
            this.handleRemove(itemId);
        } else if (target.classList.contains('btn-add-inline')) {
            this.showSearch();
        } else if (target.classList.contains('btn-clear-inline')) {
            this.handleClearAll();
        }
    }

    showSearch() {
        this.searchActive = true;
        this.searchTerm = '';

        // Add popup to container
        const popup = document.createElement('div');
        popup.innerHTML = this.renderSearchPopup();
        popup.className = 'search-popup-overlay';
        popup.id = `${this.config.fieldId}-popup`;
        this.container.appendChild(popup);

        // Bind popup events
        this.bindPopupEvents();

        // Focus input
        const searchInput = popup.querySelector(`#${this.config.fieldId}-search-input`);
        if (searchInput) {
            searchInput.focus();
        }
    }

    hideSearch() {
        this.searchActive = false;
        this.searchTerm = '';

        const popup = this.container.querySelector(`#${this.config.fieldId}-popup`);
        if (popup) {
            popup.remove();
        }
    }

    bindPopupEvents() {
        const popup = this.container.querySelector(`#${this.config.fieldId}-popup`);
        if (!popup) return;

        // Search input
        const searchInput = popup.querySelector(`#${this.config.fieldId}-search-input`);
        if (searchInput) {
            this.boundHandlers.searchInput = (e) => {
                this.searchTerm = e.target.value;
                this.refreshSearchResults();
            };
            searchInput.addEventListener('input', this.boundHandlers.searchInput);
        }

        // Delegate clicks
        this.boundHandlers.popupClick = (e) => {
            if (e.target.classList.contains('btn-cancel-search')) {
                this.hideSearch();
            } else if (e.target.classList.contains('search-result-item')) {
                const itemId = normalizeId(e.target.dataset.itemId);
                this.handleSelect(itemId);
            }
        };
        popup.addEventListener('click', this.boundHandlers.popupClick);
    }

    handleSelect(itemId) {
        if (this.selectedIds.some(id => idsEqual(id, itemId))) {
            return;
        }

        this.selectedIds.push(itemId);
        this.hideSearch();
        this.refresh();
        this.config.onChange(this.getValue());
    }

    handleRemove(itemId) {
        this.selectedIds = this.selectedIds.filter(id => !idsEqual(id, itemId));
        this.refresh();
        this.config.onChange(this.getValue());
    }

    handleClearAll() {
        if (this.selectedIds.length === 0) return;

        if (confirm('Remove all selected items?')) {
            this.selectedIds = [];
            this.refresh();
            this.config.onChange(this.getValue());
        }
    }

    refresh() {
        const inlineContainer = this.container.querySelector(`#${this.config.fieldId}-inline`);
        if (inlineContainer) {
            inlineContainer.innerHTML = this.renderInlineContent();
        }

        const hiddenInput = this.container.querySelector(`#${this.config.fieldId}-data`);
        if (hiddenInput) {
            hiddenInput.value = JSON.stringify(this.selectedIds);
        }
    }

    refreshSearchResults() {
        const popup = this.container.querySelector(`#${this.config.fieldId}-popup`);
        if (!popup) return;

        const resultsContainer = popup.querySelector('.search-popup-results');
        if (resultsContainer) {
            resultsContainer.innerHTML = this.renderSearchResults();
        }
    }

    getValue() {
        return [...this.selectedIds];
    }

    setValue(value) {
        this.selectedIds = this.normalizeInitialValue(value);
        this.searchActive = false;
        this.searchTerm = '';
        this.refresh();
    }

    getAvailableOptions() {
        const selectedSet = new Set(this.selectedIds.map(id => normalizeId(id)));
        return this.config.options.filter(opt => !selectedSet.has(normalizeId(opt.value)));
    }

    getFilteredOptions() {
        const available = this.getAvailableOptions();

        if (!this.searchTerm || this.searchTerm.trim() === '') {
            return available;
        }

        const searchLower = this.searchTerm.toLowerCase();
        return available.filter(opt =>
            opt.label.toLowerCase().includes(searchLower)
        );
    }

    escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    destroy() {
        const inlineContainer = this.container?.querySelector(`#${this.config.fieldId}-inline`);
        if (inlineContainer && this.boundHandlers.inlineClick) {
            inlineContainer.removeEventListener('click', this.boundHandlers.inlineClick);
        }

        const popup = this.container?.querySelector(`#${this.config.fieldId}-popup`);
        if (popup) {
            if (this.boundHandlers.searchInput) {
                const searchInput = popup.querySelector(`#${this.config.fieldId}-search-input`);
                if (searchInput) {
                    searchInput.removeEventListener('input', this.boundHandlers.searchInput);
                }
            }
            if (this.boundHandlers.popupClick) {
                popup.removeEventListener('click', this.boundHandlers.popupClick);
            }
            popup.remove();
        }

        this.container = null;
        this.selectedIds = [];
        this.boundHandlers = {};
        this.searchActive = false;
        this.searchTerm = '';
    }
}