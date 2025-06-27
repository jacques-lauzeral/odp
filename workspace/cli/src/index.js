// workspace/cli/src/index.js - Updated CLI entry point with ODP Edition commands
import { Command } from 'commander';
import config from '../config.json' assert { type: 'json' };

// Import entity command functions
import { stakeholderCategoryCommands } from './commands/stakeholder-category.js';
import { regulatoryAspectCommands } from './commands/regulatory-aspect.js';
import { dataCategoryCommands } from './commands/data-category.js';
import { serviceCommands } from './commands/service.js';
import { waveCommands } from './commands/wave.js';
import { baselineCommands } from './commands/baseline.js';
import { editionCommands } from './commands/odp-edition.js';  // Added ODP Edition commands
import { operationalRequirementCommands } from './commands/operational-requirement.js';
import { operationalChangeCommands } from './commands/operational-change.js';

const program = new Command();

// Configure global program with required user option
program
    .name('odp')
    .description('Operational Deployment Plan CLI')
    .version('1.0.0')
    .option('--user <userId>', 'User identifier for audit context (required)')
    .hook('preAction', (thisCommand, actionCommand) => {
        // Validate user argument before any command execution
        const options = thisCommand.opts();
        if (!options.user) {
            console.error('Error: --user argument is required for all operations');
            console.error('Usage: npm run dev -- --user <userId> <command> [options]');
            console.error('');
            console.error('Examples:');
            console.error('  npm run dev -- --user john.doe stakeholder-category list');
            console.error('  npm run dev -- --user jane.smith service create "API Gateway" "Main API service"');
            console.error('  npm run dev -- --user admin operational-requirement show 123');
            console.error('  npm run dev -- --user admin baseline create "Q1 2025 Release"');
            console.error('  npm run dev -- --user admin requirement list --baseline 456');
            console.error('  npm run dev -- --user admin odp create "Q1 Edition" 123 DRAFT 456');
            process.exit(1);
        }
    });

// Make program globally accessible for BaseCommands
global.program = program;

// Register all entity commands
stakeholderCategoryCommands(program, config);
regulatoryAspectCommands(program, config);
dataCategoryCommands(program, config);
serviceCommands(program, config);
waveCommands(program, config);
baselineCommands(program, config);
editionCommands(program, config);
operationalRequirementCommands(program, config);
operationalChangeCommands(program, config);

// Parse command line arguments
program.parse();