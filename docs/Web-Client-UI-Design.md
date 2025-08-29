# ODP Web Client UI Design

## Document Overview
**Purpose**: UI design specifications and architectural patterns for the ODP Web Client  
**Status**: Setup Management Activity complete, Elaboration Activity complete, Publication Activity in progress  
**Last Updated**: August 29, 2025

---

## Application Architecture

### Three-Layer Page Structure
The ODP Web Client follows a consistent three-layer navigation hierarchy across all activities:

**Layer 1: ODP Level (Global Application Chrome)**
- Persistent header across all activities: `Landing | Setup | Elaboration | Publication | Read`
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
- Direct navigation to Setup, Elaboration, Publication, and Read activities

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
1. **Filtering Area**: Collapsible filters with dynamic setup data options
2. **Actions Area**: Create actions and grouping controls
3. **Collection List Area**: Table-based display with grouping support
4. **Details Panel**: Selected item details with edit actions

---

### Publication Activity 🔄 IN PROGRESS
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
- **Row Actions**: Read Edition (navigate to Read activity with context)
- **Grouping Support**: Collapsible groups with edition counts

**4. Details Panel**:
- **Edition Metadata**: Creation details and context information
- **Baseline Reference**: Link to baseline used for the edition
- **Wave Reference**: Starting wave information with timeline context
- **Action Buttons**: Read Edition (primary action)
- **Content Preview**: Summary of included requirements and changes

#### Edition Form Modal
**Create New Edition Form**:
- **Title Field**: Required text input for edition name
- **Type Selection**: Radio buttons for ALPHA | BETA | RELEASE
- **Baseline Selection**: Dropdown of available baselines with creation dates
- **Starting Wave**: Dropdown of waves with year/quarter display
- **Form Validation**: Required field validation and business rules

---

## Design Patterns and Standards

### Navigation Consistency
**Application Header**: Persistent across all activities
- Clear activity identification with active state
- One-click switching between activities
- User context and system status

**Activity Navigation**: Consistent patterns within activities
- Tab-based entity switching (Setup and Elaboration)
- Single entity focus (Publication)
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
- **Secondary Actions**: Edition-specific actions (Read Edition)

---

## Implementation Status

### ✅ Completed Features
- **Landing Page**: Full implementation with user identification
- **Setup Management**: Complete entity management with hierarchy support
- **Elaboration Activity**: Collection perspective with dynamic setup data integration
- **Responsive Design**: Mobile and desktop layouts tested and functional

### Current Capabilities
- **Three Activity Types**: Landing, Setup, and Elaboration activities fully operational
- **Seven Setup + Operational Entities**: Complete CRUD with advanced filtering and grouping
- **Dynamic Data Integration**: Setup data automatically populates filter options
- **Real-time Updates**: Live entity counts and connection status monitoring

### 🔄 In Progress
- **Publication Activity**: ODP Edition management interface implementation
- **Edition Workflow**: Create and browse editions with baseline/wave integration
- **Read Activity Integration**: Context passing for edition browsing

---

*This document reflects the implemented and planned UI patterns for the ODP Web Client, providing consistent user experience across all activities while adapting to each activity's specific requirements.*