import { async as asyncUtils } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * CollectionEntity - Pure table/list rendering engine
 * Business-agnostic collection management with pluggable column types
 */
export default class CollectionEntity {
    constructor(app, entityConfig, options = {}) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.container = null;

        // Collection state
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.currentFilters = {};
        this.currentGrouping = 'none';

        // Options and injected dependencies
        this.columnTypes = { ...this.getDefaultColumnTypes(), ...(options.columnTypes || {}) };
        this.context = options.context || {};

        // Configuration methods (to be provided by subclasses)
        this.getFilterConfig = options.getFilterConfig || (() => []);
        this.getColumnConfig = options.getColumnConfig || (() => []);
        this.getGroupingConfig = options.getGroupingConfig || (() => []);

        // Event handlers (to be provided by subclasses)
        this.onItemSelect = options.onItemSelect || (() => {});
        this.onCreate = options.onCreate || (() => {});
        this.onEdit = options.onEdit || (() => {});
        this.onDelete = options.onDelete || (() => {});
        this.onRefresh = options.onRefresh || (() => {});

        // Cache configurations
        this.filterConfig = this.getFilterConfig();
        this.columnConfig = this.getColumnConfig();
        this.groupingConfig = this.getGroupingConfig();

        // Debounced methods
        this.debouncedFilter = asyncUtils.debounce(
            () => this.applyFilters(),
            300
        );
    }

    // ====================
    // DEFAULT COLUMN TYPES
    // ====================

    getDefaultColumnTypes() {
        return {
            'text': {
                render: (value) => this.escapeHtml(value || '-'),
                filter: (value, filterValue) => {
                    if (!value) return false;
                    return value.toString().toLowerCase().includes(filterValue.toLowerCase());
                },
                sort: (a, b) => (a || '').toString().localeCompare((b || '').toString())
            },

            'date': {
                render: (value) => {
                    if (!value) return '-';
                    try {
                        return new Date(value).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                        });
                    } catch (error) {
                        return value;
                    }
                },
                filter: (value, filterValue) => {
                    if (!value) return false;
                    return value.toString().includes(filterValue);
                },
                sort: (a, b) => new Date(a || 0) - new Date(b || 0)
            },

            'enum': {
                render: (value, column) => {
                    if (!value) return '-';
                    const cssClass = column.enumStyles?.[value] || '';
                    const label = column.enumLabels?.[value] || value;
                    return cssClass ?
                        `<span class="${this.escapeHtml(cssClass)}">${this.escapeHtml(label)}</span>` :
                        this.escapeHtml(label);
                },
                filter: (value, filterValue, column) => {
                    if (!filterValue) return true;
                    if (!value) return false;
                    // Check both the raw value and the display label
                    const label = column.enumLabels?.[value] || value;
                    return value === filterValue ||
                        label.toLowerCase().includes(filterValue.toLowerCase());
                },
                getFilterOptions: (column) => {
                    if (!column.enumLabels) return [];
                    return Object.entries(column.enumLabels).map(([value, label]) => ({
                        value,
                        label
                    }));
                }
            }
        };
    }

    // ====================
    // DATA MANAGEMENT
    // ====================

    async render(container) {
        this.container = container;

        try {
            await this.loadData();
            this.renderContent();
        } catch (error) {
            console.error(`Failed to render ${this.entityConfig.name}:`, error);
            this.renderError(error);
        }
    }

    async loadData() {
        try {
            const response = await apiClient.get(this.entityConfig.endpoint);
            this.data = Array.isArray(response) ? response : [];
            this.filteredData = [...this.data];
        } catch (error) {
            console.error(`Failed to load ${this.entityConfig.name.toLowerCase()} data:`, error);
            this.data = [];
            this.filteredData = [];
            throw error;
        }
    }

    async refresh() {
        await this.loadData();
        this.applyFilters();

        // Notify parent
        if (this.onRefresh) {
            this.onRefresh();
        }
    }

    // ====================
    // RENDERING
    // ====================

    renderContent() {
        if (this.data.length === 0) {
            this.renderEmptyState();
            return;
        }

        const groupedData = this.groupData(this.filteredData, this.currentGrouping);

        this.container.innerHTML = `
            <div class="collection-table-container">
                ${groupedData.map(group => this.renderGroup(group)).join('')}
            </div>
        `;

        this.bindEvents();
    }

    renderGroup(group) {
        const showGroupHeader = this.currentGrouping !== 'none';

        return `
            <div class="collection-group">
                ${showGroupHeader ? `
                    <div class="group-header" data-group="${group.key}">
                        <h3 class="group-title">${this.escapeHtml(group.title)}</h3>
                        <span class="group-count">${group.items.length}</span>
                    </div>
                ` : ''}
                
                <div class="collection-table-wrapper">
                    <table class="collection-table">
                        <thead>
                            <tr>
                                ${this.columnConfig.map(col => `
                                    <th style="width: ${col.width || 'auto'}" 
                                        class="${col.sortable ? 'sortable' : ''}" 
                                        data-column="${col.key}">
                                        ${this.escapeHtml(col.label)}
                                        ${col.sortable ? '<span class="sort-indicator"></span>' : ''}
                                    </th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${group.items.map(item => this.renderTableRow(item)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderTableRow(item) {
        const itemId = this.getItemId(item);
        const isSelected = this.selectedItem && this.getItemId(this.selectedItem) === itemId;

        return `
            <tr class="collection-row ${isSelected ? 'collection-row--selected' : ''}" 
                data-item-id="${this.escapeHtml(itemId)}">
                ${this.columnConfig.map(col => `
                    <td class="collection-cell collection-cell--${col.key}">
                        ${this.renderCellValue(item, col)}
                    </td>
                `).join('')}
            </tr>
        `;
    }

    renderCellValue(item, column) {
        const value = this.getItemValue(item, column);
        const columnType = this.columnTypes[column.type || 'text'];

        if (columnType && columnType.render) {
            return columnType.render(value, column, item, this.context);
        }

        // Fallback to text rendering
        return this.escapeHtml(value?.toString() || '-');
    }

    renderEmptyState() {
        const message = this.getEmptyStateMessage();

        this.container.innerHTML = `
            <div class="empty-state">
                <div class="icon">${message.icon || '📄'}</div>
                <h3>${message.title || 'No Items'}</h3>
                <p>${message.description || 'No items to display.'}</p>
                ${message.showCreateButton !== false ? `
                    <button class="btn btn-primary" id="createFirstItem">
                        ${message.createButtonText || 'Create First Item'}
                    </button>
                ` : ''}
            </div>
        `;

        if (message.showCreateButton !== false) {
            const createBtn = this.container.querySelector('#createFirstItem');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    if (this.onCreate) {
                        this.onCreate();
                    }
                });
            }
        }
    }

    renderError(error) {
        this.container.innerHTML = `
            <div class="error-state">
                <h3>Failed to Load ${this.entityConfig.name}</h3>
                <p>Error: ${this.escapeHtml(error.message)}</p>
                <button class="btn btn-secondary" onclick="window.location.reload()">
                    Reload Page
                </button>
            </div>
        `;
    }

    // ====================
    // FILTERING
    // ====================

    handleFilter(filterKey, filterValue) {
        this.currentFilters[filterKey] = filterValue;
        this.debouncedFilter();
    }

    applyFilters() {
        this.filteredData = this.data.filter(item => {
            for (const [filterKey, filterValue] of Object.entries(this.currentFilters)) {
                if (!filterValue) continue;

                const column = this.columnConfig.find(col => col.key === filterKey);
                if (!column) continue;

                const columnType = this.columnTypes[column.type || 'text'];
                const value = this.getItemValue(item, column);

                if (columnType && columnType.filter) {
                    if (!columnType.filter(value, filterValue, column)) {
                        return false;
                    }
                } else {
                    // Default text filtering
                    if (!value || !value.toString().toLowerCase().includes(filterValue.toLowerCase())) {
                        return false;
                    }
                }
            }
            return true;
        });

        this.renderContent();
    }

    clearFilters() {
        this.currentFilters = {};
        this.filteredData = [...this.data];
        this.renderContent();
    }

    // ====================
    // GROUPING
    // ====================

    handleGrouping(groupBy) {
        this.currentGrouping = groupBy;
        this.renderContent();
    }

    groupData(data, groupBy) {
        if (groupBy === 'none') {
            return [{
                key: 'all',
                title: `All Items (${data.length})`,
                items: data
            }];
        }

        const column = this.columnConfig.find(col => col.key === groupBy);
        if (!column) {
            return [{
                key: 'all',
                title: `All Items (${data.length})`,
                items: data
            }];
        }

        const grouped = {};

        for (const item of data) {
            const value = this.getItemValue(item, column);
            const groupKey = this.getGroupKey(value, column);
            const groupTitle = this.getGroupTitle(value, column);

            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    key: groupKey,
                    title: groupTitle,
                    items: []
                };
            }
            grouped[groupKey].items.push(item);
        }

        // Sort groups
        return Object.values(grouped).sort((a, b) => {
            const priority = this.getGroupPriority(a.key, b.key, column);
            if (priority !== 0) return priority;
            return a.title.localeCompare(b.title);
        });
    }

    getGroupKey(value, column) {
        if (value === null || value === undefined) return 'none';
        if (Array.isArray(value)) {
            return value.length > 0 ? value[0].toString() : 'none';
        }
        return value.toString();
    }

    getGroupTitle(value, column) {
        if (value === null || value === undefined || value === 'none') {
            return column.noneLabel || 'Not Specified';
        }

        const columnType = this.columnTypes[column.type || 'text'];
        if (columnType && columnType.getGroupTitle) {
            return columnType.getGroupTitle(value, column, this.context);
        }

        // For enum types, use the label
        if (column.enumLabels && column.enumLabels[value]) {
            return column.enumLabels[value];
        }

        return value.toString();
    }

    getGroupPriority(keyA, keyB, column) {
        // 'none' group always goes last
        if (keyA === 'none') return 1;
        if (keyB === 'none') return -1;

        // Check if column defines custom priority
        if (column.groupPriority) {
            const priorityA = column.groupPriority[keyA] ?? 999;
            const priorityB = column.groupPriority[keyB] ?? 999;
            return priorityA - priorityB;
        }

        return 0;
    }

    // ====================
    // SORTING
    // ====================

    handleSort(columnKey) {
        const column = this.columnConfig.find(col => col.key === columnKey);
        if (!column || !column.sortable) return;

        // Toggle sort direction
        if (this.currentSort?.column === columnKey) {
            this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = { column: columnKey, direction: 'asc' };
        }

        this.sortData();
        this.renderContent();
    }

    sortData() {
        if (!this.currentSort) return;

        const column = this.columnConfig.find(col => col.key === this.currentSort.column);
        if (!column) return;

        const columnType = this.columnTypes[column.type || 'text'];

        this.filteredData.sort((a, b) => {
            const valueA = this.getItemValue(a, column);
            const valueB = this.getItemValue(b, column);

            let result = 0;

            if (columnType && columnType.sort) {
                result = columnType.sort(valueA, valueB, column);
            } else {
                // Default comparison
                if (valueA < valueB) result = -1;
                if (valueA > valueB) result = 1;
            }

            return this.currentSort.direction === 'desc' ? -result : result;
        });
    }

    // ====================
    // SELECTION
    // ====================

    selectItem(itemId) {
        const numericId = parseInt(itemId, 10);
        const item = this.data.find(d => this.getItemId(d) === numericId);
        if (!item) {
            console.warn('Item not found:', itemId);
            return;
        }

        this.selectedItem = item;

        // Update UI
        const rows = this.container.querySelectorAll('.collection-row');
        rows.forEach(row => {
            if (row.dataset.itemId === itemId) {
                row.classList.add('collection-row--selected');
            } else {
                row.classList.remove('collection-row--selected');
            }
        });

        // Notify parent
        if (this.onItemSelect) {
            this.onItemSelect(item);
        }
    }

    // ====================
    // EVENT BINDING
    // ====================

    bindEvents() {
        // Row selection
        const rows = this.container.querySelectorAll('.collection-row');
        rows.forEach(row => {
            row.addEventListener('click', (e) => {
                const itemId = row.dataset.itemId;
                this.selectItem(itemId);
            });
        });

        // Column sorting
        const sortableHeaders = this.container.querySelectorAll('th.sortable');
        sortableHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                const column = header.dataset.column;
                this.handleSort(column);
            });
        });
    }

    // ====================
    // HELPERS
    // ====================

    getItemId(item) {
        // Try common ID fields
        const id = item?.itemId || item?.id || item?._id || null;
        return id !== null && id !== undefined ? parseInt(id, 10) : null;
    }

    getItemValue(item, column) {
        if (!item || !column) return null;

        const key = column.key;

        // Handle nested properties like 'impact.data'
        if (key.includes('.')) {
            const parts = key.split('.');
            let value = item;
            for (const part of parts) {
                value = value?.[part];
            }
            return value;
        }

        return item[key];
    }

    getEmptyStateMessage() {
        // Can be overridden by passing options
        return {
            icon: '📄',
            title: `No ${this.entityConfig.name || 'Items'} Yet`,
            description: `Start creating ${(this.entityConfig.name || 'items').toLowerCase()} to see them here.`,
            createButtonText: `Create First ${this.getEntitySingularName()}`,
            showCreateButton: true
        };
    }

    getEntitySingularName() {
        const name = this.entityConfig.name || 'Item';
        if (name.endsWith('ies')) {
            return name.slice(0, -3) + 'y';
        }
        if (name.endsWith('s')) {
            return name.slice(0, -1);
        }
        return name;
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

    cleanup() {
        this.container = null;
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.currentFilters = {};
        this.currentGrouping = 'none';
        this.currentSort = null;
    }
}