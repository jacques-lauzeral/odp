# ODP Import File Format

## Requirements 

```yaml
requirements:
  - externalId: "Business/Identifier/Path"
    title: "Requirement Title"
    type: "ON" | "OR"
    statement: "Primary requirement statement"
    rationale: "Reasoning behind the requirement"
    references: "External references (ConOPS, etc.)"
    risksAndOpportunities: "Risk and opportunity analysis"
    flows: "Process flow descriptions"
    flowExamples: "Concrete flow examples"
    parentExternalId: "Parent/Requirement/Path" | null
    implementedONs: ["ON/Path/1", "ON/Path/2"]  # OR only
    impactedStakeholderCategories: ["StakeholderRef1"]
    impactedServices: ["ServiceRef1"]
    impactedDataCategories: ["DataRef1"]
    impactedRegulatoryAspects: ["RegRef1"]
```

### Field Specifications
- **externalId**: Unique business identifier built from section title path
- **type**: "ON" (Operational Need) or "OR" (Operational Requirement)
- **parentExternalId**: Single parent reference for hierarchical REFINES relationship
- **implementedONs**: Array of ON references that this OR implements (OR only)
- **Impact arrays**: References to setup entities by their externalId

### Key Constraints
- ONs have `implementedONs: []` (empty, not applicable)
- ORs may implement multiple ONs via `implementedONs` array
- Hierarchical structure through `parentExternalId` (section-based)
- All text fields preserved as plain text (no rich formatting)
