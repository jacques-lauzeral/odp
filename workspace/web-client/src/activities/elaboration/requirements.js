import CollectionEntity from '../../components/odp/collection-entity.js';
import RequirementForm from './requirement-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';
import { format } from '../../shared/utils.js';

export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // Initialize collection with ODP column types (unchanged)
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { setupData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate(),
            onRefresh: () => this.handleRefresh(),
            getEmptyStateMessage: () => ({
                icon: '📋',
                title: 'No Requirements Yet',
                description: 'Start creating operational requirements to define system needs and behaviors.',
                createButtonText: 'Create First Requirement',
                showCreateButton: true
            })
        });

        // CHANGED: Initialize form using new inheritance pattern
        this.form = new RequirementForm(entityConfig, setupData);

        // Listen for save events
        document.addEventListener('entitySaved', async(e) => {
            if (e.detail.entityType === 'Operational Requirements') {
                await this.collection.refresh();
            }
        });
    }

    // ====================
    // COLLECTION CONFIGURATION
    // ====================

    getFilterConfig() {
        return [
            {
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                    { value: '', label: 'All Types' },
                    { value: 'ON', label: 'ON (Operational Need)' },
                    { value: 'OR', label: 'OR (Operational Requirement)' }
                ]
            },
            {
                key: 'title',
                label: 'Title Pattern',
                type: 'text',
                placeholder: 'Search in title...'
            },
            {
                key: 'impactsData',
                label: 'Data Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('dataCategories', 'Any Data Category')
            },
            {
                key: 'impactsStakeholderCategories',
                label: 'Stakeholder Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('stakeholderCategories', 'Any Stakeholder Category')
            },
            {
                key: 'impactsRegulatoryAspects',
                label: 'Regulatory Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('regulatoryAspects', 'Any Regulatory Aspect')
            },
            {
                key: 'impactsServices',
                label: 'Services Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('services', 'Any Service')
            }
        ];
    }

    getColumnConfig() {
        return [
            {
                key: 'itemId',
                label: 'ID',
                width: '80px',
                sortable: true,
                type: 'text'
            },
            {
                key: 'type',
                label: 'Type',
                width: '80px',
                sortable: true,
                type: 'requirement-type',
                groupPriority: { 'ON': 1, 'OR': 2 }
            },
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                sortable: true,
                type: 'text'
            },
            {
                key: 'refinesParents',
                label: 'Refines',
                width: '150px',
                sortable: false,
                type: 'entity-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Refinement',
                groupPrefix: 'Refines'
            },
            {
                key: 'impactsData',
                label: 'Data',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'dataCategories',
                renderMode: 'inline',
                noneLabel: 'No Data Impact'
            },
            {
                key: 'impactsStakeholderCategories',
                label: 'Stakeholder',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'stakeholderCategories',
                renderMode: 'inline',
                noneLabel: 'No Stakeholder Impact'
            },
            {
                key: 'impactsRegulatoryAspects',
                label: 'Regulatory',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'regulatoryAspects',
                renderMode: 'inline',
                noneLabel: 'No Regulatory Impact'
            },
            {
                key: 'impactsServices',
                label: 'Services',
                width: '120px',
                sortable: true,
                type: 'multi-setup-reference',
                setupEntity: 'services',
                renderMode: 'inline',
                noneLabel: 'No Services Impact'
            },
            {
                key: 'createdBy',
                label: 'Updated By',
                width: '130px',
                sortable: true,
                type: 'text'
            },
            {
                key: 'createdAt',
                label: 'Updated',
                width: '110px',
                sortable: true,
                type: 'date'
            }
        ];
    }

    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'type', label: 'Type' },
            { key: 'refinesParents', label: 'Refines' },
            { key: 'impactsData', label: 'Data Impact' },
            { key: 'impactsStakeholderCategories', label: 'Stakeholder Impact' },
            { key: 'impactsRegulatoryAspects', label: 'Regulatory Impact' },
            { key: 'impactsServices', label: 'Services Impact' }
        ];
    }

    // ====================
    // HELPER METHODS
    // ====================

    buildOptionsFromSetupData(entityName, emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        if (!this.setupData?.[entityName]) {
            return baseOptions;
        }

        const labelKey = entityName === 'regulatoryAspects' ? 'title' : 'name';
        const setupOptions = this.setupData[entityName].map(entity => ({
            value: entity.id,
            label: entity[labelKey] || entity.name || entity.id
        }));

        return baseOptions.concat(setupOptions);
    }

    // ====================
    // EVENT HANDLERS
    // ====================

    handleCreate() {
        this.form.showCreateModal();
    }

    handleEdit(item) {
        this.form.showEditModal(item || this.collection.selectedItem);
    }

    handleItemSelect(item) {
        // Update details panel
        this.updateDetailsPanel(item);
    }

    handleRefresh() {
        // Any additional refresh logic
        console.log('Requirements refreshed');
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        const detailsHtml = await this.form.generateReadOnlyView(item);
        detailsContainer.innerHTML = `
        <div class="details-sticky-header">
            <div class="item-title-section">
                <h3 class="item-title">${item.title || `${item.type || 'Item'} ${item.itemId}`}</h3>
                <span class="item-id">${item.type ? `[${item.type}] ` : ''}${item.itemId}</span>
            </div>
            <div class="details-actions">
                <button class="btn btn-primary btn-sm" id="editItemBtn">Edit</button>
                <!-- Placeholder for future Delete button -->
            </div>
        </div>
        <div class="details-scrollable-content">
            ${detailsHtml}
        </div>
        `;

        // Bind edit button
        const editBtn = detailsContainer.querySelector('#editItemBtn');
        if (editBtn) {
            editBtn.addEventListener('click', () => this.handleEdit(item));
        }

        // Bind additional action buttons
        this.bindAdditionalActions(item);
    }

    renderAdditionalActions(item) {
        const actions = [];

        // Show "Create Child Requirement" for ONs
        if (item.type === 'ON') {
            actions.push(`
                <button class="btn btn-secondary btn-sm" id="createChildBtn">
                    Create Child OR
                </button>
            `);
        }

        // Show "View Children" if this requirement has children
        if (this.hasChildRequirements(item)) {
            actions.push(`
                <button class="btn btn-secondary btn-sm" id="viewChildrenBtn">
                    View Children
                </button>
            `);
        }

        // Show "View Changes" if there are changes that satisfy this requirement
        if (item.satisfiedByChanges && item.satisfiedByChanges.length > 0) {
            actions.push(`
                <button class="btn btn-secondary btn-sm" id="viewChangesBtn">
                    View Changes (${item.satisfiedByChanges.length})
                </button>
            `);
        }

        return actions.join('');
    }

    bindAdditionalActions(item) {
        // Create Child OR button
        const createChildBtn = document.querySelector('#createChildBtn');
        if (createChildBtn) {
            createChildBtn.addEventListener('click', () => {
                this.handleCreateChild(item);
            });
        }

        // View Children button
        const viewChildrenBtn = document.querySelector('#viewChildrenBtn');
        if (viewChildrenBtn) {
            viewChildrenBtn.addEventListener('click', () => {
                this.handleViewChildren(item);
            });
        }

        // View Changes button
        const viewChangesBtn = document.querySelector('#viewChangesBtn');
        if (viewChangesBtn) {
            viewChangesBtn.addEventListener('click', () => {
                this.handleViewChanges(item);
            });
        }
    }

    hasChildRequirements(item) {
        // Check if any requirements refine this one
        return this.collection.data.some(req => {
            const refinesParents = req.refinesParents || [];
            return refinesParents.some(parent => {
                const parentId = parent.itemId || parent.id || parent;
                return parentId === (item.itemId || item.id);
            });
        });
    }

    handleCreateChild(parentItem) {
        // Create a new OR that refines this ON
        // This would need to be implemented in RequirementForm to pre-select the parent
        console.log('Create child OR for:', parentItem);
        // TODO: Pass parent context to form
        this.form.showCreateModal();
    }

    handleViewChildren(item) {
        // Filter the collection to show only children of this requirement
        const itemId = item.itemId || item.id;

        // Clear other filters first
        this.collection.clearFilters();

        // Apply a custom filter for children
        // This would need enhancement in the collection entity
        console.log('View children of:', item);
    }

    handleViewChanges(item) {
        // Navigate to changes view filtered by this requirement
        // This would need coordination with the app router
        console.log('View changes satisfying:', item);
    }

    // ====================
    // PUBLIC INTERFACE
    // ====================

    async render(container) {
        this.container = container;
        await this.collection.render(container);
    }

    async refresh() {
        await this.collection.refresh();

        // After refresh, reload form's parent cache if needed
        if (this.form.parentRequirementsCache) {
            this.form.parentRequirementsCache = null;
        }
    }

    handleFilter(filterKey, filterValue) {
        this.collection.handleFilter(filterKey, filterValue);
    }

    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);
    }

    handleEditModeToggle(enabled) {
        // Future: Handle inline editing mode
        console.log('Edit mode:', enabled);
    }

    cleanup() {
        this.collection.cleanup();
        this.container = null;
    }

    // ====================
    // REQUIREMENT-SPECIFIC OPERATIONS
    // ====================

    async getRequirementHierarchy(rootId = null) {
        try {
            // Get all requirements
            const allRequirements = this.collection.data;

            // Build hierarchy
            const hierarchy = [];
            const requirementsById = {};

            // Index by ID
            allRequirements.forEach(req => {
                const id = req.itemId || req.id;
                requirementsById[id] = { ...req, children: [] };
            });

            // Build tree
            allRequirements.forEach(req => {
                const refinesParents = req.refinesParents || [];
                if (refinesParents.length === 0) {
                    // Root requirement
                    if (!rootId || (req.itemId || req.id) === rootId) {
                        hierarchy.push(requirementsById[req.itemId || req.id]);
                    }
                } else {
                    // Child requirement
                    refinesParents.forEach(parent => {
                        const parentId = parent.itemId || parent.id || parent;
                        if (requirementsById[parentId]) {
                            requirementsById[parentId].children.push(requirementsById[req.itemId || req.id]);
                        }
                    });
                }
            });

            return hierarchy;
        } catch (error) {
            console.error('Failed to build requirement hierarchy:', error);
            return [];
        }
    }

    async getImpactSummary() {
        try {
            const summary = {
                stakeholder: {},
                data: {},
                regulatory: {},
                services: {}
            };

            this.collection.data.forEach(req => {
                // Count stakeholder impacts
                (req.impactsStakeholderCategories || []).forEach(id => {
                    summary.stakeholder[id] = (summary.stakeholder[id] || 0) + 1;
                });

                // Count data impacts
                (req.impactsData || []).forEach(id => {
                    summary.data[id] = (summary.data[id] || 0) + 1;
                });

                // Count regulatory impacts
                (req.impactsRegulatoryAspects || []).forEach(id => {
                    summary.regulatory[id] = (summary.regulatory[id] || 0) + 1;
                });

                // Count services impacts
                (req.impactsServices || []).forEach(id => {
                    summary.services[id] = (summary.services[id] || 0) + 1;
                });
            });

            return summary;
        } catch (error) {
            console.error('Failed to calculate impact summary:', error);
            return null;
        }
    }
}