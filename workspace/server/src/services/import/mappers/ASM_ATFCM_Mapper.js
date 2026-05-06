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
 *   Wave 2027:  ONOR2027 (main, ignored), ONOR2027-ad hoc RSA,
 *               ONOR2027-AIrspace scenario, ONOR2027-iOAT FPL,
 *               ONOR2027-Dynamic RAD, ONOR2027-Notification,
 *               ONOR2027-monitoring, ONOR2027-CBA-CBO
 *   Wave 2028:  ONOR 2028 (main, ignored), ONOR 2028 AS structures,
 *               ONOR 2028 Rolling, ONOR 2028 NIASIM, ONOR 2028 CDM
 *   Wave 2029:  ONOR2029 (main, ignored), ONOR2029 Dynamic ATM,
 *               ONOR2029 NIASIM, ONOR2029 Rolling Process,
 *               ONOR2029 POST-OPS, ONOR2029 CDM evolution,
 *               ONOR2029 Monitoring evolution
 *   OC sheets:  OC 2027, OC 2028, OC 2029 (not processed)
 *
 * SHEET → ON MAPPING:
 * ====================
 * Each sub-sheet maps to exactly one root ON (see SHEET_TO_ON constant).
 * Main year sheets (ONOR2027, ONOR 2028, ONOR2029) and OC sheets are ignored.
 *
 * OR FILTERING:
 * =============
 * Within each sub-sheet, only rows whose normalized ON Code matches the
 * sheet's root ON code number are extracted as ORs for that ON.
 * Other rows (context repeats of other ONs) are ignored.
 *
 * OR DEDUPLICATION:
 * =================
 * The same OR title may appear in multiple sheets with matching ON codes
 * (data quality issue — the row carries the sheet's own ON code regardless
 * of its true home ON). ORs are deduplicated globally by externalId across
 * all sheets and waves. When duplicates are found, their implementedONs arrays
 * are merged so the OR correctly references all ONs it implements.
 *
 * ON DEDUPLICATION:
 * =================
 * The same ON title may appear across multiple waves (e.g. "NIA/SIM further
 * evolution" in wave 2028 and 2029). Since ON externalIds are wave-agnostic,
 * duplicates are renamed with " - Part 1" and " - Part 2" suffixes (ordered
 * by wave year), producing distinct externalIds.
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
 * COLUMN INTERPRETATION:
 * =======================
 * ON extraction:
 *   wave, onCodeNum, onTitle   → from SHEET_TO_ON static definition
 *   'ON Statement'             → statement (from first matching row)
 *   'ON Rationale'             → rationale (from first matching row)
 *   'Strategic Documents' | 'NSP SOs reference' → strategicDocuments
 *                                (aggregated across all matching OR rows, set on ON)
 *   type: 'ON', drg: 'ASM_ATFCM'  (hardcoded)
 *   tentative: [year, year]        (derived from wave)
 *
 * OR extraction (from rows matching the sheet's ON code):
 *   'OR Title:'                                    → title
 *   OR statement column (variant)                  → statement base
 *   'Fit Criteria: (keep it under the statement)'  → appended to statement
 *   'Rationale:'                                   → rationale base
 *   'Opportunities and risks: (keep)'              → appended to rationale
 *   'Stakeholders:'                                → impactedStakeholders
 *   'Dependencies:'                                → privateNotes
 *   'Priority (Implementing Year)'                 → privateNotes
 *   'Data (and other Enablers):'                   → privateNotes
 *   'Impacted Services:'                           → privateNotes
 *   'iNM Roadmap reference (code)'                → privateNotes
 *   'iDL Roadmap Step'                            → privateNotes
 *   'Remark'                                      → privateNotes
 *   'OR Code'                                     → privateNotes
 *   '#'                                           → privateNotes (row number)
 *   type: 'OR', drg: 'ASM_ATFCM'                  (hardcoded)
 *   maturity: 'ADVANCED' if rationale present, 'DRAFT' otherwise
 *
 * IGNORED COLUMNS:
 * =================
 *   'Origin'                       — redundant with document reference
 *   'ON reference:'                — ON identity comes from sheet mapping
 *   'ON Title:'                    — comes from sheet mapping
 *   'Operational Change (Code)'    — always empty
 *   'Step'                         — no path on ASM_ATFCM entities
 *   'CONOPS Improvement reference' — covered by Strategic Documents column
 *   '__EMPTY', '📌 Row counts', 'Value' — Excel artefacts
 *
 * EXTERNAL ID FORMAT:
 * ====================
 *   ON:  on:asm_atfcm/{title_normalized}
 *   OR:  or:asm_atfcm/{title_normalized}
 *   Both computed via ExternalIdBuilder (type='on'|'or', drg='ASM_ATFCM', title)
 *   No parent used — implementedONs is a reference relation, not a hierarchy.
 *
 * OR MATURITY RULE:
 * ==================
 *   ADVANCED — when rationale is present
 *   DRAFT    — when rationale is absent; private note prepended:
 *              '[Teams: rationale required for ODIP publication]'
 *
 * OR PRIVATE NOTES FORMAT:
 * =========================
 * [Teams: rationale required for ODIP publication]  ← only when rationale absent
 *
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
 * **Stakeholders (unmapped):** [comma-separated]
 *
 * **Remark:** [value]
 *
 * (empty, TBD, N/A values are skipped)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Static mapping from sub-sheet name to the single ON it represents.
 * Keys match sheet names exactly as they appear in the extracted JSON.
 * Values: { wave, onCodeNum, onTitle }
 */
const SHEET_TO_ON = {
    // Wave 2027
    'ONOR2027-ad hoc RSA':           { wave: '2027', onCodeNum: 1, onTitle: 'Ad-hoc airspace structure evolution' },
    'ONOR2027-AIrspace scenario':    { wave: '2027', onCodeNum: 3, onTitle: 'Dynamic scenarios evolution' },
    'ONOR2027-iOAT FPL':             { wave: '2027', onCodeNum: 4, onTitle: 'iOAT FPL evolution' },
    'ONOR2027-Dynamic RAD':          { wave: '2027', onCodeNum: 2, onTitle: 'Dynamic RAD evolution' },
    'ONOR2027-Notification':         { wave: '2027', onCodeNum: 5, onTitle: 'Notification process evolution' },
    'ONOR2027-monitoring':           { wave: '2027', onCodeNum: 6, onTitle: 'Enhance Monitoring function with ASM data' },
    'ONOR2027-CBA-CBO':              { wave: '2027', onCodeNum: 7, onTitle: 'CBO/CBA evolution' },
    // Wave 2028
    'ONOR 2028 AS structures':       { wave: '2028', onCodeNum: 1, onTitle: 'Enhanced ASM structures evolution' },
    'ONOR 2028 Rolling':             { wave: '2028', onCodeNum: 2, onTitle: 'Rolling process evolution' },
    'ONOR 2028 NIASIM':              { wave: '2028', onCodeNum: 3, onTitle: 'NIA/SIM further evolution' },
    'ONOR 2028 CDM':                 { wave: '2028', onCodeNum: 4, onTitle: 'Enhanced CDM evolution' },
    // Wave 2029
    'ONOR2029 Dynamic ATM':          { wave: '2029', onCodeNum: 1, onTitle: 'Dynamic ATM features evolution' },
    'ONOR2029 NIASIM':               { wave: '2029', onCodeNum: 2, onTitle: 'NIA/SIM further evolution' },
    'ONOR2029 Rolling Process':      { wave: '2029', onCodeNum: 3, onTitle: 'Rolling Process evolution' },
    'ONOR2029 POST-OPS':             { wave: '2029', onCodeNum: 4, onTitle: 'POST-OPS evolution' },
    'ONOR2029 CDM evolution':        { wave: '2029', onCodeNum: 5, onTitle: 'Further CDM process evolution' },
    'ONOR2029 Monitoring evolution': { wave: '2029', onCodeNum: 6, onTitle: 'Enhanced Monitoring evolution' },
};

/**
 * Synonym map for the unified Strategic Documents / NSP SOs reference column.
 * Keys: raw token as it appears after splitting on delimiters (trimmed).
 * Values: { externalId, note? } | null (null = explicitly ignored / noise).
 *
 * External IDs computed via ExternalIdBuilder normalization on reference document name.
 */
const STRATEGIC_DOC_SYNONYM_MAP = {
    // ── NSP SO references ─────────────────────────────────────────────────────
    'SO1/3':          { externalId: 'refdoc:nsp_so_1_3' },
    'NSP SO1/3':      { externalId: 'refdoc:nsp_so_1_3' },
    'NSP SO 1/3':     { externalId: 'refdoc:nsp_so_1_3' },
    'SO1/3NSP SO1/3': { externalId: 'refdoc:nsp_so_1_3' }, // concatenation artefact

    'SO3/2':          { externalId: 'refdoc:nsp_so_3_2' },
    'NSP SO3/2':      { externalId: 'refdoc:nsp_so_3_2' },
    'NSP SO 3/2':     { externalId: 'refdoc:nsp_so_3_2' },

    'SO3/4':          { externalId: 'refdoc:nsp_so_3_4' },
    'NSP SO3/4':      { externalId: 'refdoc:nsp_so_3_4' },
    'NSP SO 3/4':     { externalId: 'refdoc:nsp_so_3_4' },
    'NSP  SO3/4':     { externalId: 'refdoc:nsp_so_3_4' }, // double space
    'NSP NSP SO3/4':  { externalId: 'refdoc:nsp_so_3_4' }, // duplicate prefix

    'SO4/2':          { externalId: 'refdoc:nsp_so_4_2' },
    'NSP SO4/2':      { externalId: 'refdoc:nsp_so_4_2' },
    'NSP SO 4/2':     { externalId: 'refdoc:nsp_so_4_2' },

    'SO4/3':          { externalId: 'refdoc:nsp_so_4_3' },
    'NSP SO4/3':      { externalId: 'refdoc:nsp_so_4_3' },
    'NSP SO 4/3':     { externalId: 'refdoc:nsp_so_4_3' },
    'NSOP SO 4/3':    { externalId: 'refdoc:nsp_so_4_3' }, // typo: NSOP → NSP

    'SO4/4':          { externalId: 'refdoc:nsp_so_4_4' },
    'NSP SO4/4':      { externalId: 'refdoc:nsp_so_4_4' },
    'NSP SO 4/4':     { externalId: 'refdoc:nsp_so_4_4' },

    'SO4/6':          { externalId: 'refdoc:nsp_so_4_6' },
    'NSP SO4/6':      { externalId: 'refdoc:nsp_so_4_6' },
    'NSP SO 4/6':     { externalId: 'refdoc:nsp_so_4_6' },

    'SO6/6':          { externalId: 'refdoc:nsp_so_6_6' },
    'NSP SO6/6':      { externalId: 'refdoc:nsp_so_6_6' },
    'NSP SO 6/6':     { externalId: 'refdoc:nsp_so_6_6' },

    // ── ATMMP SDO references ──────────────────────────────────────────────────
    'ATMMP SDO 3':    { externalId: 'refdoc:atmmp_sdo_3' },
    'ATMMP SDO 5':    { externalId: 'refdoc:atmmp_sdo_5' },
    'ATMMP SDO5':     { externalId: 'refdoc:atmmp_sdo_5' }, // missing space

    // ── EU IR references ──────────────────────────────────────────────────────
    'EU IR 2021/116 AF 3':   { externalId: 'refdoc:commission_implementing_regulation_(eu)_2021_116', note: 'AF 3' },
    'EU IR 2021/116 AF 4':   { externalId: 'refdoc:commission_implementing_regulation_(eu)_2021_116', note: 'AF 4' },
    'EU IR 2021/116 AF 3/4': { externalId: 'refdoc:commission_implementing_regulation_(eu)_2021_116', note: 'AF 3/4' },

    // ── Noise / discard ───────────────────────────────────────────────────────
    '4':                 null, // bare digit fragment
    '5':                 null, // bare digit fragment
    'NSP SOs reference': null, // header row leak
};

/**
 * OR statement column header variants, in priority order.
 *   2027 sheets:            'OR Statement'
 *   2028 main + subtopics:  '' (empty key — Excel unnamed column)
 *   2028 AS structures:     'OR statement' (lowercase s)
 *   2029 sheets:            'Detailed requirement:\r\nOR Statement'
 */
const OR_STATEMENT_COLUMN_CANDIDATES = [
    'OR Statement',
    'OR statement',
    '',
    'Detailed requirement:\r\nOR Statement',
    'Detailed requirement:\r\nStatement',
];

// ─── Mapper ───────────────────────────────────────────────────────────────────

class AsmAtfcmMapper extends Mapper {

    /**
     * Stakeholder synonym map — token → externalId | [externalId] | null
     * null = explicitly ignored token
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        'NM':                           'stakeholder:network/nm',
        'NMOC':                         'stakeholder:network/nm/nmoc',
        'Network Manager':              'stakeholder:network/nm',
        'NM B2B Office':                'stakeholder:network/nm',
        'Network Manager Operations Centre': 'stakeholder:network/nm/nmoc',
        'WOC':                          'stakeholder:network/nm/weather',
        'WOCs':                         'stakeholder:network/nm/weather',
        'ANSP':                         'stakeholder:network/ansp',
        'ANSPs':                        'stakeholder:network/ansp',
        'ANSPs MIL':                    'stakeholder:network/ansp',
        'FMP':                          'stakeholder:network/ansp/fmp',
        'FMPs':                         'stakeholder:network/ansp/fmp',
        'FM':                           'stakeholder:network/ansp/fmp',
        'Local FMPs':                   'stakeholder:network/ansp/fmp',
        'Local FMP':                    'stakeholder:network/ansp/fmp',
        'Flow Management Positions':    'stakeholder:network/ansp/fmp',
        'AMC':                          'stakeholder:network/ansp/amc',
        'AMCs':                         'stakeholder:network/ansp/amc',
        'Local AMCs':                   'stakeholder:network/ansp/amc',
        'local AMCs':                   'stakeholder:network/ansp/amc',
        'Local AMC':                    'stakeholder:network/ansp/amc',
        'Airspace Management Cells':    'stakeholder:network/ansp/amc',
        'ATC Unit':                     'stakeholder:network/ansp/atc',
        'ATC Units':                    'stakeholder:network/ansp/atc',
        'Air Traffic Control Units':    'stakeholder:network/ansp/atc',
        'Civil/Military ATC Units':     ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'Civil Military ATC Units':     ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'Military ATC Units':           ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'Civil, Military ATC Units':    ['stakeholder:network/ansp/atc', 'stakeholder:network/ansp/mil'],
        'ATSUs':                        'stakeholder:network/ansp/ats',
        'ATSU':                         'stakeholder:network/ansp/ats',
        'AU':                           'stakeholder:network/airspace_user',
        'AUs':                          'stakeholder:network/airspace_user',
        'Aus':                          'stakeholder:network/airspace_user',
        'Airspace Users':               'stakeholder:network/airspace_user',
        'Airspace User':                'stakeholder:network/airspace_user',
        'AO':                           'stakeholder:network/airspace_user',
        'AOs':                          'stakeholder:network/airspace_user',
        'Airlines':                     'stakeholder:network/airspace_user',
        'Airlines/AU':                  'stakeholder:network/airspace_user',
        'CFSP':                         'stakeholder:network/airspace_user/cfsp',
        'CFSPs':                        'stakeholder:network/airspace_user/cfsp',
        'Military':                     'stakeholder:network/ansp/mil',
        'MIL':                          'stakeholder:network/ansp/mil',
        'MIL AU':                       'stakeholder:network/ansp/mil',
        'Military Operational Units':   'stakeholder:network/ansp/mil',
        'Military authorities':         'stakeholder:network/ansp/mil',
        'National Authority':           'stakeholder:network/national_european_authority',
        'NSA':                          'stakeholder:network/national_european_authority',
        'EASA':                         'stakeholder:network/national_european_authority',
        // Explicitly ignored
        'External Systems':             null,
        'External Users':               null,
        'EXT':                          null,
        'relevant ASM actors':          null,
        'local ASM actor':              null,
        'local ASM':                    null,
        'ATFCM actors':                 null,
        'All CDM stakeholders: FMPs':   null,
        'AMC. FMP':                     null,
        'System Developers (EAUP':      null,
        'ADP platforms)':               null,
    };

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Excel data to structured import format.
     * Processes the 19 sub-sheets defined in SHEET_TO_ON; all other sheets are ignored.
     *
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData
     */
    map(rawData) {
        console.log('AsmAtfcmMapper: Processing Edition 4 multi-sheet workbook');

        const rawOns = []; // ONs before deduplication, in sheet order
        const orMap = new Map(); // key: externalId → merged OR object

        // Pass 1: collect all ONs and ORs per sheet
        for (const sheet of (rawData.sheets || [])) {
            const sheetName = sheet.name.trim();
            const onDef = SHEET_TO_ON[sheetName];
            if (!onDef) continue; // main year sheets, OC sheets, unknowns

            console.log(`AsmAtfcmMapper: Processing sheet "${sheetName}" → ON ${onDef.wave}/${String(onDef.onCodeNum).padStart(2, '0')} "${onDef.onTitle}"`);

            const { on, ors } = this._processSheet(sheet, onDef);
            rawOns.push(on);

            // Merge ORs globally by externalId (wave-agnostic)
            for (const or of ors) {
                const key = or.externalId;
                if (!orMap.has(key)) {
                    orMap.set(key, { ...or });
                } else {
                    const existing = orMap.get(key);
                    for (const ref of (or.implementedONs || [])) {
                        if (!existing.implementedONs.includes(ref)) {
                            existing.implementedONs.push(ref);
                        }
                    }
                }
            }
        }

        // Pass 2: deduplicate ONs by externalId — duplicates get Part 1 / Part 2 suffixes
        // Build remapping table for use in OR implementedONs fixup
        const onIdCounts = new Map();
        for (const on of rawOns) {
            onIdCounts.set(on.externalId, (onIdCounts.get(on.externalId) || 0) + 1);
        }
        const onIdPartCounters = new Map();
        const onIdRemap = new Map(); // oldExternalId → [newExternalId, ...]
        const needs = [];
        for (const on of rawOns) {
            if (onIdCounts.get(on.externalId) > 1) {
                const part = (onIdPartCounters.get(on.externalId) || 0) + 1;
                onIdPartCounters.set(on.externalId, part);
                const suffix = part === 1 ? ' - Part 1' : ' - Part 2';
                const newTitle = on.title + suffix;
                const newExternalId = ExternalIdBuilder.buildExternalId(
                    { drg: 'ASM_ATFCM', title: newTitle },
                    'on'
                );
                console.log(`AsmAtfcmMapper: Duplicate ON renamed "${on.title}" → "${newTitle}"`);
                if (!onIdRemap.has(on.externalId)) onIdRemap.set(on.externalId, []);
                onIdRemap.get(on.externalId).push(newExternalId);
                needs.push({ ...on, title: newTitle, externalId: newExternalId });
            } else {
                needs.push(on);
            }
        }

        // Fix OR implementedONs: replace old externalIds with remapped ones
        for (const or of orMap.values()) {
            const fixed = [];
            for (const ref of (or.implementedONs || [])) {
                if (onIdRemap.has(ref)) {
                    for (const newId of onIdRemap.get(ref)) {
                        if (!fixed.includes(newId)) fixed.push(newId);
                    }
                } else {
                    if (!fixed.includes(ref)) fixed.push(ref);
                }
            }
            or.implementedONs = fixed;
        }

        // Pass 3: apply Delta conversion
        const convertedNeeds = needs.map(on => ({
            ...on,
            statement: this.converter.asciidocToDelta(on.statement),
            rationale: this.converter.asciidocToDelta(on.rationale),
            privateNotes: this.converter.asciidocToDelta(on.privateNotes),
        }));

        const requirements = [];
        for (const or of orMap.values()) {
            requirements.push({
                ...or,
                statement: this.converter.asciidocToDelta(or.statement),
                rationale: this.converter.asciidocToDelta(or.rationale),
                privateNotes: this.converter.asciidocToDelta(or.privateNotes),
            });
        }

        console.log(`AsmAtfcmMapper: Total — ${convertedNeeds.length} ONs, ${requirements.length} ORs`);

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: [],
            requirements: [...convertedNeeds, ...requirements],
            changes: [],
        };
    }

    // ─── Sheet processing ─────────────────────────────────────────────────────

    /**
     * Process one sub-sheet: build its ON and extract ORs for that ON.
     * @param {Object} sheet
     * @param {{ wave: string, onCodeNum: number, onTitle: string }} onDef
     * @returns {{ on: Object, ors: Array }}
     * @private
     */
    _processSheet(sheet, onDef) {
        const orStatementKey = this._resolveOrStatementColumn(sheet);
        const ors = [];
        const seenOrIds = new Set();
        let firstOnRow = null;

        for (const row of sheet.rows) {
            if (this._isHeaderRow(row)) continue;

            const rowCodeNum = this._normalizeCodeNumber(row['ON Code:']);
            if (rowCodeNum !== onDef.onCodeNum) continue; // belongs to a different ON

            if (!firstOnRow) firstOnRow = row;

            const orTitle = (row['OR Title:'] || '').trim();
            if (!orTitle) continue;

            ors.push({ _row: row, _orTitle: orTitle }); // defer OR building until ON externalId known
        }

        // Aggregate strategic documents across all matching rows
        const seenDocKeys = new Set();
        const strategicDocuments = [];
        for (const { _row } of ors) {
            const raw = (_row['Strategic Documents'] || _row['NSP SOs reference'] || '').trim();
            for (const doc of this._parseStrategicDocuments(raw)) {
                const key = doc.externalId + (doc.note || '');
                if (!seenDocKeys.has(key)) {
                    seenDocKeys.add(key);
                    strategicDocuments.push(doc);
                }
            }
        }

        const on = this._buildOn(onDef, firstOnRow, strategicDocuments);
        const builtOrs = [];
        for (const { _row, _orTitle } of ors) {
            const or = this._buildOr(onDef.wave, on.externalId, _orTitle, _row, orStatementKey);
            if (!or) continue;
            if (seenOrIds.has(or.externalId)) continue;
            seenOrIds.add(or.externalId);
            builtOrs.push(or);
        }

        console.log(`  → 1 ON, ${builtOrs.length} ORs`);
        return { on, ors: builtOrs };
    }

    // ─── ON building ──────────────────────────────────────────────────────────

    /**
     * Build ON object from the static sheet definition plus first matching row.
     * Identity and title come from SHEET_TO_ON; statement and rationale from the row.
     * @param {{ wave: string, onCodeNum: number, onTitle: string }} onDef
     * @param {Object|null} firstRow - First row matching the ON code (may be null)
     * @returns {Object}
     * @private
     */
    _buildOn(onDef, firstRow, strategicDocuments = []) {
        const { wave, onTitle } = onDef;
        const year = parseInt(wave, 10);

        const externalId = ExternalIdBuilder.buildExternalId(
            { drg: 'ASM_ATFCM', title: onTitle },
            'on'
        );

        const statement = firstRow ? (firstRow['ON Statement'] || '').trim() || null : null;
        const rationale = firstRow ? (firstRow['ON Rationale'] || '').trim() || null : null;

        return {
            externalId,
            type: 'ON',
            drg: 'ASM_ATFCM',
            title: onTitle,
            statement,
            rationale,
            maturity: 'ADVANCED',
            tentative: [year, year],
            privateNotes: null,
            strategicDocuments: strategicDocuments.length > 0 ? strategicDocuments : undefined,
        };
    }

    // ─── OR building ──────────────────────────────────────────────────────────

    /**
     * Build OR object from a row.
     * @param {string} wave
     * @param {string} onExternalId - Parent ON externalId
     * @param {string} orTitle
     * @param {Object} row
     * @param {string} orStatementKey - Resolved OR statement column name
     * @returns {Object|null}
     * @private
     */
    _buildOr(wave, onExternalId, orTitle, row, orStatementKey) {
        const externalId = ExternalIdBuilder.buildExternalId(
            { drg: 'ASM_ATFCM', title: orTitle },
            'or'
        );

        // Statement
        const baseStatement = (row[orStatementKey] || '').trim();
        const fitCriteria = (row['Fit Criteria: (keep it under the statement)'] || '').trim();
        let statement = null;
        if (baseStatement) {
            statement = baseStatement;
            if (this._isValidContent(fitCriteria)) {
                statement += '\n\n[.underline]#Fit Criteria#\n\n' + fitCriteria;
            }
        }

        // Rationale
        const baseRationale = (row['Rationale:'] || '').trim();
        const opRisks = (row['Opportunities and risks: (keep)'] || '').trim();
        let rationale = null;
        if (baseRationale) {
            rationale = baseRationale;
            if (this._isValidContent(opRisks)) {
                rationale += '\n\n[.underline]#Opportunities and Risks#\n\n' + opRisks;
            }
        }

        // Stakeholders
        const stakeholderResult = this._parseStakeholders(row['Stakeholders:'] || '');

        // Private notes
        let privateNotes = this._buildOrPrivateNotes(row, stakeholderResult.unmapped);

        const missingRationale = rationale === null;
        const maturity = missingRationale ? 'DRAFT' : 'ADVANCED';
        if (missingRationale) {
            const draftNote = '[Teams: rationale required for ODIP publication]';
            privateNotes = privateNotes
                ? draftNote + '\n\n' + privateNotes
                : draftNote;
        }

        return {
            externalId,
            type: 'OR',
            drg: 'ASM_ATFCM',
            title: orTitle,
            statement,
            rationale,
            maturity,
            privateNotes,
            implementedONs: [onExternalId],
            impactedStakeholders: stakeholderResult.refs,
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

        if (unmappedStakeholders.length > 0) {
            parts.push(`**Stakeholders (unmapped):** ${unmappedStakeholders.join(', ')}`);
        }

        const remark = (row['Remark'] || '').trim();
        if (this._isValidPrivateNote(remark)) parts.push(`**Remark:** ${remark}`);

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Parse the unified Strategic Documents / NSP SOs reference column.
     * Splits on commas and newlines, looks up each token in STRATEGIC_DOC_SYNONYM_MAP.
     * Unmapped tokens are warned and discarded (not added to privateNotes).
     * @param {string} text
     * @returns {Array<{ externalId: string, note?: string }>}
     * @private
     */
    _parseStrategicDocuments(text) {
        if (!this._isValidContent(text)) return [];

        const results = [];
        const seenIds = new Set();

        const tokens = text
            .split(/[,\n]/)
            .map(t => t.trim())
            .filter(Boolean);

        for (const token of tokens) {
            if (!(token in STRATEGIC_DOC_SYNONYM_MAP)) {
                console.warn(`AsmAtfcmMapper: Unmapped strategic document token "${token}"`);
                continue;
            }

            const mapping = STRATEGIC_DOC_SYNONYM_MAP[token];
            if (mapping === null) continue; // explicitly ignored

            const key = mapping.externalId + (mapping.note || '');
            if (seenIds.has(key)) continue;
            seenIds.add(key);

            results.push(mapping.note
                ? { externalId: mapping.externalId, note: mapping.note }
                : { externalId: mapping.externalId }
            );
        }

        return results;
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
     * Extract and normalize the numeric part of an ON Code string.
     * Returns null if not parseable or if it is a header literal.
     * e.g. 'ASM/ATFCM - ON - 01' → 1, 'ASM/ATFCM - ON -01' → 1
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
     * Check if a value is valid for inclusion (not empty or TBD).
     * @param {string} value
     * @returns {boolean}
     * @private
     */
    _isValidContent(value) {
        if (!value || value.trim() === '') return false;
        return value.trim().toUpperCase() !== 'TBD';
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