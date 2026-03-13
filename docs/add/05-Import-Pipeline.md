# Chapter 05 – Import Pipeline

## 1. Overview

The import pipeline ingests operational content from heterogeneous Office documents (Word / Excel) produced by Drafting Groups and loads it into the ODIP database. It is a three-stage pipeline with a clean separation between document parsing, business rule mapping, and database persistence.

```
Office Document (.docx / .xlsx)
        ↓
  [1. Extraction]   — generic document parser, no business logic
        ↓
  Raw JSON
        ↓
  [2. Mapping]      — DrG-specific or standard mapper
        ↓
  Structured JSON
        ↓
  [3. Import]       — validate, resolve references, persist
        ↓
  Database (Neo4j)
```

Each stage is independently testable and independently replaceable. Adding support for a new DrG requires only a new mapper — extraction and import are unchanged.

---

## 2. Stage 1 — Extraction

**Classes**: `DocxExtractor`, `HierarchicalDocxExtractor`, `XlsxExtractor`  
**Library**: mammoth.js (Word), xlsx (Excel)

Parses document binary into a generic intermediate JSON representation. No business logic — the extractor does not know about ODIP entities, DrGs, or field names.

**Output structure** (`RawExtractedData`):
- `documentType`: `word` | `excel` | `hierarchical-word`
- `metadata`: filename, parsedAt
- `sections[]`: hierarchical sections with `level`, `title`, `path`, `content.paragraphs`, `content.tables` — for Word documents
- `sheets[]`: named sheets with `rows[]` — for Excel documents

**Rich text handling**: paragraph text is output as AsciiDoc. Images are extracted and converted from EMF → PNG, then embedded inline as `image::data:image/png;base64,...[]` syntax. Image conversion failures are non-blocking — a warning is added to the summary and the paragraph continues without the image.

**`HierarchicalDocxExtractor`** handles a ZIP file containing a folder structure of `.docx` files (used by some DrGs that organise requirements across multiple documents in a folder hierarchy). Output carries a `zipEntryCount` metadata field.

**API endpoints**:
- `POST /import/extract/word` — single `.docx`
- `POST /import/extract/word-hierarchy` — ZIP of `.docx` files
- `POST /import/extract/excel` — single `.xlsx`

---

## 3. Stage 2 — Mapping

**Classes**: `Mapper` (abstract), `MapperRegistry`, DrG-specific mappers, `StandardMapper`  
**Location**: `services/import/mappers/`

Takes `RawExtractedData` and produces `StructuredImportData` — a JSON payload shaped to match the ODIP import schema (correct field names, Quill Delta rich text, resolved cross-references).

### 3.1 Two Mapping Modes

The `/import/map/{drg}` endpoint accepts a `?specific=` flag selecting between two modes:

| Mode | `?specific=` | Mapper used | Identity field | Use case |
|---|---|---|---|---|
| Standard | `false` (default) | `StandardMapper` | `code` | Round-trip: re-importing exported `.docx` |
| DrG-specific | `true` | DrG mapper from `MapperRegistry` | `externalId` | Initial import of original DrG source documents |

### 3.2 DrG Mapper Registry

`MapperRegistry` holds one registered mapper per DrG code. All DrG mappers extend the abstract `Mapper` base class. Implemented mappers cover all DRG enum values: `4DT`, `AIRPORT`, `ASM_ATFCM`, `CRISIS_FAAS`, `FLOW`, `IDL`, `NM_B2B`, `NMUI`, `PERF`, `RRT`, `TCF`.

Each mapper is responsible for: entity identification, field extraction, AsciiDoc → Quill Delta conversion for rich text fields, and cross-reference resolution (section hierarchy → `refinesParents`, "Implemented ONs" → `implementedONs`, impact references → IMPACTS arrays).

### 3.3 StandardMapper

Used for the round-trip (docx-loop) workflow. Processes exported ODIP `.docx` files which use a standardised table-based format with a `Code` field. Entities are identified by their ODIP code rather than an `externalId`, enabling CREATE / UPDATE / SKIP comparison logic in the import stage.

### 3.4 Output Structure (`StructuredImportData`)

```
referenceDocuments[]
stakeholderCategories[]   — {externalId|code, name, description}
domains[]
bandwidths[]
waves[]
requirements[]            — {externalId|code, title, type, statement (Quill Delta),
                             rationale, flows, drg, path, refinesParents,
                             implementedONs, impactedStakeholders,
                             impactedDomains, dependencies, maturity, nfrs,
                             tentative, strategicDocuments (ONs only),
                             additionalDocumentation}
changes[]                 — {externalId|code, title, drg,
                             implementedORs, decommissionedORs,
                             milestones[{name, wave, eventTypes[]}],
                             maturity, cost, orCosts, additionalDocumentation}
```

Note: setup entities use `name` (not `title`); requirements and changes use `title`.

**API endpoint**: `POST /import/map/{drg}?specific=false|true`

---

## 4. Stage 3 — Import

**Classes**: `JSONImporter` (DrG-specific mode), `StandardImporter` (round-trip mode)  
**Selected by**: `POST /import/structured?specific=false|true`

### 4.1 JSONImporter

Used for initial DrG material import. Entities are identified by `externalId`. All entities are created as new entries. Processing order:

1. Setup entities (stakeholderCategories, domains, bandwidths, waves, referenceDocuments) — no dependencies, imported first
2. Requirements — topological sort by `refinesParents` to resolve REFINES hierarchy before persisting
3. Changes — imported after requirements so `implementedORs` / `decommissionedORs` references can be resolved

External ID → internal Neo4j ID mapping is built incrementally as entities are persisted and used to resolve cross-references at import time.

**Error handling**: greedy — errors on individual entities are collected and reported in the `ImportSummary` without aborting the entire import. Each entity is imported in its own transaction; a failure rolls back only that entity.

### 4.2 StandardImporter

Used for round-trip (docx-loop) re-import. Entities are identified by their ODIP `code`. For each entity the importer compares the incoming payload against the current database state and applies one of three outcomes:

| Outcome | Condition |
|---|---|
| `CREATE` | Code not found in database |
| `UPDATE` | Code found, content differs — creates new version |
| `SKIP` | Code found, content identical |

Version conflict detection uses `expectedVersionId` from the current state. The importer reports per-entity outcomes in the `ImportSummary`.

### 4.3 ImportSummary

Returned by both importers:

```json
{
  "referenceDocuments": 0,
  "stakeholderCategories": 3,
  "domains": 5,
  "bandwidths": 2,
  "waves": 4,
  "requirements": 47,
  "changes": 12,
  "errors": ["Requirement X: invalid parent reference"],
  "warnings": ["Image conversion failed for figure_3.emf"]
}
```

---

## 5. Docx Export (Round-Trip Pathway)

**Classes**: `DocxExportService`, `DocxGenerator`, `DocxEntityRenderer`, `DocxStyles`  
**Located in**: `services/export/`

The export half of the round-trip workflow. Queries entities by DRG from the database, builds a hierarchical structure, and generates a `.docx` file with:
- Standardised table-based entity format (one table per OR/OC)
- ODIP entity codes embedded as identifiers
- Rich text rendered from Quill Delta
- Cross-references between entities

**API endpoint**: `POST /docx-export` (see `openapi-docx.yml`)

The exported `.docx` can be edited manually in Word and re-imported via the standard pipeline (`extract/word` → `map/{drg}` → `structured`) to create new versions of the edited entities.

---

## 6. File Inventory

```
services/import/
├── DocxExtractor.js             Word document extractor
├── HierarchicalDocxExtractor.js ZIP of Word documents extractor
├── XlsxExtractor.js             Excel extractor
├── Mapper.js                    Abstract mapper base class
├── MapperRegistry.js            DrG → mapper lookup
├── StandardImporter.js          Round-trip importer (code-based)
├── JSONImporter.js              DrG-specific importer (externalId-based)
└── mappers/                     One file per DrG
    ├── NM_B2B_Mapper.js
    ├── IDL_Mapper.js
    └── ...

services/export/
├── DocxExportService.js
├── DocxGenerator.js
├── DocxEntityRenderer.js
├── DocxStyles.js
├── ODPEditionAggregator.js      Data aggregation for AsciiDoc export
├── ODPEditionTemplateRenderer.js
├── DeltaToAsciidocConverter.js  Quill Delta → AsciiDoc
├── DeltaToDocxConverter.js      Quill Delta → docx content
└── templates/                   Mustache templates for AsciiDoc output
```

---

## 7. Docx Round-Trip — Detail

### 7.1 Entity Identity in Exported Documents

`DocxGenerator` embeds a structured ODP ID in every exported entity table:

```
ODP ID: on:idl/145[7]
        │   │    │ └─ current versionId at export time
        │   │    └─── entity path segment
        │   └──────── drg
        └──────────── type (on / or / oc)
```

`ODPMapper` (the round-trip mapper) parses this ID on re-import to recover `type`, `drg`, `itemId` path, and the `expectedVersionId`. The version component is what enables conflict detection.

### 7.2 Version Conflict Detection

When the `StandardImporter` processes an UPDATE, it compares the `expectedVersionId` parsed from the document against the current version in the database:

| Situation | Outcome |
|---|---|
| `expectedVersionId` matches current database version | UPDATE proceeds — new version created |
| `expectedVersionId` is behind current database version | `VERSION_CONFLICT` — import of that entity is rejected |
| Entity code not found in database | `CREATE` — new entity inserted |
| Incoming content identical to current version | `SKIP` — no write |

A `VERSION_CONFLICT` means someone else updated the entity in the system after the document was exported. The default behaviour is to reject and report the conflict; the CLI `--force` flag overrides the check and forces the update at the risk of overwriting the intervening changes.

Conflicts are reported per-entity in the `ImportSummary` — a conflict on one entity does not abort processing of the rest.

### 7.3 Rich Text Round-Trip Fidelity

The export path converts Quill Delta → Word formatting via `DeltaToDocxConverter`. The import path goes Word content → AsciiDoc (extractor) → Quill Delta (ODPMapper). This double conversion is lossy for some Quill features.

**Supported with full fidelity:**

- Plain text
- Bold, italic, underline
- Simple hyperlinks
- Single-level bullet lists
- Embedded images (PNG — exported as PNG, re-imported as PNG)

**Partially supported / formatting loss accepted:**

- Multi-level nested lists — Quill uses flat `ql-indent-N` structure; Word uses semantic nesting. Round-trip collapses nesting to a single level.
- Complex inline formatting combinations — may simplify on re-import.

**Not supported:**

- Tables within rich text fields — exported as plain text, structure lost on re-import.
- Quill-specific features with no Word equivalent (e.g. custom blots).

### 7.4 Image Round-Trip

```
Export:  Neo4j Quill Delta {insert: {image: "data:image/png;base64,..."}}
             ↓ DeltaToDocxConverter
         Word .docx (PNG image element)

Import:  Word .docx (PNG or EMF image)
             ↓ DocxExtractor (EMF → PNG via LibreOffice if needed)
         AsciiDoc inline: image::data:image/png;base64,...[]
             ↓ ODPMapper
         Neo4j Quill Delta {insert: {image: "data:image/png;base64,..."}}
```

EMF images introduced in Word (e.g. by the editor) are converted to PNG by LibreOffice during extraction. Conversion failures are non-blocking — a warning is emitted and the image is omitted from the re-imported Delta.

---

[← 04 REST API](04-REST-API.md) | [06 Publication →](06-Publication.md)