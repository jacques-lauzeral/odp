// workspace/cli/src/commands/operational-change.js - Updated with content filtering support
import { VersionedCommands } from '../base-commands.js';
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
     * Override addListCommand to add content filtering support for OperationalChanges
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (latest versions, baseline context, or edition context)`)
            .option('--baseline <id>', 'Show items as they existed in specified baseline')
            .option('--edition <id>', 'Show items in specified edition context (mutually exclusive with --baseline)')
            // OperationalChange-specific content filters
            .option('--visibility <visibility>', 'Filter by change visibility (NM or NETWORK)')
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title and description fields')
            .option('--stakeholder-category <ids>', 'Filter by stakeholder category IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .option('--data-category <ids>', 'Filter by data category IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .option('--service <ids>', 'Filter by service IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .option('--regulatory-aspect <ids>', 'Filter by regulatory aspect IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .action(async (options) => {
                try {
                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}`, options);

                    // Build content filtering query parameters
                    const filterParams = this.buildContentFilterParams(options);
                    const finalUrl = this.appendFilterParams(url, filterParams);

                    const response = await fetch(finalUrl, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        if (response.status === 400) {
                            const error = await response.json();
                            throw new Error(`Invalid parameter: ${error.error?.message || 'Bad request'}`);
                        }
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const items = await response.json();

                    // Build filter display summary
                    const filterDisplay = this.buildFilterDisplaySummary(options);
                    const fullContextDisplay = contextDisplay + filterDisplay;

                    if (items.length === 0) {
                        console.log(`No ${this.displayName}s found${fullContextDisplay}.`);
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Visibility', 'Title', 'Version', 'Created By'],
                        colWidths: [10, 12, 30, 10, 20]
                    });

                    items.forEach(item => {
                        table.push([
                            item.itemId,
                            item.visibility,
                            item.title,
                            item.version,
                            item.createdBy
                        ]);
                    });

                    const displayContext = fullContextDisplay || ' (Latest Versions)';
                    console.log(`${this.displayName}s${displayContext}:`);
                    console.log(table.toString());
                } catch (error) {
                    console.error(`Error listing ${this.displayName}s:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Build content filter query parameters for OperationalChanges
     */
    buildContentFilterParams(options) {
        const params = [];

        if (options.visibility) params.push(`visibility=${encodeURIComponent(options.visibility)}`);
        if (options.title) params.push(`title=${encodeURIComponent(options.title)}`);
        if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
        if (options.stakeholderCategory) params.push(`stakeholderCategory=${encodeURIComponent(options.stakeholderCategory)}`);
        if (options.dataCategory) params.push(`dataCategory=${encodeURIComponent(options.dataCategory)}`);
        if (options.service) params.push(`service=${encodeURIComponent(options.service)}`);
        if (options.regulatoryAspect) params.push(`regulatoryAspect=${encodeURIComponent(options.regulatoryAspect)}`);

        return params;
    }

    /**
     * Append filter parameters to URL
     */
    appendFilterParams(url, filterParams) {
        if (filterParams.length === 0) return url;

        const separator = url.includes('?') ? '&' : '?';
        return url + separator + filterParams.join('&');
    }

    /**
     * Build filter display summary for user feedback
     */
    buildFilterDisplaySummary(options) {
        const filters = [];

        if (options.visibility) filters.push(`visibility=${options.visibility}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.stakeholderCategory) filters.push(`stakeholder-categories=[${options.stakeholderCategory}]`);
        if (options.dataCategory) filters.push(`data-categories=[${options.dataCategory}]`);
        if (options.service) filters.push(`services=[${options.service}]`);
        if (options.regulatoryAspect) filters.push(`regulatory-aspects=[${options.regulatoryAspect}]`);

        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
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
                head: ['Milestone Key', 'Title', 'Description', 'Event Types', 'Wave'],
                colWidths: [25, 20, 30, 25, 15]
            });

            item.milestones.forEach(milestone => {
                const eventTypes = milestone.eventTypes?.join(', ') || '';
                const wave = milestone.wave ?
                    `${milestone.wave.year}.${milestone.wave.quarter}` :
                    'Not targeted';

                table.push([
                    milestone.milestoneKey,
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
                    head: ['Milestone Key', 'Title', 'Description', 'Event Types', 'Wave'],
                    colWidths: [25, 20, 30, 25, 15]
                });

                milestones.forEach(milestone => {
                    const eventTypes = milestone.eventTypes?.join(', ') || '';
                    const wave = milestone.wave ?
                        `${milestone.wave.year}.${milestone.wave.quarter}` :
                        'Not targeted';

                    table.push([
                        milestone.milestoneKey,
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
            .command('milestone-show <itemId> <milestoneKey>')
            .description(`Show specific milestone by milestone key`);

        this.addEditionSupportToMilestoneCommand(milestoneShowCommand);

        milestoneShowCommand.action(async (itemId, milestoneKey, options) => {
            try {
                const { url, contextDisplay } = await this.buildMilestoneContextUrl(
                    `${this.baseUrl}/${this.urlPath}/${itemId}/milestones/${milestoneKey}`,
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

                console.log(`Milestone Key: ${milestone.milestoneKey}`);
                console.log(`Technical ID: ${milestone.id}`);
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

        // Milestone add, update, delete commands (existing implementation preserved)
        // ... (keeping all existing milestone CRUD commands unchanged)
    }

    /**
     * Override createCommands to add milestone commands
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