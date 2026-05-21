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
                        head: ['Item ID', 'Key', 'Title', 'Domain', 'Position', 'Parent Key', 'Version'],
                        colWidths: [10, 20, 35, 18, 10, 20, 10]
                    });

                    chapters.forEach(c => {
                        table.push([
                            c.itemId,
                            c.key,
                            c.title || '—',
                            c.domain || '(narrative)',
                            c.position ?? '—',
                            c.parentKey || '—',
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

    /**
     * Override displayItemDetails for chapters.
     */
    displayItemDetails(item) {
        console.log(`Item ID:    ${item.itemId}`);
        console.log(`Key:        ${item.key}`);
        console.log(`Title:      ${item.title || '—'}`);
        console.log(`Domain:     ${item.domain || '(narrative)'}`);
        console.log(`Position:   ${item.position ?? '—'}`);
        console.log(`Parent Key: ${item.parentKey || '—'}`);
        console.log(`Version:    ${item.version} (Version ID: ${item.versionId})`);
        console.log(`Created:    ${item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'} by ${item.createdBy || '—'}`);
        console.log(`Narrative:  ${item.narrative ? item.narrative.substring(0, 80) + (item.narrative.length > 80 ? '…' : '') : '—'}`);
        console.log(`osHierarchy: ${item.jsonOsHierarchy ? JSON.stringify(item.jsonOsHierarchy).substring(0, 80) + '…' : '—'}`);
    }

    /**
     * Chapters are bootstrap-only — no create command.
     */
    _addCreateCommand(_itemCommand) {
        // no-op: chapters are managed by server bootstrap
    }

    /**
     * Update narrative and/or osHierarchy (full replacement).
     */
    _addUpdateCommand(itemCommand) {
        itemCommand
            .command('update <itemId> <expectedVersionId>')
            .description('Update chapter narrative and/or osHierarchy (creates new version)')
            .option('--narrative <narrative>', 'Chapter narrative (Quill Delta JSON string)')
            .option('--os-hierarchy <json>', 'OsHierarchy JSON string')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };

                    if (options.narrative !== undefined) {
                        data.narrative = options.narrative;
                    }
                    if (options.osHierarchy !== undefined) {
                        try {
                            data.jsonOsHierarchy = JSON.parse(options.osHierarchy);
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

                    if (response.status === 404) {
                        console.error(`Chapter with ID ${itemId} not found.`);
                        process.exit(1);
                    }

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
                    console.log(`Updated chapter: ${chapter.title || chapter.key} (ID: ${chapter.itemId})`);
                    console.log(`New version: ${chapter.version} (Version ID: ${chapter.versionId})`);
                } catch (error) {
                    console.error('Error updating chapter:', error.message);
                    process.exit(1);
                }
            });
    }

    /**
     * Patch narrative and/or osHierarchy (partial update).
     */
    _addPatchCommand(itemCommand) {
        itemCommand
            .command('patch <itemId> <expectedVersionId>')
            .description('Patch chapter narrative and/or osHierarchy (partial update, creates new version)')
            .option('--narrative <narrative>', 'Chapter narrative (Quill Delta JSON string)')
            .option('--os-hierarchy <json>', 'OsHierarchy JSON string')
            .action(async (itemId, expectedVersionId, options) => {
                try {
                    const data = { expectedVersionId };

                    if (options.narrative !== undefined) {
                        data.narrative = options.narrative;
                    }
                    if (options.osHierarchy !== undefined) {
                        try {
                            data.jsonOsHierarchy = JSON.parse(options.osHierarchy);
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

                    if (response.status === 404) {
                        console.error(`Chapter with ID ${itemId} not found.`);
                        process.exit(1);
                    }

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
                    console.log(`Patched chapter: ${chapter.title || chapter.key} (ID: ${chapter.itemId})`);
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