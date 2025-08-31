# ODP Web Client UI Design

## Document Overview
**Purpose**: UI design specifications and architectural patterns for the ODP Web Client  
**Status**: Setup Management Activity complete, Elaboration Activity complete, Publication Activity complete, Review Activity in progress  
**Last Updated**: August 31, 2025

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

## Activity UI Specifications

### Landing Page ✅ IMPLEMENTED
**Purpose**: Simple activity launcher with user identification

**Implemented Layout**:
- Clean, minimal interface with activity tiles
- User identification prompt (name entry, no authentication)
- Connection status indicator
- Direct navigation to Setup, Elaboration, Publication, and Review activities

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

#### Entity Type Implementation (Layer 3)
**TreeEntity Pattern**: Used for hierarchical entities
- **Three-Pane Layout**: Navigation tree, item list, details panel
- **Hierarchy Management**: REFINES relationships with visual indentation
- **CRUD Operations**: Create, edit, delete with validation
- **Form Inheritance**: Consistent modal forms across entity types

**ListEntity Pattern**: Used for simple list entities (Waves)
- **Two-Pane Layout**: Item list and details panel
- **Table Display**: Sortable columns with responsive design
- **Inline Editing**: Direct manipulation with validation feedback

---

### Elaboration Activity ✅ IMPLEMENTED
**Purpose**: Content creation and editing workspace using Collection perspective

#### Activity Structure (Layer 2)
**Repository Context Display**:
- Clear "Repository" context indicator in header
- Development content focus messaging

**Entity Navigation Tabs**:
- `Operational Requirements | Operational Changes`
- Dynamic count badges updated from API
- Tab switching with proper state management

#### Collection Perspective Layout (Layer 3)
**Four-Area Layout Implementation**:

**1. Filtering Area**: Collapsible filters with dynamic setup data options
- **Text Search**: Pattern matching across entity titles and descriptions
- **Category Filters**: Dynamic dropdowns populated from setup data
- **Status Filters**: Entity-specific status and workflow states
- **Clear All**: Reset all filters with single action

**2. Actions Area**: Create actions and grouping controls
- **Create Button**: Context-sensitive "New Requirement" / "New Change" text
- **Grouping Dropdown**: Group by category, status, impact, or none
- **View Controls**: List density and column visibility options
- **Bulk Actions**: Multi-select operations where appropriate

**3. Collection List Area**: Table-based display with grouping support
- **Dynamic Columns**: Entity-specific column configurations
- **Grouping Headers**: Collapsible groups with item counts
- **Row Selection**: Single and multi-select with visual feedback
- **Pagination**: Virtual scrolling for large datasets
- **Sort Controls**: Multi-column sorting with visual indicators

**4. Details Panel**: Selected item details with edit actions
- **Metadata Display**: Creation, modification, and ownership details
- **Content Preview**: Rich text content with formatting preservation
- **Action Buttons**: Edit, duplicate, delete with permission checks
- **Relationship Display**: Connected entities and dependencies

---

### Publication Activity ✅ IMPLEMENTED
**Purpose**: ODP Edition management interface for creating and browsing published editions

#### Activity Structure (Layer 2)
**Publication Context Display**:
- Clear "Publication" context indicator in header
- Edition management focus messaging

**Single Entity Focus**:
- No entity tabs required (single entity: ODP Editions)
- Direct Collection perspective implementation
- Edition count display in activity header

#### Collection Perspective Layout (Layer 3)
**Four-Area Layout for ODP Editions**:

**1. Filtering Area**:
- **Type Filter**: ALPHA | BETA | RELEASE | All Types
- **Title Pattern**: Text search in edition titles
- **Baseline Filter**: Dynamic options from available baselines
- **Wave Filter**: Dynamic options from setup data waves
- **Clear All Filters**: Reset all filter controls

**2. Actions Area**:
- **Create Action**: "New Edition" button
- **Grouping Control**: Group by Type | Baseline | Wave | None
- **Edition Count**: Display total editions with filter indicator

**3. Collection List Area**:
- **Table Columns**: Title | Type | Starts From Wave | Created At | Created By
- **Type Badges**: Color-coded ALPHA/BETA/RELEASE indicators
- **Wave Display**: Year/Quarter format (e.g., "2025 Q2")
- **Row Actions**: Review Edition (navigate to Review activity with context)
- **Grouping Support**: Collapsible groups with edition counts

**4. Details Panel**:
- **Edition Metadata**: Creation details and context information
- **Baseline Reference**: Link to baseline used for the edition
- **Wave Reference**: Starting wave information with timeline context
- **Action Buttons**: Review Edition (primary action)
- **Content Preview**: Summary of included requirements and changes

#### Edition Form Modal
**Create New Edition Form**:
- **Title Field**: Required text input for edition name
- **Type Selection**: Radio buttons for ALPHA | BETA | RELEASE
- **Baseline Selection**: Dropdown of available baselines with creation dates
- **Starting Wave**: Dropdown of waves with year/quarter display
- **Form Validation**: Required field validation and business rules

---

### Review Activity 🔄 IN PROGRESS
**Purpose**: Edition review interface for examining published content with commenting capability

#### Activity Structure (Layer 2)
**Edition Context Display**:
- Clear "Review" context indicator in header
- Selected edition metadata display
- Review mode messaging

**Entity Navigation Tabs**:
- `Operational Requirements | Operational Changes`
- Tab switching with edition context preservation
- Entity count badges showing filtered content

#### Collection Perspective Layout (Layer 3)
**Four-Area Layout for Edition Review**:

**1. Filtering Area**:
- **Text Search**: Pattern matching across requirements and changes
- **Category Filters**: Dynamic options from setup data (read-only mode)
- **Status Filters**: Show changes, new items, modified items
- **Clear All Filters**: Reset all filter controls

**2. Actions Area**:
- **Export Actions**: PDF, structured data export
- **View Controls**: Grouping dropdown and display options
- **Comment Mode**: Toggle commenting capability
- **Edition Info**: Selected edition title and metadata display

**3. Collection List Area**:
- **Table Display**: Same columns as Elaboration but read-only
- **Visual Indicators**: Change highlighting, version differences
- **Comment Indicators**: Show items with comments or discussions
- **Grouping Support**: Same grouping options as Elaboration

**4. Details Panel**:
- **Content Display**: Full content rendering with formatting
- **Version Information**: Edition context and change history
- **Comment Section**: Inline commenting and discussion threads
- **Related Items**: Cross-references and dependencies

---

## Design Patterns and Standards

### Navigation Consistency
**Application Header**: Persistent across all activities
- Clear activity identification with active state
- One-click switching between activities
- User context and system status

**Activity Navigation**: Consistent patterns within activities
- Tab-based entity switching (Setup and Elaboration)
- Single entity focus (Publication and Review)
- Count badges showing live entity counts

### Visual Hierarchy Implementation
**Status Indicators**:
- **Edition Types**: ALPHA/BETA/RELEASE badges with distinct styling
- **Wave References**: Year/quarter badges with consistent formatting
- **Creation Status**: Timestamps and user attribution display

**Interactive Feedback**:
- **Hover States**: Consistent hover styling across all interactive elements
- **Loading States**: Spinners and progress messaging during operations
- **Selection States**: Clear visual distinction for selected items

### Action Organization
**Toolbar Placement**: Actions positioned above content area
- **Primary Actions**: Create new items (context-sensitive button text)
- **View Controls**: Grouping dropdown and filter controls
- **Secondary Actions**: Edition-specific actions (Review Edition)

---

## Implementation Status

### ✅ Completed Features
- **Landing Page**: Full implementation with user identification
- **Setup Management**: Complete entity management with hierarchy support
- **Elaboration Activity**: Collection perspective with dynamic setup data integration
- **Publication Activity**: Complete ODP Edition management with baseline/wave integration
- **Responsive Design**: Mobile and desktop layouts tested and functional

### Current Capabilities
- **Four Activity Types**: Landing, Setup, Elaboration, and Publication activities fully operational
- **Seven Setup + Operational Entities**: Complete CRUD with advanced filtering and grouping
- **Dynamic Data Integration**: Setup data automatically populates filter options
- **Edition Management**: Complete ODP Edition lifecycle with Review activity integration
- **Real-time Updates**: Live entity counts and connection status monitoring

### 🔄 In Progress
- **Review Activity**: Edition review interface with read-only Collection perspective
- **Comment Integration**: Inline commenting system for review feedback
- **Context Passing**: Seamless navigation from Publication to Review activities

---

*This document reflects the implemented and planned UI patterns for the ODP Web Client, providing consistent user experience across all activities while adapting to each activity's specific requirements.*