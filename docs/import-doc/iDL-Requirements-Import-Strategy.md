# iDL Requirements Import Strategy

## Overview

The iDL Requirements Import process transforms structured Word documents containing hierarchical requirement definitions into YAML bulk files suitable for import into the ODP (Operational Deployment Platform). This process uses a three-stage approach to ensure accuracy and enable iterative refinement.

## Three-Stage Import Process

### Stage 1: Source Document Analysis
**Input**: Structured Word documents with hierarchical sections containing requirement definitions  
**Output**: Raw extraction data and section mapping

### Stage 2: Intermediate Preprocessing
**Input**: Source document analysis  
**Output**: Intermediate markdown file (`.md`) with agreed requirement structure  
**Purpose**: Establish consensus on requirement inventory, relationships, and external IDs before detailed content extraction

### Stage 3: Final Bulk Generation
**Input**: Agreed intermediate file + source document details  
**Output**: YAML bulk files ready for ODP import  
**Purpose**: Combine agreed structure with complete requirement details

---

## Stage 2: Intermediate Preprocessing File

### Purpose and Structure

The intermediate preprocessing file serves as a **consensus checkpoint** before final bulk generation. It contains:

1. **Complete requirement inventory** - All discovered ONs and ORs with agreed indices
2. **Hierarchical relationships** - Parent-child structure (REFINES relationships)
3. **Implementation relationships** - Which ORs implement which ONs (IMPLEMENTS relationships)
4. **External ID validation** - Business identifier paths for each requirement
5. **Structural corrections** - Any fixes to section mapping or titles

### File Format

The intermediate file uses markdown tables with the following structure:

```markdown
# iDLAD Definition Process Requirements - Preprocessed

**Total: 114 requirements (19 ONs + 95 ORs)**  
**Source**: [Source document name]  
**Status**: [DRAFT/AGREED/CORRECTED]

## Section 6 - Operational Needs (ONs)

| Index | Title | Type | Parent Title | Implemented ONs |
|-------|-------|------|-------------|-----------------|
| 1 | Delivery to Operations and Publication | ON | - | - |
| 2 | Unified Process | ON | Delivery to Operations and Publication | - |
| ... | ... | ... | ... | ... |

## Section 7 - Operational Requirements (ORs)

| Index | Title | Type | Parent Title | Implemented ONs |
|-------|-------|------|-------------|-----------------|
| 20 | User Guide | OR | - | Delivery to Operations and Publication/Documented Process |
| 21 | Agreed Guidelines | OR | - | Delivery to Operations and Publication/Agreed Rules and Practices |
| ... | ... | ... | ... | ... |

## Key Corrections Applied
- [List any corrections made to source document structure]

## Validation Notes
- [Any structural issues or ambiguities identified]
```

### Key Fields

- **Index**: Sequential numbering (1-N) for all requirements
- **Title**: Section title without numbering (becomes part of external ID)
- **Type**: "ON" or "OR"
- **Parent Title**: Direct parent requirement title (for REFINES relationship)
- **Implemented ONs**: List of ON external IDs that this OR implements (for ORs only)

## Stage 2: Production Process

### 1. Document Structure Analysis

**Input Processing:**
- Parse Word document hierarchical sections (6.x for ONs, 7.x for ORs)
- Identify all sections containing "Statement" fields as requirements
- Extract section numbering and titles
- Map parent-child relationships from section hierarchy

**Business ID Construction:**
- Convert section titles to hierarchical paths: `"Parent Title/Child Title"`
- Remove section numbers, keep only semantic titles
- Normalize terminology and fix inconsistencies
- Example: "6.1.5 Operational Change via Instant Data Amendment" → `"Delivery to Operations and Publication/Operational Change via Instant Data Amendment"`

### 2. Relationship Mapping

**REFINES Relationships (Hierarchical):**
- Derived automatically from document section structure
- Parent = section path with last segment removed
- Child = full section path
- Stored as `parentTitle` in intermediate file

**IMPLEMENTS Relationships (Cross-reference):**
- Extracted from "Implemented Operational Needs" sections in ORs
- Manually identified and mapped to ON external IDs
- Stored as `implementedONs` array in intermediate file
- Example: OR "User Guide" implements ON "Delivery to Operations and Publication/Documented Process"

### 3. Quality Validation

**Completeness Checks:**
- All sections with statements captured
- No duplicate external IDs
- All parent references resolve

**Consistency Validation:**
- Hierarchical relationships preserved
- Cross-references use correct external ID format
- IMPLEMENTS relationships only from ORs to ONs

### 4. Iterative Refinement

**Review Process:**
1. Generate initial intermediate file
2. Review for structural accuracy and completeness
3. Apply corrections (e.g., missing "Network" terminology)
4. Validate relationships and external IDs
5. Achieve consensus on requirement inventory
6. Mark as AGREED status

---

## Stage 3: Final Bulk Generation

### Purpose

Transform the agreed intermediate structure into complete YAML bulk files by combining:
- **Structure and relationships** from intermediate file
- **Detailed content** extracted from source documents
- **Additional metadata** found only in source documents

### Content Extraction Strategy

**From Intermediate File:**
- External IDs and hierarchical paths
- Parent-child relationships (`parentExternalId`)
- Implementation relationships (`implementedONs`)
- Requirement titles and types

**From Source Documents:**
- Complete `statement` text
- Complete `rationale` text
- `references` (ConOPS references, regulatory references)
- `flows` (process flow descriptions)
- `flowExamples` (concrete numbered flow examples)
- `risksAndOpportunities` (risk and opportunity analysis)
- Impact arrays:
    - `impactedStakeholderCategories`
    - `impactedServices`
    - `impactedDataCategories`
    - `impactedRegulatoryAspects`

### Bulk File Organization

**File Structure:**
```
idlad-ons.yaml           # 19 ONs (indices 1-19)
idlad-ors-01.yaml        # 20 ORs (indices 20-39)  
idlad-ors-02.yaml        # 20 ORs (indices 40-59)
idlad-ors-03.yaml        # 20 ORs (indices 60-79)
idlad-ors-04.yaml        # 20 ORs (indices 80-99)
idlad-ors-05.yaml        # 15 ORs (indices 100-114)
```

**YAML Format** (per ODP Import File Format specification):
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

### Content Extraction Process

**For each requirement in intermediate file:**

1. **Retrieve structure** from intermediate file:
    - External ID, title, type, parent relationships, implemented ONs

2. **Extract detailed content** from source document using external ID mapping:
    - Locate corresponding section in Word document
    - Extract statement (from "Statement:" sections)
    - Extract rationale (from "Rationale:" sections)
    - Extract references (from "ConOPS References:" or "References:" sections)
    - Extract flows (from "Flow:" or "Flows:" sections)
    - Extract flow examples (numbered steps in flow sections)
    - Extract impacts (from "Impact:" sections with subcategories)
    - Extract risks/opportunities (from "Risks and Opportunities:" sections)

3. **Format for YAML output**:
    - Convert rich text to plain text
    - Preserve list structures and numbering
    - Resolve cross-references to other requirements
    - Apply consistent formatting

4. **Validate completeness**:
    - Ensure all required fields present
    - Verify relationship references resolve
    - Check for formatting consistency

### Quality Assurance

**Field Validation:**
- All external IDs unique and follow naming convention
- Parent relationships form valid hierarchy (no cycles)
- IMPLEMENTS relationships only ORs → ONs
- Impact references resolve to valid entity IDs

**Content Validation:**
- Statement and rationale present for all requirements
- Cross-references use correct external ID format
- Flow examples properly formatted and numbered
- ConOPS references follow standard format

**Output Validation:**
- Valid YAML syntax
- Manageable file sizes (≤ 20 requirements per bulk file)
- Complete coverage (all intermediate requirements included)
- No duplicate content across bulk files

---

## Key Success Factors

1. **Consensus on Structure**: Intermediate file enables agreement on requirement inventory before detailed extraction
2. **Separation of Concerns**: Structure/relationships vs. detailed content handled separately
3. **Iterative Refinement**: Multiple review cycles for accuracy
4. **Comprehensive Content**: All source document information captured systematically
5. **Quality Validation**: Multiple validation checkpoints ensure accuracy
6. **Manageable Output**: Bulk files sized for efficient processing

## Benefits of This Approach

- **Reduces Errors**: Structure agreed before content extraction
- **Enables Collaboration**: Stakeholders can review and correct intermediate file
- **Handles Complexity**: Separates relationship mapping from content extraction
- **Ensures Completeness**: Systematic extraction of all source document information
- **Supports Iteration**: Easy to correct and regenerate bulk files
- **Maintains Traceability**: Clear mapping from source to final output