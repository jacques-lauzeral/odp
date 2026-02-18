/**
 * TreeTableEntity - Tree-table visualization with virtual hierarchy
 * Builds tree structure from flat entity lists using configurable path builders
 * Virtual folders (DrG, organizational) are derived from entity paths, not stored
 *
 * UPDATED: Now supports columnTypes delegation for consistent rendering with CollectionEntity
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
        this.currentFilters = [];          // Active filters – array of { key, value, ... }
        this.expandedNodes = new Set();    // IDs of expanded nodes

        // Configuration callbacks (provided by parent entity)
        this.pathBuilder = options.pathBuilder || (() => []);
        this.typeRenderers = options.typeRenderers || {};
        this.columns = options.columns || [];
        this.context = options.context || {};

        // Column types for rendering delegation (shared with CollectionEntity)
        this.columnTypes = options.columnTypes || {};

        /**
         * filterMatchers: same map injected into CollectionEntity.
         * (item, filterValue, context) => boolean
         * RequirementsEntity passes this.getFilterMatchers() here too.
         */
        this.filterMatchers = options.filterMatchers || {};

        // Event handlers (shared with collection perspective)
        this.onItemSelect = options.onItemSelect || (() => {});
        this.onCreate = options.onCreate || (() => {});
        this.onDataLoaded = options.onDataLoaded || (() => {});
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
                            expandable: typeof renderer.expandable === 'function'
                                ? renderer.expandable
                                : (isLeaf ? false : (renderer.expandable !== false)),
                            label: renderer.label
                                ? renderer.label(pathItem)
                                : pathItem.value
                        };
                    }

                    currentNode = currentNode.children[nodeId];

                    // For leaf nodes, attach entity
                    if (isLeaf) {
                        currentNode.entity = entity;
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
     * Apply filters to tree nodes and re-render.
     * Mirrors CollectionEntity.applyFilters() signature so both perspectives
     * can be driven by the same call from RequirementsEntity.handleFilterChange().
     *
     * @param {Array} activeFilters  Array of { key, label, value, displayValue }
     */
    applyFilters(activeFilters = []) {
        this.currentFilters = activeFilters;
        if (!this.treeData) return;

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
     * Check if entity matches all active filters.
     * Delegates to filterMatchers (same predicates used by CollectionEntity)
     * so filter behaviour is identical across Collection and Tree perspectives.
     *
     * @param {Object} entity - Entity to check
     * @returns {boolean} - True if entity passes all active filters
     */
    entityMatchesFilters(entity) {
        if (!this.currentFilters || this.currentFilters.length === 0) return true;

        return this.currentFilters.every(({ key, value }) => {
            if (!value || value === '') return true;

            const matcher = this.filterMatchers[key];
            if (typeof matcher !== 'function') {
                // No matcher for this key – pass through (fail-safe)
                return true;
            }

            return matcher(entity, value, this.context);
        });
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

        // Mark folder as visible if any descendant is visible
        if (!node.isLeaf) {
            node.visible = hasVisibleDescendant;
        }

        return hasVisibleDescendant;
    }

    // ====================
    // RENDERING
    // ====================

    /**
     * Render tree table into container
     * @param {HTMLElement} container - Container element
     */
    render(container) {
        this.container = container;
        this.renderContent();
        this.attachEventListeners();
    }

    /**
     * Render tree content
     */
    renderContent() {
        if (!this.container) return;

        if (!this.treeData || Object.keys(this.treeData.children).length === 0) {
            this.renderEmpty();
            return;
        }

        const tableHtml = `
            <div class="tree-table-container">
                <table class="tree-table">
                    <thead>
                        <tr>
                            ${this.columns.map(col => `
                                <th style="width: ${col.width || 'auto'}">${col.label}</th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${this.renderTreeNodes(this.treeData, 0)}
                    </tbody>
                </table>
            </div>
        `;

        this.container.innerHTML = tableHtml;
        this.attachEventListeners();

        // Notify parent that data is displayed
        if (this.onDataLoaded) {
            const visibleCount = this.countVisibleLeafNodes(this.treeData);
            this.onDataLoaded(visibleCount);
        }
    }

    /**
     * Count visible leaf nodes recursively
     * @param {Object} node - Tree node
     * @returns {number} - Count of visible leaf nodes
     */
    countVisibleLeafNodes(node) {
        let count = 0;
        Object.values(node.children).forEach(child => {
            if (child.visible) {
                if (child.isLeaf) {
                    count++;
                } else {
                    count += this.countVisibleLeafNodes(child);
                }
            }
        });
        return count;
    }

    /**
     * Render tree nodes recursively
     * @param {Object} node - Tree node
     * @param {number} level - Current indentation level
     * @returns {string} - HTML for tree nodes
     */
    renderTreeNodes(node, level) {
        let html = '';

        // Sort children for consistent display order
        const sortedChildren = Object.values(node.children)
            .filter(child => child.visible)
            .sort((a, b) => {
                // Sort by node type: ONs first, then ORs, then folders
                const typeOrder = {
                    'on-node': 1,       // Operational Needs first
                    'or-node': 2,       // Then Operational Requirements
                    'drg': 3,           // Then Drafting Group folders
                    'org-folder': 4     // Finally organizational folders
                };
                const typeA = typeOrder[a.type] || 99;
                const typeB = typeOrder[b.type] || 99;

                if (typeA !== typeB) {
                    return typeA - typeB;
                }

                // Within same type, sort alphabetically by label
                return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
            });

        sortedChildren.forEach(child => {
            // Render node row
            html += this.renderNodeRow(child, level);

            // Render children if expanded and has children
            // Don't rely on isLeaf flag - check actual children existence
            if (child.expanded && Object.keys(child.children).length > 0) {
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
     * UPDATED: Now delegates to columnTypes when available
     *
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

            // Evaluate expandable lazily at render time
            const isExpandable = typeof node.expandable === 'function'
                ? node.expandable(node)
                : node.expandable;

            const expandIcon = isExpandable
                ? (node.expanded ? '▼' : '▶')
                : '';

            content = `
                <div style="padding-left: ${indent}px; display: flex; align-items: center;">
                    ${expandIcon ? `<span class="expand-icon" style="cursor: pointer; margin-right: 4px;">${expandIcon}</span>` : '<span style="margin-right: 16px;"></span>'}
                    <span style="color: ${node.iconColor}; margin-right: 8px;">${node.icon}</span>
                    <span>${this.escapeHtml(node.label)}</span>
                </div>
            `;
        } else if (node.entity) {
            // Other columns - delegate to column type renderer if available
            // Priority: custom render > columnType > default

            if (column.render) {
                // Custom render function (backward compatibility)
                content = column.render(node);
            } else if (column.type && this.columnTypes && this.columnTypes[column.type]) {
                // Delegate to collection column type renderer
                const value = node.entity[column.key];
                const columnType = this.columnTypes[column.type];

                if (columnType && columnType.render) {
                    content = columnType.render(value, column, this.context);
                } else {
                    content = this.escapeHtml(value || '');
                }
            } else if (column.key) {
                // Fallback: direct value rendering
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
                const itemId = row.dataset.itemId;
                if (itemId) {  // Only select if there's an entity (itemId present)
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
        console.log('toggleNodeExpansion', nodeId);
        const node = this.findNodeById(this.treeData, nodeId);
        console.log(`toggleNodeExpansion ${nodeId} node: ${node}`);
        if (!node) return;

        // Evaluate expandable if it's a function
        const isExpandable = typeof node.expandable === 'function'
            ? node.expandable(node)
            : node.expandable;

        console.log(`toggleNodeExpansion node ${nodeId} is expandable: ${isExpandable}`);

        if (!isExpandable) return;

        node.expanded = !node.expanded;

        // Track expanded state
        if (node.expanded) {
            console.log('toggleNodeExpansion expandedNodes.add', nodeId);
            this.expandedNodes.add(nodeId);
        } else {
            console.log('toggleNodeExpansion expandedNodes.delete', nodeId);
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
        if (node.id == nodeId) return node;

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
            this.applyFilters(this.currentFilters);
        }
    }
}