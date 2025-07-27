# ODP Web Client UI Design

## Document Overview
**Purpose**: UI design specifications and architectural patterns for the ODP Web Client  
**Status**: Setup Management Activity complete, ODP Browser/Navigator architecture defined with Collection perspective as default  
**Last Updated**: July 27, 2025

---

## Application Architecture

### Three-Layer Page Structure
The ODP Web Client follows a consistent three-layer navigation hierarchy across all activities:

**Layer 1: ODP Level (Global Application Chrome)**
- Persistent header across all activities: `Landing | Setup | Read | Elaboration`
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

## Activity UI Specifications

### Landing Page
**Purpose**: Simple activity launcher with user identification

**Layout**:
- Clean, minimal interface with three activity tiles
- User identification prompt (name entry, no authentication)
- Connection status indicator
- Direct navigation to Setup, Read, or Elaboration activities

---

### Setup Management Activity
**Purpose**: Entity management interface for reference data configuration

#### Activity Structure (Layer 2)
**Entity Navigation Tabs**:
- `Stakeholder Categories | Regulatory Aspects | Data Categories | Services | Waves`
- Tab-based switching between entity types
- Entity count badges on each tab
- Responsive horizontal scroll on mobile

**Layout Pattern**: Three-pane workspace for all setup entities

#### Entity Management Pattern (Layer 3)
**Left Pane: Entity Tree**
- Collapsible hierarchy tree for REFINES relationships
- Visual indicators: `▶` (expandable), `└─` (child), indentation levels
- Click to select any node in hierarchy
- Real-time tree updates when entities are added/modified

**Center Pane: Detail/Editor**
- **View Mode**: Read-only display of selected entity
- **Edit Mode**: Form-based editing with validation
- Toggle between view/edit modes
- Auto-focus when creating new entities

**Top Toolbar: Actions**
- **Entity Actions**: Add Child | Edit | Delete (context-sensitive)
- **Bulk Actions**: Import | Export | Validate Hierarchy
- **Navigation**: Breadcrumb showing current entity path

#### REFINES Hierarchy Management
**Visual Representation**:
- Tree structure with expand/collapse controls
- Clear parent-child relationships through indentation
- Status badges: "Hierarchy Root" | "Child Entity" | "Standalone"

**Interaction Patterns**:
- **Create Child**: Auto-select parent, open editor for new child
- **Parent Selection**: Dropdown with hierarchy validation (prevent circular references)
- **Tree Navigation**: Click any node to view/edit that entity
- **Breadcrumb**: Show hierarchy path for current selection

#### Entity-Specific Patterns

**Stakeholder Categories** (Reference Implementation):
- Full REFINES hierarchy support
- Name, description fields
- Parent selection with validation
- Child count display

**Regulatory Aspects**:
- REFINES hierarchy support
- Name/title, description, regulation reference fields
- Similar tree patterns as StakeholderCategories

**Data Categories**:
- REFINES hierarchy support
- Name, description fields for data classification
- Tree navigation patterns

**Services**:
- REFINES hierarchy support
- Name, description, domain associations
- User/stakeholder category relationships

**Waves**:
- **Simple list pattern** (no REFINES hierarchy)
- Year, quarter, optional date fields
- Chronological sorting (most recent first)
- Validation: quarter 1-4, future dates only

---

## ODP Browser/Navigator Component
**Purpose**: Unified browsing component for operational content across Read, Elaboration, and Review activities

### Component Architecture
**Unified Design**: Single component serves multiple activities with configurable modes and perspectives

**Configuration Interface**:
```javascript
<ODPBrowser 
  context={{type: "edition|baseline|repository", id: "123"}}
  mode="elaboration|read|internal-review|external-comment"
  perspective="collection|hierarchical|temporal"
  user={{permissions: [...], role: "..."}}
/>
```

### Content Context Selection
**Three Entry Points**:
- **ODP Edition** (primary): Published editions for formal review and consultation
- **Baseline** (advanced): Historical snapshots for cross-time analysis
- **Repository** (contributors): Live development content with latest versions

**Context Selector**: Dropdown interface with edition metadata (status, publication date, version)

### Mode Configurations
**Elaboration Mode**: Full CRUD operations on repository content
- Create, edit, delete operational requirements and changes
- Hierarchy management with REFINES relationships
- Version control and milestone management

**Read Mode**: View-only navigation for published editions
- Browse content structure and relationships
- Export and print capabilities
- Historical version access

**Internal Review Mode**: Review capabilities for internal stakeholders
- Content browsing with comment threading
- Review status controls and approval workflow
- Internal stakeholder notification system

**External Comment Mode**: Limited commenting for external stakeholders
- Content browsing with comment submission
- Comment threading without status changes
- Public consultation workflow support

### Triple Perspective Design
**Perspective Toggle**: Clear switching between three distinct navigation approaches

**Collection Perspective (📋)** - DEFAULT:
- **SharePoint Lists-inspired interface** with grouping capabilities
- **Four functional areas**: Filtering (collapsible) | List | Details | Actions (persistent toolbar)
- **Dual editing modes**: "View Collection" (read-only) ↔ "Edit in Collection View" (editable grid)
- **Flexible grouping**: Dropdown selector with expand/collapse group headers
- **Combined filtering and grouping** for powerful data organization

**Hierarchical Perspective (📁)**:
- Two-root structure: `Operational Requirements | Operational Changes`
- Tree navigation with REFINES relationship display
- Three-pane layout: tabs | tree | details
- Reuses proven Setup Activity TreeEntity patterns

**Temporal Perspective (📅)**:
- Timeline visualization of deployment schedule
- Wave and milestone-based filtering
- Chronological view of content evolution
- Integration with deployment planning tools

### Layout Specifications

#### Collection Perspective Layout (DEFAULT)
**Activity Structure (Layer 2)**:
- Content context selector (Edition/Baseline/Repository)
- Perspective toggle: `📋 Collection | 📁 Hierarchical | 📅 Temporal`
- Entity navigation tabs: `Operational Requirements | Operational Changes`

**Four-Area Layout (Layer 3)**:

**1. Filtering Area (Collapsible)**:
- Search box with full-text search across statement, rationale, references
- Column-specific filters (Type, Status, Wave, Folder, Impact categories)
- Advanced filter combinations (AND/OR logic)
- Filter badges showing active filters with quick removal
- Expand/collapse toggle to maximize list space

**2. Actions Area (Persistent Toolbar)**:
- **Mode Toggle**: "View Collection" | "Edit in Collection View" (SharePoint-style)
- **Context-Sensitive Actions**: Create, Edit, Delete, Add Child (enabled/disabled based on selection)
- **Grouping Control**: "Group by: [None/Status/Type/Wave/Folder] ▼"
- **Bulk Operations**: Import, Export, Validate, when multiple items selected
- **View Options**: Group expand/collapse all, column selection

**3. List Area (Table Format)**:
- **View Mode**: Read-only table with brief info (ID, Title, Status, Type, Modified)
- **Edit Mode**: Excel-like editable cells with immediate save, undo/redo capabilities
- **Grouping Display**: Collapsible group headers with item counts
- **Selection**: Single-click select for details pane, multi-select for bulk operations
- **Performance**: 100 items per page with pagination

**4. Selected Item Details Area**:
- **View Mode**: Read-only display of selected item's full details
- **Context Display**: Shows selected item even when in edit mode for reference
- **Rich Content**: Statement, rationale, references, relationships, version history
- **Consistent Width**: Fixed pane width to maintain context during list scrolling

#### Collection Perspective Grouping
**Requirements Grouping Options**:
- **Type**: ON (Operational Need) | OR (Operational Requirement)
- **Status**: Draft | Review | Approved | Published
- **Impact Categories**: By Stakeholder Category, Regulatory Aspect, Data Category, Service
- **Folder**: By organizational folder location
- **Version Status**: Latest | Historical | All Versions
- **Modified By**: Group by contributor
- **Modified Date**: Group by time periods (This Week, Last Week, This Month, etc.)

**Changes Grouping Options**:
- **Visibility**: NM | NETWORK
- **Target Wave**: Group by deployment wave (Q1 2025, Q2 2025, etc.)
- **Status**: Draft | Ready | Deployed | Cancelled
- **Related Requirements**: Group by SATISFIES/SUPERSEDS relationships
- **Folder**: By organizational folder location
- **Milestone Status**: By milestone completion status
- **Modified By**: Group by contributor
- **Modified Date**: Group by time periods

**Group Interaction Patterns**:
- **Group Headers**: Clickable to expand/collapse, show item counts
- **Group Actions**: Right-click context menu for group-level operations
- **Multi-level Grouping**: Primary and secondary grouping levels
- **Group Sorting**: Ascending/descending order for group headers
- **Expand/Collapse All**: Master controls in actions toolbar

#### Hierarchical Perspective Layout
**Activity Structure (Layer 2)**:
- Content context selector (Edition/Baseline/Repository)
- Perspective toggle: `📋 Collection | 📁 Hierarchical | 📅 Temporal`
- Entity navigation tabs: `Operational Requirements | Operational Changes`
- Mode-specific action toolbar

**Entity Navigation Pattern (Layer 3)**:
- **Left Pane**: Hierarchical tree with REFINES relationships
- **Center Pane**: Entity details with versioning information
- **Action Toolbar**: Mode-specific operations (view/edit/comment/status)

**Tree Interaction**:
- Collapsible hierarchy with visual relationship indicators
- Click-to-select with persistent selection across mode changes
- Context-sensitive actions based on selection and permissions

#### Temporal Perspective Layout
**Timeline Visualization Area**:
- Horizontal timeline with wave and milestone markers
- Interactive timeline controls for date range selection
- Entity placement on timeline based on milestone associations

**Timeline Integration**:
- Same entity detail pane as hierarchical perspective
- Timeline-specific actions: milestone shifts, wave reassignments
- Deployment schedule visualization with dependency tracking

### Action System Design
**Mode-Specific Toolbars**:
- **Elaboration**: Create, Edit, Delete, Add Child, Version Management, Edit in Collection View
- **Read**: View Details, Export, Print, Version History, Group By controls
- **Review**: Comment, Set Status, Mark Reviewed, View Comments, Group By controls
- **Comment**: Add Comment, View Thread, Reply to Comments

**Perspective-Specific Actions**:
- **Collection**: Group By controls, Edit in Collection View toggle, filtering, bulk operations
- **Hierarchical**: Hierarchy management, parent/child operations
- **Temporal**: Timeline operations, milestone management, schedule adjustments

**Context-Sensitive Behavior**:
- Actions availability based on user permissions and content context
- Visual feedback for disabled actions with explanatory tooltips
- Bulk operation support in Collection perspective when multiple items selected
- Group-level actions when items grouped

---

### Read Activity
**Purpose**: Query and browse interface for operational content using ODP Browser in read-only mode

**Implementation**: ODP Browser component configured for read-only access
```javascript
<ODPBrowser 
  context={{type: "edition", id: selectedEditionId}}
  mode="read"
  perspective="collection"
  user={{permissions: ["view", "export"], role: "reader"}}
/>
```

**Primary User Flow**:
1. Select ODP Edition from available published editions
2. Browse content using collection (default), hierarchical, or temporal perspectives
3. Use grouping and filtering to organize large datasets
4. Access entity details and version history
5. Export or print content as needed

---

### Elaboration Activity
**Purpose**: Content creation and editing workspace using ODP Browser with full edit capabilities

**Implementation**: ODP Browser component configured for full CRUD operations
```javascript
<ODPBrowser 
  context={{type: "repository", id: "current"}}
  mode="elaboration"
  perspective="collection"
  user={{permissions: ["view", "create", "edit", "delete"], role: "contributor"}}
/>
```

**Primary User Flow**:
1. Access repository content for editing
2. Use Collection perspective (default) for efficient bulk editing
3. Group by Status, Type, or Wave for organized content management
4. Switch to "Edit in Collection View" for SharePoint-style grid editing
5. Use Hierarchical perspective for REFINES relationship management
6. Use Temporal perspective for deployment timeline planning
7. Manage versions and milestone associations

---

### Review Activities
**Purpose**: Internal review and external commenting using ODP Browser with review capabilities

**Internal Review Implementation**:
```javascript
<ODPBrowser 
  context={{type: "edition", id: reviewEditionId}}
  mode="internal-review"
  perspective="collection"
  user={{permissions: ["view", "comment", "status"], role: "internal-reviewer"}}
/>
```

**External Comment Implementation**:
```javascript
<ODPBrowser 
  context={{type: "edition", id: publishedEditionId}}
  mode="external-comment"
  perspective="collection"
  user={{permissions: ["view", "comment"], role: "external-commenter"}}
/>
```

**Review-Specific Features**:
- Group by Status to focus on items needing review
- Comment threading in details pane
- Bulk status updates in Collection edit mode
- Filter by commented items or review status

---

## Design Patterns and Standards

### Navigation Consistency
**Application Header**: Persistent across all activities
- Clear activity identification
- One-click switching between activities
- User context and system status

**Activity Navigation**: Consistent patterns within activities
- Tab-based entity switching (Setup and ODP Browser)
- Perspective toggle with clear visual indicators
- Breadcrumb navigation for hierarchy
- Context preservation during navigation

### Responsive Design
**Mobile Considerations**:
- Horizontal scroll for entity tabs
- Collapsible filtering area for more screen space
- Touch-friendly group headers and action buttons
- Stacked layout for four-area Collection design
- Swipe gestures for perspective switching

**Desktop Optimization**:
- Full four-area Collection layout utilization
- Hover-revealed actions for clean interface
- Keyboard navigation support with shortcuts
- Multi-monitor support for wide layouts

### Action Organization
**Toolbar Placement**: Top of content area (not right sidebar)
- Primary actions: Create, Edit, Delete, Edit in Collection View
- Secondary actions: Import, Export, Group By, Filter
- Navigation actions: Perspective toggle, context selector

**Context Sensitivity**: Actions change based on selection and mode
- "Edit in Collection View" toggles entire interface mode
- Group By controls adapt to available columns for each entity type
- Bulk actions available when multiple items selected
- Single-item actions enabled/disabled based on selection state

### Visual Hierarchy
**Status Indicators**:
- Entity count badges on tabs and group headers
- Connection status indicators
- Edit mode visual distinction from view mode
- Grouping level indentation and visual separators
- Loading states during group expand/collapse

**Interaction Feedback**:
- Hover states for all interactive elements
- Loading states during API operations and group operations
- Success/error notifications with undo capabilities
- Confirmation dialogs for destructive actions
- Group header expand/collapse animations

### Integration with Existing Patterns
**Component Reuse**:
- TreeEntity base class extended for hierarchical perspective
- Modal forms for complex CRUD operations
- Error handling and validation patterns from Setup Activity
- Responsive design tokens and styling system
- SharePoint Lists-inspired editing patterns in Collection perspective

**API Integration**:
- Multi-context parameter support for baseline/wave filtering
- Grouping query parameters for server-side grouping optimization
- Version history endpoints for temporal navigation
- Optimistic locking for concurrent editing in Collection edit mode
- Comment threading API for Review and Comment modes

---

*This document serves as the UI design authority for ODP Web Client development and defines the visual and interaction patterns for all activities, with the Collection perspective as the default user experience.*