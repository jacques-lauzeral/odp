// workspace/cli/src/commands/publication.js
import { Command } from 'commander';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import AdmZip from 'adm-zip';

/**
 * PublicationCommands provides publication generation commands.
 * Supports generating Antora sites, PDFs, and Word documents from editions or repository.
 */
class PublicationCommands {
    constructor(config) {
        this.baseUrl = config.server.baseUrl;
    }

    getUserId() {
        const program = this.getCurrentProgram();
        return program.opts().user;
    }

    getCurrentProgram() {
        return process.mainModule?.exports?.program || global.program || new Command();
    }

    createHeaders() {
        return { 'x-user-id': this.getUserId() };
    }

    /**
     * Run a command, catching errors as warnings instead of fatal failures.
     * @returns {boolean} true if successful, false if failed (warning emitted)
     */
    _tryExec(label, cmd, opts) {
        try {
            execSync(cmd, opts);
            return true;
        } catch (error) {
            console.warn(`⚠ ${label} failed (skipped): ${error.message.split('\n')[0]}`);
            return false;
        }
    }

    /**
     * Common git init + npm install sequence before Antora builds.
     */
    _initRepo(targetDir) {
        console.log('Initializing git repository...');
        execSync('git init', { cwd: targetDir, stdio: 'inherit' });
        execSync('git add .', { cwd: targetDir, stdio: 'inherit' });
        execSync('git commit -m "odip publication"', { cwd: targetDir, stdio: 'inherit' });
        console.log('✓ Git repository initialized');

        console.log('Installing dependencies...');
        execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
        console.log('✓ Dependencies installed');
    }

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
            .description('Generate Antora multipage website')
            .option('--edition <id>', 'Edition ID (omit for entire repository)')
            .requiredOption('-o, --output <dir>', 'Target directory (must not exist, will be created)')
            .option('--build', 'Build HTML site (+ PDF if Ruby/Bundler available)')
            .option('--build-all', 'Build HTML site, PDF (if available), and Word document (if pandoc available)')
            .action(async (options) => {
                const targetDir = path.resolve(options.output);
                const zipPath = path.join(targetDir, 'odip-publication.zip');
                const doBuild = options.build || options.buildAll;

                try {
                    // --- 1. Validate target directory ---
                    if (fs.existsSync(targetDir)) {
                        console.error(`Error: target directory already exists: ${targetDir}`);
                        process.exit(1);
                    }
                    fs.mkdirSync(targetDir, { recursive: true });
                    console.log(`Created target directory: ${targetDir}`);

                    // --- 2. Fetch ZIP from server ---
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

                    // --- 3. Write ZIP ---
                    const arrayBuffer = await response.arrayBuffer();
                    const zipBuffer = Buffer.from(arrayBuffer);
                    fs.writeFileSync(zipPath, zipBuffer);
                    console.log(`✓ Archive written (${(zipBuffer.length / 1024).toFixed(2)} KB)`);

                    // --- 4. Extract ZIP ---
                    console.log('Extracting archive...');
                    const zip = new AdmZip(zipPath);
                    zip.extractAllTo(targetDir, true);
                    console.log('✓ Archive extracted');

                    // --- 5. Remove ZIP ---
                    fs.unlinkSync(zipPath);
                    console.log('✓ Archive removed');

                    // --- 6. Build ---
                    if (doBuild) {
                        this._initRepo(targetDir);

                        // HTML site (lunr search only, no Ruby dependency)
                        console.log('Building HTML site...');
                        const siteOk = this._tryExec(
                            'HTML site build',
                            'npx antora antora-playbook.yml',
                            { cwd: targetDir, stdio: 'inherit' }
                        );
                        if (siteOk) {
                            console.log(`✓ Site built: ${path.join(targetDir, 'build', 'site')}`);
                        }

                        if (options.buildAll) {
                            // PDF (requires Ruby/Bundler + asciidoctor-pdf gem)
                            console.log('Building PDF...');
                            const pdfOk = this._tryExec(
                                'PDF build',
                                'npx antora antora-playbook-pdf.yml',
                                { cwd: targetDir, stdio: 'inherit' }
                            );
                            if (pdfOk) {
                                console.log(`✓ PDF built: ${path.join(targetDir, 'build', 'assembler', 'pdf')}`);
                            }

                            // Word document (requires pandoc)
                            console.log('Building Word document...');
                            const docxOk = this._tryExec(
                                'Word document build',
                                'npx antora antora-playbook-docx.yml',
                                { cwd: targetDir, stdio: 'inherit' }
                            );
                            if (docxOk) {
                                console.log(`✓ Word document built: ${path.join(targetDir, 'build', 'assembler', 'docx')}`);
                            }
                        }
                    } else {
                        console.log(`\nTo build the site manually:`);
                        console.log(`  cd ${targetDir}`);
                        console.log(`  git init && git add . && git commit -m "odip publication"`);
                        console.log(`  npm install`);
                        console.log(`  npx antora antora-playbook.yml          # HTML site`);
                        console.log(`  npx antora antora-playbook-pdf.yml      # PDF (requires Ruby)`);
                        console.log(`  npx antora antora-playbook-docx.yml     # Word document (requires pandoc)`);
                    }

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
                const outputPath = path.resolve(options.output);
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

                    const arrayBuffer = await response.arrayBuffer();
                    const pdfBuffer = Buffer.from(arrayBuffer);
                    fs.writeFileSync(outputPath, pdfBuffer);
                    console.log(`✓ PDF exported to: ${outputPath}`);
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
                const outputPath = path.resolve(options.output);
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

                    const arrayBuffer = await response.arrayBuffer();
                    const docxBuffer = Buffer.from(arrayBuffer);
                    fs.writeFileSync(outputPath, docxBuffer);
                    console.log(`✓ Word document exported to: ${outputPath}`);
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