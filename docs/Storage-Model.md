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
- `HAS_ATTACHMENT -> Document`

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
- `HAS_ATTACHMENT -> Document`

### 2.2 Data
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> Data`
- `HAS_ATTACHMENT -> Document`

### 2.3 Service
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> Service`
- `HAS_ATTACHMENT -> Document`

### 2.4 RegulatoryAspect
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> RegulatoryAspect`
- `HAS_ATTACHMENT -> Document`

### 2.5 Wave
**Properties:**
- `year`: YYYY
- `quarter`: a digit between 1 and 4
- `date`: YYYY/MM/DD
- `name (derived)`: year.quarter

**Relationships:**
- `HAS_ATTACHMENT -> Document`

## 3. Folder Management

The node types related to the organisation of the operational needs and requirements. As a simplification, we propose to not version these data.

### 3.1 Folder
**Properties:**
- `name`
- `description`

**Relationships:**
- `HAS_PARENT -> Folder`
- `HAS_ATTACHMENT -> Document`

## 4. Operational Deployment Plan Items

The node types required to the management of operational needs, requirements, and changes.

### 4.1 OperationalRequirement(Version): Item(Version)
**Version properties:**
- `type`: ON (Operational Need) or OR (Operational Requirement)
- `statement`: a rich text
- `rationale`: a rich text
- `references`: a rich text
- `risksAndOpportunities`: a rich text
- `flows`: a rich text
- `flowExamples`: a rich text
- `drg`: Drafting Group enum (4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NM_B2B, NMUI, PERF, RRT, TCF)

**Item relationships:**
- `IS_LOCATED_IN -> Folder`

**Item version relationships:**
- `REFINES -> OperationalRequirement` (to Item, not ItemVersion)
- `IMPACTS -> RegulatoryAspect`
- `IMPACTS -> StakeholderCategory`
- `IMPACTS -> Data`
- `IMPACTS -> Service`
- `IMPLEMENTED_BY -> OperationalRequirement` (to Item, not ItemVersion - ON type requirements only, references to OR type requirements)

### 4.2 OperationalChange(Version): Item(Version)
**Version properties:**
- `purpose`: a rich text (renamed from description)
- `initialState`: a rich text (multiline)
- `finalState`: a rich text (multiline)
- `details`: a rich text (multiline)
- `visibility`: NM or NETWORK
- `drg`: Drafting Group enum (4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NM_B2B, NMUI, PERF, RRT, TCF)

**Item relationships:**
- `IS_LOCATED_IN -> Folder`

**Item version relationships:**
- `SATISFIES -> OperationalRequirement` (to Item, not ItemVersion)
- `SUPERSEDS -> OperationalRequirement` (to Item, not ItemVersion)

### 4.3 OperationalChangeMilestone
**Properties:**
- `milestoneKey`: stable UUID identifier preserved across versions
- `eventType`: one of API_PUBLICATION, API_TEST_DEPLOYMENT, UI_TEST_DEPLOYMENT, OPS_DEPLOYMENT, API_DECOMMISSIONING (5 specific milestone events only)
- `title`: a short humanly readable unique identifier
- `description`: a rich text
- `status`: completion status (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED)
- `targetDate`: planned completion date
- `actualDate`: actual completion date (optional)

**Relationships:**
- `BELONGS_TO -> OperationalChangeVersion` (to ItemVersion)
- `TARGETS -> Wave`
- `HAS_ATTACHMENT -> Document`

## 5. Operational Deployment Plan Management

The node types and relationships required to the management of operational plan baselines management.

### 5.1 Baseline
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

### 5.2 ODPEdition
**Properties:**
- `createdAt`: the ODP Edition creation datetime
- `createdBy`: the ODP Edition creator
- `title`: a short humanly readable unique identifier
- `type`: ALPHA, BETA, RELEASE

**Relationships:**
- `STARTS_FROM -> Wave`
- `EXPOSES -> Baseline`
- `HAS_ATTACHMENT -> Document`

**Usage Pattern:**
- ODPEdition references a baseline and specifies a starting wave
- ODPEdition provides filtered views of baseline content based on the STARTS_FROM wave
- Only OperationalChanges with milestones at/after the wave are included
- Only OperationalRequirements referenced by those filtered changes (via SATISFIES/SUPERSEDS) are included
- Acts as a "saved query" for specific baseline + wave combinations
- Used as reference for review processes and deployment planning

## 6. Digital Asset Management

The node types and relationships required to the management of digital assets.

### 6.1 Document
**Properties:**
- `name`: filename
- `description`: optional description
- `mimeType`: content type (PDF, DOCX, etc.)
- `size`: file size in bytes
- `uploadedAt`: timestamp
- `uploadedBy`
- `path`: storage path or identifier

**Relationships:**
None - Documents are referenced by other entities via `HAS_ATTACHMENT` relationships.

## 7. Review Management

The node types required to the management of user reviews.

### 7.1 Comment
**Properties:**
- `postedAt`: the time stamp of the comment post
- `postedBy`: the author of the comment
- `field`: the optional commented item field
- `text`: the text of the comment

**Relationships:**
- `HAS_ATTACHMENT -> Document`
- `COMMENTS_ON -> Baseline`

## 8. Enumeration Values

### 8.1 Drafting Group (DRG)
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

### 8.2 Milestone Event Types
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

### New Relationship Types
- `IMPLEMENTED_BY`: Links ON-type OperationalRequirements to OR-type OperationalRequirements that implement them
- Enhanced relationship validation ensures `implementedONs` references are valid and type-appropriate

### Field Evolution
- OperationalChange: `description` field renamed to `purpose` for clarity
- Added rich text fields: `initialState`, `finalState`, `details` for better change documentation
- Added `drg` enum to both OR and OC for organizational categorization