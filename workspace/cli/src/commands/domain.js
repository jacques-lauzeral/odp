// workspace/cli/src/commands/domain.js
import { BaseCommands } from '../base-commands.js';

export function domainCommands(program, config) {
    const commands = new BaseCommands(
        'domain',
        'domains',
        'domain',
        config,
        {
            fields: ['name', 'description', 'contact'],
            argFields: ['name', 'description'],   // contact is --contact option
            headers: ['ID', 'Name', 'Description', 'Contact'],
            colWidths: [10, 25, 40, 30],
            createSignature: '<n> <description>',
            updateSignature: '<id> <n> <description>',
            hasParent: true,
            options: [
                { flag: '--contact <contact>', description: 'Contact information', field: 'contact' }
            ]
        }
    );

    commands.createCommands(program);
}