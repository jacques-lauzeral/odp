import Mapper from './Mapper.js';
import ExternalIdBuilder from '../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * Mapper for REROUTING Excel documents
 * Transforms tabular sheet structure into ODP entities
 *
 * COLUMN INTERPRETATION:
 * ======================
 *
 * ON (Operational Need) Extraction:
 * ---------------------------------
 * - 'ON ID' → internal tracking only, not used in external ID
 * - 'ON' → title (used for external ID generation)
 * - 'ON Definition' → parsed into statement and rationale
 *   - "What:" section → statement
 *   - "Why:" section → rationale
 *   - "Focus:" section → appended to statement
 *
 * OR (Operational Requirement) Extraction:
 * ----------------------------------------
 * - 'RR ID' → internal tracking only, not used in external ID
 * - 'Title' → title (used for external ID generation)
 * - 'What (Detailed Requirement)' + 'Fit Criteria' → statement (concatenated)
 * - 'Why (Rationale)' + 'Opportunities/Risks' → rationale (concatenated)
 * - 'Use Case' → flows
 * - 'Comments' + 'Data (and other Enabler)' → privateNotes (concatenated)
 * - 'ON ID' → implementedONs (resolved via internal ID map)
 * - 'Stakeholders' → impactsStakeholderCategories (parsed and mapped)
 * - 'OC ID' → used for OC-OR relationship tracking (resolved via internal ID map)
 * - type: 'OR', drg: 'RRT' (hardcoded)
 *
 * OC (Operational Change) Extraction:
 * -----------------------------------
 * - 'OC ID' → internal tracking only ('RR-OC-' prefix removed), not used in external ID
 * - 'OC Name' → title (used for external ID generation)
 * - 'OC Description' → parsed into purpose and details
 *   - Text before "In essence:" → details
 *   - Text after "In essence:" → purpose
 * - satisfiedORs → populated after all rows processed (relationship array)
 * - visibility: 'NETWORK', drg: 'RRT' (hardcoded)
 *
 * External ID Format:
 * -------------------
 * - ON: oc:rrt/{title_normalized}
 * - OR: or:rrt/{title_normalized}
 * - OC: oc:rrt/{title_normalized}
 *
 * Stakeholder Mapping:
 * --------------------
 * Excel values mapped to external IDs via STAKEHOLDER_SYNONYM_MAP:
 * - 'NM' / 'NMOC' → stakeholder:nm / stakeholder:nmoc
 * - 'ANSP' / 'ANSPs' → stakeholder:ansp
 * - 'FMP' / 'FMPs' → stakeholder:fmp
 * - 'AO' → stakeholder:ao
 * - 'External Users' → ignored
 * - Comma and slash delimiters handled (',', '/')
 *
 * IGNORED COLUMNS:
 * ----------------
 * The following columns are intentionally not imported:
 * - 'Contribution (e.g.CONOPS)'
 * - 'Priority'
 * - 'Date'
 * - 'Originator'
 * - 'Dependencies'
 * - 'Impacted Services'
 * - 'Main Topic'
 * - 'Target maturity'
 * - 'Target implementation'
 * - 'Reviewer'
 *
 * RELATIONSHIPS:
 * --------------
 * - ON → OR: One-to-many (ON.externalId stored in OR.implementedONs)
 * - OC → OR: One-to-many (OR.externalId stored in OC.satisfiedORs)
 */
class ReroutingMapper extends Mapper {
    /**
     * Map of stakeholder synonyms to external IDs
     * Keys: variations found in Excel (including plural forms)
     * Values: external IDs in the ODP system
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        'NM': 'stakeholder:nm',
        'NMOC': 'stakeholder:nmoc',
        'ANSP': 'stakeholder:ansp',
        'ANSPs': 'stakeholder:ansp',
        'FMP': 'stakeholder:fmp',
        'FMPs': 'stakeholder:fmp',
        'AO': 'stakeholder:ao'
        // 'External Users' is ignored
    };

    /**
     * Map raw extracted Excel data to structured import format
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('ReroutingMapper: Processing raw data from Excel extraction');

        const result = this._processNMRRSheet(rawData);

        console.log(`Mapped ${result.needs.length} needs (ONs), ${result.requirements.length} requirements (ORs), and ${result.changes.length} changes (OCs) from NM-RR sheet`);

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
     * Process NM-RR sheet and extract ONs, ORs, and OCs
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} { needs: [], requirements: [], changes: [] }
     * @private
     */
    _processNMRRSheet(rawData) {
        const needsMap = new Map(); // Map<externalId, ON>
        const changesMap = new Map(); // Map<externalId, OC>
        const requirements = [];

        // Internal ID to External ID mappings
        const onIdToExternalId = new Map(); // Map<ON_ID, externalId>
        const ocIdToExternalId = new Map(); // Map<OC_ID, externalId>

        // Track OC -> OR relationships (using external IDs)
        const ocToOrMap = new Map(); // Map<ocExternalId, Set<orExternalId>>

        // Find NM-RR sheet
        const nmrrSheet = (rawData.sheets || []).find(sheet =>
            sheet.name === 'NM-RR'
        );

        if (!nmrrSheet) {
            console.warn('WARNING: NM-RR sheet not found in Excel workbook');
            return { needs: [], requirements: [], changes: [] };
        }

        console.log(`Found NM-RR sheet with ${nmrrSheet.rows.length} rows`);

        // Process each row
        for (const row of nmrrSheet.rows) {
            const requirement = this._processNMRRRow(
                row,
                needsMap,
                changesMap,
                ocToOrMap,
                onIdToExternalId,
                ocIdToExternalId
            );
            if (requirement) {
                requirements.push(requirement);
            }
        }

        // Now populate satisfiedORs for each OC
        for (const [ocExternalId, orExternalIds] of ocToOrMap.entries()) {
            const oc = changesMap.get(ocExternalId);
            if (oc) {
                oc.satisfiedORs = Array.from(orExternalIds);
            }
        }

        console.log(`Mapped ${needsMap.size} needs (ONs), ${requirements.length} requirements (ORs), and ${changesMap.size} changes (OCs)`);
        console.log(`OC-OR relationships: ${ocToOrMap.size} OCs linked to ORs`);

        return {
            needs: Array.from(needsMap.values()),
            requirements: requirements,
            changes: Array.from(changesMap.values())
        };
    }

    /**
     * Process a single row from NM-RR sheet
     * Extracts ON (if new), OC (if new), and OR
     * @param {Object} row - Row object with column headers as keys
     * @param {Map} needsMap - Map of ON externalId -> ON object
     * @param {Map} changesMap - Map of OC externalId -> OC object
     * @param {Map} ocToOrMap - Map of OC externalId -> Set of OR externalIds
     * @param {Map} onIdToExternalId - Map of ON internal ID -> external ID
     * @param {Map} ocIdToExternalId - Map of OC internal ID -> external ID
     * @returns {Object|null} Requirement object or null if invalid
     * @private
     */
    _processNMRRRow(row, needsMap, changesMap, ocToOrMap, onIdToExternalId, ocIdToExternalId) {
        // Extract ON ID from column A
        const onId = row['ON ID'];
        let onExternalId = null;

        if (onId && onId.trim() !== '') {
            const normalizedOnId = onId.trim();

            // Check if we already processed this ON
            if (onIdToExternalId.has(normalizedOnId)) {
                onExternalId = onIdToExternalId.get(normalizedOnId);
            } else {
                // Extract the full ON object
                const need = this._extractNeed(row);
                if (need) {
                    onExternalId = need.externalId;
                    // Store in both maps
                    needsMap.set(onExternalId, need);
                    onIdToExternalId.set(normalizedOnId, onExternalId);
                }
            }
        }

        // Extract OC ID from OC ID column
        const ocId = row['OC ID'];
        let ocExternalId = null;

        if (ocId && ocId.trim() !== '') {
            const normalizedOcId = this._cleanOcId(ocId.trim());

            // Check if we already processed this OC
            if (ocIdToExternalId.has(normalizedOcId)) {
                ocExternalId = ocIdToExternalId.get(normalizedOcId);
            } else {
                // Extract the full OC object
                const change = this._extractChange(row);
                if (change) {
                    ocExternalId = change.externalId;
                    // Initialize with empty satisfiedORs array
                    change.satisfiedORs = [];
                    // Store in both maps
                    changesMap.set(ocExternalId, change);
                    ocIdToExternalId.set(normalizedOcId, ocExternalId);
                }
            }

            // Initialize the Set for this OC if not exists
            if (ocExternalId && !ocToOrMap.has(ocExternalId)) {
                ocToOrMap.set(ocExternalId, new Set());
            }
        }

        // Skip rows without RR ID
        if (!row['RR ID'] || row['RR ID'].trim() === '') {
            return null;
        }

        // Build the OR object
        const requirement = this._extractRequirement(row);
        if (!requirement) {
            return null;
        }

        // Track OC -> OR relationship if OC exists
        if (ocExternalId && requirement.externalId) {
            ocToOrMap.get(ocExternalId).add(requirement.externalId);
        }

        // Add ON reference if exists
        if (onExternalId) {
            requirement.implementedONs = [onExternalId];
        }

        return requirement;
    }

    /**
     * Clean OC ID by removing 'RR-OC-' prefix if present
     * @param {string} ocId - Raw OC ID from Excel
     * @returns {string} Cleaned OC ID
     * @private
     */
    _cleanOcId(ocId) {
        return ocId.startsWith('RR-OC-') ? ocId.substring(6) : ocId;
    }

    /**
     * Extract ON (Operational Need) from row
     * @param {Object} row - Row object
     * @returns {Object|null} ON object with externalId, title, statement, rationale
     * @private
     */
    _extractNeed(row) {
        const onTitle = row['ON'];
        const onDefinition = row['ON Definition'];

        if (!onTitle) {
            return null;
        }

        const { statement, rationale } = this._extractNeedDefinition(onDefinition);

        // Build object first
        const need = {
            type: 'ON',
            drg: 'RRT',
            title: onTitle.trim(),
            statement: statement,
            rationale: rationale
        };

        // Add external ID using the complete object (no path needed)
        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    /**
     * Extract statement and rationale from ON Definition
     * Parses "What:", "Why:", "Focus:" sections
     * @param {string} definition - ON Definition text
     * @returns {Object} { statement, rationale }
     * @private
     */
    _extractNeedDefinition(definition) {
        if (!definition || definition.trim() === '') {
            return { statement: null, rationale: null };
        }

        const text = definition.trim();

        // Find positions of key markers
        const whatPos = text.indexOf('What:');
        const whyPos = text.indexOf('Why:');
        const focusPos = text.indexOf('Focus:');

        let statement = null;
        let rationale = null;

        // Extract "What:" section
        if (whatPos !== -1) {
            let whatEnd = text.length;

            // Find where "What:" ends (at "Why:" or "Focus:", whichever comes first)
            if (whyPos !== -1 && whyPos > whatPos) {
                whatEnd = whyPos;
            }
            if (focusPos !== -1 && focusPos > whatPos && focusPos < whatEnd) {
                whatEnd = focusPos;
            }

            const whatText = text.substring(whatPos + 5, whatEnd).trim();
            statement = whatText;

            // If "Focus:" present, append it to statement in a separate paragraph
            if (focusPos !== -1) {
                const focusText = text.substring(focusPos + 6).trim();
                if (focusText) {
                    statement = `${whatText}\n\nFocus:\n\n${focusText}`;
                }
            }
        }

        // Extract "Why:" section
        if (whyPos !== -1) {
            let whyEnd = text.length;

            // Find where "Why:" ends (at "Focus:" if it comes after "Why:")
            if (focusPos !== -1 && focusPos > whyPos) {
                whyEnd = focusPos;
            }

            const whyText = text.substring(whyPos + 4, whyEnd).trim();
            rationale = whyText;
        }

        return { statement, rationale };
    }

    /**
     * Extract OC (Operational Change) from row
     * @param {Object} row - Row object
     * @returns {Object|null} OC object with externalId, title, purpose, details, and satisfiedORs array
     * @private
     */
    _extractChange(row) {
        const ocName = row['OC Name'];
        const ocDescription = row['OC Description'];

        if (!ocName) {
            return null;
        }

        const { purpose, details } = this._extractChangeDescription(ocDescription);

        // Build object first
        const change = {
            drg: 'RRT',
            title: ocName.trim(),
            purpose: purpose,
            visibility: 'NETWORK',
            details: details,
            satisfiedORs: [] // Will be populated after all rows are processed
        };

        // Add external ID using the complete object (no path needed)
        change.externalId = ExternalIdBuilder.buildExternalId(change, 'oc');

        return change;
    }

    /**
     * Extract purpose and details from OC Description
     * Text before "In essence:" → details
     * Text after "In essence:" → purpose
     * @param {string} description - OC Description text
     * @returns {Object} { purpose, details }
     * @private
     */
    _extractChangeDescription(description) {
        if (!description || description.trim() === '') {
            return { purpose: null, details: null };
        }

        const text = description.trim();
        const inEssencePos = text.indexOf('In essence:');

        let purpose = null;
        let details = null;

        if (inEssencePos !== -1) {
            // Text before "In essence:" goes to details
            details = text.substring(0, inEssencePos).trim();

            // Text after "In essence:" goes to purpose
            purpose = text.substring(inEssencePos + 11).trim();
        } else {
            // No "In essence:" found, put everything in details
            details = text;
        }

        return { purpose, details };
    }

    /**
     * Extract OR (Operational Requirement) from row
     * @param {Object} row - Row object
     * @returns {Object|null} OR object
     * @private
     */
    _extractRequirement(row) {
        const title = row['Title'];

        if (!title) {
            return null;
        }

        // Parse stakeholders
        const impactsStakeholderCategories = this._parseStakeholders(row['Stakeholders']);

        // Build object first
        const requirement = {
            type: 'OR',
            drg: 'RRT',
            title: title.trim(),
            statement: this._extractRequirementStatement(row),
            rationale: this._extractRequirementRationale(row),
            flows: this._extractRequirementFlows(row),
            privateNotes: this._extractRequirementPrivateNotes(row),
            implementedONs: [],  // Will be populated by caller
            impactsStakeholderCategories: impactsStakeholderCategories
        };

        // Add external ID using the complete object (no path needed)
        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, 'or');

        return requirement;
    }

    /**
     * Extract statement from row
     * Appends Fit Criteria if present
     * @param {Object} row - Row object
     * @returns {string|null} Statement text
     * @private
     */
    _extractRequirementStatement(row) {
        const statement = row['What (Detailed Requirement)'];
        const fitCriteria = row['Fit Criteria'];

        if (!statement && !fitCriteria) {
            return null;
        }

        let result = statement || '';

        // Append Fit Criteria if present
        if (fitCriteria && fitCriteria.trim() !== '') {
            if (result) {
                result += '\n\nFit Criteria:\n\n' + fitCriteria.trim();
            } else {
                result = 'Fit Criteria:\n\n' + fitCriteria.trim();
            }
        }

        return result || null;
    }

    /**
     * Extract rationale from row
     * Appends Opportunities/Risks if present
     * @param {Object} row - Row object
     * @returns {string|null} Rationale text
     * @private
     */
    _extractRequirementRationale(row) {
        const rationale = row['Why (Rationale)'];
        const opportunitiesRisks = row['Opportunities/Risks'];

        if (!rationale && !opportunitiesRisks) {
            return null;
        }

        let result = rationale || '';

        // Append Opportunities/Risks if present
        if (opportunitiesRisks && opportunitiesRisks.trim() !== '') {
            if (result) {
                result += '\n\nOpportunities/Risks:\n\n' + opportunitiesRisks.trim();
            } else {
                result = 'Opportunities/Risks:\n\n' + opportunitiesRisks.trim();
            }
        }

        return result || null;
    }

    /**
     * Extract flows from row
     * Uses Use Case as content
     * @param {Object} row - Row object
     * @returns {string|null} Flows text
     * @private
     */
    _extractRequirementFlows(row) {
        const useCase = row['Use Case'];

        if (!useCase || useCase.trim() === '') {
            return null;
        }

        return 'Use Case:\n\n' + useCase.trim();
    }

    /**
     * Extract private notes from row
     * Includes Comments and Data (and other Enabler) sections
     * @param {Object} row - Row object
     * @returns {string|null} Private notes text
     * @private
     */
    _extractRequirementPrivateNotes(row) {
        const comments = row['Comments'];
        const dataEnablers = row['Data (and other Enabler)'];

        if (!comments && !dataEnablers) {
            return null;
        }

        let result = '';

        // Add Comments section if present
        if (comments && comments.trim() !== '') {
            result = `Comments:\n\n${comments.trim()}`;
        }

        // Add Data section if present
        if (dataEnablers && dataEnablers.trim() !== '') {
            if (result) {
                result += '\n\n---\n\nData (and other Enabler):\n\n' + dataEnablers.trim();
            } else {
                result = 'Data (and other Enabler):\n\n' + dataEnablers.trim();
            }
        }

        return result || null;
    }

    /**
     * Parse stakeholders column and map to external IDs
     * @param {string} stakeholdersText - Comma-separated stakeholder text from Excel
     * @returns {Array<string>} Array of unique stakeholder external IDs
     * @private
     */
    _parseStakeholders(stakeholdersText) {
        if (!stakeholdersText || stakeholdersText.trim() === '') {
            return [];
        }

        const stakeholderIds = new Set();

        // Split by comma and slash
        const tokens = stakeholdersText.split(/[,/]/).map(t => t.trim()).filter(t => t);

        for (const token of tokens) {
            // Skip 'External Users'
            if (token === 'External Users') {
                continue;
            }

            const externalId = ReroutingMapper.STAKEHOLDER_SYNONYM_MAP[token];

            if (externalId) {
                stakeholderIds.add(externalId);
            } else {
                console.warn(`Unknown stakeholder token: "${token}" in text: "${stakeholdersText}"`);
            }
        }

        return Array.from(stakeholderIds).sort();
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

export default ReroutingMapper;