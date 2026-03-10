# Web Client - Temporal View Implementation Plan

## Overview
The temporal view provides a specialized interface for change deployment planning, displaying operational changes and their milestones across deployment waves in a coordinated timeline visualization. This view integrates below existing change filters and displays only filtered changes in temporal context.

## High-Level Architecture

### Preserved Design Decisions
- **3 perspectives maintained**: Requirements/Changes with Collection/Tree/Temporal views
- **Entity-specific views**: Temporal view dedicated to changes only
- **Filter integration**: Temporal view sits below change filters, displays filtered changes only
- **Future-ready**: Architecture accommodates potential change dependencies

## Layout Architecture (2 Panels)

### Improved Interaction Activity Panel
**Perspective Specific Controls**
The area localised at the right of the perspective switch control shall be used to render perspective specific controls.

**Temporal Perspective Specific Controls**
The temporal perspective exposes the following controls:
- Time window lower bound: the wave from which the Timeline-Grid starts to display changes and milestones
- Time window upper bound: the wave to which the Timeline-Grid ends to display changes and milestones
- Milestone event types: an event type filer - one closable label per selected event type, followed by a "+" button that allows the user to add event types

### Center Panel - Master Timeline Grid Component
**Timeline Structure:**
- **Horizontal axis**: Time progression across deployment timeline
- **Vertical lines**: Wave deployment dates (from cached wave data)
- **Change representation**: Each filtered change displays as a horizontal row containing:
    - **Left label**: Change identifier/title
    - **Thin horizontal line**: Spans full time window (lower bound → upper bound)
    - **Pixmap intersections**: Milestones rendered at wave intersection points
    - **Simple deep line connector**: Links milestones showing deployment continuity
    - **Continuity handling**: Deep line extends to window bounds when milestones occur outside visible time window

**Selection Support:**
- **Change selection**: Select entire change (row-level selection)
- **Milestone selection**: Select specific milestone at intersection points
- Both selection types trigger details panel refresh

### Right Panel - Details Panel
**Content Display:**
- **Selected change information**: Shows change details (from direct change selection OR owner of selected milestone)
- **Milestone list**: Complete list of milestones for the displayed change
- **Selection emphasis**: When milestone is selected, highlight it within the milestone list
- **Context switching**: Automatically adapts content based on selection type

## Event Visualization

### Pixmap Approach
**3x3 pixel grid for milestone event types:**
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

**Properties:**
- Fixed footprint regardless of event count
- Column semantics: [API][UI][Service] domains
- Scalable visual representation
- Milestone constraint: Maximum one milestone per change per wave

### Timeline Continuity
- **Simple connectors**: Basic lines linking milestone pixmaps
- **Boundary extension**: Connectors extend to time window edges when milestones fall outside
- **Visual continuity**: Clear deployment progression visualization

## Implementation Status

### ✅ COMPLETED Components

**Timeline Grid Component** (`timeline-grid.js`)
- ✅ Basic timeline rendering with horizontal change rows
- ✅ Wave vertical lines with proper positioning across timeline
- ✅ Pixmap milestone visualization (basic 3x3 grid)
- ✅ Dual selection support (change/milestone selection)
- ✅ Time window management with 3-year default
- ✅ Data integration from CollectionEntity
- ✅ Selection event callbacks
- ✅ Empty state handling

**Integration Layer**
- ✅ AbstractInteractionActivity perspective switching
- ✅ ChangesEntity temporal view integration
- ✅ Data synchronization with existing collection
- ✅ Filter coordination between collection and timeline
- ✅ CSS styling integrated into components.css

### 🔧 IN PROGRESS Fixes
- ✅ **FIXED**: CSS positioning (moved temporal styles outside media queries)
- ✅ **FIXED**: Wave positioning in timeline header (added proper positioning logic)

## Interaction Flow

### Primary Workflow
1. **Change filtering** (existing filters above) → reduces timeline grid content
2. **Time window adjustment** (temporal perspective specific control) → changes timeline scope
3. **Milestone filtering** (temporal perspective specific control) → affects pixmap visibility
4. **Selection interaction** (center panel) → updates details panel
5. **Details exploration** (right panel) → examine change/milestone information

### Selection Coordination
- **Change selection** → Details panel shows change info + all its milestones
- **Milestone selection** → Details panel shows owning change info + milestone list with selection emphasized
- **Context preservation**: Selection state maintained during time window/filter changes

## Technical Implementation

### Component Hierarchy
```
ChangeTemporalView (parent)
├── TimelineGridComponent (center) ✅ IMPLEMENTED
│   ├── WaveLines ✅ IMPLEMENTED
│   ├── ChangeRows ✅ IMPLEMENTED
│   ├── PixmapIntersections ✅ BASIC IMPLEMENTATION
│   └── ContinuityConnectors ⚠️ BASIC IMPLEMENTATION
└── DetailsPanel (right) ✅ REUSES EXISTING FORM

### Selection State Management
```javascript
const [selectedChange, setSelectedChange] = useState(null);
const [selectedMilestone, setSelectedMilestone] = useState(null);
const [timeWindow, setTimeWindow] = useState({ start, end });
const [milestoneFilters, setMilestoneFilters] = useState(['ANY']);

// Selection coordination ✅ IMPLEMENTED
const handleChangeSelection = (change) => {
  setSelectedChange(change);
  setSelectedMilestone(null);
};

const handleMilestoneSelection = (milestone) => {
  setSelectedMilestone(milestone);
  setSelectedChange(milestone.change);
};
```

## Technical Constraints

### Data Architecture
- **Wave data**: Pre-cached, regular but not fixed rhythm ✅ INTEGRATED
- **Milestone constraint**: Maximum one milestone per change per wave ✅ HANDLED
- **Filter integration**: Leverages existing change filtering system ✅ IMPLEMENTED
- **Timeline bounds**: User-selectable time window with navigation ✅ IMPLEMENTED

### Performance Considerations
- **Responsive design**: Mobile-friendly layout with collapsible panels ✅ IMPLEMENTED
- **Data efficiency**: Reuses existing collection data without duplication ✅ IMPLEMENTED
- **Event handling**: Optimized selection and interaction patterns ✅ IMPLEMENTED

## Next Development Priorities

### 🔄 IMMEDIATE (Phase 2)
1. **Enhanced Pixmap Rendering**: Improve column semantics (API/UI/Service) with proper visual coding
2. **Milestone Filtering Implementation**: Connect milestone filters to actual timeline rendering
3. **Connector Line Enhancement**: Improve visual continuity between milestones
4. **Details Panel Integration**: Enhanced milestone emphasis in details view

### ⚡ MEDIUM-TERM (Phase 3)
1. **Timeline Policy Implementation**: Support for multiple timeline arrangements
2. **Advanced Interactions**: Drag-and-drop milestone management
3. **Performance Optimization**: Handle large datasets efficiently
4. **Accessibility**: Keyboard navigation and screen reader support

### 🔮 FUTURE (Phase 4)
1. **Change Dependencies**: Visual dependency relationships
2. **Timeline Export**: PDF/image export capabilities
3. **Real-time Updates**: Live collaboration features
4. **Advanced Analytics**: Timeline metrics and insights

---

*Current implementation provides a functional temporal view foundation with basic timeline visualization, working perspective switching, and proper component integration. Ready for enhanced feature development.*