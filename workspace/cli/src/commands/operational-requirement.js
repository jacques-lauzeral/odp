// workspace/cli/src/commands/operational-requirement.js
import { VersionedCommands } from '../base-commands.js';
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

    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description(`List all ${this.displayName}s (latest versions, baseline context, or edition context)`)
            .option('--baseline <id>', 'Show items as they existed in specified baseline')
            .option('--edition <id>', 'Show items in specified edition context (mutually exclusive with --baseline)')
            .option('--type <type>', 'Filter by requirement type (ON or OR)')
            .option('--domain <domain>', 'Filter by domain key — see "odp domain list" for valid values')
            .option('--title <pattern>', 'Filter by title pattern')
            .option('--text <search>', 'Full-text search across title, statement, rationale, flows, and privateNotes')
            .option('--impacted-stakeholder <id>', 'Filter by impacted stakeholder category ID (single ID; business match by default — see --impacted-stakeholder-exact-match)')
            .option('--impacted-stakeholder-exact-match', 'Restrict --impacted-stakeholder to the selected category only; default is business match (also matches its descendants)')
            .option('--acting-stakeholder <id>', 'Filter by acting stakeholder category ID (single ID; exact match)')
            .option('--lifecycle-face <face>', 'Lifecycle dataset: active | released | decommissioned | deleted (default: active)')
            .option('--projection <projection>', 'Response projection: summary | standard (default: standard)', 'standard')
            .action(async (options) => {
                try {
                    if (!['summary', 'standard'].includes(options.projection)) {
                        console.error(`Invalid projection: ${options.projection}. Valid values: summary, standard`);
                        process.exit(1);
                    }

                    const lifecycleFace = this.resolveLifecycleFace(options);

                    const { url, contextDisplay } = await this.buildContextUrl(`${this.baseUrl}/${this.urlPath}`, options);

                    const filterParams = this.buildContentFilterParams(options);
                    if (lifecycleFace !== 'active') {
                        filterParams.push(`lifecycleFace=${lifecycleFace}`);
                    }
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
                    const faceDisplay = lifecycleFace !== 'active' ? ` (Lifecycle: ${lifecycleFace})` : '';
                    const fullContextDisplay = contextDisplay + filterDisplay + faceDisplay;

                    if (items.length === 0) {
                        console.log(`No ${this.displayName}s found${fullContextDisplay}.`);
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Code', 'Type', 'Domain', 'Title', 'Version', 'Lifecycle'],
                        colWidths: [10, 15, 8, 15, 28, 9, 22]
                    });

                    items.forEach(item => {
                        table.push([
                            item.itemId,
                            item.code || '-',
                            item.type,
                            item.domain || '-',
                            item.title,
                            item.version,
                            this.formatLifecycleStatus(item.lifecycleStatus)
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
        if (options.domain) params.push(`domain=${encodeURIComponent(options.domain)}`);
        if (options.title) params.push(`title=${encodeURIComponent(options.title)}`);
        if (options.text) params.push(`text=${encodeURIComponent(options.text)}`);
        if (options.impactedStakeholder) params.push(`impactedStakeholder=${encodeURIComponent(options.impactedStakeholder)}`);
        if (options.impactedStakeholderExactMatch) params.push(`impactedStakeholderExactMatch=true`);
        if (options.actingStakeholder) params.push(`actingStakeholder=${encodeURIComponent(options.actingStakeholder)}`);
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
        if (options.domain) filters.push(`domain=${options.domain}`);
        if (options.title) filters.push(`title="${options.title}"`);
        if (options.text) filters.push(`text="${options.text}"`);
        if (options.impactedStakeholder) {
            const scope = options.impactedStakeholderExactMatch ? 'exact' : 'business';
            filters.push(`impacted-stakeholder=${options.impactedStakeholder} (${scope})`);
        }
        if (options.actingStakeholder) filters.push(`acting-stakeholder=${options.actingStakeholder}`);
        return filters.length > 0 ? ` (Filtered: ${filters.join(', ')})` : '';
    }

    displayItemDetails(item) {
        super.displayItemDetails(item);
        console.log(`Type: ${item.type}`);
        console.log(`Code: ${item.code || '—'}`);
        console.log(`Domain: ${item.domain || '—'}`);
        console.log(`Maturity: ${item.maturity || '—'}`);
        console.log(`Tentative: ${item.tentative ? `${item.tentative[0]} – ${item.tentative[1]}` : '—'}`);

        console.log(`\nStatement: ${item.statement !== undefined ? (item.statement || '—') : '(not in projection)'}`);
        console.log(`Rationale: ${item.rationale !== undefined ? (item.rationale || '—') : '(not in projection)'}`);
        console.log(`Flows: ${item.flows !== undefined ? (item.flows || '—') : '(not in projection)'}`);
        console.log(`NFRs: ${item.nfrs !== undefined ? (item.nfrs || '—') : '(not in projection)'}`);
        console.log(`Private Notes: ${item.privateNotes !== undefined ? (item.privateNotes || '—') : '(not in projection)'}`);
        console.log(`Additional Documentation: ${item.additionalDocumentation !== undefined ? (item.additionalDocumentation || '—') : '(not in projection)'}`);

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

        console.log(`Acting Stakeholders:`);
        if (item.actingStakeholders && item.actingStakeholders.length > 0) {
            item.actingStakeholders.forEach(s => console.log(`  - ${s.title} [ID: ${s.id}]`));
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
            .requiredOption('--domain <domain>', `Domain key — see "odp domain list" for valid values`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--nfrs <nfrs>', `Non-functional requirements`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--maturity <maturity>', `Maturity level (DRAFT, ADVANCED, MATURE)`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--implemented-ons <on-ids>', `Implemented ON requirement IDs (comma-separated)`)
            .option('--impacted-stakeholders <ids>', `Impacted stakeholder category IDs (comma-separated)`)
            .option('--acting-stakeholders <ids>', `Acting stakeholder category IDs (comma-separated)`)
            .option('--dependencies <ids>', `Dependency OR IDs (comma-separated)`)
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        type: options.type || 'OR',
                        domain: options.domain,
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        flows: options.flows || '',
                        nfrs: options.nfrs || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        refinesParents: options.parent ? [options.parent] : [],
                        implementedONs: this.parseIds(options.implementedOns),
                        impactedStakeholders: this.parseIds(options.impactedStakeholders),
                        actingStakeholders: this.parseIds(options.actingStakeholders),
                        dependencies: this.parseIds(options.dependencies),
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
            .description(`Update a ${this.displayName} (creates new version)`)
            .option('--type <type>', `ON | OR`)
            .option('--domain <domain>', `Domain key — see "odp domain list" for valid values`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--nfrs <nfrs>', `Non-functional requirements`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--maturity <maturity>', `Maturity level (DRAFT, ADVANCED, MATURE)`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--implemented-ons <on-ids>', `Implemented ON requirement IDs (comma-separated)`)
            .option('--impacted-stakeholders <ids>', `Impacted stakeholder category IDs (comma-separated)`)
            .option('--acting-stakeholders <ids>', `Acting stakeholder category IDs (comma-separated)`)
            .option('--dependencies <ids>', `Dependency OR IDs (comma-separated)`)
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    const data = {
                        expectedVersionId,
                        title,
                        type: options.type || 'OR',
                        domain: options.domain,
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        flows: options.flows || '',
                        nfrs: options.nfrs || '',
                        privateNotes: options.privateNotes || '',
                        maturity: options.maturity || 'DRAFT',
                        refinesParents: options.parent ? [options.parent] : [],
                        implementedONs: this.parseIds(options.implementedOns),
                        impactedStakeholders: this.parseIds(options.impactedStakeholders),
                        actingStakeholders: this.parseIds(options.actingStakeholders),
                        dependencies: this.parseIds(options.dependencies),
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

                    const item = await response.json();
                    console.log(`Updated ${this.displayName}: ${item.title} (ID: ${item.itemId})`);
                    console.log(`New version: ${item.version} (Version ID: ${item.versionId})`);
                    console.log(`Domain: ${item.domain || '—'}`);
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
            .option('--domain <domain>', 'Domain key — see "odp domain list" for valid values')
            .option('--statement <statement>', 'New statement')
            .option('--rationale <rationale>', 'New rationale')
            .option('--flows <flows>', 'New flows')
            .option('--nfrs <nfrs>', 'Non-functional requirements')
            .option('--private-notes <notes>', 'New private notes')
            .option('--maturity <maturity>', 'Maturity level (DRAFT, ADVANCED, MATURE)')
            .option('--parent <requirement-id>', 'Parent requirement ID')
            .option('--implemented-ons <on-ids>', 'Implemented ON requirement IDs (comma-separated)')
            .option('--impacted-stakeholders <ids>', 'Impacted stakeholder category IDs (comma-separated)')
            .option('--acting-stakeholders <ids>', 'Acting stakeholder category IDs (comma-separated)')
            .option('--dependencies <ids>', 'Dependency OR IDs (comma-separated)')
            .requiredOption('--change-set <id>', 'OPEN change set this write commits under (LCM)')
            .option('--commit-note <text>', 'Optional per-object note recorded on the change-set link')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };
                    if (options.title) data.title = options.title;
                    if (options.type) data.type = options.type;
                    if (options.domain !== undefined) data.domain = options.domain;
                    if (options.statement) data.statement = options.statement;
                    if (options.rationale) data.rationale = options.rationale;
                    if (options.flows) data.flows = options.flows;
                    if (options.nfrs) data.nfrs = options.nfrs;
                    if (options.privateNotes) data.privateNotes = options.privateNotes;
                    if (options.maturity) data.maturity = options.maturity;
                    if (options.parent) data.refinesParents = [options.parent];
                    if (options.implementedOns !== undefined) data.implementedONs = this.parseIds(options.implementedOns);
                    if (options.impactedStakeholders) data.impactedStakeholders = this.parseIds(options.impactedStakeholders);
                    if (options.actingStakeholders) data.actingStakeholders = this.parseIds(options.actingStakeholders);
                    if (options.dependencies) data.dependencies = this.parseIds(options.dependencies);
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

                    const item = await response.json();
                    console.log(`Patched ${this.displayName}: ${item.title} (ID: ${item.itemId})`);
                    console.log(`New version: ${item.version} (Version ID: ${item.versionId})`);
                    console.log(`Domain: ${item.domain || '—'}`);
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