# Web Client Technical Solution

## Overview
The ODP Web Client implements a **vanilla JavaScript** architecture with activity-based organization, matching the three main ODP activities: Setup Management, ODP Read, and ODP Elaboration. The solution emphasizes proven patterns for component reusability, API integration, and maintainable development workflows with a clean inheritance-based form architecture.

## Technology Stack

### Core Technologies
- **Vanilla JavaScript** with ES modules for maximum compatibility and minimal dependencies
- **HTTP Server** (http-server) for development serving with CORS support
- **Docker Compose** integration with existing ODP server infrastructure
- **Direct API integration** with manual Express routes via fetch API

### Specialized Libraries
- **Rich text editing**: Ready for Quill or TinyMCE integration in Elaboration activity
- **Modal forms**: Native implementation using inheritance patterns
- **Data visualization**: Prepared for Vis.js integration for timeline displays

### Server Integration
- **API Server**: Direct communication with ODP Express server on port 80
- **CORS Configuration**: Server-side CORS middleware with x-user-id header support
- **Shared Models**: Integration with @odp/shared workspace for consistent data structures

## Implemented Architecture

### Directory Structure
```
web-client/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ index.html               # âœ… Main HTML template with header container
â”‚   â”œâ”€â”€ index.js                 # âœ… Entry point with error handling
â”‚   â”œâ”€â”€ app.js                   # âœ… App initialization, routing & API client integration
â”‚   â”œâ”€â”€ config/
â”‚   â”‚   â””â”€â”€ api.js              # âœ… API endpoints configuration with CORS
â”‚   â”œâ”€â”€ shared/
â”‚   â”‚   â”œâ”€â”€ api-client.js       # âœ… Fetch wrapper with user header & error handling
â”‚   â”‚   â”œâ”€â”€ error-handler.js    # âœ… Centralized error management
â”‚   â”‚   â””â”€â”€ utils.js            # âœ… DOM, validation, and formatting utilities
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ common/
â”‚   â”‚   â”‚   â””â”€â”€ header.js       # âœ… Global navigation header with user context
â”‚   â”‚   â”œâ”€â”€ setup/
â”‚   â”‚   â”‚   â”œâ”€â”€ tree-entity.js  # âœ… Base hierarchical entity component
â”‚   â”‚   â”‚   â””â”€â”€ list-entity.js  # âœ… Base list/table entity component
â”‚   â”‚   â””â”€â”€ odp/
â”‚   â”‚       â”œâ”€â”€ collection-entity.js     # âœ… Base collection component with setup data support
â”‚   â”‚       â”œâ”€â”€ collection-entity-form.js # âœ… Base form class using inheritance pattern
│   │       ├── tree-table-entity.js     # ✅ Tree-table perspective with virtual hierarchy
â”‚   â”‚       â””â”€â”€ odp-column-types.js      # âœ… Specialized column types for ODP data
â”‚   â”œâ”€â”€ activities/
â”‚   â”‚   â”œâ”€â”€ landing/
â”‚   â”‚   â”‚   â”œâ”€â”€ landing.js      # âœ… Landing page component with user ID
â”‚   â”‚   â”‚   â””â”€â”€ landing.html    # âœ… Landing page template
â”‚   â”‚   â”œâ”€â”€ setup/
â”‚   â”‚   â”‚   â”œâ”€â”€ setup.js        # âœ… Setup activity with entity tab navigation
â”‚   â”‚   â”‚   â”œâ”€â”€ stakeholder-categories.js  # âœ… Hierarchy CRUD with name/description
â”‚   â”‚   â”‚   â”œâ”€â”€ regulatory-aspects.js      # âœ… Hierarchy CRUD with title/regulation ref
â”‚   â”‚   â”‚   â”œâ”€â”€ data-categories.js         # âœ… Hierarchy CRUD with classification
â”‚   â”‚   â”‚   â”œâ”€â”€ services.js                # âœ… Hierarchy CRUD with domain/type/owner
â”‚   â”‚   â”‚   â””â”€â”€ waves.js                   # âœ… List CRUD with year/quarter validation
â”‚   â”‚   â””â”€â”€ elaboration/
â”‚   â”‚       â”œâ”€â”€ elaboration.js  # âœ… Elaboration activity with setup data loading
â”‚   â”‚       â”œâ”€â”€ requirements.js # âœ… Requirements entity with collection delegation
â”‚   â”‚       â”œâ”€â”€ requirement-form.js  # âœ… Requirements form using inheritance
â”‚   â”‚       â”œâ”€â”€ changes.js      # âœ… Changes entity with collection delegation
â”‚   â”‚       â””â”€â”€ change-form.js  # âœ… Changes form using inheritance
â”‚   â”œâ”€â”€ styles/
â”‚   â”‚   â”œâ”€â”€ main.css            # âœ… Global styles with design tokens
â”‚   â”‚   â”œâ”€â”€ components.css      # âœ… Header & reusable component styling
â”‚   â”‚   â”œâ”€â”€ landing.css         # âœ… Landing page styling
â”‚   â”‚   â””â”€â”€ activities/
â”‚   â”‚       â”œâ”€â”€ setup.css       # âœ… Setup activity styling
â”‚   â”‚       â””â”€â”€ elaboration.css # âœ… Elaboration activity styling
â”‚   â””â”€â”€ assets/                 # âœ… Icons and images
â””â”€â”€ package.json                # âœ… Dependencies and workspace integration
```

## Component Architecture

### Form Architecture Pattern (New Inheritance Design)

The web client uses a **clean inheritance pattern** for form management that separates concerns and enables reusable form components:

```javascript
// Base Form Class âœ… Implemented
CollectionEntityForm.js  // Abstract base class with virtual methods for inheritance

// Concrete Form Classes âœ… Implemented  
RequirementForm.js      // Extends CollectionEntityForm with requirement-specific logic
ChangeForm.js          // Extends CollectionEntityForm with change-specific logic
```

**Inheritance Pattern Benefits**:
- **Clean separation**: Base form handling separated from entity-specific logic
- **Type safety**: Clear method signatures and inheritance chain
- **Maintainability**: Less indirection, straightforward code flow
- **Extensibility**: Easy to add new form types following established pattern

### Four-Pillar Component Strategy

The web client uses four base component classes that provide extensible patterns for all entity management:

```javascript
// Setup Activity Components âœ… Implemented
TreeEntity.js         // Base for hierarchical entities with REFINES relationships (real parent-child)
ListEntity.js         // Base for simple list/table entities

// ODP Browser Components âœ… Implemented  
CollectionEntity.js   // Table/list perspective with filtering and grouping
TreeTableEntity.js    // Tree-table perspective with virtual hierarchy (derived from entity paths)
```

**Key Distinctions**:
- **TreeEntity** (Setup): Manages real hierarchical entities with parent-child relationships stored in database
- **TreeTableEntity** (ODP Browser): Displays virtual hierarchy derived from flat entity lists using path builders

### Form Inheritance Pattern
**Proven Implementation for Entity Forms**:
```javascript
export default class CollectionEntityForm {
    constructor(entityConfig, context = {}) {
        this.entityConfig = entityConfig;
        this.context = context;
    }
    
    // Virtual methods for subclass implementation
    getFieldDefinitions() { 
        throw new Error('getFieldDefinitions() must be implemented by subclass');
    }
    getFormTitle(mode) { 
        throw new Error('getFormTitle() must be implemented by subclass');
    }
    async onSave(data, mode, item) { 
        throw new Error('onSave() must be implemented by subclass');
    }
    async onValidate(data, mode, item) { 
        throw new Error('onValidate() must be implemented by subclass');
    }
}

// Example concrete implementation:
export default class RequirementForm extends CollectionEntityForm {
    constructor(entityConfig, setupData) {
        super(entityConfig, { setupData });
        this.setupData = setupData;
    }

    getFieldDefinitions() {
        return [
            {
                title: 'Basic Information',
                fields: [
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        modes: ['create', 'read', 'edit'],
                        required: true,
                        validate: (value) => {
                            if (!value || value.length < 5) {
                                return { valid: false, message: 'Title must be at least 5 characters' };
                            }
                            return { valid: true };
                        }
                    }
                    // ... more fields
                ]
            }
            // ... more sections
        ];
    }

    async onSave(data, mode, item) {
        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            const itemId = parseInt(item.itemId || item.id, 10);
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }
}
```

### TreeEntity Extension Pattern
**Proven Implementation for Hierarchical Entities**:
```javascript
export default class TreeEntity {
    constructor(app, entityConfig) {
        this.app = app;
        this.entityConfig = entityConfig;
        // Common tree rendering, selection, CRUD operations
    }
    
    // Extensible methods for entity-specific behavior
    getDisplayName(item) { /* Override in subclasses */ }
    renderItemDetails(item) { /* Override in subclasses */ }
    handleCreate() { /* Override in subclasses */ }
}

// Example extension (StakeholderCategories):
export default class StakeholderCategories extends TreeEntity {
    getDisplayName(item) { return item.name; }
    renderItemDetails(item) { /* custom details */ }
    handleAddRoot() { this.showCreateForm(); }
}
```

### CollectionEntity Extension Pattern
**Proven Implementation for Collection-Based Entities**:
```javascript
export default class CollectionEntity {
    constructor(app, entityConfig, setupData = null) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.setupData = setupData;
        
        // Collection state management
        this.data = [];
        this.filteredData = [];
        this.selectedItem = null;
        this.currentFilters = {};
        this.currentGrouping = 'none';
    }
    
    // REQUIRED override points for entity-specific behavior
    getFilterConfig() { 
        throw new Error('getFilterConfig() must be implemented by subclass');
    }
    getColumnConfig() { 
        throw new Error('getColumnConfig() must be implemented by subclass');
    }
    getGroupingConfig() { 
        throw new Error('getGroupingConfig() must be implemented by subclass');
    }
}

// Requirements Entity uses delegation pattern for collection management:
export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        // Initialize collection with delegation
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { setupData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate()
        });

        // Initialize form with inheritance
        this.form = new RequirementForm(entityConfig, setupData);
    }
}
```

### TreeTableEntity Delegation Pattern
**Proven Implementation for Tree-Table Perspectives**:
```javascript
export default class TreeTableEntity {
    constructor(app, entityConfig, options = {}) {
        this.app = app;
        this.entityConfig = entityConfig;
        this.container = null;
        
        // Tree structure state
        this.data = [];
        this.treeData = null;
        this.selectedItem = null;
        this.currentFilters = {};
        
        // Configuration callbacks (provided by parent entity)
        this.pathBuilder = options.pathBuilder || (() => []);
        this.typeRenderers = options.typeRenderers || {};
        this.columns = options.columns || [];
        
        // Event handlers (shared with collection perspective)
        this.onItemSelect = options.onItemSelect || (() => {});
        this.onCreate = options.onCreate || (() => {});
    }
    
    // Build tree from flat entity list using pathBuilder
    setData(entities) {
        this.data = entities;
        this.buildTree(entities);
    }
    
    buildTree(entities) {
        const root = { children: {}, type: 'root' };
        
        entities.forEach(entity => {
            const path = this.pathBuilder(entity);  // Get typed path
            let currentNode = root;
            
            path.forEach((pathItem, index) => {
                const isLeaf = index === path.length - 1;
                const nodeId = pathItem.id;
                
                if (!currentNode.children[nodeId]) {
                    currentNode.children[nodeId] = {
                        id: nodeId,
                        pathItem: pathItem,
                        type: pathItem.type,
                        children: {},
                        isLeaf: isLeaf,
                        parent: currentNode
                    };
                }
                
                currentNode = currentNode.children[nodeId];
                if (isLeaf) currentNode.entity = entity;
            });
        });
        
        this.treeData = root;
    }
    
    // Apply filters (hide nodes without visible descendants)
    applyFilters() {
        // Filter logic that respects shared state
    }
    
    render(container) {
        // Render tree-table with configured columns and type renderers
    }
}

// Example usage in RequirementsEntity with multi-perspective support:
export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        // Collection perspective
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { setupData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate()
        });
        
        // Tree perspective (shares handlers with collection)
        this.tree = new TreeTableEntity(app, entityConfig, {
            pathBuilder: (entity) => this.buildTreePath(entity),
            typeRenderers: this.getTreeTypeRenderers(),
            columns: this.getTreeColumns(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate()
        });
        
        // Form (shared by both perspectives)
        this.form = new RequirementForm(entityConfig, setupData);
    }
    
    buildTreePath(entity) {
        // Build typed path: DrG â†' org folders â†' requirement
        return [
            { type: 'drg', value: entity.drg, id: entity.drg },
            ...entity.path.map((segment, idx) => ({
                type: 'org-folder',
                value: segment,
                id: `${entity.drg}/${segment}`
            })),
            {
                type: entity.type === 'ON' ? 'on-node' : 'or-node',
                value: entity.title,
                id: entity.itemId,
                entity: entity
            }
        ];
    }
    
    getTreeTypeRenderers() {
        return {
            'drg': {
                icon: 'ðŸ"',
                iconColor: '#dc3545',
                expandable: true,
                label: (pathItem) => pathItem.value
            },
            'org-folder': {
                icon: 'ðŸ"',
                iconColor: '#ffc107',
                expandable: true,
                label: (pathItem) => pathItem.value
            },
            'on-node': {
                icon: 'ðŸ"·',
                iconColor: '#007bff',
                expandable: (node) => node.children?.length > 0,
                label: (pathItem) => pathItem.entity.title
            },
            'or-node': {
                icon: 'ðŸŸ©',
                iconColor: '#28a745',
                expandable: (node) => node.children?.length > 0,
                label: (pathItem) => pathItem.entity.title
            }
        };
    }
    
    getTreeColumns() {
        return [
            {
                key: 'title',
                label: 'Title',
                width: 'auto',
                appliesTo: ['drg', 'org-folder', 'on-node', 'or-node']
            },
            {
                key: 'implements',
                label: 'Implements',
                width: '150px',
                appliesTo: ['or-node'],
                render: (node) => node.pathItem.entity.implementedONs?.length || ''
            },
            {
                key: 'dependsOn',
                label: 'Depends On',
                width: '150px',
                appliesTo: ['on-node', 'or-node'],
                render: (node) => node.pathItem.entity.dependsOnRequirements?.length || ''
            }
            // ... more columns
        ];
    }
}
```

## Multi-Perspective Entity Pattern

**Purpose**: Enable entities to support multiple visualization perspectives (collection, tree, temporal) while sharing state, handlers, and data.

### Pattern Implementation

**Key Principles**:
1. **Single Data Load**: Load entity data once, share across all perspectives
2. **Shared State**: Filters, selection, and grouping coordinated across perspectives
3. **Shared Handlers**: Use same event handlers (onItemSelect, onCreate) for consistency
4. **Perspective Switching**: Managed by AbstractInteractionActivity via `currentPerspective` state

**Example: Requirements with Collection + Tree**:
```javascript
export default class RequirementsEntity {
    constructor(app, entityConfig, setupData) {
        this.data = [];
        this.currentPerspective = 'collection';  // Managed by activity
        
        // Both perspectives use delegation pattern
        this.collection = new CollectionEntity(...);
        this.tree = new TreeTableEntity(...);
        this.form = new RequirementForm(...);
    }
    
    async render(container) {
        // Load data once
        await this.loadData();
        
        // Render active perspective
        if (this.currentPerspective === 'tree') {
            this.tree.setData(this.data);
            this.tree.render(container);
        } else {
            this.collection.setData(this.data);
            this.collection.render(container);
        }
    }
    
    // Shared state management
    applySharedState(sharedState) {
        // Apply filters to both perspectives
        if (this.collection) {
            this.collection.currentFilters = { ...sharedState.filters };
            this.collection.applyFilters();
        }
        if (this.tree) {
            this.tree.currentFilters = { ...sharedState.filters };
            this.tree.applyFilters();
        }
        
        // Apply selection (shared across perspectives)
        if (sharedState.selectedItem) {
            this.collection.selectedItem = sharedState.selectedItem;
            this.tree.selectedItem = sharedState.selectedItem;
        }
    }
    
    // Handler methods (called by both perspectives)
    handleItemSelect(item) {
        // Update shared state
        this.sharedState.selectedItem = item;
        
        // Show details panel (same for both perspectives)
        this.renderDetails(item);
    }
    
    handleCreate() {
        // Show form (same for both perspectives)
        this.form.show('create');
    }
}
```

**Example: Changes with Collection + Temporal**:
```javascript
export default class ChangesEntity {
    constructor(app, entityConfig, setupData) {
        this.collection = new CollectionEntity(...);
        this.temporal = new TemporalView(...);  // Timeline perspective
        this.form = new ChangeForm(...);
    }
    
    // Same pattern: single load, shared handlers, perspective switching
}
```

## Setup Data Integration
**Proven Pattern for Dynamic Option Loading**:
```javascript
class RequirementForm extends CollectionEntityForm {
    getSetupDataOptions(entityName) {
        if (!this.setupData?.[entityName]) return [];
        
        const labelKey = entityName === 'regulatoryAspects' ? 'title' : 'name';
        return this.setupData[entityName].map(entity => ({
            value: parseInt(entity.id, 10),
            label: entity[labelKey] || entity.name || entity.id
        }));
    }
}
```

## Activity Implementation Patterns

### Activity-Based Routing
**Implemented URL Structure**:
```
/                                    # Landing page âœ…
/setup/stakeholder-categories        # Setup activity - entity management âœ…
/setup/waves                         # Setup activity - wave management âœ…
/elaboration/requirements            # Elaboration activity - requirements âœ…
/elaboration/changes                 # Elaboration activity - changes âœ…
```

**Three-Layer Architecture Pattern**:
```javascript
// App.js handles Layer 1 (ODP Level) routing âœ…
// setup.js handles Layer 2 (Activity Level) entity switching âœ…
// elaboration.js handles Layer 2 (Activity Level) entity switching âœ…
// entity components handle Layer 3 (Entity Level) operations âœ…
```

### API Integration with User Authentication
**Implemented CORS Configuration**:
```javascript
// Server CORS middleware includes x-user-id header
res.header('Access-Control-Allow-Headers', 
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');
```

**Implemented Client Authentication**:
```javascript
// API client automatically includes user header when user identified
getHeaders(additionalHeaders = {}) {
    const headers = { ...this.defaultHeaders, ...additionalHeaders };
    if (this.app?.user?.name) {
        headers['x-user-id'] = this.app.user.name;
    }
    return headers;
}
```

## Extension Patterns

### Adding New Form Types
**Follow the Proven Form Inheritance Pattern**:

1. **Create Form Class** extending CollectionEntityForm:
```javascript
export default class NewEntityForm extends CollectionEntityForm {
    constructor(entityConfig, setupData) {
        super(entityConfig, { setupData });
        this.setupData = setupData;
    }
    
    getFieldDefinitions() {
        return [
            {
                title: 'Basic Information',
                fields: [
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        modes: ['create', 'read', 'edit'],
                        required: true
                    }
                ]
            }
        ];
    }
    
    getFormTitle(mode) {
        return mode === 'create' ? 'Create New Entity' : 'Edit New Entity';
    }
    
    async onSave(data, mode, item) {
        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        } else {
            const itemId = parseInt(item.itemId || item.id, 10);
            return await apiClient.put(`${this.entityConfig.endpoint}/${itemId}`, data);
        }
    }
    
    async onValidate(data, mode, item) {
        const errors = [];
        // Add validation logic
        return { valid: errors.length === 0, errors };
    }
}
```

2. **Update Entity Class** to use new form:
```javascript
export default class NewEntity {
    constructor(app, entityConfig, setupData) {
        // Collection delegation (unchanged)
        this.collection = new CollectionEntity(app, entityConfig, options);
        
        // Form inheritance (new pattern)
        this.form = new NewEntityForm(entityConfig, setupData);
    }
}
```

### Adding New Collection Entities
**Follow the Proven CollectionEntity Delegation Pattern**:

1. **Create Entity Class** using CollectionEntity delegation:
```javascript
export default class NewEntity {
    constructor(app, entityConfig, setupData) {
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { setupData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate()
        });
        
        this.form = new NewEntityForm(entityConfig, setupData);
    }
    
    getFilterConfig() {
        return [
            { key: 'title', label: 'Title Pattern', type: 'text' },
            { key: 'status', label: 'Status', type: 'select', options: [...] }
        ];
    }
    
    getColumnConfig() {
        return [
            { key: 'itemId', label: 'ID', width: '80px', sortable: true },
            { key: 'title', label: 'Title', width: 'auto', sortable: true }
        ];
    }
    
    getGroupingConfig() {
        return [
            { key: 'none', label: 'No grouping' },
            { key: 'status', label: 'Status' }
        ];
    }
}
```

2. **Add to Activity**: Register in entity configuration and routing

### Setup Data Integration Best Practices
**Dynamic Options with Caching**:
```javascript
class EntityForm extends CollectionEntityForm {
    async getParentOptions() {
        try {
            // Use cache if available
            const now = Date.now();
            if (this.optionsCache && (now - this.cacheTime) < this.cacheTimeout) {
                return this.optionsCache;
            }

            // Load fresh data
            const entities = await apiClient.get(this.entityConfig.endpoint);
            const options = entities.map(entity => ({
                value: parseInt(entity.id, 10),
                label: `[${entity.type}] ${entity.title}`
            }));

            // Cache results
            this.optionsCache = options;
            this.cacheTime = now;
            return options;
        } catch (error) {
            console.error('Failed to load options:', error);
            return [];
        }
    }
}
```

## Error Handling Integration
**Implemented Error Management**:
```javascript
// Centralized error handling in API client
async request(endpoint, options = {}) {
    try {
        const response = await fetch(url, requestOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${errorMessage}`);
        }
        return response.json();
    } catch (error) {
        this.errorHandler.handleApiError(error);
        throw error; // Re-throw for component-level handling
    }
}

// Component error handling with user notification
try {
    const result = await this.form.onSave(data, mode, item);
    // Success handling
} catch (error) {
    console.error('Failed to save:', error);
    this.showFormError(error.message || 'Failed to save. Please try again.');
}
```

## File Naming Conventions
**Established and Implemented Patterns**:
- **Plural filenames**: `requirements.js`, `changes.js` (matches URL structure)
- **Singular classes**: `RequirementForm`, `ChangeForm` (represents single entity)
- **Base components**: `collection-entity.js`, `tree-table-entity.js`, `collection-entity-form.js` in `components/odp/`
- **Activity files**: `setup.js`, `elaboration.js` in respective activity directories
- **Form files**: `requirement-form.js`, `change-form.js` alongside entity files

## Development Environment

### Docker Compose Integration
**Implemented Multi-Service Environment**:
```yaml
services:
  neo4j:        # Database on ports 7474, 7687 âœ…
  odp-server:   # API server on port 80 with CORS âœ…
  web-client:   # Web app on port 3000 âœ…
```

### Development Commands
```bash
# Start full environment
docker-compose up

# Access points
# Web Client: http://localhost:3000 âœ…
# API Server: http://localhost âœ…
# Neo4j Browser: http://localhost:7474 âœ…
```

## Extension Guidelines

### Form Extension Checklist
1. **Extend CollectionEntityForm**: Use inheritance pattern for new form types
2. **Implement Virtual Methods**: getFieldDefinitions(), getFormTitle(), onSave(), onValidate()
3. **Handle Data Transformation**: transformDataForSave() and transformDataForEdit() if needed
4. **Add Validation Logic**: Custom validation in onValidate() method
5. **Test Integration**: Ensure form works with parent CollectionEntityForm infrastructure

### Component Extension Checklist
1. **Choose Pattern**:
    - Form inheritance (CollectionEntityForm)
    - Collection delegation (CollectionEntity)
    - Tree-table delegation (TreeTableEntity)
    - TreeEntity extension (Setup activity only)
    - Multi-perspective (combine multiple delegation patterns)
2. **Implement Required Methods**: Based on chosen pattern's interface requirements
3. **Add to Activity**: Update entity configuration and routing
4. **Follow Naming**: Use established file and class naming patterns
5. **Test Integration**: Ensure user authentication and error handling work
6. **Coordinate State**: For multi-perspective entities, implement shared state management

### Setup Data Integration Checklist
1. **Load in Activity**: Add endpoint to loadSetupData() method
2. **Pass to Forms**: Include setupData in form constructor
3. **Use in Options**: Build dynamic options using getSetupDataOptions() pattern
4. **Handle Display**: Use formatters for proper display formatting
5. **Support Filtering**: Enable both ID and name-based filtering

This technical solution provides a proven, extensible foundation for building sophisticated entity management interfaces with consistent patterns, proper error handling, seamless API integration, and clean separation between collection management and form handling through the inheritance pattern.