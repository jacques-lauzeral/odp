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

### 2.1 StakeholderCategories
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> StakeholderCategories`
- `HAS_ATTACHMENT -> Document`

### 2.2 Data
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> Data`
- `HAS_ATTACHMENT -> Document`

### 2.3 Services
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> Services`
- `HAS_ATTACHMENT -> Document`

### 2.4 RegulatoryAspects
**Properties:**
- `name`
- `description`

**Relationships:**
- `REFINES -> RegulatoryAspects`
- `HAS_ATTACHMENT -> Document`

### 2.5 Waves
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
- `flow examples`: a rich text

**Item relationships:**
- `IS_LOCATED_IN -> Folder`

**Item version relationships:**
- `REFINES -> OperationalRequirement` (to Item, not ItemVersion)
- `IMPACTS -> RegulatoryAspects`
- `IMPACTS -> StakeholderCategories`
- `IMPACTS -> Data`
- `IMPACTS -> Services`

### 4.2 OperationalChange(Version): Item(Version)
**Version properties:**
- `description`: a rich text
- `visibility`: NM or NETWORK

**Item relationships:**
- `IS_LOCATED_IN -> Folder`

**Item version relationships:**
- `SATISFIES -> OperationalRequirement` (to Item, not ItemVersion)
- `SUPERSEDS -> OperationalRequirement` (to Item, not ItemVersion)

### 4.3 OperationalChangeMilestone
**Properties:**
- `title`: a short humanly readable unique identifier
- `description`: a rich text
- `eventTypes`: one or more of API_PUBLICATION, API_TEST_DEPLOYMENT, UI_TEST_DEPLOYMENT, SERVICE_ACTIVATION, etc. (to be completed)

**Relationships:**
- `BELONGS_TO -> OperationalChangeVersion` (to ItemVersion)
- `TARGETS -> Waves`
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
- `type`: DRAFT or OFFICIAL

**Relationships:**
- `STARTS_FROM -> Waves`
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

## Design Notes

### Versioning Strategy
The system implements a sequential versioning pattern using root nodes (Item) + version nodes (ItemVersion) for content, combined with relationship audit trails for relationship history. This approach provides:
- Content versioning through ItemVersion creation (field changes)
- Version increment when item data or item relations are updated
- Historical consistency through baseline snapshots
- Concurrency control via optimistic locking (first commit wins)

### Relationship Patterns
- **Cross-domain relationships**: Point from ItemVersion to Item (e.g., requirement REFINES requirement Item)
- **Hierarchical relationships**: Use `REFINES` for same-type hierarchies within setup entities
- **Attachment relationships**: Centralized through `HAS_ATTACHMENT -> Document`
- **Audit trail**: All relationship changes logged with timestamp and user context

### Transaction Boundaries
- **Field updates**: Create new ItemVersion in single transaction (content versioning)
- **Relationship changes**: Create/delete relationships + audit log in single transaction (relationship audit)
- **Baseline creation**: Capture all current state in single transaction (snapshot consistency)

### Historical Reconstruction
- **Content at time T**: Use specific ItemVersion created before or at time T
- **Relationships at time T**: Apply audit trail chronologically up to time T
- **Baseline state**: Use HAS_ITEMS relationships to retrieve exact versions captured at baseline time

### Simplified Baseline Design
The baseline system uses a simplified approach:
- **Direct relationships**: Baseline connects directly to ItemVersion nodes via HAS_ITEMS
- **No intermediate nodes**: Eliminates BaselineItem complexity
- **Atomic snapshots**: Single transaction captures all latest versions at creation time
- **Simple queries**: Direct traversal from baseline to captured versions

### ODPEdition Design
The ODPEdition system provides filtered views of baselines:
- **Waves-based filtering**: Uses STARTS_FROM wave to filter operational content
- **Cascade filtering**: OCs filtered by milestone timing, ORs filtered by OC references
- **Saved query pattern**: ODPEdition acts as bookmark for baseline + wave combinations
- **Immutable references**: ODPEdition preserves specific baseline + wave combination

### Prototype Considerations
- Presence constraints are not specified for this prototype phase
- Setup Management entities are not versioned for simplicity
- Folder Management entities are not versioned for simplicity