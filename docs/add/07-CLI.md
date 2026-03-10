# Chapter 06 – CLI

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

All setup entity commands follow the same pattern. Hierarchy-aware entities (`stakeholder-category`, `data-category`, `service`) support `--parent` on create/update.

| Command | Action |
|---|---|
| `stakeholder-category list` | List all |
| `stakeholder-category show <id>` | Show single |
| `stakeholder-category create` | Interactive create |
| `stakeholder-category update <id>` | Interactive update |
| `stakeholder-category delete <id>` | Delete |
| *(same pattern for `data-category`, `service`, `wave`, `document`)* | |

### Operational Requirements

| Command | Action |
|---|---|
| `requirement list` | List (supports `--baseline`, `--from-wave`, filter flags) |
| `requirement show <id>` | Show latest version |
| `requirement create` | Interactive create |
| `requirement update <id>` | Interactive update (requires current version ID) |
| `requirement patch <id>` | Partial update |
| `requirement delete <id>` | Delete |
| `requirement versions <id>` | List version history |
| `requirement version <id> <num>` | Show specific version |

### Operational Changes

| Command | Action |
|---|---|
| `change list` | List (supports `--baseline`, `--from-wave`, filter flags) |
| `change show <id>` | Show latest version |
| `change create` | Interactive create |
| `change update <id>` | Interactive update |
| `change patch <id>` | Partial update |
| `change delete <id>` | Delete |
| `change versions <id>` | List version history |
| `change milestone-list <id>` | List milestones |
| `change milestone-add <id>` | Add milestone |
| `change milestone-update <id> <milestoneKey>` | Update milestone |
| `change milestone-delete <id> <milestoneKey>` | Delete milestone |

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
| `edition export <id> --output <path>` | Export ODIP edition as AsciiDoc ZIP |

### Publication

| Command | Action |
|---|---|
| `publication generate <id>` | Generate publication artefacts for an edition |

---

## 4. Interactive Modes

Create and update commands for complex entities (requirements, changes) run in interactive mode — they prompt for each field in sequence rather than requiring all values as flags. This is particularly useful for rich text fields and relationship arrays, which are impractical to pass as command-line arguments.

---

[← 06 Publication](06-Publication.md) | [08 Web Client →](08-Web-Client.md)