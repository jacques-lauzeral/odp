import { BaseCommands } from '../base-commands.js';

export function stakeholderCategoryCommands(program, config) {
    const commands = new BaseCommands(
        'stakeholder',              // entityName for command
        'stakeholder-categories',   // urlPath for API
        'stakeholder category',     // displayName for messages
        config
    );

    commands.createCommands(program);
}