/**
 * @file quality.js
 * @description Quality sub-activity — dataset health checks.
 *
 * Works in both Elaborate (live dataset) and Explore (edition snapshot) contexts.
 * Context is read from app.getDatasetContext() — no sub-activity needs to know
 * which shell it is mounted in.
 *
 * Layout: full-width scrollable report page.
 *   - Toolbar: "Run checks" button + last run timestamp + optional domain filter
 *   - Report: one section per domain, one table per rule with findings
 *
 * Results are preserved on the activity instance across tab switches — the report
 * survives navigation away and back within the same workspace session. The timestamp
 * tells the user when it was last run; they can re-run explicitly at any time.
 * Results are cleared only when the top-level workspace shell is torn down.
 */
import { apiClient } from '../../../../shared/api-client.js';
import { dom } from '../../../../shared/utils.js';
import { errorHandler } from '../../../../shared/error-handler.js';

export default class QualityActivity {
    constructor(app) {
        this.app = app;
        this.container = null;
        this._report   = null;
        this._runAt    = null;
        this._running  = false;
    }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    async render(container, subPath = []) {
        this.container = container;
        this._renderShell();
        // Restore previous report if the user navigated away and came back.
        // Compare stored versionIds against the O* cache to detect possible fixes.
        if (this._report) {
            const content   = dom.find('#quality-content', this.container);
            const timestamp = dom.find('#quality-timestamp', this.container);
            timestamp.textContent = `Last run: ${this._runAt.toLocaleString()}`;
            this._renderReportWithStaleness(content);
        }
    }

    async handleSubPath(subPath) {
        // No sub-routing within quality
    }

    async cleanup() {
        this.container = null;
        this._running  = false;
        // _report and _runAt are intentionally preserved — the shell caches this
        // instance and may re-mount it (render() called again on tab return).
        // Report is cleared only when the instance itself is discarded.
    }

    // -------------------------------------------------------------------------
    // Shell
    // -------------------------------------------------------------------------

    _renderShell() {
        this.container.innerHTML = `
            <div class="quality-activity">
                <div class="quality-activity__toolbar">
                    <button class="odip-btn odip-btn--primary" id="quality-run-btn">Run checks</button>
                    <span class="quality-activity__timestamp" id="quality-timestamp"></span>
                </div>
                <div class="quality-activity__content" id="quality-content">
                    <p class="quality-activity__empty">Click <strong>Run checks</strong> to assess dataset quality.</p>
                </div>
            </div>
        `;

        dom.find('#quality-run-btn', this.container).addEventListener('click', () => {
            this._runChecks();
        });
    }

    // -------------------------------------------------------------------------
    // Run checks
    // -------------------------------------------------------------------------

    async _runChecks() {
        if (this._running) return;
        this._running = true;

        const btn = dom.find('#quality-run-btn', this.container);
        const content = dom.find('#quality-content', this.container);
        const timestamp = dom.find('#quality-timestamp', this.container);

        btn.disabled = true;
        btn.textContent = 'Running…';
        content.innerHTML = '<p class="quality-activity__empty">Running checks…</p>';
        timestamp.textContent = '';

        try {
            const context = this.app.getDatasetContext();
            const editionId = context?.type === 'edition' ? context.editionId : null;

            this._report = await apiClient.runQualityChecks({ editionId });
            this._runAt  = new Date(this._report.runAt);

            timestamp.textContent = `Last run: ${this._runAt.toLocaleString()}`;
            this._renderReport(content, new Map());
            this._attachLinkListeners(content);
        } catch (error) {
            errorHandler.handle(error, 'quality-run');
            content.innerHTML = `<p class="quality-activity__error">Failed to run checks: ${error.message}</p>`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Run checks';
            this._running = false;
        }
    }

    // -------------------------------------------------------------------------
    // Report rendering
    // -------------------------------------------------------------------------

    _countDomainIssues(domainReport) {
        return (domainReport.brokenONTraceability?.length ?? 0)
            + (domainReport.untraceableORs?.length       ?? 0)
            + (domainReport.orphanONs?.length            ?? 0)
            + (domainReport.noShowOStars?.length         ?? 0);
    }

    _renderReport(content, staleIds = new Map()) {
        const report = this._report;
        const totalIssues = report.domainReports.reduce(
            (sum, dr) => sum + this._countDomainIssues(dr), 0
        );

        const summaryClass = totalIssues === 0 ? 'quality-activity__summary--ok' : 'quality-activity__summary--issues';
        const summaryText  = totalIssues === 0
            ? 'All checks passed — no issues found.'
            : `${totalIssues} issue${totalIssues > 1 ? 's' : ''} found across ${report.domainReports.length} domain${report.domainReports.length > 1 ? 's' : ''}.`;

        content.innerHTML = `
            <div class="quality-activity__summary ${summaryClass}">${summaryText}</div>
            <div class="quality-activity__domains" id="quality-domains"></div>
        `;

        const domainsEl = dom.find('#quality-domains', content);

        for (const domainReport of report.domainReports) {
            const issueCount = this._countDomainIssues(domainReport);
            const sectionEl = document.createElement('div');
            sectionEl.className = 'quality-domain';
            sectionEl.innerHTML = `
                <div class="quality-domain__header">
                    <span class="quality-domain__name">${domainReport.domain}</span>
                    <span class="quality-domain__badge ${issueCount === 0 ? 'quality-domain__badge--ok' : 'quality-domain__badge--issues'}">
                        ${issueCount === 0 ? '✓ No issues' : `${issueCount} issue${issueCount > 1 ? 's' : ''}`}
                    </span>
                </div>
                ${this._renderDomainReport(domainReport, staleIds)}
            `;
            domainsEl.appendChild(sectionEl);
        }
    }

    /**
     * Render all rule tables for a single domain.
     * Each rule is rendered only when it has findings.
     * @private
     */
    _renderDomainReport(domainReport, staleIds = new Map()) {
        const parts = [];

        if (domainReport.brokenONTraceability?.length > 0) {
            parts.push(this._renderFindingTable({
                label:   'ON traceability — ONs with no strategic document and no parent ON',
                entries: domainReport.brokenONTraceability,
                columns: ['Code', 'Title'],
                rowFn:   (e) => {
                    const maybeFixed = staleIds.has(e.onId);
                    return {
                        rowClass: maybeFixed ? 'quality-table__row--maybe-fixed' : '',
                        cells: [
                            `<a class="odip-link" data-on-id="${e.onId}">${e.onCode}</a>`,
                            e.onTitle
                        ],
                        badge: maybeFixed
                            ? '<span class="quality-badge--maybe-fixed" title="This ON was updated since the report was run — re-run to confirm">possibly fixed</span>'
                            : ''
                    };
                }
            }));
        }

        if (domainReport.untraceableORs?.length > 0) {
            parts.push(this._renderFindingTable({
                label:   'OR traceability — ORs that neither implement any ON nor refine any parent OR',
                entries: domainReport.untraceableORs,
                columns: ['Code', 'Title'],
                rowFn:   (e) => {
                    const maybeFixed = staleIds.has(e.orId);
                    return {
                        rowClass: maybeFixed ? 'quality-table__row--maybe-fixed' : '',
                        cells: [
                            `<a class="odip-link" data-or-id="${e.orId}">${e.orCode}</a>`,
                            e.orTitle
                        ],
                        badge: maybeFixed
                            ? '<span class="quality-badge--maybe-fixed" title="This OR was updated since the report was run — re-run to confirm">possibly fixed</span>'
                            : ''
                    };
                }
            }));
        }

        if (domainReport.orphanONs?.length > 0) {
            parts.push(this._renderFindingTable({
                label:   'Orphan ON — ONs implemented by no OR and not refined by any child ON',
                entries: domainReport.orphanONs,
                columns: ['Code', 'Title'],
                rowFn:   (e) => {
                    const maybeFixed = staleIds.has(e.onId);
                    return {
                        rowClass: maybeFixed ? 'quality-table__row--maybe-fixed' : '',
                        cells: [
                            `<a class="odip-link" data-on-id="${e.onId}">${e.onCode}</a>`,
                            e.onTitle
                        ],
                        badge: maybeFixed
                            ? '<span class="quality-badge--maybe-fixed" title="This ON was updated since the report was run — re-run to confirm">possibly fixed</span>'
                            : ''
                    };
                }
            }));
        }

        if (domainReport.noShowOStars?.length > 0) {
            parts.push(this._renderFindingTable({
                label:   'NO SHOW O* — ONs and ORs with status NO SHOW',
                entries: domainReport.noShowOStars,
                columns: ['Code', 'Type', 'Title'],
                rowFn:   (e) => ({
                    rowClass: '',
                    cells: [
                        `<a class="odip-link" data-ostar-id="${e.oStarId}" data-ostar-type="${e.oStarType}">${e.oStarCode}</a>`,
                        e.oStarType,
                        e.oStarTitle
                    ],
                    badge: ''
                })
            }));
        }

        return parts.join('');
    }

    /**
     * Generic finding table renderer.
     * @param {object} opts
     * @param {string}   opts.label   - Rule label shown above the table
     * @param {object[]} opts.entries - Finding array
     * @param {string[]} opts.columns - Column header labels (badge column always appended)
     * @param {Function} opts.rowFn   - (entry) → { rowClass, cells[], badge }
     * @private
     */
    _renderFindingTable({ label, entries, columns, rowFn }) {
        const headerCells = columns.map(c => `<th>${c}</th>`).join('') + '<th></th>';
        const rows = entries.map(e => {
            const { rowClass, cells, badge } = rowFn(e);
            const dataCells = cells.map(c => `<td>${c}</td>`).join('');
            return `<tr class="${rowClass}">${dataCells}<td>${badge}</td></tr>`;
        }).join('');

        return `
            <div class="quality-rule">
                <div class="quality-rule__label">${label}</div>
                <table class="quality-table">
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Staleness detection
    // -------------------------------------------------------------------------

    /**
     * On tab return: fetch the O* cache, build a staleIds map of O*s whose
     * versionId has changed since the report was built, then render with indicators.
     *
     * Covers all finding arrays that carry a versionId:
     *   brokenONTraceability (onId / onVersionId)
     *   untraceableORs       (orId / orVersionId)
     *   orphanONs            (onId / onVersionId)
     *
     * noShowOStars are excluded — NO SHOW status is structural, not version-dependent.
     * @private
     */
    async _renderReportWithStaleness(content) {
        let staleIds = new Map(); // itemId → true when possibly fixed
        try {
            const ostars = await this.app.getOStars();
            const currentVersions = new Map(ostars.map(o => [String(o.itemId), String(o.versionId)]));

            for (const dr of this._report.domainReports) {
                for (const entry of dr.brokenONTraceability ?? []) {
                    if (this._isStale(currentVersions, entry.onId, entry.onVersionId))
                        staleIds.set(entry.onId, true);
                }
                for (const entry of dr.untraceableORs ?? []) {
                    if (this._isStale(currentVersions, entry.orId, entry.orVersionId))
                        staleIds.set(entry.orId, true);
                }
                for (const entry of dr.orphanONs ?? []) {
                    if (this._isStale(currentVersions, entry.onId, entry.onVersionId))
                        staleIds.set(entry.onId, true);
                }
                // noShowOStars intentionally excluded — structural finding, not version-sensitive
            }
        } catch {
            // Cache unavailable — render without staleness indicators
        }
        this._renderReport(content, staleIds);
        this._attachLinkListeners(content);
    }

    /** @private */
    _isStale(currentVersions, itemId, reportedVersionId) {
        const current = currentVersions.get(String(itemId));
        return current !== undefined && current !== String(reportedVersionId);
    }

    // -------------------------------------------------------------------------
    // Navigation from findings
    // -------------------------------------------------------------------------

    _attachLinkListeners(content) {
        const ctx  = this.app.getDatasetContext();
        const base = ctx?.type === 'edition' ? `/explore/${ctx.editionId}` : '/elaborate';

        dom.findAll('[data-on-id]', content).forEach(link => {
            link.addEventListener('click', () => {
                this.app.navigate(`${base}/os/on/${link.dataset.onId}`);
            });
        });

        dom.findAll('[data-or-id]', content).forEach(link => {
            link.addEventListener('click', () => {
                this.app.navigate(`${base}/os/or/${link.dataset.orId}`);
            });
        });

        dom.findAll('[data-ostar-id]', content).forEach(link => {
            link.addEventListener('click', () => {
                const type = link.dataset.ostarType.toLowerCase();
                this.app.navigate(`${base}/os/${type}/${link.dataset.ostarId}`);
            });
        });
    }
}