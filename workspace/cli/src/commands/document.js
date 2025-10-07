import { BaseCommands } from '../base-commands.js';

export function documentCommands(program, config) {
    const commands = new BaseCommands(
        'document',                  // entityName for command
        'documents',                 // urlPath for API
        'document',                  // displayName for messages
        config,
        {
            fields: ['name', 'version', 'description', 'url'],
            headers: ['ID', 'Name', 'Version', 'Description', 'URL'],
            colWidths: [10, 30, 15, 35, 40],
            createSignature: '<name> <version> <description> <url>',
            updateSignature: '<id> <name> <version> <description> <url>',
            hasParent: false
        }
    );

    commands.createCommands(program);
}