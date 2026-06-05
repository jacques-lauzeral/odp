import { getDomainKeys } from '../config/loader.js';
import {
    QualityReport,
    DomainQualityReport,
    BrokenONTraceability
} from '../../../shared/src/index.js';
import {
    operationalRequirementStore,
    odpEditionStore,
    createTransaction,
    commitTransaction,
    rollbackTransaction
} from '../store/index.js';

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------
// Each rule descriptor drives section rendering on the client.
// The client never hardcodes rule IDs — it reads the rules array from QualityReport.
//
// Extensibility: adding a rule = add descriptor here + implement _check<Rule>()
// + add the result array to _buildDomainReport().
//
// Quality query methods are intentionally NOT exposed on OperationalRequirementService
// or OperationalChangeService — they are internal to QualityService only.
// See ADD Chapter 03 §Quality.
// ---------------------------------------------------------------------------

const RULES = [
    {
        id:          'on-traceability',
        label:       'ON traceability',
        description: 'ONs with no strategic document reference and no parent ON'
    }
    // Future rules registered here
];

// ---------------------------------------------------------------------------
// QualityService
// ---------------------------------------------------------------------------

export class QualityService {

    /**
     * Run all quality rules for the requested domains and return a QualityReport.
     * NO_SHOW O*s are excluded from all checks.
     *
     * @param {string[]} domains  - Domain keys to scope the report; empty = all domains
     * @param {number|null} editionId - Edition context; null = live dataset
     * @param {string} userId
     * @returns {Promise<QualityReport>}
     */
    async runChecks(domains, editionId, userId) {
        const domainKeys = domains.length > 0 ? domains : getDomainKeys();

        // Resolve edition context once for all rule checks
        let baselineId = null;
        let resolvedEditionId = null;
        if (editionId !== null) {
            const tx = createTransaction(userId);
            try {
                const context = await odpEditionStore().resolveContext(editionId, tx);
                baselineId = context.baselineId;
                resolvedEditionId = context.editionId;
                await commitTransaction(tx);
            } catch (error) {
                await rollbackTransaction(tx);
                throw error;
            }
        }

        const domainReports = [];
        for (const domain of domainKeys) {
            domainReports.push(
                await this._buildDomainReport(domain, baselineId, resolvedEditionId, userId)
            );
        }

        return {
            ...QualityReport,
            runAt: new Date().toISOString(),
            rules: RULES.map(({ id, label, description }) => ({ id, label, description })),
            domainReports
        };
    }

    // -------------------------------------------------------------------------
    // Domain report assembly
    // -------------------------------------------------------------------------

    /**
     * Build the quality report for a single domain — all rules, always all arrays present.
     * @private
     */
    async _buildDomainReport(domain, baselineId, editionId, userId) {
        const brokenONTraceability = await this._checkONTraceability(
            domain, baselineId, editionId, userId
        );

        return {
            ...DomainQualityReport,
            domain,
            brokenONTraceability
            // Future rule arrays added here as rules are implemented
        };
    }

    // -------------------------------------------------------------------------
    // Rule implementations
    // -------------------------------------------------------------------------

    /**
     * on-traceability — ONs with no strategic document reference AND no parent ON.
     * Excludes NO_SHOW.
     * Supports live dataset (baselineId = null) and edition context.
     * @private
     * @returns {Promise<BrokenONTraceability[]>}
     */
    async _checkONTraceability(domain, baselineId, editionId, userId) {
        const tx = createTransaction(userId);
        try {
            const filters = { type: 'ON', domain };
            if (editionId !== null) filters.editionId = editionId;

            const allONs = await operationalRequirementStore().findAll(
                tx,
                baselineId,     // null = latest versions; set = baseline/edition context
                filters,
                'summary'
            );
            await commitTransaction(tx);

            return allONs
                .filter(on => on.maturity !== 'NO_SHOW')
                .filter(on =>
                    (!on.strategicDocuments || on.strategicDocuments.length === 0) &&
                    (!on.refinesParents     || on.refinesParents.length === 0)
                )
                .map(on => ({
                    ...BrokenONTraceability,
                    onId:    String(on.itemId),
                    onCode:  on.code,
                    onTitle: on.title
                }));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new QualityService();