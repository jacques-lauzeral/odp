// workspace/cli/src/commands/reference-document.js
import { BaseCommands } from '../base-commands.js';

export function referenceDocumentCommands(program, config) {
    const commands = new BaseCommands(
        'document',              // entityName for command
        'reference-documents',   // urlPath for API
        'reference document',    // displayName for messages
        config,
        {
            fields: ['name', 'version', 'url'],
            headers: ['ID', 'Name', 'Version', 'URL'],
            colWidths: [10, 30, 15, 50],
            createSignature: '<n> <version> <url>',
            updateSignature: '<id> <n> <version> <url>',
            hasParent: false
        }
    );

    commands.createCommands(program);
}