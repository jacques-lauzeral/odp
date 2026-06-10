# Chapter 01 – Data Model

## 1. Overview

The ODIP data model is organised into three categories of entities:

- **Setup Entities** — reference data configured once and referenced throughout (reference documents, stakeholder categories, bandwidths, waves)
- **Operational Entities** — versioned content authored by contributors (operational requirements, operational changes)
- **Management Entities** — immutable lifecycle records (baselines, editions)

All entity definitions are centralised in the `@odp/shared` workspace package, providing a single source of truth consumed by the server, CLI, and web client.

---

## 2. Shared Model (`@odp/shared`)

### 2.1 Purpose and Role

The `@odp/shared` package defines:
- Entity models (field names, types, defaults)
- Request structures (create/update shapes)
- Enumerations with validation helpers
- Common utilities (ID normalisation, comparison)

All layers import from `@odp/shared`, ensuring that field names, enum values, and validation logic are never duplicated.

```javascript
import { OperationalRequirement, isDomainValid, isMaturityLevelValid } from '@odp/shared';
```

### 2.2 File Organisation

```
shared/src/
├── index.js                  # Aggregated exports
├── config/                   # Config loaders — used by server and CLI at startup
│   ├── loader.js             # Single entry point: loadConfig(configDir)
│   ├── domains-config.js     # Domain tree loader + accessors (getDomainKeys, isDomainValid, …)
│   └── edition-config.js     # Edition structure loader + accessors (getChapters, getChapterByCode, …)
├── messages/                 # API exchange contracts: request/response shapes
│   └── messages.js           # Request/response model definitions
└── model/                    # Domain model: entities, enums, utilities
    ├── chapter-elements.js   # Chapter entity model + OsHierarchy type
    ├── drafting-groups.js    # DRG enum + validation helpers — retained for Bandwidth.scope only
    ├── maturity-levels.js    # Maturity level enum (DRAFT, ADVANCED, MATURE)
    ├── milestone-events.js   # Milestone event types
    ├── odp-edition-types.js  # Edition type enum (DRAFT, OFFICIAL)
    ├── odp-elements.js       # Operational and management entity models
    ├── quality-elements.js   # Quality check model (QualityReport, DomainQualityReport, BrokenONTraceability, UntraceableOR, OrphanON, NoShowOStar)
    ├── or-types.js           # OR type enum (ON, OR)
    ├── projections.js        # Projection definitions and field set mappings
    ├── setup-elements.js     # Setup entity models (Domain removed)
    └── utils.js              # ID normalisation, lazy comparison
```

> **model/ vs messages/**: `model/` defines what entities *are* (structure, enums, validation). `messages/` defines what is *exchanged over the API* (request payloads, response shapes). Keeping them separate makes it easier to evolve API contracts independently of the domain model.

### 2.4 Config Model

Two JSON config files live in `workspace/server/config/` (source) and are deployed to `$ODIP_HOME/config/` at install time by `odip-admin`. They are loaded once at server and CLI startup via `loadConfig(configDir)` from `@odip/shared`.

#### `domains.json`

Defines the domain tree — the semantic classification authority for O\*s. Maximum two levels.

Domain keys are stable string identifiers stored directly on `OperationalRequirementVersion.domain` and `OperationalChangeVersion.domain`, and referenced by `ChapterVersion.domain`. The `isDomainValid(key)` accessor validates domain keys at service layer.

#### `edition.json`

Defines the publication chapter structure. Every chapter entry is bootstrapped as a versioned `Chapter` DB entity at server startup (`initializeDatabase()` in `store/index.js`). Config-owned fields (`title`, `domain`, `position`) are never stored on version nodes — they are merged from the config at read time.

### 2.3 Enum Pattern

All enumerations follow a consistent pattern:

```javascript
export const DraftingGroup = {
    '4DT':        '4D-Trajectory',
    'AIRPORT':    'Airport',
    'ASM_ATFCM':  'ASM / ATFCM Integration',
    // ...
};
export const DraftingGroupKeys    = Object.keys(DraftingGroup);
export const isDraftingGroupValid = (value) => DraftingGroupKeys.includes(value);
export const getDraftingGroupDisplay = (key) => DraftingGroup[key] || key;
```

---

## 3. Entity Definitions

### 3.1 Setup Entities

Setup entities are non-versioned reference data. They support hierarchical organisation via the REFINES relationship where noted.

> **Phase 2 change:** The former **Domain** setup entity — used to characterise OR impact via `IMPACTS_DOMAIN` — has been fully retired. The term *domain* now unambiguously refers to the domain key string from `domains.json` (see §2.4). The `DraftingGroup` enum is retained exclusively for `Bandwidth.scope` — it has been removed from OR and OC.

#### ReferenceDocument (Strategic Documents)

Represents a strategic or regulatory document (e.g. CONOPS, EU Regulation, NSP) that serves as a source for ON definitions. ONs trace back to at least one reference document; by extension, ORs and OCs inherit this traceability.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `name` | string | Short title, e.g. "iDL CONOPS" |
| `description` | string | Optional long-form description |
| `version` | string | Optional edition or version number |
| `url` | string | Link to the physical document |

Supports REFINES hierarchy (parent-child, up to three levels: root / child / grandchild).

#### Wave

NM deployment cycle, used as milestone targets for OCs. The wave is identified by its year and sequence number (e.g. 27#2).

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `year` | integer | Deployment year, e.g. 2027 |
| `sequenceNumber` | integer | Sequence number within the year, e.g. 2 |
| `implementationDate` | date | Actual deployment date when decided; optional |

Flat list — no hierarchy. The `(year, sequenceNumber)` pair is unique.

#### StakeholderCategory

Characterises the operational stakeholder impact of ORs. Organised in a two-level hierarchy under the implicit top-level "Network" category.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `name` | string | Full name, e.g. "Flow Management Position" |
| `description` | rich text | |

Supports REFINES hierarchy (parent-child, max two levels).

#### Bandwidth

Represents yearly development effort (in MW) scoped to a Drafting Group, for NM internal planning. Not visible to external stakeholders.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `year` | integer | The effort year |
| `planned` | integer | Planned bandwidth in MW; optional |
| `waveId` | reference | Wave reference; optional — omitted means yearly total |
| `scope` | DraftingGroup key | DrG scope (e.g. `AIRSPACE`, `TRANSVERSAL`); optional — omitted means global scope |

The `(year, waveId, scope)` tuple is unique: no two Bandwidth records may share the same combination.

---

### 3.2 Operational Entities

Operational entities are **versioned**. Every update creates a new version; previous versions are preserved for historical navigation and baseline snapshots.

#### Operational Requirement

ORs are the core content of the ODIP. A Requirement can be of type **ON** (Operational Need — high-level objective agreed with operational stakeholders) or **OR** (Operational Requirement — detailed, implementable requirement).

Several attributes are type-specific. The service layer enforces these rules; the web client anticipates them in form field visibility and validation:

- Fields marked **ON only** are applicable to ONs; forbidden for ORs
- Fields marked **OR only** are applicable to ORs; forbidden for ONs
- Fields marked **root only** are mandatory on root requirements (no parent); optional on child requirements

**Item node fields** (stable across versions):

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `title` | string | Searchable unique identifier |
| `createdAt` | timestamp | |
| `createdBy` | string | |
| `latest_version` | integer | Cache of current version number |

**Version node fields** (per version):

| Field | Type | ON/OR | Cardinality | Projection | Notes |
|---|---|---|---|---|---|
| `version` | integer | both | mandatory | summary | Sequential (1, 2, 3…) |
| `type` | enum | both | mandatory | summary | ON \| OR |
| `domain` | string | both | mandatory | summary | Domain key from `domains.json` (see §2.4) |
| `maturity` | enum | both | mandatory | summary | DRAFT \| ADVANCED \| MATURE |
| `tentative` | integer[] | **ON only** | mandatory (root ON), optional (child ON) | summary | Tentative implementation time: `[year]` or `[start, end]` where start ≤ end |
| `nfrs` | rich text | **OR only** | optional | standard | Non-functional requirements from business perspective |
| `statement` | rich text | both | mandatory | standard | Core requirement statement |
| `rationale` | rich text | both | mandatory | standard | Justification |
| `flows` | rich text | both | optional | standard | Flow descriptions and flow examples |
| `privateNotes` | rich text | both | optional | standard | Internal notes, not shared with other organisations |
| `additionalDocumentation` | attachments | both | optional | standard | Supporting documents |

**Version relationship fields**:

| Relationship | ON/OR | Cardinality | Projection | Notes |
|---|---|---|---|---|
| `refines` | both | optional | summary | Parent Requirement of same type |
| `strategicDocuments` | **ON only** | mandatory (root ON), optional otherwise | summary | Annotated list of ReferenceDocuments |
| `implementedONs` | **OR only** | mandatory (root OR), optional otherwise | summary | List of implemented ONs |
| `impactedStakeholders` | **OR only** | mandatory (root OR), optional otherwise | summary | List of StakeholderCategories |
| `dependencies` | **OR only** | optional | summary | List of ORs that must be implemented before this OR |

**Derived fields** (reverse-traversal, available in `extended` projection only):

| Field | ON/OR | Notes |
|---|---|---|
| `implementedByORs` | **ON only** | ORs whose `implementedONs` references this ON |
| `implementedByOCs` | **OR only** | OCs whose `implementedORs` references this OR |
| `decommissionedByOCs` | **OR only** | OCs whose `decommissionedORs` references this OR |
| `refinedBy` | both | Requirements whose `refinesParents` references this requirement |
| `requiredByORs` | **OR only** | ORs whose `dependencies` references this OR |

#### Operational Change (OC)

OCs describe and plan the deployment of OR evolutions. They do not group ONs directly — ONs are progressively implemented through the ORs included in one or more OCs.

**Item node fields**: same pattern as Requirement (id, title, createdAt, createdBy, latest_version).

**Version node fields**:

| Field | Type | Cardinality | Projection | Notes |
|---|---|---|---|---|
| `version` | integer | mandatory | summary | Sequential |
| `domain` | string | mandatory | summary | Domain key from `domains.json` (see §2.4) |
| `maturity` | enum | mandatory | summary | DRAFT \| ADVANCED \| MATURE |
| `cost` | integer | optional | summary | Estimated development cost in MW |
| `purpose` | rich text | mandatory | standard | Why the OC is needed |
| `initialState` | rich text | mandatory | standard | Current operational situation before deployment |
| `finalState` | rich text | mandatory | standard | Target operational situation after deployment |
| `details` | rich text | mandatory | standard | Additional deployment detail |
| `privateNotes` | rich text | optional | standard | Internal notes |
| `additionalDocumentation` | attachments | optional | standard | Supporting documents |

**Version relationship fields**:

| Relationship | Cardinality | Projection | Notes |
|---|---|---|---|
| `implementedORs` | optional | summary | ORs satisfied by this OC |
| `decommissionedORs` | optional | summary | ORs fully decommissioned by this OC |
| `dependencies` | optional | summary | OCs that must be deployed before this OC |
| `milestones` | optional | summary | Deployment milestones (see §4.4) |
| `orCosts` | optional | summary | Per-OR cost breakdown (see ORCost below) |

**Derived fields** (reverse-traversal, available in `extended` projection only):

| Field | Notes |
|---|---|
| `requiredByOCs` | OCs whose `dependencies` references this OC |

**ORCost**: Represents the cost of an OR in the context of this OC.

| Field | Type | Notes |
|---|---|---|
| `or` | reference | The OR reference |
| `cost` | integer | Cost in MW |

#### Chapter

Chapters organise an ODIP Edition for human consumption. They group domains, carry narrative text, and define the O\* presentation order via `osHierarchy`. A domain chapter references a domain key from `domains.json`; a pure narrative chapter has no domain reference.

Chapters are **config-owned** (domain, position declared in `edition.json`) but **user-maintained** (narrative, osHierarchy edited by integrators). They are **versioned** — every narrative or hierarchy edit creates a new ChapterVersion. Chapters are created by the bootstrap process and cannot be deleted.

**Item node fields** (stable across versions, set at bootstrap):

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `code` | string | Stable identifier (= chapter key from `edition.json`) |
| `title` | string | Display title from `edition.json` |

**Version node fields** (user-maintained, stored on ChapterVersion):

| Field | Type | Cardinality | Notes |
|---|---|---|---|
| `narrative` | rich text | optional | Chapter introduction / narrative content. May contain `generated-block` marks (`{ type: 'generated-block', attrs: { id: string } }`); valid block IDs per chapter are declared in `edition.json` under `generatedBlocks`. |
| `jsonOsHierarchy` | JSON string | optional | Serialised OsHierarchy — deserialized to `osHierarchy` by store layer |
| `jsonGeneratedBlocks` | JSON string | optional | Serialised `{ [blockId]: content }` map — populated at edition creation time; null in elaborate mode |

**Config-owned fields** (not stored on nodes — merged from `edition.json` at read time by service layer):

| Field | Type | Notes |
|---|---|---|
| `domain` | string | Domain key — null on pure narrative chapters |
| `position` | integer | Ordering within parent |
| `parentKey` | string | Parent chapter code — null for top-level chapters |
| `generatedBlocks` | string[] | Block IDs available for insertion in this chapter's narrative — empty on domain chapters |

**OsHierarchy type:**

```
OsHierarchy
└── topics: OsHierarchyTopic[]
    ├── id: string               — chapter-scoped unique identifier (first free positive integer as string)
    ├── topic: string            — topic label
    ├── narrative: string|null   — optional theme narrative (TipTap JSON string)
    ├── ons: number[]            — ON item IDs in this topic
    ├── ors: number[]            — OR item IDs in this topic
    ├── ocs: number[]            — OC item IDs in this topic
    └── subtopics: OsHierarchyTopic[]   — recursive (same shape)
```

---


### 3.3 Management Entities

Management entities are **immutable** — once created they cannot be updated.

#### Baseline

An immutable snapshot of the repository at a point in time.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `title` | string | Short human-readable identifier |
| `createdAt` | timestamp | |
| `createdBy` | string | |
| `capturedItemCount` | integer | Number of OR/OC/Chapter versions captured at creation time |

At creation, the baseline captures `HAS_ITEMS` relationships pointing to the specific `ItemVersion` nodes that were latest at that moment — for `OperationalRequirement`, `OperationalChange`, and `Chapter` item types.

#### Edition

A published edition of the ODIP, acting as a "saved query" over a baseline. An edition defines two optional, combinable content selection criteria — both may be absent, in which case the edition exposes the full baseline content.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `title` | string | |
| `type` | enum | DRAFT | OFFICIAL\|DRAFT | OFFICIAL\|DRAFT | OFFICIAL |
| `createdAt` | timestamp | |
| `createdBy` | string | |
| `startDate` | string | Optional — lower bound date (format: `yyyy-mm-dd`) for both OC milestone filtering and ON tentative period filtering |
| `minONMaturity` | enum | Optional — minimum maturity level for ON inclusion (DRAFT \| ADVANCED \| MATURE) |

**Content selection algorithm**

An edition selects content via two independent paths whose results are unioned:

**Tentative path (ON/OR-based):**

1. **Candidate ONs** — if `startDate` is set, keep only ONs where `effectiveEnd(tentative) > startDate`. ONs without a `tentative` field are excluded from this path. If no `startDate`, all ONs with a `tentative` field are candidates.
2. **Maturity filter** — if `minONMaturity` is set, keep only candidate ONs where `maturity >= minONMaturity`.
3. **Downward ON cascade** — child ONs of accepted ONs are accepted recursively, regardless of their own maturity or tentative value.
4. **OR inclusion** — ORs implementing any accepted ON are accepted; their refining ORs are accepted recursively (downward cascade).

**OC path (change-based):**

5. **Candidate OCs** — if `startDate` is set, keep only OCs with at least one milestone where `milestone.wave.implementationDate >= startDate`.
6. **OR/ON inclusion** — ORs implemented or decommissioned by accepted OCs are accepted; ONs implemented by those ORs are accepted for structural completeness.

**`tentative` boundary rule:** `effectiveEnd([y])` = `effectiveEnd([x, y])` = `{y+1}-01-01T00:00`. A single-year value `[2028]` is treated as `[2028, 2028]`, with effective end `2029-01-01T00:00`.

---

## 3.4 Projection Model

Operational entity responses support three projection levels, controlling which fields are returned. The projection is specified via the `projection` query parameter on list and single-item endpoints.

| Projection | Available on | Field sets included |
|---|---|---|
| `summary` | list endpoints only | summary fields only |
| `standard` | list and single-item endpoints | summary + rich-text fields (default) |
| `extended` | single-item endpoints only | summary + rich-text + derived fields |

**Field sets:**

| Field set | Description |
|---|---|
| `summary` | Scalar and reference fields sufficient for list views, grids, and filter operations. Excludes rich text and derived attributes. |
| `rich-text` | Rich text content fields (`statement`, `rationale`, `flows`, etc.). Added on top of `summary` for `standard` and `extended`. |
| `derived` | Reverse-traversal attributes computed at query time. Added on top of `standard` for `extended` only. |

The projection definitions and field-set mappings are owned by `shared/src/model/projections.js`, which exposes three functions:

| Function | Description |
|---|---|
| `getProjectionFieldSets(projectionName)` | Returns the ordered list of field set names for a projection |
| `getFieldSetFields(entityType, fieldSetName)` | Returns the field names in a field set for an entity type |
| `getProjectionFields(entityType, projectionName)` | Convenience composition — returns the full flat field list for a projection |

The store layer calls `getProjectionFields` to determine exactly which fields and relationships to fetch from Neo4j, ensuring no over-fetching regardless of projection.

---

## 4. Relationships

### 4.1 Hierarchy — REFINES

Used by hierarchical setup entities (StakeholderCategory, ReferenceDocument) and by Requirements to express parent-child structuring.

```
(Child)-[:REFINES]->(Parent)
```

Tree structure is enforced: a node can have only one parent. Self-reference is prevented. For Requirements, the REFINES relationship is type-homogeneous: an ON refines an ON, an OR refines an OR.

### 4.2 Operational Relationships

| Relationship | From | To | Meaning |
|---|---|---|---|
| `IMPLEMENTS` | OR-type RequirementVersion | ON-type RequirementItem | OR implements the ON |
| `IMPLEMENTS` | OCVersion | ORItem | OC satisfies (implements) the OR |
| `DECOMMISSIONS` | OCVersion | ORItem | OC fully decommissions the OR |
| `DEPENDS_ON` | ORVersion → ORItem | | OR depends on another OR |
| `DEPENDS_ON` | OCVersion → OCItem | | OC depends on another OC |

`DEPENDS_ON` points to the Item node (not a specific version), so it automatically follows the latest version as new versions are created.

### 4.3 Impact and Reference Relationships

| Relationship | From | To | Notes |
|---|---|---|---|
| `IMPACTS_STAKEHOLDER` | ORVersion | StakeholderCategory | |
| `REFERENCES` | RequirementVersion | ReferenceDocument | Optional `note` property (plain text, e.g. "Section 3.2") |

### 4.4 Milestone Relationships

Each OC version owns a set of independent milestone events. Milestones have a stable `milestoneKey` that persists across OC versions.

```
(Milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(OperationalChangeVersion)
(Milestone)-[:TARGETS]->(Wave)
```

Each milestone carries one or more event types. The supported event types are defined in §6.5.

Milestones are independent — no sequencing or dependency between them is enforced. All milestones must reference a Wave, ensuring that deployment dates align with defined NM release cycles.

### 4.5 Versioning and Baseline Relationships

```
(Item)-[:LATEST_VERSION]->(ItemVersion)    # Points to current version
(ItemVersion)-[:VERSION_OF]->(Item)        # Back-reference
(Baseline)-[:HAS_ITEMS]->(ItemVersion)     # Snapshot at baseline creation time
(Edition)-[:EXPOSES]->(Baseline)
```

---

## 5. Versioning Model

### 5.1 Version Creation

Every mutation of an operational entity (OR or OC) creates a new `ItemVersion` node. The `LATEST_VERSION` pointer on the `Item` node is atomically moved to the new version. Previous versions remain accessible for historical navigation.

### 5.2 Version Context

Queries accept optional context parameters that transparently select which version to return:

| Parameter | Effect |
|---|---|
| none | Returns the latest version |
| `baselineId` | Returns the version captured at baseline creation time |
| `startDate` | Lower bound date (yyyy-mm-dd) — for OCs: filters to those with milestones at or after the date. For ONs: filters to those whose tentative period ends after the date. |
| `minONMaturity` | Filters ONs to those meeting the minimum maturity level; cascades to child ONs and implementing ORs |

### 5.3 Optimistic Locking

Clients must supply `expectedVersionId` on every update. If another user has updated the entity in the meantime, the server rejects the update with a `VERSION_CONFLICT` error, forcing the client to refresh before retrying.

### 5.4 Baseline Snapshots

At baseline creation, the system captures `HAS_ITEMS` relationships pointing to the exact `ItemVersion` nodes that were latest at that moment. Historical navigation uses these explicit pointers rather than re-deriving state, ensuring accurate reconstruction of the repository at any past baseline.

---

## 6. Enumerations Reference

### 6.1 Drafting Groups (DRG)

> **Deprecation note:** `DraftingGroup` is retained exclusively for `Bandwidth.scope`. It has been removed from `OperationalRequirement` and `OperationalChange` — O\*s now carry a `domain` string field validated against `domains.json`. Do not use `DraftingGroup` for any new O\* classification purpose.

The `DraftingGroup` enum identifies the drafting group scope for bandwidth planning.

| Key | Display                            |
|---|------------------------------------|
| 4DT | 4D-Trajectory                      |
| AIRPORT | Airport                            |
| AIRSPACE | Airspace (iDL)                     |
| ASM_ATFCM | ASM / ATFCM Integration            |
| CRISIS | Crisis                             |
| FAAS | Flight Assessment and Alert System |
| FLOW | Flow                               |
| RRT | Rerouting                          |
| TCF | Transponder Code Function          |
| TRANSVERSAL | Transversal                        |

### 6.2 OR Types

| Key | Meaning |
|---|---|
| ON | Operational Need (high-level objective) |
| OR | Operational Requirement (detailed, traceable) |

### 6.3 Maturity Levels

| Key | Meaning |
|---|---|
| DRAFT | Under work; not ready for prioritisation or ODIP edition display |
| ADVANCED | Under work but good enough for prioritisation and ODIP edition display |
| MATURE | Considered finalised for prioritisation and ODIP edition display |
| NO_SHOW | Imported from source with `noShow: true`; excluded from publication and edition display |

`NO_SHOW` applies to ONs and ORs only. It is set automatically by `DistributedEditionImporter` when the source entry carries `noShow: true`. It is not a valid value for OCs, and is not available as a `minONMaturity` gate on editions. The `maturity-levels.js` enum and `openapi-base.yml` maturity enums on `OperationalRequirement`, `OperationalRequirementRequest`, and `OperationalRequirementPatchRequest` include `NO_SHOW`; OC maturity enums do not.

### 6.4 Edition Types

| Key | Meaning |
|---|---|
| DRAFT | OFFICIAL| Alpha edition |
|DRAFT | OFFICIAL| Beta edition |
|DRAFT | OFFICIAL | Official release edition |

### 6.5 Milestone Event Types

| Key | Meaning |
|---|---|
| `OPS_DEPLOYMENT` | Operations Deployment |
| `API_PUBLICATION` | API Publication |
| `API_TEST_DEPLOYMENT` | API Test Deployment |
| `UI_TEST_DEPLOYMENT` | UI Test Deployment |
| `API_DECOMMISSIONING` | API Decommissioning |

Each milestone carries one or more event types from this list.

---

## 7. Shared Utilities

### 7.1 utils.js

`utils.js` provides low-level ID normalisation and comparison helpers used across all layers (store, service, CLI, web client).

**The problem it solves**: Neo4j returns integer IDs as native `Neo4j Integer` objects (with a `.toNumber()` method), while the API and CLI work with JavaScript `number` or `string`. Without normalisation, direct equality checks fail silently.

| Function | Purpose |
|---|---|
| `normalizeId(id)` | Converts string, number, or Neo4j Integer to a plain JS integer. Throws on invalid input (fail-fast). |
| `isValidId(id)` | Returns `true` if the value can be normalised to a non-negative integer. |
| `lazyEquals(a, b)` | Compares two values that may be of mixed types (string, number, Neo4j Integer). Returns `true` if they resolve to the same integer. |
| `idsEqual(id1, id2)` | Convenience wrapper — normalises both sides and compares. |

### 7.2 Comparator

`Comparator` (in `shared/src/model/`) compares two versions of the same entity to detect meaningful changes. It serves two distinct use cases with different requirements:

| Use case | Caller | `ignoreMilestones` |
|---|---|---|
| Import pipeline (CREATE/UPDATE/SKIP) | `ImportService` | `true` (default) |
| User-facing version diff | `DiffPopup` (web client) | `false` |

**`compareOperationalRequirement(existing, incoming)`** — milestones are not applicable to OR.

**`compareOperationalChange(existing, incoming, ignoreMilestones = true)`** — the `ignoreMilestones` default preserves import behaviour with no call-site changes required. When `false`, milestone changes are included via `_compareMilestones()`.

Comparison is entity-type-aware, handling these field categories:

| Category | Comparison strategy |
|---|---|
| Simple fields (`title`, `domain`, `maturity`, …) | Normalised string equality (trim, null → `''`) |
| Rich text fields (Quill delta JSON) | Structural normalisation — empty delta variants (`{}`, `{"ops":[]}`, single `\n`) all resolve to `''`; valid content is re-serialised before comparison |
| Reference arrays (`refinesParents`, `implementedORs`, …) | Sorted ID comparison (order-insensitive) |
| Annotated reference arrays (`strategicDocuments`, …) | Sorted `{id, note}` comparison |
| Milestones | Name-keyed map comparison (see below) |

**Milestone comparison algorithm (`_compareMilestones`):**

Milestones are compared as `Map<name, milestone>` where `milestone.name` is the business identifier. Name uniqueness within a version is enforced by the service layer (see Chapter 03 §3.5), making this map-based approach safe.

| Outcome | Condition |
|---|---|
| Added | `name` present in new map, absent in old map |
| Removed | `name` present in old map, absent in new map |
| Modified | `name` present in both maps; field-level diff detects a change |

Rename is not detectable — it appears as remove + add, which is acceptable.

Field-level comparison for modified milestones covers: `description` (rich text normalisation), `eventTypes` (order-insensitive sorted array), `wave` (ID comparison via `wave.id`).

**Change entry shapes:**

```javascript
// Scalar / rich text
{ field: 'statement', oldValue: '...', newValue: '...' }

// Reference array (original objects preserved for title/code rendering)
{ field: 'implementedORs', oldValue: [ref, ...], newValue: [ref, ...] }

// Milestones (only when ignoreMilestones = false)
{
    field: 'milestones',
        added:    [ milestone, ... ],
    removed:  [ milestone, ... ],
    modified: [ { name: string, changes: [ { field, oldValue, newValue }, ... ] }, ... ]
}
```

---

*Previous: [Chapter 00 – Overview](./00-Overview.md) | Next: [Chapter 02 – Storage Layer](./02-Storage-Layer.md)*