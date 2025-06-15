# REST API Core Design

## Overview
The ODP REST API follows a consistent manual routes design pattern centered around shared data models and clear separation of concerns. This design ensures maintainability, reduces duplication, and provides consistent patterns across all client-server interactions.

## Core Principles

### 1. Manual Routes Foundation
All API routes are manually implemented using Express.js with direct route definitions. This approach provides complete control, clarity, and maintainability without code generation complexity.

**Architecture Pattern:**
```
HTTP Requests → Express Routes → Service Layer → Store Layer → Neo4j Database
```

### 2. Shared Model Foundation
All API interactions are built around base entity models defined in `@odp/shared`. These models represent the core data structures exchanged between client and server.

**Example:**
```javascript
export const StakeholderCategory = {
  id: '',
  name: '',
  description: ''
};
```

### 3. Request Structure Consistency
API requests extend base models rather than duplicating structure:

```javascript
export const StakeholderCategoryRequests = {
  create: {
    ...StakeholderCategory,
    id: undefined,     // not needed for create
    parentId: null     // additional field for hierarchy
  },
  
  update: {
    ...StakeholderCategory,
    parentId: null     // supports relationship changes
  }
};
```

**Benefits:**
- Automatic consistency with base models
- Single source of truth for entity structure
- Easy maintenance when base models evolve

### 4. Response Simplicity
Responses return base model objects directly - no wrapper structures needed:

- **Single item**: Returns entity object (e.g., `StakeholderCategory`)
- **Collections**: Returns array of entity objects
- **Created items**: Returns complete entity with generated ID

## Route Organization Conventions

### File Structure Pattern
```
src/routes/
├── stakeholder-category.js    # StakeholderCategory CRUD operations
├── regulatory-aspect.js       # RegulatoryAspect CRUD operations
├── service.js                 # Service CRUD operations
├── data.js                    # Data CRUD operations
├── wave.js                    # Wave CRUD operations
└── baseline.js                # Baseline management operations
```

### Route File Template
Each entity follows this consistent structure:

```javascript
import { Router } from 'express';
import EntityService from '../services/EntityService.js';

const router = Router();

// List all entities
router.get('/', async (req, res) => {
  // Implementation
});

// Get entity by ID
router.get('/:id', async (req, res) => {
  // Implementation
});

// Create new entity
router.post('/', async (req, res) => {
  // Implementation
});

// Update entity
router.put('/:id', async (req, res) => {
  // Implementation
});

// Delete entity
router.delete('/:id', async (req, res) => {
  // Implementation
});

export default router;
```

### URL Structure Conventions

#### Standard Resource Patterns
```
GET    /entity-name          # List all
GET    /entity-name/:id      # Get single
POST   /entity-name          # Create new
PUT    /entity-name/:id      # Update existing
DELETE /entity-name/:id      # Delete
```

#### Current Implementation
```
GET    /stakeholder-categories          # List all categories
GET    /stakeholder-categories/:id      # Get category by ID
POST   /stakeholder-categories          # Create new category
PUT    /stakeholder-categories/:id      # Update category
DELETE /stakeholder-categories/:id      # Delete category

GET    /waves, /baselines               # Wave and baseline endpoints
```

#### Future Hierarchical Relationships (Planned)
```
GET    /stakeholder-categories/:id/children    # Get direct children
POST   /stakeholder-categories/:id/parent      # Set parent relationship
DELETE /stakeholder-categories/:id/parent      # Remove parent relationship
```

#### Query Parameters (Planned)
```
GET /stakeholder-categories?parentId=123       # Filter by parent
GET /stakeholder-categories?name=Government     # Search by name
GET /operational-requirements?baseline=456     # Baseline context
```

## HTTP Method Usage

### GET - Retrieval Operations
- **200 OK**: Successful retrieval
- **404 Not Found**: Resource doesn't exist
- **400 Bad Request**: Invalid query parameters

**Implementation Pattern:**
```javascript
router.get('/:id', async (req, res) => {
  try {
    const entity = await EntityService.getEntity(req.params.id);
    if (!entity) {
      return res.status(404).json({ 
        error: { code: 'NOT_FOUND', message: 'Entity not found' } 
      });
    }
    res.json(entity);
  } catch (error) {
    console.error('Error fetching entity:', error);
    res.status(500).json({ 
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } 
    });
  }
});
```

### POST - Creation Operations
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **409 Conflict**: Resource already exists (if applicable)

**Implementation Pattern:**
```javascript
router.post('/', async (req, res) => {
  try {
    const entity = await EntityService.createEntity(req.body);
    res.status(201).json(entity);
  } catch (error) {
    console.error('Error creating entity:', error);
    res.status(500).json({ 
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } 
    });
  }
});
```

### PUT - Update Operations
- **200 OK**: Resource updated successfully
- **404 Not Found**: Resource doesn't exist
- **400 Bad Request**: Invalid request data

**Implementation Pattern:**
```javascript
router.put('/:id', async (req, res) => {
  try {
    const entity = await EntityService.updateEntity(req.params.id, req.body);
    if (!entity) {
      return res.status(404).json({ 
        error: { code: 'NOT_FOUND', message: 'Entity not found' } 
      });
    }
    res.json(entity);
  } catch (error) {
    console.error('Error updating entity:', error);
    res.status(500).json({ 
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } 
    });
  }
});
```

### DELETE - Removal Operations
- **204 No Content**: Resource deleted successfully
- **404 Not Found**: Resource doesn't exist
- **409 Conflict**: Cannot delete due to dependencies

**Implementation Pattern:**
```javascript
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await EntityService.deleteEntity(req.params.id);
    if (!deleted) {
      return res.status(404).json({ 
        error: { code: 'NOT_FOUND', message: 'Entity not found' } 
      });
    }
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting entity:', error);
    if (error.message.includes('dependencies')) {
      res.status(409).json({ 
        error: { code: 'CONFLICT', message: error.message } 
      });
    } else {
      res.status(500).json({ 
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } 
      });
    }
  }
});
```

## Request/Response Examples

### Create StakeholderCategory
**Request:**
```http
POST /stakeholder-categories
Content-Type: application/json

{
  "name": "Government Agencies",
  "description": "Federal and state government entities",
  "parentId": "123"
}
```

**Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "456",
  "name": "Government Agencies", 
  "description": "Federal and state government entities"
}
```

### Update StakeholderCategory
**Request:**
```http
PUT /stakeholder-categories/456
Content-Type: application/json

{
  "id": "456",
  "name": "Government Organizations",
  "description": "Updated description",
  "parentId": "789"
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "456",
  "name": "Government Organizations",
  "description": "Updated description"
}
```

### List StakeholderCategories
**Request:**
```http
GET /stakeholder-categories
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": "456",
    "name": "Government Organizations",
    "description": "Updated description"
  },
  {
    "id": "457",
    "name": "Private Sector",
    "description": "Commercial entities"
  }
]
```

### Error Response Example
**Request:**
```http
GET /stakeholder-categories/999
```

**Response:**
```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "error": {
    "code": "NOT_FOUND",
    "message": "Category not found"
  }
}
```

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
- **CONFLICT**: Operation conflicts with current state (e.g., cannot delete entity with dependencies)
- **UNAUTHORIZED**: Authentication required (future implementation)
- **FORBIDDEN**: Access denied (future implementation)
- **INTERNAL_ERROR**: Server-side error

### Error Handling Implementation
```javascript
// Consistent error handling across all routes
catch (error) {
  console.error('Error in operation:', error);
  
  // Handle specific business rule violations
  if (error.message.includes('dependencies')) {
    return res.status(409).json({ 
      error: { code: 'CONFLICT', message: error.message } 
    });
  }
  
  // Default to internal server error
  res.status(500).json({ 
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } 
  });
}
```

## Service Layer Integration

### Service Method Patterns
Each route delegates business logic to corresponding service methods:

```javascript
// Routes call service methods
const entity = await EntityService.getEntity(id);
const created = await EntityService.createEntity(data);
const updated = await EntityService.updateEntity(id, data);
const deleted = await EntityService.deleteEntity(id);
```

### Transaction Management
Services handle transaction boundaries, not routes:

```javascript
// Service layer manages transactions
async updateEntity(id, data) {
  const tx = createTransaction();
  try {
    // Business logic with transaction
    const result = await store.update(id, data, tx);
    await commitTransaction(tx);
    return result;
  } catch (error) {
    await rollbackTransaction(tx);
    throw error;
  }
}
```

## Authentication & Authorization (Future)

### Planned Implementation
- **Bearer token authentication**: Authorization header pattern
- **Role-based access**: Different permissions for read/write operations
- **Resource-level security**: Access control per entity type

### Future API Header Requirements
```http
Authorization: Bearer <token>
Content-Type: application/json
Accept: application/json
```

## Data Validation

### Server-Side Validation
- **Always validate all incoming data** at service layer
- **Return detailed validation errors** with specific field information
- **Sanitize input data** for security
- **Use shared models** for validation consistency

### Validation Implementation Pattern
```javascript
// Service layer validation
if (!data.name || data.name.trim() === '') {
  throw new Error('Name is required');
}

if (!data.description || data.description.trim() === '') {
  throw new Error('Description is required');
}
```

## Performance Considerations

### Current Implementation
- **Direct route handling**: No middleware overhead
- **Explicit transaction management**: Optimal database usage
- **Connection pooling**: Efficient Neo4j resource utilization

### Future Optimizations (Planned)
- **Pagination for large collections**: Query parameters for page/limit
- **Filtering and sorting**: Database-level filtering for efficiency
- **Response compression**: Gzip compression for JSON responses
- **Caching**: Service-level caching for frequently accessed data

### Pagination Pattern (Future)
```http
GET /stakeholder-categories?page=1&limit=50

Response headers:
X-Total-Count: 1250
X-Page-Count: 25
```

## Integration Points

### Client Applications
- **CLI**: Uses direct HTTP calls with node-fetch to manual routes
- **Web client**: Will use direct fetch calls to manual routes
- **Shared validation**: Uses shared models for consistent validation across clients

### Server Implementation
- **Express routes**: Validate against shared request models
- **Service layer**: Implements business logic with transaction management
- **Store layer**: Maps to/from shared response models
- **Consistent error handling**: Standardized across all endpoints

## Extension Patterns

### Adding New Entities
1. **Add entity model** to `@odp/shared`
2. **Create entity store** extending BaseStore
3. **Create entity service** with business logic
4. **Create entity routes file** following the template pattern
5. **Add routes to server** in main index.js
6. **Add CLI commands** using direct HTTP calls
7. **Test all operations** via CLI and direct API calls

### Route Template for New Entities
```javascript
// Copy stakeholder-category.js as template
// Replace entity names and service imports
// Follow identical error handling patterns
// Maintain consistent HTTP status codes
```

### Relationship Handling (Future)
```javascript
// Additional route patterns for relationships
router.post('/:id/relationships/:type', async (req, res) => {
  // Create relationship
});

router.delete('/:id/relationships/:type/:targetId', async (req, res) => {
  // Delete relationship
});

router.get('/:id/relationships/:type', async (req, res) => {
  // Get related entities
});
```

This manual routes design ensures a maintainable, consistent, and scalable API that grows naturally with the application's needs while keeping client-server contracts clear and implementation patterns simple and reproducible.