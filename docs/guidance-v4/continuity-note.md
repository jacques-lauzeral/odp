# ODP Model Update — Continuity Note

## Context

We are updating the ODP system to align with **iCDM Guidance Materials for DrGs Edition 4**. This is an 8-step plan progressing layer by layer through the stack.

## What drove the changes

The model update note identified the following principal changes versus the prior model:

**Setup entities:**
- `Wave`: fields `quarter` + `date` + `name` → `sequenceNumber` + `implementationDate` (year retained)
- `Document` renamed to `ReferenceDocument`
- `DataCategory` and `Service` removed entirely
- `Domain` added (extends `RefinableEntityStore`, i.e. supports REFINES hierarchy)
- `Bandwidth` added (plain `BaseStore`, unique on `(year, wave, scope)` tuple)

**Operational Requirements (ON/OR):**
- `impactsStakeholderCategories` → `impactedStakeholders` (rel: `IMPACTS_STAKEHOLDER`)
- `impactsData` / `impactsServices` removed
- `documentReferences` removed from OR; replaced by `strategicDocuments` on ON only (rel: `REFERENCES` → `ReferenceDocument`)
- `dependsOnRequirements` → `dependencies` (OR only)
- `domain` added on ON (rel: `HAS_DOMAIN`)
- `impactedDomains` added on OR (rel: `IMPACTS_DOMAIN`)
- New fields: `maturity` (enum: DRAFT/ADVANCED/MATURE), `nfrs`, `tentative`, `additionalDocumentation`

**Operational Changes (OC):**
- `satisfiesRequirements` → `implementedORs` (rel: `IMPLEMENTS`)
- `supersedsRequirements` → `decommissionedORs` (rel: `DECOMMISSIONS`)
- `documentReferences` removed
- Milestone field `title` → `name`; `eventTypes` already an array — confirmed correct
- New fields: `maturity`, `cost`, `orCosts`, `additionalDocumentation`

**Architecture decision — single Requirement class:** Option 1 was chosen: a single `OperationalRequirement` node/version type, with `type` field (`ON`/`OR`) enforced at the service layer.

---

## Steps completed

| Step | Deliverable | Status |
|---|---|---|
| 1 | Data Model ADD chapter (`01-Data-Model.md`) | ✅ Complete |
| 1 | Shared model code: `setup-elements.js`, `odp-elements.js`, `maturity-levels.js`, `Comparator.js`, `ExternalIdBuilder.js`, `messages.js` | ✅ Complete |
| 2 | Storage Layer ADD chapter (`02-Storage-Layer.md`) | ✅ Complete |
| 2 | Store files: `operational-requirement-store.js`, `operational-change-store.js`, `operational-change-milestone-store.js`, `odp-edition-store.js`, `baseline-store.js` | ✅ Complete |
| 2 | Supporting store files (no changes needed): `versioned-item-store.js`, `wave-store.js`, `stakeholder-category-store.js`, `domain-store.js`, `bandwidth-store.js`, `reference-document-store.js`, store `index.js` | ✅ Complete |
| 3 | Service Layer ADD chapter (`03-Service-Layer.md`) | ✅ Complete |
| 3 | New services: `DomainService.js`, `ReferenceDocumentService.js`, `BandwidthService.js` | ✅ Complete |
| 3 | Updated services: `OperationalRequirementService.js`, `OperationalChangeService.js`, `StakeholderCategoryService.js`, `WaveService.js` | ✅ Complete |
| 3 | Deleted services: `DataCategoryService.js`, `ServiceService.js`, `DocumentService.js` | ✅ Complete |
| 4 | REST API ADD chapter (`04-REST-API.md`) | ✅ Complete |
| 4 | New routes: `domain.js`, `reference-document.js`, `bandwidth.js` | ✅ Complete |
| 4 | Updated routes: `operational-requirement.js`, `operational-change.js`, `index.js` | ✅ Complete |
| 4 | Deleted routes: `data-category.js`, `service.js`, `document.js` | ✅ Complete |
| 4 | Routers cross-checked (no v3 refs): `docx-export.js`, `import.js`, `publication.js` | ✅ Complete |
| 5 | Import Pipeline ADD chapter (`05-Import-Pipeline.md`) | ✅ Complete |
| 5 | Updated importers: `JSONImporter.js`, `StandardImporter.js`, `StandardMapper.js` | ✅ Complete |
| 5 | Updated DrG mappers: `4DT_Mapper.js`, `AirportMapper.js`, `ASM_ATFCM_Mapper.js`, `FlowMapper.js`, `iDL_Mapper_sections.js`, `iDL_Mapper_tables.js`, `NM_B2B_Mapper.js`, `ReroutingMapper.js` | ✅ Complete |
| 5 | Skipped mapper: `CRISIS_FAAS_Mapper.js` — input evolved significantly, needs fresh implementation | ⚠️ Skipped |
| 6 | Publication ADD chapter (`06-Publication.md`) — rewritten to reflect current architecture | ✅ Complete |
| 6 | Publication code: no changes needed — `DetailsModuleGenerator.js`, `PublicationService.js`, `on.mustache`, `or.mustache` already v4-clean | ✅ Complete |
| 6 | Docx round-trip export: `DocxEntityRenderer.js`, `ODPEditionAggregator.js` updated | ✅ Complete |
| 6 | Docx round-trip export: `DocxGenerator.js`, `DocxExportService.js`, `DocxStyles.js`, `ODPEditionTemplateRenderer.js` — no changes needed | ✅ Complete |
| 7 | CLI ADD chapter (`07-CLI.md`) | ✅ Complete |
| 7 | New command files: `domain.js`, `reference-document.js`, `bandwidth.js` | ✅ Complete |
| 7 | Updated command files: `wave.js`, `operational-requirement.js`, `operational-change.js`, `index.js` | ✅ Complete |
| 7 | Deleted command files: `data-category.js`, `service.js`, `document.js` | ✅ Complete |
| 7 | `base-commands.js` fixes: `cmd.args`+`cmd.opts()` replaces `...args` spread; `argFields` separates positional from display fields; generic `options` array for extra flags (e.g. `--contact`, `--wave`, `--scope`); auto-coerce numeric positional args to `Number` | ✅ Complete |
| 7 | CLI command renames: `stakeholder-category` → `stakeholder`; `reference-document` → `document` | ✅ Complete |

---

## Steps remaining

| Step | Scope |
|---|---|
| 8 | Web Client — ADD chapter (`08-Web-Client.md`) + web client code |

---

## Key architectural notes

- `ODPEditionAggregator` and `ODPEditionTemplateRenderer` belong to the **docx round-trip export** pipeline (not Antora publication). They live in `services/export/`. The Antora publication pipeline uses `DetailsModuleGenerator` exclusively.
- `CRISIS_FAAS_Mapper.js` was intentionally skipped — needs a fresh implementation against the new DrG source format.
- `BaseCommands` `fieldConfig` now supports: `argFields` (positional args subset of `fields`; defaults to `fields`), `options` (array of `{ flag, description, field }` for extra CLI flags), auto-coercion of numeric-looking positional args.
- CLI command names: `stakeholder` (not `stakeholder-category`), `document` (not `reference-document`).

---

## How to resume

In the new chat:
1. Upload this continuity note
2. Upload the **data model update guidance** (`data-model-update-guidance-v4.md`)
3. Upload the web client source files relevant to Step 8
4. Start with: **"proceed with Step 8"**

The same working pattern applies: cross-check uploaded source files against the ADD before generating code, confirm approach before producing artifacts.