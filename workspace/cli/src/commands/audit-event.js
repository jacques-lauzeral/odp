// workspace/cli/src/commands/audit-event.js
import { Command } from 'commander';
import { BaseCommands } from '../base-commands.js';
import fetch from 'node-fetch';
import Table from 'cli-table3';

/**
 * AuditEventCommands — read-only query interface over the audit log.
 *
 * One verb: `audit-event list` with three optional, combinable filters:
 *   --change-set <id>   → changeSetId  (versions committed under a change set)
 *   --target <id>       → targetId     (item's unified History timeline)
 *   --user <id>         → userId       (actions by a specific actor)
 *
 * No flags → full log (use with care on large datasets).
 * No write verbs — the log is append-only and never mutated via REST.
 *
 * Does not extend BaseCommands (no CRUD scaffolding needed); uses its HTTP
 * helpers (createHeaders / baseUrl) by instantiating a minimal base instance.
 */
class AuditEventCommands {
    constructor(config) {
        this.baseUrl = config.server.baseUrl;
        // Borrow header construction from BaseCommands via a lightweight instance
        this._base = new BaseCommands('_audit', 'audit-events', 'audit event', config);
    }

    createHeaders() {
        return this._base.createHeaders();
    }

    createCommands(program) {
        const auditCommand = new Command('audit-event')
            .description('Query the audit log (read-only)');

        this._addListCommand(auditCommand);

        program.addCommand(auditCommand);
    }

    _addListCommand(auditCommand) {
        auditCommand
            .command('list')
            .description('Query audit events. All filters are optional and combinable.')
            .option('--change-set <id>', 'Filter by change set ID (versions committed under it)')
            .option('--target <id>', 'Filter by target item ID (item History timeline)')
            .option('--user <id>', 'Filter by user ID (actor)')
            .action(async (options) => {
                try {
                    const params = new URLSearchParams();
                    if (options.changeSet) params.set('changeSetId', options.changeSet);
                    if (options.target)    params.set('targetId',    options.target);
                    if (options.user)      params.set('userId',      options.user);

                    const query = params.toString();
                    const url = `${this.baseUrl}/audit-events${query ? `?${query}` : ''}`;

                    const response = await fetch(url, { headers: this.createHeaders() });
                    if (!response.ok) {
                        const body = await response.json().catch(() => ({}));
                        throw new Error(`HTTP ${response.status}: ${body.error?.message || response.statusText}`);
                    }

                    const events = await response.json();
                    if (events.length === 0) {
                        console.log('No audit events found.');
                        return;
                    }

                    const table = new Table({
                        head: ['Timestamp', 'Action', 'Type', 'Code', 'Title', 'Ver', 'Actor', 'CS Code', 'Note'],
                        colWidths: [22, 12, 9, 14, 28, 5, 18, 12, 24]
                    });

                    events.forEach(e => {
                        table.push([
                            new Date(e.timestamp).toLocaleString(),
                            e.action,
                            e.targetType,
                            e.targetCode  || '—',
                            e.targetTitle || '—',
                            e.targetVersion ?? '—',
                            e.userId,
                            e.changeSetCode  || '—',
                            e.note           || '—'
                        ]);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error('Error querying audit events:', error.message);
                    process.exit(1);
                }
            });
    }
}

export function auditEventCommands(program, config) {
    const commands = new AuditEventCommands(config);
    commands.createCommands(program);
}