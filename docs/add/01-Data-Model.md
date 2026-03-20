# Chapter 01 – Data Model

## 1. Overview

The ODIP data model is organised into three categories of entities:

- **Setup Entities** — reference data configured once and referenced throughout (reference documents, stakeholder categories, domains, bandwidths, waves)
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
    ├── maturity-levels.js    # Maturity level enum (DRAFT, ADVANCED, MATURE)
    ├── milestone-events.js   # Milestone event types
    ├── odp-edition-types.js  # Edition type enum (ALPHA, BETA, RELEASE)
    ├── odp-elements.js       # Operational and management entity models
    ├── or-types.js           # OR type enum (ON, OR)
    ├── setup-elements.js     # Setup entity models
    └── utils.js              # ID normalisation, lazy comparison
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

Setup entities are non-versioned reference data. They support hierarchical organisation via the REFINES relationship where noted.

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

#### Domain

Represents a business domain used to characterise the impact of ORs (e.g. "Flight Planning", "Flow Management").

> **Terminology note**: the term *domain* has two distinct uses in the ODIP model. In this context it refers to the **Domain setup entity** — a structured list of impact areas that can be attached to ORs. It is unrelated to the concept of *competency domain* or *DrG scope*, which is expressed through the `DraftingGroup` enum (see §6.1).

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `name` | string | Short name, e.g. "Flight Planning" |
| `description` | rich text | |
| `contact` | rich text | NM contact point for this domain; optional |

Supports REFINES hierarchy (max two levels, top-level mandatory).

#### Bandwidth

Represents yearly development effort (in MW) scoped to a Drafting Group, for NM internal planning. Not visible to external stakeholders.

| Field | Type | Notes |
|---|---|---|
| `id` | integer | Neo4j internal ID |
| `year` | integer | The effort year |
| `planned` | integer | Planned bandwidth in MW; optional |
| `waveId` | reference | Wave reference; optional — omitted means yearly total |
| `scope` | DraftingGroup key | DrG scope (e.g. `IDL`, `NM_B2B`); optional — omitted means global scope |

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

| Field | Type | ON/OR | Cardinality | Notes |
|---|---|---|---|---|
| `version` | integer | both | mandatory | Sequential (1, 2, 3…) |
| `type` | enum | both | mandatory | ON \| OR |
| `drg` | enum | both | mandatory | Drafting Group (see §6.1) |
| `maturity` | enum | both | mandatory | DRAFT \| ADVANCED \| MATURE |
| `statement` | rich text | both | mandatory | Core requirement statement |
| `rationale` | rich text | both | mandatory | Justification |
| `flows` | rich text | both | optional | Flow descriptions and flow examples |
| `privateNotes` | rich text | both | optional | Internal notes, not shared with other organisations |
| `additionalDocumentation` | attachments | both | optional | Supporting documents |
| `path` | string[] | both | optional | Folder hierarchy for navigation |
| `tentative` | integer[] | **ON only** | mandatory (root ON), optional (child ON) | Tentative implementation time: `[year]` or `[start, end]` where start ≤ end |
| `nfrs` | rich text | **OR only** | optional | Non-functional requirements from business perspective |

**Version relationship fields**:

| Relationship | ON/OR | Cardinality | Notes |
|---|---|---|---|
| `refines` | both | optional | Parent Requirement of same type |
| `strategicDocuments` | **ON only** | mandatory (root ON), optional otherwise | Annotated list of ReferenceDocuments |
| `implementedONs` | **OR only** | mandatory (root OR), optional otherwise | List of implemented ONs |
| `impactedStakeholders` | **OR only** | mandatory (root OR), optional otherwise | List of StakeholderCategories |
| `impactedDomains` | **OR only** | mandatory (root OR), optional otherwise | List of Domains |
| `dependencies` | **OR only** | optional | List of ORs that must be implemented before this OR |

#### Operational Change (OC)

OCs describe and plan the deployment of OR evolutions. They do not group ONs directly — ONs are progressively implemented through the ORs included in one or more OCs.

**Item node fields**: same pattern as Requirement (id, title, createdAt, createdBy, latest_version).

**Version node fields**:

| Field | Type | Cardinality | Notes |
|---|---|---|---|
| `version` | integer | mandatory | Sequential |
| `drg` | enum | mandatory | Drafting Group |
| `maturity` | enum | mandatory | DRAFT \| ADVANCED \| MATURE |
| `purpose` | rich text | mandatory | Why the OC is needed |
| `initialState` | rich text | mandatory | Current operational situation before deployment |
| `finalState` | rich text | mandatory | Target operational situation after deployment |
| `details` | rich text | mandatory | Additional deployment detail |
| `cost` | integer | optional | Estimated development cost in MW |
| `privateNotes` | rich text | optional | Internal notes |
| `additionalDocumentation` | attachments | optional | Supporting documents |
| `path` | string[] | optional | Folder hierarchy |

**Version relationship fields**:

| Relationship | Cardinality | Notes |
|---|---|---|
| `implementedORs` | optional | ORs satisfied by this OC |
| `decommissionedORs` | optional | ORs fully decommissioned by this OC |
| `dependencies` | optional | OCs that must be deployed before this OC |
| `milestones` | optional | Deployment milestones (see §4.4) |
| `orCosts` | optional | Per-OR cost breakdown (see ORCost below) |

**ORCost**: Represents the cost of an OR in the context of this OC.

| Field | Type | Notes |
|---|---|---|
| `or` | reference | The OR reference |
| `cost` | integer | Cost in MW |

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

Used by hierarchical setup entities (StakeholderCategory, Domain, ReferenceDocument) and by Requirements to express parent-child structuring.

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
| `IMPACTS_DOMAIN` | ORVersion | Domain | |
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
(ODIPEdition)-[:EXPOSES]->(Baseline)
(ODIPEdition)-[:STARTS_FROM]->(Wave)
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
| `fromWaveId` | Filters OCs to those with milestones at or after the given wave |

### 5.3 Optimistic Locking

Clients must supply `expectedVersionId` on every update. If another user has updated the entity in the meantime, the server rejects the update with a `VERSION_CONFLICT` error, forcing the client to refresh before retrying.

### 5.4 Baseline Snapshots

At baseline creation, the system captures `HAS_ITEMS` relationships pointing to the exact `ItemVersion` nodes that were latest at that moment. Historical navigation uses these explicit pointers rather than re-deriving state, ensuring accurate reconstruction of the repository at any past baseline.

---

## 6. Enumerations Reference

### 6.1 Drafting Groups (DRG)

The `DraftingGroup` enum identifies the competency domain or drafting group responsible for a requirement, change, or bandwidth scope.

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

### 6.3 Maturity Levels

| Key | Meaning |
|---|---|
| DRAFT | Under work; not ready for prioritisation or ODIP edition display |
| ADVANCED | Under work but good enough for prioritisation and ODIP edition display |
| MATURE | Considered finalised for prioritisation and ODIP edition display |

### 6.4 ODIP Edition Types

| Key | Meaning |
|---|---|
| ALPHA | Alpha edition |
| BETA | Beta edition |
| RELEASE | Official release edition |

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

`Comparator` (in `shared/src/model/`) compares two versions of the same entity to detect meaningful changes. It drives the CREATE / UPDATE / SKIP logic in the standard import workflow.

Comparison is entity-type-aware, handling three categories of fields:

| Category | Comparison strategy |
|---|---|
| Simple fields (`title`, `drg`, `maturity`, …) | Normalised string equality (trim, null → `''`) |
| Rich text fields (Quill delta JSON) | Structural normalisation — empty delta variants (`{}`, `{"ops":[]}`, single `\n`) all resolve to `''`; valid content is re-serialised before comparison |
| Reference arrays (`refinesParents`, `implementedORs`, …) | Sorted ID comparison (order-insensitive) |
| Annotated reference arrays (`strategicDocuments`, …) | Sorted `{id, note}` comparison |

Milestones are excluded from OC comparison — they have their own independent lifecycle.

```javascript
const result = Comparator.compareOperationalRequirement(existing, incoming);
// → { hasChanges: true, changes: [{ field: 'statement', oldValue: '...', newValue: '...' }] }
```

The `changes` array carries the original (un-normalised) values for reference arrays, so the import UI can render titles and codes alongside the diff.

---

*Previous: [Chapter 00 – Overview](./00-Overview.md) | Next: [Chapter 02 – Storage Layer](./02-Storage-Layer.md)*