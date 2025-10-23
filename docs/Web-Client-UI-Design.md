# ODP Web Client UI Design

## Document Overview
**Purpose**: UI design specifications and architectural patterns for the ODP Web Client  
**Status**: Setup Management Activity complete, Elaboration Activity complete, Publication Activity complete, Review Activity complete  
**Last Updated**: December 2024

---

## Application Architecture

### Three-Layer Page Structure
The ODP Web Client follows a consistent three-layer navigation hierarchy across all activities:

**Layer 1: ODP Level (Global Application Chrome)**
- Persistent header across all activities: `Landing | Setup | Elaboration | Publication | Review`
- User context display and connection status
- Consistent application-wide navigation

**Layer 2: Activity Level (Activity-Specific Workspace)**
- Activity-specific navigation and layout patterns
- Context management within each activity
- Activity-focused toolbars and controls

**Layer 3: Entity Level (Entity-Specific Interactions)**
- CRUD operations and detailed entity management
- Context-sensitive actions based on current selection
- Entity-specific validation and relationships

---

## CSS Architecture

### Component-Based CSS Organization
The application uses a modular CSS architecture for maintainability and clear separation of concerns:

```
styles/
â”œâ”€â”€ main.css                          # Base styles, design tokens, CSS variables
â”œâ”€â”€ base-components.css               # Buttons, form controls, utilities, loading spinner
â”œâ”€â”€ layout-components.css             # Header navigation, modals, cards, mobile navigation
â”œâ”€â”€ table-components.css              # Collection tables, row selection, grouping, empty states
â”œâ”€â”€ temporal-components.css           # Timeline grid, pixmaps, wave visualization, milestone connectors
â”œâ”€â”€ form-components.css               # Advanced forms (tabs, tags, multi-select), validation, alerts
â”œâ”€â”€ feedback-components.css           # Status indicators, notifications, error states, progress bars
â”œâ”€â”€ landing.css                       # Landing page specific styles
â””â”€â”€ activities/
    â”œâ”€â”€ abstract-interaction-activity.css  # Shared interaction patterns for collection perspectives
    â”œâ”€â”€ setup.css                          # Setup activity TreeEntity/ListEntity specific styles
    â”œâ”€â”€ elaboration.css                    # Elaboration activity overrides and customizations
    â””â”€â”€ review.css                         # Review activity read-only indicators and styling
```

### CSS Import Structure
In `src/index.html`:
```html
<link rel="stylesheet" href="styles/main.css">
<link rel="stylesheet" href="styles/base-components.css">
<link rel="stylesheet" href="styles/layout-components.css">
<link rel="stylesheet" href="styles/table-components.css">
<link rel="stylesheet" href="styles/temporal-components.css">
<link rel="stylesheet" href="styles/form-components.css">
<link rel="stylesheet" href="styles/feedback-components.css">
<link rel="stylesheet" href="styles/landing.css">
<link rel="stylesheet" href="styles/activities/setup.css">
<link rel="stylesheet" href="styles/activities/abstract-interaction-activity.css">
<link rel="stylesheet" href="styles/activities/elaboration.css">
<link rel="stylesheet" href="styles/activities/review.css">
```

**Import Order Critical Notes**:
1. **Base styles first** (`main.css`) - Design tokens and base elements
2. **Component CSS by dependency** - Base components before specialized ones
3. **Activity styles last** - Activity-specific overrides and additions

### Styling Architecture Benefits
- **Modular organization**: Each file handles one functional area
- **Conflict resolution**: Proper specificity management prevents CSS conflicts
- **Selection styling fix**: `table-components.css` resolves collection row selection issues
- **Maintainability**: Clear separation of concerns for future development

---

## Activity UI Specifications

### Landing Page âœ… IMPLEMENTED
**Purpose**: Simple activity launcher with user identification

**Implemented Layout**:
- Clean, minimal interface with activity tiles
- User identification prompt (name entry, no authentication)
- Connection status indicator
- Direct navigation to Setup, Elaboration, Publication, and Review activities

---

### Setup Management Activity âœ… IMPLEMENTED
**Purpose**: Entity management interface for reference data configuration

#### Activity Structure (Layer 2)
**Entity Navigation Tabs**:
- `Stakeholder Categories | Regulatory Aspects | Data Categories | Services | Waves`
- Tab-based switching between entity types
- Entity count badges on each tab
- Responsive horizontal scroll on mobile

**Layout Pattern**: Three-pane workspace for hierarchical entities, simple list for waves

#### Entity Type Implementation (Layer 3)
**TreeEntity Pattern**: Used for hierarchical entities (Stakeholder Categories, Data Categories, Regulatory Aspects, Services)
- Three-pane layout: tree navigation, item details, action buttons
- Hierarchical display with expand/collapse functionality
- Parent-child relationship management
- Context-sensitive actions based on selection

**ListEntity Pattern**: Used for simple list entities (Waves)
- Single-pane table layout with inline editing
- Direct CRUD operations
- Sortable columns with filtering
- Bulk selection and operations

---

### Elaboration Activity âœ… IMPLEMENTED
**Purpose**: Content creation interface for operational requirements and changes

#### Activity Structure (Layer 2)
**Entity Navigation Tabs**:
- `Operational Requirements | Operational Changes`
- Tab switching with dynamic count badges
- Repository context indicator
- Shared interaction tab styling

**Layout Pattern**: Collection perspective with four-area layout

#### Collection Perspective Layout (Layer 3)
**Four-Area Layout for Content Creation**:

**1. Filtering Area**:
- **Text Search**: Pattern matching across titles and content
- **Category Filters**: Dynamic options from setup data integration
- **Impact Filters**: Stakeholder, data, regulatory, and service categories
- **Clear All Filters**: Reset all filter controls

**2. Actions Area**:
- **Create Actions**: New Requirement/Change with context-sensitive labeling
- **View Controls**: Grouping dropdown and display options
- **Edit Mode Toggle**: Inline editing capabilities (planned)
- **Export Options**: Data export functionality

**3. Collection List Area**:
- **Table Display**: Dynamic columns based on entity type
- **Grouping Support**: Collapsible groups with item counts
- **Row Selection**: Single selection with visual feedback
- **Interactive Sorting**: Multi-column sorting with indicators

**4. Details Panel**:
- **Sticky Header**: Item title and primary actions always visible
- **Content Display**: Full content rendering with formatting
- **Form Integration**: Inline editing with validation
- **Related Items**: Cross-references and dependencies

#### Tree Perspective (Requirements Only)
**Purpose**: Hierarchical visualization of Operational Requirements organized by DrG, organizational path, and refinement relationships

**Entity Support**: Available for Operational Requirements only (Changes use Temporal perspective instead)

**Layout Pattern**: Tree-table view with hierarchical navigation and relationship columns

**Component Implementation**: TreeTableEntity (see Web-Client-Technical-Solution.md for delegation pattern)

**Hierarchy Structure**:
- **Level 1**: Drafting Groups (DrG) - Root folders
- **Level 2**: Organizational Path - Folder hierarchy from `path` field array
- **Level 3**: Requirements with REFINES relationships - ON refines ON, OR refines OR

**Visual Indicators**:
- ðŸ“ **RED folder**: Drafting Group (DrG) root nodes
- ðŸ“ **YELLOW folder**: Organizational path folders
- ðŸ”· **BLUE diamond**: Operational Need (ON) nodes
- ðŸŸ© **GREEN square**: Operational Requirement (OR) nodes
- â–º / â–¼ **Expand/Collapse arrows**: Indicate expandable nodes with children

**Tree-Table Columns**:
1. **Title** (hierarchy column with tree structure and indentation)
2. **Implements** (implementedONs - which ONs this OR implements)
3. **Depends On** (dependsOnRequirements)
4. **Documents** (documentReferences count/preview)
5. **Data** (impactsData - data categories)
6. **Stakeholder** (impactsStakeholderCategories)
7. **Services** (impactsServices)
8. **Updated By** (user who last modified)
9. **Updated** (last modification timestamp)

**Column Behavior**:
- Folder rows (DrG, organizational): Empty cells for relationship columns
- Requirement rows: Display relationship data with counts or previews
- Columns only render for applicable node types (e.g., "Implements" only for OR nodes)

**Filtering**:
- Shared filter controls with Collection perspective
- Filters apply to requirement nodes (hide/show based on criteria)
- Parent folders automatically hidden if all descendants filtered out
- Parent folders shown if any descendant matches filters (to maintain path visibility)

**Perspective Switching**:
- Switch between Collection and Tree perspectives via perspective selector
- Filters preserved when switching perspectives
- Selection state coordinated between perspectives
- No grouping controls in Tree perspective (tree structure provides organization)

**Key Features**:
- Virtual folder nodes (DrG and organizational) - exist only when descendants are present
- REFINES relationships create nested hierarchies within ON and OR types
- IMPLEMENTS relationships NOT shown in tree (different from REFINES)
- Expand/collapse state persisted during filter changes
- Click node to show details in right panel (reuses Collection perspective's details panel)


#### Temporal Perspective âœ… IMPLEMENTED

**Purpose**: Timeline visualization for operational changes with milestone planning

**Layout Pattern**: Two-panel temporal view with timeline grid

**Timeline Components**:
- **Time Window Controls**: Wave-based date range selection
- **Event Type Filters**: Milestone event type filtering with visual labels
- **Timeline Grid**: Horizontal changes with milestone intersections
- **Pixmap Visualization**: 3x3 grid showing API/UI/Service event types
- **Selection Coordination**: Synchronized selection between collection and temporal views

---

### Publication Activity âœ… IMPLEMENTED
**Purpose**: ODP Edition management interface for creating and browsing published editions

#### Activity Structure (Layer 2)
**Publication Context Display**:
- Clear "Publication" context indicator in header
- Edition management focus messaging
- Edition count display in activity statistics

**Single Entity Focus**:
- No entity tabs required (single entity: ODP Editions)
- Direct Collection perspective implementation
- Integrated baseline and wave management

#### Collection Perspective Layout (Layer 3)
**Four-Area Layout for ODP Editions**:

**1. Filtering Area**:
- **Type Filter**: DRAFT | OFFICIAL | All Types
- **Wave Filter**: Dynamic options from setup data waves
- **Clear All Filters**: Reset all filter controls

**2. Actions Area**:
- **Create Action**: "New Edition" button
- **Grouping Control**: Group by Type | Wave | None
- **Edition Count**: Display total editions with filter indicator

**3. Collection List Area**:
- **Table Columns**: Title | Type | Starts From Wave | Created At | Created By
- **Type Badges**: Color-coded DRAFT/OFFICIAL indicators
- **Wave Display**: Year/Quarter format (e.g., "2025 Q2")
- **Row Selection**: Edition selection for details view

**4. Details Panel**:
- **Edition Metadata**: Creation details and context information
- **Baseline Reference**: Link to baseline used for the edition
- **Wave Reference**: Starting wave information with timeline context
- **Action Buttons**: Review Edition (navigate to Review activity with context)
- **Content Preview**: Summary of included requirements and changes

#### Edition Form Modal
**Create New Edition Form**:
- **Title Field**: Required text input for edition name
- **Type Selection**: Radio buttons for DRAFT | OFFICIAL
- **Baseline Selection**: Dropdown of available baselines with creation dates
- **Starting Wave**: Dropdown of waves with year/quarter display
- **Form Validation**: Required field validation and business rules

---

### Review Activity âœ… IMPLEMENTED
**Purpose**: Edition review interface for examining published content with read-only access

#### Activity Structure (Layer 2)
**Review Target Selection**:
- **Target Selection Screen**: Choose between Repository or ODP Edition review
- **Repository Option**: Review latest development content
- **Edition Selection**: Choose from available published editions
- **Edition Metadata Display**: Clear context indicators for selected edition

**Edition Context Display**:
- Clear "Review" context indicator in header
- Selected edition metadata display (title, type, baseline, wave)
- Read-only mode messaging and visual indicators

**Entity Navigation Tabs**:
- `Operational Requirements | Operational Changes`
- Tab switching with edition context preservation
- Entity count badges showing edition-filtered content
- Shared interaction tab styling with review-specific indicators

#### Collection Perspective Layout (Layer 3)
**Four-Area Layout for Edition Review**:

**1. Filtering Area**:
- **Text Search**: Pattern matching across requirements and changes
- **Category Filters**: Dynamic options from setup data (read-only mode)
- **Impact Filters**: Stakeholder, data, regulatory, and service impacts
- **Clear All Filters**: Reset all filter controls

**2. Actions Area**:
- **Export Actions**: PDF, structured data export from edition content
- **Comment Mode**: Toggle commenting capability for review feedback
- **Edition Info**: Selected edition title and metadata display
- **View Controls**: Grouping dropdown and display options

**3. Collection List Area**:
- **Table Display**: Dynamic columns showing requirements and changes
- **Edition Filtering**: Content automatically filtered by selected edition
- **Row Selection**: Single selection with visual feedback
- **Grouping Support**: Collapsible groups with item counts

**4. Details Panel**:
- **Read-Only Display**: Item details in review format
- **Review Actions**: Context-sensitive review and comment options
- **Edition Context**: Clear indication of edition being reviewed
- **Navigation**: Easy switching between items in edition

---

## Design System Integration

### Interaction Patterns
- **Consistent Navigation**: Three-layer hierarchy maintained across all activities
- **Progressive Disclosure**: Details panels provide contextual information
- **Responsive Design**: Mobile-first approach with progressive enhancement
- **Loading States**: Consistent feedback during data operations

### Visual Consistency
- **Color System**: Semantic color usage for status, actions, and content types
- **Typography Scale**: Consistent text sizing and hierarchy
- **Spacing System**: Uniform spacing using CSS custom properties
- **Component Library**: Reusable UI components across all activities

### Accessibility Features
- **Keyboard Navigation**: Full keyboard access to all interactive elements
- **Screen Reader Support**: Semantic HTML and ARIA labels
- **Color Contrast**: WCAG AA compliance for text and interactive elements
- **Focus Management**: Clear focus indicators and logical tab order

---

## Technical Implementation

### Component Architecture
- **Base Components**: TreeEntity (Setup), ListEntity (Setup), CollectionEntity (ODP Browser), TreeTableEntity (ODP Browser)
- **Form System**: Inheritance-based form components with validation
- **State Management**: Activity-level state coordination
- **API Integration**: Consistent patterns for data loading and manipulation

### Performance Considerations
- **Lazy Loading**: Components loaded on demand
- **Data Caching**: Efficient data management and refresh patterns
- **Responsive Images**: Optimized assets for different screen sizes
- **Bundle Optimization**: CSS and JS optimization for production deployment

---

This design system provides a comprehensive foundation for the ODP Web Client with proven patterns that scale across all management activities while maintaining consistency and usability.