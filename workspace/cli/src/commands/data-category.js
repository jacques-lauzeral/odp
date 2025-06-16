import { BaseCommands } from '../base-commands.js';

export function dataCategoryCommands(program, config) {
    const commands = new BaseCommands(
        'data-category',            // entityName for command
        'data-categories',          // urlPath for API
        'data category',            // displayName for messages
        config
    );

    commands.createCommands(program);
}