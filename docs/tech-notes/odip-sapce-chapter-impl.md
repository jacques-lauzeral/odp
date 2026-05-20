# Implementation Note — Chapter Entity and Domain Model Evolution

**Version:** 3  
**Scope:** Shared model, config, store, service, REST API, CLI (high-level), web client (high-level)  
**Status:** Design confirmed — pending implementation

---

## 0. Context and Motivation

### Domain vs Chapter

**Domain** is the root organisational level for O\*s — it replaces `DraftingGroup` as the semantic classification unit. Every O\* (ON, OR, OC) belongs to a domain. Domains are defined in `domains.json` and form a tree (max two levels). The domain tree is the business semantic authority — it drives O\* assignment, filtering, and bandwidth planning.

**Chapter** is a publication structure concern. Chapters organise an ODIP Edition for human consumption — they group domains, carry narrative text, and define the O\* presentation order via `osHierarchy`. A domain chapter references a domain; a pure narrative chapter has no domain reference. Chapters exist to structure an ODIP Edition, not to classify O\*s.

The two concepts are deliberately decoupled: domain classification on O\*s is stable and semantic; chapter organisation is editorial and evolves with each edition.

### Retirement of former (impact) Domain setup entity

The former **(impact) Domain** setup entity — used to characterise OR impact via `IMPACTS_DOMAIN` — is **fully retired**. Its organisational role is superseded by the new domain/chapter model. The term "domain" is now unambiguously reserved for the O\* root organisational concept defined in `domains.json`. The terminology note in ADD ch.01 §3.1 is consequently superseded.

### Summary of changes

- **`Chapter`** — new versioned entity. User-maintained fields: `narrative`, `osHierarchy`. Config-owned fields: `title`, `domain`, `position`.
- **`DraftingGroup`** — retired from `OperationalRequirement` and `OperationalChange`. Replaced by `BELONGS_TO` relationship to `Chapter` item node, with domain key on `ChapterVersion`.
- **`path`** — removed from `RequirementVersion`. O\* organisation owned by `Chapter.osHierarchy`.
- **(impact) Domain** — fully retired: `DomainStore`, `IMPACTS_DOMAIN`, `impactedDomains`, `GET /domains` and related endpoints all removed.
- **`@odp/shared` `config/`** — new sub-package with `domains-config.js` and `edition-config.js`.
- **Config files** — `domains.json` and `edition.json` in `workspace/server/config/`, deployed to `$ODIP_HOME/config/`.
- **Bootstrap** — server startup ensures each configured chapter exists in the DB.

---

## 1. Config Model

### 1.1 Location

| Concern | Authoring location | Deployed location |
|---|---|---|
| Domain tree | `workspace/server/config/domains.json` | `$ODIP_HOME/config/domains.json` |
| Edition structure | `workspace/server/config/edition.json` | `$ODIP_HOME/config/edition.json` |

Config files are copied/mounted from the workspace to `$ODIP_HOME/config/` as part of deployment via `odip-admin`. The server reads from `$ODIP_HOME/config/` at runtime.

### 1.2 `domains.json`

Defines the domain tree — the semantic classification authority for O\*s. Maximum two levels.

```json
{
   "domains": [
      { "key": "4DT",              "label": "4D-Trajectory" },
      { "key": "AIRPORT",          "label": "Airport" },
      { "key": "AIRSPACE",         "label": "Airspace (iDL)" },
      { "key": "ASM_ATFCM",        "label": "ASM/ATFCM Integration" },
      { "key": "CRISIS",           "label": "Crisis" },
      { "key": "FAAS",             "label": "FAAS" },
      { "key": "FLOW",             "label": "Flow" },
      { "key": "RRT",              "label": "Rerouting" },
      { "key": "TCF",              "label": "Transponder Code Function" },
      { "key": "TRANSVERSAL",      "label": "Transversal",
         "subDomains": [
            { "key": "TRANSVERSAL_NM",     "label": "Transversal NM" },
            { "key": "TRANSVERSAL_NMUI",   "label": "Transversal NMUI" },
            { "key": "TRANSVERSAL_NM_B2B", "label": "Transversal NM-B2B" }
         ]
      }
   ]
}
```

Domain `key` values are stable identifiers used by:
- `ChapterVersion.domain` — identifying which domain a chapter covers
- `Bandwidth.scope` — DrG-scoped bandwidth planning (migration deferred)
- Import pipeline mappers — replacing the `drg` field on O\*s

### 1.3 `edition.json`

Defines the publication chapter structure. Links domain chapters to domain keys via `domain`. Pure narrative chapters have no `domain`. Appendices carry a `template` key driving the publication pipeline renderer.

```json
{
  "chapters": [
    {
      "key": "overview",
      "title": "Overview",
      "position": 1,
      "subChapters": [
        { "key": "overview-intro",     "title": "Introduction",       "position": 1 },
        { "key": "overview-nm-odip",   "title": "NM ODIP",            "position": 2 },
        { "key": "overview-portfolio", "title": "Portfolio Overview",  "position": 3 }
      ]
    },
    {
      "key": "transversal",
      "title": "Transversal Layer",
      "position": 2,
      "domain": "TRANSVERSAL",
      "subChapters": [
        { "key": "transversal-nm",     "title": "Transversal NM",     "position": 1, "domain": "TRANSVERSAL_NM" },
        { "key": "transversal-nmui",   "title": "Transversal NMUI",   "position": 2, "domain": "TRANSVERSAL_NMUI" },
        { "key": "transversal-nm-b2b", "title": "Transversal NM-B2B", "position": 3, "domain": "TRANSVERSAL_NM_B2B" }
      ]
    },
    { "key": "4dt",        "title": "4D-Trajectory",             "position": 3,  "domain": "4DT" },
    { "key": "rerouting",  "title": "4D-Rerouting",              "position": 4,  "domain": "RRT" },
    { "key": "flow",       "title": "Flow",                      "position": 5,  "domain": "FLOW" },
    { "key": "asmatfcm",   "title": "ASM/ATFCM Integration",     "position": 6,  "domain": "ASM_ATFCM" },
    { "key": "airspace",   "title": "Airspace (iDL)",            "position": 7,  "domain": "AIRSPACE" },
    { "key": "airport",    "title": "Airport",                   "position": 8,  "domain": "AIRPORT" },
    { "key": "tcf",        "title": "Transponder Code Function",  "position": 9, "domain": "TCF" },
    { "key": "faas",       "title": "FAAS",                      "position": 10, "domain": "FAAS" },
    { "key": "way-forward","title": "Way Forward",               "position": 11 },
    { "key": "annex-acronyms",     "title": "Acronyms",              "position": 12, "template": "acronyms" },
    { "key": "annex-traceability", "title": "Strategic Traceability", "position": 13, "template": "strategic-traceability" }
  ]
}
```

**Chapter entry fields:**

| Field | Type | Notes |
|---|---|---|
| `key` | string | Stable identifier — used for bootstrap DB matching |
| `title` | string | Display title — config-owned, not user-editable |
| `position` | integer | Ordering within parent |
| `domain` | string | Domain key from `domains.json` — optional; absent on pure narrative chapters |
| `template` | string | Publication template key — optional; drives renderer for generated sections |
| `subChapters` | array | Optional — max one level of nesting |

---

## 2. Shared Model (`@odp/shared`)

### 2.1 New sub-package: `shared/src/config/`

```
shared/src/
├── index.js
├── config/                    # new
│   ├── domains-config.js      # domain tree loader + accessors
│   └── edition-config.js      # edition structure loader + accessors
├── messages/
│   └── messages.js
└── model/
    ├── chapter-elements.js    # new
    ├── drafting-groups.js     # retained — Bandwidth.scope only (migration deferred)
    ├── maturity-levels.js
    ├── milestone-events.js
    ├── odp-edition-types.js
    ├── odp-elements.js        # modified
    ├── or-types.js
    ├── projections.js         # modified
    ├── setup-elements.js      # modified — (impact) Domain removed
    └── utils.js
```

### 2.2 New: `shared/src/config/domains-config.js`

Loads `$ODIP_HOME/config/domains.json` at initialisation. Exposes:

| Export | Description |
|---|---|
| `loadDomainsConfig(configPath)` | Loads and validates the config file |
| `getDomainKeys()` | Flat list of all domain keys including sub-domains |
| `getDomainLabel(key)` | Display label for a domain key |
| `isDomainValid(key)` | Validation helper |
| `getDomainTree()` | Full tree structure |

### 2.3 New: `shared/src/config/edition-config.js`

Loads `$ODIP_HOME/config/edition.json` at initialisation. Exposes:

| Export | Description |
|---|---|
| `loadEditionConfig(configPath)` | Loads and validates the config file |
| `getChapters()` | Flat ordered list of all chapters including sub-chapters |
| `getChapterTree()` | Nested chapter structure |
| `getChapterByKey(key)` | Single chapter entry by stable key |

### 2.4 New: `shared/src/model/chapter-elements.js`

Defines the `Chapter` entity model, request structures, and the `OsHierarchy` type.

**`OsHierarchy` type:**

```javascript
/**
 * @typedef {Object} OsHierarchyTopic
 * @property {string}   topic               - Topic label
 * @property {number[]} ons                 - Ordered ON item IDs
 * @property {number[]} ors                 - Ordered OR item IDs
 * @property {number[]} ocs                 - Ordered OC item IDs
 * @property {OsHierarchyTopic[]} [subtopics] - Optional sub-topics (max one level)
 *
 * @typedef {Object} OsHierarchy
 * @property {OsHierarchyTopic[]} topics
 */
```

**`Chapter` model:**

```javascript
export const Chapter = {
    id:              '',
    title:           '',   // config-owned
    domain:          null, // config-owned — domain key, nullable
    position:        0,    // config-owned
    narrative:       '',   // user-maintained — stringified Quill Delta
    jsonOsHierarchy: null, // user-maintained — stringified JSON (REST boundary / Neo4j)
    osHierarchy:     null, // user-maintained — parsed OsHierarchy object (internal use)
    version:         0,
    createdAt:       '',
    createdBy:       '',
    parentId:        null
};
```

**`ChapterRequests`:**

```javascript
export const ChapterRequests = {
    // No create — chapters are bootstrap-only
    update: {
        narrative:         '',
        jsonOsHierarchy:   null,
        expectedVersionId: ''
    },
    patch: {
        narrative:         undefined,
        jsonOsHierarchy:   undefined,
        expectedVersionId: ''
    }
};
```

Note: `title`, `domain`, and `position` are config-owned — absent from all request shapes.

### 2.5 Modified: `shared/src/model/setup-elements.js`

- `Domain` entity definition — **removed**
- `DomainRequests` — **removed**

### 2.6 Modified: `shared/src/model/odp-elements.js`

**`OperationalRequirement` version fields — removed:**

| Field | Reason |
|---|---|
| `drg` | Replaced by `BELONGS_TO` at item level |
| `path` | Replaced by `Chapter.osHierarchy` |
| `impactedDomains` | (impact) Domain retired |

**`OperationalRequirement` — added:**

| Field | Level | Type | Notes |
|---|---|---|---|
| `chapterId` | item | integer | ID of the `Chapter` item node — stable, not version-specific |

**`OperationalChange` version fields — removed:**

| Field | Reason |
|---|---|
| `drg` | Replaced by `BELONGS_TO` at item level |

**`OperationalChange` — added:**

| Field | Level | Type | Notes |
|---|---|---|---|
| `chapterId` | item | integer | ID of the `Chapter` item node — stable, not version-specific |

### 2.7 Modified: request structures (`messages.js`)

**`OperationalRequirementRequests`:**
- Remove `drg`, `path`, `impactedDomains` from `create`, `update`, `patch`
- Add `chapterId` (integer, mandatory on `create`, optional on `patch`)

**`OperationalChangeRequests`:**
- Remove `drg` from `create`, `update`, `patch`
- Add `chapterId` (integer, mandatory on `create`, optional on `patch`)

### 2.8 Modified: `projections.js`

- Remove `drg`, `path`, `impactedDomains` from all `OperationalRequirement` field sets
- Remove `drg` from all `OperationalChange` field sets
- Add `chapterId` to `summary` field set for both

### 2.9 `drafting-groups.js` — retained unchanged

Retained for `Bandwidth.scope` only. `DraftingGroup` no longer exported from `shared/src/index.js` for general use — only `BandwidthStore` imports it directly. Migration of bandwidth scope to domain keys deferred.

---

## 3. Store Layer

### 3.1 New: `ChapterStore` (`chapter-store.js`)

Extends `VersionedItemStore`. Dual-node pattern: `Chapter` (item node) + `ChapterVersion` (version node).

**`Chapter` item node fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `key` | string | Stable config key — used for bootstrap matching |
| `createdAt` | timestamp | |
| `createdBy` | string | |
| `latest_version` | integer | Cached current version number |

**`ChapterVersion` node fields:**

| Field | Type | Cardinality | Notes |
|---|---|---|---|
| `version` | integer | mandatory | Sequential (1, 2, 3…) |
| `title` | string | mandatory | Config-owned |
| `domain` | string | optional | Domain key — nullable for pure narrative chapters |
| `position` | integer | mandatory | Config-owned |
| `narrative` | string | mandatory | Stringified Quill Delta — user-maintained |
| `jsonOsHierarchy` | string | optional | Stringified JSON — user-maintained, nullable |
| `createdAt` | timestamp | mandatory | |
| `createdBy` | string | mandatory | |

**Serialisation boundary (store layer):**
- Write: `JSON.stringify(osHierarchy)` → stored as `jsonOsHierarchy`
- Read: `JSON.parse(jsonOsHierarchy)` → exposed as `osHierarchy` on returned object

Service layer and above always work with the parsed `osHierarchy` object.

**Graph relationships:**

```
(chapter)-[:LATEST_VERSION]->(chapterVersion)
(chapterVersion)-[:VERSION_OF]->(chapter)
(chapter)-[:REFINES]->(parentChapter)       // sub-chapter → chapter, optional, max 1 level
(baseline)-[:HAS_ITEMS]->(chapterVersion)   // baseline snapshot
```

**Additional methods beyond `VersionedItemStore`:**

| Method | Returns | Notes |
|---|---|---|
| `findByKey(key, tx)` | `Chapter \| null` | Bootstrap — matches on `chapter.key` |
| `findByDomain(domainKey, tx)` | `Chapter \| null` | Import pipeline |
| `findAll(tx)` | `Chapter[]` | Ordered by `position`, sub-chapters nested |

### 3.2 Deleted: `DomainStore` (`domain-store.js`)

`DomainStore` and the `Domain` node label are removed. All `IMPACTS_DOMAIN` relationships are removed from `OperationalRequirementVersion` nodes.

### 3.3 Modified: `OperationalRequirementStore`

**`RequirementVersion` — remove fields:** `drg`, `path`

**`RequirementVersion` — remove relationship:** `IMPACTS_DOMAIN` → (impact) Domain

**New `BELONGS_TO` relationship:**
- Written at create/update time from `chapterId` in the input payload
- Relationship is on the **item node** — stable across versions
- Read as `chapterId` (integer) in `findAll` / `findById` results

**`buildFindAllQuery` changes:**
- Remove `drg`, `path`, `domain` from WHERE clauses and RETURN
- Add `chapterId` to RETURN via `(item)-[:BELONGS_TO]->(c:Chapter)`
- Add `chapterId` filter: `EXISTS { (item)-[:BELONGS_TO]->(c) WHERE id(c) = $chapterId }`

**Filter object — removed:** `drg`, `path`, `domain`

**Filter object — added:**

| Filter field | Type | Behaviour |
|---|---|---|
| `chapterId` | `number\|null` | EXISTS via `BELONGS_TO` → Chapter item |

### 3.4 Modified: `OperationalChangeStore`

- Remove `drg` from version node fields, queries, and filters
- Add `BELONGS_TO` relationship at item level
- Add `chapterId` to results and filters

### 3.5 New: `ChapterBootstrapService` (`server/src/bootstrap/chapter-bootstrap.js`)

Startup service — not a store. Called once from `server/src/index.js` during startup.

**Algorithm (idempotent):**
1. Load `$ODIP_HOME/config/edition.json` via `edition-config.js`
2. For each chapter entry, depth-first (parents before children):
   - `ChapterStore.findByKey(key, tx)`
   - If missing → `ChapterStore.create(...)` with `title`, `domain`, `position`, `key` from config; empty `narrative`; `jsonOsHierarchy: null`
   - If exists → no-op
3. Log created / existing counts at startup

### 3.6 DB Migration (decision pending)

No decision has been taken on whether to migrate an existing DB or restart from scratch. The following points should be considered if migration is chosen:

- **`drg` → `BELONGS_TO`** — for each existing `RequirementItem` and `OperationalChangeItem`, resolve the former `drg` value to the matching `Chapter` node (via `ChapterVersion.domain`) and create the `BELONGS_TO` relationship
- **`path` removal** — `path` arrays on existing `RequirementVersion` nodes must be dropped; no replacement needed (ordering moves to `Chapter.osHierarchy`)
- **`IMPACTS_DOMAIN` removal** — all `IMPACTS_DOMAIN` relationships and `Domain` nodes must be removed
- **`Chapter` nodes** — created by bootstrap at startup; no migration needed for chapter structure itself
- **Baseline `HAS_ITEMS`** — existing baseline snapshots do not reference `ChapterVersion` nodes; historical baselines will be incomplete with respect to chapter content. Strategy for historical baseline consistency to be decided.
- **Restart from scratch** — avoids all of the above; viable if Edition 1 O\*s are re-imported via the updated pipeline

---

## 4. Service Layer

### 4.1 New: `ChapterService` (`chapter-service.js`)

Extends `VersionedItemService`.

**User-maintained fields only:** `narrative`, `osHierarchy` (passed as parsed object; service serialises to `jsonOsHierarchy` before calling store).

**Validation rules:**
- `narrative` — required on update; must be valid Quill Delta JSON string
- `osHierarchy` — optional; if present, must conform to `OsHierarchy` schema; all referenced O\* item IDs validated for existence via separate `'system'` transaction using `Promise.all`
- `title`, `domain`, `position` — rejected if present in request (config-owned, read-only from API)

**Methods:**

| Method | Description |
|---|---|
| `findAll(userId)` | All chapters ordered by position, sub-chapters nested |
| `findById(chapterId, userId, baselineId?, editionId?)` | Single chapter with version content |
| `update(chapterId, data, expectedVersionId, userId)` | Full update of `narrative` + `osHierarchy` |
| `patch(chapterId, data, expectedVersionId, userId)` | Partial update |

### 4.2 Deleted: `DomainService` (`domain-service.js`)

### 4.3 Modified: `OperationalRequirementService`

**Removed:**
- `drg` enum validation
- `path` array handling
- `impactedDomains` foreign key validation (from `Promise.all` block)

**Added:**
- `chapterId` — mandatory on create; validated for existence via separate `'system'` transaction
- `chapterId` — optional on patch; validated for existence if provided

**Maturity-gated rules:** remove any conditions referencing `drg`, `path`, or `impactedDomains`.

### 4.4 Modified: `OperationalChangeService`

- Remove `drg` mandatory requirement and enum validation
- Add `chapterId` mandatory on create, validated for existence

### 4.5 Import Pipeline — Impact of Model Changes (decision pending)

No decision has been taken on the import strategy for Edition 1. The following impacts are identified:

- **`drg` field on mappers** — all existing DrG mappers (`ASM_ATFCM_Mapper`, `IDL_Mapper`, etc.) currently set `drg` on O\*s. With `drg` removed, mappers must instead set `chapterId` — requiring a chapter lookup by domain key at import time via `ChapterStore.findByDomain()`
- **`path` field on mappers** — `path` arrays currently used for topic grouping within a DrG. With `path` removed, topic grouping moves to `Chapter.osHierarchy`. Mappers would need to either populate `osHierarchy` on the relevant chapter or leave it empty for post-import editorial organisation
- **`impactedDomains` on mappers** — any mapper fields populating `impactedDomains` must be removed
- **`BootstrapMapper`** — likely survives as the only mapper; all other DrG-specific mappers (`ASM_ATFCM_Mapper`, etc.) are candidates for decommissioning once Edition 1 is imported via ODIP Space directly
- **JSON structured import model** — the `setup.json` external ID model references `drg` implicitly via mapper conventions; must be reviewed against the new `chapterId` requirement
- **Decision point** — if Edition 1 O\*s are imported via the updated pipeline, mappers must be updated before import; if authors re-enter O\*s directly in ODIP Space, mappers may be decommissioned without updating

---

## 5. REST API / OpenAPI

### 5.1 New file: `openapi-chapter.yml`

| Method | Path | Description |
|---|---|---|
| `GET` | `/chapters` | List all chapters (nested hierarchy) |
| `GET` | `/chapters/{id}` | Get chapter by ID (latest or edition context) |
| `PUT` | `/chapters/{id}` | Full update — `narrative` + `osHierarchy` |
| `PATCH` | `/chapters/{id}` | Partial update |
| `GET` | `/chapters/{id}/versions` | Version history |
| `GET` | `/chapters/{id}/versions/{versionNumber}` | Specific version |

No `POST /chapters` — creation is bootstrap-only.  
No `DELETE /chapters` — chapters are config-owned.

**Schemas:**
- `Chapter` — full representation: `id`, `title`, `domain`, `position`, `narrative`, `jsonOsHierarchy`, `parentId`, versioning fields
- `ChapterUpdateRequest` — `narrative`, `jsonOsHierarchy`, `expectedVersionId`
- `ChapterPatchRequest` — same fields, all optional except `expectedVersionId`

### 5.2 Modified: `openapi-base.yml`

**New schemas:**

```yaml
OsHierarchyTopic:
  type: object
  required: [topic, ons, ors, ocs]
  properties:
    topic:
      type: string
    ons:
      type: array
      items:
        type: integer
    ors:
      type: array
      items:
        type: integer
    ocs:
      type: array
      items:
        type: integer
    subtopics:
      type: array
      items:
        $ref: '#/components/schemas/OsHierarchyTopic'

OsHierarchy:
  type: object
  required: [topics]
  properties:
    topics:
      type: array
      items:
        $ref: '#/components/schemas/OsHierarchyTopic'
```

**`OperationalRequirement` schema:**
- Remove `drg`, `path`, `impactedDomains` fields
- Add `chapterId` (string, summary projection)

**`OperationalChange` schema:**
- Remove `drg` field
- Add `chapterId` (string, summary projection)

**`OperationalRequirementBaseRequest`:**
- Remove `drg`, `path`, `impactedDomains`
- Add `chapterId` (string, mandatory on create)

**`OperationalChangeBaseRequest`:**
- Remove `drg`
- Add `chapterId` (string, mandatory on create)

**`Domain` and `DomainRequest` schemas — removed.**

**`DraftingGroup` schema** — retained for `Bandwidth` only. Deprecation note: *"Used exclusively for Bandwidth.scope. Deprecated for all other uses — migration to domain keys deferred."*

### 5.3 Modified: `openapi-operational.yml`

**`GET /operational-requirements` query parameters:**
- Remove `drg`, `path`, `domain` filter parameters
- Add `chapter` (chapter item ID)

**`GET /operational-changes` query parameters:**
- Remove `drg` filter parameter
- Add `chapter` (chapter item ID)

### 5.4 Modified: `openapi-setup.yml`

- `GET /domains`, `POST /domains`, `GET /domains/{id}`, `PUT /domains/{id}`, `DELETE /domains/{id}` — **removed**
- `Bandwidth` schema and endpoints — no change; `scope` retains `$ref: DraftingGroup`

---

## 6. CLI (high-level)

### 6.1 New: `chapter` command group

| Command | Description |
|---|---|
| `chapter list` | List all chapters |
| `chapter show <id>` | Show chapter detail |
| `chapter update <id> <expectedVersionId>` | Update `narrative` and/or `osHierarchy` |
| `chapter patch <id> <expectedVersionId>` | Partial update |
| `chapter versions <id>` | Version history |

Detailed design deferred.

### 6.2 Deleted: `domain` command group

### 6.3 Modified: `requirement` command

- Remove `--drg`, `--path`, `--impacted-domains` flags from `list`, `create`, `update`, `patch`
- Add `--chapter <id>` to `list` (filter), `create` (mandatory), `update`, `patch`

### 6.4 Modified: `change` command

- Remove `--drg` flag
- Add `--chapter <id>` flag

Detailed design deferred.

---

## 7. Web Client (high-level)

### 7.1 Chapter management

New **Chapters** section in the Setup activity (Elaborate workspace). Integrators can:
- Browse chapter hierarchy
- Edit `narrative` (Quill rich text editor)
- Edit `osHierarchy` via drag-and-drop tree interface

Detailed design deferred.

### 7.2 Deleted: `domains.js` (Setup activity)

`domains.js` removed from Setup activity. `domains` collection removed from `setupData` cache on `App`.

### 7.3 O\* form changes

**`RequirementForm` / `requirement-form-fields.js`:**
- Remove `drg` field (select, DraftingGroup enum)
- Remove `path` field
- Remove `impactedDomains` field (AnnotatedMultiselectManager against Domain collection)
- Add `chapter` field (`ReferenceManager` against `GET /chapters`)

**`ChangeForm` / `change-form-fields.js`:**
- Remove `drg` field
- Add `chapter` field

### 7.4 O\* tree perspective

Tree perspective rebuilt from `Chapter.osHierarchy` rather than `REFINES` + `path`. User selects a chapter; tree renders from its `osHierarchy`. Drag-and-drop updates `osHierarchy` on the chapter version — new chapter version, same O\* versions (decoupled).

Detailed design deferred.

### 7.5 Prioritisation activity

`PrioritisationGrid` columns currently derived from `DraftingGroup` enum. With `drg` removed from OCs, columns must be derived from domain chapters. **Blocker for prioritisation activity** — detailed design deferred.

### 7.6 Setup data

`setupData` cache on `App` extended to include chapters. Loaded once, cached, invalidated after chapter update. `domains` collection removed.

---

## 8. Layer sequence

| Step | Layer | Artefacts |
|---|---|---|
| 1 | Config files | `domains.json`, `edition.json`; `odip-admin` deployment step |
| 2 | Shared config | `shared/src/config/domains-config.js`, `edition-config.js` |
| 3 | Shared model | `chapter-elements.js` (new); modified `odp-elements.js`, `projections.js`, `messages.js`; modified `setup-elements.js` ((impact) Domain removed) |
| 4 | Store | `ChapterStore` (new); deleted `DomainStore`; modified `OperationalRequirementStore`, `OperationalChangeStore` |
| 5 | Bootstrap | `server/src/bootstrap/chapter-bootstrap.js` (new); server startup hook |
| 6 | Service | `ChapterService` (new); deleted `DomainService`; modified `OperationalRequirementService`, `OperationalChangeService` |
| 7 | REST API | `openapi-chapter.yml` (new); modified `openapi-base.yml`, `openapi-operational.yml`, `openapi-setup.yml` |
| 8 | CLI | `chapter` command (new); deleted `domain` command; modified `requirement`, `change` commands |
| 9 | Web client | Chapter management UI (new); deleted `domains.js`; modified O\* forms, tree perspective, prioritisation |