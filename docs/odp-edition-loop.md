# Edition Loop: Word Document ↔ Database Round-Trip Strategy

## Context

**Project:** Operational Deployment Platform (ODP) for managing Operational Needs (ONs), Operational Requirements (ORs), and Operational Changes (OCs).

**Problem Statement:** Multiple drafting groups (DrGs) have produced hundreds of ONs and thousands of ORs over 6 months in heterogeneous Word/Excel formats. These have been imported into a tool/database using custom import strategies per group. The tool has expert editing capabilities but no contributor-level UI yet (several months away). We need a maintainable interim solution for contributors to continue editing requirements while the tool develops.

**Core Challenge:** How to enable contributors to work in familiar Word documents while maintaining structural consistency and avoiding the maintenance nightmare of N different import strategies per drafting group.

## Strategic Approach

### The Normalization Strategy

Rather than supporting heterogeneous input formats indefinitely, export normalized Word documents from the database that all drafting groups must follow going forward. This progressively improves normalization with each iteration:

```
Cycle 1 (DONE): Heterogeneous Word/Excel → Custom parsers → YAML → DB
Cycle 2+ (GOAL): DB → Normalized Word → Contributors edit → Parser → DB
```

**Key insight:** The database becomes the source of truth. Normalized documents are **generated outputs** that become the new input format.

### Organizational Buy-In

This strategy works because:
- Drafting groups explicitly requested more structure (expressed dissatisfaction with heterogeneous approach)
- Demonstrating comprehensive, homogeneous ODP output is a project objective
- Groups understand the value of converging on a single structure

## Technical Constraints

### Database Schema (OpenAPI-based)

The existing database schema includes:
- `OperationalRequirement` (ONs and ORs distinguished by `type` field)
- `OperationalChange` (OCs)
- Setup entities: `StakeholderCategory`, `DataCategory`, `Service`, `RegulatoryAspect`, `Wave`
- Each entity has: `itemId`, `title`, `type`, version tracking, rich text fields
- References resolved at DB level using technical IDs
- **Critical limitation:** No organizational hierarchy stored initially

### Rich Text Storage Requirements

Multiple use cases for formatted text:
1. **Word documents** - contributor editing interface (interim)
2. **Database storage** - persistent format
3. **Web editor** - future contributor UI
4. **AsciiDoc publication** - ODP final output format

**Decision:** Use **Markdown** as the unified internal format because:
- Mammoth.js converts Word → Markdown cleanly
- All JavaScript markdown editors support it natively (Toast UI Editor, EasyMDE, etc.)
- All editors use permissive licenses (MIT/Apache 2.0)
- Git-friendly and human-readable
- Simple conversion to AsciiDoc for publication (via Pandoc)
- More familiar to developers than AsciiDoc

**Trade-off accepted:** Need markdown → AsciiDoc converter for final publication, but this is a one-way, end-of-pipeline transformation.

### Technology Stack

**Language:** JavaScript/Node.js (matches existing tool implementation)

**Key Libraries:**
- `mammoth` - Word → Markdown conversion
- `docx` (by dolanmiu) - Programmatic Word document generation
- `js-yaml` or native JSON - intermediate format (see below)
- Optional: `pandoc` (external) - Markdown → AsciiDoc for publication

**Why not Python:** Initial recommendation was Python (`python-docx` library) for rapid prototyping, but Node.js makes more sense for integration with existing JavaScript-based tool.

## Architectural Decisions

### Organizational Structure Model

Adopted the **NM B2B pattern** as the standard for all drafting groups:

```
Organizational Section (flexible depth/naming)
├─ ONs (keyword - marks entity container)
│  ├─ Entity Section [ON form]
│  │  └─ Entity Section [ON form] (refines parent)
│  └─ Entity Section [ON form]
├─ ORs (keyword - marks entity container)
│  ├─ Entity Section [OR form]
│  │  └─ Entity Section [OR form] (refines parent)
│  └─ Entity Section [OR form]
└─ OCs (keyword - marks entity container)
   └─ Entity Section [OC form]
```

**Flexibility retained:** Drafting groups control organizational hierarchy (depth, titles, grouping logic).

**Structure enforced:** Must use "ONs"/"ORs"/"OCs" subsections; one form per entity; refines via subsections.

### Path-Based Identity System

**Schema addition required:** Add `path` field to `OperationalRequirement` and `OperationalChange`:

```javascript
{
  drg: "NM_B2B",           // Existing - root scope
  path: ["Technical Aspects", "Service Lifecycle", "Versioning"],  // NEW
  title: "Backward Compatibility Information",
  type: "ON"
}
```

**External ID construction:** `path.join('/') + '/' + title`

**Reference resolution:**
- Relative: `./Something` → same path, find by title
- Absolute: `/Path/To/Something` → parse path, find by full path + title

**Special keywords:** "ONs"/"ORs"/"OCs" are **not** part of the path - they're structural markers for grouping entities of the same type.

**Root level:** Empty path `[]` indicates entity at DRG root.

### Intermediate Format: JSON vs YAML

**Initial choice:** YAML (more compact, human-readable)

**Reconsidered:** JSON is better because:
- Matches OpenAPI schema exactly (zero translation)
- Native JavaScript format (no parsing library)
- Direct DB API compatibility (JSON request/response)
- Slightly less readable, but intermediate format is temporary

**Decision:** Use **JSON** matching the OpenAPI schema structure for requests.

When transitioning to direct DB access, the JSON step simply disappears - the data structure remains identical.

### Complete Data Flow

```
┌─────────────────────────────────────────────────┐
│ INTERIM (until contributor UI ready)           │
├─────────────────────────────────────────────────┤
│                                                 │
│  Word Document (contributors edit)             │
│       ↓ mammoth → markdown                     │
│  Node.js Parser                                │
│       ↓                                         │
│  JSON (OpenAPI schema structure)               │
│       ↓                                         │
│  Database (markdown in text fields)            │
│       ↓                                         │
│  JSON (query results)                          │
│       ↓                                         │
│  Node.js Generator (markdown → docx)           │
│       ↓                                         │
│  Normalized Word Document                      │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ FUTURE (direct DB access)                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  Word Document → Parser → DB                   │
│  DB → Generator → Word Document                │
│  (JSON intermediate removed)                   │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ PUBLICATION (ODP output)                       │
├─────────────────────────────────────────────────┤
│                                                 │
│  DB (markdown) → Pandoc → AsciiDoc → ODP      │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Schema Update
Add `path: string[]` field to:
- `OperationalRequirement` / `OperationalRequirementRequest`
- `OperationalChange` / `OperationalChangeRequest`

### Phase 2: Parser Development (Word → DB)
- Extract organizational hierarchy from Word sections
- Identify "ONs"/"ORs"/"OCs" keywords (stripped from path)
- Parse entity forms (tables or structured content)
- Convert Word content to markdown (via mammoth)
- Populate `drg`, `path`, `title`, `type`, markdown fields
- Resolve references (relative/absolute)
- Output JSON matching OpenAPI schema

### Phase 3: Generator Development (DB → Word)
- Query entities by DRG from database
- Reconstruct organizational hierarchy from `path` arrays
- Group entities by path to create organizational sections
- Insert "ONs"/"ORs"/"OCs" subsections based on `type`
- Convert markdown fields to Word formatting (via docx library)
- Generate entity forms with proper styling
- Apply consistent Word styles throughout

### Phase 4: Validation & Testing
- Round-trip test: Parse → Generate → Parse → Compare
- Validate with NM B2B document (section 4)
- Test reference resolution (relative and absolute paths)
- Verify markdown preservation fidelity
- Confirm organizational structure reconstruction

### Phase 5: Rollout
- Export normalized documents for all drafting groups
- Provide editing guidelines
- Accept that manual tuning may be needed initially
- Iterate based on contributor feedback

## Critical Success Factors

1. **Path field in schema** - enables organizational structure storage/reconstruction
2. **NM B2B pattern adoption** - single structure all groups must follow
3. **Markdown as internal format** - bridges Word, DB, web editor, and AsciiDoc
4. **JSON intermediate** - seamless transition to direct DB access
5. **Contributors respect structure** - assumed based on expressed desire for more guidance

## Open Questions / Future Work

- **Organizational folders in application:** Current DB has flat structure; future will add folder/tree UI where root folders = DRGs
- **Setup entity extraction:** Parser must extract stakeholders, data categories, services, regulatory aspects from document text
- **Form structure in Word:** Exact visual layout (tables vs labeled sections) to be determined during implementation
- **Change tracking:** How to detect and handle contributor modifications to structure vs content only
- **Validation tooling:** Pre-import validator contributors can run themselves to check compliance

## Motivation Summary

This approach balances multiple constraints:
- **Contributor comfort:** Familiar Word format, not forcing unfamiliar tools
- **Maintainability:** Single parser replaces N custom strategies
- **Future-proofing:** JSON structure matches DB schema exactly for seamless transition
- **Format flexibility:** Markdown bridges all required output formats (Word, web, AsciiDoc)
- **Incremental improvement:** Each cycle increases normalization without requiring perfection immediately
- **Technology alignment:** Node.js throughout, leveraging existing tool stack