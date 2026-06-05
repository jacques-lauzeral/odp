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
 * Results are session-only — not persisted. Re-running replaces the previous report.
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
    }

    async handleSubPath(subPath) {
        // No sub-routing within quality
    }

    async cleanup() {
        this.container = null;
        this._report   = null;
        this._runAt    = null;
        this._running  = false;
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
            this._renderReport(content);
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

    _renderReport(content) {
        const report = this._report;
        const totalIssues = report.domainReports.reduce(
            (sum, dr) => sum + dr.brokenONTraceability.length, 0
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
            const issueCount = domainReport.brokenONTraceability.length;
            const sectionEl = document.createElement('div');
            sectionEl.className = 'quality-domain';
            sectionEl.innerHTML = `
                <div class="quality-domain__header">
                    <span class="quality-domain__name">${domainReport.domain}</span>
                    <span class="quality-domain__badge ${issueCount === 0 ? 'quality-domain__badge--ok' : 'quality-domain__badge--issues'}">
                        ${issueCount === 0 ? '✓ No issues' : `${issueCount} issue${issueCount > 1 ? 's' : ''}`}
                    </span>
                </div>
                ${issueCount > 0 ? this._renderONTraceabilityTable(domainReport.brokenONTraceability) : ''}
            `;
            domainsEl.appendChild(sectionEl);
        }
    }

    _renderONTraceabilityTable(entries) {
        const rows = entries.map(e => `
            <tr>
                <td class="quality-table__code">
                    <a class="odip-link" data-on-id="${e.onId}">${e.onCode}</a>
                </td>
                <td class="quality-table__title">${e.onTitle}</td>
            </tr>
        `).join('');

        return `
            <div class="quality-rule">
                <div class="quality-rule__label">ON traceability — ONs with no strategic document and no parent ON</div>
                <table class="quality-table">
                    <thead>
                        <tr>
                            <th class="quality-table__code">Code</th>
                            <th class="quality-table__title">Title</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    }

    // -------------------------------------------------------------------------
    // Navigation from findings
    // -------------------------------------------------------------------------

    _attachLinkListeners(content) {
        dom.findAll('[data-on-id]', content).forEach(link => {
            link.addEventListener('click', () => {
                const ctx = this.app.getDatasetContext();
                const base = ctx?.type === 'edition' ? `/explore/${ctx.editionId}` : '/elaborate';
                this.app.navigate(`${base}/os/on/${link.dataset.onId}`);
            });
        });
    }
}