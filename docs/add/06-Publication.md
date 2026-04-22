# Chapter 06 – Publication

## 1. Overview

The publication pipeline converts ODIP database content into a served Antora website accessible directly from the browser. It supports two modes:

- **Edition publish** — builds and serves a scoped site for a specific ODIP Edition (baseline + content filters applied); optionally also generates PDF from the same Antora source
- **Antora ZIP** — packages the Antora source tree for external stakeholders who build the site themselves

The pipeline is entirely server-side. The web client and CLI trigger it via REST endpoints; no content rendering happens on the client. All publication logic lives in `ODPEditionService`.

> **Implementation status:**
>
> | Format | Personal environment | EC environment |
> |---|---|---|
> | HTML static site (with search index) | ✅ Operational | ⏳ Not yet ported |
> | PDF | ✅ Operational | ⏳ Not yet ported |
> | Word (docx) | ❌ Not yet restored | ❌ Not yet restored |
>
> **PDF** is generated via `@antora/pdf-extension` + `asciidoctor-pdf` (installed as a system gem in `Dockerfile.odp-server`). The PDF assembler writes to `build/assembler/pdf/odip/_exports/index.pdf`, which is then copied to `build/site/odip/_exports/index.pdf`.
>
> **Word** generation (`antora-playbook-docx.yml`) was present in an earlier iteration but has not been restored. It requires `pandoc` in the server container and a working `antora-docx-extension.js`.
>
> **EC environment** requires pushing the custom `odp-server` image (built from `Dockerfile.odp-server`) to `$ODIP_DOCKER_REGISTRY`. The personal environment builds and runs the image locally via Podman.

---

## 2. Architecture

```
REST API  POST /odp-editions/{id}/publish[?pdf&word]  ← edition publish (build + serve)
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
          └── publishEdition(options)
                  │
                  ├── extract ZIP → git commit
                  ├── npx antora antora-playbook.yml        ← HTML site (mandatory)
                  ├── npx antora antora-playbook-pdf.yml    ← PDF (optional, non-fatal)
                  └── npx antora antora-playbook-docx.yml  ← Word (optional, non-fatal, not yet restored)
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
├── antora-playbook.yml          ← HTML site; UI bundle: local ./ui-bundle.zip
├── antora-playbook-pdf.yml      ← PDF build (@antora/pdf-extension + asciidoctor-pdf)
├── antora-playbook-docx.yml     ← Word build (not yet restored)
├── antora-assembler.yml         ← PDF assembler config (revnumber, revdate, pdf-theme)
├── antora-assembler-docx.yml    ← Word assembler config (not yet restored)
├── antora-docx-extension.js     ← Antora extension: AsciiDoc → DocBook → pandoc → docx (not yet restored)
├── antora.yml
├── pdf-theme.yml                ← Custom PDF theme (Noto fonts, EUROCONTROL blue)
├── package.json                 ← declares @antora/cli, @antora/site-generator, @antora/lunr-extension, @antora/pdf-extension
├── partials/
│   └── header-content.hbs      ← Custom EUROCONTROL navbar (injected into ui-bundle.zip at preparation time)
├── ui-bundle.zip                ← Antora default UI bundle, pre-patched with custom header (see §7)
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

`ODPEditionService.generateAntoraZip()` assembles the final ZIP by combining:

1. The entire static directory tree (all Antora playbooks, assembler configs, PDF theme, ROOT module, introduction module, portfolio module) — including the pre-patched `ui-bundle.zip`
2. All dynamically generated details module files (`modules/details/…`)

The four Antora modules are: `ROOT` (landing page), `introduction`, `portfolio` (high-level summaries), and `details` (full ON/OR pages by DrG).

---

## 4. REST API

Defined in `openapi-odp.yml`.

| Method | Endpoint | Query | Response |
|---|---|---|---|
| `POST` | `/odp-editions/{id}/publish` | `pdf`, `word` (optional boolean flags) | `{ siteUrl, pdfUrl, wordUrl }` |
| `GET` | `/odp-editions/{id}/export` | — | `application/zip` (Antora source ZIP) |

`POST /odp-editions/{id}/publish` returns 404 if the edition is not found, 409 if a publication is already in progress. PDF and Word failures are non-fatal — `pdfUrl` / `wordUrl` are `null` in the response if the format was not requested or its build failed. The built site is served at `/publication/site/` by Express static middleware (mount point registered at server startup).

The web client always requests PDF generation (`?pdf=true`) — PDF generation is the default behaviour. Word generation remains disabled until restored.

**Output URLs when build succeeds:**

| Format | URL |
|---|---|
| HTML | `/publication/site/` |
| PDF | `/publication/site/odip/_exports/index.pdf` |
| Word | `/publication/site/odip/_exports/index.docx` |

---

## 5. CLI

```bash
# Publish HTML site only
odp-cli edition publish <editionId>

# Publish HTML + PDF
odp-cli edition publish <editionId> --pdf

# Publish HTML + Word
odp-cli edition publish <editionId> --word

# Publish all formats
odp-cli edition publish <editionId> --pdf --word

# Generate Antora ZIP for local build
odp-cli publication antora -o ~/output/odip-web-site.zip --edition <editionId>

# Generate Antora ZIP for entire repository
odp-cli publication antora -o ~/output/odip-web-site.zip
```

`--pdf` requires `asciidoctor-pdf` installed as a system gem in the server container (`Dockerfile.odp-server`). `--word` requires `pandoc` and is not yet restored. Failed formats are reported as warnings; the command exits successfully if HTML succeeded.

Implementation: `workspace/cli/src/commands/odp-editions.js` (publish and ZIP).

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

# Install Ruby gem (for PDF only)
gem install asciidoctor-pdf rouge
```

### Build

```bash
# HTML only
npx antora antora-playbook.yml

# HTML + PDF
npx antora antora-playbook.yml && npx antora antora-playbook-pdf.yml

# Output:
#   HTML site:  build/site/index.html
#   PDF:        build/assembler/pdf/odip/_exports/index.pdf
```

**Build times** (approximate): HTML ~10–20 s; PDF ~2–15 min depending on document size.

---

## 7. Publication Workspace

The server maintains a persistent publication workspace at `$ODIP_HOME/publication/works/`. It is a git repository with Antora installed, used as the build environment for `publishEdition()`.

### Initialisation (server startup)

`initializePublicationWorkspace()` runs on every server start inside `startServer()` in `index.js`. All steps are idempotent:

1. `mkdir -p $ODIP_HOME/publication/works/` — belt-and-suspenders after `odip-admin ensure_runtime_dirs`
2. `git init` + configure `user.email` / `user.name` — only if `.git` absent
3. `cp -r $STATIC_CONTENT_PATH/. works/` — copies playbook, `package.json`, `ui-bundle.zip` etc. — only if `package.json` absent (first-time bootstrap)
4. `npm install` — installs `@antora/cli`, `@antora/site-generator`, `@antora/lunr-extension`, `@antora/pdf-extension` — only if `node_modules/` absent

### Publish cycle (`publishEdition`)

Each `publishEdition()` call:
1. Acquires mutex (`_publicationInProgress` flag) — concurrent calls rejected with 409
2. Generates Antora content ZIP via `generateAntoraZip()`
3. Extracts ZIP into `works/` (overwrites previous content, preserving `node_modules/` and `.git/`)
4. `git add . && git commit --allow-empty` — records each publication in git history
5. `npx antora antora-playbook.yml` — builds HTML site into `works/build/site/` (mandatory, fatal on failure)
6. `npx antora antora-playbook-pdf.yml` — builds PDF; assembler writes to `works/build/assembler/pdf/odip/_exports/index.pdf`, which is then copied to `works/build/site/odip/_exports/index.pdf` (only if `pdf` option set; non-fatal)
7. `npx antora antora-playbook-docx.yml` — builds Word document (only if `word` option set; non-fatal; not yet restored)
8. Releases mutex — returns `{ siteUrl, pdfUrl, wordUrl }` (`pdfUrl`/`wordUrl` are `null` if not requested or build failed)

The built site is immediately served by the Express static middleware mounted at `/publication/site/`.

### UI Bundle Preparation

The Antora UI bundle (`ui-bundle.zip`) is the stock Antora default UI, **pre-patched with a custom EUROCONTROL header** and committed to the repository. This is a one-time preparation step — the patched bundle is the authoritative source and must not be regenerated from scratch without re-applying the patch.

**How it was prepared:**

1. Download the stock Antora UI bundle:
   ```bash
   curl -L -o publication/web-site/static/ui-bundle.zip \
     "https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable"
   ```
   On restricted networks (EC), transfer manually from a machine with internet access.

2. Create the custom header partial at `publication/web-site/static/partials/header-content.hbs` with the EUROCONTROL navbar (title, search field, Download dropdown with PDF and Word links).

3. Inject the custom partial into the bundle, preserving the `partials/` path:
   ```bash
   cd publication/web-site/static
   zip ui-bundle.zip partials/header-content.hbs
   ```
   > **Critical:** use `zip` without `-j` to preserve the `partials/` directory path inside the archive. Using `-j` strips the path and creates a root-level entry that Antora ignores.

4. Commit the patched `ui-bundle.zip` to the repository.

The bundle is included in every publish ZIP and extracted into `works/` on each publish cycle, ensuring the custom header is always active. No runtime patching is performed.

**If the UI bundle needs to be updated** (e.g. new Antora UI release), repeat steps 1–4. The patch is a simple file replacement inside the ZIP — no build tooling required.

---

## 8. Server Container (`Dockerfile.odp-server`)

PDF generation requires `asciidoctor-pdf` to be available as a system gem inside the `odp-server` container. A custom `Dockerfile.odp-server` extends the `node:20` base image:

```dockerfile
FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends \
        ruby ruby-dev build-essential libxml2-dev libxslt-dev \
    && gem install asciidoctor-pdf rouge \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app/workspace/server
CMD ["npm", "run", "dev"]
```

The image is built once and referenced in `odip-deployment.yaml` as `$ODIP_DOCKER_REGISTRY/odp-server:latest` with `imagePullPolicy: Never` (local build, not pulled from registry).

**Build command:**
```bash
odip-admin install          # builds both odp-server and web-client images
# or selectively:
odip-admin restart --rebuild=server
```

**Porting to EC environment:** push the built image to `$ODIP_DOCKER_REGISTRY` and update `imagePullPolicy` to `IfNotPresent`. The Ruby gems are baked into the image — no internet access required at runtime.

---

## 9. Dependencies

| Package | Purpose |
|---|---|
| `archiver` | ZIP packaging of Antora source tree |
| `adm-zip` | ZIP extraction into publication workspace |
| `mustache` | Logic-less template rendering for AsciiDoc pages |
| `@antora/cli` + `@antora/site-generator` | HTML site generation (installed in `works/`, not server workspace) |
| `@antora/lunr-extension` | Full-text search in generated site |
| `@antora/pdf-extension` | PDF generation via `antora-playbook-pdf.yml` |
| `asciidoctor-pdf` + `rouge` | Ruby gems for PDF rendering (installed as system gems in `Dockerfile.odp-server`) |
| `pandoc` | Word document generation (not yet restored) |

---

[← 05 Import Pipeline](05-Import-Pipeline.md) | [07 CLI →](07-CLI.md)