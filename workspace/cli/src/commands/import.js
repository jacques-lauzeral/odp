import { Command } from 'commander';
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { globSync } from 'node:fs';

/**
 * ImportCommands provides distributed edition source JSON import functionality.
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
     * Display distributed import response summary
     */
    displayDistributedImportSummary(response, fileName) {
        console.log(`\n=== ${fileName.toUpperCase()} IMPORT SUMMARY ===`);

        const countProperties = ['chapters', 'requirements'];
        const counts = countProperties.filter(prop => response[prop] > 0);
        if (counts.length > 0) {
            console.log('\nImported:');
            counts.forEach(prop => console.log(`  ${prop}: ${response[prop]}`));
        }

        if (response.warnings && response.warnings.length > 0) {
            console.log(`\nWarnings (${response.warnings.length}):`);
            response.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${typeof w === 'string' ? w : JSON.stringify(w)}`));
        }

        if (response.errors && response.errors.length > 0) {
            console.log(`\nErrors (${response.errors.length}):`);
            response.errors.forEach((e, i) => console.log(`  ${i + 1}. ${typeof e === 'string' ? e : JSON.stringify(e)}`));
        }

        const hasErrors = response.errors && response.errors.length > 0;
        if (!hasErrors) {
            console.log('\nImport completed successfully.');
        } else {
            console.log('\nNote: Import used greedy processing — successful entities were created despite errors.');
        }
    }

    /**
     * Create import commands and add them to the program
     */
    createCommands(program) {
        const importCommand = new Command('import')
            .description('Distributed edition source JSON import');

        // Distributed edition import command
        importCommand
            .command('distributed')
            .description('Import distributed edition source JSON file(s) directly into database')
            .requiredOption('-f, --file <pattern>', 'Path or glob pattern for source JSON file(s) (e.g. "sources/*.json")')
            .requiredOption('--change-set <id>', 'OPEN change set every imported version commits under (LCM)')
            .option('--continue-on-error', 'Continue processing remaining files when a file fails (default: stop on first error)')
            .action(async (options) => {
                const files = globSync(options.file).sort();

                if (files.length === 0) {
                    console.warn(`No files matched pattern: ${options.file}`);
                    process.exit(0);
                }

                console.log(`Found ${files.length} source file(s) to import.`);
                if (files.length > 1) {
                    console.log(`Error handling: ${options.continueOnError ? 'continue on error' : 'stop on first error'}`);
                }

                const url = `${this.baseUrl}/import/distributed?changeSetId=${encodeURIComponent(options.changeSet)}`;

                const countProperties = ['chapters', 'requirements'];
                const totals = Object.fromEntries(countProperties.map(p => [p, 0]));
                const allErrors = [];
                let filesProcessed = 0;
                let filesFailed = 0;

                for (const filePath of files) {
                    console.log(`\n--- Importing: ${filePath} ---`);
                    try {
                        const sourceData = JSON.parse(this.readFile(filePath));

                        const response = await fetch(url, {
                            method: 'POST',
                            headers: this.createHeaders('application/json'),
                            body: JSON.stringify(sourceData)
                        });

                        if (!response.ok) {
                            const error = await response.json();
                            throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                        }

                        const result = await response.json();
                        this.displayDistributedImportSummary(result, path.basename(filePath));
                        filesProcessed++;

                        countProperties.forEach(p => { totals[p] += result[p] ?? 0; });
                        if (result.errors?.length) {
                            result.errors.forEach(e => allErrors.push(`[${path.basename(filePath)}] ${typeof e === 'string' ? e : (e.message ?? JSON.stringify(e))}`));
                        }

                    } catch (error) {
                        filesFailed++;
                        const msg = `Failed to import ${filePath}: ${error.message}`;
                        if (options.continueOnError) {
                            console.error(msg);
                            allErrors.push(msg);
                        } else {
                            console.error(msg);
                            process.exit(1);
                        }
                    }
                }

                if (files.length > 1) {
                    console.log('\n=== GRAND TOTAL ===');
                    console.log(`Files processed: ${filesProcessed} / ${files.length}${filesFailed ? ` (${filesFailed} failed)` : ''}`);
                    const nonZero = countProperties.filter(p => totals[p] > 0);
                    if (nonZero.length > 0) {
                        console.log('Total entities imported:');
                        nonZero.forEach(p => console.log(`  ${p}: ${totals[p]}`));
                    }
                    if (allErrors.length > 0) {
                        console.log(`\nTotal errors (${allErrors.length}):`);
                        allErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
                    }
                }

                if (filesFailed > 0) {
                    process.exit(1);
                }
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