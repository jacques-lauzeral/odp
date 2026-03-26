import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for ASM_ATFCM Excel documents — Edition 4 structure
 *
 * WORKBOOK STRUCTURE:
 * ===================
 * The Edition 4 workbook organises content across multiple sheets per wave:
 *
 *   Wave 2027:  ONOR2027 (main), ONOR2027-ad hoc RSA, ONOR2027-Dynamic RAD,
 *               ONOR2027-AIrspace scenario, ONOR2027-iOAT FPL,
 *               ONOR2027-Notification, ONOR2027-monitoring, ONOR2027-CBA-CBO
 *   Wave 2028:  ONOR 2028 (main), ONOR 2028 AS structures, ONOR 2028 Rolling,
 *               ONOR 2028 NIASIM, ONOR 2028 CDM
 *   Wave 2029:  ONOR2029 (main), ONOR2029 Dynamic ATM, ONOR2029 NIASIM,
 *               ONOR2029 Rolling Process, ONOR2029 POST-OPS,
 *               ONOR2029 CDM evolution, ONOR2029 Monitoring evolution
 *   OC sheets:  OC 2027, OC 2028, OC 2029  (not processed by this mapper)
 *
 * ON/OR HIERARCHY PER WAVE:
 * ==========================
 * Each wave has a set of ROOT ONs (low ON codes) that act as structural folders,
 * each grouping a set of CHILD ONs and their implementing ORs.
 *
 * Root ONs are identified by ON code number ≤ wave threshold:
 *   Wave 2027: threshold = 7   (codes 01–07)
 *   Wave 2028: threshold = 4   (codes 01–04)
 *   Wave 2029: threshold = 6   (codes 01–06)
 *
 * --- WAVE 2027 ROOT / CHILD ON STRUCTURE ---
 *
 * 1. Ad-hoc airspace structure evolution
 *    a. Ad-hoc extension of area horizontal/vertical profile
 *    b. Ad-hoc creation
 *    c. AD-HOC RSAs
 *    d. CDM process for ad-hoc requests
 *    e. Trigger assessment of ad hoc area
 *    f. Digital NOTAM for ad hoc airspace structure
 * 2. Dynamic RAD evolution
 *    a. Dynamic RAD evolution
 * 3. Dynamic scenarios evolution
 *    a. Implement grouping restrictions associated to airspace scenario
 *    b. Publication of grouping restrictions associated to airspace scenarios
 *    c. Management of restrictions group associated to an airspace scenario
 *    d. Implementation of restrictions grouping scenarios
 *    e. Management of restrictions group scenario
 *    f. Cross border airspace scenarios and CDM
 * 4. iOAT FPL evolution
 *    a. iOAT FPL linked with RSA
 *    b. iOAT FPL and RSA for MIL AU
 *    c. iOAT FPL and RSA for NM
 *    d. iOAT FPL with RSA distribution to EXT
 *    e. Impact of iOAT FPL on sector load
 * 5. Notification process evolution
 *    a. Distribution of e-AMI message in case of B2B failure
 *    b. Event based rerouting option
 *    c. Rolling events publication
 *    d. EAUP/EUUP Map display
 *    e. Rerouting considering AUs feedback
 * 6. Enhance Monitoring function with ASM data
 *    a. Impact of ARES activation on sector load
 * 7. CBO/CBA evolution
 *    a. Dynamic Lead AMC
 *
 * --- WAVE 2028 ROOT / CHILD ON STRUCTURE ---
 *
 * 1. Enhanced ASM structures evolution
 *    a. ATC volumes
 *    b. Implementation of DMAs types 1 and 2
 *    c. Management of restrictions group associated to an airspace scenario
 *    d. Airspace scenarios/configuration using modular solutions
 *    e. Improve FBZ usage
 *    f. Management of DMAs types 1 and 2
 *    g. Event based time expression for RSA availability
 *    h. SIDs/STARs closure via AUP/UUP
 * 2. Rolling process evolution
 *    a. Early notification of airspace data
 *    b. Alignment of EAUP/EUUP with ADP and DNP
 *    c. Full rolling AUP-UUP
 *    d. Publication of NIL UUP
 *    e. Rolling events publication
 * 3. NIA/SIM further evolution
 *    a. Capability to retrieve historical and future traffic/airspace data
 *    b. Complexity Information
 *    c. Spot Management
 *    d. Hotspot Management
 *    e. Application of pre-defined ASM/ATFCM solutions
 *    f. Identification of flights for specific measures
 *    g. NIA for AUP/UUP
 *    h. Extended Use of STAM Measures for Airborne Flights and Downstream Congestion Management
 * 4. Enhanced CDM evolution
 *    a. Collaborative Assessment of ASM/FUA Solutions
 *    b. Continuous Collaborative Decision-Making across operational phases
 *    c. Interoperability for sharing coordination proposals between local and NM
 *
 * --- WAVE 2029 ROOT / CHILD ON STRUCTURE ---
 *
 * 1. Dynamic ATM features evolution
 *    a. Implementation of DMAs type 3
 *    b. Flexible parameters for RSAs
 *    c. Dynamic creation of scenarios
 *    d. Management of DMAs type 3
 *    e. Dynamic ATS delegation
 *    f. Dynamic cross-border airspace solutions
 *    g. Implementation of combined scenarios
 * 2. NIA/SIM further evolution
 *    a. Assessment based on performance indicators
 *    b. Network Impact Assessment for airspace scenarios
 *    c. Comparing ASM/ATFCM solutions
 *    d. Display of best ASM/ATFCM solutions
 *    e. Network best ASM/ATFCM solutions
 *    f. NIA supported by AI/ML capabilities
 *    g. Access to previous archived analysis
 * 3. Rolling Process evolution
 *    a. Full rolling AUP-UUP
 *    b. Extension of Planning closer to EOBT
 * 4. POST-OPS evolution
 *    a. Post Ops Analysis
 *    b. Traceability through the entire lifecycle
 * 5. Further CDM process evolution
 *    a. Sharing information of combined scenarios
 *    b. Continuous Collaborative Decision-Making across operational phases
 * 6. Enhanced Monitoring evolution
 *    a. Enrich flight trajectories with AI
 *    b. More accurate prediction of demand (traffic and airspace)
 *    c. New Monitoring Values
 *
 * ON IDENTITY AND DEDUPLICATION:
 * ================================
 * - Root ON identity key: (wave, normalized ON code number)
 *   externalId: on:asm_atfcm/{wave}/{code_num_padded}
 *   e.g. on:asm_atfcm/2027/01
 * - Child ON identity key: (wave, normalized ON code number)
 *   externalId: on:asm_atfcm/{wave}/{code_num_padded}
 *   e.g. on:asm_atfcm/2027/15
 * - Canonical title: taken from the first occurrence across sheets
 *   (root ONs: from their dedicated topic sheet; child ONs: first sheet encounter)
 * - Code normalization: strips extra whitespace, e.g. 'ON -01' → '01'
 *
 * CHILD → ROOT LINKAGE:
 * ======================
 * Each row carries an 'ON reference:' column containing the title of the parent
 * ON (root or intermediate). The mapper resolves this title against a
 * title→externalId map built from root ON entries, to populate refinesParents.
 * Title matching is case-insensitive and trimmed.
 *
 * OR → ON LINKAGE:
 * =================
 * Each OR row belongs to the ON identified by the ON Code / ON Title columns
 * in the same row. The OR's implementedONs references that ON's externalId.
 *
 * OR STATEMENT COLUMN VARIANTS:
 * ==============================
 * The OR statement column header varies across sheet generations:
 *   2027 sheets:            'OR Statement'
 *   2028 main + subtopics:  '' (empty key — Excel unnamed column)
 *   2028 AS structures:     'OR statement'  (lowercase s)
 *   2029 sheets:            'Detailed requirement:\r\nOR Statement'
 * The mapper uses _resolveOrStatementColumn() to normalise across all variants.
 *
 * COLUMN INTERPRETATION — ONOR SHEETS:
 * ======================================
 * ON extraction:
 *   'ON Code:'                           → identity key (normalized)
 *   'ON Title:'                          → title (canonical: first occurrence wins)
 *   'ON Statement'                       → statement
 *   'ON Rationale'                       → rationale
 *   'Step'                               → path[0]
 *   'CONOPS Improvement reference'       → path[1]
 *   type: 'ON', drg: 'ASM_ATFCM'        (hardcoded)
 *
 * OR extraction:
 *   'OR Title:'                          → title
 *   OR statement column (variant)        → statement base
 *   'Fit Criteria: (keep it under the statement)' → appended to statement
 *   'Rationale:'                         → rationale base
 *   'Opportunities and risks: (keep)'   → appended to rationale
 *   'Stakeholders:'                      → impactedStakeholders
 *   'Dependencies:'                      → privateNotes
 *   'Priority (Implementing Year)'       → privateNotes
 *   'Data (and other Enablers):'         → privateNotes
 *   'Impacted Services:'                 → privateNotes
 *   'iNM Roadmap reference (code)'      → privateNotes
 *   'iDL Roadmap Step'                  → privateNotes
 *   'NSP SOs reference'                 → privateNotes
 *   'Remark'                            → privateNotes
 *   'OR Code'                           → privateNotes
 *   '#'                                 → privateNotes (row number, optional)
 *   type: 'OR', drg: 'ASM_ATFCM'        (hardcoded)
 *
 * IGNORED COLUMNS:
 * =================
 *   'Origin'                  — redundant with document reference
 *   'ON reference:'           — used internally for root linkage only
 *   'Operational Change (Code)' — always empty
 *   '__EMPTY', '📌 Row counts', 'Value' — Excel artefacts on main 2027 sheet
 *
 * EXTERNAL ID FORMAT:
 * ====================
 *   ON (root):  on:asm_atfcm/{wave}/{code_num}   e.g. on:asm_atfcm/2027/01
 *   ON (child): on:asm_atfcm/{wave}/{code_num}   e.g. on:asm_atfcm/2027/15
 *   OR:         or:asm_atfcm/{wave}/{title_normalized}
 *
 * PATH:
 * ======
 *   Root ONs:  path = [Step, CONOPS Improvement reference] (structural grouping)
 *   Child ONs: path = [Step, CONOPS Improvement reference]
 *   ORs:       no path (ORs are grouped under their parent ON)
 *
 * OR PRIVATE NOTES FORMAT:
 * =========================
 * # [row number]
 *
 * **OR Code:** [value]
 *
 * **Dependencies:** [value]
 *
 * **Priority (Implementing Year):** [value]
 *
 * **Data (and other Enablers):** [value]
 *
 * **Impacted Services:** [value]
 *
 * **iNM Roadmap Reference:** [value]
 *
 * **iDL Roadmap Step:** [value]
 *
 * **NSP SOs Reference:** [value]
 *
 * **Stakeholders (unmapped):** [comma-separated]
 *
 * **Remark:** [value]
 *
 * (empty, TBD, N/A values are skipped)
 */

// Root ON code thresholds per wave — codes <= threshold are root ONs
const ROOT_THRESHOLDS = {
    '2027': 7,
    '2028': 4,
    '2029': 6
};

/**
 * Static child-code → root-code mapping per wave.
 * Derived from the authoritative ON/OR structure tables in the mapper header.
 * ON reference: column is NOT used for root linkage (it self-references the child title).
 *
 * Wave 2027 root ranges:
 *   01 (Ad-hoc airspace structure evolution):  08–10, 18–21
 *   02 (Dynamic RAD evolution):                (no dedicated child ONs — ORs only)
 *   03 (Dynamic scenarios evolution):           08–10, 17
 *   04 (iOAT FPL evolution):                   11–16
 *   05 (Notification process evolution):        20, 22–25
 *   06 (Enhance Monitoring function):           15–16
 *   07 (CBO/CBA evolution):                    (no dedicated child ONs)
 *
 * Wave 2028 root ranges:
 *   01 (Enhanced ASM structures evolution):    26–31, 48–49
 *   02 (Rolling process evolution):            40, 43, 45–47
 *   03 (NIA/SIM further evolution):            32–38, 44
 *   04 (Enhanced CDM evolution):               39, 41–42
 *
 * Wave 2029 root ranges:
 *   01 (Dynamic ATM features evolution):       50–55
 *   02 (NIA/SIM further evolution):            57–62, 64–66
 *   03 (Rolling Process evolution):            68, 70
 *   04 (POST-OPS evolution):                   69, 71
 *   05 (Further CDM process evolution):        56, 67
 *   06 (Enhanced Monitoring evolution):        57–59
 */
const CHILD_TO_ROOT_MAP = {
    '2027': {
        8: 1,  9: 1, 10: 1, 18: 1, 19: 1, 20: 1, 21: 1,  // root 01
        // root 02: no child ONs
        17: 3,                                               // root 03 (cross-border CDM)
        11: 4, 12: 4, 13: 4, 14: 4, 15: 4, 16: 4,         // root 04
        22: 5, 23: 5, 24: 5, 25: 5,                        // root 05
        // root 06: impact of ARES (15) and iOAT FPL (16) shared with root 04
        // root 07: no child ONs
    },
    '2028': {
        26: 1, 27: 1, 28: 1, 29: 1, 30: 1, 31: 1, 48: 1, 49: 1,  // root 01
        40: 2, 43: 2, 45: 2, 46: 2, 47: 2,                         // root 02
        32: 3, 33: 3, 34: 3, 35: 3, 36: 3, 37: 3, 38: 3, 44: 3,  // root 03
        39: 4, 41: 4, 42: 4,                                        // root 04
    },
    '2029': {
        50: 1, 51: 1, 52: 1, 53: 1, 54: 1, 55: 1,         // root 01
        57: 2, 58: 2, 59: 2, 60: 2, 61: 2, 62: 2,          // root 02 (also 63–66)
        63: 2, 64: 2, 65: 2, 66: 2,
        68: 3, 70: 3,                                        // root 03
        69: 4, 71: 4,                                        // root 04
        56: 5, 67: 5,                                        // root 05
        // root 06 shares 57–59 with root 02 — monitoring ONs appear under both
    }
};

// ONOR sheet name patterns per wave
const WAVE_SHEET_PATTERNS = {
    '2027': /^ONOR\s*2027/i,
    '2028': /^ONOR\s*2028/i,
    '2029': /^ONOR\s*2029/i
};

// OR statement column candidates, in priority order
const OR_STATEMENT_COLUMN_CANDIDATES = [
    'OR Statement',
    'OR statement',
    '',
    'Detailed requirement:\r\nOR Statement',
    'Detailed requirement:\r\nStatement'
];

class AsmAtfcmMapper extends Mapper {

    /**
     * Stakeholder synonym map — title tokens → externalId
     * null values are explicitly ignored tokens
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        'NM': 'stakeholder:network/nm',
        'NMOC': 'stakeholder:network/nm/nmoc',
        'Network Manager': 'stakeholder:network/nm',
        'NM B2B Office': 'stakeholder:network/nm',
        'Network Manager Operations Centre': 'stakeholder:network/nm/nmoc',
        'WOC': 'stakeholder:network/nm/weather',
        'WOCs': 'stakeholder:network/nm/weather',
        'ANSP': 'stakeholder:network/ansp',
        'ANSPs': 'stakeholder:network/ansp',
        'ANSPs MIL': 'stakeholder:network/ansp',
        'FMP': 'stakeholder:network/ansp/fmp',
        'FMPs': 'stakeholder:network/ansp/fmp',
        'FM': 'stakeholder:network/ansp/fmp',
        'Local FMPs': 'stakeholder:network/ansp/fmp',
        'Local FMP': 'stakeholder:network/ansp/fmp',
        'Flow Management Positions': 'stakeholder:network/ansp/fmp',
        'AMC': 'stakeholder:network/ansp/amc',
        'AMCs': 'stakeholder:network/ansp/amc',
        'Local AMCs': 'stakeholder:network/ansp/amc',
        'local AMCs': 'stakeholder:network/ansp/amc',
        'Local AMC': 'stakeholder:network/ansp/amc',
        'Airspace Management Cells': 'stakeholder:network/ansp/amc',
        'ATC Unit': 'stakeholder:network/ansp/atc',
        'ATC Units': 'stakeholder:network/ansp/atc',
        'Air Traffic Control Units': 'stakeholder:network/ansp/atc',
        'Civil/Military ATC Units': ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'Civil Military ATC Units': ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'Military ATC Units': ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'Civil, Military ATC Units': ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'ATSUs': 'stakeholder:network/ansp/ats',
        'ATSU': 'stakeholder:network/ansp/ats',
        'AU': 'stakeholder:network/airspace_user',
        'AUs': 'stakeholder:network/airspace_user',
        'Aus': 'stakeholder:network/airspace_user',
        'Airspace Users': 'stakeholder:network/airspace_user',
        'Airspace User': 'stakeholder:network/airspace_user',
        'AO': 'stakeholder:network/airspace_user',
        'AOs': 'stakeholder:network/airspace_user',
        'Airlines': 'stakeholder:network/airspace_user',
        'Airlines/AU': 'stakeholder:network/airspace_user',
        'CFSP': 'stakeholder:network/airspace_user/cfsp',
        'CFSPs': 'stakeholder:network/airspace_user/cfsp',
        'Military': 'stakeholder:network/ansp/mil',
        'MIL': 'stakeholder:network/ansp/mil',
        'MIL AU': 'stakeholder:network/ansp/mil',
        'Military Operational Units': 'stakeholder:network/ansp/mil',
        'Military authorities': 'stakeholder:network/ansp/mil',
        // No equivalent in setup — fall through to unmapped handler (logged + private notes)
        // 'System Integrators', 'System Developers', 'IT Admins', 'Stakeholder IT Admins'
        'National Authority': 'stakeholder:network/national_european_authority',
        'NSA': 'stakeholder:network/national_european_authority',
        'EASA': 'stakeholder:network/national_european_authority',
        // Explicitly ignored
        'External Systems': null,
        'External Users': null,
        'EXT': null,
        'relevant ASM actors': null,
        'local ASM actor': null,
        'local ASM': null,
        'ATFCM actors': null,
        'All CDM stakeholders: FMPs': null,
        'AMC. FMP': null,
        'System Developers (EAUP': null,
        'ADP platforms)': null
    };

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Excel data to structured import format.
     * Processes all ONOR sheets across all waves; OC sheets are ignored.
     *
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData
     */
    map(rawData) {
        console.log('AsmAtfcmMapper: Processing Edition 4 multi-sheet workbook');

        const allNeeds = [];       // root ONs + child ONs, deduplicated
        const allRequirements = []; // ORs across all sheets

        for (const wave of ['2027', '2028', '2029']) {
            const waveSheets = this._getSheetsForWave(rawData, wave);
            if (waveSheets.length === 0) {
                console.warn(`AsmAtfcmMapper: No ONOR sheets found for wave ${wave}`);
                continue;
            }

            console.log(`AsmAtfcmMapper: Processing wave ${wave} — ${waveSheets.length} sheets`);
            const waveResult = this._processWave(wave, waveSheets);
            allNeeds.push(...waveResult.needs);
            allRequirements.push(...waveResult.requirements);
        }

        console.log(`AsmAtfcmMapper: Total — ${allNeeds.length} ONs, ${allRequirements.length} ORs`);

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: [],
            requirements: [...allNeeds, ...allRequirements],
            changes: []
        };
    }

    // ─── Wave processing ──────────────────────────────────────────────────────

    /**
     * Get all ONOR sheets for a given wave, sorted so the main sheet comes first.
     * @param {Object} rawData
     * @param {string} wave - '2027' | '2028' | '2029'
     * @returns {Array} Ordered sheet objects
     * @private
     */
    _getSheetsForWave(rawData, wave) {
        const pattern = WAVE_SHEET_PATTERNS[wave];
        const sheets = (rawData.sheets || []).filter(s => pattern.test(s.name.trim()));

        // Sort: main sheet (name matches exactly ONOR{wave} or ONOR {wave}) first
        const mainPattern = new RegExp(`^ONOR\\s*${wave}\\s*$`, 'i');
        return sheets.sort((a, b) => {
            const aMain = mainPattern.test(a.name.trim()) ? 0 : 1;
            const bMain = mainPattern.test(b.name.trim()) ? 0 : 1;
            return aMain - bMain;
        });
    }

    /**
     * Process all ONOR sheets for a wave, building deduplicated ONs and ORs.
     * @param {string} wave
     * @param {Array} sheets
     * @returns {{ needs: Array, requirements: Array }}
     * @private
     */
    _processWave(wave, sheets) {
        const threshold = ROOT_THRESHOLDS[wave];

        // Shared state across all sheets in this wave
        const onMap = new Map();  // externalId → ON object (dedup)
        const orMap = new Map();  // externalId → OR object (dedup by title+wave)

        for (const sheet of sheets) {
            console.log(`  Sheet "${sheet.name}": ${sheet.rows.length} rows`);
            const orStatementKey = this._resolveOrStatementColumn(sheet);

            for (const row of sheet.rows) {
                // Skip header-leaked rows
                if (this._isHeaderRow(row)) continue;

                const onCodeNum = this._normalizeCodeNumber(row['ON Code:']);
                if (onCodeNum === null) continue;

                const onTitle = (row['ON Title:'] || '').trim();
                if (!onTitle) continue;

                const isRoot = onCodeNum <= threshold;
                const onExternalId = this._buildOnExternalId(wave, onCodeNum);

                // Create or update the ON entry
                if (!onMap.has(onExternalId)) {
                    const on = this._buildOn(wave, onCodeNum, onTitle, row, isRoot);
                    onMap.set(onExternalId, on);
                } else {
                    // Append statement/rationale if this sheet adds new content
                    this._mergeOnContent(onMap.get(onExternalId), row);
                }

                // Resolve parent for child ONs via static code-range map
                // and inherit root ON path
                if (!isRoot) {
                    const on = onMap.get(onExternalId);
                    if (on.refinesParents.length === 0) {
                        const rootCodeNum = (CHILD_TO_ROOT_MAP[wave] || {})[onCodeNum];
                        if (rootCodeNum != null) {
                            const rootId = this._buildOnExternalId(wave, rootCodeNum);
                            on.refinesParents = [rootId];
                            // Path resolved in second pass after all sheets processed
                        } else {
                            console.warn(`AsmAtfcmMapper: No root mapping for child ON code ${onCodeNum} in wave ${wave}`);
                        }
                    }
                }

                // Extract OR from this row
                const orTitle = (row['OR Title:'] || '').trim();
                if (!orTitle) continue;

                const orExternalId = this._buildOrExternalId(wave, orTitle);
                if (!orMap.has(orExternalId)) {
                    const or = this._buildOr(wave, orTitle, onExternalId, row, orStatementKey);
                    if (or) orMap.set(orExternalId, or);
                }
            }
        }

        // Apply Delta conversion — roots first so refinesParents references are always satisfied
        const needsOrdered = [
            ...Array.from(onMap.values()).filter(on => on.isRoot),
            ...Array.from(onMap.values()).filter(on => !on.isRoot)
        ];
        const needs = needsOrdered.map(on => ({
            ...on,
            statement: this.converter.asciidocToDelta(on.statement),
            rationale: this.converter.asciidocToDelta(on.rationale),
            privateNotes: this.converter.asciidocToDelta(on.privateNotes)
        }));

        const requirements = Array.from(orMap.values()).map(or => ({
            ...or,
            statement: this.converter.asciidocToDelta(or.statement),
            rationale: this.converter.asciidocToDelta(or.rationale),
            privateNotes: this.converter.asciidocToDelta(or.privateNotes)
        }));

        return { needs, requirements };
    }

    // ─── ON building ──────────────────────────────────────────────────────────

    /**
     * Build a new ON object from a row.
     * @param {string} wave
     * @param {number} codeNum
     * @param {string} title
     * @param {Object} row
     * @param {boolean} isRoot
     * @returns {Object}
     * @private
     */
    _buildOn(wave, codeNum, title, row, isRoot) {
        const step = (row['Step'] || '').trim();
        const conops = (row['CONOPS Improvement reference'] || '').trim();
        const path = this._buildPath(step, conops);

        const statement = (row['ON Statement'] || '').trim() || null;
        const rationale = (row['ON Rationale'] || '').trim() || null;
        const year = parseInt(wave, 10);

        return {
            externalId: this._buildOnExternalId(wave, codeNum),
            type: 'ON',
            drg: 'ASM_ATFCM',
            title,
            path,
            statement,
            rationale,
            tentative: [year, year],
            refinesParents: [],
            privateNotes: null
        };
    }

    /**
     * Merge new statement/rationale content into an existing ON if not already present.
     * @param {Object} existingOn
     * @param {Object} row
     * @private
     */
    _mergeOnContent(existingOn, row) {
        const newStatement = (row['ON Statement'] || '').trim();
        const newRationale = (row['ON Rationale'] || '').trim();

        if (newStatement && existingOn.statement && !existingOn.statement.includes(newStatement)) {
            existingOn.statement += '\n\n' + newStatement;
        } else if (newStatement && !existingOn.statement) {
            existingOn.statement = newStatement;
        }

        if (newRationale && existingOn.rationale && !existingOn.rationale.includes(newRationale)) {
            existingOn.rationale += '\n\n' + newRationale;
        } else if (newRationale && !existingOn.rationale) {
            existingOn.rationale = newRationale;
        }
    }

    // ─── OR building ──────────────────────────────────────────────────────────

    /**
     * Build a new OR object from a row.
     * @param {string} wave
     * @param {string} orTitle
     * @param {string} onExternalId - Parent ON externalId
     * @param {Object} row
     * @param {string} orStatementKey - Resolved OR statement column name
     * @returns {Object|null}
     * @private
     */
    _buildOr(wave, orTitle, onExternalId, row, orStatementKey) {
        const step = (row['Step'] || '').trim();
        const conops = (row['CONOPS Improvement reference'] || '').trim();
        const path = this._buildPath(step, conops);
        // Statement
        const baseStatement = (row[orStatementKey] || '').trim();
        const fitCriteria = (row['Fit Criteria: (keep it under the statement)'] || '').trim();
        let statement = null;
        if (baseStatement) {
            statement = baseStatement;
            if (this._isValidContent(fitCriteria)) {
                statement += '\n\n**Fit Criteria:**\n\n' + fitCriteria;
            }
        }

        // Rationale
        const baseRationale = (row['Rationale:'] || '').trim();
        const opRisks = (row['Opportunities and risks: (keep)'] || '').trim();
        let rationale = null;
        if (baseRationale) {
            rationale = baseRationale;
            if (this._isValidContent(opRisks)) {
                rationale += '\n\n**Opportunities and Risks:**\n\n' + opRisks;
            }
        }

        // Stakeholders
        const stakeholderResult = this._parseStakeholders(row['Stakeholders:'] || '');

        // Strategic documents: NSP SOs + ASM-ATFCM ConOPS improvement reference
        const nspRefs = this._parseNspSoReferences(row['NSP SOs reference'] || '');
        const conopsRefs = this._parseConopsReference(row['CONOPS Improvement reference'] || '');
        const strategicDocuments = [...nspRefs, ...conopsRefs];

        // Private notes
        const privateNotes = this._buildOrPrivateNotes(row, stakeholderResult.unmapped);

        return {
            externalId: this._buildOrExternalId(wave, orTitle),
            type: 'OR',
            drg: 'ASM_ATFCM',
            title: orTitle,
            path,
            statement,
            rationale,
            privateNotes,
            implementedONs: [onExternalId],
            impactedStakeholders: stakeholderResult.refs,
            strategicDocuments: strategicDocuments.length > 0 ? strategicDocuments : undefined
        };
    }

    /**
     * Build OR private notes from multiple columns.
     * @param {Object} row
     * @param {Array<string>} unmappedStakeholders
     * @returns {string|null}
     * @private
     */
    _buildOrPrivateNotes(row, unmappedStakeholders = []) {
        const parts = [];

        const rowNum = (row['#'] || '').toString().trim();
        if (rowNum) parts.push(`# ${rowNum}`);

        const orCode = (row['OR Code'] || '').trim();
        if (orCode) parts.push(`**OR Code:** ${orCode}`);

        const dependencies = (row['Dependencies:'] || '').trim();
        if (this._isValidPrivateNote(dependencies)) parts.push(`**Dependencies:** ${dependencies}`);

        const priority = (row['Priority (Implementing Year)'] || '').trim();
        if (this._isValidPrivateNote(priority)) parts.push(`**Priority (Implementing Year):** ${priority}`);

        const dataEnablers = (row['Data (and other Enablers):'] || '').trim();
        if (this._isValidPrivateNote(dataEnablers)) parts.push(`**Data (and other Enablers):** ${dataEnablers}`);

        const impactedServices = (row['Impacted Services:'] || '').trim();
        if (this._isValidPrivateNote(impactedServices)) parts.push(`**Impacted Services:** ${impactedServices}`);

        const inmRef = (row['iNM Roadmap reference (code)'] || '').trim();
        if (this._isValidPrivateNote(inmRef)) parts.push(`**iNM Roadmap Reference:** ${inmRef}`);

        const idlStep = (row['iDL Roadmap Step'] || '').trim();
        if (this._isValidPrivateNote(idlStep)) parts.push(`**iDL Roadmap Step:** ${idlStep}`);

        const nspRef = (row['NSP SOs reference'] || '').trim();
        if (this._isValidPrivateNote(nspRef)) parts.push(`**NSP SOs Reference:** ${nspRef}`);

        if (unmappedStakeholders.length > 0) {
            parts.push(`**Stakeholders (unmapped):** ${unmappedStakeholders.join(', ')}`);
        }

        const remark = (row['Remark'] || '').trim();
        if (this._isValidPrivateNote(remark)) parts.push(`**Remark:** ${remark}`);

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Build ON externalId from wave and numeric code.
     * @param {string} wave
     * @param {number} codeNum
     * @returns {string}
     * @private
     */
    _buildOnExternalId(wave, codeNum) {
        return `on:asm_atfcm/${wave}/${String(codeNum).padStart(2, '0')}`;
    }

    /**
     * Build OR externalId from wave and title.
     * @param {string} wave
     * @param {string} title
     * @returns {string}
     * @private
     */
    _buildOrExternalId(wave, title) {
        const normalized = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
        return `or:asm_atfcm/${wave}/${normalized}`;
    }

    /**
     * Extract and normalize the numeric part of an ON Code string.
     * Returns null if not parseable or if it is a header literal.
     * e.g. 'ASM/ATFCM - ON -01' → 1, 'ASM/ATFCM - ON - 07' → 7
     * @param {string} code
     * @returns {number|null}
     * @private
     */
    _normalizeCodeNumber(code) {
        if (!code || typeof code !== 'string') return null;
        const trimmed = code.trim();
        if (trimmed === '' || trimmed === 'ON Code:') return null;
        const m = trimmed.match(/(\d+)\s*$/);
        return m ? parseInt(m[1], 10) : null;
    }

    /**
     * Determine the OR statement column key for a given sheet.
     * Falls back through known variants; warns if none found.
     * @param {Object} sheet
     * @returns {string}
     * @private
     */
    _resolveOrStatementColumn(sheet) {
        if (!sheet.rows || sheet.rows.length === 0) return OR_STATEMENT_COLUMN_CANDIDATES[0];
        const keys = Object.keys(sheet.rows[0]);
        const found = OR_STATEMENT_COLUMN_CANDIDATES.find(candidate => keys.includes(candidate));
        if (!found && found !== '') {
            console.warn(`AsmAtfcmMapper: No OR statement column found in sheet "${sheet.name}"`);
        }
        return found ?? OR_STATEMENT_COLUMN_CANDIDATES[0];
    }

    /**
     * Detect header-leaked rows (where the ON Code cell contains the literal header text).
     * @param {Object} row
     * @returns {boolean}
     * @private
     */
    _isHeaderRow(row) {
        const code = (row['ON Code:'] || '').trim();
        return code === 'ON Code:';
    }

    /**
     * Build path array from Step and CONOPS Improvement reference.
     * @param {string} step
     * @param {string} conops
     * @returns {Array<string>|null}
     * @private
     */
    _buildPath(step, conops) {
        const first = step ? step.split('\n')[0].trim() : null;
        return first ? [first] : null;
    }

    /**
     * Parse NSP SOs reference column into strategicDocuments entries.
     * Handles multi-value cells (newline-separated), e.g. "SO1/3\nSO3/4".
     * Maps SO{x}/{y} → document:nsp/so{x}/{y}
     * @param {string} text
     * @returns {Array<{externalId: string}>}
     * @private
     */
    _parseNspSoReferences(text) {
        if (!this._isValidContent(text)) return [];

        return text
            .split('\n')
            .map(t => t.trim())
            .filter(t => t && /^SO\d+\/\d+$/i.test(t))
            .map(t => ({ externalId: `refdoc:nsp_${t.toLowerCase().replace(/^so(\d+)\/(\d+)$/, 'so_$1_$2')}` }));
    }

    /**
     * Parse CONOPS Improvement reference into a strategicDocuments entry.
     * Uses fixed refdoc:asm_atfcm_conops with the topic as note.
     * Takes only the first line of multi-line cells.
     * @param {string} text
     * @returns {Array<{externalId: string, note: string}>}
     * @private
     */
    _parseConopsReference(text) {
        if (!this._isValidContent(text)) return [];
        const note = text.split('\n')[0].trim();
        if (!note) return [];
        return [{ externalId: 'refdoc:asm_atfcm_conops', note }];
    }

    /**
     * Parse stakeholders column into refs and unmapped tokens.
     * @param {string} text
     * @returns {{ refs: Array<{externalId}>, unmapped: Array<string> }}
     * @private
     */
    _parseStakeholders(text) {
        if (!text || text.trim() === '') return { refs: [], unmapped: [] };

        const refs = [];
        const seenIds = new Set();
        const unmapped = [];

        // Pre-substitute compound slash tokens before the slash-delimiter split
        const normalizedText = text.replace(/Civil\/Military ATC Units/gi, 'Civil Military ATC Units');

        const tokens = normalizedText
            .split(/[,;/•\n]/)
            .map(t => t.replace(/\s*\([^)]*\)\s*/g, '').trim())
            .filter(Boolean);

        for (const token of tokens) {
            const mapping = AsmAtfcmMapper.STAKEHOLDER_SYNONYM_MAP[token];
            if (mapping === null) continue; // explicitly ignored
            if (mapping) {
                const targets = Array.isArray(mapping) ? mapping : [mapping];
                for (const externalId of targets) {
                    if (!seenIds.has(externalId)) {
                        refs.push({ externalId });
                        seenIds.add(externalId);
                    }
                }
            } else {
                if (!unmapped.includes(token)) {
                    unmapped.push(token);
                    console.warn(`AsmAtfcmMapper: Unmapped stakeholder "${token}"`);
                }
            }
        }

        return { refs, unmapped };
    }

    /**
     * Check if a value is valid for inclusion (not empty, TBD, or N/A).
     * @param {string} value
     * @returns {boolean}
     * @private
     */
    _isValidContent(value) {
        if (!value || value.trim() === '') return false;
        const u = value.trim().toUpperCase();
        return u !== 'TBD';
    }

    /**
     * Check if a value is valid for private notes (not empty, TBD, or N/A).
     * @param {string} value
     * @returns {boolean}
     * @private
     */
    _isValidPrivateNote(value) {
        if (!value || value.trim() === '') return false;
        const u = value.trim().toUpperCase();
        return u !== 'TBD' && u !== 'N/A';
    }
}

export default AsmAtfcmMapper;