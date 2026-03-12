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
        console.log(`Code: ${item.code || 'Not set'}`);
        console.log(`DRG: ${item.drg ? getDraftingGroupDisplay(item.drg) : 'Not set'}`);
        console.log(`Maturity: ${item.maturity || 'Not set'}`);
        console.log(`Statement: ${item.statement}`);
        console.log(`Rationale: ${item.rationale}`);
        console.log(`Flows: ${item.flows}`);
        console.log(`NFRs: ${item.nfrs || 'None'}`);
        console.log(`Private Notes: ${item.privateNotes || 'None'}`);

        if (item.tentative) {
            console.log(`Tentative: ${item.tentative.start} – ${item.tentative.end}`);
        }

        if (item.path && item.path.length > 0) {
            console.log(`Path: ${item.path.join(' > ')}`);
        }

        if (item.domain) {
            console.log(`\nDomain: ${item.domain.name} [ID: ${item.domain.id}]`);
        }

        if (item.refinesParents && item.refinesParents.length > 0) {
            console.log(`\nRefines:`);
            item.refinesParents.forEach(parent => {
                console.log(`  - ${parent.code} [ID: ${parent.id}] ${parent.title}`);
            });
        }

        if (item.implementedONs && item.implementedONs.length > 0) {
            console.log(`\nImplemented ONs:`);
            item.implementedONs.forEach(on => {
                console.log(`  - ${on.code} [ID: ${on.id}] ${on.title}`);
            });
        }

        if (item.impactedStakeholders && item.impactedStakeholders.length > 0) {
            console.log(`\nImpacted Stakeholders:`);
            item.impactedStakeholders.forEach(cat => {
                console.log(`  - ${cat.title} [ID: ${cat.id}]`);
            });
        }

        if (item.impactedDomains && item.impactedDomains.length > 0) {
            console.log(`\nImpacted Domains:`);
            item.impactedDomains.forEach(domain => {
                console.log(`  - ${domain.name} [ID: ${domain.id}]`);
            });
        }

        if (item.dependencies && item.dependencies.length > 0) {
            console.log(`\nDependencies:`);
            item.dependencies.forEach(dep => {
                console.log(`  - ${dep.code} [ID: ${dep.id}] ${dep.title}`);
            });
        }

        if (item.strategicDocuments && item.strategicDocuments.length > 0) {
            console.log(`\nStrategic Documents:`);
            item.strategicDocuments.forEach(ref => {
                const note = ref.note ? ` - Note: "${ref.note}"` : '';
                console.log(`  - ${ref.title} [ID: ${ref.id}]${note}`);
            });
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
            .option('--type <type>', `ON | OR (default: OR)`)
            .option('--drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--flows <flows>', `Flows`)
            .option('--nfrs <nfrs>', `Non-functional requirements`)
            .option('--private-notes <notes>', `Private notes`)
            .option('--maturity <maturity>', `Maturity level (DRAFT, ADVANCED, MATURE)`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--domain <domain-id>', `Domain ID (mandatory for root ONs)`)
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
                        domainId: options.domain || null,
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
            .option('--domain <domain-id>', `Domain ID`)
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
                        domainId: options.domain || null,
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
            .option('--domain <domain-id>', 'Domain ID')
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
                    if (options.domain) data.domainId = options.domain;
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