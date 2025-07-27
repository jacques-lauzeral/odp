# Web Client Technical Solution

## Overview
The ODP Web Client implements a **vanilla JavaScript** architecture with activity-based organization, matching the three main ODP activities: Setup Management, ODP Read, and ODP Elaboration. The solution emphasizes proven patterns for component reusability, API integration, and maintainable development workflows.

## Technology Stack

### Core Technologies
- **Vanilla JavaScript** with ES modules for maximum compatibility and minimal dependencies
- **HTTP Server** (http-server) for development serving with CORS support
- **Docker Compose** integration with existing ODP server infrastructure
- **Direct API integration** with manual Express routes via fetch API

### Specialized Libraries (Planned)
- **Rich text editing**: Quill or TinyMCE for content creation in Elaboration activity
- **Data visualization**: Vis.js for timeline and relationship displays in Temporal perspective
- **Modal forms**: Native implementation for Setup activity CRUD operations

### Server Integration
- **API Server**: Direct communication with ODP Express server on port 80
- **CORS Configuration**: Server-side CORS middleware with x-user-id header support
- **Shared Models**: Integration with @odp/shared workspace for consistent data structures

## Implemented Architecture

### Directory Structure
```
web-client/
├── src/
│   ├── index.html               # ✅ Main HTML template with header container
│   ├── index.js                 # ✅ Entry point with error handling
│   ├── app.js                   # ✅ App initialization, routing & API client integration
│   ├── config/
│   │   └── api.js              # ✅ API endpoints configuration with CORS
│   ├── shared/
│   │   ├── api-client.js       # ✅ Fetch wrapper with user header & error handling
│   │   ├── error-handler.js    # ✅ Centralized error management
│   │   └── utils.js            # ✅ DOM, validation, and formatting utilities
│   ├── components/
│   │   ├── common/
│   │   │   └── header.js       # ✅ Global navigation header with user context
│   │   ├── setup/
│   │   │   ├── tree-entity.js  # ✅ Base hierarchical entity component
│   │   │   └── list-entity.js  # ✅ Base list/table entity component
│   │   └── odp/                # 📋 ODP Browser components (planned)
│   │       ├── collection-entity.js       # 📋 Collection base class
│   │       ├── odp-browser.js             # 📋 Main browser container
│   │       ├── requirements-collection.js # 📋 Requirements collection extension
│   │       ├── changes-collection.js      # 📋 Changes collection extension
│   │       ├── requirements-tree.js       # 📋 Requirements hierarchical extension
│   │       └── changes-tree.js            # 📋 Changes hierarchical extension
│   ├── activities/
│   │   ├── landing/
│   │   │   ├── landing.js      # ✅ Landing page component with user ID
│   │   │   └── landing.html    # ✅ Landing page template
│   │   ├── setup/
│   │   │   ├── setup.js        # ✅ Setup activity with entity tab navigation
│   │   │   ├── stakeholder-categories.js  # ✅ Hierarchy CRUD with name/description
│   │   │   ├── regulatory-aspects.js      # ✅ Hierarchy CRUD with title/regulation ref
│   │   │   ├── data-categories.js         # ✅ Hierarchy CRUD with classification
│   │   │   ├── services.js                # ✅ Hierarchy CRUD with domain/type/owner
│   │   │   └── waves.js                   # ✅ List CRUD with year/quarter validation
│   │   ├── read/               # 📋 Read activity using ODPBrowser (planned)
│   │   ├── elaboration/        # 📋 Elaboration activity using ODPBrowser (planned)
│   │   └── review/             # 📋 Review activities using ODPBrowser (planned)
│   ├── styles/
│   │   ├── main.css            # ✅ Global styles with design tokens
│   │   ├── components.css      # ✅ Header & reusable component styling
│   │   └── activities.css      # ✅ Setup activity & responsive layouts
│   └── assets/                 # 📋 Icons and images (planned)
└── package.json                # ✅ Dependencies and workspace integration
```
**Legend**: ✅ Implemented | 📋 Planned

## Proven Implementation Patterns

### 1. Activity-Based Routing
**URL Structure** (Implemented and tested):
```
/                                    # Landing page ✅
/setup/stakeholder-categories        # Setup activity - entity management ✅
/setup/waves                         # Setup activity - wave management ✅
/read/edition/456/requirements       # Read activity - filtered content 📋
/elaboration/folders/789/req/234     # Elaboration - editing specific item 📋
```

**Three-Layer Architecture Pattern**:
```javascript
// App.js handles Layer 1 (ODP Level) routing
// setup.js handles Layer 2 (Activity Level) entity switching  
// entity components handle Layer 3 (Entity Level) CRUD operations
```

### 2. API Integration with User Authentication
**CORS Configuration** (Implemented and working):
```javascript
// Server CORS middleware includes x-user-id header
res.header('Access-Control-Allow-Headers', 
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-user-id');
```

**Client Authentication** (Tested and functional):
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

### 3. Three-Pillar Component Architecture
**Base Component Strategy** (Implemented + Planned):
```javascript
// Setup Activity Components (✅ Implemented)
TreeEntity.js    // Base for hierarchical entities with REFINES relationships
ListEntity.js    // Base for simple list/table entities

// ODP Browser Components (📋 Planned)
CollectionEntity.js // Base for SharePoint Lists-inspired collection management
```

**TreeEntity Extension Pattern** (Implemented):
```javascript
export default class TreeEntity {
    // Common tree rendering, selection, CRUD operations
    // Extensible methods: getDisplayName(), renderItemDetails(), handleCreate()
}

// Example extension pattern:
export default class StakeholderCategories extends TreeEntity {
    getDisplayName(item) { return item.name; }
    renderItemDetails(item) { /* custom details */ }
    handleAddRoot() { this.showCreateForm(); }
}
```

**CollectionEntity Extension Pattern** (Planned):
```javascript
export default class CollectionEntity {
    constructor(app, entityConfig) {
        this.config = {
            endpoint: entityConfig.endpoint,           // '/operational-requirements'
            mode: entityConfig.mode || 'view',         // 'view' | 'edit'
            grouping: entityConfig.grouping || null,   // {column: 'status', order: 'asc'}
            filtering: entityConfig.filtering || {},   // {status: ['draft', 'review']}
            columns: entityConfig.columns,             // Column definitions
            groupingOptions: entityConfig.groupingOptions // Available grouping columns
        };
        
        this.state = {
            items: [],
            selectedItem: null,
            selectedItems: [], // Multi-select for bulk operations
            currentGroup: null,
            expandedGroups: new Set(),
            loading: false,
            error: null
        };
    }
    
    // REQUIRED override points for entity-specific behavior
    getColumns() { 
        throw new Error('getColumns() must be implemented by subclass');
    }
    getGroupingOptions() { 
        throw new Error('getGroupingOptions() must be implemented by subclass');
    }
    getFilterFields() { 
        throw new Error('getFilterFields() must be implemented by subclass');
    }
    
    // OPTIONAL override points
    renderCell(value, column, item) { /* Custom cell rendering */ }
    renderItemDetails(item) { /* Custom details pane */ }
    renderGroupHeader(groupValue, items) { /* Custom group headers */ }
    getBulkActions(selectedItems) { return ['delete', 'export']; }
}

// Example operational requirements extension:
export default class OperationalRequirements extends CollectionEntity {
    getColumns() {
        return [
            { key: 'id', label: 'ID', type: 'text', width: '80px', sortable: true },
            { key: 'type', label: 'Type', type: 'badge', width: '60px', sortable: true },
            { key: 'statement', label: 'Statement', type: 'text-preview', width: '300px' },
            { key: 'status', label: 'Status', type: 'status-badge', width: '100px', sortable: true }
        ];
    }
    
    getGroupingOptions() {
        return [
            { key: 'none', label: 'None' },
            { key: 'type', label: 'Type' },
            { key: 'status', label: 'Status' },
            { key: 'stakeholderCategory', label: 'Stakeholder Category' },
            { key: 'folder', label: 'Folder' }
        ];
    }
    
    getFilterFields() {
        return [
            { key: 'search', label: 'Search', type: 'text', placeholder: 'Search statement, rationale...' },
            { key: 'type', label: 'Type', type: 'select', options: [
                { value: 'ON', label: 'Operational Need' },
                { value: 'OR', label: 'Operational Requirement' }
            ]},
            { key: 'status', label: 'Status', type: 'multi-select', options: [
                { value: 'draft', label: 'Draft' },
                { value: 'review', label: 'Review' },
                { value: 'approved', label: 'Approved' }
            ]}
        ];
    }
}
```

### 4. ODP Browser Unified Architecture
**Main Container Component** (Planned):
```javascript
// ODPBrowser.js - Single component serving multiple activities
export default class ODPBrowser {
    constructor(app, config) {
        this.config = {
            context: config.context,     // {type: 'repository', id: 'current'}
            mode: config.mode,           // 'elaboration' | 'read' | 'internal-review'
            perspective: config.perspective || 'collection', // DEFAULT: collection
            user: config.user,           // {permissions: [...], role: '...'}
            entityType: config.entityType // 'requirements' | 'changes'
        };
        
        this.perspectives = {
            collection: null,   // CollectionEntity instance
            hierarchical: null, // TreeEntity instance  
            temporal: null      // Future temporal component
        };
    }
    
    switchPerspective(newPerspective) {
        // Clean up current perspective
        if (this.currentPerspective) {
            this.currentPerspective.destroy();
        }
        
        // Initialize new perspective using appropriate base class
        switch (newPerspective) {
            case 'collection':
                this.currentPerspective = this.createCollectionPerspective();
                break;
            case 'hierarchical':
                this.currentPerspective = this.createHierarchicalPerspective();
                break;
            case 'temporal':
                this.currentPerspective = this.createTemporalPerspective();
                break;
        }
    }
    
    createCollectionPerspective() {
        // Use CollectionEntity-based component
        const entityClass = this.config.entityType === 'requirements' 
            ? OperationalRequirements 
            : OperationalChanges;
            
        return new entityClass(this.app, {
            endpoint: this.getEndpoint(),
            mode: this.config.mode,
            context: this.config.context
        });
    }
    
    createHierarchicalPerspective() {
        // Use TreeEntity-based component (reusing existing pattern)
        return new OperationalRequirementsTree(this.app, {
            endpoint: this.getEndpoint(),
            mode: this.config.mode
        });
    }
}
```

**Collection Perspective Four-Area Layout**:
```javascript
// CollectionEntity four-area rendering pattern
render() {
    return `
        <div class="collection-container">
            <!-- 1. Filtering Area (Collapsible) -->
            <div class="collection-filters ${this.state.filtersExpanded ? 'expanded' : 'collapsed'}">
                ${this.renderFilters()}
            </div>
            
            <!-- 2. Actions Area (Persistent Toolbar) -->
            <div class="collection-actions">
                ${this.renderModeToggle()}  <!-- "View" | "Edit in Collection View" -->
                ${this.renderGroupingControls()}
                ${this.renderBulkActions()}
            </div>
            
            <!-- 3. List Area (Table with Grouping) -->
            <div class="collection-list">
                ${this.state.grouping ? this.renderGroupedList() : this.renderFlatList()}
            </div>
            
            <!-- 4. Details Area (Selected Item) -->
            <div class="collection-details">
                ${this.state.selectedItem ? this.renderItemDetails(this.state.selectedItem) : ''}
            </div>
        </div>
    `;
}
```

### 5. Modal-Based CRUD Operations
**Form Management** (Implemented and tested):
```javascript
// Consistent modal patterns across all entities:
- showCreateForm(parentId = null)    # Create with optional parent
- showEditForm(item)                 # Edit existing item
- showDeleteConfirmation(item)       # Delete with cascade warning
- attachModalEventListeners()        # Event handling with validation
```

### 6. Responsive Design System
**Layout Patterns** (Working and tested + planned):
- **Desktop**: Tree | Detail | Actions layout for hierarchical entities
- **Mobile**: Stacked layout with collapsible sections
- **List entities**: Simple table layout with responsive row actions
- **Entity tabs**: Horizontal scroll on mobile with count badges
- **Collection four-area**: Responsive stacking and collapsible filtering

## Development Workflow

### Docker Compose Integration
**Service Configuration** (Working):
```yaml
web-client:
  image: node:20
  working_dir: /app
  ports:
    - "3000:3000"
  depends_on:
    - odp-server
  volumes:
    - .:/app
    - /app/workspace/web-client/node_modules
  command: ["sh", "-c", "cd workspace/web-client && npm install && npm run dev"]
```

### Development Commands
```bash
# Start full environment
docker-compose up

# Access points
# Web Client: http://localhost:3000
# API Server: http://localhost
# Neo4j Browser: http://localhost:7474
```

### File Naming Conventions
- **Plural filenames**: `stakeholder-categories.js` (matches URL structure)
- **Singular classes**: `StakeholderCategory` (represents single entity)
- **Base components**: `tree-entity.js`, `list-entity.js` in `components/setup/`
- **ODP components**: `collection-entity.js`, `odp-browser.js` in `components/odp/`

## Integration Standards

### API Communication Pattern
**Entity-Specific Methods** (Proven implementation):
```javascript
// Base entity operations with user authentication:
await apiClient.get('/stakeholder-categories');           // List with user header
await apiClient.post('/stakeholder-categories', data);    // Create with validation
await apiClient.put('/stakeholder-categories/123', data); // Update with user header
await apiClient.delete('/stakeholder-categories/123');    // Delete with user header

// Collection-specific operations (planned):
await apiClient.get('/operational-requirements?groupBy=status&order=asc'); // Server-side grouping
await apiClient.get('/operational-requirements?context=repository');       // Context filtering
await apiClient.patch('/operational-requirements/bulk', bulkData);         // Bulk operations
```

### State Management
- **URL-based context**: All application state reflected in URL for shareability
- **Component state**: TreeEntity/ListEntity/CollectionEntity manage selection and form state
- **User context**: Maintained in App instance, automatically included in API headers
- **No browser storage**: Avoided for Claude.ai compatibility

### CSS Architecture
**Component-Based Styling** (Implemented + planned):
```css
/* Three-layer styling approach */
.odp-header { /* Layer 1: Global navigation */ }
.entity-tabs { /* Layer 2: Activity navigation */ }
.three-pane-layout { /* Layer 3: Entity operations */ }

/* Status indicators for entity-specific features */
.classification-badge { /* Data category classifications */ }
.domain-badge { /* Service domain indicators */ }

/* Collection perspective styling (planned) */
.collection-container { /* Four-area layout container */ }
.collection-filters { /* Collapsible filtering area */ }
.collection-actions { /* Persistent action toolbar */ }
.collection-list { /* Grouped list/table area */ }
.collection-details { /* Selected item details */ }
```

## Current Implementation Status

### ✅ Completed Setup Activity
**Entity Management** (Fully functional):
- **5 entity types**: All with complete CRUD operations using TreeEntity/ListEntity patterns
- **Base class patterns**: Established TreeEntity and ListEntity for rapid development
- **Hierarchy management**: Parent/child relationships with validation
- **Form validation**: Field validation, uniqueness constraints, date ranges
- **Responsive design**: Mobile-friendly layouts with touch interactions

### 📋 Planned ODP Browser Implementation
**Collection Perspective** (Technical design complete):
- **CollectionEntity base class**: SharePoint Lists-inspired component architecture
- **Entity extensions**: OperationalRequirements and OperationalChanges collections
- **Four-area layout**: Filtering | Actions | List | Details with grouping capabilities
- **Mode switching**: "View Collection" ↔ "Edit in Collection View" toggle

**Unified Browser Integration**:
- **ODPBrowser container**: Orchestrates between Collection, Hierarchical, and Temporal perspectives
- **Perspective switching**: Clean component lifecycle management
- **Configuration-driven**: Same browser serves Read, Elaboration, and Review activities
- **Pattern consistency**: Reuses Setup Activity patterns (TreeEntity) for Hierarchical perspective

**SharePoint Lists-Inspired Features**:
- **Edit in Collection View**: Toggle between read-only and editable grid modes
- **Flexible Grouping**: Dropdown selector with expand/collapse group headers
- **Advanced Filtering**: Combined with grouping for powerful data organization
- **Bulk Operations**: Multi-select with context-sensitive actions
- **Consistent UX**: Same component serves Requirements and Changes with different configurations

## Testing Requirements

### Setup Activity Validation (✅ Completed)
- **Create operations**: All entity creation forms tested with validation
- **Edit operations**: All entity update forms tested with data persistence
- **Delete operations**: Delete confirmations and cascading behavior tested
- **Hierarchy management**: Parent/child relationships and circular reference prevention tested

### ODP Browser Validation (📋 Planned)
- **Collection mode switching**: "View" ↔ "Edit in Collection View" functionality
- **Grouping operations**: Expand/collapse groups, group-by switching
- **Multi-perspective switching**: Collection ↔ Hierarchical ↔ Temporal seamless transitions
- **Activity integration**: Same browser component across Read, Elaboration, Review activities

## Quality Standards

### Code Organization
- **Base class inheritance**: TreeEntity/ListEntity/CollectionEntity provide consistent patterns
- **Entity-specific customization**: Override methods for unique requirements
- **Modal form patterns**: Consistent CRUD operations across all entities
- **Component reusability**: Maximum reuse across activities and perspectives

### Performance Considerations
- **Dynamic imports**: Activity modules loaded on demand
- **Component caching**: Activity instances cached for fast switching
- **Efficient DOM updates**: Minimal manipulation through utility functions
- **Server-side operations**: Grouping and filtering optimized through API parameters

This technical solution establishes a complete Setup Management Activity foundation with proven patterns and extends the architecture with CollectionEntity for rapid development of Collection perspective-based Read, Elaboration, and Review activities while maintaining consistency with the established server architecture.