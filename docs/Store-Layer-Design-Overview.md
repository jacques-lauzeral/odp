# Storage Layer Design - Overview

## Overview
The ODP Storage Layer provides a clean abstraction over Neo4j graph database operations with support for entity versioning, relationship management, and multi-context querying. The design emphasizes simplicity, consistency, and clear separation of concerns.

## Design Principles

### 1. Simplified API Design
- **Complete payload approach**: All content and relationships provided in single operation
- **Linear versioning**: Sequential version numbers (1, 2, 3...) without sub-versions
- **Multi-context support**: Optional baseline and wave filtering parameters
- **Consistent patterns**: Same approach across all entity types

### 2. Relationship Inheritance
- **Automatic copying**: New versions inherit relationships from previous version by default
- **Override capability**: Provided relationship arrays replace inherited ones
- **Historical preservation**: Previous versions maintain their complete state
- **Version-specific ownership**: Each version owns its relationships and milestones

### 3. Transaction Boundaries
- **Single transaction per user action**: One operation = one transaction
- **Atomic operations**: Content + relationships + milestones in same transaction
- **User context**: All transactions carry user identification for audit trails
- **Explicit management**: Clear commit/rollback patterns

### 4. Clean Separation of Concerns
- **BaseStore**: Common CRUD operations and ID normalization
- **RefinableEntityStore**: Hierarchy management for setup entities
- **VersionedItemStore**: Version lifecycle management with multi-context support
- **Concrete stores**: Entity-specific logic and relationship handling

## Architecture Overview

### Store Hierarchy
```
BaseStore (CRUD operations + normalizeId)
├── RefinableEntityStore (+ REFINES hierarchy)
│   ├── StakeholderCategoryStore
│   ├── DataCategoryStore
│   └── ServiceStore
├── WaveStore (simple entity)
├── DocumentStore (simple entity)
├── BaselineStore (baseline management)
├── ODPEditionStore (edition management + context resolution)
└── VersionedItemStore (+ versioning + multi-context)
    ├── OperationalRequirementStore (+ REFINES + IMPACTS + REFERENCES + DEPENDS_ON)
    └── OperationalChangeStore (+ SATISFIES + SUPERSEDS + REFERENCES + DEPENDS_ON + milestones)
```

### Data Flow Pattern
```
Client Request → Store Method → Neo4j Operations → Transaction Commit → Response
                      ↓
              User Context → Versioning → Relationship Management → Multi-Context Filtering
```

## Entity Categories

### 1. Setup Entities (Non-Versioned)
**Entities**: StakeholderCategory, DataCategory, Service, Wave, Document

**Characteristics**:
- Extend `BaseStore` (Wave, Document) or `RefinableEntityStore` (others)
- Simple CRUD operations with immediate updates
- REFINES hierarchy support (tree structure) for refinable entities
- No versioning complexity
- Current state only (no baseline context needed)

**Storage Pattern**:
```cypher
(Entity:EntityType {id, name, description})
(Child:EntityType)-[:REFINES]->(Parent:EntityType)  // For refinable entities
```

**Note**: RegulatoryAspect has been removed from the model

### 2. Operational Entities (Versioned)
**Entities**: OperationalRequirement, OperationalChange

**Characteristics**:
- Extend `VersionedItemStore`
- Dual-node pattern (Item + ItemVersion)
- Complete payload updates with relationship inheritance
- Optimistic locking via expectedVersionId
- Multi-context operations (baseline + wave filtering)

**Storage Pattern**:
```cypher
(Item:EntityType {id, title, createdAt, createdBy, latest_version})
(Version:EntityTypeVersion {id, version, createdAt, createdBy, ...content})
(Item)-[:LATEST_VERSION]->(Version)
(Version)-[:VERSION_OF]->(Item)
(Version)-[:RELATIONSHIP_TYPE]->(Target)
(Baseline)-[:HAS_ITEMS]->(Version)  // Baseline capture
```

### 3. Management Entities
**Entities**: Baseline, ODPEdition

**Characteristics**:
- Extend `BaseStore`
- Immutable once created (create and read only)
- Baseline: Atomic snapshot creation with direct version capture
- ODPEdition: Context resolution (baseline + wave references)

**Storage Pattern**:
```cypher
(Baseline:Baseline {id, title, createdAt, createdBy})
(Baseline)-[:HAS_ITEMS]->(OperationalRequirementVersion)
(Baseline)-[:HAS_ITEMS]->(OperationalChangeVersion)

(ODPEdition:ODPEdition {id, title, type, createdAt, createdBy})
(ODPEdition)-[:EXPOSES]->(Baseline)
(ODPEdition)-[:STARTS_FROM]->(Wave)
```

## Relationship Management

### Relationship Direction Patterns
**Setup Entity Hierarchies**:
```cypher
(Child:EntityType)-[:REFINES]->(Parent:EntityType)
```

**Operational Entity Cross-References**:
```cypher
(RequirementVersion)-[:REFINES]->(RequirementItem)
(RequirementVersion)-[:IMPACTS]->(SetupEntity)
(RequirementVersion)-[:REFERENCES {note}]->(Document)
(RequirementVersion)-[:DEPENDS_ON]->(RequirementVersion)
(ChangeVersion)-[:SATISFIES]->(RequirementItem)
(ChangeVersion)-[:SUPERSEDS]->(RequirementItem)
(ChangeVersion)-[:REFERENCES {note}]->(Document)
(ChangeVersion)-[:DEPENDS_ON]->(ChangeVersion)
```

**Milestone Ownership**:
```cypher
(Milestone)-[:BELONGS_TO]->(ChangeVersion)
(Milestone)-[:TARGETS]->(Wave)
```

**Management References**:
```cypher
(Baseline)-[:HAS_ITEMS]->(OperationalRequirementVersion)
(Baseline)-[:HAS_ITEMS]->(OperationalChangeVersion)
(ODPEdition)-[:EXPOSES]->(Baseline)
(ODPEdition)-[:STARTS_FROM]->(Wave)
```

### Validation Patterns
- **Entity existence**: All referenced entities validated before relationship creation
- **Self-reference prevention**: Entities cannot refine themselves
- **Tree structure enforcement**: Single parent in REFINES hierarchies
- **Batch validation**: Multiple entity references validated together
- **Relationship properties**: REFERENCES relationship carries optional `note` property (simple text)

## Multi-Context Design

### Context Parameters
All operational entity queries support optional context parameters:
- **baselineId**: Historical context (returns versions captured in baseline)
- **fromWaveId**: Wave filtering (OCs with milestones at/after wave, ORs referenced by filtered OCs)
- **Combined**: Both parameters can be used together for historical + filtered views

### Parameter Resolution
- **ODPEdition**: Route layer resolves `odpEdition` parameter to `baselineId + fromWaveId`
- **Store layer**: Always receives resolved `baseline + fromWave` parameters
- **Service layer**: Uses resolved parameters for consistent query logic

### Query Contexts
1. **Current state**: No context parameters
2. **Historical state**: `baselineId` only
3. **Filtered current**: `fromWaveId` only
4. **Filtered historical**: Both `baselineId` + `fromWaveId`

## Design Benefits

### Simplified Mental Model
- **Two operations only**: create() and update() for versioned entities
- **Complete state**: Each version contains full entity state
- **Predictable behavior**: Consistent patterns across all entities
- **Clear ownership**: Each version owns its complete state

### Historical Integrity
- **Complete preservation**: All versions maintain full state
- **Relationship history**: Version-specific relationship sets
- **Baseline support**: Exact state capture at any point
- **Simplified querying**: Direct baseline-to-version relationships

### Development Efficiency
- **Consistent patterns**: Same approach for all entity types
- **Reduced complexity**: No separate relationship management
- **Clear errors**: Specific error messages for common scenarios
- **Multi-context transparency**: Same API with optional context parameters

### Operational Benefits
- **Atomic operations**: Complete consistency within transactions
- **Conflict resolution**: Clear optimistic locking semantics
- **Audit capability**: Complete change history preservation
- **Deployment planning**: Reliable baseline management and wave-based filtering