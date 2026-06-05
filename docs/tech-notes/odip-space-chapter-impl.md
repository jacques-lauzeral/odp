# Implementation Note — Chapter Entity and Domain Model Evolution

**Version:** 5  
**Scope:** All layers — config, shared model, store, service, REST API, CLI, web client  
**Status:** Phase 2 complete. Open items documented in §9.

---

## 0. Context and Motivation

### Domain vs Chapter

**Domain** is the root organisational level for O\*s — it replaces `DraftingGroup` as the semantic classification unit. Every O\* (ON, OR, OC) belongs to a domain. Domains are defined in `domains.json` and form a tree (max two levels). The domain tree is the business semantic authority — it drives O\* assignment, filtering, and bandwidth planning.

**Chapter** is a publication structure concern. Chapters organise an ODIP Edition for human consumption — they group domains, carry narrative text, and define the O\* presentation order via `osHierarchy`. A domain chapter references a domain; a pure narrative chapter has no domain reference. Chapters exist to structure an ODIP Edition, not to classify O\*s.

The two concepts are deliberately decoupled: domain classification on O\*s is stable and semantic; chapter organisation is editorial and evolves with each edition.

### Retirement of former (impact) Domain setup entity

The former **(impact) Domain** setup entity — used to characterise OR impact via `IMPACTS_DOMAIN` — is **fully retired**. Its organisational role is superseded by the new domain/chapter model. The term "domain" is now unambiguously reserved for the O\* root organisational concept defined in `domains.json`.

### Summary of changes

- **`Chapter`** — new versioned entity. User-maintained fields: `narrative`, `jsonOsHierarchy`. Config-owned fields: `title`, `domain`, `position` (merged from `edition.json` at read time, not stored on version nodes).
- **`DraftingGroup`** — retired from `OperationalRequirement` and `OperationalChange`. Replaced by `domain` string field validated against `domains-config.js`. Retained for `Bandwidth.scope` only.
- **`path`** — removed from `RequirementVersion` and `OperationalChangeVersion`. O\* organisation owned by `Chapter.osHierarchy`.
- **(impact) Domain** — fully retired: `DomainStore`, `IMPACTS_DOMAIN`, `impactedDomains`, `GET /domains` and related endpoints all removed.
- **`@odp/shared` `config/`** — new sub-package with `domains-config.js`, `edition-config.js`, `loader.js`.
- **Config files** — `domains.json` and `edition.json` in `workspace/server/config/`, deployed to `$ODIP_HOME/config/` by `odip-admin`.
- **Bootstrap** — `initializeDatabase()` in `store/index.js` ensures each configured chapter exists in the DB at server startup.

---

## 1. Config Files (Step 1 — complete)

### Artefacts

| File | Location |
|---|---|
| `domains.json` | `workspace/server/config/domains.json` → `$ODIP_HOME/config/domains.json` |
| `edition.json` | `workspace/server/config/edition.json` → `$ODIP_HOME/config/edition.json` |
| `odip-admin` | Updated: `deploy_config_files()` helper + `list_works_dirs()` uses `node -e` to parse `edition.json` |

`odip-admin` note: `jq` and `python3` are not available in the target environment. `node -e` is used to parse `edition.json` for works dir derivation — commented in the script.

---

## 2. Shared Config (Step 2 — complete)

### Artefacts

| File | Location |
|---|---|
| `loader.js` | `shared/src/config/loader.js` — single entry point: `loadConfig(configDir)` |
| `domains-config.js` | `shared/src/config/domains-config.js` |
| `edition-config.js` | `shared/src/config/edition-config.js` |
| `shared/src/index.js` | Updated: re-exports all three config modules |
| `server/src/index.js` | Updated: `loadConfig(nodePath.join(odipHome, 'config'))` called in `startServer()` after `initializeStores()` |
| `cli/src/index.js` | Updated: `loadConfig()` called before `program.parse()` |

**Key design decisions:**
- `loadConfig(configDir)` is the only entry point — server and CLI both call this once at startup
- Config modules hold module-level state; accessors throw if called before `loadConfig()`
- `getDomainChapterSlugs()` on `edition-config` drives publication works dir derivation in both `odip-admin` and `initializePublicationWorkspace()`

---

## 3. Shared Model (Step 3 — complete)

### Artefacts

| File | Change |
|---|---|
| `shared/src/model/chapter-elements.js` | **New** — `Chapter`, `ChapterRequests`, `OsHierarchy`, `OsHierarchyTopic` |
| `shared/src/model/odp-elements.js` | `drg`, `path`, `impactedDomains` removed; `domain` added on OR and OC |
| `shared/src/model/projections.js` | Same field removals/additions in `requirement` and `change` field sets |
| `shared/src/model/setup-elements.js` | `Domain` export removed |
| `shared/src/messages/messages.js` | `Domain` import and `DomainRequests` removed; OR/OC requests updated; transient `path` (string) added on create only |
| `shared/src/index.js` | `chapter-elements.js` re-export added |

---

## 4. Store Layer (Step 4 — complete)

### Artefacts

| File | Change |
|---|---|
| `server/src/store/chapter-store.js` | **New** — `VersionedItemStore` subclass; `findByKey(key, tx)`; `createChapter(key, parentItemId, tx)`; config-owned fields merged at read time via `_mergeConfigFields()` |
| `server/src/store/operational-requirement-store.js` | `drg`/`path` filters removed; `domain` filter = simple string match; `impactedDomains` relationships removed; `findRequirementsThatImpact` renamed to `findRequirementsThatImpactStakeholder` |
| `server/src/store/operational-change-store.js` | Same: `drg`/`path` filters removed; `domain` string filter added |
| `server/src/store/baseline-store.js` | `HAS_ITEMS` capture extended to include `Chapter` nodes |
| `server/src/store/index.js` | `DomainStore` → `ChapterStore`; `initializeDatabase()` added |

### `initializeDatabase()` in `store/index.js`

Called from `server/src/index.js` after `loadConfig()`. Iterates `getChapters()`, creates missing chapters via `chapterStore.createChapter()`. Single write transaction. Idempotent. Builds `key→itemId` map to resolve `parentItemId` for sub-chapters.

`startServer()` sequence: `initializeStores()` → `loadConfig()` → `initializeDatabase()` → `registerImportMappers()` → `initializePublicationWorkspace()` → `listen()`.

---

## 5. Service Layer (Step 6 — complete)

### Artefacts

| File | Change |
|---|---|
| `server/src/services/ChapterService.js` | **New** — `VersionedItemService` subclass; no `create`/`delete`; `getAll()` overrides base (no edition context, no filters); `_validateOsHierarchy()` recursive validation |
| `server/src/services/OperationalRequirementService.js` | `DraftingGroup`/`isDraftingGroupValid` removed; `isDomainValid` added; `domain` now mandatory; `_validateDRG` → `_validateDomain`; `impactedDomains` removed everywhere |
| `server/src/services/OperationalChangeService.js` | Same: `drg` → `domain` (mandatory); `_validatePath` removed |

---

## 6. REST API (Step 7 — complete)

### Artefacts

| File | Change |
|---|---|
| `openapi-chapter.yml` | **New** — Chapter endpoints |
| `openapi-base.yml` | `Domain`/`DomainRequest` removed; `OsHierarchy*`, `Chapter*` schemas added; OR/OC schemas updated |
| `openapi-operational.yml` | `drg`/`path`/old-domain filters replaced; `domain` string filter added |
| `openapi-setup.yml` | `/domains` endpoints removed |
| `openapi.yml` | Domain paths removed; chapter paths added; tags updated |
| `server/src/routes/chapter.js` | **New** — chapter route handler |
| `server/src/routes/operational-requirement.js` | `drg`/`path` filters removed; `domain` string filter |
| `server/src/routes/operational-change.js` | Same |
| `server/src/index.js` | `domainRoutes` → `chapterRoutes`; `/domains` → `/chapters` |

---

## 7. CLI (Step 8 — complete)

### Artefacts

| File | Change |
|---|---|
| `cli/src/commands/chapter.js` | **New** — `list`, `show`, `update`, `patch`, `versions`, `show-version`; no `create`/`delete` |
| `cli/src/commands/operational-requirement.js` | `DraftingGroup` imports removed; `isDomainValid`/`getDomainKeys`/`getDomainLabel` added; `--drg`/`--path`/`--impacted-domains` removed; `--domain` added (required on create) |
| `cli/src/commands/operational-change.js` | Same pattern |
| `cli/src/index.js` | `domainCommands` → `chapterCommands`; `loadConfig()` called before `program.parse()` |

---

## 8. Web Client (Step 9 — complete except open items)

### Artefacts

| File | Change |
|---|---|
| `app.js` | `/domains` fetch removed from `getSetupData()`; `domains` field removed from cache shape |
| `shared/api-client.js` | JsDoc updated — `drg` param removed, `domain` description updated |
| `activities/workspace/setup/setup.js` | `domains` entity removed |
| `activities/workspace/setup/domains.js` | **Deleted** |
| `activities/workspace/shared/os/os.js` | `DraftingGroup` → `getDomainKeys`/`getDomainLabel`; filter config updated; `_buildQueryParams` keyMap updated |
| `activities/workspace/shared/os/o-star-entity.js` | `drg` column → `domain`; `impactedDomains` column removed; grouping updated; tree path builder uses `entity.domain`; `path` folder logic removed |
| `activities/workspace/shared/os/requirement-form-fields.js` | `drg`/`path`/`impactedDomains` fields removed; `domain` select added |
| `activities/workspace/shared/os/requirement-form.js` | `DraftingGroup` imports removed; `getDomainOptions()` config-driven; `formatDomain()`; `drg`/`path`/`impactedDomains` handling removed |
| `activities/workspace/shared/os/change-form-fields.js` | `drg` → `domain`; `cost` removed from `optionalTextFields` (was latent bug) |
| `activities/workspace/shared/os/change-form.js` | Same pattern as requirement-form |
| `activities/workspace/shared/plan/on-planning.js` | `DraftingGroup` → `getDomainLabel`; grouping by `entity.domain`; `path` folder logic removed |

`change-details.js`, `requirement-details.js`, `elaborate.js`, `explore.js`, `odp-editions.js`, `prioritisation.js` — **no changes needed** (either delegate fully to form layer, or use DrG for bandwidth which is retained).

---

## 9. Open Items / Known Limitations

### 9.1 Prioritisation Board (parked)

`prioritisation.js` and `prioritisation-grid.js` still use `oc.drg` for board column placement. OCs now carry `domain` instead — the board is broken for Phase 2 data. `DraftingGroup` enum is retained for `Bandwidth.scope` but OC cards can no longer be placed by DrG. **Redesign of the prioritisation board around the domain model is deferred.**

### 9.2 Import Pipeline (parked)

The import pipeline layer was not updated in Phase 2. Known gaps:

- **`ExternalIdBuilder.js`** — `_buildRequirementId()` and `_buildChangeId()` use `drg` as a required field. Must be updated to use `domain` key.
- **All DrG mappers** — reference `drg` field on entities. Must be updated to emit `domain` instead.
- **`openapi-import.yml`** — `ImportSummary` schema still has `domains` counter; `StructuredImportData` output still references `drg`, `path`, `impactedDomains`.
- **`openapi-docx.yml`** — `drg` still a required query parameter on docx export.
- **`05-Import-Pipeline.md`** — ADD chapter not yet updated for Phase 2.

### 9.3 O\* Tree Perspective (partial)

The tree perspective in `o-star-entity.js` now groups by `entity.domain` (top-level domain group node) instead of `entity.drg`. The `osHierarchy` on `ChapterVersion` defines O\* presentation order for **publication** — it is not yet used to drive the web client tree perspective. A future phase could rebuild the tree from `Chapter.osHierarchy`, rendering Chapter → topic → sub-topic → O\* nodes.

### 9.4 Chapter Management UI (not implemented)

The Chapter management section in the Setup activity (Elaborate workspace) — browse chapter hierarchy, edit `narrative`, edit `osHierarchy` via drag-and-drop — is not yet implemented. The API and service layer are complete; only the web client UI is missing.

### 9.5 ADD chapters not yet updated

The following ADD chapters were updated as part of Phase 2: `01-Data-Model.md`, `02-Storage-Layer.md`, `03-Service-Layer.md`, `04-REST-API.md`, `07-CLI.md`, `08-Web-Client.md`. Not yet updated: `05-Import-Pipeline.md`, `06-Publication.md`, `09-Deployment.md`.

---

## 10. Next Steps

### 10.1 Web Client

- **Narrative edition** — Chapter detail view with Quill rich text editor for `narrative` field. PUT/PATCH via `ChapterService`. Integrates into the Setup activity (Elaborate workspace) under a new "Chapters" tab.
- **O\* organisation editor** — UI for editing `jsonOsHierarchy` on a chapter: topic creation/renaming, O\* drag-and-drop into topics and sub-topics, topic reordering. Each save creates a new `ChapterVersion`.

### 10.2 Import Pipeline

- **Restore `BootstrapMapper`** — update `ExternalIdBuilder._buildRequirementId()` and `_buildChangeId()` to use `domain` instead of `drg`; update all DrG mappers to emit `domain` field on requirements and changes; update `openapi-import.yml` and `openapi-docx.yml` accordingly.

---

## 11. Open Design Questions

### 11.1 Chapter tree vs O\* tree — decoupling

The current O\* tree perspective groups by `entity.domain` (flat domain → ON → OR hierarchy). If a chapter-driven tree is introduced (Chapter → topic → O\* nodes, from `jsonOsHierarchy`), two questions arise:

- Should the chapter tree **replace** the domain-grouped tree, or be a **separate perspective** alongside it?
- The O\* tree should remain free of narrative-only chapter entries (chapters with no `domain`). How are narrative chapters surfaced — suppressed in the O\* tree, or shown as non-selectable separators?

Design recommendation deferred.

### 11.2 Narrative format — AsciiDoc vs Quill Delta

`ChapterVersion.narrative` is currently typed as `richtext` (Quill Delta JSON string), consistent with all other rich text fields in the model. However, chapters feed directly into the Antora/AsciiDoc publication pipeline. Two options:

- **Quill Delta** — consistent with O\* rich text; requires `DeltaToAsciidocConverter` on the publication path; enables WYSIWYG editing in the web client.
- **AsciiDoc** — direct pipeline integration; no conversion needed; but requires an AsciiDoc editor in the web client (non-trivial) and breaks consistency with other rich text fields.

Decision pending. Current implementation stores as Quill Delta.

---

## 12. Layer Sequence Summary

| Step | Layer | Status |
|---|---|---|
| 1 | Config files (`domains.json`, `edition.json`, `odip-admin`) | ✅ Complete |
| 2 | Shared config (`loader.js`, `domains-config.js`, `edition-config.js`) | ✅ Complete |
| 3 | Shared model (`chapter-elements.js`, `odp-elements.js`, `projections.js`, `messages.js`, `setup-elements.js`) | ✅ Complete |
| 4 | Store (`ChapterStore`, `BaselineStore`, `ORStore`, `OCStore`, `store/index.js`) | ✅ Complete |
| 5 | Bootstrap (`initializeDatabase()` in `store/index.js`) | ✅ Complete |
| 6 | Service (`ChapterService`, `ORService`, `OCService`) | ✅ Complete |
| 7 | REST API (`openapi-chapter.yml`, `openapi-base.yml`, `openapi-operational.yml`, `openapi-setup.yml`, routes) | ✅ Complete |
| 8 | CLI (`chapter.js`, `operational-requirement.js`, `operational-change.js`, `index.js`) | ✅ Complete |
| 9 | Web Client (forms, O\* entity, planning, setup) | ✅ Complete (open items in §9) |