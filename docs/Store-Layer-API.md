# Store Layer API Documentation

## Overview
Complete API reference for the ODP Store Layer providing CRUD operations, versioning, relationship management, baseline operations, and wave filtering over Neo4j.

## API Reference

### [Core APIs](Store-Layer-API-Core.md)
Foundation APIs: initialization, transactions, base CRUD operations, hierarchy management

### [Setup Entity APIs](Store-Layer-API-Setup.md)
Simple entities: StakeholderCategories, RegulatoryAspects, DataCategories, Services, Waves

### [Operational Entity APIs](Store-Layer-API-Operational.md)
Versioned entities: OperationalRequirement, OperationalChange with multi-context support

### [Management Entity APIs](Store-Layer-API-Management.md)
Deployment planning: Baseline, ODPEdition with wave filtering

## Quick Reference

### Entity Categories
- **Setup**: StakeholderCategories, RegulatoryAspects, DataCategories, Services, Waves
- **Operational**: OperationalRequirement, OperationalChange (versioned)
- **Management**: Baseline, ODPEdition (immutable)

### Store Hierarchy
```
BaseStore → RefinableEntityStore → Setup entities
BaseStore → Waves, Baseline, ODPEdition  
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