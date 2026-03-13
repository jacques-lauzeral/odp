// workspace/cli/src/commands/operational-change.js
import { VersionedCommands } from '../base-commands.js';
import {
    DraftingGroup,
    DraftingGroupKeys,
    isDraftingGroupValid,
    getDraftingGroupDisplay,
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
            .option('--drg <drg>', `Filter by drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title, purpose, initialState, finalState, details, and privateNotes fields')
            .option('--path <path>', 'Filter by path element')
            .option('--stakeholder-category <ids>', 'Filter by stakeholder category IDs via IMPLEMENTS/DECOMMISSIONS requirements (comma-separated)')
            .action(async (options) => {
                try {
                    if (options.drg && !isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}`, options);

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

                    const filterDisplay = this.buildFilterDisplaySummary(options);
                    const fullContextDisplay = contextDisplay + filterDisplay;

                    if (items.length === 0) {
                        console.log(`No ${this.displayName}s found${fullContextDisplay}.`);
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Code', 'DRG', 'Title', 'Version', 'Created By'],
                        colWidths: [10, 15, 12, 20, 10, 20]
                    });

                    items.forEach(item => {
                        const drgDisplay = item.drg ? getDraftingGroupDisplay(item.drg) : '-';
                        const codeDisplay = item.code || '-';
                        table.push([
                            item.itemId,
                            codeDisplay,
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

    buildContentFilterParams(options) {
        const params = [];

        if (options.drg) params.push(`drg=${encodeURIComponent(options.drg)}`);
        if (options.title) params.push(`title=${encodeURIComponent(options.title)}`);
        if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
        if (options.path) params.push(`path=${encodeURIComponent(options.path)}`);
        if (options.stakeholderCategory) params.push(`stakeholderCategory=${encodeURIComponent(options.stakeholderCategory)}`);

        return params;
    }

    appendFilterParams(url, filterParams) {
        if (filterParams.length === 0) return url;

        const separator = url.includes('?') ? '&' : '?';
        return url + separator + filterParams.join('&');
    }

    buildFilterDisplaySummary(options) {
        const filters = [];

        if (options.drg) filters.push(`drg=${options.drg}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.path) filters.push(`path="${options.path}"`);
        if (options.stakeholderCategory) filters.push(`stakeholder-categories=[${options.stakeholderCategory}]`);

        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
    }

    /**
     * Override displayItemDetails for operational changes
     */
    displayItemDetails(item) {
        super.displayItemDetails(item);

        console.log(`Code: ${item.code || 'Not set'}`);
        console.log(`DRG: ${item.drg ? getDraftingGroupDisplay(item.drg) : 'Not set'}`);
        console.log(`Maturity: ${item.maturity || 'Not set'}`);
        console.log(`Purpose: ${item.purpose || ''}`);
        console.log(`Initial State: ${item.initialState || 'Not specified'}`);
        console.log(`Final State: ${item.finalState || 'Not specified'}`);
        console.log(`Details: ${item.details || 'Not specified'}`);
        console.log(`Cost: ${item.cost != null ? item.cost : 'Not set'}`);
        console.log(`Private Notes: ${item.privateNotes || 'None'}`);

        if (item.path && item.path.length > 0) {
            console.log(`Path: ${item.path.join(' > ')}`);
        }

        if (item.implementedORs && item.implementedORs.length > 0) {
            console.log(`\nImplements ORs:`);
            item.implementedORs.forEach(req => {
                console.log(`  - ${req.code} [ID: ${req.id}] ${req.title}`);
            });
        }

        if (item.decommissionedORs && item.decommissionedORs.length > 0) {
            console.log(`\nDecommissions ORs:`);
            item.decommissionedORs.forEach(req => {
                console.log(`  - ${req.code} [ID: ${req.id}] ${req.title}`);
            });
        }

        if (item.dependsOnChanges && item.dependsOnChanges.length > 0) {
            console.log(`\nDepends On Changes:`);
            item.dependsOnChanges.forEach(dep => {
                console.log(`  - ${dep.code} [ID: ${dep.id}] ${dep.title}`);
            });
        }

        if (item.milestones && item.milestones.length > 0) {
            console.log(`\nMilestones:`);

            const table = new Table({
                head: ['Name', 'Event Types', 'Wave'],
                colWidths: [25, 35, 15]
            });

            item.milestones.forEach(milestone => {
                const eventTypesDisplay = milestone.eventTypes && milestone.eventTypes.length > 0
                    ? milestone.eventTypes.map(et => getMilestoneEventDisplay(et)).join(', ')
                    : 'Not specified';
                const wave = milestone.wave
                    ? `${milestone.wave.year}.${milestone.wave.sequenceNumber}`
                    : 'Not targeted';

                table.push([
                    milestone.name || 'Unnamed',
                    eventTypesDisplay,
                    wave
                ]);
            });

            console.log(table.toString());
        }
    }

    validateDRG(drg) {
        if (!drg) return null;

        if (!isDraftingGroupValid(drg)) {
            console.error(`Invalid DRG value: ${drg}`);
            console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
            process.exit(1);
        }

        return drg;
    }

    parseIds(input) {
        if (!input) return [];

        const ids = Array.isArray(input) ? input : input.split(/[,\s]+/).filter(id => id.trim());
        return ids.map(id => id.trim());
    }

    _addCreateCommand(itemCommand) {
        itemCommand
            .command('create <title>')
            .description(`Create a new ${this.displayName}`)
            .option('--purpose <purpose>', 'Purpose of the change', '')
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--initial-state <state>', 'Initial state description', '')
            .option('--final-state <state>', 'Final state description', '')
            .option('--details <details>', 'Additional details', '')
            .option('--private-notes <notes>', 'Private notes', '')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)', 'DRAFT')
            .option('--cost <cost>', 'Cost (integer)')
            .option('--implements <or-ids...>', 'OR IDs that this change implements (space-separated)')
            .option('--decommissions <or-ids...>', 'OR IDs that this change decommissions (space-separated)')
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        purpose: options.purpose,
                        drg: this.validateDRG(options.drg),
                        initialState: options.initialState || '',
                        finalState: options.finalState || '',
                        details: options.details || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        cost: options.cost != null ? parseInt(options.cost, 10) : null,
                        path: [],
                        implementedORs: options.implements || [],
                        decommissionedORs: options.decommissions || [],
                        dependsOnChanges: [],
                        milestones: []
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
                    if (entity.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(entity.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error creating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId> <title>')
            .description(`Update a ${this.displayName} (creates new version with complete replacement)`)
            .option('--purpose <purpose>', 'New purpose')
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--initial-state <state>', 'Initial state description')
            .option('--final-state <state>', 'Final state description')
            .option('--details <details>', 'Additional details')
            .option('--private-notes <notes>', 'Private notes')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)')
            .option('--cost <cost>', 'Cost (integer)')
            .option('--implements <or-ids...>', 'OR IDs that this change implements')
            .option('--decommissions <or-ids...>', 'OR IDs that this change decommissions')
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    const data = {
                        expectedVersionId,
                        title,
                        purpose: options.purpose || '',
                        drg: this.validateDRG(options.drg),
                        initialState: options.initialState || '',
                        finalState: options.finalState || '',
                        details: options.details || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        cost: options.cost != null ? parseInt(options.cost, 10) : null,
                        path: [],
                        implementedORs: options.implements || [],
                        decommissionedORs: options.decommissions || [],
                        dependsOnChanges: [],
                        milestones: []
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
                    if (entity.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(entity.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error updating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    _addPatchCommand(itemCommand) {
        itemCommand
            .command('patch <itemId> <expectedVersionId>')
            .description(`Patch a ${this.displayName} (partial update, creates new version)`)
            .option('--title <title>', 'New title')
            .option('--purpose <purpose>', 'New purpose')
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--initial-state <state>', 'Initial state description')
            .option('--final-state <state>', 'Final state description')
            .option('--details <details>', 'Additional details')
            .option('--private-notes <notes>', 'Private notes')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)')
            .option('--cost <cost>', 'Cost (integer)')
            .option('--implements <or-ids...>', 'OR IDs that this change implements')
            .option('--decommissions <or-ids...>', 'OR IDs that this change decommissions')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.purpose) data.purpose = options.purpose;
                    if (options.drg !== undefined) data.drg = this.validateDRG(options.drg);
                    if (options.initialState) data.initialState = options.initialState;
                    if (options.finalState) data.finalState = options.finalState;
                    if (options.details) data.details = options.details;
                    if (options.privateNotes) data.privateNotes = options.privateNotes;
                    if (options.maturity) data.maturity = options.maturity;
                    if (options.cost != null) data.cost = parseInt(options.cost, 10);
                    if (options.implements) data.implementedORs = options.implements;
                    if (options.decommissions) data.decommissionedORs = options.decommissions;

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
     * Override createCommands to add milestone commands and delete command
     */
    createCommands(program) {
        super.createCommands(program);

        const itemCommand = program.commands.find(cmd => cmd.name() === this.itemName);
        this._addMilestoneCommands(itemCommand);

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

    _addMilestoneCommands(itemCommand) {
        // Milestone commands have their own lifecycle and are managed via the milestone sub-resource API.
        // Implementation left for milestone-specific route integration.
    }
}

export function operationalChangeCommands(program, config) {
    const commands = new OperationalChangeCommands(config);
    commands.createCommands(program);
}