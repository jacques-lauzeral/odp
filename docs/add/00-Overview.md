# Chapter 00 – Overview

## 1. Purpose and Scope

The **Operational Development and Implementation Plan (ODIP)** is an aviation industry tool for managing operational requirements, changes, and deployment planning within the iCDM (improved release Content Definition Meeting) process.

ODIP supports the full lifecycle of operational content — from initial drafting by working groups (Drafting Groups, DrGs) through collaborative elaboration, baseline management, publication, and review. It provides a structured repository for:

- **Operational Needs (ONs)** — high-level operational objectives
- **Operational Requirements (ORs)** — detailed, traceable requirements derived from ONs
- **Operational Changes (OCs)** — deployment-oriented changes that implement ORs across NM waves

ODIP is designed as a prototype for operational deployment management, with a functional web UI, REST API, and CLI tooling.

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
| **Setup Entities** | Reference data (stakeholder categories, data categories, regulatory aspects, services, waves) |
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
- Stakeholder Categories (hierarchical)
- Data Categories (hierarchical)
- Regulatory Aspects (hierarchical)
- Domains and Services (hierarchical)
- Waves (flat list, aligned with NM deployment cycles)

### 4.2 Elaboration
Collaborative creation and maintenance of operational content:
- Authoring and versioning of ORs and OCs
- Cross-referencing between ORs, OCs, and ONs
- Impact characterisation via setup entities
- Milestone planning for OC deployment
- Rich text editing (initial state, final state, purpose, details)

### 4.3 Publication
Packaging and publishing of an ODIP Edition:
- Baseline creation (immutable repository snapshot)
- ODIP Edition generation from a baseline
- Document export (Word, AsciiDoc)
- Antora-generated static web site for external consultation

### 4.4 Review
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

All components are containerised and orchestrated via Docker Compose (development) or Kubernetes YAML (production).

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
| Runtime | Node.js 20 | Full Debian image for native module compatibility |
| Web framework | Express.js | Manual routing, no code generation |
| Database | Neo4j 5.15 | Graph model for relationships and versioning |
| Web client | Vanilla JavaScript | No framework; modular ES modules |
| Rich text | Quill.js | Delta format; AsciiDoc conversion for export |
| Document processing | mammoth.js, xlsx | Word and Excel extraction |
| Document generation | Mustache templates | AsciiDoc / Word output |
| Static site generation | Antora | Published ODIP Edition web site |
| Containerisation | Podman / Docker | Rootless containers; Kubernetes-ready |
| API specification | OpenAPI 3.0 | Contract-first; multiple spec files by domain |
| CLI | Commander.js | 35+ commands; HTTP integration with API server |

---

*Next: [Chapter 01 – Data Model](./01-Data-Model.md)*