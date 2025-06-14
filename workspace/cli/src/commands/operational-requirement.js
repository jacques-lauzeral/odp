// workspace/cli/src/commands/operational-requirement.js
import { VersionedCommands } from './base-commands.js';
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
     * Override displayItemDetails for operational requirements
     */
    displayItemDetails(item) {
        super.displayItemDetails(item);

        console.log(`Type: ${item.type}`);
        console.log(`Statement: ${item.statement}`);
        console.log(`Rationale: ${item.rationale}`);
        console.log(`References: ${item.references}`);
        console.log(`Risks & Opportunities: ${item.risksAndOpportunities}`);
        console.log(`Flows: ${item.flows}`);
        console.log(`Flow Examples: ${item.flowExamples}`);

        // Display relationships
        if (item.refinesParents && item.refinesParents.length > 0) {
            console.log(`\nRefines:`);
            item.refinesParents.forEach(parent => {
                console.log(`  - ${parent.title} (${parent.type}) [ID: ${parent.id}]`);
            });
        }

        if (item.impactsStakeholderCategories && item.impactsStakeholderCategories.length > 0) {
            console.log(`\nImpacts Stakeholder Categories:`);
            item.impactsStakeholderCategories.forEach(cat => {
                console.log(`  - ${cat.title} [ID: ${cat.id}]`);
            });
        }

        if (item.impactsData && item.impactsData.length > 0) {
            console.log(`\nImpacts Data:`);
            item.impactsData.forEach(data => {
                console.log(`  - ${data.title} [ID: ${data.id}]`);
            });
        }

        if (item.impactsServices && item.impactsServices.length > 0) {
            console.log(`\nImpacts Services:`);
            item.impactsServices.forEach(service => {
                console.log(`  - ${service.title} [ID: ${service.id}]`);
            });
        }

        if (item.impactsRegulatoryAspects && item.impactsRegulatoryAspects.length > 0) {
            console.log(`\nImpacts Regulatory Aspects:`);
            item.impactsRegulatoryAspects.forEach(aspect => {
                console.log(`  - ${aspect.title} [ID: ${aspect.id}]`);
            });
        }
    }

    _addCreateCommand(itemCommand) {
        itemCommand
            .command('create <title>')
            .description(`Create a new ${this.displayName}`)
            .option('--type <type>', `ON | OR (default)`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--references <references>', `References`)
            .option('--risks <risks>', `Risks and opportunities`)
            .option('--flows <flows>', `Flows`)
            .option('--flow-examples <examples>', `Flow examples`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--impacts-data <data-category-ids...>', `Impacted data category IDs`)
            .option('--impacts-stakeholders <stakeholder-category-ids...>', `Impacted stakeholder category IDs`)
            .option('--impacts-regulatory <regulatory-aspect-ids...>', `Impacted regulatory aspect IDs`)
            .option('--impacts-services <service-ids...>', `Impacted service IDs`)
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        type: options.type || 'OR',
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        references: options.references || '',
                        risksAndOpportunities: options.risks || '',
                        flows: options.flows || '',
                        flowExamples: options.flowExamples || '',
                        refinesParents: options.parent ? [options.parent] : [],
                        impactsData: options.impactsData || [],
                        impactsStakeholderCategories: options.impactsStakeholders || [],
                        impactsRegulatoryAspects: options.impactsRegulatory || [],
                        impactsServices: options.impactsServices || []
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

    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId> <title>')
            .description(`Update a ${this.displayName} (creates new version)`)
            .option('--type <type>', `ON | OR`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--references <references>', `References`)
            .option('--risks <risks>', `Risks and opportunities`)
            .option('--flows <flows>', `Flows`)
            .option('--flow-examples <examples>', `Flow examples`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--impacts-data <data-category-ids...>', `Impacted data category IDs`)
            .option('--impacts-stakeholders <stakeholder-category-ids...>', `Impacted stakeholder category IDs`)
            .option('--impacts-regulatory <regulatory-aspect-ids...>', `Impacted regulatory aspect IDs`)
            .option('--impacts-services <service-ids...>', `Impacted service IDs`)
            .action(async (itemId, expectedVersionId, title, options) => {
                try {
                    const data = {
                        expectedVersionId,
                        title,
                        type: options.type || 'OR',
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        references: options.references || '',
                        risksAndOpportunities: options.risks || '',
                        flows: options.flows || '',
                        flowExamples: options.flowExamples || '',
                        refinesParents: options.parent ? [options.parent] : [],
                        impactsData: options.impactsData || [],
                        impactsStakeholderCategories: options.impactsStakeholders || [],
                        impactsRegulatoryAspects: options.impactsRegulatory || [],
                        impactsServices: options.impactsServices || []
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
            .option('--statement <statement>', 'New statement')
            .option('--rationale <rationale>', 'New rationale')
            .option('--references <references>', 'New references')
            .option('--risks <risks>', 'New risks and opportunities')
            .option('--flows <flows>', 'New flows')
            .option('--flow-examples <examples>', 'New flow examples')
            .option('--parent <requirement-id>', 'Parent requirement ID')
            .option('--impacts-data <data-category-ids...>', 'Impacted data category IDs')
            .option('--impacts-stakeholders <stakeholder-category-ids...>', 'Impacted stakeholder category IDs')
            .option('--impacts-regulatory <regulatory-aspect-ids...>', 'Impacted regulatory aspect IDs')
            .option('--impacts-services <service-ids...>', 'Impacted service IDs')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    // Build patch payload with only provided fields
                    const data = { expectedVersionId };

                    if (options.title) data.title = options.title;
                    if (options.type) data.type = options.type;
                    if (options.statement) data.statement = options.statement;
                    if (options.rationale) data.rationale = options.rationale;
                    if (options.references) data.references = options.references;
                    if (options.risks) data.risksAndOpportunities = options.risks;
                    if (options.flows) data.flows = options.flows;
                    if (options.flowExamples) data.flowExamples = options.flowExamples;
                    if (options.parent) data.refinesParents = [options.parent];
                    if (options.impactsData) data.impactsData = options.impactsData;
                    if (options.impactsStakeholders) data.impactsStakeholderCategories = options.impactsStakeholders;
                    if (options.impactsRegulatory) data.impactsRegulatoryAspects = options.impactsRegulatory;
                    if (options.impactsServices) data.impactsServices = options.impactsServices;

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