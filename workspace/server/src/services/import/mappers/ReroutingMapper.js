import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for REROUTING Excel documents (Edition 4 structure)
 *
 * INPUT STRUCTURE:
 * ================
 * Two sheets: RR-ON (Operational Needs) and RR-OR (Operational Requirements).
 * No OC sheet — OCs are not present in this DrG's material.
 * Row 0 in each sheet is a header/label row and is skipped (identified by
 * __EMPTY === 'ID' or 'OR ID').
 *
 * COLUMN RESOLUTION:
 * ==================
 * Excel column headers are long descriptive strings that may contain minor
 * formatting variations (e.g. different quote characters) across Excel versions.
 * Rather than hardcoding exact header strings, the mapper uses _col(row, keyword)
 * which finds the column whose header contains the given distinctive substring
 * (case-insensitive). Special columns __EMPTY, __EMPTY_1, __EMPTY_2, and row['']
 * are accessed directly by key.
 *
 * ON (Operational Need) — sheet: RR-ON
 * -------------------------------------
 * __EMPTY                            → internal tracking ID (e.g. ON-RR-01);
 *                                      used to build onIdToExternalId map
 * keyword: "need'. Keep short"       → title; drives externalId and path
 * keyword: "Express as a need"       → statement (Quill Delta)
 * keyword: "Justify the need"        → rationale (Quill Delta)
 * keyword: "clarify the need"        → flows (Quill Delta)
 * keyword: "NM Private Notes"        → privateNotes (Quill Delta);
 *                                      unresolved references appended here
 * keyword: "References (Mandatory"   → strategicDocuments (see REFERENCE
 *                                      DOCUMENT MATCHING below)
 * __EMPTY_1                          → maturity (see MATURITY MAPPING)
 * __EMPTY_2                          → tentative: "YYYY" → [YYYY, YYYY];
 *                                      "YYYY-YYYY" → [start, end]
 * keyword: "ON Reference - Reference to parent ON" → ignored (RRT does not
 *                                      use ON→ON refines)
 * Author, Additional Documentation   → ignored
 *
 * OR (Operational Requirement) — sheet: RR-OR
 * --------------------------------------------
 * __EMPTY                            → internal tracking ID (e.g. OR-RR-1-01);
 *                                      used to build orIdToExternalId map
 * keyword: "require'. Keep short"    → title; drives externalId generation
 * keyword: "Express as a requirement"→ statement (Quill Delta)
 * keyword: "Justify the requirement" → rationale (Quill Delta)
 * keyword: "clarify the requirement" → flows (Quill Delta)
 * keyword: "NM Private Notes"        → privateNotes (Quill Delta);
 *                                      unresolved domains appended here
 * keyword: "Implements (Mandatory"   → implementedONs (ON internal IDs,
 *                                      comma/semicolon separated); first ON
 *                                      also drives OR path (inherits ON title)
 * keyword: "OR Reference - Reference to parent OR" → refinesParents (single
 *                                      OR internal ID); deferred resolution
 * keyword: "Dependencies (Optional)" → dependencies (OR internal IDs, comma
 *                                      separated); deferred resolution
 * keyword: "Stakeholder categories"  → impactedStakeholders (split by ';',
 *                                      mapped via STAKEHOLDER_SYNONYM_MAP)
 *                                      and impactedDomains (split by ';',
 *                                      mapped via DOMAIN_SYNONYM_MAP)
 * row[''] (empty key)                → maturity (see MATURITY MAPPING)
 * Author, References, Additional
 * Documentation, Cost Assessment     → ignored
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
 * The References column is parsed line by line. Each line follows:
 *   "<n>, Ed. <version> / <note>"  or
 *   "<n> <version> / <note>"       or
 *   "<n> / <note>"
 * Before line-by-line processing, _expandNspReferences detects the pattern:
 *   "Network Strategy Plan ... SO# / SO# / ..."
 * and expands it into individual "NSP SO #" lines, each resolving to
 * refdoc:nsp_so_# via ExternalIdBuilder normalization.
 * All other names are matched against REFERENCE_DOC_MAP keywords.
 * If the same document is referenced multiple times (different notes), a
 * single strategicDocuments entry is created with all notes joined by ';\n'.
 * Unresolved lines are warned and appended to privateNotes.
 *
 * REFERENCE_DOC_MAP keywords → refdoc externalId:
 * 'ASM/ATFCM' / 'ASM ATFCM'  → refdoc:asm_atfcm_integration_conops
 * 'Network 4D' / '4DT'        → refdoc:network_4d_trajectory_conops
 * 'iDL'                       → refdoc:idl__airspace__conops
 * 'NM B2B'                    → refdoc:nm_b2b_conops
 * 'Flow'                      → refdoc:flow_conops
 * 'NSP' / 'Network Strategy'  → refdoc:nsp (root; individual SOs via expansion)
 * 'ATMMP SDO <n>'             → refdoc:atmmp_sdo_<n> (via _expandAtmmpReferences)
 * 'EU IR 2021/116'            → refdoc:commission_implementing_regulation_(eu)_2021_116
 *                               trailing token (e.g. 'AF 4') extracted as note
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
    { keywords: ['asm/atfcm', 'asm atfcm'], externalId: 'refdoc:asm_atfcm_integration_conops' },
    { keywords: ['network 4d', '4dt', '4d trajectory'], externalId: 'refdoc:network_4d_trajectory_conops' },
    { keywords: ['idl'], externalId: 'refdoc:idl__airspace__conops' },
    { keywords: ['nm b2b'], externalId: 'refdoc:nm_b2b_conops' },
    { keywords: ['flow conops', 'flow integration'], externalId: 'refdoc:flow_conops' },
    { keywords: ['network strategy plan', 'nsp'], externalId: 'refdoc:nsp' },
    {
        keywords: ['eu ir 2021/116'],
        externalId: ExternalIdBuilder.buildExternalId({ name: 'Commission Implementing Regulation (EU) 2021/116' }, 'refdoc'),
        trailingNotePattern: /^EU IR 2021\/116\s+(.+)$/i
    }
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

        // Build onNeedsMap: externalId -> ON object (for OR path resolution)
        const onNeedsMap = new Map(needs.map(n => [n.externalId, n]));

        // Extract ORs with deferred Refines/Dependencies resolution
        const { requirements, orIdToExternalId } = orSheet
            ? this._processORSheet(orSheet, onIdToExternalId, onNeedsMap)
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
    _processORSheet(sheet, onIdToExternalId, onNeedsMap) {
        const requirements = [];
        const orIdToExternalId = new Map();

        // First pass: extract all ORs and build orIdToExternalId
        for (const row of sheet.rows) {
            // Skip header row
            if (row['__EMPTY'] === 'OR ID') continue;

            const internalId = (row['__EMPTY'] || '').trim();
            if (!internalId) continue;

            const requirement = this._extractRequirement(row, onIdToExternalId, onNeedsMap);
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
    _extractRequirement(row, onIdToExternalId, onNeedsMap) {
        const title = (this._col(row, "require'. Keep short") || '').trim();
        if (!title) return null;

        // Resolve implementedONs
        const implementedONs = this._resolveIds(
            this._col(row, "Implements (Mandatory"), onIdToExternalId, 'ON', title
        );

        // Derive path from first implemented ON
        let path;
        const implementsRaw = (this._col(row, "Implements (Mandatory") || '').trim();
        const firstOnId = implementsRaw.split(/[,;]/)[0].trim();
        const firstOnExternalId = firstOnId ? onIdToExternalId.get(firstOnId) : null;
        const firstOn = firstOnExternalId ? onNeedsMap.get(firstOnExternalId) : null;
        if (firstOn && firstOn.path) {
            path = firstOn.path;
        }

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
            path,
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
        const unresolvedRefs = [];

        if (!referencesText || referencesText.trim() === '') {
            return { strategicDocuments: [], unresolvedRefs };
        }

        const lines = this._expandAtmmpReferences(this._expandNspReferences(
            referencesText.split('\n').map(l => l.trim()).filter(Boolean)
        ));

        // Accumulate notes per externalId — same document referenced multiple times
        // with different notes gets a single entry with notes joined by ';\n'
        const notesMap = new Map(); // externalId -> string[]

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

            // Special case: expanded NSP SO lines e.g. "NSP SO 1"
            const nspSoMatch = namePart.match(/^NSP SO (\d+)$/i);
            // Special case: expanded ATMMP SDO lines e.g. "ATMMP SDO 2"
            const atmmpSdoMatch = namePart.match(/^ATMMP SDO (\d+)$/i);
            let matchedEntry = null;
            const externalId = nspSoMatch
                ? `refdoc:nsp_so_${nspSoMatch[1]}`
                : atmmpSdoMatch
                    ? ExternalIdBuilder.buildExternalId({ name: `ATMMP SDO ${atmmpSdoMatch[1]}` }, 'refdoc')
                    : (() => {
                        matchedEntry = REFERENCE_DOC_MAP.find(entry =>
                            entry.keywords.some(kw => normalizedName.includes(kw.toLowerCase()))
                        );
                        return matchedEntry ? matchedEntry.externalId : null;
                    })();

            // Extract trailing note from namePart for entries that embed the note
            // without a ' / ' separator (e.g. "EU IR 2021/116 AF 4")
            let effectiveNote = note;
            if (matchedEntry && matchedEntry.trailingNotePattern) {
                const trailingMatch = namePart.match(matchedEntry.trailingNotePattern);
                if (trailingMatch) {
                    const trailingNote = trailingMatch[1].trim();
                    effectiveNote = effectiveNote
                        ? `${effectiveNote};\n${trailingNote}`
                        : trailingNote;
                }
            }

            if (externalId) {
                if (!notesMap.has(externalId)) {
                    notesMap.set(externalId, []);
                }
                if (effectiveNote) {
                    notesMap.get(externalId).push(effectiveNote);
                }
            } else {
                console.warn(`WARNING: Unresolved reference: "${line}"`);
                unresolvedRefs.push(line);
            }
        }

        // Build strategicDocuments array — one entry per externalId
        const strategicDocuments = [];
        for (const [externalId, notes] of notesMap.entries()) {
            const entry = { externalId };
            if (notes.length > 0) {
                entry.note = notes.join(';\n');
            }
            strategicDocuments.push(entry);
        }

        return { strategicDocuments, unresolvedRefs };
    }

    /**
     * Expand NSP multi-SO reference lines into individual lines.
     * Pattern: "Network Strategy Plan 2025-2029 SO1 / SO4 / SO9"
     * Expands to: ["NSP SO 1", "NSP SO 4", "NSP SO 9"]
     * Each expanded line is then processed by the normal reference matching pipeline,
     * where "NSP SO 1" normalizes to refdoc:nsp_so_1 via ExternalIdBuilder.
     * Non-matching lines are returned unchanged.
     * @param {string[]} lines
     * @returns {string[]}
     * @private
     */
    _expandNspReferences(lines) {
        const expanded = [];
        for (const line of lines) {
            // Detect: "Network Strategy Plan ... SO# / SO# / ..."
            const nspMatch = line.match(/^Network Strategy Plan[^S]*(SO\d+(?:\s*\/\s*SO\d+)+)/i);
            if (nspMatch) {
                const soTokens = nspMatch[1].split('/').map(t => t.trim()).filter(Boolean);
                for (const token of soTokens) {
                    // Normalise token: "SO1" → "NSP SO 1", "SO10" → "NSP SO 10"
                    const soNum = token.replace(/^SO/i, '').trim();
                    expanded.push(`NSP SO ${soNum}`);
                }
            } else {
                expanded.push(line);
            }
        }
        return expanded;
    }

    /**
     * Expand ATMMP SDO reference lines with comma-separated SDO numbers into individual lines.
     * Pattern: "ATMMP SDO 2, 5" → ["ATMMP SDO 2", "ATMMP SDO 5"]
     * Each expanded line is then resolved to refdoc:atmmp/sdo<n> by the
     * atmmpSdoMatch block in _parseReferences.
     * Non-matching lines are returned unchanged.
     * @param {string[]} lines
     * @returns {string[]}
     * @private
     */
    _expandAtmmpReferences(lines) {
        const expanded = [];
        for (const line of lines) {
            // Detect: "ATMMP SDO <n>[, <n>, ...]"
            // e.g. "ATMMP SDO 2, 5" → ["ATMMP SDO 2", "ATMMP SDO 5"]
            const atmmpMatch = line.match(/^ATMMP\s+SDO\s+([\d,\s]+)$/i);
            if (atmmpMatch) {
                const sdoNums = atmmpMatch[1].split(',').map(t => t.trim()).filter(Boolean);
                for (const num of sdoNums) {
                    expanded.push(`ATMMP SDO ${num}`);
                }
            } else {
                expanded.push(line);
            }
        }
        return expanded;
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