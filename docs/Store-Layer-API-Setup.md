# Store Layer API - Setup

## Overview
Setup entity stores provide CRUD operations for system configuration entities. These are non-versioned entities that support hierarchical organization through REFINES relationships (except Waves). All setup entities extend either BaseStore or RefinableEntityStore from the Core APIs.

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

## RegulatoryAspectStore
**Inheritance**: `RefinableEntityStore → BaseStore`  
**Entity Model**: `{id: number, name: string, description: string}`  
**Relationships**: REFINES hierarchy (tree structure)

### Available Methods
All BaseStore + RefinableEntityStore methods

### Usage Example
```javascript
const tx = createTransaction('user123');
try {
  const compliance = await regulatoryAspectStore().create({
    name: "Data Protection",
    description: "Data protection and privacy regulations"
  }, tx);
  
  const gdpr = await regulatoryAspectStore().create({
    name: "GDPR", 
    description: "General Data Protection Regulation"
  }, tx);
  
  await regulatoryAspectStore().createRefinesRelation(gdpr.id, compliance.id, tx);
  
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

    // Waves.name is automatically derived as "2025.1"
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