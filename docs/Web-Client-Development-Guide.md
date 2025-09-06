# Web Client Development Guide

## Quick Start
This guide provides practical patterns for extending the ODP Web Client, based on proven implementations from Setup Management, Elaboration, Publication, and Review activities.

## Project Structure

### Core Architecture
```
web-client/src/
├── activities/
│   ├── landing/           # ✅ Simple activity launcher
│   ├── setup/             # ✅ Entity management with TreeEntity/ListEntity
│   ├── elaboration/       # ✅ Collection perspective implementation
│   ├── publication/       # ✅ ODP Edition management
│   └── review/            # ✅ Edition review interface
├── components/
│   ├── common/            # Global navigation, error handling
│   ├── setup/             # TreeEntity, ListEntity base classes
│   └── odp/               # CollectionEntity and forms
└── shared/                # API client, utilities, error handling
```

### CSS Architecture

#### Shared Styling Approach
The application uses a shared CSS architecture to eliminate duplication and ensure consistency:

```
styles/
├── main.css               # Base styles, design tokens, utilities
├── components.css         # Reusable UI components
├── landing.css           # Landing page specific styles
└── activities/
    ├── abstract-interaction-activity.css  # ✅ Shared interaction patterns
    ├── setup.css                          # ✅ Setup activity specific
    ├── elaboration.css                    # ✅ Elaboration overrides only
    └── review.css                         # ✅ Review specific features
```

#### CSS Import Structure
In `src/index.html`:
```html
<link rel="stylesheet" href="styles/main.css">
<link rel="stylesheet" href="styles/components.css">
<link rel="stylesheet" href="styles/landing.css">
<link rel="stylesheet" href="styles/activities/setup.css">
<link rel="stylesheet" href="styles/activities/abstract-interaction-activity.css">
<link rel="stylesheet" href="styles/activities/elaboration.css">
<link rel="stylesheet" href="styles/activities/review.css">
```

**Import Order Matters**:
1. Shared base styles first (`abstract-interaction-activity.css`)
2. Activity-specific overrides after (`elaboration.css`, `review.css`)

#### Shared CSS Components
**Interaction Activities** (`abstract-interaction-activity.css`) provides:
- `.interaction-tab` styling for consistent tab appearance
- Collection container grid layout (`.collection-container`)
- Filter and action area styling
- Table components and row selection states
- Details panel with sticky headers
- Loading, empty, and error states
- Responsive design breakpoints

**Activity-Specific Files** contain only:
- Unique styling that differs from shared patterns
- Mode-specific overrides (e.g., review read-only indicators)
- Activity-specific components not shared elsewhere

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

#### 3. CollectionEntity (Advanced Collections)
**Use for**: Complex data with filtering, grouping, and details
```javascript
// Example: RequirementsEntity uses CollectionEntity delegation
class MyCollectionEntity {
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
    }
}
```

## ODP Edition Parameter Resolution Pattern

### Problem Context
ODP Editions need to filter operational requirements and changes based on edition context, but the API expects `baseline` and `fromWave` parameters, not `odpEdition`.

### Client-Side Resolution Pattern
When working with ODP Edition contexts, always resolve edition to constituent parameters:

```javascript
async loadData() {
    try {
        let endpoint = this.entityConfig.endpoint;
        
        // Check for edition context
        const editionContext = this.app?.currentActivity?.config?.dataSource;
        if (editionContext && editionContext !== 'repository' && 
            typeof editionContext === 'string' && editionContext.match(/^\d+$/)) {
            
            // Step 1: Fetch edition details
            const edition = await apiClient.get(`/odp-editions/${editionContext}`);
            
            // Step 2: Extract baseline and wave references
            const queryParams = {};
            if (edition.baseline?.id) {
                queryParams.baseline = edition.baseline.id;
            }
            if (edition.startsFromWave?.id) {
                queryParams.fromWave = edition.startsFromWave.id;
            }
            
            // Step 3: Build API call with resolved parameters
            if (Object.keys(queryParams).length > 0) {
                const queryString = new URLSearchParams(queryParams).toString();
                endpoint = `${endpoint}?${queryString}`;
            }
        }
        
        const response = await apiClient.get(endpoint);
        // Process response...
    } catch (error) {
        // Handle errors...
    }
}
```

### API Parameter Standards
- **Never use `odpEdition`** parameter in client API calls
- **Always resolve to `baseline` and `fromWave`** parameters as defined in OpenAPI specs
- **Handle missing edition gracefully** with fallback to repository mode

### Navigation Between Activities
For navigation that preserves edition context:

```javascript
// ✅ Correct: Use SPA navigation
this.app.navigateTo(`/review/edition/${editionId}`);

// ❌ Wrong: Direct browser navigation (causes 404)
window.location.href = `/review/edition/${editionId}`;
```

## Activity Development Patterns

### 1. Interaction Activities (Elaboration, Review)
**Use AbstractInteractionActivity as base class**:

```javascript
import AbstractInteractionActivity from '../common/abstract-interaction-activity.js';

export default class MyActivity extends AbstractInteractionActivity {
    constructor(app) {
        super(app, {
            activityName: 'MyActivity',
            context: 'Repository',
            description: 'Activity description',
            mode: 'edit', // or 'review'
            dataSource: 'repository'
        });
    }
    
    // Override if needed for special rendering
    async render(container, subPath = []) {
        // Custom logic before standard rendering
        await super.render(container, subPath);
    }
}
```

**Benefits**:
- Automatic tab styling with `.interaction-tab` classes
- Built-in collection layout and filter controls
- Consistent entity count loading with edition support
- Standard responsive design patterns

### 2. Single-Entity Activities (Publication)
**For activities managing one entity type**:

```javascript
export default class MyActivity {
    constructor(app) {
        this.app = app;
        this.entityConfig = {
            name: 'My Entities',
            endpoint: '/my-entities',
            context: 'myactivity'
        };
        this.currentEntityComponent = null;
    }
    
    async render(container, subPath = []) {
        // Custom rendering logic
        // Use CollectionEntity delegation pattern
        this.currentEntityComponent = new MyEntitiesEntity(
            this.app,
            this.entityConfig,
            this.supportData
        );
    }
}
```

### 3. Entity Components with Forms
**Use the proven CollectionEntityForm inheritance pattern**:

```javascript
// Form class
class MyEntityForm extends CollectionEntityForm {
    getFieldDefinitions() {
        return [
            {
                title: 'Basic Information',
                fields: [
                    {
                        key: 'title',
                        label: 'Title',
                        type: 'text',
                        modes: ['create', 'read'],
                        required: true
                    }
                ]
            }
        ];
    }
    
    async onSave(data, mode, item) {
        if (mode === 'create') {
            return await apiClient.post(this.entityConfig.endpoint, data);
        }
        // Handle update logic
    }
}

// Entity class using delegation
class MyEntity {
    constructor(app, entityConfig, supportData) {
        // Collection delegation
        this.collection = new CollectionEntity(app, entityConfig, options);
        
        // Form inheritance
        this.form = new MyEntityForm(entityConfig, supportData);
    }
}
```

## Advanced Patterns

### Edition Context in Review Mode
**Target Selection Pattern** for Review activities:

```javascript
async render(container, subPath = []) {
    // Check for direct edition navigation
    if (subPath.length >= 2 && subPath[0] === 'edition') {
        const editionId = subPath[1];
        this.reviewTarget = editionId;
        
        try {
            this.selectedEdition = await apiClient.get(`/odp-editions/${editionId}`);
        } catch (error) {
            console.warn('Failed to load edition:', error);
            this.selectedEdition = { id: editionId, title: `Edition ${editionId}` };
        }
    }
    
    if (!this.reviewTarget) {
        await this.renderTargetSelection();
        return;
    }
    
    // Proceed with normal rendering
    await super.render(container, subPath);
}
```

### Dynamic Entity Counts with Edition Support
**Pattern for loading counts with edition context**:

```javascript
async loadEntityCounts() {
    const promises = Object.entries(this.entities).map(async ([key, entity]) => {
        let endpoint = entity.endpoint;
        
        // Resolve edition context if present
        const editionContext = this.config.dataSource;
        if (editionContext && editionContext !== 'repository') {
            const edition = await apiClient.get(`/odp-editions/${editionContext}`);
            const queryParams = {};
            if (edition.baseline?.id) queryParams.baseline = edition.baseline.id;
            if (edition.startsFromWave?.id) queryParams.fromWave = edition.startsFromWave.id;
            
            if (Object.keys(queryParams).length > 0) {
                endpoint = `${endpoint}?${new URLSearchParams(queryParams).toString()}`;
            }
        }
        
        const response = await apiClient.get(endpoint);
        this.entityCounts[key] = Array.isArray(response) ? response.length : 0;
    });
    
    await Promise.all(promises);
}
```

## Best Practices

### CSS Organization
1. **Use shared base styles** for common patterns
2. **Activity-specific files** for unique features only
3. **Import order matters** - base styles before overrides
4. **Test responsive design** across all breakpoints

### API Integration
1. **Always resolve ODP Edition** to baseline + fromWave parameters
2. **Use SPA navigation** for internal route changes
3. **Handle edition loading errors** gracefully
4. **Validate API responses** before processing

### Component Development
1. **Follow established patterns** (TreeEntity, ListEntity, CollectionEntity)
2. **Use delegation over inheritance** for complex components
3. **Implement proper cleanup** in component lifecycle
4. **Test with realistic data volumes**

### Activity Integration
1. **Use AbstractInteractionActivity** for consistent interaction patterns
2. **Implement proper context passing** between activities
3. **Support deep-linking** with URL parameter parsing
4. **Maintain state consistency** across navigation

## Common Issues and Solutions

### CSS Issues
**Problem**: Duplicate styles between activities
**Solution**: Move common styles to `abstract-interaction-activity.css`

**Problem**: Inconsistent tab appearance
**Solution**: Use `.interaction-tab` classes from shared styles

### Routing Issues
**Problem**: 404 errors on direct navigation to nested routes
**Solution**: Use `this.app.navigateTo()` instead of `window.location.href`

### Edition Filtering Issues
**Problem**: Wrong API parameters for edition context
**Solution**: Always resolve edition to `baseline` + `fromWave` parameters

### Component Loading
**Problem**: Component loading errors with missing files
**Solution**: Check file paths and ensure plural/singular naming consistency

## Testing Patterns

### Manual Testing Checklist
- [ ] Tab styling consistent across activities
- [ ] Entity counts update correctly with edition context
- [ ] Navigation preserves context between activities
- [ ] Responsive design works on mobile
- [ ] Error states display properly
- [ ] Loading states provide feedback

### Debug Tools
```javascript
// Add to any component for debugging
window.debugComponent = this;
console.log('Edition context:', this.app?.currentActivity?.config?.dataSource);
console.log('API endpoint:', endpoint);
```

---

This guide provides the essential patterns for extending the ODP Web Client efficiently, based on the proven implementations across all five activities. The shared CSS architecture and ODP Edition resolution patterns are key to maintaining consistency and functionality.