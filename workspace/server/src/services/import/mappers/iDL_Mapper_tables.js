import Mapper from '../Mapper.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for iDL table-based Word documents (AURA, HMI, IAM, MAP, TCF, TCT, NFR, LoA, etc.)
 * Transforms paragraph/table structure into ODP entities
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Entity Detection Pattern:
 * -------------------------
 * Entities are identified by bold markers in paragraphs or table cells:
 * - `**ON #:**` followed by code → Operational Need
 * - `**OR #:**` followed by code → Operational Requirement
 * - `**UC #:**` followed by code → Use Case (flows injected into referenced ON)
 *
 * Code Pattern:
 * -------------
 * - Format: `iDL-{TYPE}-{FOLDER_NUM}-{SEQ}` (e.g., iDL-ON-10-01, iDL-OR-10-05)
 * - TYPE: ON, OR, UC
 * - FOLDER_NUM: 2-digit number identifying the folder/domain
 * - SEQ: 2-digit sequence number within the folder
 *
 * Data Formats:
 * -------------
 * 1. **Paragraph format**: Sequential paragraphs with `**Field:**` markers
 *    - Each field on its own line or following paragraph
 *    - Entity ends at next entity marker or end of section
 *
 * 2. **2-column table format**: Field name in column 1, value in column 2
 *    - Row: [`**Field:**`, `value`]
 *
 * 3. **4-column table format**: Two key-value pairs per row
 *    - Row: [`**Field1:**`, `value1`, `**Field2:**`, `value2`]
 *    - Common for compact OR templates
 *
 * Field Mapping:
 * --------------
 * | Source Field              | Target Field              | Notes                          |
 * |---------------------------|---------------------------|--------------------------------|
 * | ON #: / OR #: / UC #:     | externalId (code)         | Direct code as externalId      |
 * | Title:                    | title                     |                                |
 * | Need Statement:           | statement                 | ON only, rich text             |
 * | Detailed Requirement:     | statement                 | OR only, rich text             |
 * | Rationale:                | rationale                 | Rich text                      |
 * | Fit Criteria:             | statement                 | Appended to statement          |
 * | Opportunities/Risks:      | rationale                 | Appended to rationale          |
 * | Opportunities:            | rationale                 | Appended to rationale          |
 * | Risks:                    | rationale                 | Appended to rationale          |
 * | Flow of Actions:          | flows                     | UC only → injected into ON     |
 * | ON Reference:             | implementedONs            | OR: resolved to ON externalId  |
 * |                           | (UC: target for flows)    | UC: identifies target ON       |
 * | Stakeholders:             | impactsStakeholderCategories | Resolved via synonym map   |
 * | Data (and other Enablers):| privateNotes              | Appended to notes              |
 * | Impacted Services:        | privateNotes              | Appended to notes              |
 * | Dependencies:             | privateNotes              | Appended to notes              |
 * | Notes:                    | flows                     | UC only, appended as "NOTE:"   |
 * | Date:                     | privateNotes              | Metadata, appended             |
 * | Originator:               | privateNotes              | Metadata, appended             |
 *
 * Use Case Handling:
 * ------------------
 * - UC entities are NOT imported as separate requirements
 * - UC content is injected into the referenced ON's `flows` field:
 *   - UC title as bold paragraph header
 *   - UC's `Flow of Actions:` as paragraph body
 *   - UC's `Notes:` appended with "NOTE:" prefix
 * - Multiple UCs can reference the same ON (flows concatenated with separator)
 *
 * External ID Format:
 * -------------------
 * - Direct code from document: `iDL-ON-10-01`, `iDL-OR-10-05`
 * - No path-based construction (unlike iDL_Mapper_sections)
 *
 * Path Construction:
 * ------------------
 * - path = [folder] (e.g., ["AURA"], ["TCF"], ["HMI"])
 * - Folder provided via options.folder parameter
 *
 * Stakeholder Resolution:
 * -----------------------
 * - Raw text parsed from bullet lists
 * - Resolved via STAKEHOLDER_SYNONYMS map to externalIds
 * - Unresolved stakeholders logged as warnings
 *
 * Empty Entity Handling:
 * ----------------------
 * - Entities skipped when both Title AND Statement/Requirement are empty
 * - Common in template placeholder tables at end of documents
 *
 * IGNORED CONTENT:
 * ----------------
 * - Introductory text before first entity marker
 * - "Data Originators" stakeholder (too generic)
 * - References to "All iDL Stakeholders..." (CONOPS reference, not specific)
 * - Empty field values
 */

/**
 * Stakeholder synonym map for resolving raw text to externalIds
 * Keys are normalized (lowercase, trimmed) versions of raw text
 */
const STAKEHOLDER_SYNONYMS = {
    // NM and sub-teams
    'nm': 'stakeholder:network/nm',
    'network manager': 'stakeholder:network/nm',
    'network manager (nm)': 'stakeholder:network/nm',
    'nmoc': 'stakeholder:network/nm/nmoc',
    'network manager operation centre': 'stakeholder:network/nm/nmoc',
    'network manager operation centre (nmoc)': 'stakeholder:network/nm/nmoc',
    'network manager operations centre': 'stakeholder:network/nm/nmoc',
    'network manager operations centre (nmoc)': 'stakeholder:network/nm/nmoc',
    'nm rad team': 'stakeholder:network/nm/nm_rad_team',
    'nm rad': 'stakeholder:network/nm/nm_rad_team',
    'nmad': 'stakeholder:network/nm/nmad',
    'nm airspace data team': 'stakeholder:network/nm/nmad',
    'nm airspace data (ad) team': 'stakeholder:network/nm/nmad',
    'nm airspace design team': 'stakeholder:network/nm/nmad',
    'nm tcf team': 'stakeholder:network/nm/tcf',
    'nm tcf': 'stakeholder:network/nm/tcf',
    'nm data management & tcf': 'stakeholder:network/nm/tcf',
    'nos airspace validation team': 'stakeholder:network/nm/nmoc/nos_airspace_validation_team',
    'network operations (nos) airspace validation team': 'stakeholder:network/nm/nmoc/nos_airspace_validation_team',

    // ANSP and coordinators
    'ansp': 'stakeholder:network/ansp',
    'ansps': 'stakeholder:network/ansp',
    'air navigation service provider': 'stakeholder:network/ansp',
    'air navigation service providers': 'stakeholder:network/ansp',
    'air navigation service providers (ansps)': 'stakeholder:network/ansp',
    'nec': 'stakeholder:network/ansp/nec',
    'national env coordinator': 'stakeholder:network/ansp/nec',
    'national env coordinator (nec)': 'stakeholder:network/ansp/nec',
    'lec': 'stakeholder:network/ansp/lec',
    'local env coordinator': 'stakeholder:network/ansp/lec',
    'local env coordinator (lec)': 'stakeholder:network/ansp/lec',
    'national/local environment coordinator (nec/lec)': 'stakeholder:network/ansp/nec', // Map to NEC as primary
    'nrc': 'stakeholder:network/ansp/nrc',
    'national rad coordinator': 'stakeholder:network/ansp/nrc',
    'national rad coordinator (nrc)': 'stakeholder:network/ansp/nrc',
    'fmp': 'stakeholder:network/ansp/fmp',
    'flow management position': 'stakeholder:network/ansp/fmp',
    'amc': 'stakeholder:network/ansp/amc',
    'airspace management cell': 'stakeholder:network/ansp/amc',
    'atc unit': 'stakeholder:network/ansp/atc_unit',
    'ats unit': 'stakeholder:network/ansp/ats_unit',
    'twr': 'stakeholder:network/ansp/twr',

    // External organizations
    'icao': 'stakeholder:network/icao',
    'icao eanpg': 'stakeholder:network/icao/eanpg',
    'icao/scpg secretariat': 'stakeholder:network/scpg',
    'icao eur/scpg secretariat': 'stakeholder:network/scpg',
    'scpg': 'stakeholder:network/scpg',
    'scpg (ssr code planning group)': 'stakeholder:network/scpg',
    'ssr code planning group': 'stakeholder:network/scpg',
    'ccams users': 'stakeholder:network/ccams_users',
    'ccams operational users': 'stakeholder:network/ccams_users',
    'ccams operators': 'stakeholder:network/ccams_users',

    // Other stakeholders
    'airport operator': 'stakeholder:network/airport_operator',
    'airport operators': 'stakeholder:network/airport_operator',
    'airspace user': 'stakeholder:network/airspace_user',
    'airspace users': 'stakeholder:network/airspace_user',
    'ao': 'stakeholder:network/airspace_user/ao',
    'aircraft operator': 'stakeholder:network/airspace_user/ao',
    'cfsp': 'stakeholder:network/airspace_user/cfsp',
    'national authority': 'stakeholder:network/national_authority',
    'military': 'stakeholder:network/military',
    'easa': 'stakeholder:network/easa',
    'eaccc': 'stakeholder:network/eaccc',

    // State/ANSP variations
    'state': 'stakeholder:network/national_authority',
    'states': 'stakeholder:network/national_authority',
    'fab': 'stakeholder:network/ansp', // FAB maps to ANSP
    'state / fab / ansp': 'stakeholder:network/ansp',
    'ansps / states code coordinators': 'stakeholder:network/ansp',

    // TCF-specific
    'tcf analysts': 'stakeholder:network/nm/tcf',
    'tcf monitoring team': 'stakeholder:network/nm/tcf',
    'nm surveillance data analysis (faas)': 'stakeholder:network/nm',
    'nmoc operations': 'stakeholder:network/nm/nmoc'
};

/**
 * Fields to extract and their target mapping
 */
const FIELD_MARKERS = {
    'ON #:': { target: 'code', type: 'ON' },
    'OR #:': { target: 'code', type: 'OR' },
    'UC #:': { target: 'code', type: 'UC' },
    'Title:': { target: 'title' },
    'Date:': { target: 'date' },
    'Originator:': { target: 'originator' },
    'Need Statement:': { target: 'statement' },
    'Detailed Requirement:': { target: 'statement' },
    'Rationale:': { target: 'rationale' },
    'Flow of Actions:': { target: 'flowOfActions' },
    'ON Reference:': { target: 'onReference' },
    'Fit Criteria:': { target: 'fitCriteria' },
    'Stakeholders:': { target: 'stakeholders' },
    'Data (and other Enablers):': { target: 'dataEnablers' },
    'Impacted Services:': { target: 'impactedServices' },
    'Opportunities/Risks:': { target: 'opportunitiesRisks' },
    'Opportunities:': { target: 'opportunities' },
    'Risks:': { target: 'risks' },
    'Dependencies:': { target: 'dependencies' },
    'Notes:': { target: 'notes' }
};

class iDL_Mapper_tables extends Mapper {
    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @param {Object} options - Mapping options
     * @param {string} options.folder - Target folder (required for iDL table-based docs)
     * @returns {Object} StructuredImportData with requirements collection
     */
    map(rawData, options = {}) {
        const { folder } = options;

        if (!folder) {
            throw new Error('iDL_Mapper_tables requires folder option');
        }

        console.log(`iDL_Mapper_tables mapping raw data for folder: ${folder}`);

        const context = this._initContext(folder);

        // Parse all entities from paragraphs and tables
        this._parseEntities(rawData, context);

        // Process Use Cases - inject flows into referenced ONs
        this._processUseCases(context);

        // Resolve references (ON references in ORs, stakeholders)
        this._resolveReferences(context);

        return this._buildOutput(context);
    }

    /**
     * Initialize mapping context
     * @param {string} folder - Target folder name
     * @returns {Object} Context object
     * @private
     */
    _initContext(folder) {
        return {
            folder,
            onMap: new Map(),      // code → ON entity
            orMap: new Map(),      // code → OR entity
            ucMap: new Map(),      // code → UC entity (temporary, for flow injection)
            documentMap: new Map(),
            stakeholderCategoryMap: new Map(),
            dataCategoryMap: new Map(),
            serviceMap: new Map(),
            waveMap: new Map(),
            changeMap: new Map(),
            warnings: []
        };
    }

    /**
     * Parse all entities from document sections
     * @param {Object} rawData - Raw extracted data
     * @param {Object} context - Mapping context
     * @private
     */
    _parseEntities(rawData, context) {
        for (const section of rawData.sections || []) {
            // Process paragraphs
            if (section.content?.paragraphs) {
                this._parseParagraphs(section.content.paragraphs, context);
            }

            // Process tables
            if (section.content?.tables) {
                for (const table of section.content.tables) {
                    this._parseTable(table, context);
                }
            }
        }

        console.log(`Parsed: ${context.onMap.size} ONs, ${context.orMap.size} ORs, ${context.ucMap.size} UCs`);
    }

    /**
     * Parse entities from paragraph sequence
     * @param {string[]} paragraphs - Array of paragraph strings
     * @param {Object} context - Mapping context
     * @private
     */
    _parseParagraphs(paragraphs, context) {
        let currentEntity = null;
        let currentField = null;
        let fieldContent = [];

        const saveField = () => {
            if (currentEntity && currentField && fieldContent.length > 0) {
                const content = fieldContent.join('\n').trim();
                if (content) {
                    currentEntity.fields[currentField] = content;
                }
            }
            fieldContent = [];
        };

        const saveEntity = () => {
            saveField();
            if (currentEntity && currentEntity.fields.code) {
                this._storeEntity(currentEntity, context);
            }
            currentEntity = null;
            currentField = null;
        };

        for (const para of paragraphs) {
            const trimmed = para.trim();

            // Check for entity start marker
            const entityMarker = this._detectEntityMarker(trimmed);
            if (entityMarker) {
                saveEntity();
                currentEntity = {
                    type: entityMarker.type,
                    fields: {}
                };
                // Extract code from same line
                const codeMatch = trimmed.match(/iDL-(?:ON|OR|UC)-\d{2}-\d{2}/);
                if (codeMatch) {
                    currentEntity.fields.code = codeMatch[0];
                }
                // Set currentField to 'code' so next paragraph can provide it if not on same line
                currentField = codeMatch ? null : 'code';
                continue;
            }

            // Check if this paragraph is just a code (for when code is on separate line from marker)
            if (currentEntity && currentField === 'code') {
                const codeMatch = trimmed.match(/iDL-(?:ON|OR|UC)-\d{2}-\d{2}/);
                if (codeMatch) {
                    currentEntity.fields.code = codeMatch[0];
                    currentField = null;
                    continue;
                }
            }

            // Check for field marker
            const fieldMarker = this._detectFieldMarker(trimmed);
            if (fieldMarker && currentEntity) {
                saveField();
                currentField = fieldMarker.target;

                // Check if value is on same line after marker
                const markerPattern = new RegExp(`\\*\\*${fieldMarker.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*`);
                const afterMarker = trimmed.replace(markerPattern, '').trim();
                if (afterMarker) {
                    fieldContent.push(afterMarker);
                }
                continue;
            }

            // Accumulate content for current field
            if (currentEntity && currentField && trimmed) {
                // Skip section header paragraphs
                if (trimmed === 'Operational Need (ON)' ||
                    trimmed === 'Operational Requirement (OR)' ||
                    trimmed === 'Use Case (UC)') {
                    continue;
                }
                fieldContent.push(trimmed);
            }
        }

        // Save last entity
        saveEntity();
    }

    /**
     * Parse entity from table
     * @param {Object} table - Table object with rows array
     * @param {Object} context - Mapping context
     * @private
     */
    _parseTable(table, context) {
        if (!table.rows || table.rows.length === 0) {
            return;
        }

        const fields = {};
        let entityType = null;

        // Determine if 2-column or 4-column format
        const columnCount = table.columnCount || table.rows[0]?.length || 2;

        for (const row of table.rows) {
            if (columnCount >= 4) {
                // 4-column format: [key1, val1, key2, val2]
                this._extractFieldsFromRow(row.slice(0, 2), fields, (type) => { entityType = entityType || type; });
                this._extractFieldsFromRow(row.slice(2, 4), fields, (type) => { entityType = entityType || type; });
            } else {
                // 2-column format: [key, val]
                this._extractFieldsFromRow(row, fields, (type) => { entityType = entityType || type; });
            }
        }

        if (entityType && fields.code) {
            this._storeEntity({ type: entityType, fields }, context);
        }
    }

    /**
     * Extract fields from a key-value row pair
     * @param {string[]} row - [key, value] pair
     * @param {Object} fields - Fields object to populate
     * @param {Function} setType - Callback to set entity type
     * @private
     */
    _extractFieldsFromRow(row, fields, setType) {
        if (!row || row.length < 1) return;

        const key = (row[0] || '').trim();
        const value = (row[1] || '').trim();

        // Check for entity type marker
        for (const [marker, config] of Object.entries(FIELD_MARKERS)) {
            const boldMarker = `**${marker}**`;
            if (key === boldMarker || key.includes(boldMarker)) {
                if (config.type) {
                    setType(config.type);
                    // Extract code from value
                    const codeMatch = value.match(/iDL-(?:ON|OR|UC)-\d{2}-\d{2}/);
                    if (codeMatch) {
                        fields.code = codeMatch[0];
                    }
                } else if (config.target && value) {
                    fields[config.target] = value;
                }
                return;
            }
        }
    }

    /**
     * Store parsed entity in appropriate map
     * @param {Object} entity - Parsed entity with type and fields
     * @param {Object} context - Mapping context
     * @private
     */
    _storeEntity(entity, context) {
        const { type, fields } = entity;
        const code = fields.code;

        if (!code) {
            return;
        }

        // Skip empty entities (template placeholders)
        if (this._isEmptyEntity(fields)) {
            console.log(`Skipping empty entity: ${code}`);
            return;
        }

        // Check if entity already exists - don't overwrite with less content
        const map = type === 'ON' ? context.onMap : (type === 'OR' ? context.orMap : context.ucMap);
        const existing = map.get(code);
        if (existing) {
            // Only overwrite if new entity has statement and existing doesn't
            const existingHasStatement = existing.statement || existing._rawFields?.statement;
            const newHasStatement = fields.statement;
            if (existingHasStatement && !newHasStatement) {
                console.log(`Skipping duplicate entity ${code} (existing has more content)`);
                return;
            }
        }

        // Build requirement object
        const req = {
            externalId: code,
            title: this._stripBoldMarkers(fields.title || ''),
            type: type === 'UC' ? 'UC' : type, // UC handled separately
            drg: 'IDL',
            path: [context.folder],
            statement: null,
            rationale: null,
            flows: null,
            privateNotes: null,
            implementedONs: [],
            impactsStakeholderCategories: [],
            _rawFields: fields // Keep for later processing
        };

        // Build statement with Fit Criteria appended
        let statementText = fields.statement || '';
        if (fields.fitCriteria) {
            statementText += '\n\n**Fit Criteria:**\n' + fields.fitCriteria;
        }

        // Build rationale with Opportunities/Risks appended
        let rationaleText = fields.rationale || '';
        if (fields.opportunitiesRisks) {
            rationaleText += '\n\n**Opportunities/Risks:**\n' + fields.opportunitiesRisks;
        }
        if (fields.opportunities) {
            rationaleText += '\n\n**Opportunities:**\n' + fields.opportunities;
        }
        if (fields.risks) {
            rationaleText += '\n\n**Risks:**\n' + fields.risks;
        }

        // Convert rich text fields
        if (statementText) {
            req.statement = this.converter.asciidocToDelta(statementText);
        }
        if (rationaleText) {
            req.rationale = this.converter.asciidocToDelta(rationaleText);
        }
        if (fields.flowOfActions) {
            req.flows = this.converter.asciidocToDelta(fields.flowOfActions);
        }

        // Build privateNotes from metadata and extra fields
        const noteParts = [];

        if (fields.date) {
            noteParts.push(`Date: ${fields.date}`);
        }
        if (fields.originator) {
            noteParts.push(`Originator: ${fields.originator}`);
        }
        if (fields.dataEnablers) {
            noteParts.push(`Data (and other Enablers):\n${fields.dataEnablers}`);
        }
        if (fields.impactedServices) {
            noteParts.push(`Impacted Services:\n${fields.impactedServices}`);
        }
        if (fields.dependencies) {
            noteParts.push(`Dependencies:\n${fields.dependencies}`);
        }

        if (noteParts.length > 0) {
            req.privateNotes = this.converter.asciidocToDelta(noteParts.join('\n\n'));
        }

        // Store raw stakeholders for later resolution
        if (fields.stakeholders) {
            req._rawStakeholders = fields.stakeholders;
        }

        // Store raw ON reference for later resolution
        if (fields.onReference) {
            req._rawOnReference = fields.onReference;
        }

        // Store in appropriate map
        if (type === 'ON') {
            context.onMap.set(code, req);
        } else if (type === 'OR') {
            context.orMap.set(code, req);
        } else if (type === 'UC') {
            context.ucMap.set(code, req);
        }
    }

    /**
     * Check if entity is empty (template placeholder)
     * @param {Object} fields - Entity fields
     * @returns {boolean} True if empty
     * @private
     */
    _isEmptyEntity(fields) {
        const hasTitle = fields.title && fields.title.trim().length > 0;
        const hasStatement = (fields.statement && fields.statement.trim().length > 0) ||
            (fields.flowOfActions && fields.flowOfActions.trim().length > 0);
        return !hasTitle && !hasStatement;
    }

    /**
     * Detect entity start marker in text
     * @param {string} text - Text to check
     * @returns {Object|null} { type: 'ON'|'OR'|'UC' } or null
     * @private
     */
    _detectEntityMarker(text) {
        if (text.includes('**ON #:**')) {
            return { type: 'ON' };
        }
        if (text.includes('**OR #:**')) {
            return { type: 'OR' };
        }
        if (text.includes('**UC #:**')) {
            return { type: 'UC' };
        }
        return null;
    }

    /**
     * Detect field marker in text
     * @param {string} text - Text to check
     * @returns {Object|null} { marker, target } or null
     * @private
     */
    _detectFieldMarker(text) {
        for (const [marker, config] of Object.entries(FIELD_MARKERS)) {
            const boldMarker = `**${marker}**`;
            if (text.includes(boldMarker)) {
                return { marker, ...config };
            }
        }
        return null;
    }

    /**
     * Process Use Cases - inject flows into referenced ONs
     * @param {Object} context - Mapping context
     * @private
     */
    _processUseCases(context) {
        for (const [code, uc] of context.ucMap) {
            const onRef = uc._rawOnReference;
            if (!onRef) {
                context.warnings.push(`UC ${code} has no ON Reference`);
                continue;
            }

            // Find target ON by code pattern
            const targetCode = this._extractOnCode(onRef);
            const targetOn = context.onMap.get(targetCode);

            if (!targetOn) {
                context.warnings.push(`UC ${code} references unknown ON: ${onRef}`);
                continue;
            }

            // Build UC flow content: bold title + flow body + optional NOTE
            const ucTitle = uc.title || code;
            let ucFlowText = `**${ucTitle}**\n\n`;

            if (uc._rawFields?.flowOfActions) {
                ucFlowText += uc._rawFields.flowOfActions;
            }

            if (uc._rawFields?.notes) {
                ucFlowText += `\n\nNOTE: ${uc._rawFields.notes}`;
            }

            const ucFlowsDelta = this.converter.asciidocToDelta(ucFlowText);

            // Inject flows into ON
            if (targetOn.flows) {
                // Parse existing flows and append UC flows
                const existingDelta = this._parseDelta(targetOn.flows);
                const newDelta = this._parseDelta(ucFlowsDelta);
                const existingOps = existingDelta.ops || [];
                const newOps = newDelta.ops || [];
                // Add separator between existing and new
                existingOps.push({ insert: '\n\n' });
                targetOn.flows = JSON.stringify({ ops: [...existingOps, ...newOps] });
            } else {
                targetOn.flows = ucFlowsDelta;
            }

            console.log(`Injected UC ${code} flows into ON ${targetCode}`);
        }
    }

    /**
     * Parse Delta from JSON string or return as-is if already object
     * @param {string|Object} delta - Delta as JSON string or object
     * @returns {Object} Delta object
     * @private
     */
    _parseDelta(delta) {
        if (typeof delta === 'string') {
            try {
                return JSON.parse(delta);
            } catch (e) {
                return { ops: [{ insert: delta }] };
            }
        }
        return delta || { ops: [] };
    }

    /**
     * Extract ON code from reference string
     * @param {string} reference - Reference string (e.g., "iDL-ON-10-01")
     * @returns {string|null} ON code or null
     * @private
     */
    _extractOnCode(reference) {
        const match = reference.match(/iDL-ON-\d{2}-\d{2}/);
        return match ? match[0] : null;
    }

    /**
     * Strip bold markers from text (e.g., "**Title**" → "Title")
     * @param {string} text - Text potentially containing bold markers
     * @returns {string} Text with bold markers removed
     * @private
     */
    _stripBoldMarkers(text) {
        if (!text) return '';
        // Remove ** markers at start and end, or paired throughout
        return text.replace(/^\*\*|\*\*$/g, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
    }

    /**
     * Append text to entity's privateNotes field
     * @param {Object} entity - Entity with privateNotes field
     * @param {string} text - Text to append
     * @private
     */
    _appendToPrivateNotes(entity, text) {
        if (!text) return;

        const addition = `\n\n${text}`;

        if (entity.privateNotes) {
            // Parse existing, append, stringify
            const existingDelta = this._parseDelta(entity.privateNotes);
            const ops = existingDelta.ops || [];
            ops.push({ insert: addition });
            entity.privateNotes = JSON.stringify({ ops });
        } else {
            entity.privateNotes = this.converter.asciidocToDelta(text);
        }
    }

    /**
     * Resolve references in entities
     * @param {Object} context - Mapping context
     * @private
     */
    _resolveReferences(context) {
        // Resolve OR → ON references
        for (const [code, or] of context.orMap) {
            if (or._rawOnReference) {
                const onCode = this._extractOnCode(or._rawOnReference);
                if (onCode && context.onMap.has(onCode)) {
                    or.implementedONs = [onCode];
                } else if (onCode) {
                    context.warnings.push(`OR ${code} references unknown ON: ${onCode}`);
                }
            }

            // Resolve stakeholders
            if (or._rawStakeholders) {
                const { resolved, unresolvedText } = this._resolveStakeholders(or._rawStakeholders, code, context);
                or.impactsStakeholderCategories = resolved;

                // Append unresolved stakeholder text to privateNotes
                if (unresolvedText) {
                    this._appendToPrivateNotes(or, `Stakeholders:\n${unresolvedText}`);
                }
            }

            // Clean up internal fields
            delete or._rawFields;
            delete or._rawStakeholders;
            delete or._rawOnReference;
        }

        // Resolve ON stakeholders
        for (const [code, on] of context.onMap) {
            if (on._rawStakeholders) {
                const { resolved, unresolvedText } = this._resolveStakeholders(on._rawStakeholders, code, context);
                on.impactsStakeholderCategories = resolved;

                // Append unresolved stakeholder text to privateNotes
                if (unresolvedText) {
                    this._appendToPrivateNotes(on, `Stakeholders:\n${unresolvedText}`);
                }
            }

            // Clean up internal fields
            delete on._rawFields;
            delete on._rawStakeholders;
            delete on._rawOnReference;
        }

        if (context.warnings.length > 0) {
            console.log('Mapping warnings:');
            for (const warning of context.warnings) {
                console.log(`  - ${warning}`);
            }
        }
    }

    /**
     * Resolve stakeholder text to externalIds
     * @param {string} rawText - Raw stakeholder text (bullet list or free text)
     * @param {string} entityCode - Entity code for logging
     * @param {Object} context - Mapping context
     * @returns {Object} { resolved: Object[], unresolvedText: string|null }
     * @private
     */
    _resolveStakeholders(rawText, entityCode, context) {
        const resolved = [];
        const seenIds = new Set();
        const unresolvedParts = [];
        const lines = rawText.split('\n');

        for (const line of lines) {
            // Remove bullet markers and trim
            let text = line.replace(/^[\s*\-•]+/, '').trim();

            if (!text) continue;

            // Capture free text references (like "All iDL Stakeholders..." or "Data Originators")
            if (text.toLowerCase().includes('all idl stakeholders') ||
                text.toLowerCase() === 'data originators') {
                unresolvedParts.push(text);
                continue;
            }

            // Normalize and lookup
            const normalized = text.toLowerCase().trim();
            const externalId = STAKEHOLDER_SYNONYMS[normalized];

            if (externalId) {
                if (!seenIds.has(externalId)) {
                    seenIds.add(externalId);
                    resolved.push({ externalId });
                }
            } else {
                // Unknown stakeholder - add to unresolved
                unresolvedParts.push(text);
                context.warnings.push(`${entityCode}: Unresolved stakeholder "${text}"`);
            }
        }

        return {
            resolved,
            unresolvedText: unresolvedParts.length > 0 ? unresolvedParts.join('\n') : null
        };
    }

    /**
     * Build final output structure
     * @param {Object} context - Mapping context
     * @returns {Object} StructuredImportData
     * @private
     */
    _buildOutput(context) {
        const requirements = [
            ...context.onMap.values(),
            ...context.orMap.values()
        ];

        // Remove type field from output (used internally)
        for (const req of requirements) {
            // Type is determined by externalId prefix pattern
            if (req.type === 'ON') {
                req.type = 'ON';
            } else {
                req.type = 'OR';
            }
        }

        console.log(`Output: ${requirements.length} requirements (${context.onMap.size} ONs, ${context.orMap.size} ORs)`);

        return {
            requirements,
            changes: [...context.changeMap.values()],
            stakeholderCategories: [...context.stakeholderCategoryMap.values()],
            dataCategories: [...context.dataCategoryMap.values()],
            services: [...context.serviceMap.values()],
            documents: [...context.documentMap.values()],
            waves: [...context.waveMap.values()]
        };
    }
}

export default iDL_Mapper_tables;