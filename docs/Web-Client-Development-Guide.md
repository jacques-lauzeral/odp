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
│   └── odp/               # CollectionEntity, TreeTableEntity, and forms
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

#### 4. TreeTableEntity (Hierarchical Tree-Table)
**Use for**: Tree-table visualization with virtual hierarchy derived from entity paths
```javascript
// Example: RequirementsEntity with tree perspective
class MyEntityWithTreePerspective {
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
    }
    
    buildTreePath(entity) {
        // Build typed path array: DrG → org folders → entity node
        return [
            { type: 'drg', value: entity.drg, id: entity.drg },
            ...entity.path.map((segment, idx) => ({
                type: 'org-folder',
                value: segment,
                id: `${entity.drg}/${segment}`
            })),
            {
                type: entity.type.toLowerCase() + '-node',
                value: entity.title,
                id: entity.itemId,
                entity: entity
            }
        ];
    }
    
    getTreeTypeRenderers() {
        return {
            'drg': {
                icon: '📁',
                iconColor: '#dc3545',
                expandable: true,
                label: (pathItem) => pathItem.value
            },
            'org-folder': {
                icon: '📁',
                iconColor: '#ffc107',
                expandable: true,
                label: (pathItem) => pathItem.value
            },
            'on-node': {
                icon: '🔷',
                iconColor: '#007bff',
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
                appliesTo: ['drg', 'org-folder', 'on-node']
            },
            {
                key: 'status',
                label: 'Status',
                width: '120px',
                appliesTo: ['on-node'],
                render: (node) => node.pathItem.entity.status
            }
        ];
    }
    
    async render(container) {
        await this.loadData();
        
        // Render based on current perspective
        if (this.currentPerspective === 'tree') {
            this.tree.setData(this.data);
            this.tree.render(container);
        } else {
            this.collection.setData(this.data);
            this.collection.render(container);
        }
    }
}
```

**Key Differences**:
- **TreeEntity** (Setup): Extension pattern for real hierarchical entities with CRUD operations
- **TreeTableEntity** (ODP Browser): Delegation pattern for virtual hierarchy derived from flat entity lists
- Virtual folders (DrG, organizational) exist only when descendants are present
- Columns can specify which node types they apply to via `appliesTo` array

## ODP Edition Parameter Resolution Pattern

### Problem Context
ODP Editions need to filter operational requirements and changes based on edition context, but the API expects `baseline` and `fromWave` parameters, not `odpEdition`.

### Client-Side Resolution Pattern
When working with ODP Edition contexts, always resolve edition to constituent parameters:

```javascript
// In activity or entity component
async loadEntityData() {
    let queryParams = {};
    
    if (this.config.dataSource === 'repository') {
        // Repository context: no filtering
        queryParams = {};
    } else {
        // Edition context: resolve to baseline + fromWave
        const edition = await this.loadEdition(this.config.dataSource);
        queryParams = {
            baseline: edition.baselineId,
            fromWave: edition.fromWaveId
        };
    }
    
    const data = await apiClient.get('/operational-requirements', queryParams);
    return data;
}
```

### Edition Context Sources
- **Publication Activity**: Direct edition selection (editionId from UI)
- **Review Activity**: Edition specified in URL parameters
- **Elaboration Activity**: Always uses 'repository' (no edition filtering)

## Activity Patterns

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
        this.collection = new CollectionEntity(app, entityConfig, {
            columnTypes: odpColumnTypes,
            context: { supportData },
            getFilterConfig: () => this.getFilterConfig(),
            getColumnConfig: () => this.getColumnConfig(),
            getGroupingConfig: () => this.getGroupingConfig(),
            onItemSelect: (item) => this.handleItemSelect(item),
            onCreate: () => this.handleCreate()
        });
        
        // Form inheritance
        this.form = new MyEntityForm(entityConfig, supportData);
    }
}
```

## Best Practices

### Styling
1. **Use shared CSS** for all common interaction patterns
2. **Minimize activity-specific CSS** - only override what's unique
3. **Follow CSS import order** - base before specific
4. **Test responsive design** across all breakpoints

### API Integration
1. **Always resolve ODP Edition** to baseline + fromWave parameters
2. **Use SPA navigation** for internal route changes
3. **Handle edition loading errors** gracefully
4. **Validate API responses** before processing

### Component Development
1. **Follow established patterns** (TreeEntity, ListEntity, CollectionEntity, TreeTableEntity)
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