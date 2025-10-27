// workspace/cli/src/commands/operational-requirement.js - Updated for EntityReference with notes
import { VersionedCommands } from '../base-commands.js';
import { DraftingGroup, DraftingGroupKeys, isDraftingGroupValid, getDraftingGroupDisplay } from '../../../shared/src/index.js';
import Table from 'cli-table3';
import fetch from "node-fetch";

class OperationalRequirementCommands extends VersionedCommands {
    constructor(config) {
        super(
            'requirement',
            'operational-requirements',
            'operational requirement',
            config
        );
    }

    /**
     * Override addListCommand to add content filtering support for OperationalRequirements
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (latest versions, baseline context, or edition context)`)
            .option('--baseline <id>', 'Show items as they existed in specified baseline')
            .option('--edition <id>', 'Show items in specified edition context (mutually exclusive with --baseline)')
            // OperationalRequirement-specific content filters
            .option('--type <type>', 'Filter by requirement type (ON or OR)')
            .option('--drg <drg>', `Filter by drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title, statement, rationale, flows, and privateNotes')
            .option('--path <path>', 'Filter by path element')
            .option('--data-category <ids>', 'Filter by data category IDs (comma-separated)')
            .option('--stakeholder-category <ids>', 'Filter by stakeholder category IDs (comma-separated)')
            .option('--service <ids>', 'Filter by service IDs (comma-separated)')
            .option('--document <ids>', 'Filter by document IDs (comma-separated)')
            .action(async (options) => {
                try {
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
                        head: ['Item ID', 'Code', 'Type', 'DRG', 'Title', 'Version', 'Created By'],
                        colWidths: [10, 15, 8, 12, 25, 10, 20]
                    });

                    items.forEach(item => {
                        const drgDisplay = item.drg ? getDraftingGroupDisplay(item.drg) : '-';
                        const codeDisplay = item.code || '-';
                        table.push([
                            item.itemId,
                            codeDisplay,
                            item.type,
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
     * Build content filter query parameters for OperationalRequirements
     */
    buildContentFilterParams(options) {
        const params = [];

        if (options.type) params.push(`type=${encodeURIComponent(options.type)}`);
        if (options.drg) params.push(`drg=${encodeURIComponent(options.drg)}`);
        if (options.title) params.push(`title=${encodeURIComponent(options.title)}`);
        if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
        if (options.path) params.push(`path=${encodeURIComponent(options.path)}`);
        if (options.dataCategory) params.push(`dataCategory=${encodeURIComponent(options.dataCategory)}`);
        if (options.stakeholderCategory) params.push(`stakeholderCategory=${encodeURIComponent(options.stakeholderCategory)}`);
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

        if (options.type) filters.push(`type=${options.type}`);
        if (options.drg) filters.push(`drg=${options.drg}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.path) filters.push(`path="${options.path}"`);
        if (options.dataCategory) filters.push(`data-categories=[${options.dataCategory}]`);
        if (options.stakeholderCategory) filters.push(`stakeholder-categories=[${options.stakeholderCategory}]`);
        if (options.service) filters.push(`services=[${options.service}]`);
        if (options.document) filters.push(`documents=[${options.document}]`);

        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
    }

    /**
     * Override displayItemDetails for operational requirements
     * UPDATED: Display notes for IMPACTS and documentReferences
     */
    displayItemDetails(item) {
        super.displayItemDetails(item);

        console.log(`Type: ${item.type}`);
        console.log(`Code: ${item.code || 'Not set'}`);
        console.log(`DRG: ${item.drg ? getDraftingGroupDisplay(item.drg) : 'Not set'}`);
        console.log(`Statement: ${item.statement}`);
        console.log(`Rationale: ${item.rationale}`);
        console.log(`Flows: ${item.flows}`);
        console.log(`Private Notes: ${item.privateNotes || 'None'}`);

        if (item.path && item.path.length > 0) {
            console.log(`Path: ${item.path.join(' > ')}`);
        }

        // Display relationships
        if (item.refinesParents && item.refinesParents.length > 0) {
            console.log(`\nRefines:`);
            item.refinesParents.forEach(parent => {
                console.log(`  - ${parent.title} (${parent.type}) [ID: ${parent.id}]`);
            });
        }

        // Display implementedONs relationships
        if (item.implementedONs && item.implementedONs.length > 0) {
            console.log(`\nImplemented ONs:`);
            item.implementedONs.forEach(on => {
                console.log(`  - ${on.title} (${on.type}) [ID: ${on.id}]`);
            });
        }

        // UPDATED: Display stakeholder categories with notes
        if (item.impactsStakeholderCategories && item.impactsStakeholderCategories.length > 0) {
            console.log(`\nImpacts Stakeholder Categories:`);
            item.impactsStakeholderCategories.forEach(cat => {
                const note = cat.note ? ` - Note: "${cat.note}"` : '';
                console.log(`  - ${cat.title} [ID: ${cat.id}]${note}`);
            });
        }

        // UPDATED: Display data categories with notes
        if (item.impactsData && item.impactsData.length > 0) {
            console.log(`\nImpacts Data:`);
            item.impactsData.forEach(data => {
                const note = data.note ? ` - Note: "${data.note}"` : '';
                console.log(`  - ${data.title} [ID: ${data.id}]${note}`);
            });
        }

        // UPDATED: Display services with notes
        if (item.impactsServices && item.impactsServices.length > 0) {
            console.log(`\nImpacts Services:`);
            item.impactsServices.forEach(service => {
                const note = service.note ? ` - Note: "${service.note}"` : '';
                console.log(`  - ${service.title} [ID: ${service.id}]${note}`);
            });
        }

        // UPDATED: Display document references with EntityReference format
        if (item.documentReferences && item.documentReferences.length > 0) {
            console.log(`\nReferences Documents:`);
            item.documentReferences.forEach(ref => {
                const note = ref.note ? ` - Note: "${ref.note}"` : '';
                console.log(`  - ${ref.title} [ID: ${ref.id}]${note}`);
            });
        }

        if (item.dependsOnRequirements && item.dependsOnRequirements.length > 0) {
            console.log(`\nDepends On Requirements:`);
            item.dependsOnRequirements.forEach(dep => {
                console.log(`  - ${dep.title} [ID: ${dep.itemId}, Version: ${dep.version}]`);
            });
        }
    }

    /**
     * Helper method to validate and prompt for DRG
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
     * Helper method to parse implementedONs input
     */
    parseImplementedONs(input) {
        if (!input) return [];

        // Handle both comma-separated and space-separated input
        const ids = Array.isArray(input) ? input : input.split(/[,\s]+/).filter(id => id.trim());
        return ids.map(id => id.trim());
    }

    /**
     * UPDATED: create command now sends EntityReference format for IMPACTS
     * Note: CLI doesn't support adding notes - web UI required for that
     */
    _addCreateCommand(itemCommand) {
        itemCommand
            .command('create <title>')
            .description(`Create a new ${this.displayName}`)
            .option('--type <type>', `ON | OR (default)`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--implemented-ons <on-ids>', `Implemented ON requirement IDs (comma-separated)`)
            .option('--impacts-data <data-category-ids...>', `Impacted data category IDs`)
            .option('--impacts-stakeholders <stakeholder-category-ids...>', `Impacted stakeholder category IDs`)
            .option('--impacts-services <service-ids...>', `Impacted service IDs`)
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        type: options.type || 'OR',
                        drg: this.validateDRG(options.drg),
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        flows: options.flows || '',
                        privateNotes: options.privateNotes || '',
                        path: [],
                        refinesParents: options.parent ? [options.parent] : [],
                        implementedONs: this.parseImplementedONs(options.implementedOns),
                        // UPDATED: Send EntityReference format (CLI doesn't add notes)
                        impactsData: (options.impactsData || []).map(id => ({ id, note: '' })),
                        impactsStakeholderCategories: (options.impactsStakeholders || []).map(id => ({ id, note: '' })),
                        impactsServices: (options.impactsServices || []).map(id => ({ id, note: '' })),
                        documentReferences: [],
                        dependsOnRequirements: []
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

    /**
     * UPDATED: update command now sends EntityReference format for IMPACTS
     */
    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId> <title>')
            .description(`Update a ${this.displayName} (creates new version)`)
            .option('--type <type>', `ON | OR`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--implemented-ons <on-ids>', `Implemented ON requirement IDs (comma-separated)`)
            .option('--impacts-data <data-category-ids...>', `Impacted data category IDs`)
            .option('--impacts-stakeholders <stakeholder-category-ids...>', `Impacted stakeholder category IDs`)
            .option('--impacts-services <service-ids...>', `Impacted service IDs`)
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    const data = {
                        expectedVersionId,
                        title,
                        type: options.type || 'OR',
                        drg: this.validateDRG(options.drg),
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        flows: options.flows || '',
                        privateNotes: options.privateNotes || '',
                        path: [],
                        refinesParents: options.parent ? [options.parent] : [],
                        implementedONs: this.parseImplementedONs(options.implementedOns),
                        // UPDATED: Send EntityReference format (CLI doesn't add notes)
                        impactsData: (options.impactsData || []).map(id => ({ id, note: '' })),
                        impactsStakeholderCategories: (options.impactsStakeholders || []).map(id => ({ id, note: '' })),
                        impactsServices: (options.impactsServices || []).map(id => ({ id, note: '' })),
                        documentReferences: [],
                        dependsOnRequirements: []
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

                    const item = await response.json();
                    console.log(`Updated ${this.displayName}: ${item.title} (ID: ${item.itemId})`);
                    console.log(`New version: ${item.version} (Version ID: ${item.versionId})`);
                    if (item.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(item.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error updating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * UPDATED: patch command - CLI doesn't support patching notes
     * If user provides IMPACTS IDs, they're sent as EntityReference with empty notes
     */
    _addPatchCommand(itemCommand) {
        itemCommand
            .command('patch <itemId> <expectedVersionId>')
            .description(`Patch a ${this.displayName} (partial update, creates new version)`)
            .option('--title <title>', 'New title')
            .option('--type <type>', 'ON | OR')
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--statement <statement>', 'New statement')
            .option('--rationale <rationale>', 'New rationale')
            .option('--flows <flows>', 'New flows')
            .option('--private-notes <notes>', 'New private notes')
            .option('--parent <requirement-id>', 'Parent requirement ID')
            .option('--implemented-ons <on-ids>', 'Implemented ON requirement IDs (comma-separated)')
            .option('--impacts-data <data-category-ids...>', 'Impacted data category IDs')
            .option('--impacts-stakeholders <stakeholder-category-ids...>', 'Impacted stakeholder category IDs')
            .option('--impacts-services <service-ids...>', 'Impacted service IDs')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    // Build patch payload with only provided fields
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.type) data.type = options.type;
                    if (options.drg !== undefined) data.drg = this.validateDRG(options.drg);
                    if (options.statement) data.statement = options.statement;
                    if (options.rationale) data.rationale = options.rationale;
                    if (options.flows) data.flows = options.flows;
                    if (options.privateNotes) data.privateNotes = options.privateNotes;
                    if (options.parent) data.refinesParents = [options.parent];
                    if (options.implementedOns !== undefined) data.implementedONs = this.parseImplementedONs(options.implementedOns);

                    // UPDATED: Send EntityReference format when provided
                    if (options.impactsData) data.impactsData = options.impactsData.map(id => ({ id, note: '' }));
                    if (options.impactsStakeholders) data.impactsStakeholderCategories = options.impactsStakeholders.map(id => ({ id, note: '' }));
                    if (options.impactsServices) data.impactsServices = options.impactsServices.map(id => ({ id, note: '' }));

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

                    const item = await response.json();
                    console.log(`Patched ${this.displayName}: ${item.title} (ID: ${item.itemId})`);
                    console.log(`New version: ${item.version} (Version ID: ${item.versionId})`);
                    if (item.drg) {
                        console.log(`DRG: ${getDraftingGroupDisplay(item.drg)}`);
                    }
                } catch (error) {
                    console.error(`Error patching ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }
}

export function operationalRequirementCommands(program, config) {
    const commands = new OperationalRequirementCommands(config);
    commands.createCommands(program);
}