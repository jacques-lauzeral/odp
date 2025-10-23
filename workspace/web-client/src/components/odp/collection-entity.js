import { async as asyncUtils } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

/**
 * CollectionEntity - Pure table/list rendering engine
 * Business-agnostic collection management with pluggable column types
 * Enhanced with server-side filtering support
 * UPDATED: Supports parent-owned data pattern via setData() for multi-perspective coordination
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
        this.onFilterChange = options.onFilterChange || (() => {});

        // NEW: Callback for notifying when data changes (for badge updates)
        this.onDataLoaded = options.onDataLoaded || (() => {});

        // Cache configurations
        this.filterConfig = this.getFilterConfig();
        this.columnConfig = this.getColumnConfig();
        this.groupingConfig = this.getGroupingConfig();

        // Debounced methods
        this.debouncedFilter = asyncUtils.debounce(
            () => this.applyFilters(),
            300
        );

        // UPDATED: Debounced server-side reload with badge update callback
        this.debouncedReload = asyncUtils.debounce(
            () => this.loadData().then(() => {
                this.renderContent();
                // NEW: Notify parent that data has been reloaded
                if (this.onDataLoaded) {
                    this.onDataLoaded(this.data);
                }
            }),
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

    /**
     * NEW: Set data from parent entity (for multi-perspective coordination)
     * This is the preferred method when parent entity manages data loading
     * @param {Array} entities - Pre-loaded entity data
     */
    setData(entities) {
        this.data = Array.isArray(entities) ? entities : [];
        this.filteredData = [...this.data];
        if (this.container) {
            this.renderContent();
        }
    }

    async render(container) {
        this.container = container;

        try {
            // UPDATED: Only auto-load if data is empty (backward compatibility)
            // In multi-perspective mode, parent should call setData() before render()
            if (this.data.length === 0) {
                console.log(`${this.entityConfig.name}: No data available, attempting auto-load`);
                await this.loadData();
            } else {
                console.log(`${this.entityConfig.name}: Using existing data (${this.data.length} items)`);
            }

            this.renderContent();

            // Notify parent of data availability (whether loaded or pre-set)
            if (this.onDataLoaded && this.data.length > 0) {
                this.onDataLoaded(this.data);
            }
        } catch (error) {
            console.error(`Failed to render ${this.entityConfig.name}:`, error);
            this.renderError(error);
        }
    }

    /**
     * DEPRECATED for multi-perspective entities - parent should manage loading
     * Kept for backward compatibility with standalone Collection usage
     */
    async loadData() {
        try {
            let endpoint = this.entityConfig.endpoint;
            const queryParams = {};

            // EXISTING: Check if we have edition context from the current activity
            const editionContext = this.app?.currentActivity?.config?.dataSource;
            if (editionContext &&
                editionContext !== 'repository' &&
                editionContext !== 'Repository' &&
                typeof editionContext === 'string' &&
                editionContext.match(/^\d+$/)) { // Ensure it looks like an edition ID

                console.log(`Resolving edition context: ${editionContext}`);

                // Step 1: Fetch the edition details to get baseline and wave references
                const edition = await apiClient.get(`/odp-editions/${editionContext}`);
                console.log('Edition details:', edition);

                // Step 2: Build query parameters from resolved context
                if (edition.baseline?.id) {
                    queryParams.baseline = edition.baseline.id;
                }
                if (edition.startsFromWave?.id) {
                    queryParams.fromWave = edition.startsFromWave.id;
                }
            }

            // NEW: Add content filters to query parameters
            if (this.currentFilters && Object.keys(this.currentFilters).length > 0) {
                Object.entries(this.currentFilters).forEach(([key, value]) => {
                    if (value && value !== '') {
                        // Handle multi-select filters that need comma-separated values
                        if (Array.isArray(value)) {
                            queryParams[key] = value.join(',');
                        } else {
                            queryParams[key] = value;
                        }
                    }
                });
            }

            // Build final endpoint with all parameters
            if (Object.keys(queryParams).length > 0) {
                const queryString = new URLSearchParams(queryParams).toString();
                endpoint = `${endpoint}?${queryString}`;
                console.log(`Loading data with context and filters - params:`, queryParams);
            }

            console.log(`Making API call to: ${endpoint}`);
            const response = await apiClient.get(endpoint);
            this.data = Array.isArray(response) ? response : [];

            // NEW: For server-side filtering, filteredData is same as data
            // since filtering is done on server
            this.filteredData = [...this.data];

            console.log(`Loaded ${this.data.length} items for ${this.entityConfig.name}`);
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

        // NEW: Notify parent of data refresh
        if (this.onDataLoaded) {
            this.onDataLoaded(this.data);
        }

        // Notify parent
        if (this.onRefresh) {
            this.onRefresh();
        }
    }

    // ====================
    // RENDERING
    // ====================

    renderContent() {
        if (!this.container) {
            console.warn('CollectionEntity: Container not available for rendering');
            return;
        }

        if (this.data.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Apply current grouping strategy
        const groupedData = this.groupData(this.filteredData);

        let html = '<div class="collection-content">';

        // Render groups
        if (Array.isArray(groupedData)) {
            // Flat list (no grouping)
            html += this.renderTable(groupedData);
        } else {
            // Grouped data
            Object.entries(groupedData).forEach(([groupKey, items]) => {
                html += this.renderGroup(groupKey, items);
            });
        }

        html += '</div>';

        this.container.innerHTML = html;
        this.bindEvents();
        this.updateSelectionUI();
    }

    renderEmptyState() {
        const emptyStateConfig = this.getEmptyStateMessage();

        this.container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${emptyStateConfig.icon}</div>
                <div class="empty-state-title">${emptyStateConfig.title}</div>
                <div class="empty-state-description">${emptyStateConfig.description}</div>
                ${emptyStateConfig.showCreateButton ? `
                    <button class="btn btn-primary empty-state-create">
                        ${emptyStateConfig.createButtonText}
                    </button>
                ` : ''}
            </div>
        `;

        // Bind create button if present
        if (emptyStateConfig.showCreateButton) {
            const createBtn = this.container.querySelector('.empty-state-create');
            if (createBtn) {
                createBtn.addEventListener('click', () => {
                    if (this.onCreate) this.onCreate();
                });
            }
        }
    }

    renderError(error) {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">⚠️</div>
                <div class="error-state-title">Failed to Load Data</div>
                <div class="error-state-description">${this.escapeHtml(error.message || 'An error occurred')}</div>
            </div>
        `;
    }

    renderGroup(groupKey, items) {
        const column = this.columnConfig.find(col => col.key === this.currentGrouping);
        const groupTitle = this.getGroupTitle(groupKey, column);

        return `
            <div class="collection-group">
                <div class="collection-group-header">
                    <span class="collection-group-title">${groupTitle}</span>
                    <span class="collection-group-count">${items.length}</span>
                </div>
                ${this.renderTable(items)}
            </div>
        `;
    }

    renderTable(items) {
        return `
            <table class="collection-table">
                <thead>
                    <tr>
                        ${this.columnConfig.map(col => `
                            <th 
                                class="${col.sortable ? 'sortable' : ''}" 
                                data-column="${col.key}"
                                style="width: ${col.width || 'auto'}">
                                ${this.escapeHtml(col.label)}
                                ${col.sortable && this.currentSort?.column === col.key ?
            (this.currentSort.direction === 'asc' ? ' ▲' : ' ▼') :
            ''
        }
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => this.renderRow(item)).join('')}
                </tbody>
            </table>
        `;
    }

    renderRow(item) {
        const itemId = this.getItemId(item);
        const isSelected = this.selectedItem && this.getItemId(this.selectedItem) === itemId;

        return `
            <tr class="collection-row ${isSelected ? 'collection-row--selected' : ''}" 
                data-item-id="${itemId}">
                ${this.columnConfig.map(col => `
                    <td>${this.renderCell(item, col)}</td>
                `).join('')}
            </tr>
        `;
    }

    renderCell(item, column) {
        const value = this.getItemValue(item, column);
        const columnType = this.columnTypes[column.type || 'text'];

        if (columnType && columnType.render) {
            return columnType.render(value, column, this.context);
        }

        return this.escapeHtml(value);
    }

    // ====================
    // FILTERING
    // ====================

    applyFilters() {
        this.filteredData = this.data.filter(item => {
            return this.filterConfig.every(filter => {
                const filterValue = this.currentFilters[filter.key];
                if (!filterValue || filterValue === '') return true;

                const itemValue = this.getItemValue(item, { key: filter.key });
                const column = this.columnConfig.find(col => col.key === filter.key);
                const columnType = this.columnTypes[column?.type || 'text'];

                if (columnType && columnType.filter) {
                    return columnType.filter(itemValue, filterValue, column);
                }

                // Default filter: string match
                return itemValue && itemValue.toString().toLowerCase().includes(filterValue.toLowerCase());
            });
        });

        this.renderContent();

        // Notify parent of filter change
        if (this.onFilterChange) {
            this.onFilterChange(this.currentFilters);
        }
    }

    handleFilter(filterKey, filterValue) {
        this.currentFilters[filterKey] = filterValue;
        this.debouncedFilter();
    }

    clearFilters() {
        this.currentFilters = {};
        this.applyFilters();
    }

    // ====================
    // GROUPING
    // ====================

    handleGrouping(groupBy) {
        this.currentGrouping = groupBy;
        this.renderContent();
    }

    groupData(data) {
        if (this.currentGrouping === 'none' || !this.currentGrouping) {
            return data;
        }

        const groups = {};
        const column = this.columnConfig.find(col => col.key === this.currentGrouping);

        data.forEach(item => {
            const value = this.getItemValue(item, column);
            const key = value?.toString() || 'none';

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        });

        // Sort groups by priority if defined
        if (column?.groupPriority) {
            const sortedKeys = Object.keys(groups).sort((a, b) =>
                this.getGroupPriority(a, b, column)
            );
            const sortedGroups = {};
            sortedKeys.forEach(key => {
                sortedGroups[key] = groups[key];
            });
            return sortedGroups;
        }

        return groups;
    }

    getGroupTitle(value, column) {
        const columnType = this.columnTypes[column?.type || 'text'];

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

    // ====================
    // EXTERNAL STATE CONTROL
    // ====================

    setFilters(filters) {
        this.currentFilters = { ...filters };
        this.applyFilters();
    }

    setSelectedItem(item) {
        this.selectedItem = item;
        this.updateSelectionUI();
    }

    setGrouping(grouping) {
        this.currentGrouping = grouping;
        this.renderContent();
    }

    updateSelectionUI() {
        if (!this.container) return;

        const rows = this.container.querySelectorAll('.collection-row');
        rows.forEach(row => {
            const itemId = row.dataset.itemId;
            const isSelected = this.selectedItem &&
                this.getItemId(this.selectedItem).toString() === itemId;
            row.classList.toggle('collection-row--selected', isSelected);
        });
    }
}