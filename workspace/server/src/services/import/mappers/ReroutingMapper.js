import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for REROUTING Excel documents (Edition 4 structure)
 *
 * INPUT STRUCTURE:
 * ================
 * Two sheets: RR-ON and RR-OR. No OC sheet — OCs are dropped.
 *
 * Row 0 in each sheet is a header/label row and is skipped (identified by
 * __EMPTY === 'ID' or 'OR ID').
 *
 * COLUMN RESOLUTION:
 * ==================
 * Excel column headers are long descriptive strings that may contain minor
 * formatting variations (e.g. different quote characters) across Excel versions.
 * Rather than hardcoding exact header strings, the mapper uses _col(row, keyword)
 * which finds the column whose header contains the given distinctive substring
 * (case-insensitive). Special columns __EMPTY and __EMPTY_1 are accessed directly.
 *
 * ON (Operational Need) — sheet: RR-ON
 * -------------------------------------
 * COL_ON_ID         → internal tracking ID (e.g. ON-RR-01); used to build
 *                     onIdToExternalId map for OR→ON resolution
 * COL_ON_TITLE      → title; also drives externalId generation
 * COL_ON_STATEMENT  → statement (Quill Delta via AsciiDoc converter)
 * COL_ON_RATIONALE  → rationale (Quill Delta)
 * COL_ON_FLOWS      → flows (Quill Delta)
 * COL_ON_NOTES      → privateNotes (Quill Delta); unresolved references
 *                     are appended here
 * COL_ON_REFERENCES → strategicDocuments: fuzzy-matched against REFERENCE_DOC_MAP;
 *                     each line parsed as "<Name>, Ed. <version> / <note>" or
 *                     "<Name> <version> / <note>"; unresolved lines are warned
 *                     and appended to privateNotes
 * __EMPTY_1         → maturity: 'Mature' → 'MATURE', 'Advanced' → 'ADVANCED',
 *                     'Defined' → 'DRAFT'
 * __EMPTY_2         → tentative: parsed as [startYear, endYear]; single year → [year, year]
 * COL_ON_REFINES    → ignored (RRT DrG does not use ON→ON refines)
 * COL_ON_AUTHOR     → ignored
 * COL_ON_ADDL_DOC   → ignored
 *
 * OR (Operational Requirement) — sheet: RR-OR
 * --------------------------------------------
 * COL_OR_ID         → internal tracking ID (e.g. OR-RR-1-01); used to build
 *                     orIdToExternalId map for deferred Refines/Dependencies
 *                     resolution
 * COL_OR_TITLE      → title; drives externalId generation
 * COL_OR_STATEMENT  → statement (Quill Delta)
 * COL_OR_RATIONALE  → rationale (Quill Delta)
 * COL_OR_FLOWS      → flows (Quill Delta)
 * COL_OR_NOTES      → privateNotes (Quill Delta); unresolved domains and
 *                     'Network Operations' are appended here
 * COL_OR_IMPLEMENTS → implementedONs: one or more ON internal IDs (comma/
 *                     semicolon separated); resolved via onIdToExternalId
 * COL_OR_REFINES    → refinesParents: single OR internal ID; deferred
 *                     resolution via orIdToExternalId after all ORs parsed
 * COL_OR_DEPS       → dependencies: one or more OR internal IDs (comma
 *                     separated); deferred resolution via orIdToExternalId
 * COL_OR_IMPACT     → parsed into two sub-sections:
 *                       "Stakeholder categories:" → impactedStakeholders
 *                         (split by ';', mapped via STAKEHOLDER_SYNONYM_MAP)
 *                       "Domains/services:" → impactedDomains
 *                         (split by ';', mapped via DOMAIN_SYNONYM_MAP;
 *                          'Network Operations' and other unresolved tokens
 *                          are warned and appended to privateNotes)
 * COL_OR_MATURITY   → maturity: accessed via row[''] (empty string key); same value mapping as ON
 * COL_OR_AUTHOR     → ignored
 * COL_OR_REFERENCES → ignored
 * COL_OR_ADDL_DOC   → ignored
 * COL_OR_COST       → ignored
 *
 * MATURITY MAPPING:
 * =================
 * 'Mature'   → 'MATURE'
 * 'Advanced' → 'ADVANCED'
 * 'Defined'  → 'DRAFT'
 *
 * STAKEHOLDER SYNONYM MAP:
 * ========================
 * 'Airspace Users' / 'Airspace User' → stakeholder:network/airspace_user
 * 'NMOC'                             → stakeholder:network/nm/nmoc
 * 'NM'                               → stakeholder:network/nm
 * 'ANSP' / 'ANSPs'                   → stakeholder:network/ansp
 * 'ANSP/FMP'                         → stakeholder:network/ansp +
 *                                       stakeholder:network/ansp/fmp
 * 'FMP' / 'FMPs'                     → stakeholder:network/ansp/fmp
 * 'AO'                               → stakeholder:network/airspace_user/ao
 *
 * DOMAIN SYNONYM MAP:
 * ===================
 * 'Flight Planning'    → domain:flight/flight_planning
 * 'Rerouting Support'  → domain:flight/flight_rerouting
 * 'Network Operations' → warn + append to privateNotes (not mapped)
 *
 * REFERENCE DOCUMENT MATCHING:
 * =============================
 * Each reference line is parsed with this pattern:
 *   "<Name>, Ed. <version> / <note>"   (Ed. prefix variant)
 *   "<Name> <version> / <note>"        (space-separated variant)
 *   "<Name> / <note>"                  (no version)
 * The name portion is matched case-insensitively against REFERENCE_DOC_MAP
 * keyword keys. Matched → { externalId, note } added to strategicDocuments.
 * Unmatched → warn + append raw line to privateNotes.
 *
 * REFERENCE_DOC_MAP keywords → externalId:
 * 'ASM/ATFCM'         → refdoc:asm_atfcm_conops
 * 'ASM ATFCM'         → refdoc:asm_atfcm_conops
 * '4DT'               → refdoc:network_4d_trajectory_conops
 * 'Network 4D'        → refdoc:network_4d_trajectory_conops
 * 'iDL'               → refdoc:idl__airspace__conops
 * 'NM B2B'            → refdoc:nm_b2b_conops
 * 'Flow'              → refdoc:flow_conops
 * 'NSP'               → refdoc:nsp
 * 'Network Strategy'  → refdoc:nsp
 * 'ATMMP'             → refdoc:atmmp
 *
 * RELATIONSHIPS:
 * ==============
 * ON → OR : implementedONs (resolved during OR processing)
 * OR → OR : refinesParents (deferred — resolved after all ORs parsed)
 * OR → OR : dependencies   (deferred — resolved after all ORs parsed)
 */

// ---------------------------------------------------------------------------
// Maturity mapping
// ---------------------------------------------------------------------------
const MATURITY_MAP = {
    'Mature': 'MATURE',
    'Advanced': 'ADVANCED',
    'Defined': 'DRAFT'
};

// ---------------------------------------------------------------------------
// Stakeholder synonym map
// Tokens that appear in the Impact cell's "Stakeholder categories:" subsection.
// ANSP/FMP is a compound token that expands to two externalIds.
// ---------------------------------------------------------------------------
const STAKEHOLDER_SYNONYM_MAP = {
    'Airspace Users': ['stakeholder:network/airspace_user'],
    'Airspace User': ['stakeholder:network/airspace_user'],
    'NMOC': ['stakeholder:network/nm/nmoc'],
    'NM': ['stakeholder:network/nm'],
    'ANSP': ['stakeholder:network/ansp'],
    'ANSPs': ['stakeholder:network/ansp'],
    'ANSP/FMP': ['stakeholder:network/ansp', 'stakeholder:network/ansp/fmp'],
    'FMP': ['stakeholder:network/ansp/fmp'],
    'FMPs': ['stakeholder:network/ansp/fmp'],
    'AO': ['stakeholder:network/airspace_user/ao']
};

// ---------------------------------------------------------------------------
// Domain synonym map
// Tokens that appear in the Impact cell's "Domains/services:" subsection.
// Unresolved tokens (including 'Network Operations') are NOT in this map
// and will be warned + appended to privateNotes.
// ---------------------------------------------------------------------------
const DOMAIN_SYNONYM_MAP = {
    'Flight Planning': 'domain:flight/flight_planning',
    'Rerouting Support': 'domain:flight/flight_rerouting'
};

// ---------------------------------------------------------------------------
// Reference document keyword map
// Keys are lowercase substrings to match against the reference name portion.
// ---------------------------------------------------------------------------
const REFERENCE_DOC_MAP = [
    { keywords: ['asm/atfcm', 'asm atfcm'], externalId: 'refdoc:asm_atfcm_conops' },
    { keywords: ['network 4d', '4dt', '4d trajectory'], externalId: 'refdoc:network_4d_trajectory_conops' },
    { keywords: ['idl'], externalId: 'refdoc:idl__airspace__conops' },
    { keywords: ['nm b2b'], externalId: 'refdoc:nm_b2b_conops' },
    { keywords: ['flow conops', 'flow integration'], externalId: 'refdoc:flow_conops' },
    { keywords: ['network strategy plan', 'nsp'], externalId: 'refdoc:nsp' },
    { keywords: ['atmmp', 'atm master plan'], externalId: 'refdoc:atmmp' }
];

class ReroutingMapper extends Mapper {

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Excel data to structured import format.
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData
     */
    map(rawData) {
        console.log('ReroutingMapper: Processing raw data from Excel extraction');

        const onSheet = (rawData.sheets || []).find(s => s.name === 'RR-ON');
        const orSheet = (rawData.sheets || []).find(s => s.name === 'RR-OR');

        if (!onSheet) console.warn('WARNING: RR-ON sheet not found');
        if (!orSheet) console.warn('WARNING: RR-OR sheet not found');

        // Build onIdToExternalId map while extracting ONs
        const onIdToExternalId = new Map();
        const needs = onSheet ? this._processONSheet(onSheet, onIdToExternalId) : [];

        // Extract ORs with deferred Refines/Dependencies resolution
        const { requirements, orIdToExternalId } = orSheet
            ? this._processORSheet(orSheet, onIdToExternalId)
            : { requirements: [], orIdToExternalId: new Map() };

        // Resolve deferred OR→OR references
        this._resolveOrReferences(requirements, orIdToExternalId);

        console.log(`Mapped ${needs.length} ONs and ${requirements.length} ORs from RRT sheets`);

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: [],
            requirements: [...needs, ...requirements],
            changes: []
        };
    }

    // -------------------------------------------------------------------------
    // ON sheet processing
    // -------------------------------------------------------------------------

    /**
     * Process RR-ON sheet and populate onIdToExternalId map.
     * @param {Object} sheet
     * @param {Map} onIdToExternalId - populated in place
     * @returns {Array} ON objects
     * @private
     */
    _processONSheet(sheet, onIdToExternalId) {
        const needs = [];

        for (const row of sheet.rows) {
            // Skip header row
            if (row['__EMPTY'] === 'ID') continue;

            const internalId = (row['__EMPTY'] || '').trim();
            if (!internalId) continue;

            const need = this._extractNeed(row);
            if (need) {
                needs.push(need);
                onIdToExternalId.set(internalId, need.externalId);
            }
        }

        console.log(`RR-ON: extracted ${needs.length} ONs`);
        return needs;
    }

    /**
     * Extract a single ON from a row.
     * @param {Object} row
     * @returns {Object|null}
     * @private
     */
    _extractNeed(row) {
        const title = (this._col(row, "need'. Keep short") || '').trim();
        if (!title) return null;

        const rawNotes = (this._col(row, "NM Private Notes") || '').trim();
        const { strategicDocuments, unresolvedRefs } = this._parseReferences(this._col(row, "References (Mandatory (1))"));

        // Append unresolved references to privateNotes
        let privateNotesText = rawNotes;
        if (unresolvedRefs.length > 0) {
            const unresolvedBlock = 'Unresolved references:\n\n' + unresolvedRefs.join('\n');
            privateNotesText = privateNotesText
                ? privateNotesText + '\n\n---\n\n' + unresolvedBlock
                : unresolvedBlock;
        }

        const need = {
            type: 'ON',
            drg: 'RRT',
            title,
            path: [title],
            statement: this.converter.asciidocToDelta((this._col(row, "Express as a need") || '').trim() || null),
            rationale: this.converter.asciidocToDelta((this._col(row, "Justify the need") || '').trim() || null),
            flows: this.converter.asciidocToDelta((this._col(row, "flow examples that clarify the need") || '').trim() || null),
            privateNotes: this.converter.asciidocToDelta(privateNotesText || null),
            maturity: this._mapMaturity(row['__EMPTY_1']),
            tentative: this._parseTentative(row['__EMPTY_2']),
            strategicDocuments
        };

        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');
        return need;
    }

    // -------------------------------------------------------------------------
    // OR sheet processing
    // -------------------------------------------------------------------------

    /**
     * Process RR-OR sheet.
     * Returns requirements array and the orIdToExternalId map for deferred resolution.
     * @param {Object} sheet
     * @param {Map} onIdToExternalId
     * @returns {{ requirements: Array, orIdToExternalId: Map }}
     * @private
     */
    _processORSheet(sheet, onIdToExternalId) {
        const requirements = [];
        const orIdToExternalId = new Map();

        // First pass: extract all ORs and build orIdToExternalId
        for (const row of sheet.rows) {
            // Skip header row
            if (row['__EMPTY'] === 'OR ID') continue;

            const internalId = (row['__EMPTY'] || '').trim();
            if (!internalId) continue;

            const requirement = this._extractRequirement(row, onIdToExternalId);
            if (requirement) {
                // Temporarily store raw internal IDs for deferred resolution
                requirement._rawRefines = (this._col(row, "OR Reference - Reference to parent OR") || '').trim() || null;
                requirement._rawDeps = (this._col(row, "Dependencies (Optional)") || '').trim() || null;

                requirements.push(requirement);
                orIdToExternalId.set(internalId, requirement.externalId);
            }
        }

        console.log(`RR-OR: extracted ${requirements.length} ORs`);
        return { requirements, orIdToExternalId };
    }

    /**
     * Extract a single OR from a row.
     * @param {Object} row
     * @param {Map} onIdToExternalId
     * @returns {Object|null}
     * @private
     */
    _extractRequirement(row, onIdToExternalId) {
        const title = (this._col(row, "require'. Keep short") || '').trim();
        if (!title) return null;

        // Resolve implementedONs
        const implementedONs = this._resolveIds(
            this._col(row, "Implements (Mandatory"), onIdToExternalId, 'ON', title
        );

        // Parse Impact column
        const { impactedStakeholders, impactedDomains, unresolvedDomains } =
            this._parseImpact(this._col(row, "Stakeholder categories [Reference list]"));

        // Build privateNotes — start with raw notes, append unresolved domains
        const rawNotes = (this._col(row, "NM Private Notes") || '').trim();
        let privateNotesText = rawNotes;
        if (unresolvedDomains.length > 0) {
            const block = 'Unresolved domains/services:\n\n' + unresolvedDomains.join('\n');
            privateNotesText = privateNotesText
                ? privateNotesText + '\n\n---\n\n' + block
                : block;
        }

        const requirement = {
            type: 'OR',
            drg: 'RRT',
            title,
            statement: this.converter.asciidocToDelta((this._col(row, "Express as a requirement") || '').trim() || null),
            rationale: this.converter.asciidocToDelta((this._col(row, "Justify the requirement") || '').trim() || null),
            flows: this.converter.asciidocToDelta((this._col(row, "flow examples that clarify the requirement") || '').trim() || null),
            privateNotes: this.converter.asciidocToDelta(privateNotesText || null),
            implementedONs,
            refinesParents: [],   // populated by _resolveOrReferences
            dependencies: [],     // populated by _resolveOrReferences
            impactedStakeholders,
            impactedDomains,
            maturity: this._mapMaturity(row[''])
        };

        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');
        return requirement;
    }

    /**
     * Second pass: resolve raw internal OR IDs stored in _rawRefines / _rawDeps.
     * Cleans up temporary fields after resolution.
     * @param {Array} requirements
     * @param {Map} orIdToExternalId
     * @private
     */
    _resolveOrReferences(requirements, orIdToExternalId) {
        for (const req of requirements) {
            if (req._rawRefines) {
                req.refinesParents = this._resolveIds(
                    req._rawRefines, orIdToExternalId, 'OR (refines)', req.title
                );
            }
            if (req._rawDeps) {
                req.dependencies = this._resolveIds(
                    req._rawDeps, orIdToExternalId, 'OR (dependency)', req.title
                );
            }
            delete req._rawRefines;
            delete req._rawDeps;
        }
    }

    // -------------------------------------------------------------------------
    // Parsing helpers
    // -------------------------------------------------------------------------

    /**
     * Map maturity string to ODIP maturity value.
     * @param {string} value
     * @returns {string|null}
     * @private
     */
    _mapMaturity(value) {
        if (!value) return null;
        const trimmed = value.trim();
        return MATURITY_MAP[trimmed] ?? null;
    }

    /**
     * Resolve a comma/semicolon-separated list of internal IDs to externalIds.
     * Warns on unresolved IDs.
     * @param {string} rawValue
     * @param {Map} idMap
     * @param {string} context - for warning messages
     * @param {string} entityTitle - for warning messages
     * @returns {Array<string>} resolved externalIds
     * @private
     */
    _resolveIds(rawValue, idMap, context, entityTitle) {
        if (!rawValue || rawValue.trim() === '') return [];

        const tokens = rawValue.split(/[,;]/).map(t => t.trim()).filter(Boolean);
        const resolved = [];

        for (const token of tokens) {
            const externalId = idMap.get(token);
            if (externalId) {
                resolved.push(externalId);
            } else {
                console.warn(`WARNING: Unresolved ${context} reference "${token}" in "${entityTitle}"`);
            }
        }

        return resolved;
    }

    /**
     * Parse the Impact column into stakeholders, domains, and unresolved domains.
     * Format:
     *   "Stakeholder categories:\n<token>; <token>\n\nDomains/services:\n<token>; <token>"
     *
     * @param {string} impactText
     * @returns {{ impactedStakeholders: Array, impactedDomains: Array, unresolvedDomains: Array }}
     * @private
     */
    _parseImpact(impactText) {
        const impactedStakeholders = [];
        const impactedDomains = [];
        const unresolvedDomains = [];

        if (!impactText || impactText.trim() === '') {
            return { impactedStakeholders, impactedDomains, unresolvedDomains };
        }

        // Split into subsections
        const stakeholderMatch = impactText.match(/Stakeholder categories:\s*([\s\S]*?)(?=Domains\/services:|$)/i);
        const domainsMatch = impactText.match(/Domains\/services:\s*([\s\S]*?)$/i);

        // Parse stakeholders
        if (stakeholderMatch) {
            const seenIds = new Set();
            const tokens = stakeholderMatch[1].split(';').map(t => t.trim()).filter(Boolean);
            for (const token of tokens) {
                const externalIds = STAKEHOLDER_SYNONYM_MAP[token];
                if (externalIds) {
                    for (const id of externalIds) {
                        if (!seenIds.has(id)) {
                            impactedStakeholders.push({ externalId: id });
                            seenIds.add(id);
                        }
                    }
                } else {
                    console.warn(`WARNING: Unknown stakeholder token: "${token}"`);
                }
            }
        }

        // Parse domains
        if (domainsMatch) {
            const seenIds = new Set();
            const tokens = domainsMatch[1].split(';').map(t => t.trim()).filter(Boolean);
            for (const token of tokens) {
                const externalId = DOMAIN_SYNONYM_MAP[token];
                if (externalId) {
                    if (!seenIds.has(externalId)) {
                        impactedDomains.push({ externalId });
                        seenIds.add(externalId);
                    }
                } else {
                    console.warn(`WARNING: Unresolved domain token: "${token}" — appending to privateNotes`);
                    unresolvedDomains.push(token);
                }
            }
        }

        return { impactedStakeholders, impactedDomains, unresolvedDomains };
    }

    /**
     * Parse the References column into strategicDocuments and unresolved lines.
     * Each line is matched against REFERENCE_DOC_MAP by keyword.
     * Parsing pattern: "<Name>, Ed. <version> / <note>"
     *                  "<Name> <version> / <note>"
     *                  "<Name> / <note>"
     *
     * @param {string} referencesText
     * @returns {{ strategicDocuments: Array, unresolvedRefs: Array<string> }}
     * @private
     */
    _parseReferences(referencesText) {
        const strategicDocuments = [];
        const unresolvedRefs = [];

        if (!referencesText || referencesText.trim() === '') {
            return { strategicDocuments, unresolvedRefs };
        }

        const lines = referencesText.split('\n').map(l => l.trim()).filter(Boolean);

        for (const line of lines) {
            // Split name from note at ' / '
            const slashIdx = line.indexOf(' / ');
            const namePart = slashIdx !== -1 ? line.substring(0, slashIdx).trim() : line;
            const note = slashIdx !== -1 ? line.substring(slashIdx + 3).trim() : null;

            // Normalize name: remove "Ed." and version numbers for matching
            const normalizedName = namePart
                .replace(/,?\s*Ed\.\s*[\d.]+/i, '')
                .replace(/\s+v?[\d.]+$/i, '')
                .trim()
                .toLowerCase();

            const match = REFERENCE_DOC_MAP.find(entry =>
                entry.keywords.some(kw => normalizedName.includes(kw.toLowerCase()))
            );

            if (match) {
                const entry = { externalId: match.externalId };
                if (note) entry.note = note;
                // Avoid duplicate externalId+note combinations
                const duplicate = strategicDocuments.some(
                    d => d.externalId === entry.externalId && d.note === entry.note
                );
                if (!duplicate) {
                    strategicDocuments.push(entry);
                }
            } else {
                console.warn(`WARNING: Unresolved reference: "${line}"`);
                unresolvedRefs.push(line);
            }
        }

        return { strategicDocuments, unresolvedRefs };
    }

    /**
     * Parse tentative year range from ON sheet.
     * Accepts: "2028" → [2028, 2028], "2028-2029" → [2028, 2029]
     * @param {string} value
     * @returns {Array|null}
     * @private
     */
    _parseTentative(value) {
        if (!value || value.trim() === '') return null;
        const text = value.trim();
        const rangeMatch = text.match(/^(20\d{2})-(20\d{2})$/);
        if (rangeMatch) {
            return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
        }
        const singleMatch = text.match(/^(20\d{2})$/);
        if (singleMatch) {
            const year = parseInt(singleMatch[1], 10);
            return [year, year];
        }
        console.warn(`WARNING: Cannot parse tentative value: "${text}"`);
        return null;
    }

    /**
     * Find a row value by a distinctive keyword substring of the column header.
     * Case-insensitive match. Returns empty string if no matching column found.
     * Use this instead of hardcoded exact column header strings, which are fragile
     * due to minor formatting variations (quote characters, whitespace) across
     * Excel versions.
     * @param {Object} row - Row object with column headers as keys
     * @param {string} keyword - Distinctive substring of the column header
     * @returns {string} Cell value or empty string
     * @private
     */
    _col(row, keyword) {
        const lowerKeyword = keyword.toLowerCase();
        const key = Object.keys(row).find(k => k.toLowerCase().includes(lowerKeyword));
        return key !== undefined ? (row[key] || '') : '';
    }

}

export default ReroutingMapper;