import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for 4DT Excel documents
 * Transforms tabular sheet structure into ODP entities
 *
 * COLUMN INTERPRETATION:
 * ======================
 *
 * Sheet 1: "Operational Needs" (ONs)
 * -----------------------------------
 * - 'Title' → title (used for external ID generation)
 * - 'Date' → ignored
 * - 'Originator' → privateNotes as "Originator: {name}"
 * - 'Source' → split handling:
 *   - Text before 'CONOPS' → privateNotes as "Sources:\n\n{text}"
 *   - Text after 'CONOPS' → documentReferences note
 *   - If no 'CONOPS' → all text to privateNotes as "Sources:\n\n{text}"
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
 * - 'CONOPS Section' → beginning of documentReferences note
 * - 'Source Reference' → end of documentReferences note
 * - 'Detailed Requirement' → statement (base)
 * - 'Fit Criteria' → appended to statement as "Fit Criteria:" paragraph
 * - 'Rationale' → rationale (base)
 * - 'Opportunities/Risks' → appended to rationale as "Opportunities / Risks:" paragraph
 * - 'Operational Need' → implementedONs (resolved via normalized title match)
 * - 'Stakeholders' → impactsStakeholderCategories (parsed and mapped via synonym map)
 * - 'Data (and other Enabler)' → privateNotes as "Data (and other Enabler):\n\n{text}"
 * - 'Impacted Services' → privateNotes as "Impacted Services:\n\n{text}"
 * - 'Dependencies' → ignored (always empty)
 * - type: 'OR', drg: '4DT' (hardcoded)
 * - path: null (not exported)
 *
 * External ID Format:
 * -------------------
 * - ON: on:4dt/{title_normalized}
 * - OR: or:4dt/{title_normalized}
 *
 * Document References:
 * --------------------
 * - ON: document:4d_trajectory_conops (if Source contains 'CONOPS')
 * - OR: document:4d_trajectory_conops (if CONOPS Section or Source Reference present)
 *
 * Stakeholder Mapping:
 * --------------------
 * Excel values mapped to external IDs via STAKEHOLDER_SYNONYM_MAP:
 * - 'AU' → stakeholder:network/airspace_user
 * - 'CFSP' → stakeholder:network/airspace_user/cfsp
 * - 'NM' → stakeholder:network/nm
 * - 'ANSP' / 'ANSPs' → stakeholder:network/ansp
 * - 'CIV or MIL ANSP' → stakeholder:network/ansp (ignoring CIV/MIL qualifier)
 * - Comma and slash delimiters handled (',', '/')
 *
 * ON → OR Relationship:
 * ---------------------
 * - OR column 'Operational Need' contains ON title
 * - Matching uses normalized (trimmed, lowercase) title comparison
 * - Multiple ORs can implement the same ON
 */
class FourDTMapper extends Mapper {
    /**
     * Map of stakeholder synonyms to external IDs
     * Keys: variations found in Excel (including plural forms)
     * Values: external IDs in the ODP system
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        'AU': 'stakeholder:network/airspace_user',
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

        const onTitleMap = new Map();
        const needs = this._processNeedsSheet(needsSheet, onTitleMap);
        const requirements = this._processRequirementsSheet(requirementsSheet, onTitleMap);

        console.log(`Mapped ${needs.length} operational needs (ONs) and ${requirements.length} operational requirements (ORs)`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
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

    _processNeedsSheet(sheet, onTitleMap) {
        const needs = [];

        for (const row of sheet.rows) {
            const need = this._extractNeed(row);
            if (need) {
                needs.push(need);
                const normalizedTitle = need.title.trim().toLowerCase();
                onTitleMap.set(normalizedTitle, need.externalId);
            }
        }

        return needs;
    }

    _processRequirementsSheet(sheet, onTitleMap) {
        const requirements = [];

        for (const row of sheet.rows) {
            const requirement = this._extractRequirement(row, onTitleMap);
            if (requirement) {
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

        const statement = row['Need Statement'] || null;
        const rationale = row['Rationale'] || null;
        const privateNotes = this._extractNeedPrivateNotes(row);
        const documentReferences = this._extractNeedDocumentReferences(row);

        const need = {
            type: 'ON',
            drg: '4DT',
            title: title.trim(),
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            privateNotes: this.converter.asciidocToDelta(privateNotes),
            documentReferences: documentReferences
        };

        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    _extractNeedPrivateNotes(row) {
        let privateNotes = '';

        const originator = row['Originator'];
        const originatorText = originator ? originator.trim() : '';
        if (originatorText) {
            privateNotes = `Originator: ${originatorText}`;
        }

        const source = row['Source'];
        const sourceText = source ? source.trim() : '';
        if (sourceText) {
            let sourcesText = sourceText;

            if (sourceText.includes('CONOPS')) {
                const conopsIndex = sourceText.indexOf('CONOPS');
                const beforeConops = sourceText.substring(0, conopsIndex).trim();
                sourcesText = beforeConops;
            }

            if (sourcesText) {
                if (privateNotes) privateNotes += '\n\n---\n\n';
                privateNotes += `Sources:\n\n${sourcesText}`;
            }
        }

        return privateNotes || null;
    }

    _extractNeedDocumentReferences(row) {
        const documentReferences = [];

        const source = row['Source'];
        const sourceText = source ? source.trim() : '';
        if (sourceText && sourceText.includes('CONOPS')) {
            const conopsIndex = sourceText.indexOf('CONOPS');
            const afterConops = sourceText.substring(conopsIndex + 6).trim();

            if (afterConops) {
                documentReferences.push({
                    documentExternalId: "document:4d_trajectory_conops",
                    note: afterConops
                });
            }
        }

        return documentReferences.length > 0 ? documentReferences : [];
    }

    _extractRequirement(row, onTitleMap) {
        const title = row['Title'];

        if (!title || title.trim() === '') {
            return null;
        }

        const statement = this._extractRequirementStatement(row);
        const rationale = this._extractRequirementRationale(row);
        const privateNotes = this._extractRequirementPrivateNotes(row);
        const documentReferences = this._extractRequirementDocumentReferences(row);
        const implementedONs = this._resolveImplementedONs(row, onTitleMap);
        const impactsStakeholderCategories = this._parseStakeholders(row['Stakeholders']);

        const requirement = {
            type: 'OR',
            drg: '4DT',
            title: title.trim(),
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            privateNotes: this.converter.asciidocToDelta(privateNotes),
            documentReferences: documentReferences,
            implementedONs: implementedONs,
            impactsStakeholderCategories: impactsStakeholderCategories
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
                result += '\n\n**FOpportunities / Risks:**\n\n' + opportunitiesRisks.trim();
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

    _extractRequirementDocumentReferences(row) {
        const conopsSection = row['CONOPS Section'];
        const sourceReference = row['Source Reference'];

        const conopsSectionText = conopsSection ? conopsSection.trim() : '';
        const sourceRefText = sourceReference ? sourceReference.trim() : '';

        if (!conopsSectionText && !sourceRefText) {
            return [];
        }

        let note = '';

        if (conopsSectionText && sourceRefText) {
            note = `${conopsSectionText}. ${sourceRefText}`;
        } else if (conopsSectionText) {
            note = conopsSectionText;
        } else {
            note = sourceRefText;
        }

        return [{
            documentExternalId: "document:4d_trajectory_conops",
            note: note
        }];
    }

    _resolveImplementedONs(row, onTitleMap) {
        const operationalNeed = row['Operational Need'];
        const operationalNeedText = operationalNeed ? operationalNeed.trim() : '';

        if (!operationalNeedText || operationalNeedText === '') {
            return [];
        }

        const normalizedNeed = operationalNeedText.toLowerCase();
        const onExternalId = onTitleMap.get(normalizedNeed);

        if (onExternalId) {
            return [onExternalId];
        } else {
            const rowTitle = row['Title'] || '';
            console.warn(`Unable to resolve ON reference: "${operationalNeedText}" (OR: "${rowTitle}")`);
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

    _emptyOutput() {
        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: [],
            changes: []
        };
    }
}

export default FourDTMapper;