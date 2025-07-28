# ODP Web Client UI Design

## Document Overview
**Purpose**: UI design specifications and architectural patterns for the ODP Web Client  
**Status**: Setup Management Activity complete, Elaboration Activity implemented with Collection perspective  
**Last Updated**: July 28, 2025

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

**Implemented Layout**:
- Clean, minimal interface with three activity tiles
- User identification prompt (name entry, no authentication)
- Connection status indicator
- Direct navigation to Setup, Read, or Elaboration activities

---

### Setup Management Activity ✅ IMPLEMENTED
**Purpose**: Entity management interface for reference data configuration

#### Activity Structure (Layer 2)
**Entity Navigation Tabs**:
- `Stakeholder Categories | Regulatory Aspects | Data Categories | Services | Waves`
- Tab-based switching between entity types
- Entity count badges on each tab
- Responsive horizontal scroll on mobile

**Layout Pattern**: Three-pane workspace for hierarchical entities, simple list for waves

#### Entity Management Pattern (Layer 3)
**Left Pane: Entity Tree** (for hierarchical entities)
- Collapsible hierarchy tree for REFINES relationships
- Visual indicators: `▶` (expandable), `└─` (child), indentation levels
- Click to select any node in hierarchy
- Real-time tree updates when entities are added/modified

**Center Pane: Detail/Editor**
- **View Mode**: Read-only display of selected entity
- **Edit Mode**: Form-based editing with validation
- Toggle between view/edit modes
- Auto-focus when creating new entities

**Right Pane: Actions**
- **Entity Actions**: Add Child | Edit | Delete (context-sensitive)
- **Bulk Actions**: Import | Export | Validate Hierarchy
- **Navigation**: Breadcrumb showing current entity path

#### Implemented REFINES Hierarchy Management
**Visual Representation**:
- Tree structure with expand/collapse controls
- Clear parent-child relationships through indentation
- Status badges: "Hierarchy Root" | "Child Entity" | "Standalone"

**Interaction Patterns**:
- **Create Child**: Auto-select parent, open editor for new child
- **Parent Selection**: Dropdown with hierarchy validation (prevent circular references)
- **Tree Navigation**: Click any node to view/edit that entity
- **Breadcrumb**: Show hierarchy path for current selection

---

### Elaboration Activity ✅ IMPLEMENTED
**Purpose**: Content creation and editing workspace using Collection perspective with full edit capabilities

#### Implemented Activity Structure (Layer 2)
**Repository Context Display**:
- Clear "Repository" context indicator in header
- Development content focus messaging

**Entity Navigation Tabs**:
- `Operational Requirements | Operational Changes`
- Dynamic count badges updated from API
- Tab switching with proper state management

**Perspective Toggle**:
- `📋 Collection` (active and functional)
- `📁 Hierarchical` (disabled, "Coming soon")
- `📅 Temporal` (disabled, "Coming soon")

#### Implemented Collection Perspective Layout (Layer 3)
**Four-Area Layout Implementation**:

**1. Filtering Area (Collapsible)**:
- **Requirements Filters**:
    - Type: ON (Operational Need) / OR (Operational Requirement) / All Types
    - Title Pattern: Text search
    - Impact filters: Data/Stakeholder/Regulatory/Services (populated from setup data)
- **Changes Filters**:
    - Title Pattern: Text search
    - Wave: Dynamic options from setup data (e.g., "2025 Q1", "2024 Q4")
    - Satisfies: Text search for requirement references
    - Supersedes: Text search for change references
- **Clear All Filters**: Reset all filter controls

**2. Actions Area (Persistent Toolbar)**:
- **Edit Mode Toggle**: "Edit in Collection View" checkbox (functional)
- **Create Actions**: "New Requirement" / "New Change" (context-sensitive)
- **Grouping Control**: Dynamic dropdown based on entity configuration
- **Perspective Toggle**: Collection active, others disabled with tooltips

**3. Collection List Area**:
- **Table-based Display**: One row per item with configurable columns
- **Requirements Columns**: ID | Type | Title | Parent | Data Impact | Stakeholder Impact | Regulatory Impact | Services Impact | Updated By | Updated
- **Changes Columns**: ID | Title | Wave | Visibility | Satisfies | Supersedes | Updated By | Updated
- **Grouping Support**: Collapsible groups with count badges
- **Row Selection**: Single-select with highlighting
- **Custom Cell Rendering**: Badges for types, status indicators for impacts, formatted dates

**4. Details Panel**:
- **Selected Item Details**: Dynamic content based on selection
- **Requirements Details**: Description, rationale, statement, impact details with setup data names
- **Changes Details**: Description, milestone info, implementation notes, requirement/change relationships
- **No Selection State**: Helpful placeholder with icon and instructions

#### Implemented Setup Data Integration
**Dynamic Filter Population**:
- **Stakeholder Categories**: Loaded from `/stakeholder-categories` API
- **Data Categories**: Loaded from `/data-categories` API
- **Regulatory Aspects**: Loaded from `/regulatory-aspects` API
- **Services**: Loaded from `/services` API
- **Waves**: Loaded from `/waves` API with year/quarter formatting

**Setup Data Loading Process**:
1. Elaboration activity loads all setup data on initialization
2. Setup data passed to Requirements and Changes entities
3. Entities build dynamic filter options from setup data
4. Display names resolved using setup data (show names instead of IDs)
5. Loading states shown during setup data fetch

#### Implemented Responsive Design
**Mobile Layout (< 768px)**:
- **Stacked Layout**: Filters → Actions → List → Details (vertical stack)
- **Tab Navigation**: Show only count badges, hide entity names
- **Collapsible Filters**: Full-width filter controls
- **Touch-Friendly**: Larger touch targets for groups and items

**Desktop Layout (≥ 1024px)**:
- **Four-Area Grid**: Full layout with sidebar details panel
- **Hover States**: Rich hover feedback on interactive elements
- **Keyboard Navigation**: Full keyboard support with focus indicators

#### Implemented Error and Loading States
**Loading States**:
- **Initial Load**: Setup data loading with spinner and message
- **Entity Loading**: Individual entity loading states
- **Empty States**: Helpful guidance for first-time users

**Error Handling**:
- **Setup Data Errors**: Graceful fallback with retry options
- **Entity Load Errors**: Clear error messaging with reload capability
- **Network Errors**: Connection status integration with retry actions

#### Implemented Interaction Patterns
**Filter Behavior**:
- **Text Filters**: 300ms debounced input for performance
- **Select Filters**: Immediate application on change
- **Clear All**: Single-click to reset all active filters
- **Filter Persistence**: Filters maintained during tab switching

**Grouping Behavior**:
- **Dynamic Options**: Based on entity configuration (Type, Parent, Impact categories for Requirements; Wave, Satisfies, Supersedes for Changes)
- **Group Headers**: Expandable/collapsible with item counts
- **Group Priorities**: Logical ordering (e.g., ON before OR, assigned waves before unassigned)

**Selection and Details**:
- **Single Selection**: Click row to select and update details panel
- **Visual Feedback**: Selected row highlighting
- **Details Update**: Immediate details panel refresh on selection
- **Context Preservation**: Selection maintained during filtering/grouping

---

## Design Patterns and Standards

### Navigation Consistency
**Application Header**: Persistent across all activities
- Clear activity identification with active state
- One-click switching between activities
- User context and system status

**Activity Navigation**: Consistent patterns within activities
- Tab-based entity switching (Setup and Elaboration)
- Count badges showing live entity counts
- Responsive tab behavior on mobile devices

### Visual Hierarchy Implementation
**Status Indicators**:
- **Requirements**: ON/OR badges with distinct styling
- **Changes**: Wave badges with setup data formatting
- **Impact Levels**: Color-coded status indicators using setup data names
- **Connection Status**: Live API connection monitoring

**Interactive Feedback**:
- **Hover States**: Consistent hover styling across all interactive elements
- **Loading States**: Spinners and progress messaging during operations
- **Selection States**: Clear visual distinction for selected items
- **Focus States**: Keyboard navigation support with focus rings

### Action Organization
**Toolbar Placement**: Actions positioned above content area
- **Primary Actions**: Create new items (context-sensitive button text)
- **Mode Controls**: Edit mode toggle with clear labeling
- **View Controls**: Grouping dropdown and perspective toggle
- **Filter Controls**: Organized in collapsible filter area

**Context Sensitivity**: Actions adapt based on selection and state
- **Create Button**: "New Requirement" vs "New Change" based on active tab
- **Edit Mode**: Visual distinction when edit mode is enabled
- **Group Controls**: Dynamic options based on current entity type
- **Disabled States**: Clear indication for unavailable features

### Integration with Established Patterns
**Component Reuse**:
- **Base Classes**: CollectionEntity pattern proven and extensible
- **Error Handling**: Consistent error display and retry mechanisms
- **API Integration**: Standardized loading states and error handling
- **Responsive Design**: Mobile-first approach with progressive enhancement

**Data Flow Patterns**:
- **Setup Data**: Centralized loading and distribution to entities
- **State Management**: Consistent state handling across components
- **Event Handling**: Debounced inputs and immediate UI feedback
- **URL Integration**: Deep linking support for entity navigation

---

## Implementation Status

### ✅ Completed Features
- **Landing Page**: Full implementation with user identification
- **Setup Management**: Complete entity management with hierarchy support
- **Elaboration Activity**: Collection perspective with dynamic setup data integration
- **Responsive Design**: Mobile and desktop layouts tested and functional
- **Error Handling**: Comprehensive error management with user-friendly messaging

### Current Capabilities
- **Two Activity Types**: Landing page navigation to Setup and Elaboration activities
- **Five Setup Entities**: Full CRUD with hierarchy management for reference data
- **Two Operational Entities**: Requirements and Changes with Collection perspective interface
- **Dynamic Data Integration**: Setup data automatically populates filter options
- **Real-time Updates**: Live entity counts and connection status monitoring

---

*This document reflects the implemented UI patterns and design decisions for the ODP Web Client, providing the foundation for consistent user experience across all current and future activities.*