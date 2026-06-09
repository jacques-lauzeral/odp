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
          │       ├── _generateAllChapterFiles()   ← chapter-driven DB content generation
          │       │       ├── chapterService.getAll()              ← chapter index (standard)
          │       │       ├── _buildGlobalOStarIndex()             ← cross-chapter xref map
          │       │       │       └── chapterService.getById()     ← per chapter (extended)
          │       │       ├── operationalRequirementService.getAll() ← summary, edition-scoped
          │       │       ├── operationalRequirementService.getAll() ← standard, per domain
          │       │       └── ChapterGenerator (one per chapter)
          │       │               ├── TipTapAsciidocConverter  ← TipTap JSON → AsciiDoc
          │       │               └── Mustache templates       ← on.mustache, or.mustache,
          │       │                                               chapter.mustache, theme.mustache
          │       │
          │       └── _createAntoraZip(configPaths, contentMappings, generatedFiles)
          │               ├── config files    → works dir root (flat copy)
          │               ├── static content  → Antora module paths (nav.adoc etc.)
          │               └── generated files → modules/details/ or modules/ROOT/
          │
          ├── _buildFlat(format)
          │       └── works/flat/antora-playbook-{pdf|docx}.yml → _artifacts/index.{pdf|docx}
          │           (antora binary: works/node_modules/.bin/antora, cwd: works/flat/)
          │
          ├── _buildWordMultipart(selection)
          │       ├── intro: works-intro/multipart/antora-playbook-docx.yml → ZIP entry
          │       └── per domain: works-{domain}/multipart/antora-playbook-docx.yml → ZIP entry
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
        └── ChapterGenerator.js   ← one instance per chapter; DB narrative + O* pages
    └── templates/
        ├── on.mustache
        ├── or.mustache
        ├── chapter.mustache      ← chapter index page (title + narrative + sitemap)
        └── theme.mustache        ← theme index page (narrative + O* list)

services/export/
└── TipTapAsciidocConverter.js    ← TipTap JSON → AsciiDoc (shared with publication)
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
│   ├── config/
│   │   ├── antora.yml               ← component descriptor (ROOT + details nav)
│   │   └── antora-playbook.yml      ← HTML site build
│   └── content/
│       └── nav.adoc                 ← ROOT module nav (website mode)
│
├── flat/
│   ├── config/
│   │   ├── antora.yml               ← component descriptor (ROOT + details nav)
│   │   ├── antora-playbook-pdf.yml  ← flat PDF build
│   │   ├── antora-assembler-pdf.yml ← flat PDF assembler
│   │   ├── antora-playbook-docx.yml ← flat Word build
│   │   └── antora-assembler-docx.yml← flat Word assembler
│   └── content/
│       └── intro/
│           └── nav.adoc             ← ROOT module nav (intro, flat builds)
│
└── multipart/
    ├── config/                      ← Word multipart only (intro + per-domain)
    │   ├── antora.yml               ← component descriptor (ROOT only, no details nav)
    │   ├── antora-playbook-docx.yml ← multipart Word build
    │   └── antora-assembler-docx.yml← multipart Word assembler
    └── content/
        └── intro/
            └── nav.adoc             ← ROOT module nav (intro, multipart builds)
```

> **Note:** The former `shared/content/` directory (which contained static `index.adoc` files and `edition-plan.json`) has been removed. All chapter and domain introduction pages are now generated from narratives stored in the database.

---

## 3. Generation Pipeline

### Overview

Content generation is **chapter-driven**: `ODPEditionService._generateAllChapterFiles()` walks the `edition.json` chapter list, fetches each chapter from the DB (including narrative and `osHierarchy`), and instantiates one `ChapterGenerator` per chapter. The generator produces all Antora pages for that chapter as a `Map<relativePath, content>`. The caller maps these paths to their Antora module targets before ZIP assembly.

### Stage 1 — Data Fetch

`_generateAllChapterFiles()` performs the following fetches before the chapter loop:

1. **Chapter index** — `chapterService.getAll()` (standard projection) to build a `key → itemId` map.
2. **Global O\* index** — `_buildGlobalOStarIndex()` fetches every chapter at extended projection and walks its `osHierarchy` to build a global `Map<normalizedItemId, { chapterSlug, slugPath[] }>`. Used by `ChapterGenerator` for cross-chapter xref resolution.
3. **O\* summary** — `operationalRequirementService.getAll()` at `summary` projection, edition-scoped. Contains all O*s (all domains) for cross-domain relationship resolution. No rich-text fields.
4. **Reference documents** — `referenceDocumentStore.findAll()`, shared across all chapter generators.

Per chapter, inside the loop:

5. **Chapter extended** — `chapterService.getById()` — narrative (TipTap JSON) + enriched `osHierarchy`.
6. **Domain O\* standard** — `operationalRequirementService.getAll()` filtered to `{ domain: chapter.domain }`, edition-scoped. Contains rich-text fields needed for O* page generation.

### Stage 2 — Relationship Resolution

`ChapterGenerator._buildReverseRelationships()` builds in-memory reverse maps on the domain-filtered O* set (`oStars`), using the full summary set for cross-domain lookups:

- `refinedBy[]` — all O*s (any domain) that refine this entity
- `implementedBy[]` — all ORs (any domain) that implement this ON

### Stage 3 — Xref Lookup

Two lookup levels are maintained per `ChapterGenerator` instance:

- **Local lookup** (`onLookup`, `orLookup`) — built from the current chapter's `osHierarchy`. Maps `normalizedItemId → { slugPath[] }` for O*s in this chapter. Fast path.
- **Global index** (`globalOStarIndex`) — built across all chapters by `_buildGlobalOStarIndex()`. Maps `normalizedItemId → { chapterSlug, slugPath[] }`. Fallback for cross-chapter (cross-domain) xrefs.

`_resolveXrefInfo(id, type)` checks local lookup first, then global index. If neither resolves, the xref is omitted (warn logged) — this occurs only for stale `osHierarchy` references pointing to O*s excluded from the current edition snapshot.

### Stage 4 — Content Transformation

`TipTapAsciidocConverter.toAsciidoc()` converts TipTap JSON to AsciiDoc for:

- Chapter narratives (via `_convertNarrative()`)
- Theme narratives (via `_convertNarrative()`)
- O* rich-text fields: `statement`, `rationale`, `flows`, `nfrs`

| TipTap feature | AsciiDoc output |
|---|---|
| Bold / italic / underline / strikethrough | `**bold**`, `*italic*`, etc. |
| Headings levels 1–6 (offset +1) | `== Section`, `=== Sub-section`, etc. |
| Ordered / unordered lists (nested) | `. item` / `* item` with indent |
| External links | `link:url[label]` |
| Embedded images (base64) | Extracted to `assets/images/image-NNN.ext`, referenced as `image::image-NNN.ext[]` |

**Heading offset:** narrative headings are offset by +1 level (`_offsetHeadingLevels`) so that level-1 TipTap headings (`= Title`) become `==` in AsciiDoc — required by Antora which disallows level-0 sections outside book doctype.

**Image paths:** `_fixAntoraImagePaths()` strips the `./images/` prefix emitted by the converter, leaving `image::filename.ext[]` which Antora resolves via the module's `assets/images/` directory.

Images use a global counter (never reset between fields or chapters within a generator instance) to guarantee unique filenames.

### Stage 5 — Page Generation

`ChapterGenerator.generate()` produces the following files per chapter:

| File | Template | Content |
|---|---|---|
| `pages/{chapterSlug}/index.adoc` | `chapter.mustache` | Chapter title + narrative + theme/O* sitemap |
| `pages/{chapterSlug}/{theme}/index.adoc` | `theme.mustache` | Theme narrative + O* list |
| `pages/{chapterSlug}/{theme}/on-{id}.adoc` | `on.mustache` | ON metadata + rich-text fields + xrefs |
| `pages/{chapterSlug}/{theme}/or-{id}.adoc` | `or.mustache` | OR metadata + rich-text fields + xrefs |
| `assets/images/image-NNN.ext` | — | Extracted images |
| `nav.adoc` | — | Chapter nav fragment |

O*s present in `oStars` but absent from `osHierarchy` (unassigned) are generated under `pages/{chapterSlug}/` directly (chapter root), without a theme subfolder.

O*s referenced in `osHierarchy` but absent from `oStars` (excluded by edition filter) are silently skipped — their `osHierarchy` entries are stale references from the live dataset not captured in the edition snapshot.

**Export suppression:** sitemap sections in `chapter.mustache` and `theme.mustache` are wrapped in `ifndef::env-export[]` so they are omitted from PDF and Word exports.

Output structure:

```
modules/details/
├── pages/
│   ├── {chapterSlug}/
│   │   ├── index.adoc              ← generated from chapter narrative
│   │   ├── {theme}/
│   │   │   ├── index.adoc          ← generated from theme narrative
│   │   │   ├── on-{itemId}.adoc
│   │   │   └── or-{itemId}.adoc
│   │   ├── on-{itemId}.adoc        ← unassigned O*s (no theme)
│   │   └── or-{itemId}.adoc
│   └── ...
├── assets/images/
│   ├── image-001.png
│   └── ...
└── nav.adoc                        ← assembled from per-chapter fragments

modules/ROOT/
├── pages/
│   └── index.adoc                  ← intro chapter narrative (site root page)
└── assets/images/
    └── ...                         ← images from intro narrative
```

### Stage 6 — Nav Assembly

Each `ChapterGenerator` produces a `nav.adoc` fragment for its chapter (depth 1 for the chapter entry, depth 2+ for themes and O*s). `ODPEditionService._assembleDetailsNav()` combines these fragments into the final `modules/details/nav.adoc`, preserving the `edition.json` chapter hierarchy:

- **Parent chapters** (e.g. `Transversal Layer`, `Airspace (iDL)`) — clickable xref entry at depth 1 if they have a narrative page; sub-chapter fragments are indented by one bullet level beneath them.
- **Top-level domain chapters** — fragment used directly at depth 1.

### Stage 7 — Antora Structure and Packaging

`ODPEditionService._createAntoraZip()` assembles the final ZIP by combining:

1. **Shared config** (`shared/config/`) — lands at works dir root
2. **Mode-specific config** — `antora.yml` → works dir root; other files → build-type subdir
3. **Shared assets** (ui-bundle.zip, pdf-theme.yml, template.docx, antora-docx-extension.js) → root and mode subdir
4. **Static content files** — `website/content/nav.adoc` and multipart nav files
5. **Generated chapter files** — from `_generateAllChapterFiles()`; path mapping:

| Chapter type | Source path | Target in ZIP |
|---|---|---|
| `intro` | `pages/intro/index.adoc` | `modules/ROOT/pages/index.adoc` |
| `intro` | `assets/images/…` | `modules/ROOT/assets/images/…` |
| domain / parent | `pages/{slug}/…` | `modules/details/pages/{slug}/…` |
| domain / parent | `assets/images/…` | `modules/details/assets/images/…` |
| domain mode | all files | `modules/ROOT/…` (remapped) |

The `modules/` directory in the works dir is **cleared before each extraction** to prevent stale files from previous runs accumulating.

### Publish cycle (`publishEdition`)

Each `publishEdition()` call:
1. Acquires mutex (`_publicationInProgress` flag) — concurrent calls rejected with 409
2. Normalises `PublishOptions` — absent body defaults to `{ website: true }`
3. If flat builds requested: generate `flat`-mode ZIP → extract into `works/` → git commit
4. Flat PDF (if `pdfFlat`): `_buildFlat('pdf')` — non-fatal; output to `_artifacts/`
5. Flat Word (if `wordFlat`): `_buildFlat('word')` — non-fatal; output to `_artifacts/`
6. Word multipart (if `wordMultipart`): `_buildWordMultipart()` — non-fatal; output to `_artifacts/`
7. Website (if `website`): generate `website`-mode ZIP → extract into `works/` → git commit → run Antora — fatal on failure; then `_copyArtifactsToSite()`
8. Releases mutex — returns `{ siteUrl, wordFlatUrl, wordMultipartUrl, pdfFlatUrl }`

Domain list for word multipart is derived from `edition.json` domain chapters via `_resolveSelectionDomains()` — no longer reads from `shared/content/` directories.

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
| `works-{domain}/` × N | Word multipart per-domain builds | same (absolute path) |
| `_artifacts/` | Persistent artifact staging area | — |

**All works dirs share the same `node_modules`** — only `works/` has `node_modules/` installed. Multipart builds reference the antora binary via absolute path and set `NODE_PATH=works/node_modules`.

N is derived from `edition.json` domain chapters — no static directory scan.

### Works dir internal layout

Each works dir contains at publish time:
- `antora.yml` at root — Antora component descriptor, injected per build
- `modules/` at root — content, injected per build (cleared before each injection)
- Shared assets at root: `ui-bundle.zip`, `pdf-theme.yml`, `template.docx`, `antora-docx-extension.js`, `package.json`, `Gemfile`
- Build-type subdir (`website/`, `flat/`, or `multipart/`) containing playbooks, assemblers, and copies of shared assets

### Initialisation (server startup)

`initializePublicationWorkspace()` runs on every server start. It calls `initializeWorksDir(worksDir, sourcePaths, label)` for each works dir. All steps are idempotent:

1. `mkdir -p {worksDir}`
2. `git init` + configure `user.email` / `user.name` — only if `.git` absent
3. Bootstrap from `sourcePaths[]` — copies config files in order — only if `package.json` absent
4. Warns if `node_modules/` absent (run `odip-admin install` to fix)

### ZIP generation (`generateAntoraZip`)

`generateAntoraZip(editionId, userId, { mode, drgFilter?, selection? })` produces a scoped Antora source ZIP:

| Mode | Config paths | Content |
|---|---|---|
| `website` | `shared` + `website` | All chapters (or selection), full details module |
| `flat` | `shared` + `flat` | All chapters (or selection), full details module |
| `intro` | `shared` + `multipart` | ROOT module only (intro chapter narrative) |
| `domain` | `shared` + `multipart` | Single domain chapter, remapped to ROOT module |

Content path mappings per build mode:

| Mode | Source | Target in ZIP |
|---|---|---|
| `website` / `flat` | intro chapter narrative | `modules/ROOT/pages/index.adoc` |
| `website` / `flat` | domain chapter pages | `modules/details/pages/{chapterSlug}/…` |
| `website` / `flat` | assembled details nav | `modules/details/nav.adoc` |
| `website` | `website/content/nav.adoc` | `modules/ROOT/nav.adoc` |
| `flat` | `flat/content/intro/nav.adoc` | `modules/ROOT/nav.adoc` |
| `intro` | intro chapter narrative | `modules/ROOT/pages/index.adoc` |
| `intro` | `multipart/content/intro/nav.adoc` | `modules/ROOT/nav.adoc` |
| `domain` | domain chapter pages | `modules/ROOT/pages/…` |
| `domain` | chapter nav fragment | `modules/ROOT/nav.adoc` |

---

## 8. UI Bundle Preparation

The Antora UI bundle (`ui-bundle.zip`) is the stock Antora default UI, **pre-patched with a custom EUROCONTROL header** and committed to the repository. This is a one-time preparation step.

**How it was prepared:**

1. Download the stock Antora UI bundle:
   ```bash
   curl -L -o publication/shared/config/ui-bundle.zip \
     "https://gitlab.com/antora/antora-ui-default/-/jobs/artifacts/HEAD/raw/build/ui-bundle.zip?job=bundle-stable"
   ```

2. Create the custom header partial at `publication/website/config/partials/header-content.hbs`.

3. Inject the custom partial into the bundle:
   ```bash
   cd publication/shared/config
   zip ui-bundle.zip partials/header-content.hbs
   ```
   > **Critical:** use `zip` without `-j` to preserve the `partials/` directory path inside the archive.

4. Commit the patched `ui-bundle.zip` to the repository.

---

## 9. Server Container (`Dockerfile.odp-server`)

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

## 10. Dependencies

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