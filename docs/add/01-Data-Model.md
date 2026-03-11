# Chapter 01 – Data Model

## 1. Overview

The ODIP data model is organised into three categories of entities:

- **Setup Entities** — reference data configured once and referenced throughout (stakeholder categories, data categories, regulatory aspects, services, waves)
- **Operational Entities** — versioned content authored by contributors (operational requirements, operational changes)
- **Management Entities** — immutable lifecycle records (baselines, ODIP editions)

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
import { OperationalRequirement, DraftingGroup, isDraftingGroupValid } from '@odp/shared';
```

### 2.2 File Organisation

```
shared/src/
├── index.js                  # Aggregated exports
├── messages/                 # API exchange contracts: request/response shapes
│   └── messages.js           # Request/response model definitions
└── model/                    # Domain model: entities, enums, utilities
    ├── drafting-groups.js    # DRG enum + validation helpers
    ├── milestone-events.js   # Milestone event types (5 events)
    ├── odp-edition-types.js  # Edition type enum (DRAFT, OFFICIAL)
    ├── odp-elements.js       # Operational and management entity models
    ├── or-types.js           # OR type enum (ON, OR)
    ├── setup-elements.js     # Setup entity models
    ├── utils.js              # ID normalisation, lazy comparison
    └── visibility.js         # Visibility levels (NM, NETWORK)
```

> **model/ vs messages/**: `model/` defines what entities *are* (structure, enums, validation). `messages/` defines what is *exchanged over the API* (request payloads, response shapes). Keeping them separate makes it easier to evolve API contracts independently of the domain model.

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

Setup entities are non-versioned reference data. They support hierarchical organisation via the REFINES relationship (except Waves, which are flat).

#### Stakeholder Categories
Characterise the operational stakeholder impact of an ON/OR.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `name` | string | Short name, e.g. "Flow Management Position" |
| `description` | string | |

Supports REFINES hierarchy (parent-child tree). Electronic documents can be attached.

#### Data Categories
Characterise the data impact of an ON/OR.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `name` | string | Compact name reflecting data nature |
| `description` | string | |

Supports REFINES hierarchy.

#### Regulatory Aspects
Characterise the regulatory impact of an ON/OR.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `name` | string | Compact name, e.g. "ICAO Annex 15 AIRAC" |
| `description` | string | |

Supports REFINES hierarchy.

#### Services (and Domains)
A domain is a named group of services. A service represents a capability delivered by NM to operational stakeholders.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `name` | string | |
| `description` | string | |

Supports REFINES hierarchy (domain → service).

#### Waves
NM deployment cycles, used as milestone targets for OCs.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `year` | integer | Deployment year, e.g. 2027 |
| `quarter` | integer | Deployment quarter, e.g. 1 |
| `date` | string | Deployment date when decided |

Flat list — no hierarchy.

---

### 3.2 Operational Entities

Operational entities are **versioned**. Every update creates a new version; previous versions are preserved for historical navigation and baseline snapshots.

#### Operational Requirement (OR)

ORs are the core content of the ODIP. An OR can be of type **ON** (Operational Need, high-level) or **OR** (Operational Requirement, detailed).

**Item node fields** (stable across versions):

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `title` | string | Searchable, unique identifier |
| `createdAt` | timestamp | |
| `createdBy` | string | |
| `latest_version` | integer | Cache of current version number |

**Version node fields** (per version):

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Sequential (1, 2, 3…) |
| `type` | enum | ON \| OR |
| `drg` | enum | Drafting Group (see §4.1) |
| `statement` | rich text | Core requirement statement |
| `rationale` | rich text | Justification |
| `flows` | rich text | Use case / flow descriptions |
| `privateNotes` | rich text | Internal notes |
| `path` | string[] | Folder hierarchy for navigation |

#### Operational Change (OC)

OCs describe and plan the deployment of OR evolutions. They do not group ONs directly — ONs are implemented progressively through the ORs included in one or more OCs.

**Item node fields**: same pattern as OR (id, title, createdAt, createdBy, latest_version).

**Version node fields**:

| Field | Type | Notes |
|---|---|---|
| `version` | integer | Sequential |
| `drg` | enum | Drafting Group |
| `visibility` | enum | NM \| NETWORK |
| `purpose` | rich text | Why the OC is needed |
| `initialState` | rich text | Current operational situation |
| `finalState` | rich text | Target operational situation |
| `details` | rich text | Additional deployment detail |
| `privateNotes` | rich text | Internal notes |
| `path` | string[] | Folder hierarchy |

**Milestones**: Each OC version owns a set of independent milestone events (see §4.4).

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

At creation, the baseline captures `HAS_ITEMS` relationships pointing to the specific `ItemVersion` nodes that were latest at that moment.

#### ODIP Edition

A published edition of the ODIP, built from a baseline with a starting wave.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | |
| `title` | string | |
| `type` | enum | ALPHA \| BETA \| RELEASE |
| `createdAt` | timestamp | |
| `createdBy` | string | |

An ODIP Edition acts as a "saved query": it references a baseline and a starting wave, exposing only OCs with milestones at or after that wave, and only the ORs referenced by those filtered OCs.

---

## 4. Relationships

### 4.1 Hierarchy — REFINES

Used by all hierarchical setup entities and by ORs to express parent-child structuring.

```
(Child)-[:REFINES]->(Parent)
```

Tree structure is enforced: a node can have only one parent. Self-reference is prevented.

### 4.2 Operational Relationships

| Relationship | From | To | Meaning |
|---|---|---|---|
| `SATISFIES` | OCVersion | ORItem | OC implements the OR |
| `SUPERSEDES` | OCVersion | ORItem | OC replaces the OR |
| `DEPENDS_ON` | ORVersion → ORItem | | OR depends on another OR |
| `DEPENDS_ON` | OCVersion → OCItem | | OC depends on another OC |
| `IMPLEMENTED_BY` | ON-type OR | OR-type OR | ON implemented by OR |

`DEPENDS_ON` points to the Item node (not a specific version), so it automatically follows the latest version as new versions are created.

### 4.3 Impact and Reference Relationships

| Relationship | From | To | Notes |
|---|---|---|---|
| `IMPACTS` | ORVersion / OCVersion | StakeholderCategory | |
| `IMPACTS` | ORVersion / OCVersion | DataCategory | |
| `IMPACTS` | ORVersion / OCVersion | Service | |
| `REFERENCES` | ORVersion / OCVersion | Document | Optional `note` property (plain text, e.g. "Section 3.2") |

### 4.4 Milestone Relationships

Each OC version owns a set of independent milestone events. Milestones have a stable `milestoneKey` that persists across OC versions.

```
(Milestone:OperationalChangeMilestone)-[:BELONGS_TO]->(OperationalChangeVersion)
(Milestone)-[:TARGETS]->(Wave)
```

Five milestone event types are defined:

| Event | Description |
|---|---|
| `API_PUBLICATION` | API published |
| `API_TEST_DEPLOYMENT` | API deployed on test environment |
| `UI_TEST_DEPLOYMENT` | UI deployed on test environment |
| `OPS_DEPLOYMENT` | Operational deployment |
| `API_DECOMMISSIONING` | API decommissioned |

Milestone events are independent — no sequencing or dependency between them is enforced.

### 4.5 Versioning and Baseline Relationships

```
(Item)-[:LATEST_VERSION]->(ItemVersion)    # Points to current version
(ItemVersion)-[:VERSION_OF]->(Item)        # Back-reference
(Baseline)-[:HAS_ITEMS]->(ItemVersion)     # Snapshot at baseline creation time
(ODIPEdition)-[:EXPOSES]->(Baseline)
(ODIPEdition)-[:STARTS_FROM]->(Wave)
```

---

## 5. Versioning Model

### 5.1 Dual-Node Pattern

Versioned entities use a two-node structure in Neo4j:

- **Item node** — stable identity: id, title, createdAt, createdBy, latest_version
- **ItemVersion node** — version-specific content: all content fields, relationships, milestones

```
OperationalRequirement (Item)
    └──[:LATEST_VERSION]──► OperationalRequirementVersion (v3)
                                └──[:VERSION_OF]──► OperationalRequirement
```

### 5.2 Relationship Inheritance

When a new version is created, relationships are resolved as follows:

- **Not specified** in the update payload → inherited from previous version
- **Specified** in the payload → replaces previous version's relationships
- **Empty array** → clears all relationships of that type

Previous versions retain their own relationship sets unchanged, ensuring historical accuracy.

### 5.3 Optimistic Locking

Updates require the client to supply `expectedVersionId` (the current version's node ID). If another user has updated the entity in the meantime, the server rejects the update with a `VERSION_CONFLICT` error, forcing the client to refresh before retrying.

### 5.4 Baseline Snapshots

At baseline creation, the system captures `HAS_ITEMS` relationships pointing to the exact `ItemVersion` nodes that were latest at that moment. Historical navigation uses these explicit pointers rather than re-deriving state, ensuring accurate reconstruction of the repository at any past baseline.

---

## 6. Enumerations Reference

### 6.1 Drafting Groups (DRG)

| Key | Display |
|---|---|
| 4DT | 4D-Trajectory |
| AIRPORT | Airport |
| ASM_ATFCM | ASM / ATFCM Integration |
| CRISIS_FAAS | Crisis and FAAS |
| FLOW | Flow |
| IDL | iDL |
| NM_B2B | NM B2B |
| NMUI | NMUI |
| PERF | Performance |
| RRT | Rerouting |
| TCF | TCF |

### 6.2 OR Types

| Key | Meaning |
|---|---|
| ON | Operational Need (high-level objective) |
| OR | Operational Requirement (detailed, traceable) |

### 6.3 ODIP Edition Types

| Key | Meaning |
|---|---|
| ALPHA | Early draft edition |
| BETA | Review edition |
| RELEASE | Official published edition |

### 6.4 Visibility

| Key | Meaning |
|---|---|
| NM | Visible to NM only |
| NETWORK | Visible to the wider network |

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

```javascript
normalizeId('42')          // → 42
normalizeId(neo4jInteger)  // → 42  (calls .toNumber())
normalizeId(null)          // throws Error('Invalid ID format')

lazyEquals('42', 42)       // → true
idsEqual(neo4jId, '42')    // → true
```

`lazyEquals` is intentionally limited to integer/string/Neo4j Integer types — it does not attempt deep object equality.

### 7.2 ExternalIdBuilder

`ExternalIdBuilder` constructs stable, human-readable external IDs for all entity types. External IDs are used by the import pipeline to identify entities across round-trip editing workflows (CREATE / UPDATE / SKIP decisions).

**Format**: `{type}:{type-specific-path}`, where path segments are normalised (lowercase, spaces → underscores).

| Entity type | Format |
|---|---|
| `data`, `service`, `stakeholder` | `{type}:{parent.externalId}/{name}` or `{type}:{name}` |
| `document`, `wave` | `{type}:{name_normalized}` |
| `on`, `or` | `{type}:{drg}/{parent.externalId}/{title}` or `{type}:{drg}/{path}/{title}` |
| `oc` | `oc:{drg}/{title_normalized}` |

For requirements (ON/OR), `parent` and `path` are mutually exclusive — supplying both is a business rule violation.

```javascript
// Examples
ExternalIdBuilder.buildExternalId({ name: 'Flow Management Position' }, 'stakeholder');
// → 'stakeholder:flow_management_position'

ExternalIdBuilder.buildExternalId({ drg: 'IDL', title: 'AIP Dataset Provision', path: ['Data'] }, 'or');
// → 'or:idl/data/aip_dataset_provision'

ExternalIdBuilder.buildExternalId({ drg: 'IDL', title: 'Deploy iDLAD v2' }, 'oc');
// → 'oc:idl/deploy_idlad_v2'
```

### 7.3 Comparator

`Comparator` detects field-level changes between an existing entity (from the database) and an incoming entity (from an import payload). It drives the CREATE / UPDATE / SKIP logic in the standard import workflow.

Comparison is entity-type-aware, handling three categories of fields:

| Category | Comparison strategy |
|---|---|
| Simple fields (`title`, `drg`, `visibility`, …) | Normalised string equality (trim, null → `''`) |
| Rich text fields (Quill delta JSON) | Structural normalisation — empty delta variants (`{}`, `{"ops":[]}`, single `\n`) all resolve to `''`; valid content is re-serialised before comparison |
| Reference arrays (`refinesParents`, `satisfiesRequirements`, …) | Sorted ID comparison (order-insensitive) |
| Annotated reference arrays (`documentReferences`, `impactsData`, …) | Sorted `{id, note}` comparison |

Milestones are excluded from OC comparison — they have their own independent lifecycle.

```javascript
const result = Comparator.compareOperationalRequirement(existing, incoming);
// → { hasChanges: true, changes: [{ field: 'statement', oldValue: '...', newValue: '...' }] }
```

The `changes` array carries the original (un-normalised) values for reference arrays, so the import UI can render titles and codes alongside the diff.

---

*Previous: [Chapter 00 – Overview](./00-Overview.md) | Next: [Chapter 02 – Storage Layer](./02-Storage-Layer.md)*