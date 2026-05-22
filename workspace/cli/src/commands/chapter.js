// workspace/cli/src/commands/chapter.js
import { VersionedCommands } from '../base-commands.js';
import fetch from 'node-fetch';
import Table from 'cli-table3';

class ChapterCommands extends VersionedCommands {
    constructor(config) {
        super(
            'chapter',
            'chapters',
            'chapter',
            config
        );
    }

    /**
     * Override createCommands to add the domain subcommand.
     */
    createCommands(program) {
        super.createCommands(program);
        this._addDomainCommand(program);
    }

    /**
     * domain list — fetches GET /chapters and extracts unique non-null domains.
     */
    _addDomainCommand(program) {
        program.command('domain list')
            .description('List all valid domain keys and their chapter titles')
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/chapters`, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const chapters = await response.json();
                    const domains = chapters
                        .filter(c => c.domain)
                        .reduce((acc, c) => {
                            if (!acc.find(d => d.key === c.domain)) {
                                acc.push({ key: c.domain, title: c.title || '—' });
                            }
                            return acc;
                        }, []);

                    if (domains.length === 0) {
                        console.log('No domains found.');
                        return;
                    }

                    const table = new Table({
                        head: ['Domain Key', 'Chapter Title'],
                        colWidths: [25, 50]
                    });

                    domains.forEach(d => table.push([d.key, d.title]));
                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing domains:', error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Override addListCommand — chapters have no edition context or content filters.
     */
    addListCommand(itemCommand) {
        itemCommand
            .command('list')
            .description('List all chapters (latest versions, config-owned fields merged)')
            .action(async () => {
                try {
                    const response = await fetch(`${this.baseUrl}/${this.urlPath}`, {
                        headers: this.createHeaders()
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const chapters = await response.json();

                    if (chapters.length === 0) {
                        console.log('No chapters found.');
                        return;
                    }

                    const table = new Table({
                        head: ['Item ID', 'Code', 'Title', 'Domain', 'Position', 'Version'],
                        colWidths: [10, 25, 35, 18, 10, 10]
                    });

                    chapters.forEach(c => {
                        table.push([
                            c.itemId,
                            c.code,
                            c.title || '—',
                            c.domain || '(narrative)',
                            c.position ?? '—',
                            c.version
                        ]);
                    });

                    console.log(table.toString());
                } catch (error) {
                    console.error('Error listing chapters:', error.message);
                    process.exit(1);
                }
            });
    }

    displayItemDetails(item) {
        console.log(`Item ID:    ${item.itemId}`);
        console.log(`Code:       ${item.code}`);
        console.log(`Title:      ${item.title || '—'}`);
        console.log(`Domain:     ${item.domain || '(narrative)'}`);
        console.log(`Position:   ${item.position ?? '—'}`);
        console.log(`Version:    ${item.version} (Version ID: ${item.versionId})`);
        console.log(`Created:    ${item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'} by ${item.createdBy || '—'}`);
        console.log(`Narrative:  ${item.narrative ? item.narrative.substring(0, 80) + (item.narrative.length > 80 ? '…' : '') : '—'}`);
        console.log(`osHierarchy: ${item.osHierarchy ? JSON.stringify(item.osHierarchy).substring(0, 80) + '…' : '—'}`);
    }

    _addCreateCommand(_itemCommand) {
        // no-op: chapters are managed by server bootstrap
    }

    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId>')
            .description('Update chapter narrative and/or osHierarchy (creates new version)')
            .option('--narrative <narrative>', 'Chapter narrative (Quill Delta JSON string)')
            .option('--os-hierarchy <json>', 'OsHierarchy JSON string')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };
                    if (options.narrative !== undefined) data.narrative = options.narrative;
                    if (options.osHierarchy !== undefined) {
                        try {
                            data.osHierarchy = JSON.parse(options.osHierarchy);
                        } catch {
                            console.error('Invalid JSON for --os-hierarchy');
                            process.exit(1);
                        }
                    }

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}`, {
                        method: 'PUT',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) { console.error(`Chapter with ID ${itemId} not found.`); process.exit(1); }
                    if (response.status === 409) {
                        const error = await response.json();
                        console.error(`Version conflict: ${error.error?.message || 'Version has changed'}`);
                        console.error(`Use "show ${itemId}" to get current version ID and retry`);
                        process.exit(1);
                    }
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const chapter = await response.json();
                    console.log(`Updated chapter: ${chapter.title || chapter.code} (ID: ${chapter.itemId})`);
                    console.log(`New version: ${chapter.version} (Version ID: ${chapter.versionId})`);
                } catch (error) {
                    console.error('Error updating chapter:', error.message);
                    process.exit(1);
                }
            });
    }

    _addPatchCommand(itemCommand) {
        itemCommand
            .command('patch <itemId> <expectedVersionId>')
            .description('Patch chapter narrative and/or osHierarchy (partial update, creates new version)')
            .option('--narrative <narrative>', 'Chapter narrative (Quill Delta JSON string)')
            .option('--os-hierarchy <json>', 'OsHierarchy JSON string')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };
                    if (options.narrative !== undefined) data.narrative = options.narrative;
                    if (options.osHierarchy !== undefined) {
                        try {
                            data.osHierarchy = JSON.parse(options.osHierarchy);
                        } catch {
                            console.error('Invalid JSON for --os-hierarchy');
                            process.exit(1);
                        }
                    }

                    const response = await fetch(`${this.baseUrl}/${this.urlPath}/${itemId}`, {
                        method: 'PATCH',
                        headers: this.createHeaders(),
                        body: JSON.stringify(data)
                    });

                    if (response.status === 404) { console.error(`Chapter with ID ${itemId} not found.`); process.exit(1); }
                    if (response.status === 409) {
                        const error = await response.json();
                        console.error(`Version conflict: ${error.error?.message || 'Version has changed'}`);
                        console.error(`Use "show ${itemId}" to get current version ID and retry`);
                        process.exit(1);
                    }
                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(`HTTP ${response.status}: ${error.error?.message || response.statusText}`);
                    }

                    const chapter = await response.json();
                    console.log(`Patched chapter: ${chapter.title || chapter.code} (ID: ${chapter.itemId})`);
                    console.log(`New version: ${chapter.version} (Version ID: ${chapter.versionId})`);
                } catch (error) {
                    console.error('Error patching chapter:', error.message);
                    process.exit(1);
                }
            });
    }
}

export function chapterCommands(program, config) {
    const commands = new ChapterCommands(config);
    commands.createCommands(program);
}