/**
 * @file quality-elements.js
 * @description Quality check model — rules, domain reports, and finding types.
 *
 * Exchange model for GET /quality/checks.
 *
 * Extensibility pattern:
 *   - Adding a rule = add a new finding entry type + add the array to DomainQualityReport
 *   - QualityService is the sole producer of these shapes
 *   - Quality query methods are internal to QualityService — not exposed on
 *     OperationalRequirementService or OperationalChangeService
 *   - See ADD Chapter 03 §Quality
 */

// ---------------------------------------------------------------------------
// Rule metadata
// ---------------------------------------------------------------------------

/**
 * Static descriptor for a quality rule.
 * Drives column/section rendering on the client — the client never hardcodes rule IDs.
 *
 * @typedef {object} QualityRule
 * @property {string} id          — stable rule identifier
 * @property {string} label       — short display label
 * @property {string} description — longer description shown in UI tooltip or detail panel header
 */
export const QualityRule = {
    id:          '',
    label:       '',
    description: ''
};

// ---------------------------------------------------------------------------
// Finding types
// ---------------------------------------------------------------------------

/**
 * An ON that violates the traceability rule:
 * no strategic document reference AND no parent ON.
 *
 * @typedef {object} BrokenONTraceability
 * @property {string} onId        — ON item ID (opaque)
 * @property {string} onCode      — ON code (e.g. ON-ASM_ATFCM-0012)
 * @property {string} onTitle     — ON title
 * @property {string} onVersionId — ON version ID at report build time — used by the
 *                                  web client to detect whether the ON was updated
 *                                  since the report was run (compare against O* summary cache)
 */
export const BrokenONTraceability = {
    onId:        '',
    onCode:      '',
    onTitle:     '',
    onVersionId: ''
};

/**
 * An OR that violates the traceability rule:
 * neither implements any ON nor refines any parent OR.
 *
 * @typedef {object} UntraceableOR
 * @property {string} orId        — OR item ID (opaque)
 * @property {string} orCode      — OR code (e.g. OR-ASM_ATFCM-0042)
 * @property {string} orTitle     — OR title
 * @property {string} orVersionId — OR version ID at report build time
 */
export const UntraceableOR = {
    orId:        '',
    orCode:      '',
    orTitle:     '',
    orVersionId: ''
};

/**
 * An ON that is not implemented by any OR and not refined by any child ON.
 *
 * @typedef {object} OrphanON
 * @property {string} onId        — ON item ID (opaque)
 * @property {string} onCode      — ON code (e.g. ON-ASM_ATFCM-0012)
 * @property {string} onTitle     — ON title
 * @property {string} onVersionId — ON version ID at report build time
 */
export const OrphanON = {
    onId:        '',
    onCode:      '',
    onTitle:     '',
    onVersionId: ''
};

/**
 * An ON or OR with maturity = NO_SHOW.
 *
 * @typedef {object} NoShowOStar
 * @property {string} oStarId        — O* item ID (opaque)
 * @property {string} oStarCode      — O* code
 * @property {string} oStarTitle     — O* title
 * @property {string} oStarType      — 'ON' | 'OR'
 * @property {string} oStarVersionId — O* version ID at report build time
 */
export const NoShowOStar = {
    oStarId:        '',
    oStarCode:      '',
    oStarTitle:     '',
    oStarType:      '',
    oStarVersionId: ''
};

// ---------------------------------------------------------------------------
// Domain report
// ---------------------------------------------------------------------------

/**
 * Quality findings for a single domain.
 * All rule arrays are always present — empty when no findings for that rule.
 *
 * @typedef {object} DomainQualityReport
 * @property {string}                  domain               — domain key from domains.json
 * @property {BrokenONTraceability[]}  brokenONTraceability — findings for rule 'on-traceability'
 * @property {UntraceableOR[]}         untraceableORs       — findings for rule 'or-traceability'
 * @property {OrphanON[]}              orphanONs            — findings for rule 'orphan-on'
 * @property {NoShowOStar[]}           noShowOStars         — findings for rule 'no-show'
 */
export const DomainQualityReport = {
    domain:               '',
    brokenONTraceability: [],
    untraceableORs:       [],
    orphanONs:            [],
    noShowOStars:         []
};

// ---------------------------------------------------------------------------
// Quality report — top-level response
// ---------------------------------------------------------------------------

/**
 * Top-level response for GET /quality/checks.
 *
 * @typedef {object} QualityReport
 * @property {string}                runAt         — ISO timestamp when checks were executed
 * @property {QualityRule[]}         rules         — ordered list of registered rules
 * @property {DomainQualityReport[]} domainReports — one entry per domain in scope, always present
 */
export const QualityReport = {
    runAt:         '',
    rules:         [],
    domainReports: []
};