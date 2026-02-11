// workspace/cli/src/commands/publication.js
import { Command } from 'commander';
import fetch from 'node-fetch';
import fs from 'fs';

/**
 * PublicationCommands provides publication generation commands.
 * Supports generating Antora sites, PDFs, and Word documents from editions or repository.
 */
class PublicationCommands {
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
     * Create headers for publication requests
     */
    createHeaders() {
        const userId = this.getUserId();
        return {
            'x-user-id': userId
        };
    }

    /**
     * Creates and returns the publication command with all subcommands
     */
    createCommands(program) {
        const publicationCommand = new Command('publication')
            .description('Generate ODIP publications in multiple formats');

        this.addAntoraCommand(publicationCommand);
        this.addPdfCommand(publicationCommand);
        this.addDocxCommand(publicationCommand);

        program.addCommand(publicationCommand);
    }

    addAntoraCommand(publicationCommand) {
        publicationCommand
            .command('antora')
            .description('Generate Antora multipage website (ZIP archive)')
            .option('--edition <id>', 'Edition ID (omit for entire repository)')
            .requiredOption('-o, --output <path>', 'Output file path for ZIP archive')
            .action(async (options) => {
                try {
                    let url = `${this.baseUrl}/publications/antora`;
                    if (options.edition) {
                        url += `?editionId=${encodeURIComponent(options.edition)}`;
                    }

                    const scope = options.edition ? `edition ${options.edition}` : 'entire repository';
                    console.log(`Generating Antora site for ${scope}...`);

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`Edition with ID ${options.edition} not found.`);
                        process.exit(1);
                    }

                    if (response.status === 501) {
                        const error = await response.json();
                        console.error(`Not yet implemented: ${error.error?.message}`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const zipBuffer = await response.buffer();

                    // Write ZIP to file
                    fs.writeFileSync(options.output, zipBuffer);
                    console.log(`✓ Antora site exported to: ${options.output}`);
                    console.log(`  Size: ${(zipBuffer.length / 1024).toFixed(2)} KB`);
                } catch (error) {
                    console.error('Error generating Antora site:', error.message);
                    process.exit(1);
                }
            });
    }

    addPdfCommand(publicationCommand) {
        publicationCommand
            .command('pdf')
            .description('Generate single PDF document')
            .option('--edition <id>', 'Edition ID (omit for entire repository)')
            .requiredOption('-o, --output <path>', 'Output file path for PDF')
            .action(async (options) => {
                try {
                    let url = `${this.baseUrl}/publications/pdf`;
                    if (options.edition) {
                        url += `?editionId=${encodeURIComponent(options.edition)}`;
                    }

                    const scope = options.edition ? `edition ${options.edition}` : 'entire repository';
                    console.log(`Generating PDF for ${scope}...`);

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`Edition with ID ${options.edition} not found.`);
                        process.exit(1);
                    }

                    if (response.status === 501) {
                        const error = await response.json();
                        console.error(`Not yet implemented: ${error.error?.message}`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const pdfBuffer = await response.buffer();

                    // Write PDF to file
                    fs.writeFileSync(options.output, pdfBuffer);
                    console.log(`✓ PDF exported to: ${options.output}`);
                    console.log(`  Size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
                } catch (error) {
                    console.error('Error generating PDF:', error.message);
                    process.exit(1);
                }
            });
    }

    addDocxCommand(publicationCommand) {
        publicationCommand
            .command('docx')
            .description('Generate single Word document')
            .option('--edition <id>', 'Edition ID (omit for entire repository)')
            .requiredOption('-o, --output <path>', 'Output file path for Word document')
            .action(async (options) => {
                try {
                    let url = `${this.baseUrl}/publications/docx`;
                    if (options.edition) {
                        url += `?editionId=${encodeURIComponent(options.edition)}`;
                    }

                    const scope = options.edition ? `edition ${options.edition}` : 'entire repository';
                    console.log(`Generating Word document for ${scope}...`);

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) {
                        console.error(`Edition with ID ${options.edition} not found.`);
                        process.exit(1);
                    }

                    if (response.status === 501) {
                        const error = await response.json();
                        console.error(`Not yet implemented: ${error.error?.message}`);
                        process.exit(1);
                    }

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const docxBuffer = await response.buffer();

                    // Write Word document to file
                    fs.writeFileSync(options.output, docxBuffer);
                    console.log(`✓ Word document exported to: ${options.output}`);
                    console.log(`  Size: ${(docxBuffer.length / 1024).toFixed(2)} KB`);
                } catch (error) {
                    console.error('Error generating Word document:', error.message);
                    process.exit(1);
                }
            });
    }
}

export function publicationCommands(program, config) {
    const commands = new PublicationCommands(config);
    commands.createCommands(program);
}