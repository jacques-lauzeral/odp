# Storage Model

## Overview
This document defines the complete storage model for the Operational Deployment Plan management system. The model uses Neo4j graph database with a versioning pattern that supports both live relationship evolution and historical consistency through relationship audit trails.

## 1. Versioning Pattern

The abstract node types and relationships that support the versioning.

### 1.1 Item (abstract)
**Properties:**
- `createdAt`: item creation timestamp
- `createdBy`: item creator
- `title`: the humanly readable item title

**Relationships:**
- `LATEST_VERSION -> ItemVersion`

### 1.2 ItemVersion (abstract)
**Properties:**
- `createdAt`: item version creation timestamp
- `createdBy`: item version creator
- `version`: the sequential version number

**Relationships:**
- `VERSION_OF -> Item`

## 2. Setup Management

The node types and relationships related to the global application data. As a simplification, we propose to not version these data.

### 2.1 StakeholderCategory
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> StakeholderCategory`

### 2.2 Data
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> Data`

### 2.3 Service
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> Service`

### 2.4 Document
**Properties:**
- `name`: document name (mandatory)
- `version`: optional version string
- `description`: optional description text
- `url`: optional URL (link to external document)

**Relationships:**
None - Documents are directly referenced via REFERENCES relationships from operational entity versions

### 2.5 Wave
**Properties:**
- `year`: YYYY
- `quarter`: a digit between 1 and 4
- `date`: YYYY/MM/DD
- `name (derived)`: year.quarter

**Relationships:**
None

## 3. Operational Deployment Plan Items

The node types required to the management of operational needs, requirements, and changes.

### 3.1 OperationalRequirement(Version): Item(Version)
**Version properties:**
- `type`: ON (Operational Need) or OR (Operational Requirement)
- `statement`: a rich text
- `rationale`: a rich text
- `flows`: a rich text
- `privateNotes`: a rich text
- `path`: array of strings (folder path hierarchy)
- `drg`: Drafting Group enum (4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NM_B2B, NMUI, PERF, RRT, TCF)

**Item relationships:**
None - path field provides hierarchy information

**Item version relationships:**
- `REFINES -> OperationalRequirement` (to Item, not ItemVersion)
- `IMPACTS -> StakeholderCategory`
- `IMPACTS -> Data`
- `IMPACTS -> Service`
- `IMPLEMENTED_BY -> OperationalRequirement` (to Item, not ItemVersion - ON type requirements only, references to OR type requirements)
- `REFERENCES {note} -> Document` (relationship carries optional note property for context like section numbers)
- `DEPENDS_ON -> OperationalRequirementVersion` (to ItemVersion, not Item - version-to-version dependencies)

### 3.2 OperationalChange(Version): Item(Version)
**Version properties:**
- `purpose`: a rich text (renamed from description)
- `initialState`: a rich text (multiline)
- `finalState`: a rich text (multiline)
- `details`: a rich text (multiline)
- `privateNotes`: a rich text
- `path`: array of strings (folder path hierarchy)
- `visibility`: NM or NETWORK
- `drg`: Drafting Group enum (4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NM_B2B, NMUI, PERF, RRT, TCF)

**Item relationships:**
None - path field provides hierarchy information

**Item version relationships:**
- `SATISFIES -> OperationalRequirement` (to Item, not ItemVersion)
- `SUPERSEDS -> OperationalRequirement` (to Item, not ItemVersion)
- `REFERENCES {note} -> Document` (relationship carries optional note property for context like section numbers)
- `DEPENDS_ON -> OperationalChangeVersion` (to ItemVersion, not Item - version-to-version dependencies)

### 3.3 OperationalChangeMilestone
**Properties:**
- `milestoneKey`: stable UUID identifier preserved across versions
- `eventType`: one of API_PUBLICATION, API_TEST_DEPLOYMENT, UI_TEST_DEPLOYMENT, OPS_DEPLOYMENT, API_DECOMMISSIONING (5 specific milestone events only)
- `title`: a short humanly readable unique identifier
- `description`: a rich text
- `targetDate`: planned completion date
- `actualDate`: actual completion date (optional)

**Relationships:**
- `BELONGS_TO -> OperationalChangeVersion` (to ItemVersion)
- `TARGETS -> Wave`

## 4. Operational Deployment Plan Management

The node types and relationships required to the management of operational plan baselines management.

### 4.1 Baseline
**Properties:**
- `createdAt`: the baseline creation datetime
- `createdBy`: the baseline creator
- `title`: a short humanly readable unique identifier

**Relationships:**
- `HAS_ITEMS -> OperationalRequirementVersion`
- `HAS_ITEMS -> OperationalChangeVersion`

**Usage Pattern:**
- Baseline creation captures snapshot of all LATEST_VERSION relationships at creation time
- HAS_ITEMS relationships point directly to specific ItemVersion nodes that were latest at baseline time
- Historical navigation uses HAS_ITEMS for accurate reconstruction of system state at baseline time

### 4.2 ODPEdition
**Properties:**
- `createdAt`: the ODP Edition creation datetime
- `createdBy`: the ODP Edition creator
- `title`: a short humanly readable unique identifier
- `type`: ALPHA, BETA, RELEASE

**Relationships:**
- `STARTS_FROM -> Wave`
- `EXPOSES -> Baseline`

**Usage Pattern:**
- ODPEdition references a baseline and specifies a starting wave
- ODPEdition provides filtered views of baseline content based on the STARTS_FROM wave
- Only OperationalChanges with milestones at/after the wave are included
- Only OperationalRequirements referenced by those filtered changes (via SATISFIES/SUPERSEDS) are included
- Acts as a "saved query" for specific baseline + wave combinations
- Used as reference for review processes and deployment planning

## 5. Review Management

The node types required to the management of user reviews.

### 5.1 Comment
**Properties:**
- `postedAt`: the time stamp of the comment post
- `postedBy`: the author of the comment
- `field`: the optional commented item field
- `text`: the text of the comment

**Relationships:**
- `COMMENTS_ON -> Baseline`

## 6. Enumeration Values

### 6.1 Drafting Group (DRG)
Common enum for OperationalRequirement and OperationalChange entities:

| Value | Display |
|-------|---------|
| 4DT | 4D-Trajectory |
| AIRPORT | Airport |
| ASM_ATFCM | ASM / ATFCM Integration |
| CRISIS_FAAS | Crisis and FAAS |
| FLOW | Flow |
| IDL | iDL |
| NM_B2B | NM B2B |
| NMUI | NMUI |
| PERF | Performance |
| RRT | Rerouting |
| TCF | TCF |

### 6.2 Milestone Event Types
Specific milestone events for OperationalChange entities (replaces previous flexible milestone system):

| Value | Description |
|-------|-------------|
| API_PUBLICATION | API Publication milestone |
| API_TEST_DEPLOYMENT | API Test Deployment milestone |
| UI_TEST_DEPLOYMENT | UI Test Deployment milestone |
| OPS_DEPLOYMENT | Operations Deployment milestone |
| API_DECOMMISSIONING | API Decommissioning milestone |

## Design Notes

### Versioning Strategy
The system implements a sequential versioning pattern using root nodes (Item) + version nodes (ItemVersion) for content, combined with relationship audit trails for relationship history.

### Milestone System Evolution
The milestone system has been replaced with a specific set of 5 milestone events. These events are independent (no sequencing/dependencies) and support standard project lifecycle phases from API publication through decommissioning.

### Relationship Types Evolution
- **Removed**: `IMPACTS -> RegulatoryAspect` (RegulatoryAspect entity deprecated)
- **Added**: `REFERENCES {note} -> Document` on both OperationalRequirement and OperationalChange versions (direct edge with optional note property)
- **Added**: `DEPENDS_ON -> OperationalRequirementVersion` for OR version dependencies (version-to-version)
- **Added**: `DEPENDS_ON -> OperationalChangeVersion` for OC version dependencies (version-to-version)
- **Existing**: `IMPLEMENTED_BY` links ON-type OperationalRequirements to OR-type OperationalRequirements that implement them

### Field Evolution
- **OperationalRequirement**:
    - Removed: `references`, `flowExamples`, `risksAndOpportunities` (rich text fields)
    - Added: `privateNotes` (rich text field for internal notes)
    - Added: `path` (array of strings for folder hierarchy navigation)
    - Retained: `statement`, `rationale`, `flows`, `drg`

- **OperationalChange**:
    - Renamed: `description` → `purpose` for clarity
    - Added: `initialState`, `finalState`, `details` (rich text fields for better change documentation)
    - Added: `privateNotes` (rich text field for internal notes)
    - Added: `path` (array of strings for folder hierarchy navigation)
    - Retained: `visibility`, `drg`

### Document Reference System
The new direct REFERENCES relationship replaces the previous `references` rich text field with a structured approach:
- Direct relationship from version nodes to Document entities (ConOPS, regulations, strategic plans, etc.)
- Optional `note` property on the relationship provides brief context (e.g., section numbers, brief annotations)
- Note is simple text, not rich text - designed for short references like "Section 3.2" or "Annex A"
- Enables better traceability and document management
- Both OperationalRequirement and OperationalChange versions can reference documents

### Dependency Management
The new `DEPENDS_ON` relationship enables formal declaration of dependencies between versions:
- OperationalRequirementVersion can depend on other OperationalRequirementVersions
- OperationalChangeVersion can depend on other OperationalChangeVersions
- Dependencies are version-to-version (not Item-to-Item), capturing the specific version dependency
- Dependencies are validated at service level (warning/prevention of conflicting OC definitions)
- Supports better deployment planning and sequencing