# Chapter 06 – Publication

## 1. Overview

The publication pipeline converts ODIP database content into a served Antora website accessible directly from the browser. It supports two modes:

- **Edition publish** — builds and serves a scoped site for a specific ODIP Edition (baseline + content filters applied)
- **Antora ZIP** — packages the Antora source tree for external stakeholders who build the site themselves

PDF and Word generation are not yet implemented.

The pipeline is entirely server-side. The web client and CLI trigger it via REST endpoints; no content rendering happens on the client. `PublicationService` is deprecated — all publication logic now lives in `ODPEditionService`.

---

## 2. Architecture

```
REST API  POST /odp-editions/{id}/publish          ← edition publish (build + serve)
REST API  POST /publications/antora?editionId=<id>  ← ZIP download (deprecated path)
          │
          ▼
    ODPEditionService
          │
          ├── generateAntoraZip()     ← assembles Antora source ZIP
          │       │
          │       └── DetailsModuleGenerator   ← queries Neo4j via ORService, generates AsciiDoc pages
          │               │
          │               ├── operationalRequirementService.getAll()   ← standard projection, edition-scoped
          │               ├── DeltaToAsciidocConverter   ← Quill Delta → AsciiDoc + image extraction
          │               ├── Mustache templates          ← on.mustache, or.mustache, etc.
          │               └── archiver (ZIP)              ← packages static + dynamic content
          │
          └── publishEdition()        ← extracts ZIP → git commit → npx antora → serves site
```

**File locations** — all under `workspace/server/src/services/`:

```
services/
├── ODPEditionService.js          ← edition CRUD + generateAntoraZip() + publishEdition()
└── publication/
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
├── antora-playbook.yml       ← UI bundle: local ./ui-bundle.zip (not remote URL)
├── antora.yml
├── package.json              ← declares @antora/cli, @antora/site-generator, @antora/lunr-extension
├── ui-bundle.zip             ← downloaded by odip-admin on first start (see §7)
├── modules/ROOT/nav.adoc
├── modules/ROOT/pages/index.adoc
├── modules/introduction/pages/index.adoc
└── modules/portfolio/pages/index.adoc
```

---

## 3. Generation Pipeline

### Stage 1 — Data Fetch

`DetailsModuleGenerator` delegates to `operationalRequirementService.getAll()` with `projection = 'standard'` and optional `editionId` (null for full-repository mode). The service handles edition context resolution — mapping `editionId` to `{baselineId, editionId}` via `odpEditionStore.resolveContext()` — before calling the store. All ONs and ORs are retrieved and split by type.

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

Defined in `openapi-odp.yml` (publish) and `openapi-publication.yml` (ZIP download).

| Method | Endpoint | Body / Query | Response |
|---|---|---|---|
| `POST` | `/odp-editions/{id}/publish` | — | `{ siteUrl: '/publication/site/' }` |
| `POST` | `/publications/antora` | `?editionId=<id>` (optional) | `application/zip` |
| `POST` | `/publications/pdf` | `?editionId=<id>` (optional) | `application/pdf` (not yet implemented) |

`POST /odp-editions/{id}/publish` returns 404 if the edition is not found, 409 if a publication is already in progress. The built site is served at `/publication/site/` by Express static middleware (mount point registered at server startup).

---

## 5. CLI

```bash
# Publish a specific edition (build + serve server-side)
odp-cli edition publish <editionId>

# Generate Antora ZIP for local build (ZIP download)
odp-cli publication antora -o ~/output/odip-web-site.zip --edition <editionId>

# Generate for entire repository
odp-cli publication antora -o ~/output/odip-web-site.zip
```

Implementation: `workspace/cli/src/commands/odp-editions.js` (publish), `workspace/cli/src/commands/publication.js` (ZIP).

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

## 7. Publication Workspace

The server maintains a persistent publication workspace at `$ODIP_HOME/publication/works/`. It is a git repository with Antora installed, used as the build environment for `publishEdition()`.

### Initialisation (server startup)

`initializePublicationWorkspace()` runs on every server start inside `startServer()` in `index.js`. All steps are idempotent:

1. `mkdir -p $ODIP_HOME/publication/works/` — belt-and-suspenders after `odip-admin ensure_runtime_dirs`
2. `git init` + configure `user.email` / `user.name` — only if `.git` absent
3. `cp -r $STATIC_CONTENT_PATH/. works/` — copies playbook, `package.json`, `ui-bundle.zip` etc. — only if `package.json` absent (first-time bootstrap)
4. `npm install` — installs `@antora/cli`, `@antora/site-generator`, `@antora/lunr-extension` — only if `node_modules/` absent

> **Note:** `npm install` currently runs inside the container at server startup. This works because the container has Node 20 and the `works/` volume is writable. A possible future improvement is to move this step to `odip-admin` (host side, aligned with the `--install` pattern) when the host and container Node versions are guaranteed to match.

### Publish cycle (`publishEdition`)

Each `publishEdition()` call:
1. Acquires mutex (`_publicationInProgress` flag) — concurrent calls rejected with 409
2. Generates Antora content ZIP via `generateAntoraZip()`
3. Extracts ZIP into `works/` (overwrites previous content, preserving `node_modules/` and `.git/`)
4. `git add . && git commit --allow-empty` — records each publication in git history
5. `npx antora antora-playbook.yml` — builds HTML site into `works/build/site/`
6. Releases mutex — returns `{ siteUrl: '/publication/site/' }`

The built site is immediately served by the Express static middleware mounted at `/publication/site/`.

### UI Bundle

The Antora UI bundle (`ui-bundle.zip`) is required for the Antora build. It cannot be downloaded at build time because the container has no internet access. `odip-admin ensure_runtime_dirs` handles this:

1. Downloads `ui-bundle.zip` from GitLab to `$ODIP_REPO/publication/web-site/static/` if not present (requires host internet access)
2. Copies it to `$ODIP_HOME/publication/works/` if not already there

The bundle is included in every generated Antora ZIP so it survives extraction into `works/`. The `antora-playbook.yml` references it as `./ui-bundle.zip` (local path, not remote URL).

---

## 8. Dependencies

| Package | Purpose |
|---|---|
| `archiver` | ZIP packaging of Antora source tree |
| `adm-zip` | ZIP extraction into publication workspace |
| `mustache` | Logic-less template rendering for AsciiDoc pages |
| `@antora/cli` + `@antora/site-generator` | HTML site generation (installed in `works/`, not server workspace) |
| `@antora/lunr-extension` | Full-text search in generated site |

---

[← 05 Import Pipeline](05-Import-Pipeline.md) | [07 CLI →](07-CLI.md)