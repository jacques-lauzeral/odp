/**
 * @file quality-elements.js
 * @description Quality check model — rules, domain reports, and finding types.
 *
 * Exchange model for GET /quality/checks.
 *
 * Extensibility pattern:
 *   - Adding a rule = add a new BrokenXxx entry type + add the array to DomainQualityReport
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

// Future finding types added here as new rules are implemented:
// BrokenORTraceability, BrokenONImplementation, BrokenMandatoryFields, TraceCycle, ...

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
 */
export const DomainQualityReport = {
    domain:               '',
    brokenONTraceability: []
    // Future rule arrays added here as rules are implemented
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