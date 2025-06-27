// workspace/cli/src/commands/baseline.js
import { Command } from 'commander';
import Table from 'cli-table3';
import fetch from 'node-fetch';

/**
 * BaselineCommands provides baseline-specific commands.
 * Baselines are immutable (create, list, show only - no update/delete).
 */
class BaselineCommands {
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
     * Creates and returns the baseline command with all subcommands
     */
    createCommands(program) {
        const baselineCommand = new Command('baseline')
            .description('Manage baselines (immutable deployment snapshots)');

        this.addListCommand(baselineCommand);
        this.addShowCommand(baselineCommand);
        this.addCreateCommand(baselineCommand);

        program.addCommand(baselineCommand);
    }

    addListCommand(baselineCommand) {
        baselineCommand
            .command('list')
            .description('List all baselines')
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/baselines`, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const baselines = await response.json();

                    if (baselines.length === 0) {
                        console.log('No baselines found.');
                        return;
                    }

                    const table = new Table({
                        head: ['ID', 'Title', 'Items', 'Created'],
                        colWidths: [10, 30, 10, 25]
                    });

                    baselines.forEach(baseline => {
                        table.push([
                            baseline.id,
                            baseline.title,
                            baseline.capturedItemCount || 0,
                            new Date(baseline.createdAt).toLocaleString()
                        ]);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing baselines:', error.message);
                    process.exit(1);
                }
            });
    }

    addShowCommand(baselineCommand) {
        baselineCommand
            .command('show <id>')
            .description('Show a specific baseline')
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/baselines/${id}`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`Baseline with ID ${id} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const baseline = await response.json();

                    console.log(`ID: ${baseline.id}`);
                    console.log(`Title: ${baseline.title}`);
                    console.log(`Created: ${new Date(baseline.createdAt).toLocaleString()} by ${baseline.createdBy}`);
                    console.log(`Captured Items: ${baseline.capturedItemCount || 0}`);
                } catch (error) {
                    console.error('Error getting baseline:', error.message);
                    process.exit(1);
                }
            });
    }

    addCreateCommand(baselineCommand) {
        baselineCommand
            .command('create <title>')
            .description('Create a new baseline (captures current state of all OR/OC)')
            .action(async (title) => {
                try {
                    const data = { title };

                    console.log('Creating baseline and capturing system state...');

                    const response = await fetch(`${this.baseUrl}/baselines`, {
                        method: 'POST',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const baseline = await response.json();

                    console.log(`✓ Created baseline: ${baseline.title} (ID: ${baseline.id})`);
                    console.log(`✓ Captured ${baseline.capturedItemCount || 0} operational items`);
                    console.log(`✓ Baseline created at: ${new Date(baseline.createdAt).toLocaleString()}`);
                } catch (error) {
                    console.error('Error creating baseline:', error.message);
                    process.exit(1);
                }
            });
    }
}

export function baselineCommands(program, config) {
    const commands = new BaselineCommands(config);
    commands.createCommands(program);
}