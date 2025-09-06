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

## Shared Styling Architecture

### CSS File Organization
The application uses a shared styling approach to ensure consistency across interaction activities:

**Shared Base Styles**:
- `styles/activities/abstract-interaction-activity.css` - Common interaction activity patterns
- Unified tab styling using `.interaction-tab` classes
- Consistent collection layouts, filter controls, and action buttons
- Shared responsive design patterns

**Activity-Specific Styles**:
- `styles/activities/elaboration.css` - Elaboration-specific customizations only
- `styles/activities/review.css` - Review-specific styling (read-only indicators, comment features)
- `styles/activities/setup.css` - Setup management specific styling
- `styles/activities/landing.css` - Landing page specific styling

**Import Structure**:
```html
<link rel="stylesheet" href="styles/activities/abstract-interaction-activity.css">
<link rel="stylesheet" href="styles/activities/elaboration.css">
<link rel="stylesheet" href="styles/activities/review.css">
```

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

### Elaboration Activity ✅ IMPLEMENTED
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

---

### Publication Activity ✅ IMPLEMENTED
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

### Review Activity ✅ IMPLEMENTED
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
- **Table Display**: Same columns as Elaboration but read-only
- **Visual Indicators**: Read-only styling with blue-tinted hover states
- **Comment Indicators**: Show items with comments or discussions
- **Grouping Support**: Same grouping options as Elaboration

**4. Details Panel**:
- **Content Display**: Full content rendering with formatting
- **Version Information**: Edition context and baseline information
- **Comment Section**: Inline commenting and discussion threads (planned)
- **Related Items**: Cross-references and dependencies within edition

#### Review-Specific Features
**Target Selection Interface**:
- **Card-based Layout**: Visual selection between Repository and Edition options
- **Edition Dropdown**: Dynamic list of available published editions
- **Loading States**: Progress indicators during edition loading
- **Error Handling**: Graceful fallback for unavailable editions

**Read-Only Indicators**:
- **Visual Distinction**: Blue-tinted interaction states
- **Context Labels**: Clear "Edition Review" indicators
- **Action Button Styling**: Export and comment buttons with review-specific styling
- **Disabled Elements**: Form controls and edit actions appropriately disabled

**Navigation Integration**:
- **Publication Integration**: "Review Edition" button in Publication activity
- **Direct Navigation**: Support for `/review/edition/{id}` URLs
- **Context Preservation**: Maintains edition context across tab switches
- **SPA Routing**: Internal navigation without page reloads

#### ODP Edition Parameter Resolution
**Client-Side Resolution Process**:
1. **Edition Context Detection**: Identify edition ID from URL or navigation
2. **Edition Details Loading**: Fetch edition metadata including baseline and wave references
3. **Parameter Resolution**: Resolve edition to `baseline` + `fromWave` API parameters
4. **Filtered Data Loading**: Load requirements and changes with edition-specific filtering
5. **Count Updates**: Update entity count badges with edition-filtered totals

**API Integration**:
- Uses standard `/operational-requirements?baseline={id}&fromWave={id}` endpoints
- Client-side resolution of ODP Edition to constituent parameters
- Proper error handling for invalid or missing editions
- Fallback to repository mode if edition loading fails

---

## Design Patterns and Standards

### Navigation Consistency
**Application Header**: Persistent across all activities
- Clear activity identification with active state
- One-click switching between activities
- User context and system status

**Activity Navigation**: Consistent patterns within activities
- Tab-based entity switching (Setup, Elaboration, Review)
- Single entity focus (Publication)
- Count badges showing live entity counts
- Shared `.interaction-tab` styling across Review and Elaboration

### Visual Hierarchy Implementation
**Status Indicators**:
- **Edition Types**: DRAFT/OFFICIAL badges with distinct styling
- **Wave References**: Year/quarter badges with consistent formatting
- **Creation Status**: Timestamps and user attribution display
- **Read-Only Mode**: Visual indicators for review mode content

**Interactive Feedback**:
- **Hover States**: Consistent hover styling across all interactive elements
- **Loading States**: Spinners and progress messaging during operations
- **Selection States**: Clear visual distinction for selected items
- **Review Mode**: Blue-tinted interactions to distinguish from edit mode

### Action Organization
**Toolbar Placement**: Actions positioned above content area
- **Primary Actions**: Create new items (context-sensitive button text)
- **View Controls**: Grouping dropdown and filter controls
- **Secondary Actions**: Edition-specific actions (Review Edition, Export, Comment)
- **Mode Indicators**: Clear visual distinction between edit and review modes

---

## Implementation Status

### ✅ Completed Features
- **Landing Page**: Full implementation with user identification and activity tiles
- **Setup Management**: Complete entity management with hierarchy support
- **Elaboration Activity**: Collection perspective with dynamic setup data integration
- **Publication Activity**: Complete ODP Edition management with baseline/wave integration
- **Review Activity**: Edition review interface with target selection and read-only collection perspective
- **Responsive Design**: Mobile and desktop layouts tested and functional
- **Shared CSS Architecture**: Unified styling approach with abstract-interaction-activity.css

### Current Capabilities
- **Five Activity Types**: Landing, Setup, Elaboration, Publication, and Review activities fully operational
- **Seven Setup + Operational Entities**: Complete CRUD with advanced filtering and grouping
- **Dynamic Data Integration**: Setup data automatically populates filter options across activities
- **Edition Management**: Complete ODP Edition lifecycle from creation to review
- **Context-Aware Navigation**: Seamless transitions between activities with proper context preservation
- **Edition Filtering**: Client-side resolution of ODP Edition parameters for filtered data views
- **Real-time Updates**: Live entity counts and connection status monitoring
- **Consistent UI Patterns**: Shared styling and interaction patterns across all activities

### Technical Achievements
- **CSS Architecture Refactoring**: Elimination of style duplication through shared base styles
- **ODP Edition Parameter Resolution**: Proper client-side resolution to baseline + fromWave parameters
- **SPA Routing Integration**: Support for deep-linking to edition-specific review URLs
- **Activity Navigation**: Seamless integration between Publication and Review with context preservation
- **Responsive Design**: Consistent experience across desktop and mobile devices

---

## Future Enhancements

### Planned Features
- **Comment System**: Full commenting functionality in Review mode with threading and moderation
- **Advanced Export**: Enhanced export capabilities with custom formatting options
- **Hierarchical View**: Alternative perspective for requirement hierarchies
- **Temporal View**: Timeline-based perspective for milestone and wave visualization
- **Inline Editing**: Direct editing capabilities in Collection view for Elaboration mode
- **Version Comparison**: Side-by-side comparison of edition differences

### Technical Improvements
- **Performance Optimization**: Virtual scrolling for large datasets
- **Offline Support**: Local caching and offline editing capabilities
- **Advanced Search**: Full-text search across all content types
- **Keyboard Navigation**: Complete keyboard accessibility for all interfaces

---

*This document reflects the implemented UI patterns for the ODP Web Client, providing comprehensive coverage of all five activities with consistent user experience patterns, shared styling architecture, and seamless navigation integration.*