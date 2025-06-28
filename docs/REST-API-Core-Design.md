# REST API Core Design

## Overview
The ODP REST API follows a consistent manual routes design pattern centered around shared data models and clear separation of concerns. This design ensures maintainability, reduces duplication, and provides consistent patterns across all client-server interactions.

## Core Principles

### 1. Manual Routes Foundation
All API routes are manually implemented using Express.js with direct route definitions.

**Architecture Pattern:**
```
HTTP Requests → Express Routes → Services Layer → Store Layer → Neo4j Database
```

### 2. Shared Model Foundation
All API interactions are built around base entity models defined in `@odp/shared`:

```javascript
export const StakeholderCategories = {
  id: '',
  name: '',
  description: ''
};

export const StakeholderCategoryRequests = {
  create: {
    ...StakeholderCategories,
    id: undefined,     // not needed for create
    parentId: null     // additional field for hierarchy
  }
};
```

### 3. Response Simplicity
Responses return base model objects directly - no wrapper structures needed.

## Route Organization

### File Structure Pattern
```
src/routes/
├── stakeholder-categories.js      # Setup entities
├── regulatory-aspects.js
├── data-categories.js
├── services.js
├── waves.js
├── operational-requirement.js   # Versioned entities
├── operational-change.js
├── baseline.js                  # Management entities
├── odp-edition.js
└── versioned-item-router.js     # Shared router base
```

### Router Types

**Simple Item Router** (Setup entities):
```javascript
import { Router } from 'express';
import StakeholderCategoryService from '../services/StakeholderCategoryService.js';

const router = Router();
// Standard CRUD: GET /, GET /:id, POST /, PUT /:id, DELETE /:id
```

**Versioned Item Router** (Operational entities):
```javascript
import { VersionedItemRouter } from './versioned-item-router.js';
import OperationalRequirementService from '../services/OperationalRequirementService.js';

const versionedRouter = new VersionedItemRouter(
  OperationalRequirementService, 
  'operational-requirement', 
  'Operational Requirement'
);
const router = versionedRouter.getRouter();
```

**Immutable Entity Router** (Management entities):
```javascript
// Create/read only operations for baselines and ODP editions
router.put('/:id', (req, res) => {
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Entity is immutable' }
  });
});
```

## URL Structure & Query Parameters

### Standard Resource Patterns
```
GET    /entity-name              # List all
GET    /entity-name/:id          # Get single
POST   /entity-name              # Create new
PUT    /entity-name/:id          # Update existing
DELETE /entity-name/:id          # Delete
```

### Multi-Context Parameters (Operational entities)
```
GET /operational-requirements?baseline=123           # Historical context
GET /operational-requirements?fromWave=456          # Waves filtering  
GET /operational-requirements?baseline=123&fromWave=456  # Combined
```

### Versioning Endpoints
```
GET /operational-requirements/:id/versions          # Version history
GET /operational-requirements/:id/versions/2        # Specific version
```

### Sub-resource Patterns
```
GET /operational-changes/:id/milestones             # List milestones
POST /operational-changes/:id/milestones            # Add milestone
PUT /operational-changes/:id/milestones/:milestoneId # Update milestone
```

## HTTP Method Usage

### GET - Retrieval Operations
- **200 OK**: Successful retrieval
- **404 Not Found**: Resource doesn't exist
- **400 Bad Request**: Invalid parameters

### POST - Creation Operations
- **201 Created**: Resource created successfully
- **400 Bad Request**: Validation error

### PUT - Update Operations
- **200 OK**: Resource updated successfully
- **404 Not Found**: Resource doesn't exist
- **409 Conflict**: Version conflict (versioned entities)

### DELETE - Removal Operations
- **204 No Content**: Resource deleted successfully
- **404 Not Found**: Resource doesn't exist
- **409 Conflict**: Cannot delete due to dependencies

## Error Response Format

### Standard Error Structure
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Common Error Codes
- **VALIDATION_ERROR**: Request data validation failed
- **NOT_FOUND**: Requested resource doesn't exist
- **VERSION_CONFLICT**: Optimistic locking failure
- **CONFLICT**: Operation conflicts with current state
- **METHOD_NOT_ALLOWED**: Operation not supported (immutable entities)
- **INTERNAL_ERROR**: Server-side error

## Services Layer Integration

### Services Method Patterns
Routes delegate to service methods with consistent signatures:

**Setup Entities:**
```javascript
const entity = await EntityService.getEntity(id, userId);
const created = await EntityService.createEntity(data, userId);
```

**Versioned Entities:**
```javascript
const entity = await EntityService.getById(itemId, userId, baselineId, fromWaveId);
const updated = await EntityService.update(itemId, data, expectedVersionId, userId);
```

**Management Entities:**
```javascript
const baseline = await BaselineService.createBaseline(data, userId);
const edition = await ODPEditionService.createODPEdition(data, userId);
```

### Transaction Management
Services handle transaction boundaries, not routes:

```javascript
async updateEntity(id, data, userId) {
  const tx = createTransaction(userId);
  try {
    const result = await store.update(id, data, tx);
    await commitTransaction(tx);
    return result;
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

## Versioned Entity Patterns

### Optimistic Locking
Versioned entities require `expectedVersionId` for updates:

```javascript
// Client must provide current version ID
PUT /operational-requirements/123
{
  "expectedVersionId": "456",
  "title": "Updated title",
  "statement": "Updated statement"
}
```

### Version Navigation
```javascript
// Latest version (default)
GET /operational-requirements/123

// Specific version
GET /operational-requirements/123/versions/2

// Version history
GET /operational-requirements/123/versions
```

### Baseline and Waves Filtering
```javascript
// Historical state at baseline time
GET /operational-requirements?baseline=123

// Current state filtered by wave
GET /operational-requirements?fromWave=456

// Historical state with wave filtering
GET /operational-requirements?baseline=123&fromWave=456
```

## Request/Response Examples

### Create Entity
```http
POST /stakeholder-categories
Content-Type: application/json

{
  "name": "Government Agencies",
  "description": "Federal and state government entities",
  "parentId": "123"
}

Response: 201 Created
{
  "id": "456",
  "name": "Government Agencies", 
  "description": "Federal and state government entities"
}
```

### Update Versioned Entity
```http
PUT /operational-requirements/123
Content-Type: application/json

{
  "expectedVersionId": "456",
  "title": "Updated Title",
  "statement": "Updated statement",
  "refinesParents": [789]
}

Response: 200 OK (new version created)
{
  "itemId": "123",
  "versionId": "457",
  "version": 3,
  "title": "Updated Title",
  "statement": "Updated statement"
}
```

### Error Response
```http
GET /stakeholder-categories/999

Response: 404 Not Found
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Stakeholder category not found"
  }
}
```

## Extension Patterns

### Adding New Setup Entities
1. Create entity model in `@odp/shared`
2. Create store extending `RefinableEntityStore`
3. Create service extending `TreeItemService`
4. Create routes using standard CRUD pattern
5. Add CLI commands

### Adding New Versioned Entities
1. Create entity model in `@odp/shared`
2. Create store extending `VersionedItemStore`
3. Create service extending `VersionedItemService`
4. Create routes using `VersionedItemRouter`
5. Add CLI commands with baseline support

### Adding New Management Entities
1. Create entity model in `@odp/shared`
2. Create store extending `BaseStore`
3. Create service following immutable pattern
4. Create routes with create/read only operations
5. Add CLI commands

This manual routes design ensures a maintainable, consistent, and scalable API that grows naturally with the application's needs while keeping client-server contracts clear and implementation patterns simple and reproducible.