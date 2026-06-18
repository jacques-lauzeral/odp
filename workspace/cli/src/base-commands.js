// workspace/cli/src/base-commands.js - Updated BaseCommands with --edition support
import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';

/**
 * BaseCommands provides common CRUD commands for item management.
 * Handles standard operations with consistent error handling and output formatting.
 * Automatically includes user context headers for all API calls.
 * Supports configurable fields for different entity types.
 */
export class BaseCommands {
    constructor(itemName, urlPath, displayName, config, fieldConfig = null) {
        this.itemName = itemName; // for command naming (e.g., 'stakeholder-category')
        this.urlPath = urlPath; // for API path (e.g., 'stakeholder-categories')
        this.displayName = displayName; // for user messages (e.g., 'category')
        this.baseUrl = config.server.baseUrl;

        // Default field configuration for name/description entities
        this.fieldConfig = fieldConfig || {
            fields: ['name', 'description'],
            headers: ['ID', 'Name', 'Description'],
            colWidths: [10, 30, 50],
            createSignature: '<name> <description>',
            updateSignature: '<id> <name> <description>',
            hasParent: true
        };

        // argFields: fields populated from positional args (defaults to all fields)
        if (!this.fieldConfig.argFields) {
            this.fieldConfig.argFields = this.fieldConfig.fields;
        }
    }

    /**
     * Get user ID from global program options
     */
    getUserId() {
        // Access the commander program instance to get global options
        const program = this.getCurrentProgram();
        return program.opts().user;
    }

    /**
     * Get user role from global program options
     */
    getUserRole() {
        const program = this.getCurrentProgram();
        return program.opts().role;
    }

    /**
     * Get the current commander program instance
     */
    getCurrentProgram() {
        // Access the global program instance from commander
        return process.mainModule?.exports?.program || global.program || new Command();
    }

    /**
     * Create headers with user context for API calls
     */
    createHeaders() {
        const userId = this.getUserId();
        const userRole = this.getUserRole();
        const headers = {
            'Content-Type': 'application/json',
            'x-user-id': userId
        };
        if (userRole) headers['x-user-role'] = userRole;
        return headers;
    }

    /**
     * Creates and returns the item command with all CRUD subcommands
     */
    createCommands(program) {
        const itemCommand = new Command(this.itemName)
            .description(`Manage ${this.displayName}s`);

        this.addListCommand(itemCommand);
        this.addShowCommand(itemCommand);
        this.addCreateCommand(itemCommand);
        this.addUpdateCommand(itemCommand);
        this.addDeleteCommand(itemCommand);

        program.addCommand(itemCommand);
    }

    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s`)
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}`, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const items = await response.json();

                    if (items.length === 0) {
                        console.log(`No ${this.displayName}s found.`);
                        return;
                    }

                    const listHeaders = this.fieldConfig.hasParent
                        ? [...this.fieldConfig.headers, 'Parent ID']
                        : this.fieldConfig.headers;
                    const listColWidths = this.fieldConfig.hasParent
                        ? [...this.fieldConfig.colWidths, 12]
                        : this.fieldConfig.colWidths;

                    const table = new Table({
                        head: listHeaders,
                        colWidths: listColWidths
                    });

                    items.forEach(item => {
                        const row = [item.id];
                        this.fieldConfig.fields.forEach(field => {
                            row.push(item[field] ?? '');
                        });
                        if (this.fieldConfig.hasParent) row.push(item.parentId ?? '');
                        table.push(row);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error listing ${this.displayName}s:`, error.message);
                    process.exit(1);
                }
            });
    }

    addShowCommand(itemCommand) {
        itemCommand
            .command('show <id>')
            .description(`Show a specific ${this.displayName}`)
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const item = await response.json();

                    console.log(`ID: ${item.id}`);
                    this.fieldConfig.fields.forEach(field => {
                        const fieldName = field.charAt(0).toUpperCase() + field.slice(1);
                        console.log(`${fieldName}: ${item[field] ?? ''}`);
                    });
                    if (this.fieldConfig.hasParent) {
                        console.log(`Parent ID: ${item.parentId ?? '(none)'}`);
                    }
                } catch (error) {
                    console.error(`Error getting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    addCreateCommand(entityCommand) {
        const command = entityCommand
            .command(`create ${this.fieldConfig.createSignature}`)
            .description(`Create a new ${this.displayName}`);

        if (this.fieldConfig.hasParent) {
            command.option('--parent <id>', `Parent ${this.displayName} ID`);
        }

        if (this.fieldConfig.options) {
            this.fieldConfig.options.forEach(opt => command.option(opt.flag, opt.description));
        }

        const createCmd = command;
        command.action(async () => {
            try {
                const fieldValues = createCmd.args;
                const options = createCmd.opts();

                const data = {};
                this.fieldConfig.argFields.forEach((field, index) => {
                    const val = fieldValues[index];
                    data[field] = val !== undefined && /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val;
                });

                if (this.fieldConfig.hasParent) {
                    data.parentId = options.parent || null;
                }

                if (this.fieldConfig.options) {
                    this.fieldConfig.options.forEach(opt => {
                        const val = options[opt.field];
                        if (val === undefined || val === null) {
                            data[opt.field] = null;
                        } else if (opt.type === 'integer') {
                            data[opt.field] = parseInt(val, 10);
                        } else {
                            data[opt.field] = val || null;
                        }
                    });
                }

                const response = await fetch(`${this.baseUrl}/${this.urlPath}`, {
                    method: 'POST',
                    headers: this.createHeaders(),
                    body: JSON.stringify(data)
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                }

                const entity = await response.json();
                const displayField = this.fieldConfig.fields.includes('name') ? entity.name :
                    this.fieldConfig.fields.includes('title') ? entity.title :
                        entity[this.fieldConfig.fields[0]];
                console.log(`Created ${this.displayName}: ${displayField} (ID: ${entity.id})`);
            } catch (error) {
                console.error(`Error creating ${this.displayName}:`, error.message);
                process.exit(1);
            }
        });
    }

    addUpdateCommand(entityCommand) {
        const command = entityCommand
            .command(`update ${this.fieldConfig.updateSignature}`)
            .description(`Update a ${this.displayName}`);

        if (this.fieldConfig.hasParent) {
            command.option('--parent <id>', `Parent ${this.displayName} ID`);
        }

        if (this.fieldConfig.options) {
            this.fieldConfig.options.forEach(opt => command.option(opt.flag, opt.description));
        }

        const updateCmd = command;
        command.action(async () => {
            try {
                const allValues = updateCmd.args;
                const options = updateCmd.opts();
                const id = allValues[0];
                const fieldValues = allValues.slice(1);

                const data = { id };
                this.fieldConfig.argFields.forEach((field, index) => {
                    const val = fieldValues[index];
                    data[field] = val !== undefined && /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : val;
                });

                if (this.fieldConfig.hasParent) {
                    data.parentId = options.parent || null;
                }

                if (this.fieldConfig.options) {
                    this.fieldConfig.options.forEach(opt => {
                        const val = options[opt.field];
                        if (val === undefined || val === null) {
                            data[opt.field] = null;
                        } else if (opt.type === 'integer') {
                            data[opt.field] = parseInt(val, 10);
                        } else {
                            data[opt.field] = val || null;
                        }
                    });
                }

                const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}`, {
                    method: 'PUT',
                    headers: this.createHeaders(),
                    body: JSON.stringify(data)
                });

                if (response.status === 404) {
                    console.error(`${this.displayName} with ID ${id} not found.`);
                    process.exit(1);
                }

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                }

                const entity = await response.json();
                const displayField = this.fieldConfig.fields.includes('name') ? entity.name :
                    this.fieldConfig.fields.includes('title') ? entity.title :
                        entity[this.fieldConfig.fields[0]];
                console.log(`Updated ${this.displayName}: ${displayField} (ID: ${entity.id})`);
            } catch (error) {
                console.error(`Error updating ${this.displayName}:`, error.message);
                process.exit(1);
            }
        });
    }

    addDeleteCommand(entityCommand) {
        entityCommand
            .command('delete <id>')
            .description(`Delete a ${this.displayName}`)
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}`, {
                        method: 'DELETE',
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (response.status === 409) {
                        console.error(`Cannot delete ${this.displayName} with ID ${id}: has dependencies.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    console.log(`Deleted ${this.displayName} with ID: ${id}`);
                } catch (error) {
                    console.error(`Error deleting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }
}

/**
 * VersionedCommands extends BaseCommands for versioned items (operational requirements/changes).
 * Adds version-specific operations and handles complex payloads.
 * Supports baseline and edition context for historical queries.
 */
export class VersionedCommands extends BaseCommands {
    constructor(itemName, urlPath, displayName, config) {
        super(itemName, urlPath, displayName, config);
    }

    /**
     * Build URL with optional edition context parameter.
     * Edition resolution happens server-side — CLI passes edition ID directly.
     */
    async buildContextUrl(baseUrl, options) {
        let url = baseUrl;
        let contextDisplay = '';

        if (options.edition) {
            url += `?edition=${options.edition}`;
            contextDisplay = ` (Edition ${options.edition})`;
        }

        return { url, contextDisplay };
    }

    /**
     * Override createCommands to add version-specific operations
     */
    createCommands(program) {
        const itemCommand = new Command(this.itemName)
            .description(`Manage ${this.displayName}s (versioned)`);

        this.addListCommand(itemCommand);
        this.addShowCommand(itemCommand);
        this.addShowVersionCommand(itemCommand);
        this._addCreateCommand(itemCommand);
        this._addUpdateCommand(itemCommand);
        this._addPatchCommand(itemCommand);
        this._addSoftDeleteCommand(itemCommand);
        this._addRestoreCommand(itemCommand);
        this._addInboundReferencesCommand(itemCommand);

        program.addCommand(itemCommand);
    }

    /**
     * Override list command for versioned items with edition support
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (repository or edition context)`)
            .option('--edition <id>', 'Show items in specified edition context')
            .option('--projection <projection>', 'Response projection: summary | standard (default: standard)', 'standard')
            .action(async (options) => {
                try {
                    if (!['summary', 'standard'].includes(options.projection)) {
                        console.error(`Invalid projection: ${options.projection}. Valid values: summary, standard`);
                        process.exit(1);
                    }

                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}`, options);
                    const separator = url.includes('?') ? '&' : '?';
                    const finalUrl = options.projection !== 'standard'
                        ? `${url}${separator}projection=${options.projection}`
                        : url;

                    const response = await fetch(finalUrl, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        if (response.status === 400) {
                            throw new Error(`Invalid edition ID in context`);
                        }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const items = await response.json();

                    if (items.length === 0) {
                        console.log(`No ${this.displayName}s found${contextDisplay}.`);
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Title', 'Version'],
                        colWidths: [10, 50, 10]
                    });

                    items.forEach(item => {
                        table.push([
                            item.itemId,
                            item.title,
                            item.version
                        ]);
                    });

                    const displayContext = contextDisplay || ' (Latest Versions)';
                    console.log(`${this.displayName}s${displayContext}:`);
                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error listing ${this.displayName}s:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override show command for versioned items with edition support
     */
    addShowCommand(itemCommand) {
        itemCommand
            .command('show <itemId>')
            .description(`Show a specific ${this.displayName} (repository or edition context)`)
            .option('--edition <id>', 'Show item in specified edition context')
            .option('--lifecycle-face <face>', 'Lifecycle dataset: active | released | decommissioned | deleted (default: active)')
            .option('--projection <projection>', 'Response projection: standard | extended (default: standard)', 'standard')
            .action(async (itemId, options) => {
                try {
                    if (!['standard', 'extended'].includes(options.projection)) {
                        console.error(`Invalid projection: ${options.projection}. Valid values: standard, extended`);
                        process.exit(1);
                    }

                    const lifecycleFace = this.resolveLifecycleFace(options);

                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}/${itemId}`, options);
                    const params = [];
                    if (lifecycleFace !== 'active') params.push(`lifecycleFace=${lifecycleFace}`);
                    if (options.projection !== 'standard') params.push(`projection=${options.projection}`);
                    const separator = url.includes('?') ? '&' : '?';
                    const finalUrl = params.length > 0 ? `${url}${separator}${params.join('&')}` : url;

                    const faceDisplay = lifecycleFace !== 'active' ? ` (Lifecycle: ${lifecycleFace})` : '';

                    const response = await fetch(finalUrl, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found${contextDisplay}${faceDisplay}.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        if (response.status === 400) {
                            throw new Error(`Invalid edition ID in context`);
                        }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const item = await response.json();

                    if (contextDisplay || faceDisplay) {
                        console.log(`=== ${this.displayName.toUpperCase()}${contextDisplay.toUpperCase()}${faceDisplay.toUpperCase()} ===`);
                    }

                    this.displayItemDetails(item);
                } catch (error) {
                    console.error(`Error getting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    addShowVersionCommand(itemCommand) {
        itemCommand
            .command('show-version <itemId> <versionNumber>')
            .description(`Show a specific version of ${this.displayName}`)
            .action(async (itemId, versionNumber) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/versions/${versionNumber}`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} version ${versionNumber} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const item = await response.json();
                    console.log(`=== ${this.displayName.toUpperCase()} VERSION ${versionNumber} ===`);
                    this.displayItemDetails(item);
                } catch (error) {
                    console.error(`Error getting ${this.displayName} version:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Helper method to add edition support to milestone commands
     */
    addEditionSupportToMilestoneCommand(command) {
        return command
            .option('--edition <id>', 'Show in specified edition context');
    }

    /**
     * Helper method to build milestone URL with context
     */
    async buildMilestoneContextUrl(baseUrl, options) {
        return await this.buildContextUrl(baseUrl, options);
    }

    /**
     * Format the four lifecycle flags into a compact label listing the true ones.
     * Returns e.g. 'active', 'active, released', 'deleted', or '—' if absent.
     */
    formatLifecycleStatus(lifecycleStatus) {
        if (!lifecycleStatus) return '—';
        const flags = ['active', 'released', 'decommissioned', 'deleted']
            .filter(f => lifecycleStatus[f]);
        return flags.length > 0 ? flags.join(', ') : '—';
    }

    /**
     * Validate a --lifecycle-face value and its exclusivity with edition/baseline.
     * Returns the face string ('active' default). Exits on invalid input.
     */
    resolveLifecycleFace(options) {
        const face = options.lifecycleFace || 'active';
        const valid = ['active', 'released', 'decommissioned', 'deleted'];
        if (!valid.includes(face)) {
            console.error(`Invalid lifecycle face: ${face}. Valid values: ${valid.join(', ')}`);
            process.exit(1);
        }
        if (face !== 'active' && (options.edition || options.baseline)) {
            console.error('--lifecycle-face (non-active) is mutually exclusive with --edition / --baseline');
            process.exit(1);
        }
        return face;
    }

    /**
     * Print a 409 lifecycle refusal: the state-guard message, plus the blocking
     * inbound-reference list as a table when the refusal is LIFECYCLE_BLOCKED.
     */
    printLifecycleConflict(body) {
        const code = body.error?.code;
        const message = body.error?.message || 'Lifecycle conflict';
        console.error(`Refused (${code || 'CONFLICT'}): ${message}`);
        if (Array.isArray(body.references) && body.references.length > 0) {
            const table = new Table({
                head: ['Ref ID', 'Type', 'Code', 'Title'],
                colWidths: [10, 6, 15, 40]
            });
            body.references.forEach(r => table.push([r.id, r.type, r.code || '—', r.title || '—']));
            console.error('Blocking references:');
            console.error(table.toString());
        }
    }

    _addSoftDeleteCommand(itemCommand) {
        itemCommand
            .command('delete <itemId>')
            .description(`Soft-delete a ${this.displayName} (move to recycle bin)`)
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (itemId, options) => {
                try {
                    const data = { changeSetId: options.changeSet };
                    if (options.commitNote) data.note = options.commitNote;

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/delete`, {
                        method: 'POST',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) {
                        const error = await response.json();
                        console.error(error.error?.message || `${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }
                    if (response.status === 409) {
                        const body = await response.json();
                        this.printLifecycleConflict(body);
                        process.exit(1);
                    }
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const item = await response.json();
                    console.log(`Soft-deleted ${this.displayName}: ${item.title} (ID: ${item.itemId})`);
                    console.log(`Lifecycle: ${this.formatLifecycleStatus(item.lifecycleStatus)}`);
                } catch (error) {
                    console.error(`Error deleting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    _addRestoreCommand(itemCommand) {
        itemCommand
            .command('restore <itemId>')
            .description(`Restore a soft-deleted ${this.displayName} from the recycle bin`)
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (itemId, options) => {
                try {
                    const data = { changeSetId: options.changeSet };
                    if (options.commitNote) data.note = options.commitNote;

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/restore`, {
                        method: 'POST',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) {
                        const error = await response.json();
                        console.error(error.error?.message || `${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }
                    if (response.status === 409) {
                        const body = await response.json();
                        this.printLifecycleConflict(body);
                        process.exit(1);
                    }
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const item = await response.json();
                    console.log(`Restored ${this.displayName}: ${item.title} (ID: ${item.itemId})`);
                    console.log(`Lifecycle: ${this.formatLifecycleStatus(item.lifecycleStatus)}`);
                } catch (error) {
                    console.error(`Error restoring ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    _addInboundReferencesCommand(itemCommand) {
        itemCommand
            .command('inbound-references <itemId>')
            .description(`List live O* items referencing this ${this.displayName} (where-used)`)
            .action(async (itemId) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/inbound-references`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const references = await response.json();

                    if (references.length === 0) {
                        console.log(`No live references to ${this.displayName} ${itemId}.`);
                        return;
                    }

                    const table = new Table({
                        head: ['Ref ID', 'Type', 'Code', 'Title'],
                        colWidths: [10, 6, 15, 45]
                    });
                    references.forEach(r => table.push([r.id, r.type, r.code || '—', r.title || '—']));
                    console.log(`Live references to ${this.displayName} ${itemId}:`);
                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error fetching inbound references for ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    _addCreateCommand(itemCommand) {
        throw new Error('_addCreateCommand must be implemented by concrete command');
    }

    _addUpdateCommand(itemCommand) {
        throw new Error('_addUpdateCommand must be implemented by concrete command');
    }

    _addPatchCommand(itemCommand) {
        throw new Error('_addPatchCommand must be implemented by concrete command');
    }

    /**
     * Display item details - override in subclasses for item-specific formatting
     */
    displayItemDetails(item) {
        console.log(`Item ID: ${item.itemId}`);
        console.log(`Title: ${item.title}`);
        console.log(`Version: ${item.version} (Version ID: ${item.versionId})`);
        console.log(`Lifecycle: ${this.formatLifecycleStatus(item.lifecycleStatus)}`);
    }
}