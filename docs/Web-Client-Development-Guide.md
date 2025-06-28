# Web Client Development Guide

## Overview
This guide provides development instructions for the ODP Web Client using established patterns from the completed Setup Management Activity.

**Target Audience**: Developers extending the ODP Web Client  
**Prerequisites**: Familiarity with ES modules, vanilla JavaScript, and REST APIs  
**Architecture**: Three-layer activity-based organization with TreeEntity/ListEntity base classes

---

## Development Environment Setup

### Quick Start
```bash
git clone https://github.com/jacques-lauzeral/odp
cd odp
docker-compose up

# Access points
# Web Client: http://localhost:3000
# API Server: http://localhost
```

### Directory Structure
```
workspace/web-client/src/
├── index.html              # Main HTML template with header container
├── app.js                  # Router with API client integration
├── components/
│   ├── common/header.js    # ✅ Global navigation header
│   └── setup/              # ✅ Base entity components
│       ├── tree-entity.js  # ✅ Hierarchical entity base class
│       └── list-entity.js  # ✅ List/table entity base class
├── activities/
│   ├── landing/landing.js  # ✅ Landing page with user identification
│   └── setup/              # ✅ Complete Setup Management Activity
│       ├── setup.js        # ✅ Activity router with entity tabs
│       ├── stakeholder-categories.js  # ✅ TreeEntity extension example
│       └── waves.js        # ✅ ListEntity extension example
└── styles/                 # ✅ Complete responsive styling system
```

---

## Established Patterns (From Setup Activity)

### 1. Entity Extension Pattern
**TreeEntity Extension** (for hierarchical entities):
```javascript
import TreeEntity from '../../components/setup/tree-entity.js';

export default class StakeholderCategories extends TreeEntity {
    constructor(app, entityConfig) {
        super(app, entityConfig);
    }

    getDisplayName(item) {
        return item.name;  // Override for entity-specific display
    }

    renderItemDetails(item) {
        return `
            <div class="item-details">
                <div class="detail-field">
                    <label>Name</label>
                    <p>${item.name}</p>
                </div>
                <!-- Add entity-specific fields -->
            </div>
        `;
    }

    showCreateForm(parentId = null) {
        // Entity-specific modal form implementation
        const modalHtml = `
            <div class="modal-overlay" id="create-modal">
                <!-- Entity-specific form fields -->
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.attachModalEventListeners('#create-modal');
    }
}
```

**ListEntity Extension** (for simple list entities):
```javascript
import ListEntity from '../../components/setup/list-entity.js';

export default class Waves extends ListEntity {
    getTableColumns() {
        return [
            { key: 'year', label: 'Year', type: 'number' },
            { key: 'quarter', label: 'Quarter', type: 'quarter' },
            { key: 'startDate', label: 'Start Date', type: 'date' }
        ];
    }

    formatCellValue(value, column, item) {
        if (column.type === 'quarter') return `Q${value}`;
        if (column.type === 'date') return value ? new Date(value).toLocaleDateString() : '-';
        return super.formatCellValue(value, column, item);
    }

    handleAdd() {
        this.showCreateForm(); // Implement entity-specific create form
    }
}
```

### 2. Activity Development Pattern
```javascript
// activities/new-activity/new-activity.js
export default class NewActivity {
    constructor(app) {
        this.app = app;
        this.entities = {
            'entity-type': { name: 'Entity Name', endpoint: '/entity-endpoint', type: 'tree' }
        };
    }

    async render(container, subPath = []) {
        this.container = container;
        
        // Parse entity from subPath
        if (subPath.length > 0 && this.entities[subPath[0]]) {
            this.currentEntity = subPath[0];
        }

        this.renderUI();
        await this.loadCurrentEntity();
    }

    async loadCurrentEntity() {
        // Dynamic import entity component
        const entityModule = await import(`./${this.currentEntity}.js`);
        const EntityComponent = entityModule.default;
        
        this.currentEntityComponent = new EntityComponent(this.app, this.entities[this.currentEntity]);
        await this.currentEntityComponent.render(this.workspace);
    }
}
```

### 3. Modal Form Pattern (From Setup Implementation)
```javascript
showCreateForm(parentId = null) {
    const modalHtml = `
        <div class="modal-overlay" id="create-modal">
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">Create Entity</h3>
                    <button class="modal-close" data-action="close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-form">
                        <div class="form-group">
                            <label for="name">Name *</label>
                            <input type="text" id="name" name="name" class="form-control" required>
                        </div>
                        <!-- Add entity-specific fields -->
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-action="close">Cancel</button>
                    <button type="button" class="btn btn-primary" data-action="save">Create</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    this.attachModalEventListeners('#create-modal');
}

attachModalEventListeners(modalSelector) {
    const modal = document.querySelector(modalSelector);
    modal.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        if (action === 'close') this.closeModal(modal);
        if (action === 'save') await this.handleCreateSave(modal);
    });
}
```

---

## Step-by-Step Development

### Adding New Entity to Setup Activity

#### 1. Create Entity Component
```javascript
// src/activities/setup/new-entity.js
import TreeEntity from '../../components/setup/tree-entity.js';  // or ListEntity

export default class NewEntity extends TreeEntity {
    // Override base methods for entity-specific behavior
    getDisplayName(item) { return item.name; }
    renderItemDetails(item) { /* custom details */ }
    handleAddRoot() { this.showCreateForm(); }
}
```

#### 2. Register Entity in Setup Activity
```javascript
// In src/activities/setup/setup.js
this.entities = {
    // existing entities...
    'new-entity': { name: 'New Entity', endpoint: '/new-entities', type: 'tree' }
};
```

#### 3. Update Main App Router
```javascript
// In src/app.js - if adding new activity
else if (segments[0] === 'new-activity') {
    await this.loadActivity('new-activity', segments.slice(1));
}
```

### Testing New Components

#### Manual Testing Checklist
- [ ] Component loads without errors
- [ ] Create/Edit/Delete operations work
- [ ] Form validation shows appropriate messages
- [ ] Responsive design on mobile/desktop
- [ ] API calls include user header correctly

#### Browser Testing
```javascript
// Debug in browser console
console.log('Component state:', window.debugComponent = this);
console.log('API calls:', apiClient);
```

---

## API Integration

### Standard CRUD Operations (With User Authentication)
```javascript
// All API calls automatically include x-user-id header when user identified
await apiClient.get('/stakeholder-categories');           // List entities
await apiClient.post('/stakeholder-categories', data);    // Create entity
await apiClient.put('/stakeholder-categories/123', data); // Update entity
await apiClient.delete('/stakeholder-categories/123');    // Delete entity
```

### Error Handling
```javascript
try {
    await apiClient.createEntity(endpoint, data);
    this.closeModal(modal);
    await this.refresh(); // Reload component data
} catch (error) {
    console.error('Failed to create entity:', error);
    // Error automatically handled by error-handler.js
}
```

---

## Styling Guidelines

### Use Design Tokens
```css
.my-component {
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
}
```

### Component Naming
```css
.entity-list { /* Block */ }
.entity-list__header { /* Element */ }
.entity-list--loading { /* Modifier */ }
```

### Responsive Design
```css
.component {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
}

@media (min-width: 768px) {
    .component {
        grid-template-columns: repeat(2, 1fr);
    }
}
```

---

## Performance and Quality

### Component Cleanup
```javascript
cleanup() {
    if (this.currentEntityComponent?.cleanup) {
        this.currentEntityComponent.cleanup();
    }
    // Clear references
    this.data = [];
    this.selectedItem = null;
}
```

### Efficient DOM Updates
```javascript
// Good: Update container once
const html = items.map(item => `<div>${item.name}</div>`).join('');
container.innerHTML = html;

// Avoid: Multiple DOM manipulations
items.forEach(item => {
    container.appendChild(createElement(item)); // Multiple reflows
});
```

---

## Extension Examples

### Adding Read Activity
1. Create `src/activities/read/read.js` following activity pattern
2. Focus on data browsing vs. CRUD operations
3. Use existing API client with baseline/wave filtering

### Adding Elaboration Activity
1. Create `src/activities/elaboration/elaboration.js`
2. Implement rich text editing for versioned entities
3. Use TreeEntity pattern for requirement hierarchies

---

## Debugging and Testing

### Common Issues
- **Component loading errors**: Check file paths and naming (plural filenames, singular classes)
- **API authentication errors**: Ensure user identified before entity operations
- **CORS errors**: Verify x-user-id in server's allowed headers

### Debug Tools
```javascript
// Add to any component
window.debugComponent = this;

// Check API client state
console.log('User authenticated:', apiClient.app?.user?.name);
```

---

This streamlined guide focuses on the proven patterns from our Setup Management Activity implementation, providing clear examples for extending the ODP Web Client efficiently.