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
- **Data visualization**: Vis.js for timeline and relationship displays in Read activity
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
│   │   └── setup/
│   │       ├── tree-entity.js  # ✅ Base hierarchical entity component
│   │       └── list-entity.js  # ✅ Base list/table entity component
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
│   │   ├── read/               # 📋 Read activity (planned)
│   │   └── elaboration/        # 📋 Elaboration activity (planned)
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
```javascript
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

### 3. Entity Component Extension Pattern
**Base Component Architecture** (Implemented):
```javascript
// TreeEntity.js - Base class for hierarchical entities
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

### 4. Modal-Based CRUD Operations
**Form Management** (Implemented and tested):
```javascript
// Consistent modal patterns across all entities:
- showCreateForm(parentId = null)    # Create with optional parent
- showEditForm(item)                 # Edit existing item
- showDeleteConfirmation(item)       # Delete with cascade warning
- attachModalEventListeners()        # Event handling with validation
```

### 5. Responsive Design System
**Three-Pane Layout** (Working and tested):
- **Desktop**: Tree | Detail | Actions layout for hierarchical entities
- **Mobile**: Stacked layout with collapsible sections
- **List entities**: Simple table layout with responsive row actions
- **Entity tabs**: Horizontal scroll on mobile with count badges

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
- **Base components**: `tree-entity.js`, `list-entity.js` in components/setup/

## Integration Standards

### API Communication Pattern
**Entity-Specific Methods** (Proven implementation):
```javascript
// Base entity operations with user authentication:
await apiClient.get('/stakeholder-categories');           // List with user header
await apiClient.post('/stakeholder-categories', data);    // Create with validation
await apiClient.put('/stakeholder-categories/123', data); // Update with user header
await apiClient.delete('/stakeholder-categories/123');    // Delete with user header
```

### State Management
- **URL-based context**: All application state reflected in URL for shareability
- **Component state**: TreeEntity/ListEntity manage selection and form state
- **User context**: Maintained in App instance, automatically included in API headers
- **No browser storage**: Avoided for Claude.ai compatibility

### CSS Architecture
**Component-Based Styling** (Implemented):
```css
/* Three-layer styling approach */
.odp-header { /* Layer 1: Global navigation */ }
.entity-tabs { /* Layer 2: Activity navigation */ }
.three-pane-layout { /* Layer 3: Entity operations */ }

/* Status indicators for entity-specific features */
.classification-badge { /* Data category classifications */ }
.domain-badge { /* Service domain indicators */ }
```

## Current Implementation Status

### Completed Setup Activity
**Entity Management** (Fully functional):
- **5 entity types**: All with complete CRUD operations
- **Base class patterns**: TreeEntity and ListEntity for rapid development
- **Hierarchy management**: Parent/child relationships with validation
- **Form validation**: Field validation, uniqueness constraints, date ranges
- **Responsive design**: Mobile-friendly layouts with touch interactions

### Testing Requirements
**Manual CRUD Testing** (Required before next phase):
- **Create operations**: Test all entity creation forms with validation
- **Edit operations**: Test all entity update forms with data persistence
- **Delete operations**: Test cascading deletes and confirmation workflows
- **Hierarchy management**: Test parent/child relationships and circular reference prevention

## Quality Standards

### Code Organization
- **Base class inheritance**: TreeEntity/ListEntity provide consistent patterns
- **Entity-specific customization**: Override methods for unique requirements
- **Modal form patterns**: Consistent CRUD operations across all entities

### Performance Considerations
- **Dynamic imports**: Activity modules loaded on demand
- **Component caching**: Activity instances cached for fast switching
- **Efficient DOM updates**: Minimal manipulation through utility functions

This technical solution establishes a complete Setup Management Activity foundation with proven patterns for rapid development of Read and Elaboration activities while maintaining consistency with the established server architecture.