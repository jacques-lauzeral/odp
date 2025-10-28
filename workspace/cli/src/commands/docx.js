// workspace/cli/src/commands/docx.js
import { Command } from 'commander';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export function docxCommands(program, config) {
    const docxCommand = new Command('docx')
        .description('DocX document operations (import/export)');

    // Export subcommand
    docxCommand
        .command('export <drg>')
        .description('Export operational requirements and changes for a DRG as Word document')
        .option('-o, --output <filename>', 'Output filename (default: on-or-oc-{drg}.docx)')
        .action(async (drg, options) => {
            try {
                const userId = program.opts().user;
                const url = `${config.server.baseUrl}/docx/export?drg=${drg}`;

                console.log(`Exporting requirements and changes for DRG: ${drg}...`);

                const response = await fetch(url, {
                    headers: {
                        'x-user-id': userId
                    }
                });

                if (!response.ok) {
                    if (response.headers.get('content-type')?.includes('application/json')) {
                        const error = await response.json();
                        throw new Error(error.error?.message || `HTTP ${response.status}`);
                    }
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                // Generate filename
                const filename = options.output ||
                    `on-or-oc-${drg.toLowerCase()}.docx`;

                // Save the file
                const buffer = await response.buffer();
                fs.writeFileSync(filename, buffer);

                console.log(`✓ Document exported successfully: ${filename}`);
                console.log(`  Size: ${(buffer.length / 1024).toFixed(2)} KB`);

            } catch (error) {
                console.error('Error exporting requirements and changes:', error.message);
                process.exit(1);
            }
        });

    // Future: Add import-requirements command here
    // docxCommand.command('import-requirements <file>')...

    program.addCommand(docxCommand);
}