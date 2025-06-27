# Web Client Development Guide

## Overview
This guide provides comprehensive instructions for developing the ODP Web Client. It covers established patterns, coding conventions, and step-by-step procedures for adding new features to the activity-based vanilla JavaScript application.

**Target Audience**: Developers contributing to the ODP Web Client  
**Prerequisites**: Familiarity with ES modules, vanilla JavaScript, and REST APIs  
**Architecture**: Activity-based organization with reusable component patterns

---

## Development Environment Setup

### Quick Start
```bash
# Clone and start development environment
git clone https://github.com/jacques-lauzeral/odp
cd odp
docker-compose up

# Access points
# Web Client: http://localhost:3000
# API Server: http://localhost (backend)
# Neo4j Browser: http://localhost:7474
```

### Directory Structure
```
workspace/web-client/src/
├── index.html              # Main HTML template
├── index.js                # Application entry point
├── app.js                  # Router and activity management
├── config/
│   └── api.js             # API configuration
├── shared/
│   ├── api-client.js      # HTTP client wrapper
│   ├── error-handler.js   # Error management
│   └── utils.js           # Common utilities
├── components/
│   ├── common/            # Reusable UI components
│   └── forms/             # Form utilities
├── activities/
│   ├── landing/           # Landing page ✅
│   ├── setup/             # Setup Management Activity 🔄
│   ├── read/              # ODP Read Activity 📋
│   └── elaboration/       # ODP Elaboration Activity 📋
└── styles/
    ├── main.css           # Global styles and design tokens
    ├── components.css     # Component styling
    └── activities.css     # Activity-specific layouts
```

### Development Commands
```bash
# Start web client development server
cd workspace/web-client
npm install
npm run dev

# Alternative: Start all services
docker-compose up web-client
```

---

## Established Patterns

### 1. Activity Development Pattern

#### Activity Structure
Every activity follows this standard structure:
```
activities/activity-name/
├── activity-name.js       # Activity router and main component
├── activity-name.html     # Activity template (optional)
└── entity-name/           # Entity-specific components
    ├── list.js           # List view with CRUD actions
    ├── form.js           # Create/edit form component
    └── detail.js         # Detail view component
```

#### Activity Router Pattern
```javascript
// activities/setup/setup.js
import { dom } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export default class Setup {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.currentEntity = null;
    }

    async render(container, subPath = []) {
        this.container = container;
        
        // Handle entity routing
        if (subPath.length === 0) {
            await this.showEntityNavigation();
        } else {
            const entityType = subPath[0];
            const entityId = subPath[1];
            await this.loadEntity(entityType, entityId);
        }
    }

    async handleSubPath(subPath) {
        // Handle URL changes within activity
        await this.render(this.container, subPath);
    }

    cleanup() {
        // Cleanup when leaving activity
        if (this.currentEntity?.cleanup) {
            this.currentEntity.cleanup();
        }
    }
}
```

### 2. Component Development Pattern

#### Component Structure
```javascript
// Standard component pattern
import { dom, validate } from '../../shared/utils.js';
import { apiClient } from '../../shared/api-client.js';

export class EntityList {
    constructor(activity, entityType) {
        this.activity = activity;
        this.entityType = entityType;
        this.container = null;
        this.entities = [];
    }

    async render(container) {
        this.container = container;
        
        try {
            // Load data
            this.entities = await apiClient.listEntities(`/${this.entityType}`);
            
            // Render UI
            this.renderTable();
            this.bindEvents();
            
        } catch (error) {
            this.renderError(error);
        }
    }

    renderTable() {
        // Create table with data
        const table = dom.create('table', { className: 'table' });
        // ... table implementation
        
        dom.clear(this.container);
        this.container.appendChild(table);
    }

    bindEvents() {
        // Attach event listeners
        const createBtn = dom.find('.create-btn', this.container);
        createBtn?.addEventListener('click', () => this.handleCreate());
    }

    cleanup() {
        // Component cleanup
        this.entities = [];
    }
}
```

### 3. API Integration Pattern

#### Standard CRUD Operations
```javascript
// Create entity
const newEntity = await apiClient.createEntity('/stakeholder-categories', {
    name: 'New Category',
    description: 'Description',
    parentId: parentId || null
});

// Read entities
const entities = await apiClient.listEntities('/stakeholder-categories');
const entity = await apiClient.getEntity('/stakeholder-categories', id);

// Update entity
const updated = await apiClient.updateEntity('/stakeholder-categories', id, {
    id: id,
    name: 'Updated Name',
    description: 'Updated Description'
});

// Delete entity
await apiClient.deleteEntity('/stakeholder-categories', id);
```

#### Error Handling
```javascript
try {
    const result = await apiClient.createEntity(endpoint, data);
    this.handleSuccess(result);
} catch (error) {
    this.handleError(error);
}

handleError(error) {
    // Error is automatically handled by errorHandler
    // Component should update UI to reflect error state
    this.showErrorMessage(error.message);
}
```

### 4. Form Development Pattern

#### Standard Form Component
```javascript
export class EntityForm {
    constructor(activity, entityType, entityId = null) {
        this.activity = activity;
        this.entityType = entityType;
        this.entityId = entityId; // null for create, ID for edit
        this.isEditing = !!entityId;
    }

    async render(container) {
        this.container = container;
        
        if (this.isEditing) {
            this.entity = await apiClient.getEntity(`/${this.entityType}`, this.entityId);
        }
        
        this.renderForm();
        this.bindEvents();
    }

    renderForm() {
        const form = dom.create('form', { className: 'entity-form' });
        
        // Add form fields
        form.innerHTML = `
            <div class="form-group">
                <label for="name">Name:</label>
                <input type="text" id="name" name="name" class="form-control" 
                       value="${this.entity?.name || ''}" required>
            </div>
            <div class="form-group">
                <label for="description">Description:</label>
                <textarea id="description" name="description" class="form-control"
                         rows="3">${this.entity?.description || ''}</textarea>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">
                    ${this.isEditing ? 'Update' : 'Create'}
                </button>
                <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
            </div>
        `;
        
        dom.clear(this.container);
        this.container.appendChild(form);
    }

    bindEvents() {
        const form = dom.find('form', this.container);
        const cancelBtn = dom.find('.cancel-btn', this.container);
        
        form.addEventListener('submit', (e) => this.handleSubmit(e));
        cancelBtn.addEventListener('click', () => this.handleCancel());
    }

    async handleSubmit(event) {
        event.preventDefault();
        
        try {
            const formData = new FormData(event.target);
            const data = Object.fromEntries(formData);
            
            // Validate data
            this.validateForm(data);
            
            // Submit to API
            if (this.isEditing) {
                data.id = this.entityId;
                await apiClient.updateEntity(`/${this.entityType}`, this.entityId, data);
            } else {
                await apiClient.createEntity(`/${this.entityType}`, data);
            }
            
            // Navigate back to list
            this.activity.app.navigateTo(`/setup/${this.entityType}`);
            
        } catch (error) {
            this.showValidationErrors(error);
        }
    }

    validateForm(data) {
        validate.required(data.name, 'Name');
        validate.length(data.name, 2, 100, 'Name');
        // Additional validation...
    }
}
```

---

## Step-by-Step Development Guides

### Adding a New Entity Component

#### 1. Create Entity Directory
```bash
mkdir -p src/activities/setup/new-entity
```

#### 2. Implement List Component
Create `src/activities/setup/new-entity/list.js`:
```javascript
import { dom } from '../../../shared/utils.js';
import { apiClient } from '../../../shared/api-client.js';

export class NewEntityList {
    constructor(activity) {
        this.activity = activity;
        this.container = null;
        this.entities = [];
    }

    async render(container) {
        this.container = container;
        await this.loadEntities();
        this.renderUI();
        this.bindEvents();
    }

    async loadEntities() {
        try {
            this.entities = await apiClient.listEntities('/new-entities');
        } catch (error) {
            this.entities = [];
        }
    }

    renderUI() {
        const html = `
            <div class="entity-header">
                <h2>New Entities</h2>
                <button class="btn btn-primary create-btn">Create New Entity</button>
            </div>
            <div class="entity-table-container">
                ${this.renderTable()}
            </div>
        `;
        
        this.container.innerHTML = html;
    }

    renderTable() {
        if (this.entities.length === 0) {
            return '<p class="no-data">No entities found. Create one to get started.</p>';
        }

        const rows = this.entities.map(entity => `
            <tr>
                <td>${entity.name}</td>
                <td>${entity.description || ''}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-outline view-btn" data-id="${entity.id}">View</button>
                    <button class="btn btn-sm btn-secondary edit-btn" data-id="${entity.id}">Edit</button>
                    <button class="btn btn-sm btn-outline delete-btn" data-id="${entity.id}">Delete</button>
                </td>
            </tr>
        `).join('');

        return `
            <table class="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;
    }

    bindEvents() {
        // Create button
        const createBtn = dom.find('.create-btn', this.container);
        createBtn?.addEventListener('click', () => this.handleCreate());

        // Action buttons
        const viewBtns = dom.findAll('.view-btn', this.container);
        const editBtns = dom.findAll('.edit-btn', this.container);
        const deleteBtns = dom.findAll('.delete-btn', this.container);

        viewBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleView(e.target.dataset.id));
        });

        editBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleEdit(e.target.dataset.id));
        });

        deleteBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleDelete(e.target.dataset.id));
        });
    }

    handleCreate() {
        this.activity.app.navigateTo('/setup/new-entities/create');
    }

    handleView(id) {
        this.activity.app.navigateTo(`/setup/new-entities/${id}`);
    }

    handleEdit(id) {
        this.activity.app.navigateTo(`/setup/new-entities/${id}/edit`);
    }

    async handleDelete(id) {
        if (confirm('Are you sure you want to delete this entity?')) {
            try {
                await apiClient.deleteEntity('/new-entities', id);
                await this.loadEntities(); // Refresh list
                this.renderUI();
                this.bindEvents();
            } catch (error) {
                // Error handled by errorHandler
            }
        }
    }

    cleanup() {
        this.entities = [];
    }
}
```

#### 3. Implement Form Component
Create `src/activities/setup/new-entity/form.js` following the form pattern above.

#### 4. Implement Detail Component
Create `src/activities/setup/new-entity/detail.js`:
```javascript
import { dom } from '../../../shared/utils.js';
import { apiClient } from '../../../shared/api-client.js';

export class NewEntityDetail {
    constructor(activity, entityId) {
        this.activity = activity;
        this.entityId = entityId;
        this.container = null;
        this.entity = null;
    }

    async render(container) {
        this.container = container;
        await this.loadEntity();
        this.renderDetail();
        this.bindEvents();
    }

    async loadEntity() {
        this.entity = await apiClient.getEntity('/new-entities', this.entityId);
    }

    renderDetail() {
        const html = `
            <div class="entity-detail">
                <div class="detail-header">
                    <h2>${this.entity.name}</h2>
                    <div class="actions">
                        <button class="btn btn-primary edit-btn">Edit</button>
                        <button class="btn btn-outline delete-btn">Delete</button>
                        <button class="btn btn-secondary back-btn">Back to List</button>
                    </div>
                </div>
                <div class="detail-content">
                    <div class="detail-field">
                        <label>Name:</label>
                        <span>${this.entity.name}</span>
                    </div>
                    <div class="detail-field">
                        <label>Description:</label>
                        <span>${this.entity.description || 'No description'}</span>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
    }

    bindEvents() {
        const editBtn = dom.find('.edit-btn', this.container);
        const deleteBtn = dom.find('.delete-btn', this.container);
        const backBtn = dom.find('.back-btn', this.container);

        editBtn?.addEventListener('click', () => this.handleEdit());
        deleteBtn?.addEventListener('click', () => this.handleDelete());
        backBtn?.addEventListener('click', () => this.handleBack());
    }

    handleEdit() {
        this.activity.app.navigateTo(`/setup/new-entities/${this.entityId}/edit`);
    }

    async handleDelete() {
        if (confirm('Are you sure you want to delete this entity?')) {
            try {
                await apiClient.deleteEntity('/new-entities', this.entityId);
                this.activity.app.navigateTo('/setup/new-entities');
            } catch (error) {
                // Error handled by errorHandler
            }
        }
    }

    handleBack() {
        this.activity.app.navigateTo('/setup/new-entities');
    }

    cleanup() {
        this.entity = null;
    }
}
```

#### 5. Update Activity Router
Add entity routing to `src/activities/setup/setup.js`:
```javascript
import { NewEntityList } from './new-entity/list.js';
import { NewEntityForm } from './new-entity/form.js';
import { NewEntityDetail } from './new-entity/detail.js';

// In the Setup class, add:
async loadEntity(entityType, entityId, action) {
    if (entityType === 'new-entities') {
        if (!entityId) {
            // List view
            this.currentEntity = new NewEntityList(this);
        } else if (entityId === 'create') {
            // Create form
            this.currentEntity = new NewEntityForm(this, 'new-entities');
        } else if (action === 'edit') {
            // Edit form
            this.currentEntity = new NewEntityForm(this, 'new-entities', entityId);
        } else {
            // Detail view
            this.currentEntity = new NewEntityDetail(this, entityId);
        }
        
        await this.currentEntity.render(this.container);
    }
}
```

### Adding a New Activity

#### 1. Create Activity Directory
```bash
mkdir -p src/activities/new-activity
```

#### 2. Create Activity Router
Create `src/activities/new-activity/new-activity.js` following the activity pattern above.

#### 3. Update Main App Router
In `src/app.js`, add the new activity:
```javascript
// In handleRoute method
else if (segments[0] === 'new-activity') {
    await this.loadActivity('new-activity', segments.slice(1));
}
```

#### 4. Update Landing Page
Add activity tile to `src/activities/landing/landing.html`.

---

## Styling Guidelines

### CSS Architecture
The styling system uses a three-layer approach:

1. **main.css**: Global styles, design tokens, utility classes
2. **components.css**: Reusable component styling
3. **activities.css**: Activity-specific layouts

### Design Tokens
Use CSS custom properties for consistency:
```css
/* Use existing design tokens */
.my-component {
    padding: var(--space-4);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    color: var(--text-primary);
}
```

### Component Styling
Follow BEM-like naming conventions:
```css
.entity-list {
    /* Block */
}

.entity-list__header {
    /* Element */
}

.entity-list--loading {
    /* Modifier */
}
```

### Responsive Design
Use mobile-first approach:
```css
.entity-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-4);
}

@media (min-width: 768px) {
    .entity-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (min-width: 1024px) {
    .entity-grid {
        grid-template-columns: repeat(3, 1fr);
    }
}
```

---

## Testing and Debugging

### Manual Testing Checklist
For each new component:

- [ ] Component renders without JavaScript errors
- [ ] API calls work correctly with proper error handling
- [ ] Form validation works and shows appropriate messages
- [ ] Navigation works correctly (back buttons, breadcrumbs)
- [ ] Responsive design works on mobile and desktop
- [ ] Loading states are shown during API calls
- [ ] Error states are handled gracefully

### Debugging Tools

#### Browser Console
```javascript
// Debug API calls
console.log('API response:', response);

// Debug component state
console.log('Component state:', this);

// Debug DOM elements
console.log('Found elements:', dom.findAll('.selector', container));
```

#### Network Tab
- Monitor API requests and responses
- Check for CORS errors
- Verify request/response formats

#### Vue DevTools Alternative
Since we're using vanilla JavaScript:
```javascript
// Add to any component for debugging
window.debugComponent = this;
// Then in console: debugComponent.entities
```

### Error Handling Verification
```javascript
// Test error scenarios
try {
    await apiClient.getEntity('/invalid-endpoint', 999);
} catch (error) {
    console.log('Error handled correctly:', error);
}
```

---

## Performance Guidelines

### Efficient DOM Updates
```javascript
// Good: Batch DOM updates
const fragment = document.createDocumentFragment();
items.forEach(item => {
    const element = this.createItemElement(item);
    fragment.appendChild(element);
});
container.appendChild(fragment);

// Avoid: Multiple DOM manipulations
items.forEach(item => {
    const element = this.createItemElement(item);
    container.appendChild(element); // Multiple reflows
});
```

### Memory Management
```javascript
// Always cleanup event listeners
cleanup() {
    if (this.intervalId) {
        clearInterval(this.intervalId);
    }
    
    // Remove references
    this.entities = [];
    this.container = null;
}
```

### API Call Optimization
```javascript
// Debounce search inputs
import { async } from '../shared/utils.js';

const debouncedSearch = async.debounce(async (query) => {
    const results = await apiClient.search('/entities', { q: query });
    this.updateResults(results);
}, 300);
```

---

## Common Patterns and Utilities

### Loading States
```javascript
showLoading() {
    this.container.innerHTML = '<div class="loading">Loading...</div>';
}

hideLoading() {
    const loading = dom.find('.loading', this.container);
    loading?.remove();
}
```

### Confirmation Dialogs
```javascript
async confirmDelete(entityName) {
    return new Promise((resolve) => {
        const modal = this.createConfirmModal(
            'Confirm Delete',
            `Are you sure you want to delete "${entityName}"?`,
            resolve
        );
        document.body.appendChild(modal);
    });
}
```

### Form Validation
```javascript
validateEntity(data) {
    const errors = {};
    
    if (!data.name?.trim()) {
        errors.name = 'Name is required';
    } else if (data.name.length > 100) {
        errors.name = 'Name must be less than 100 characters';
    }
    
    if (data.description && data.description.length > 500) {
        errors.description = 'Description must be less than 500 characters';
    }
    
    return errors;
}
```

---

## Contributing Guidelines

### Code Review Checklist
- [ ] Follows established patterns
- [ ] Includes proper error handling
- [ ] Has appropriate cleanup methods
- [ ] Uses design tokens for styling
- [ ] Includes responsive design
- [ ] Tests manually in browser
- [ ] No console errors
- [ ] Proper API integration

### Pull Request Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Refactoring
- [ ] Documentation

## Testing
- [ ] Manual testing completed
- [ ] No console errors
- [ ] Responsive design verified
- [ ] API integration working

## Screenshots
(If applicable)
```

### Commit Message Convention
```bash
feat(setup): add stakeholder category management
fix(api): handle network timeout errors
style(landing): improve mobile responsiveness
docs(readme): update setup instructions
```

---

This development guide provides the foundation for consistent, maintainable web client development. Follow these patterns and guidelines to ensure high-quality contributions to the ODP Web Client.