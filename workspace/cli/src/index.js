#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { stakeholderCategoryCommands } from './commands/stakeholder-category.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
let config;
try {
    const configPath = join(__dirname, '..', 'config.json');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
    console.error('Failed to load configuration:', error.message);
    process.exit(1);
}

// Create main program
const program = new Command();

program
    .name('odp')
    .description('Operational Deployment Plan Management CLI')
    .version('1.0.0');

// Add stakeholder-category subcommands
stakeholderCategoryCommands(program, config);

// Parse and execute
program.parse(process.argv);