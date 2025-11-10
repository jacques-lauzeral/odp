import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

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
 * - 'Target maturity' → M1 milestone (API_PUBLICATION, wave:YYYY)
 * - 'Target implementation' → M2 milestone (OPS_DEPLOYMENT, wave:YYYY)
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
 * - 'NM' / 'NMOC' → stakeholder:network/nm / stakeholder:network/nm/nmoc
 * - 'ANSP' / 'ANSPs' → stakeholder:network/ansp
 * - 'FMP' / 'FMPs' → stakeholder:network/ansp/fmp
 * - 'AO' → stakeholder:network/airspace_user/ao
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
        'NM': 'stakeholder:network/nm',
        'NMOC': 'stakeholder:network/nm/nmoc',
        'ANSP': 'stakeholder:network/ansp',
        'ANSPs': 'stakeholder:network/ansp',
        'FMP': 'stakeholder:network/ansp/fmp',
        'FMPs': 'stakeholder:network/ansp/fmp',
        'AO': 'stakeholder:network/airspace_user/ao'
        // 'External Users' is ignored
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
        let need = null;

        if (onId && onId.trim() !== '') {
            const normalizedOnId = onId.trim();

            // Check if we already processed this ON
            if (onIdToExternalId.has(normalizedOnId)) {
                onExternalId = onIdToExternalId.get(normalizedOnId);
                // Retrieve ON from needsMap
                need = needsMap.get(onExternalId);
            } else {
                // Extract the full ON object
                need = this._extractNeed(row);
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
                    // Store in both maps
                    changesMap.set(ocExternalId, change);
                    ocIdToExternalId.set(normalizedOcId, ocExternalId);
                }
            }
        }

        // Extract the OR (Operational Requirement), passing the need for path inheritance
        const requirement = this._extractRequirement(row, need);

        if (!requirement) {
            return null;
        }

        // Link OR -> ON
        if (onExternalId) {
            requirement.implementedONs = [onExternalId];
        }

        // Track OC -> OR relationship (for later processing)
        if (ocExternalId) {
            if (!ocToOrMap.has(ocExternalId)) {
                ocToOrMap.set(ocExternalId, new Set());
            }
            ocToOrMap.get(ocExternalId).add(requirement.externalId);
        }

        return requirement;
    }

    /**
     * Clean OC ID by removing 'RR-OC-' prefix
     * @param {string} ocId - Raw OC ID from Excel
     * @returns {string} Cleaned OC ID
     * @private
     */
    _cleanOcId(ocId) {
        if (ocId.startsWith('RR-OC-')) {
            return ocId.substring(6);
        }
        return ocId;
    }

    /**
     * Extract ON (Operational Need) from row
     * @param {Object} row - Row object
     * @returns {Object|null} ON object
     * @private
     */
    _extractNeed(row) {
        const onTitle = row['ON'];
        const onDefinition = row['ON Definition'];

        if (!onTitle || !onDefinition) {
            return null;
        }

        const { statement, rationale } = this._extractNeedStatementAndRationale(onDefinition);

        // Build object first
        const need = {
            type: 'ON',
            drg: 'RRT',
            title: onTitle.trim(),
            path: [onTitle.trim()],
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale)
        };

        // Add external ID using the complete object (no path needed)
        need.externalId = ExternalIdBuilder.buildExternalId(need, 'on');

        return need;
    }

    /**
     * Extract statement and rationale from ON Definition
     * Parses structured text with "What:", "Why:", and "Focus:" sections
     * @param {string} definition - ON Definition text from Excel
     * @returns {Object} { statement, rationale }
     * @private
     */
    _extractNeedStatementAndRationale(definition) {
        let statement = null;
        let rationale = null;

        if (!definition || definition.trim() === '') {
            return { statement, rationale };
        }

        const text = definition.trim();

        // Extract "What:" section
        const whatMatch = text.match(/What:\s*([\s\S]*?)(?=Why:|Focus:|$)/i);
        if (whatMatch) {
            statement = whatMatch[1].trim();
        }

        // Extract "Why:" section
        const whyMatch = text.match(/Why:\s*([\s\S]*?)(?=Focus:|$)/i);
        if (whyMatch) {
            rationale = whyMatch[1].trim();
        }

        // Extract "Focus:" section and append to statement
        const focusMatch = text.match(/Focus:\s*([\s\S]*?)$/i);
        if (focusMatch) {
            const focus = focusMatch[1].trim();
            if (statement) {
                statement += '\n\n**Focus:**\n\n' + focus;
            } else {
                statement = '**Focus:**\n\n' + focus;
            }
        }

        return { statement, rationale };
    }

    /**
     * Extract OC (Operational Change) from row
     * @param {Object} row - Row object
     * @returns {Object|null} OC object
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
            visibility: 'NETWORK',
            title: ocName.trim(),
            purpose: this.converter.asciidocToDelta(purpose),
            details: this.converter.asciidocToDelta(details),
            satisfiedORs: [],  // Will be populated after all rows processed
            milestones: this._extractMilestones(row)
        };

        // Add external ID using the complete object (no path needed)
        change.externalId = ExternalIdBuilder.buildExternalId(change, 'oc');

        return change;
    }

    /**
     * Extract milestones from Target maturity and Target implementation columns
     * @param {Object} row - Row object
     * @returns {Array} Array of milestone objects
     * @private
     */
    _extractMilestones(row) {
        const milestones = [];

        // M1 - API Publication from Target maturity
        const targetMaturity = row['Target maturity'];
        if (targetMaturity) {
            const year = this._parseYear(targetMaturity);
            if (year) {
                milestones.push({
                    title: 'M1',
                    wave: `wave:${year}`,
                    eventTypes: ['API_PUBLICATION']
                });
            }
        }

        // M2 - OPS Deployment from Target implementation
        const targetImplementation = row['Target implementation'];
        if (targetImplementation) {
            const year = this._parseYear(targetImplementation);
            if (year) {
                milestones.push({
                    title: 'M2',
                    wave: `wave:${year}`,
                    eventTypes: ['OPS_DEPLOYMENT']
                });
            }
        }

        return milestones;
    }

    /**
     * Parse year from date string
     * Handles various date formats and returns 4-digit year
     * @param {string|number} dateValue - Date value from Excel
     * @returns {string|null} 4-digit year or null if invalid
     * @private
     */
    _parseYear(dateValue) {
        if (!dateValue) {
            return null;
        }

        const value = String(dateValue).trim();

        // Try to extract 4-digit year
        const yearMatch = value.match(/\b(20\d{2})\b/);
        if (yearMatch) {
            return yearMatch[1];
        }

        // Try to extract 2-digit year and convert to 4-digit
        const shortYearMatch = value.match(/\b(\d{2})\b/);
        if (shortYearMatch) {
            const shortYear = parseInt(shortYearMatch[1], 10);
            // Assume 20xx for years 00-99
            return `20${shortYear.toString().padStart(2, '0')}`;
        }

        return null;
    }

    /**
     * Parse OC Description into purpose and details
     * Text before "In essence:" → details
     * Text after "In essence:" → purpose
     * @param {string} description - OC Description from Excel
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
     * @param {Object|null} need - ON object to inherit path from
     * @returns {Object|null} OR object
     * @private
     */
    _extractRequirement(row, need = null) {
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
            path: need ? need.path : undefined,
            statement: this.converter.asciidocToDelta(this._extractRequirementStatement(row)),
            rationale: this.converter.asciidocToDelta(this._extractRequirementRationale(row)),
            flows: this.converter.asciidocToDelta(this._extractRequirementFlows(row)),
            privateNotes: this.converter.asciidocToDelta(this._extractRequirementPrivateNotes(row)),
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
                result += '\n\n**Fit Criteria:**\n\n' + fitCriteria.trim();
            } else {
                result = '**Fit Criteria:**\n\n' + fitCriteria.trim();
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
                result += '\n\n**Opportunities/Risks:**\n\n' + opportunitiesRisks.trim();
            } else {
                result = '**Opportunities/Risks:**\n\n' + opportunitiesRisks.trim();
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
            result = `**Comments:**\n\n${comments.trim()}`;
        }

        // Add Data section if present
        if (dataEnablers && dataEnablers.trim() !== '') {
            if (result) {
                result += '\n\n---\n\n**Data (and other Enabler):**\n\n' + dataEnablers.trim();
            } else {
                result = '**Data (and other Enabler):**\n\n' + dataEnablers.trim();
            }
        }

        return result || null;
    }

    /**
     * Parse stakeholders column and map to reference objects
     * @param {string} stakeholdersText - Comma-separated stakeholder text from Excel
     * @returns {Array<{externalId: string}>} Array of unique stakeholder references
     * @private
     */
    _parseStakeholders(stakeholdersText) {
        if (!stakeholdersText || stakeholdersText.trim() === '') {
            return [];
        }

        const stakeholderRefs = [];
        const seenIds = new Set();  // Track duplicates

        // Split by comma and slash
        const tokens = stakeholdersText.split(/[,/]/).map(t => t.trim()).filter(t => t);

        for (const token of tokens) {
            // Skip 'External Users'
            if (token === 'External Users') {
                continue;
            }

            const externalId = ReroutingMapper.STAKEHOLDER_SYNONYM_MAP[token];

            if (externalId) {
                // Avoid duplicates
                if (!seenIds.has(externalId)) {
                    stakeholderRefs.push({ externalId });
                    seenIds.add(externalId);
                }
            } else {
                console.warn(`Unknown stakeholder token: "${token}" in text: "${stakeholdersText}"`);
            }
        }

        return stakeholderRefs;
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