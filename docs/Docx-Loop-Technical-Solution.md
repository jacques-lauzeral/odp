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
  - Captures images and formatting
    ↓
Raw JSON File
    ↓
[2. ODPMapper] - ODP-specific mapper
  - Maps raw JSON to structured JSON
  - Parses ODP Entity IDs
  - Resolves cross-references
  - Validates consistency
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

**Not Supported:**
- Tables
- Images
- Complex nested structures beyond lists

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
    - Images
3. **NEW: Extract hyperlinks and anchors**
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
      anchor: '_Toc123456', // NEW: Word bookmark ID
      content: {
        paragraphs: [
          'ODP ID: on:idl/145[7]',
          'Statement: Ensure all data...',
          'Stakeholders: Network Manager, Airport Operators'
        ],
        // NEW: Link metadata
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

**Enhanced Paragraph Structure:**
```javascript
{
  type: 'paragraph',
  content: 'Text with links preserved as plain text',
  isList: false,
  hasImage: false,
  links: [ // NEW PROPERTY - optional
    {
      text: 'Link display text',
      href: '#bookmark_id', // Internal anchor or external URL
      position: { start: 10, end: 30 }, // Character offsets
      context: 'Full sentence or list item containing link'
    }
  ]
}
```

**Enhanced Heading Structure:**
```javascript
{
  type: 'heading',
  level: 2,
  content: '1.2.3 Section Title',
  anchor: '_Toc123456' // NEW PROPERTY - Word bookmark ID or null
}
```

### Stage 2: ODPMapper (ODP-Specific)

**Input:** Raw JSON from DocxExtractor

**Processing:**
1. **Identify entity boundaries:**
    - Parse section hierarchy
    - Detect ON/OR/OC definitions by structure

2. **Extract entity identity:**
    - Parse ODP ID: `on:idl/145[7]` → `{type: 'on', drg: 'idl', entityId: '145', versionId: '7'}`
    - Determine operation: ID present = UPDATE, absent = CREATE

3. **Parse field content:**
    - Extract labeled fields (Statement:, Rationale:, etc.)
    - Preserve rich text formatting (convert to Quill Delta)
    - Handle multi-line content

4. **Resolve references:**
    - **Setup elements**: Parse `<Name>[<Note>]` format
        - Extract from appendix if new
        - Match to existing by name
    - **Entity relationships**: Parse `(<EntityID>)` format
        - Extract entity IDs from parentheses
        - Validate IDs follow format rules
        - **OPTIONAL**: Cross-check link targets if anchor data available

5. **Validate consistency:**
    - Version ID matches for updates
    - Referenced entities exist or flagged as new
    - Required fields present
    - Cross-reference integrity (if link data available)

**Validation Examples:**
```javascript
// Entity reference with optional link validation
{
  text: 'Core Infrastructure',
  odpId: 'or:idl/512',
  linkTarget: '#_Toc123457', // From links array
  warning: null // Or 'Link target mismatch' if validation fails
}

// Setup element reference
{
  name: 'Network Manager',
  note: 'Primary coordinator',
  matchType: 'existing' | 'new',
  setupElementId: 'stakeholder:network-manager' // If existing
}
```

**Output:** Structured JSON (ODP schema)

```javascript
{
  metadata: {
    drg: 'idl',
    importType: 'odp-loop',
    importedAt: '2025-01-15T10:35:00Z',
    validationWarnings: [
      {
        entityId: 'on:idl/145',
        field: 'implementingORs',
        message: 'Referenced entity or:idl/999 not found in document or database',
        severity: 'warning'
      }
    ]
  },
  entities: [
    {
      // UPDATE operation (has externalId)
      externalId: 'on:idl/145[7]',
      type: 'ON',
      drg: 'idl',
      title: 'Data Quality Management',
      path: ['Operational Needs'],
      statement: { ops: [...] }, // Quill Delta
      rationale: { ops: [...] },
      impactsStakeholderCategories: [
        { id: 'stakeholder:network-manager', note: 'Primary coordinator' },
        { id: 'stakeholder:airport-operators', note: null }
      ],
      references: [...],
      implementingORs: [
        { id: 'or:idl/512' },
        { id: 'or:idl/513' }
      ]
    },
    {
      // CREATE operation (no externalId)
      type: 'OR',
      drg: 'idl',
      title: 'New Validation Rule',
      statement: { ops: [...] },
      implementedONs: [
        { id: 'on:idl/145' }
      ]
    }
  ]
}
```

### Stage 3: JSONImporter (Enhanced)

**Input:** Structured JSON from ODPMapper

**Enhancements for ODP Loop:**

1. **Operation Detection:**
```javascript
function determineOperation(entity) {
  if (entity.externalId && entity.externalId.includes('[')) {
    return 'UPDATE'; // Has entity ID with version
  } else {
    return 'CREATE'; // No external ID
  }
}
```

2. **Update Logic:**
```javascript
async function updateEntity(entity, userId, tx, force = false) {
  // Parse external ID
  const { type, drg, entityId, versionId } = parseExternalId(entity.externalId);
  
  // Retrieve existing entity
  const existing = await store.findByExternalId(`${type}:${drg}/${entityId}`, tx);
  
  if (!existing) {
    throw new Error(`Entity ${entity.externalId} not found`);
  }
  
  // Version conflict detection
  if (!force && existing.versionId !== versionId) {
    throw new VersionConflictError({
      expected: versionId,
      actual: existing.versionId,
      entity: entity.externalId
    });
  }
  
  // Update entity fields (preserves unchanged fields)
  const updated = await store.update(existing.itemId, entity, userId, tx);
  
  return updated;
}
```

3. **Force Flag:**
- CLI parameter: `--force`
- Overrides version mismatch errors
- Updates entity regardless of version
- Use with caution (potential data loss)

4. **Transaction Management:**
```javascript
async function importStructuredJson(jsonData, userId, force = false) {
  const tx = createTransaction(userId);
  const results = {
    created: [],
    updated: [],
    errors: []
  };
  
  try {
    // Process each entity
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

**Not Yet Supported:**
- Multi-level list nesting
- Complex Quill Delta preservation
- Tables within rich text fields
- Full Delta → Word → Delta round-trip

### Technical Challenge: Quill Delta vs Word

**Problem:**
- ODP stores rich text as **Quill Delta JSON**
- Word uses **native runs/formatting**
- Quill uses **flat indent structure** for lists (ql-indent-1, ql-indent-2)
- Word uses **semantic nested lists** (<ul><li><ul><li>)

**Current Approach:**
- Export: Render Quill Delta to plain/simple formatted text
- Import: Parse simple formatted text (no complex structure preservation)
- Accept some formatting loss on round-trip

**Path to Full Fidelity:**
- Build Delta ↔ Word converters
- Map Quill indent levels to Word list nesting
- Preserve all Quill-supported features

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

### Validation Errors

**Types:**
- **Blocking**: Malformed external ID, missing required fields
- **Error**: Referenced entity not found, invalid setup element
- **Warning**: Cross-reference mismatch, formatting loss

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
    "mammoth": "^1.8.0",    // Word → HTML conversion (with internal link support)
    "docx": "^8.5.0",        // Word document generation
    "quill-delta": "^5.1.0"  // Rich text format (future)
  }
}
```

### Library Responsibilities
- **mammoth**: Extract document structure, headings, paragraphs, links, anchors
- **docx**: Generate Word documents with styles, numbering, bookmarks
- **quill-delta**: Rich text serialization (future enhancement)

## Configuration

### Mammoth Configuration (DocxExtractor)
```javascript
{
  includeDefaultStyleMap: false,
  styleMap: [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    // ... other styles
  ],
  convertImage: mammoth.images.imgElement(...)
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

## Testing Strategy

### Unit Tests
- **DocxExtractor**: Link extraction accuracy, anchor detection, structure preservation
- **ODPMapper**: Entity ID parsing, reference resolution, field mapping
- **JSONImporter**: Operation detection, version conflict handling, transaction rollback

### Integration Tests
- **Complete round-trip**: Export → Edit → Import with version increment
- **Version conflicts**: Concurrent edits, forced updates
- **Reference integrity**: Cross-entity relationships, setup element creation
- **Error scenarios**: Malformed IDs, missing entities, validation failures

### Test Data
- Sample documents per DRG
- Edge cases: empty fields, deep nesting, many relationships
- Invalid scenarios: wrong ID format, missing versions, broken references
- Performance tests: large documents (100+ entities)

## Performance Considerations

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

### Output Sanitization
- Escape special characters in generated documents
- Validate rich text before rendering
- Prevent injection in cross-references