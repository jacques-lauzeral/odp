import Mapper from './Mapper.js';

/**
 * Mapper for REROUTING Excel documents
 * Transforms tabular sheet structure into ODP entities
 */
class ReroutingMapper extends Mapper {
    /**
     * Map raw extracted Excel data to structured import format
     * @param {Object} rawData - RawExtractedData from XlsxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('ReroutingMapper: Processing raw data from Excel extraction');

        const { needs, requirements, changes } = this._processNMRRSheet(rawData);

        console.log(`Mapped ${needs.length} needs (ONs), ${requirements.length} requirements (ORs), and ${changes.length} changes (OCs) from NM-RR sheet`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: [...needs, ...requirements],
            changes: [...changes]
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
            const requirement = this._processNMRRRow(row, needsMap, changesMap);
            if (requirement) {
                requirements.push(requirement);
            }
        }

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
     * @returns {Object|null} Requirement object or null if invalid
     * @private
     */
    _processNMRRRow(row, needsMap, changesMap) {
        // Extract ON ID from column A
        const onId = row['ON ID'];
        let onExternalId = null;

        if (onId && onId.trim() !== '') {
            onExternalId = this._buildExternalId(onId, 'ON');

            // If not already in map, extract and add
            if (!needsMap.has(onExternalId)) {
                const need = this._extractNeed(row);
                if (need) {
                    needsMap.set(onExternalId, need);
                }
            }
        }

        // Extract OC ID from OC ID column
        const ocId = row['OC ID'];

        if (ocId && ocId.trim() !== '') {
            const ocExternalId = this._buildExternalId(ocId, 'OC');

            // If not already in map, extract and add
            if (!changesMap.has(ocExternalId)) {
                const change = this._extractChange(row);
                if (change) {
                    changesMap.set(ocExternalId, change);
                }
            }
        }

        // Skip rows without RR ID
        if (!row['RR ID'] || row['RR ID'].trim() === '') {
            return null;
        }

        return {
            externalId: this._buildExternalId(row['RR ID'], 'OR'),
            type: 'OR',
            drg: 'RRT',
            title: row['Title'] || '',
            statement: this._extractRequirementStatement(row),
            rationale: this._extractRequirementRationale(row),
            flows: this._extractRequirementFlows(row),
            privateNotes: this._extractRequirementPrivateNotes(row),
            implementedONs: onExternalId ? [onExternalId] : []
        };
    }

    /**
     * Build external ID from ID and type
     * @param {string} id - Numeric ID (ON ID, RR ID, or OC ID)
     * @param {string} type - 'ON', 'OR', or 'OC'
     * @returns {string} External ID with appropriate prefix
     * @private
     */
    _buildExternalId(id, type) {
        let normalized = id.trim();

        // Remove 'RR-OC-' prefix for OC IDs
        if (type === 'OC' && normalized.startsWith('RR-OC-')) {
            normalized = normalized.substring(6);
        }

        const prefix = type === 'ON' ? 'on:rrt-' :
            type === 'OR' ? 'or:rrt-' :
                'oc:rrt-';
        return `${prefix}${normalized}`;
    }

    /**
     * Extract ON (Operational Need) from row
     * @param {Object} row - Row object
     * @returns {Object|null} ON object with externalId, title, statement, rationale
     * @private
     */
    _extractNeed(row) {
        const onId = row['ON ID'];
        const onTitle = row['ON'];
        const onDefinition = row['ON Definition'];

        if (!onId || !onTitle) {
            return null;
        }

        const externalId = this._buildExternalId(onId, 'ON');
        const { statement, rationale } = this._extractNeedDefinition(onDefinition);

        return {
            externalId: externalId,
            type: 'ON',
            title: onTitle.trim(),
            statement: statement,
            rationale: rationale
        };
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
     * @returns {Object|null} OC object with externalId, title, purpose, details
     * @private
     */
    _extractChange(row) {
        const ocId = row['OC ID'];
        const ocName = row['OC Name'];
        const ocDescription = row['OC Description'];

        if (!ocId || !ocName) {
            return null;
        }

        const externalId = this._buildExternalId(ocId, 'OC');
        const { purpose, details } = this._extractChangeDescription(ocDescription);

        return {
            externalId: externalId,
            title: ocName.trim(),
            purpose: purpose,
            visibility: 'NETWORK',
            drg: 'RRT',
            details: details
        };
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
     * @param {Object} row - Row object
     * @returns {string|null} Private notes text
     * @private
     */
    _extractRequirementPrivateNotes(row) {
        const comments = row['Comments'];
        if (!comments || comments.trim() === '') {
            return null;
        }
        return `Comments:\n\n${comments}`;
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