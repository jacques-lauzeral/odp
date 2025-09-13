# Web Client - Temporal View Implementation Plan

## Overview
The temporal view provides a specialized interface for change deployment planning, displaying operational changes and their milestones across deployment waves in a coordinated 2D timeline visualization.

## Implementation Focus Areas

### Primary: Change View Enhancement
**Current State**: Basic change collection view exists
**Target State**: Collection view + Timeline view as separate coordinated components

**New Components to Build:**
- **Timeline Grid Component**: Interactive 2D grid with wave intersections and pixmap event visualization
- **Timeline Navigation Controls**: Pan/zoom controls for viewport management (3-year default, 4-48 wave range)
- **Timeline Policy Selector**: Switch between unique/per-event-type/per-impact/per-change timeline layouts

### Secondary: Collection View Enhancement
**Current State**: Standalone collection with internal selection
**Target State**: Collection component capable of external selection synchronization

**Collection Component Changes:**
- **External Selection API**: Accept selection state from parent component
- **Selection Event Emission**: Notify parent when user selects items in master list
- **Bi-directional Selection Sync**: Highlight items based on external selection (from timeline)
- **Selection State Management**: Maintain selection consistency across components

**Technical Pattern:**
```javascript
// Collection becomes controllable component
<CollectionView 
  selectedItems={timelineSelection}
  onSelectionChange={handleCollectionSelection}
  ...
/>

// Timeline emits selection changes  
<TimelineGrid
  selectedItems={collectionSelection}
  onSelectionChange={handleTimelineSelection}
  ...
/>
```

### Architecture Pattern
**Coordinated Views**: Collection and Timeline as sibling components with shared selection state
- **Parent Component**: Manages selection synchronization between collection master list and timeline grid
- **Selection Coordination**: Changes in either component update shared selection state
- **Master-Details**: Details panel renders based on combined selection state

## Key Design Decisions

### Architecture
- **Entity-specific views**: Temporal view dedicated to changes only (requirements use collection/tree views)
- **No mixed queries**: Each view shows one entity type at a time
- **Future-ready**: Architecture accommodates potential change dependencies

### Three-Area Layout
- **Top Area**: Timeline bounds controls, change filtering, timeline policy selection
- **Center Area**: Interactive timeline grid with wave intersections
- **Bottom Area**: Master-details with bi-directional selection (timeline ↔ master list)

### Timeline Policies
- **Unique timeline**: Single horizontal timeline (default)
- **Per milestone event type**: One timeline per event type
- **Per impact perspective**: One timeline per service/stakeholder/data/regulatory aspect
- **Per operational change**: One timeline per change (useful for dependency visualization)

### Event Visualization
**Pixmap approach**: 3x3 pixel grid for event type representation
- Column semantics: [API][UI][Service] domains
- Row semantics: Deployment progression or positional slots
- Scalable: Fixed footprint regardless of event count

**Example Pixmap Representations:**
```
Timeline positions: 1234567890
|........ = API_PUBLICATION (position 1)
.|....... = API_NON_OPS_DEPLOYMENT (position 2)  
..|...... = UI_NON_OPS_DEPLOYMENT (position 3)
...|..... = API_OPS_DEPLOYMENT (position 4)
....||... = API_PUBLICATION + API_OPS_DEPLOYMENT (positions 1+4)
```

**Alternative: 3x3 Pixmap Grid**
```
Column layout:
[API][UI ][SRV]  
[API][UI ][SRV]  
[API][UI ][SRV]  

Examples:
█.. = API_PUBLICATION
.█. = UI_NON_OPS_DEPLOYMENT  
..█ = SERVICE_ACTIVATION
██. = API_PUBLICATION + API_OPS_DEPLOYMENT
█.█ = API_PUBLICATION + SERVICE_ACTIVATION
```

### Selection Coordination
1. **Filtering** (top area) → reduces master list
2. **Selection** (timeline ↔ master) → synchronized bi-directional selection
3. **Details** → renders selected subset only

**Selection Flow:**
- Timeline intersection click → selects corresponding master rows → details shows those milestones
- Master row selection → highlights corresponding timeline elements → details shows selected items
- Multi-select support → both components support Ctrl+click for additive selection

## Technical Constraints

### Data Architecture
- **Wave data**: Pre-cached, regular but not fixed rhythm
- **Milestone constraint**: Maximum one milestone per change per wave
- **Timeline bounds**: User-selectable, 3-year default window
- **Timeline Navigation**: Pan/zoom capabilities essential

### Component Requirements
- **Timeline Grid**: Handle irregular wave spacing, pixmap rendering, intersection click handling
- **Collection View**: External selection control, bi-directional synchronization
- **Navigation Controls**: Smooth pan/zoom with viewport state management

## Implementation Phases

### Phase 1: Foundation
- Basic timeline grid component with simple pixmap rendering
- Collection view refactoring for external selection control
- Simple bi-directional selection synchronization

### Phase 2: Navigation
- Pan/zoom controls and viewport management
- Timeline bounds controls integration
- Performance optimization for large datasets

### Phase 3: Policies & Advanced Features
- Multiple timeline layout options (per event type, per change, etc.)
- Advanced pixmap rendering with hover states
- Timeline policy switching with selection persistence

### Phase 4: Polish & Integration
- Smooth animations and transitions
- Responsive design for different screen sizes
- Full integration testing and user experience refinement

## Core Implementation Work
1. **Timeline Grid Component**: Brand new specialized component for temporal visualization
2. **Collection View Refactoring**: Enhance existing component to support external selection control
3. **Selection Coordination**: Parent-level state management for bi-directional synchronization

## Data Flow Architecture

### Component Hierarchy
```
ChangeTemporalView (parent)
├── TimelineBounds (top area)
├── ChangeFiltering (top area) 
├── TimelinePolicy (top area)
├── TimelineGrid (center area)
└── MasterDetails (bottom area)
    ├── CollectionView (master list)
    └── DetailsPanel (selected items)
```

### Selection State Management
```javascript
const [selectedItems, setSelectedItems] = useState([]);
const [timelineSelection, setTimelineSelection] = useState([]);

// Bi-directional sync
const handleTimelineSelection = (items) => {
  setSelectedItems(items);
  // Collection view updates automatically via props
};

const handleCollectionSelection = (items) => {
  setSelectedItems(items);  
  // Timeline highlights update automatically via props
};
```

---

*Primary development effort focuses on change view timeline capabilities, leveraging and enhancing the shared collection component foundation for bi-directional selection coordination.*