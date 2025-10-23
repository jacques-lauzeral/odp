import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * FlowMapper - Maps FLOW Operational Needs and Requirements Word documents
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Hierarchical Organization Pattern:
 * -----------------------------------
 * The FLOW document uses a hierarchical structure where ON/OR/Use Case sections
 * can appear at various depths:
 *
 * - Level 1: "02 - ON and OR" (document root - excluded from path)
 * - Level 2+: Organizational hierarchy (process areas, feature groupings, etc.)
 * - Any Level: Entity markers (detected by section title):
 *   - "Operational Need (ON)" → creates ON entity
 *   - "Operational Requirement (OR)" → creates OR entity
 *   - "Use Case" (case-insensitive) → injects into referenced ON's flows field
 *
 * The path is built from all ancestor organizational sections (excluding level 1 root).
 * Most ON/OR sections are at level 4, but some appear at level 5 or deeper.
 *
 * Path Construction:
 * ------------------
 * - Path = All ancestor section titles (numbering stripped), excluding level 1 root
 * - Builds path from organizational sections until an entity marker is found
 * - Numbers and separators removed: "1 - Determine Capacity" → "Determine Capacity"
 * - Example for level 4 entity: ["Determine Capacity", "Local Traffic Complexity Data Integration"]
 * - Example for level 5 entity: ["Traffic Volumes and Restrictions", "Archive"]
 * - Entity marker section itself (ON/OR/Use Case) excluded from path
 *
 * Title Extraction:
 * -----------------
 * - Title extracted from table field "Title:" (not from section title)
 * - Section title is just the generic marker ("Operational Need (ON)", etc.)
 *
 * Section Identifier and Originator:
 * ------------------------------------
 * - Each ON/OR/Use Case section has an "identifier" field added by the extractor
 * - Format examples: "ASM_ATFCM-ON3_v1.0", "ASM_ATFCM-OR 3-1_v1.0", "Att.Delay_OR_Delay pot_v2"
 * - Stored in privateNotes field as "Identifier: {value}"
 * - If "Originator:" field present, also stored in privateNotes as "Originator: {value}"
 * - Multiple privateNotes entries separated by double newline (\n\n)
 * - Identifier used for resolving references within the document
 * - Version suffix (_v{*}) stripped for matching in identifierMap
 *
 * Table Field Mapping:
 * --------------------
 * Placeholder Detection:
 * - "Click or tap here to enter text." (case-insensitive) → treated as null
 * - "TBD", "N/A", empty strings → treated as null
 *
 * Validation Rules:
 * - Statement field is REQUIRED for both ONs and ORs
 * - ONs/ORs without statement are SKIPPED and logged as ERROR
 * - Missing rationale logged as WARNING (but entity still created)
 *
 * ONs:
 * - "Title:" → title
 * - "Need Statement:" → statement
 * - "Definitions (draft):" → appended to statement after Need Statement, before Fit Criteria
 * - "Fit Criteria:" → appended to statement with "Fit Criteria:" header (if present)
 * - "Rationale:" → rationale
 * - "Date:" → ignored
 * - "Originator:" → privateNotes entry (separated by \n\n from identifier)
 *
 * ORs:
 * - "Title:" → title
 * - "Detailed Requirement:" → statement
 * - "Fit Criteria:" → appended to statement with "Fit Criteria:" header
 * - "Rationale:" → rationale
 * - "Opportunities/Risks:" → appended to rationale with "Opportunities / Risks:" header
 * - "ON Reference:" → implementedONs (resolve via identifier map)
 * - "Date:" → ignored
 * - "Originator:" → privateNotes entry (separated by \n\n from identifier)
 * - "Stakeholders:" → impactsStakeholderCategories array (with normalization)
 *   Normalization rules:
 *   - Plurals → Singular (AOs→AO, FMPs→FMP, TWRs→TWR)
 *   - Abbreviations → Full (AU→Airspace User)
 *   - Synonyms → Canonical (aerodrome→Airport Operator)
 *   - Strip qualifiers in parentheses (NMOC (end user)→NMOC)
 *   - Split compounds by "and" / "&" (FMP and NMOC→[FMP, NMOC])
 *   - Expanded forms (National ENV Coordination→NEC, National RAD coordinator→NRC)
 *   - Unresolved → privateNotes as "Stakeholders (unresolved):"
 *
 * Processed OR fields stored in privateNotes:
 * - "Data (and other Enabler/Enablers):" → privateNotes (if not empty/TBD/N/A)
 * - "Impacted Services:" → privateNotes (if not empty/TBD/N/A)
 *
 * Processed OR fields:
 * - "Dependencies:" → processed in second pass:
 *   - OR titles matched (case-insensitive) → dependsOnRequirements array with external IDs
 *   - Unmatched text → privateNotes as "Dependencies:\n{text}"
 *   - Ignored values: empty, "N/A", "Click or tap here to enter text."
 *   - Split by newlines or periods for multi-line dependencies
 *
 * Use Cases:
 * - Detected by case-insensitive match on "use case" section title
 * - Extract all table fields except "Date" and "Originator"
 * - Resolve "ON Reference:" field to find target ON via identifier map
 * - Inject formatted content into target ON's flows field
 * - Multiple Use Cases for same ON are concatenated with double newline separator
 *
 * Reference Resolution Strategy:
 * ------------------------------
 * 1. During extraction, build two lookup maps:
 *    - identifierMap: section identifier (without version) → externalId
 *    - titleMap: normalized ON title (lowercase, with synonyms) → externalId
 * 2. For OR's "ON Reference:" field (implementedONs):
 *    Pass 1: Try multiple lookups in order:
 *      a) identifierMap with original reference
 *      b) identifierMap with normalized reference (synonyms applied)
 *      c) titleMap with normalized reference (catches "PFDCI" → full title)
 *    Pass 2: If not found, try fallback resolution:
 *      - Find all ONs in the same parent section as the OR
 *      - If exactly 1 ON found → use it (unambiguous)
 *      - If 0 or multiple ONs → cannot resolve, log warning
 *    Synonym handling: "PFDCI" → "Proactive Flight Delay Criticality Indicator (P-FDCI)"
 * 3. For Use Case's "ON Reference:" field:
 *    - Same resolution process with identifierMap and titleMap lookup
 *    - Inject content into target ON's flows field
 * 4. All references are within the same document (no cross-DrG references)
 *
 * External ID Format:
 * -------------------
 * Normalization rules (applied by ExternalIdBuilder):
 * - Lowercase everything
 * - Trim whitespace
 * - Replace spaces with underscores
 *
 * Examples:
 * - Input path: ["1 - Determine Capacity", "Local Traffic Complexity Data Integration"]
 * - Stored path: ["Determine Capacity", "Local Traffic Complexity Data Integration"]
 * - Title: "Complexity Information"
 * - External ID: on:flow/determine_capacity/local_traffic_complexity_data_integration/complexity_information
 * - Pattern: {type}:flow/{normalized_path_segments}/{normalized_title}
 *
 * Validation:
 * -----------
 * - Identifier resolution: Log warnings for unresolved identifiers
 * - Use Case injection: Log warnings if target ON not found or target is not an ON
 * - Statistics logged: resolved vs unresolved references
 *
 * IGNORED CONTENT:
 * ----------------
 * - Level 1 section ("02 - ON and OR")
 * - "Date:" and "Originator:" table fields
 * - Empty or whitespace-only field values
 * - Use Case sections themselves (content injected into ONs instead)
 */
class FlowMapper extends Mapper {
    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        const context = this._initContext();

        // Process all sections to extract ONs, ORs, and Use Cases
        for (const section of rawData.sections || []) {
            this._processSection(section, context);
        }

        // Resolve dependencies (second pass after all ORs extracted)
        this._resolveDependencies(context);

        // Inject Use Case flows into referenced ONs
        this._injectUseCaseFlows(context);

        // Log validation summary
        if (context.validationErrors.length > 0) {
            console.error(`\n${'='.repeat(70)}`);
            console.error(`VALIDATION ERRORS: ${context.validationErrors.length} requirements skipped`);
            console.error('='.repeat(70));
            for (const error of context.validationErrors) {
                console.error(`${error.type} "${error.title}" - ${error.error}`);
                console.error(`  Path: ${JSON.stringify(error.path)}`);
            }
            console.error('='.repeat(70));
        }

        return this._buildOutput(context);
    }

    /**
     * Initialize mapping context with entity maps
     * @private
     */
    _initContext() {
        return {
            onMap: new Map(), // externalId -> ON entity
            orMap: new Map(), // externalId -> OR entity
            identifierMap: new Map(), // identifier (without version) -> externalId
            titleMap: new Map(), // normalized ON title -> externalId
            useCases: [], // Array of { onReference, content }
            validationErrors: [], // Array of validation errors
            documentMap: new Map(),
            stakeholderCategoryMap: new Map(),
            dataCategoryMap: new Map(),
            serviceMap: new Map(),
            waveMap: new Map(),
            changeMap: new Map()
        };
    }

    /**
     * Check if text is a placeholder or empty value
     * @private
     */
    _isPlaceholderOrEmpty(text) {
        if (!text || typeof text !== 'string') return true;

        const trimmed = text.trim();
        if (!trimmed) return true;

        // Check for placeholder text (case-insensitive)
        const placeholders = [
            'click or tap here to enter text.',
            'click or tap here to enter text',
            'tbd',
            'n/a'
        ];

        return placeholders.includes(trimmed.toLowerCase());
    }

    /**
     * Strip leading numbers and separator from path segment
     * Example: "1 - Determine Capacity" -> "Determine Capacity"
     * @private
     */
    _stripPathNumbers(pathSegment) {
        if (!pathSegment) return pathSegment;
        // Remove pattern: digits + optional spaces + hyphen + optional spaces
        return pathSegment.replace(/^\d+\s*-\s*/, '').trim();
    }

    /**
     * Strip leading numbers from all path segments
     * @private
     */
    _normalizePathSegments(path) {
        return path.map(segment => this._stripPathNumbers(segment));
    }

    /**
     * Normalize text for matching (handle synonyms)
     * @private
     */
    _normalizeTextForMatching(text) {
        if (!text) return text;

        // Handle PFDCI synonym
        // Replace "PFDCI" with full form for matching
        let normalized = text.replace(/\bPFDCI\b/gi, 'Proactive Flight Delay Criticality Indicator (P-FDCI)');

        // Trim and return
        return normalized.trim();
    }

    /**
     * Normalize and resolve stakeholder references
     * @private
     * @returns {Object} { resolvedStakeholders: [], unresolvedStakeholders: [] }
     */
    _normalizeStakeholders(stakeholdersText) {
        if (!stakeholdersText) {
            return { resolvedStakeholders: [], unresolvedStakeholders: [] };
        }

        const trimmed = stakeholdersText.trim();

        // Ignore placeholder/empty values
        const ignoredValues = ['tbd', 'n/a', 'click or tap here to enter text.', 'click or tap here to enter text'];
        if (!trimmed || ignoredValues.includes(trimmed.toLowerCase())) {
            return { resolvedStakeholders: [], unresolvedStakeholders: [] };
        }

        // Known stakeholder categories from setup: name → externalId
        const stakeholderMap = new Map([
            // Exact matches
            ['nm', 'stakeholder:network/nm'],
            ['nmoc', 'stakeholder:network/nm/nmoc'],
            ['fmp', 'stakeholder:network/ansp/fmp'],
            ['twr', 'stakeholder:network/ansp/twr'],
            ['ao', 'stakeholder:network/airspace_user/ao'],
            ['ansp', 'stakeholder:network/ansp'],
            ['amc', 'stakeholder:network/ansp/amc'],
            ['atc unit', 'stakeholder:network/ansp/atc'],
            ['nec', 'stakeholder:network/ansp/nec'],
            ['nrc', 'stakeholder:network/ansp/nrc'],
            ['cfsp', 'stakeholder:network/airspace_user/cfsp'],
            ['apt unit', 'stakeholder:network/nm/apt_unit'],
            ['airport domain', 'stakeholder:network/nm/airport_domain'],
            ['woc', 'stakeholder:network/nm/woc'],
            ['airport operator', 'stakeholder:network/airport_operator'],
            ['airspace user', 'stakeholder:network/airspace_user'],
            ['national authority', 'stakeholder:network/national_authority'],
            ['military', 'stakeholder:network/military'],
            ['system integrator', 'stakeholder:network/system_integrator'],
            ['easa', 'stakeholder:network/easa'],
            ['ground handling agent', 'stakeholder:network/ground_handling_agent'],
            ['third party supplier', 'stakeholder:network/third_party_supplier'],
            ['surveillance data provider', 'stakeholder:network/surveillance_data_provider'],

            // Plurals
            ['aos', 'stakeholder:network/airspace_user/ao'],
            ['fmps', 'stakeholder:network/ansp/fmp'],
            ['twrs', 'stakeholder:network/ansp/twr'],

            // Abbreviations
            ['au', 'stakeholder:network/airspace_user'],

            // Synonyms
            ['aerodrome', 'stakeholder:network/airport_operator'],

            // Expanded forms
            ['national env coordination', 'stakeholder:network/ansp/nec'],
            ['national env coordinator', 'stakeholder:network/ansp/nec'],
            ['national rad coordination', 'stakeholder:network/ansp/nrc'],
            ['national rad coordinator', 'stakeholder:network/ansp/nrc']
        ]);

        const resolvedStakeholders = [];
        const unresolvedStakeholders = [];

        // Split by semicolons, commas, and "and"
        const parts = trimmed.split(/[;,]|\s+and\s+/i).map(p => p.trim()).filter(p => p);

        for (let part of parts) {
            // Strip qualifiers in parentheses: "NMOC (end user)" → "NMOC"
            part = part.replace(/\s*\([^)]*\)\s*/g, '').trim();

            if (!part) continue;

            // Normalize for lookup
            const normalized = part.toLowerCase().trim();

            // Try to find in stakeholder map
            const externalId = stakeholderMap.get(normalized);

            if (externalId) {
                // Create reference object and avoid duplicates
                const refObj = { externalId };
                if (!resolvedStakeholders.find(s => s.externalId === externalId)) {
                    resolvedStakeholders.push(refObj);
                }
            } else {
                // Check if it's an obvious typo/invalid (random characters)
                if (/^[a-z]{3,}$/i.test(part) && part.length > 15) {
                    // Likely gibberish - flag it
                    unresolvedStakeholders.push(`${part} (possible typo)`);
                } else {
                    unresolvedStakeholders.push(part);
                }
            }
        }

        return { resolvedStakeholders, unresolvedStakeholders };
    }

    /**
     * Process Dependencies field - parse OR references or store as free text
     * @private
     * @returns {Object} { dependsOnRequirements: [], dependenciesNote: string|null }
     */
    _processDependencies(dependenciesText, context, orExternalId) {
        if (!dependenciesText) {
            return { dependsOnRequirements: [], dependenciesNote: null };
        }

        const trimmed = dependenciesText.trim();

        // Ignore placeholder/empty values
        const ignoredValues = ['n/a', 'click or tap here to enter text.', 'click or tap here to enter text'];
        if (!trimmed || ignoredValues.includes(trimmed.toLowerCase())) {
            return { dependsOnRequirements: [], dependenciesNote: null };
        }

        // Try to parse as OR title references
        const dependsOnRequirements = [];
        let unmatchedText = [];

        // Split by multiple delimiters: newlines, semicolons, commas, periods
        // This handles cases like "OR1; OR2, OR3. OR4"
        const lines = trimmed.split(/[\n;,.]+/).map(line => line.trim()).filter(line => line);

        for (const line of lines) {
            // Normalize for lookup: lowercase + trim
            const normalized = line.toLowerCase().trim();

            // Try to find matching OR by title
            let found = false;
            for (const [externalId, requirement] of context.orMap.entries()) {
                const reqTitleNormalized = requirement.title.toLowerCase().trim();

                // Exact match
                if (reqTitleNormalized === normalized) {
                    dependsOnRequirements.push(externalId);
                    found = true;
                    break;
                }
            }

            // If not found as OR title, warn and treat as free text
            if (!found && line.length > 0) {
                console.warn(`WARNING: OR "${orExternalId}" - Could not resolve dependency: "${line}"`);
                unmatchedText.push(line);
            }
        }

        // If we have unmatched text, store in privateNotes
        const dependenciesNote = unmatchedText.length > 0
            ? `Dependencies:\n${unmatchedText.join('\n')}`
            : null;

        return { dependsOnRequirements, dependenciesNote };
    }

    /**
     * Recursively process section hierarchy
     * @private
     */
    _processSection(section, context, ancestorPath = []) {
        // Skip level 1 root section ("02 - ON and OR")
        if (section.level === 1 && section.title === "02 - ON and OR") {
            for (const subsection of section.subsections || []) {
                this._processSection(subsection, context, ancestorPath);
            }
            return;
        }

        // Check if this section is an entity marker (ON/OR/Use Case) at any level
        const entityType = this._getEntityType(section.title);

        if (entityType) {
            // This is an ON/OR/Use Case - extract it with current ancestor path
            if (entityType === 'ON' || entityType === 'OR') {
                this._extractRequirement(section, entityType, ancestorPath, context);
            } else if (entityType === 'USE_CASE') {
                this._extractUseCase(section, context);
            }
            // Don't recurse into entity sections - they shouldn't have subsections
            return;
        }

        // Not an entity marker - this is organizational structure
        // Build path by including this level (unless it's level 1 which we already skipped)
        const currentPath = section.level > 1
            ? [...ancestorPath, section.title]
            : ancestorPath;

        // Recurse into subsections
        for (const subsection of section.subsections || []) {
            this._processSection(subsection, context, currentPath);
        }
    }

    /**
     * Determine entity type from section title
     * @private
     * @returns {'ON'|'OR'|'USE_CASE'|null}
     */
    _getEntityType(title) {
        const normalized = title?.trim().toLowerCase();
        if (normalized === 'operational need (on)') return 'ON';
        if (normalized === 'operational requirement (or)') return 'OR';
        if (normalized === 'use case') return 'USE_CASE';
        return null;
    }

    /**
     * Extract ON or OR from section with table data
     * @private
     */
    _extractRequirement(section, type, path, context) {
        const tableData = this._extractTableData(section);

        if (!tableData.title) {
            console.warn(`Skipping ${type} without title in section at path: ${JSON.stringify(path)}`);
            return;
        }

        // Build statement based on entity type
        let statement = null;

        if (type === 'ON') {
            // ON: Use "Need Statement" field
            const needStatement = tableData['need statement'];
            statement = this._isPlaceholderOrEmpty(needStatement) ? null : needStatement;

            // If "Definitions (draft)" present, append after Need Statement but before Fit Criteria
            const definitions = tableData['definitions (draft)'];
            if (!this._isPlaceholderOrEmpty(definitions)) {
                statement = statement
                    ? `${statement}\n\nDefinitions (draft):\n${definitions}`
                    : `Definitions (draft):\n${definitions}`;
            }

            // Append "Fit Criteria" if present
            const fitCriteria = tableData['fit criteria'];
            if (!this._isPlaceholderOrEmpty(fitCriteria)) {
                statement = statement
                    ? `${statement}\n\nFit Criteria:\n${fitCriteria}`
                    : `Fit Criteria:\n${fitCriteria}`;
            }
        } else {
            // OR: Use "Detailed Requirement" field
            const detailedReq = tableData['detailed requirement'];
            statement = this._isPlaceholderOrEmpty(detailedReq) ? null : detailedReq;

            // Append "Fit Criteria" if present
            const fitCriteria = tableData['fit criteria'];
            if (!this._isPlaceholderOrEmpty(fitCriteria)) {
                statement = statement
                    ? `${statement}\n\nFit Criteria:\n${fitCriteria}`
                    : `Fit Criteria:\n${fitCriteria}`;
            }
        }

        // VALIDATION: Statement is required
        if (!statement) {
            console.error(`ERROR: ${type} "${tableData.title}" at path ${JSON.stringify(path)} has no statement - SKIPPED`);
            context.validationErrors = context.validationErrors || [];
            context.validationErrors.push({
                type: type,
                title: tableData.title,
                path: path,
                error: 'Missing required statement field'
            });
            return; // Skip this requirement
        }

        // Build rationale: "Rationale:" + optional "Opportunities/Risks:"
        const rationaleText = tableData['rationale'];
        let rationale = this._isPlaceholderOrEmpty(rationaleText) ? null : rationaleText;

        const opportunitiesRisks = tableData['opportunities/risks'];
        if (!this._isPlaceholderOrEmpty(opportunitiesRisks)) {
            rationale = rationale
                ? `${rationale}\n\nOpportunities / Risks:\n${opportunitiesRisks}`
                : `Opportunities / Risks:\n${opportunitiesRisks}`;
        }

        // VALIDATION: Rationale warning
        if (!rationale) {
            console.warn(`WARNING: ${type} "${tableData.title}" at path ${JSON.stringify(path)} has no rationale`);
        }

        // Extract ON Reference for ORs (store as-is, will resolve later)
        const implementedONs = [];
        if (type === 'OR' && tableData['on reference']) {
            const onRef = this._stripVersion(tableData['on reference']);
            if (onRef) {
                implementedONs.push(onRef); // Store reference string for later resolution
            }
        }

        // Process Stakeholders for ORs
        let impactsStakeholderCategories = [];
        let unresolvedStakeholdersNote = null;
        if (type === 'OR' && tableData['stakeholders']) {
            const { resolvedStakeholders, unresolvedStakeholders } = this._normalizeStakeholders(tableData['stakeholders']);
            impactsStakeholderCategories = resolvedStakeholders;

            if (unresolvedStakeholders.length > 0) {
                unresolvedStakeholdersNote = `Stakeholders (unresolved):\n${unresolvedStakeholders.join('\n')}`;
            }
        }

        // Build privateNotes with identifier and optionally originator
        const privateNotesParts = [];

        if (section.identifier) {
            privateNotesParts.push(`Identifier: ${section.identifier}`);
        }

        if (tableData['originator']) {
            privateNotesParts.push(`Originator: ${tableData['originator']}`);
        }

        // For ORs, add Data and Impacted Services if present and not placeholder
        if (type === 'OR') {
            // Handle "Data (and other Enabler)" or "Data (and other Enablers)"
            const dataField = tableData['data (and other enabler)'] || tableData['data (and other enablers)'];
            if (!this._isPlaceholderOrEmpty(dataField)) {
                privateNotesParts.push(`Data (and other Enabler):\n${dataField.trim()}`);
            }

            // Handle "Impacted Services"
            const servicesField = tableData['impacted services'];
            if (!this._isPlaceholderOrEmpty(servicesField)) {
                privateNotesParts.push(`Impacted Services:\n${servicesField.trim()}`);
            }

            // Add unresolved stakeholders if any
            if (unresolvedStakeholdersNote) {
                privateNotesParts.push(unresolvedStakeholdersNote);
            }
        }

        const privateNotes = privateNotesParts.length > 0 ? privateNotesParts.join('\n\n') : null;

        const requirement = {
            title: tableData.title,
            type: type,
            drg: 'FLOW',
            path: this._normalizePathSegments(path), // Strip numbers from path
            statement: statement,
            rationale: rationale,
            privateNotes: privateNotes,
            implementedONs: type === 'OR' ? implementedONs : [],
            // Stakeholder categories resolved
            impactsStakeholderCategories: impactsStakeholderCategories,
            impactsData: [],
            impactsServices: [],
            dependsOnRequirements: [],
            // Store raw dependencies and parent path for later processing
            _rawDependencies: type === 'OR' ? (tableData['dependencies'] || null) : null,
            _parentPath: this._normalizePathSegments(path) // For fallback ON resolution
        };

        // Generate external ID
        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, type.toLowerCase());

        // Store in appropriate map
        const targetMap = type === 'ON' ? context.onMap : context.orMap;
        targetMap.set(requirement.externalId, requirement);

        // Index by section identifier (without version) for reference resolution
        if (section.identifier) {
            const identifierKey = this._stripVersion(section.identifier);
            if (identifierKey) {
                context.identifierMap.set(identifierKey, requirement.externalId);
            }
        }

        // For ONs, also index by normalized title for synonym-based lookup
        if (type === 'ON' && requirement.title) {
            const normalizedTitle = this._normalizeTextForMatching(requirement.title).toLowerCase().trim();
            context.titleMap.set(normalizedTitle, requirement.externalId);
        }
    }

    /**
     * Extract Use Case and store for later injection
     * @private
     */
    _extractUseCase(section, context) {
        const tableData = this._extractTableData(section, true); // excludeDateOriginator = true

        const onReference = tableData['on reference'];
        if (!onReference) {
            console.warn(`Use Case without ON Reference found, skipping`);
            return;
        }

        // Format Use Case content as field: value pairs
        const contentLines = [];
        for (const [field, value] of Object.entries(tableData)) {
            if (value && value.trim()) {
                contentLines.push(`${this._capitalizeField(field)}: ${value}`);
            }
        }

        context.useCases.push({
            onReference: this._stripVersion(onReference),
            content: contentLines.join('\n')
        });
    }

    /**
     * Extract table data from section content
     * @private
     * @param {boolean} excludeDateOriginator - If true, exclude Date and Originator fields
     * @returns {Object} Field name (lowercase) -> value
     */
    _extractTableData(section, excludeDateOriginator = false) {
        const data = {};

        if (!section.content?.tables || section.content.tables.length === 0) {
            return data;
        }

        // Process first table (assuming single table per section)
        const table = section.content.tables[0];

        for (const row of table.rows || []) {
            if (row.length !== 2) continue; // Skip non-key-value rows

            const fieldCell = row[0];
            const valueCell = row[1];

            // Extract field name (remove HTML tags, colons, normalize)
            const fieldName = this._extractText(fieldCell)
                .replace(/:/g, '')
                .trim()
                .toLowerCase();

            // Skip excluded fields
            if (excludeDateOriginator && (fieldName === 'date' || fieldName === 'originator')) {
                continue;
            }

            // Extract value (remove HTML tags, trim)
            const value = this._extractText(valueCell).trim();

            if (fieldName && value) {
                data[fieldName] = value;
            }
        }

        return data;
    }

    /**
     * Extract text from HTML cell content
     * @private
     */
    _extractText(html) {
        if (!html) return '';

        // Remove HTML tags
        let text = html.replace(/<[^>]*>/g, '');

        // Handle list paragraphs (join with newlines)
        text = text.replace(/\n+/g, '\n').trim();

        return text;
    }

    /**
     * Strip version suffix from reference string
     * Format: "ASM_ATFCM-ON-3_v1.0" -> "ASM_ATFCM-ON-3"
     * @private
     */
    _stripVersion(reference) {
        if (!reference) return null;
        return reference.replace(/_v[^_]*$/, '').trim();
    }

    /**
     * Capitalize field name for display
     * @private
     */
    _capitalizeField(fieldName) {
        return fieldName
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Resolve dependencies for all ORs (second pass after all ORs extracted)
     * @private
     */
    _resolveDependencies(context) {
        let totalDeps = 0;
        let resolvedRefs = 0;
        let unresolvedRefs = 0;

        for (const or of context.orMap.values()) {
            if (!or._rawDependencies) continue;

            const { dependsOnRequirements, dependenciesNote } = this._processDependencies(
                or._rawDependencies,
                context,
                or.externalId  // Pass for warning messages
            );

            // Update OR with resolved dependencies
            or.dependsOnRequirements = dependsOnRequirements;

            // Append dependencies note to privateNotes if present
            if (dependenciesNote) {
                or.privateNotes = or.privateNotes
                    ? `${or.privateNotes}\n\n${dependenciesNote}`
                    : dependenciesNote;
            }

            // Clean up temporary field
            delete or._rawDependencies;

            // Statistics
            totalDeps++;
            resolvedRefs += dependsOnRequirements.length;
            if (dependenciesNote) {
                // Count lines in unresolved text
                unresolvedRefs += dependenciesNote.split('\n').length - 1; // -1 for "Dependencies:" header
            }
        }

        if (totalDeps > 0) {
            console.log(`Dependencies resolution: ${totalDeps} ORs processed, ${resolvedRefs} references resolved, ${unresolvedRefs} unresolved (stored in privateNotes)`);
        }
    }

    /**
     * Inject Use Case flows into referenced ONs (two-pass resolution)
     * @private
     */
    _injectUseCaseFlows(context) {
        let injected = 0;
        let injectedFallback = 0;
        let notFound = 0;

        // Build map of ONs by parent path for fallback resolution
        const onsByParentPath = new Map();
        for (const [externalId, on] of context.onMap.entries()) {
            const pathKey = JSON.stringify(on._parentPath || []);
            if (!onsByParentPath.has(pathKey)) {
                onsByParentPath.set(pathKey, []);
            }
            onsByParentPath.get(pathKey).push({ externalId, on });
        }

        for (const useCase of context.useCases) {
            // Apply synonym normalization
            const normalizedRef = this._normalizeTextForMatching(useCase.onReference);
            const normalizedRefLower = normalizedRef.toLowerCase().trim();

            // Pass 1: Try direct identifier match (try both original and normalized)
            let targetExternalId = context.identifierMap.get(useCase.onReference) ||
                context.identifierMap.get(normalizedRef);

            // If not found by identifier, try title lookup
            if (!targetExternalId) {
                targetExternalId = context.titleMap.get(normalizedRefLower);
            }

            let targetON = null;

            if (targetExternalId) {
                targetON = context.onMap.get(targetExternalId);
            }

            if (targetON) {
                // Direct match successful
                if (targetON.flows) {
                    targetON.flows += '\n\n' + useCase.content;
                } else {
                    targetON.flows = useCase.content;
                }
                injected++;
            } else {
                // Pass 2: Try fallback - find unique ON in parent section
                // Extract parent path from use case (we need to determine which section it's in)
                // For now, try all parent paths to find unique match
                let candidates = [];
                for (const [pathKey, ons] of onsByParentPath.entries()) {
                    if (ons.length === 1) {
                        candidates.push(ons[0]);
                    }
                }

                // If only one unique ON exists across all sections, use it as fallback
                if (candidates.length === 1) {
                    targetON = candidates[0].on;
                    if (targetON.flows) {
                        targetON.flows += '\n\n' + useCase.content;
                    } else {
                        targetON.flows = useCase.content;
                    }
                    injectedFallback++;
                    console.log(`Injected Use Case via fallback for ON reference "${useCase.onReference}"`);
                } else {
                    console.warn(`Use Case references unknown ON identifier: "${useCase.onReference}"`);
                    notFound++;
                }
            }
        }

        if (context.useCases.length > 0) {
            console.log(`Use Case injection: ${injected} direct matches, ${injectedFallback} fallback injections, ${notFound} not found (total: ${context.useCases.length})`);
        }
    }

    /**
     * Resolve implementedONs references to external IDs (two-pass strategy)
     * Pass 1: Direct identifier match (with synonym normalization)
     * Pass 2: Fallback to unique ON in same parent section
     * Unresolved references are stored in privateNotes
     * @private
     */
    _resolveImplementedONs(context) {
        let totalRefs = 0;
        let resolvedDirect = 0;
        let resolvedFallback = 0;
        let unresolved = 0;

        // Build map of ONs by parent path for fallback resolution
        const onsByParentPath = new Map();
        for (const [externalId, on] of context.onMap.entries()) {
            const pathKey = JSON.stringify(on._parentPath || []);
            if (!onsByParentPath.has(pathKey)) {
                onsByParentPath.set(pathKey, []);
            }
            onsByParentPath.get(pathKey).push(externalId);
        }

        // Resolve ON references for each OR
        for (const or of context.orMap.values()) {
            if (!or.implementedONs || or.implementedONs.length === 0) continue;

            const resolvedRefs = [];
            const unresolvedRefs = [];

            for (const onRef of or.implementedONs) {
                totalRefs++;

                // Apply synonym normalization to the reference
                const normalizedRef = this._normalizeTextForMatching(onRef);
                const normalizedRefLower = normalizedRef.toLowerCase().trim();

                // Pass 1: Try direct identifier match (try original and normalized)
                let targetExternalId = context.identifierMap.get(onRef) ||
                    context.identifierMap.get(normalizedRef);

                // If not found by identifier, try title lookup
                if (!targetExternalId) {
                    targetExternalId = context.titleMap.get(normalizedRefLower);
                }

                if (targetExternalId && context.onMap.has(targetExternalId)) {
                    // Direct match successful
                    resolvedRefs.push(targetExternalId);
                    resolvedDirect++;
                } else {
                    // Pass 2: Try fallback to unique ON in parent section
                    const parentPathKey = JSON.stringify(or._parentPath || []);
                    const onsInParent = onsByParentPath.get(parentPathKey) || [];

                    if (onsInParent.length === 1) {
                        // Unique ON in parent section - use it
                        resolvedRefs.push(onsInParent[0]);
                        resolvedFallback++;
                        console.log(`Resolved ON Reference "${onRef}" via parent section fallback for OR "${or.externalId}"`);
                    } else if (onsInParent.length === 0) {
                        // No ONs in parent section - store as unresolved
                        console.warn(`WARNING: OR "${or.externalId}" references unknown ON identifier "${onRef}" (no ONs in parent section)`);
                        unresolvedRefs.push(onRef);
                        unresolved++;
                    } else {
                        // Multiple ONs in parent section - ambiguous, store as unresolved
                        console.warn(`WARNING: OR "${or.externalId}" references unknown ON identifier "${onRef}" (${onsInParent.length} ONs in parent section - ambiguous)`);
                        unresolvedRefs.push(onRef);
                        unresolved++;
                    }
                }
            }

            // Update OR with resolved references
            or.implementedONs = resolvedRefs;

            // Store unresolved references in privateNotes
            if (unresolvedRefs.length > 0) {
                const unresolvedNote = `ON Reference (unresolved):\n${unresolvedRefs.join('\n')}`;
                or.privateNotes = or.privateNotes
                    ? `${or.privateNotes}\n\n${unresolvedNote}`
                    : unresolvedNote;
            }
        }

        console.log(`Implemented ONs resolution: ${totalRefs} references, ${resolvedDirect} direct matches, ${resolvedFallback} fallback resolutions, ${unresolved} unresolved (stored in privateNotes)`);

        // Clean up temporary parent path fields
        for (const on of context.onMap.values()) {
            delete on._parentPath;
        }
        for (const or of context.orMap.values()) {
            delete or._parentPath;
        }
    }

    /**
     * Build final output from context maps
     * @private
     */
    _buildOutput(context) {
        // Resolve ON references in ORs
        this._resolveImplementedONs(context);

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

        // Log mapped counts
        console.log(`Mapped entities - ONs: ${context.onMap.size}, ORs: ${context.orMap.size}`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: cleanArray(Array.from(context.waveMap.values())),
            requirements: cleanArray(Array.from(context.onMap.values()).concat(Array.from(context.orMap.values()))),
            changes: cleanArray(Array.from(context.changeMap.values()))
        };
    }
}

export default FlowMapper;