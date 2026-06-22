# ODIP Implementation Plan

*v0.3 — 22 June 2026 — DRAFT for discussion*

> **Status note (22 Jun 2026).** **OPS** database backup is now built and verified: a `systemd --user` timer drives the daily/weekly/monthly/yearly rotation over the existing standby-aware dump, with a dedicated [design note](./odip-ops-design.md). JSON export form and off-site copy remain parked.

> **Status note (18 Jun 2026).** Two topics have advanced to implementation since v0.1: **LCM** (the audit/change-set foundation) and **DEL** (deletion), now driven by a dedicated design note and detailed plan (§3.3). The change-set model and a first-class `AuditEvent` log are built; soft delete is built. P0 status across topics is summarised in §4.

## 1. Context and purpose

This note and its companions consolidate the implementation plan for the ODIP application against the requirements set out in *ODIP Application Requirements Plan v0.4* (Yves Steyt, 11 June 2026).

Each topic is treated in its own card-note (`odip-implementation-plan-<topic>.md`). The present document is a slim index and approach statement.

## 2. Approach

### 2.1 Topic as the unit of design

The requirements are organised into 14 areas (LCM, RBA, MOD, ACR, DEL, DIF, DEP, PRI, FBK, OUT, NAV, QUA, DAM, OPS). Topics are cross-package: any given topic typically spans P0, P1 and P2 deliverables. This plan uses the topic as the unit of design — priorities are reflected in the implementation steps within each topic note, not in the topic structure itself.

One additional cross-cutting topic is introduced here:

- **HIST — Version history view.** A consequence of LCM (it surfaces the change-set link and classifier on every version row) and an entry point to DIF (clicking a version opens the diff popup). Treated separately because the work is layout/columns/filters rather than diff algorithms.

### 2.2 Note depth

- **Full treatment** for topics with P0 deliverables that involve application work: LCM, RBA, DEL, DIF, OPS, HIST.
- **Succinct treatment** for the others: NAV, FBK, MOD, ACR, DEP, PRI, OUT, QUA, DAM.

NAV and FBK are succinct here despite carrying P0 line items in v0.4:

- **NAV** P0 (structured query + text search) is largely covered by the existing O*s workspace; the meaningful P0 improvement on text search (cross-content scope, highlighting, ranking) is parked pending a broader design discussion.
- **FBK** P0 lives outside the application — bug report template and internal CRD on the iCDM SharePoint site. No application work to plan.

## 3. Topics

### 3.1 LCM — Lifecycle and change management → [full note](./odip-implementation-plan-lcm.md)

Every save of a managed object (O*, theme/chapter, narrative) is part of a change set carrying the reason for change (free text + classifier + optional comment refs). **Built and superseded in part by the audit/deletion revision** ([design note](./odip-audit-delete-design.md), [plan](./odip-audit-delete-plan.md)): the original per-version `HAS_REASON` edge is removed in favour of a single first-class **`AuditEvent`** log — the sole authoritative record of every consequential write — and the History view is a client-side timeline over that log. This realises **LCM-03 (audit trail) at P0**, reversing the v0.1 deferral. Maturity/no-show split parked.

### 3.2 RBA — Roles and access → [design note](./odip-rba-design.md)

Passive vs active users, action-permission matrix as the single source of "who can do what, when". Interim authentication is an email whitelist (no password) until P2 platform IAM.

The solution is **explicitly transitory** — designed for clean retirement at SSO (P2). The seam is a single `resolveUser()` middleware function; everything above it is unchanged when platform SSO arrives.

All identity and access configuration lives in two YAML files under `$ODIP_HOME/config/` — no DB entities, no CLI tooling, no Manage UI:

- **`users.yaml`** — email → role + domain scope; integrator-maintained
- **`permissions.yaml`** — `method × path-pattern → roles[]`; developer-maintained

The existing `domains.json` and `edition.json` migrate to YAML at the same time (`domains.yaml`, `edition.yaml`). The `loader.js` change is a one-liner per file; validation and accessors are unchanged. Two new `config.js` structure definitions and helpers (`resolveUserByEmail`, `isPermitted`, `matchesPath`) follow the existing pattern.

The Connect dialog changes to email-only input; role is returned by the server from the whitelist lookup, never self-declared. The header user button shows role and domain scope (tooltip for `DOMAIN_WRITER`).

### 3.3 DEL — Deletion, recycle bin, decommissioning → [design note](./odip-audit-delete-design.md) · [plan](./odip-audit-delete-plan.md)

The lifecycle is an **edge-based model** on the O* version node (`LATEST_VERSION` / `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` / `DELETED_VERSION`); state is derived from edge presence, not a stored status. **P0 is complete**: referential integrity blocks deletion with the full live inbound-reference list (DEL-01); a `released` item cannot be soft-deleted (DEL-02a); and the audit trail underpinning it all (LCM-03) is built. Soft delete + restore (DEL-03, P1) are also built through to the web layer (soft-delete-from-form). **Deferred, all P1:** release (DEL-06a) and decommission (DEL-06b) — integrator-assisted, candidate-list driven, never date/OC-automated; hard delete (DEL-04) and its edition-capture wall (DEL-02b); edition deletion (DEL-05); and the recycle-bin / restore UI. Two open design threads carried separately: the DEL-06a/06b integrator reconciliation worksheet, and the impact of an O* lifecycle change on chapter `osHierarchy` references (pre-existing, also triggered by domain change).

### 3.4 DIF — Diff and comparison → *full note tbd*

Field-by-field diff between any two versions of O*s, narratives and chapters, in dataset and edition contexts. Smart diff and evolutions lens are later milestones.

### 3.5 OPS — Operations and resilience → [design note](./odip-ops-design.md)

Daily automatic backup of the Neo4j database, with daily/weekly/monthly/yearly slot rotation (never delete the most recent of any kind). The schedule runs as a `systemd --user` timer on the host — the only layer with access to host `podman`, which the dump sequence requires; it survives logout via lingering and needs no root. The standby-aware dump (server enters standby, Neo4j stops, `neo4j-admin dump`, restart, resume) is reused unchanged from the manual `odip-admin dump` path. **The database-backup P0 is built and verified end-to-end.**

Two items parked: the **JSON export form** (second backup form — CLI export exists but is not wired into the rotation) and the **off-site copy** (pending an EC IT discussion on cloud vs network share). The **quarterly restore test** is procedural — integrators collectively, no application work.

### 3.6 HIST — Version history view → *folded into LCM/DEL audit work*

The History tab of every O* / chapter / narrative — surfacing action, actor, timestamp, change-set link, classifier, per-object note. **Now realised** as a client-side timeline over the single `AuditEvent` query (`GET /audit-events?targetId=`), built with the LCM/DEL revision rather than as a standalone version-list. Entry point to the diff popup (DIF) and to the change-set detail (LCM). DIF itself remains a later milestone.

### 3.7 NAV — Search, navigation and deep links

Structured query and free-text search exist today in the O*s workspace. The P0 gap is text-search *scope* (extend beyond O* fields to narrative content) with match highlighting and relevance ranking — parked pending broader design discussion. Deep links and a cross-content global search arrive at P1.

### 3.8 FBK — Feedback and commenting

Two strictly separate flows: feedback on the application itself, and comments on ODIP content. At P0 both flows live on the iCDM SharePoint site (bug template + internal CRD) — no application work. AI-assisted CRD compilation arrives at P1; in-app feedback and structured content commenting at P2.

### 3.9 MOD — Content model and structured input ✅ closed

Strategic anchoring, stakeholders and domains from governed picklists. All three requirements built across every layer (shared model, store, service, REST, CLI, web client) and documented in ADD chapters 01–04, 07, 08.

| Req | Statement | Priority | Status |
|---|---|---|---|
| MOD-01 | Strategic anchoring from structured picklists at point of entry | P0 | ✅ Built |
| MOD-02 | Acting/impacted stakeholder split; three-level taxonomy governance and Edition 1 migration | P0 | ✅ Built — `actingStakeholders` field end-to-end; impacted filter business-match by default (descendant expansion via `HAS_ACTING_STAKEHOLDER` / `findDescendants`); taxonomy and migration done. UI exact-match toggle deferred (API-supported via `impactedStakeholderExactMatch`) |
| MOD-03 | Reason for change on narratives and chapters | P0 | ✅ Built |

### 3.10 ACR — Acronyms

Managed register sourcing Annex A. In-context capture of unknown acronyms (no modal, no navigation), portfolio coverage check covering both directions (uncovered terms in content, orphan registrations). No P0 deliverable.

### 3.11 DEP — Dependencies

First-class typed relationships in a two-layer model (logical OR–OR via curated capability catalogue, planning OC–OC). Four-step discovery mechanism (catalogue → AI-proposed tags → deterministic matching → two-sided confirmation). Deployment continuity check, advisory only, with attributed iCDM overrides. No P0 deliverable.

### 3.12 PRI — Prioritisation and planning

Waves as first-class objects; OC-to-wave assignment with bandwidth feedback; scenarios with overlay model (a scenario is its deviations from the evolving base plan); "must" flags carried by OCs (or ORs within their OC), never free-standing ORs. M2 (31 July) is the first milestone. No P0 deliverable.

### 3.13 OUT — Outputs and integration

Word, PDF, static website, CSV, XLSX, JSON outputs generated from any result set. Jira one-off import at P1 (NMUI Flow backlog → ORs); permanent ODIP-to-Jira feed at P2. No P0 deliverable.

### 3.14 QUA — Quality

Structural completeness enforced at save (DRAFT may be substantively incomplete); editorial rules reported but never blocking. Portfolio checks: mandatory fields, anchoring, stakeholders, editorial conformance, acronym coverage, suspect dependencies. AI-assisted editorial harmonisation at P2. No P0 deliverable.

### 3.15 DAM — Documents and attachments

Upload, version and associate documents with domains/themes/O*s. Full-text search alongside content from a single search box. Built-in storage first behind a small storage interface; SharePoint integration via Microsoft Graph as a P2 adapter swap. No P0 deliverable.

---

## 4. Progress summary

Progress is tracked per requirement. Topics with no started work carry their v0.4 priority assessment; their per-topic notes are still to be written.

| Topic | Req | Priority | Status |
|---|---|---|---|
| **LCM** | LCM-01 Reason for change | P0 | ✅ Built — change sets + `AuditEvent` log |
| | LCM-03 Audit trail | P0 | ✅ Built — `AuditEvent` log; History over the audit query |
| | LCM-02 Change-set detail view | P1/M4 | ⏳ Pending |
| | LCM-05 Change-set opt-in default | P1/M4 | ⏳ Pending |
| **DEL** | DEL-01 Referential integrity block | P0 | ✅ Built — inbound-reference list enforced end-to-end |
| | DEL-02a Released-state soft-delete guard | P0 | ✅ Built |
| | DEL-03 Soft delete + restore | P1/M4 | ✅ Built ahead of schedule |
| | DEL-06a Release | P1 | ⏳ Pending |
| | DEL-06b Decommission | P1 | ⏳ Pending |
| | DEL-02b Edition-capture wall (hard delete guard) | P1/M4 | ⏳ Pending |
| | DEL-04 Hard delete | P1/M4 | ⏳ Pending |
| | DEL-05 Edition deletion | P1/M4 | ⏳ Pending |
| **HIST** | HIST Version history view | P0 | ✅ Built — client timeline over `AuditEvent` |
| **RBA** | RBA-01 Passive/active model | P0 | 📋 Designed — [design note](./odip-rba-design.md) §3–4 |
| | RBA-02 Action-permission matrix (hard-coded) | P0 | 📋 Designed — [design note](./odip-rba-design.md) §3.4 |
| | RBA-04 Interim auth (email whitelist + YAML config) | P0 | 📋 Designed — [design note](./odip-rba-design.md) §3.2–3.3 |
| | RBA-02 Action-permission matrix (configurable) | P1/M4 | ⏳ Pending — recommend dropping (transitory) |
| | RBA-03 Per-domain write scoping | P1/M4 | ⏳ Pending |
| | RBA-03 Reviewer commenting | P1 | ⏳ Pending |
| | RBA-04 Platform IAM | P2 | ⏳ Pending |
| **OPS** | OPS-01 Daily DB backup, slot rotation | P0 | ✅ Built — `systemd --user` timer; daily/weekly/monthly/yearly rotation; standby-aware dump; verified end-to-end |
| | OPS-01 JSON export form | P0 | ⏳ Parked — CLI export exists, not wired into rotation |
| | OPS-01 Off-site copy | P0 | ⏳ Parked — EC IT dependency |
| | OPS-01 Quarterly restore test | P0 | ✅ Procedural — integrators; no app work |
| **DIF** | DIF-01 Field-by-field diff between versions | P0 | ⏳ Pending — deferred behind DEL/HIST |
| | DIF-02 Smart diff (AI-assisted classification) | P1/M3 | ⏳ Pending |
| | DIF-03 Digests (AI-drafted, human-validated) | P1/M3 | ⏳ Pending |
| | DIF-04 Evolutions lens | P2 | ⏳ Pending |
| **NAV** | NAV-01 Structured query + O\*-scope text search | P0 | ◐ Partial — exists; cross-content scope/highlighting/ranking parked pending design |
| | NAV-03 Deep links | P1/M4 | ⏳ Pending |
| **FBK** | FBK-01 Bug report template + internal CRD | P0 | ✅ Out-of-app — lives on iCDM SharePoint; no application work |
| | FBK-02 Feedback triage workflow | P0 | ✅ Out-of-app |
| | FBK-04 CRD compilation, comment register | P1/M3 | ⏳ Pending |
| | FBK-03 In-app feedback | P2 | ⏳ Pending |
| | FBK-05 Structured in-app content commenting | P2 | ⏳ Pending |
| **MOD** | MOD-01 Strategic anchoring picklists | P0 | ✅ Built |
| | MOD-02 Acting/impacted stakeholder split + taxonomy | P0 | ✅ Built — field end-to-end; business-match default; taxonomy + migration done |
| | MOD-03 Reason for change on narratives/chapters | P0 | ✅ Built |
| **ACR** | ACR-01 Managed acronym register | P1/M4 | ⏳ Pending |
| | ACR-02 Acronym tooltips | P1/M4 | ⏳ Pending |
| | ACR-03 In-context capture | P1/M4 | ⏳ Pending |
| | ACR-04 Portfolio quality check | P1/M4 | ⏳ Pending |
| **DEP** | DEP-01 Logical OR–OR dependencies | P1/M4 | ⏳ Pending |
| | DEP-02 Planning OC–OC dependencies | P1/M4 | ⏳ Pending |
| | DEP-03 Four-step discovery mechanism | P1/M4 | ⏳ Pending |
| | DEP-04 Deployment continuity check | P1/M4 | ⏳ Pending |
| | DEP-05 Deployment continuity check (advisory) | P1/M4 | ⏳ Pending |
| **PRI** | PRI-01 Waves as first-class objects | P1/M2 | ⏳ Pending |
| | PRI-02 OC-to-wave assignment + bandwidth feedback | P1/M2 | ⏳ Pending |
| | PRI-03 Scenarios — overlay model | P1/M2 | ⏳ Pending |
| | PRI-04 "Must" flag on OCs/ORs | P1/M2 | ⏳ Pending |
| | PRI-05 Plan views and pre-cooked views | P2 | ⏳ Pending |
| | PRI-06 iCB reporting | P2 | ⏳ Pending |
| **OUT** | OUT-01 Word + PDF output | P1/M4 | ⏳ Pending |
| | OUT-02 CSV / XLSX / JSON export | P1/M4 | ⏳ Pending |
| | OUT-03 Static website output | P2 | ⏳ Pending |
| | OUT-04 Permanent ODIP-to-Jira feed | P2 | ⏳ Pending |
| **QUA** | QUA-01 Editorial rules (non-blocking) | P1/M4 | ⏳ Pending |
| | QUA-02 Portfolio quality checks | P1/M4 | ⏳ Pending |
| | QUA-03 AI-assisted editorial harmonisation | P2 | ⏳ Pending |
| **DAM** | DAM-01 Upload, version, associate documents | P1/M4 | ⏳ Pending |
| | DAM-02 Full-text search over documents | P1/M4 | ⏳ Pending |

**Pending P0 items:** **RBA** (implementation pending — design note complete), **DIF** (version diff), and the **NAV** cross-content text-search gap (parked by choice). Within OPS, the database backup is built and verified; the JSON export form and off-site copy are parked. LCM, DEL P0, HIST, FBK and MOD (all three requirements) are complete. Within DEL, release/decommission/hard-delete/edition-deletion are all correctly P1.

> The P0/P1 split *within* the DEL topic is authoritative in its [design note](./odip-audit-delete-design.md) §1 and §5; this table is the cross-topic roll-up.

---

*Companion notes will be added as topics are settled.*