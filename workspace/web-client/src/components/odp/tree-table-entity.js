import { async as asyncUtils } from '../../shared/utils.js';

/**
 * TreeTableEntity - Tree-table visualization with virtual hierarchy
 * Builds tree structure from flat entity lists using configurable path builders
 * Virtual folders (DrG, organizational) are derived from entity paths, not stored
 */
export default class TreeTableEntity {
    constructor(app, entityConfig, options = {}) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.container = null;

        // Tree structure state
        this.data = [];                    // Flat entity list
        this.requirementMap = null;        // ID - Entity map
        this.treeData = null;              // Built tree structure
        this.selectedItem = null;          // Currently selected item
        this.currentFilters = {};          // Current filter values
        this.expandedNodes = new Set();    // IDs of expanded nodes

        // Configuration callbacks (provided by parent entity)
        this.pathBuilder = options.pathBuilder || (() => []);
        this.typeRenderers = options.typeRenderers || {};
        this.columns = options.columns || [];
        this.context = options.context || {};

        // Event handlers (shared with collection perspective)
        this.onItemSelect = options.onItemSelect || (() => {});
        this.onCreate = options.onCreate || (() => {});
        this.onDataLoaded = options.onDataLoaded || (() => {});

        // Debounced filter application
        this.debouncedFilter = asyncUtils.debounce(
            () => this.applyFilters(),
            300
        );
    }

    // ====================
    // DATA MANAGEMENT
    // ====================

    /**
     * Set data and build tree structure
     * @param {Array} entities - Flat list of entities
     */
    setData(entities) {
        this.data = entities;

        // Build entity map for quick lookup
        this.requirementMap = new Map();
        entities.forEach(entity => {
            const id = entity.itemId || entity.id;
            if (id) {
                this.requirementMap.set(id, entity);
            }
        });

        this.buildTree(entities);
        // ... rest
    }

    /**
     * Build tree structure from flat entity list using pathBuilder
     * @param {Array} entities - Flat list of entities
     */
    buildTree(entities) {
        console.log('TreeTableEntity.buildTree: Building tree from', entities.length, 'entities');

        const root = {
            children: {},
            type: 'root',
            id: 'root',
            visible: true
        };

        entities.forEach(entity => {
            try {
                const path = this.pathBuilder(entity, this.requirementMap);
                if (!path || !Array.isArray(path)) {
                    console.warn('Invalid path for entity:', entity);
                    return;
                }

                let currentNode = root;

                path.forEach((pathItem, index) => {
                    const isLeaf = index === path.length - 1;
                    const nodeId = pathItem.id;

                    if (!currentNode.children[nodeId]) {
                        // Create new node
                        const renderer = this.typeRenderers[pathItem.type] || {};

                        currentNode.children[nodeId] = {
                            id: nodeId,
                            pathItem: pathItem,
                            type: pathItem.type,
                            children: {},
                            isLeaf: isLeaf,
                            parent: currentNode,
                            visible: true,
                            expanded: this.expandedNodes.has(nodeId),
                            // Node display properties from renderer
                            icon: renderer.icon || '📄',
                            iconColor: renderer.iconColor || '#666',
                            expandable: isLeaf ? false : (typeof renderer.expandable === 'function'
                                ? renderer.expandable
                                : renderer.expandable !== false),
                            label: renderer.label
                                ? renderer.label(pathItem)
                                : pathItem.value
                        };
                    }

                    currentNode = currentNode.children[nodeId];

                    // For leaf nodes, attach entity
                    if (isLeaf) {
                        currentNode.entity = entity;
                        // Update expandable based on whether node has children
                        const renderer = this.typeRenderers[pathItem.type];
                        if (renderer && typeof renderer.expandable === 'function') {
                            currentNode.expandable = renderer.expandable(currentNode);
                        }
                    }
                });
            } catch (error) {
                console.error('Error building tree path for entity:', entity, error);
            }
        });

        this.treeData = root;
        console.log('TreeTableEntity.buildTree: Tree built successfully');
    }

    // ====================
    // FILTERING
    // ====================

    /**
     * Apply filters to tree nodes
     * Hides nodes that don't match filters
     * Shows parent paths for matching nodes
     */
    applyFilters() {
        if (!this.treeData) return;

        console.log('TreeTableEntity.applyFilters:', this.currentFilters);

        // First pass: mark all leaf nodes based on filter criteria
        this.markLeafNodeVisibility(this.treeData);

        // Second pass: show parent paths for visible leaf nodes
        this.propagateVisibilityToParents(this.treeData);

        // Re-render
        this.renderContent();
    }

    /**
     * Mark leaf node visibility based on filter criteria
     * @param {Object} node - Tree node
     */
    markLeafNodeVisibility(node) {
        Object.values(node.children).forEach(child => {
            if (child.isLeaf && child.entity) {
                // Apply filter logic to entity
                child.visible = this.entityMatchesFilters(child.entity);
            } else {
                // Recurse for folder nodes
                this.markLeafNodeVisibility(child);
            }
        });
    }

    /**
     * Check if entity matches current filters
     * @param {Object} entity - Entity to check
     * @returns {boolean} - True if entity matches filters
     */
    entityMatchesFilters(entity) {
        // If no filters, show all
        if (Object.keys(this.currentFilters).length === 0) {
            return true;
        }

        // Apply each filter
        for (const [key, value] of Object.entries(this.currentFilters)) {
            if (!value) continue; // Skip empty filters

            const entityValue = entity[key];

            // Text search across multiple fields
            if (key === 'text') {
                const searchFields = ['title', 'statement', 'rationale', 'flows'];
                const searchLower = value.toLowerCase();
                const found = searchFields.some(field => {
                    const fieldValue = entity[field];
                    return fieldValue && fieldValue.toLowerCase().includes(searchLower);
                });
                if (!found) return false;
            }
            // Exact match for other filters
            else if (entityValue !== value) {
                return false;
            }
        }

        return true;
    }

    /**
     * Propagate visibility to parent nodes
     * A folder is visible if any descendant is visible
     * @param {Object} node - Tree node
     * @returns {boolean} - True if node or any descendant is visible
     */
    propagateVisibilityToParents(node) {
        let hasVisibleDescendant = false;

        Object.values(node.children).forEach(child => {
            if (child.isLeaf) {
                if (child.visible) {
                    hasVisibleDescendant = true;
                }
            } else {
                // Recurse for folder nodes
                const childHasVisible = this.propagateVisibilityToParents(child);
                if (childHasVisible) {
                    hasVisibleDescendant = true;
                }
            }
        });

        // Set folder visibility based on descendants
        if (!node.isLeaf) {
            node.visible = hasVisibleDescendant;
        }

        return node.visible;
    }

    // ====================
    // RENDERING
    // ====================

    /**
     * Render tree-table in container
     * @param {HTMLElement} container - Container element
     */
    async render(container) {
        this.container = container;

        if (!this.treeData) {
            this.renderEmpty();
            return;
        }

        this.renderContent();
    }

    /**
     * Render tree-table content
     */
    renderContent() {
        if (!this.container) return;

        const html = `
            <div class="tree-table-container">
                <div class="tree-table-wrapper">
                    <table class="tree-table">
                        <thead>
                            ${this.renderTableHeader()}
                        </thead>
                        <tbody>
                            ${this.renderTreeNodes(this.treeData, 0)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this.attachEventListeners();
    }

    /**
     * Render table header
     * @returns {string} - HTML for table header
     */
    renderTableHeader() {
        return `
            <tr>
                ${this.columns.map(col => `
                    <th style="width: ${col.width || 'auto'}">
                        ${this.escapeHtml(col.label)}
                    </th>
                `).join('')}
            </tr>
        `;
    }

    /**
     * Render tree nodes recursively
     * @param {Object} node - Tree node
     * @param {number} level - Indentation level
     * @returns {string} - HTML for tree nodes
     */
    renderTreeNodes(node, level) {
        let html = '';

        Object.values(node.children)
            .filter(child => child.visible)
            .forEach(child => {
                // Render node row
                html += this.renderNodeRow(child, level);

                // Render children if expanded
                if (child.expanded && !child.isLeaf) {
                    html += this.renderTreeNodes(child, level + 1);
                }
            });

        return html;
    }

    /**
     * Render a single node row
     * @param {Object} node - Tree node
     * @param {number} level - Indentation level
     * @returns {string} - HTML for node row
     */
    renderNodeRow(node, level) {
        const isSelected = this.selectedItem &&
            node.entity &&
            node.entity.itemId === this.selectedItem.itemId;

        const rowClass = [
            'tree-row',
            `tree-node-${node.type}`,
            isSelected ? 'selected' : ''
        ].join(' ');

        return `
            <tr class="${rowClass}" 
                data-node-id="${node.id}"
                data-node-type="${node.type}"
                data-is-leaf="${node.isLeaf}"
                data-item-id="${node.entity?.itemId || ''}" data-level="${level}">
                ${this.columns.map((col, idx) =>
            this.renderNodeCell(node, col, level, idx === 0)
        ).join('')}
            </tr>
        `;
    }

    /**
     * Render a cell for a node
     * @param {Object} node - Tree node
     * @param {Object} column - Column configuration
     * @param {number} level - Indentation level
     * @param {boolean} isFirstColumn - True if this is the first column (hierarchy)
     * @returns {string} - HTML for cell
     */
    renderNodeCell(node, column, level, isFirstColumn) {
        // Check if column applies to this node type
        if (column.appliesTo && !column.appliesTo.includes(node.type)) {
            return '<td></td>';
        }

        let content = '';

        if (isFirstColumn) {
            // First column shows hierarchy with indentation
            const indent = level * 20;
            const expandIcon = node.expandable
                ? (node.expanded ? '▼' : '▶')
                : '';

            content = `
                <div style="padding-left: ${indent}px; display: flex; align-items: center;">
                    ${expandIcon ? `<span class="expand-icon" style="cursor: pointer; margin-right: 4px;">${expandIcon}</span>` : '<span style="margin-right: 16px;"></span>'}
                    <span style="color: ${node.iconColor}; margin-right: 8px;">${node.icon}</span>
                    <span>${this.escapeHtml(node.label)}</span>
                </div>
            `;
        } else {
            // Other columns use custom render or default
            if (column.render && node.entity) {
                content = column.render(node);
            } else if (node.entity && column.key) {
                const value = node.entity[column.key];
                content = this.escapeHtml(value || '');
            }
        }

        return `<td>${content}</td>`;
    }

    /**
     * Render empty state
     */
    renderEmpty() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="tree-table-empty">
                <div class="icon">🌳</div>
                <h3>No Data Available</h3>
                <p>No entities to display in tree view.</p>
            </div>
        `;
    }

    // ====================
    // EVENT HANDLING
    // ====================

    /**
     * Attach event listeners to rendered elements
     */
    attachEventListeners() {
        if (!this.container) return;

        // Expand/collapse handlers
        this.container.querySelectorAll('.expand-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = e.target.closest('tr');
                const nodeId = row.dataset.nodeId;
                this.toggleNodeExpansion(nodeId);
            });
        });

        // Row selection handlers
        this.container.querySelectorAll('.tree-row').forEach(row => {
            row.addEventListener('click', (e) => {
                const nodeId = row.dataset.nodeId;
                const isLeaf = row.dataset.isLeaf === 'true';
                if (isLeaf) {
                    const itemId = row.dataset.itemId;
                    this.handleNodeSelect(nodeId, itemId);
                }
            });
        });
    }

    /**
     * Toggle node expansion
     * @param {string} nodeId - Node ID
     */
    toggleNodeExpansion(nodeId) {
        const node = this.findNodeById(this.treeData, nodeId);
        if (!node || !node.expandable) return;

        node.expanded = !node.expanded;

        // Track expanded state
        if (node.expanded) {
            this.expandedNodes.add(nodeId);
        } else {
            this.expandedNodes.delete(nodeId);
        }

        this.renderContent();
    }

    /**
     * Handle node selection
     * @param {string} nodeId - Node ID
     * @param {string} itemId - Item ID (for leaf nodes)
     */
    handleNodeSelect(nodeId, itemId) {
        const node = this.findNodeById(this.treeData, nodeId);
        if (!node || !node.entity) return;

        this.selectedItem = node.entity;
        this.renderContent();

        // Emit selection event
        if (this.onItemSelect) {
            this.onItemSelect(node.entity);
        }
    }

    /**
     * Find node by ID in tree
     * @param {Object} node - Current node
     * @param {string} nodeId - Node ID to find
     * @returns {Object|null} - Found node or null
     */
    findNodeById(node, nodeId) {
        if (node.id === nodeId) return node;

        for (const child of Object.values(node.children)) {
            const found = this.findNodeById(child, nodeId);
            if (found) return found;
        }

        return null;
    }

    // ====================
    // UTILITIES
    // ====================

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} - Escaped string
     */
    escapeHtml(str) {
        if (str === null || str === undefined) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Refresh tree view (rebuild and re-render)
     */
    refresh() {
        if (this.data && this.data.length > 0) {
            this.buildTree(this.data);
            this.applyFilters();
        }
    }
}