// workspace/cli/src/commands/odp-editions.js
import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';
import fs from 'fs';

/**
 * EditionCommands provides ODIP Edition-specific commands.
 * ODIP Editions are immutable (create, list, show only - no update/delete).
 */
class EditionCommands {
    constructor(config) {
        this.baseUrl = config.server.baseUrl;
    }

    /**
     * Get user ID from global program options
     */
    getUserId() {
        const program = this.getCurrentProgram();
        return program.opts().user;
    }

    /**
     * Get the current commander program instance
     */
    getCurrentProgram() {
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
     * Create headers for export (no Content-Type needed)
     */
    createExportHeaders() {
        const userId = this.getUserId();
        return {
            'x-user-id': userId
        };
    }

    /**
     * Creates and returns the odp command with all subcommands
     */
    createCommands(program) {
        const editionCommand = new Command('edition')
            .description('Manage ODIP editions (operational deployment plan publications)');

        this.addListCommand(editionCommand);
        this.addShowCommand(editionCommand);
        this.addCreateCommand(editionCommand);
        this.addExportCommand(editionCommand);
        this.addExportAllCommand(editionCommand);

        program.addCommand(editionCommand);
    }

    addListCommand(editionCommand) {
        editionCommand
            .command('list')
            .description('List all ODIP editions')
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions`, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const editions = await response.json();

                    if (editions.length === 0) {
                        console.log('No ODIP editions found.');
                        return;
                    }

                    const table = new Table({
                        head: ['ID', 'Title', 'Type', 'Start Date', 'Min Maturity', 'Baseline', 'Created At'],
                        colWidths: [8, 25, 10, 14, 14, 12, 20]
                    });

                    editions.forEach(edition => {
                        table.push([
                            edition.id,
                            edition.title,
                            edition.type,
                            edition.startDate || '—',
                            edition.minONMaturity || '—',
                            edition.baseline?.id || '—',
                            edition.createdAt ? new Date(edition.createdAt).toLocaleString() : '—'
                        ]);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing ODIP editions:', error.message);
                    process.exit(1);
                }
            });
    }

    addShowCommand(editionCommand) {
        editionCommand
            .command('show <id>')
            .description('Show a specific ODIP edition')
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions/${id}`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`ODIP edition with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const edition = await response.json();

                    console.log(`ID: ${edition.id}`);
                    console.log(`Title: ${edition.title}`);
                    console.log(`Type: ${edition.type}`);

                    if (edition.createdAt) {
                        const createdBy = edition.createdBy ? ` by ${edition.createdBy}` : '';
                        console.log(`Created: ${new Date(edition.createdAt).toLocaleString()}${createdBy}`);
                    }

                    if (edition.baseline) {
                        console.log(`Baseline: ${edition.baseline.title} (ID: ${edition.baseline.id})`);
                        if (edition.baseline.createdAt) {
                            console.log(`  Created: ${new Date(edition.baseline.createdAt).toLocaleString()}`);
                        }
                    } else {
                        console.log('Baseline: None');
                    }

                    if (edition.startDate) {
                        console.log(`Start Date: ${edition.startDate}`);
                    } else {
                        console.log('Start Date: —');
                    }
                    if (edition.minONMaturity) {
                        console.log(`Min ON Maturity: ${edition.minONMaturity}`);
                    }
                } catch (error) {
                    console.error('Error getting ODIP edition:', error.message);
                    process.exit(1);
                }
            });
    }

    addCreateCommand(editionCommand) {
        editionCommand
            .command('create <title>')
            .description('Create a new ODIP edition')
            .option('--from <date>', 'Start date lower bound for content filtering (yyyy-mm-dd, optional)')
            .option('--type <type>', 'Edition type: DRAFT | OFFICIAL (default: DRAFT)', 'DRAFT')
            .option('--baseline <baselineId>', 'Baseline ID (auto-created if not provided)')
            .option('--min-on-maturity <maturity>', 'Minimum ON maturity for content selection: DRAFT | ADVANCED | MATURE')
            .action(async (title, options) => {
                try {
                    if (!['DRAFT', 'OFFICIAL'].includes(options.type)) {
                        console.error(`Invalid type: ${options.type}. Valid values: DRAFT, OFFICIAL`);
                        process.exit(1);
                    }

                    if (options.minOnMaturity && !['DRAFT', 'ADVANCED', 'MATURE'].includes(options.minOnMaturity)) {
                        console.error(`Invalid --min-on-maturity: ${options.minOnMaturity}. Valid values: DRAFT, ADVANCED, MATURE`);
                        process.exit(1);
                    }

                    if (options.from && !/^\d{4}-\d{2}-\d{2}$/.test(options.from)) {
                        console.error(`Invalid --from date: ${options.from}. Expected format: yyyy-mm-dd`);
                        process.exit(1);
                    }

                    const data = { title, type: options.type };

                    if (options.from) {
                        data.startDate = options.from;
                    }
                    if (options.baseline) {
                        data.baselineId = parseInt(options.baseline, 10);
                    }
                    if (options.minOnMaturity) {
                        data.minONMaturity = options.minOnMaturity;
                    }

                    console.log('Creating ODIP edition...');

                    const response = await fetch(`${this.baseUrl}/odp-editions`, {
                        method: 'POST',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const edition = await response.json();

                    console.log(`✓ Created ODIP edition: ${edition.title} (ID: ${edition.id})`);
                    console.log(`✓ Type: ${edition.type}`);

                    if (edition.startDate) {
                        console.log(`✓ Start date: ${edition.startDate}`);
                    }
                    if (edition.minONMaturity) {
                        console.log(`✓ Min ON maturity: ${edition.minONMaturity}`);
                    }
                    if (edition.baseline) {
                        console.log(`✓ Using baseline: ${edition.baseline.title} (ID: ${edition.baseline.id})`);
                    }
                    if (edition.createdAt) {
                        console.log(`✓ Created at: ${new Date(edition.createdAt).toLocaleString()}`);
                    }
                } catch (error) {
                    console.error('Error creating ODIP edition:', error.message);
                    process.exit(1);
                }
            });
    }

    addExportCommand(editionCommand) {
        editionCommand
            .command('export <id>')
            .description('Export a specific ODIP edition as ZIP archive')
            .requiredOption('-o, --output <path>', 'Output file path for ZIP archive')
            .action(async (id, options) => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions/${id}/export`, {
                        headers: this.createExportHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`ODIP edition with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const zipBuffer = await response.buffer();

                    // Write ZIP to file
                    fs.writeFileSync(options.output, zipBuffer);
                    console.log(`✓ Edition exported to: ${options.output}`);
                } catch (error) {
                    console.error('Error exporting ODIP edition:', error.message);
                    process.exit(1);
                }
            });
    }

    addExportAllCommand(editionCommand) {
        editionCommand
            .command('export-all')
            .description('Export entire ODIP repository as ZIP archive')
            .requiredOption('-o, --output <path>', 'Output file path for ZIP archive')
            .action(async (options) => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions/export`, {
                        headers: this.createExportHeaders()
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const zipBuffer = await response.buffer();

                    // Write ZIP to file
                    fs.writeFileSync(options.output, zipBuffer);
                    console.log(`✓ Repository exported to: ${options.output}`);
                } catch (error) {
                    console.error('Error exporting ODIP repository:', error.message);
                    process.exit(1);
                }
            });
    }
}

export function editionCommands(program, config) {
    const commands = new EditionCommands(config);
    commands.createCommands(program);
}