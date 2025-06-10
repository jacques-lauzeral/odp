import { BaseCommands } from './base-commands.js';

export function waveCommands(program, config) {
    const commands = new BaseCommands(
        'wave',                  // entityName for command
        'waves',                 // urlPath for API
        'wave',                  // displayName for messages
        config
    );

    commands.createCommands(program);
}