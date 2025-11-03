import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * AirportMapper - Maps Airport Operational Needs and Requirements document
 *
 * This mapper processes Word documents from the Airport Drafting Group containing:
 * - Operational Needs (ONs)
 * - Operational Requirements (ORs)
 * - Use Cases
 *
 * Document Structure:
 * - Hierarchical sections with numbered titles (e.g., "3.2.1 Title")
 * - Tables containing structured requirement data
 * - Stakeholder fields with format: "Name" or "Name (details)"
 *
 * Section Processing:
 * - Sections 1-2: Skipped (Introduction and Summary sections)
 * - Sections 3-10: Processed (Actual ON/OR definitions)
 * This prevents summary tables (which contain "ON #" or "OR #" columns but lack
 * actual requirement definitions) from being incorrectly identified as requirements.
 *
 * Two-Pass Algorithm:
 * Pass 1: Group tables - identify OR/ON tables and associate with following Use Case tables
 *         Tables from sections 1-2 are filtered out during collection phase
 * Pass 2: Map requirements - extract data from grouped tables and build requirement objects
 *
 * Field Mapping Strategy:
 *
 * Structured Fields (Resolved to Entity References):
 * - Stakeholders → impactsStakeholderCategories (with synonym resolution)
 * - ON Reference → implementedONs (for OR type)
 * - Regulatory requirements → documentReferences
 *
 * Unstructured Fields (Preserved as Raw Text in privateNotes):
 * - Data (and other Enabler) → privateNotes section "Data and Enablers"
 *   Reason: Heterogeneous data (63 unique items, mixed granularity, inconsistent naming)
 * - Impacted Services → privateNotes section "Impacted Services"
 *   Reason: Not standardized format across DrGs
 * - Dependencies → privateNotes section "Dependencies"
 *   Reason: Prose format requiring text parsing to extract requirement references
 *
 * These unstructured fields remain as empty arrays in the model for future processing:
 * - impactsData: [] (to be populated when DataCategory taxonomy is established)
 * - impactsServices: [] (to be populated when Service taxonomy is established)
 * - dependsOnRequirements: [] (to be populated when dependency parsing is implemented)
 *
 * Stakeholder Processing:
 * The mapper handles stakeholders in the following format:
 * - Input: "NMOC (Airport Function, NOC, SNOC)" (AsciiDoc plain text)
 * - Processing:
 *   1. Split text by pattern: mainName (optionalNote)
 *   2. Normalize mainName using synonym map (case-insensitive)
 *   3. Resolve to externalId using internal stakeholderCategoryMap
 *   4. Keep note with parentheses: "(Airport Function, NOC, SNOC)"
 * - Output: { externalId: "stakeholder:network/nm/nmoc", note: "(Airport Function, NOC, SNOC)" }
 *
 * Synonym Handling:
 * - Plural forms: "Aircraft Operators" → "AO"
 * - Variations: "Aircraft Operator" → "AO"
 * - Compound names: "APT Unit (Airport Integration Team)" → "APT Unit"
 * - Case-insensitive matching throughout
 *
 * Setup Entities:
 * The mapper builds internal maps for stakeholder categories from predefined setup data.
 * These maps are used for resolving references during requirement extraction.
 *
 * Key Features:
 * - Extracts requirements from nested section tables
 * - Builds hierarchical paths from section structure
 * - Resolves stakeholder references with synonym support
 * - Handles both simple and complex stakeholder notations
 * - Associates Use Cases with their corresponding requirements
 * - Preserves heterogeneous data in privateNotes for future processing
 *
 * External ID Format:
 * - Requirements: or:airport/{path}/{drg}
 * - Changes: oc:airport/{path}/{drg}
 *
 * @extends Mapper
 */
class AirportMapper extends Mapper {
    /**
     * Synonym map for stakeholder name normalization
     * Maps variations and plural forms to canonical names
     * All keys are lowercase for case-insensitive matching
     */
    static STAKEHOLDER_SYNONYMS = {
        // Aircraft Operator variations
        'aircraft operator': 'ao',
        'aircraft operators': 'ao',

        // Plural forms
        'ansps': 'ansp',
        'airport operators': 'airport operator',

        // Compound names - extract base name before parentheses
        'apt unit (airport integration team)': 'apt unit',
        'airport domain (apt unit)': 'airport domain',
        'national authority / caa': 'national authority',

        // NMOC variations - base name stays same, notes handled separately
        'nmoc (airport function, noc, snoc)': 'nmoc',
        'nmoc (noc, snoc)': 'nmoc',
        'nmoc (airport function, dom, snoc)': 'nmoc',
        'nmoc (airport function, snoc, noc)': 'nmoc',

        // Common abbreviations
        'caa': 'national authority',
        'gha': 'ground handling agent',
    };

    /**
     * Predefined stakeholder categories for Airport domain
     * Minimal data for mapping: name (for lookup) and externalId (for resolution)
     */
    static STAKEHOLDER_CATEGORIES = [
        { name: "NM", externalId: "stakeholder:network/nm" },
        { name: "ANSP", externalId: "stakeholder:network/ansp" },
        { name: "NMOC", externalId: "stakeholder:network/nm/nmoc" },
        { name: "FMP", externalId: "stakeholder:network/ansp/fmp" },
        { name: "TWR", externalId: "stakeholder:network/ansp/twr" },
        { name: "Airport Operator", externalId: "stakeholder:network/airport_operator" },
        { name: "Airspace User", externalId: "stakeholder:network/airspace_user" },
        { name: "AO", externalId: "stakeholder:network/airspace_user/ao" },
        { name: "APT Unit", externalId: "stakeholder:network/nm/apt_unit" },
        { name: "Airport Domain", externalId: "stakeholder:network/nm/airport_domain" },
        { name: "National Authority", externalId: "stakeholder:network/national_authority" },
        { name: "Ground Handling Agent", externalId: "stakeholder:network/ground_handling_agent" },
        { name: "Third Party Supplier", externalId: "stakeholder:network/third_party_supplier" },
        { name: "Surveillance Data Provider", externalId: "stakeholder:network/surveillance_data_provider" }
    ];

    /**
     * Document synonym map for document reference normalization
     * Maps common abbreviations and variations to canonical document names
     * All keys are lowercase for case-insensitive matching
     */
    static DOCUMENT_SYNONYMS = {
        'cp1 regulation 2021/116': 'commission implementing regulation (eu) 2021/116',
    };

    /**
     * Predefined documents for Airport domain
     * Minimal data for mapping: name (for lookup) and externalId (for resolution)
     */
    static DOCUMENTS = [
        {
            name: "Commission Implementing Regulation (EU) 2021/116",
            externalId: "document:commission_implementing_regulation_(eu)_2021/116"
        }
    ];

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        const context = this._initContext();
        const sections = rawData.sections || [];

        // Pass 1: Group tables by type and associate Use Cases with Requirements
        const tableGroups = this._groupTables(sections);

        console.log(`Pass 1 complete: Found ${tableGroups.length} table groups`);

        // Pass 2: Map grouped tables to requirements
        for (const group of tableGroups) {
            const requirement = this._mapRequirementFromGroup(group, context);
            if (requirement) {
                context.requirements.push(requirement);
            }
        }

        return this._buildOutput(context);
    }

    /**
     * Initialize mapping context with entity maps
     * @private
     */
    _initContext() {
        const context = {
            requirements: [],
            changes: [],
            stakeholderCategoryMap: new Map(),
            dataCategoryMap: new Map(),
            serviceMap: new Map(),
            documentMap: new Map(),
            waveMap: new Map(),
            // Map requirement numbers (APT-ON-01, APT-OR-02-1) to external IDs
            requirementNumberMap: new Map()
        };

        // Build stakeholder category map: name (lowercase) -> externalId
        for (const stakeholder of AirportMapper.STAKEHOLDER_CATEGORIES) {
            const key = stakeholder.name.toLowerCase();
            context.stakeholderCategoryMap.set(key, stakeholder.externalId);
        }

        // Build document map: name (lowercase) -> externalId
        for (const document of AirportMapper.DOCUMENTS) {
            const key = document.name.toLowerCase();
            context.documentMap.set(key, document.externalId);
        }

        return context;
    }

    /**
     * Check if section should be processed based on section number
     * Only processes sections 3-10 (skips Introduction and Summary sections 1-2)
     *
     * @param {string} sectionNumber - Section number (e.g., "3", "3.2", "3.2.1")
     * @returns {boolean} True if section should be processed
     * @private
     */
    _isProcessableSection(sectionNumber) {
        if (!sectionNumber) return false;

        // Extract top-level section number (e.g., "3" from "3.2.1")
        const topLevel = sectionNumber.split('.')[0];
        const num = parseInt(topLevel, 10);

        return num >= 3 && num <= 10;
    }

    /**
     * Pass 1: Group tables from all sections
     * Recursively collects all tables and groups OR/ON tables with their associated Use Case tables
     *
     * @param {Array} sections - Document sections
     * @returns {Array<{requirementTable, useCaseTable, path}>} Array of table groups
     */
    _groupTables(sections) {
        const allTables = [];

        // Recursively collect all tables with their paths
        const collectTables = (section, parentPath) => {
            const currentPath = [...parentPath];

            // Add current section to path if it has a meaningful title
            if (section.title && !this._isMetaSection(section.title)) {
                currentPath.push(section.title);
            }

            // Only collect tables from sections 3-10 (skip Introduction and Summary)
            const shouldProcess = this._isProcessableSection(section.sectionNumber);

            // Collect tables from current section only if in valid section range
            if (shouldProcess && section.content?.tables) {
                for (const table of section.content.tables) {
                    console.log(`...found ${section.title} (${parentPath} ... ${currentPath})`)
                    allTables.push({ table, title: section.title, path: currentPath, parentPath: parentPath });
                }
            }


            // Recursively process subsections
            if (section.subsections) {
                for (const subsection of section.subsections) {
                    collectTables(subsection, currentPath);
                }
            }
        };

        // Collect all tables
        for (const section of sections) {
            collectTables(section, []);
        }

        // Group tables: associate Use Case tables with preceding OR/ON tables
        const groups = [];
        let i = 0;

        while (i < allTables.length) {
            const current = allTables[i];
            const tableType = this._identifyTableType(current.table);

            if (tableType === 'OR' || tableType === 'ON') {
                const group = {
                    requirementTable: current.table,
                    useCaseTable: null,
                    path: tableType === 'OR' ? current.parentPath : current.path,
                    type: tableType,
                    title: current.title
                };
                console.log(`...added ${group.type} ${group.title} (${group.path})`)

                // Check if next table is a Use Case table
                if (i + 1 < allTables.length) {
                    const next = allTables[i + 1];
                    if (this._identifyTableType(next.table) === 'USE_CASE') {
                        group.useCaseTable = next.table;
                        i++; // Skip the Use Case table in next iteration
                    }
                }

                groups.push(group);
            }

            i++;
        }

        return groups;
    }

    /**
     * Identify table type based on its fields
     *
     * @param {Object} table - Table object with rows
     * @returns {string} Table type: 'OR', 'ON', 'USE_CASE', or 'OTHER'
     */
    _identifyTableType(table) {
        const data = this._parseTableToKeyValue(table);

        if (data['OR #'] || data['OR#']) {
            return 'OR';
        }
        if (data['ON #'] || data['ON#']) {
            return 'ON';
        }
        if (data['Use Case Title']) {
            return 'USE_CASE';
        }

        return 'OTHER';
    }

    /**
     * Check if section title is meta (should not be included in path)
     */
    _isMetaSection(title) {
        const metaTitles = [
            'Introduction',
            'Purpose',
            'Scope',
            'Intended audience',
            'Initial roadmap',
            'Acronyms',
            'Abbreviations'
        ];
        return metaTitles.some(meta => title.toLowerCase().includes(meta.toLowerCase()));
    }

    /**
     * Pass 2: Map a table group to a requirement object
     *
     * @param {Object} group - Table group with requirementTable, useCaseTable, path, type
     * @param {Object} context - Mapping context
     * @returns {Object|null} Requirement object or null
     */
    _mapRequirementFromGroup(group, context) {
        const { requirementTable, useCaseTable, path, type, title } = group;

        const data = this._parseTableToKeyValue(requirementTable);

        console.log(`Mapping ${type}:`, JSON.stringify(Object.keys(data)));

        const requirementNumber = data['OR #'] || data['OR#'] || data['ON #'] || data['ON#'];
        const drg = 'AIRPORT';

        // Build statement with Fit Criteria appended
        let statement = data['Detailed Requirement'] || data['Need statement'] || '';
        const fitCriteria = data['Fit Criteria'];
        if (fitCriteria) {
            statement += '\n\n**Fit Criteria:**\n' + fitCriteria;
        }

        // Build rationale with Opportunities/Risks appended
        let rationale = data['Rationale'] || '';
        const opportunitiesRisks = data['Opportunities / Risks'];
        if (opportunitiesRisks) {
            rationale += '\n\n**Opportunities / Risks:**\n' + opportunitiesRisks;
        }

        // Build private notes with all supplementary information
        let privateNotes = `Requirement ID: ${requirementNumber}`;

        const originator = data['Originator'];
        if (originator) {
            privateNotes += '\n\n**Originator:** ' + originator;
        }

        const dependencies = data['Dependencies'];
        if (dependencies) {
            privateNotes += '\n\n**Dependencies:** ' + dependencies;
        }

        const dataEnablers = data['Data (and other Enabler)'];
        if (dataEnablers) {
            privateNotes += '\n\n**Data and Enablers:** ' + dataEnablers;
        }

        const impactedServices = data['Impacted Services'];
        if (impactedServices) {
            privateNotes += '\n\n**Impacted Services:** ' + impactedServices;
        }

        // Build flows from Use Case table if present
        let flows = '';
        if (useCaseTable) {
            flows = this._extractFlowsFromUseCase(useCaseTable);
        }

        const requirement = {
            externalId: ExternalIdBuilder.buildExternalId({
                drg,
                path,
                title: title
            }, type.toLowerCase()),
            title: title,
            type: type,
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            flows: this.converter.asciidocToDelta(flows),
            privateNotes: this.converter.asciidocToDelta(privateNotes),
            path: path,
            drg: drg,
            refines: null,
            impactsStakeholderCategories: this._extractImpactedStakeholders(data['Stakeholders'], context),
            impactsData: [],
            impactsServices: [],
            implementedONs: type === 'OR' ? this._extractImplementedONs(data['ON Reference'], context) : [],
            documentReferences: this._extractDocumentReferences(data['Regulatory requirements'], context),
            dependsOnRequirements: []
        };

        // Store requirement number -> external ID mapping for reference resolution
        context.requirementNumberMap.set(requirementNumber, requirement.externalId);

        return requirement;
    }

    /**
     * Extract flows field from Use Case table
     * Format: [Use Case Title]\n\n[Flow of Actions]
     *
     * @param {Object} useCaseTable - Use Case table
     * @returns {string} Formatted flows text
     */
    _extractFlowsFromUseCase(useCaseTable) {
        const data = this._parseTableToKeyValue(useCaseTable);

        const useCaseTitle = data['Use Case Title'] || '';
        const flowOfActions = data['Flow of Actions'] || '';

        if (!useCaseTitle && !flowOfActions) {
            return '';
        }

        if (!useCaseTitle) {
            return flowOfActions;
        }

        if (!flowOfActions) {
            return useCaseTitle;
        }

        return `${useCaseTitle}\n\n${flowOfActions}`;
    }

    /**
     * Parse table rows into key-value pairs
     * Preserves AsciiDoc formatting for rich text fields that will be converted to Delta
     */
    _parseTableToKeyValue(table) {
        const result = {};

        // Fields that should preserve AsciiDoc formatting (will be converted to Delta)
        const richTextFields = [
            'Detailed Requirement',
            'Need statement',
            'Rationale',
            'Fit Criteria',
            'Opportunities / Risks',
            'Flow of Actions',
            'Dependencies',
            'Data (and other Enabler)',
            'Impacted Services',
            'Originator'
        ];

        for (const row of table.rows) {
            if (row.length >= 2) {
                // Extract key (strip formatting markers)
                const key = this._stripAsciiDoc(row[0]).replace(/:\s*$/, '').trim();

                // For rich text fields, preserve AsciiDoc; for others, strip formatting
                let value;
                if (richTextFields.includes(key)) {
                    value = row[1].trim(); // Keep AsciiDoc formatting
                } else {
                    value = this._stripAsciiDoc(row[1]).trim(); // Strip formatting
                }

                if (key && value) {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    /**
     * Strip AsciiDoc formatting markers from text
     * Preserves paragraph breaks and list structure
     */
    _stripAsciiDoc(text) {
        if (!text) return '';

        let result = text;

        // Strip AsciiDoc formatting markers
        result = result.replace(/\*\*([^*]+)\*\*/g, '$1');  // **bold** → text
        result = result.replace(/\*([^*]+)\*/g, '$1');       // *italic* → text
        result = result.replace(/__([^_]+)__/g, '$1');       // __underline__ → text

        // Strip AsciiDoc list markers (preserve the content)
        result = result.replace(/^\. /gm, '');  // Ordered list
        result = result.replace(/^\* /gm, '');  // Bullet list

        // Clean up whitespace
        result = result.replace(/ +/g, ' ')                 // Collapse multiple spaces
            .replace(/\n +/g, '\n')                         // Remove spaces after newlines
            .replace(/ +\n/g, '\n')                         // Remove spaces before newlines
            .replace(/\n\n+/g, '\n\n')                      // Collapse multiple newlines to double newline
            .trim();

        return result;
    }

    /**
     * Extract and resolve impacted stakeholders
     *
     * Processes stakeholder text (AsciiDoc format from table cells):
     * Example input: "NMOC (Airport Function, NOC, SNOC)\nAirport Operator"
     *
     * Returns array of { externalId, note } objects where:
     * - externalId: resolved from stakeholderCategoryMap
     * - note: parenthetical content WITH parentheses, or undefined if none
     *
     * @param {string} stakeholdersText - Raw stakeholders text from table cell
     * @param {Object} context - Mapping context with stakeholderCategoryMap
     * @returns {Array<{externalId: string, note?: string}>}
     */
    _extractImpactedStakeholders(stakeholdersText, context) {
        if (!stakeholdersText) {
            return [];
        }

        const result = [];
        const missing = [];

        let stakeholderTexts = [];

        // Try to extract from <p> tags first
        const paragraphMatches = stakeholdersText.match(/<p>(.*?)<\/p>/g);

        if (paragraphMatches && paragraphMatches.length > 0) {
            // HTML format with <p> tags
            stakeholderTexts = paragraphMatches.map(match => this._stripHtml(match).trim());
        } else {
            // Plain text format - split by newlines first, then by multiple spaces
            // This handles both "NMOC\nAirport Operator" and "NMOC  Airport Operator"
            stakeholderTexts = stakeholdersText
                .split(/\n|(?:\s{2,})/) // Split by newline or 2+ spaces
                .map(s => s.trim())
                .filter(s => s.length > 0);

            // If we still have one long string, try to parse it more intelligently
            // by looking for known stakeholder patterns
            if (stakeholderTexts.length === 1 && stakeholderTexts[0].length > 30) {
                stakeholderTexts = this._splitStakeholderText(stakeholderTexts[0]);
            }
        }

        console.log('_extractImpactedStakeholders', JSON.stringify(stakeholderTexts));

        for (const fullText of stakeholderTexts) {
            if (!fullText) continue;

            // Parse: "Name (optional note)"
            const parsed = this._parseStakeholderText(fullText);
            if (!parsed) continue;

            const { mainName, note } = parsed;

            // Normalize and resolve
            const normalizedName = this._normalizeStakeholderName(mainName);
            const externalId = this._resolveStakeholderExternalId(normalizedName, context);

            if (externalId) {
                const impactElement = { externalId };
                if (note) {
                    impactElement.note = note;
                }
                result.push(impactElement);
            } else {
                missing.push(mainName);
            }
        }

        if (missing.length > 0) {
            console.warn(`Stakeholders not found in map: ${missing.join(', ')}`);
        }

        return result;
    }

    /**
     * Split concatenated stakeholder text into individual stakeholder names
     * Uses pattern matching to identify stakeholder boundaries
     *
     * @param {string} text - Concatenated stakeholder text
     * @returns {Array<string>} - Individual stakeholder names
     */
    _splitStakeholderText(text) {
        // List of known stakeholder keywords that typically start a new stakeholder
        const stakeholderKeywords = [
            'NMOC', 'ANSP', 'FMP', 'Airport Operator', 'Aircraft Operator',
            'Airspace User', 'APT Unit', 'Airport Domain', 'National Authority',
            'Ground Handling Agent', 'Third Party Supplier', 'Surveillance Data Provider',
            'TWR', 'AO', 'CAA'
        ];

        // Sort by length descending to match longer patterns first
        const sortedKeywords = [...stakeholderKeywords].sort((a, b) => b.length - a.length);

        const result = [];
        let remaining = text;

        while (remaining.length > 0) {
            let found = false;

            for (const keyword of sortedKeywords) {
                const regex = new RegExp(`^(${keyword}(?:\\s*\\([^)]+\\))?)(?:\\s+|$)`, 'i');
                const match = remaining.match(regex);

                if (match) {
                    result.push(match[1].trim());
                    remaining = remaining.substring(match[0].length).trim();
                    found = true;
                    break;
                }
            }

            if (!found) {
                // No keyword matched, skip to next word
                const nextSpace = remaining.indexOf(' ');
                if (nextSpace === -1) break;
                remaining = remaining.substring(nextSpace + 1).trim();
            }
        }

        return result;
    }

    /**
     * Parse stakeholder text into main name and optional note
     *
     * Examples:
     * - "NMOC (Airport Function, NOC, SNOC)"
     *   → { mainName: "NMOC", note: "(Airport Function, NOC, SNOC)" }
     * - "Airport Operator"
     *   → { mainName: "Airport Operator", note: null }
     *
     * @param {string} text - Stakeholder text to parse
     * @returns {{mainName: string, note: string|null}|null}
     */
    _parseStakeholderText(text) {
        const match = text.match(/^([^(]+?)(?:\s*(\(.+\)))?$/);
        if (!match) return null;

        return {
            mainName: match[1].trim(),
            note: match[2] ? match[2].trim() : null
        };
    }

    /**
     * Normalize stakeholder name using synonym map
     *
     * @param {string} name - Raw stakeholder name
     * @returns {string} - Normalized name
     */
    _normalizeStakeholderName(name) {
        const lowerName = name.toLowerCase().trim();
        return AirportMapper.STAKEHOLDER_SYNONYMS[lowerName] || name;
    }

    /**
     * Resolve stakeholder name to external ID using context's stakeholderCategoryMap
     *
     * @param {string} name - Normalized stakeholder name
     * @param {Object} context - Mapping context
     * @returns {string|null} - External ID or null if not found
     */
    _resolveStakeholderExternalId(name, context) {
        // Case-insensitive lookup
        const lowerName = name.toLowerCase();
        return context.stakeholderCategoryMap.get(lowerName) || null;
    }

    /**
     * Extract implemented ONs from "ON Reference" field
     * Parses text like "APT-ON-01 - Full AOP/NOP Integration" to extract ON number
     *
     * @param {string} onReferenceText - Raw "ON Reference" field text
     * @param {Object} context - Mapping context with requirementNumberMap
     * @returns {Array<string>} - Array of ON external IDs
     */
    _extractImplementedONs(onReferenceText, context) {
        if (!onReferenceText) {
            return [];
        }

        const result = [];

        // Extract ON number (e.g., "APT-ON-01" from "APT-ON-01 - Full AOP/NOP Integration")
        const match = onReferenceText.match(/([A-Z]+-ON-[\d-]+)/);

        if (match) {
            const onNumber = match[1];
            const externalId = context.requirementNumberMap.get(onNumber);

            if (externalId) {
                result.push(externalId);
            } else {
                console.warn(`ON Reference "${onNumber}" not found in requirement number map`);
            }
        }

        return result;
    }

    /**
     * Extract document references from "Regulatory requirements" field
     *
     * Parses text like "CP1 Regulation 2021/116, Full AOP/NOP Integration (Highly Desirable Data Element)"
     *
     * Format: [Document Reference], [Note]
     * - Document Reference is normalized using synonym map
     * - Note is everything after the first comma
     *
     * @param {string} regulatoryReqText - Raw "Regulatory requirements" field text
     * @param {Object} context - Mapping context with documentMap
     * @returns {Array<{externalId: string, note?: string}>} - Array of document references
     */
    _extractDocumentReferences(regulatoryReqText, context) {
        if (!regulatoryReqText) {
            return [];
        }

        const result = [];

        // Split by comma: "CP1 Regulation 2021/116, Full AOP/NOP Integration (Highly Desirable Data Element)"
        // → ["CP1 Regulation 2021/116", "Full AOP/NOP Integration (Highly Desirable Data Element)"]
        const parts = regulatoryReqText.split(',').map(p => p.trim());

        if (parts.length === 0) {
            return [];
        }

        const docReference = parts[0];
        const note = parts.length > 1 ? parts.slice(1).join(', ') : null;

        // Normalize document name using synonym map
        const normalizedName = this._normalizeDocumentName(docReference);

        // Resolve to external ID
        const externalId = this._resolveDocumentExternalId(normalizedName, context);

        if (externalId) {
            const docRef = { documentExternalId: externalId };
            if (note) {
                docRef.note = note;
            }
            result.push(docRef);
        } else {
            console.warn(`Document reference "${docReference}" (normalized: "${normalizedName}") not found in document map`);
        }

        return result;
    }

    /**
     * Normalize document name using synonym map
     *
     * @param {string} name - Raw document name
     * @returns {string} - Normalized document name
     */
    _normalizeDocumentName(name) {
        const lowerName = name.toLowerCase().trim();
        return AirportMapper.DOCUMENT_SYNONYMS[lowerName] || name;
    }

    /**
     * Resolve document name to external ID using context's documentMap
     *
     * @param {string} name - Normalized document name
     * @param {Object} context - Mapping context
     * @returns {string|null} - External ID or null if not found
     */
    _resolveDocumentExternalId(name, context) {
        // Case-insensitive lookup
        const lowerName = name.toLowerCase();
        return context.documentMap.get(lowerName) || null;
    }

    /**
     * Build final output from context
     * @private
     */
    _buildOutput(context) {
        console.log(`Mapped entities - Requirements: ${context.requirements.length}, Changes: ${context.changes.length}`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements: context.requirements,
            changes: context.changes
        };
    }
}

export default AirportMapper;