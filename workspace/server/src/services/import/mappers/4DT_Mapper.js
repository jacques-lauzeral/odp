import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for 4DT Excel documents
 * Transforms tabular sheet structure into ODIP entities
 *
 * COLUMN INTERPRETATION:
 * ======================
 *
 * Sheet 1: "Operational Needs" (ONs)
 * -----------------------------------
 * - 'ON Reference' → used as key for ON→OR linking (e.g. '4DT01')
 * - 'Title' → title (used for external ID generation)
 * - 'Maturity' → maturity (see MATURITY MAPPING below)
 * - 'Timeline' → tentative: "YYYY" → [YYYY, YYYY]
 * - 'Date' → ignored
 * - 'Originator' → privateNotes as "Originator: {name}"
 * - 'Source' → comma-separated tokens; resolved via REFERENCE_DOC_MAP:
 *   - /^4DT CONOPS\s+(.+)/i → refdoc:network_4d_trajectory_conops; note =
 *     captured section(s), whitespace-normalised; multiple CONOPS tokens
 *     join their notes with ', ' into a single strategicDocuments entry
 *   - /^NSP SO (\d+)\/(\d+)$/i → refdoc:nsp_so_{n}_{m}
 *   - /^ATMMP SDO (\d+)$/i → ExternalIdBuilder refdoc normalisation
 *   - /^IR2021\/116\s+(.+)$/i → refdoc:commission_implementing_regulation_(eu)_2021_116,
 *     note = trailing token (e.g. "AF 4/6")
 *   - Unresolved tokens → _warn + privateNotes as "Sources:" section
 * - 'Need Statement' → statement
 * - 'Rationale' → rationale
 * - type: 'ON', drg: '4DT' (hardcoded)
 * - path: null (not exported)
 *
 * Sheet 2: "Operational Requirements" (ORs)
 * ------------------------------------------
 * - 'Title' → title (used for external ID generation)
 * - 'Date' → ignored
 * - 'Originator' → privateNotes as "Originator: {name}"
 * - 'CONOPS Section' → appended to privateNotes as "CONOPS Section: {text}"
 * - 'Source Reference' → appended to privateNotes as "Source Reference: {text}"
 * - 'ON Reference' → implementedONs (resolved via ON Reference code match, e.g. '4DT01')
 * - 'Operational Need' → ignored
 * - 'Detailed Requirement' → statement (base)
 * - 'Fit Criteria' → appended to statement as "Fit Criteria:" paragraph
 * - 'Rationale' → rationale (base)
 * - 'Opportunities/Risks' → appended to rationale as "Opportunities / Risks:" paragraph
 * - 'Stakeholders' → impactedStakeholders (parsed and mapped via synonym map)
 * - 'Data (and other Enabler)' → privateNotes as "Data (and other Enabler):\n\n{text}"
 * - 'Impacted Services' → privateNotes as "Impacted Services:\n\n{text}"
 * - 'Dependencies' → ignored (always empty)
 * - type: 'OR', drg: '4DT' (hardcoded)
 * - path: null (not exported)
 *
 * MATURITY MAPPING:
 * -----------------
 * 'Defined'  → 'DRAFT'
 * 'Advanced' → 'ADVANCED'
 * 'Mature'   → 'MATURE'
 * Unknown values → _warn + omitted (field not set)
 *
 * External ID Format:
 * -------------------
 * - ON: on:4dt/{title_normalized}
 * - OR: or:4dt/{title_normalized}
 *
 * Strategic Documents (ONs only):
 * --------------------
 * Source tokens resolved via REFERENCE_DOC_MAP (see above).
 * Multiple CONOPS tokens → single entry, notes joined with ', '.
 * NSP SO, ATMMP SDO, IR2021/116 → individual entries.
 * Unresolved tokens → privateNotes "Sources:" section + _warn.
 *
 * Stakeholder Mapping:
 * --------------------
 * Excel values mapped to external IDs via STAKEHOLDER_SYNONYM_MAP:
 * - 'AU' → stakeholder:network/airspace_user
 * - 'CIV AU' → stakeholder:network/airspace_user/ao_civ
 * - 'CFSP' → stakeholder:network/airspace_user/cfsp
 * - 'NM' → stakeholder:network/nm
 * - 'ANSP' / 'ANSPs' → stakeholder:network/ansp
 * - 'CIV or MIL ANSP' → stakeholder:network/ansp (ignoring CIV/MIL qualifier)
 * - Comma and slash delimiters handled (',', '/')
 *
 * ON → OR Relationship:
 * ---------------------
 * - OR column 'ON Reference' contains the ON reference code (e.g. '4DT01')
 * - Matching is direct string lookup against the ON reference code
 * - Multiple ORs can implement the same ON
 *
 * Title Deconfliction:
 * --------------------
 * - Applied independently per sheet (ONs and ORs separately)
 * - If multiple rows share the same title, each is suffixed with a 1-based counter: '{title} (1)', '{title} (2)', etc.
 * - Suffix order follows row order in the sheet
 * - Unique titles are left unchanged
 * - External IDs are rebuilt after suffixing, so they reflect the deconflicted title
 */

// ---------------------------------------------------------------------------
// Maturity mapping
// ---------------------------------------------------------------------------
const MATURITY_MAP = {
    'Defined': 'DRAFT',
    'Advanced': 'ADVANCED',
    'Mature': 'MATURE'
};

// ---------------------------------------------------------------------------
// Known refdoc externalIds
// ---------------------------------------------------------------------------
const CONOPS_EXTERNAL_ID = 'refdoc:network_4d_trajectory_conops';
const IR_EXTERNAL_ID = 'refdoc:commission_implementing_regulation_(eu)_2021_116';

class FourDTMapper extends Mapper {
    /**
     * Map of stakeholder synonyms to external IDs
     * Keys: variations found in Excel (including plural forms)
     * Values: external IDs in the ODIP system
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        'AU': 'stakeholder:network/airspace_user',
        'CIV AU': 'stakeholder:network/airspace_user/ao_civ',
        'CFSP': 'stakeholder:network/airspace_user/cfsp',
        'NM': 'stakeholder:network/nm',
        'ANSP': 'stakeholder:network/ansp',
        'ANSPs': 'stakeholder:network/ansp'
        // Note: 'CIV or MIL ANSP' handled by removing 'CIV or MIL' prefix
    };

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    map(rawData) {
        console.log('FourDTMapper: Processing raw data from Excel extraction');

        const needsSheet = this._findSheet(rawData, 'Operational Needs');
        const requirementsSheet = this._findSheet(rawData, 'Operational Requirements');

        if (!needsSheet) {
            console.warn('WARNING: "Operational Needs" sheet not found in Excel workbook');
            return this._emptyOutput();
        }

        if (!requirementsSheet) {
            console.warn('WARNING: "Operational Requirements" sheet not found in Excel workbook');
            return this._emptyOutput();
        }

        console.log(`Found Operational Needs sheet with ${needsSheet.rows.length} rows`);
        console.log(`Found Operational Requirements sheet with ${requirementsSheet.rows.length} rows`);

        const onReferenceMap = new Map();
        const needs = this._processNeedsSheet(needsSheet, onReferenceMap);
        const requirements = this._processRequirementsSheet(requirementsSheet, onReferenceMap);

        console.log(`Mapped ${needs.length} operational needs (ONs) and ${requirements.length} operational requirements (ORs)`);

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: [],
            requirements: [...needs, ...requirements],
            changes: []
        };
    }

    _findSheet(rawData, sheetName) {
        const normalizedName = sheetName.toLowerCase();
        return (rawData.sheets || []).find(sheet =>
            sheet.name.toLowerCase() === normalizedName
        );
    }

    _processNeedsSheet(sheet, onReferenceMap) {
        const needs = [];

        const titleCounts = new Map();
        for (const row of sheet.rows) {
            const title = row['Title'] ? row['Title'].trim() : null;
            if (title) titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
        }
        const titleCounters = new Map();

        for (const row of sheet.rows) {
            const need = this._extractNeed(row);
            if (need) {
                const baseTitle = need.title;
                if (titleCounts.get(baseTitle) > 1) {
                    const index = (titleCounters.get(baseTitle) || 0) + 1;
                    titleCounters.set(baseTitle, index);
                    need.title = `${baseTitle} (${index})`;
                    need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');
                }
                needs.push(need);
                const onReference = row['ON Reference'] ? row['ON Reference'].trim() : null;
                if (onReference) {
                    onReferenceMap.set(onReference, need.externalId);
                }
            }
        }

        return needs;
    }

    _processRequirementsSheet(sheet, onReferenceMap) {
        const requirements = [];

        const titleCounts = new Map();
        for (const row of sheet.rows) {
            const title = row['Title'] ? row['Title'].trim() : null;
            if (title) titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
        }
        const titleCounters = new Map();

        for (const row of sheet.rows) {
            const requirement = this._extractRequirement(row, onReferenceMap);
            if (requirement) {
                const baseTitle = requirement.title;
                if (titleCounts.get(baseTitle) > 1) {
                    const index = (titleCounters.get(baseTitle) || 0) + 1;
                    titleCounters.set(baseTitle, index);
                    requirement.title = `${baseTitle} (${index})`;
                    requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');
                }
                requirements.push(requirement);
            }
        }

        return requirements;
    }

    _extractNeed(row) {
        const title = row['Title'];

        if (!title || title.trim() === '') {
            return null;
        }

        // Drop organisational/header rows that carry no substantive content
        const hasContent = row['Need Statement'] || row['Rationale'] || row['Maturity'] || row['Timeline'];
        if (!hasContent) {
            return null;
        }

        const statement = row['Need Statement'] || null;
        const rationale = row['Rationale'] || null;
        const { strategicDocuments, unresolvedRefs } = this._parseSourceField(row);
        const privateNotes = this._extractNeedPrivateNotes(row, unresolvedRefs);
        const maturity = this._parseMaturity(row['Maturity'], title.trim());
        const tentative = this._parseTentative(row['Timeline'], title.trim());

        const need = {
            type: 'ON',
            drg: '4DT',
            title: title.trim(),
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            privateNotes: this.converter.asciidocToDelta(privateNotes),
            strategicDocuments: strategicDocuments
        };

        if (maturity) need.maturity = maturity;
        if (tentative) need.tentative = tentative;

        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    /**
     * Parse the Source field into strategicDocuments and unresolved refs.
     * Splits by comma, resolves each token via REFERENCE_DOC_MAP rules:
     *   - /^4DT CONOPS\s+(.+)/i → CONOPS_EXTERNAL_ID; notes accumulated and
     *     joined with ', ' into a single strategicDocuments entry
     *   - /^NSP SO (\d+)\/(\d+)$/i → refdoc:nsp_so_{n}_{m}
     *   - /^ATMMP SDO (\d+)$/i → ExternalIdBuilder normalisation
     *   - /^IR2021\/116\s+(.+)$/i → IR_EXTERNAL_ID, note = trailing token
     *   - Unresolved → warn + unresolvedRefs (caller appends to privateNotes)
     * @param {Object} row
     * @returns {{ strategicDocuments: Array, unresolvedRefs: string[] }}
     * @private
     */
    _parseSourceField(row) {
        const source = row['Source'];
        const sourceText = source ? source.trim() : '';

        if (!sourceText) {
            return { strategicDocuments: [], unresolvedRefs: [] };
        }

        const tokens = sourceText.split(',').map(t => t.trim()).filter(t => t);

        // notesMap: externalId → string[] of notes (merged at end)
        const notesMap = new Map();
        const unresolvedRefs = [];

        const addEntry = (externalId, note) => {
            if (!notesMap.has(externalId)) notesMap.set(externalId, []);
            if (note) notesMap.get(externalId).push(note);
        };

        for (const token of tokens) {
            // 4DT CONOPS — section(s) form the note as-is (whitespace normalised)
            const conopsMatch = token.match(/^4DT CONOPS\s+(.+)/i);
            if (conopsMatch) {
                addEntry(CONOPS_EXTERNAL_ID, conopsMatch[1].replace(/\s+/g, ' ').trim());
                continue;
            }

            // NSP SO N/M → refdoc:nsp_so_n_m
            const nspMatch = token.match(/^NSP SO (\d+)\/(\d+)$/i);
            if (nspMatch) {
                addEntry(`refdoc:nsp_so_${nspMatch[1]}_${nspMatch[2]}`, null);
                continue;
            }

            // ATMMP SDO N → ExternalIdBuilder normalisation
            const atmmpMatch = token.match(/^ATMMP SDO (\d+)$/i);
            if (atmmpMatch) {
                addEntry(ExternalIdBuilder.buildExternalId({ name: `ATMMP SDO ${atmmpMatch[1]}` }, 'refdoc'), null);
                continue;
            }

            // IR2021/116 <note>
            const irMatch = token.match(/^IR2021\/116\s+(.+)$/i);
            if (irMatch) {
                addEntry(IR_EXTERNAL_ID, irMatch[1].trim());
                continue;
            }

            // Unresolved
            console.warn(`FourDTMapper: Unresolved source reference: "${token}"`);
            unresolvedRefs.push(token);
        }

        // Build strategicDocuments — one entry per externalId; CONOPS notes joined with ', '
        const strategicDocuments = [];
        for (const [externalId, notes] of notesMap.entries()) {
            const entry = { externalId };
            if (notes.length > 0) entry.note = notes.join(', ');
            strategicDocuments.push(entry);
        }

        return { strategicDocuments, unresolvedRefs };
    }

    _extractNeedPrivateNotes(row, unresolvedRefs) {
        const parts = [];

        const originator = row['Originator'];
        const originatorText = originator ? originator.trim() : '';
        if (originatorText) {
            parts.push(`Originator: ${originatorText}`);
        }

        if (unresolvedRefs.length > 0) {
            parts.push(`Sources:\n\n${unresolvedRefs.join(', ')}`);
        }

        return parts.length > 0 ? parts.join('\n\n---\n\n') : null;
    }

    _extractRequirement(row, onReferenceMap) {
        const title = row['Title'];

        if (!title || title.trim() === '') {
            return null;
        }

        const statement = this._extractRequirementStatement(row);
        const rationale = this._extractRequirementRationale(row);
        const privateNotes = this._extractRequirementPrivateNotes(row);
        const implementedONs = this._resolveImplementedONs(row, onReferenceMap);
        const impactedStakeholders = this._parseStakeholders(row['Stakeholders']);

        const requirement = {
            type: 'OR',
            drg: '4DT',
            title: title.trim(),
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            privateNotes: this.converter.asciidocToDelta(privateNotes),
            implementedONs: implementedONs,
            impactedStakeholders: impactedStakeholders
        };

        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');

        return requirement;
    }

    _extractRequirementStatement(row) {
        const detailedRequirement = row['Detailed Requirement'];
        const fitCriteria = row['Fit Criteria'];

        const detailedReqText = detailedRequirement ? detailedRequirement.trim() : '';
        const fitCriteriaText = fitCriteria ? fitCriteria.trim() : '';

        if (!detailedReqText && !fitCriteriaText) {
            return null;
        }

        let statement = '';

        if (detailedReqText) {
            statement = detailedRequirement.trim();
        }

        if (fitCriteriaText) {
            if (statement) {
                statement += '\n\n**Fit Criteria:**\n\n' + fitCriteria.trim();
            } else {
                statement = '**Fit Criteria:**\n\n' + fitCriteria.trim();
            }
        }

        return statement || null;
    }

    _extractRequirementRationale(row) {
        const rationale = row['Rationale'];
        const opportunitiesRisks = row['Opportunities/Risks'];

        const rationaleText = rationale ? rationale.trim() : '';
        const oppRisksText = opportunitiesRisks ? opportunitiesRisks.trim() : '';

        if (!rationaleText && !oppRisksText) {
            return null;
        }

        let result = '';

        if (rationaleText) {
            result = rationale.trim();
        }

        if (oppRisksText) {
            if (result) {
                result += '\n\n**Opportunities / Risks:**\n\n' + opportunitiesRisks.trim();
            } else {
                result = '**Opportunities / Risks:**\n\n' + opportunitiesRisks.trim();
            }
        }

        return result || null;
    }

    _extractRequirementPrivateNotes(row) {
        const originator = row['Originator'];
        const originatorText = originator ? originator.trim() : '';

        if (originatorText) {
            return `**Originator:** ${originatorText}`;
        }

        return null;
    }

    _resolveImplementedONs(row, onReferenceMap) {
        const onReference = row['ON Reference'];
        const onReferenceText = onReference ? onReference.trim() : '';

        if (!onReferenceText) {
            return [];
        }

        const onExternalId = onReferenceMap.get(onReferenceText);

        if (onExternalId) {
            return [onExternalId];
        } else {
            const rowTitle = row['Title'] || '';
            console.warn(`Unable to resolve ON reference: "${onReferenceText}" (OR: "${rowTitle}")`);
            return [];
        }
    }

    /**
     * Parse stakeholders column and map to reference objects
     * @param {string} stakeholdersText - Comma-separated stakeholder text from Excel (plain text)
     * @returns {Array<{externalId: string}>} Array of unique stakeholder references
     * @private
     */
    _parseStakeholders(stakeholdersText) {
        if (!stakeholdersText) {
            return [];
        }

        const trimmedText = stakeholdersText.trim();
        if (trimmedText === '') {
            return [];
        }

        const stakeholderRefs = [];
        const seenIds = new Set();  // Track duplicates

        // Split by comma and slash
        const tokens = trimmedText.split(/[,/]/).map(t => t.trim()).filter(t => t);

        for (let token of tokens) {
            // Handle "CIV or MIL ANSP" by removing the prefix
            if (token.includes('CIV or MIL')) {
                token = token.replace(/CIV or MIL\s*/i, '').trim();
            }

            const externalId = FourDTMapper.STAKEHOLDER_SYNONYM_MAP[token];

            if (externalId) {
                // Avoid duplicates
                if (!seenIds.has(externalId)) {
                    stakeholderRefs.push({ externalId });
                    seenIds.add(externalId);
                }
            } else {
                console.warn(`Unknown stakeholder token: "${token}" in text: "${trimmedText}"`);
            }
        }

        return stakeholderRefs;
    }

    /**
     * Map Excel maturity value to ODIP maturity level.
     * @param {string} value
     * @param {string} title - ON title for warning context
     * @returns {string|null}
     * @private
     */
    _parseMaturity(value, title) {
        if (!value || value.trim() === '') return null;
        const text = value.trim();
        const mapped = MATURITY_MAP[text];
        if (!mapped) {
            console.warn(`WARNING: Unknown maturity value "${text}" on ON: "${title}" — field omitted`);
            return null;
        }
        return mapped;
    }

    /**
     * Parse tentative year from Timeline column.
     * Accepts: "YYYY" → [YYYY, YYYY]
     * @param {string} value
     * @param {string} title - ON title for warning context
     * @returns {Array|null}
     * @private
     */
    _parseTentative(value, title) {
        if (!value || value.trim() === '') return null;
        const text = value.trim();
        const match = text.match(/^(20\d{2})$/);
        if (match) {
            const year = parseInt(match[1], 10);
            return [year, year];
        }
        console.warn(`WARNING: Cannot parse Timeline value "${text}" on ON: "${title}" — tentative omitted`);
        return null;
    }

    _emptyOutput() {
        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: [],
            requirements: [],
            changes: []
        };
    }
}

export default FourDTMapper;