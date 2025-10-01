// workspace/cli/src/commands/odp-editions.js
import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';

/**
 * EditionCommands provides ODP Edition-specific commands.
 * ODP Editions are immutable (create, list, show only - no update/delete).
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
            .description('Manage ODP editions (operational deployment plan publications)');

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
            .description('List all ODP editions')
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
                        console.log('No ODP editions found.');
                        return;
                    }

                    const table = new Table({
                        head: ['ID', 'Title', 'From', 'Baseline', 'Created At', 'Created By'],
                        colWidths: [8, 25, 12, 15, 20, 15]
                    });

                    editions.forEach(edition => {
                        table.push([
                            edition.id,
                            edition.title,
                            edition.startsFromWave?.name || 'None',
                            edition.baseline?.id || 'None',
                            edition.createdAt ? new Date(edition.createdAt).toLocaleString() : 'N/A',
                            edition.createdBy || 'N/A'
                        ]);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing ODP editions:', error.message);
                    process.exit(1);
                }
            });
    }

    addShowCommand(editionCommand) {
        editionCommand
            .command('show <id>')
            .description('Show a specific ODP edition')
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions/${id}`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`ODP edition with ID ${id} not found.`);
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

                    if (edition.startsFromWave) {
                        const wave = edition.startsFromWave;
                        console.log(`Starts From Wave: ${wave.name} (${wave.year}.${wave.quarter}) - ${wave.date}`);
                    } else {
                        console.log('Starts From Waves: None');
                    }
                } catch (error) {
                    console.error('Error getting ODP edition:', error.message);
                    process.exit(1);
                }
            });
    }

    addCreateCommand(editionCommand) {
        editionCommand
            .command('create <title>')
            .description('Create a new ODP edition')
            .requiredOption('--from <waveId>', 'Waves ID that this edition starts from')
            .option('--type <type>', 'Edition type (DRAFT or OFFICIAL)', 'DRAFT')
            .option('--baseline <baselineId>', 'Baseline ID (auto-created if not provided)')
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        startsFromWaveId: parseInt(options.from, 10),
                        type: options.type
                    };

                    // Add baseline if provided
                    if (options.baseline) {
                        data.baselineId = parseInt(options.baseline, 10);
                    }

                    console.log('Creating ODP edition...');

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

                    console.log(`✓ Created ODP edition: ${edition.title} (ID: ${edition.id})`);
                    console.log(`✓ Type: ${edition.type}`);

                    if (edition.startsFromWave) {
                        console.log(`✓ Starts from wave: ${edition.startsFromWave.name}`);
                    }

                    if (edition.baseline) {
                        console.log(`✓ Using baseline: ${edition.baseline.title} (ID: ${edition.baseline.id})`);
                    }

                    if (edition.createdAt) {
                        console.log(`✓ Edition created at: ${new Date(edition.createdAt).toLocaleString()}`);
                    }
                } catch (error) {
                    console.error('Error creating ODP edition:', error.message);
                    process.exit(1);
                }
            });
    }

    addExportCommand(editionCommand) {
        editionCommand
            .command('export <id>')
            .description('Export a specific ODP edition as AsciiDoc')
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions/${id}/export`, {
                        headers: this.createExportHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`ODP edition with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const asciiDoc = await response.text();

                    // Output to stdout - let shell handle redirection
                    process.stdout.write(asciiDoc);
                } catch (error) {
                    console.error('Error exporting ODP edition:', error.message);
                    process.exit(1);
                }
            });
    }

    addExportAllCommand(editionCommand) {
        editionCommand
            .command('export-all')
            .description('Export entire ODP repository as AsciiDoc')
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/odp-editions/export`, {
                        headers: this.createExportHeaders()
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const asciiDoc = await response.text();

                    // Output to stdout - let shell handle redirection
                    process.stdout.write(asciiDoc);
                } catch (error) {
                    console.error('Error exporting ODP repository:', error.message);
                    process.exit(1);
                }
            });
    }
}

export function editionCommands(program, config) {
    const commands = new EditionCommands(config);
    commands.createCommands(program);
}