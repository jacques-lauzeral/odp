import { dom } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';
import { errorHandler } from '../../shared/error-handler.js';

export default class TreeEntity {
    constructor(app, entityConfig) {
        this.app = app;
        this.config = entityConfig;
        this.container = null;
        this.data = [];
        this.selectedItem = null;
        this.treeStructure = [];
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
            this.treeStructure = this.buildTreeStructure(this.data);
        } catch (error) {
            console.error(`Failed to load ${this.config.name}:`, error);
            this.data = [];
            this.treeStructure = [];
            throw error;
        }
    }

    renderUI() {
        const html = `
            <div class="tree-entity">
                <div class="three-pane-layout">
                    <div class="tree-pane">
                        <div class="pane-header">
                            <h3>${this.config.name}</h3>
                            <button class="btn btn-sm btn-primary" id="add-root-btn">
                                Add Root
                            </button>
                        </div>
                        <div class="tree-container" id="tree-container">
                            ${this.renderTree()}
                        </div>
                    </div>
                    
                    <div class="detail-pane">
                        <div class="pane-header">
                            <h3>Details</h3>
                        </div>
                        <div class="detail-container" id="detail-container">
                            ${this.renderEmptyDetails()}
                        </div>
                    </div>
                    
                    <div class="actions-pane">
                        <div class="pane-header">
                            <h3>Actions</h3>
                        </div>
                        <div class="actions-container" id="actions-container">
                            ${this.renderEmptyActions()}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    }

    renderTree() {
        if (!Array.isArray(this.data) || this.data.length === 0) {
            return '<p class="no-data">No items found. Click "Add Root" to create the first item.</p>';
        }

        return `<div class="tree-nodes">${this.renderTreeNodes(this.treeStructure)}</div>`;
    }

    buildTreeStructure(flatData) {
        const itemMap = new Map();
        const roots = [];

        // Create map of all items
        flatData.forEach(item => {
            itemMap.set(item.id, { ...item, children: [] });
        });

        // Build parent-child relationships
        flatData.forEach(item => {
            const treeItem = itemMap.get(item.id);
            if (item.parentId && itemMap.has(item.parentId)) {
                itemMap.get(item.parentId).children.push(treeItem);
            } else {
                roots.push(treeItem);
            }
        });

        return roots;
    }

    renderTreeNodes(nodes, level = 0) {
        return nodes.map(node => {
            const hasChildren = node.children && node.children.length > 0;
            const indent = level * 20;
            const isSelected = this.selectedItem?.id === node.id;

            return `
                <div class="tree-item ${isSelected ? 'tree-item--selected' : ''}" 
                     data-id="${node.id}" 
                     style="padding-left: ${indent}px">
                    <div class="tree-item-content">
                        ${hasChildren
                ? '<span class="tree-toggle" data-expanded="true">▼</span>'
                : '<span class="tree-spacer">•</span>'
            }
                        <span class="tree-item-name">${this.getDisplayName(node)}</span>
                        ${hasChildren ? `<span class="child-count">(${node.children.length})</span>` : ''}
                    </div>
                    ${hasChildren ? `
                        <div class="tree-children">
                            ${this.renderTreeNodes(node.children, level + 1)}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }

    getDisplayName(item) {
        // Default implementation - can be overridden by subclasses
        return item.name || item.title || item.id;
    }

    renderEmptyDetails() {
        return `
            <div class="no-selection">
                <p>Select an item from the tree to view details</p>
            </div>
        `;
    }

    renderItemDetails(item) {
        // Base implementation - should be overridden by subclasses
        return `
            <div class="item-details">
                <div class="detail-field">
                    <label>Name</label>
                    <p>${this.getDisplayName(item)}</p>
                </div>
                ${item.description ? `
                    <div class="detail-field">
                        <label>Description</label>
                        <p>${item.description}</p>
                    </div>
                ` : ''}
                ${item.parentId ? `
                    <div class="detail-field">
                        <label>Parent ID</label>
                        <p>${item.parentId}</p>
                    </div>
                ` : ''}
                <div class="detail-field">
                    <label>ID</label>
                    <p class="text-secondary">${item.id}</p>
                </div>
            </div>
        `;
    }

    renderEmptyActions() {
        return '<p class="text-secondary">Select an item to see available actions</p>';
    }

    renderItemActions(item) {
        // Base implementation - can be overridden by subclasses
        return `
            <div class="action-buttons">
                <button class="btn btn-primary btn-sm" data-action="edit" data-id="${item.id}">
                    Edit
                </button>
                <button class="btn btn-secondary btn-sm" data-action="add-child" data-id="${item.id}">
                    Add Child
                </button>
                <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${item.id}">
                    Delete
                </button>
            </div>
        `;
    }

    attachEventListeners() {
        // Tree item selection
        const treeItems = dom.findAll('.tree-item-content', this.container);
        treeItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const treeItem = e.currentTarget.closest('.tree-item');
                const itemId = treeItem.dataset.id;
                this.selectItem(itemId);
            });
        });

        // Tree toggle (expand/collapse)
        const toggles = dom.findAll('.tree-toggle', this.container);
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTreeNode(e.currentTarget);
            });
        });

        // Add root button
        const addRootBtn = dom.find('#add-root-btn', this.container);
        if (addRootBtn) {
            addRootBtn.addEventListener('click', () => {
                this.handleAddRoot();
            });
        }

        // Action buttons (delegated event handling)
        const actionsContainer = dom.find('#actions-container', this.container);
        if (actionsContainer) {
            actionsContainer.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action]');
                if (button) {
                    const action = button.dataset.action;
                    const itemId = button.dataset.id;
                    this.handleAction(action, itemId);
                }
            });
        }
    }

    selectItem(itemId) {
        // Remove previous selection
        const prevSelected = dom.find('.tree-item--selected', this.container);
        if (prevSelected) {
            prevSelected.classList.remove('tree-item--selected');
        }

        // Add selection to clicked item
        const selectedElement = dom.find(`[data-id="${itemId}"]`, this.container);
        if (selectedElement) {
            selectedElement.classList.add('tree-item--selected');
        }

        // Update selected item and show details/actions
        this.selectedItem = this.data.find(item => item.id === itemId);
        if (this.selectedItem) {
            this.updateDetails();
            this.updateActions();
        }
    }

    updateDetails() {
        const detailContainer = dom.find('#detail-container', this.container);
        if (detailContainer && this.selectedItem) {
            detailContainer.innerHTML = this.renderItemDetails(this.selectedItem);
        }
    }

    updateActions() {
        const actionsContainer = dom.find('#actions-container', this.container);
        if (actionsContainer && this.selectedItem) {
            actionsContainer.innerHTML = this.renderItemActions(this.selectedItem);
        }
    }

    toggleTreeNode(toggle) {
        const treeItem = toggle.closest('.tree-item');
        const children = dom.find('.tree-children', treeItem);

        if (children) {
            const isExpanded = toggle.dataset.expanded === 'true';
            toggle.textContent = isExpanded ? '▶' : '▼';
            toggle.dataset.expanded = isExpanded ? 'false' : 'true';
            children.style.display = isExpanded ? 'none' : 'block';
        }
    }

    // Action handlers - to be implemented by subclasses
    handleAddRoot() {
        console.log('Add root item for', this.config.name);
        // Override in subclasses
    }

    handleAction(action, itemId) {
        const item = this.data.find(d => d.id === itemId);

        switch (action) {
            case 'edit':
                this.handleEdit(item);
                break;
            case 'add-child':
                this.handleAddChild(item);
                break;
            case 'delete':
                this.handleDelete(item);
                break;
            default:
                console.warn('Unknown action:', action);
        }
    }

    handleEdit(item) {
        console.log('Edit item:', item);
        // Override in subclasses
    }

    handleAddChild(item) {
        console.log('Add child to item:', item);
        // Override in subclasses
    }

    handleDelete(item) {
        console.log('Delete item:', item);
        // Override in subclasses
    }

    async refresh() {
        await this.loadData();
        this.renderTree();

        // Update tree container
        const treeContainer = dom.find('#tree-container', this.container);
        if (treeContainer) {
            treeContainer.innerHTML = this.renderTree();
        }

        // Clear selection if item no longer exists
        if (this.selectedItem && !this.data.find(item => item.id === this.selectedItem.id)) {
            this.selectedItem = null;
            this.updateDetails();
            this.updateActions();
        }

        // Re-attach event listeners for tree
        this.attachTreeEventListeners();
    }

    attachTreeEventListeners() {
        // Re-attach only tree-specific event listeners after refresh
        const treeItems = dom.findAll('.tree-item-content', this.container);
        treeItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const treeItem = e.currentTarget.closest('.tree-item');
                const itemId = treeItem.dataset.id;
                this.selectItem(itemId);
            });
        });

        const toggles = dom.findAll('.tree-toggle', this.container);
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTreeNode(e.currentTarget);
            });
        });
    }

    cleanup() {
        // Cleanup any resources, event listeners, etc.
        this.selectedItem = null;
        this.data = [];
        this.treeStructure = [];
    }
}