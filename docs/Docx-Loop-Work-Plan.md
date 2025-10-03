# Revised Docx-Loop-Work-Plan.md

## Overview
Implementation plan for Word document import/export capability, enabling round-trip conversion between .docx files and the ODP database while preserving document structure and relationships.

## Context
- **Purpose**: Enable drafting groups to continue working in Word documents while the web UI is under development
- **Scope**: Import/export for one DRG at a time
- **Format**: Documents structured like 'NM B2B Operational Needs and Requirements.docx'

## Phase 0: Docx Parse/Write Validation

### 0.1 Basic Infrastructure Setup
- Create `DocxImportExportService` skeleton
- Install dependencies: `mammoth` and `docx`
- Set up basic error handling structure
- Create test fixtures from sample documents

### 0.2 Validation API Endpoints
```yaml
POST /convert/requirements/docx-to-json?drg={DRG}
  Request: multipart/form-data (docx file)
  Response: JSON structure matching import format

POST /convert/requirements/json-to-docx?drg={DRG}  
  Request: JSON payload
  Response: application/vnd.openxmlformats (docx file)
```

### 0.3 DocxImportExportService Implementation
```javascript
class DocxImportExportService {
  constructor() {
    this.parser = new DocxParser();
    this.generator = new DocxGenerator();
  }
  
  async importDocxRequirements(docxBuffer, drg) {
    // Parse docx → structured JSON
    // No DB operations, just transformation
    const parsed = await this.parser.parse(docxBuffer);
    return this.transformToJson(parsed, drg);
  }
  
  async exportDocxRequirements(jsonPayload, drg) {
    // Generate docx from JSON structure
    // No DB queries, just generation
    const hierarchy = this.buildHierarchy(jsonPayload);
    return await this.generator.generate(hierarchy, drg);
  }
}
```

### 0.4 CLI Commands for Validation
```bash
# Convert docx to JSON for inspection
odp convert docx-to-json --file requirements.docx --drg NM_B2B --output requirements.json

# Convert JSON to docx for validation
odp convert json-to-docx --file requirements.json --drg NM_B2B --output requirements.docx
```

### 0.5 Validation Approach
- Test round-trip: docx → JSON → docx → JSON
- Compare JSON structures for data preservation
- Manual inspection of generated Word documents
- Document parsing edge cases and limitations

### 0.6 Phase 0 Deliverables
- Working parser for Word document structure
- JSON output matching expected import schema
- Basic Word document generator
- List of identified issues and edge cases
- Sample JSON outputs for review

## Phase 1: Model & Storage Extensions

### 1.1 Add ReferenceDocument Entity
- Create `ReferenceDocument` model in shared package
- Implement `ReferenceDocumentStore` with CRUD operations
- Create `ReferenceDocumentService` with business logic
- Add API endpoints for reference document management
- Update OpenAPI specifications

### 1.2 Remove Deprecated Fields
- Remove `impactsRegulatoryAspects` from all models
- Update stores, services, and API contracts
- Clean up CLI commands and validation logic

### 1.3 Update References Structure
- Modify `references` field to support DocumentReference array
- Implement reference parsing logic
- Update validation for reference format
- Add reference resolution utilities

## Phase 2: Enhanced Parsing & Generation

### 2.1 Refine DocxParser
- Enhance hierarchical structure detection
- Improve entity boundary detection
- Add robust field extraction patterns
- Implement comprehensive error recovery
- Add support for nested refinements
- Handle empty sections gracefully

### 2.2 Refine DocxGenerator
- Implement consistent style system
- Add proper heading numbering
- Improve markdown to Word conversion
- Handle complex nested structures
- Add table support if needed
- Implement reference formatting

### 2.3 Reference Resolution System
- Build entity maps for lookups
- Implement relative path resolution (`./Title`)
- Implement absolute path resolution (`/Path/To/Title`)
- Add validation for unresolved references
- Create detailed error reporting

## Phase 3: Database Integration

### 3.1 Connect DocxImportExportService to Database
- Modify `importDocxRequirements` to use `ImportService`
- Modify `exportDocxRequirements` to fetch from database
- Add transaction support for imports
- Implement rollback on failures

### 3.2 Production API Endpoints
```yaml
# Replace validation endpoints with:
POST /import/requirements/docx?drg={DRG}
  Request: multipart/form-data (docx file)
  Response: ImportSummary

GET /export/requirements/docx?drg={DRG}
  Response: application/vnd.openxmlformats (docx file)
```

### 3.3 Service Integration
- Connect to OperationalRequirementService
- Connect to OperationalChangeService
- Integrate with setup entity services
- Add DRG filtering logic

## Phase 4: Production CLI Commands

### 4.1 Import Commands
```bash
odp import requirements --drg {DRG} --file {path.docx}
odp import changes --drg {DRG} --file {path.docx}
```

### 4.2 Export Commands
```bash
odp export requirements --drg {DRG} --format docx --output {path.docx}
odp export changes --drg {DRG} --format docx --output {path.docx}
```

### 4.3 CLI Enhancements
- Add progress indicators for long operations
- Implement verbose mode for debugging
- Add dry-run option for validation only
- Include summary statistics in output

## Phase 5: Operational Changes Support

### 5.1 OC-Specific Parsing
- Add OC section detection
- Implement milestone parsing
- Handle wave references
- Parse satisfied/superseded OR lists

### 5.2 OC Export Generation
- Generate OC sections in Word
- Format milestone information
- Include wave associations
- Format OR references properly

## Phase 6: Testing & Quality Assurance

### 6.1 Unit Testing
- Parser field extraction tests
- Generator formatting tests
- Reference resolution tests
- Error handling coverage

### 6.2 Integration Testing
- Complete import/export cycles
- Multi-entity documents
- Cross-reference validation
- DRG filtering verification

### 6.3 Acceptance Testing
- Test with real DRG documents
- Validate with document authors
- Performance testing with large files
- Edge case validation

### 6.4 Round-Trip Validation
- Parse → Generate → Parse comparison
- Structure preservation verification
- Reference integrity checking
- Format fidelity assessment

## Phase 7: Documentation & Rollout

### 7.1 Technical Documentation
- API endpoint specifications
- CLI command reference
- File format requirements
- Architecture documentation

### 7.2 User Guidelines
- Word document structure requirements
- Field formatting instructions
- Reference notation guide
- Common issues and solutions

### 7.3 Training Materials
- Video walkthrough of import/export
- Sample documents for each DRG
- FAQ document
- Troubleshooting guide

## Success Criteria

### Phase 0 Success
- Parse and regenerate sample document
- JSON structure validates against schema
- Manual review confirms structure preservation

### Overall Success
- Import all existing DRG Word documents
- Generate documents matching expected structure
- Preserve all relationships and references
- Maintain rich text formatting
- Complete round-trip without data loss
- User acceptance from DRG representatives

## Risk Mitigation

### Technical Risks
- **Format variations**: Build flexible parser with fallbacks
- **Large documents**: Implement streaming and chunking
- **Complex nesting**: Recursive parsing algorithms
- **Reference ambiguity**: Clear validation messages

### Process Risks
- **User adoption**: Early validation in Phase 0
- **Data quality**: Comprehensive error reporting
- **Performance**: Optimization after Phase 0 validation
- **Compatibility**: Test with multiple Word versions

## Dependencies

### Technical Dependencies
- Node.js environment
- Existing ImportService implementation
- OpenAPI infrastructure
- CLI framework

### External Dependencies
- Sample documents from DRGs
- DRG representative availability for testing
- Word format documentation

## Benefits of Phased Approach

1. **Phase 0 De-risks**: Early validation without database complexity
2. **Incremental Delivery**: Working validation tool before full integration
3. **Early Feedback**: DRGs can review JSON structure early
4. **Parallel Development**: Storage changes can proceed independently
5. **Reduced Rework**: Issues identified before deep integration