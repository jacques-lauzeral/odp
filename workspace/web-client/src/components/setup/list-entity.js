import { dom } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';
import { errorHandler } from '../../shared/error-handler.js';

export default class ListEntity {
    constructor(app, entityConfig) {
        this.app = app;
        this.config = entityConfig;
        this.container = null;
        this.data = [];
        this.selectedItem = null;
    }

    async render(container) {
        this.container = container;
        await this.loadData();
        this.renderUI();
        this.attachEventListeners();
    }

    async loadData() {
        try {
            this.data = await apiClient.get(this.config.endpoint);
            this.data = this.sortData(this.data);
        } catch (error) {
            console.error(`Failed to load ${this.config.name}:`, error);
            this.data = [];
            throw error;
        }
    }

    sortData(data) {
        // Default implementation - can be overridden by subclasses
        return data;
    }

    getNewButtonText() {
        // Default add button text - can be overridden by subclasses
        const singular = this.config.name.endsWith('s')
            ? this.config.name.slice(0, -1)
            : this.config.name;
        return `New ${singular}`;
    }

    renderUI() {
        const html = `
            <div class="list-entity">
                <div class="entity-header">
                    <div class="entity-info">
                        <h2>${this.config.name}</h2>
                        <p class="entity-description">${this.getEntityDescription()}</p>
                    </div>
                    <div class="entity-actions">
                        <button class="btn btn-primary" id="add-item-btn">
                            ${this.getNewButtonText()}
                        </button>
                    </div>
                </div>
                
                <div class="entity-content">
                    <div class="table-container" id="table-container">
                        ${this.renderTable()}
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    }

    getEntityDescription() {
        // Default description - can be overridden by subclasses
        return `Manage ${this.config.name.toLowerCase()} for the system`;
    }

    renderTable() {
        if (!Array.isArray(this.data) || this.data.length === 0) {
            return `<p class="no-data">No ${this.config.name.toLowerCase()} found. Click "${this.getNewButtonText()}" to create the first item.</p>`;
        }

        const columns = this.getTableColumns();
        const headers = columns.map(col => `<th>${col.label}</th>`).join('');
        const rows = this.data.map(item => this.renderTableRow(item, columns)).join('');

        return `
            <table class="table">
                <thead>
                    <tr>
                        ${headers}
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    getTableColumns() {
        // Default columns - should be overridden by subclasses
        return [
            { key: 'id', label: 'ID' },
            { key: 'name', label: 'Name' }
        ];
    }

    renderTableRow(item, columns) {
        const cells = columns.map(col => {
            const value = this.getCellValue(item, col);
            return `<td>${this.formatCellValue(value, col, item)}</td>`;
        }).join('');

        const isSelected = this.selectedItem?.id === item.id;

        return `
            <tr class="table-row ${isSelected ? 'table-row--selected' : ''}" data-id="${item.id}">
                ${cells}
                <td>
                    <div class="row-actions">
                        ${this.renderRowActions(item)}
                    </div>
                </td>
            </tr>
        `;
    }

    getCellValue(item, column) {
        // Handle nested properties (e.g., 'parent.name')
        const keys = column.key.split('.');
        let value = item;

        for (const key of keys) {
            value = value?.[key];
            if (value === undefined || value === null) break;
        }

        return value;
    }

    formatCellValue(value, column, item) {
        // Default formatting - can be overridden by subclasses
        if (value === null || value === undefined) {
            return '-';
        }

        // Handle different data types
        if (column.type === 'date' && value) {
            return new Date(value).toLocaleDateString();
        }

        if (column.type === 'boolean') {
            return value ? 'Yes' : 'No';
        }

        return String(value);
    }

    renderRowActions(item) {
        // Default row actions - can be overridden by subclasses
        return `
            <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${item.id}">
                Edit
            </button>
            <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${item.id}">
                Delete
            </button>
        `;
    }

    attachEventListeners() {
        // Add item button
        const addItemBtn = dom.find('#add-item-btn', this.container);
        if (addItemBtn) {
            addItemBtn.addEventListener('click', () => {
                this.handleAdd();
            });
        }

        // Row actions (delegated event handling)
        const tableContainer = dom.find('#table-container', this.container);
        if (tableContainer) {
            tableContainer.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action]');
                if (button) {
                    const action = button.dataset.action;
                    const itemId = button.dataset.id;
                    this.handleAction(action, itemId);
                }
            });
        }

        // Row selection (optional)
        const tableRows = dom.findAll('.table-row', this.container);
        tableRows.forEach(row => {
            row.addEventListener('click', (e) => {
                // Only select if not clicking an action button
                if (!e.target.closest('[data-action]')) {
                    const itemId = row.dataset.id;
                    this.selectItem(itemId);
                }
            });
        });
    }

    selectItem(itemId) {
        // Remove previous selection
        const prevSelected = dom.find('.table-row--selected', this.container);
        if (prevSelected) {
            prevSelected.classList.remove('table-row--selected');
        }

        // Add selection to clicked row
        const selectedRow = dom.find(`[data-id="${itemId}"]`, this.container);
        if (selectedRow) {
            selectedRow.classList.add('table-row--selected');
        }

        // Update selected item
        const numericItemId = parseInt(itemId, 10);
        this.selectedItem = this.data.find(item => item.id === numericItemId);

        // Notify subclasses of selection change
        this.onItemSelected(this.selectedItem);
    }

    onItemSelected(item) {
        // Hook for subclasses to handle item selection
        // Override in subclasses if needed
    }

    // Action handlers - to be implemented by subclasses
    handleAdd() {
        console.log('Add new item for', this.config.name);
        // Override in subclasses
    }

    handleAction(action, itemId) {
        const numericItemId = parseInt(itemId, 10);
        const item = this.data.find(d => d.id === numericItemId);

        switch (action) {
            case 'edit':
                this.handleEdit(item);
                break;
            case 'delete':
                this.handleDelete(item);
                break;
            case 'view':
                this.handleView(item);
                break;
            default:
                console.warn('Unknown action:', action);
        }
    }

    handleEdit(item) {
        console.log('Edit item:', item);
        // Override in subclasses
    }

    handleDelete(item) {
        console.log('Delete item:', item);
        // Override in subclasses
    }

    handleView(item) {
        console.log('View item:', item);
        // Override in subclasses
    }

    // Selection management methods for post-operation behavior
    async refreshAndSelect(itemId) {
        await this.refresh();
        if (itemId) {
            this.selectItem(itemId.toString());
        }
    }

    async refreshAndClearSelection() {
        this.selectedItem = null;
        await this.refresh();
    }

    async refresh() {
        await this.loadData();

        // Update table container
        const tableContainer = dom.find('#table-container', this.container);
        if (tableContainer) {
            tableContainer.innerHTML = this.renderTable();
        }

        // Clear selection if item no longer exists
        if (this.selectedItem && !this.data.find(item => item.id === this.selectedItem.id)) {
            this.selectedItem = null;
        }

        // Re-attach event listeners for table
        this.attachTableEventListeners();
    }

    attachTableEventListeners() {
        // Re-attach only table-specific event listeners after refresh
        const tableContainer = dom.find('#table-container', this.container);
        if (tableContainer) {
            // Clear any existing listeners by cloning the container
            const newTableContainer = tableContainer.cloneNode(true);
            tableContainer.parentNode.replaceChild(newTableContainer, tableContainer);

            // Now attach fresh listeners to the clean container
            newTableContainer.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action]');
                if (button) {
                    const action = button.dataset.action;
                    const itemId = button.dataset.id;
                    this.handleAction(action, itemId);
                }
            });
        }

        // Clear and re-add row selection listeners
        const tableRows = dom.findAll('.table-row', this.container);
        tableRows.forEach(row => {
            // Clone to remove old listeners
            const newRow = row.cloneNode(true);
            row.parentNode.replaceChild(newRow, row);

            // Add fresh listener
            newRow.addEventListener('click', (e) => {
                if (!e.target.closest('[data-action]')) {
                    const itemId = newRow.dataset.id;
                    this.selectItem(itemId);
                }
            });
        });
    }

    // Utility methods for subclasses
    showLoading() {
        const tableContainer = dom.find('#table-container', this.container);
        if (tableContainer) {
            tableContainer.innerHTML = `
                <div class="loading">
                    <div class="spinner"></div>
                    <p>Loading ${this.config.name.toLowerCase()}...</p>
                </div>
            `;
        }
    }

    showError(message) {
        const tableContainer = dom.find('#table-container', this.container);
        if (tableContainer) {
            tableContainer.innerHTML = `
                <div class="error-state">
                    <p class="error-message">${message}</p>
                    <button class="btn btn-secondary" onclick="this.refresh()">Try Again</button>
                </div>
            `;
        }
    }

    cleanup() {
        // Cleanup any resources, event listeners, etc.
        this.selectedItem = null;
        this.data = [];
    }
}