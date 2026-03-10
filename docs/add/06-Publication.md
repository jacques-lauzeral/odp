# Chapter 06 – Publication

## 1. Overview

The publication pipeline converts ODIP database content into distributable artefacts for external stakeholders. It has two output formats:

- **Antora ZIP** — a structured AsciiDoc source tree that stakeholders build into a multi-page HTML site with full-text search and optional PDF
- **PDF** — a single consolidated document generated directly via AsciiDoctor

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
          ├── ODPEditionAggregator     ← queries Neo4j, assembles data
          │
          ├── ODPEditionTemplateRenderer  ← Mustache templates → AsciiDoc pages
          │
          ├── DeltaToAsciidocConverter    ← Quill Delta → AsciiDoc + image extraction
          │
          └── archiver (ZIP)              ← packages output directory
```

**File locations** — all under `workspace/server/src/services/`:

```
services/
└── publication/
    ├── PublicationService.js
    ├── ODPEditionAggregator.js
    ├── ODPEditionTemplateRenderer.js
    └── converters/
        └── DeltaToAsciidocConverter.js
```

Templates live in `workspace/server/src/templates/` as Mustache files.

---

## 3. Generation Pipeline

### Stage 1 — Data Aggregation

`ODPEditionAggregator` queries the store layer to assemble all content needed for the publication:

- All ONs and ORs grouped by DrG, with hierarchical path structure
- Operational Changes with milestone data
- Reverse relationships (which ORs implement a given ON, etc.)
- Referenced documents and annotations
- Setup entity display names (stakeholder categories, services, data categories)

When an `editionId` is provided the aggregator applies the edition's `baselineId` + `fromWaveId` filters. Without an `editionId` the entire repository is published.

### Stage 2 — Content Transformation

`DeltaToAsciidocConverter` converts every rich text field from Quill Delta JSON to AsciiDoc:

| Quill feature | AsciiDoc output |
|---|---|
| Bold / italic / underline / strikethrough | `*bold*`, `_italic_`, etc. |
| Headers levels 1–6 | `= Title`, `== Section`, etc. |
| Ordered / unordered lists (nested) | `. item` / `* item` with indent |
| External links | `link:url[label]` |
| Inline code / code blocks | `` `code` `` / `[source]\n----` |
| Embedded images (base64 PNG) | Extracted to `assets/images/image-NNN.png`, referenced as `image::image-NNN.png[]` |

Images are extracted sequentially, assigned unique filenames (`image-001.png`, `image-002.png`, …), and written to `modules/details/assets/images/`.

### Stage 3 — Page and Navigation Generation

`ODPEditionTemplateRenderer` uses Mustache templates to produce one AsciiDoc page per ON/OR and one `nav.adoc` per directory level:

```
modules/details/
├── pages/
│   ├── index.adoc
│   ├── idl/
│   │   ├── adp/
│   │   │   ├── on-91.adoc
│   │   │   ├── or-93.adoc
│   │   │   └── nav.adoc
│   │   └── nav.adoc
│   └── <drg>/...
├── assets/images/
│   ├── image-001.png
│   └── ...
└── nav.adoc
```

Navigation files use Antora `xref` syntax and are ordered by `itemId`.

### Stage 4 — Antora Structure

The output directory is structured as a complete Antora component source:

```yaml
# antora.yml (generated)
name: odip
title: ODIP
version: ~
nav:
- modules/ROOT/nav.adoc
- modules/introduction/nav.adoc
- modules/portfolio/nav.adoc
- modules/details/nav.adoc
```

Four modules are generated: `ROOT` (landing page), `introduction`, `portfolio` (high-level summaries), and `details` (full ON/OR pages by DrG).

### Stage 5 — Packaging

The complete Antora source tree is packaged as a ZIP archive using `archiver` and streamed as the HTTP response (`application/zip`).

---

## 4. REST API

Defined in `openapi-publication.yml`.

| Method | Endpoint | Body / Query | Response |
|---|---|---|---|
| `POST` | `/publications/antora` | `?editionId=<id>` (optional) | `application/zip` |
| `POST` | `/publications/pdf` | `?editionId=<id>` (optional) | `application/pdf` |

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