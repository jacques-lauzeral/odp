// workspace/cli/src/commands/waves.js
import { BaseCommands } from '../base-commands.js';

export function waveCommands(program, config) {
    const commands = new BaseCommands(
        'wave',                  // entityName for command
        'waves',                 // urlPath for API
        'wave',                  // displayName for messages
        config,
        {
            fields: ['year', 'quarter', 'date', 'name'],
            headers: ['ID', 'Year', 'Quarter', 'Date', 'Name'],
            colWidths: [10, 10, 10, 15, 15],
            createSignature: '<year> <quarter> <date>',
            updateSignature: '<id> <year> <quarter> <date>',
            hasParent: false
        }
    );

    commands.createCommands(program);
}