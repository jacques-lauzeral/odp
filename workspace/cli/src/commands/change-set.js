// workspace/cli/src/commands/change-set.js
import { Command } from 'commander';
import { BaseCommands } from '../base-commands.js';
import fetch from 'node-fetch';
import Table from 'cli-table3';

const CLASSIFIERS = ['NEW_CONTENT', 'IN_DEPTH_REWORK', 'CLARIFICATION', 'EDITORIAL'];

/**
 * ChangeSetCommands manages change sets — the carrier of "why" for every versioned write (LCM).
 *
 * Extends BaseCommands: show / create / delete and the HTTP-identity plumbing are reused as-is.
 * Two verbs are overridden because their semantics differ from a flat setup entity:
 *   - list   — supports --status / --classifier filters and a status-aware table
 *   - update — partial (OPEN-only edit of title / reasonText); only provided fields are sent
 * Three lifecycle/relationship subcommands are added: members, close, reopen.
 *
 * create is positional: `change-set create <title> <classifier>` with optional --reason.
 */
class ChangeSetCommands extends BaseCommands {
    constructor(config) {
        super(
            'change-set',     // command name
            'change-sets',    // API path
            'change set',     // display name
            config,
            {
                fields: ['code', 'title', 'classifier', 'status', 'reasonText', 'createdAt', 'createdBy', 'closedAt', 'closedBy'],
                headers: ['ID', 'Code', 'Title', 'Classifier', 'Status', 'Created By'],
                colWidths: [10, 12, 30, 18, 10, 18],
                createSignature: '<title> <classifier>',
                updateSignature: '<id>',
                argFields: ['title', 'classifier'],
                hasParent: false,
                options: [
                    { flag: '--reason <text>', field: 'reasonText', description: 'Reason text describing the change set' }
                ]
            }
        );
    }

    /**
     * Assemble the change-set command. Mirrors BaseCommands.createCommands (reusing the inherited
     * show / create / delete) but uses the overridden list / update and adds the lifecycle verbs.
     */
    createCommands(program) {
        const itemCommand = new Command(this.itemName)
            .description(`Manage ${this.displayName}s`);

        this.addListCommand(itemCommand);    // overridden — filters + table
        this.addShowCommand(itemCommand);    // inherited
        this.addCreateCommand(itemCommand);  // overridden — documents + validates classifier
        this.addUpdateCommand(itemCommand);  // overridden — partial
        this.addDeleteCommand(itemCommand);  // inherited
        this._addMembersCommand(itemCommand);
        this._addCloseCommand(itemCommand);
        this._addReopenCommand(itemCommand);

        program.addCommand(itemCommand);
    }

    /**
     * Override list — adds --status / --classifier filters and a status-aware table.
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description('List change sets (optionally filtered by status or classifier)')
            .option('--status <status>', 'Filter by status: OPEN | CLOSED')
            .option('--classifier <classifier>', `Filter by classifier: ${CLASSIFIERS.join(' | ')}`)
            .action(async (options) => {
                try {
                    const params = new URLSearchParams();
                    if (options.status) params.set('status', options.status);
                    else if (options.classifier) params.set('classifier', options.classifier);
                    const query = params.toString();
                    const url = `${this.baseUrl}/${this.urlPath}${query ? `?${query}` : ''}`;

                    const response = await fetch(url, { headers: this.createHeaders() });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const items = await response.json();
                    if (items.length === 0) {
                        console.log('No change sets found.');
                        return;
                    }

                    const table = new Table({
                        head: this.fieldConfig.headers,
                        colWidths: this.fieldConfig.colWidths
                    });
                    items.forEach(cs => {
                        table.push([cs.id, cs.code || '—', cs.title || '—', cs.classifier || '—', cs.status || '—', cs.createdBy || '—']);
                    });
                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing change sets:', error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override create — keeps the positional `<title> <classifier>` shape but documents the
     * allowed classifier values in help and validates them locally (fail-fast with the list).
     */
    addCreateCommand(itemCommand) {
        itemCommand
            .command('create <title> <classifier>')
            .description(`Create a change set (status initialised to OPEN). classifier: ${CLASSIFIERS.join(' | ')}`)
            .option('--reason <text>', 'Reason text describing the change set')
            .action(async (title, classifier, options) => {
                try {
                    if (!CLASSIFIERS.includes(classifier)) {
                        console.error(`Invalid classifier: ${classifier}. Valid values: ${CLASSIFIERS.join(', ')}`);
                        process.exit(1);
                    }

                    const data = { title, classifier };
                    if (options.reason !== undefined) data.reasonText = options.reason;

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}`, {
                        method: 'POST',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const cs = await response.json();
                    console.log(`Created change set: ${cs.code} — ${cs.title} (ID: ${cs.id}), ${cs.classifier}, status: ${cs.status}`);
                } catch (error) {
                    console.error('Error creating change set:', error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override update — partial edit of title / reasonText, accepted only while OPEN.
     * Only flags actually supplied are sent, so an unspecified field is never nulled.
     */
    addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <id>')
            .description('Update title and/or reason text (accepted only while the change set is OPEN)')
            .option('--title <title>', 'New title')
            .option('--reason <text>', 'New reason text')
            .action(async (id, options) => {
                try {
                    const data = {};
                    if (options.title !== undefined) data.title = options.title;
                    if (options.reason !== undefined) data.reasonText = options.reason;

                    if (Object.keys(data).length === 0) {
                        console.error('Nothing to update: provide --title and/or --reason.');
                        process.exit(1);
                    }

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}`, {
                        method: 'PUT',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) { console.error(`Change set with ID ${id} not found.`); process.exit(1); }
                    if (response.status === 409) {
                        const error = await response.json();
                        console.error(`Conflict: ${error.error?.message || 'change set is not OPEN'}`);
                        process.exit(1);
                    }
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const cs = await response.json();
                    console.log(`Updated change set: ${cs.title} (ID: ${cs.id})`);
                } catch (error) {
                    console.error('Error updating change set:', error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * members <id> — list the versions committed under a change set.
     */
    _addMembersCommand(itemCommand) {
        itemCommand
            .command('members <id>')
            .description('List the versions committed under a change set')
            .action(async (id) => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}/members`, {
                        headers: this.createHeaders()
                    });

                    if (response.status === 404) { console.error(`Change set with ID ${id} not found.`); process.exit(1); }
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const members = await response.json();
                    if (members.length === 0) {
                        console.log('No members — nothing has been committed under this change set yet.');
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Type', 'Code', 'Title', 'Version', 'Note'],
                        colWidths: [10, 8, 18, 32, 9, 30]
                    });
                    members.forEach(m => {
                        table.push([m.itemId, m.itemType || '—', m.code || '—', m.title || '—', m.version ?? '—', m.note || '—']);
                    });
                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing change set members:', error.message);
                    process.exit(1);
                }
            });
    }

    _addCloseCommand(itemCommand) {
        itemCommand
            .command('close <id>')
            .description('Close a change set')
            .action((id) => this._lifecycle(id, 'close', 'Closed'));
    }

    _addReopenCommand(itemCommand) {
        itemCommand
            .command('reopen <id>')
            .description('Reopen a change set')
            .action((id) => this._lifecycle(id, 'reopen', 'Reopened'));
    }

    /**
     * Shared close/reopen handler — both POST to /{id}/{action} and report the resulting status.
     */
    async _lifecycle(id, action, pastTense) {
        try {
            const response = await fetch(`${this.baseUrl}/${this.urlPath}/${id}/${action}`, {
                method: 'POST',
                headers: this.createHeaders()
            });

            if (response.status === 404) { console.error(`Change set with ID ${id} not found.`); process.exit(1); }
            if (!response.ok) {
                const error = await response.json();
                throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
            }

            const cs = await response.json();
            console.log(`${pastTense} change set: ${cs.code} — ${cs.title} (ID: ${cs.id}), status: ${cs.status}`);
        } catch (error) {
            console.error(`Error during ${action}:`, error.message);
            process.exit(1);
        }
    }
}

export function changeSetCommands(program, config) {
    const commands = new ChangeSetCommands(config);
    commands.createCommands(program);
}