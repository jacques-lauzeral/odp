# ODP Work Plan - Backlog & Progress Tracker

## Current System State

**Status**: Feature-rich prototype with functional web UI, REST API, and CLI tooling.

**Key Capabilities**:
- Complete ODP workflow: Setup Ã¢â€ â€™ Elaboration Ã¢â€ â€™ Publication Ã¢â€ â€™ Review
- Versioned operational entities (ON/OR/OC) with optimistic locking
- Multi-context queries (baseline + wave filtering)
- Document references and version dependencies
- Office document import pipeline (Word/Excel Ã¢â€ â€™ structured data Ã¢â€ â€™ database)
- Temporal timeline visualization for deployment planning
- Client-side filtering, grouping, and search
- Export to AsciiDoc format
- Comprehensive CLI with 35+ commands

**Technology Stack**: Node.js backend, Neo4j graph database, Vanilla JavaScript web client, Docker containerization.

---

## ACTIVE WORK

### 1. Docx Export/Import Round-Trip (TOP PRIORITY)
**Goal**: Enable full bidirectional conversion between ODP database and Word documents for DrG teams.

**Current Status**: Import pipeline complete (Phase 20) - extraction and mapping done for all DrGs.

**Remaining Work**:

#### Phase 0: Validation (DE-RISKING)
- [ ] Install `docx` library for document generation
- [ ] Create `DocxGenerator` class for Word document creation
- [ ] Implement validation endpoints:
  - `POST /convert/requirements/docx-to-json?drg={DRG}` (reuse Phase 20 extraction)
  - `POST /convert/requirements/json-to-docx?drg={DRG}` (new generation)
- [ ] CLI validation commands:
  - `odp convert docx-to-json --file requirements.docx --drg NM_B2B --output requirements.json`
  - `odp convert json-to-docx --file requirements.json --drg NM_B2B --output requirements.docx`
- [ ] Test round-trip: docx Ã¢â€ â€™ JSON Ã¢â€ â€™ docx Ã¢â€ â€™ JSON
- [ ] Manual inspection of generated Word documents
- [ ] Document edge cases and limitations

**Success Criteria**: Parse and regenerate sample document with structure preservation verified.

#### Phase 1: Enhanced Parsing & Generation
- [ ] Refine DocxParser (leverage Phase 20 DocxExtractor)
  - Enhance hierarchical structure detection
  - Improve entity boundary detection (ON vs OR sections)
  - Add robust field extraction patterns
  - Handle nested refinements (parent-child via path)
- [ ] Implement DocxGenerator
  - Consistent style system (heading levels, formatting)
  - Proper heading numbering (1, 1.1, 1.1.1)
  - Rich text to Word conversion (bold, italic, lists, tables)
  - Handle complex nested structures
  - Reference formatting (document references with notes)
- [ ] Reference resolution system
  - Build entity maps for lookups
  - Relative path resolution (`./Title`)
  - Absolute path resolution (`/Path/To/Title`)
  - Validation for unresolved references

#### Phase 2: Database Integration
- [ ] Connect DocxImportExportService to database
- [ ] Production import endpoint: `POST /import/requirements/docx?drg={DRG}`
- [ ] Production export endpoint: `GET /export/requirements/docx?drg={DRG}&baseline={id}&wave={id}`
- [ ] Service integration (OperationalRequirementService, setup entities)
- [ ] Support baseline + wave filtering (edition-aware export)
- [ ] Transaction support with rollback

#### Phase 3: Production CLI & OC Support
- [ ] Production CLI commands:
  - `odp import requirements --drg {DRG} --file {path.docx}`
  - `odp export requirements --drg {DRG} --format docx --output {path.docx}`
- [ ] OC-specific parsing and generation
- [ ] Milestone formatting
- [ ] Progress indicators and verbose mode

#### Phase 4: Testing & Quality
- [ ] Unit tests for parser and generator
- [ ] Integration tests for round-trip cycles
- [ ] Test with real DRG documents
- [ ] Performance testing with large files
- [ ] User acceptance validation

#### Phase 5: Documentation & Rollout
- [ ] Technical documentation (API specs, architecture)
- [ ] User guidelines (document structure requirements)
- [ ] Training materials (samples, FAQ, troubleshooting)

**Reference**: Full details in Docx-Loop-Work-Plan.md

---

### 2. Hierarchical ON/OR Perspective

**Goal**: Add Tree perspective to Elaboration activity for hierarchical visualization of requirements.

**Status**: Core implementation complete - now in corrections and tuning phase.

**Priority**: Active work (lower priority than Docx Loop).

**Completed**:

#### Component Development ✅
- [x] Create TreeTableEntity component (generic tree-table)
  - Tree structure building from flat entity list
  - Path builder configuration (entity → typed path array)
  - Type renderer configuration (icon, color, expandability)
  - Column configuration (which columns apply to which node types)
  - Expand/collapse state management
  - Filter application (hide/show nodes, auto-show parent paths)
  - Selection handling with event emission
- [x] Update RequirementsEntity to use TreeTableEntity
  - Add perspective tracking (`collection` | `tree`)
  - Implement pathBuilder callback (DrG → path → requirement node)
  - Implement typeRenderers (red/yellow folders, blue diamonds, green squares)
  - Configure 9 columns (Title, Implements, Depends On, Documents, Data, Stakeholder, Services, Updated By, Updated)
  - Add render() perspective switching logic
  - Share filters with collection perspective
  - Coordinate selection between perspectives

#### Integration ✅
- [x] Update AbstractInteractionActivity
  - Add perspective switcher UI for Requirements (Collection | Tree)
  - Handle perspective switch with state preservation
  - Maintain existing Temporal perspective for Changes
- [x] CSS styling for tree-table
  - Node type classes (drg, org-folder, on-node, or-node)
  - Icon colors (red, yellow, blue, green)
  - Indentation levels
  - Expand/collapse arrows
  - Column rendering for mixed node types

**Current Work - Corrections & Tuning**:
- [ ] Test with real requirement data (multiple DrGs, deep paths, REFINES chains)
- [ ] Verify filter behavior (node hiding, parent path visibility)
- [ ] Test perspective switching (state preservation)
- [ ] Test selection coordination between Collection and Tree
- [ ] Performance testing with 100+ requirements
- [ ] Fix any rendering issues with complex hierarchies
- [ ] Optimize expand/collapse interaction responsiveness
- [ ] Ensure column content displays correctly for all node types
- [ ] Polish visual hierarchy indicators

**Success Criteria**: Tree view displays hierarchical ON/OR structure with DrG/path/REFINES organization, proper filtering, and seamless perspective switching.

---

## BACKLOG

### High Priority

#### UX Improvements
**Goal**: Enhance user experience across relationship management, filtering, grouping, and layout.

**Components**:

##### 2.1 Relationship Management Enhancement
- [ ] Replace multi-selection list with pair suggestion box + selection list
- [ ] Apply to all relationship types:
  - `Requirement.refines` (parent requirement)
  - `Requirement.implements` (OR Ã¢â€ â€™ ON links)
  - `Requirement.dependsOn` (requirement dependencies)
  - `Change.satisfies` (OC Ã¢â€ â€™ OR links)
  - `Change.supersedes` (OC Ã¢â€ â€™ OR replacement)
- [ ] Type-ahead search in suggestion box
- [ ] Visual distinction between relationship types

##### 2.2 Missing Relationship-Based Filters
- [ ] Add filters for all relationship types:
  - Filter by `refines` (show requirements with specific parent)
  - Filter by `implements` (show ORs implementing specific ONs)
  - Filter by `dependsOn` (show requirements depending on specific items)
  - Filter by `satisfies` (show changes satisfying specific requirements)
  - Filter by `supersedes` (show changes superseding specific requirements)
- [ ] Share filters across perspectives (Collection/Tree/Temporal)

##### 2.3 Grouping Logic Fix
**Problem**: Relation-based grouping creates only two groups instead of proper entity-based groups.

- [ ] Fix grouping to create one group per related entity + "none" group
- [ ] Handle multi-group membership (entity appears in each applicable group)
- [ ] Proper count calculation for grouped items
- [ ] Visual indication for multi-group membership
- [ ] Apply fix to all relation-based groupings:
  - Group by parent (REFINES)
  - Group by implemented ONs
  - Group by dependencies
  - Group by satisfied requirements
  - Group by superseded requirements

##### 2.4 Temporal View Layout Enhancement
**Problem**: Insufficient vertical height limits timeline visibility.

- [ ] Optimize vertical space usage in temporal perspective
- [ ] Adjust layout constraints for timeline grid component
- [ ] Ensure timeline occupies available viewport height
- [ ] Maintain responsive behavior on different screen sizes

#### 3. Hierarchical ON/OR Perspective
**Goal**: Add Tree perspective to Elaboration activity for hierarchical visualization of requirements.

**Components**:
- [ ] Add Tree perspective to Requirements entity (alongside Collection)
- [ ] Extend TreeEntity component pattern from Setup activity
- [ ] Build tree structure using:
  - Primary grouping by DrG (top-level nodes)
  - Organizational path via `path` field
  - Parent-child relationships via `REFINES` edges
- [ ] Implement perspective switcher in interaction panel
- [ ] Share filters across Collection and Tree perspectives
- [ ] Coordinate selection state between perspectives
- [ ] Reuse details panel from Collection perspective

**Success Criteria**: Tree view displays hierarchical ON/OR structure organized by DrG with proper filter coordination.

---

### Medium Priority

#### TypeScript Migration (Prototype Ã¢â€ â€™ Production)
**Goal**: Migrate codebase from JavaScript to TypeScript for type safety and maintainability.

**Scope**: All three components (Web Client, Backend, CLI)

**Approach**: Gradual migration
- New code written in TypeScript
- Legacy code migrated incrementally
- Priority: shared models Ã¢â€ â€™ backend Ã¢â€ â€™ web client Ã¢â€ â€™ CLI

**Initial Steps**:
- [ ] Set up TypeScript configuration for each component
- [ ] Define migration strategy (module-by-module vs. feature-by-feature)
- [ ] Start with @odp/shared package (models and types)
- [ ] Establish patterns for gradual migration
- [ ] Document TypeScript conventions and patterns

**Dependencies**: Can proceed in parallel with other work, but coordinate with active features.

---

### Production Readiness Considerations (FUTURE DISCUSSION)

Topics to address when moving from prototype to production:

**Security & Access Control**:
- [ ] Authentication/authorization strategy
- [ ] User roles and permissions model
- [ ] API security (rate limiting, input validation)
- [ ] Secure credential management

**Infrastructure & Deployment**:
- [ ] Deployment pipeline and automation
- [ ] Environment strategy (dev/staging/production)
- [ ] Database backup and recovery
- [ ] Horizontal scaling approach

**Observability**:
- [ ] Structured logging strategy
- [ ] Application monitoring and metrics
- [ ] Error tracking and alerting
- [ ] Performance monitoring

**Quality & Reliability**:
- [ ] Comprehensive testing strategy (unit/integration/e2e)
- [ ] Test coverage targets and enforcement
- [ ] Error handling and recovery patterns
- [ ] API versioning strategy
- [ ] Database migration strategy

**Operational Excellence**:
- [ ] Health check endpoints
- [ ] Graceful shutdown handling
- [ ] Circuit breakers and retry logic
- [ ] Rate limiting and throttling
- [ ] Audit logging

**Documentation**:
- [ ] API documentation (OpenAPI/Swagger UI)
- [ ] Deployment guides
- [ ] Operational runbooks
- [ ] Architecture decision records

---

## Work Plan Maintenance

This document focuses on **backlog management and progress tracking**. Historical phases are documented separately for reference but not maintained in this active work plan.

**Update Frequency**: Review and update as features move from Backlog Ã¢â€ â€™ Active Work Ã¢â€ â€™ Complete.

**Priority Indicators**:
- **TOP PRIORITY**: Critical business need, blocks other work
- **High Priority**: Important for user experience or system capability
- **Medium Priority**: Quality improvements, technical debt
- **Future Discussion**: Requires planning and scoping

---

*Last Updated: October 23, 2025*
*Current Focus: Docx Export/Import Round-Trip (Phase 0 - Validation)*