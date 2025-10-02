# Docx-Loop-Work-Plan.md

## Overview
Implementation plan for Word document import/export capability, enabling round-trip conversion between .docx files and the ODP database while preserving document structure and relationships.

## Context
- **Purpose**: Enable drafting groups to continue working in Word documents while the web UI is under development
- **Scope**: Import/export for one DRG at a time
- **Format**: Documents structured like 'NM B2B Operational Needs and Requirements.docx'

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
- Clean up CLI commands

### 1.3 Update References Structure
- Modify `references` field to support structured DocumentReference array
- Update validation logic for reference format
- Implement reference resolution in services

## Phase 2: Core Parsing Infrastructure

### 2.1 DocxParser Implementation
- Set up mammoth.js for Word to Markdown conversion
- Implement hierarchical structure detection from headings
- Create entity extraction logic for ONs/ORs/OCs
- Build path-based reference resolution
- Add field mapping for all entity types
- Implement reference document parsing

### 2.2 DocxGenerator Implementation
- Set up docx library for Word generation
- Create style definitions for consistent formatting
- Implement hierarchy reconstruction from paths
- Add markdown to Word format conversion
- Create entity section builders for each type
- Implement reference formatting

## Phase 3: Service Layer Integration

### 3.1 DocxImportExportService
- Create orchestration service
- Integrate with existing ImportService
- Connect to OperationalRequirementService and OperationalChangeService
- Implement error handling and validation
- Add progress tracking for large documents

### 3.2 Reference Resolution
- Build entity maps for path-based lookups
- Implement relative and absolute path resolution
- Create reference validation logic
- Handle missing reference errors gracefully

## Phase 4: API Layer

### 4.1 Import Endpoints
- `POST /import/requirements/docx?drg={DRG}`
- `POST /import/changes/docx?drg={DRG}`
- Add multer middleware for file upload
- Implement request validation
- Create response formatting

### 4.2 Export Endpoints
- `GET /export/requirements/docx?drg={DRG}`
- `GET /export/changes/docx?drg={DRG}`
- Implement streaming response for large documents
- Add proper content-type headers
- Create download filename formatting

### 4.3 OpenAPI Updates
- Add new endpoints to import/export modules
- Define request/response schemas
- Document file format requirements
- Update API documentation

## Phase 5: CLI Integration

### 5.1 Import Commands
```bash
odp import requirements --drg {DRG} --file {path.docx}
odp import changes --drg {DRG} --file {path.docx}
```

### 5.2 Export Commands
```bash
odp export requirements --drg {DRG} --format docx --output {path.docx}
odp export changes --drg {DRG} --format docx --output {path.docx}
```

### 5.3 CLI Enhancements
- Add progress bars for import/export operations
- Implement verbose mode for debugging
- Create dry-run option for validation
- Add format conversion utilities

## Phase 6: Testing & Validation

### 6.1 Round-Trip Testing
- Parse → Generate → Parse → Compare cycles
- Validate structure preservation
- Test reference resolution accuracy
- Verify markdown/formatting fidelity

### 6.2 DRG-Specific Testing
- Test with NM B2B document structure
- Validate with other DRG formats
- Test edge cases (empty sections, missing fields)
- Performance testing with large documents

### 6.3 Integration Testing
- End-to-end import/export workflows
- Multi-user concurrent operations
- Error recovery scenarios
- API and CLI integration tests

## Phase 7: Documentation & Training

### 7.1 Technical Documentation
- API endpoint documentation
- CLI command reference
- File format specifications
- Troubleshooting guide

### 7.2 User Documentation
- Word document formatting guidelines
- Import/export workflow guide
- Reference formatting instructions
- Common error resolutions

## Success Criteria
- Successfully import existing DRG Word documents
- Generate Word documents that match expected structure
- Preserve all relationships and references
- Maintain formatting and rich text content
- Complete round-trip without data loss

## Risk Mitigation
- **Format variations**: Build flexible parser with fallback strategies
- **Reference ambiguity**: Implement validation with clear error messages
- **Performance**: Use streaming for large documents
- **Data integrity**: Validate all references before committing to database

---
