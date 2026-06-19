# Chapter 04 – REST API

## 1. Overview

The ODIP REST API is an Express.js application following a manual routes pattern. Each entity type has its own route file; there are no generated or magic routes. The authoritative contract for all endpoints, parameters, request bodies, and response schemas is the OpenAPI specification — see §5.

---

## 2. Router Architecture

Two reusable base routers cover all entity types, plus hand-written routers for the management entities, quality, change sets, and the audit log.

### 2.1 SimpleItemRouter

Used by all setup entity routes (`stakeholder-category.js`, `reference-document.js`, `bandwidth.js`, `wave.js`). Wires standard CRUD to the corresponding `SimpleItemService` / `TreeItemService` methods:

```
GET    /           → service.listItems(user)
GET    /:id        → service.getItem(id, user)
POST   /           → service.createItem(body, user)
PUT    /:id        → service.updateItem(id, body, user)
DELETE /:id        → service.deleteItem(id, user)
```

### 2.2 VersionedItemRouter

Used by `operational-requirement.js` and `operational-change.js`. Wires the full versioned entity surface including edition-context list/get, patch, and specific-version retrieval:

```
GET    /                          → service.getAll(user, editionId, filters, projection, lifecycleFace)
GET    /:id                       → service.getById(id, user, editionId, projection, lifecycleFace)
GET    /:id/versions/:versionNum  → service.getByIdAndVersion(id, versionNum, user)
GET    /:id/inbound-references    → service.getInboundReferences(id, user)
POST   /                          → service.create(body, user)
POST   /:id/delete                → service.softDelete(id, changeSetCommit, user)
POST   /:id/restore               → service.restore(id, changeSetCommit, user)
PUT    /:id                       → service.update(id, body, expectedVersionId, user)
PATCH  /:id                       → service.patch(id, body, expectedVersionId, user)
DELETE /:id                       → service.delete(id, user)
```

There is **no version-history route** (Phase A — audit foundation). The former `GET /:id/versions` (list) is removed; an item's History timeline is built by the client from the audit log (`GET /audit-events?targetId=<id>`, §2.8). `GET /:id/versions/:versionNum` is retained — it returns the content of one specific version, not the audit trail.

`editionId` is extracted from `req.query.edition` (optional). When absent the service queries the repository (latest versions).

`lifecycleFace` is extracted from `req.query.lifecycleFace` (optional, default `active`), passed as the trailing argument to `getAll` / `getById`. It is the dataset selector for the live dataset — the peer of `editionId` and mutually exclusive with it. The route forwards both without resolving the exclusivity; the service's `_assertFaceEditionExclusive` rejects a non-`active` face combined with `edition` (a `Validation failed:` message → 400, mapped on the read routes by the prefix arm). Values: `active` / `released` / `decommissioned` / `deleted`.

`projection` is extracted from `req.query.projection` via `getProjection(req, allowed)`. Allowed values on `GET /` are `summary` and `standard`; on `GET /:id` they are `standard` and `extended`. Default is `standard` in both cases. An invalid value returns 400.

Content filters are assembled per-entity in `getContentFilters(req)` and passed to `getAll` (the full set is enumerated in the OpenAPI module, §3). One nuance on the OR route: impacted- and acting-stakeholder filtering are distinct query parameters (`impactedStakeholder` / `actingStakeholder`), and the impacted filter carries a boolean `impactedStakeholderExactMatch` (default `false` — business match, descendant-inclusive; `true` restricts to the selected category). The route forwards all three verbatim; the service expands the impacted filter (descendant set unless exact) and consumes the match-mode key, so it never reaches the store (§3 of the service chapter).

**Lifecycle transitions (Phase B — deletion).** `POST /:id/delete` and `POST /:id/restore` are soft delete and restore — the `LATEST_VERSION`↔`DELETED_VERSION` edge moves, not hard destruction. They carry no entity body; like `DELETE /:id/milestones/:milestoneKey`, the route reads `changeSetId`/`note` from `req.body` and passes an explicit `changeSetCommit` to the service. Both return the updated entity (`200`). The service guards them: `softDelete` refuses a `released` item or one with blocking live inbound references; `restore` refuses an item not in the Deleted state (see §4 for the status mapping). `DELETE /:id` is unchanged — it remains the whole-item hard destroy (all versions); soft delete deliberately takes the `POST /:id/delete` sub-path rather than displacing it (the hard/soft verb assignment is revisited when DEL-04 lands).

`GET /:id/inbound-references` is the preemptive where-used read — the live O\* items referencing this one, as a flat `OperationalEntityReference[]`. It does **not** decide deletability; the client combines it with the item's `lifecycleStatus`. Anonymous access is allowed, consistent with the other reads.

These lifecycle routes are defined once on `VersionedItemRouter`, so they apply to `operational-requirement.js` and `operational-change.js` only. `chapter.js` is a standalone router (§2.3) and exposes none of them — chapters have no lifecycle (the service overrides `softDelete` / `restore` / `getInboundReferences` to throw).

`operational-change.js` extends this with milestone sub-resource routes:

```
GET    /:id/milestones                      → service.getMilestones(id, user, editionId)
GET    /:id/milestones/:milestoneKey        → service.getMilestone(id, milestoneKey, user, editionId)
POST   /:id/milestones                      → service.addMilestone(id, body, expectedVersionId, user)
PUT    /:id/milestones/:milestoneKey        → service.updateMilestone(id, milestoneKey, body, expectedVersionId, user)
DELETE /:id/milestones/:milestoneKey        → service.deleteMilestone(id, milestoneKey, expectedVersionId, user, changeSetCommit)
```

**Change-set linkage (LCM).** Every versioned write commits under a change set. Because the service splits the commit out of the request message, the generic create/update/patch routes and the milestone POST/PUT routes stay pass-through — `changeSetId`/`note` simply ride in `req.body` and the service extracts them. The one exception is `DELETE /:id/milestones/:milestoneKey`: it carries no entity body, so the route reads `changeSetId`/`note` from the request body (alongside `expectedVersionId`) and passes an explicit `changeSetCommit` to `deleteMilestone`.

### 2.3 ChapterRouter

`chapter.js` is a hand-written router (not a `VersionedItemRouter` subclass — chapters have no `create`/`delete` and `getAll` takes no edition context or content filters):

```
GET    /                                        → service.getAll(user)
GET    /:id                                     → service.getById(id, user, editionId?)
GET    /:id/versions/:versionNum                → service.getByIdAndVersion(id, versionNum, user)
PUT    /:id                                     → service.update(id, body, expectedVersionId, user)
PATCH  /:id                                     → service.patch(id, body, expectedVersionId, user)
POST   /:id/resolve-generated-content          → service.resolveGeneratedContent(id, editionId?, user)
```

All GET routes allow anonymous access (`getUserOptional`). PUT, PATCH, and POST require `x-user-id`. As with the operational routers, there is no `GET /:id/versions` history route — History is built client-side from `GET /audit-events?targetId=<id>` (§2.8); `GET /:id/versions/:versionNum` (specific-version content) is retained.

`POST /:id/resolve-generated-content` — elaborate mode preview; resolves all generated content declared for the chapter in a single call. Returns `{ blocks: { [blockId]: node[] }, strings: { [key]: string } }`. Block and string resolution run in parallel. Ephemeral — result is not persisted. Accepts optional `?edition=` query parameter for edition-scoped resolution.

### 2.4 Management Entity Routers

`baseline.js` and `odp-edition.js` are hand-written. They expose create and read operations only. Any `PUT` or `DELETE` returns `405 METHOD_NOT_ALLOWED`. `odp-edition.js` additionally handles the AsciiDoc ZIP export endpoint and the `POST /:id/publish` endpoint, which accepts an optional JSON request body (`PublishOptions`) — absent or empty body defaults to `{ pdf: { flat: true } }`.

### 2.5 QualityRouter

`quality.js` is a hand-written router. A single endpoint — no base router applies:

```
GET /quality/checks[?domain=<keys>][&edition=<id>]  → qualityService.runChecks(domains, editionId, user)
```

`domain` is an optional comma-separated list of domain keys validated against `domains.json` before the service call. `edition` is an optional edition ID — when present the route passes it directly to `QualityService`, which resolves it to `{baselineId, editionId}` internally via `odpEditionStore().resolveContext()`. When absent, checks run against the live dataset (latest versions).

The route requires `x-user-id` — quality checks are not available to anonymous users.

### 2.6 ChangeSetRouter

`change-set.js` is a hand-written router (standalone — change sets are non-versioned and need custom lifecycle/member routes):

```
GET    /                       → service.listItems | findByStatus(status) | findByClassifier(classifier)
GET    /:id                    → service.getItem(id, user)
GET    /:id/members            → service.getMembers(id, user)
POST   /                       → service.createItem(body, user)
PUT    /:id                    → service.updateItem(id, body, user)        (OPEN only → 409)
POST   /:id/close              → service.close(id, user)
POST   /:id/reopen             → service.reopen(id, user)
DELETE /:id                    → service.deleteItem(id, user)              (empty + OPEN only → 409)
```

`GET /` accepts optional `?status=` or `?classifier=` (status takes precedence). All GET routes allow anonymous access; mutations require `x-user-id`. Attempting to edit/delete a non-OPEN set, or delete a set with members, returns `409 CONFLICT`. `GET /:id/members` returns AuditEvent rows under the set (the same shape as `/audit-events`) — `findMembers` delegates to the audit log filtered by `changeSetId` (§2.8).

### 2.7 Import Change-Set Parameter

`POST /import/distributed` gains a required `?changeSetId=` query parameter — every operational version created or updated by the import commits under it (LCM). The id is kept out of the source JSON body (which conforms to `source.schema.json`). Setup-only source files never reach a versioned write, so the id is unused on that path.

### 2.8 AuditEventRouter

`audit-event.js` is a hand-written, read-only router exposing the single audit query surface:

```
GET /audit-events[?changeSetId=][&targetId=][&userId=]  → auditEventService.getAuditEvents(filters, user)
```

All three query parameters are optional and AND-combined; with no filter the entire log is returned. The append-only log is never mutated via REST — there is no POST/PUT/DELETE. All filtering maps directly to the store's single `findAll(filters, tx)`.

This one resource serves every audit consumer:
- **Item History** — the client builds a versioned item's timeline by passing `?targetId=<id>`. There is deliberately no item-scoped `/{item}/{id}/history` endpoint; History is assembled client-side from this feed.
- **Change-set members** — backed by the same query (`?changeSetId=`), surfaced through `GET /change-sets/{id}/members`.
- **Actor audit** — `?userId=` scopes to one actor.

Each row is the frozen `AuditEventRow` (action, actor, role, timestamp, target snapshot, resolved `versionId`, change-set snapshot, note). GET allows anonymous access, consistent with the other read routes.

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
| Change set not found on a versioned write | 404 | `CHANGESET_NOT_FOUND` |
| Change set closed on a versioned write | 409 | `CHANGESET_CLOSED` |
| `changeSetId` missing on a versioned write | 400 | `VALIDATION_ERROR` |
| Soft delete refused — invalid lifecycle state | 409 | `INVALID_LIFECYCLE_STATE` |
| Soft delete refused — blocking inbound references | 409 | `LIFECYCLE_BLOCKED` |
| PUT/DELETE on immutable entity | 405 | `METHOD_NOT_ALLOWED` |
| Unhandled / unexpected error | 500 | `INTERNAL_ERROR` |

The two change-set conditions are detected authoritatively inside the write transaction by the store, which throws a `StoreError` tagged with a stable `error.code` (`StoreErrorCode.CHANGESET_NOT_FOUND` / `CHANGESET_CLOSED`, declared in `store/transaction.js`). The versioned, milestone, and chapter write handlers switch on `error.code` — not on the message — to choose 404 / 409. A missing `changeSetId` is a request-shape error: the store rewords it to a `Validation failed:` message so it rides the existing 400 arm without a dedicated code. `CHANGESET_CLOSED` is reported distinctly from `VERSION_CONFLICT` so a client can tell "the change set you picked is closed" from "someone else edited this item."

The two lifecycle conditions follow the same discriminator pattern at the service layer: `softDelete` / `restore` throw a typed `ServiceError` tagged with `ServiceErrorCode.INVALID_LIFECYCLE_STATE` or `LIFECYCLE_BLOCKED` (declared in `services/service-error.js`), which the lifecycle route handlers switch on. `LIFECYCLE_BLOCKED` carries a `references` array (the blocking live O\* inbound references), surfaced as a top-level sibling of `error` in the 409 body so the existing `{error: {code, message}}` envelope is unchanged for clients that ignore it — the `LifecycleConflictResponse` schema in `openapi-base.yml`. `INVALID_LIFECYCLE_STATE` carries no `references`. The `BAD_REQUEST` face/edition-exclusivity case is not in this table — it rides the `Validation failed:` 400 arm.

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
| `openapi-setup.yml` | Setup entities (stakeholder categories, reference documents, bandwidths, waves) |
| `openapi-chapter.yml` | Chapter management endpoints |
| `openapi-operational.yml` | Operational requirements and changes |
| `openapi-operational-milestones.yml` | Milestone sub-resource endpoints |
| `openapi-baseline.yml` | Baselines |
| `openapi-odp.yml` | ODIP editions (`Edition`, `EditionRequest` schemas) |
| `openapi-import.yml` | Import endpoints |
| `openapi-change-set.yml` | Change-set endpoints (CRUD, close/reopen, members) |
| `openapi-audit-event.yml` | Audit log query interface (`GET /audit-events`) and `AuditAction` / `AuditTargetType` / `AuditEventRow` schemas |
| `openapi-docx.yml` | DOCX export endpoint |
| `openapi-publication.yml` | Publication endpoint |
| `openapi-quality.yml` | Quality check endpoints and schemas (`QualityReport`, `DomainQualityReport`, `BrokenONTraceability`, `UntraceableOR`, `OrphanON`, `NoShowOStar`) |

Refer to these files for all endpoint signatures, query parameters, request/response schemas, and status code contracts.

---

[← 03 Service Layer](03-Service-Layer.md) | [05 Import Pipeline →](05-Import-Pipeline.md)