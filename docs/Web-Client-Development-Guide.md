# Web Client Development Guide

## Quick Start
This guide provides practical patterns for extending the ODP Web Client, based on proven implementations from Setup Management and Elaboration activities.

## Project Structure

### Core Architecture
```
web-client/src/
├── activities/
│   ├── landing/           # ✅ Simple activity launcher
│   ├── setup/             # ✅ Entity management with TreeEntity/ListEntity
│   ├── elaboration/       # ✅ Collection perspective implementation
│   ├── publication/       # ✅ ODP Edition management
│   └── review/            # 🔄 Edition review interface (in progress)
├── components/
│   ├── common/            # Global navigation, error handling
│   ├── setup/             # TreeEntity, ListEntity base classes
│   └── odp/               # CollectionEntity and forms
└── shared/                # API client, utilities, error handling
```

### Component Patterns

#### 1. TreeEntity (Hierarchical Data)
**Use for**: Categories, classifications with parent-child relationships
```javascript
// Example: StakeholderCategoriesEntity extends TreeEntity
class MyTreeEntity extends TreeEntity {
    constructor(container, apiClient, setupData) {
        super(container, apiClient, '/my-endpoint', setupData);
        this.entityName = 'My Entity';
        this.entityNamePlural = 'My Entities';
    }
    
    getFormFields(item = {}) {
        return [
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'parent', label: 'Parent', type: 'select', 
              options: this.getParentOptions() }
        ];
    }
}
```

#### 2. ListEntity (Simple Lists)
**Use for**: Simple list data without hierarchy
```javascript
// Example: WavesEntity extends ListEntity  
class MyListEntity extends ListEntity {
    constructor(container, apiClient, setupData) {
        super(container, apiClient, '/my-endpoint', setupData);
        this.entityName = 'My Item';
    }
    
    getColumns() {
        return [
            { key: 'name', label: 'Name', sortable: true },
            { key: 'createdAt', label: 'Created', type: 'date' }
        ];
    }
}
```

#### 3. CollectionEntity (Rich Content)
**Use for**: Operational content, editions, complex entities
```javascript
// Example: RequirementsEntity extends CollectionEntity
class MyCollectionEntity extends CollectionEntity {
    constructor(container, apiClient, setupData) {
        super(container, apiClient, '/my-endpoint', setupData);
        this.entityName = 'My Content';
        this.entityNamePlural = 'My Contents';
        
        // Configure Collection features
        this.configureFilters();
        this.configureColumns();
        this.configureGrouping();
    }
    
    configureFilters() {
        this.availableFilters = [
            { key: 'title', label: 'Title Pattern', type: 'text' },
            { key: 'status', label: 'Status', type: 'select', 
              options: ['Draft', 'Review', 'Published'] }
        ];
    }
}
```

---

## Implementation Examples

### Adding New Setup Entity

#### 1. Create Entity Component
```javascript
// src/activities/setup/entities/my-entities.js
import { TreeEntity } from '../../../components/setup/tree-entity.js';

export class MyEntitiesEntity extends TreeEntity {
    constructor(container, apiClient, setupData) {
        super(container, apiClient, '/my-entities', setupData);
        this.entityName = 'My Entity';
        this.entityNamePlural = 'My Entities';
    }
    
    getFormFields(item = {}) {
        return [
            { name: 'name', label: 'Name', type: 'text', required: true },
            { name: 'description', label: 'Description', type: 'textarea' },
            { name: 'parent', label: 'Parent Category', type: 'select', 
              options: this.getParentOptions() }
        ];
    }
    
    getParentOptions() {
        return [
            { value: '', label: 'No Parent' },
            ...this.data.map(item => ({ value: item.id, label: item.name }))
        ];
    }
}
```

#### 2. Register Entity in Setup Activity
```javascript
// In src/activities/setup/setup.js
this.entities = {
    // existing entities...
    'my-entities': { name: 'My Entities', endpoint: '/my-entities', type: 'tree' }
};
```

#### 3. Update Main App Router
```javascript
// In src/app.js - if adding new activity
else if (segments[0] === 'review') {
    await this.loadActivity('review', segments.slice(1));
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

### Adding Review Activity
1. Create `src/activities/review/review.js` following activity pattern
2. Focus on data browsing vs. CRUD operations
3. Use existing API client with baseline/wave filtering
4. Implement read-only mode for Collection perspective
5. Add commenting integration for review feedback

### Adding Elaboration Activity
1. Create `src/activities/elaboration/elaboration.js`
2. Implement rich text editing for versioned entities
3. Use TreeEntity pattern for requirement hierarchies
4. Extend CollectionEntity for operational content

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