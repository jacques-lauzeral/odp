import { getDomainKeys } from '../config/loader.js';
import {
    QualityReport,
    DomainQualityReport,
    BrokenONTraceability,
    OrphanON,
    UntraceableOR,
    NoShowOStar
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
    },
    {
        id:          'or-traceability',
        label:       'OR traceability',
        description: 'ORs that neither implement any ON nor refine any parent OR'
    },
    {
        id:          'orphan-on',
        label:       'Orphan ON',
        description: 'ONs implemented by no OR and not refined by any child ON'
    },
    {
        id:          'no-show',
        label:       'NO SHOW O*',
        description: 'ONs and ORs with status NO SHOW'
    }
];

// ---------------------------------------------------------------------------
// QualityService
// ---------------------------------------------------------------------------

export class QualityService {

    /**
     * Run all quality rules for the requested domains and return a QualityReport.
     * NO_SHOW O*s are excluded from all checks except the no-show rule itself.
     *
     * @param {string[]} domains  - Domain keys to scope the report; empty = all domains
     * @param {number|null} editionId - Edition context; null = live dataset
     * @param {object} user — {id, role}
     * @returns {Promise<QualityReport>}
     */
    async runChecks(domains, editionId, user) {
        const domainKeys = domains.length > 0 ? domains : getDomainKeys();

        // Resolve edition context once for all rule checks
        let baselineId = null;
        let resolvedEditionId = null;
        if (editionId !== null) {
            const tx = createTransaction(user.id, user.role);
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
                await this._buildDomainReport(domain, baselineId, resolvedEditionId, user)
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
    async _buildDomainReport(domain, baselineId, editionId, user) {
        const brokenONTraceability = await this._checkONTraceability(
            domain, baselineId, editionId, user
        );
        const untraceableORs = await this._checkORTraceability(
            domain, baselineId, editionId, user
        );
        const orphanONs = await this._checkOrphanON(
            domain, baselineId, editionId, user
        );
        const noShowOStars = await this._checkNoShow(
            domain, baselineId, editionId, user
        );

        return {
            ...DomainQualityReport,
            domain,
            brokenONTraceability,
            untraceableORs,
            orphanONs,
            noShowOStars
        };
    }

    // -------------------------------------------------------------------------
    // Rule implementations
    // -------------------------------------------------------------------------

    /**
     * on-traceability — ONs with no strategic document reference AND no parent ON.
     * Excludes NO_SHOW.
     * @private
     * @returns {Promise<BrokenONTraceability[]>}
     */
    async _checkONTraceability(domain, baselineId, editionId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const filters = { type: 'ON', domain };
            if (editionId !== null) filters.editionId = editionId;

            const allONs = await operationalRequirementStore().findAll(
                tx,
                baselineId,
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
                    onId:        String(on.itemId),
                    onCode:      on.code,
                    onTitle:     on.title,
                    onVersionId: String(on.versionId)
                }));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * or-traceability — ORs that neither implement any ON nor refine any parent OR.
     * Excludes NO_SHOW.
     * @private
     * @returns {Promise<UntraceableOR[]>}
     */
    async _checkORTraceability(domain, baselineId, editionId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const findings = await operationalRequirementStore().findUntraceableORs(
                tx, baselineId, editionId, domain
            );
            await commitTransaction(tx);

            return findings.map(or => ({
                ...UntraceableOR,
                orId:        String(or.itemId),
                orCode:      or.code,
                orTitle:     or.title,
                orVersionId: String(or.versionId)
            }));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * orphan-on — ONs implemented by no OR and not refined by any child ON.
     * Excludes NO_SHOW.
     * @private
     * @returns {Promise<OrphanON[]>}
     */
    async _checkOrphanON(domain, baselineId, editionId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const findings = await operationalRequirementStore().findOrphanONs(
                tx, baselineId, editionId, domain
            );
            await commitTransaction(tx);

            return findings.map(on => ({
                ...OrphanON,
                onId:        String(on.itemId),
                onCode:      on.code,
                onTitle:     on.title,
                onVersionId: String(on.versionId)
            }));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }

    /**
     * no-show — ONs and ORs with maturity = NO_SHOW.
     * This is the only rule that intentionally includes NO_SHOW O*s.
     * @private
     * @returns {Promise<NoShowOStar[]>}
     */
    async _checkNoShow(domain, baselineId, editionId, user) {
        const tx = createTransaction(user.id, user.role);
        try {
            const filters = { maturity: 'NO_SHOW', domain };
            if (editionId !== null) filters.editionId = editionId;

            const findings = await operationalRequirementStore().findAll(
                tx,
                baselineId,
                filters,
                'summary'
            );
            await commitTransaction(tx);

            return findings.map(ostar => ({
                ...NoShowOStar,
                oStarId:        String(ostar.itemId),
                oStarCode:      ostar.code,
                oStarTitle:     ostar.title,
                oStarType:      ostar.type,
                oStarVersionId: String(ostar.versionId)
            }));
        } catch (error) {
            await rollbackTransaction(tx);
            throw error;
        }
    }
}

export default new QualityService();