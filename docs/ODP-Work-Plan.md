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
**Implementation Status:** 🚧 **IN PROGRESS** - Layers 0-4 complete, Layer 5 pending

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

### ✅ Layer 0: Shared Module (@odp/shared) - COMPLETE

**Removed:** RegulatoryAspect types and validation helpers

**Added:** Document, DocumentRequest, DocumentReference, DependsOnRequirement, DependsOnChange types

**Updated:** OR/OC type definitions with new fields (privateNotes, path, documentReferences, dependencies), removed old fields, validation schemas updated

**Status:** 100% Complete - All type definitions and validation updated

---

### ✅ Layer 1: Store Layer (Neo4j) - COMPLETE

**Removed:** RegulatoryAspectStore, all HAS_ATTACHMENT relationships

**Added:** DocumentStore with full CRUD, REFERENCES edges with note property, DEPENDS_ON relationships (version-to-item pattern)

**Updated:** OperationalRequirementStore and OperationalChangeStore with new field handling, document reference management methods, dependency management methods, content filtering updated (removed RA filter, added new fields to search)

**Status:** 100% Complete - All database operations support new model

---

### ✅ Layer 2: Service Layer - COMPLETE

**Removed:** RegulatoryAspectService

**Added:** DocumentService with full validation, document reference validation helpers, dependency cycle detection

**Updated:** OperationalRequirementService and OperationalChangeService with new field mappings, document reference validation, dependency validation, content filtering (removed regulatoryAspect parameter)

**Status:** 100% Complete - All business logic updated

---

### ✅ Layer 3: Route Layer (API) - COMPLETE

**Removed:** `/regulatory-aspects` endpoints, `regulatoryAspect` query parameters from OR/OC endpoints

**Added:** `/documents` CRUD endpoints with full OpenAPI spec

**Updated:** OR/OC endpoint payload handling for new fields, document references, dependencies

**Status:** 100% Complete - API fully supports new model, OpenAPI specs updated

---

### ✅ Layer 4: CLI (Command-Line Interface) - COMPLETE

**Removed:** `odp regulatory-aspects` command group, `--regulatory-aspect` filter from OR/OC list commands

**Added:** `odp documents` command group (list/get/create/update/delete), `--document` filter, `--private-notes` and `--path` options to OR/OC commands, document reference and dependency display in detail views

**Updated:** OR commands with new field options and interactive management, OC commands with field rename (description→purpose) and new options, import/export format documentation (ODP-Import-File-Format.md), ImportService with document import, document reference resolution, dependency resolution

**Status:** 100% Complete - CLI fully supports new model, import/export ready

**Testing:** Manual CLI workflow testing recommended - CRUD cycles for documents, OR/OC with new fields, import/export validation

---

### ⚠️ Layer 5: Web Client (User Interface) - IN PROGRESS

#### Phase 5.1: Removals (Priority: HIGH)
- ✅ Remove Regulatory Aspect management page from Setup activity
- ✅ Remove RA entity from setup.js entities object
- ✅ Delete regulatory-aspects.js component file
- ✅ Remove RA filter controls from OR collection view (requirements.js)
- ⬜ Remove RA filter controls from OC collection view (changes.js)
- ✅ Remove RA columns from OR list views (requirements.js)
- ⬜ Remove RA columns from OC list views (changes.js)
- ✅ Remove RA grouping from OR views (requirements.js)
- ⬜ Remove RA grouping from OC views (changes.js)
- ⬜ Remove OR fields: `references`, `flowExamples`, `risksAndOpportunities` from requirement-form.js
- ⬜ Remove milestone field: `status` from OC milestone sub-forms (change-form.js)
- ✅ Remove RA field `impactsRegulatoryAspects` from requirement-form.js
- ✅ Update requirement-form.js data transformation methods (remove RA handling)
- ✅ Remove regulatoryAspects from abstract-interaction-activity.js loadSetupData()

#### Phase 5.2: Document Management (Priority: HIGH)
- ✅ Add Document management page in Setup activity (setup.js)
- ✅ Create Document ListEntity component (documents.js)
- ✅ Add Documents entity to setup.js entities object
- ✅ Add documents to abstract-interaction-activity.js loadSetupData()
- ✅ Add document filter to requirements.js
- ⬜ Add document filter to changes.js
- ✅ Add document column to requirements.js
- ⬜ Add document column to changes.js
- ✅ Add document grouping to requirements.js
- ⬜ Add document grouping to changes.js
- ✅ Create form-utils.js with formatDocumentReferences helper

#### Phase 5.3: Document Reference Components (Priority: MEDIUM)
- ⬜ Design annotated-multiselect field type pattern
- ⬜ Create document reference UI components
- ⬜ Integrate into requirement-form.js
- ⬜ Integrate into change-form.js

#### Phase 5.4: Dependency Management Components (Priority: MEDIUM)
- ⬜ Add dependencies field to requirement-form.js (multiselect)
- ⬜ Add dependencies field to change-form.js (multiselect)
- ⬜ Update form data transformation for dependencies

#### Phase 5.5: OR Forms Update (Priority: MEDIUM)
- ⬜ Remove fields: `references`, `flowExamples`, `risksAndOpportunities` from requirement-form.js
- ⬜ Add fields: `privateNotes` textarea, `path` tag input to requirement-form.js
- ⬜ Update validation rules for new fields

#### Phase 5.6: OC Forms Update (Priority: MEDIUM)
- ⬜ Add fields: `privateNotes` textarea, `path` tag input to change-form.js (already has purpose/initialState/finalState/details)
- ⬜ Update validation rules for new fields

#### Phase 5.7: List Views Update (Priority: LOW)
- ⬜ Verify OR/OC list column headers display correctly
- ⬜ Update sorting/filtering logic if needed
- ⬜ Verify remaining filters work correctly (type, text, DRG, categories, services, document)

#### Phase 5.8: Detail Panels Update (Priority: LOW)
- ⬜ Verify new fields display in read-only detail panels
- ⬜ Verify document references display correctly
- ⬜ Verify dependencies display correctly

**Status:** ~25% Complete (Phase 5.1 mostly done, Phase 5.2 setup/infrastructure done, Phases 5.3-5.8 pending)

**Testing:** Manual end-to-end UI testing required - complete workflows across all activities (Setup, Elaboration, Publication, Review)
### Implementation Order

1. **Layer 1: Store Layer** → ✅ COMPLETE - Tested with Neo4j browser
2. **Layer 2: Service Layer** → ✅ COMPLETE - Service operations tested
3. **Layer 3: Route Layer** → ✅ COMPLETE - API endpoints tested
4. **Checkpoint 1:** ✅ Server complete - backend functionality verified
5. **Layer 4: CLI** → ✅ COMPLETE - CLI commands tested
6. **Checkpoint 2:** ✅ Server + CLI complete - integrated workflows verified
7. **Layer 5: Web Client** → ⬜ IN PROGRESS - UI development pending
8. **Checkpoint 3:** ⬜ Full system complete - awaiting complete user experience verification

---

### Testing Checkpoints

#### ✅ Checkpoint 1: Server Backend Complete
- ✅ DocumentStore CRUD operations work
- ✅ OR/OC updated fields persist correctly in Neo4j
- ✅ Document references created with notes on REFERENCES edges
- ✅ DEPENDS_ON relationships created (version-to-item, follows latest version automatically)
- ✅ API endpoints respond correctly with new schemas
- ✅ Filters work without regulatory aspects
- ✅ Content search includes new fields

#### ✅ Checkpoint 2: CLI Integrated
- ✅ Document commands work end-to-end (list, get, create, update, delete)
- ✅ OR commands handle new fields (privateNotes, path, document refs, dependencies)
- ✅ OC commands handle new fields (purpose, states, details, document refs, dependencies)
- ✅ Import/export works with updated format
- ✅ Filters work correctly without regulatory aspects
- ✅ CLI + Server integration solid

#### ⬜ Checkpoint 3: Full System (PENDING)
- ⬜ Document management UI fully functional in Setup activity
- ⬜ OR forms handle all new fields and document references
- ⬜ OC forms handle all new fields and document references
- ⬜ Document reference selector works (add/edit/remove with notes)
- ⬜ Dependency management works (select and navigate)
- ⬜ Filters work correctly without regulatory aspects
- ⬜ Complete workflows tested (Setup → Elaboration → Publication → Review)
- ⬜ All detail displays show new content correctly

---

## System Status

### Current State
- **Backend (Phases 1-10):** ✅ Production-ready foundation
- **CLI (Phases 5-10):** ✅ Full-featured tool with 35+ commands
- **Web Client (Phases 11-18):** ✅ Complete UI with all activities
- **Model Update (Phase 19):** 🚧 80% complete - Layers 0-4 done, Layer 5 in progress

### Phase 19 Progress: 80%
- ✅ Layer 0: Shared Module (100%)
- ✅ Layer 1: Store Layer (100%)
- ✅ Layer 2: Service Layer (100%)
- ✅ Layer 3: Route Layer (100%)
- ✅ Layer 4: CLI (100%)
- ⬜ Layer 5: Web Client (0%)

### Key Capabilities
- ✅ Versioned operational entities with optimistic locking
- ✅ Multi-context queries (baseline + wave filtering)
- ✅ Bulk import/export (YAML → AsciiDoc)
- ✅ Client-side filtering and grouping
- ✅ Complete ODP workflow (Setup → Elaboration → Publication → Review)
- ✅ Responsive design with comprehensive error handling
- ✅ Temporal timeline visualization
- ✅ Document entity with reference management (backend/CLI complete)
- ✅ Version dependency tracking (backend/CLI complete)
- ⬜ Document and dependency UI (pending)

---

## Next Steps

### Immediate Priority: Phase 19 - Layer 5 (Web Client)
1. **Phase 5.1: Removals** - Remove all RegulatoryAspect UI components
2. **Phase 5.2: Document Management** - Add document CRUD interface in Setup activity
3. **Phase 5.3-5.4: Reference Components** - Build DocumentReferenceSelector and VersionDependencySelector
4. **Phase 5.5-5.6: Form Updates** - Update OR/OC forms with new fields and components
5. **Phase 5.7-5.8: View Updates** - Update list views and detail panels

### Success Criteria for Phase 19 Completion
- All RegulatoryAspect references removed from codebase
- Document management fully functional in web UI
- Document references work in OR/OC forms with notes
- Version dependencies work in OR/OC forms with navigation
- All new fields (privateNotes, path) functional in web UI
- End-to-end workflows tested and validated

---

*Last Updated: January 2025*  
*Status: Phase 19 - 80% complete (Layers 0-4 done, Layer 5 pending)*