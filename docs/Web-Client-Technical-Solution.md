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
- **Data tables**: AG-Grid or Tabulator for entity management in Setup activity
- **Timeline visualization**: Vis.js for temporal views in Read activity

### Server Integration
- **API Server**: Direct communication with ODP Express server on port 80
- **CORS Configuration**: Server-side CORS middleware enables cross-origin requests
- **Shared Models**: Integration with @odp/shared workspace for consistent data structures

## Implemented Architecture

### Directory Structure
```
web-client/
├── src/
│   ├── index.html               # ✅ Main HTML template with CSS/JS loading
│   ├── index.js                 # ✅ Entry point with error handling
│   ├── app.js                   # ✅ App initialization & URL-based routing
│   ├── config/
│   │   └── api.js              # ✅ API endpoints configuration with CORS
│   ├── shared/
│   │   ├── api-client.js       # ✅ Fetch wrapper with error handling
│   │   ├── error-handler.js    # ✅ Centralized error management
│   │   └── utils.js            # ✅ DOM, validation, and formatting utilities
│   ├── components/
│   │   ├── common/
│   │   │   ├── header.js       # 🔄 Navigation header (planned)
│   │   │   ├── modal.js        # 🔄 Reusable modal component (planned)
│   │   │   └── table.js        # 🔄 Table component wrapper (planned)
│   │   └── forms/
│   │       ├── form-builder.js # 🔄 Dynamic form generation (planned)
│   │       └── validation.js   # 🔄 Form validation utilities (planned)
│   ├── activities/
│   │   ├── landing/
│   │   │   ├── landing.js      # ✅ Landing page component with user ID
│   │   │   └── landing.html    # ✅ Landing page template
│   │   ├── setup/              # 🔄 Setup activity (next phase)
│   │   ├── read/               # 🔄 Read activity (planned)
│   │   └── elaboration/        # 🔄 Elaboration activity (planned)
│   ├── styles/
│   │   ├── main.css            # ✅ Global styles with design tokens
│   │   ├── components.css      # ✅ Reusable component styling
│   │   └── activities.css      # ✅ Activity-specific layouts
│   └── assets/                 # 🔄 Icons and images (planned)
└── package.json                # ✅ Dependencies and workspace integration
```

**Legend**: ✅ Implemented | 🔄 Next Phase | 📋 Planned

## Proven Implementation Patterns

### 1. Activity-Based Routing
**URL Structure** (Implemented and tested):
```javascript
/                                    # Landing page ✅
/setup/stakeholder-categories        # Setup activity - entity list 🔄
/setup/stakeholder-categories/123    # Setup activity - specific entity 🔄
/read/edition/456/requirements       # Read activity - filtered content 📋
/elaboration/folders/789/req/234     # Elaboration - editing specific item 📋
```

**Router Implementation Pattern**:
```javascript
// Proven pattern from app.js
async handleRoute() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(segment => segment.length > 0);
    
    if (segments.length === 0) {
        await this.loadActivity('landing');
    } else if (segments[0] === 'setup') {
        await this.loadActivity('setup', segments.slice(1));
    }
    // Additional activities...
}
```

### 2. API Integration with CORS
**Server Configuration** (Implemented and working):
```javascript
// Added to server/src/index.js
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});
```

**Client Configuration** (Tested and functional):
```javascript
// config/api.js
export const apiConfig = {
    baseUrl: 'http://localhost',  // Points to API server
    timeout: 30000,
    defaultHeaders: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
};
```

### 3. Component Development Pattern
**Module Structure** (Established pattern):
```javascript
// Proven pattern from landing.js
import { dom, validate } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class Landing {
    constructor(app) {
        this.app = app;
        this.container = null;
    }

    async render(container, subPath = []) {
        // Render implementation
    }

    async handleSubPath(subPath) {
        // Sub-path handling
    }

    cleanup() {
        // Cleanup when leaving activity
    }
}
```

### 4. Error Handling System
**Centralized Error Management** (Implemented and tested):
```javascript
// error-handler.js provides:
- Network error detection and user notification
- API error classification (400, 404, 409, 500)
- User-friendly error messages with retry options
- Console logging for debugging
- Automatic error dismissal for non-critical errors
```

### 5. User Experience Patterns
**Landing Page Implementation** (Working and tested):
- **User identification**: Simple name entry without authentication
- **Activity tiles**: Visual navigation to three main activities
- **Connection status**: Real-time API server health checking
- **Responsive design**: Mobile-friendly layout with CSS Grid
- **Deep linking**: URL-based navigation with browser history support

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
- **kebab-case**: Directories and HTML files (`landing-page/`, `landing.html`)
- **camelCase**: JavaScript files and classes (`landing.js`, `LandingPage`)
- **Entity names**: Match server-side entity naming exactly

## Integration Standards

### API Communication Pattern
**Proven Implementation**:
```javascript
// apiClient provides consistent methods:
await apiClient.get('/stakeholder-categories');           // List entities
await apiClient.getEntity('/stakeholder-categories', id); // Get by ID
await apiClient.createEntity('/stakeholder-categories', data); // Create
await apiClient.updateEntity('/stakeholder-categories', id, data); // Update
await apiClient.deleteEntity('/stakeholder-categories', id); // Delete
```

### State Management
- **URL-based context**: All application state reflected in URL for shareability
- **Local component state**: Form data and UI interactions managed locally
- **No browser storage**: Avoid localStorage/sessionStorage for Claude.ai compatibility
- **User context**: Simple user object maintained in App instance

### CSS Architecture
**Design Token System** (Implemented):
```css
:root {
    /* Semantic color system */
    --primary-500: #0ea5e9;
    --bg-primary: #ffffff;
    --text-primary: var(--gray-900);
    
    /* Spacing system */
    --space-4: 1rem;
    --space-8: 2rem;
    
    /* Component patterns */
    --radius-md: 0.375rem;
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}
```

## Next Phase: Setup Activity

### Entity Component Pattern (Ready for Implementation)
**Standard Entity Components**:
```
entity-name/
├── list.js     # List view with hierarchy display and CRUD actions
├── form.js     # Create/edit forms with validation
└── detail.js   # Detail view with relationships and version history
```

**Setup Activity Entities**:
- `stakeholder-category/` - Hierarchy management with REFINES relationships
- `regulatory-aspect/` - Simple CRUD with description fields
- `data-category/` - Category management with classification
- `service/` - Service definition with metadata
- `wave/` - Timeline management with quarter/year validation

### Reusable Components (Next Phase)
**Common Components** (Ready for development):
- **Table wrapper**: Sortable, filterable data display with pagination
- **Form builder**: Dynamic form generation from shared models
- **Modal dialogs**: Confirmation, editing, and detail views
- **Navigation header**: Activity switching with breadcrumb support

## Quality Standards

### Code Organization
- **Clear separation**: Activities, components, and utilities in distinct modules
- **Consistent patterns**: Standardized component lifecycle and API integration
- **Reusable abstractions**: DOM utilities, validation, and error handling

### Testing Approach
- **Manual testing**: Browser-based validation of all features
- **Health monitoring**: Real-time connection status and error tracking
- **Cross-browser compatibility**: Modern browser support (ES2020+)

### Performance Considerations
- **Minimal dependencies**: Vanilla JavaScript for fast loading
- **Lazy loading**: Dynamic import of activity modules
- **Efficient DOM updates**: Utility functions for minimal manipulation

This technical solution provides a proven foundation for rapid development of the remaining Setup, Read, and Elaboration activities while maintaining consistency with the established server architecture and development patterns.