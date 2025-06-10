// workspace/cli/src/commands/operational-change.js
import { VersionedCommands } from './base-commands.js';
import Table from 'cli-table3';
import fetch from "node-fetch";

class OperationalChangeCommands extends VersionedCommands {
    constructor(config) {
        super(
            'change',
            'operational-changes',
            'operational change',
            config
        );
    }

    /**
     * Override displayItemDetails for operational changes
     */
    displayItemDetails(item) {
        super.displayItemDetails(item);

        console.log(`Description: ${item.description}`);
        console.log(`Visibility: ${item.visibility}`);

        // Display SATISFIES relationships
        if (item.satisfiesRequirements && item.satisfiesRequirements.length > 0) {
            console.log(`\nSatisfies Requirements:`);
            item.satisfiesRequirements.forEach(req => {
                console.log(`  - ${req.title} (${req.type}) [ID: ${req.id}]`);
            });
        }

        // Display SUPERSEDS relationships
        if (item.supersedsRequirements && item.supersedsRequirements.length > 0) {
            console.log(`\nSupersedes Requirements:`);
            item.supersedsRequirements.forEach(req => {
                console.log(`  - ${req.title} (${req.type}) [ID: ${req.id}]`);
            });
        }

        // Display milestones
        if (item.milestones && item.milestones.length > 0) {
            console.log(`\nMilestones:`);

            const table = new Table({
                head: ['Title', 'Description', 'Event Types', 'Wave'],
                colWidths: [15, 30, 25, 15]
            });

            item.milestones.forEach(milestone => {
                const eventTypes = milestone.eventTypes.join(', ');
                const wave = milestone.wave ?
                    `${milestone.wave.year}.${milestone.wave.quarter}` :
                    'Not targeted';

                table.push([
                    milestone.title,
                    milestone.description,
                    eventTypes,
                    wave
                ]);
            });

            console.log(table.toString());
        }
    }

    /**
     * Add milestones command specific to operational changes
     */
    createCommands(program) {
        super.createCommands(program);

        // Get the command that was just created
        const itemCommand = program.commands.find(cmd => cmd.name() === this.itemName);

        // Add milestones-specific command
        itemCommand
            .command('milestones <itemId>')
            .description(`Show milestones for ${this.displayName}`)
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

                    if (!item.milestones || item.milestones.length === 0) {
                        console.log(`No milestones found for ${this.displayName} ${itemId}.`);
                        return;
                    }

                    console.log(`Milestones for ${item.title} (Version ${item.version}):`);

                    item.milestones.forEach((milestone, index) => {
                        console.log(`\n${index + 1}. ${milestone.title}`);
                        console.log(`   Description: ${milestone.description}`);
                        console.log(`   Event Types: ${milestone.eventTypes.join(', ')}`);
                        if (milestone.wave) {
                            console.log(`   Target Wave: ${milestone.wave.year}.${milestone.wave.quarter} (${milestone.wave.date})`);
                        } else {
                            console.log(`   Target Wave: Not specified`);
                        }
                    });
                } catch (error) {
                    console.error(`Error fetching milestones:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Implement create command with minimal required fields
     */
    _addCreateCommand(itemCommand) {
        itemCommand
            .command('create <title>')
            .description(`Create a new ${this.displayName}`)
            .option('--description <description>', 'Description of the change', '')
            .option('--visibility <visibility>', 'Visibility (NM or NETWORK)', 'NETWORK')
            .option('--satisfies <requirement-ids...>', 'Requirement IDs that this change satisfies (space-separated)')
            .option('--supersedes <requirement-ids...>', 'Requirement IDs that this change supersedes (space-separated)')
            .action(async (title, options) => {
                try {
                    // Validate visibility
                    if (!['NM', 'NETWORK'].includes(options.visibility)) {
                        console.error('Visibility must be either "NM" or "NETWORK"');
                        process.exit(1);
                    }

                    const data = {
                        title,
                        description: options.description,
                        visibility: options.visibility,
                        satisfiesRequirements: options.satisfies || [],
                        supersedsRequirements: options.supersedes || [],
                        milestones: [] // Start with empty milestones
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
                    console.log(`Created ${this.displayName}: ${entity.title} (ID: ${entity.itemId})`);
                    console.log(`Version: ${entity.version} (Version ID: ${entity.versionId})`);
                } catch (error) {
                    console.error(`Error creating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Implement update command with version handling
     */
    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId> <title>')
            .description(`Update a ${this.displayName} (creates new version)`)
            .option('--description <description>', 'New description')
            .option('--visibility <visibility>', 'New visibility (NM or NETWORK)')
            .option('--satisfies <requirement-ids...>', 'Requirement IDs that this change satisfies')
            .option('--supersedes <requirement-ids...>', 'Requirement IDs that this change supersedes')
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    // Validate visibility if provided
                    if (options.visibility && !['NM', 'NETWORK'].includes(options.visibility)) {
                        console.error('Visibility must be either "NM" or "NETWORK"');
                        process.exit(1);
                    }

                    // Build update payload - server handles inheritance
                    const data = {
                        expectedVersionId,
                        title
                    };

                    // Only include optional fields that are being updated
                    if (options.description) data.description = options.description;
                    if (options.visibility) data.visibility = options.visibility;
                    if (options.satisfies) data.satisfiesRequirements = options.satisfies;
                    if (options.supersedes) data.supersedsRequirements = options.supersedes;

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}`, {
                        method: 'PUT',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }

                    if (response.status === 409) {
                        const error = await response.json();
                        console.error(`Version conflict: ${error.error?.message || 'Version has changed'}`);
                        console.error(`Use "show ${itemId}" to get current version ID and retry`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const entity = await response.json();
                    console.log(`Updated ${this.displayName}: ${entity.title} (ID: ${entity.itemId})`);
                    console.log(`New version: ${entity.version} (Version ID: ${entity.versionId})`);
                } catch (error) {
                    console.error(`Error updating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override createCommands to add delete command for versioned items
     */
    createCommands(program) {
        super.createCommands(program);

        // Get the command that was just created
        const itemCommand = program.commands.find(cmd => cmd.name() === this.itemName);

        // Add delete command for operational changes
        itemCommand
            .command('delete <itemId>')
            .description(`Delete ${this.displayName} (all versions)`)
            .action(async (itemId) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}`, {
                        method: 'DELETE',
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }

                    if (response.status === 409) {
                        console.error(`Cannot delete ${this.displayName} with ID ${itemId}: has dependencies.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    console.log(`Deleted ${this.displayName} with ID: ${itemId} (all versions)`);
                } catch (error) {
                    console.error(`Error deleting ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }
}

export function operationalChangeCommands(program, config) {
    const commands = new OperationalChangeCommands(config);
    commands.createCommands(program);
}