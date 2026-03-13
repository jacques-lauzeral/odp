# ODIP Data Model Update — Work Note

## Introduction

Four corrections are to be applied to the ODIP data model and propagated across all layers of the system:

1. **ReferenceDocument gains a parent hierarchy.** Until now, ReferenceDocuments were a flat list. They shall support a REFINES parent-child relationship, consistent with Domain and StakeholderCategory.

2. **Bandwidth gains a `planned` field.** The Bandwidth entity shall include an integer field `planned` representing the planned bandwidth in MW.

3. **Requirement version loses the `domain` attribute.** The `domain` / `domainId` field (and its underlying `HAS_DOMAIN` relationship) shall be removed from Requirement version nodes. The `refines` relationship note is also clarified: it applies to both ON and OR, with type-homogeneity enforced (ON refines ON, OR refines OR) — this was already the case in the code, so no code change is expected for this point.

4. **OperationalChange loses the `visibility` attribute.** The `visibility` field and its underlying `Visibility` enum (`NM` | `NETWORK`) shall be removed from OperationalChange version nodes and from the shared module.

Each step below covers one ADD chapter and its associated code. Steps shall be executed in order.

---

## Step 1 — Chapter 01: Data Model

- ReferenceDocument: replace "flat list" note with REFINES hierarchy note.
- Bandwidth: add `planned` integer field to the field table.
- Requirement version node: remove the `domain` row from the version node field table; clarify the `refines` relationship note.
- OperationalChange version node: remove the `visibility` row from the version node field table.
- Section 6.6 (Visibility): remove entirely.
- Shared module file listing: remove `visibility.js`.

---

## Step 2 — Chapter 02: Storage Layer

- `ReferenceDocumentStore`: change base class from `BaseStore` to `RefinableEntityStore`; update the store description and hierarchy diagram accordingly.
- `BandwidthStore`: add `planned` to the field list in the store description.
- `OperationalRequirementStore`: remove all references to `HAS_DOMAIN` relationship and `domain` / `domainId` field (store description, field table, query examples, filter table).
- `OperationalChangeStore`: remove `visibility` from the field table and from the `findAll` filter table.
- Relationship direction listing (§6.1): remove `HAS_DOMAIN` entry.

---

## Step 3 — Chapter 03: Service Layer

- `ReferenceDocumentService`: change base class from `SimpleItemService` to `TreeItemService`; update the service description.
- `RequirementService`: remove `domainId` from the type-gated ON-only field list and from the parallel existence-validation list.
- `OperationalChangeService`: remove `visibility` from the field list and from any validation logic.

---

## Step 4 — Chapter 04: REST API + OpenAPI contracts

Update `openapi-base.yml`:
- `ReferenceDocument` and `ReferenceDocumentRequest` schemas: add `parentId` field.
- `Bandwidth` and `BandwidthRequest` schemas: add `planned` integer field.
- `OperationalRequirement` and `OperationalRequirementRequest` schemas: remove `domain` / `domainId` fields.
- `OperationalChange` and `OperationalChangeRequest` schemas: remove `visibility` field; remove `Visibility` enum schema if defined.

Update `openapi-setup.yml`:
- ReferenceDocument endpoints: add parent-related query parameter (e.g. `parentId`) consistent with Domain and StakeholderCategory endpoints.

Update `openapi-operational.yml` (or whichever file hosts OC endpoints):
- Remove `visibility` filter parameter from the OC list endpoint.

Update Chapter 04 narrative to reflect these schema changes.

---

## Step 5 — Chapter 05: Import Pipeline

Review all DrG mappers and the StandardImporter:
- Check whether any mapper sets `domainId` on Requirement records — remove if so.
- Check whether any mapper sets `visibility` on OperationalChange records — remove if so.
- Check whether ReferenceDocument import assumes a flat structure — update if parent references are needed.
- `planned` on Bandwidth is NM-internal; no mapper change expected, but confirm.

---

## Step 6 — Chapter 06: Publication

Review the publication layer (DetailsModuleGenerator, DeltaToAsciidocConverter, Mustache templates):
- Remove any rendering of the `domain` field on Requirement detail pages.
- Remove any rendering of the `visibility` field on OperationalChange detail pages.
- Add rendering of `planned` on Bandwidth if Bandwidth is published.
- ReferenceDocument hierarchy: check if the publication renders ReferenceDocuments and whether hierarchy should be reflected.

---

## Step 7 — Chapter 07: CLI

- `document` command (ReferenceDocument): add `--parent` option, consistent with `domain` and `stakeholder` commands.
- `bandwidth` command: add `planned` argument.
- `or` / `on` commands: remove `--domain` option.
- `oc` command: remove `--visibility` option.

---

## Step 8 — Chapter 08: Web Client

- ReferenceDocument form: add parent selector.
- Bandwidth form: add `planned` integer input.
- Requirement (ON) form: remove domain field.
- OperationalChange form: remove visibility field.
- Any requirement list or detail view rendering `domain`: remove.
- Any OC list or detail view rendering `visibility`: remove.

---

## Progress

| Step | Chapter | Status |
|---|---|---|
| 1 | Chapter 01 – Data Model | ✅ Done |
| 2 | Chapter 02 – Storage Layer | ✅ Done |
| 3 | Chapter 03 – Service Layer | ✅ Done |
| 4 | Chapter 04 – REST API + OpenAPI | ✅ Done |
| 5 | Chapter 05 – Import Pipeline | ✅ Done |
| 6 | Chapter 06 – Publication | ✅ Done |
| 7 | Chapter 07 – CLI | ✅ Done |
| 8 | Chapter 08 – Web Client | ⬜ To do |