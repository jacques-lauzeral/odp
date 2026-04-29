# Chapter 06 – Publication

## 1. Overview

The publication pipeline converts ODIP database content into a served Antora website accessible directly from the browser. It supports two modes:

- **Edition publish** — builds and serves a scoped site for a specific ODIP Edition (baseline + content filters applied); optionally also generates PDF from the same Antora source
- **Antora ZIP** — packages the Antora source tree for external stakeholders who build the site themselves

The pipeline is entirely server-side. The web client and CLI trigger it via REST endpoints; no content rendering happens on the client. All publication logic lives in `ODPEditionService`.

> **Implementation status:**
>
> | Format | Mode | Personal environment | EC environment |
> |---|---|---|---|
> | HTML static site (with search index) | website | ✅ Operational | ✅ Operational |
> | PDF flat | website | ✅ Operational | ✅ Operational |
> | PDF document set (per-domain + intro) | document | ✅ Operational | ✅ Operational |
> | Word flat | website | ❌ Not yet restored | ❌ Not yet restored |
> | Word document set | document | ❌ Not yet restored | ❌ Not yet restored |
>
> **PDF** is generated via `@antora/pdf-extension` + `asciidoctor-pdf` (installed as a system gem in `Dockerfile.odp-server`).
>
> **Word** generation requires `pandoc` in the server container and a working `antora-docx-extension.js` — not yet restored.
>
> **EC environment** requires `ODIP_GEM_MODE=host` and `~/.gemrc` configured with the corporate proxy — `odip-admin` handles the rest automatically. See ch09 §3 and §5.2.

---

## 2. Architecture

```
REST API  POST /odp-editions/{id}/publish  ← edition publish (JSON body: PublishOptions)
          │
          ▼
    ODPEditionService.publishEdition(options)
          │
          ├── generateAntoraZip(editionId, userId, drgFilter?, introOnly?)
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
          ├── HTML build (optional, default true)
          │       └── works/: extract ZIP → git commit → npx antora antora-playbook.yml
          │
          ├── _buildFlat(format)   ← flat PDF or Word
          │       └── works/: npx antora antora-playbook-pdf.yml → copy to _exports/
          │
          └── _buildSet(format, setOptions)   ← per-domain document set
                  ├── intro: works-intro/ → extract intro ZIP → git commit → antora build → ZIP entry
                  └── per DrG: works-{drg}/ → extract domain ZIP → git commit → antora build → ZIP entry
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
├── website/
│   └── config/                  ← website/flat build files
│       ├── antora.yml           ← component descriptor (ROOT + details nav)
│       ├── antora-playbook.yml  ← HTML site build
│       ├── antora-playbook-pdf.yml  ← PDF flat build
│       ├── antora-playbook-docx.yml ← Word flat build (not yet restored)
│       ├── antora-assembler.yml     ← PDF flat assembler
│       ├── antora-assembler-docx.yml ← Word assembler (not yet restored)
│       ├── antora-docx-extension.js  ← AsciiDoc → DocBook → pandoc → docx (not yet restored)
│       └── partials/
│           └── header-content.hbs   ← Custom EUROCONTROL navbar
│
├── document/
│   └── config/                  ← document set build files (intro + per-domain)
│       ├── antora.yml           ← component descriptor (ROOT only, no details nav)
│       ├── antora-playbook-pdf.yml  ← PDF document build (shared by intro and domain)
│       ├── antora-assembler-pdf.yml ← PDF document assembler
│       └── (docx equivalents — future)
│
└── shared/
    ├── config/                  ← shared by website and document builds
    │   ├── package.json         ← @antora/cli, @antora/site-generator, @antora/pdf-extension, etc.
    │   ├── ui-bundle.zip        ← Pre-patched Antora UI bundle (see §7)
    │   ├── pdf-theme.yml        ← Custom PDF theme (Noto fonts, EUROCONTROL blue)
    │   ├── Gemfile              ← asciidoctor-pdf Ruby gem declaration
    │   └── reference.docx       ← Word template (future)
    └── content/                 ← manually authored static content
        ├── intro/
        │   └── index.adoc       ← ODIP Edition introduction page
        └── {drg}/               ← one per DrG
            └── index.adoc       ← DrG domain introduction page
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

**Export suppression:** folder index content (ON/OR trees, sub-domain lists) is wrapped in `ifndef::env-export[]` in the Mustache templates. The `env-export` attribute is set in `antora-assembler.yml` (PDF) and `antora-assembler-docx.yml` (Word), so these navigation-only sections are silently omitted from PDF and Word exports.

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
- `== Introduction` and subsequent `==` sections — numbered in PDF via `section_merge_strategy: fuse` in `antora-assembler.yml`; rendered as normal sections in HTML.
- `include::partial${drg}/index.adoc[]` — injects the generated sitemap fragment (ON/OR tree). Wrapped in `ifndef::env-export[]` inside the template, so it is suppressed in PDF/Word exports automatically.
- The `include::` must be placed **after** the human-authored content, not before, so the intro text precedes the generated listing.

**Example** (`modules/details/pages/rrt/index.adoc`):

```asciidoc
= Rerouting
:notitle:

== Introduction

The Rerouting Drafting Group (DrG) is the iCDM drafting group...

== Operational Needs baseline

* xref:rrt/identification_of_operationally_acceptable_trajectories/index.adoc[...]
...

include::partial$rrt/index.adoc[]
```

### Stage 6 — Antora Structure and Packaging

`ODPEditionService.generateAntoraZip()` assembles the final ZIP by combining:

1. The entire static directory tree (all Antora playbooks, assembler configs, PDF theme, ROOT module, introduction module, portfolio module) — including the pre-patched `ui-bundle.zip`
2. All dynamically generated details module files (`modules/details/…`)

The two active Antora modules are: `ROOT` (landing page + ODIP introduction) and `details` (full ON/OR pages by DrG, plus manually authored DrG introduction pages). The `introduction` and `portfolio` modules are present in the static directory but not currently used.

---

## 4. REST API

Defined in `openapi-odp.yml`.

| Method | Endpoint | Query | Response |
|---|---|---|---|
| `POST` | `/odp-editions/{id}/publish` | `pdf`, `word` (optional boolean flags) | `{ siteUrl, pdfUrl, wordUrl }` |
| `GET` | `/odp-editions/{id}/export` | — | `application/zip` (Antora source ZIP) |

`POST /odp-editions/{id}/publish` returns 404 if the edition is not found, 409 if a publication is already in progress. PDF and Word failures are non-fatal — `pdfUrl` / `wordUrl` are `null` in the response if the format was not requested or its build failed. The built site is served at `/publication/site/` by Express static middleware (mount point registered at server startup).

The web client always requests PDF generation (`?pdf=true`) — PDF generation is the default behaviour. Word generation remains disabled until restored.

### Web Client

The Publication activity exposes a **Publish** button on the edition details panel. Clicking it:

1. Disables the button (labelled "Publishing…") for the duration of the request
2. Calls `apiClient.publishEdition(editionId)` — `POST /odp-editions/{id}/publish?pdf=true`
3. On success: displays "✓ Published — Open site" with an absolute link to the served site (`apiClient.baseUrl + siteUrl`)
4. On 409: displays "Publication already in progress — please retry later"
5. On other error: displays the error message in the status area

The web client applies a **300-second fetch timeout** to this request (`api-client.js`, `publishEdition()`) — overriding the global default timeout — to accommodate long PDF builds (typical range: ~2–5 min; up to ~15 min for large documents).

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

`--pdf` requires `asciidoctor-pdf` installed as a system gem in the server container (`Dockerfile.odp-server`). `--word` requires `pandoc` and is not yet restored. Failed formats are reported as warnings; the command exits successfully if at least one build succeeded. See ch07 §Publication for the full flag reference.

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

The server maintains **15 persistent publication workspaces** under `$ODIP_HOME/publication/` — one per build type:

| Directory | Purpose |
|---|---|
| `works/` | HTML site + flat PDF/Word builds |
| `works-intro/` | Intro document set build |
| `works-{drg}/` × 13 | Per-domain document set builds |

Each is an independent git repository with Antora installed, bootstrapped from the corresponding config subtree under `publication/`.

### Initialisation (server startup)

`initializePublicationWorkspace()` runs on every server start. It calls `initializeWorksDir(worksDir, sourcePaths, label)` for each of the 15 works dirs. All steps are idempotent:

1. `mkdir -p {worksDir}` — belt-and-suspenders
2. `git init` + configure `user.email` / `user.name` — only if `.git` absent
3. Bootstrap from `sourcePaths[]` — copies config files in order (later overrides earlier) — only if `package.json` absent
4. Warns if `node_modules/` absent (run `odip-admin install` to fix)

Source paths per works dir type:
- `works/`: `shared/config` + `website/config`
- `works-intro/`: `shared/config` + `document/config`
- `works-{drg}/`: `shared/config` + `document/config`

Content files (modules/) are **not** bootstrapped statically — they are injected at publish time via `generateAntoraZip()` / `_createAntoraZip()`.

The domain list for per-DrG works dirs is derived from `shared/content/` subdirectories (excluding `intro/`) — no hardcoded DrG list.

### ZIP generation (`generateAntoraZip`)

`generateAntoraZip(editionId, userId, drgFilter?, introOnly?)` produces a scoped Antora source ZIP:

| Mode | `drgFilter` | `introOnly` | Content |
|---|---|---|---|
| Website/flat | null | false | All domains, full details module |
| Intro document | null | true | ROOT module only (no details) |
| Domain document | set | false | Single DrG, remapped to ROOT module |

`_createAntoraZip(configPaths, contentMappings, detailsFiles)` assembles the ZIP in three stages:
1. **Config files** — from `configPaths[]`, land at works dir root (flat copy)
2. **Content files** — from `contentMappings[]`, each with a `mapFn` that remaps to Antora module paths
3. **Generated details files** — from `DetailsModuleGenerator`; in domain mode remapped from `modules/details/{drg}/` → `modules/ROOT/`

Content path mappings per build mode:

| Mode | Source | Target in ZIP |
|---|---|---|
| Website/flat | `shared/content/intro/index.adoc` | `modules/ROOT/pages/index.adoc` |
| Website/flat | `shared/content/{drg}/index.adoc` | `modules/details/pages/{drg}/index.adoc` |
| Website/flat | `website/content/nav.adoc` | `modules/ROOT/nav.adoc` |
| Intro | `shared/content/intro/index.adoc` | `modules/ROOT/pages/index.adoc` |
| Intro | `document/content/intro/nav.adoc` | `modules/ROOT/nav.adoc` |
| Domain | `shared/content/{drg}/index.adoc` | `modules/ROOT/pages/index.adoc` |
| Domain (generated) | `details/{drg}/pages/...` | `modules/ROOT/pages/...` |
| Domain (generated) | `details/nav.adoc` | `modules/ROOT/nav.adoc` |

### Publish cycle (`publishEdition`)

Each `publishEdition()` call:
1. Acquires mutex (`_publicationInProgress` flag) — concurrent calls rejected with 409
2. Normalises `PublishOptions` — absent body defaults to `{ html: true, pdf: { flat: true } }`
3. Generates full-content ZIP and extracts into `works/` — `_extractZipToWorks()` uses manual entry-by-entry extraction (avoids `chmodSync` failures under rootless Podman on NFS)
4. `git add . && git commit --allow-empty` in `works/`
5. HTML build (if `html: true`): `npx antora antora-playbook.yml` in `works/` — fatal on failure
6. Flat PDF (if `pdf.flat`): `_buildFlat('pdf')` in `works/` — non-fatal
7. Flat Word (if `word.flat`): `_buildFlat('word')` in `works/` — non-fatal; not yet restored
8. PDF set (if `pdf.set`): `_buildSet('pdf', setOptions)` — non-fatal:
   - Intro: generate intro ZIP → extract into `works-intro/` → git commit → antora build → ZIP entry
   - Per DrG: generate domain ZIP → extract into `works-{drg}/` → git commit → antora build → ZIP entry
   - Assemble all entries into `set-pdf.zip` in `_exports/`
9. Word set (if `word.set`): same pattern — not yet restored
10. Releases mutex — returns `{ siteUrl, pdf: { flatUrl, setUrl }, word: { flatUrl, setUrl } }`

All shell commands are executed via `_execStreaming()` (async `child_process.exec` with real-time streaming). Non-fatal builds use `_tryExecAsync()`.

The built site is served by Express static middleware at `/publication/site/`.

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

The bundle is included in every publish ZIP and extracted into `works/` on each publish cycle, ensuring the custom header is always active. No runtime patching is performed.

**If the UI bundle needs to be updated** (e.g. new Antora UI release), repeat steps 1–4. The patch is a simple file replacement inside the ZIP — no build tooling required.

---

## 8. Server Container (`Dockerfile.odp-server`)

PDF generation requires `asciidoctor-pdf` to be available as a system gem inside the `odp-server` container. A custom `Dockerfile.odp-server` extends the `node:20` base image:

```dockerfile
FROM node:20

ARG http_proxy
ARG https_proxy

RUN apt-get update && apt-get install -y --no-install-recommends \
        ruby ruby-dev build-essential libxml2-dev libxslt-dev \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN --mount=type=secret,id=gem_proxy \
    proxy=$(cat /run/secrets/gem_proxy 2>/dev/null || true) && \
    gem install asciidoctor-pdf rouge ${proxy:+--http-proxy "$proxy"}

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

Gem installation is controlled by `ODIP_GEM_MODE` — see ch09 §3 and §5.2 for EC-specific proxy configuration.

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