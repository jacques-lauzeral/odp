import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

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
 * - 'Need Statement' → statement
 * - 'Rationale' → rationale
 * - type: 'ON', drg: '4DT' (hardcoded)
 * - path: null (not exported)
 *
 * Sheet 2: "Operational Requirements" (ORs)
 * ------------------------------------------
 * - 'Title' → title (used for external ID generation)
 * - 'Detailed Requirement' → statement (base)
 * - 'Fit Criteria' → appended to statement as "Fit Criteria:" paragraph
 * - 'Rationale' → rationale (base)
 * - 'Opportunities/Risks' → appended to rationale as "Opportunities / Risks:" paragraph
 * - 'Operational Need' → implementedONs (resolved via normalized title match)
 * - type: 'OR', drg: '4DT' (hardcoded)
 * - path: null (not exported)
 *
 * External ID Format:
 * -------------------
 * - ON: on:4dt/{title_normalized}
 * - OR: or:4dt/{title_normalized}
 *
 * ON → OR Relationship:
 * ---------------------
 * - OR column 'Operational Need' contains ON title
 * - Matching uses normalized (trimmed, lowercase) title comparison
 * - Multiple ORs can implement the same ON
 *
 * IGNORED COLUMNS:
 * ----------------
 * The following columns are intentionally not imported:
 * - 'Date' / 'Originator'
 * - 'Source' / 'Source Reference'
 * - 'CONOPS Section'
 * - 'Stakeholders'
 * - 'Data (and other Enabler)'
 * - 'Impacted Services'
 * - 'Dependencies'
 */
class FourDTMapper extends Mapper {
    /**
     * Map raw extracted Excel data to structured import format
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('FourDTMapper: Processing raw data from Excel extraction');

        // Find the two sheets
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

        // Process ONs first to build the title → externalId map
        const onTitleMap = new Map(); // normalized_title → externalId
        const needs = this._processNeedsSheet(needsSheet, onTitleMap);

        // Process ORs and link to ONs
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

    /**
     * Find a sheet by name (case-insensitive)
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @param {string} sheetName - Sheet name to find
     * @returns {Object|null} Sheet object or null if not found
     * @private
     */
    _findSheet(rawData, sheetName) {
        const normalizedName = sheetName.toLowerCase();
        return (rawData.sheets || []).find(sheet =>
            sheet.name.toLowerCase() === normalizedName
        );
    }

    /**
     * Process "Operational Needs" sheet
     * @param {Object} sheet - Sheet object with rows
     * @param {Map} onTitleMap - Map to populate: normalized_title → externalId
     * @returns {Array} Array of ON objects
     * @private
     */
    _processNeedsSheet(sheet, onTitleMap) {
        const needs = [];

        for (const row of sheet.rows) {
            const need = this._extractNeed(row);
            if (need) {
                needs.push(need);

                // Store in map for OR linking
                const normalizedTitle = need.title.trim().toLowerCase();
                onTitleMap.set(normalizedTitle, need.externalId);
            }
        }

        return needs;
    }

    /**
     * Process "Operational Requirements" sheet
     * @param {Object} sheet - Sheet object with rows
     * @param {Map} onTitleMap - Map of normalized_title → externalId
     * @returns {Array} Array of OR objects
     * @private
     */
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

    /**
     * Extract ON (Operational Need) from row
     * @param {Object} row - Row object
     * @returns {Object|null} ON object or null if invalid
     * @private
     */
    _extractNeed(row) {
        const title = row['Title'];

        // Skip rows without title
        if (!title || title.trim() === '') {
            return null;
        }

        const statement = row['Need Statement']?.trim() || null;
        const rationale = row['Rationale']?.trim() || null;
        const privateNotes = this._extractNeedPrivateNotes(row);
        const documentReferences = this._extractNeedDocumentReferences(row);

        // Build object first
        const need = {
            type: 'ON',
            drg: '4DT',
            title: title.trim(),
            statement: statement,
            rationale: rationale,
            privateNotes: privateNotes,
            documentReferences: documentReferences
        };

        // Add external ID using the complete object
        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    /**
     * Extract private notes from ON row
     * Includes Originator and Source (non-CONOPS parts)
     * @param {Object} row - Row object
     * @returns {string|null} Private notes text
     * @private
     */
    _extractNeedPrivateNotes(row) {
        let privateNotes = '';

        // 1. Originator
        const originator = row['Originator']?.trim();
        if (originator) {
            privateNotes = `Originator: ${originator}`;
        }

        // 2. Source (only non-CONOPS parts)
        const source = row['Source']?.trim();
        if (source) {
            let sourcesText = source;

            if (source.includes('CONOPS')) {
                const conopsIndex = source.indexOf('CONOPS');
                const beforeConops = source.substring(0, conopsIndex).trim();
                sourcesText = beforeConops;
            }

            if (sourcesText) {
                if (privateNotes) privateNotes += '\n\n---\n\n';
                privateNotes += `Sources:\n\n${sourcesText}`;
            }
        }

        return privateNotes || null;
    }

    /**
     * Extract document references from ON row
     * Extracts CONOPS references from Source column
     * @param {Object} row - Row object
     * @returns {Array} Array of document reference objects
     * @private
     */
    _extractNeedDocumentReferences(row) {
        const documentReferences = [];

        const source = row['Source']?.trim();
        if (source && source.includes('CONOPS')) {
            const conopsIndex = source.indexOf('CONOPS');
            const afterConops = source.substring(conopsIndex + 6).trim(); // 'CONOPS'.length = 6

            if (afterConops) {
                documentReferences.push({
                    documentExternalId: "document:4d_trajectory_conops",
                    note: afterConops
                });
            }
        }

        return documentReferences.length > 0 ? documentReferences : [];
    }

    /**
     * Extract OR (Operational Requirement) from row
     * @param {Object} row - Row object
     * @param {Map} onTitleMap - Map of normalized ON titles to externalIds
     * @returns {Object|null} OR object or null if invalid
     * @private
     */
    _extractRequirement(row, onTitleMap) {
        const title = row['Title'];

        // Skip rows without title
        if (!title || title.trim() === '') {
            return null;
        }

        const statement = this._extractRequirementStatement(row);
        const rationale = this._extractRequirementRationale(row);
        const implementedONs = this._resolveImplementedONs(row, onTitleMap);

        // Build object first
        const requirement = {
            type: 'OR',
            drg: '4DT',
            title: title.trim(),
            statement: statement,
            rationale: rationale,
            implementedONs: implementedONs
        };

        // Add external ID using the complete object
        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');

        return requirement;
    }

    /**
     * Extract and compose statement from row
     * Appends Fit Criteria if present
     * @param {Object} row - Row object
     * @returns {string|null} Statement text
     * @private
     */
    _extractRequirementStatement(row) {
        const detailedRequirement = row['Detailed Requirement']?.trim();
        const fitCriteria = row['Fit Criteria']?.trim();

        if (!detailedRequirement && !fitCriteria) {
            return null;
        }

        let statement = detailedRequirement || '';

        // Append Fit Criteria if present
        if (fitCriteria) {
            if (statement) {
                statement += '\n\nFit Criteria:\n\n' + fitCriteria;
            } else {
                statement = 'Fit Criteria:\n\n' + fitCriteria;
            }
        }

        return statement || null;
    }

    /**
     * Extract and compose rationale from row
     * Appends Opportunities/Risks if present
     * @param {Object} row - Row object
     * @returns {string|null} Rationale text
     * @private
     */
    _extractRequirementRationale(row) {
        const rationale = row['Rationale']?.trim();
        const opportunitiesRisks = row['Opportunities/Risks']?.trim();

        if (!rationale && !opportunitiesRisks) {
            return null;
        }

        let result = rationale || '';

        // Append Opportunities/Risks if present
        if (opportunitiesRisks) {
            if (result) {
                result += '\n\nOpportunities / Risks:\n\n' + opportunitiesRisks;
            } else {
                result = 'Opportunities / Risks:\n\n' + opportunitiesRisks;
            }
        }

        return result || null;
    }

    /**
     * Resolve implementedONs by matching 'Operational Need' column to ON titles
     * @param {Object} row - Row object
     * @param {Map} onTitleMap - Map of normalized ON titles to externalIds
     * @returns {Array<string>} Array of ON externalIds (may be empty)
     * @private
     */
    _resolveImplementedONs(row, onTitleMap) {
        const operationalNeed = row['Operational Need']?.trim();

        if (!operationalNeed || operationalNeed === '') {
            return [];
        }

        const normalizedNeed = operationalNeed.toLowerCase();
        const onExternalId = onTitleMap.get(normalizedNeed);

        if (onExternalId) {
            return [onExternalId];
        } else {
            console.warn(`Unable to resolve ON reference: "${operationalNeed}" (OR: "${row['Title']}")`);
            return [];
        }
    }

    /**
     * Return empty output structure
     * @private
     */
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