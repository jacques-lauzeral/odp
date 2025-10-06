# ODP Work Plan - Unified Implementation Roadmap

## Overview
Strategic implementation plan for the Operational Deployment Plan system, tracking progress across server backend, CLI, and web client development.

---

## ✅ COMPLETED PHASES

### ✅ PHASE 1: Project Foundation
Docker environment, shared models package (@odp/shared), build pipeline, development tooling with hot reload and debugging support.

### ✅ PHASE 2: Core Storage Layer
BaseStore abstraction, entity stores for setup entities, content filtering, relationship management with parent/child hierarchies, transaction support with rollback capability.

### ✅ PHASE 3: Service Layer Architecture
BaseService pattern, complete CRUD with validation for all setup entities, wave management, dependency validation, transaction orchestration across multiple entities.

### ✅ PHASE 4: REST API Implementation
OpenAPI specification, Express route handlers for all entities, consistent error handling, request validation, standardized response formatting.

### ✅ PHASE 5: CLI Foundation
Commander.js framework, HTTP integration with API server, ASCII table output formatting, interactive modes for complex operations, 35+ commands covering all entities.

### ✅ PHASE 6: Advanced Features
DRG field addition to OR/OC, OperationalChange description→purpose rename, rich text fields (initialState, finalState, details), implementedONs relationship (OR→ON links), 5-event milestone system, content filtering extensions, shared module integration.

### ✅ PHASE 7: Bulk Import
OpenAPI import module (openapi-import.yml), ImportService with YAML parsing, dependency resolution via topological sorting, external ID to internal ID mapping, greedy error handling, setup and requirements import endpoints.

### ✅ PHASE 8: CLI Comprehensive Updates
OR/OC commands updated for new fields, DRG enum integration in interactive flows, milestone system updates, import commands (setup, requirements), comprehensive error reporting, end-to-end testing validation.

### ✅ PHASE 9: Import Changes Capability
Operational Changes import format definition, ImportService.importChanges method, milestone key generation, reference resolution (OR and wave), greedy processing with error collection, CLI import changes command with DRG parameter.

### ✅ PHASE 10: Export Capability
AsciiDoc generation for editions and repository, ODPEditionService.exportAsAsciiDoc method, Mustache template rendering, API endpoints (/odp-editions/{id}/export, /odp-editions/export), CLI export commands with STDOUT delivery.

### ✅ PHASE 11: Web Client Foundation
Vanilla JS infrastructure with ES modules, responsive design with shared CSS architecture, landing activity with navigation hub, connection status monitoring, user identification workflow.

### ✅ PHASE 12: Web Client Setup Activity
Complete CRUD interfaces for 4 setup entities (stakeholder categories, data categories, services, waves), hierarchy management with visual tree navigation, TreeEntity and ListEntity component patterns, client-side validation.

### ✅ PHASE 13: Web Client Elaboration Activity
Versioned operational entity management (OR/OC), milestone management with 5-event system, version history navigation, optimistic locking UI, CollectionEntity component pattern, advanced filtering and grouping.

### ✅ PHASE 14: Web Client Publication Activity
Baseline creation and management, ODPEdition creation with baseline and wave selection, wave filtering integration, baseline capture UI, edition-based filtering across OR/OC collections.

### ✅ PHASE 15: Web Client Review Activity
Repository review interface for entire ODP content, edition-based review with filtered views, comprehensive content display, navigation between review and elaboration contexts.

### ✅ PHASE 16: Web Client Advanced Features
Client-side filtering enhancements (type, text, DRG, categories), grouping capabilities (by type, DRG, etc.), performance optimization for 100+ items, filter persistence across navigation.

### ✅ PHASE 17: Web Client Temporal View
Timeline grid component for deployment visualization, pixmap milestone representation (3x3 grid), wave vertical lines, time window management (3-year default), dual selection support (change/milestone), connector lines showing deployment continuity.

### ✅ PHASE 18: Web Client Model Update
Shared module integration (@odp/shared imports), DRG enum centralization, milestone system updates (5 event types), visibility enum integration, form updates for new OR/OC fields (purpose, initialState, finalState, details), validation consistency across UI.

---

## 🚧 PHASE 19: Model Update - Document References & Dependencies

### Overview
Remove deprecated RegulatoryAspect entity, introduce Document entity with structured references, add version dependencies (DEPENDS_ON), update operational entity fields, remove deprecated relationships. Empty database restart - no migration scripts required.

**Documentation Status:** ✅ **COMPLETE**
- ✅ Storage-Model.md updated
- ✅ Store-Layer-Design-Overview.md updated
- ✅ Store-Layer-API-Setup.md updated
- ✅ Store-Layer-API-Operational.md updated
- ✅ Store-Layer-API.md updated
- ✅ Store-Layer-API-Core.md updated
- ✅ Store-Layer-Design-Implementation.md updated
- ✅ openapi-base.yml updated
- ✅ openapi-setup.yml updated

**Implementation Status:** ⬜ **PENDING** - No code changes implemented yet

### Model Changes Summary

**Removed:**
- RegulatoryAspect entity (complete removal from all layers)
- OR fields: `references`, `flowExamples`, `risksAndOpportunities`
- OR relationship: `impactsRegulatoryAspects`
- Milestone field: `status`
- All `HAS_ATTACHMENT` relationships

**Added:**
- Document entity (name, version, description, url)
- Document references via REFERENCES edge with optional note property
- OR/OC fields: `privateNotes`, `path` (array of strings)
- OC fields: `initialState`, `finalState`, `details`
- Version dependencies: DEPENDS_ON relationships (version-to-item, follows latest version automatically)

**Updated:**
- OC: `description` → `purpose`
- Document reference pattern: Direct edge with note property (no intermediate entity)

---

### Layer 0: Shared Module (@odp/shared)

#### Remove
- ❌ RegulatoryAspect type definitions (if any exist)
- ❌ RegulatoryAspect-related validation helpers

#### Add
- ⬜ Document type definition: `{ id: string, name: string, version?: string, description?: string, url?: string }`
- ⬜ DocumentRequest type definition: `{ name: string, version?: string, description?: string, url?: string }`
- ⬜ DocumentReference type definition: `{ documentId: string, note?: string }`

#### Update
- ⬜ OperationalRequirement type: remove `references`, `flowExamples`, `risksAndOpportunities`, `impactsRegulatoryAspects`
- ⬜ OperationalRequirement type: add `privateNotes`, `path`, `documentReferences`, `dependsOnRequirements`
- ⬜ OperationalRequirementRequest type: update to match new fields
- ⬜ OperationalChange type: rename `description` → `purpose`
- ⬜ OperationalChange type: add `initialState`, `finalState`, `details`, `privateNotes`, `path`, `documentReferences`, `dependsOnChanges`
- ⬜ OperationalChangeRequest type: update to match new fields
- ⬜ Milestone type: remove `status` field
- ⬜ MilestoneRequest type: remove `status` field
- ⬜ Validation helpers: update for new field structures

**Testing:** Type checking compilation, validation helper unit tests

---

### Layer 1: Store Layer (Server Backend)

#### Remove
- ❌ RegulatoryAspectStore class and accessor function
- ❌ `regulatoryAspect` from store initialization in initializeStores()

#### Add
- ⬜ DocumentStore class (extends BaseStore)
- ⬜ Document entity model: `{id, name, version, description, url}`
- ⬜ `documentStore()` accessor function
- ⬜ Document in store initialization

#### Update OperationalRequirementStore
- ⬜ Remove fields: `references`, `flowExamples`, `risksAndOpportunities`
- ⬜ Remove relationship methods: `impactsRegulatoryAspects` array handling
- ⬜ Add fields: `privateNotes`, `path` (array of strings)
- ⬜ Add method: `_createDocumentReferences(versionId, documentReferences, transaction)` - creates REFERENCES edges with note property
- ⬜ Add method: `findDocumentReferences(versionId, transaction)` - returns `{documentId, name, version, note}[]`
- ⬜ Add method: `findDependentVersions(versionId, transaction)` - returns versions depending on this one
- ⬜ Add method: `findDependencyVersions(versionId, transaction)` - returns versions this depends on
- ⬜ Add relationship handling: DEPENDS_ON to OperationalRequirementVersion (version-to-item, follows latest version automatically)
- ⬜ Update `create()` and `update()` methods to handle document references and dependencies

#### Update OperationalChangeStore
- ⬜ Rename field: `description` → `purpose`
- ⬜ Add fields: `initialState`, `finalState`, `details`, `privateNotes`, `path`
- ⬜ Remove milestone field: `status` from milestone handling
- ⬜ Add method: `_createDocumentReferences(versionId, documentReferences, transaction)`
- ⬜ Add method: `findDocumentReferences(versionId, transaction)`
- ⬜ Add method: `findDependentVersions(versionId, transaction)`
- ⬜ Add method: `findDependencyVersions(versionId, transaction)`
- ⬜ Add relationship handling: DEPENDS_ON to OperationalChangeVersion (version-to-item, follows latest version automatically)
- ⬜ Update `create()` and `update()` methods to handle document references and dependencies

**Testing:** Manual verification via Neo4j browser - verify node/relationship structure, test CRUD operations

---

### Layer 2: Service Layer (Server Backend)

#### Remove
- ❌ RegulatoryAspectService class
- ❌ `regulatoryAspectService()` accessor function
- ❌ Regulatory aspect validation logic from all services

#### Add
- ⬜ DocumentService class (extends BaseService)
- ⬜ Document CRUD operations (create, findById, findAll, update, delete)
- ⬜ Document validation (name required, optional fields validation)
- ⬜ Document reference validation helper (ensure document exists before creating reference)

#### Update OperationalRequirementService
- ⬜ Remove field mappings: `references`, `flowExamples`, `risksAndOpportunities`, `impactsRegulatoryAspects`
- ⬜ Add field mappings: `privateNotes`, `path`, `documentReferences`, `dependsOnRequirements`
- ⬜ Add validation: document reference validation (check document IDs exist)
- ⬜ Add validation: dependency cycle detection (prevent circular DEPENDS_ON)
- ⬜ Update content filtering: remove `flowExamples`, `references`, `risksAndOpportunities` from text search
- ⬜ Update content filtering: add `privateNotes` to text search
- ⬜ Update request/response mapping for new fields

#### Update OperationalChangeService
- ⬜ Rename field mapping: `description` → `purpose`
- ⬜ Add field mappings: `initialState`, `finalState`, `details`, `privateNotes`, `path`, `documentReferences`, `dependsOnChanges`
- ⬜ Remove milestone field mapping: `status`
- ⬜ Add validation: document reference validation
- ⬜ Add validation: dependency cycle detection
- ⬜ Update content filtering: add `initialState`, `finalState`, `details`, `privateNotes` to text search
- ⬜ Update request/response mapping for new fields

#### Update Content Filtering (Both Services)
- ❌ Remove `regulatoryAspect` filter parameter from findAll methods

**Testing:** Manual service layer verification - test create/update operations, verify validation works, test filtering

---

### Layer 3: Route Layer (Server Backend)

#### Remove
- ❌ `/regulatory-aspects` GET, POST routes
- ❌ `/regulatory-aspects/{id}` GET, PUT, DELETE routes
- ❌ `regulatoryAspect` query parameter from OR/OC filter endpoints

#### Add
- ⬜ `/documents` GET, POST routes in openapi-setup.yml and routes file
- ⬜ `/documents/{id}` GET, PUT, DELETE routes
- ⬜ Document route handlers (list, get, create, update, delete)

#### Update OR/OC Routes
- ⬜ Update request payload handling for new fields
- ⬜ Update response payload mapping for new fields
- ⬜ Remove `regulatoryAspect` from query parameter parsing in findAll endpoints
- ⬜ Add document reference handling in create/update payloads
- ⬜ Add dependency handling in create/update payloads

#### Update OpenAPI Specifications
- ✅ openapi-base.yml schemas updated (already done)
- ✅ openapi-setup.yml routes updated (already done)

**Testing:** Manual API testing with Postman/curl - test all CRUD operations, verify payloads, test filtering

---

### Layer 4: CLI (Command-Line Interface)

#### Remove
- ❌ `odp regulatory-aspects` command group
- ❌ All regulatory aspect subcommands (list, get, create, update, delete)
- ❌ `--regulatory-aspect` filter option from OR/OC list commands

#### Add Document Commands
- ⬜ `odp documents` command group
- ⬜ `odp documents list` - list all documents with table output
- ⬜ `odp documents get <id>` - get document details
- ⬜ `odp documents create` - create new document (interactive prompts)
- ⬜ `odp documents update <id>` - update document
- ⬜ `odp documents delete <id>` - delete document

#### Update OR Commands
- ⬜ Remove options: `--references`, `--flow-examples`, `--risks-opportunities`
- ⬜ Add options: `--private-notes`, `--path` (comma-separated)
- ⬜ Add interactive document reference management (add/edit/remove references with notes)
- ⬜ Add interactive dependency management (select requirement versions)
- ⬜ Update display format to show new fields
- ⬜ Update list command to show document reference counts

#### Update OC Commands
- ⬜ Rename option: `--description` → `--purpose`
- ⬜ Add options: `--initial-state`, `--final-state`, `--details`, `--private-notes`, `--path`
- ⬜ Remove milestone option: `--status`
- ⬜ Add interactive document reference management
- ⬜ Add interactive dependency management (select change versions)
- ⬜ Update display format to show new fields
- ⬜ Update list command to show document reference counts

#### Update Import/Export
- ⬜ Update YAML import format documentation (remove regulatory aspects, add documents)
- ⬜ Update import parsing to handle document references
- ⬜ Update export templates to include document references with notes

#### Update Filters
- ❌ Remove `--regulatory-aspect` filter from OR/OC list commands
- ⬜ Update help text to reflect removed filter

**Testing:** Manual CLI workflow testing - complete CRUD cycles for documents, test OR/OC with new fields, test import/export

---

### Layer 5: Web Client (User Interface)

#### Remove
- ❌ Regulatory Aspect management pages/components
- ❌ Regulatory aspect filter controls from OR/OC collection views
- ❌ Regulatory aspect relationship UI from OR/OC forms
- ❌ Regulatory aspect display in OR/OC detail panels

#### Add Document Management
- ⬜ Document management page in Setup activity
- ⬜ Document ListEntity component (list view with name, version, description, url)
- ⬜ Document FormEntity component (create/edit form)
- ⬜ Document detail display
- ⬜ Document deletion confirmation

#### Add Document Reference Components
- ⬜ DocumentReferenceSelector component (for OR/OC forms)
- ⬜ Document reference list display (shows document + note)
- ⬜ Add/edit/remove document reference functionality
- ⬜ Note input field for each reference (short text, e.g., "Section 3.2")

#### Add Dependency Management Components
- ⬜ VersionDependencySelector component (select versions to depend on)
- ⬜ Dependency list display (shows dependent versions with navigation links)
- ⬜ Add/remove dependency functionality
- ⬜ Visual indicators for dependencies (e.g., chain icon)

#### Update OR Forms
- ❌ Remove fields: `references`, `flowExamples`, `risksAndOpportunities` textareas
- ⬜ Add fields: `privateNotes` textarea, `path` tag input
- ⬜ Add section: Document References (with DocumentReferenceSelector)
- ⬜ Add section: Dependencies (with VersionDependencySelector for requirements)
- ⬜ Update validation rules for new fields

#### Update OC Forms
- ⬜ Rename field: `description` → `purpose` (update label and binding)
- ⬜ Add fields: `initialState`, `finalState`, `details`, `privateNotes` textareas, `path` tag input
- ❌ Remove milestone field: `status` from milestone sub-form
- ⬜ Add section: Document References (with DocumentReferenceSelector)
- ⬜ Add section: Dependencies (with VersionDependencySelector for changes)
- ⬜ Update validation rules for new fields

#### Update List Views
- ⬜ Update OR/OC list column headers for new visible fields
- ⬜ Add column: Document reference count indicator
- ⬜ Add column: Dependency indicator (icon if has dependencies)
- ❌ Remove column: Regulatory aspects
- ⬜ Update sorting/filtering logic

#### Update Filter Controls
- ❌ Remove regulatory aspect filter dropdown from OR collection view
- ❌ Remove regulatory aspect filter dropdown from OC collection view
- ⬜ Verify remaining filters work correctly (type, text, DRG, categories, services)

#### Update Detail Panels
- ⬜ Display document references section with notes
- ⬜ Display dependencies section with clickable links to navigate to dependent versions
- ⬜ Show new fields in read-only display mode
- ❌ Remove regulatory aspect display section
- ⬜ Update layout for new content sections

**Testing:** Manual end-to-end UI testing - complete workflows across all activities (Setup, Elaboration, Publication, Review)

---

### Implementation Order

1. **Layer 1: Store Layer** → Test with Neo4j browser
2. **Layer 2: Service Layer** → Test service operations
3. **Layer 3: Route Layer** → Test API endpoints
4. **Checkpoint 1:** Server complete - verify backend functionality
5. **Layer 4: CLI** → Test CLI commands
6. **Checkpoint 2:** Server + CLI complete - verify integrated workflows
7. **Layer 5: Web Client** → Test UI end-to-end
8. **Checkpoint 3:** Full system complete - verify complete user experience

---

### Testing Checkpoints

#### Checkpoint 1: Server Backend Complete
- ✓ DocumentStore CRUD operations work
- ✓ OR/OC updated fields persist correctly in Neo4j
- ✓ Document references created with notes on REFERENCES edges
- ✓ DEPENDS_ON relationships created (version-to-item, follows latest version automatically)
- ✓ API endpoints respond correctly with new schemas
- ✓ Filters work without regulatory aspects
- ✓ Content search includes new fields

#### Checkpoint 2: CLI Integrated
- ✓ Document commands work end-to-end (list, get, create, update, delete)
- ✓ OR commands handle new fields (privateNotes, path, document refs, dependencies)
- ✓ OC commands handle new fields (purpose, states, details, document refs, dependencies)
- ✓ Import/export works with updated format
- ✓ Filters work correctly without regulatory aspects
- ✓ CLI + Server integration solid

#### Checkpoint 3: Full System
- ✓ Document management UI fully functional in Setup activity
- ✓ OR forms handle all new fields and document references
- ✓ OC forms handle all new fields and document references
- ✓ Document reference selector works (add/edit/remove with notes)
- ✓ Dependency management works (select and navigate)
- ✓ Filters work correctly without regulatory aspects
- ✓ Complete workflows tested (Setup → Elaboration → Publication → Review)
- ✓ All detail displays show new content correctly

---

## System Status

### Current State
- **Backend (Phases 1-10):** ✅ Production-ready foundation
- **CLI (Phases 5-10):** ✅ Full-featured tool with 35+ commands
- **Web Client (Phases 11-18):** ✅ Complete UI with all activities
- **Model Update (Phase 19):** 🚧 In progress - documentation complete, implementation pending

### Key Capabilities
- ✅ Versioned operational entities with optimistic locking
- ✅ Multi-context queries (baseline + wave filtering)
- ✅ Bulk import/export (YAML → AsciiDoc)
- ✅ Client-side filtering and grouping
- ✅ Complete ODP workflow (Setup → Elaboration → Publication → Review)
- ✅ Responsive design with comprehensive error handling
- ✅ Temporal timeline visualization

---

*Last Updated: January 2025*  
*Status: Phases 1-18 complete. Phase 19 (Model Update) implementation in progress.*