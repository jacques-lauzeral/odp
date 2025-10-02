# Docx-Loop-Technical-Solution.md

## Architecture Overview

The Word document import/export system enables round-trip conversion between structured .docx files and the ODP database, preserving hierarchical organization and cross-references.

## Design Principles

1. **Leverage Existing Infrastructure**: Reuse ImportService and existing YAML import capabilities
2. **Maintain Separation of Concerns**: Parser, generator, and orchestration as separate components
3. **Progressive Enhancement**: Start with basic functionality, add formatting refinements iteratively
4. **Error Resilience**: Continue processing on errors, collect comprehensive reports

## Component Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer                            │
│  POST /import/requirements/docx   GET /export/docx      │
└────────────────┬────────────────────────┬───────────────┘
                 │                        │
┌────────────────▼────────────────────────▼───────────────┐
│              DocxImportExportService                    │
│  - Orchestrates import/export workflows                 │
│  - Handles DRG filtering                                │
│  - Manages reference resolution                         │
└──────┬─────────────────────────────────────┬────────────┘
       │                                     │
┌──────▼──────────┐                 ┌───────▼────────────┐
│   DocxParser    │                 │  DocxGenerator     │
│  - Word → Data  │                 │  - Data → Word     │
│  - Mammoth.js   │                 │  - docx library    │
└──────┬──────────┘                 └───────▲────────────┘
       │                                     │
┌──────▼──────────────────────────────────────┴───────────┐
│              Existing Services                          │
│  - ImportService                                        │
│  - OperationalRequirementService                        │
│  - OperationalChangeService                             │
└──────────────────────────────────────────────────────────┘
```

## Data Flow

### Import Flow
```
Word Document (.docx)
    ↓
DocxParser.parse()
    ├─> Extract structure (headings → paths)
    ├─> Identify entities (ONs/ORs/OCs)
    ├─> Parse fields (statement, rationale, etc.)
    └─> Extract references
    ↓
Transform to YAML structure
    ├─> Build externalId from path + title
    ├─> Map fields to schema
    └─> Preserve reference formats
    ↓
ImportService.importRequirements()
    ├─> Resolve references to itemIds
    ├─> Validate relationships
    └─> Create/update entities
    ↓
Database
```

### Export Flow
```
Database
    ↓
Query by DRG
    ├─> Fetch requirements
    ├─> Fetch changes
    └─> Fetch related setup entities
    ↓
Build hierarchical structure
    ├─> Group by paths
    ├─> Organize by type (ONs/ORs/OCs)
    └─> Sort within sections
    ↓
DocxGenerator.generate()
    ├─> Create document structure
    ├─> Apply styles
    ├─> Convert markdown to Word
    └─> Format references
    ↓
Word Document (.docx)
```

## Document Structure Model

### Hierarchical Organization
```javascript
{
  sections: [
    {
      title: "Technical Aspects",
      path: ["Technical Aspects"],
      subsections: [
        {
          title: "Service Lifecycle",
          path: ["Technical Aspects", "Service Lifecycle"],
          ons: [...],
          ors: [...],
          subsections: [...]
        }
      ],
      ocs: [...]
    }
  ]
}
```

### Entity Identification Pattern
- Sections containing keyword "ONs" → ON entities
- Sections containing keyword "ORs" → OR entities
- Sections containing keyword "OCs" → OC entities
- Entity title = section heading under keyword section
- Entity fields = formatted content within section

## Reference Resolution

### Path-Based References
```javascript
class ReferenceResolver {
  constructor() {
    this.entityMap = new Map(); // "path/title" -> itemId
  }
  
  buildMap(entities) {
    entities.forEach(e => {
      const key = [...e.path, e.title].join('/');
      this.entityMap.set(key, e.itemId);
    });
  }
  
  resolve(reference, currentPath) {
    if (reference.startsWith('./')) {
      // Relative: same path
      const title = reference.slice(2);
      const key = [...currentPath, title].join('/');
      return this.entityMap.get(key);
    } else if (reference.startsWith('/')) {
      // Absolute: full path
      const key = reference.slice(1);
      return this.entityMap.get(key);
    }
  }
}
```

### Document References
```javascript
parseReferences(text) {
  const pattern = /^(.+?)\s+(\S+)\s*\/\s*(.+)$/;
  return text.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(pattern);
      if (match) {
        return {
          referenceDocument: match[1].trim(),
          referenceDocumentVersion: match[2],
          referenceDocumentSection: match[3]
        };
      }
    });
}
```

## Field Mapping Specifications

### ON/OR Common Fields
| Word Field | Model Field | Processing |
|------------|-------------|------------|
| Section title | `title` | Direct mapping |
| Statement: | `statement` | Markdown preservation |
| Rationale: | `rationale` | Markdown preservation |
| References: | `references` | Parse to DocumentReference array |
| Flows: | `flows` | Markdown preservation |
| Flow Examples: | `flows` | Append to flows field |

### OR-Specific Fields
| Word Field | Model Field | Processing |
|------------|-------------|------------|
| Implemented ONs: | `implementedONs[]` | Resolve path references |
| Impacts Stakeholders: | `impactsStakeholderCategories[]` | Resolve by name |
| Impacts Data: | `impactsData[]` | Resolve by name |
| Impacts Services: | `impactsServices[]` | Resolve by name |

### OC Fields
| Word Field | Model Field | Processing |
|------------|-------------|------------|
| Purpose: | `purpose` | Markdown preservation |
| Initial State: | `initialState` | Markdown preservation |
| Final State: | `finalState` | Markdown preservation |
| Details: | `details` | Markdown preservation |
| Satisfied ORs: | `satisfiesRequirements[]` | Resolve path references |
| Superseded ORs: | `supersedsRequirements[]` | Resolve path references |

## Error Handling Strategy

### Import Errors
```javascript
class ImportErrorCollector {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  
  addError(entity, field, message) {
    this.errors.push({
      path: entity.path.join('/'),
      title: entity.title,
      field,
      message,
      severity: 'error'
    });
  }
  
  addWarning(entity, field, message) {
    // Similar for warnings
  }
  
  hasBlockingErrors() {
    return this.errors.some(e => e.severity === 'blocking');
  }
}
```

### Error Types
- **Blocking**: Malformed document structure
- **Error**: Missing required fields, invalid references
- **Warning**: Deprecated fields, formatting issues

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "mammoth": "^1.6.0",
    "docx": "^8.5.0",
    "yaml": "^2.3.0"
  }
}
```

### Library Responsibilities
- **mammoth**: Word to HTML/Markdown conversion
- **docx**: Programmatic Word document generation
- **yaml**: YAML serialization (reuse existing)

## Configuration

### Parser Configuration
```javascript
const parserConfig = {
  styleMap: [
    "p[style-name='Heading 1'] => h1",
    "p[style-name='Heading 2'] => h2",
    "p[style-name='Heading 3'] => h3",
    "p[style-name='Heading 4'] => h4"
  ],
  preserveTables: true,
  preserveImages: true
};
```

### Generator Configuration
```javascript
const generatorConfig = {
  styles: {
    heading1: { size: 32, bold: true },
    heading2: { size: 28, bold: true },
    heading3: { size: 24, bold: true },
    heading4: { size: 20, bold: true },
    fieldLabel: { bold: true },
    fieldContent: { size: 22 }
  },
  numbering: {
    reference: "decimal",
    levels: [...]
  }
};
```

## Performance Considerations

### Streaming for Large Documents
- Use streams for file upload/download
- Process documents in chunks where possible
- Implement progress tracking for long operations

### Caching Strategy
- Cache reference resolutions during import
- Cache entity maps during export
- Clear caches after operation completes

## Security Considerations

### Input Validation
- Validate file type and size limits
- Sanitize extracted text content
- Validate DRG parameter against enum
- Check user permissions for DRG access

### Output Sanitization
- Escape special characters in generated documents
- Validate markdown before conversion
- Limit document size to prevent DoS

## Testing Strategy

### Unit Tests
- Field extraction accuracy
- Reference resolution logic
- Markdown/Word conversion fidelity
- Error handling paths

### Integration Tests
- Complete import/export cycles
- Multi-entity documents
- Cross-reference validation
- DRG filtering accuracy

### Test Data
- Sample documents for each DRG
- Edge cases (empty fields, deep nesting)
- Invalid reference scenarios
- Large document performance tests