# Storage Layer Design

## Overview
This document describes the design and architecture of the ODP Storage Layer, which provides a clean abstraction over Neo4j graph database operations with support for entity versioning, relationship management, baseline-aware operations, and transactional integrity.

## Design Documentation

### [Overview](Store-Layer-Design-Overview.md)
Design principles, architecture patterns, store hierarchy, and entity categories

### [Versioning](Store-Layer-Design-Versioning.md)
Dual-node pattern, version lifecycle, optimistic locking, and relationship inheritance

### [Multi-Context Operations](Store-Layer-Design-Multi-Context.md)
Baseline-aware and wave filtering parameter resolution

### [Implementation](Store-Layer-Design-Implementation.md)
Store patterns, transaction design, performance considerations, and error handling

## Key Design Principles

### Simplified API Design
- **Complete payload approach**: All content and relationships in single operation
- **Linear versioning**: Sequential version numbers without sub-versions
- **Multi-context support**: Baseline and wave filtering parameters

### Clean Separation of Concerns
- **BaseStore**: Common CRUD operations
- **RefinableEntityStore**: Hierarchy management
- **VersionedItemStore**: Version lifecycle with multi-context support
- **Concrete stores**: Entity-specific logic and relationships

### Transaction Boundaries
- **Single transaction per user action**: One operation = one transaction
- **Atomic operations**: Content + relationships + milestones together
- **User context**: All transactions carry user identification for audit trails