# Chapter 00 – Overview

## 1. Purpose and Scope

The **Operational Development and Implementation Plan (ODIP)** is an aviation industry tool for managing operational requirements, changes, and deployment planning within the iCDM (improved release Content Definition Meeting) process.

ODIP supports the full lifecycle of operational content — from initial drafting through collaborative elaboration, baseline management, publication, and review. It provides a structured repository for:

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
| **Wave** | NM deployment cycle — milestone-aligned deployment window |
| **Baseline** | Immutable snapshot of the repository at a point in time |
| **ODIP Edition** | Published edition of the Operational Development and Implementation Plan |
| **Domain** | Organisational unit grouping O*s under a common authoring scope; defines the write boundary for Domain Writers |
| **Reference Document** | Strategic document linked to an ON with an optional entry point note; may carry a URL |
| **Setup Entities** | Reference data: stakeholder categories, domains, reference documents, waves |
| **ChangeSet** | Named grouping of related saves sharing a common reason for change |
| **Round-trip editing** | Workflow: export to Word → manual edit → re-import |

---

## 3. Actors

Two user categories are defined: **active users**, who hold a named role and can write to the live dataset, and **passive users** (external organisations, NM read-only reviewers), who have read-only access to published editions and no commenting rights until a later phase.

Three active roles are defined:

**Domain Writer** (`DOMAIN_WRITER`) — authors ONs, ORs, OCs, narratives, and setup data within their own domain; reads all other domains.

**iCDM** (`ICDM`) — cross-domain read and write access; drives prioritisation and wave assignment. Typically iCDM members, iCDM-C, and the iCDM Chair.

**Integrator** (`INTEGRATOR`) — full administrative rights: publication, hard delete, patching, permission-matrix administration, and backup/restore. Reserved for the application team.

User identification is client-declared against a server-side email whitelist (interim scheme); role is assigned per address on the same whitelist. Platform SSO integration is planned for a later phase.

---

## 4. Functional Scope

ODIP Space is organised around five top-level activities.

**Home** is the entry point for all users. It presents the available dataset contexts — the live dataset or a specific published edition — and routes the user into the appropriate workspace. Anonymous access is permitted.

**Elaborate** is the authoring workspace, operating against the live dataset in read/write mode. Active users draft and maintain ONs, ORs, OCs, chapter narratives, and setup data; manage change sets; run quality checks; and plan OC deployment across waves. Access requires identification.

**Explore** is the consultation workspace, operating against a selected published edition in read-only mode. It exposes the same sub-activities as Elaborate but suppresses all write actions, enabling stakeholders to navigate and review a specific edition without affecting the live dataset. Anonymous access is permitted.

**Converse** is a placeholder for collaborative threading — asynchronous discussion and consultation comment management. It is accessible without identification. Full implementation is deferred to a later phase.

**Manage** is the administration workspace, restricted to Integrators. It covers edition lifecycle management (baseline creation, publication, patching) and will host the permission-matrix configuration and capability catalogue in later phases.

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


## 6. Technology Stack Summary

| Layer | Technology | Notes |
|---|---|---|
| Language | JavaScript (ES modules) | TypeScript migration planned |
| Runtime | Node.js 24+ | Full Debian image for native module compatibility |
| Web framework | Express.js | Manual routing, no code generation |
| Database | Neo4j 5.15 | Graph model for relationships and versioning |
| Web client | Vanilla JavaScript + Vite | Modular ES modules; Vite for bundling and dev server |
| Rich text | TipTap | TipTap JSON document format; AsciiDoc conversion for export |
| Document processing | mammoth.js, xlsx | Word and Excel extraction |
| Document generation | Mustache templates | AsciiDoc / Word output |
| Static site generation | Antora | Published ODIP Edition web site |
| Containerisation | Podman | Rootless containers; Kubernetes YAML for production |
| API specification | OpenAPI 3.0 | Contract-first; multiple spec files by domain |
| CLI | Commander.js | 35+ commands; HTTP integration with API server |

---

*Next: [Chapter 01 – Data Model](./01-Data-Model.md)*