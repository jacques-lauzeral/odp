// workspace/cli/src/commands/wave.js
import { BaseCommands } from '../base-commands.js';

export function waveCommands(program, config) {
    const commands = new BaseCommands(
        'wave',                  // entityName for command
        'waves',                 // urlPath for API
        'wave',                  // displayName for messages
        config,
        {
            fields: ['year', 'sequenceNumber', 'implementationDate'],
            headers: ['ID', 'Year', 'Sequence Number', 'Implementation Date'],
            colWidths: [10, 10, 18, 25],
            createSignature: '<year> <sequenceNumber> <implementationDate>',
            updateSignature: '<id> <year> <sequenceNumber> <implementationDate>',
            hasParent: false
        }
    );

    commands.createCommands(program);
}