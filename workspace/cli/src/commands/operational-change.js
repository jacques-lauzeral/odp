// workspace/cli/src/commands/operational-change.js
import { VersionedCommands } from '../base-commands.js';
import {
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

    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (latest versions, baseline context, or edition context)`)
            .option('--baseline <id>', 'Show items as they existed in specified baseline')
            .option('--edition <id>', 'Show items in specified edition context (mutually exclusive with --baseline)')
            .option('--domain <domain>', 'Filter by domain key — see "odp domain list" for valid values')
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title, purpose, initialState, finalState, details, and privateNotes fields')
            .option('--stakeholder-category <ids>', 'Filter by stakeholder category IDs via IMPLEMENTS/DECOMMISSIONS requirements (comma-separated)')
            .option('--projection <projection>', 'Response projection: summary | standard (default: standard)', 'standard')
            .action(async (options) => {
                try {
                    if (!['summary', 'standard'].includes(options.projection)) {
                        console.error(`Invalid projection: ${options.projection}. Valid values: summary, standard`);
                        process.exit(1);
                    }

                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}`, options);

                    const filterParams = this.buildContentFilterParams(options);
                    if (options.projection !== 'standard') {
                        filterParams.push(`projection=${options.projection}`);
                    }
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
                        head: ['Item ID', 'Code', 'Domain', 'Title', 'Version', 'Created By'],
                        colWidths: [10, 15, 15, 20, 10, 20]
                    });

                    items.forEach(item => {
                        table.push([
                            item.itemId,
                            item.code || '-',
                            item.domain || '-',
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
        if (options.domain) params.push(`domain=${encodeURIComponent(options.domain)}`);
        if (options.title) params.push(`title=${encodeURIComponent(options.title)}`);
        if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
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
        if (options.domain) filters.push(`domain=${options.domain}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.stakeholderCategory) filters.push(`stakeholder-categories=[${options.stakeholderCategory}]`);
        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
    }

    displayItemDetails(item) {
        super.displayItemDetails(item);
        console.log(`Code: ${item.code || '—'}`);
        console.log(`Domain: ${item.domain || '—'}`);
        console.log(`Maturity: ${item.maturity || '—'}`);
        console.log(`Cost: ${item.cost != null ? item.cost : '—'}`);

        console.log(`\nPurpose: ${item.purpose !== undefined ? (item.purpose || '—') : '(not in projection)'}`);
        console.log(`Initial State: ${item.initialState !== undefined ? (item.initialState || '—') : '(not in projection)'}`);
        console.log(`Final State: ${item.finalState !== undefined ? (item.finalState || '—') : '(not in projection)'}`);
        console.log(`Details: ${item.details !== undefined ? (item.details || '—') : '(not in projection)'}`);
        console.log(`Private Notes: ${item.privateNotes !== undefined ? (item.privateNotes || '—') : '(not in projection)'}`);
        console.log(`Additional Documentation: ${item.additionalDocumentation !== undefined ? (item.additionalDocumentation || '—') : '(not in projection)'}`);

        console.log(`\nImplements ORs:`);
        if (item.implementedORs && item.implementedORs.length > 0) {
            item.implementedORs.forEach(req => console.log(`  - ${req.code} [ID: ${req.id}] ${req.title}`));
        } else { console.log(`  None`); }

        console.log(`Decommissions ORs:`);
        if (item.decommissionedORs && item.decommissionedORs.length > 0) {
            item.decommissionedORs.forEach(req => console.log(`  - ${req.code} [ID: ${req.id}] ${req.title}`));
        } else { console.log(`  None`); }

        console.log(`Depends On Changes:`);
        if (item.dependencies && item.dependencies.length > 0) {
            item.dependencies.forEach(dep => console.log(`  - ${dep.code} [ID: ${dep.id}] ${dep.title}`));
        } else { console.log(`  None`); }

        console.log(`Milestones:`);
        if (item.milestones && item.milestones.length > 0) {
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
                table.push([milestone.name || 'Unnamed', eventTypesDisplay, wave]);
            });
            console.log(table.toString());
        } else { console.log(`  None`); }

        console.log(`\n--- Derived fields (extended projection) ---`);
        console.log(`Required By (OCs): ${item.requiredByOCs !== undefined ? '' : '(not in projection)'}`);
        if (item.requiredByOCs && item.requiredByOCs.length > 0) {
            item.requiredByOCs.forEach(oc => console.log(`  - ${oc.code} [ID: ${oc.id}] ${oc.title}`));
        } else if (item.requiredByOCs !== undefined) { console.log(`  None`); }
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
            .requiredOption('--domain <domain>', 'Domain key — see "odp domain list" for valid values')
            .option('--initial-state <state>', 'Initial state description', '')
            .option('--final-state <state>', 'Final state description', '')
            .option('--details <details>', 'Additional details', '')
            .option('--private-notes <notes>', 'Private notes', '')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)', 'DRAFT')
            .option('--cost <cost>', 'Cost (integer)')
            .option('--implements <or-ids...>', 'OR IDs that this change implements (space-separated)')
            .option('--decommissions <or-ids...>', 'OR IDs that this change decommissions (space-separated)')
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        purpose: options.purpose,
                        domain: options.domain,
                        initialState: options.initialState || '',
                        finalState: options.finalState || '',
                        details: options.details || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        cost: options.cost != null ? parseInt(options.cost, 10) : null,
                        implementedORs: options.implements || [],
                        decommissionedORs: options.decommissions || [],
                        dependsOnChanges: [],
                        milestones: [],
                        changeSetId: options.changeSet
                    };
                    if (options.commitNote) data.note = options.commitNote;

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
                    console.log(`Domain: ${entity.domain || '—'}`);
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
            .option('--domain <domain>', 'Domain key — see "odp domain list" for valid values')
            .option('--initial-state <state>', 'Initial state description')
            .option('--final-state <state>', 'Final state description')
            .option('--details <details>', 'Additional details')
            .option('--private-notes <notes>', 'Private notes')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)')
            .option('--cost <cost>', 'Cost (integer)')
            .option('--implements <or-ids...>', 'OR IDs that this change implements')
            .option('--decommissions <or-ids...>', 'OR IDs that this change decommissions')
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    const data = {
                        expectedVersionId,
                        title,
                        purpose: options.purpose || '',
                        domain: options.domain,
                        initialState: options.initialState || '',
                        finalState: options.finalState || '',
                        details: options.details || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        cost: options.cost != null ? parseInt(options.cost, 10) : null,
                        implementedORs: options.implements || [],
                        decommissionedORs: options.decommissions || [],
                        dependsOnChanges: [],
                        changeSetId: options.changeSet
                    };
                    if (options.commitNote) data.note = options.commitNote;

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
                    console.log(`Domain: ${entity.domain || '—'}`);
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
            .option('--domain <domain>', 'Domain key — see "odp domain list" for valid values')
            .option('--initial-state <state>', 'Initial state description')
            .option('--final-state <state>', 'Final state description')
            .option('--details <details>', 'Additional details')
            .option('--private-notes <notes>', 'Private notes')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)')
            .option('--cost <cost>', 'Cost (integer)')
            .option('--implements <or-ids...>', 'OR IDs that this change implements')
            .option('--decommissions <or-ids...>', 'OR IDs that this change decommissions')
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };
                    if (options.title) data.title = options.title;
                    if (options.purpose) data.purpose = options.purpose;
                    if (options.domain !== undefined) data.domain = options.domain;
                    if (options.initialState) data.initialState = options.initialState;
                    if (options.finalState) data.finalState = options.finalState;
                    if (options.details) data.details = options.details;
                    if (options.privateNotes) data.privateNotes = options.privateNotes;
                    if (options.maturity) data.maturity = options.maturity;
                    if (options.cost != null) data.cost = parseInt(options.cost, 10);
                    if (options.implements) data.implementedORs = options.implements;
                    if (options.decommissions) data.decommissionedORs = options.decommissions;
                    data.changeSetId = options.changeSet;
                    if (options.commitNote) data.note = options.commitNote;

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
                    console.log(`Domain: ${entity.domain || '—'}`);
                } catch (error) {
                    console.error(`Error patching ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

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
    }
}

export function operationalChangeCommands(program, config) {
    const commands = new OperationalChangeCommands(config);
    commands.createCommands(program);
}