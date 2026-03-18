// workspace/cli/src/commands/reference-document.js
import { BaseCommands } from '../base-commands.js';

export function referenceDocumentCommands(program, config) {
    const commands = new BaseCommands(
        'document',              // entityName for command
        'reference-documents',   // urlPath for API
        'reference document',    // displayName for messages
        config,
        {
            fields: ['name', 'description', 'version', 'url'],
            headers: ['ID', 'Name', 'Description', 'Version', 'URL'],
            colWidths: [10, 30, 30, 15, 50],
            createSignature: '<n> <description> <version> <url>',
            updateSignature: '<id> <n> <description> <version> <url>',
            hasParent: true
        }
    );

    commands.createCommands(program);
}