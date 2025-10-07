import CollectionEntity from '../../components/odp/collection-entity.js';
import RequirementForm from './requirement-form.js';
import { odpColumnTypes } from '../../components/odp/odp-column-types.js';
import { apiClient } from '../../shared/api-client.js';
import { format } from '../../shared/utils.js';
import {
    OperationalRequirementType,
    getOperationalRequirementTypeDisplay,
    DraftingGroup,
    getDraftingGroupDisplay
} from '/shared/src/index.js';

/**
 * RequirementsEntity - Requirements collection management
 * Updated for Phase 19 model evolution:
 * - Removed: regulatoryAspect filter/column/grouping
 * - Added: document filter/column/grouping, dependencies column/grouping
 */
export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        this.container = null;

        // NEW: Local shared state for this entity
        this.sharedState = {
            filters: {},
            selectedItem: null,
            grouping: 'none',
            currentTabIndex: 0
        };

        // Initialize collection with ODP column types
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

        // Initialize form using new inheritance pattern with tab change callback
        this.form = new RequirementForm(entityConfig, {
            setupData,
            currentTabIndex: 0,
            onTabChange: (index) => {
                this.sharedState.currentTabIndex = index;
            }
        });

        // Listen for save events
        document.addEventListener('entitySaved', async(e) => {
            if (e.detail.entityType === 'Operational Requirements') {
                await this.collection.refresh();
            }
        });
    }

    // ====================
    // STATE MANAGEMENT - CENTRALIZED STATE
    // ====================

    applySharedState(sharedState) {
        console.log('RequirementsEntity.applySharedState:', sharedState);

        // Apply filters to collection
        if (sharedState.filters && this.collection) {
            this.collection.currentFilters = { ...sharedState.filters };
        }

        // Apply selection
        if (sharedState.selectedItem && this.collection) {
            this.collection.selectedItem = sharedState.selectedItem;
        }

        // Apply grouping
        if (sharedState.grouping && this.collection) {
            this.collection.currentGrouping = sharedState.grouping;
        }

        // NEW: Apply tab index to form context
        if (sharedState.currentTabIndex !== undefined && this.form) {
            this.sharedState.currentTabIndex = sharedState.currentTabIndex;
            this.form.context.currentTabIndex = sharedState.currentTabIndex;
        }

        // Re-render to reflect state
        this.collection.applyFilters();
    }

    syncFilters(filters) {
        console.log('RequirementsEntity.syncFilters:', filters);

        if (this.collection) {
            this.collection.currentFilters = { ...filters };
            this.collection.applyFilters();
        }
    }

    // ====================
    // COLLECTION CONFIGURATION (Updated for Phase 19)
    // ====================

    getFilterConfig() {
        return [
            {
                key: 'type',
                label: 'Type',
                type: 'select',
                options: [
                    { value: '', label: 'Any' },
                    { value: 'ON', label: getOperationalRequirementTypeDisplay('ON') },
                    { value: 'OR', label: getOperationalRequirementTypeDisplay('OR') }
                ]
            },
            {
                key: 'text',
                label: 'Full Text Search',
                type: 'text',
                placeholder: 'Search across title, statement, rationale...'
            },
            {
                key: 'drg',
                label: 'Drafting Group',
                type: 'select',
                options: this.buildDraftingGroupOptions()
            },
            {
                key: 'dataCategory',
                label: 'Data Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('dataCategories')
            },
            {
                key: 'stakeholderCategory',
                label: 'Stakeholder Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('stakeholderCategories')
            },
            {
                key: 'service',
                label: 'Services Impact',
                type: 'select',
                options: this.buildOptionsFromSetupData('services')
            },
            {
                key: 'document',
                label: 'Document Reference',
                type: 'select',
                options: this.buildOptionsFromSetupData('documents')
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
                key: 'drg',
                label: 'DRG',
                width: '120px',
                sortable: true,
                type: 'drafting-group'
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
                key: 'implementedONs',
                label: 'Implements',
                width: '150px',
                sortable: false,
                type: 'implemented-ons',
                maxDisplay: 1,
                noneLabel: 'No Implementation',
                groupPrefix: 'Implements'
            },
            {
                key: 'dependsOnRequirements',
                label: 'Depends On',
                width: '150px',
                sortable: false,
                type: 'entity-reference-list',
                maxDisplay: 1,
                noneLabel: 'No Dependencies',
                groupPrefix: 'Depends On'
            },
            {
                key: 'documentReferences',
                label: 'Documents',
                width: '150px',
                sortable: false,
                type: 'annotated-reference-list',
                maxDisplay: 2,
                noneLabel: 'No Documents'
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
            { key: 'drg', label: 'Drafting Group' },
            { key: 'refinesParents', label: 'Refines' },
            { key: 'implementedONs', label: 'Implements' },
            { key: 'dependsOnRequirements', label: 'Dependencies' },
            { key: 'documentReferences', label: 'Document References' },
            { key: 'impactsData', label: 'Data Impact' },
            { key: 'impactsStakeholderCategories', label: 'Stakeholder Impact' },
            { key: 'impactsServices', label: 'Services Impact' }
        ];
    }

    // ====================
    // HELPER METHODS (Updated for Phase 19)
    // ====================

    buildDraftingGroupOptions(emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        const drgOptions = Object.keys(DraftingGroup).map(key => ({
            value: key,
            label: getDraftingGroupDisplay(key)
        }));

        return baseOptions.concat(drgOptions);
    }

    buildOptionsFromSetupData(entityName, emptyLabel = 'Any') {
        const baseOptions = [{ value: '', label: emptyLabel }];

        if (!this.setupData?.[entityName]) {
            return baseOptions;
        }

        const setupOptions = this.setupData[entityName].map(entity => ({
            value: entity.id,
            label: entity.name || entity.title || entity.id
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

    handleReview(item) {
        // Show read-only modal in review mode
        this.form.showReadOnlyModal(item || this.collection.selectedItem);
    }

    handleItemSelect(item) {
        // Update details panel
        this.updateDetailsPanel(item);

        // Update shared state
        this.sharedState.selectedItem = item;
    }

    handleRefresh() {
        // Any additional refresh logic
        console.log('Requirements refreshed');
    }

    getCurrentTabInPanel(container) {
        const activeTab = container.querySelector('.tab-header.active');
        return activeTab ? parseInt(activeTab.dataset.tab, 10) : 0;
    }

    switchTabInPanel(container, tabIndex) {
        container.querySelectorAll('.tab-header').forEach(h =>
            h.classList.toggle('active', h.dataset.tab === tabIndex.toString()));
        container.querySelectorAll('.tab-panel').forEach(p =>
            p.classList.toggle('active', p.dataset.tab === tabIndex.toString()));

        // Also update form context and shared state
        this.form.context.currentTabIndex = tabIndex;
        this.sharedState.currentTabIndex = tabIndex;
    }

    async updateDetailsPanel(item) {
        const detailsContainer = document.querySelector('#detailsContent');
        if (!detailsContainer) return;

        // Preserve current tab before re-rendering
        const currentTab = this.getCurrentTabInPanel(detailsContainer);

        const isReviewMode = this.app.currentActivity?.config?.mode === 'review';
        const detailsButtonText = isReviewMode ? 'Review' : 'Edit';
        const detailsHtml = await this.form.generateReadOnlyView(item, true);

        detailsContainer.innerHTML = `
        <div class="details-sticky-header">
            <div class="item-title-section">
                <h3 class="item-title">${item.title || `${item.type || 'Item'} ${item.itemId}`}</h3>
                <span class="item-id">${item.type ? `[${item.type}] ` : ''}${item.itemId}</span>
            </div>
            <div class="details-actions">
                <button class="btn btn-primary btn-sm" id="detailsBtn">${detailsButtonText}</button>
                ${this.renderAdditionalActions(item)}
            </div>
        </div>
        <div class="details-scrollable-content">
            ${detailsHtml}
        </div>
    `;

        // Restore tab after rendering
        if (currentTab !== null && currentTab !== 0) {
            this.switchTabInPanel(detailsContainer, currentTab);
        }

        // Bind details button
        const detailsBtn = detailsContainer.querySelector('#detailsBtn');
        if (detailsBtn) {
            if (isReviewMode) {
                detailsBtn.addEventListener('click', () => this.handleReview(item));
            } else {
                detailsBtn.addEventListener('click', () => this.handleEdit(item));
            }
        }

        // Bind additional action buttons
        this.bindAdditionalActions(item);
    }

    renderAdditionalActions(item) {
        const actions = [];

        // Show "Create Child Requirement" for ONs
        // if (item.type === 'ON') {
        //     actions.push(`
        //         <button class="btn btn-secondary btn-sm" id="createChildBtn">
        //             Create Child OR
        //         </button>
        //     `);
        // }

        // Show "View Children" if this requirement has children
        if (this.hasChildRequirements(item)) {
            actions.push(`
                <button class="btn btn-secondary btn-sm" id="viewChildrenBtn">
                    View Children
                </button>
            `);
        }

        // Show "View Implementers" for ON-type requirements if there are OR requirements that implement it
        if (item.type === 'ON' && this.hasImplementingRequirements(item)) {
            const implementerCount = this.getImplementingRequirementsCount(item);
            actions.push(`
                <button class="btn btn-secondary btn-sm" id="viewImplementersBtn">
                    View Implementers (${implementerCount})
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

        // View Implementers button
        const viewImplementersBtn = document.querySelector('#viewImplementersBtn');
        if (viewImplementersBtn) {
            viewImplementersBtn.addEventListener('click', () => {
                this.handleViewImplementers(item);
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

    hasImplementingRequirements(item) {
        if (item.type !== 'ON') return false;

        // Check if any OR-type requirements implement this ON
        return this.collection.data.some(req => {
            if (req.type !== 'OR') return false;
            const implementedONs = req.implementedONs || [];
            return implementedONs.some(on => {
                const onId = on.itemId || on.id || on;
                return onId === (item.itemId || item.id);
            });
        });
    }

    getImplementingRequirementsCount(item) {
        if (item.type !== 'ON') return 0;

        return this.collection.data.filter(req => {
            if (req.type !== 'OR') return false;
            const implementedONs = req.implementedONs || [];
            return implementedONs.some(on => {
                const onId = on.itemId || on.id || on;
                return onId === (item.itemId || item.id);
            });
        }).length;
    }

    handleCreateChild(parentItem) {
        // Create a new OR that refines this ON
        console.log('Create child OR for:', parentItem);
        this.form.showCreateModal();
    }

    handleViewChildren(item) {
        // Filter the collection to show only children of this requirement
        const itemId = item.itemId || item.id;
        this.collection.clearFilters();
        console.log('View children of:', item);
    }

    handleViewImplementers(item) {
        // Filter the collection to show only OR requirements that implement this ON
        console.log('View implementers of ON:', item);
        const itemId = item.itemId || item.id;
        console.log('Filter by implementedONs containing:', itemId);
    }

    handleViewChanges(item) {
        // Navigate to changes view filtered by this requirement
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

        // After refresh, reload form's caches if needed
        if (this.form.parentRequirementsCache) {
            this.form.parentRequirementsCache = null;
        }
        if (this.form.onRequirementsCache) {
            this.form.onRequirementsCache = null;
        }
        if (this.form.dependencyRequirementsCache) {
            this.form.dependencyRequirementsCache = null;
        }
    }

    handleFilter(filterKey, filterValue) {
        this.collection.handleFilter(filterKey, filterValue);

        // Update shared state
        this.sharedState.filters = { ...this.collection.currentFilters };
    }

    handleGrouping(groupBy) {
        this.collection.handleGrouping(groupBy);

        // Update shared state
        this.sharedState.grouping = groupBy;
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
    // REQUIREMENT-SPECIFIC OPERATIONS (Enhanced for implementedONs)
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
                requirementsById[id] = { ...req, children: [], implementers: [] };
            });

            // Build refinement tree
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

                // Build implementation relationships
                if (req.type === 'OR' && req.implementedONs) {
                    req.implementedONs.forEach(on => {
                        const onId = on.itemId || on.id || on;
                        if (requirementsById[onId]) {
                            requirementsById[onId].implementers.push(requirementsById[req.itemId || req.id]);
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

    async getImplementationSummary() {
        try {
            const summary = {
                totalONs: 0,
                totalORs: 0,
                implementedONs: 0,
                unimplementedONs: 0,
                implementationsByDRG: {}
            };

            const allRequirements = this.collection.data;

            // Count by type
            allRequirements.forEach(req => {
                if (req.type === 'ON') {
                    summary.totalONs++;
                } else if (req.type === 'OR') {
                    summary.totalORs++;
                }
            });

            // Count implemented ONs
            const implementedONIds = new Set();
            allRequirements.forEach(req => {
                if (req.type === 'OR' && req.implementedONs) {
                    req.implementedONs.forEach(on => {
                        const onId = on.itemId || on.id || on;
                        implementedONIds.add(onId);
                    });
                }
            });

            summary.implementedONs = implementedONIds.size;
            summary.unimplementedONs = summary.totalONs - summary.implementedONs;

            // Count implementations by DRG
            allRequirements.forEach(req => {
                if (req.type === 'OR' && req.implementedONs && req.implementedONs.length > 0) {
                    const drg = req.drg || 'Unassigned';
                    if (!summary.implementationsByDRG[drg]) {
                        summary.implementationsByDRG[drg] = 0;
                    }
                    summary.implementationsByDRG[drg] += req.implementedONs.length;
                }
            });

            return summary;
        } catch (error) {
            console.error('Failed to calculate implementation summary:', error);
            return null;
        }
    }

    async getImpactSummary() {
        try {
            const summary = {
                stakeholder: {},
                data: {},
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