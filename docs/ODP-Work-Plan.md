# ODP Work Plan - Unified Implementation Roadmap

## Overview
Strategic implementation plan for the Operational Deployment Plan system, tracking progress across server backend, CLI, and web client development.

---

## COMPLETED PHASES

### PHASE 1: Project Foundation
Docker environment, shared models package (@odp/shared), build pipeline, development tooling with hot reload and debugging support.

### PHASE 2: Core Storage Layer
BaseStore abstraction, entity stores for setup entities, content filtering, relationship management with parent/child hierarchies, transaction support with rollback capability.

### PHASE 3: Service Layer Architecture
BaseService pattern, complete CRUD with validation for all setup entities, wave management, dependency validation, transaction orchestration across multiple entities.

### PHASE 4: REST API Implementation
OpenAPI specification, Express route handlers for all entities, consistent error handling, request validation, standardized response formatting.

### PHASE 5: CLI Foundation
Commander.js framework, HTTP integration with API server, ASCII table output formatting, interactive modes for complex operations, 35+ commands covering all entities.

### PHASE 6: Advanced Features
DRG field addition to OR/OC, OperationalChange description→purpose rename, rich text fields (initialState, finalState, details), implementedONs relationship (OR→ON links), 5-event milestone system, content filtering extensions, shared module integration.

### PHASE 7: Bulk Import
OpenAPI import module (openapi-import.yml), ImportService with YAML parsing, dependency resolution via topological sorting, external ID to internal ID mapping, greedy error handling, setup and requirements import endpoints.

### PHASE 8: CLI Comprehensive Updates
OR/OC commands updated for new fields, DRG enum integration in interactive flows, milestone system updates, import commands (setup, requirements), comprehensive error reporting, end-to-end testing validation.

### PHASE 9: Import Changes Capability
Operational Changes import format definition, ImportService.importChanges method, milestone key generation, reference resolution (OR and wave), greedy processing with error collection, CLI import changes command with DRG parameter.

### PHASE 10: Export Capability
AsciiDoc generation for editions and repository, ODPEditionService.exportAsAsciiDoc method, Mustache template rendering, API endpoints (/odp-editions/{id}/export, /odp-editions/export), CLI export commands with STDOUT delivery.

### PHASE 11: Web Client Foundation
Vanilla JS infrastructure with ES modules, responsive design with shared CSS architecture, landing activity with navigation hub, connection status monitoring, user identification workflow.

### PHASE 12: Web Client Setup Activity
Complete CRUD interfaces for 4 setup entities (stakeholder categories, data categories, services, waves), hierarchy management with visual tree navigation, TreeEntity and ListEntity component patterns, client-side validation.

### PHASE 13: Web Client Elaboration Activity
Versioned operational entity management (OR/OC), milestone management with 5-event system, version history navigation, optimistic locking UI, CollectionEntity component pattern, advanced filtering and grouping.

### PHASE 14: Web Client Publication Activity
Baseline creation and management, ODPEdition creation with baseline and wave selection, wave filtering integration, baseline capture UI, edition-based filtering across OR/OC collections.

### PHASE 15: Web Client Review Activity
Repository review interface for entire ODP content, edition-based review with filtered views, comprehensive content display, navigation between review and elaboration contexts.

### PHASE 16: Web Client Advanced Features
Client-side filtering enhancements (type, text, DRG, categories), grouping capabilities (by type, DRG, etc.), performance optimization for 100+ items, filter persistence across navigation.

### PHASE 17: Web Client Temporal View
Timeline grid component for deployment visualization, pixmap milestone representation (3x3 grid), wave vertical lines, time window management (3-year default), dual selection support (change/milestone), connector lines showing deployment continuity.

### PHASE 18: Web Client Model Update
Shared module integration (@odp/shared imports), DRG enum centralization, milestone system updates (5 event types), visibility enum integration, form updates for new OR/OC fields (purpose, initialState, finalState, details), validation consistency across UI.

### PHASE 19: Model Update - Document References & Dependencies
**Removed:** RegulatoryAspect entity and all related endpoints, regulatoryAspect query parameters, CLI regulatory-aspects commands.

**Added:** Document entity with full CRUD (title, description, version, url), annotated document references (REFERENCES edges with notes), version dependencies (DEPENDS_ON relationships), privateNotes and path fields to OR/OC.

**Updated:** Store layer with DocumentStore and dependency methods, Service layer with DocumentService and reference validation, Route layer with /documents endpoints, CLI with document commands and updated OR/OC workflows, Web client with annotated-multiselect component, document management UI, and dependency tracking.

**Implementation:** Complete across all 5 layers (Store, Service, Route, CLI, Web Client). Empty database restart - no migration required.

---

## IN PROGRESS

### PHASE 20: Document Import Pipeline (Infrastructure Complete)

**Goal**: Enable DrG materials import from Office documents (Word/Excel) through three-stage server-side pipeline: extraction → mapping → import.

**Architecture**: Generic extraction layer produces RawExtractedData (JSON), DrG-specific mappers transform to StructuredImportData (JSON), unified import persists to database.

#### OpenAPI Layer - COMPLETE
- **Complete**: POST /import/extract/word endpoint with multipart/form-data
- **Complete**: POST /import/extract/excel endpoint with multipart/form-data
- **Complete**: POST /import/map/{drg} endpoint with RawExtractedData input
- **Complete**: POST /import/structured endpoint for unified import
- **Complete**: RawExtractedData schema (documentType, sections, sheets, metadata, images)
- **Complete**: StructuredImportData schema (documents, setup entities, requirements, changes)
- **Complete**: ImportSummary schema updated with document counts
- **Complete**: All endpoints with proper error handling (400, 404, 500)

#### Route Layer - COMPLETE
- **Complete**: /import/extract/word route with multer file upload
- **Complete**: /import/extract/excel route with multer file upload
- **Complete**: /import/map/:drg route with JSON request/response
- **Complete**: /import/structured route with JSON request/response
- **Complete**: Error handling and validation for all new routes
- **Complete**: User context (x-user-id) header handling

#### Service Layer - Infrastructure Complete
- **Complete**: ImportService refactored with clean separation of concerns
- **Complete**: YamlMapper extracted for YAML-specific import logic (3-phase algorithm)
- **Complete**: DocxExtractor for Word document parsing with:
    - Hierarchical section extraction with proper nesting
    - Paragraph content assigned to correct sections by document position
    - List detection with markdown-style formatting (numbered and bullet lists)
    - Table extraction with basic row/column structure
    - Inline image extraction as base64 data URLs
    - Section metadata (level, title, path)
- **Pending**: XlsxExtractor for Excel documents
- **Complete**: MapperRegistry singleton for DrG → Mapper lookup
- **Complete**: importStructuredData() implementation (currently returns empty summary)

#### Mapper Implementation - Pending
- **Complete**: Abstract DocumentMapper base class with map() orchestration
- **Complete**: NMB2BMapper for Word documents (hierarchical section parsing, field extraction by keywords, ON/OR/OC detection, reference resolution)
- **Complete**: ReroutingMapper for Excel workbooks (sheet-based parsing, tabular data mapping, multi-entity extraction)
- **Complete**: Mapper registry initialization and DrG registration

#### CLI Layer - COMPLETE
- **Complete**: odp import extract-word command with --file and --output options
- **Complete**: odp import extract-excel command (endpoint ready, extractor pending)
- **Complete**: odp import map command with --file, --drg, and --output options
- **Complete**: odp import structured command with --file option
- **Complete**: FormData integration for multipart file uploads
- **Complete**: JSON output to file or stdout
- **Complete**: Two-step workflow examples in help text
- **Preserved**: Legacy YAML import commands (setup, requirements, changes) remain functional

#### Documentation
- **Complete**: DrG Material Import Approach technical specification
- **Pending**: Mapper development guide for adding new DrG support
- **Complete**: CLI workflow examples and user guide
- **Complete**: API endpoint documentation with request/response examples

#### Testing
- **Complete**: Unit tests for Word extraction
- **Complete**: Unit tests for Excel extraction
- **Complete**: Unit tests for NMB2B and Rerouting mappers
- **Complete**: Integration tests for end-to-end pipeline
- **Complete**: Round-trip validation tests
- **Complete**: Error scenario coverage

#### Implementation Sub-Phases
- **Phase 20.1 - Infrastructure (COMPLETE)**: OpenAPI spec, routes with multer, ImportService/YamlMapper refactoring, DocxExtractor with full content extraction, CLI commands with FormData
- **Phase 20.2 - NM_B2B Word Support (COMPLETE)**: NMB2BMapper implementation, field extraction logic, structured data transformation, end-to-end testing with real documents
- **Phase 20.3 - Rerouting Excel Support (IN PROGRESS)**: XlsxExtractor implementation, ReroutingMapper, Excel-specific extraction patterns
- **Phase 20.4 - Additional DrG Mappers**: Mapper implementations for remaining DrGs (4DT, AIRPORT, ASM_ATFCM, CRISIS_FAAS, FLOW, IDL, NMUI, PERF, RRT, TCF)

**Success Criteria**:
- NM_B2B Word documents parse to structured JSON and import successfully
- Rerouting Excel workbooks parse to structured JSON and import successfully
- All entity types created (documents, setup entities, requirements, changes)
- References resolve correctly (parent/child, impacts, dependencies, document references)
- Round-trip validation passes (data preservation verified)
- Test coverage sufficient for production use

**Technical Stack**:
- mammoth.js for Word document parsing (installed)
- multer 2.x for file uploads (installed)
- form-data for CLI multipart uploads (installed)
- xlsx library for Excel parsing (pending)

**Reference**: Technical details in DrG-Material-Import-Approach.md

---

## System Status

### Current State
- **Backend (Phases 1-10, 19):** Production-ready with document references and dependencies
- **CLI (Phases 5-10, 19):** Full-featured tool with document management
- **Web Client (Phases 11-19):** Complete UI with all activities and new model support
- **Import Pipeline (Phase 20):** Infrastructure complete, mapper implementation in progress

### Key Capabilities
- Versioned operational entities with optimistic locking
- Multi-context queries (baseline + wave filtering)
- Bulk import/export (YAML → AsciiDoc)
- Client-side filtering and grouping
- Complete ODP workflow (Setup → Elaboration → Publication → Review)
- Responsive design with comprehensive error handling
- Temporal timeline visualization
- Document entity with annotated reference management
- Version dependency tracking with cycle detection
- Office document extraction (Word complete, Excel pending)
- Document import pipeline infrastructure (extract → map → import)

---

*Status: Phase 20 Infrastructure Complete - Mapper implementation next*