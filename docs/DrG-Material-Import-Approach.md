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
- **Libraries**: mammoth.js (Word), xlsx (Excel), LibreOffice (image conversion)
- **Responsibility**: Extract sections, headings, tables, paragraphs, formatting, images
- **Image Handling**: Convert EMF → PNG for web compatibility, embed in AsciiDoc format

2. **Mapping** (Raw Data → Structured Data)
- **Input**: Raw extracted data + DrG identifier
- **Process**: Apply DrG-specific business rules
- **Output**: Structured import payload matching ODP schema
- **Implementation**: Pluggable mapper classes per DrG
- **Responsibility**: Entity identification, field mapping, reference resolution, AsciiDoc → Quill Delta conversion

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
              "Statement: The system shall...",
              "image::data:image/png;base64,iVBORw0KGgoAAAANSUh...[]",
              "Figure 1 - Process Diagram",
              "Rationale: This enables..."
            ]
          },
          "subsections": [...]
        }
      ]
    }
  ]
}
```

**Image Handling in Paragraphs:**
- Images embedded inline using AsciiDoc syntax: `image::data:image/png;base64,...[]`
- EMF (Windows Enhanced Metafile) images converted to PNG during extraction
- Conversion performed using LibreOffice headless mode
- Failed conversions replaced with transparent placeholder
- Images stored once in paragraph text (no separate image arrays)

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

## Image Processing Pipeline

### Extraction Stage (DocxExtractor)

**Process:**
1. Mammoth.js converts Word document to HTML
2. Extract `<img src="data:image/x-emf;base64,...">` tags
3. Detect EMF content type in data URL
4. Convert EMF → PNG using LibreOffice:
    - Write EMF data to temporary file
    - Execute: `libreoffice --headless --convert-to png`
    - Read converted PNG and encode as base64
    - Clean up temporary files
5. Replace in HTML with PNG data URL
6. Convert to AsciiDoc: `image::data:image/png;base64,...[]`
7. Store in paragraph text (single source of truth)

**Error Handling:**
- Conversion timeout: 30 seconds per image
- Failure fallback: 1x1 transparent PNG placeholder
- Logging: Detailed error messages with image context
- Non-blocking: Continue processing document

### Mapping Stage (DrG-Specific Mapper)

**Process:**
1. Parse AsciiDoc paragraphs
2. Detect image syntax: `image::data:...[]`
3. Convert to Quill Delta format:
   ```javascript
   {
     insert: {
       image: "data:image/png;base64,iVBORw0KGg..."
     }
   }
   ```
4. Embed in rich text field Delta JSON
5. Store in structured import payload

### Import Stage (ImportService)

**Process:**
- Quill Delta with embedded images stored as JSON string
- Images remain base64-encoded in Delta format
- No additional processing required
- Images preserved through database round-trip

---

## Structured Import Data Format

### Complete Payload Schema

Matches existing ODP import format with all entity types:

```json
{
  "documents": [
    {
      "externalId": "document:conops_v2.1",
      "name": "ConOPS v2.1",
      "description": "Concept of Operations",
      "version": "2.1",
      "url": "https://example.com/conops-2.1.pdf"
    }
  ],
  "stakeholderCategories": [
    {
      "externalId": "stakeholder:network_manager",
      "name": "Network Manager",
      "description": "Central coordination entity"
    }
  ],
  "dataCategories": [
    {
      "externalId": "data:flight_data",
      "name": "Flight Data",
      "description": "Core flight planning information"
    }
  ],
  "services": [
    {
      "externalId": "service:flight_planning_service",
      "name": "Flight Planning Service",
      "description": "Route planning and validation"
    }
  ],
  "waves": [
    {
      "externalId": "wave:2026_q2_release",
      "name": "2026 Q2 Release",
      "description": "Second quarter deployment",
      "startDate": "2026-04-01",
      "endDate": "2026-06-30"
    }
  ],
  "requirements": [
    {
      "externalId": "or:nm_b2b/flight_planning/validation/route_validation",
      "title": "Route Validation",
      "type": "OR",
      "drg": "NM_B2B",
      "statement": "{\"ops\":[{\"insert\":\"The system shall validate flight routes\"},{\"insert\":\"\\n\"},{\"insert\":{\"image\":\"data:image/png;base64,iVBORw0KGg...\"}},{\"insert\":\"\\n\"}]}",
      "rationale": "{\"ops\":[{\"insert\":\"Ensure safety and regulatory compliance\"},{\"insert\":\"\\n\"}]}",
      "flows": "{\"ops\":[{\"insert\":\"1. Receive plan\\n2. Validate\\n3. Return result\"},{\"insert\":\"\\n\"}]}",
      "path": ["Flight Planning", "Validation"],
      "implementedONs": ["on:nm_b2b/flight_planning/route_safety"],
      "impactsStakeholderCategories": ["stakeholder:network_manager"],
      "impactsServices": ["service:flight_planning_service"],
      "impactsData": ["data:flight_data"]
    }
  ],
  "changes": [
    {
      "externalId": "oc:nm_b2b/real-time_validation",
      "title": "Real-Time Route Validation",
      "purpose": "{\"ops\":[{\"insert\":\"Enable immediate validation feedback\"},{\"insert\":\"\\n\"}]}",
      "visibility": "NETWORK",
      "drg": "NM_B2B",
      "initialState": "{\"ops\":[{\"insert\":\"Batch validation only\"},{\"insert\":\"\\n\"}]}",
      "finalState": "{\"ops\":[{\"insert\":\"Real-time validation available\"},{\"insert\":\"\\n\"}]}",
      "details": "{\"ops\":[{\"insert\":\"Migration from batch to streaming validation\"},{\"insert\":\"\\n\"}]}",
      "satisfiedORs": ["or:nm_b2b/flight_planning/validation/route_validation"],
      "supersededORs": [],
      "milestones": [
        {
          "name": "API Ready",
          "targetDate": "2026-03-15",
          "status": "PLANNED"
        }
      ]
    }
  ]
}
```

### Key Field Mapping Rules

**Setup Entities (Hierarchical)**:
- **stakeholderCategories**: Use `name` field (not `title`)
- **dataCategories**: Use `name` field (not `title`)
- **services**: Use `name` field (not `title`)
- **documents**: Use `name` field (not `title`)
- **waves**: Use `name` field (not `title`)
- External IDs can include parent references: `data:parent_category/child_category`

**Requirements and Changes**:
- Use `title` field for human-readable names
- Path-based external IDs: `{type}:{drg}/{organizational_path}/{title_normalized}`
- Support both parent references and organizational paths
- **Rich text fields** stored as Quill Delta JSON strings:
    - `statement`, `rationale`, `flows`, `privateNotes` (for ON/OR)
    - `purpose`, `details`, `initialState`, `finalState` (for OC)
- **Images** embedded in Quill Delta as: `{insert: {image: "data:image/png;base64,..."}}`

---

## DrG-Specific Mappers

### Abstract Base Class

```javascript
class DocumentMapper {
  constructor() {
    this.converter = new AsciidocToDeltaConverter();
  }

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
  
  // Each subclass implements these methods
  mapDocuments(rawData) { return []; }
  mapStakeholderCategories(rawData) { return []; }
  mapDataCategories(rawData) { return []; }
  mapServices(rawData) { return []; }
  mapWaves(rawData) { return []; }
  mapRequirements(rawData) { return []; }
  mapChanges(rawData) { return []; }
  
  // Shared utility for AsciiDoc → Quill Delta conversion
  convertToQuillDelta(asciidocText) {
    return this.converter.asciidocToDelta(asciidocText);
  }
}
```

### AsciiDoc to Delta Converter

**Handles:**
- Text formatting: `**bold**`, `*italic*`, `__underline__`
- Lists: `. item` (ordered), `* item` (bullet), with indent levels
- Images: `image::data:image/png;base64,...[]`
- Paragraphs: Double newline separation

**Output:**
```javascript
{
  ops: [
    { insert: "Bold text", attributes: { bold: true } },
    { insert: "\n" },
    { insert: { image: "data:image/png;base64,..." } },
    { insert: "\n" },
    { insert: "List item", attributes: { list: "bullet" } },
    { insert: "\n" }
  ]
}
```

### Concrete Mapper: NM B2B (Word)

```javascript
class NMB2BMapper extends DocumentMapper {
  mapRequirements(rawData) {
    const requirements = [];
    
    for (const section of rawData.sections) {
      // Find ON/OR sections
      if (this.isRequirementSection(section)) {
        const req = {
          externalId: this.extractExternalId(section),
          title: this.extractTitle(section),
          type: this.extractType(section),
          drg: 'NM_B2B',
          // Convert AsciiDoc paragraphs to Quill Delta JSON
          statement: this.convertToQuillDelta(this.extractField(section, 'Statement')),
          rationale: this.convertToQuillDelta(this.extractField(section, 'Rationale')),
          flows: this.convertToQuillDelta(this.extractField(section, 'Flows')),
          path: this.extractPath(section),
          implementedONs: this.extractReferences(section, 'Implements ONs'),
          impactsStakeholderCategories: this.extractImpacts(section, 'Stakeholders'),
          impactsServices: this.extractImpacts(section, 'Services'),
          impactsData: this.extractImpacts(section, 'Data')
        };
        requirements.push(req);
      }
    }
    
    return requirements;
  }
  
  extractField(section, fieldName) {
    // Find paragraphs starting with "fieldName:"
    // Collect subsequent paragraphs until next field marker
    // Return concatenated AsciiDoc text (may include image:: syntax)
  }
}
```

### Concrete Mapper: Rerouting (Excel)

```javascript
class ReroutingMapper extends DocumentMapper {
  mapRequirements(rawData) {
    const reqSheet = rawData.sheets.find(s => s.name === 'Requirements');
    if (!reqSheet) return [];

    return reqSheet.rows
      .filter(row => row['Type'] === 'OR' || row['Type'] === 'ON')
      .map(row => ({
        externalId: row['ID'],
        title: row['Title'],
        type: row['Type'],
        drg: 'REROUTING',
        // Convert plain text to Quill Delta (no images in Excel)
        statement: this.convertToQuillDelta(row['Statement'] || ''),
        rationale: this.convertToQuillDelta(row['Rationale'] || ''),
        flows: this.convertToQuillDelta(row['Flows'] || ''),
        path: this.extractPathFromId(row['ID']),
        implementedONs: this.parseReferences(row['Implemented ONs']),
        impactsStakeholderCategories: this.parseReferences(row['Stakeholders']),
        impactsServices: this.parseReferences(row['Services']),
        impactsData: this.parseReferences(row['Data'])
      }));
  }

  mapStakeholderCategories(rawData) {
    const setupSheet = rawData.sheets.find(s => s.name === 'Setup Entities');
    if (!setupSheet) return [];

    return setupSheet.rows
      .filter(row => row['Type'] === 'Stakeholder')
      .map(row => ({
        externalId: ExternalIdBuilder.buildExternalId({ name: row['Name'] }, 'stakeholder'),
        name: row['Name'],  // Use 'name' field
        description: row['Description'] || ''
      }));
  }

  mapServices(rawData) {
    const setupSheet = rawData.sheets.find(s => s.name === 'Setup Entities');
    if (!setupSheet) return [];

    return setupSheet.rows
            .filter(row => row['Type'] === 'Service')
            .map(row => ({
              externalId: ExternalIdBuilder.buildExternalId({ name: row['Name'] }, 'service'),
              name: row['Name'],  // Use 'name' field
              description: row['Description'] || ''
            }));
  }
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

- **Extraction stage**: Fail fast on unparseable documents, log image conversion failures
- **Mapping stage**: Collect warnings for missing optional fields, errors for required fields
- **Import stage**: Greedy processing with comprehensive error collection (existing behavior)
- **Image errors**: Non-blocking, use placeholder and continue processing

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
- Image presence (Word documents may have images, Excel typically does not)

### Extensibility

Adding support for a new DrG requires:

1. Implement new mapper class extending `DocumentMapper`
2. Register mapper in `MapperRegistry`
3. No changes to extraction or import stages
4. No changes to API or CLI interfaces
5. Reuse `AsciidocToDeltaConverter` for rich text fields

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
      description: |
        Word document sections with content.paragraphs containing AsciiDoc-formatted text.
        Images embedded as: image::data:image/png;base64,...[]
    sheets:
      type: array
      items: { $ref: '#/components/schemas/Sheet' }

StructuredImportData:
  type: object
  properties:
    documents: { type: array }
    stakeholderCategories:
      type: array
      items:
        type: object
        properties:
          externalId: { type: string }
          name: { type: string }  # Note: 'name' not 'title'
          description: { type: string }
    dataCategories:
      type: array
      items:
        type: object
        properties:
          externalId: { type: string }
          name: { type: string }  # Note: 'name' not 'title'
          description: { type: string }
    services:
      type: array
      items:
        type: object
        properties:
          externalId: { type: string }
          name: { type: string }  # Note: 'name' not 'title'
          description: { type: string }
    waves: { type: array }
    requirements:
      type: array
      items:
        type: object
        properties:
          externalId: { type: string }
          title: { type: string }
          statement: 
            type: string
            description: Quill Delta JSON with possible embedded images
          rationale: 
            type: string
            description: Quill Delta JSON with possible embedded images
          flows: 
            type: string
            description: Quill Delta JSON
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
    warnings:
      type: array
      items: { type: string }
      description: Non-blocking issues (e.g., image conversion failures)
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

- **Extraction**: Test parsing of sample Word/Excel documents with images
- **Image Conversion**: Test EMF → PNG conversion with various image formats
- **Mapping**: Test each mapper with known raw data inputs including images
- **AsciiDoc Conversion**: Test conversion of formatting and image syntax to Quill Delta
- **Import**: Test structured payload validation and persistence (existing tests)

### Integration Testing

- **End-to-end**: Full pipeline with real DrG documents containing images
- **Round-trip**: Export → Import → Export comparison with image preservation
- **Error scenarios**: Malformed documents, missing required fields, corrupt images
- **Image handling**: EMF conversion, PNG preservation, placeholder fallback

### Validation Testing

- **Schema compliance**: Structured output matches ODP schema
- **Reference integrity**: All references resolve correctly
- **Data preservation**: No information loss during transformation
- **Image integrity**: Images render correctly in web client after import

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
7. **Image optimization**: Compress large images, thumbnail generation
8. **Alternative formats**: Support for SVG, handle more image formats

---

## Summary

This approach provides:

- **Separation of concerns**: Extraction, mapping, and import as independent stages
- **Extensibility**: Easy addition of new DrG mappers without core changes
- **Maintainability**: Single pipeline replaces N custom import strategies
- **Testability**: Each stage can be tested independently
- **Flexibility**: Supports both Word and Excel sources
- **Future-proofing**: Foundation for web-based import UI
- **Schema consistency**: Enforces correct field naming (`name` for setup entities, `title` for requirements/changes)
- **Rich text support**: Full Quill Delta format with embedded images
- **Web compatibility**: Automatic EMF → PNG conversion for browser rendering
- **Robustness**: Graceful handling of image conversion failures