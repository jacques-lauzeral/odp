import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';

/**
 * BaseCommands provides common CRUD commands for entity management.
 * Handles standard operations with consistent error handling and output formatting.
 */
export class BaseCommands {
    constructor(entityName, urlPath, displayName, config) {
        this.entityName = entityName; // for command naming (e.g., 'stakeholder-category')
        this.urlPath = urlPath; // for API path (e.g., 'stakeholder-categories')
        this.displayName = displayName; // for user messages (e.g., 'category')
        this.baseUrl = config.server.baseUrl;
    }

    /**
     * Creates and returns the entity command with all CRUD subcommands
     */
    createCommands(program) {
        const entityCommand = new Command(this.entityName)
            .description(`Manage ${this.displayName}s`);

        this.addListCommand(entityCommand);
        this.addShowCommand(entityCommand);
        this.addCreateCommand(entityCommand);
        this.addUpdateCommand(entityCommand);
        this.addDeleteCommand(entityCommand);

        program.addCommand(entityCommand);
    }

    addListCommand(entityCommand) {
        entityCommand
            .command('list')
            .description(`List all ${this.displayName}s`)
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}`);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const entities = await response.json();

                    if (entities.length === 0) {
                        console.log(`No ${this.displayName}s found.`);
                        return;
                    }

                    const table = new Table({
                        head: ['ID', 'Name', 'Description'],
                        colWidths: [10, 30, 50]
                    });

                    entities.forEach(entity => {
                        table.push([
                            entity.id,
                            entity.name,
                            entity.description
                        ]);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error listing ${this.displayName}s:`, error.message);
                    process.exit(1);
                }
            });
    }

    addShowCommand(entityCommand) {
        entityCommand
            .command('show <id>')
            .description(`Show a specific ${this.displayName}`)
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}`);

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const entity = await response.json();

                    console.log(`ID: ${entity.id}`);
                    console.log(`Name: ${entity.name}`);
                    console.log(`Description: ${entity.description}`);
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
                        headers: {
                            'Content-Type': 'application/json',
                        },
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
                        headers: {
                            'Content-Type': 'application/json',
                        },
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
                        method: 'DELETE'
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