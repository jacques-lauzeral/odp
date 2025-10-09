# DrG Material Import Approach

## Overview

Strategy for importing Drafting Group (DrG) materials from heterogeneous Office documents (Word/Excel) into the ODP database through a three-stage pipeline: **extraction → mapping → import**.

---

## Architecture

### Pipeline Stages

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Office File    │      │   Raw Extracted  │      │   Structured    │
│  (.docx/.xlsx)  │ ───► │      Data        │ ───► │   Import Data   │ ───► Database
│                 │      │     (JSON)       │      │     (JSON)      │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                         │                         │
        │                         │                         │
   Extraction              DrG-Specific Mapping        Standard Import
   (Generic)               (Per-DrG Mapper)           (ImportService)
```

### Stage Descriptions

1. **Extraction** (Document Format → Raw Data)
    - **Input**: Office document binary (.docx or .xlsx)
    - **Process**: Parse document structure without business logic
    - **Output**: Generic intermediate representation (JSON)
    - **Libraries**: mammoth.js (Word), xlsx (Excel)
    - **Responsibility**: Extract sections, headings, tables, paragraphs, formatting

2. **Mapping** (Raw Data → Structured Data)
    - **Input**: Raw extracted data + DrG identifier
    - **Process**: Apply DrG-specific business rules
    - **Output**: Structured import payload matching ODP schema
    - **Implementation**: Pluggable mapper classes per DrG
    - **Responsibility**: Entity identification, field mapping, reference resolution

3. **Import** (Structured Data → Database)
    - **Input**: Structured JSON payload
    - **Process**: Validate, resolve references, persist entities
    - **Output**: ImportSummary with statistics and errors
    - **Implementation**: Existing ImportService (enhanced)
    - **Responsibility**: Transaction management, dependency resolution, error collection

---

## Raw Extracted Data Format

### Generic Structure

Represents document structure in a DrG-agnostic way:

```json
{
  "documentType": "word" | "excel",
  "metadata": {
    "filename": "NM B2B Requirements.docx",
    "parsedAt": "2025-10-08T10:30:00Z"
  },
  "sections": [
    {
      "level": 1,
      "title": "Operational Needs",
      "path": ["Operational Needs"],
      "content": {
        "paragraphs": ["..."],
        "tables": [...],
        "lists": [...]
      },
      "subsections": [...]
    }
  ]
}
```

### Word Document Structure

```json
{
  "documentType": "word",
  "sections": [
    {
      "level": 1,
      "title": "6. Operational Needs (ONs)",
      "path": ["Operational Needs"],
      "subsections": [
        {
          "level": 2,
          "title": "6.1 Service Lifecycle Management",
          "path": ["Operational Needs", "Service Lifecycle Management"],
          "content": {
            "paragraphs": [
              {"style": "Heading3", "text": "Statement"},
              {"style": "Normal", "text": "The system shall..."},
              {"style": "Heading3", "text": "Rationale"},
              {"style": "Normal", "text": "This enables..."}
            ]
          },
          "subsections": [...]
        }
      ]
    }
  ]
}
```

### Excel Document Structure

```json
{
  "documentType": "excel",
  "sheets": [
    {
      "name": "Requirements",
      "headers": ["ID", "Title", "Type", "Statement", "Rationale"],
      "rows": [
        {
          "ID": "RR-ON-1",
          "Title": "Route Optimization",
          "Type": "ON",
          "Statement": "The system shall optimize routes",
          "Rationale": "Reduce flight time and fuel consumption"
        }
      ]
    },
    {
      "name": "Setup Entities",
      "headers": ["Type", "Name", "Description"],
      "rows": [...]
    }
  ]
}
```

---

## Structured Import Data Format

### Complete Payload Schema

Matches existing ODP import format with all entity types:

```json
{
  "documents": [
    {
      "externalId": "DOC-001",
      "title": "ConOPS v2.1",
      "description": "Concept of Operations",
      "version": "2.1",
      "url": "https://example.com/conops-2.1.pdf"
    }
  ],
  "stakeholderCategories": [
    {
      "externalId": "SC-001",
      "title": "Network Manager",
      "description": "Central coordination entity"
    }
  ],
  "dataCategories": [...],
  "services": [...],
  "waves": [
    {
      "externalId": "WAVE-2026-Q2",
      "title": "2026 Q2 Release",
      "description": "Second quarter deployment",
      "startDate": "2026-04-01",
      "endDate": "2026-06-30"
    }
  ],
  "requirements": [
    {
      "externalId": "NM-B2B/Flight-Planning/Route-Validation",
      "title": "Route Validation",
      "type": "OR",
      "drg": "NM_B2B",
      "statement": "The system shall validate flight routes",
      "rationale": "Ensure safety and regulatory compliance",
      "flows": "1. Receive plan\n2. Validate\n3. Return result",
      "privateNotes": "Implementation uses spatial algorithms",
      "path": ["Flight Planning", "Route Management"],
      "parentExternalId": "NM-B2B/Flight-Planning",
      "implementedONs": ["NM-B2B/Flight-Planning/ON-1"],
      "impactsStakeholderCategories": ["SC-001"],
      "impactsServices": ["SRV-001"],
      "impactsData": ["DC-001"],
      "documentReferences": [
        {
          "documentExternalId": "DOC-001",
          "note": "Section 3.2"
        }
      ],
      "dependsOnRequirements": ["NM-B2B/Infrastructure/OR-1"]
    }
  ],
  "changes": [
    {
      "externalId": "NM-B2B-OC-1",
      "title": "Enhanced Route Validation",
      "purpose": "Improve validation accuracy",
      "visibility": "NETWORK",
      "drg": "NM_B2B",
      "initialState": "Basic route checking",
      "finalState": "Advanced validation with real-time data",
      "details": "Implementation plan:\n1. Phase 1...\n2. Phase 2...",
      "privateNotes": "Requires database upgrade",
      "path": ["Flight Planning", "Enhancements"],
      "satisfiedORs": ["NM-B2B/Flight-Planning/Route-Validation"],
      "supersededORs": [],
      "documentReferences": [
        {
          "documentExternalId": "DOC-001",
          "note": "Appendix B"
        }
      ],
      "dependsOnChanges": ["NM-B2B-OC-0"],
      "milestones": [
        {
          "eventType": "API_PUBLICATION",
          "wave": "WAVE-2026-Q2"
        },
        {
          "eventType": "OPS_DEPLOYMENT",
          "wave": "WAVE-2026-Q3"
        }
      ]
    }
  ]
}
```

---

## Mapper Implementation

### Abstract Base Class

```javascript
class DocumentMapper {
  /**
   * Transform raw extracted data into structured import payload
   * @param {Object} rawData - Generic document structure
   * @returns {Object} - Complete structured import data
   */
  map(rawData) {
    return {
      documents: this.mapDocuments(rawData),
      stakeholderCategories: this.mapStakeholderCategories(rawData),
      dataCategories: this.mapDataCategories(rawData),
      services: this.mapServices(rawData),
      waves: this.mapWaves(rawData),
      requirements: this.mapRequirements(rawData),
      changes: this.mapChanges(rawData)
    };
  }

  // Abstract methods - must be implemented by subclasses
  mapDocuments(rawData) { throw new Error('Not implemented'); }
  mapStakeholderCategories(rawData) { throw new Error('Not implemented'); }
  mapDataCategories(rawData) { throw new Error('Not implemented'); }
  mapServices(rawData) { throw new Error('Not implemented'); }
  mapWaves(rawData) { throw new Error('Not implemented'); }
  mapRequirements(rawData) { throw new Error('Not implemented'); }
  mapChanges(rawData) { throw new Error('Not implemented'); }
}
```

### Concrete Mapper: NM B2B (Word)

```javascript
class NMB2BMapper extends DocumentMapper {
  mapRequirements(rawData) {
    const requirements = [];
    
    // Find section containing "Operational Needs" or "Operational Requirements"
    const onSection = this.findSection(rawData, /operational needs/i);
    const orSection = this.findSection(rawData, /operational requirements/i);
    
    // Process ON sections
    if (onSection) {
      requirements.push(...this.extractRequirements(onSection, 'ON'));
    }
    
    // Process OR sections
    if (orSection) {
      requirements.push(...this.extractRequirements(orSection, 'OR'));
    }
    
    return requirements;
  }
  
  extractRequirements(section, type) {
    const requirements = [];
    
    // Each subsection becomes a requirement if it has "Statement" field
    for (const subsection of this.iterateSubsections(section)) {
      if (this.hasStatement(subsection)) {
        const req = {
          externalId: this.buildExternalId(subsection.path, subsection.title),
          title: subsection.title,
          type: type,
          drg: 'NM_B2B',
          statement: this.extractField(subsection, 'Statement'),
          rationale: this.extractField(subsection, 'Rationale'),
          flows: this.extractField(subsection, 'Flows'),
          path: subsection.path,
          parentExternalId: this.resolveParent(subsection.path),
          implementedONs: type === 'OR' ? this.extractImplementedONs(subsection) : [],
          impactsStakeholderCategories: this.extractImpacts(subsection, 'Stakeholder'),
          impactsServices: this.extractImpacts(subsection, 'Service'),
          impactsData: this.extractImpacts(subsection, 'Data')
        };
        
        requirements.push(req);
      }
    }
    
    return requirements;
  }
  
  mapChanges(rawData) {
    const changes = [];
    const ocSection = this.findSection(rawData, /operational changes/i);
    
    if (!ocSection) return changes;
    
    for (const subsection of this.iterateSubsections(ocSection)) {
      if (this.hasPurpose(subsection)) {
        const change = {
          externalId: this.buildExternalId(subsection.path, subsection.title),
          title: subsection.title,
          purpose: this.extractField(subsection, 'Purpose'),
          visibility: this.extractField(subsection, 'Visibility') || 'NETWORK',
          drg: 'NM_B2B',
          initialState: this.extractField(subsection, 'Initial State'),
          finalState: this.extractField(subsection, 'Final State'),
          details: this.extractField(subsection, 'Details'),
          path: subsection.path,
          satisfiedORs: this.extractReferences(subsection, 'Satisfied ORs'),
          supersededORs: this.extractReferences(subsection, 'Superseded ORs'),
          milestones: this.extractMilestones(subsection)
        };
        
        changes.push(change);
      }
    }
    
    return changes;
  }
  
  mapStakeholderCategories(rawData) {
    // Extract from impact statements across all requirements
    const uniqueStakeholders = new Set();
    
    // Scan all requirement sections for stakeholder references
    for (const section of rawData.sections) {
      const impacts = this.findImpactStatements(section, 'stakeholder');
      impacts.forEach(name => uniqueStakeholders.add(name));
    }
    
    return Array.from(uniqueStakeholders).map((name, idx) => ({
      externalId: `SC-${idx + 1}`,
      title: name,
      description: `Extracted from document references`
    }));
  }
  
  // Similar implementations for mapServices, mapDataCategories, etc.
}
```

### Concrete Mapper: Rerouting (Excel)

```javascript
class ReroutingMapper extends DocumentMapper {
  mapRequirements(rawData) {
    const requirementsSheet = rawData.sheets.find(s => s.name === 'Requirements');
    if (!requirementsSheet) return [];
    
    return requirementsSheet.rows.map(row => ({
      externalId: row['ID'] || this.generateId(row),
      title: row['Title'],
      type: row['Type'], // 'ON' or 'OR'
      drg: 'REROUTING',
      statement: row['Statement'],
      rationale: row['Rationale'],
      flows: row['Flows'] || '',
      path: row['Path'] ? row['Path'].split('/') : [],
      parentExternalId: row['Parent ID'] || null,
      implementedONs: row['Implemented ONs'] ? row['Implemented ONs'].split(',') : [],
      impactsStakeholderCategories: row['Stakeholders'] ? row['Stakeholders'].split(',') : [],
      impactsServices: row['Services'] ? row['Services'].split(',') : [],
      impactsData: row['Data Categories'] ? row['Data Categories'].split(',') : []
    }));
  }
  
  mapStakeholderCategories(rawData) {
    const setupSheet = rawData.sheets.find(s => s.name === 'Setup Entities');
    if (!setupSheet) return [];
    
    return setupSheet.rows
      .filter(row => row['Type'] === 'Stakeholder')
      .map(row => ({
        externalId: row['ID'],
        title: row['Name'],
        description: row['Description'] || ''
      }));
  }
  
  // Similar implementations for other entity types
}
```

### Mapper Registry

```javascript
class MapperRegistry {
  constructor() {
    this.mappers = new Map();
    this.registerDefaultMappers();
  }
  
  registerDefaultMappers() {
    this.register('NM_B2B', new NMB2BMapper());
    this.register('REROUTING', new ReroutingMapper());
    // Add more as needed
  }
  
  register(drg, mapper) {
    this.mappers.set(drg, mapper);
  }
  
  get(drg) {
    const mapper = this.mappers.get(drg);
    if (!mapper) {
      throw new Error(`No mapper registered for DrG: ${drg}`);
    }
    return mapper;
  }
}
```

---

## Implementation Notes

### Error Handling Strategy

- **Extraction stage**: Fail fast on unparseable documents
- **Mapping stage**: Collect warnings for missing optional fields, errors for required fields
- **Import stage**: Greedy processing with comprehensive error collection (existing behavior)

### Reference Resolution

References are handled at different stages:

1. **Extraction**: Preserve raw text references
2. **Mapping**: Convert to externalId format (path-based or explicit)
3. **Import**: Resolve to internal itemIds (existing ImportService logic)

### DrG-Specific Variations

Each DrG mapper handles:

- Document structure conventions (section naming, nesting depth)
- Field identification patterns (keywords, formatting)
- Entity type discrimination (ON vs OR, requirement vs setup)
- Reference notation styles (relative paths, absolute IDs)
- Missing data defaults (empty arrays, placeholder text)

### Extensibility

Adding support for a new DrG requires:

1. Implement new mapper class extending `DocumentMapper`
2. Register mapper in `MapperRegistry`
3. No changes to extraction or import stages
4. No changes to API or CLI interfaces

---

## API Integration

### OpenAPI Endpoints

```yaml
# Extraction endpoints (DrG-agnostic)
POST /import/extract/word
  Request: multipart/form-data (docx file)
  Response: RawExtractedData (JSON)

POST /import/extract/excel  
  Request: multipart/form-data (xlsx file)
  Response: RawExtractedData (JSON)

# Mapping endpoint (DrG-specific)
POST /import/map/{drg}
  Path: drg = NM_B2B | REROUTING | ...
  Request: RawExtractedData (JSON)
  Response: StructuredImportData (JSON)

# Import endpoint (unified)
POST /import/structured
  Request: StructuredImportData (JSON)
  Response: ImportSummary
```

### Response Schemas

```yaml
RawExtractedData:
  type: object
  properties:
    documentType:
      type: string
      enum: [word, excel]
    metadata:
      type: object
    sections:
      type: array
      items: { $ref: '#/components/schemas/Section' }
    sheets:
      type: array
      items: { $ref: '#/components/schemas/Sheet' }

StructuredImportData:
  type: object
  properties:
    documents: { type: array }
    stakeholderCategories: { type: array }
    dataCategories: { type: array }
    services: { type: array }
    waves: { type: array }
    requirements: { type: array }
    changes: { type: array }

ImportSummary:
  type: object
  properties:
    documents: { type: integer }
    stakeholderCategories: { type: integer }
    dataCategories: { type: integer }
    services: { type: integer }
    waves: { type: integer }
    requirements: { type: integer }
    changes: { type: integer }
    errors:
      type: array
      items: { type: string }
```

---

## CLI Integration

### Two-Step Workflow Commands

```bash
# Step 1: Extract raw data from document
odp import extract-word --file requirements.docx --output raw.json
odp import extract-excel --file requirements.xlsx --output raw.json

# Step 2: Map to structured data using DrG-specific mapper
odp import map --file raw.json --drg NM_B2B --output structured.json

# Step 3: Import into database
odp import structured --file structured.json
```

### Command Options

```bash
# Extraction commands
odp import extract-word --file <path> [--output <path>]
  --file      Path to Word document (.docx)
  --output    Output JSON file (default: stdout)

odp import extract-excel --file <path> [--output <path>]
  --file      Path to Excel document (.xlsx)
  --output    Output JSON file (default: stdout)

# Mapping command
odp import map --file <path> --drg <DRG> [--output <path>]
  --file      Path to raw extracted JSON
  --drg       Drafting group (NM_B2B, REROUTING, etc.)
  --output    Output JSON file (default: stdout)

# Import command
odp import structured --file <path>
  --file      Path to structured JSON payload
```

---

## Testing Strategy

### Unit Testing

- **Extraction**: Test parsing of sample Word/Excel documents
- **Mapping**: Test each mapper with known raw data inputs
- **Import**: Test structured payload validation and persistence (existing tests)

### Integration Testing

- **End-to-end**: Full pipeline with real DrG documents
- **Round-trip**: Export → Import → Export comparison
- **Error scenarios**: Malformed documents, missing required fields

### Validation Testing

- **Schema compliance**: Structured output matches ODP schema
- **Reference integrity**: All references resolve correctly
- **Data preservation**: No information loss during transformation

---

## Migration from Existing Imports

### Current State

- Custom YAML import files hand-crafted per DrG
- Direct calls to `ImportService.importRequirements()` and `importChanges()`

### Transition Path

1. **Phase 1**: New DrGs use document import pipeline (NM_B2B, Rerouting)
2. **Phase 2**: Existing DrGs migrate incrementally (optional)
3. **Legacy support**: Keep YAML import endpoints for manual data entry

---

## Future Enhancements

### Potential Improvements

1. **Validation mode**: Dry-run mapping without import
2. **Incremental import**: Update existing entities instead of full replace
3. **Diff reports**: Show changes between document versions
4. **Template generation**: Export canonical document templates per DrG
5. **Web upload UI**: Browser-based document upload and preview
6. **Batch processing**: Import multiple documents in single transaction

---

## Summary

This approach provides:

- **Separation of concerns**: Extraction, mapping, and import as independent stages
- **Extensibility**: Easy addition of new DrG mappers without core changes
- **Maintainability**: Single pipeline replaces N custom import strategies
- **Testability**: Each stage can be tested independently
- **Flexibility**: Supports both Word and Excel sources
- **Future-proofing**: Foundation for web-based import UI