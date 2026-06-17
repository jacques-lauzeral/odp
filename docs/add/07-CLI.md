# Chapter 07 – CLI

## 1. Overview

The ODIP CLI is a Node.js command-line tool built with Commander.js. It is a pure HTTP client — it calls the REST API and has no direct access to the store or service layers. This means the CLI is always in sync with the API contract and can be used against any running ODIP server instance.

```
CLI Command → node-fetch → REST API → Service Layer → Store → Neo4j
```

**Entry point**: `cli/src/index.js` — loads domain and edition config from `$ODIP_HOME/config/` at startup via `loadConfig()` before command execution  
**Base utilities**: `cli/src/base-commands.js` — shared HTTP helpers, output formatting, error handling, and user identity management  
**Commands**: one file per entity in `cli/src/commands/`

---

## 2. Architecture

### 2.1 HTTP Client Pattern

Every command constructs an HTTP request to the configured API server using `node-fetch`. The server URL is read from a JSON config file. No business logic lives in the CLI — validation errors, not-found responses, and version conflicts are all returned as API error responses and surfaced to the user.

### 2.2 User Identity

The `odip-cli` launcher script injects two global options before passing arguments to Node:

| Option | Default | Header sent |
|---|---|---|
| `--user <userId>` | `$USER` (OS user) | `x-user-id` |
| `--role <role>` | `INTEGRATOR` | `x-user-role` |

Both are available on every command. `createHeaders()` in `base-commands.js` sends both headers on every request; the server assembles `user {id, role}` from them and threads the pair into the transaction. The role is frozen onto every `AuditEvent` at write time (Phase A audit foundation). RBA enforcement is deferred to a later phase — at P0 the headers are always trusted.

### 2.3 Output Formatting

- **List operations**: ASCII tables via `cli-table3`
- **Single item**: formatted key-value plain text
- **Import results**: summary statistics printed to stdout
- **Errors**: printed to stderr with a non-zero exit code

---

## 3. Command Inventory

### Setup Entities

All setup entity commands follow the `BaseCommands` pattern (list / show / create / update / delete). Hierarchy-aware entities (`stakeholder-category`, `domain`) support `--parent` on create/update.

| Command | Action |
|---|---|
| `stakeholder-category list` | List all |
| `stakeholder-category show <id>` | Show single |
| `stakeholder-category create <name> <description>` | Create |
| `stakeholder-category update <id> <name> <description>` | Update |
| `stakeholder-category delete <id>` | Delete |
| *(same pattern for `reference-document`, `bandwidth`, `wave`)* | |

**`reference-document`** supports `--parent <id>` (ReferenceDocument REFINES hierarchy). Fields: `name`, `description` (optional), `version` (optional), `url`. Hierarchy supports up to three levels (root / child / grandchild).

**`bandwidth`** fields: `year`, `wave` (Wave ID), `scope` (Domain ID), `planned` (integer, MW). No parent.

**`wave`** fields: `year`, `sequenceNumber`, `implementationDate`. No parent.

### Operational Requirements

| Command | Action |
|---|---|
| `requirement list` | List (repository or `--edition` context, filter flags, `--projection`) |
| `requirement show <itemId>` | Show latest version (supports `--projection`) |
| `requirement show <itemId> --edition <id>` | Show in edition context |
| `requirement create <title>` | Create |
| `requirement update <itemId> <expectedVersionId> <title>` | Full update (new version) |
| `requirement patch <itemId> <expectedVersionId>` | Partial update (new version) |
| `requirement delete <itemId>` | Delete all versions |
| `requirement versions <itemId>` | List version history |
| `requirement show-version <itemId> <versionNumber>` | Show specific version |

**`requirement list` filter flags**: `--type ON|OR`, `--domain`, `--title`, `--text`, `--stakeholder-category <ids>`.

**`requirement list` projection**: `--projection summary|standard` (default: `standard`). The list table shows identity/classification columns only (`Item ID, Code, Type, Domain, Title, Version, Created By`); rich-text fields are not displayed in the list, so the projection does not affect the table.

**`requirement show` projection**: `--projection standard|extended` (default: `standard`). `extended` appends derived (reverse-traversal) fields: `implementedByORs`, `implementedByOCs`, `decommissionedByOCs`, `refinedBy`, `requiredByORs`. Fields absent from the projection render as `(not in projection)`.

**`requirement create/update` options**: `--type`, `--domain` (required on create), `--statement`, `--rationale`, `--flows`, `--private-notes`, `--parent`, `--implemented-ons`, `--impacted-stakeholders`, `--maturity`, `--dependencies`, `--nfrs`.

**Change set (LCM)**: `requirement create/update/patch` require `--change-set <id>` (the OPEN change set the new version commits under) and accept an optional `--commit-note <text>` (recorded on the change-set link). These are folded into the request body as `changeSetId` / `note`.

### Operational Changes

| Command | Action |
|---|---|
| `change list` | List (repository or `--edition` context, filter flags, `--projection`) |
| `change show <itemId>` | Show latest version (supports `--projection`) |
| `change show <itemId> --edition <id>` | Show in edition context |
| `change create <title>` | Create |
| `change update <itemId> <expectedVersionId> <title>` | Full update (new version) |
| `change patch <itemId> <expectedVersionId>` | Partial update (new version) |
| `change delete <itemId>` | Delete all versions |
| `change versions <itemId>` | List version history |
| `change show-version <itemId> <versionNumber>` | Show specific version |

**`change list` filter flags**: `--domain`, `--title`, `--text`, `--stakeholder-category <ids>`.

**`change list` projection**: `--projection summary|standard` (default: `standard`). The list table shows identity/classification columns only (`Item ID, Code, Domain, Title, Version, Created By`); rich-text fields are not displayed in the list, so the projection does not affect the table.

**`change show` projection**: `--projection standard|extended` (default: `standard`). `extended` appends the derived field `requiredByOCs`. Fields absent from the projection render as `(not in projection)`.

**`change create/update` options**: `--purpose`, `--domain` (required on create), `--initial-state`, `--final-state`, `--details`, `--private-notes`, `--implements`, `--decommissions`, `--maturity`, `--cost`.

**Change set (LCM)**: `change create/update/patch` require `--change-set <id>` and accept an optional `--commit-note <text>`, folded into the request body as `changeSetId` / `note`.

### Chapters

| Command | Action |
|---|---|
| `chapter list` | List all chapters (config-owned fields merged) |
| `chapter show <itemId>` | Show chapter latest version (or `--edition` context) |
| `chapter update <itemId> <expectedVersionId>` | Full update — replace narrative and/or osHierarchy |
| `chapter patch <itemId> <expectedVersionId>` | Partial update — update narrative and/or osHierarchy |
| `chapter versions <itemId>` | List version history |
| `chapter show-version <itemId> <versionNumber>` | Show specific version |

No `create` or `delete` — chapters are managed by server bootstrap from `edition.json`.

**`chapter update/patch` options**: `--narrative <delta-json>`, `--os-hierarchy <json>`. Both require `--change-set <id>` and accept an optional `--commit-note <text>` (LCM), folded into the body as `changeSetId` / `note`.

### Management Entities

| Command | Action |
|---|---|
| `baseline list` | List all baselines |
| `baseline show <id>` | Show baseline with item count |
| `baseline create` | Create (snapshot of current state) |
| `edition list` | List all editions |
| `edition show <id>` | Show edition |
| `edition create <title>` | Create edition |
| `edition publish <id>` | Build and serve Antora site; optionally generate PDF and/or Word |
| `edition export <id> -o <path>` | Export edition as ZIP |
| `edition export-all -o <path>` | Export full repository as ZIP |

**`edition create` options**: `--from <date>` (optional start date lower bound, yyyy-mm-dd), `--type DRAFT|OFFICIAL` (default: DRAFT), `--baseline <id>` (auto-created if omitted), `--min-on-maturity DRAFT|ADVANCED|MATURE` (optional ON maturity gate).

**`edition publish` options**:

| Flag | Description |
|---|---|
| `--word-flat` | Generate a single flat Word document |
| `--word-multipart` | Generate a multipart Word ZIP (one .docx per domain + intro) |
| `--pdf-flat` | Generate a single flat PDF document |
| `--website` | Build and serve the HTML site; copy available artifacts into exports |
| `--intro` | Include intro section (applies to `--word-flat`, `--word-multipart`, `--pdf-flat`) |
| `--domains <list>` | Comma-separated DrG ids to include (default: all) |

At least one format flag must be specified. Content selection flags (`--intro`, `--domains`) are shared across all document format flags. `--website` is independent and may be combined with document formats. Examples:

```bash
# Generate flat PDF (all content)
odp-cli edition publish 42 --pdf-flat

# Generate flat Word (selected content)
odp-cli edition publish 42 --word-flat --intro --domains RRT,IDL

# Generate multipart Word (all domains + intro)
odp-cli edition publish 42 --word-multipart --intro

# Generate all document formats, then build website separately
odp-cli edition publish 42 --pdf-flat --word-flat --word-multipart
odp-cli edition publish 42 --website

# Website only
odp-cli edition publish 42 --website
```

### Import

| Command | Action |
|---|---|
| `import distributed --file <path\|glob...> --change-set <id>` | Import distributed edition source JSON file(s) directly into database |

**`import distributed`** accepts glob patterns (quote to prevent shell expansion). Processes source JSON files conforming to `source.schema.json` — one file per chapter — directly into the database with no extract or map stage. Setup entities must already exist. A `--change-set <id>` (OPEN) is required: every operational version created or updated by the import commits under it, passed as the `?changeSetId=` query parameter. Use `--continue-on-error` to process remaining files after a failure. Summary reports `chapters` (narrative patches) and `requirements` (entities created) per file.

```bash
# Single file
odp import distributed --file sources/rerouting_source.json --change-set 4201

# Bulk import with error tolerance
odp import distributed --file "sources/*.json" --change-set 4201 --continue-on-error
```

### Quality Checks

| Command | Action |
|---|---|
| `quality run` | Run all quality checks against the live dataset and display the report |
| `quality run --domain <keys>` | Scope the report to a comma-separated list of domain keys |
| `quality run --edition <id>` | Run checks against an edition snapshot (Explore context) |
| `quality run --json` | Output the raw `QualityReport` JSON instead of formatted tables |

Results are displayed as domain sections, each showing a table of findings per rule. Domains with no findings are listed with a ✓ status. The report is always re-run on demand — no caching.

Each rule renders as a labelled table when findings are present. Column layout:

| Rule | Columns |
|---|---|
| ON traceability | ON ID, Code, Title |
| OR traceability | OR ID, Code, Title |
| Orphan ON | ON ID, Code, Title |
| NO SHOW O\* | ID, Code, Type, Title |

### Audit Events

The audit log is the sole authoritative record of every consequential write (Phase A — audit foundation). The `audit-event` command provides read-only access; the log is never mutated via the CLI.

| Command | Action |
|---|---|
| `audit-event list` | Query the full log (use with care) |
| `audit-event list --change-set <id>` | Events committed under a change set (item History per CS) |
| `audit-event list --target <id>` | Unified History timeline for one item |
| `audit-event list --user <id>` | All actions by a specific actor |

All three filters are optional and combinable (AND semantics). The table columns are: Timestamp, Action, Type, Code, Title, Ver, Actor, CS Code, Note. `--target <id>` is the canonical way to view an item's History — there is no item-scoped `/history` endpoint; the client passes `targetId` to the single audit query surface.

### Change Sets

Change sets carry the *why* of every versioned write (LCM). They are non-versioned and authored in-app only (never imported). Every `requirement` / `change` / `chapter` write and every `import distributed` run commits under one OPEN change set.

| Command | Action |
|---|---|
| `change-set list` | List all change sets |
| `change-set list --status OPEN\|CLOSED` | Filter by status |
| `change-set list --classifier <C>` | Filter by classifier |
| `change-set show <id>` | Show a single change set |
| `change-set members <id>` | List the audit events committed under it (backed by the audit log) |
| `change-set create <title> <classifier>` | Create (status initialised to OPEN) |
| `change-set update <id>` | Edit `--title` / `--reason` (OPEN only) |
| `change-set close <id>` | Close |
| `change-set reopen <id>` | Reopen |
| `change-set delete <id>` | Delete (empty + OPEN only) |

`change-set list` displays columns: `ID, Code, Title, Classifier, Status, Created By`. `change-set show <id>` prints all fields including `code`. `change-set create` and `close`/`reopen` success messages include the assigned `CS-#####` code.

`<classifier>` is one of `NEW_CONTENT`, `IN_DEPTH_REWORK`, `CLARIFICATION`, `EDITORIAL` and is passed positionally on `create`; `--reason <text>` is optional. `update` is partial — only the flags supplied are sent, so omitting one never clears it. Closing/deleting a non-eligible set returns `409` from the API and exits non-zero.

### Publication

| Command | Action |
|---|---|
| `edition publish <id> --website` | Build and serve HTML site || `edition publish <id> --pdf-flat` | Generate flat PDF |
| `edition publish <id> --word-flat` | Generate flat Word |
| `edition publish <id> --word-multipart` | Generate multipart Word ZIP |
| `edition publish <id> --pdf-flat --word-flat --word-multipart` | Generate all document formats |
| `publication antora --output <path> [--edition <id>]` | Generate Antora ZIP for local build |

---

## 4. Deleted Commands

The following command files or subcommands were removed:

| File / Command | Reason |
|---|---|
| `data-category.js` | `DataCategory` entity removed from model |
| `service.js` | `Service` entity removed from model |
| `document.js` | `Document` renamed to `ReferenceDocument`; replaced by `reference-document.js` |
| `domain.js` | `Domain` setup entity retired — replaced by `chapter.js` and config-driven domain keys |
| `import extract-word` | Three-stage Office import pipeline removed |
| `import extract-word-hierarchy` | Three-stage Office import pipeline removed |
| `import extract-excel` | Three-stage Office import pipeline removed |
| `import map` | Three-stage Office import pipeline removed |
| `import structured` | Three-stage Office import pipeline removed |
| `docx export` | Round-trip docx export/re-import workflow removed |

---

## 5. Base Command Patterns

### BaseCommands (setup entities)

`BaseCommands` in `base-commands.js` provides list / show / create / update / delete for flat or hierarchical setup entities. Configuration is passed via `fieldConfig`:

```javascript
{
    fields: ['name', 'description'],   // API response fields to display (excluding id)
        headers: ['ID', 'Name', ...],      // Table column headers (id always first)
        colWidths: [10, 30, 50],           // cli-table3 column widths
        createSignature: '<name> <desc>',  // Commander positional args for create
        updateSignature: '<id> <name> <desc>',
        hasParent: true                    // Adds --parent option to create/update
}
```

### VersionedCommands (operational entities)

`VersionedCommands` extends `BaseCommands` and adds: version history, show-version, edition context support, and abstract `_addCreateCommand` / `_addUpdateCommand` / `_addPatchCommand` hooks implemented by each subclass.

`addListCommand` and `addShowCommand` in `VersionedCommands` both support `--edition <id>` (optional). The `--baseline` option has been removed — baseline is an internal implementation detail not exposed in the CLI. Edition ID is passed directly as `?edition=<id>` to the API; server-side resolution handles baseline and wave context internally.

`getUserRole()` mirrors `getUserId()` — both read from the global `program.opts()` set by the `odip-cli` script. `createHeaders()` sends `x-user-role` alongside `x-user-id` on every request.

`addListCommand` and `addShowCommand` in `VersionedCommands` both support `--projection`. The projection value is validated before the request is issued; an invalid value exits with a non-zero code. The projection is appended as a query parameter only when non-default. List tables show identity/classification columns only — rich-text fields are surfaced in `show` / `show-version`, not in the list.

---

[← 06 Publication](06-Publication.md) | [08 Web Client →](08-Web-Client.md)