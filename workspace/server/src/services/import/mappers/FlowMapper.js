import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

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
 * - "Maturity:" → maturity (case-insensitive: Defined→DRAFT, Advanced→ADVANCED, Mature→MATURE;
 *   unrecognized value logs WARNING and defaults to DRAFT)
 * - "Tentative:" → tentative year range ([year, year] or [start, end]); YYYY or YYYY-YYYY
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
 * - "Stakeholders:" → impactedStakeholders array (with normalization)
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
 *   - OR titles matched (case-insensitive) → dependencies array with external IDs
 *   - Unmatched text → privateNotes as "Dependencies:\n{text}"
 *   - Ignored values: empty, "N/A", "Click or tap here to enter text."
 *   - Split by newlines or periods for multi-line dependencies
 *
 * Use Cases:
 * - Detected by case-insensitive match on "use case" section title
 * - Extract only "Title:" and "Flow of Actions:" fields
 * - Format as AsciiDoc: **{title}**\n\n{flow of actions}
 * - "Date:" and "Originator:" fields are ignored
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
 * Warning Format:
 * ---------------
 * All warnings are emitted via _warn(msg), which prefixes the message with entity context
 * when available: WARNING: {type} "{title}" at path {path} - {msg}
 * _currentEntity is set at the start of each entity-scoped operation (_extractRequirement,
 * _resolveDependencies loop, _resolveImplementedONs loop) and cleared on exit.
 * Warnings emitted outside any entity scope (Use Case processing) fall back to:
 * WARNING: {msg}
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
     * Reference document keyword map for strategic document resolution.
     * NSP SO and ATMMP SDO entries are handled via expansion methods.
     *
     * REFERENCE_DOC_MAP keywords → refdoc externalId:
     * 'NSP SO <n>/<m>'  → refdoc:nsp_so_<n>_<m> (via nspSoMatch in _parseReferences)
     * 'ATMMP SDO <n>'   → refdoc:atmmp_sdo_<n> (via _expandAtmmpReferences)
     * 'EU IR 2021/116'  → refdoc:commission_implementing_regulation_(eu)_2021_116
     *                      trailing token (e.g. 'AF 4/5') extracted as note
     */
    static REFERENCE_DOC_MAP = [
        {
            keywords: ['flow conops', 'flow integration conops'],
            externalId: ExternalIdBuilder.buildExternalId({ name: 'Flow CONOPS' }, 'refdoc')
        },
        {
            keywords: ['eu ir 2021/116', 'cp1 regulation 2021/116', 'regulation (eu) 2021/116'],
            externalId: ExternalIdBuilder.buildExternalId({ name: 'Commission Implementing Regulation (EU) 2021/116' }, 'refdoc'),
            trailingNotePattern: /^(?:EU IR|CP1 Regulation|Commission Implementing Regulation \(EU\)) 2021\/116\s+(.+)$/i
        }
    ];

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
        this._currentEntity = null; // Set during _extractRequirement for contextual warnings
    }

    /**
     * Emit a warning prefixed with the current entity context (type, title, path).
     * Falls back to plain console.warn if no entity context is set.
     * @param {string} msg
     * @private
     */
    _warn(msg) {
        if (this._currentEntity) {
            const { type, title, path } = this._currentEntity;
            console.warn(`WARNING: ${type} "${title}" at path ${JSON.stringify(path)} - ${msg}`);
        } else {
            console.warn(`WARNING: ${msg}`);
        }
    }

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
            stakeholderCategoryMap: new Map(),
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
            ['twr', 'stakeholder:network/ansp/atc'],
            ['ao', 'stakeholder:network/airspace_user'],
            ['ansp', 'stakeholder:network/ansp'],
            ['amc', 'stakeholder:network/ansp/amc'],
            ['atc unit', 'stakeholder:network/ansp/atc'],
            ['nec', 'stakeholder:network/ansp/nec'],
            ['nrc', 'stakeholder:network/ansp/nrc'],
            ['cfsp', 'stakeholder:network/airspace_user/cfsp'],
            ['apt unit', 'stakeholder:network/airport'],
            ['airport domain', 'stakeholder:network/nm/airport'],
            ['woc', 'stakeholder:network/nm/weather'],
            ['airport operator', 'stakeholder:network/airport'],
            ['airspace user', 'stakeholder:network/airspace_user'],
            ['national authority', 'stakeholder:network/national_european_authority'],
            ['military', 'stakeholder:network/ansp/mil'],
            ['easa', 'stakeholder:network/national_european_authority'],
            ['ground handling agent', 'stakeholder:network/airport'],
            // system integrator, third party supplier, surveillance data provider → unresolved (privateNotes)

            // Plurals
            ['aos', 'stakeholder:network/airspace_user'],
            ['fmps', 'stakeholder:network/ansp/fmp'],
            ['twrs', 'stakeholder:network/ansp/atc'],

            // Abbreviations
            ['au', 'stakeholder:network/airspace_user'],

            // Synonyms
            ['aerodrome', 'stakeholder:network/airport'],

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
                this._warn(`Could not resolve dependency: "${line}"`);
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

        // Skip "archive" sections (case-insensitive)
        if (section.title?.trim().toLowerCase() === 'archive') return;

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

        // Set entity context for contextual warnings (cleared on exit)
        this._currentEntity = { type, title: tableData.title, path: this._normalizePathSegments(path) };

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
                    ? `${statement}\n\n**Fit Criteria:**\n${fitCriteria}`
                    : `**Fit Criteria:**\n${fitCriteria}`;
            }
        } else {
            // OR: Use "Detailed Requirement" field
            const detailedReq = tableData['detailed requirement'];
            statement = this._isPlaceholderOrEmpty(detailedReq) ? null : detailedReq;

            // Append "Fit Criteria" if present
            const fitCriteria = tableData['fit criteria'];
            if (!this._isPlaceholderOrEmpty(fitCriteria)) {
                statement = statement
                    ? `${statement}\n\n**Fit Criteria:**\n${fitCriteria}`
                    : `**Fit Criteria:**\n${fitCriteria}`;
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
                ? `${rationale}\n\n**Opportunities / Risks:**\n${opportunitiesRisks}`
                : `**Opportunities / Risks:**\n${opportunitiesRisks}`;
        }

        // VALIDATION: Rationale warning
        if (!rationale) {
            this._warn(`no rationale`);
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
        let impactedStakeholders = [];
        let unresolvedStakeholdersNote = null;
        if (type === 'OR' && tableData['stakeholders']) {
            const { resolvedStakeholders, unresolvedStakeholders } = this._normalizeStakeholders(tableData['stakeholders']);
            impactedStakeholders = resolvedStakeholders;

            if (unresolvedStakeholders.length > 0) {
                unresolvedStakeholdersNote = `**Stakeholders (unresolved):**\n${unresolvedStakeholders.join('\n')}`;
            }
        }

        // Build privateNotes with identifier and optionally originator
        const privateNotesParts = [];

        if (section.identifier) {
            privateNotesParts.push(`**Identifier:** ${section.identifier}`);
        }

        if (tableData['originator']) {
            privateNotesParts.push(`**Originator:** ${tableData['originator']}`);
        }

        // For ORs, add Data and Impacted Services if present and not placeholder
        if (type === 'OR') {
            // Handle "Data (and other Enabler)" or "Data (and other Enablers)"
            const dataField = tableData['data (and other enabler)'] || tableData['data (and other enablers)'];
            if (!this._isPlaceholderOrEmpty(dataField)) {
                privateNotesParts.push(`**Data (and other Enabler):**\n${dataField.trim()}`);
            }

            // Handle "Impacted Services"
            const servicesField = tableData['impacted services'];
            if (!this._isPlaceholderOrEmpty(servicesField)) {
                privateNotesParts.push(`**Impacted Services:**\n${servicesField.trim()}`);
            }

            // Add unresolved stakeholders if any
            if (unresolvedStakeholdersNote) {
                privateNotesParts.push(unresolvedStakeholdersNote);
            }
        }

        const privateNotes = privateNotesParts.length > 0 ? privateNotesParts.join('\n\n') : null;

        // Extract maturity and tentative for ONs
        let maturity = null;
        let tentative = null;
        if (type === 'ON') {
            const maturityRaw = tableData['maturity'];
            if (!this._isPlaceholderOrEmpty(maturityRaw)) {
                maturity = this._parseMaturity(maturityRaw);
                if (maturity === null) {
                    this._warn(`Unrecognized maturity value "${maturityRaw}" - defaulting to DRAFT`);
                    maturity = 'DRAFT';
                }
            }
            const tentativeRaw = tableData['tentative'];
            if (!this._isPlaceholderOrEmpty(tentativeRaw)) {
                tentative = this._parseTentative(tentativeRaw.trim());
            }
        }

        const requirement = {
            title: tableData.title,
            type: type,
            drg: 'FLOW',
            path: this._normalizePathSegments(path), // Strip numbers from path
            statement: statement,
            rationale: rationale,
            privateNotes: privateNotes,
            maturity: maturity,
            tentative: type === 'ON' ? tentative : null,
            strategicDocuments: type === 'ON' ? this._mergeStrategicDocuments(tableData['strategic documents'], tableData['references']) : [],
            implementedONs: type === 'OR' ? implementedONs : [],
            impactedStakeholders: impactedStakeholders,
            dependencies: [],
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

        this._currentEntity = null;
    }

    /**
     * Extract Use Case and store for later injection
     * @private
     */
    _extractUseCase(section, context) {
        const tableData = this._extractTableData(section, true); // excludeDateOriginator = true

        const onReference = tableData['on reference'];
        if (!onReference) {
            this._warn(`Use Case without ON Reference found, skipping`);
            return;
        }

        // Extract only title and flow of actions
        const title = tableData['title'];
        const flowOfActions = tableData['flow of actions'];

        if (!title || !flowOfActions) {
            this._warn(`Use Case missing title or flow of actions, skipping`);
            return;
        }

        // Format as: **{title}**\n\n{flow of actions}
        const content = `**${title}**\n\n${flowOfActions}`;

        context.useCases.push({
            onReference: this._stripVersion(onReference),
            content: content
        });
    }

    /**
     * Extract table data from section content
     * Preserves AsciiDoc formatting for rich text fields
     * @private
     * @param {boolean} excludeDateOriginator - If true, exclude Date and Originator fields
     * @returns {Object} Field name (lowercase) -> value
     */
    _extractTableData(section, excludeDateOriginator = false) {
        const data = {};

        if (!section.content?.tables || section.content.tables.length === 0) {
            return data;
        }

        // Fields that should preserve AsciiDoc formatting (will be converted to Delta)
        const richTextFields = [
            'need statement',
            'detailed requirement',
            'statement',
            'rationale',
            'fit criteria',
            'opportunities/risks',
            'flows',
            'dependencies',
            'data (and other enabler)',
            'data (and other enablers)',
            'impacted services',
            'flow of actions',
            'references'
        ];

        // Process first table (assuming single table per section)
        const table = section.content.tables[0];

        for (const row of table.rows || []) {
            if (row.length !== 2) continue; // Skip non-key-value rows

            const fieldCell = row[0];
            const valueCell = row[1];

            // Extract field name (strip formatting, remove colons, normalize)
            const fieldName = this._extractText(fieldCell)
                .replace(/:/g, '')
                .trim()
                .toLowerCase();

            // Skip excluded fields
            if (excludeDateOriginator && (fieldName === 'date' || fieldName === 'originator')) {
                continue;
            }

            // For rich text fields, preserve AsciiDoc; for others, strip formatting
            let value;
            if (richTextFields.includes(fieldName)) {
                value = valueCell.trim(); // Keep AsciiDoc formatting
            } else {
                value = this._extractText(valueCell).trim(); // Strip formatting
            }

            if (fieldName && value) {
                data[fieldName] = value;
            }
        }

        return data;
    }

    /**
     * Extract text from cell content (strips AsciiDoc formatting markers)
     * @private
     */
    _extractText(text) {
        if (!text) return '';

        let result = text;

        // Strip AsciiDoc formatting markers
        result = result.replace(/\*\*([^*]+)\*\*/g, '$1');  // **bold** → text
        result = result.replace(/\*([^*]+)\*/g, '$1');       // *italic* → text
        result = result.replace(/__([^_]+)__/g, '$1');       // __underline__ → text

        // Strip AsciiDoc list markers
        result = result.replace(/^\. /gm, '');  // Ordered list
        result = result.replace(/^\* /gm, '');  // Bullet list

        // Handle multiple newlines (join with newlines)
        result = result.replace(/\n+/g, '\n').trim();

        return result;
    }

    /**
     * Parse maturity field value (case-insensitive) to MaturityLevel enum
     * Defined → DRAFT, Advanced → ADVANCED, Mature → MATURE
     * Unrecognized values return null (caller logs warning with entity context)
     * @param {string} text
     * @returns {string|null} MaturityLevel value, or null if unrecognized
     * @private
     */
    _parseMaturity(text) {
        if (!text) return null;
        switch (text.trim().toLowerCase()) {
            case 'defined':  return 'DRAFT';
            case 'advanced': return 'ADVANCED';
            case 'mature':   return 'MATURE';
            default:         return null;
        }
    }

    /**
     * Parse tentative year or year range into a [start, end] array
     * Formats: 'YYYY' or 'YYYY-YYYY'
     * @param {string} text
     * @returns {number[]|null}
     * @private
     */
    _parseTentative(text) {
        const rangeMatch = text.match(/^(\d{4})-(\d{4})$/);
        if (rangeMatch) {
            return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
        }
        const singleMatch = text.match(/^(\d{4})$/);
        if (singleMatch) {
            const year = parseInt(singleMatch[1], 10);
            return [year, year];
        }
        return null;
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

            this._currentEntity = { type: 'OR', title: or.title, path: or._parentPath || [] };

            const { dependsOnRequirements, dependenciesNote } = this._processDependencies(
                or._rawDependencies,
                context,
                or.externalId
            );

            // Update OR with resolved dependencies
            or.dependencies = dependsOnRequirements;

            // Append dependencies note to privateNotes if present
            if (dependenciesNote) {
                or.privateNotes = or.privateNotes
                    ? `${or.privateNotes}\n\n${dependenciesNote}`
                    : dependenciesNote;
            }

            // Clean up temporary field
            delete or._rawDependencies;

            this._currentEntity = null;

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
                    this._warn(`Use Case references unknown ON identifier: "${useCase.onReference}"`);
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

            this._currentEntity = { type: 'OR', title: or.title, path: or._parentPath || [] };

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
                        this._warn(`references unknown ON identifier "${onRef}" (no ONs in parent section)`);
                        unresolvedRefs.push(onRef);
                        unresolved++;
                    } else {
                        this._warn(`references unknown ON identifier "${onRef}" (${onsInParent.length} ONs in parent section - ambiguous)`);
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

            this._currentEntity = null;
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

        // Helper to clean entity by removing null/empty fields and wrap text fields in Delta
        const cleanEntity = (entity) => {
            const cleaned = {};
            for (const [key, value] of Object.entries(entity)) {
                if (value === null || value === undefined) continue;
                if (Array.isArray(value) && value.length === 0) continue;
                if (value === '') continue;

                // Apply Delta conversion to text fields
                if (key === 'statement' || key === 'rationale' || key === 'flows' || key === 'privateNotes') {
                    cleaned[key] = this.converter.asciidocToDelta(value);
                } else {
                    cleaned[key] = value;
                }
            }
            return cleaned;
        };

        const cleanArray = (arr) => arr.map(cleanEntity);

        // Log mapped counts
        console.log(`Mapped entities - ONs: ${context.onMap.size}, ORs: ${context.orMap.size}`);

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: cleanArray(Array.from(context.waveMap.values())),
            requirements: cleanArray(Array.from(context.onMap.values()).concat(Array.from(context.orMap.values()))),
            changes: cleanArray(Array.from(context.changeMap.values()))
        };
    }

    /**
     * Parse the Strategic Documents field into strategicDocuments array.
     * Separators: comma between document tokens.
     * NSP SO sub-references (e.g. NSP SO 4/3) matched directly.
     * ATMMP SDO tokens expanded via _expandAtmmpReferences.
     * EU IR trailing note (e.g. AF 4/5) extracted via trailingNotePattern.
     *
     * @param {string} referencesText - Raw "Strategic Documents" field text
     * @returns {Array<{externalId: string, note?: string}>}
     * @private
     */
    /**
     * Merge strategic document references from two fields into a single array.
     * - strategicDocsText: comma-separated tokens (Strategic Documents field)
     * - referencesText: document blocks with bullet-point notes (References field)
     * Deduplicates by externalId, merging notes if same doc appears in both.
     * @param {string} strategicDocsText
     * @param {string} referencesText
     * @returns {Array<{externalId: string, note?: string}>}
     * @private
     */
    _mergeStrategicDocuments(strategicDocsText, referencesText) {
        const notesMap = new Map(); // externalId -> string[]

        this._parseStrategicDocsField(strategicDocsText, notesMap);
        this._parseReferencesField(referencesText, notesMap);

        const strategicDocuments = [];
        for (const [externalId, notes] of notesMap.entries()) {
            const entry = { externalId };
            if (notes.length > 0) {
                entry.note = notes.join(';\n');
            }
            strategicDocuments.push(entry);
        }
        return strategicDocuments;
    }

    /**
     * Parse Strategic Documents field (comma-separated tokens) into notesMap.
     * @param {string} text
     * @param {Map} notesMap - externalId -> string[], populated in place
     * @private
     */
    _parseStrategicDocsField(text, notesMap) {
        if (!text || text.trim() === '') return;

        const rawTokens = text.split(',').map(t => t.trim()).filter(Boolean);
        const lines = this._expandAtmmpReferences(rawTokens);

        for (const line of lines) {
            const { externalId, note } = this._resolveReferenceLine(line);
            if (externalId) {
                if (!notesMap.has(externalId)) notesMap.set(externalId, []);
                if (note) notesMap.get(externalId).push(note);
            } else {
                console.warn(`WARNING: Unresolved strategic document reference: "${line}"`);
            }
        }
    }

    /**
     * Parse References field (document blocks with bullet-point notes) into notesMap.
     * Format:
     *   <Document Name> [version]
     *
     *   * note 1
     *   * note 2
     *
     * @param {string} text
     * @param {Map} notesMap - externalId -> string[], populated in place
     * @private
     */
    _parseReferencesField(text, notesMap) {
        if (!text || text.trim() === '') return;

        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        let currentExternalId = null;

        for (const line of lines) {
            if (line.startsWith('* ')) {
                // Bullet note — attach to current document
                if (currentExternalId) {
                    const note = line.substring(2).trim();
                    if (note) notesMap.get(currentExternalId).push(note);
                }
            } else {
                // Document name line
                const { externalId } = this._resolveReferenceLine(line);
                if (externalId) {
                    if (!notesMap.has(externalId)) notesMap.set(externalId, []);
                    currentExternalId = externalId;
                } else {
                    console.warn(`WARNING: Unresolved reference document: "${line}"`);
                    currentExternalId = null;
                }
            }
        }
    }

    /**
     * Resolve a single reference line to { externalId, note }.
     * Handles NSP SO, ATMMP SDO, and REFERENCE_DOC_MAP keyword matching.
     * @param {string} line
     * @returns {{ externalId: string|null, note: string|null }}
     * @private
     */
    _resolveReferenceLine(line) {
        const normalizedName = line
            .replace(/,?\s*Ed\.\s*[\d.]+/i, '')
            .replace(/\s+v?[\d.]+$/i, '')
            .trim()
            .toLowerCase();

        const nspSoMatch = line.match(/^NSP SO ([\d/]+)$/i);
        const atmmpSdoMatch = line.match(/^ATMMP SDO (\d+)$/i);

        let matchedEntry = null;
        const externalId = nspSoMatch
            ? ExternalIdBuilder.buildExternalId({ name: `NSP SO ${nspSoMatch[1]}` }, 'refdoc')
            : atmmpSdoMatch
                ? ExternalIdBuilder.buildExternalId({ name: `ATMMP SDO ${atmmpSdoMatch[1]}` }, 'refdoc')
                : (() => {
                    matchedEntry = FlowMapper.REFERENCE_DOC_MAP.find(entry =>
                        entry.keywords.some(kw => normalizedName.includes(kw.toLowerCase()))
                    );
                    return matchedEntry ? matchedEntry.externalId : null;
                })();

        let note = null;
        if (matchedEntry && matchedEntry.trailingNotePattern) {
            const trailingMatch = line.match(matchedEntry.trailingNotePattern);
            if (trailingMatch) {
                note = trailingMatch[1].trim();
            }
        }

        return { externalId, note };
    }

    /**
     * Expand ATMMP SDO tokens with comma-separated SDO numbers into individual lines.
     * Pattern: "ATMMP SDO 2, 5" splits to ["ATMMP SDO 2", "ATMMP SDO 5"] before this method;
     * bare "SDO <n>" tokens following an ATMMP SDO token inherit the ATMMP prefix.
     * @param {string[]} lines
     * @returns {string[]}
     * @private
     */
    _expandAtmmpReferences(lines) {
        const expanded = [];
        let lastAtmmp = false;
        for (const line of lines) {
            if (/^ATMMP\s+SDO\s+\d+$/i.test(line)) {
                expanded.push(line);
                lastAtmmp = true;
            } else if (/^SDO\s+\d+$/i.test(line) && lastAtmmp) {
                const num = line.match(/^SDO\s+(\d+)$/i)[1];
                expanded.push(`ATMMP SDO ${num}`);
            } else {
                expanded.push(line);
                lastAtmmp = false;
            }
        }
        return expanded;
    }
}

export default FlowMapper;