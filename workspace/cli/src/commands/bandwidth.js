// workspace/cli/src/commands/bandwidth.js
import { BaseCommands } from '../base-commands.js';

export function bandwidthCommands(program, config) {
    const commands = new BaseCommands(
        'bandwidth',
        'bandwidths',
        'bandwidth',
        config,
        {
            fields: ['year', 'wave', 'scope', 'planned'],
            argFields: ['year'],
            headers: ['ID', 'Year', 'Wave ID', 'Scope (DrG)', 'Planned (MW)'],
            colWidths: [10, 10, 15, 15, 15],
            createSignature: '<year>',
            updateSignature: '<id> <year>',
            hasParent: false,
            options: [
                { flag: '--wave <id>', description: 'Wave ID', field: 'wave' },
                { flag: '--scope <drg>', description: 'DraftingGroup key (e.g. IDL, NM_B2B); omit for global scope', field: 'scope' },
                { flag: '--planned <mw>', description: 'Planned bandwidth in MW (integer)', field: 'planned', type: 'integer' }
            ]
        }
    );

    commands.createCommands(program);
}