import { Command } from 'commander';
import fetch from 'node-fetch';
import Table from 'cli-table3';
import { getDomainKeys, isDomainValid } from '../../../shared/src/index.js';

export class QualityCommands {
    constructor(config) {
        this.baseUrl = config.server.baseUrl;
    }

    getUserId() {
        return (process.mainModule?.exports?.program || global.program || new Command()).opts().user;
    }

    createHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-user-id': this.getUserId()
        };
    }

    createCommands(program) {
        const qualityCommand = new Command('quality')
            .description('Dataset quality checks — structural integrity and traceability rules');

        // ── run ──────────────────────────────────────────────────────────────
        qualityCommand
            .command('run')
            .description('Run all quality checks and display the report')
            .option('--domain <keys>', 'Comma-separated domain key(s) to scope the report — omit for all domains')
            .option('--edition <id>', 'Edition ID — checks against edition snapshot (Explore context); omit for live dataset (Elaborate context)')
            .option('--json', 'Output raw JSON instead of formatted tables')
            .action(async (options) => {
                try {
                    // Validate domain keys if provided
                    const domains = options.domain
                        ? options.domain.split(',').map(d => d.trim())
                        : [];

                    const invalid = domains.filter(d => !isDomainValid(d));
                    if (invalid.length > 0) {
                        console.error(`Invalid domain key(s): ${invalid.join(', ')}`);
                        console.error(`Valid keys: ${getDomainKeys().join(', ')}`);
                        process.exit(1);
                    }

                    const params = [];
                    if (domains.length > 0) params.push(`domain=${domains.join(',')}`);
                    if (options.edition)    params.push(`edition=${options.edition}`);
                    const url = params.length > 0
                        ? `${this.baseUrl}/quality/checks?${params.join('&')}`
                        : `${this.baseUrl}/quality/checks`;

                    const response = await fetch(url, { headers: this.createHeaders() });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(`HTTP ${response.status}: ${err.error?.message || response.statusText}`);
                    }

                    const report = await response.json();

                    if (options.json) {
                        console.log(JSON.stringify(report, null, 2));
                        return;
                    }

                    this._displayReport(report);
                } catch (error) {
                    console.error('Error running quality checks:', error.message);
                    process.exit(1);
                }
            });

        program.addCommand(qualityCommand);
    }

    // ── Display helpers ───────────────────────────────────────────────────────

    _displayReport(report) {
        console.log(`\n=== QUALITY REPORT — ${new Date(report.runAt).toLocaleString()} ===`);
        console.log(`Rules: ${report.rules.map(r => r.label).join(', ')}\n`);

        let totalIssues = 0;

        for (const domainReport of report.domainReports) {
            const issues = this._countIssues(domainReport);
            totalIssues += issues;

            const status = issues === 0 ? '✓' : `✗ ${issues} issue(s)`;
            console.log(`Domain: ${domainReport.domain}  ${status}`);

            if (domainReport.brokenONTraceability.length > 0) {
                console.log(`  ON traceability (${domainReport.brokenONTraceability.length}):`);
                const table = new Table({
                    head: ['ON ID', 'Code', 'Title'],
                    colWidths: [10, 25, 55]
                });
                domainReport.brokenONTraceability.forEach(entry => {
                    table.push([entry.onId, entry.onCode, entry.onTitle]);
                });
                console.log(table.toString());
            }

            // Future rule arrays displayed here as rules are implemented
        }

        console.log(`\nTotal issues: ${totalIssues}`);
        if (totalIssues === 0) {
            console.log('All checks passed.');
        }
    }

    _countIssues(domainReport) {
        return domainReport.brokenONTraceability.length;
        // Future rule arrays added here
    }
}

export function qualityCommands(program, config) {
    const commands = new QualityCommands(config);
    commands.createCommands(program);
}