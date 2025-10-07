// workspace/cli/src/commands/operational-change.js - Updated with Phase 19 model evolution support
import { VersionedCommands } from '../base-commands.js';
import {
    DraftingGroup,
    DraftingGroupKeys,
    isDraftingGroupValid,
    getDraftingGroupDisplay,
    Visibility,
    VisibilityKeys,
    isVisibilityValid,
    getVisibilityDisplay,
    MilestoneEventType,
    MilestoneEventKeys,
    isMilestoneEventValid,
    getMilestoneEventDisplay
} from '../../../shared/src/index.js';
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
            .option('--visibility <visibility>', `Filter by change visibility (${VisibilityKeys.join(', ')})`)
            .option('--drg <drg>', `Filter by drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title, purpose, initialState, finalState, details, and privateNotes fields')
            .option('--path <path>', 'Filter by path element')
            .option('--stakeholder-category <ids>', 'Filter by stakeholder category IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .option('--data-category <ids>', 'Filter by data category IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .option('--service <ids>', 'Filter by service IDs via SATISFIES/SUPERSEDES requirements (comma-separated)')
            .option('--document <ids>', 'Filter by document IDs (comma-separated)')
            .action(async (options) => {
                try {
                    // Validate visibility if provided
                    if (options.visibility && !isVisibilityValid(options.visibility)) {
                        console.error(`Invalid visibility value: ${options.visibility}`);
                        console.error(`Valid values: ${VisibilityKeys.join(', ')}`);
                        process.exit(1);
                    }

                    // Validate DRG if provided
                    if (options.drg && !isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

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
                        head: ['Item ID', 'Visibility', 'DRG', 'Title', 'Version', 'Created By'],
                        colWidths: [10, 12, 12, 25, 10, 20]
                    });

                    items.forEach(item => {
                        const visibilityDisplay = item.visibility ? getVisibilityDisplay(item.visibility) : '-';
                        const drgDisplay = item.drg ? getDraftingGroupDisplay(item.drg) : '-';
                        table.push([
                            item.itemId,
                            visibilityDisplay,
                            drgDisplay,
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
        if (options.drg) params.push(`drg=${encodeURIComponent(options.drg)}`);
        if (options.title) params.push(`title=${encodeURIComponent(options.title)}`);
        if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
        if (options.path) params.push(`path=${encodeURIComponent(options.path)}`);
        if (options.stakeholderCategory) params.push(`stakeholderCategory=${encodeURIComponent(options.stakeholderCategory)}`);
        if (options.dataCategory) params.push(`dataCategory=${encodeURIComponent(options.dataCategory)}`);
        if (options.service) params.push(`service=${encodeURIComponent(options.service)}`);
        if (options.document) params.push(`document=${encodeURIComponent(options.document)}`);

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
        if (options.drg) filters.push(`drg=${options.drg}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.path) filters.push(`path="${options.path}"`);
        if (options.stakeholderCategory) filters.push(`stakeholder-categories=[${options.stakeholderCategory}]`);
        if (options.dataCategory) filters.push(`data-categories=[${options.dataCategory}]`);
        if (options.service) filters.push(`services=[${options.service}]`);
        if (options.document) filters.push(`documents=[${options.document}]`);

        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
    }

    /**
     * Override displayItemDetails for operational changes
     */
    displayItemDetails(item) {
        super.displayItemDetails(item);

        console.log(`Purpose: ${item.purpose || item.description || ''}`); // Handle both new and old field names
        console.log(`Visibility: ${item.visibility ? getVisibilityDisplay(item.visibility) : 'Not set'}`);
        console.log(`DRG: ${item.drg ? getDraftingGroupDisplay(item.drg) : 'Not set'}`);
        console.log(`Initial State: ${item.initialState || 'Not specified'}`);
        console.log(`Final State: ${item.finalState || 'Not specified'}`);
        console.log(`Details: ${item.details || 'Not specified'}`);
        console.log(`Private Notes: ${item.privateNotes || 'None'}`);

        if (item.path && item.path.length > 0) {
            console.log(`Path: ${item.path.join(' > ')}`);
        }

        // Display SATISFIES relationships
        if (item.satisfiesRequirements && item.satisfiesRequirements.length > 0) {
            console.log(`\nSatisfies Requirements:`);
            item.satisfiesRequirements.forEach(req => {
                console.log(`  - ${req.title} (${req.type}) [ID: ${req.id}]`);
            });
        }

        // Display SUPERSEDES relationships
        if (item.supersedsRequirements && item.supersedsRequirements.length > 0) {
            console.log(`\nSupersedes Requirements:`);
            item.supersedsRequirements.forEach(req => {
                console.log(`  - ${req.title} (${req.type}) [ID: ${req.id}]`);
            });
        }

        // Display document references
        if (item.referencesDocuments && item.referencesDocuments.length > 0) {
            console.log(`\nReferences Documents:`);
            item.referencesDocuments.forEach(ref => {
                const note = ref.note ? ` (${ref.note})` : '';
                console.log(`  - ${ref.name} v${ref.version || 'N/A'}${note} [ID: ${ref.documentId}]`);
            });
        }

        // Display dependencies
        if (item.dependsOnChanges && item.dependsOnChanges.length > 0) {
            console.log(`\nDepends On Changes:`);
            item.dependsOnChanges.forEach(dep => {
                console.log(`  - ${dep.title} [ID: ${dep.itemId}, Version: ${dep.version}]`);
            });
        }

        // Display milestones
        if (item.milestones && item.milestones.length > 0) {
            console.log(`\nMilestones:`);

            const table = new Table({
                head: ['Event Type', 'Wave', 'Version'],
                colWidths: [25, 15, 10]
            });

            item.milestones.forEach(milestone => {
                const eventTypeDisplay = milestone.eventType ? getMilestoneEventDisplay(milestone.eventType) : 'Not specified';
                const wave = milestone.wave ?
                    `${milestone.wave.year}.${milestone.wave.quarter}` :
                    'Not targeted';

                table.push([
                    eventTypeDisplay,
                    wave,
                    milestone.version || 'Latest'
                ]);
            });

            console.log(table.toString());
        }
    }

    /**
     * Helper method to validate visibility
     */
    validateVisibility(visibility) {
        if (!visibility) return null;

        if (!isVisibilityValid(visibility)) {
            console.error(`Invalid visibility value: ${visibility}`);
            console.error(`Valid values: ${VisibilityKeys.join(', ')}`);
            process.exit(1);
        }

        return visibility;
    }

    /**
     * Helper method to validate DRG
     */
    validateDRG(drg) {
        if (!drg) return null;

        if (!isDraftingGroupValid(drg)) {
            console.error(`Invalid DRG value: ${drg}`);
            console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
            process.exit(1);
        }

        return drg;
    }

    /**
     * Implement create command with updated field structure
     */
    _addCreateCommand(itemCommand) {
        itemCommand
            .command('create <title>')
            .description(`Create a new ${this.displayName}`)
            .option('--purpose <purpose>', 'Purpose of the change (replaces description)', '')
            .option('--visibility <visibility>', `Visibility (${VisibilityKeys.join(', ')})`, 'NETWORK')
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--initial-state <state>', 'Initial state description', '')
            .option('--final-state <state>', 'Final state description', '')
            .option('--details <details>', 'Additional details', '')
            .option('--private-notes <notes>', 'Private notes', '')
            .option('--satisfies <requirement-ids...>', 'Requirement IDs that this change satisfies (space-separated)')
            .option('--supersedes <requirement-ids...>', 'Requirement IDs that this change supersedes (space-separated)')
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        purpose: options.purpose,
                        visibility: this.validateVisibility(options.visibility) || 'NETWORK',
                        drg: this.validateDRG(options.drg),
                        initialState: options.initialState || '',
                        finalState: options.finalState || '',
                        details: options.details || '',
                        privateNotes: options.privateNotes || '',
                        path: [], // Path not supported in CLI for simplicity
                        satisfiesRequirements: options.satisfies || [],
                        supersedsRequirements: options.supersedes || [],
                        referencesDocuments: [], // Document references not supported in CLI for simplicity
                        dependsOnChanges: [], // Dependencies not supported in CLI for simplicity
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
                    if (entity.visibility) {
                        console.log(`Visibility: ${getVisibilityDisplay(entity.visibility)}`);
                    }
                    if (entity.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(entity.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error creating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Implement update command with updated field structure
     */
    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId> <title>')
            .description(`Update a ${this.displayName} (creates new version with complete replacement)`)
            .option('--purpose <purpose>', 'New purpose (replaces description)')
            .option('--visibility <visibility>', `New visibility (${VisibilityKeys.join(', ')})`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--initial-state <state>', 'Initial state description')
            .option('--final-state <state>', 'Final state description')
            .option('--details <details>', 'Additional details')
            .option('--private-notes <notes>', 'Private notes')
            .option('--satisfies <requirement-ids...>', 'Requirement IDs that this change satisfies')
            .option('--supersedes <requirement-ids...>', 'Requirement IDs that this change supersedes')
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    // Build complete update payload
                    const data = {
                        expectedVersionId,
                        title,
                        purpose: options.purpose || '',
                        visibility: this.validateVisibility(options.visibility) || 'NETWORK',
                        drg: this.validateDRG(options.drg),
                        initialState: options.initialState || '',
                        finalState: options.finalState || '',
                        details: options.details || '',
                        privateNotes: options.privateNotes || '',
                        path: [], // Path not supported in CLI for simplicity
                        satisfiesRequirements: options.satisfies || [],
                        supersedsRequirements: options.supersedes || [],
                        referencesDocuments: [], // Document references not supported in CLI for simplicity
                        dependsOnChanges: [], // Dependencies not supported in CLI for simplicity
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
                    if (entity.visibility) {
                        console.log(`Visibility: ${getVisibilityDisplay(entity.visibility)}`);
                    }
                    if (entity.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(entity.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error updating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Implement patch command with updated field structure
     */
    _addPatchCommand(itemCommand) {
        itemCommand
            .command('patch <itemId> <expectedVersionId>')
            .description(`Patch a ${this.displayName} (partial update, creates new version)`)
            .option('--title <title>', 'New title')
            .option('--purpose <purpose>', 'New purpose (replaces description)')
            .option('--visibility <visibility>', `New visibility (${VisibilityKeys.join(', ')})`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--initial-state <state>', 'Initial state description')
            .option('--final-state <state>', 'Final state description')
            .option('--details <details>', 'Additional details')
            .option('--private-notes <notes>', 'Private notes')
            .option('--satisfies <requirement-ids...>', 'Requirement IDs that this change satisfies')
            .option('--supersedes <requirement-ids...>', 'Requirement IDs that this change supersedes')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    // Build patch payload with only provided fields
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.purpose) data.purpose = options.purpose;
                    if (options.visibility !== undefined) data.visibility = this.validateVisibility(options.visibility);
                    if (options.drg !== undefined) data.drg = this.validateDRG(options.drg);
                    if (options.initialState) data.initialState = options.initialState;
                    if (options.finalState) data.finalState = options.finalState;
                    if (options.details) data.details = options.details;
                    if (options.privateNotes) data.privateNotes = options.privateNotes;
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
                    if (entity.visibility) {
                        console.log(`Visibility: ${getVisibilityDisplay(entity.visibility)}`);
                    }
                    if (entity.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(entity.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error patching ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Add milestone commands with updated 5-event system
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
                    head: ['Event Type', 'Wave', 'Version'],
                    colWidths: [25, 15, 10]
                });

                milestones.forEach(milestone => {
                    const eventTypeDisplay = milestone.eventType ? getMilestoneEventDisplay(milestone.eventType) : 'Not specified';
                    const wave = milestone.wave ?
                        `${milestone.wave.year}.${milestone.wave.quarter}` :
                        'Not targeted';

                    table.push([
                        eventTypeDisplay,
                        wave,
                        milestone.version || 'Latest'
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

        // Milestone add command with new 5-event system
        itemCommand
            .command('milestone-add <itemId> <eventType> <waveId>')
            .description(`Add milestone for ${this.displayName} with specific event type`)
            .option('--event-type <type>', `Event type (${MilestoneEventKeys.join(', ')})`)
            .action(async (itemId, eventType, waveId, options) => {
                try {
                    // Validate event type
                    if (!isMilestoneEventValid(eventType)) {
                        console.error(`Invalid event type: ${eventType}`);
                        console.error(`Valid values: ${MilestoneEventKeys.join(', ')}`);
                        process.exit(1);
                    }

                    const data = {
                        eventType: eventType,
                        waveId: waveId
                    };

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/milestones`, {
                        method: 'POST',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) {
                        console.error(`${this.displayName} with ID ${itemId} not found.`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const milestone = await response.json();
                    console.log(`Added milestone: ${getMilestoneEventDisplay(milestone.eventType)}`);
                    console.log(`Wave: ${milestone.wave.year}.${milestone.wave.quarter}`);
                    console.log(`Milestone ID: ${milestone.id}`);
                } catch (error) {
                    console.error(`Error adding milestone:`, error.message);
                    process.exit(1);
                }
            });

        // Milestone update command
        itemCommand
            .command('milestone-update <itemId> <milestoneId> <waveId>')
            .description(`Update milestone wave assignment`)
            .action(async (itemId, milestoneId, waveId) => {
                try {
                    const data = { waveId: waveId };

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

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const milestone = await response.json();
                    console.log(`Updated milestone: ${getMilestoneEventDisplay(milestone.eventType)}`);
                    console.log(`New wave: ${milestone.wave.year}.${milestone.wave.quarter}`);
                } catch (error) {
                    console.error(`Error updating milestone:`, error.message);
                    process.exit(1);
                }
            });

        // Milestone delete command
        itemCommand
            .command('milestone-delete <itemId> <milestoneId>')
            .description(`Delete milestone`)
            .action(async (itemId, milestoneId) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}/milestones/${milestoneId}`, {
                        method: 'DELETE',
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        const error = await response.json();
                        console.error(`Error: ${error.error?.message || 'Not found'}`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    console.log(`Deleted milestone with ID: ${milestoneId}`);
                } catch (error) {
                    console.error(`Error deleting milestone:`, error.message);
                    process.exit(1);
                }
            });
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