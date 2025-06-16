import { BaseCommands } from '../base-commands.js';

export function serviceCommands(program, config) {
    const commands = new BaseCommands(
        'service',                  // entityName for command
        'services',                 // urlPath for API
        'service',                  // displayName for messages
        config
    );

    commands.createCommands(program);
}