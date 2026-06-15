# Chapter 05 – Import Pipeline

## 1. Overview

The import pipeline ingests operational content from distributed edition source JSON files produced by Drafting Groups and loads it into the ODIP database.

```
Source JSON (source.schema.json)
        ↓
  [Direct Import]   — DistributedEditionImporter, no extract/map stage
        ↓
  Database (Neo4j)
```

The `DistributedEditionImporter` is the sole importer. It consumes one source JSON file per chapter directly — no extraction or mapping stage is involved. Setup entities (reference documents, waves, stakeholder categories) must already exist in the database before import; failed resolution emits warnings rather than errors.

Every operational version created or updated during an import is committed under a single **change set** supplied by the caller (LCM). `importSourceFile(sourceData, userId, changeSetId)` threads `changeSetId` down to each versioned write; setup-only imports never reach a versioned write, so the id is simply unused on that path.

**API endpoint**: `POST /import/distributed`  
**CLI command**: `import distributed --file <path|glob...>`

---

## 2. DistributedEditionImporter

**Class**: `DistributedEditionImporter`  
**Location**: `services/import/DistributedEditionImporter.js`  
**API endpoint**: `POST /import/distributed`

**Processing phases per file:**

| Phase | Action |
|---|---|
| 0a | Resolve chapter identity from `chapterFolder` / `documentId` → chapter `itemId`, `code`, and `domain` |
| 0b-pre | Build `anchorToId` map from `requirements[].path[]` (anchor suffix → topic ID) |
| 0b | Convert `blocks[]` or `chapterIntro[]` to TipTap JSON; patch chapter narrative |
| 1 | Build reference maps from existing DB (stakeholders, reference documents, waves, requirements) |
| 2 | Create requirements as DRAFT without references |
| 3 | Resolve references; apply final maturity |
| 4 | Build `osHierarchy` from `path[0]` groupings; assign topic IDs; patch chapter |

**Source field mapping:**

| Source field | ODIP field | Notes |
|---|---|---|
| `drg` | `domain` | Hyphens normalised to underscores (`ASM-ATFCM` → `ASM_ATFCM`); overridden by chapter config domain for iDL sub-chapters |
| `expTit` | `tentative` | ON only; scalar integer normalised to `[year, year]` |
| `tentativeImplTime` | `privateNotes` (prefix) | Prepended as `"Source Tentative Implementation Time: ..."` |
| `noShow: true` | `maturity: NO_SHOW` | Overrides stated maturity; no reference resolution |
| `EMERGING` maturity | `DRAFT` | Legacy value mapped at both Phase 2 and Phase 3 |
| `refinesON` (scalar) | `refinesParents: [value]` | ON alias |
| `refinesORs` (array) | `refinesParents` | OR alias |

**`chapterFolder` resolution:** lowercased, parenthetical suffixes stripped (e.g. `(LoA)`, `(TCF)`), spaces replaced with hyphens. Exact-lowercase fallback applied if normalised key not found. Must match a chapter `code` in the bootstrapped DB.

**`osHierarchy` construction:** requirements grouped by `path[0]` (topic), preserving source order. ONs listed before ORs within each topic. Requirements with empty `path[]` (sub-entities via `refinesParents`) are excluded from topic placement. `ocs: []` always.

Each topic node is assigned a **chapter-scoped numeric string ID** (`id: "1"`, `"2"`, …) — the first free positive integer across the full hierarchy tree, in source order. Topic nodes also carry `narrative: null` at import time (editable post-import via the ODIP editor). The ID is the stable reference used in `n-ref` marks.

**`_buildAnchorToIdMap(requirements)`** — called before Phase 0b. Iterates `requirements[]` in source order, identifies unique top-level topic labels (first appearances of `path[0]`), and maps anchor suffix strings (e.g. `"2"`, `"3"`) to the topic IDs that will be assigned in Phase 4. The counter logic mirrors `insertAtLeaf` exactly (seq starts at 2, ID starts at 1). The resulting `Map<string, string>` is stored on `context.anchorToId` and passed to `BlocksToTipTapConverter.convert()`.

**DRAFT-first creation pattern**: All requirements are created in Phase 2 with `maturity: 'DRAFT'`, regardless of the target maturity in the source data. The real maturity is applied in Phase 3 alongside resolved references. This is necessary because the service layer enforces maturity-gated validation rules — ADVANCED and MATURE requirements must have `strategicDocuments` or `refinesParents` (ONs) and `implementedONs` or `refinesParents` (ORs) — which cannot be satisfied until references are resolved.

**Change-set linkage (LCM)**: `changeSetId` is threaded from `importSourceFile` through the Phase 2/3/4 write methods (`_createRequirementsWithoutReferences`, `_resolveRequirementReferences` → `_resolveEntityReferences`, `_patchChapterNarrative`, `_patchChapterOsHierarchy`) and injected as `{changeSetId, note: ''}` into each create/update/patch request message. The services extract it into a `changeSetCommit` exactly as a route would, and the store writes the `HAS_REASON` edge per version. The supplied change set must be OPEN — the store validates this on each write, so a closed or unknown id aborts the affected requirement (greedy error handling). The per-object note is left empty for imports. Setup-entity resolution (Phase 1) performs no versioned writes and never consults `changeSetId`.

**`path` / `refinesParents` XOR enforcement**: In Phase 3, if `refinesParents` resolves to a non-empty array, `path` is set to `null` in the update request. This enforces the business rule that a requirement cannot have both a path and a parent simultaneously.

**Error handling**: greedy — errors on individual requirements are collected and do not abort the import. Unresolved cross-references (entities in other not-yet-imported files) are emitted as warnings, not errors.

**`DistributedImportSummary`** returned:

```json
{
  "chapters": 1,
  "requirements": 48,
  "errors": [],
  "warnings": ["Unresolved references: ..."]
}
```

---

## 3. BlocksToTipTapConverter

**Class**: `BlocksToTipTapConverter` (singleton export)  
**Location**: `services/import/BlocksToTipTapConverter.js`

Converts a `blocks[]` array from a distributed edition source JSON file into a **TipTap JSON document string**, suitable for storage in Neo4j rich-text fields.

**Signature:** `convert(blocks, chapterCode = null, anchorToId = null)`

- `chapterCode` — chapter code string (e.g. `'nmui'`); required for resolving `anchor` attributes to `n-ref` marks.
- `anchorToId` — `Map<anchorSuffix, topicId>` built by `_buildAnchorToIdMap`; required for converting intra-chapter anchor links to stable numeric topic IDs.

**Handled block types:**

| Block type | Source structure | TipTap output |
|---|---|---|
| `heading` | `level` (1–6), `text` or `ops[]` | Heading node at given level |
| `paragraph` | `ops[]` or `text` | Paragraph node with inline marks |
| `bullet` | `ops[]` or `text` | BulletList → listItem node |
| `numbered` | `ops[]` or `text` | OrderedList → listItem node |
| `figure` | `image.data` (base64), `image.media_type` | Image node with base64 src |
| `caption` | `text` (plain string) | Paragraph node with italic mark |
| `table` | `headers[]` (ops arrays), `rows[][]` (plain strings) | Table node with header row |
| `placeholder_section`, `page_break` | — | Silently skipped |

**Inline attribute mapping (source ops → TipTap marks):**

| Source attribute | TipTap mark | Notes |
|---|---|---|
| `bold`, `italic`, `underline`, `strike` | `{ type: key }` | Standard marks |
| `link` | `{ type: 'link', attrs: { href, target: '_blank' } }` | External URL |
| `color` | `{ type: 'textStyle', attrs: { color } }` | |
| `ref` | `{ type: 'n-ref', attrs: { value } }` | Cross-chapter narrative reference (value = chapter code) |
| `xref` | `{ type: 'o-ref', attrs: { value } }` | O* reference (value = O* external ID) |
| `refdoc` | `{ type: 'd-ref', attrs: { value } }` | Strategic document reference (value = refdoc external ID) |
| `anchor` | `{ type: 'n-ref', attrs: { value: '{chapterCode}/{topicId}' } }` | Intra-chapter topic link; suffix resolved via `anchorToId` map |
| `attributes` (nested) | unpacked recursively | Some source ops wrap attrs as `{ attributes: { bold: true } }` |
| unknown | `{ type: key, attrs: { value } }` | Pass-through |

---

## 4. TipTapToAsciidocConverter

**Class**: `TipTapToAsciidocConverter`  
**Location**: `services/export/TipTapAsciidocConverter.js`  
**Consumer**: `DetailsModuleGenerator` (publication pipeline)

Converts TipTap JSON document format to AsciiDoc text for use in Antora-based publication output. Replaces the former `DeltaToAsciidocConverter` (Quill Delta).

**Supported node types**: `paragraph`, `heading` (levels 1–6), `bulletList`, `orderedList`, `listItem`, `image`, `table` (with header row), `hardBreak`.

**Supported inline marks**: `bold`, `italic`, `underline`, `strike`, `link`, `textStyle` (color), `n-ref`, `o-ref`, `d-ref`.

---

## 5. File Inventory

```
services/import/
├── DistributedEditionImporter.js   Distributed source JSON importer (direct, no mapper)
└── BlocksToTipTapConverter.js      blocks[]/chapterIntro[] → TipTap JSON converter

services/export/
├── TipTapAsciidocConverter.js      TipTap JSON → AsciiDoc (used by DetailsModuleGenerator)
├── DetailsModuleGenerator.js       Publication generator (Mustache templates)
└── templates/                      Mustache templates for AsciiDoc output
```

---

[← 04 REST API](04-REST-API.md) | [06 Publication →](06-Publication.md)