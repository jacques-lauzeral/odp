import { normalizeId, idsEqual } from '../../../../shared/src/index.js';

/**
 * ReferenceManager
 *
 * Inline single-select typeahead component.
 *
 * Displays the selected item as a removable chip.
 * When no item is selected (or after removal), shows a text input
 * with live filtering of available options below it.
 *
 * Config:
 *   fieldId      {string}   Required. Used to scope DOM ids.
 *   options      {Array}    [{value, label}, ...] — full option list.
 *   initialValue {*}        Single id (number, string) or null/undefined.
 *   placeholder  {string}   Input placeholder text.
 *   noneLabel    {string}   Label shown when nothing is selected (default: '— None —').
 *   readOnly     {boolean}  When true, renders chip only with no controls.
 *   onChange     {Function} Called with the new value (id or null) on every change.
 */
export default class ReferenceManager {
    constructor(config) {
        if (!config.fieldId) {
            throw new Error('ReferenceManager requires fieldId');
        }

        this.config = {
            fieldId:     config.fieldId,
            options:     config.options     || [],
            placeholder: config.placeholder || 'Type to search...',
            noneLabel:   config.noneLabel   || '— None —',
            readOnly:    config.readOnly    || false,
            onChange:    config.onChange    || (() => {})
        };

        this.selectedId    = this._normalizeValue(config.initialValue);
        this.searchTerm    = '';
        this.container     = null;
        this.boundHandlers = {};
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    render(container) {
        this.container = container;
        container.innerHTML = this._buildHtml();
        this._bindEvents();
        return container;
    }

    getValue() {
        return this.selectedId;
    }

    setValue(value) {
        this.selectedId = this._normalizeValue(value);
        this.searchTerm = '';
        this._refresh();
    }

    destroy() {
        if (this.container) {
            this.container.removeEventListener('click',  this.boundHandlers.click);
            this.container.removeEventListener('input',  this.boundHandlers.input);
            this.container.removeEventListener('keydown', this.boundHandlers.keydown);
            this.container = null;
        }
        this.selectedId    = null;
        this.searchTerm    = '';
        this.boundHandlers = {};
    }

    // ─── Rendering ───────────────────────────────────────────────────────────

    _buildHtml() {
        return `
            <div class="reference-manager" id="${this.config.fieldId}-rm">
                ${this._renderContent()}
                <input type="hidden"
                       id="${this.config.fieldId}-data"
                       name="${this.config.fieldId}"
                       value="${this._escapeHtml(this.selectedId ?? '')}">
            </div>
        `;
    }

    _renderContent() {
        if (this.selectedId != null) {
            return this._renderChip();
        }
        return this._renderSearch();
    }

    _renderChip() {
        const option = this.config.options.find(o => idsEqual(o.value, this.selectedId));
        const label  = option ? option.label : `ID ${this.selectedId}`;

        if (this.config.readOnly) {
            return `<span class="selected-chip">${this._escapeHtml(label)}</span>`;
        }

        return `
            <span class="selected-chip">
                ${this._escapeHtml(label)}
                <button type="button" class="chip-remove" title="Remove">×</button>
            </span>
        `;
    }

    _renderSearch() {
        if (this.config.readOnly) {
            return `<span class="reference-manager-none">${this._escapeHtml(this.config.noneLabel)}</span>`;
        }

        const results = this._getFilteredOptions();

        return `
            <input type="text"
                   id="${this.config.fieldId}-search"
                   class="form-control reference-manager-input"
                   placeholder="${this._escapeHtml(this.config.placeholder)}"
                   value="${this._escapeHtml(this.searchTerm)}"
                   autocomplete="off">
            ${results.length > 0 ? `
                <ul class="reference-manager-results">
                    ${results.map(o => `
                        <li class="reference-manager-result-item"
                            data-value="${this._escapeHtml(String(o.value))}">
                            ${this._escapeHtml(o.label)}
                        </li>
                    `).join('')}
                </ul>
            ` : this.searchTerm ? `
                <div class="reference-manager-no-results">No matching items</div>
            ` : ''}
        `;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    _bindEvents() {
        if (this.config.readOnly) return;

        this.boundHandlers.click   = e => this._handleClick(e);
        this.boundHandlers.input   = e => this._handleInput(e);
        this.boundHandlers.keydown = e => this._handleKeydown(e);

        this.container.addEventListener('click',   this.boundHandlers.click);
        this.container.addEventListener('input',   this.boundHandlers.input);
        this.container.addEventListener('keydown', this.boundHandlers.keydown);
    }

    _handleClick(e) {
        // Remove chip
        if (e.target.classList.contains('chip-remove')) {
            this.selectedId = null;
            this.searchTerm = '';
            this._refresh();
            this.config.onChange(null);
            // Focus search input after removal
            this.container.querySelector('.reference-manager-input')?.focus();
            return;
        }

        // Select result item
        const item = e.target.closest('.reference-manager-result-item');
        if (item) {
            this.selectedId = this._normalizeValue(item.dataset.value);
            this.searchTerm = '';
            this._refresh();
            this.config.onChange(this.selectedId);
        }
    }

    _handleInput(e) {
        if (e.target.classList.contains('reference-manager-input')) {
            this.searchTerm = e.target.value;
            this._refreshResults();
        }
    }

    _handleKeydown(e) {
        if (e.key === 'Escape' && e.target.classList.contains('reference-manager-input')) {
            this.searchTerm = '';
            this._refreshResults();
        }
    }

    // ─── Refresh ─────────────────────────────────────────────────────────────

    _refresh() {
        const rm = this.container?.querySelector(`#${this.config.fieldId}-rm`);
        if (!rm) return;

        // Replace content but keep hidden input
        const hidden = this.container.querySelector(`#${this.config.fieldId}-data`);
        rm.innerHTML = this._renderContent() + `
            <input type="hidden"
                   id="${this.config.fieldId}-data"
                   name="${this.config.fieldId}"
                   value="${this._escapeHtml(this.selectedId ?? '')}">
        `;
    }

    _refreshResults() {
        const rm = this.container?.querySelector(`#${this.config.fieldId}-rm`);
        if (!rm || this.selectedId != null) return;

        // Re-render only the results list below the input
        const existing = rm.querySelector('.reference-manager-results, .reference-manager-no-results');
        if (existing) existing.remove();

        const results = this._getFilteredOptions();
        if (results.length > 0) {
            const ul = document.createElement('ul');
            ul.className = 'reference-manager-results';
            ul.innerHTML = results.map(o => `
                <li class="reference-manager-result-item"
                    data-value="${this._escapeHtml(String(o.value))}">
                    ${this._escapeHtml(o.label)}
                </li>
            `).join('');
            rm.appendChild(ul);
        } else if (this.searchTerm) {
            const div = document.createElement('div');
            div.className = 'reference-manager-no-results';
            div.textContent = 'No matching items';
            rm.appendChild(div);
        }

        // Sync hidden input
        const hidden = rm.querySelector(`#${this.config.fieldId}-data`);
        if (hidden) hidden.value = this.selectedId ?? '';
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _getFilteredOptions() {
        if (!this.searchTerm || !this.searchTerm.trim()) return [];
        const term = this.searchTerm.toLowerCase();
        return this.config.options
            .filter(o => !idsEqual(o.value, this.selectedId))
            .filter(o => o.label.toLowerCase().includes(term))
            .slice(0, 50);
    }

    _normalizeValue(value) {
        if (value === null || value === undefined || value === '') return null;
        return normalizeId(value);
    }

    _escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }
}