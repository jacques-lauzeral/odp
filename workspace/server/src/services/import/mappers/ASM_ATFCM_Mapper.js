import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import {textToDelta} from "./utils.js";

/**
 * Mapper for ASM_ATFCM Excel documents
 * Transforms tabular sheet structure into ODP entities
 *
 * COLUMN INTERPRETATION:
 * ======================
 *
 * ON (Operational Need) Extraction:
 * ---------------------------------
 * - '#' → internal tracking only, not used in external ID
 * - 'ON Title:' → title (used for external ID generation and grouping)
 * - 'ON Statement' → statement (aggregated if multiple distinct values)
 * - 'ON Rationale' → rationale (aggregated if multiple distinct values)
 * - 'Assigned to' → privateNotes
 * - 'CONOPS Improvement reference' → documentReferences (aggregated note)
 * - type: 'ON', drg: 'ASM_ATFCM' (hardcoded)
 *
 * OR (Operational Requirement) Extraction:
 * ----------------------------------------
 * - '#' → row number (included in OR privateNotes)
 * - 'OR Title:' → title (used for external ID generation)
 * - 'Detailed requirement:\r\nStatement' → statement (base)
 * - 'Fit Criteria: (keep it under the statement)' → appended to statement if not empty/TBD
 * - 'Rationale:' → rationale (base)
 * - 'Opportunities & Risks:\r\n(keep)' → appended to rationale if not empty/TBD
 * - 'ON Title:' → implementedONs (resolved via ON title map)
 * - 'Step' → used to link OR to OC (resolved via Step value map)
 * - 'Stakeholders:' → impactsStakeholderCategories (parsed via synonym map)
 * - 'Originator:' → privateNotes
 * - 'OR Code' → privateNotes
 * - 'Dependencies:' → privateNotes
 * - 'Priority (Implementing Year)' → privateNotes
 * - 'Data (and other Enablers):' → privateNotes (raw value, skipped if TBD/N/A/empty)
 * - 'Impacted Services:' → privateNotes (raw value, skipped if TBD/N/A/empty)
 * - 'Remark' → privateNotes
 * - type: 'OR', drg: 'ASM_ATFCM' (hardcoded)
 *
 * OC (Operational Change) Extraction:
 * -----------------------------------
 * - 'Step' → title (used for external ID generation)
 * - One OC created per unique Step value
 * - purpose: 'TBD' (hardcoded to avoid validation issues)
 * - details: 'TBD' (hardcoded to avoid validation issues)
 * - satisfiedORs → populated with all ORs that have this Step value
 * - visibility: 'NETWORK', drg: 'ASM_ATFCM' (hardcoded)
 *
 * ON Private Notes:
 * -----------------
 * - 'Assigned to' → privateNotes
 *
 * ON Document References:
 * -----------------------
 * - 'CONOPS Improvement reference' → documentReferences
 *   - documentExternalId: 'document:asm_atfcm_conops'
 *   - note: prefixed with column title, aggregated with \n\n if multiple distinct values
 *   - Format: 'CONOPS Improvement reference: [value]'
 *
 * OR Private Notes Format:
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
 * Remark: [value]
 *
 * (empty fields and TBD/N/A values are skipped)
 *
 * External ID Format:
 * -------------------
 * - ON: on:asm_atfcm/{title_normalized}
 * - OR: or:asm_atfcm/{title_normalized}
 * - OC: oc:asm_atfcm/{title_normalized}
 *
 * Path:
 * -----
 * - All entities (ONs, ORs, OCs) have path set to null (flat organization)
 *
 * IGNORED COLUMNS:
 * ----------------
 * The following columns are intentionally not imported:
 * - 'Origin' - redundant with document reference
 * - 'Date:' - not relevant for structured data
 * - 'ON reference:' - redundant with ON Title
 * - 'Operational Change (Code)' - always empty in source data
 * - 'INM Roadmap reference (code)' - always empty in source data
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

        // Weather Operations Centre
        'WOC': 'stakeholder:network/nm/woc',
        'WOCs': 'stakeholder:network/nm/woc',

        // ANSP variations
        'ANSP': 'stakeholder:network/ansp',
        'ANSPs': 'stakeholder:network/ansp',

        // Flow Management Position
        'FMP': 'stakeholder:network/ansp/fmp',
        'FMPs': 'stakeholder:network/ansp/fmp',
        'Local FMPs': 'stakeholder:network/ansp/fmp',
        'Local FMP': 'stakeholder:network/ansp/fmp',

        // Airspace Management Cell
        'AMC': 'stakeholder:network/ansp/amc',
        'AMCs': 'stakeholder:network/ansp/amc',
        'Local AMCs': 'stakeholder:network/ansp/amc',
        'Local AMC': 'stakeholder:network/ansp/amc',

        // Air Traffic Control
        'ATC Unit': 'stakeholder:network/ansp/atc',
        'ATC Units': 'stakeholder:network/ansp/atc',
        'Air Traffic Control Units': 'stakeholder:network/ansp/atc',
        'Civil/Military ATC Units': 'stakeholder:network/ansp/atc',
        'ATSUs': 'stakeholder:network/ansp/atc',
        'ATSU': 'stakeholder:network/ansp/atc',

        // Airspace User variations
        'AU': 'stakeholder:network/airspace_user',
        'AUs': 'stakeholder:network/airspace_user',
        'Airspace Users': 'stakeholder:network/airspace_user',
        'Airspace User': 'stakeholder:network/airspace_user',

        // Aircraft Operator
        'AO': 'stakeholder:network/airspace_user/ao',
        'AOs': 'stakeholder:network/airspace_user/ao',
        'Airlines': 'stakeholder:network/airspace_user/ao',

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

        // Explicitly ignored - technical/generic terms
        'External Systems': null,
        'External Users': null
    };


    /**
     * Map raw extracted Excel data to structured import format
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('AsmAtfcmMapper: Processing raw data from Excel extraction');

        const result = this._processOnOrOcSheet(rawData);

        console.log(`Mapped ${result.needs.length} needs (ONs), ${result.requirements.length} requirements (ORs), and ${result.changes.length} changes (OCs) from ON OR OC sheet`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: [...result.needs, ...result.requirements],
            changes: [...result.changes]
        };
    }

    /**
     * Process ON OR OC sheet and extract ONs, ORs, and OCs
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} { needs: [], requirements: [], changes: [] }
     * @private
     */
    _processOnOrOcSheet(rawData) {
        const needsMap = new Map(); // Map<externalId, ON>
        const requirements = [];
        const changesMap = new Map(); // Map<externalId, OC>

        // Internal ON Title to External ID mapping
        const onTitleToExternalId = new Map(); // Map<ON_Title, externalId>

        // Track Step -> OR relationships (using external IDs)
        const stepToOrMap = new Map(); // Map<Step, Set<orExternalId>>

        // Find ON OR OC sheet
        const onOrOcSheet = (rawData.sheets || []).find(sheet =>
            sheet.name === 'ON OR OC'
        );

        if (!onOrOcSheet) {
            console.warn('WARNING: ON OR OC sheet not found in Excel workbook');
            return { needs: [], requirements: [], changes: [] };
        }

        console.log(`Found ON OR OC sheet with ${onOrOcSheet.rows.length} rows`);

        // Process each row
        for (const row of onOrOcSheet.rows) {
            const result = this._processOnOrOcRow(
                row,
                needsMap,
                onTitleToExternalId,
                stepToOrMap
            );

            if (result.requirement) {
                requirements.push(result.requirement);
            }
        }

        // Create OCs from unique Step values and populate satisfiedORs
        for (const [step, orExternalIds] of stepToOrMap.entries()) {
            const change = this._createChangeFromStep(step, orExternalIds);
            if (change) {
                changesMap.set(change.externalId, change);
            }
        }

        console.log(`Mapped ${needsMap.size} needs (ONs), ${requirements.length} requirements (ORs), and ${changesMap.size} changes (OCs)`);
        console.log(`OC-OR relationships: ${changesMap.size} OCs linked to ORs`);

        // Apply textToDelta to all text fields before returning
        const needs = Array.from(needsMap.values()).map(need => ({
            ...need,
            statement: textToDelta(need.statement),
            rationale: textToDelta(need.rationale),
            privateNotes: textToDelta(need.privateNotes)
        }));

        const wrappedRequirements = requirements.map(req => ({
            ...req,
            statement: textToDelta(req.statement),
            rationale: textToDelta(req.rationale),
            privateNotes: textToDelta(req.privateNotes)
        }));

        const changes = Array.from(changesMap.values()).map(change => ({
            ...change,
            purpose: textToDelta(change.purpose),
            details: textToDelta(change.details)
        }));

        return {
            needs: needs,
            requirements: wrappedRequirements,
            changes: changes
        };
    }

    /**
     * Process a single row from ON OR OC sheet
     * Extracts ON (if new) and OR
     * @param {Object} row - Row object with column headers as keys
     * @param {Map} needsMap - Map of ON externalId -> ON object
     * @param {Map} onTitleToExternalId - Map of ON Title -> external ID
     * @param {Map} stepToOrMap - Map of Step -> Set of OR external IDs
     * @returns {Object} { requirement: Object|null }
     * @private
     */
    _processOnOrOcRow(row, needsMap, onTitleToExternalId, stepToOrMap) {
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

        // Track Step -> OR relationship for OC creation
        const step = row['Step'];
        if (step && step.trim() !== '') {
            const normalizedStep = step.trim();

            // Initialize Set for this Step if not exists
            if (!stepToOrMap.has(normalizedStep)) {
                stepToOrMap.set(normalizedStep, new Set());
            }

            // Add OR external ID to the Set for this Step
            stepToOrMap.get(normalizedStep).add(requirement.externalId);
        }

        return { requirement };
    }

    /**
     * Append ON statement/rationale/documentReferences if different from existing content
     * Handles cases where same ON Title has multiple distinct statements/rationales/references
     * @param {Object} existingNeed - Existing ON object
     * @param {Object} row - Row object with potential new content
     * @private
     */
    _appendNeedContentIfDifferent(existingNeed, row) {
        const newStatement = row['ON Statement'];
        const newRationale = row['ON Rationale'];

        // Append statement if different and not empty
        if (newStatement && newStatement.trim() !== '') {
            const trimmedNew = newStatement.trim();
            if (!existingNeed.statement) {
                existingNeed.statement = trimmedNew;
            } else if (existingNeed.statement !== trimmedNew) {
                existingNeed.statement += '\n\n' + trimmedNew;
            }
        }

        // Append rationale if different and not empty
        if (newRationale && newRationale.trim() !== '') {
            const trimmedNew = newRationale.trim();
            if (!existingNeed.rationale) {
                existingNeed.rationale = trimmedNew;
            } else if (existingNeed.rationale !== trimmedNew) {
                existingNeed.rationale += '\n\n' + trimmedNew;
            }
        }

        // Aggregate document reference notes
        const conopsRef = row['CONOPS Improvement reference'];
        if (conopsRef && conopsRef.trim() !== '') {
            const trimmedNote = conopsRef.trim();
            const prefixedNote = `CONOPS Improvement reference: ${trimmedNote}`;

            if (!existingNeed.documentReferences) {
                // First reference
                existingNeed.documentReferences = [{
                    documentExternalId: 'document:asm_atfcm_conops',
                    note: prefixedNote
                }];
            } else {
                // Check if this exact note already exists (case-insensitive, comparing original values)
                const existingNotes = existingNeed.documentReferences[0].note
                    .split('\n\n')
                    .map(n => n.replace('CONOPS Improvement reference: ', '').trim().toLowerCase());

                const normalizedNew = trimmedNote.toLowerCase();

                if (!existingNotes.includes(normalizedNew)) {
                    existingNeed.documentReferences[0].note += '\n\n' + prefixedNote;
                }
            }
        }
    }

    /**
     * Extract ON (Operational Need) from row
     * @param {Object} row - Row object
     * @returns {Object|null} ON object with externalId, title, statement, rationale, privateNotes, documentReferences
     * @private
     */
    _extractNeed(row) {
        const onTitle = row['ON Title:'];
        const onStatement = row['ON Statement'];
        const onRationale = row['ON Rationale'];

        if (!onTitle || onTitle.trim() === '') {
            return null;
        }

        // Build object first
        const need = {
            type: 'ON',
            drg: 'ASM_ATFCM',
            title: onTitle.trim(),
            statement: onStatement && onStatement.trim() !== '' ? onStatement.trim() : null,
            rationale: onRationale && onRationale.trim() !== '' ? onRationale.trim() : null,
            privateNotes: this._extractNeedPrivateNotes(row)
        };

        // Add documentReferences if present
        const docRefs = this._extractNeedDocumentReferences(row);
        if (docRefs) {
            need.documentReferences = docRefs;
        }

        // Add external ID using the complete object (no path needed)
        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    /**
     * Extract document references for ON
     * @param {Object} row - Row object
     * @returns {Array|null} Document references array or null
     * @private
     */
    _extractNeedDocumentReferences(row) {
        const conopsRef = row['CONOPS Improvement reference'];

        if (!conopsRef || conopsRef.trim() === '') {
            return null;
        }

        return [{
            documentExternalId: 'document:asm_atfcm_conops',
            note: `CONOPS Improvement reference: ${conopsRef.trim()}`
        }];
    }

    /**
     * Extract private notes for ON
     * @param {Object} row - Row object
     * @returns {string|null} Private notes text
     * @private
     */
    _extractNeedPrivateNotes(row) {
        const assignedTo = row['Assigned to'];

        const parts = [];

        if (assignedTo && assignedTo.trim() !== '') {
            parts.push(`Assigned to: ${assignedTo.trim()}`);
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Extract OR (Operational Requirement) from row
     * @param {Object} row - Row object
     * @returns {Object|null} OR object
     * @private
     */
    _extractRequirement(row) {
        const orTitle = row['OR Title:'];

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
                statement += '\n\nFit Criteria:\n\n' + fitCriteria.trim();
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
                rationale += '\n\nOpportunities & Risks:\n\n' + opportunitiesRisks.trim();
            }
        }

        // Parse stakeholders
        const impactsStakeholderCategories = this._parseStakeholders(row['Stakeholders:']);

        // Build object first
        const requirement = {
            type: 'OR',
            drg: 'ASM_ATFCM',
            title: orTitle.trim(),
            statement: statement,
            rationale: rationale,
            privateNotes: this._extractRequirementPrivateNotes(row),
            implementedONs: [],  // Will be populated by caller
            impactsStakeholderCategories: impactsStakeholderCategories
        };

        // Add external ID using the complete object (no path needed)
        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');

        return requirement;
    }

    /**
     * Extract private notes for OR
     * @param {Object} row - Row object
     * @returns {string|null} Private notes text
     * @private
     */
    _extractRequirementPrivateNotes(row) {
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
            parts.push(`Originator: ${originator.trim()}`);
        }

        if (orCode && orCode.trim() !== '') {
            parts.push(`OR Code: ${orCode.trim()}`);
        }

        if (this._isValidPrivateNote(dependencies)) {
            parts.push(`Dependencies: ${dependencies.trim()}`);
        }

        if (priority && priority.trim() !== '') {
            parts.push(`Priority (Implementing Year): ${priority.trim()}`);
        }

        if (this._isValidPrivateNote(dataEnablers)) {
            parts.push(`Data (and other Enablers): ${dataEnablers.trim()}`);
        }

        if (this._isValidPrivateNote(impactedServices)) {
            parts.push(`Impacted Services: ${impactedServices.trim()}`);
        }

        if (remark && remark.trim() !== '') {
            parts.push(`Remark: ${remark.trim()}`);
        }

        return parts.length > 0 ? parts.join('\n\n') : null;
    }

    /**
     * Parse stakeholders column and map to reference objects
     * Handles multiple delimiters: comma, semicolon, slash
     * Skips explicitly ignored tokens (mapped to null)
     * Logs warnings for unmapped tokens
     *
     * @param {string} stakeholdersText - Delimited stakeholder text from Excel
     * @returns {Array<{externalId: string}>} Array of unique stakeholder references
     * @private
     */
    _parseStakeholders(stakeholdersText) {
        if (!stakeholdersText || stakeholdersText.trim() === '') {
            return [];
        }

        const stakeholderRefs = [];
        const seenIds = new Set();  // Prevent duplicates
        const unmappedTokens = new Set();  // Track unknowns

        // Split by comma, semicolon, or slash
        const tokens = stakeholdersText
            .split(/[,;/]/)
            .map(t => t.trim())
            .filter(t => t && t !== '');

        for (const token of tokens) {
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
                // Unknown token - track for reporting
                unmappedTokens.add(token);
            }
        }

        // Report unmapped tokens (helps identify missing synonyms)
        if (unmappedTokens.size > 0) {
            console.warn(
                `Unmapped stakeholders in "${stakeholdersText}": ` +
                Array.from(unmappedTokens).join(', ')
            );
        }

        return stakeholderRefs;
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

    /**
     * Create OC (Operational Change) from Step value
     * @param {string} step - Step value (becomes OC title)
     * @param {Set} orExternalIds - Set of OR external IDs
     * @returns {Object} OC object
     * @private
     */
    _createChangeFromStep(step, orExternalIds) {
        if (!step || step.trim() === '') {
            return null;
        }

        // Build object first
        const change = {
            drg: 'ASM_ATFCM',
            title: step.trim(),
            purpose: 'TBD',
            details: 'TBD',
            visibility: 'NETWORK',
            satisfiedORs: Array.from(orExternalIds)
        };

        // Add external ID using the complete object (no path needed)
        change.externalId = ExternalIdBuilder.buildExternalId(change, 'oc');

        return change;
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

export default AsmAtfcmMapper;