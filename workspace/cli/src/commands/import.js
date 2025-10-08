// workspace/cli/src/commands/import.js - Phase 20 Import Commands with Document Pipeline
import { Command } from 'commander';
import { DraftingGroupKeys, isDraftingGroupValid } from '../../../shared/src/index.js';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';

/**
 * ImportCommands provides bulk import functionality for ODP entities.
 * Supports both YAML-based import and document-based import pipelines.
 */
export class ImportCommands {
    constructor(config) {
        this.baseUrl = config.server.baseUrl;
    }

    /**
     * Get user ID from global program options
     */
    getUserId() {
        const program = this.getCurrentProgram();
        return program.opts().user;
    }

    /**
     * Get the current commander program instance
     */
    getCurrentProgram() {
        return process.mainModule?.exports?.program || global.program || new Command();
    }

    /**
     * Create headers with user context for API calls
     */
    createHeaders(contentType = 'application/yaml') {
        const userId = this.getUserId();
        return {
            'Content-Type': contentType,
            'x-user-id': userId
        };
    }

    /**
     * Read and validate file exists
     */
    readFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            const content = fs.readFileSync(filePath, 'utf8');

            if (!content.trim()) {
                throw new Error(`File is empty: ${filePath}`);
            }

            return content;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error(`File not found: ${filePath}`);
            }
            if (error.code === 'EACCES') {
                throw new Error(`Permission denied reading file: ${filePath}`);
            }
            throw error;
        }
    }

    /**
     * Write JSON content to file or stdout
     */
    writeOutput(data, outputPath) {
        const jsonContent = JSON.stringify(data, null, 2);

        if (outputPath) {
            fs.writeFileSync(outputPath, jsonContent, 'utf8');
            console.log(`Output written to: ${outputPath}`);
        } else {
            console.log(jsonContent);
        }
    }

    /**
     * Display import response summary
     */
    displayImportSummary(response, operationType) {
        console.log(`\n=== ${operationType.toUpperCase()} IMPORT SUMMARY ===`);

        // Display creation counts for different response formats
        let hasCreations = false;

        // Handle different response formats
        if (response.created && Object.keys(response.created).length > 0) {
            console.log('\nCreated entities:');
            Object.entries(response.created).forEach(([entityType, count]) => {
                console.log(`  ${entityType}: ${count}`);
            });
            hasCreations = true;
        } else {
            // Handle direct count properties
            const countProperties = [
                'documents',
                'stakeholderCategories',
                'services',
                'dataCategories',
                'waves',
                'requirements',
                'changes'
            ];

            const counts = countProperties.filter(prop => response[prop] > 0);
            if (counts.length > 0) {
                console.log('\nCreated entities:');
                counts.forEach(prop => {
                    console.log(`  ${prop}: ${response[prop]}`);
                });
                hasCreations = true;
            }
        }

        // Display total processed
        if (response.totalProcessed !== undefined) {
            console.log(`\nTotal processed: ${response.totalProcessed}`);
        }

        // Display errors if any
        if (response.errors && response.errors.length > 0) {
            console.log(`\nErrors encountered (${response.errors.length}):`);
            response.errors.forEach((error, index) => {
                // Handle both object and string error formats
                if (typeof error === 'string') {
                    console.log(`  ${index + 1}. ${error}`);
                } else {
                    console.log(`  ${index + 1}. ${error.entity || 'Unknown'}: ${error.message}`);
                    if (error.details) {
                        console.log(`     Details: ${error.details}`);
                    }
                }
            });
        }

        // Display warnings if any
        if (response.warnings && response.warnings.length > 0) {
            console.log(`\nWarnings (${response.warnings.length}):`);
            response.warnings.forEach((warning, index) => {
                // Handle both object and string warning formats
                if (typeof warning === 'string') {
                    console.log(`  ${index + 1}. ${warning}`);
                } else {
                    console.log(`  ${index + 1}. ${warning.entity || 'Unknown'}: ${warning.message}`);
                }
            });
        }

        // Display success/failure summary
        const hasErrors = response.errors && response.errors.length > 0;

        if (!hasCreations && !hasErrors) {
            console.log('\nNo entities were imported.');
        } else if (hasErrors) {
            console.log('\nNote: Import used greedy processing - successful entities were created despite errors.');
        } else {
            console.log('\nImport completed successfully.');
        }
    }

    /**
     * Create import commands and add them to the program
     */
    createCommands(program) {
        const importCommand = new Command('import')
            .description('Bulk import operations for ODP entities');

        // Document extraction commands
        importCommand
            .command('extract-word')
            .description('Extract raw data from Word document (.docx)')
            .requiredOption('-f, --file <path>', 'Path to Word document')
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .action(async (options) => {
                try {
                    console.log(`File path: ${options.file}`);
                    if (!fs.existsSync(options.file)) {
                        throw new Error(`File not found: ${options.file}`);
                    }
                    const fileBuffer = fs.readFileSync(options.file);
                    console.log(`File size: ${fileBuffer.length} bytes`);
                    const fileName = path.basename(options.file);
                    console.log(`File name: ${fileName}`);
                    const formData = new FormData();
                    formData.append('file', fileBuffer, fileName);

                    const response = await fetch(`${this.baseUrl}/import/extract/word`, {
                        method: 'POST',
                        headers: {
                            'x-user-id': this.getUserId(),
                            ...formData.getHeaders()
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const rawData = await response.json();
                    this.writeOutput(rawData, options.output);

                } catch (error) {
                    console.error('Error extracting Word document:', error.message);
                    process.exit(1);
                }
            });

        importCommand
            .command('extract-excel')
            .description('Extract raw data from Excel document (.xlsx)')
            .requiredOption('-f, --file <path>', 'Path to Excel document')
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .action(async (options) => {
                try {
                    console.log(`Extracting data from Excel document: ${options.file}`);

                    // Read file as buffer
                    const fileBuffer = fs.readFileSync(options.file);
                    const fileName = path.basename(options.file);

                    // Create form data
                    const formData = new FormData();
                    formData.append('file', fileBuffer, fileName);

                    const response = await fetch(`${this.baseUrl}/import/extract/excel`, {
                        method: 'POST',
                        headers: {
                            'x-user-id': this.getUserId(),
                            ...formData.getHeaders()
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const rawData = await response.json();
                    this.writeOutput(rawData, options.output);

                } catch (error) {
                    console.error('Error extracting Excel document:', error.message);
                    process.exit(1);
                }
            });

        // Mapping command
        importCommand
            .command('map')
            .description('Map raw extracted data to structured format using DrG-specific mapper')
            .requiredOption('-f, --file <path>', 'Path to raw extracted JSON file')
            .requiredOption('-d, --drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .action(async (options) => {
                try {
                    // Validate DRG parameter
                    if (!isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

                    console.log(`Mapping raw data using ${options.drg} mapper...`);
                    const rawData = JSON.parse(this.readFile(options.file));

                    const response = await fetch(`${this.baseUrl}/import/map/${options.drg}`, {
                        method: 'POST',
                        headers: this.createHeaders('application/json'),
                        body: JSON.stringify(rawData)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const structuredData = await response.json();
                    this.writeOutput(structuredData, options.output);

                } catch (error) {
                    console.error('Error mapping data:', error.message);
                    process.exit(1);
                }
            });

        // Structured import command
        importCommand
            .command('structured')
            .description('Import structured data into database')
            .requiredOption('-f, --file <path>', 'Path to structured JSON file')
            .action(async (options) => {
                try {
                    console.log(`Importing structured data from: ${options.file}`);
                    const structuredData = JSON.parse(this.readFile(options.file));

                    const response = await fetch(`${this.baseUrl}/import/structured`, {
                        method: 'POST',
                        headers: this.createHeaders('application/json'),
                        body: JSON.stringify(structuredData)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const result = await response.json();
                    this.displayImportSummary(result, 'structured');

                } catch (error) {
                    console.error('Error importing structured data:', error.message);
                    process.exit(1);
                }
            });

        // Setup import command
        importCommand
            .command('setup')
            .description('Import setup entities (StakeholderCategory, DataCategory, Service, Wave) from YAML file')
            .requiredOption('-f, --file <path>', 'Path to YAML file containing setup entities')
            .action(async (options) => {
                try {
                    console.log(`Reading setup data from: ${options.file}`);
                    const yamlContent = this.readFile(options.file);

                    console.log('Uploading to server for processing...');
                    const response = await fetch(`${this.baseUrl}/import/setup`, {
                        method: 'POST',
                        headers: this.createHeaders('application/yaml'),
                        body: yamlContent
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const result = await response.json();
                    this.displayImportSummary(result, 'setup');

                } catch (error) {
                    console.error('Error importing setup entities:', error.message);
                    process.exit(1);
                }
            });

        // Requirements import command
        importCommand
            .command('requirements')
            .description('Import operational requirements from YAML file')
            .requiredOption('-f, --file <path>', 'Path to YAML file containing operational requirements')
            .requiredOption('-d, --drg <drg>', `Drafting group for all requirements (${DraftingGroupKeys.join(', ')})`)
            .action(async (options) => {
                try {
                    // Validate DRG parameter
                    if (!isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

                    console.log(`Reading requirements data from: ${options.file}`);
                    console.log(`Target DRG: ${options.drg}`);
                    const yamlContent = this.readFile(options.file);

                    console.log('Uploading to server for processing...');
                    const url = `${this.baseUrl}/import/requirements?drg=${encodeURIComponent(options.drg)}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: this.createHeaders('application/yaml'),
                        body: yamlContent
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const result = await response.json();
                    this.displayImportSummary(result, 'requirements');

                } catch (error) {
                    console.error('Error importing requirements:', error.message);
                    process.exit(1);
                }
            });

        // Changes import command
        importCommand
            .command('changes')
            .description('Import operational changes from YAML file')
            .requiredOption('-f, --file <path>', 'Path to YAML file containing operational changes')
            .requiredOption('-d, --drg <drg>', `Drafting group for all changes (${DraftingGroupKeys.join(', ')})`)
            .action(async (options) => {
                try {
                    // Validate DRG parameter
                    if (!isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

                    console.log(`Reading changes data from: ${options.file}`);
                    console.log(`Target DRG: ${options.drg}`);
                    const yamlContent = this.readFile(options.file);

                    console.log('Uploading to server for processing...');
                    const url = `${this.baseUrl}/import/changes?drg=${encodeURIComponent(options.drg)}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: this.createHeaders('application/yaml'),
                        body: yamlContent
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const result = await response.json();
                    this.displayImportSummary(result, 'changes');

                } catch (error) {
                    console.error('Error importing changes:', error.message);
                    process.exit(1);
                }
            });

        // Add examples/help command
        importCommand
            .command('examples')
            .description('Show example workflows and file formats for import operations')
            .action(() => {
                console.log('=== DOCUMENT IMPORT WORKFLOW ===');
                console.log(`
# Two-step workflow for Word documents (NM_B2B)
odp import extract-word --file requirements.docx --output raw.json
odp import map --file raw.json --drg NM_B2B --output structured.json
odp import structured --file structured.json

# Two-step workflow for Excel documents (REROUTING)
odp import extract-excel --file requirements.xlsx --output raw.json
odp import map --file raw.json --drg REROUTING --output structured.json
odp import structured --file structured.json

# Piping workflow (extract to stdout, pipe to file)
odp import extract-word --file requirements.docx | tee raw.json
odp import map --file raw.json --drg NM_B2B | tee structured.json
odp import structured --file structured.json
`);

                console.log('\n=== SETUP IMPORT EXAMPLE ===');
                console.log(`
Example setup.yml format:

stakeholderCategories:
  - externalId: "govt-agencies"
    name: "Government Agencies"
    description: "Federal and state government entities"
    parentExternalId: null
  - externalId: "airlines"
    name: "Airlines"
    description: "Commercial airline operators"
    parentExternalId: null

dataCategories:
  - externalId: "flight-data"
    name: "Flight Data"
    description: "Aircraft flight information"
    parentExternalId: null

services:
  - externalId: "atm-service"
    name: "ATM Service"
    description: "Air Traffic Management service"
    visibility: "NETWORK"
    parentExternalId: null

waves:
  - externalId: "wave-2027-q2"
    name: "2027.2"
    year: 2027
    quarter: 2
    date: "2027-06-30"
`);

                console.log('\n=== REQUIREMENTS IMPORT EXAMPLE ===');
                console.log(`
Example requirements.yml format:

requirements:
  - externalId: "req-001"
    title: "Flight Plan Processing"
    type: "OR"
    statement: "The system shall process flight plans"
    rationale: "Required for air traffic management"
    references: "ICAO Doc 4444"
    flows: "Flight plan submission flow"
    parentExternalId: null
    implementedONs: ["on-001", "on-002"]
    impactedDataCategories: ["flight-data"]
    impactedStakeholderCategories: ["airlines"]
    impactedServices: ["atm-service"]
`);

                console.log('\n=== CHANGES IMPORT EXAMPLE ===');
                console.log(`
Example changes.yml format:

changes:
  - externalId: "RR-OC-1-1"
    title: "RR Tools - Rerouting calculation improvements"
    purpose: "Empower the system to compute more meaningful routing options"
    initialState: "Current routing engine uses limited sources"
    finalState: "Enhanced routing with multiple sources and dynamic updates"
    details: "This OC aims to improve the rerouting engine..."
    visibility: "NETWORK"
    satisfiedORs: ["RR-OR-1-01", "RR-OR-1-07"]
    supersededORs: []
    milestones:
      - title: "Production Deployment"
        description: "Deploy to production environment"
        eventType: "OPS_DEPLOYMENT"
        wave: "2027.2"
`);

                console.log('\n=== USAGE EXAMPLES ===');
                console.log(`
# Import setup entities
odp import setup --file setup.yml

# Import requirements with specific DRG
odp import requirements --drg IDL --file requirements.yml

# Import changes with specific DRG
odp import changes --drg RRT --file changes.yml

# Available DRG values: ${DraftingGroupKeys.join(', ')}
`);
            });

        program.addCommand(importCommand);
    }
}

export function importCommands(program, config) {
    const commands = new ImportCommands(config);
    commands.createCommands(program);
}