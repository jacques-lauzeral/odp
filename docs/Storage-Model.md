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
- `flow examples`: a rich text

**Item relationships:**
- `IS_LOCATED_IN -> Folder`

**Item version relationships:**
- `REFINES -> OperationalRequirement` (to Item, not ItemVersion)
- `IMPACTS -> RegulatoryAspect`
- `IMPACTS -> StakeholderCategory`
- `IMPACTS -> Data`
- `IMPACTS -> Service`

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
- `TARGETS -> Wave`
- `HAS_ATTACHMENT -> Document`

## 5. Relationship Audit Trail System

The node types and relationships required for tracking relationship changes over time.

### 5.1 RelationshipAuditLog
**Properties:**
- `timestamp`: when the relationship change occurred (ISO 8601)
- `userId`: who made the change
- `action`: ADD or REMOVE
- `relationshipType`: REFINES, IMPACTS, SATISFIES, SUPERSEDS
- `sourceType`: the source node type (e.g., "OperationalRequirementVersion")
- `sourceId`: the source node Neo4j ID
- `targetType`: the target node type (e.g., "OperationalRequirement", "StakeholderCategory")
- `targetId`: the target node Neo4j ID

**Relationships:**
- `LOGGED_FOR -> ItemVersion` (the version that initiated the change)
- `AFFECTS -> Item` (the target item affected by the change)

**Usage Pattern:**
- Field updates create new ItemVersion (content versioning)
- Relationship changes create RelationshipAuditLog entries (relationship versioning)
- Historical reconstruction combines ItemVersion content + relationship audit trail

## 6. Operational Deployment Plan Management

The node types and relationships required to the management of operational plan baselines management.

### 6.1 ODPBaseline
**Properties:**
- `createdAt`: the baseline creation datetime
- `createdBy`: the baseline creator
- `title`: a short humanly readable unique identifier

**Relationships:**
- `STARTS_FROM -> Wave`

### 6.2 ODPBaselineItem
**Properties:**
- `type`: ON (Operational Need), OR (Operational Requirement), or OC (Operational Change)
- `itemTitle`: the title of the baseline item (at baseline creation time)
- `itemVersion`: the version of the item (latest version at baseline creation time)
- `itemId`: the Item node ID for reference
- `versionId`: the ItemVersion node ID for exact reference

**Relationships:**
- `BELONGS_TO -> ODPBaseline`

### 6.3 BaselineRelationship
**Properties:**
- `type`: REFINES, IMPACTS, SATISFIES, SUPERSEDS
- `sourceItemId`: source Item node ID
- `sourceVersionId`: source ItemVersion node ID (the version active at baseline time)
- `targetType`: target node type
- `targetId`: target node ID

**Relationships:**
- `BELONGS_TO -> ODPBaseline`

**Usage Pattern:**
- Baseline creation captures snapshot of all LATEST_VERSION relationships
- BaselineRelationship nodes preserve exact relationship state at baseline time
- Historical navigation uses BaselineRelationship for accurate reconstruction

### 6.4 ODPEdition
**Properties:**
- `createdAt`: the ODP Edition creation datetime
- `createdBy`: the ODP Edition creator
- `title`: a short humanly readable unique identifier
- `type`: DRAFT or OFFICIAL

**Relationships:**
- `EXPOSES -> ODPBaseline`
- `HAS_ATTACHMENT -> Document`

## 7. Digital Asset Management

The node types and relationships required to the management of digital assets.

### 7.1 Document
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

## 8. Review Management

The node types required to the management of user reviews.

### 8.1 Comment
**Properties:**
- `postedAt`: the time stamp of the comment post
- `postedBy`: the author of the comment
- `field`: the optional commented item field
- `text`: the text of the comment

**Relationships:**
- `HAS_ATTACHMENT -> Document`
- `COMMENTS_ON -> ODPBaselineItem`

## Design Notes

### Versioning Strategy
The system implements a sequential versioning pattern using root nodes (Item) + version nodes (ItemVersion) for content, combined with relationship audit trails for relationship history. This approach provides:
- Content versioning through ItemVersion creation (field changes)
- Relationship versioning through RelationshipAuditLog entries (relationship changes)
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
- **Baseline state**: Use captured BaselineRelationship nodes for exact historical state

### Prototype Considerations
- Presence constraints are not specified for this prototype phase
- Setup Management entities are not versioned for simplicity
- Folder Management entities are not versioned for simplicity
- Relationship audit trail provides complete change history without version number inflation