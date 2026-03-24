# Chapter 00 – Overview

## 1. Purpose and Scope

The **Operational Development and Implementation Plan (ODIP)** is an aviation industry tool for managing operational requirements, changes, and deployment planning within the iCDM (improved release Content Definition Meeting) process.

ODIP supports the full lifecycle of operational content — from initial drafting by working groups (Drafting Groups, DrGs) through collaborative elaboration, baseline management, publication, and review. It provides a structured repository for:

- **Operational Needs (ONs)** — high-level operational objectives
- **Operational Requirements (ORs)** — detailed, traceable requirements derived from ONs
- **Operational Changes (OCs)** — deployment-oriented changes that implement ORs across NM waves

ODIP is designed as a prototype for operational deployment management, with a functional web UI, REST API, and CLI tooling.

NOTE: ODIP was formerly named ODP (for Operational Deployment Plan). Consequently, many code artefact names are still based on ODP rather than ODIP.

---

## 2. Key Concepts and Terminology

| Term | Meaning |
|---|---|
| **ON** | Operational Need — high-level objective |
| **OR** | Operational Requirement — traceable requirement derived from an ON |
| **OC** | Operational Change — deployment unit implementing one or more ORs |
| **DrG** | Drafting Group — working group responsible for a domain (e.g. IDL, 4DT, ASM_ATFCM) |
| **Wave** | NM deployment cycle — milestone-aligned deployment window |
| **Baseline** | Immutable snapshot of the repository at a point in time |
| **ODIP Edition** | Published edition of the Operational Development and Implementation Plan |
| **Domain** | Business domain impacted by an OR (e.g. ATM, ATC, NM) |
| **Reference Document** | Strategic document linked to an ON with an optional entry point note; may carry a URL |
| **Setup Entities** | Reference data: stakeholder categories, domains, reference documents, waves |
| **Round-trip editing** | Workflow: export to Word → manual edit → re-import |

---

## 3. Actors

Four actor roles are defined:

**Contributor** — writes, reviews, and documents ONs, ORs, OCs, and ODIP editions. Can configure setup data and manage electronic documents. Typically DrG members, iCDM members, iCDM-C, and the iCDM Chair.

**Reviewer** — reviews ODIP editions including their OCs, ORs, and ONs. Typically DrG and iCDM-C members, the iCDM Chair.

**Publisher** — triggers publication of an ODIP Edition. Typically iCDM-C.

**Administrator** — super user with full access. Reserved for platform management.

---

## 4. Functional Scope

ODIP supports four main activities:

### 4.1 Setup Management
Definition of reference data used consistently across the platform:
- Stakeholder Categories
- Domains
- Reference Documents (with optional URL)
- Waves (flat list, aligned with NM deployment cycles)

### 4.2 Elaboration
Collaborative creation and maintenance of operational content:
- Authoring and versioning of ONs, ORs, and OCs
- Cross-referencing between ONs, ORs, and OCs
- Impact characterisation via setup entities (domains, stakeholder categories, strategic documents)
- Milestone planning for OC deployment
- Rich text editing (purpose, statement, rationale, initial/final state, details)

### 4.3 Planning
Deployment and implementation planning across NM waves:
- ON-based planning view: ON hierarchy with tentative implementation periods visualised on a temporal grid
- OC-based planning view: reserved (Phase 2)

See [Chapter 08 §11](./08-Web-Client.md) for implementation details.

### 4.4 Prioritisation
Iterative assignment of OCs to delivery waves against DrG bandwidth constraints:
- Board view: OC cards organised by wave and DrG
- Bandwidth monitoring: per-wave, per-DrG load indicators (green / orange / red)
- Dependency enforcement: wave assignment validated against OC dependency order
- Wave assignments persisted via OPS_DEPLOYMENT milestones

See [Chapter 08 §13](./08-Web-Client.md) for implementation details.

### 4.5 Publication
Packaging and publishing of an ODIP Edition:
- Baseline creation (immutable repository snapshot)
- ODIP Edition generation from a baseline
- Document generation via `DetailsModuleGenerator` (AsciiDoc + Mustache templates)
- Antora-generated static web site for external consultation

### 4.6 Review
Consultation and review of published ODIP Editions by internal and external stakeholders.

---

## 5. High-Level Architecture

### 5.1 System Components

ODIP is composed of four main components:

| Component | Technology | Role |
|---|---|---|
| **Web Client** | Vanilla JavaScript | Browser-based UI for all activities |
| **API Server** | Node.js / Express.js | REST API, business logic, document processing |
| **Database** | Neo4j 5.15 | Graph database storing all entities and relationships |
| **CLI** | Node.js / Commander.js | Command-line interface for scripting and dev workflows |

All components are containerised. Podman is used for local development; Kubernetes YAML manifests are provided for production deployment.

### 5.2 Architecture Diagram

```
┌─────────────────────┐     ┌─────────────────────┐
│     Web Client      │     │        CLI           │
│  (Vanilla JS)       │     │  (Commander.js)      │
└──────────┬──────────┘     └──────────┬───────────┘
           │  HTTP/REST                │  HTTP/REST
           └──────────────┬────────────┘
                          │
               ┌──────────▼──────────┐
               │     API Server      │
               │   Express Routes    │
               │   Service Layer     │
               │   Store Layer       │
               └──────────┬──────────┘
                          │  Cypher / Bolt
               ┌──────────▼──────────┐
               │       Neo4j         │
               │  Graph Database     │
               └─────────────────────┘
```

### 5.3 Request Flow

All requests follow the same layered path through the API Server:

```
HTTP Request
  → Express Route       (input validation, HTTP concerns)
    → Service Layer     (business logic, transaction management)
      → Store Layer     (data access, Cypher queries)
        → Neo4j         (graph storage)
```

Each layer has a single, clear responsibility. No layer skips another.

---

## 6. Round-Trip Editing Concept

A core workflow in ODIP is **round-trip editing**: enabling aviation industry contributors to work in familiar tools (Microsoft Word) while keeping the system of record in the platform.

```
ODIP Repository
      │
      │  Export (Word generation)
      ▼
  Word Document
      │
      │  Manual editing by contributors
      ▼
  Edited Document
      │
      │  Re-import (Extract → Map → Import pipeline)
      ▼
ODIP Repository (updated)
```

This workflow is supported by the three-stage Import Pipeline (see [Chapter 05](./05-Import-Pipeline.md)).

---

## 7. Technology Stack Summary

| Layer | Technology | Notes |
|---|---|---|
| Language | JavaScript (ES modules) | TypeScript migration planned |
| Runtime | Node.js 24+ | Full Debian image for native module compatibility |
| Web framework | Express.js | Manual routing, no code generation |
| Database | Neo4j 5.15 | Graph model for relationships and versioning |
| Web client | Vanilla JavaScript | No framework; modular ES modules |
| Rich text | Quill.js | Delta format; AsciiDoc conversion for export |
| Document processing | mammoth.js, xlsx | Word and Excel extraction |
| Document generation | Mustache templates | AsciiDoc / Word output |
| Static site generation | Antora | Published ODIP Edition web site |
| Containerisation | Podman | Rootless containers; Kubernetes YAML for production |
| API specification | OpenAPI 3.0 | Contract-first; multiple spec files by domain |
| CLI | Commander.js | 35+ commands; HTTP integration with API server |

---

*Next: [Chapter 01 – Data Model](./01-Data-Model.md)*