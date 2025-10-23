import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * CRISIS_FAAS_Mapper - Maps CRISIS & FAAS Operational Needs and Requirements Word documents
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Hierarchical Organization Pattern:
 * -----------------------------------
 * The CRISIS_FAAS document uses a simple 3-level hierarchical structure:
 *
 * - Level 1: "Crisis & FAAS DrG" (document root - excluded from path)
 * - Level 2: Organizational folders (e.g., "FAAS ON - OR - OC", "Crisis_Information_Portal ON - OR")
 * - Level 3: Entity sections - "Operational Need (ON)" or "Operational Requirement (OR)"
 *
 * Path Construction:
 * ------------------
 * - Path = Level 2 organizational folder only
 * - Example: ["FAAS ON - OR - OC"]
 * - Level 1 root excluded, Level 3 entity marker excluded
 *
 * External ID Generation:
 * -----------------------
 * - Built from path + normalized title using ExternalIdBuilder
 * - Format: {type}:crisis_faas/{path}/{normalized_title}
 * - Example: on:crisis_faas/faas_on_or_oc/single_faas_system
 * - Example: or:crisis_faas/crisis_information_portal_on_or/manage_content_and_users
 *
 * Title Extraction:
 * -----------------
 * - Title extracted from table field "Title:" (not from section title)
 * - Section title is just the generic marker ("Operational Need (ON)", etc.)
 *
 * Legacy IDs:
 * -----------
 * - ON ID / OR ID fields from tables stored in privateNotes
 * - Also maintained in legacyIdMap for ON Reference resolution
 * - Format in privateNotes: "ON ID: ON_FAAS_001" or "OR ID: OR_FAAS_001_G"
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
 * - "Rationale:" → rationale
 * - "ON ID:" → privateNotes (also stored in legacyIdMap)
 * - "Originator:" → privateNotes
 * - "Date:" → ignored
 *
 * ORs:
 * - "Title:" → title
 * - "Detailed Requirement:" → statement (base)
 * - "Fit Criteria:" → appended to statement with "Fit Criteria:" header
 * - "Rationale:" → rationale (base)
 * - "Opportunities/Risks:" → appended to rationale with "Opportunities / Risks:" header
 * - "ON Reference:" → implementedONs (resolve via legacyIdMap)
 * - "OR ID:" → privateNotes (also stored in legacyIdMap)
 * - "Originator:" → privateNotes
 * - "Date:" → ignored
 *
 * OR fields stored in privateNotes:
 * - "Data (and other Enabler):" → privateNotes (if not empty/TBD/N/A)
 * - "Impacted Services:" → privateNotes (if not empty/TBD/N/A)
 * - "Dependencies:" → privateNotes (if not empty/TBD/N/A)
 * - "Stakeholders:" → TODO: will be mapped to impactsStakeholderCategories (currently skipped)
 *
 * EXCLUDED:
 * - Section identifier field (from extractor) not stored
 * - Use Cases: Not present in CRISIS_FAAS documents
 */
class CRISIS_FAAS_Mapper extends Mapper {
    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        const context = this._initContext();

        // Process all sections to extract ONs and ORs
        for (const section of rawData.sections || []) {
            this._processSection(section, context);
        }

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
            legacyIdMap: new Map(), // ON ID / OR ID -> externalId (for ON Reference resolution)
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
        if (this._isPlaceholderOrEmpty(trimmed)) {
            return { resolvedStakeholders: [], unresolvedStakeholders: [] };
        }

        // Stakeholder mapping: name → { externalId, note? }
        const stakeholderMap = new Map([
            // Direct mappings
            ['nm', { externalId: 'stakeholder:network/nm' }],
            ['nmoc', { externalId: 'stakeholder:network/nm/nmoc' }],
            ['eaccc', { externalId: 'stakeholder:network/eaccc' }],
            ['easa', { externalId: 'stakeholder:network/easa' }],
            ['airspace users', { externalId: 'stakeholder:network/airspace_user' }],
            ['airspace user', { externalId: 'stakeholder:network/airspace_user' }],
            ['ansp', { externalId: 'stakeholder:network/ansp' }],
            ['fmp', { externalId: 'stakeholder:network/ansp/fmp' }],
            ['airport operator', { externalId: 'stakeholder:network/airport_operator' }],

            // Crisis/Network specific
            ['crisis management team', { externalId: 'stakeholder:network/nm/crisis_management_team' }],
            ['cmt', { externalId: 'stakeholder:network/nm/crisis_management_team' }],
            ['nm crisis exercise team', { externalId: 'stakeholder:network/nm/crisis_exercise_team' }],
            ['all users', { externalId: 'stakeholder:network' }],

            // With notes
            ['nm om, ops supervisors and management', {
                externalId: 'stakeholder:network/nm/nmoc',
                note: 'NOM, OPS supervisors and management'
            }],
            ['risk management', {
                externalId: 'stakeholder:network/nm',
                note: 'Risk Management'
            }],
            ['eaccc secretary', {
                externalId: 'stakeholder:network/eaccc',
                note: 'Secretary'
            }]
        ]);

        const resolvedStakeholders = [];
        const unresolvedStakeholders = [];

        // Split by newlines, semicolons, commas, "and", "&", "+"
        const parts = trimmed.split(/[\n;,]|\s+and\s+|\s+\+\s+|\s*&\s*/i)
            .map(p => p.trim())
            .filter(p => p);

        for (let part of parts) {
            // Strip qualifiers in parentheses: "NMOC (end user)" → "NMOC"
            part = part.replace(/\s*\([^)]*\)\s*/g, '').trim();

            if (!part) continue;

            // Normalize for lookup
            const normalized = part.toLowerCase().trim();

            // Try to find in stakeholder map
            const mapping = stakeholderMap.get(normalized);

            if (mapping) {
                // Create reference object and avoid duplicates
                const refObj = { externalId: mapping.externalId };
                if (mapping.note) {
                    refObj.note = mapping.note;
                }

                // Check for duplicates (same externalId + note)
                const isDuplicate = resolvedStakeholders.find(s =>
                    s.externalId === refObj.externalId &&
                    s.note === refObj.note
                );

                if (!isDuplicate) {
                    resolvedStakeholders.push(refObj);
                }
            } else {
                // Unresolved - add to list
                if (!unresolvedStakeholders.includes(part)) {
                    unresolvedStakeholders.push(part);
                }
            }
        }

        return { resolvedStakeholders, unresolvedStakeholders };
    }

    /**
     * Recursively process section hierarchy
     * @private
     */
    _processSection(section, context, ancestorPath = []) {
        // Skip level 1 root section ("Crisis & FAAS DrG")
        if (section.level === 1) {
            for (const subsection of section.subsections || []) {
                this._processSection(subsection, context, ancestorPath);
            }
            return;
        }

        // Check if this section is an entity marker (ON/OR) at level 3
        const entityType = this._getEntityType(section.title);

        if (entityType) {
            // This is an ON/OR - extract it with current ancestor path (level 2 only)
            this._extractRequirement(section, entityType, ancestorPath, context);
            // Don't recurse into entity sections
            return;
        }

        // Not an entity marker - this is organizational structure (level 2)
        // Build path by including this level
        const currentPath = [...ancestorPath, section.title];

        // Recurse into subsections
        for (const subsection of section.subsections || []) {
            this._processSection(subsection, context, currentPath);
        }
    }

    /**
     * Determine entity type from section title
     * @private
     * @returns {'ON'|'OR'|null}
     */
    _getEntityType(title) {
        const normalized = title?.trim().toLowerCase();
        if (normalized === 'operational need (on)') return 'ON';
        if (normalized === 'operational requirement (or)') return 'OR';
        return null;
    }

    /**
     * Extract ON or OR from section with table data
     * @private
     */
    _extractRequirement(section, type, path, context) {
        // Skip sections without tables
        if (!section.content?.tables?.[0]) {
            console.warn(`Skipping ${type} without table at path: ${JSON.stringify(path)}`);
            return;
        }

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

        if (type === 'OR') {
            const opportunitiesRisks = tableData['opportunities/risks'];
            if (!this._isPlaceholderOrEmpty(opportunitiesRisks)) {
                rationale = rationale
                    ? `${rationale}\n\nOpportunities / Risks:\n${opportunitiesRisks}`
                    : `Opportunities / Risks:\n${opportunitiesRisks}`;
            }
        }

        // VALIDATION: Rationale warning
        if (!rationale) {
            console.warn(`WARNING: ${type} "${tableData.title}" at path ${JSON.stringify(path)} has no rationale`);
        }

        // Build privateNotes
        const privateNotesEntries = [];

        // Add legacy ID (ON ID or OR ID)
        const legacyIdField = type === 'ON' ? 'on id' : 'or id';
        const legacyId = tableData[legacyIdField];
        if (!this._isPlaceholderOrEmpty(legacyId)) {
            privateNotesEntries.push(`${type} ID: ${legacyId}`);
            // Note: Will store in legacyIdMap after externalId generation
        }

        // Add originator if present
        const originator = tableData['originator'];
        if (!this._isPlaceholderOrEmpty(originator)) {
            privateNotesEntries.push(`Originator: ${originator}`);
        }

        // For OR: Add additional fields
        let resolvedStakeholders = [];
        if (type === 'OR') {
            // Process Stakeholders
            const stakeholdersField = tableData['stakeholders'];
            if (!this._isPlaceholderOrEmpty(stakeholdersField)) {
                const { resolvedStakeholders: resolved, unresolvedStakeholders } = this._normalizeStakeholders(stakeholdersField);
                resolvedStakeholders = resolved;

                // Add unresolved to privateNotes
                if (unresolvedStakeholders.length > 0) {
                    privateNotesEntries.push(`Stakeholders (unresolved):\n${unresolvedStakeholders.join('\n')}`);
                }
            }

            const dataEnablers = tableData['data (and other enabler)'];
            if (!this._isPlaceholderOrEmpty(dataEnablers)) {
                privateNotesEntries.push(`Data (and other Enabler): ${dataEnablers}`);
            }

            const impactedServices = tableData['impacted services'];
            if (!this._isPlaceholderOrEmpty(impactedServices)) {
                privateNotesEntries.push(`Impacted Services: ${impactedServices}`);
            }

            const dependencies = tableData['dependencies'];
            if (!this._isPlaceholderOrEmpty(dependencies)) {
                privateNotesEntries.push(`Dependencies: ${dependencies}`);
            }
        }

        const privateNotes = privateNotesEntries.length > 0
            ? privateNotesEntries.join('\n\n')
            : null;

        // Build requirement entity
        const requirement = {
            title: tableData.title,
            type,
            drg: 'CRISIS_FAAS',
            path,
            statement,
            rationale,
            flows: null,
            privateNotes,
            parentExternalId: null,
            implementedONs: [],
            impactsStakeholderCategories: resolvedStakeholders,
            impactsServices: [],
            impactsDataCategories: [],
            referencesDocuments: [],
            dependsOnRequirements: []
        };

        // Generate external ID from requirement object
        requirement.externalId = ExternalIdBuilder.buildExternalId(requirement, type.toLowerCase());

        // Store legacy ID in map for ON Reference resolution (reuse legacyId from earlier)
        if (!this._isPlaceholderOrEmpty(legacyId)) {
            context.legacyIdMap.set(legacyId, requirement.externalId);
        }

        // For OR: Resolve ON Reference to implementedONs
        if (type === 'OR') {
            const onReference = tableData['on reference'];
            if (!this._isPlaceholderOrEmpty(onReference)) {
                const referencedOnId = context.legacyIdMap.get(onReference);
                if (referencedOnId) {
                    requirement.implementedONs.push(referencedOnId);
                } else {
                    console.warn(`WARNING: OR "${tableData.title}" references unknown ON: "${onReference}"`);
                }
            }
        }

        // Store in context
        if (type === 'ON') {
            context.onMap.set(requirement.externalId, requirement);
        } else {
            context.orMap.set(requirement.externalId, requirement);
        }
    }

    /**
     * Extract table data from section
     * Finds the first 2-column table and extracts field-value pairs
     * @private
     * @returns {Object} Map of field names to values
     */
    _extractTableData(section) {
        const data = {};

        // Find first table in section
        const table = section.content?.tables?.[0];
        if (!table || !table.rows) {
            return data;
        }

        // Extract field-value pairs from 2-column table
        for (const row of table.rows) {
            if (row.length < 2) continue;

            const [fieldCell, valueCell] = row;

            // Extract field name (remove HTML tags, remove colon, lowercase)
            const fieldName = this._extractText(fieldCell)
                .replace(/:/g, '')
                .trim()
                .toLowerCase();

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

        // Remove HTML tags but preserve line breaks from <br> and </p>
        let text = html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\n+/g, '\n')
            .trim();

        return text;
    }

    /**
     * Build final output with all entity collections
     * @private
     */
    _buildOutput(context) {
        const requirements = [
            ...Array.from(context.onMap.values()),
            ...Array.from(context.orMap.values())
        ];

        console.log(`\nMapping Summary:`);
        console.log(`  ONs: ${context.onMap.size}`);
        console.log(`  ORs: ${context.orMap.size}`);
        console.log(`  Total: ${requirements.length}`);

        return {
            documents: [],
            stakeholderCategories: [],
            dataCategories: [],
            services: [],
            waves: [],
            requirements
        };
    }
}

export default CRISIS_FAAS_Mapper;