# ODP Import File Format Specification

## Overview
This document defines the YAML file formats for importing data into the ODP system.

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
    statement: "Primary requirement statement"
    rationale: "Reasoning behind the requirement"
    references: "External references (ConOPS, etc.)"
    flows: "Process flow descriptions"
    parentExternalId: "Parent/Requirement/Path"  # Optional, for REFINES hierarchy
    implementedONs: ["ON/Path/1", "ON/Path/2"]   # OR-type only, empty for ON-type
    impactedStakeholderCategories: ["StakeholderRef1"]
    impactedServices: ["ServiceRef1"]
    impactedDataCategories: ["DataRef1"]
```

### Field Descriptions
- **externalId**: Unique business identifier
- **title**: Requirement title
- **type**: "ON" (Operational Need) or "OR" (Operational Requirement)
- **statement**: Core requirement statement
- **rationale**: Business justification
- **references**: External documentation references
- **flows**: Process flow descriptions
- **parentExternalId**: Parent requirement for hierarchical REFINES relationship
- **implementedONs**: ON-type requirements implemented by this OR (OR-type only)
- **impactedStakeholderCategories**: External IDs of affected stakeholder categories
- **impactedServices**: External IDs of affected services
- **impactedDataCategories**: External IDs of affected data categories

### Constraints
- ON-type requirements must have empty `implementedONs: []`
- OR-type requirements may reference multiple ONs in `implementedONs`
- All impact arrays reference setup entities by their external IDs

---

## Operational Changes Format

### File Structure
```yaml
changes:
  - externalId: "unique-change-identifier"
    title: "Change Title"
    purpose: "Business purpose and rationale for the change"
    initialState: "Description of the current/initial state before the change"
    finalState: "Description of the target/final state after the change"
    details: "Comprehensive details about the change implementation"
    visibility: "NETWORK"  # Optional: "NM" or "NETWORK", defaults to "NETWORK"
    satisfiedORs: ["OR-External-Id-1", "OR-External-Id-2"]
    supersededORs: ["OR-External-Id-3"]  # Optional, usually empty
    milestones:
      - title: "Milestone Title"
        description: "Milestone description"  # Optional
        eventTypes: ["OPS_DEPLOYMENT"]
        wave: "2027-Q2"  # External ID of the wave
```

### Field Descriptions

#### Core Fields
- **externalId**: Unique business identifier for the change
- **title**: Descriptive title of the operational change
- **purpose**: Explanation of why the change is needed (rich text)
- **initialState**: Description of the system/process before the change (rich text)
- **finalState**: Description of the system/process after the change (rich text)
- **details**: Comprehensive implementation details (rich text)
- **visibility**: Scope visibility - "NM" or "NETWORK" (defaults to "NETWORK")

#### Relationship Fields
- **satisfiedORs**: External IDs of Operational Requirements satisfied by this change
- **supersededORs**: External IDs of Operational Requirements superseded by this change

#### Milestone Fields
- **title**: Milestone name
- **description**: Optional detailed description
- **eventTypes**: Types of milestone events:
    - `API_PUBLICATION`
    - `API_TEST_DEPLOYMENT`
    - `UI_TEST_DEPLOYMENT`
    - `OPS_DEPLOYMENT`
    - `API_DECOMMISSIONING`
- **wave**: External ID of the deployment wave

### Constraints
- No `parentExternalId` field (changes don't support REFINES relationships)
- Milestone keys are automatically generated during import (not specified in file)
- `eventTypes` is an array per milestone
- Impact references are derived from satisfied/superseded requirements

### Example
```yaml
changes:
  - externalId: "RR-OC-1-1"
    title: "RR Tools - Rerouting calculation improvements"
    purpose: "Empower the system to compute more meaningful, context-sensitive routing options"
    initialState: "Current routing engine uses limited sources and lacks dynamic recalculation"
    finalState: "Enhanced routing engine with multiple sources, dynamic updates, and context awareness"
    details: "This OC aims to improve the rerouting engine (algorithm and sources). The improvements focus on delivering RR alternatives that are not only technically valid but also operationally sound."
    visibility: "NETWORK"
    satisfiedORs: ["RR-OR-1-01", "RR-OR-1-01a", "RR-OR-1-07", "RR-OR-1-13"]
    supersededORs: []
    milestones:
      - title: "Production Deployment"
        description: "Deploy enhanced routing to production environment"
        eventTypes: ["OPS_DEPLOYMENT"]
        wave: "2027-Q2"
```

---

## Processing Notes

### External ID Resolution
- All references use external IDs which are resolved during import
- External IDs must be unique within each entity type
- References to non-existent external IDs will generate errors

### Hierarchical Dependencies
- Entities with `parentExternalId` are automatically ordered (parents before children)
- Circular dependencies are detected and reported as errors

### Rich Text Fields
- Fields marked as "rich text" accept plain text in import format
- Formatting can be added later through the user interface

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