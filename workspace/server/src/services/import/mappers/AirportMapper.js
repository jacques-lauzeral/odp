import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * Mapper for Airport Word documents
 * Transforms table-based entity structure into ODP entities
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Organizational Pattern:
 * -----------------------
 * The Airport document uses a flat topic-based structure:
 *
 * - Section 2: Summary tables (IGNORED - manually maintained)
 * - Sections 3-10: Each top-level section represents one topic area containing:
 *   - One ON (Operational Need) defined via form table at section start
 *   - Multiple subsections that can be:
 *     - OR subsections: contain form tables with OR definitions
 *     - Organizational subsections: grouping only, no form tables (contribute to path)
 *
 * Entity Identification:
 * ----------------------
 * - ONs identified by tables containing "ON #" field
 * - ORs identified by tables containing "OR #" field
 * - Entity = subsection containing such a table (not the table itself)
 * - Subsections without form tables are organizational groupings only
 *
 * Path Construction:
 * ------------------
 * - ON: empty path `[]` (topic-level entities)
 * - OR: organizational path from section titles (normalized)
 *   - Includes topic section and any organizational subsections
 *   - Excludes the OR's own subsection title
 *   - Example: Section 4.2.1 "API and DPI monitoring service"
 *     → path: ["Airport network integration", "API and DPI monitoring"]
 *     → title: "API and DPI monitoring service"
 *
 * External ID Format:
 * -------------------
 * - ON: on:airport/{title_normalized}
 * - OR: or:airport/{path_normalized}/{title_normalized}
 *
 * Field Extraction (from table rows):
 * ------------------------------------
 * ONs:
 * - "ON #" → privateNotes (e.g., "APT-ON-01")
 * - "Title" → title
 * - "Need statement" → statement
 * - "Rationale" → rationale
 *
 * ORs:
 * - "OR #" → privateNotes (e.g., "APT-OR-01-1")
 * - "Title" → title
 * - "Detailed Requirement" → statement
 * - "Rationale" → rationale
 * - "Stakeholders" → impactsStakeholderCategories (parsed and mapped)
 *
 * Stakeholder Mapping:
 * --------------------
 * Table values mapped to external IDs via STAKEHOLDER_SYNONYM_MAP:
 * - 'NMOC' → stakeholder:nm/nmoc
 * - 'ANSP' → stakeholder:ansp
 * - 'Airport Operator' → stakeholder:airport_operator
 * - 'Aircraft Operator' → stakeholder:airspace_user/ao
 * Multi-value fields parsed by newlines and common delimiters
 *
 * Relationships:
 * --------------
 * - ON → OR: One-to-many (all ORs within an ON's section reference that ON via implementedONs)
 * - Reference format: ON external ID (e.g., "on:airport/full_aop_nop_integration")
 *
 * IGNORED TABLE FIELDS:
 * ----------------------
 * The following table row labels are intentionally not imported:
 * - 'Fit Criteria' (future enhancement)
 * - 'Flow of Actions' (future enhancement)
 * - 'Data (and other Enabler)' (future enhancement)
 * - 'Impacted Services' (future enhancement)
 * - 'Dependencies' (future enhancement)
 * - 'Opportunities / Risks' (future enhancement)
 * - 'Date'
 * - 'Originator'
 * - 'ON Reference' (redundant - derived from section hierarchy)
 * - 'Regulatory requirements'
 *
 * IGNORED SECTIONS:
 * -----------------
 * - Section 2: "Operational Needs and Requirements summary" (manually maintained tables)
 * - Section 11: "Initial roadmap" (annex material)
 * - Any "Use Case" tables (future enhancement)
 */
class AirportMapper extends Mapper {
    /**
     * Map of stakeholder synonyms to external IDs
     */
    static STAKEHOLDER_SYNONYM_MAP = {
        'NMOC': 'stakeholder:nm/nmoc',
        'ANSP': 'stakeholder:ansp',
        'Airport Operator': 'stakeholder:airport_operator',
        'Aircraft Operator': 'stakeholder:airspace_user/ao'
    };

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        console.log('AirportMapper: Processing raw data from Word extraction');

        const context = this._initContext();

        // Process sections 3-10 (skip section 2 and 11)
        for (const section of rawData.sections || []) {
            const sectionNum = parseInt(section.sectionNumber);
            if (sectionNum >= 3 && sectionNum <= 10) {
                this._processTopicSection(section, context);
            }
        }

        console.log(`Mapped ${context.onMap.size} needs (ONs), ${context.orMap.size} requirements (ORs)`);

        return this._buildOutput(context);
    }

    /**
     * Initialize mapping context with entity maps
     * @private
     */
    _initContext() {
        return {
            onMap: new Map(),
            orMap: new Map(),
            documentMap: new Map(),
            stakeholderCategoryMap: new Map(),
            dataCategoryMap: new Map(),
            serviceMap: new Map(),
            waveMap: new Map(),
            changeMap: new Map()
        };
    }

    /**
     * Process a top-level topic section (sections 3-10)
     * Each contains one ON and multiple OR subsections
     * @private
     */
    _processTopicSection(section, context) {
        // Extract ON from the section itself
        const on = this._extractON(section);
        if (on) {
            context.onMap.set(on.externalId, on);
            console.log(`Extracted ON: ${on.externalId}`);
        }

        // Process subsections for ORs
        const topicPath = [section.title];
        this._processSubsections(section.subsections || [], topicPath, on ? on.externalId : null, context);
    }

    /**
     * Recursively process subsections to find ORs
     * @private
     */
    _processSubsections(subsections, currentPath, onExternalId, context) {
        for (const subsection of subsections) {
            // Check if this subsection contains an OR table
            const or = this._extractOR(subsection, currentPath, onExternalId);

            if (or) {
                context.orMap.set(or.externalId, or);
                console.log(`Extracted OR: ${or.externalId}`);
            } else {
                // No OR found - this is an organizational subsection
                // Recurse with updated path
                const newPath = [...currentPath, subsection.title];
                this._processSubsections(subsection.subsections || [], newPath, onExternalId, context);
            }
        }
    }

    /**
     * Extract ON from section content tables
     * @private
     */
    _extractON(section) {
        const tables = section.content?.tables || [];

        for (const table of tables) {
            // Check if this is an ON table (contains "ON #" field)
            const tableData = this._parseTableToObject(table);

            if (tableData['ON #']) {
                const on = {
                    type: 'ON',
                    drg: 'AIRPORT',
                    path: [],
                    title: tableData['Title'],
                    statement: tableData['Need statement'],
                    rationale: tableData['Rationale'],
                    privateNotes: tableData['ON #']
                };

                // Generate external ID
                on.externalId = ExternalIdBuilder.buildExternalId(on, 'on');

                return on;
            }
        }

        return null;
    }

    /**
     * Extract OR from subsection content tables
     * @private
     */
    _extractOR(subsection, currentPath, onExternalId) {
        const tables = subsection.content?.tables || [];

        for (const table of tables) {
            // Check if this is an OR table (contains "OR #" field)
            const tableData = this._parseTableToObject(table);

            if (tableData['OR #']) {
                // Build OR object with path excluding the OR's own title
                const or = {
                    type: 'OR',
                    drg: 'AIRPORT',
                    path: this._cleanPath([...currentPath]),
                    title: tableData['Title'] || subsection.title,
                    statement: tableData['Detailed Requirement'],
                    rationale: tableData['Rationale'],
                    privateNotes: tableData['OR #'],
                    implementedONs: onExternalId ? [onExternalId] : [],
                    impactsStakeholderCategories: this._parseStakeholders(tableData['Stakeholders'])
                };

                // Generate external ID
                or.externalId = ExternalIdBuilder.buildExternalId(or, 'or');

                return or;
            }
        }

        return null;
    }

    /**
     * Parse table rows into key-value object
     * Assumes 2-column tables with label in first column, value in second
     * @private
     */
    _parseTableToObject(table) {
        const result = {};

        for (const row of table.rows || []) {
            if (row.length >= 2) {
                // Extract text from HTML tags
                const key = this._stripHtml(row[0]).replace(/:/g, '').trim();
                const value = this._stripHtml(row[1]).trim();

                if (key && value) {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    /**
     * Strip HTML tags from text
     * @private
     */
    _stripHtml(html) {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, '').trim();
    }

    /**
     * Clean path by normalizing segments
     * @private
     */
    _cleanPath(path) {
        return path;
    }

    /**
     * Parse stakeholders text and map to external IDs
     * @private
     */
    _parseStakeholders(stakeholdersText) {
        if (!stakeholdersText || stakeholdersText.trim() === '') {
            return [];
        }

        const stakeholderIds = new Set();

        // Split by newlines and common delimiters
        const lines = stakeholdersText.split(/[\n,;]/).map(s => s.trim()).filter(s => s);

        for (const line of lines) {
            const externalId = AirportMapper.STAKEHOLDER_SYNONYM_MAP[line];

            if (externalId) {
                stakeholderIds.add(externalId);
            } else {
                console.warn(`Unknown stakeholder: "${line}"`);
            }
        }

        return Array.from(stakeholderIds).sort();
    }

    /**
     * Build final output from context maps
     * @private
     */
    _buildOutput(context) {
        // Helper to clean entity by removing null/empty fields
        const cleanEntity = (entity) => {
            const cleaned = {};
            for (const [key, value] of Object.entries(entity)) {
                if (value === null || value === undefined) continue;
                if (Array.isArray(value) && value.length === 0) continue;
                if (value === '') continue;
                cleaned[key] = value;
            }
            return cleaned;
        };

        const cleanArray = (arr) => arr.map(cleanEntity);

        return {
            documents: cleanArray(Array.from(context.documentMap.values())),
            stakeholderCategories: cleanArray(Array.from(context.stakeholderCategoryMap.values())),
            dataCategories: cleanArray(Array.from(context.dataCategoryMap.values())),
            services: cleanArray(Array.from(context.serviceMap.values())),
            waves: cleanArray(Array.from(context.waveMap.values())),
            requirements: cleanArray(Array.from(context.onMap.values()).concat(Array.from(context.orMap.values()))),
            changes: cleanArray(Array.from(context.changeMap.values()))
        };
    }
}

export default AirportMapper;