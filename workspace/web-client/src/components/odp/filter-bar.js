import { async as asyncUtils } from '../../shared/utils.js';

/**
 * FilterBar - Add/remove filter UI with chip display
 *
 * Design:
 *   [+ Add Filter]  [Type: ON ×]  [DrG: NM B2B ×]  [Full Text: "nav" ×]    [Clear All]
 *
 * Filter state is an array of { key, label, value, displayValue } objects.
 * One entry per filter type (duplicates not allowed).
 * Fires a 'filtersChanged' CustomEvent on the container element when state changes.
 *
 * Usage:
 *   const bar = new FilterBar(filterConfig, setupData);
 *   bar.render(document.querySelector('#activityFilters'));
 *   bar.container.addEventListener('filtersChanged', e => console.log(e.detail.filters));
 *   bar.setFilters(existingFilters); // restore preserved state
 */
export default class FilterBar {

    /**
     * @param {Array}  filterConfig  - Array of filter type definitions (see getDefaultFilterConfig)
     * @param {Object} setupData     - Setup data from the activity (stakeholderCategories, etc.)
     */
    constructor(filterConfig, setupData = {}) {
        this.filterConfig = filterConfig;
        this.setupData = setupData;

        // Active filters: Array<{ key, label, value, displayValue }>
        this.activeFilters = [];

        // UI state
        this.dropdownOpen = false;    // Step-1 dropdown (choose type)
        this.pendingFilter = null;    // Step-2: { key, label, inputType, options, ... }
        this.suggestionQuery = '';
        this.suggestionResults = [];

        this.container = null;        // Set by render()

        // Debounced suggestion handler
        this.debouncedSuggest = asyncUtils.debounce(
            (query) => this._handleSuggestionInput(query), 250
        );
    }

    // ─────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────

    render(container) {
        this.container = container;
        this._renderBar();
    }

    /**
     * Restore filter state (e.g. from sharedState.filters array).
     * Accepts either the new array format or the legacy flat-object format.
     */
    setFilters(filters) {
        if (!filters) return;

        // New format: array of { key, label, value, displayValue }
        if (Array.isArray(filters)) {
            this.activeFilters = [...filters];
        } else if (typeof filters === 'object') {
            // Legacy flat-object: { type: 'ON', drg: 'NM_B2B', ... }
            // Convert to array using filterConfig for labels
            this.activeFilters = Object.entries(filters)
                .filter(([, v]) => v && v !== '')
                .map(([key, value]) => {
                    const cfg = this.filterConfig.find(f => f.key === key);
                    const displayValue = cfg ? this._resolveDisplayValue(cfg, value) : value;
                    return { key, label: cfg?.label || key, value, displayValue };
                });
        }

        if (this.container) this._renderBar();
    }

    /**
     * Returns the current active filters as a plain object { key: value }
     * for backward-compatibility with buildQueryParams / sharedState.filters.
     */
    getFiltersAsObject() {
        const obj = {};
        this.activeFilters.forEach(f => { obj[f.key] = f.value; });
        return obj;
    }

    /**
     * Returns the active filters array (new format).
     */
    getFilters() {
        return [...this.activeFilters];
    }

    clearAll() {
        this.activeFilters = [];
        this.dropdownOpen = false;
        this.pendingFilter = null;
        if (this.container) this._renderBar();
        this._emit();
    }

    // ─────────────────────────────────────────────
    // RENDERING
    // ─────────────────────────────────────────────

    _renderBar() {
        const hasFilters = this.activeFilters.length > 0;
        const hasPending = this.pendingFilter !== null;

        this.container.innerHTML = `
            <div class="filter-bar" id="filterBarRoot">

                <!-- Add Filter button + step-1 type dropdown -->
                <div class="filter-bar__add-wrapper">
                    <button
                        class="filter-bar__add-btn ${this.dropdownOpen ? 'filter-bar__add-btn--open' : ''}"
                        id="filterAddBtn"
                        title="Add a filter"
                        aria-haspopup="listbox"
                        aria-expanded="${this.dropdownOpen}"
                    >
                        <span class="filter-bar__add-icon">＋</span>
                        Add Filter
                    </button>

                    ${this.dropdownOpen && !hasPending ? this._renderTypeDropdown() : ''}
                </div>

                <!-- Active filter chips -->
                <div class="filter-bar__chips" role="list" aria-label="Active filters">
                    ${this.activeFilters.map(f => this._renderChip(f)).join('')}
                    ${hasPending ? this._renderValueInput() : ''}
                </div>

                <!-- Clear All -->
                ${hasFilters || hasPending ? `
                    <button class="filter-bar__clear" id="filterClearAll">Clear All</button>
                ` : ''}

            </div>
        `;

        this._bindBarEvents();
    }

    _renderTypeDropdown() {
        const activeKeys = new Set(this.activeFilters.map(f => f.key));

        return `
            <ul class="filter-bar__type-dropdown" role="listbox" aria-label="Choose filter type">
                ${this.filterConfig.map(f => {
            const disabled = activeKeys.has(f.key);
            return `
                        <li
                            class="filter-bar__type-option ${disabled ? 'filter-bar__type-option--disabled' : ''}"
                            role="option"
                            data-filter-key="${f.key}"
                            aria-disabled="${disabled}"
                            title="${disabled ? 'Already active' : ''}"
                        >
                            ${this._escapeHtml(f.label)}
                        </li>
                    `;
        }).join('')}
            </ul>
        `;
    }

    _renderChip(filter) {
        return `
            <div class="filter-bar__chip" role="listitem" data-chip-key="${filter.key}">
                <button
                    class="filter-bar__chip-label"
                    data-edit-key="${filter.key}"
                    title="Click to edit"
                >
                    <span class="filter-bar__chip-type">${this._escapeHtml(filter.label)}:</span>
                    <span class="filter-bar__chip-value">${this._escapeHtml(filter.displayValue || filter.value)}</span>
                </button>
                <button
                    class="filter-bar__chip-remove"
                    data-remove-key="${filter.key}"
                    aria-label="Remove ${filter.label} filter"
                    title="Remove"
                >×</button>
            </div>
        `;
    }

    _renderValueInput() {
        const f = this.pendingFilter;
        const isEditing = f._editing;
        const existing = isEditing ? this.activeFilters.find(a => a.key === f.key) : null;

        // For select: pre-select by value (ID); for text/suggest: show the human-readable label
        const currentSelectValue = existing?.value || '';
        const currentTextValue = (f.inputType === 'suggest' || f.inputType === 'text')
            ? (existing?.displayValue || '')
            : currentSelectValue;

        return `
            <div class="filter-bar__value-input" data-pending-key="${f.key}">
                <span class="filter-bar__value-label">${this._escapeHtml(f.label)}:</span>

                ${f.inputType === 'select'
            ? this._renderSelectInput(f, currentSelectValue)
            : this._renderTextInput(f, currentTextValue)
        }

                <button class="filter-bar__value-cancel" id="filterValueCancel" title="Cancel">✕</button>
            </div>
        `;
    }

    _renderSelectInput(filterDef, currentValue) {
        return `
            <select class="filter-bar__value-select" id="filterValueSelect" autofocus>
                <option value="">— choose —</option>
                ${filterDef.options.map(opt => `
                    <option value="${this._escapeHtml(opt.value)}"
                        ${opt.value === currentValue ? 'selected' : ''}>
                        ${this._escapeHtml(opt.label)}
                    </option>
                `).join('')}
            </select>
        `;
    }

    _renderTextInput(filterDef, currentValue) {
        const hasSuggestions = filterDef.inputType === 'suggest';
        return `
            <div class="filter-bar__suggest-wrapper">
                <input
                    type="text"
                    class="filter-bar__value-text"
                    id="filterValueText"
                    placeholder="${this._escapeHtml(filterDef.placeholder || `Enter ${filterDef.label.toLowerCase()}...`)}"
                    value="${this._escapeHtml(currentValue)}"
                    autocomplete="off"
                    autofocus
                />
                ${hasSuggestions && this.suggestionResults.length > 0
            ? this._renderSuggestionBox()
            : ''
        }
            </div>
        `;
    }

    _renderSuggestionBox() {
        return `
            <ul class="filter-bar__suggestions" role="listbox">
                ${this.suggestionResults.map(s => `
                    <li class="filter-bar__suggestion"
                        role="option"
                        data-suggest-value="${this._escapeHtml(s.value)}"
                        data-suggest-label="${this._escapeHtml(s.label)}">
                        ${this._escapeHtml(s.label)}
                    </li>
                `).join('')}
            </ul>
        `;
    }

    // ─────────────────────────────────────────────
    // EVENT BINDING
    // ─────────────────────────────────────────────

    _bindBarEvents() {
        // ── Add Filter button ──
        const addBtn = this.container.querySelector('#filterAddBtn');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.pendingFilter) {
                    // Cancel pending value selection
                    this.pendingFilter = null;
                    this.suggestionResults = [];
                }
                this.dropdownOpen = !this.dropdownOpen;
                this._renderBar();
            });
        }

        // ── Type dropdown: choose a filter type ──
        const typeOptions = this.container.querySelectorAll('.filter-bar__type-option:not(.filter-bar__type-option--disabled)');
        typeOptions.forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = opt.dataset.filterKey;
                this._openValueInput(key);
            });
        });

        // ── Chip: edit ──
        const editBtns = this.container.querySelectorAll('[data-edit-key]');
        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.editKey;
                this._openValueInput(key, true);
            });
        });

        // ── Chip: remove ──
        const removeBtns = this.container.querySelectorAll('[data-remove-key]');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.removeKey;
                this._removeFilter(key);
            });
        });

        // ── Value input: select ──
        const selectInput = this.container.querySelector('#filterValueSelect');
        if (selectInput) {
            selectInput.addEventListener('change', (e) => {
                this._commitFilter(e.target.value, e.target.options[e.target.selectedIndex]?.text);
            });
        }

        // ── Value input: text / suggest ──
        const textInput = this.container.querySelector('#filterValueText');
        if (textInput) {
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this._commitFilter(textInput.value.trim(), textInput.value.trim());
                } else if (e.key === 'Escape') {
                    this._cancelPending();
                }
            });

            if (this.pendingFilter?.inputType === 'suggest') {
                textInput.addEventListener('input', (e) => {
                    this.suggestionQuery = e.target.value;
                    this.debouncedSuggest(this.suggestionQuery);
                });
            }
        }

        // ── Suggestion box ──
        const suggestions = this.container.querySelectorAll('.filter-bar__suggestion');
        suggestions.forEach(s => {
            s.addEventListener('click', (e) => {
                e.stopPropagation();
                this._commitFilter(s.dataset.suggestValue, s.dataset.suggestLabel);
            });
        });

        // ── Cancel value input ──
        const cancelBtn = this.container.querySelector('#filterValueCancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._cancelPending();
            });
        }

        // ── Clear All ──
        const clearBtn = this.container.querySelector('#filterClearAll');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearAll());
        }

        // ── Close dropdown on outside click ──
        if (this.dropdownOpen) {
            // Use a one-shot listener attached to the document
            const closeOnOutside = (e) => {
                if (!this.container.contains(e.target)) {
                    this.dropdownOpen = false;
                    this._renderBar();
                }
                document.removeEventListener('click', closeOnOutside);
            };
            // Defer so the current click doesn't immediately close
            setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
        }
    }

    // ─────────────────────────────────────────────
    // FILTER OPERATIONS
    // ─────────────────────────────────────────────

    _openValueInput(key, editing = false) {
        const cfg = this.filterConfig.find(f => f.key === key);
        if (!cfg) return;

        this.dropdownOpen = false;
        this.pendingFilter = { ...cfg, _editing: editing };
        this.suggestionResults = [];

        // For suggest fields being edited, pre-trigger suggestions with the current
        // display value so the user sees matching options immediately without retyping
        if (editing && cfg.inputType === 'suggest') {
            const existing = this.activeFilters.find(f => f.key === key);
            if (existing?.displayValue) {
                this.suggestionQuery = existing.displayValue;
                // Fetch synchronously after render via debouncedSuggest
            }
        } else {
            this.suggestionQuery = '';
        }

        this._renderBar();

        // Auto-focus and pre-fetch suggestions if editing a suggest field
        requestAnimationFrame(() => {
            const el = this.container.querySelector('#filterValueSelect, #filterValueText');
            if (el) {
                el.focus();
                // Pre-fetch suggestions based on current display value
                if (editing && cfg.inputType === 'suggest' && this.suggestionQuery) {
                    this.debouncedSuggest(this.suggestionQuery);
                }
            }
        });
    }

    _commitFilter(value, displayValue) {
        if (!this.pendingFilter) return;
        if (!value || value === '') {
            this._cancelPending();
            return;
        }

        const { key, label } = this.pendingFilter;

        // Remove any existing entry for this key (edit replaces in-place)
        this.activeFilters = this.activeFilters.filter(f => f.key !== key);

        this.activeFilters.push({
            key,
            label,
            value,
            displayValue: displayValue || value
        });

        this.pendingFilter = null;
        this.suggestionResults = [];
        this._renderBar();
        this._emit();
    }

    _removeFilter(key) {
        this.activeFilters = this.activeFilters.filter(f => f.key !== key);
        if (this.pendingFilter?.key === key) {
            this.pendingFilter = null;
        }
        this._renderBar();
        this._emit();
    }

    _cancelPending() {
        this.pendingFilter = null;
        this.suggestionResults = [];
        this._renderBar();
    }

    // ─────────────────────────────────────────────
    // SUGGESTION HANDLING
    // ─────────────────────────────────────────────

    async _handleSuggestionInput(query) {
        if (!this.pendingFilter) return;

        const cfg = this.pendingFilter;
        const results = await this._fetchSuggestions(cfg, query);
        this.suggestionResults = results;

        // Only re-render the suggestion box, not the whole bar
        const wrapper = this.container.querySelector('.filter-bar__suggest-wrapper');
        if (wrapper) {
            const existing = wrapper.querySelector('.filter-bar__suggestions');
            if (existing) existing.remove();

            if (results.length > 0) {
                wrapper.insertAdjacentHTML('beforeend', this._renderSuggestionBox());

                // Bind suggestion clicks
                wrapper.querySelectorAll('.filter-bar__suggestion').forEach(s => {
                    s.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._commitFilter(s.dataset.suggestValue, s.dataset.suggestLabel);
                    });
                });
            }
        }
    }

    /**
     * Fetch suggestions for a given filter type and query string.
     * Uses static options list when available; subclasses or callers can override
     * this.fetchSuggestionsCallback(key, query) for server-side search.
     */
    async _fetchSuggestions(cfg, query) {
        if (!query || query.length < 1) return [];

        const lower = query.toLowerCase();

        // Use the static options list when available (setup data backed filters)
        if (cfg.options && cfg.options.length > 0) {
            return cfg.options
                .filter(opt => opt.label.toLowerCase().includes(lower))
                .slice(0, 10);
        }

        // External callback (for entity search: Refines, Depends On, etc.)
        if (typeof this.fetchSuggestionsCallback === 'function') {
            try {
                return await this.fetchSuggestionsCallback(cfg.key, query);
            } catch (e) {
                console.error('FilterBar: suggestion fetch failed', e);
                return [];
            }
        }

        return [];
    }

    // ─────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────

    _resolveDisplayValue(cfg, value) {
        if (cfg.options) {
            const opt = cfg.options.find(o => o.value === value || o.value === String(value));
            return opt ? opt.label : value;
        }
        return value;
    }

    _emit() {
        if (!this.container) return;
        this.container.dispatchEvent(new CustomEvent('filtersChanged', {
            bubbles: true,
            detail: {
                filters: this.getFiltersAsObject(),   // backward-compat flat object
                filtersArray: this.getFilters()        // new array format
            }
        }));
    }

    _escapeHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    cleanup() {
        this.container = null;
        this.activeFilters = [];
        this.pendingFilter = null;
        this.suggestionResults = [];
    }
}