import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';
import { MilestoneEventKeys } from '../../../../../shared/src/model/milestone-events.js';

/**
 * Mapper for ASM_ATFCM Excel documents
 * Transforms tabular sheet structure into ODP entities
 *
 * COLUMN INTERPRETATION:
 * ======================
 *
 * ON (Operational Need) Extraction (from "ON OR OC" sheet):
 * ---------------------------------
 * - '#' → internal tracking only, not used in external ID
 * - 'ON Title:' → title (used for external ID generation and grouping)
 * - 'ON Statement' → statement (aggregated if multiple distinct values)
 * - 'ON Rationale' → rationale (aggregated if multiple distinct values)
 * - 'Assigned to' → privateNotes
 * - 'Step' → path[0] (first element of hierarchical path)
 * - 'CONOPS Improvement reference' → path[1] (second element of hierarchical path)
 * - type: 'ON', drg: 'ASM_ATFCM' (hardcoded)
 *
 * OR (Operational Requirement) Extraction (from "ON OR OC" sheet):
 * ----------------------------------------
 * - '#' → row number (included in OR privateNotes)
 * - 'OR Title:' → title (used for external ID generation)
 * - 'Detailed requirement:\r\nStatement' → statement (base)
 * - 'Fit Criteria: (keep it under the statement)' → appended to statement if not empty/TBD
 * - 'Rationale:' → rationale (base)
 * - 'Opportunities & Risks:\r\n(keep)' → appended to rationale if not empty/TBD
 * - 'ON Title:' → implementedONs (resolved via ON title map)
 * - 'Step' → path[0] (first element of hierarchical path)
 * - 'CONOPS Improvement reference' → path[1] (second element of hierarchical path)
 * - 'Stakeholders:' → impactsStakeholderCategories (parsed via synonym map)
 * - 'INM Roadmap reference (code)' → documentReferences (document:inm-roadmap with column value as note)
 * - 'Originator:' → privateNotes
 * - 'OR Code' → privateNotes
 * - 'Dependencies:' → privateNotes
 * - 'Priority (Implementing Year)' → privateNotes
 * - 'Data (and other Enablers):' → privateNotes (raw value, skipped if TBD/N/A/empty)
 * - 'Impacted Services:' → privateNotes (raw value, skipped if TBD/N/A/empty)
 * - 'Remark' → privateNotes
 * - type: 'OR', drg: 'ASM_ATFCM' (hardcoded)
 *
 * OC (Operational Change) Extraction (from "OCs for 2027" sheet):
 * -----------------------------------
 * - 'Number/Code' → externalId (direct use)
 * - 'Title' → title
 * - 'Purpose' → purpose (rich text)
 * - 'Initial State' → initialState (rich text)
 * - 'Final State' → finalState (rich text)
 * - 'Details' → details (rich text)
 * - 'Satisfied Ors' → satisfiedORs (semicolon-delimited list)
 * - 'Superseded Ors' → supersededORs (semicolon-delimited, "N/A" → empty array)
 * - 'Additional documents' → documentReferences (line-delimited → document references)
 * - 'Milestones' → milestones (single milestone: title='M1', wave='wave:2027', eventTypes=[parsed values])
 * - 'Remarks' → privateNotes (combined with other fields)
 * - 'Dependences' → privateNotes (appended as Dependencies section)
 * - 'Cost assessment' → privateNotes (appended as Cost Assessment section)
 * - 'Pirotity' → privateNotes (appended as Priority section)
 * - drg: 'ASM_ATFCM', visibility: 'NETWORK' (hardcoded)
 *
 * ON Private Notes (from "ON OR OC" sheet):
 * -----------------
 * - 'Assigned to' → privateNotes
 *
 * OR Private Notes Format (from "ON OR OC" sheet):
 * ------------------------
 * # [value]
 *
 * Originator: [value]
 *
 * OR Code: [value]
 *
 * Dependencies: [value]
 *
 * Priority (Implementing Year): [value]
 *
 * Data (and other Enablers): [value]
 *
 * Impacted Services: [value]
 *
 * Stakeholders (unmapped): [comma-separated list of unmapped stakeholder names]
 *
 * Remark: [value]
 *
 * (empty fields and TBD/N/A values are skipped)
 *
 * OC Private Notes Format (from "OCs for 2027" sheet):
 * ------------------------
 * Number/Code: [value]
 *
 * Remarks: [value]
 *
 * Dependencies: [value]
 *
 * Cost Assessment: [value]
 *
 * Priority: [value]
 *
 * (empty fields and N/A values are skipped)
 *
 * External ID Format:
 * -------------------
 * - ON: on:asm_atfcm/{title_normalized}
 * - OR: or:asm_atfcm/{title_normalized}
 * - OC: {Number/Code value} (used directly from Excel)
 *
 * Path:
 * -----
 * - ONs: path = [Step, CONOPS Improvement reference] (both optional, hierarchical grouping)
 * - ORs: path = [Step, CONOPS Improvement reference] (both optional, hierarchical grouping)
 * - OCs: no path attribute (OCs don't support hierarchy)
 *
 * IGNORED COLUMNS (from "ON OR OC" sheet):
 * ----------------
 * The following columns are intentionally not imported:
 * - 'Origin' - redundant with document reference
 * - 'Date:' - not relevant for structured data
 * - 'ON reference:' - redundant with ON Title
 * - 'Step' - no longer used for OC generation
 * - 'Operational Change (Code)' - always empty in source data
 *
 * IGNORED COLUMNS (from "OCs for 2027" sheet):
 * ----------------
 * - 'Cost assessment' - captured in privateNotes
 * - 'Pirotity' - captured in privateNotes
 *
 * RELATIONSHIPS:
 * --------------
 * - ON → OR: One-to-many (ON.externalId stored in OR.implementedONs)
 * - OC → OR: One-to-many (OR.externalId stored in OC.satisfiedORs)
 */
class AsmAtfcmMapper extends Mapper {

    /**
     * Map of stakeholder synonyms to external IDs
     * Keys: variations found in ASM_ATFCM Excel (case-sensitive)
     * Values: external IDs matching setup.json stakeholder categories
     *
     * Special values:
     * - null: explicitly ignored tokens (e.g., 'External Systems')
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        // Network Manager variations
        'NM': 'stakeholder:network/nm',
        'NMOC': 'stakeholder:network/nm/nmoc',
        'Network Manager': 'stakeholder:network/nm',
        'NM B2B Office': 'stakeholder:network/nm',
        'Network Manager Operations Centre': 'stakeholder:network/nm/nmoc',

        // Weather Operations Centre
        'WOC': 'stakeholder:network/nm/woc',
        'WOCs': 'stakeholder:network/nm/woc',

        // ANSP variations
        'ANSP': 'stakeholder:network/ansp',
        'ANSPs': 'stakeholder:network/ansp',
        'ANSPs MIL': 'stakeholder:network/ansp',  // ANSPs including Military

        // Flow Management Position
        'FMP': 'stakeholder:network/ansp/fmp',
        'FMPs': 'stakeholder:network/ansp/fmp',
        'FM': 'stakeholder:network/ansp/fmp',  // Abbreviation for Flow Management
        'Local FMPs': 'stakeholder:network/ansp/fmp',
        'Local FMP': 'stakeholder:network/ansp/fmp',
        'Flow Management Positions': 'stakeholder:network/ansp/fmp',

        // Airspace Management Cell
        'AMC': 'stakeholder:network/ansp/amc',
        'AMCs': 'stakeholder:network/ansp/amc',
        'Local AMCs': 'stakeholder:network/ansp/amc',
        'local AMCs': 'stakeholder:network/ansp/amc',  // lowercase variant
        'Local AMC': 'stakeholder:network/ansp/amc',
        'Airspace Management Cells': 'stakeholder:network/ansp/amc',

        // Air Traffic Control
        'ATC Unit': 'stakeholder:network/ansp/atc_unit',
        'ATC Units': 'stakeholder:network/ansp/atc_unit',
        'Air Traffic Control Units': 'stakeholder:network/ansp/atc_unit',
        'Civil/Military ATC Units': 'stakeholder:network/ansp/atc_unit',
        'Civil, Military ATC Units': 'stakeholder:network/ansp/atc_unit',  // Fallback for comma variant

        // Air Traffic Service
        'ATSUs': 'stakeholder:network/ansp/ats_unit',
        'ATSU': 'stakeholder:network/ansp/ats_unit',

        // Airspace User variations
        'AU': 'stakeholder:network/airspace_user',
        'AUs': 'stakeholder:network/airspace_user',
        'Aus': 'stakeholder:network/airspace_user',  // Typo variant
        'Airspace Users': 'stakeholder:network/airspace_user',
        'Airspace User': 'stakeholder:network/airspace_user',

        // Aircraft Operator
        'AO': 'stakeholder:network/airspace_user/ao',
        'AOs': 'stakeholder:network/airspace_user/ao',
        'Airlines': 'stakeholder:network/airspace_user/ao',
        'Airlines/AU': 'stakeholder:network/airspace_user/ao',

        // Computerized Flight Service Provider
        'CFSP': 'stakeholder:network/airspace_user/cfsp',
        'CFSPs': 'stakeholder:network/airspace_user/cfsp',

        // Military variations
        'Military': 'stakeholder:network/military',
        'MIL': 'stakeholder:network/military',
        'MIL AU': 'stakeholder:network/military',
        'Military Operational Units': 'stakeholder:network/military',
        'Military authorities': 'stakeholder:network/military',

        // System Integrators and Developers
        'System Integrators': 'stakeholder:network/system_integrator',
        'System Developers': 'stakeholder:network/system_integrator',
        'IT Admins': 'stakeholder:network/system_integrator',
        'Stakeholder IT Admins': 'stakeholder:network/system_integrator',

        // National Authorities
        'National Authority': 'stakeholder:network/national_authority',
        'NSA': 'stakeholder:network/national_authority',

        // European Aviation Safety Agency
        'EASA': 'stakeholder:network/easa',

        // Explicitly ignored - technical/generic terms, vague groupings
        'External Systems': null,
        'External Users': null,
        'EXT': null,  // External (too vague)
        'relevant ASM actors': null,  // Too generic
        'local ASM actor': null,  // Too generic
        'local ASM': null,  // Fragment from "local ASM/ATFCM actors"
        'ATFCM actors': null,  // Fragment from "local ASM/ATFCM actors"
        'All CDM stakeholders: FMPs': null,  // Prefix text, not a stakeholder
        'AMC. FMP': null,  // Malformed (period instead of comma)
        'System Developers (EAUP': null,  // Incomplete after parenthetical removal
        'ADP platforms)': null  // Fragment after parenthetical removal
    };


    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Excel data to structured import format
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('AsmAtfcmMapper: Processing raw data from Excel extraction');

        // OR Code → externalId map for OC resolution
        const orCodeMap = new Map();

        // Process ON OR sheet for needs and requirements
        const onOrResult = this._processOnOrSheet(rawData, orCodeMap);
        console.log(`Mapped ${onOrResult.needs.length} needs (ONs) and ${onOrResult.requirements.length} requirements (ORs) from ON OR OC sheet`);
        console.log(`Built OR Code map with ${orCodeMap.size} entries`);

        // Process OCs for 2027 sheet for changes
        const changes = this._processOcSheet(rawData, orCodeMap);
        console.log(`Mapped ${changes.length} changes (OCs) from OCs for 2027 sheet`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: [...onOrResult.needs, ...onOrResult.requirements],
            changes: changes
        };
    }

    /**
     * Process ON OR sheet and extract ONs and ORs
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @param {Map<string, string>} orCodeMap - Map to populate with OR Code → externalId
     * @returns {Object} { needs: [], requirements: [] }
     * @private
     */
    _processOnOrSheet(rawData, orCodeMap) {
        const needsMap = new Map(); // Map<externalId, ON>
        const requirements = [];

        // Internal ON Title to External ID mapping
        const onTitleToExternalId = new Map(); // Map<ON_Title, externalId>

        // Find ON OR OC sheet
        const onOrOcSheet = (rawData.sheets || []).find(sheet =>
            sheet.name === 'ON OR OC'
        );

        if (!onOrOcSheet) {
            console.warn('WARNING: ON OR OC sheet not found in Excel workbook');
            return { needs: [], requirements: [] };
        }

        console.log(`Found ON OR OC sheet with ${onOrOcSheet.rows.length} rows`);

        // Process each row
        for (const row of onOrOcSheet.rows) {
            const result = this._processOnOrRow(
                row,
                needsMap,
                onTitleToExternalId,
                orCodeMap
            );

            if (result.requirement) {
                requirements.push(result.requirement);
            }
        }

        console.log(`Mapped ${needsMap.size} needs (ONs) and ${requirements.length} requirements (ORs)`);

        // Apply Delta conversion to all text fields before returning
        const needs = Array.from(needsMap.values()).map(need => ({
            ...need,
            statement: this.converter.asciidocToDelta(need.statement),
            rationale: this.converter.asciidocToDelta(need.rationale),
            privateNotes: this.converter.asciidocToDelta(need.privateNotes)
        }));

        const wrappedRequirements = requirements.map(req => ({
            ...req,
            statement: this.converter.asciidocToDelta(req.statement),
            rationale: this.converter.asciidocToDelta(req.rationale),
            privateNotes: this.converter.asciidocToDelta(req.privateNotes)
        }));

        return {
            needs: needs,
            requirements: wrappedRequirements
        };
    }

    /**
     * Process a single row from ON OR sheet
     * Extracts ON (if new) and OR
     * @param {Object} row - Row object with column headers as keys
     * @param {Map} needsMap - Map of ON externalId -> ON object
     * @param {Map} onTitleToExternalId - Map of ON Title -> external ID
     * @param {Map<string, string>} orCodeMap - Map to populate with OR Code → externalId
     * @returns {Object} { requirement: Object|null }
     * @private
     */
    _processOnOrRow(row, needsMap, onTitleToExternalId, orCodeMap) {
        // Extract ON Title
        const onTitle = row['ON Title:'];
        let onExternalId = null;

        if (onTitle && onTitle.trim() !== '') {
            const normalizedOnTitle = onTitle.trim();

            // Check if we already processed this ON
            if (onTitleToExternalId.has(normalizedOnTitle)) {
                // ON already exists - check if we need to append statement/rationale
                onExternalId = onTitleToExternalId.get(normalizedOnTitle);
                const existingNeed = needsMap.get(onExternalId);
                this._appendNeedContentIfDifferent(existingNeed, row);
            } else {
                // Extract the full ON object
                const need = this._extractNeed(row);
                if (need) {
                    onExternalId = need.externalId;
                    // Store in both maps
                    needsMap.set(onExternalId, need);
                    onTitleToExternalId.set(normalizedOnTitle, onExternalId);
                }
            }
        } else {
            console.warn(`Row ${row['#']}: OR exists but no ON Title found`);
        }

        // Build the OR object
        const requirement = this._extractRequirement(row);
        if (!requirement) {
            return { requirement: null };
        }

        // Add ON reference if exists
        if (onExternalId) {
            requirement.implementedONs = [onExternalId];
        }

        // Populate OR Code map for OC resolution
        const orCode = row['OR Code'];
        if (orCode && orCode.trim() !== '') {
            orCodeMap.set(orCode.trim(), requirement.externalId);
        }

        return { requirement };
    }

    /**
     * Append statement/rationale to existing need if different
     * @param {Object} existingNeed - Existing ON object
     * @param {Object} row - Row object with new data
     * @private
     */
    _appendNeedContentIfDifferent(existingNeed, row) {
        const newStatement = row['ON Statement'];
        const newRationale = row['ON Rationale'];

        // Append statement if different and non-empty
        if (newStatement && newStatement.trim() !== '') {
            const trimmedNew = newStatement.trim();
            if (existingNeed.statement && !existingNeed.statement.includes(trimmedNew)) {
                existingNeed.statement += '\n\n' + trimmedNew;
            }
        }

        // Append rationale if different and non-empty
        if (newRationale && newRationale.trim() !== '') {
            const trimmedNew = newRationale.trim();
            if (existingNeed.rationale && !existingNeed.rationale.includes(trimmedNew)) {
                existingNeed.rationale += '\n\n' + trimmedNew;
            }
        }
    }

    /**
     * Extract ON (Operational Need) from row
     * @param {Object} row - Row object with column headers as keys
     * @returns {Object|null} ON object or null if invalid
     * @private
     */
    _extractNeed(row) {
        const onTitle = row['ON Title:'];
        const onStatement = row['ON Statement'];
        const onRationale = row['ON Rationale'];
        const assignedTo = row['Assigned to'];
        const step = row['Step'];
        const conopsReference = row['CONOPS Improvement reference'];

        if (!onTitle || onTitle.trim() === '') {
            return null;
        }

        // Build path from Step and CONOPS Improvement reference
        const path = this._buildPath(step, conopsReference);

        // Build object first
        const need = {
            type: 'ON',
            drg: 'ASM_ATFCM',
            title: onTitle.trim(),
            path: path,
            statement: onStatement && onStatement.trim() !== '' ? onStatement.trim() : null,
            rationale: onRationale && onRationale.trim() !== '' ? onRationale.trim() : null,
            privateNotes: assignedTo && assignedTo.trim() !== '' ? `**Assigned to:** ${assignedTo.trim()}` : null
        };

        // Add external ID using the complete object (no path needed for ID generation)
        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    /**
     * Extract OR (Operational Requirement) from row
     * @param {Object} row - Row object with column headers as keys
     * @returns {Object|null} OR object or null if invalid
     * @private
     */
    _extractRequirement(row) {
        const orTitle = row['OR Title:'];
        const step = row['Step'];
        const conopsReference = row['CONOPS Improvement reference'];

        if (!orTitle || orTitle.trim() === '') {
            return null;
        }

        // Build statement
        const baseStatement = row['Detailed requirement:\r\nStatement'];
        const fitCriteria = row['Fit Criteria: (keep it under the statement)'];

        let statement = null;
        if (baseStatement && baseStatement.trim() !== '') {
            statement = baseStatement.trim();

            // Append Fit Criteria if present and not empty/TBD
            if (this._isValidContent(fitCriteria)) {
                statement += '\n\n**Fit Criteria:**\n\n' + fitCriteria.trim();
            }
        }

        // Build rationale
        const baseRationale = row['Rationale:'];
        const opportunitiesRisks = row['Opportunities & Risks:\r\n(keep)'];

        let rationale = null;
        if (baseRationale && baseRationale.trim() !== '') {
            rationale = baseRationale.trim();

            // Append Opportunities & Risks if present and not empty/TBD
            if (this._isValidContent(opportunitiesRisks)) {
                rationale += '\n\n**Opportunities & Risks:**\n\n' + opportunitiesRisks.trim();
            }
        }

        // Parse stakeholders
        const stakeholderResult = this._parseStakeholders(row['Stakeholders:']);

        // Parse document references
        const documentReferences = this._parseRequirementDocumentReferences(row);

        // Build path from Step and CONOPS Improvement reference
        const path = this._buildPath(step, conopsReference);

        // Build private notes (including unmapped stakeholders if any)
        const privateNotes = this._extractRequirementPrivateNotes(row, stakeholderResult.unmapped);

        // Build object first
        const requirement = {
            type: 'OR',
            drg: 'ASM_ATFCM',
            title: orTitle.trim(),
            path: path,
            statement: statement,
            rationale: rationale,
            privateNotes: privateNotes,
            implementedONs: [],  // Will be populated by caller
            impactsStakeholderCategories: stakeholderResult.refs,
            documentReferences: documentReferences
        };

        // Add external ID using the complete object (no path needed)
        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');

        return requirement;
    }

    /**
     * Build path array from Step and CONOPS Improvement reference
     * @param {string} step - Step column value
     * @param {string} conopsReference - CONOPS Improvement reference column value
     * @returns {Array<string>|null} Path array or null if both empty
     * @private
     */
    _buildPath(step, conopsReference) {
        const pathSegments = [];

        if (step && step.trim() !== '') {
            pathSegments.push(step.trim());
        }

        if (conopsReference && conopsReference.trim() !== '') {
            pathSegments.push(conopsReference.trim());
        }

        return pathSegments.length > 0 ? pathSegments : null;
    }

    /**
     * Extract private notes for OR
     * @param {Object} row - Row object
     * @param {Array<string>} unmappedStakeholders - Unmapped stakeholder names
     * @returns {string|null} Private notes text
     * @private
     */
    _extractRequirementPrivateNotes(row, unmappedStakeholders = []) {
        const rowNumber = row['#'];
        const originator = row['Originator:'];
        const orCode = row['OR Code'];
        const dependencies = row['Dependencies:'];
        const priority = row['Priority (Implementing Year)'];
        const dataEnablers = row['Data (and other Enablers):'];
        const impactedServices = row['Impacted Services:'];
        const remark = row['Remark'];

        const parts = [];

        if (rowNumber && rowNumber.toString().trim() !== '') {
            parts.push(`# ${rowNumber.toString().trim()}`);
        }

        if (originator && originator.trim() !== '') {
            parts.push(`**Originator:** ${originator.trim()}`);
        }

        if (orCode && orCode.trim() !== '') {
            parts.push(`**OR Code:** ${orCode.trim()}`);
        }

        if (this._isValidPrivateNote(dependencies)) {
            parts.push(`**Dependencies:** ${dependencies.trim()}`);
        }

        if (priority && priority.trim() !== '') {
            parts.push(`**Priority (Implementing Year):** ${priority.trim()}`);
        }

        if (this._isValidPrivateNote(dataEnablers)) {
            parts.push(`**Data (and other Enablers):** ${dataEnablers.trim()}`);
        }

        if (this._isValidPrivateNote(impactedServices)) {
            parts.push(`**Impacted Services:** ${impactedServices.trim()}`);
        }

        if (unmappedStakeholders && unmappedStakeholders.length > 0) {
            parts.push(`**Stakeholders (unmapped):** ${unmappedStakeholders.join(', ')}`);
        }

        if (remark && remark.trim() !== '') {
            parts.push(`**Remark:** ${remark.trim()}`);
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Parse document references for OR from iNM Roadmap reference column
     * @param {Object} row - Row object
     * @returns {Array<{documentExternalId: string, note: string}>} Array of document reference objects
     * @private
     */
    _parseRequirementDocumentReferences(row) {
        const inmRoadmapRef = row['INM Roadmap reference (code)'];

        if (!inmRoadmapRef || inmRoadmapRef.trim() === '') {
            return [];
        }

        return [{
            documentExternalId: 'document:inm-roadmap',
            note: inmRoadmapRef.trim()
        }];
    }

    /**
     * Process OCs for 2027 sheet and extract OCs
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @param {Map<string, string>} orCodeMap - Map of OR Code to externalId
     * @returns {Array} Array of OC objects
     * @private
     */
    _processOcSheet(rawData, orCodeMap) {
        const changes = [];

        // Find OCs for 2027 sheet
        const ocSheet = (rawData.sheets || []).find(sheet =>
            sheet.name === 'OCs for 2027'
        );

        if (!ocSheet) {
            console.warn('WARNING: OCs for 2027 sheet not found in Excel workbook');
            return [];
        }

        console.log(`Found OCs for 2027 sheet with ${ocSheet.rows.length} rows`);

        // Process each row
        for (const row of ocSheet.rows) {
            const change = this._extractChange(row, orCodeMap);
            if (change) {
                changes.push(change);
            }
        }

        // Apply Delta conversion to all text fields before returning
        const wrappedChanges = changes.map(change => ({
            ...change,
            purpose: this.converter.asciidocToDelta(change.purpose),
            initialState: this.converter.asciidocToDelta(change.initialState),
            finalState: this.converter.asciidocToDelta(change.finalState),
            details: this.converter.asciidocToDelta(change.details),
            privateNotes: this.converter.asciidocToDelta(change.privateNotes)
        }));

        return wrappedChanges;
    }

    /**
     * Extract OC (Operational Change) from OCs for 2027 sheet row
     * @param {Object} row - Row object with column headers as keys
     * @param {Map<string, string>} orCodeMap - Map of OR Code to externalId
     * @returns {Object|null} OC object or null if invalid
     * @private
     */
    _extractChange(row, orCodeMap) {
        const externalId = row['Number/Code'];
        const title = row['Title'];

        if (!externalId || externalId.trim() === '' || !title || title.trim() === '') {
            console.warn('Skipping OC row: missing Number/Code or Title');
            return null;
        }

        // Parse satisfied ORs (semicolon-delimited OR codes → resolve to external IDs)
        const satisfiedORs = this._resolveOrCodes(row['Satisfied Ors'], orCodeMap, 'Satisfied Ors');

        // Parse superseded ORs (semicolon-delimited OR codes → resolve to external IDs)
        const supersededORs = this._resolveOrCodes(row['Superseded Ors'], orCodeMap, 'Superseded Ors', true);

        // Parse document references (line-delimited)
        const documentReferences = this._parseDocumentReferences(row['Additional documents']);

        // Parse milestones
        const milestones = this._parseOcMilestones(row['Milestones']);

        // Build private notes from multiple fields
        const privateNotes = this._extractChangePrivateNotes(row);

        // Build the change object
        const change = {
            externalId: externalId.trim(),
            title: title.trim(),
            purpose: row['Purpose'] && row['Purpose'].trim() !== '' ? row['Purpose'].trim() : null,
            initialState: row['Initial State'] && row['Initial State'].trim() !== '' ? row['Initial State'].trim() : null,
            finalState: row['Final State'] && row['Final State'].trim() !== '' ? row['Final State'].trim() : null,
            details: row['Details'] && row['Details'].trim() !== '' ? row['Details'].trim() : null,
            drg: 'ASM_ATFCM',
            visibility: 'NETWORK',
            satisfiedORs: satisfiedORs,
            supersededORs: supersededORs,
            documentReferences: documentReferences,
            milestones: milestones,
            privateNotes: privateNotes
        };

        return change;
    }

    /**
     * Extract private notes for OC from multiple columns
     * @param {Object} row - Row object
     * @returns {string|null} Private notes text
     * @private
     */
    _extractChangePrivateNotes(row) {
        const numberCode = row['Number/Code'];
        const remarks = row['Remarks'];
        const dependences = row['Dependences'];
        const costAssessment = row['Cost assessment'];
        const priority = row['Pirotity'];

        const parts = [];

        if (numberCode && numberCode.trim() !== '') {
            parts.push(`**Number/Code:** ${numberCode.trim()}`);
        }

        if (remarks && remarks.trim() !== '' && this._isValidPrivateNote(remarks)) {
            parts.push(`**Remarks:** ${remarks.trim()}`);
        }

        if (dependences && dependences.trim() !== '' && this._isValidPrivateNote(dependences)) {
            parts.push(`**Dependencies:** ${dependences.trim()}`);
        }

        if (costAssessment && costAssessment.trim() !== '' && this._isValidPrivateNote(costAssessment)) {
            parts.push(`**Cost Assessment:** ${costAssessment.trim()}`);
        }

        if (priority && priority.trim() !== '' && this._isValidPrivateNote(priority)) {
            parts.push(`**Priority:** ${priority.trim()}`);
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Resolve OR codes to external IDs using orCodeMap
     * @param {string} text - Semicolon-delimited OR codes
     * @param {Map<string, string>} orCodeMap - Map of OR Code to externalId
     * @param {string} fieldName - Field name for logging
     * @param {boolean} handleNA - If true, treat "N/A" as empty
     * @returns {Array<string>} Array of external IDs
     * @private
     */
    _resolveOrCodes(text, orCodeMap, fieldName, handleNA = false) {
        if (!text || text.trim() === '') {
            return [];
        }

        // Handle "N/A" case
        if (handleNA && text.trim().toUpperCase() === 'N/A') {
            return [];
        }

        const resolvedIds = [];
        const unresolvedCodes = [];

        const orCodes = text
            .split(';')
            .map(code => code.trim())
            .filter(code => code !== '');

        for (const orCode of orCodes) {
            const externalId = orCodeMap.get(orCode);
            if (externalId) {
                resolvedIds.push(externalId);
            } else {
                unresolvedCodes.push(orCode);
            }
        }

        // Log warnings for unresolved codes
        if (unresolvedCodes.length > 0) {
            console.warn(
                `Unresolved OR codes in ${fieldName}: ` +
                unresolvedCodes.join(', ')
            );
        }

        return resolvedIds;
    }

    /**
     * Parse line-delimited document references
     * @param {string} text - Line-delimited document names
     * @returns {Array<{documentExternalId: string}>} Array of document reference objects
     * @private
     */
    _parseDocumentReferences(text) {
        if (!text || text.trim() === '') {
            return [];
        }

        const references = [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');

        for (const line of lines) {
            // Build external ID from document name
            // Convention: document:{normalized_name}
            const normalizedName = line
                .toLowerCase()
                .replace(/\//g, '_')  // Convert slashes to underscores first
                .replace(/\s+/g, '_')  // Convert spaces to underscores
                .replace(/[^a-z0-9_]/g, '');  // Remove other special characters

            references.push({
                documentExternalId: `document:${normalizedName}`
            });
        }

        return references;
    }

    /**
     * Parse milestones text and map to a single milestone object with eventTypes array
     * @param {string} text - Line-delimited milestone descriptions
     * @returns {Array<{title: string, wave: string, eventTypes: Array<string>}>} Array with single milestone object (or empty)
     * @private
     */
    _parseOcMilestones(text) {
        if (!text || text.trim() === '') {
            return [];
        }

        const eventTypes = [];
        const lines = text.split('\n').map(line => line.trim()).filter(line => line !== '');

        for (const line of lines) {
            const eventType = this._mapMilestoneTextToEventType(line);
            if (eventType) {
                eventTypes.push(eventType);
            }
        }

        // Return single milestone with all event types, or empty array if no valid events
        if (eventTypes.length === 0) {
            return [];
        }

        return [{
            title: 'M1',
            wave: 'wave:2027',
            eventTypes: eventTypes
        }];
    }

    /**
     * Map milestone text to eventType enum
     * @param {string} text - Milestone description text
     * @returns {string|null} Event type or null if not recognized
     * @private
     */
    _mapMilestoneTextToEventType(text) {
        const normalized = text.toLowerCase().trim();

        // Map recognized patterns to event types using shared enum
        if (normalized.includes('nm b2b api ops deployment') ||
            normalized.includes('b2b api ops deployment')) {
            return MilestoneEventKeys[0]; // 'OPS_DEPLOYMENT'
        }

        if (normalized.includes('nmui ops deployment') ||
            normalized.includes('ui ops deployment')) {
            return MilestoneEventKeys[2]; // 'UI_TEST_DEPLOYMENT'
        }

        // Ignore "Service Activation" and other unrecognized patterns
        return null;
    }

    /**
     * Parse stakeholders column and map to reference objects
     * Handles multiple delimiters: comma, semicolon, slash, bullet point, newline
     * Skips explicitly ignored tokens (mapped to null)
     * Logs warnings for unmapped tokens
     *
     * @param {string} stakeholdersText - Delimited stakeholder text from Excel
     * @returns {Object} { refs: Array<{externalId}>, unmapped: Array<string> }
     * @private
     */
    _parseStakeholders(stakeholdersText) {
        if (!stakeholdersText || stakeholdersText.trim() === '') {
            return { refs: [], unmapped: [] };
        }

        const stakeholderRefs = [];
        const seenIds = new Set();  // Prevent duplicates
        const unmappedTokens = [];  // Track unknowns (preserve order)

        // Split by comma, semicolon, slash, bullet point, or newline
        const tokens = stakeholdersText
            .split(/[,;/•\n]/)
            .map(t => t.trim())
            .filter(t => t && t !== '');

        for (let token of tokens) {
            // Remove parenthetical text (e.g., "(EAUP/ADP platforms)" or "(EAUP, ADP platforms)")
            token = token.replace(/\s*\([^)]*\)\s*/g, '').trim();

            if (!token) continue;

            const externalId = AsmAtfcmMapper.STAKEHOLDER_SYNONYM_MAP[token];

            if (externalId === null) {
                // Explicitly ignored (e.g., 'External Systems')
                continue;
            }

            if (externalId) {
                // Valid mapping found - avoid duplicates
                if (!seenIds.has(externalId)) {
                    stakeholderRefs.push({ externalId });
                    seenIds.add(externalId);
                }
            } else {
                // Unknown token - track for reporting and private notes
                if (!unmappedTokens.includes(token)) {
                    unmappedTokens.push(token);
                }
            }
        }

        // Report unmapped tokens (helps identify missing synonyms)
        if (unmappedTokens.length > 0) {
            console.warn(
                `Unmapped stakeholders in "${stakeholdersText}": ` +
                unmappedTokens.join(', ')
            );
        }

        return { refs: stakeholderRefs, unmapped: unmappedTokens };
    }

    /**
     * Check if content is valid for private notes (not empty, not TBD, not N/A)
     * @param {string} content - Content to check
     * @returns {boolean} True if content is valid
     * @private
     */
    _isValidPrivateNote(content) {
        if (!content || content.trim() === '') {
            return false;
        }
        const normalized = content.trim().toUpperCase();
        return normalized !== 'TBD' && normalized !== 'N/A';
    }

    /**
     * Check if content is valid (not empty and not "TBD")
     * @param {string} content - Content to check
     * @returns {boolean} True if content is valid
     * @private
     */
    _isValidContent(content) {
        if (!content || content.trim() === '') {
            return false;
        }
        const normalized = content.trim().toUpperCase();
        return normalized !== 'TBD';
    }
}

export default AsmAtfcmMapper;