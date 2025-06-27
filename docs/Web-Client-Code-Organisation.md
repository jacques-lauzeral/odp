# Web Client Code Organisation

## Overview
The Web Client follows a **vanilla JavaScript** architecture with activity-based organization, matching the three main ODP activities: Setup Management, ODP Read, and ODP Elaboration. The structure emphasizes clear separation of concerns, reusable components, and integration with the established workspace patterns.

## Technology Stack
- **Core**: Vanilla JavaScript with ES modules
- **Specialized Libraries**:
    - Rich text: Quill or TinyMCE for content editing
    - Tables: AG-Grid or Tabulator for data management
    - Timeline: Vis.js for temporal visualization
- **API Integration**: Direct fetch calls to Express endpoints
- **Model Sharing**: Via @odp/shared workspace for consistent data structures

## Directory Structure

```
web-client/
├── src/
│   ├── index.js                 # Main entry point
│   ├── index.html               # Main HTML template
│   ├── app.js                   # App initialization & routing
│   ├── config/
│   │   └── api.js              # API endpoints configuration
│   ├── shared/
│   │   ├── api-client.js       # Fetch wrapper for server communication
│   │   ├── error-handler.js    # Centralized error handling
│   │   └── utils.js            # Common utilities
│   ├── components/
│   │   ├── common/
│   │   │   ├── header.js       # Navigation header
│   │   │   ├── modal.js        # Reusable modal component
│   │   │   └── table.js        # Table component wrapper
│   │   └── forms/
│   │       ├── form-builder.js # Dynamic form generation
│   │       └── validation.js   # Form validation utilities
│   ├── activities/
│   │   ├── landing/
│   │   │   ├── landing.js      # Landing page launcher
│   │   │   └── landing.html    # Landing page template
│   │   ├── setup/
│   │   │   ├── setup.js        # Setup activity router
│   │   │   ├── stakeholder-category/
│   │   │   │   ├── list.js     # List view
│   │   │   │   ├── form.js     # Create/edit form
│   │   │   │   └── detail.js   # Detail view
│   │   │   ├── regulatory-aspect/
│   │   │   ├── data-category/
│   │   │   ├── service/
│   │   │   └── wave/
│   │   ├── read/
│   │   │   ├── read.js         # Read activity router
│   │   │   └── edition-browser/
│   │   │       ├── search.js   # Multi-faceted search interface
│   │   │       ├── filter.js   # Filter management
│   │   │       └── detail.js   # Content detail panels
│   │   └── elaboration/
│   │       ├── elaboration.js  # Elaboration activity router
│   │       └── content-editor/
│   │           ├── editor.js   # Rich text content editor
│   │           ├── versions.js # Version management
│   │           └── relations.js # Relationship management
│   ├── styles/
│   │   ├── main.css            # Global styles
│   │   ├── components.css      # Component-specific styles
│   │   └── activities.css      # Activity-specific styles
│   └── assets/
│       └── icons/              # Activity icons
└── package.json
```

## Architecture Patterns

### Activity-Based Organization
Each main activity gets its own module with dedicated routing and components:
- **Landing**: Simple launcher interface with user identification
- **Setup**: Entity management with CRUD operations and hierarchy support
- **Read**: Query and browse interface with search/filter capabilities
- **Elaboration**: Content creation and editing workspace with versioning

### Component Organization
**Common Components**: Reusable UI elements shared across activities
- Navigation header for activity switching
- Modal dialogs for confirmations
- Table wrappers for data display
- Form builders for consistent entity editing

**Activity-Specific Components**: Specialized for each activity's needs
- Setup: Entity list/form/detail views following server entity patterns
- Read: Search, filter, and detail panel components
- Elaboration: Rich text editors and version management interfaces

### Entity Development Pattern
Following the established server pattern, each entity gets a consistent component set:
```
entity-name/
├── list.js     # List view with hierarchy display
├── form.js     # Create/edit forms with validation
└── detail.js   # Detail view with relationships
```

## Integration Architecture

### API Communication
- **Direct fetch calls** to manual Express routes
- **Shared models** imported from @odp/shared workspace
- **Consistent error handling** across all API interactions
- **Configuration-driven** endpoints for environment flexibility

### URL Structure & Deep Linking
Matches the deep-linkable architecture from UI design:
```
/                                    # Landing page
/setup/stakeholder-categories        # Setup activity - entity list
/setup/stakeholder-categories/123    # Setup activity - specific entity
/read/edition/456/requirements       # Read activity - filtered content
/elaboration/folders/789/req/234     # Elaboration - editing specific item
```

### State Management
- **URL-based context preservation** for shareability
- **Local state** for form data and UI interactions
- **Session storage** for user preferences (not browser storage APIs)

## Development Patterns

### File Naming Conventions
- **kebab-case** for directories and HTML files
- **camelCase** for JavaScript files
- **Entity names** match server-side entity naming exactly

### Module Structure
Each JavaScript module follows a consistent pattern:
```javascript
// Import dependencies
import { apiClient } from '../../shared/api-client.js';
import { StakeholderCategory } from '@odp/shared/models/StakeholderCategory.js';

// Define component class or functions
export class StakeholderCategoryList {
  // Component implementation
}

// Export for use by activity routers
export default StakeholderCategoryList;
```

### CSS Organization
- **Global styles**: Layout, typography, color schemes
- **Component styles**: Reusable component styling
- **Activity styles**: Activity-specific layout and theming

## Future Expansion Guidelines

### Adding New Entities
1. Create entity folder under appropriate activity (setup/read/elaboration)
2. Implement list.js, form.js, detail.js following established patterns
3. Add entity routes to activity router
4. Import shared models from @odp/shared workspace
5. Add entity-specific styles as needed

### Adding New Activities
1. Create activity folder under activities/
2. Implement activity router (activity-name.js)
3. Create activity-specific components
4. Add activity navigation to main app router
5. Update landing page with new activity tile

### Specialized Library Integration
- **Rich text libraries**: Integrate in elaboration/content-editor/
- **Table libraries**: Wrap in components/common/table.js
- **Timeline libraries**: Add to read activity for temporal views

## Quality Standards

### Code Organization
- **Clear separation** between activities, components, and utilities
- **Consistent patterns** across entity implementations
- **Reusable components** to minimize duplication

### Integration Standards
- **Direct API integration** following established fetch patterns
- **Shared model usage** for data consistency
- **Error handling** consistent with server response patterns

### Maintainability
- **Modular structure** for easy testing and modification
- **Clear dependencies** between modules
- **Documentation** of component interfaces and usage patterns

This organization provides a scalable foundation for implementing the three-activity ODP Web Client while maintaining consistency with the established workspace architecture and manual routes patterns.