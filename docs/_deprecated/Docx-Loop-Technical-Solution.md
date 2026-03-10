# Docx-Loop-Technical-Solution.md

## Overview

The Docx Loop enables round-trip editing of ODP operational requirements through Word documents. Authors can export ON/OR/OC definitions to .docx, edit them in Word, and re-import changes back into the ODP database with full version tracking and conflict detection.

## Architecture Overview

The Docx Loop leverages the **existing 3-stage DrG Material Import framework** to ensure consistency across all import pipelines:

```
┌─────────────────────────────────────────────────────────────┐
│                    EXPORT PATHWAY                            │
└─────────────────────────────────────────────────────────────┘

Database (Neo4j)
    ↓
[DocxExportService]
  - Queries entities by DRG
  - Builds hierarchical structure
    ↓
[DocxGenerator]
  - Creates Word document structure
  - Embeds ODP Entity IDs
  - Generates cross-references
  - Formats content with rich text
    ↓
Word Document (.docx)


┌─────────────────────────────────────────────────────────────┐
│                    IMPORT PATHWAY                            │
│            (Reuses DrG Material Import Framework)            │
└─────────────────────────────────────────────────────────────┘

Word Document (.docx)
    ↓
[1. DocxExtractor] - Generic document parser
  - Extracts raw JSON structure
  - Preserves headings, paragraphs, tables
  - Extracts hyperlinks and anchors
  - Converts images (EMF → PNG) for web compatibility
  - Formats text as AsciiDoc with image syntax
    ↓
Raw JSON File
    ↓
[2. ODPMapper] - ODP-specific mapper
  - Maps raw JSON to structured JSON
  - Parses ODP Entity IDs
  - Resolves cross-references
  - Validates consistency
  - Converts AsciiDoc to Quill Delta format
    ↓
Structured JSON File
    ↓
[3. JSONImporter] - Generic database importer (ENHANCED)
  - CREATE: New entities without IDs
  - UPDATE: Existing entities by ID
  - Version conflict detection
  - Relationship management
  - Single transaction with rollback
    ↓
Database (Neo4j)
```

## Design Principles

1. **Reuse Existing Infrastructure**: Leverage proven 3-stage import pipeline (DocxExtractor → Mapper → JSONImporter)
2. **Single Import Pipeline**: All sources (DrG materials + ODP loop) use same JSONImporter
3. **Separation of Concerns**: Generic extraction, specific mapping, generic import
4. **Version-Aware Updates**: Track entity versions for conflict detection
5. **Entity-Centric References**: Relationships target entity IDs, not version IDs

## Entity Identity Model

### ODP Entity ID Format

**Full Identity (for update detection):**
```
{type}:{drg}/{entity-id}[{version-id}]
```

**Examples:**
- `on:idl/1070[5]` - Operational Need #1070, version 5, iDL DrG
- `or:airport/2834[12]` - Operational Requirement #2834, version 12, Airport DrG
- `oc:nm-b2b/445[3]` - Operational Change #445, version 3, NM B2B DrG

**Entity Reference (for relationships):**
```
{type}:{drg}/{entity-id}
```

**Examples:**
- `on:idl/1070` - Reference to ON #1070 (version-agnostic)
- `or:airport/2834` - Reference to OR #2834 (version-agnostic)

### Key Properties

- **Type prefix**: Identifies entity type (on/or/oc)
- **DRG scoping**: Entities belong to specific drafting group
- **Version tracking**: Square brackets contain version ID for updates
- **Reference model**: Relationships use entity ID only (version → entity paradigm)

## Export Flow Detail

### Document Structure

```
┌─────────────────────────────────────────────────────────────┐
│  {DRG Display Name} Operational Needs and Requirements      │  ← Document Title
├─────────────────────────────────────────────────────────────┤
│  1. Operational Needs                                       │  ← Section
│    1.1 Data Quality Management                              │  ← ON Heading
│        ODP ID: on:idl/145[7]                                │  ← Entity Identity
│                                                             │
│        Statement: Ensure all data...                        │  ← Rich text field
│        Rationale: Data quality is critical...               │
│        Stakeholders:                                        │
│          • Network Manager[Primary coordinator]             │  ← Setup element ref
│          • Airport Operators                                │
│        Documents:                                           │
│          • AIRAC Cycle[Reference for timing]                │
│        Implementing ORs:                                    │
│          • Validation Rules (or:idl/512)                    │  ← Entity ref
│          • Data Checks (or:idl/513)                         │
│                                                             │
│    1.2 Network Optimization                                 │  ← Next ON
│        ...                                                  │
│                                                             │
│  2. Operational Requirements                                │  ← Section
│    2.1 Validation Rules                                     │  ← OR Heading
│        ODP ID: or:idl/512[3]                                │
│        ...                                                  │
├─────────────────────────────────────────────────────────────┤
│  Appendix: Setup Elements                                   │  ← Reference catalog
│                                                             │
│  Stakeholders:                                              │
│    • Network Manager                                        │
│    • Airport Operators                                      │
│    • Air Navigation Service Providers                       │
│    ...                                                      │
│                                                             │
│  Documents:                                                 │
│    • AIRAC Cycle                                            │
│    • B2B Service Description                                │
│    ...                                                      │
└─────────────────────────────────────────────────────────────┘
```

### Field Formatting

**Rich Text Fields** (support formatting):
- Statement
- Rationale
- Flows
- Private Notes
- Purpose (OC)
- Details (OC)
- Initial State (OC)
- Final State (OC)

**Supported Formatting:**
- Bold, italic, underline
- Hyperlinks
- Bullet lists (with indent levels)
- Numbered lists (with indent levels)
- Embedded images (converted to PNG for web compatibility)

**Not Supported:**
- Tables
- Complex nested structures beyond lists

### Image Handling

**Export (Word generation):**
- Images stored as Quill Delta image inserts are embedded in Word documents
- PNG format preferred for web compatibility

**Import (Word parsing):**
- Images extracted from Word documents using mammoth.js
- EMF (Enhanced Metafile) images automatically converted to PNG for web compatibility
- Conversion performed using LibreOffice headless mode
- Images embedded inline in text as AsciiDoc syntax: `image::data:image/png;base64,...[]`
- Failed conversions replaced with transparent placeholder image
- Single source of truth: images stored once in paragraph text (no separate image arrays)

### Reference Formatting

**Setup Element References:**
```
Stakeholders:
• Network Manager[Primary coordinator]
• Airport Operators
• ANSP[Implementation responsibility]
```

Format: `<ElementName>[<Optional Note>]`

**Entity Relationships:**
```
Implements ONs:
• Data Quality Management (on:idl/140)
• Network Optimization (on:nm-b2b/223)

Depends On ORs:
• Core Infrastructure (or:idl/512)
```

Format: `<Title> (<EntityID>)` where EntityID omits version

### Cross-Reference Strategy

**Current Implementation**: Plain text with ODP IDs
- Format: `<Title> (<EntityID>)`
- Example: `Data Quality Management (on:idl/140)`
- Simple parsing with regex patterns
- Works with current DocxExtractor
- Authoritative entity references via IDs

**Alternative Approach**: Word cross-reference fields
- Clickable navigation in Word
- Automatic section renumbering
- Requires enhanced link extraction and validation
- Can leverage mammoth.js internal hyperlink support

## Import Flow Detail

### Stage 1: DocxExtractor (Generic)

**Input:** Word document buffer (.docx)

**Processing:**
1. Convert to HTML using mammoth.js
2. Extract document structure:
   - Headings (h1-h6) with hierarchy
   - Paragraphs (with list markers)
   - Tables
   - Images (with EMF → PNG conversion)
3. Convert HTML to AsciiDoc format:
   - Text formatting: `**bold**`, `*italic*`, `__underline__`
   - Lists: `. item` (ordered), `* item` (bullet)
   - Images: `image::data:image/png;base64,...[]`
4. **Image Conversion Process:**
   - Detect `<img src="data:image/x-emf;base64,...">` tags
   - Write EMF data to temporary file
   - Convert using LibreOffice: `libreoffice --headless --convert-to png`
   - Read converted PNG and encode as base64
   - Replace with `image::data:image/png;base64,...[]` syntax
   - Clean up temporary files
   - Fallback to 1x1 transparent PNG on conversion failure
5. Extract hyperlinks and anchors:
   - Link text, href target, position in paragraph
   - Heading bookmark IDs (Word-generated)
   - Full context around links

**Output:** Raw JSON structure

```javascript
{
  documentType: 'word',
  metadata: {
    filename: 'idl-requirements.docx',
    parsedAt: '2025-01-15T10:30:00Z',
    messages: [] // mammoth warnings
  },
  sections: [
    {
      level: 1,
      title: '1. Operational Needs',
      path: ['Operational Needs'],
      anchor: '_Toc123456', // Word bookmark ID
      content: {
        paragraphs: [
          'ODP ID: on:idl/145[7]',
          'Statement: Ensure all data...',
          'image::data:image/png;base64,iVBORw0KGg...[]',  // Embedded PNG image
          'Figure 1 - Process Overview',
          'Stakeholders: Network Manager, Airport Operators'
        ],
        // Link metadata
        links: [
          {
            text: 'Core Infrastructure',
            href: '#_Toc123457',
            position: { start: 45, end: 65 },
            context: 'Depends on Core Infrastructure (or:idl/512)'
          }
        ]
      },
      subsections: [...]
    }
  ]
}
```

**Key Features:**
- Hierarchical section structure (9 levels supported: h1-h9)
- Paragraph-level content with AsciiDoc formatting markers
- Images embedded inline with web-compatible PNG format
- Link preservation for cross-reference validation
- Clean separation of structure vs content

### Stage 2: ODPMapper (ODP-Specific)

**Input:** Raw JSON from DocxExtractor

**Processing:**
1. Identify entity sections (contain "ODP ID:" paragraph)
2. Parse entity identity: `{type}:{drg}/{id}[{version}]`
3. Extract field content by keyword markers:
   - "Statement:" → statement field
   - "Rationale:" → rationale field
   - "Stakeholders:" → stakeholder references
   - "Documents:" → document references
   - "Implements ONs:" → implementedONs array
   - "Depends On ORs:" → dependsOnRequirements array
4. Convert AsciiDoc paragraphs to Quill Delta JSON:
   - Parse inline formatting: `**bold**` → `{insert: "bold", attributes: {bold: true}}`
   - Parse lists: `* item` → `{insert: "item\n", attributes: {list: "bullet"}}`
   - Parse images: `image::data:...[]` → `{insert: {image: "data:image/png;base64,..."}}`
5. Resolve references:
   - Parse entity references: `(on:idl/140)` format
   - Parse setup element references: `ElementName[note]` format
   - Validate external IDs exist or can be created
6. Build structured JSON matching ImportService schema

**Output:** Structured JSON for import

```javascript
{
  drg: 'idl',
  entities: [
    {
      type: 'OperationalNeed',
      externalId: 'on:idl/145[7]',
      title: 'Data Quality Management',
      statement: '{"ops":[{"insert":"Ensure all data..."},{"insert":"\\n"}]}',
      rationale: '{"ops":[{"insert":"Data quality is critical..."},{"insert":"\\n"}]}',
      stakeholders: [
        { externalId: 'stakeholder:network-manager', note: 'Primary coordinator' },
        { externalId: 'stakeholder:airport-operators' }
      ],
      documents: [
        { externalId: 'document:airac-cycle', note: 'Reference for timing' }
      ],
      implementingORs: ['or:idl/512', 'or:idl/513']
    }
  ]
}
```

**Key Transformations:**
- ODP ID parsing → externalId, version tracking
- Reference parsing → structured relationship arrays
- AsciiDoc → Quill Delta JSON (with embedded images)
- Field extraction by keyword markers
- Title normalization and path cleanup

### Stage 3: JSONImporter (Enhanced)

**Input:** Structured JSON payload

**Key Enhancements for Docx Loop:**

1. **Operation Detection:**
```javascript
function determineOperation(entity) {
  if (!entity.externalId) return 'CREATE';
  if (entity.externalId.includes('[')) return 'UPDATE';
  return 'CREATE'; // No version bracket = new entity
}
```

2. **Version Conflict Detection:**
```javascript
function validateVersion(entity, dbEntity) {
  const requestedVersion = extractVersion(entity.externalId);
  const currentVersion = dbEntity.currentVersionId;
  
  if (requestedVersion !== currentVersion) {
    throw new VersionConflictError({
      externalId: entity.externalId,
      requested: requestedVersion,
      current: currentVersion
    });
  }
}
```

3. **Entity Updates:**
- Query existing entity by external ID (without version)
- Validate version matches (if UPDATE)
- Create new version node with incremented version ID
- Update entity's current version pointer
- Preserve full version history

4. **Greedy Error Collection:**
```javascript
async function importEntities(jsonData, userId, force = false) {
  const tx = beginTransaction();
  const results = { created: [], updated: [], errors: [] };
  
  try {
    for (const entity of jsonData.entities) {
      try {
        const operation = determineOperation(entity);
        
        if (operation === 'CREATE') {
          const created = await createEntity(entity, userId, tx);
          results.created.push(created);
        } else {
          const updated = await updateEntity(entity, userId, tx, force);
          results.updated.push(updated);
        }
        
      } catch (error) {
        // Greedy error collection for version conflicts
        if (error instanceof VersionConflictError) {
          results.errors.push({
            entity: entity.externalId || entity.title,
            error: 'VERSION_CONFLICT',
            details: error.message
          });
        } else {
          throw error; // Fail transaction on other errors
        }
      }
    }
    
    // Check for blocking errors
    if (results.errors.length > 0 && !force) {
      throw new BatchImportError(results.errors);
    }
    
    await commitTransaction(tx);
    return results;
    
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

5. **Relationship Handling:**
- Resolves entity references by external ID
- Creates new setup elements if not found
- Updates relationship arrays (replaces, not merges)
- Maintains referential integrity

**Processing:** Single transaction with rollback on error

**Output:** Import results summary

```javascript
{
  success: true,
  stats: {
    created: 5,
    updated: 23,
    errors: 0
  },
  entities: [
    {
      operation: 'UPDATE',
      externalId: 'on:idl/145[7]',
      itemId: 'abc123',
      newVersionId: 8
    },
    {
      operation: 'CREATE',
      title: 'New Validation Rule',
      itemId: 'def456',
      versionId: 1
    }
  ],
  errors: []
}
```

## Rich Text Handling

### Supported Features

**Word Export/Import Support:**
- Plain text
- Bold, italic, underline
- Simple hyperlinks
- Basic bullet lists (single level)
- Embedded images (PNG format)

**Not Yet Supported:**
- Multi-level list nesting
- Complex Quill Delta preservation
- Tables within rich text fields

### Technical Challenge: Quill Delta vs Word

**Problem:**
- ODP stores rich text as **Quill Delta JSON**
- Word uses **native runs/formatting**
- Quill uses **flat indent structure** for lists (ql-indent-1, ql-indent-2)
- Word uses **semantic nested lists** (<ul><li><ul><li>)

**Current Approach:**
- Export: Render Quill Delta to Word formatting
- Import: Parse Word content → AsciiDoc → Quill Delta
- Images: Convert EMF → PNG at extraction time for web compatibility
- Accept some formatting loss on round-trip

**Path to Full Fidelity:**
- Build Delta ↔ Word converters
- Map Quill indent levels to Word list nesting
- Preserve all Quill-supported features including images

### Image Processing Pipeline

**Word → ODP:**
```
Word Document (.docx with EMF images)
    ↓
Mammoth.js extracts: <img src="data:image/x-emf;base64,...">
    ↓
DocxExtractor converts EMF → PNG using LibreOffice
    ↓
AsciiDoc format: image::data:image/png;base64,...[]
    ↓
ODPMapper converts to Quill Delta: {insert: {image: "data:..."}}
    ↓
Stored in Neo4j as Quill Delta JSON
```

**ODP → Word:**
```
Neo4j Quill Delta JSON: {insert: {image: "data:image/png;base64,..."}}
    ↓
DocxGenerator extracts image data
    ↓
Creates Word image element with PNG data
    ↓
Word Document (.docx with PNG images)
```

## Error Handling

### Version Conflicts

**Detection:**
```javascript
// Expected: on:idl/145[7]
// Database has: version 9
// → VERSION_CONFLICT
```

**Resolution Options:**
1. **Reject import** (default): User must resolve manually
2. **Force update** (`--force` flag): Override version check, accept data loss risk
3. **Manual merge**: Export latest, compare changes, re-edit

### Image Conversion Errors

**Handling:**
- EMF conversion failure → Use transparent 1x1 PNG placeholder
- Log conversion errors with image context
- Continue processing document (non-blocking error)
- User notified of placeholder images in import summary

### Validation Errors

**Types:**
- **Blocking**: Malformed external ID, missing required fields
- **Error**: Referenced entity not found, invalid setup element
- **Warning**: Cross-reference mismatch, formatting loss, image conversion failure

**Behavior:**
- Collect all errors greedily
- Fail transaction if blocking errors found
- Continue with warnings (logged in results)

### Greedy Error Collection

```javascript
// Process all entities before failing
for (const entity of entities) {
  try {
    validateAndProcess(entity);
  } catch (error) {
    errors.push({ entity, error });
    // Continue processing
  }
}

if (errors.length > 0 && !force) {
  throw new BatchError(errors); // Rollback transaction
}
```

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "mammoth": "^1.8.0",    // Word → HTML conversion (with image support)
    "docx": "^8.5.0",        // Word document generation
    "quill-delta": "^5.1.0"  // Rich text format (future)
  }
}
```

### System Dependencies
- **LibreOffice**: Required for EMF → PNG image conversion
   - Version: 24.2+ (headless mode)
   - Components: libreoffice-core, libreoffice-draw
   - Purpose: Convert Windows EMF images to web-compatible PNG format
   - Alternative: ImageMagick with libwmf (less reliable for complex EMF files)

### Library Responsibilities
- **mammoth**: Extract document structure, headings, paragraphs, links, anchors, images
- **docx**: Generate Word documents with styles, numbering, bookmarks, images
- **quill-delta**: Rich text serialization (future enhancement)
- **LibreOffice**: EMF → PNG image format conversion

## Configuration

### Mammoth Configuration (DocxExtractor)
```javascript
{
  includeDefaultStyleMap: true,
  styleMap: [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    // ... other styles
  ],
  convertImage: mammoth.images.imgElement(function(image) {
    return image.read("base64").then(function(imageBuffer) {
      return {
        src: "data:" + image.contentType + ";base64," + imageBuffer
      };
    });
  })
}
```

### Docx Library Configuration (DocxGenerator)
```javascript
{
  styles: {
    heading1: { size: 32, bold: true },
    heading2: { size: 28, bold: true },
    fieldLabel: { bold: true },
    fieldContent: { size: 22 }
  },
  numbering: {
    config: [{
      reference: "decimal-numbering",
      levels: [
        { level: 0, format: "decimal", text: "%1." },
        { level: 1, format: "decimal", text: "%1.%2." },
        { level: 2, format: "decimal", text: "%1.%2.%3." }
      ]
    }]
  }
}
```

### LibreOffice Configuration (Image Conversion)
```javascript
{
  command: 'libreoffice --headless --convert-to png',
  timeout: 30000, // 30 seconds per image
  tempDir: './logs',
  fallbackImage: '1x1 transparent PNG base64'
}
```

## Testing Strategy

### Unit Tests
- **DocxExtractor**: Image extraction and conversion, link extraction accuracy, anchor detection, structure preservation
- **ODPMapper**: AsciiDoc → Delta conversion with images, entity ID parsing, reference resolution, field mapping
- **JSONImporter**: Operation detection, version conflict handling, transaction rollback

### Integration Tests
- **Complete round-trip**: Export → Edit (add/modify images) → Import with version increment
- **Image handling**: EMF conversion, PNG preservation, fallback placeholder
- **Version conflicts**: Concurrent edits, forced updates
- **Reference integrity**: Cross-entity relationships, setup element creation
- **Error scenarios**: Malformed IDs, missing entities, validation failures, image conversion failures

### Test Data
- Sample documents per DRG with embedded images
- Edge cases: empty fields, deep nesting, many relationships, complex EMF images
- Invalid scenarios: wrong ID format, missing versions, broken references, corrupt images
- Performance tests: large documents (100+ entities, 50+ images)

## Performance Considerations

### Image Conversion
- LibreOffice startup overhead (~1-2 seconds per conversion)
- Consider batch conversion optimization for multiple images
- Timeout handling for complex EMF files
- Temporary file cleanup to prevent disk space issues

### Streaming
- Process large documents in chunks
- Stream file upload/download
- Progress tracking for long operations

### Caching
- Cache setup element lookups during import
- Cache entity maps during export
- Clear caches after operation completes

### Batch Processing
- Single transaction for all entities
- Greedy error collection before rollback
- Efficient relationship resolution

## Security Considerations

### Input Validation
- Validate file type (must be .docx)
- File size limits (max 50MB)
- Sanitize extracted content
- Validate DRG enum values
- Check user permissions for DRG
- Scan images for malicious content

### Output Sanitization
- Escape special characters in generated documents
- Validate rich text before rendering
- Prevent injection in cross-references
- Sanitize image data URLs

### Temporary File Security
- Use cryptographically random filenames
- Clean up temporary files after conversion
- Restrict file system permissions on temp directory
- Monitor disk space usage