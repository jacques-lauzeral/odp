# Chapter 04 – REST API

## 1. Overview

The ODIP REST API is an Express.js application following a manual routes pattern. Each entity type has its own route file; there are no generated or magic routes. The authoritative contract for all endpoints, parameters, request bodies, and response schemas is the OpenAPI specification — see §5.

---

## 2. Router Architecture

Two reusable base routers cover all entity types, plus hand-written routers for the management entities.

### 2.1 SimpleItemRouter

Used by all setup entity routes (`stakeholder-category.js`, `domain.js`, `reference-reference-document.js`, `bandwidth.js`, `wave.js`). Wires standard CRUD to the corresponding `SimpleItemService` / `TreeItemService` methods:

```
GET    /           → service.listItems(userId)
GET    /:id        → service.getItem(id, userId)
POST   /           → service.createItem(body, userId)
PUT    /:id        → service.updateItem(id, body, userId)
DELETE /:id        → service.deleteItem(id, userId)
```

### 2.2 VersionedItemRouter

Used by `operational-requirement.js` and `operational-change.js`. Wires the full versioned entity surface including edition-context list/get, patch, and version history endpoints:

```
GET    /                          → service.getAll(userId, editionId, filters, projection)
GET    /:id                       → service.getById(id, userId, editionId, projection)
GET    /:id/versions              → service.getVersionHistory(id, userId)
GET    /:id/versions/:versionNum  → service.getByIdAndVersion(id, versionNum, userId)
POST   /                          → service.create(body, userId)
PUT    /:id                       → service.update(id, body, expectedVersionId, userId)
PATCH  /:id                       → service.patch(id, body, expectedVersionId, userId)
DELETE /:id                       → service.delete(id, userId)
```

`editionId` is extracted from `req.query.edition` (optional). When absent the service queries the repository (latest versions).

`projection` is extracted from `req.query.projection` via `getProjection(req, allowed)`. Allowed values on `GET /` are `summary` and `standard`; on `GET /:id` they are `standard` and `extended`. Default is `standard` in both cases. An invalid value returns 400.

`operational-change.js` extends this with milestone sub-resource routes:

```
GET    /:id/milestones                      → service.getMilestones(id, userId, editionId)
GET    /:id/milestones/:milestoneKey        → service.getMilestone(id, milestoneKey, userId, editionId)
POST   /:id/milestones                      → service.addMilestone(id, body, expectedVersionId, userId)
PUT    /:id/milestones/:milestoneKey        → service.updateMilestone(id, milestoneKey, body, expectedVersionId, userId)
DELETE /:id/milestones/:milestoneKey        → service.deleteMilestone(id, milestoneKey, expectedVersionId, userId)
```

### 2.3 Management Entity Routers

`baseline.js` and `odp-edition.js` are hand-written. They expose create and read operations only. Any `PUT` or `DELETE` returns `405 METHOD_NOT_ALLOWED`. `odp-edition.js` additionally handles the AsciiDoc ZIP export endpoint.

---

## 3. Edition Context Resolution

The `edition` query parameter is passed directly to the service layer — route handlers do not resolve it. When present on a list or get request, the route extracts `req.query.edition` and passes it as `editionId` to `service.getAll()` or `service.getById()`. The service resolves the edition context internally via `odpEditionStore().resolveContext()`.

Route handlers have no knowledge of baselines, waves, or maturity gates — those are internal implementation details of the service and store layers.

---

## 4. Error Mapping

Route handlers catch errors thrown by services and map them to HTTP responses:

| Condition | HTTP status | Error code |
|---|---|---|
| Resource not found (service returns `null`) | 404 | `NOT_FOUND` |
| Validation error (service throws) | 400 | `VALIDATION_ERROR` |
| Version conflict (store optimistic lock) | 409 | `VERSION_CONFLICT` |
| Delete blocked by dependencies | 409 | `CONFLICT` |
| PUT/DELETE on immutable entity | 405 | `METHOD_NOT_ALLOWED` |
| Unhandled / unexpected error | 500 | `INTERNAL_ERROR` |

All error responses use the standard envelope:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

---

## 5. OpenAPI Specification

The full API contract is defined across a set of modular OpenAPI 3.0 files:

| File | Coverage |
|---|---|
| `openapi.yml` | Entry point, aggregates all modules |
| `openapi-base.yml` | Shared schemas (models, enums, common parameters) |
| `openapi-setup.yml` | Setup entities (stakeholder categories, domains, reference documents, bandwidths, waves) |
| `openapi-operational.yml` | Operational requirements and changes |
| `openapi-operational-milestones.yml` | Milestone sub-resource endpoints |
| `openapi-baseline.yml` | Baselines |
| `openapi-odp.yml` | ODIP editions (`Edition`, `EditionRequest` schemas) |
| `openapi-import.yml` | Import endpoints |
| `openapi-docx.yml` | DOCX export endpoint |
| `openapi-publication.yml` | Publication endpoint |

Refer to these files for all endpoint signatures, query parameters, request/response schemas, and status code contracts.

---

[← 03 Service Layer](03-Service-Layer.md) | [05 Import Pipeline →](05-Import-Pipeline.md)