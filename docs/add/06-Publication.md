# Chapter 06 – Publication

## 1. Overview

The publication pipeline converts ODIP database content into one or more output formats. Each format is generated independently and on demand via CLI or REST API.

**Supported output formats:**

| Format | Description |
|---|---|
| **Website** | Antora HTML site with search and download links; served at `/publication/site/` |
| **PDF flat** | Single PDF document covering selected content |
| **Word flat** | Single Word document covering selected content |
| **Word multipart** | One Word document per domain + optional intro, delivered as a ZIP |

**Content selection** (`intro`, `domains`) is available for PDF flat, Word flat, and Word multipart. Omitting both includes all content.

**Decoupled workflow:** document formats (PDF flat, Word flat, Word multipart) are generated independently of the website. The website build copies any available pre-generated artifacts from `publication/_artifacts/` into the site exports directory — it does not trigger their generation.

Only one publication can run at a time (mutex). All publication logic lives in `ODPEditionService`.

> **Implementation status:**
>
> | Format | Personal environment | EC environment |
> |---|---|---|
> | HTML static site (with search index) | ✅ Operational | ✅ Operational |
> | PDF flat | ✅ Operational | ✅ Operational |
> | Word flat | ✅ Operational | ✅ Operational |
> | Word multipart | ✅ Operational | ✅ Operational |
>
> **PDF** is generated via `@antora/pdf-extension` + `asciidoctor-pdf` (installed as a system gem in `Dockerfile.odp-server`).
>
> **Word** generation requires `pandoc` in the server container and `antora-docx-extension.js` in `shared/config/`.
>
> **EC environment** requires `ODIP_GEM_MODE=host` and `~/.gemrc` configured with the corporate proxy — `odip-admin` handles the rest automatically. See ch09 §3 and §5.2.

---

## 2. Architecture

```
REST API  POST /odp-editions/{id}/publish  ← PublishOptions body
          │
          ▼
    ODPEditionService.publishEdition(options)
          │
          ├── generateAntoraZip(editionId, userId, { mode, drgFilter?, selection? })
          │       │
          │       ├── DetailsModuleGenerator      ← queries Neo4j, generates AsciiDoc pages
          │       │       ├── operationalRequirementService.getAll()   ← standard projection, edition-scoped
          │       │       ├── DeltaToAsciidocConverter   ← Quill Delta → AsciiDoc + image extraction
          │       │       └── Mustache templates         ← on.mustache, or.mustache, etc.
          │       │
          │       └── _createAntoraZip(configPaths, contentMappings, detailsFiles)
          │               ├── config files   → works dir root (flat copy)
          │               ├── content files  → Antora module paths (remapped per build mode)
          │               └── generated files → modules/details/ or modules/ROOT/ (domain mode)
          │
          ├── _buildFlat(format)
          │       └── works/flat/antora-playbook-{pdf|docx}.yml → _artifacts/index.{pdf|docx}
          │           (antora binary: works/node_modules/.bin/antora, cwd: works/flat/)
          │
          ├── _buildWordMultipart(selection)
          │       ├── intro: works-intro/multipart/antora-playbook-docx.yml → ZIP entry
          │       └── per DrG: works-{drg}/multipart/antora-playbook-docx.yml → ZIP entry
          │       └── assemble → _artifacts/word-multipart.zip
          │           (NODE_PATH=works/node_modules for all multipart builds)
          │
          └── website build (if requested)
                  └── works/website/antora-playbook.yml (output.dir: ../build/site)
                      → _copyArtifactsToSite(_artifacts/ → works/build/site/odip/_exports/)
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

Static publication scaffolding lives under `publication/` in the repository (configurable via `PUBLICATION_PATH` env var, default `/app/publication`):

```
publication/
├── shared/
│   └── config/                      ← bootstrapped into all works dirs
│       ├── package.json             ← @antora/cli, @antora/site-generator, @antora/pdf-extension, etc.
│       ├── ui-bundle.zip            ← Pre-patched Antora UI bundle (see §7)
│       ├── pdf-theme.yml            ← Custom PDF theme (Noto fonts, EUROCONTROL blue)
│       ├── word-template.docx       ← Word reference template (copied as template.docx)
│       └── antora-docx-extension.js ← AsciiDoc → DocBook → pandoc → docx
│
├── website/
│   └── config/
│       ├── antora.yml               ← component descriptor (ROOT + details nav)
│       └── antora-playbook.yml      ← HTML site build
│
├── flat/
│   └── config/
│       ├── antora.yml               ← component descriptor (ROOT + details nav)
│       ├── antora-playbook-pdf.yml  ← flat PDF build
│       ├── antora-assembler-pdf.yml ← flat PDF assembler
│       ├── antora-playbook-docx.yml ← flat Word build
│       └── antora-assembler-docx.yml← flat Word assembler
│
└── multipart/
    └── config/                      ← Word multipart only (intro + per-domain)
        ├── antora.yml               ← component descriptor (ROOT only, no details nav)
        ├── antora-playbook-docx.yml ← multipart Word build
        └── antora-assembler-docx.yml← multipart Word assembler
```

Content trees (not config):

```
publication/
├── shared/
│   └── content/
│       ├── edition-plan.json        ← DrG ordering for website/flat builds
│       ├── intro/
│       │   └── index.adoc           ← ODIP Edition introduction page
│       └── {drg}/                   ← one per DrG
│           └── index.adoc           ← DrG domain introduction page
│
├── website/
│   └── content/
│       └── nav.adoc                 ← ROOT module nav (all DrGs, website mode)
│
├── flat/
│   └── content/
│       └── intro/
│           └── nav.adoc             ← ROOT module nav (intro, flat builds)
│
└── multipart/
    └── content/
        └── intro/
            └── nav.adoc             ← ROOT module nav (intro, multipart builds)
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

**Folder index pages** (`index.adoc`) are generated for each subfolder as `modules/details/partials/{drg}/{folder}/index.adoc` (not as pages). This allows manually authored DrG domain introduction pages (see §Static DrG Introduction Pages below) to `include::partial$` them.

**Collapsed folders:** a folder is _collapsed_ if it has at least one direct ON. Collapsed folders do not generate a separate page for their sub-folders. Instead, sub-folder content is absorbed inline into the collapsed folder's own page, with sub-folder names rendered as non-clickable bullet labels. Individual ON/OR entity files inside collapsed sub-folders are still written at their own paths so that xrefs resolve correctly. The nav mirrors this: collapsed sub-folders appear as plain-text labels (no xref) in `nav.adoc`, followed by their entities — ensuring Antora can highlight and expand the correct nav node when navigating to an individual entity page.

**Export suppression:** folder index content (ON/OR trees, sub-domain lists) is wrapped in `ifndef::env-export[]` in the Mustache templates. The `env-export` attribute is set in the assembler configs (PDF and Word), so these navigation-only sections are silently omitted from PDF and Word exports.

Output structure per DrG:

```
modules/details/
├── pages/
│   ├── {drg}/
│   │   ├── index.adoc              ← manually authored (static); includes partial below
│   │   ├── {folder}/
│   │   │   ├── index.adoc          ← generated (non-collapsed folders only)
│   │   │   ├── on-{itemId}.adoc
│   │   │   └── or-{itemId}.adoc
│   │   ├── on-{itemId}.adoc
│   │   └── or-{itemId}.adoc
│   └── ...
├── partials/
│   └── {drg}/
│       └── index.adoc              ← generated DrG sitemap fragment (included by static page)
├── assets/images/
│   ├── image-001.png
│   └── ...
└── nav.adoc                        ← DrG entries at depth *, sub-folders at depth **+
```

Navigation (`nav.adoc`) is generated hierarchically mirroring the folder/entity tree, using Antora `xref` syntax. DrGs are sorted alphabetically by display name. Folders within each DrG are sorted alphabetically by folder name.

### Static DrG Introduction Pages

Each DrG has a manually authored introduction page at `modules/details/pages/{drg}/index.adoc` in the static directory. These pages are **not** generated — they are maintained by the ODIP team and committed to the static content directory.

**Template pattern** (mandatory for all DrG pages):

```asciidoc
= {DrG display name}
:notitle:

== Introduction

{Human-authored introduction text describing the DrG scope, CONOPS baseline, etc.}

== Operational Needs baseline

{Optional: manually authored summary of top-level ONs with links to their folder pages.}

include::partial${drg}/index.adoc[]
```

Key points:

- `= {DrG display name}` — level-0 title, drives the browser tab title (`{title} : ODIP`) and PDF TOC entry. Must match the DrG display name used in nav.adoc.
- `:notitle:` — suppresses the level-0 title from rendering in HTML (the nav label already provides the heading). Without this, the title appears as an unnumbered heading before the first `==` section.
- `== Introduction` and subsequent `==` sections — numbered in PDF via `section_merge_strategy: fuse` in the assembler config; rendered as normal sections in HTML.
- `include::partial${drg}/index.adoc[]` — injects the generated sitemap fragment (ON/OR tree). Wrapped in `ifndef::env-export[]` inside the template, so it is suppressed in PDF/Word exports automatically.
- The `include::` must be placed **after** the human-authored content, not before, so the intro text precedes the generated listing.

### Stage 6 — Antora Structure and Packaging

`ODPEditionService.generateAntoraZip()` assembles the final ZIP by combining:

1. **Shared config** (`shared/config/`) — lands at works dir root (package.json, ui-bundle, theme, extension)
2. **Mode-specific config** (`website/`, `flat/`, or `multipart/config/`) — lands in a build-type subdir:
   - `antora.yml` → works dir **root** (Antora reads component descriptor from the git root)
   - All other files (playbooks, assemblers) → `website/`, `flat/`, or `multipart/` subdir
3. **Shared assets** (ui-bundle.zip, pdf-theme.yml, template.docx, antora-docx-extension.js) → also copied into the mode subdir so playbooks can reference them via `./`
4. **Content files** — remapped to Antora module paths per build mode
5. **Generated details files** — from `DetailsModuleGenerator`; in domain mode remapped to `modules/ROOT/`

---

## 4. REST API

Defined in `openapi-odp.yml`.

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/odp-editions/{id}/publish` | `PublishOptions` | `PublishResult` |
| `GET` | `/odp-editions/{id}/export` | — | `application/zip` (Antora source ZIP) |

`POST /odp-editions/{id}/publish` returns 404 if the edition is not found, 409 if a publication is already in progress. Non-website format failures are non-fatal — the corresponding URL is null in the response. The built site is served at `/publication/site/` by Express static middleware.

**`PublishOptions`** (absent or empty body defaults to `{ website: true }`):

| Property | Type | Description |
|---|---|---|
| `wordFlat` | `ContentSelection` | Generate a single flat Word document |
| `wordMultipart` | `ContentSelection` | Generate a multipart Word ZIP (one .docx per domain + intro) |
| `pdfFlat` | `ContentSelection` | Generate a single flat PDF document |
| `website` | `boolean` | Build and serve the HTML site; copy available artifacts into exports |

**`ContentSelection`**: `{ intro?: boolean, domains?: string[] }`. Omitting both includes all content.

**`PublishResult`**: `{ siteUrl, wordFlatUrl, wordMultipartUrl, pdfFlatUrl }` — null for formats not requested or whose build failed.

### Web Client

The Publication activity exposes a **Publish** button on the edition details panel. Clicking it:

1. Disables the button (labelled "Publishing…") for the duration of the request
2. Calls `apiClient.publishEdition(editionId)` — `POST /odp-editions/{id}/publish` with `{ website: true }`
3. On success: displays "✓ Published — Open site" with an absolute link to the served site
4. On 409: displays "Publication already in progress — please retry later"
5. On other error: displays the error message in the status area

The web client applies a **300-second fetch timeout** to this request (`api-client.js`, `publishEdition()`) — overriding the global default timeout — to accommodate long builds.

**Output URLs when build succeeds:**

| Format | URL |
|---|---|
| HTML | `/publication/site/` |
| PDF flat | `/publication/site/odip/_exports/index.pdf` |
| Word flat | `/publication/site/odip/_exports/index.docx` |
| Word multipart | `/publication/site/odip/_exports/word-multipart.zip` |

---

## 5. CLI

```bash
# Website only (default)
odp-cli edition publish <editionId> --website

# Flat PDF, all content
odp-cli edition publish <editionId> --pdf-flat

# Flat Word, selected content
odp-cli edition publish <editionId> --word-flat --intro --domains RRT,IDL

# Word multipart, all domains + intro
odp-cli edition publish <editionId> --word-multipart --intro

# Word multipart, selected domains
odp-cli edition publish <editionId> --word-multipart --domains RRT,IDL

# Generate artifacts then publish website (two separate calls)
odp-cli edition publish <editionId> --pdf-flat --word-flat --word-multipart
odp-cli edition publish <editionId> --website

# Generate Antora ZIP for local build
odp-cli publication antora -o ~/output/odip-web-site.zip --edition <editionId>
```

`--pdf-flat` requires `asciidoctor-pdf` installed as a system gem in the server container (`Dockerfile.odp-server`). `--word-flat` and `--word-multipart` require `pandoc`. Failed formats are reported as warnings. See ch07 §Publication for the full flag reference.

Implementation: `workspace/cli/src/commands/odp-editions.js`.

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

The server maintains persistent publication workspaces under `$ODIP_HOME/publication/`:

| Directory | Purpose | Antora binary |
|---|---|---|
| `works/` | Website + flat PDF/Word builds | `works/node_modules/.bin/antora` |
| `works-intro/` | Word multipart intro build | same (absolute path) |
| `works-{drg}/` × N | Word multipart per-domain builds | same (absolute path) |
| `_artifacts/` | Persistent artifact staging area | — |

**All works dirs share the same `node_modules`** — only `works/` has `node_modules/` installed. Multipart builds reference the antora binary via absolute path and set `NODE_PATH=works/node_modules` so Node resolves shared packages (e.g. `@antora/run-command-helper`) regardless of `cwd`.

`works/` is shared between website and flat builds because only one publication runs at a time. The flat build extracts a `flat`-mode ZIP into `works/` before running; the website build extracts a `website`-mode ZIP.

N is derived from `shared/content/` subdirectories (excluding `intro/`) — no hardcoded DrG list.

### Works dir internal layout

Each works dir contains at publish time:
- `antora.yml` at root — Antora component descriptor, injected per build
- `modules/` at root — content, injected per build
- Shared assets at root: `ui-bundle.zip`, `pdf-theme.yml`, `template.docx`, `antora-docx-extension.js`, `package.json`, `Gemfile`
- Build-type subdir (`website/`, `flat/`, or `multipart/`) containing playbooks, assemblers, and copies of shared assets (so `./` relative paths in playbooks resolve correctly)

### Initialisation (server startup)

`initializePublicationWorkspace()` runs on every server start. It calls `initializeWorksDir(worksDir, sourcePaths, label)` for each works dir. All steps are idempotent:

1. `mkdir -p {worksDir}`
2. `git init` + configure `user.email` / `user.name` — only if `.git` absent
3. Bootstrap from `sourcePaths[]` — copies config files in order (later overrides earlier) — only if `package.json` absent
4. Warns if `node_modules/` absent (run `odip-admin install` to fix)

Bootstrap source: **`shared/config` only** for all works dirs. Playbooks, assemblers, and `antora.yml` are **not** bootstrapped statically — they are injected via ZIP at publish time into the appropriate build-type subdir.

### ZIP generation (`generateAntoraZip`)

`generateAntoraZip(editionId, userId, { mode, drgFilter?, selection? })` produces a scoped Antora source ZIP:

| Mode | Config paths | Content |
|---|---|---|
| `website` | `shared` + `website` | All domains (or selection), full details module |
| `flat` | `shared` + `flat` | All domains (or selection), full details module |
| `intro` | `shared` + `multipart` | ROOT module only (intro content) |
| `domain` | `shared` + `multipart` | Single DrG, remapped to ROOT module |

Content path mappings per build mode:

| Mode | Source | Target in ZIP |
|---|---|---|
| `website` | `shared/content/intro/index.adoc` | `modules/ROOT/pages/index.adoc` |
| `website` | `shared/content/{drg}/index.adoc` | `modules/details/pages/{drg}/index.adoc` |
| `website` | `website/content/nav.adoc` | `modules/ROOT/nav.adoc` |
| `flat` | `shared/content/intro/index.adoc` | `modules/ROOT/pages/index.adoc` |
| `flat` | `shared/content/{drg}/index.adoc` | `modules/details/pages/{drg}/index.adoc` |
| `flat` | `flat/content/intro/nav.adoc` | `modules/ROOT/nav.adoc` |
| `intro` | `shared/content/intro/index.adoc` | `modules/ROOT/pages/index.adoc` |
| `intro` | `multipart/content/intro/nav.adoc` | `modules/ROOT/nav.adoc` |
| `domain` | `shared/content/{drg}/index.adoc` | `modules/ROOT/pages/index.adoc` |
| `domain` (generated) | `details/{drg}/pages/...` | `modules/ROOT/pages/...` |
| `domain` (generated) | `details/nav.adoc` | `modules/ROOT/nav.adoc` |

### Publish cycle (`publishEdition`)

Each `publishEdition()` call:
1. Acquires mutex (`_publicationInProgress` flag) — concurrent calls rejected with 409
2. Normalises `PublishOptions` — absent body defaults to `{ website: true }`
3. If flat builds requested: generate `flat`-mode ZIP → extract into `works/` → git commit
4. Flat PDF (if `pdfFlat`): `_buildFlat('pdf')` — runs from `works/flat/`, non-fatal; output written to `_artifacts/` and site exports
5. Flat Word (if `wordFlat`): `_buildFlat('word')` — runs from `works/flat/`, non-fatal; output written to `_artifacts/` and site exports
6. Word multipart (if `wordMultipart`): `_buildWordMultipart()` — non-fatal; output written to `_artifacts/` and site exports
7. Website (if `website`): generate `website`-mode ZIP → extract into `works/` → git commit → run `works/website/antora-playbook.yml` — fatal on failure; then `_copyArtifactsToSite()` copies all available artifacts from `_artifacts/` into site exports
8. Releases mutex — returns `{ siteUrl, wordFlatUrl, wordMultipartUrl, pdfFlatUrl }`

All shell commands are executed via `_execStreaming()` (async `child_process.exec` with real-time streaming). Non-fatal builds use `_tryExecAsync()`.

### UI Bundle Preparation

The Antora UI bundle (`ui-bundle.zip`) is the stock Antora default UI, **pre-patched with a custom EUROCONTROL header** and committed to the repository. This is a one-time preparation step — the patched bundle is the authoritative source and must not be regenerated from scratch without re-applying the patch.

**How it was prepared:**

1. Download the stock Antora UI bundle:
   ```bash
   curl -L -o publication/shared/config/ui-bundle.zip \
     "https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable"
   ```
   On restricted networks (EC), transfer manually from a machine with internet access.

2. Create the custom header partial at `publication/website/config/partials/header-content.hbs` with the EUROCONTROL navbar (title, search field, Download dropdown with PDF and Word links).

3. Inject the custom partial into the bundle, preserving the `partials/` path:
   ```bash
   cd publication/shared/config
   zip ui-bundle.zip partials/header-content.hbs
   ```
   > **Critical:** use `zip` without `-j` to preserve the `partials/` directory path inside the archive. Using `-j` strips the path and creates a root-level entry that Antora ignores.

4. Commit the patched `ui-bundle.zip` to the repository.

The bundle is included in every publish ZIP and extracted into `works/` on each publish cycle. No runtime patching is performed.

---

## 8. Server Container (`Dockerfile.odp-server`)

PDF generation requires `asciidoctor-pdf` to be available as a system gem inside the `odp-server` container. Word generation requires `pandoc`. A custom `Dockerfile.odp-server` extends the `node:20` base image:

```dockerfile
FROM node:20

ARG http_proxy
ARG https_proxy

RUN apt-get update && apt-get install -y --no-install-recommends \
        ruby ruby-dev build-essential libxml2-dev libxslt-dev pandoc \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN --mount=type=secret,id=gem_proxy \
    proxy=$(cat /run/secrets/gem_proxy 2>/dev/null || true) && \
    gem install asciidoctor-pdf rouge ${proxy:+--http-proxy "$proxy"}

WORKDIR /app/workspace/server
CMD ["npm", "run", "dev"]
```

**Build command:**
```bash
odip-admin install          # builds both odp-server and web-client images
# or selectively:
odip-admin restart --rebuild=server
```

Gem installation is controlled by `ODIP_GEM_MODE` — see ch09 §3 and §5.2 for EC-specific proxy configuration.

---

## 9. Dependencies

| Package | Purpose |
|---|---|
| `archiver` | ZIP packaging of Antora source tree |
| `adm-zip` | ZIP extraction into publication workspace |
| `mustache` | Logic-less template rendering for AsciiDoc pages |
| `@antora/cli` + `@antora/site-generator` | HTML site generation (installed in works dirs, not server workspace) |
| `@antora/lunr-extension` | Full-text search in generated site |
| `@antora/pdf-extension` | PDF generation |
| `asciidoctor-pdf` + `rouge` | Ruby gems for PDF rendering (system gems in `Dockerfile.odp-server`) |
| `pandoc` | Word document generation (system package in `Dockerfile.odp-server`) |
| `@antora/run-command-helper` | Used by `antora-docx-extension.js` to invoke asciidoctor and pandoc |

---

[← 05 Import Pipeline](05-Import-Pipeline.md) | [07 CLI →](07-CLI.md)