// workspace/cli/src/commands/operational-requirement.js
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
            .option('--type <type>', 'Filter by requirement type (ON or OR)')
            .option('--drg <drg>', `Filter by drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title, statement, rationale, flows, and privateNotes')
            .option('--path <path>', 'Filter by path element')
            .option('--stakeholder-category <ids>', 'Filter by stakeholder category IDs (comma-separated)')
            .option('--projection <projection>', 'Response projection: summary | standard (default: standard)', 'standard')
            .action(async (options) => {
                try {
                    if (options.drg && !isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

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
                        head: ['Item ID', 'Code', 'Type', 'DRG', 'Title', 'Version', 'Created By', 'Statement', 'Rationale', 'Flows', 'NFRs', 'Private Notes', 'Add. Doc.'],
                        colWidths: [10, 15, 8, 12, 25, 10, 20, 18, 18, 18, 18, 18, 18]
                    });

                    const trunc = (val) => val ? String(val).substring(0, 16) : '—';

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
                            item.createdBy,
                            trunc(item.statement),
                            trunc(item.rationale),
                            trunc(item.flows),
                            trunc(item.nfrs),
                            trunc(item.privateNotes),
                            trunc(item.additionalDocumentation)
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

        if (options.type) params.push(`type=${encodeURIComponent(options.type)}`);
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

        if (options.type) filters.push(`type=${options.type}`);
        if (options.drg) filters.push(`drg=${options.drg}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.path) filters.push(`path="${options.path}"`);
        if (options.stakeholderCategory) filters.push(`stakeholder-categories=[${options.stakeholderCategory}]`);

        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
    }

    /**
     * Override displayItemDetails for operational requirements
     */
    displayItemDetails(item) {
        super.displayItemDetails(item);

        console.log(`Type: ${item.type}`);
        console.log(`Code: ${item.code || '—'}`);
        console.log(`DRG: ${item.drg ? getDraftingGroupDisplay(item.drg) : '—'}`);
        console.log(`Maturity: ${item.maturity || '—'}`);
        console.log(`Tentative: ${item.tentative ? `${item.tentative[0]} – ${item.tentative[1]}` : '—'}`);
        console.log(`Path: ${item.path && item.path.length > 0 ? item.path.join(' > ') : '—'}`);

        // rich-text fields — standard and extended projections
        console.log(`\nStatement: ${item.statement !== undefined ? (item.statement || '—') : '(not in projection)'}`);
        console.log(`Rationale: ${item.rationale !== undefined ? (item.rationale || '—') : '(not in projection)'}`);
        console.log(`Flows: ${item.flows !== undefined ? (item.flows || '—') : '(not in projection)'}`);
        console.log(`NFRs: ${item.nfrs !== undefined ? (item.nfrs || '—') : '(not in projection)'}`);
        console.log(`Private Notes: ${item.privateNotes !== undefined ? (item.privateNotes || '—') : '(not in projection)'}`);
        console.log(`Additional Documentation: ${item.additionalDocumentation !== undefined ? (item.additionalDocumentation || '—') : '(not in projection)'}`);

        // relationship fields
        console.log(`\nRefines:`);
        if (item.refinesParents && item.refinesParents.length > 0) {
            item.refinesParents.forEach(p => console.log(`  - ${p.code} [ID: ${p.id}] ${p.title}`));
        } else { console.log(`  None`); }

        console.log(`Implemented ONs:`);
        if (item.implementedONs && item.implementedONs.length > 0) {
            item.implementedONs.forEach(on => console.log(`  - ${on.code} [ID: ${on.id}] ${on.title}`));
        } else { console.log(`  None`); }

        console.log(`Impacted Stakeholders:`);
        if (item.impactedStakeholders && item.impactedStakeholders.length > 0) {
            item.impactedStakeholders.forEach(s => console.log(`  - ${s.title} [ID: ${s.id}]`));
        } else { console.log(`  None`); }

        console.log(`Impacted Domains:`);
        if (item.impactedDomains && item.impactedDomains.length > 0) {
            item.impactedDomains.forEach(d => console.log(`  - ${d.title} [ID: ${d.id}]`));
        } else { console.log(`  None`); }

        console.log(`Dependencies:`);
        if (item.dependencies && item.dependencies.length > 0) {
            item.dependencies.forEach(dep => console.log(`  - ${dep.code} [ID: ${dep.id}] ${dep.title}`));
        } else { console.log(`  None`); }

        console.log(`Strategic Documents:`);
        if (item.strategicDocuments && item.strategicDocuments.length > 0) {
            item.strategicDocuments.forEach(ref => {
                const note = ref.note ? ` — "${ref.note}"` : '';
                console.log(`  - ${ref.title} [ID: ${ref.id}]${note}`);
            });
        } else { console.log(`  None`); }

        // derived fields — extended projection only
        console.log(`\n--- Derived fields (extended projection) ---`);
        console.log(`Implemented By (ORs): ${item.implementedByORs !== undefined ? '' : '(not in projection)'}`);
        if (item.implementedByORs && item.implementedByORs.length > 0) {
            item.implementedByORs.forEach(or => console.log(`  - ${or.code} [ID: ${or.id}] ${or.title}`));
        } else if (item.implementedByORs !== undefined) { console.log(`  None`); }

        console.log(`Implemented By (OCs): ${item.implementedByOCs !== undefined ? '' : '(not in projection)'}`);
        if (item.implementedByOCs && item.implementedByOCs.length > 0) {
            item.implementedByOCs.forEach(oc => console.log(`  - ${oc.code} [ID: ${oc.id}] ${oc.title}`));
        } else if (item.implementedByOCs !== undefined) { console.log(`  None`); }

        console.log(`Decommissioned By (OCs): ${item.decommissionedByOCs !== undefined ? '' : '(not in projection)'}`);
        if (item.decommissionedByOCs && item.decommissionedByOCs.length > 0) {
            item.decommissionedByOCs.forEach(oc => console.log(`  - ${oc.code} [ID: ${oc.id}] ${oc.title}`));
        } else if (item.decommissionedByOCs !== undefined) { console.log(`  None`); }

        console.log(`Refined By: ${item.refinedBy !== undefined ? '' : '(not in projection)'}`);
        if (item.refinedBy && item.refinedBy.length > 0) {
            item.refinedBy.forEach(r => console.log(`  - ${r.code} [ID: ${r.id}] ${r.title}`));
        } else if (item.refinedBy !== undefined) { console.log(`  None`); }

        console.log(`Required By (ORs): ${item.requiredByORs !== undefined ? '' : '(not in projection)'}`);
        if (item.requiredByORs && item.requiredByORs.length > 0) {
            item.requiredByORs.forEach(or => console.log(`  - ${or.code} [ID: ${or.id}] ${or.title}`));
        } else if (item.requiredByORs !== undefined) { console.log(`  None`); }
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
            .option('--type <type>', `ON | OR (default: OR)`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--nfrs <nfrs>', `Non-functional requirements`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--maturity <maturity>', `Maturity level (DRAFT, ADVANCED, MATURE)`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--implemented-ons <on-ids>', `Implemented ON requirement IDs (comma-separated)`)
            .option('--impacted-stakeholders <ids>', `Impacted stakeholder category IDs (comma-separated)`)
            .option('--impacted-domains <ids>', `Impacted domain IDs (comma-separated)`)
            .option('--dependencies <ids>', `Dependency OR IDs (comma-separated)`)
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        type: options.type || 'OR',
                        drg: this.validateDRG(options.drg),
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        flows: options.flows || '',
                        nfrs: options.nfrs || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        path: [],
                        refinesParents: options.parent ? [options.parent] : [],
                        implementedONs: this.parseIds(options.implementedOns),
                        impactedStakeholders: this.parseIds(options.impactedStakeholders),
                        impactedDomains: this.parseIds(options.impactedDomains),
                        dependencies: this.parseIds(options.dependencies)
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
            .description(`Update a ${this.displayName} (creates new version)`)
            .option('--type <type>', `ON | OR`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--nfrs <nfrs>', `Non-functional requirements`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--maturity <maturity>', `Maturity level (DRAFT, ADVANCED, MATURE)`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--implemented-ons <on-ids>', `Implemented ON requirement IDs (comma-separated)`)
            .option('--impacted-stakeholders <ids>', `Impacted stakeholder category IDs (comma-separated)`)
            .option('--impacted-domains <ids>', `Impacted domain IDs (comma-separated)`)
            .option('--dependencies <ids>', `Dependency OR IDs (comma-separated)`)
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
                        nfrs: options.nfrs || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        path: [],
                        refinesParents: options.parent ? [options.parent] : [],
                        implementedONs: this.parseIds(options.implementedOns),
                        impactedStakeholders: this.parseIds(options.impactedStakeholders),
                        impactedDomains: this.parseIds(options.impactedDomains),
                        dependencies: this.parseIds(options.dependencies)
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
            .option('--nfrs <nfrs>', 'Non-functional requirements')
            .option('--private-notes <notes>', 'New private notes')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)')
            .option('--parent <requirement-id>', 'Parent requirement ID')
            .option('--implemented-ons <on-ids>', 'Implemented ON requirement IDs (comma-separated)')
            .option('--impacted-stakeholders <ids>', 'Impacted stakeholder category IDs (comma-separated)')
            .option('--impacted-domains <ids>', 'Impacted domain IDs (comma-separated)')
            .option('--dependencies <ids>', 'Dependency OR IDs (comma-separated)')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.type) data.type = options.type;
                    if (options.drg !== undefined) data.drg = this.validateDRG(options.drg);
                    if (options.statement) data.statement = options.statement;
                    if (options.rationale) data.rationale = options.rationale;
                    if (options.flows) data.flows = options.flows;
                    if (options.nfrs) data.nfrs = options.nfrs;
                    if (options.privateNotes) data.privateNotes = options.privateNotes;
                    if (options.maturity) data.maturity = options.maturity;
                    if (options.parent) data.refinesParents = [options.parent];
                    if (options.implementedOns !== undefined) data.implementedONs = this.parseIds(options.implementedOns);
                    if (options.impactedStakeholders) data.impactedStakeholders = this.parseIds(options.impactedStakeholders);
                    if (options.impactedDomains) data.impactedDomains = this.parseIds(options.impactedDomains);
                    if (options.dependencies) data.dependencies = this.parseIds(options.dependencies);

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