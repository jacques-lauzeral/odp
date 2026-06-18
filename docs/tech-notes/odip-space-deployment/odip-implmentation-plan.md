# ODIP Implementation Plan

*v0.2 — 18 June 2026 — DRAFT for discussion*

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

### 3.2 RBA — Roles and access → *full note tbd*

Passive vs active users, action-permission matrix as the single source of "who can do what, when". Interim authentication is an email whitelist (no password) until P2 platform IAM.

### 3.3 DEL — Deletion, recycle bin, decommissioning → [design note](./odip-audit-delete-design.md) · [plan](./odip-audit-delete-plan.md)

The lifecycle is an **edge-based model** on the O* version node (`LATEST_VERSION` / `RELEASED_VERSION` / `DECOMMISSIONED_VERSION` / `DELETED_VERSION`); state is derived from edge presence, not a stored status. **P0 is complete**: referential integrity blocks deletion with the full live inbound-reference list (DEL-01); a `released` item cannot be soft-deleted (DEL-02a); and the audit trail underpinning it all (LCM-03) is built. Soft delete + restore (DEL-03, P1) are also built through to the web layer (soft-delete-from-form). **Deferred, all P1:** release (DEL-06a) and decommission (DEL-06b) — integrator-assisted, candidate-list driven, never date/OC-automated; hard delete (DEL-04) and its edition-capture wall (DEL-02b); edition deletion (DEL-05); and the recycle-bin / restore UI. Two open design threads carried separately: the DEL-06a/06b integrator reconciliation worksheet, and the impact of an O* lifecycle change on chapter `osHierarchy` references (pre-existing, also triggered by domain change).

### 3.4 DIF — Diff and comparison → *full note tbd*

Field-by-field diff between any two versions of O*s, narratives and chapters, in dataset and edition contexts. Smart diff and evolutions lens are later milestones.

### 3.5 OPS — Operations and resilience → *full note tbd*

Daily automatic backup in two forms (database + JSON), one copy off-site, retention 30 daily + 12 monthly, never delete the most recent of any kind. Quarterly restore test by integrators collectively.

### 3.6 HIST — Version history view → *folded into LCM/DEL audit work*

The History tab of every O* / chapter / narrative — surfacing action, actor, timestamp, change-set link, classifier, per-object note. **Now realised** as a client-side timeline over the single `AuditEvent` query (`GET /audit-events?targetId=`), built with the LCM/DEL revision rather than as a standalone version-list. Entry point to the diff popup (DIF) and to the change-set detail (LCM). DIF itself remains a later milestone.

### 3.7 NAV — Search, navigation and deep links

Structured query and free-text search exist today in the O*s workspace. The P0 gap is text-search *scope* (extend beyond O* fields to narrative content) with match highlighting and relevance ranking — parked pending broader design discussion. Deep links and a cross-content global search arrive at P1.

### 3.8 FBK — Feedback and commenting

Two strictly separate flows: feedback on the application itself, and comments on ODIP content. At P0 both flows live on the iCDM SharePoint site (bug template + internal CRD) — no application work. AI-assisted CRD compilation arrives at P1; in-app feedback and structured content commenting at P2.

### 3.9 MOD — Content model and structured input

Strategic anchoring, stakeholders and domains from governed picklists. Key change at P1/M4: split acting and impacted stakeholders into two fields, with a new three-level taxonomy and a documented migration of Edition 1 values. No P0 deliverable.

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

## 4. P0 status summary

P0 progress is tracked in detail only for topics where work has started (LCM, DEL). The remainder reflect the v0.4 priority assessment as captured at v0.1; their per-topic notes are still to be written.

| Topic | P0 deliverable | Status |
|---|---|---|
| **LCM** | Change-set model; audit trail (LCM-03) | ✅ Built — change sets + `AuditEvent` log; History over the audit query |
| **DEL** | Referential integrity (DEL-01); released-state soft-delete guard (DEL-02a) | ✅ Built — guards enforced end-to-end; soft delete (DEL-03, P1) also built |
| **HIST** | Version history view | ✅ Built — client timeline over `AuditEvent` |
| **RBA** | Passive/active model; action-permission matrix | ⏳ Pending — full note tbd; `x-user-role` plumbing in place, matrix hard-coded at P0 |
| **OPS** | Daily backup (DB + JSON), off-site copy, retention, quarterly restore test | ⏳ Pending — full note tbd |
| **DIF** | Field-by-field diff between versions | ⏳ Pending — full note tbd; deferred behind DEL/HIST |
| **NAV** | Structured query + text search | ◐ Partial — structured query + O*-scope text search exist; cross-content text-search scope/highlighting/ranking parked pending design |
| **FBK** | Bug report template + internal CRD | ✅ Out-of-app — lives on the iCDM SharePoint site; no application work |
| MOD · ACR · DEP · PRI · OUT · QUA · DAM | — | No P0 deliverable |

**Pending for full P0 coverage:** the three topics with unbuilt P0 application work — **RBA** (roles/permission matrix), **OPS** (backup & restore), and **DIF** (version diff) — plus the **NAV** cross-content text-search gap (parked by choice, pending design). LCM, DEL, HIST and FBK are P0-complete. Within DEL specifically, nothing P0 remains; release/decommission/hard-delete/edition-deletion are all correctly P1.

> The P0/P1 split *within* the DEL topic is authoritative in its [design note](./odip-audit-delete-design.md) §1 and §5; this table is the cross-topic roll-up.

---

*Companion notes will be added as topics are settled.*