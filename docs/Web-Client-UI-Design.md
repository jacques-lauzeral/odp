# ODP Web Client UI Design

## Document Overview
**Purpose**: UI design specifications and architectural patterns for the ODP Web Client  
**Status**: Setup Management Activity architecture defined  
**Last Updated**: June 28, 2025

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

**Example Structure**:
```
▶ Government Entities (3 children)
  └─ Federal Aviation Authority
  └─ Regional Authorities  
▶ Air Navigation Services Providers (5 children)
  └─ ANSP
    └─ FMP (Flow Management Position)
    └─ NEC (Network Emergency Coordinator)
    └─ NRC (Network Resource Coordinator) 
    └─ TOWER
Technology Vendors (standalone)
```

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

### ODP Read Activity (Future)
**Purpose**: Query and browse interface for operational content

**Planned Layout**:
- Edition selector with baseline filtering
- Multi-faceted search interface
- Results display with drill-down capabilities
- Timeline visualization for content evolution

---

### ODP Elaboration Activity (Future)
**Purpose**: Content creation and editing workspace

**Planned Layout**:
- Folder tree navigation (left pane)
- Rich text content editor (center pane)
- Version management and relationships (right pane)
- Baseline and milestone management tools

---

## Design Patterns and Standards

### Navigation Consistency
**Application Header**: Persistent across all activities
- Clear activity identification
- One-click switching between activities
- User context and system status

**Activity Navigation**: Consistent patterns within activities
- Tab-based entity switching (Setup)
- Breadcrumb navigation for hierarchy
- Context preservation during navigation

### Responsive Design
**Mobile Considerations**:
- Horizontal scroll for entity tabs
- Collapsible tree pane on narrow screens
- Touch-friendly action buttons
- Stacked layout for three-pane design

**Desktop Optimization**:
- Full three-pane layout utilization
- Hover-revealed actions for clean interface
- Keyboard navigation support

### Action Organization
**Toolbar Placement**: Top of content area (not right sidebar)
- Primary actions: Add, Edit, Delete
- Secondary actions: Import, Export, Validate
- Navigation actions: Breadcrumb, activity switching

**Context Sensitivity**: Actions change based on selection
- "Add Child" only available for refinable entities and selected parents
- Edit/Delete only available when entity selected
- Bulk actions available in list view

### Visual Hierarchy
**Status Indicators**:
- Entity count badges on tabs
- Hierarchy relationship badges
- Connection status indicators
- Validation state feedback

**Interaction Feedback**:
- Hover states for all interactive elements
- Loading states during API operations
- Success/error notifications
- Confirmation dialogs for destructive actions

---

## Design Questions and Considerations

### Current Considerations
- **Tree visualization**: Balance between information density and usability
- **Mobile hierarchy navigation**: Optimal patterns for small screens
- **Bulk operations**: Specific multi-select interaction patterns

### Future Considerations
- **Rich text editing requirements** for Elaboration activity
- **Timeline visualization** approaches for Read activity
- **Collaborative editing** indicators and conflict resolution
- **Permission boundaries** between activities

---

*This document serves as the UI design authority for ODP Web Client development and defines the visual and interaction patterns for all activities.*