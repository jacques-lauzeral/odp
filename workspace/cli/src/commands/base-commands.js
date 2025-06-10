// workspace/cli/src/base-commands.js - Updated BaseCommands with user header support
import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';

/**
 * BaseCommands provides common CRUD commands for item management.
 * Handles standard operations with consistent error handling and output formatting.
 * Automatically includes user context headers for all API calls.
 */
export class BaseCommands {
    constructor(itemName, urlPath, displayName, config) {
        this.itemName = itemName; // for command naming (e.g., 'stakeholder-category')
        this.urlPath = urlPath; // for API path (e.g., 'stakeholder-categories')
        this.displayName = displayName; // for user messages (e.g., 'category')
        this.baseUrl = config.server.baseUrl;
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
                        head: ['ID', 'Name', 'Description'],
                        colWidths: [10, 30, 50]
                    });

                    items.forEach(item => {
                        table.push([
                            item.id,
                            item.name,
                            item.description
                        ]);
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
                    console.log(`Name: ${item.name}`);
                    console.log(`Description: ${item.description}`);
                } catch (error) {
                    console.error(`Error getting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    addCreateCommand(entityCommand) {
        entityCommand
            .command('create <name> <description>')
            .description(`Create a new ${this.displayName}`)
            .option('--parent <id>', `Parent ${this.displayName} ID`)
            .action(async (name, description, options) => {
                try {
                    const data = {
                        name,
                        description,
                        parentId: options.parent || null
                    };

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
                    console.log(`Created ${this.displayName}: ${entity.name} (ID: ${entity.id})`);
                } catch (error) {
                    console.error(`Error creating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    addUpdateCommand(entityCommand) {
        entityCommand
            .command('update <id> <name> <description>')
            .description(`Update a ${this.displayName}`)
            .option('--parent <id>', `Parent ${this.displayName} ID`)
            .action(async (id, name, description, options) => {
                try {
                    const data = {
                        id,
                        name,
                        description,
                        parentId: options.parent || null
                    };

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
                    console.log(`Updated ${this.displayName}: ${entity.name} (ID: ${entity.id})`);
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
 */
export class VersionedCommands extends BaseCommands {
    constructor(itemName, urlPath, displayName, config) {
        super(itemName, urlPath, displayName, config);
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
        // TODO: Add create/update commands with complex payload handling
        this._addCreateCommand(itemCommand);
        this._addUpdateCommand(itemCommand);

        program.addCommand(itemCommand);
    }

    /**
     * Override list command for versioned items
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (latest versions)`)
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

                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error listing ${this.displayName}s:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override show command for versioned items
     */
    addShowCommand(itemCommand) {
        itemCommand
            .command('show <itemId>')
            .description(`Show a specific ${this.displayName} (latest version)`)
            .action(async (itemId) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const item = await response.json();
                    this.displayItemDetails(item);
                } catch (error) {
                    console.error(`Error getting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

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

    _addCreateCommand(itemCommand) {
        throw new Error('_addCreateCommand must be implemented by concrete command');
    }

    _addUpdateCommand(itemCommand) {
        throw new Error('_addUpdateCommand must be implemented by concrete command');
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

