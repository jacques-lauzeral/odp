# Docx Loop Work Plan

## Overview

Implementation phases for the Docx Loop feature - enabling round-trip editing of ODP requirements through Word documents using the existing 3-stage import framework.

## Implementation Phases

### Phase 1: DocxExtractor Enhancement
**Goal:** Add link and anchor extraction

**Tasks:**
1. Add `_extractLinksFromParagraph(html)` method
    - Parse `<a href="...">text</a>` tags
    - Return `{text, href, position, context}` objects

2. Add `_extractAnchorFromHeading(html)` method
    - Parse `<h1><a id="..."></a>Text</h1>`
    - Return bookmark ID or null

3. Enhance `_extractAllElements()`
    - Add `links` array to paragraphs
    - Add `anchor` string to headings

4. Test backward compatibility with existing mappers

**Deliverable:** Enhanced DocxExtractor.js with tests

### Phase 2: ODPMapper Implementation
**Goal:** Map raw docx data to ODP structured JSON

**Tasks:**
1. Create ODPMapper class following existing mapper pattern
2. Parse entity boundaries from section hierarchy
3. Extract ODP IDs: `on:idl/145[7]` → determine CREATE vs UPDATE
4. Parse labeled fields (Statement:, Rationale:, etc.)
5. Resolve references:
    - Setup elements: `Name[Note]`
    - Entity relationships: `(EntityID)`
6. Validate: version IDs, ID format, required fields
7. Output structured JSON per ODP-Import-File-Format

**Deliverable:** ODPMapper.js with tests

---

### Phase 3: JSONImporter Enhancement
**Goal:** Add UPDATE operation support

**Tasks:**
1. Add operation detection: has `externalId[version]` → UPDATE
2. Implement UPDATE logic:
    - Parse external ID
    - Retrieve existing entity
    - Check version match (unless `--force`)
    - Update fields, increment version
3. Add version conflict detection with greedy error collection
4. Implement `--force` flag to override version checks
5. Single transaction with rollback on failure
6. Update relationship handling

**Deliverable:** Enhanced JSONImporter with UPDATE support

---

### Phase 4: DocxGenerator Implementation
**Goal:** Generate Word documents with ODP structure

**Tasks:**
1. Embed entity IDs: "ODP ID: on:idl/145[7]" after headings
2. Build hierarchical document structure from paths
3. Format fields with bold labels
4. Format references:
    - Setup: `Name[Note]`
    - Entities: `Title (EntityID)`
5. Generate appendix with setup element catalog
6. Apply Word styles (headings, lists, spacing)

**Deliverable:** DocxGenerator class with sample outputs

---

### Phase 5: DocxExportService
**Goal:** Orchestrate export with filtering

**Tasks:**
1. Query entities by DRG
2. Reconstruct hierarchy from paths
3. Generate metadata
4. Call DocxGenerator
5. Add API endpoint: `GET /api/export/docx?drg={drg}`

**Deliverable:** Export service with API route

---

### Phase 6: CLI Tools
**Goal:** Command-line interface

**Tasks:**
1. Export: `node cli/export-docx.js --drg idl --output file.docx`
2. Extract: `node cli/docx-extract.js --input file.docx --output raw.json`
3. Map: `node cli/odp-map.js --input raw.json --drg idl --output structured.json`
4. Import: `node cli/json-import.js --input structured.json --user admin --force`
5. Integrated: `node cli/import-docx.js --input file.docx --drg idl --user admin`
6. Add progress reporting

**Deliverable:** CLI scripts with documentation

---

### Phase 7: Testing
**Goal:** Validate full workflow

**Tasks:**
1. Unit tests for all components
2. Integration tests for 3-stage pipeline
3. Round-trip tests (export → edit → import)
4. Edge cases (empty fields, conflicts, large docs)
5. Performance testing

**Deliverable:** Test suite with coverage report

---

### Phase 8: Documentation
**Goal:** Enable user adoption

**Tasks:**
1. User guide (template, entity IDs, references, procedures)
2. Developer docs (architecture, API, troubleshooting)
3. API documentation (OpenAPI updates)
4. Training materials

**Deliverable:** Complete documentation set