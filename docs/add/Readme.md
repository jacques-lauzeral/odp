# ODIP Architecture and Design Document (ADD)

**ODIP** — Operational Development and Implementation Plan  
**System** — iCDM Operational Data Platform  
**Status** — Active prototype

---

## Document Map

| # | Chapter | Summary |
|---|---|---|
| — | [Overview](00-Overview.md) | System purpose, stakeholders, high-level architecture, technology choices |
| 01 | [Data Model](01-Data-Model.md) | Shared enums and entity models, operational and setup entities, versioning and relationships |
| 02 | [Storage Layer](02-Storage-Layer.md) | Neo4j graph schema, store hierarchy, Cypher patterns, transaction model |
| 03 | [Service Layer](03-Service-Layer.md) | Business logic, validation, transaction orchestration, service inventory |
| 04 | [REST API](04-REST-API.md) | Express routes, OpenAPI modules, error mapping, request/response conventions |
| 05 | [Import Pipeline](05-Import-Pipeline.md) | Three-stage extract → map → import pipeline, DrG mappers, docx round-trip export |
| 06 | [Publication](06-Publication.md) | Antora ZIP generation, Delta→AsciiDoc conversion, PDF, CLI command, site build workflow |
| 07 | [CLI](07-CLI.md) | Commander.js architecture, HTTP-only client, command inventory |
| 08 | [Web Client](08-Web-Client.md) | Vanilla JS SPA, component patterns, multi-perspective, Quill rich text, CSS architecture |
| 09 | [Deployment](09-Deployment.md) | Podman pod, container configuration, local and Eurocontrol environments |
| 10 | [Development Guide](10-Development-Guide.md) | Layer sequence for new entities, naming conventions, transaction rules, workflow |

---

## Architecture at a Glance

Web Client (Vanilla JS) calls REST API (Express) which delegates to Service Layer, then Store Layer (BaseStore hierarchy), then Neo4j 5.15 + APOC. CLI and Import Pipeline also call the REST API. Publication generates ZIP (Antora source) or PDF directly from the service layer.

---

## Key Concepts

**Operational Need (ON)** — a high-level operational requirement; typed ON in the OR model.
**Operational Requirement (OR)** — a specific, implementable requirement; typed OR or ON (ORType enum).
**Operational Change (OC)** — a concrete change satisfying one or more ORs, with a 5-event milestone lifecycle.
**Drafting Group (DrG)** — the organisational unit responsible for a requirement or change (e.g. IDL, 4DT, ASM_ATFCM).
**Baseline** — a named snapshot of the repository at a point in time.
**ODIP Edition** — a curated publication scope combining a baseline and an optional wave filter; drives all export and review workflows.
**Wave** — a deployment planning unit; ORs and OCs are associated with waves to express delivery sequencing.

---

## Layer Dependency Rules

- web-client: REST API only
- cli: REST API only
- REST API: service layer only
- service: store layer only
- store: Neo4j only
- @odp/shared: imported by all layers, no dependencies of its own

No layer may skip levels or import directly from a lower layer it does not own.

---

## Quick-Start Paths

**Understanding the data model** — start at [01 Data Model](01-Data-Model.md)
**Adding a new entity** — read [10 Development Guide section 4](10-Development-Guide.md), then work through chapters 02, 03, 04, 07, 08
**Debugging an import failure** — [05 Import Pipeline](05-Import-Pipeline.md)
**Generating a publication** — [06 Publication](06-Publication.md)
**Standing up the system** — [09 Deployment](09-Deployment.md)
**Understanding a UI component** — [08 Web Client](08-Web-Client.md)