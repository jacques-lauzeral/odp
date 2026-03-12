// workspace/cli/src/commands/bandwidth.js
import { BaseCommands } from '../base-commands.js';

export function bandwidthCommands(program, config) {
    const commands = new BaseCommands(
        'bandwidth',
        'bandwidths',
        'bandwidth',
        config,
        {
            fields: ['year', 'wave', 'scope'],
            argFields: ['year'],
            headers: ['ID', 'Year', 'Wave ID', 'Scope (Domain ID)'],
            colWidths: [10, 10, 15, 20],
            createSignature: '<year>',
            updateSignature: '<id> <year>',
            hasParent: false,
            options: [
                { flag: '--wave <id>', description: 'Wave ID', field: 'wave' },
                { flag: '--scope <id>', description: 'Scope Domain ID', field: 'scope' }
            ]
        }
    );

    commands.createCommands(program);
}