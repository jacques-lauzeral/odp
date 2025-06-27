// workspace/cli/src/commands/operational-change.js - Updated with --edition support
import { VersionedCommands } from '../base-commands.js';  // Fixed: was './base-commands.js'
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
                head: ['ID', 'Title', 'Description', 'Event Types', 'Wave'],
                colWidths: [15, 20, 30, 25, 15]
            });

            item.milestones.forEach(milestone => {
                const eventTypes = milestone.eventTypes?.join(', ') || '';
                const wave = milestone.wave ?
                    `${milestone.wave.year}.${milestone.wave.quarter}` :
                    'Not targeted';

                table.push([
                    milestone.id,
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
            .description(`Update a ${this.displayName} (creates new version with complete replacement)`)
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

                    // Build complete update payload
                    const data = {
                        expectedVersionId,
                        title,
                        description: options.description || '',
                        visibility: options.visibility || 'NETWORK',
                        satisfiesRequirements: options.satisfies || [],
                        supersedsRequirements: options.supersedes || [],
                        milestones: [] // Reset milestones in full update
                    };

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
     * Implement patch command with partial updates
     */
    _addPatchCommand(itemCommand) {
        itemCommand
            .command('patch <itemId> <expectedVersionId>')
            .description(`Patch a ${this.displayName} (partial update, creates new version)`)
            .option('--title <title>', 'New title')
            .option('--description <description>', 'New description')
            .option('--visibility <visibility>', 'New visibility (NM or NETWORK)')
            .option('--satisfies <requirement-ids...>', 'Requirement IDs that this change satisfies')
            .option('--supersedes <requirement-ids...>', 'Requirement IDs that this change supersedes')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    // Validate visibility if provided
                    if (options.visibility && !['NM', 'NETWORK'].includes(options.visibility)) {
                        console.error('Visibility must be either "NM" or "NETWORK"');
                        process.exit(1);
                    }

                    // Build patch payload with only provided fields
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.description) data.description = options.description;
                    if (options.visibility) data.visibility = options.visibility;
                    if (options.satisfies) data.satisfiesRequirements = options.satisfies;
                    if (options.supersedes) data.supersedsRequirements = options.supersedes;

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}`, {
                        method: 'PATCH',
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
                    console.log(`Patched ${this.displayName}: ${entity.title} (ID: ${entity.itemId})`);
                    console.log(`New version: ${entity.version} (Version ID: ${entity.versionId})`);
                } catch (error) {
                    console.error(`Error patching ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Add milestone commands specific to operational changes with edition support
     */
    _addMilestoneCommands(itemCommand) {
        // Milestone list command with baseline and edition support
        const milestoneListCommand = itemCommand
            .command('milestone-list <itemId>')
            .description(`List milestones for ${this.displayName}`);

        this.addEditionSupportToMilestoneCommand(milestoneListCommand);

        milestoneListCommand.action(async (itemId, options) => {
            try {
                const { url, contextDisplay } = await this.buildMilestoneContextUrl(
                    `${this.baseUrl}/${this.urlPath}/${itemId}/milestones`,
                    options
                );

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

                const milestones = await response.json();

                if (milestones.length === 0) {
                    console.log(`No milestones found for ${this.displayName} ${itemId}${contextDisplay}.`);
                    return;
                }

                const table = new Table({
                    head: ['ID', 'Title', 'Description', 'Event Types', 'Wave'],
                    colWidths: [15, 20, 30, 25, 15]
                });

                milestones.forEach(milestone => {
                    const eventTypes = milestone.eventTypes?.join(', ') || '';
                    const wave = milestone.wave ?
                        `${milestone.wave.year}.${milestone.wave.quarter}` :
                        'Not targeted';

                    table.push([
                        milestone.id,
                        milestone.title,
                        milestone.description,
                        eventTypes,
                        wave
                    ]);
                });

                const displayContext = contextDisplay || '';
                console.log(`Milestones for ${this.displayName} ${itemId}${displayContext}:`);
                console.log(table.toString());
            } catch (error) {
                console.error(`Error listing milestones:`, error.message);
                process.exit(1);
            }
        });

        // Milestone show command with baseline and edition support
        const milestoneShowCommand = itemCommand
            .command('milestone-show <itemId> <milestoneId>')
            .description(`Show specific milestone`);

        this.addEditionSupportToMilestoneCommand(milestoneShowCommand);

        milestoneShowCommand.action(async (itemId, milestoneId, options) => {
            try {
                const { url, contextDisplay } = await this.buildMilestoneContextUrl(
                    `${this.baseUrl}/${this.urlPath}/${itemId}/milestones/${milestoneId}`,
                    options
                );

                const response = await fetch(url, {
                    headers: this.createHeaders()
                });

                if (response.status === 404) {
                    const error = await response.json();
                    console.error(`Error: ${error.error?.message || 'Not found'}`);
                    process.exit(1);
                }

                if (!response.ok) {
                    if (response.status === 400) {
                        throw new Error(`Invalid baseline or wave ID in context`);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const milestone = await response.json();

                if (contextDisplay) {
                    console.log(`=== MILESTONE${contextDisplay.toUpperCase()} ===`);
                }

                console.log(`Milestone ID: ${milestone.id}`);
                console.log(`Title: ${milestone.title}`);
                console.log(`Description: ${milestone.description}`);
                console.log(`Event Types: ${milestone.eventTypes?.join(', ') || 'None'}`);
                if (milestone.wave) {
                    console.log(`Target Wave: ${milestone.wave.year}.${milestone.wave.quarter} (${milestone.wave.date})`);
                } else {
                    console.log(`Target Wave: Not specified`);
                }
            } catch (error) {
                console.error(`Error fetching milestone:`, error.message);
                process.exit(1);
            }
        });

        // Milestone add command (no edition support - write operation)
        itemCommand
            .command('milestone-add <itemId> <expectedVersionId> <title> <description>')
            .description(`Add milestone to ${this.displayName} (creates new version)`)
            .option('--event-types <types...>', 'Event types (API_PUBLICATION, API_TEST_DEPLOYMENT, UI_TEST_DEPLOYMENT, SERVICE_ACTIVATION, API_DECOMMISSIONING, OTHER)')
            .option('--wave <waveId>', 'Target wave ID')
            .action(async (itemId, expectedVersionId, title, description, options) => {
                try {
                    const data = {
                        expectedVersionId,
                        title,
                        description,
                        eventTypes: options.eventTypes || []
                    };

                    if (options.wave) {
                        data.waveId = options.wave;
                    }

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/milestones`, {
                        method: 'POST',
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

                    const milestone = await response.json();
                    console.log(`Added milestone: ${milestone.title} (ID: ${milestone.id})`);
                    console.log(`${this.displayName} updated to new version`);
                } catch (error) {
                    console.error(`Error adding milestone:`, error.message);
                    process.exit(1);
                }
            });

        // Milestone update command (no edition support - write operation)
        itemCommand
            .command('milestone-update <itemId> <milestoneId> <expectedVersionId>')
            .description(`Update milestone (creates new version)`)
            .option('--title <title>', 'New title')
            .option('--description <description>', 'New description')
            .option('--event-types <types...>', 'New event types')
            .option('--wave <waveId>', 'New target wave ID')
            .action(async (itemId, milestoneId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.description) data.description = options.description;
                    if (options.eventTypes) data.eventTypes = options.eventTypes;
                    if (options.wave) data.waveId = options.wave;

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/milestones/${milestoneId}`, {
                        method: 'PUT',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) {
                        const error = await response.json();
                        console.error(`Error: ${error.error?.message || 'Not found'}`);
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

                    const milestone = await response.json();
                    console.log(`Updated milestone: ${milestone.title} (ID: ${milestone.id})`);
                    console.log(`${this.displayName} updated to new version`);
                } catch (error) {
                    console.error(`Error updating milestone:`, error.message);
                    process.exit(1);
                }
            });

        // Milestone delete command (no edition support - write operation)
        itemCommand
            .command('milestone-delete <itemId> <milestoneId> <expectedVersionId>')
            .description(`Delete milestone (creates new version)`)
            .action(async (itemId, milestoneId, expectedVersionId) => {
                try {
                    const data = { expectedVersionId };

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/milestones/${milestoneId}`, {
                        method: 'DELETE',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) {
                        const error = await response.json();
                        console.error(`Error: ${error.error?.message || 'Not found'}`);
                        process.exit(1);
                    }

                    if (response.status === 409) {
                        const error = await response.json();
                        console.error(`Version conflict: ${error.error?.message || 'Version has changed'}`);
                        console.error(`Use "show ${itemId}" to get current version ID and retry`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    console.log(`Deleted milestone with ID: ${milestoneId}`);
                    console.log(`${this.displayName} updated to new version`);
                } catch (error) {
                    console.error(`Error deleting milestone:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override createCommands to add patch and milestone commands
     */
    createCommands(program) {
        super.createCommands(program);

        // Get the command that was just created
        const itemCommand = program.commands.find(cmd => cmd.name() === this.itemName);

        // Add milestone commands
        this._addMilestoneCommands(itemCommand);

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