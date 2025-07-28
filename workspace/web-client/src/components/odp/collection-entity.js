import { async as asyncUtils, validate, format } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class CollectionEntity {
    constructor(app, entityConfig, setupData = null) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Collection state
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.currentFilters = {};
        this.currentGrouping = 'none';
        this.editMode = false;

        // Configuration
        this.filterConfig = this.getFilterConfig();
        this.columnConfig = this.getColumnConfig();
        this.groupingConfig = this.getGroupingConfig();

        // Debounced methods
        this.debouncedFilter = asyncUtils.debounce(
            () => this.applyFilters(),
            300
        );
    }

    // Override in subclasses for entity-specific filter configuration
    getFilterConfig() {
        return [
            { key: 'title', label: 'Title Pattern', type: 'text' },
            { key: 'status', label: 'Status', type: 'select', options: ['draft', 'review', 'approved', 'published'] }
        ];
    }

    // Override in subclasses for entity-specific column configuration
    getColumnConfig() {
        return [
            { key: 'itemId', label: 'ID', width: '80px', sortable: true },
            { key: 'title', label: 'Title', width: 'auto', sortable: true },
            { key: 'status', label: 'Status', width: '120px', sortable: true, render: 'status' },
            { key: 'updatedBy', label: 'Updated By', width: '150px', sortable: true },
            { key: 'updatedAt', label: 'Updated', width: '120px', sortable: true, render: 'date' }
        ];
    }

    // Override in subclasses for entity-specific grouping configuration
    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'status', label: 'Status' },
            { key: 'type', label: 'Type' }
        ];
    }

    // Helper methods for accessing setup data
    getSetupData() {
        return this.setupData;
    }

    hasSetupData() {
        return this.setupData !== null && this.setupData !== undefined;
    }

    getSetupDataEntity(entityName) {
        return this.setupData?.[entityName] || [];
    }

    // Helper method to build select options from setup data
    buildOptionsFromSetupData(entityName, emptyLabel = 'Any', valueKey = 'id', labelKey = 'name') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        if (!this.hasSetupData()) {
            return baseOptions;
        }

        const entities = this.getSetupDataEntity(entityName);
        if (!Array.isArray(entities) || entities.length === 0) {
            return baseOptions;
        }

        const setupOptions = entities.map(entity => ({
            value: entity[valueKey] || entity[labelKey],
            label: entity[labelKey] || entity[valueKey] || 'Unknown'
        }));

        return baseOptions.concat(setupOptions);
    }

    // Helper method to find setup data entity by ID or name
    findSetupDataEntity(entityName, value) {
        if (!this.hasSetupData() || !value) {
            return null;
        }

        const entities = this.getSetupDataEntity(entityName);
        return entities.find(entity =>
            (entity.id === value) ||
            (entity.name === value) ||
            (entity.title === value)
        );
    }

    // Helper method to get display name from setup data
    getSetupDataDisplayName(entityName, value) {
        if (!value) return 'Not Specified';

        const entity = this.findSetupDataEntity(entityName, value);
        return entity ? (entity.name || entity.title || entity.id) : value;
    }

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
                        <h3 class="group-title">${group.title}</h3>
                        <span class="group-count">${group.items.length}</span>
                    </div>
                ` : ''}
                
                <div class="collection-table-wrapper">
                    <table class="collection-table">
                        <thead>
                            <tr>
                                ${this.columnConfig.map(col => `
                                    <th style="width: ${col.width}" 
                                        class="${col.sortable ? 'sortable' : ''}" 
                                        data-column="${col.key}">
                                        ${col.label}
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
        const itemId = this.getItemValue(item, 'itemId');
        const isSelected = this.selectedItem && this.getItemValue(this.selectedItem, 'itemId') === itemId;

        return `
            <tr class="collection-row ${isSelected ? 'collection-row--selected' : ''}" 
                data-item-id="${itemId}">
                ${this.columnConfig.map(col => `
                    <td class="collection-cell collection-cell--${col.key}">
                        ${this.renderCellValue(item, col)}
                    </td>
                `).join('')}
            </tr>
        `;
    }

    renderCellValue(item, column) {
        const value = this.getItemValue(item, column.key);

        switch (column.render) {
            case 'status':
                return this.renderStatusCell(value);
            case 'date':
                return this.renderDateCell(value);
            case 'badge':
                return this.renderBadgeCell(value);
            case 'list':
                return this.renderListCell(value);
            default:
                return this.renderTextCell(value);
        }
    }

    // Override in subclasses for entity-specific value extraction
    getItemValue(item, key) {
        // Handle nested properties like 'impact.data'
        if (key.includes('.')) {
            const parts = key.split('.');
            let value = item;
            for (const part of parts) {
                value = value?.[part];
            }
            return value;
        }

        // Default mapping for common fields
        switch (key) {
            case 'itemId':
                return item.itemId || item.id;
            default:
                return item[key];
        }
    }

    renderStatusCell(value) {
        if (!value) return '-';
        return `<span class="item-status status-${value}">${this.formatStatus(value)}</span>`;
    }

    renderDateCell(value) {
        if (!value) return '-';
        return this.formatDate(value);
    }

    renderBadgeCell(value) {
        if (!value) return '-';
        return `<span class="item-badge">${this.escapeHtml(value)}</span>`;
    }

    renderListCell(value) {
        if (!value || !Array.isArray(value) || value.length === 0) return '-';
        return value.map(v => this.escapeHtml(v)).join(', ');
    }

    renderTextCell(value) {
        if (value === null || value === undefined) return '-';
        return this.escapeHtml(value.toString());
    }

    groupData(data, groupBy) {
        if (groupBy === 'none') {
            return [{
                key: 'all',
                title: `All Items (${data.length})`,
                items: data
            }];
        }

        const grouped = data.reduce((acc, item) => {
            const groupInfo = this.getGroupInfo(item, groupBy);

            if (!acc[groupInfo.key]) {
                acc[groupInfo.key] = {
                    key: groupInfo.key,
                    title: groupInfo.title,
                    items: []
                };
            }
            acc[groupInfo.key].items.push(item);
            return acc;
        }, {});

        return Object.values(grouped).sort((a, b) =>
            this.getGroupPriority(a.key, groupBy) - this.getGroupPriority(b.key, groupBy)
        );
    }

    // Override in subclasses for entity-specific grouping
    getGroupInfo(item, groupBy) {
        const value = this.getItemValue(item, groupBy) || 'unknown';
        return {
            key: value.toString(),
            title: this.formatGroupTitle(value, groupBy)
        };
    }

    // Override in subclasses for entity-specific group priorities
    getGroupPriority(key, groupBy) {
        return 0; // Default: maintain original order
    }

    // Override in subclasses for entity-specific group titles
    formatGroupTitle(value, groupBy) {
        if (value === 'unknown') return 'Unknown';
        return format.entityName(value.toString());
    }

    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <div class="icon">${this.getEmptyStateIcon()}</div>
                <h3>${this.getEmptyStateTitle()}</h3>
                <p>${this.getEmptyStateMessage()}</p>
                <button class="btn btn-primary" id="createFirstItem">
                    ${this.getCreateFirstButtonText()}
                </button>
            </div>
        `;

        const createBtn = this.container.querySelector('#createFirstItem');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.handleCreate());
        }
    }

    // Override in subclasses for entity-specific empty states
    getEmptyStateIcon() {
        return '📄';
    }

    getEmptyStateTitle() {
        return `No ${this.entityConfig.name} Yet`;
    }

    getEmptyStateMessage() {
        return `Start creating ${this.entityConfig.name.toLowerCase()} to manage your content.`;
    }

    getCreateFirstButtonText() {
        return `Create First ${this.entityConfig.name.slice(0, -1)}`;
    }

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

    selectItem(itemId) {
        const item = this.data.find(d => {
            const dataItemId = this.getItemValue(d, 'itemId');
            return dataItemId?.toString() === itemId?.toString();
        });

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

        // Update details panel
        this.updateDetailsPanel(item);
    }

    updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        detailsContainer.innerHTML = this.renderItemDetails(item);
    }

    // Override in subclasses for entity-specific details
    renderItemDetails(item) {
        return `
            <div class="item-details">
                ${this.columnConfig.map(col => `
                    <div class="detail-field">
                        <label>${col.label}</label>
                        <p>${this.renderCellValue(item, col)}</p>
                    </div>
                `).join('')}
                ${this.renderAdditionalDetails(item)}
            </div>
        `;
    }

    // Override in subclasses for entity-specific additional details
    renderAdditionalDetails(item) {
        return '';
    }

    handleSort(column) {
        // Placeholder for sorting functionality
        console.log(`Sort by ${column} - not yet implemented`);
    }

    // Public interface methods called from parent activity
    handleFilter(filterKey, filterValue) {
        this.currentFilters[filterKey] = filterValue;
        this.debouncedFilter();
    }

    handleTextFilter(filterText) {
        this.currentFilters.text = filterText;
        this.debouncedFilter();
    }

    applyFilters() {
        this.filteredData = this.data.filter(item => {
            // Apply all active filters
            for (const [key, value] of Object.entries(this.currentFilters)) {
                if (!value) continue; // Skip empty filters

                if (key === 'text') {
                    // Text search across multiple fields
                    if (!this.matchesTextFilter(item, value)) {
                        return false;
                    }
                } else {
                    // Specific field filter
                    if (!this.matchesFieldFilter(item, key, value)) {
                        return false;
                    }
                }
            }
            return true;
        });

        this.renderContent();
    }

    // Override in subclasses for entity-specific text filtering
    matchesTextFilter(item, query) {
        const lowerQuery = query.toLowerCase();
        return (
            (item.title?.toLowerCase().includes(lowerQuery)) ||
            (item.name?.toLowerCase().includes(lowerQuery)) ||
            (item.description?.toLowerCase().includes(lowerQuery))
        );
    }

    // Override in subclasses for entity-specific field filtering
    matchesFieldFilter(item, key, value) {
        const itemValue = this.getItemValue(item, key);
        if (!itemValue) return false;

        if (Array.isArray(itemValue)) {
            return itemValue.some(v => v.toString().toLowerCase().includes(value.toLowerCase()));
        }

        return itemValue.toString().toLowerCase().includes(value.toLowerCase());
    }

    handleGrouping(groupBy) {
        this.currentGrouping = groupBy;
        this.renderContent();
    }

    handleCreate() {
        console.log(`Create ${this.entityConfig.name.slice(0, -1)} - base implementation`);
    }

    handleExport() {
        console.log(`Export ${this.entityConfig.name} - base implementation`);
    }

    handleEditModeToggle(enabled) {
        this.editMode = enabled;
        console.log(`Edit mode ${enabled ? 'enabled' : 'disabled'} - base implementation`);
    }

    // Utility methods
    formatStatus(status) {
        const statusMap = {
            'draft': 'Draft',
            'review': 'In Review',
            'approved': 'Approved',
            'published': 'Published'
        };
        return statusMap[status] || format.entityName(status || 'unknown');
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        try {
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    cleanup() {
        this.container = null;
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.currentFilters = {};
        this.setupData = null;
    }
}