import { Command } from 'commander';
import { DraftingGroupKeys, isDraftingGroupValid } from '../../../shared/src/index.js';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';

/**
 * ImportCommands provides document extraction, mapping, and structured data import functionality.
 * Supports three-stage pipeline: extraction → mapping → import
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
    createHeaders(contentType = 'application/json') {
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

        // Display creation counts
        let hasCreations = false;

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

        // Display total processed
        if (response.totalProcessed !== undefined) {
            console.log(`\nTotal processed: ${response.totalProcessed}`);
        }

        // Display errors if any
        if (response.errors && response.errors.length > 0) {
            console.log(`\nErrors encountered (${response.errors.length}):`);
            response.errors.forEach((error, index) => {
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
            .description('Document extraction, mapping, and structured data import');

        // Extract Word document command
        importCommand
            .command('extract-word')
            .description('Extract raw data from Word document (.docx)')
            .requiredOption('-f, --file <path>', 'Path to Word document')
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .action(async (options) => {
                try {
                    console.log(`Reading file: ${options.file}`);
                    if (!fs.existsSync(options.file)) {
                        throw new Error(`File not found: ${options.file}`);
                    }

                    const fileBuffer = fs.readFileSync(options.file);
                    const fileName = path.basename(options.file);
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

        // Extract hierarchical Word documents command
        importCommand
            .command('extract-word-hierarchy')
            .description('Extract raw data from hierarchical Word documents (ZIP)')
            .requiredOption('-f, --file <path>', 'Path to ZIP file')
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .option('-v, --verbose', 'Show detailed extraction progress')
            .action(async (options) => {
                try {
                    console.log(`Reading file: ${options.file}`);
                    if (!fs.existsSync(options.file)) {
                        throw new Error(`File not found: ${options.file}`);
                    }

                    const fileBuffer = fs.readFileSync(options.file);
                    const fileName = path.basename(options.file);
                    const formData = new FormData();
                    formData.append('file', fileBuffer, fileName);

                    const response = await fetch(`${this.baseUrl}/import/extract/word-hierarchy`, {
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

                    if (options.verbose) {
                        console.log(`Extracted ${rawData.metadata?.zipEntryCount || 0} files from ZIP`);
                        console.log(`Found ${rawData.sections?.length || 0} top-level sections`);
                        this.writeOutput(rawData, options.output);
                    } else {
                        this.writeOutput(rawData, options.output);
                    }

                } catch (error) {
                    console.error('Error extracting hierarchical Word documents:', error.message);
                    process.exit(1);
                }
            });

        // Extract Excel document command
        importCommand
            .command('extract-excel')
            .description('Extract raw data from Excel document (.xlsx)')
            .requiredOption('-f, --file <path>', 'Path to Excel document')
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .action(async (options) => {
                try {
                    console.log(`Reading file: ${options.file}`);
                    if (!fs.existsSync(options.file)) {
                        throw new Error(`File not found: ${options.file}`);
                    }

                    const fileBuffer = fs.readFileSync(options.file);
                    const fileName = path.basename(options.file);
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

        // Map command
        importCommand
            .command('map')
            .description('Map raw extracted data to structured import format')
            .requiredOption('-f, --file <path>', 'Path to raw extracted JSON')
            .requiredOption('-d, --drg <drg>', `Drafting group (${DraftingGroupKeys.join(', ')})`)
            .option('-o, --output <path>', 'Output JSON file (default: stdout)')
            .option('-s, --specific', 'Use DrG-specific mapper (default: standard format for round-trip editing)')
            .option('--folder <name>', 'Target folder within DrG (required for some DrGs like IDL)')
            .action(async (options) => {
                try {
                    // Validate DRG
                    if (!isDraftingGroupValid(options.drg)) {
                        console.error(`Invalid DRG value: ${options.drg}`);
                        console.error(`Valid values: ${DraftingGroupKeys.join(', ')}`);
                        process.exit(1);
                    }

                    console.log(`Reading raw data from: ${options.file}`);
                    console.log(`Mapping with DrG: ${options.drg}`);
                    if (options.folder) {
                        console.log(`Target folder: ${options.folder}`);
                    }
                    console.log(`Mapper mode: ${options.specific ? 'DrG-specific' : 'standard (round-trip)'}`);

                    const rawData = JSON.parse(this.readFile(options.file));

                    // Build URL with query parameters
                    const url = new URL(`${this.baseUrl}/import/map/${options.drg}`);
                    if (options.specific) {
                        url.searchParams.set('specific', 'true');
                    }
                    if (options.folder) {
                        url.searchParams.set('folder', options.folder);
                    }

                    const response = await fetch(url.toString(), {
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
                    console.error('Error mapping to structured data:', error.message);
                    process.exit(1);
                }
            });

        // Structured import command
        importCommand
            .command('structured')
            .description('Import structured data into database')
            .requiredOption('-f, --file <path>', 'Path to structured JSON payload')
            .option('-s, --specific', 'Use DrG-specific mapper (default: standard format for round-trip editing)')
            .action(async (options) => {
                try {
                    console.log(`Reading structured data from: ${options.file}`);
                    const structuredData = JSON.parse(this.readFile(options.file));

                    console.log('Importing structured data into database...');
                    console.log(`Import mode: ${options.specific ? 'DrG-specific' : 'standard (round-trip)'}`);

                    // Build URL with query parameter
                    const url = new URL(`${this.baseUrl}/import/structured`);
                    if (options.specific) {
                        url.searchParams.set('specific', 'true');
                    }

                    const response = await fetch(url.toString(), {
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

        // Examples command
        importCommand
            .command('examples')
            .description('Show example workflows for import operations')
            .action(() => {
                console.log('=== DOCUMENT IMPORT WORKFLOW ===');
                console.log(`
# ROUND-TRIP EDITING WORKFLOW (default - standard format)
# Export from ODP → Edit in Word → Re-import
odp import extract-word --file crisis_faas-on-or-oc.docx --output raw.json
odp import map --file raw.json --drg CRISIS_FAAS --output structured.json
odp import structured --file structured.json

# ORIGINAL SOURCE IMPORT WORKFLOW (DrG-specific format)
# Import original DrG materials with specialized mappers
odp import extract-word --file NM_B2B_Requirements.docx --output raw.json
odp import map --file raw.json --drg NM_B2B --specific --output structured.json
odp import structured --file structured.json --specific

# IDL IMPORT WITH FOLDER (section-based format)
odp import extract-word --file iDL_ADP_Requirements.docx --output raw.json
odp import map --file raw.json --drg IDL --folder iDLADP --specific --output structured.json
odp import structured --file structured.json --specific

# IDL IMPORT WITH FOLDER (table-based format)
odp import extract-word --file iDL_ADM_Requirements.docx --output raw.json
odp import map --file raw.json --drg IDL --folder iDLADM --specific --output structured.json
odp import structured --file structured.json --specific

# Three-step workflow for hierarchical Word documents (ZIP)
odp import extract-word-hierarchy --file FLOW_Requirements.zip --output raw.json
odp import map --file raw.json --drg FLOW --specific --output structured.json
odp import structured --file structured.json --specific

# Three-step workflow for Excel documents
odp import extract-excel --file 4dt-requirements.xlsx --output raw.json
odp import map --file raw.json --drg 4DT --specific --output structured.json
odp import structured --file structured.json --specific

# Available DRG values: ${DraftingGroupKeys.join(', ')}

# IDL FOLDERS:
# Section-based: iDLADP, iDLADMM
# Table-based: iDLADM, AURA, TCF, NET, LoA, IAM, MAP, NFR, HMI, TCT

# MAPPER MODES:
# --specific flag OFF (default): Standard format mapper for round-trip editing
#   - Processes exported .docx with table-based entities
#   - Code field preserves entity identity
# --specific flag ON: DrG-specific mapper for original source documents
#   - Uses specialized parser for each DrG's unique format
#   - NM_B2B_Mapper, AirportMapper, iDL_Mapper_sections, iDL_Mapper_tables, etc.
`);
            });

        program.addCommand(importCommand);
    }
}



/**
 * Export function to create and register import commands
 */
export function importCommands(program, config) {
    const commands = new ImportCommands(config);
    commands.createCommands(program);
}