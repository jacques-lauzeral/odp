import { BaseCommands } from './base-commands.js';

export function regulatoryAspectCommands(program, config) {
    const commands = new BaseCommands(
        'regulatory-aspect',        // entityName for command
        'regulatory-aspects',       // urlPath for API
        'regulatory aspect',        // displayName for messages
        config
    );

    commands.createCommands(program);
}