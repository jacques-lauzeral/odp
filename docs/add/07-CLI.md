# Chapter 07 – CLI

## 1. Overview

The ODIP CLI is a Node.js command-line tool built with Commander.js. It is a pure HTTP client — it calls the REST API and has no direct access to the store or service layers. This means the CLI is always in sync with the API contract and can be used against any running ODIP server instance.

```
CLI Command → node-fetch → REST API → Service Layer → Store → Neo4j
```

**Entry point**: `cli/src/index.js`  
**Base utilities**: `cli/src/base-commands.js` — shared HTTP helpers, output formatting, error handling, and user identity management  
**Commands**: one file per entity in `cli/src/commands/`

---

## 2. Architecture

### 2.1 HTTP Client Pattern

Every command constructs an HTTP request to the configured API server using `node-fetch`. The server URL is read from a JSON config file. No business logic lives in the CLI — validation errors, not-found responses, and version conflicts are all returned as API error responses and surfaced to the user.

### 2.2 User Identity

Commands that write data (create, update, patch, delete, import) require a `--user` flag or a configured default user. The value is passed as a header to the API, which propagates it into the transaction for version authorship tracking.

### 2.3 Output Formatting

- **List operations**: ASCII tables via `cli-table3`
- **Single item**: formatted key-value plain text
- **Import/export results**: summary statistics printed to stdout
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
| *(same pattern for `domain`, `reference-document`, `bandwidth`, `wave`)* | |

**`domain`** supports `--parent <id>` (Domain REFINES hierarchy). Fields: `name`, `description`, `contact`.

**`reference-document`** supports `--parent <id>` (ReferenceDocument REFINES hierarchy). Fields: `name`, `version`, `url`.

**`bandwidth`** fields: `year`, `wave` (Wave ID), `scope` (Domain ID), `planned` (integer, MW). No parent.

**`wave`** fields: `year`, `sequenceNumber`, `implementationDate`. No parent.

### Operational Requirements

| Command | Action |
|---|---|
| `requirement list` | List (supports `--baseline`, `--edition`, filter flags) |
| `requirement show <itemId>` | Show latest version |
| `requirement show <itemId> --baseline <id>` | Show in baseline context |
| `requirement show <itemId> --edition <id>` | Show in edition context |
| `requirement create <title>` | Create |
| `requirement update <itemId> <expectedVersionId> <title>` | Full update (new version) |
| `requirement patch <itemId> <expectedVersionId>` | Partial update (new version) |
| `requirement delete <itemId>` | Delete all versions |
| `requirement versions <itemId>` | List version history |
| `requirement show-version <itemId> <versionNumber>` | Show specific version |

**`requirement list` filter flags**: `--type ON|OR`, `--drg`, `--title`, `--text`, `--path`, `--stakeholder-category <ids>`.

**`requirement create/update` options**: `--type`, `--drg`, `--statement`, `--rationale`, `--flows`, `--private-notes`, `--parent`, `--implemented-ons`, `--impacted-stakeholders`, `--impacted-domains`, `--maturity`, `--dependencies`, `--nfrs`.

### Operational Changes

| Command | Action |
|---|---|
| `change list` | List (supports `--baseline`, `--edition`, filter flags) |
| `change show <itemId>` | Show latest version |
| `change show <itemId> --baseline <id>` | Show in baseline context |
| `change show <itemId> --edition <id>` | Show in edition context |
| `change create <title>` | Create |
| `change update <itemId> <expectedVersionId> <title>` | Full update (new version) |
| `change patch <itemId> <expectedVersionId>` | Partial update (new version) |
| `change delete <itemId>` | Delete all versions |
| `change versions <itemId>` | List version history |
| `change show-version <itemId> <versionNumber>` | Show specific version |

**`change list` filter flags**: `--drg`, `--title`, `--text`, `--path`, `--stakeholder-category <ids>`.

**`change create/update` options**: `--purpose`, `--drg`, `--initial-state`, `--final-state`, `--details`, `--private-notes`, `--implements`, `--decommissions`, `--maturity`, `--cost`.

### Management Entities

| Command | Action |
|---|---|
| `baseline list` | List all baselines |
| `baseline show <id>` | Show baseline with item count |
| `baseline create` | Create (snapshot of current state) |
| `odp-edition list` | List all editions |
| `odp-edition show <id>` | Show edition |
| `odp-edition create` | Create edition |

### Import / Export

| Command | Action |
|---|---|
| `import extract-word --file <path>` | Extract raw JSON from `.docx` |
| `import extract-excel --file <path>` | Extract raw JSON from `.xlsx` |
| `import map --file <path> --drg <DRG> [--specific]` | Map raw JSON to structured JSON |
| `import structured --file <path> [--specific]` | Import structured JSON into database |
| `docx export --drg <DRG> --output <path>` | Export entities to `.docx` by DRG |

### Publication

| Command | Action |
|---|---|
| `publication antora --output <path> [--edition <id>]` | Generate Antora ZIP |
| `publication pdf --output <path> [--edition <id>]` | Generate PDF |
| `publication docx --output <path> [--edition <id>]` | Generate Word document |

---

## 4. Deleted Commands

The following command files were removed in the Edition 4 model update:

| File | Reason |
|---|---|
| `data-category.js` | `DataCategory` entity removed from model |
| `service.js` | `Service` entity removed from model |
| `document.js` | `Document` renamed to `ReferenceDocument`; replaced by `reference-document.js` |

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

`VersionedCommands` extends `BaseCommands` and adds: version history, show-version, baseline/edition context resolution, and abstract `_addCreateCommand` / `_addUpdateCommand` / `_addPatchCommand` hooks implemented by each subclass.

---

[← 06 Publication](06-Publication.md) | [08 Web Client →](08-Web-Client.md)