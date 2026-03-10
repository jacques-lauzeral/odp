# Store Layer API - Setup

## Overview
Setup entity stores provide CRUD operations for system configuration entities. These are non-versioned entities that support hierarchical organization through REFINES relationships (except Wave and Document). All setup entities extend either BaseStore or RefinableEntityStore from the Core APIs.

## StakeholderCategoryStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

### Available Methods
All BaseStore + RefinableEntityStore methods

### Usage Example
```javascript
const tx = createTransaction('user123');
try {
  // Create root category
  const government = await stakeholderCategoryStore().create({
    name: "Government",
    description: "Government entities"
  }, tx);
  
  // Create child category  
  const federal = await stakeholderCategoryStore().create({
    name: "Federal Agencies",
    description: "Federal government entities"
  }, tx);
  
  // Establish hierarchy
  await stakeholderCategoryStore().createRefinesRelation(federal.id, government.id, tx);
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## DataCategoryStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

### Available Methods
All BaseStore + RefinableEntityStore methods

### Usage Example
```javascript
const tx = createTransaction('user123');
try {
  const personalData = await dataCategoryStore().create({
    name: "Personal Data",
    description: "Data relating to identified individuals"
  }, tx);
  
  const biometricData = await dataCategoryStore().create({
    name: "Biometric Data",
    description: "Unique physical or behavioral characteristics"
  }, tx);
  
  await dataCategoryStore().createRefinesRelation(biometricData.id, personalData.id, tx);
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## ServiceStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

### Available Methods
All BaseStore + RefinableEntityStore methods

### Usage Example
```javascript
const tx = createTransaction('user123');
try {
  const authentication = await serviceStore().create({
    name: "Authentication Services",
    description: "User authentication and authorization"
  }, tx);
  
  const oauth = await serviceStore().create({
    name: "OAuth 2.0",
    description: "OAuth 2.0 authorization framework"
  }, tx);
  
  await serviceStore().createRefinesRelation(oauth.id, authentication.id, tx);
  
  await commitTransaction(tx);
} catch (error) {
  await rollbackTransaction(tx);
  throw error;
}
```

## WaveStore
**Inheritance**: `BaseStore`  
**Entity Model**: `{id: number, year: number, quarter: number, date: string, name: string}`  
**Relationships**: None (standalone entity)

### Available Methods
All BaseStore methods only (no hierarchy support)

### Business Rules
- **Year**: 4-digit integer (YYYY)
- **Quarter**: Integer 1-4
- **Date**: ISO date string (YYYY-MM-DD)
- **Name**: Derived as "year.quarter" (e.g., "2025.1")

### Usage Example
```javascript
const tx = createTransaction('user123');
try {
    const wave = await waveStore().create({
        year: 2025,
        quarter: 1,
        date: "2025-03-31"
    }, tx);

    // Wave.name is automatically derived as "2025.1"
    console.log(wave.name); // "2025.1"

    // Query waves by year
    const allWaves = await waveStore().findAll(tx);
    const q1Waves = allWaves.filter(w => w.quarter === 1);

    await commitTransaction(tx);
} catch (error) {
    await rollbackTransaction(tx);
    throw error;
}
```

## DocumentStore
**Inheritance**: `BaseStore`  
**Entity Model**: `{id: number, name: string, version: string, description: string, url: string}`  
**Relationships**: None (standalone entity - referenced via REFERENCES relationships from operational entity versions)

### Available Methods
All BaseStore methods only (no hierarchy support)

### Business Rules
- **Name**: Mandatory document name
- **Version**: Optional version string
- **Description**: Optional description text
- **URL**: Optional URL link to external document

### Usage Example
```javascript
const tx = createTransaction('user123');
try {
    // Create document reference
    const conops = await documentStore().create({
        name: "Network Manager ConOPS",
        version: "2.0",
        description: "Concept of Operations for Network Manager",
        url: "https://docs.example.com/conops-v2.pdf"
    }, tx);

    // Create document without URL (internal reference)
    const regulation = await documentStore().create({
        name: "EU Regulation 2025/123",
        version: null,
        description: "European aviation safety regulation",
        url: null
    }, tx);

    // Query all documents
    const allDocs = await documentStore().findAll(tx);

    await commitTransaction(tx);
} catch (error) {
    await rollbackTransaction(tx);
    throw error;
}
```

### Document Reference Pattern
Documents are referenced by OperationalRequirement and OperationalChange versions through direct REFERENCES relationships:

```cypher
(OperationalRequirementVersion)-[:REFERENCES {note: "Section 3.2"}]->(Document)
(OperationalChangeVersion)-[:REFERENCES {note: "Annex A"}]->(Document)
```

The `note` property on the relationship provides brief context (e.g., section numbers, brief annotations) and is simple text, not rich text.