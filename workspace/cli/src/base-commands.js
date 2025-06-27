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
        return {
            'Content-Type': 'application/json',
            'x-user-id': userId
        };
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

                    const table = new Table({
                        head: this.fieldConfig.headers,
                        colWidths: this.fieldConfig.colWidths
                    });

                    items.forEach(item => {
                        const row = [item.id];
                        this.fieldConfig.fields.forEach(field => {
                            row.push(item[field]);
                        });
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
                        console.log(`${fieldName}: ${item[field]}`);
                    });
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

        command.action(async (...args) => {
            try {
                const options = args[args.length - 1];
                const fieldValues = args.slice(0, -1);

                const data = {};
                this.fieldConfig.fields.forEach((field, index) => {
                    data[field] = fieldValues[index];
                });

                if (this.fieldConfig.hasParent) {
                    data.parentId = options.parent || null;
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

        command.action(async (...args) => {
            try {
                const options = args[args.length - 1];
                const allValues = args.slice(0, -1);
                const id = allValues[0];
                const fieldValues = allValues.slice(1);

                const data = { id };
                this.fieldConfig.fields.forEach((field, index) => {
                    data[field] = fieldValues[index];
                });

                if (this.fieldConfig.hasParent) {
                    data.parentId = options.parent || null;
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
     * Resolve edition to baseline and fromWave parameters
     */
    async resolveEditionContext(editionId) {
        try {
            const response = await fetch(`${this.baseUrl}/odp-editions/${editionId}`, {
                headers: this.createHeaders()
            });

            if (response.status === 404) {
                throw new Error(`Edition with ID ${editionId} not found`);
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const edition = await response.json();
            return {
                baselineId: edition.baseline?.id,
                fromWaveId: edition.startsFromWave?.id,
                editionTitle: edition.title
            };
        } catch (error) {
            throw new Error(`Error resolving edition: ${error.message}`);
        }
    }

    /**
     * Build URL with context parameters (baseline/fromWave from edition or direct params)
     */
    async buildContextUrl(baseUrl, options) {
        let url = baseUrl;
        let contextDisplay = '';

        // Validate mutual exclusivity
        if (options.baseline && options.edition) {
            throw new Error('Cannot use both --baseline and --edition options together');
        }

        if (options.edition) {
            // Resolve edition to baseline + fromWave
            const context = await this.resolveEditionContext(options.edition);
            const params = [];

            if (context.baselineId) {
                params.push(`baseline=${context.baselineId}`);
            }
            if (context.fromWaveId) {
                params.push(`fromWave=${context.fromWaveId}`);
            }

            if (params.length > 0) {
                url += `?${params.join('&')}`;
            }

            contextDisplay = ` (Edition ${options.edition})`;
        } else if (options.baseline) {
            // Direct baseline parameter
            url += `?baseline=${options.baseline}`;
            contextDisplay = ` (Baseline ${options.baseline})`;
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
        this.addVersionsCommand(itemCommand);
        this.addShowVersionCommand(itemCommand);
        this._addCreateCommand(itemCommand);
        this._addUpdateCommand(itemCommand);
        this._addPatchCommand(itemCommand);

        program.addCommand(itemCommand);
    }

    /**
     * Override list command for versioned items with baseline and edition support
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (latest versions, baseline context, or edition context)`)
            .option('--baseline <id>', 'Show items as they existed in specified baseline')
            .option('--edition <id>', 'Show items in specified edition context (mutually exclusive with --baseline)')
            .action(async (options) => {
                try {
                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}`, options);

                    const response = await fetch(url, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        if (response.status === 400) {
                            throw new Error(`Invalid baseline or wave ID in context`);
                        }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const items = await response.json();

                    if (items.length === 0) {
                        console.log(`No ${this.displayName}s found${contextDisplay}.`);
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Title', 'Version', 'Created By'],
                        colWidths: [10, 40, 10, 20]
                    });

                    items.forEach(item => {
                        table.push([
                            item.itemId,
                            item.title,
                            item.version,
                            item.createdBy
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
     * Override show command for versioned items with baseline and edition support
     */
    addShowCommand(itemCommand) {
        itemCommand
            .command('show <itemId>')
            .description(`Show a specific ${this.displayName} (latest version, baseline context, or edition context)`)
            .option('--baseline <id>', 'Show item as it existed in specified baseline')
            .option('--edition <id>', 'Show item in specified edition context (mutually exclusive with --baseline)')
            .action(async (itemId, options) => {
                try {
                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}/${itemId}`, options);

                    const response = await fetch(url, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found${contextDisplay}.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        if (response.status === 400) {
                            throw new Error(`Invalid baseline or wave ID in context`);
                        }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const item = await response.json();

                    if (contextDisplay) {
                        console.log(`=== ${this.displayName.toUpperCase()}${contextDisplay.toUpperCase()} ===`);
                    }

                    this.displayItemDetails(item);
                } catch (error) {
                    console.error(`Error getting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    // Keep existing versions and show-version commands unchanged
    addVersionsCommand(itemCommand) {
        itemCommand
            .command('versions <itemId>')
            .description(`Show version history for ${this.displayName}`)
            .action(async (itemId) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/versions`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const versions = await response.json();

                    const table = new Table({
                        head: ['Version', 'Version ID', 'Created At', 'Created By'],
                        colWidths: [10, 15, 25, 20]
                    });

                    versions.forEach(version => {
                        table.push([
                            version.version,
                            version.versionId,
                            new Date(version.createdAt).toLocaleString(),
                            version.createdBy
                        ]);
                    });

                    console.log(`Version history for ${this.displayName} ${itemId}:`);
                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error fetching version history:`, error.message);
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
            .option('--baseline <id>', 'Show as it existed in specified baseline')
            .option('--edition <id>', 'Show in specified edition context (mutually exclusive with --baseline)');
    }

    /**
     * Helper method to build milestone URL with context
     */
    async buildMilestoneContextUrl(baseUrl, options) {
        return await this.buildContextUrl(baseUrl, options);
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
        console.log(`Created: ${new Date(item.createdAt).toLocaleString()} by ${item.createdBy}`);
    }
}