# Chapter 06 – Publication

## 1. Overview

The publication pipeline converts ODIP database content into distributable artefacts for external stakeholders. It has two output formats:

- **Antora ZIP** — a structured AsciiDoc source tree that stakeholders build into a multi-page HTML site with full-text search and optional PDF
- **PDF** — a single consolidated document generated directly via AsciiDoctor (not yet implemented)

Both formats can target a specific ODIP Edition (scoped by baseline + wave) or the entire repository.

The pipeline is entirely server-side. The web client and CLI trigger it via REST endpoints; no content rendering happens on the client.

---

## 2. Architecture

```
REST API  POST /publications/antora?editionId=<id>
REST API  POST /publications/pdf?editionId=<id>
          │
          ▼
    PublicationService
          │
          └── DetailsModuleGenerator   ← queries Neo4j, generates AsciiDoc pages
                │
                ├── operationalRequirementStore.findAll()
                │
                ├── DeltaToAsciidocConverter   ← Quill Delta → AsciiDoc + image extraction
                │
                ├── Mustache templates          ← on.mustache, or.mustache, etc.
                │
                └── archiver (ZIP)              ← packages static + dynamic content
```

**File locations** — all under `workspace/server/src/services/`:

```
services/
└── publication/
    ├── PublicationService.js
    └── generators/
        └── DetailsModuleGenerator.js
    └── templates/
        ├── on.mustache
        ├── or.mustache
        ├── folder-index.mustache
        └── drg-index.mustache

services/export/
└── DeltaToAsciidocConverter.js   (shared with docx export)
```

Static Antora scaffolding lives in `publication/web-site/static/` (configurable via `STATIC_CONTENT_PATH` env var):

```
static/
├── antora-playbook.yml
├── antora.yml
├── modules/ROOT/nav.adoc
├── modules/ROOT/pages/index.adoc
├── modules/introduction/pages/index.adoc
└── modules/portfolio/pages/index.adoc
```

---

## 3. Generation Pipeline

### Stage 1 — Data Fetch

`DetailsModuleGenerator` queries `operationalRequirementStore.findAll()` in a single transaction with no baseline or wave filters (full repository). All ONs and ORs are retrieved and split by type.

### Stage 2 — Relationship Resolution

Reverse relationship maps are built in-memory from the fetched data:

- `refinedBy[]` — ONs/ORs that refine a given entity (from `refinesParents`)
- `implementedBy[]` — ORs that implement a given ON (from `implementedONs`)

Cross-reference lookups (`onLookup`, `orLookup`) map `itemId → { drg, path }` and are used to generate correct Antora `xref` links between pages.

### Stage 3 — Hierarchy Building

Entities are placed into a per-DrG tree structure:

- Entities with a `path[]` → placed into nested folder nodes matching their path segments
- Entities with `refinesParents` → nested as children under their parent entity (same folder)
- Entities with neither → placed at the DrG root

Refinement children are sorted by `itemId` at each level. Multi-level refinements are resolved iteratively until all children are placed.

### Stage 4 — Content Transformation

`DeltaToAsciidocConverter` converts every rich text field from Quill Delta JSON to AsciiDoc:

| Quill feature | AsciiDoc output |
|---|---|
| Bold / italic / underline / strikethrough | `*bold*`, `_italic_`, etc. |
| Headers levels 1–6 | `= Title`, `== Section`, etc. |
| Ordered / unordered lists (nested) | `. item` / `* item` with indent |
| External links | `link:url[label]` |
| Inline code / code blocks | `` `code` `` / `[source]\n----` |
| Embedded images (base64 PNG) | Extracted to `assets/images/image-NNN.png`, referenced as `image::image-NNN.png[]` |

Images are extracted using a global counter (never reset between entities) to guarantee unique filenames across the entire publication. All extracted images are written to `modules/details/assets/images/`.

### Stage 5 — Page Generation

One AsciiDoc page is generated per ON and per OR using Mustache templates. Pages contain:

- Metadata block: type, itemId, DrG, path, refines link
- Statement, Rationale, Flows sections (when present)
- Refined By section (links to refining child entities)
- Implemented By section (ON pages: links to implementing ORs)
- Implements section (OR pages: links to implemented ONs)

Folder index pages (`index.adoc`) are generated for each subfolder listing its ONs, ORs, and subfolders.

Output structure per DrG:

```
modules/details/
├── pages/
│   ├── index.adoc
│   ├── {drg}/
│   │   ├── index.adoc
│   │   ├── {folder}/
│   │   │   ├── index.adoc
│   │   │   ├── on-{itemId}.adoc
│   │   │   └── or-{itemId}.adoc
│   │   ├── on-{itemId}.adoc
│   │   └── or-{itemId}.adoc
│   └── ...
├── assets/images/
│   ├── image-001.png
│   └── ...
└── nav.adoc
```

Navigation (`nav.adoc`) is generated hierarchically, mirroring the folder/entity tree, using Antora `xref` syntax ordered by `itemId`.

### Stage 6 — Antora Structure and Packaging

`PublicationService` assembles the final ZIP by combining:

1. The entire static directory tree (Antora playbook, ROOT module, introduction module, portfolio module)
2. All dynamically generated details module files (`modules/details/…`)

The ZIP is streamed directly as the HTTP response (`application/zip`).

The four Antora modules are: `ROOT` (landing page), `introduction`, `portfolio` (high-level summaries), and `details` (full ON/OR pages by DrG).

---

## 4. REST API

Defined in `openapi-publication.yml`.

| Method | Endpoint | Body / Query | Response |
|---|---|---|---|
| `POST` | `/publications/antora` | `?editionId=<id>` (optional) | `application/zip` |
| `POST` | `/publications/pdf` | `?editionId=<id>` (optional) | `application/pdf` (not yet implemented) |

Both endpoints return 404 if `editionId` is provided but not found. Omitting `editionId` publishes the entire repository.

---

## 5. CLI

```bash
# Generate Antora ZIP for a specific edition
odp-cli publication antora -o ~/output/odip-web-site.zip --edition <editionId>

# Generate for entire repository
odp-cli publication antora -o ~/output/odip-web-site.zip
```

Implementation: `workspace/cli/src/commands/publication.js`

---

## 6. Building the Web Site from the ZIP

Once the ZIP has been generated, stakeholders build the HTML site (and optionally PDF) using Antora outside the ODIP system.

### One-Time Setup

```bash
# Extract the ZIP
unzip odip-web-site.zip -d odip-web-site
cd odip-web-site

# Install Node dependencies (Antora + extensions)
npm install
# Installs: @antora/cli, @antora/site-generator,
#           @antora/lunr-extension, @antora/pdf-extension

# Install Ruby dependencies (for PDF only)
bundle install --path vendor/bundle
# Installs: asciidoctor-pdf, rouge
```

### Build

```bash
# HTML + PDF
npx antora antora-playbook.yml

# Output:
#   HTML site:  build/site/index.html
#   PDF:        build/site/_/pdf/odip.pdf
```

**Build times** (approximate): HTML ~10–20 s; PDF ~2–15 min depending on document size.

### Rebuild After a New Export

```bash
# Preserve installed dependencies, replace content
mv odip-web-site odip-web-site-backup
unzip odip-web-site-new.zip -d odip-web-site
cp -r odip-web-site-backup/node_modules odip-web-site/
cp -r odip-web-site-backup/vendor       odip-web-site/
cd odip-web-site && npx antora antora-playbook.yml
```

### Quality Checks

```bash
# Verify file count (~2000+ HTML pages expected)
find build/site -name "*.html" | wc -l

# Check PDF was generated
ls -lh build/site/_/pdf/odip.pdf

# Check search index
ls -lh build/site/_/js/search-ui.js
```

---

## 7. Dependencies

| Package | Purpose |
|---|---|
| `archiver` | ZIP packaging of Antora source tree |
| `mustache` | Logic-less template rendering for AsciiDoc pages |
| `@antora/cli` + `@antora/site-generator` | HTML site generation (post-export, not in server) |
| `@antora/lunr-extension` | Full-text search in generated site |
| `@antora/pdf-extension` + `asciidoctor-pdf` | PDF generation (post-export, not in server) |

---

[← 05 Import Pipeline](05-Import-Pipeline.md) | [07 CLI →](07-CLI.md)