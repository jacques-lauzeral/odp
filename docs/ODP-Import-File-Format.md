# ODP Import File Format Specification

## Overview
This document defines the YAML file formats for importing data into the ODP system.

**Last Updated:** Phase 19 - Document References & Dependencies Model

---

## Setup Entities Format

### File Structure
```yaml
stakeholderCategories:
  - externalId: "unique-identifier"
    name: "Category Name"
    description: "Category description"
    parentExternalId: "parent-identifier"  # Optional, for hierarchical relationships

dataCategories:
  - externalId: "unique-identifier"
    name: "Data Category Name"
    description: "Data category description"
    parentExternalId: "parent-identifier"  # Optional

services:
  - externalId: "unique-identifier"
    name: "Service Name"
    description: "Service description"
    visibility: "NM"  # or "NETWORK"
    parentExternalId: "parent-identifier"  # Optional

documents:
  - externalId: "unique-identifier"
    name: "Document Name"
    version: "1.0"  # Optional
    description: "Document description"  # Optional
    url: "https://example.com/doc.pdf"  # Optional

waves:
  - externalId: "unique-identifier"
    name: "2027.2"
    year: 2027
    quarter: 2
    date: "2027-06-30"
```

### Field Descriptions
- **externalId**: Unique business identifier for reference resolution
- **name**: Display name of the entity (for waves: "year.quarter" format, e.g., "2027.2")
- **description**: Detailed description (not applicable for waves)
- **parentExternalId**: References parent entity for hierarchical structures
- **visibility**: Service-specific field (NM or NETWORK)
- **version**: Document version string (optional)
- **url**: Document URL/location (optional)
- **year**: Wave year (4-digit integer)
- **quarter**: Wave quarter (1-4)
- **date**: Wave date in ISO format (YYYY-MM-DD)

---

## Operational Requirements Format

### File Structure
```yaml
requirements:
  - externalId: "Business/Identifier/Path"
    title: "Requirement Title"
    type: "ON"  # or "OR"
    drg: "NM_B2B"  # DraftingGroup enum
    statement: "Primary requirement statement"
    rationale: "Reasoning behind the requirement"
    flows: "Process flow descriptions"
    privateNotes: "Internal notes not for publication"  # Optional
    path: ["Section 1", "Subsection 1.1", "Detail 1.1.1"]  # Optional organizational hierarchy
    parentExternalId: "Parent/Requirement/Path"  # Optional, for REFINES hierarchy
    implementedONs: ["ON/Path/1", "ON/Path/2"]   # OR-type only, empty for ON-type
    impactedStakeholderCategories: ["StakeholderRef1"]
    impactedServices: ["ServiceRef1"]
    impactedDataCategories: ["DataRef1"]
    referencesDocuments:  # Optional
      - documentExternalId: "Doc-001"
        note: "Section 3.2"  # Optional reference note
      - documentExternalId: "Doc-002"
        note: "Appendix A"
    dependsOnRequirements: ["Requirement/Path/1", "Requirement/Path/2"]  # Optional
```

### Field Descriptions
- **externalId**: Unique business identifier
- **title**: Requirement title
- **type**: "ON" (Operational Need) or "OR" (Operational Requirement)
- **drg**: Drafting group identifier (enum: NM_B2B, NM_FLIGHT_DATA, etc.)
- **statement**: Core requirement statement (rich text)
- **rationale**: Business justification (rich text)
- **flows**: Process flow descriptions (rich text)
- **privateNotes**: Internal notes not included in published editions (rich text, optional)
- **path**: Organizational hierarchy path as array of strings (optional)
- **parentExternalId**: Parent requirement for hierarchical REFINES relationship
- **implementedONs**: ON-type requirements implemented by this OR (OR-type only)
- **impactedStakeholderCategories**: External IDs of affected stakeholder categories
- **impactedServices**: External IDs of affected services
- **impactedDataCategories**: External IDs of affected data categories
- **referencesDocuments**: Array of document references with optional notes
- **dependsOnRequirements**: External IDs of requirements this one depends on

### Constraints
- ON-type requirements must have empty `implementedONs: []`
- OR-type requirements may reference multiple ONs in `implementedONs`
- All impact arrays reference setup entities by their external IDs
- Document references are resolved by external ID during import
- Dependency references are resolved by external ID (version-to-item pattern)
- Circular dependencies are detected and reported as errors

### Example
```yaml
requirements:
  - externalId: "NM-B2B/Flight-Planning/Route-Validation"
    title: "Route Validation for Flight Plans"
    type: "OR"
    drg: "NM_B2B"
    statement: "The system shall validate flight plan routes against airspace constraints"
    rationale: "Ensure flight safety and regulatory compliance"
    flows: "1. Receive flight plan\n2. Validate route\n3. Return validation result"
    privateNotes: "Consider performance optimization for high-volume periods"
    path: ["Flight Planning", "Route Management", "Validation"]
    parentExternalId: "NM-B2B/Flight-Planning"
    implementedONs: ["NM-B2B/Flight-Planning/Safety-Requirements"]
    impactedStakeholderCategories: ["ANSP", "Airlines"]
    impactedServices: ["Flight-Plan-Service"]
    impactedDataCategories: ["Route-Data"]
    referencesDocuments:
      - documentExternalId: "ICAO-Doc-4444"
        note: "Chapter 4, Section 4.3"
      - documentExternalId: "EUROCONTROL-Spec-001"
    dependsOnRequirements: ["NM-B2B/Airspace/Data-Model"]
```

---

## Operational Changes Format

### File Structure
```yaml
changes:
  - externalId: "unique-change-identifier"
    title: "Change Title"
    purpose: "Business purpose and rationale for the change"
    visibility: "NETWORK"  # Optional: "NM" or "NETWORK", defaults to "NETWORK"
    drg: "NM_B2B"  # DraftingGroup enum
    initialState: "Description of the current/initial state before the change"
    finalState: "Description of the target/final state after the change"
    details: "Comprehensive details about the change implementation"
    privateNotes: "Internal notes not for publication"  # Optional
    path: ["Section 1", "Subsection 1.1"]  # Optional organizational hierarchy
    satisfiedORs: ["OR-External-Id-1", "OR-External-Id-2"]
    supersededORs: ["OR-External-Id-3"]  # Optional, usually empty
    referencesDocuments:  # Optional
      - documentExternalId: "Doc-001"
        note: "Implementation guide, Section 5"
    dependsOnChanges: ["Change-External-Id-1"]  # Optional
    milestones:
      - eventType: "OPS_DEPLOYMENT"  # Single event type per milestone
        wave: "2027-Q2"  # External ID of the wave
```

### Field Descriptions

#### Core Fields
- **externalId**: Unique business identifier for the change
- **title**: Descriptive title of the operational change
- **purpose**: Explanation of why the change is needed (rich text)
- **visibility**: Scope visibility - "NM" or "NETWORK" (defaults to "NETWORK")
- **drg**: Drafting group identifier (enum: NM_B2B, NM_FLIGHT_DATA, etc.)
- **initialState**: Description of the system/process before the change (rich text)
- **finalState**: Description of the system/process after the change (rich text)
- **details**: Comprehensive implementation details (rich text)
- **privateNotes**: Internal notes not included in published editions (rich text, optional)
- **path**: Organizational hierarchy path as array of strings (optional)

#### Relationship Fields
- **satisfiedORs**: External IDs of Operational Requirements satisfied by this change
- **supersededORs**: External IDs of Operational Requirements superseded by this change
- **referencesDocuments**: Array of document references with optional notes
- **dependsOnChanges**: External IDs of changes this one depends on (optional)

#### Milestone Fields
- **eventType**: Type of milestone event (single value):
  - `API_PUBLICATION` - API specification published
  - `API_TEST_DEPLOYMENT` - API deployed to test environment
  - `UI_TEST_DEPLOYMENT` - UI deployed to test environment
  - `OPS_DEPLOYMENT` - Production deployment
  - `API_DECOMMISSIONING` - API retirement
- **wave**: External ID of the deployment wave

### Constraints
- No `parentExternalId` field (changes don't support REFINES relationships)
- Milestone keys are automatically generated during import (not specified in file)
- Each milestone has a single `eventType` (not an array)
- Impact references are derived from satisfied/superseded requirements
- Document references are resolved by external ID during import
- Dependency references are resolved by external ID (version-to-item pattern)
- Circular dependencies are detected and reported as errors

### Example
```yaml
changes:
  - externalId: "RR-OC-1-1"
    title: "RR Tools - Rerouting calculation improvements"
    purpose: "Empower the system to compute more meaningful, context-sensitive routing options"
    visibility: "NETWORK"
    drg: "NM_REROUTING"
    initialState: "Current routing engine uses limited sources and lacks dynamic recalculation"
    finalState: "Enhanced routing engine with multiple sources, dynamic updates, and context awareness"
    details: "This OC aims to improve the rerouting engine (algorithm and sources). The improvements focus on delivering RR alternatives that are not only technically valid but also operationally sound."
    privateNotes: "Coordinate with performance team for load testing in Q1"
    path: ["Rerouting Tools", "Core Engine", "Algorithm Improvements"]
    satisfiedORs: ["RR-OR-1-01", "RR-OR-1-01a", "RR-OR-1-07", "RR-OR-1-13"]
    supersededORs: []
    referencesDocuments:
      - documentExternalId: "RR-Design-Spec-v2"
        note: "Section 3: Algorithm Design"
      - documentExternalId: "Performance-Requirements"
    dependsOnChanges: ["RR-OC-1-0"]
    milestones:
      - eventType: "API_TEST_DEPLOYMENT"
        wave: "2027-Q1"
      - eventType: "OPS_DEPLOYMENT"
        wave: "2027-Q2"
```

---

## Processing Notes

### External ID Resolution
- All references use external IDs which are resolved during import
- External IDs must be unique within each entity type
- References to non-existent external IDs will generate errors
- Document references are resolved to internal document IDs
- Dependency references are resolved to item IDs (version-to-item pattern)

### Hierarchical Dependencies
- Entities with `parentExternalId` are automatically ordered (parents before children)
- Circular dependencies in REFINES hierarchy are detected and reported as errors
- Circular dependencies in DEPENDS_ON relationships are detected and reported as errors

### Version Dependencies
- `dependsOnRequirements` and `dependsOnChanges` create DEPENDS_ON relationships
- Dependencies point to items, not specific versions (follow latest version pattern)
- Dependencies are used for deployment sequencing and impact analysis

### Rich Text Fields
- Fields marked as "rich text" accept plain text in import format
- Formatting can be added later through the user interface
- Rich text fields: `statement`, `rationale`, `flows`, `privateNotes` (OR)
- Rich text fields: `purpose`, `initialState`, `finalState`, `details`, `privateNotes` (OC)

### Document References
- Document references include the document's external ID and an optional note
- The note field is used to specify relevant sections (e.g., "Section 3.2", "Appendix A")
- Document references are stored as REFERENCES edges with note property

### Error Handling
- Import continues processing valid entities even when errors occur
- All errors are collected and reported at the end
- Each entity type is processed independently

---

## File Format Guidelines

1. **YAML Structure**: Files must be valid YAML with proper indentation
2. **External IDs**: Use stable, meaningful business identifiers
3. **References**: Ensure all referenced entities exist or are included in the import
4. **Arrays**: Empty arrays should be explicitly defined as `[]`
5. **Optional Fields**: Can be omitted or set to null/empty
6. **Text Fields**: All text fields accept UTF-8 encoded strings
7. **Path Arrays**: Path elements should reflect organizational structure (not for publication)
8. **Document References**: Include document external ID and optional note for each reference
9. **Dependencies**: List dependencies in deployment order when possible

---

## Phase 19 Changes Summary

### Removed Fields
- **Requirements**: `references`, `flowExamples`, `risksAndOpportunities`, `impactedRegulatoryAspects`
- **Changes**: `description` (renamed to `purpose`)
- **Milestones**: `status` field

### Added Fields
- **Requirements**: `privateNotes`, `path`, `referencesDocuments`, `dependsOnRequirements`
- **Changes**: `purpose` (renamed from `description`), `initialState`, `finalState`, `details`, `privateNotes`, `path`, `referencesDocuments`, `dependsOnChanges`
- **Setup**: `documents` entity type

### Updated Structures
- **Document References**: Now structured as objects with `documentExternalId` and optional `note`
- **Dependencies**: New relationship type for version-to-item dependencies
- **Milestones**: `eventType` is now a single value, not an array

---

*For implementation details, see Import Service documentation and API specifications.*