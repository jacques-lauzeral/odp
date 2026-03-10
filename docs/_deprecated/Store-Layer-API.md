# Store Layer API Documentation

## Overview
Complete API reference for the ODP Store Layer providing CRUD operations, versioning, relationship management, baseline operations, and wave filtering over Neo4j.

## API Reference

### [Core APIs](Store-Layer-API-Core.md)
Foundation APIs: initialization, transactions, base CRUD operations, hierarchy management

### [Setup Entity APIs](Store-Layer-API-Setup.md)
Simple entities: StakeholderCategory, DataCategory, Service, Wave, Document

### [Operational Entity APIs](Store-Layer-API-Operational.md)
Versioned entities: OperationalRequirement, OperationalChange with multi-context support

### [Management Entity APIs](Store-Layer-API-Management.md)
Deployment planning: Baseline, ODPEdition with wave filtering

## Quick Reference

### Entity Categories
- **Setup**: StakeholderCategory, DataCategory, Service, Wave, Document
- **Operational**: OperationalRequirement, OperationalChange (versioned)
- **Management**: Baseline, ODPEdition (immutable)

### Store Hierarchy
```
BaseStore → RefinableEntityStore → Setup entities (with hierarchy)
BaseStore → Wave, Document (simple entities)
BaseStore → Baseline, ODPEdition (management entities)
BaseStore → VersionedItemStore → Operational entities
```

### Transaction Pattern
```javascript
const tx = createTransaction(userId);
try {
  // operations
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## Model Changes

### Removed Entities
- **RegulatoryAspect**: Deprecated and removed from the model

### New Entities
- **Document**: Simple reference entity for ConOPS, regulations, strategic plans, etc.
    - Properties: name (mandatory), version (optional), description (optional), url (optional)
    - No hierarchy support
    - Referenced directly via REFERENCES relationships from operational entity versions

### Updated Relationships
- **Document References**: OperationalRequirement and OperationalChange versions can reference Documents via direct REFERENCES relationships with optional `note` property (e.g., "Section 3.2")
- **Version Dependencies**: OperationalRequirement and OperationalChange versions can depend on other versions via DEPENDS_ON relationships (version-to-version dependencies)