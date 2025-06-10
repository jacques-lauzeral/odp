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
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--impactsData <data-category-id>', `Impacted data category ID`)
            .option('--impactsStakeholderCategories <stakeholder-category-id>', `Impacted stakeholder category ID`)
            .option('--impactsRegulatoryAspects <regulatory-aspect-id>', `Impacted regulatory aspect ID`)
            .option('--impactsServices <service-id>', `Impacted service ID`)
            .action(async (title, options) => {
                try {
                    const data = {
                        title,
                        type: options.type || 'OR',
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        refinesParents: options.parent != null ? [ options.parent ] : [],
                        impactsData: options.impactsData != null ? [ options.impactsData ] : [],
                        impactsServices: options.impactsServices != null ? [ options.impactsServices ] : [],
                        impactsStakeholderCategories: options.impactsStakeholderCategories != null ? [ options.impactsStakeholderCategories ] : [],
                        impactsRegulatoryAspects: options.impactsRegulatoryAspects != null ? [ options.impactsRegulatoryAspects ] : [],
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
                    console.log(`Created ${this.displayName}: ${entity.name} (ID: ${entity.id})`);
                } catch (error) {
                    console.error(`Error creating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }


    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <id> <version> <title>')
            .description(`Update a ${this.displayName}`)
            .option('--type <type>', `ON | OR (default)`)
            .option('--statement <statement>', `Statement`)
            .option('--rationale <rationale>', `Rationale`)
            .option('--parent <requirement-id>', `Parent ${this.displayName} ID`)
            .option('--impactsData <data-category-id>', `Impacted data category ID`)
            .option('--impactsStakeholderCategories <stakeholder-category-id>', `Impacted stakeholder category ID`)
            .option('--impactsRegulatoryAspects <regulatory-aspect-id>', `Impacted regulatory aspect ID`)
            .option('--impactsServices <service-id>', `Impacted service ID`)
            .action(async (id, version, title, options) => {
                try {
                    const data = {
                        expectedVersionId: version,
                        title,
                        type: options.type || 'OR',
                        statement: options.statement || '',
                        rationale: options.rationale || '',
                        refinesParents: options.parent != null ? [ options.parent ] : [],
                        impactsData: options.impactsData != null ? [ options.impactsData ] : [],
                        impactsServices: options.impactsServices != null ? [ options.impactsServices ] : [],
                        impactsStakeholderCategories: options.impactsStakeholderCategories != null ? [ options.impactsStakeholderCategories ] : [],
                        impactsRegulatoryAspects: options.impactsRegulatoryAspects != null ? [ options.impactsRegulatoryAspects ] : [],
                    };

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}`, {
                        method: 'PUT',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const item = await response.json();
                    console.log(`Updated ${this.displayName}: ${item.title} (ID: ${item.id})`);
                } catch (error) {
                    console.error(`Error updating ${this.displayName}:`, error.message);
                    process.exit(1);
                }
            });
    }
}

export function operationalRequirementCommands(program, config) {
    const commands = new OperationalRequirementCommands(config);
    commands.createCommands(program);
}