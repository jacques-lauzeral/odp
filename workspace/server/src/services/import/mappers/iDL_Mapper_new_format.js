import Mapper from '../Mapper.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * Mapper for iDL structured section/table Word documents (TCF, LoA)
 * Handles the new document format where ONs and ORs are expressed as
 * clean 2-column vertical tables under dedicated top-level sections.
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ====================================
 *
 * Section Detection:
 * ------------------
 * - Section titled "Operational Needs" (any level) → ON tables
 * - Section titled "Operational Requirements" (any level) → OR subsections
 *   - Each subsection (OR block) groups related ORs; block title captured in path
 * - Section titled "Operational Changes" (any level) → OC tables (future)
 *
 * Table Format:
 * -------------
 * Each entity is one 2-column table: row[0] = field label, row[1] = value.
 * No bold markers. No entity codes in document — externalIds are generated.
 *
 * Field Mapping:
 * --------------
 * | Source Field                        | Target                | Scope       | Notes                              |
 * |-------------------------------------|-----------------------|-------------|------------------------------------|
 * | Title                               | title                 | ON + OR     |                                    |
 * | Statement                           | statement             | ON + OR     | Rich text                          |
 * | Rationale                           | rationale             | ON + OR     | Rich text                          |
 * | Flow Descriptions and Flow Examples | flows                 | ON + OR     | Rich text                          |
 * | Maturity Level                      | maturity              | ON + OR     | Uppercased                         |
 * | Private Notes                       | privateNotes          | ON + OR     | Rich text                          |
 * | Additional Documentation            | privateNotes          | ON + OR     | Appended with warning              |
 * | Tentative Implementation Time       | tentative             | ON only     | Parsed to [start, end] year range  |
 * | Strategic Documents                 | strategicDocuments    | ON only     | Resolved via document alias map    |
 * | Refines                             | refinesParents        | ON + OR     | Title-resolved within batch        |
 * | Implements                          | implementedONs        | OR only     | Title-resolved within batch        |
 * | Impact                              | impactedStakeholders  | OR only     | Resolved via stakeholder synonym   |
 * | Dependencies                        | dependencies          | OR only     | Title-resolved within batch        |
 * | NFRs                                | nfrs                  | OR only     | Rich text                          |
 * | Domain                              | (dropped)             |             | Implicit from DrG/folder           |
 *
 * ExternalId Construction:
 * -------------------------
 * Uses ExternalIdBuilder.buildExternalId() with path-based format:
 * - ONs:  path = [folder]          → on:idl/{folder}/{title_normalized}
 * - ORs (flat):   path = [folder]  → or:idl/{folder}/{title_normalized}
 * - ORs (block):  path = [folder, blockTitle] → or:idl/{folder}/{block_normalized}/{title_normalized}
 *
 * Title-Based Reference Resolution:
 * -----------------------------------
 * Refines, Implements, Dependencies reference other entities by title (not code).
 * Two-pass approach: collect all ONs/ORs first, build titleToExternalId map, then resolve.
 * On unresolved reference: emit warning and drop the reference.
 *
 * Document Alias Resolution:
 * --------------------------
 * Strategic Documents resolved via DOCUMENT_ALIASES map (same as iDL_Mapper_sections).
 * On unresolved alias: emit warning.
 */

/**
 * Stakeholder synonym map — shared with iDL_Mapper_tables
 */
const STAKEHOLDER_SYNONYMS = {
    // NM and sub-teams
    'nm': 'stakeholder:network/nm',
    'network manager': 'stakeholder:network/nm',
    'network manager (nm)': 'stakeholder:network/nm',
    'nm operational analysis units': 'stakeholder:network/nm',
    'nm performance and reporting units': 'stakeholder:network/nm',
    'nmoc': 'stakeholder:network/nm/nmoc',
    'network manager operation centre': 'stakeholder:network/nm/nmoc',
    'network manager operation centre (nmoc)': 'stakeholder:network/nm/nmoc',
    'network manager operations centre': 'stakeholder:network/nm/nmoc',
    'network manager operations centre (nmoc)': 'stakeholder:network/nm/nmoc',
    'nm rad team': 'stakeholder:network/nm/nm_rad_team',
    'nm rad': 'stakeholder:network/nm/nm_rad_team',
    'nmad': 'stakeholder:network/nm/nmoc',
    'nm airspace data team': 'stakeholder:network/nm/nmoc',
    'nm airspace data (ad) team': 'stakeholder:network/nm/nmoc',
    'nm airspace design team': 'stakeholder:network/nm/nmoc',
    'nm tcf team': 'stakeholder:network/nm/tcf',
    'nm tcf': 'stakeholder:network/nm/tcf',
    'nm data management & tcf': 'stakeholder:network/nm/tcf',
    'nos airspace validation team': 'stakeholder:network/nm/nmoc/nos_airspace_validation_team',
    'network operations (nos) airspace validation team': 'stakeholder:network/nm/nmoc/nos_airspace_validation_team',

    // ANSP and coordinators
    'network': 'stakeholder:network',
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
    'national/local environment coordinator (nec/lec)': ['stakeholder:network/ansp/nec', 'stakeholder:network/ansp/lec'],
    'nrc': 'stakeholder:network/ansp/nrc',
    'national rad coordinator': 'stakeholder:network/ansp/nrc',
    'national rad coordinator (nrc)': 'stakeholder:network/ansp/nrc',
    'fmp': 'stakeholder:network/ansp/fmp',
    'flow management position': 'stakeholder:network/ansp/fmp',
    'amc': 'stakeholder:network/ansp/amc',
    'airspace management cell': 'stakeholder:network/ansp/amc',
    'atc unit': 'stakeholder:network/ansp/atc_unit',
    'ats unit': 'stakeholder:network/ansp/ats',
    'ats units': 'stakeholder:network/ansp/ats',
    'ats units (acc/app/twr)': 'stakeholder:network/ansp/ats',
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
    'airspace users (aus)': 'stakeholder:network/airspace_user',
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
    'fab': 'stakeholder:network/ansp',
    'state / fab / ansp': 'stakeholder:network/ansp',
    'ansps / states code coordinators': 'stakeholder:network/ansp',

    // TCF-specific
    'tcf analysts': 'stakeholder:network/nm/tcf',
    'tcf monitoring team': 'stakeholder:network/nm/tcf',
    'nm surveillance data analysis (faas)': 'stakeholder:network/nm',
    'nmoc operations': 'stakeholder:network/nm/nmoc',

    // LoA-specific
    'nm operational staff (nmoc)': 'stakeholder:network/nm/nmoc',
    'nm data management staff': 'stakeholder:network/nm/nmoc',
    'aeronautical information service providers (aisps)': 'stakeholder:network/ansp',
    'ansp operational support units': 'stakeholder:network/ansp'
};

/**
 * Document alias map — resolves raw document names to canonical refdoc externalIds
 */
const DOCUMENT_ALIASES = {
    'idl_(airspace)_conops': 'refdoc:idl_(airspace)_conops',
    'idl_conops':            'refdoc:idl_(airspace)_conops'
};

/**
 * Normalize a section title for section-type detection (lowercase, trimmed)
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
    return (title || '').trim().toLowerCase();
}

/**
 * Detect section type from title
 * @param {string} title
 * @returns {'on'|'or'|'oc'|null}
 */
function detectSectionType(title) {
    const t = normalizeTitle(title);
    if (t.includes('operational needs')) return 'on';
    if (t.includes('operational requirements')) return 'or';
    if (t.includes('operational changes')) return 'oc';
    return null;
}

/**
 * Extract field map from a 2-column vertical table (rows = [[label, value], ...])
 * Returns plain object keyed by normalized label.
 * @param {Object} table
 * @returns {Object}
 */
function extractTableFields(table) {
    const fields = {};
    for (const row of table.rows || []) {
        if (row.length < 2) continue;
        const key = (row[0] || '').trim();
        const value = (row[1] || '').trim();
        if (key && value) {
            fields[key] = value;
        }
    }
    return fields;
}

/**
 * Parse tentative year range from string
 * Handles formats: "2027–2029", "2027-2029", "2027 – 2029", "2027"
 * Returns [start, end] or null if unparseable.
 * @param {string} value
 * @returns {number[]|null}
 */
function parseTentativeRange(value) {
    if (!value || value.trim().toLowerCase() === 'n/a') return null;
    // Replace en-dash, em-dash, hyphen variants
    const normalized = value.replace(/[–—]/g, '-');
    const match = normalized.match(/(\d{4})\s*-\s*(\d{4})/);
    if (match) {
        return [parseInt(match[1], 10), parseInt(match[2], 10)];
    }
    // Single year
    const single = value.match(/(\d{4})/);
    if (single) {
        const year = parseInt(single[1], 10);
        return [year, year];
    }
    return null;
}

/**
 * Check if a field value is empty/placeholder
 * @param {string} value
 * @returns {boolean}
 */
function isEmptyValue(value) {
    if (!value) return true;
    const t = value.trim().toLowerCase();
    return t === '' || t === 'n/a' || t === 'none' || t === 'tbd';
}

class iDL_Mapper_new_format extends Mapper {

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @param {Object} options - Mapping options
     * @param {string} options.folder - Target folder (e.g., 'TCF', 'LoA')
     * @returns {Object} StructuredImportData
     */
    map(rawData, options = {}) {
        const { folder } = options;

        if (!folder) {
            throw new Error('iDL_Mapper_new_format requires folder option');
        }

        console.log(`iDL_Mapper_new_format mapping raw data for folder: ${folder}`);

        const context = this._initContext(folder);

        // Pass 1: collect all ONs and ORs
        for (const section of rawData.sections || []) {
            const sectionType = detectSectionType(section.title);
            if (sectionType === 'on') {
                this._parseONSection(section, context);
            } else if (sectionType === 'or') {
                this._parseORSection(section, context);
            }
        }

        console.log(`Parsed: ${context.onMap.size} ONs, ${context.orMap.size} ORs`);

        // Pass 2: resolve title-based references
        this._resolveReferences(context);

        return this._buildOutput(context);
    }

    // -------------------------------------------------------------------------
    // Context
    // -------------------------------------------------------------------------

    _initContext(folder) {
        return {
            folder,
            onMap: new Map(),      // externalId → ON entity
            orMap: new Map(),      // externalId → OR entity
            // Title → externalId maps built after pass 1 for cross-reference resolution
            onTitleMap: new Map(), // normalized title → externalId
            orTitleMap: new Map(), // normalized title → externalId
            warnings: []
        };
    }

    // -------------------------------------------------------------------------
    // Section parsing
    // -------------------------------------------------------------------------

    /**
     * Parse Operational Needs section — tables at direct section level
     * @param {Object} section
     * @param {Object} context
     * @private
     */
    _parseONSection(section, context) {
        // Tables may sit directly in this section or in subsections
        this._parseTablesAsONs(section.content?.tables || [], context);
        for (const sub of section.subsections || []) {
            this._parseTablesAsONs(sub.content?.tables || [], context);
        }
    }

    /**
     * Parse a list of tables as ON entities
     * @param {Object[]} tables
     * @param {Object} context
     * @private
     */
    _parseTablesAsONs(tables, context) {
        for (const table of tables) {
            const entity = this._parseEntityTable(table, 'ON', context);
            if (entity) {
                context.onMap.set(entity.externalId, entity);
                context.onTitleMap.set(entity.title.toLowerCase(), entity.externalId);
            }
        }
    }

    /**
     * Parse Operational Requirements section — ORs may be grouped in subsections (blocks)
     * @param {Object} section
     * @param {Object} context
     * @private
     */
    _parseORSection(section, context) {
        // Tables directly under the OR section (flat layout, e.g. LoA)
        this._parseTablesAsORs(section.content?.tables || [], null, context);

        // Subsections = OR blocks only if title contains "block" (case-insensitive)
        // Other subsections (e.g. "ON-to-OR Map") are navigational — parse as flat ORs
        for (const sub of section.subsections || []) {
            const isBlock = /block/i.test(sub.title || '');
            const blockTitle = isBlock ? sub.title : null;
            this._parseTablesAsORs(sub.content?.tables || [], blockTitle, context);
        }
    }

    /**
     * Parse a list of tables as OR entities, with optional block title for path
     * @param {Object[]} tables
     * @param {string|null} blockTitle
     * @param {Object} context
     * @private
     */
    _parseTablesAsORs(tables, blockTitle, context) {
        for (const table of tables) {
            const entity = this._parseEntityTable(table, 'OR', context, blockTitle);
            if (entity) {
                context.orMap.set(entity.externalId, entity);
                context.orTitleMap.set(entity.title.toLowerCase(), entity.externalId);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Table parsing
    // -------------------------------------------------------------------------

    /**
     * Parse a single 2-column vertical table as an ON or OR entity
     * @param {Object} table
     * @param {'ON'|'OR'} type
     * @param {Object} context
     * @param {string|null} [blockTitle] - OR block subsection title (OR only)
     * @returns {Object|null} Parsed entity or null if skipped
     * @private
     */
    _parseEntityTable(table, type, context, blockTitle = null) {
        const fields = extractTableFields(table);
        const title = (fields['Title'] || '').trim();

        if (!title) {
            // Skip template placeholder tables
            return null;
        }

        // Build path
        // ONs: [folder]
        // ORs (flat): [folder]
        // ORs (block): [folder, blockTitle]
        const path = (type === 'OR' && blockTitle)
            ? [context.folder, blockTitle]
            : [context.folder];

        // Build externalId via ExternalIdBuilder
        const externalId = ExternalIdBuilder.buildExternalId(
            { drg: 'IDL', title, path },
            type.toLowerCase()
        );

        // Rich text fields
        const statement    = this._toRichText(fields['Statement']);
        const rationale    = this._toRichText(fields['Rationale']);
        const flows        = this._toRichText(fields['Flow Descriptions and Flow Examples']);
        const nfrs         = type === 'OR' ? this._toRichTextOrNull(fields['NFRs']) : null;

        // Plain / structured fields
        const maturity     = (fields['Maturity Level'] || 'DRAFT').trim().toUpperCase();
        const tentative    = type === 'ON' ? parseTentativeRange(fields['Tentative Implementation Time']) : null;

        // privateNotes — start with Private Notes field
        let privateNotesText = isEmptyValue(fields['Private Notes']) ? '' : fields['Private Notes'];

        // additionalDocumentation → append to privateNotes with warning
        if (!isEmptyValue(fields['Additional Documentation'])) {
            const addDoc = fields['Additional Documentation'].trim();
            context.warnings.push(
                `${externalId}: 'Additional Documentation' field present — appended to privateNotes`
            );
            privateNotesText = privateNotesText
                ? `${privateNotesText}\n\n**Additional Documentation:**\n${addDoc}`
                : `**Additional Documentation:**\n${addDoc}`;
        }

        const privateNotes = this._toRichTextOrNull(privateNotesText);

        // Strategic Documents (ON only) — raw value stored, resolved later
        const rawStrategicDocuments = (type === 'ON' && !isEmptyValue(fields['Strategic Documents']))
            ? fields['Strategic Documents']
            : null;

        // Impact (OR only) — stakeholders, raw stored for later resolution
        const rawImpact = (type === 'OR' && !isEmptyValue(fields['Impact']))
            ? fields['Impact']
            : null;

        // Cross-references — stored as raw titles, resolved in pass 2
        const rawRefines      = isEmptyValue(fields['Refines'])     ? null : fields['Refines'];
        const rawImplements   = (type === 'OR' && !isEmptyValue(fields['Implements'])) ? fields['Implements'] : null;
        const rawDependencies = (type === 'OR' && !isEmptyValue(fields['Dependencies'])) ? fields['Dependencies'] : null;

        return {
            externalId,
            title,
            type,
            drg: 'IDL',
            path,
            statement,
            rationale,
            flows,
            nfrs,
            maturity,
            tentative,
            privateNotes,
            impactedStakeholders: [],  // resolved in pass 2
            impactedDomains:      [],
            implementedONs:       [],  // resolved in pass 2
            refinesParents:       [],  // resolved in pass 2
            dependencies:         [],  // resolved in pass 2
            strategicDocuments:   [],  // resolved in pass 2
            // Internal fields for pass 2
            _rawStrategicDocuments: rawStrategicDocuments,
            _rawImpact:             rawImpact,
            _rawRefines:            rawRefines,
            _rawImplements:         rawImplements,
            _rawDependencies:       rawDependencies
        };
    }

    // -------------------------------------------------------------------------
    // Pass 2: reference resolution
    // -------------------------------------------------------------------------

    /**
     * Resolve all title-based cross-references and drop internal fields
     * @param {Object} context
     * @private
     */
    _resolveReferences(context) {
        for (const [, on] of context.onMap) {
            // Refines
            ({ resolved: on.refinesParents } = this._resolveTitleRefs(
                on._rawRefines, context.onTitleMap, on.externalId, 'Refines', context
            ));

            // Strategic Documents
            on.strategicDocuments = this._resolveStrategicDocuments(
                on._rawStrategicDocuments, on.externalId, context
            );

            this._cleanInternalFields(on);
        }

        for (const [, or] of context.orMap) {
            // Refines (can refine ONs or ORs)
            const { resolved: refinesFromONs } = this._resolveTitleRefs(
                or._rawRefines, context.onTitleMap, or.externalId, 'Refines (ON)', context
            );
            const { resolved: refinesFromORs } = this._resolveTitleRefs(
                or._rawRefines, context.orTitleMap, or.externalId, 'Refines (OR)', context, true
            );
            or.refinesParents = [...new Set([...refinesFromONs, ...refinesFromORs])];

            // Implements
            ({ resolved: or.implementedONs } = this._resolveTitleRefs(
                or._rawImplements, context.onTitleMap, or.externalId, 'Implements', context
            ));

            // Dependencies
            const { resolved: resolvedDeps, unresolvedParts: unresolvedDeps } = this._resolveTitleRefs(
                or._rawDependencies, context.orTitleMap, or.externalId, 'Dependencies', context
            );
            or.dependencies = resolvedDeps;
            if (unresolvedDeps.length > 0) {
                or.privateNotes = this._appendToRichText(
                    or.privateNotes, `Dependencies (unresolved):\n${unresolvedDeps.join('\n')}`
                );
            }

            // Stakeholders
            if (or._rawImpact) {
                const { resolved, unresolvedText } = this._resolveStakeholders(
                    or._rawImpact, or.externalId, context
                );
                or.impactedStakeholders = resolved;
                if (unresolvedText) {
                    or.privateNotes = this._appendToRichText(
                        or.privateNotes, `Stakeholders (unresolved):\n${unresolvedText}`
                    );
                }
            }

            this._cleanInternalFields(or);
        }

        if (context.warnings.length > 0) {
            console.log('Mapping warnings:');
            for (const w of context.warnings) {
                console.log(`  - ${w}`);
            }
        }
    }

    /**
     * Resolve a raw reference value (title string or N/A) against a title map.
     * The raw value may be a single title or a comma/semicolon-separated list.
     * @param {string|null} rawValue
     * @param {Map} titleMap - normalized title → externalId
     * @param {string} entityId - for warning messages
     * @param {string} fieldName - for warning messages
     * @param {Object} context
     * @param {boolean} [silentMiss=false] - suppress warnings on miss (used for dual-map Refines lookup)
     * @returns {string[]} Array of resolved externalIds
     * @private
     */
    _resolveTitleRefs(rawValue, titleMap, entityId, fieldName, context, silentMiss = false) {
        if (!rawValue || isEmptyValue(rawValue)) return { resolved: [], unresolvedParts: [] };

        const resolved = [];
        const unresolvedParts = [];
        const parts = rawValue.split(/[\n;,*•]+/).map(s => s.trim()).filter(Boolean);

        for (const part of parts) {
            if (isEmptyValue(part)) continue;
            // Trim at first sentence boundary — guards against cell content bleeding
            // into the next sentence (e.g. "Title of ORSome explanation text...")
            const titleCandidate = part.split(/\.\s+/)[0].trim();
            const externalId = titleMap.get(titleCandidate.toLowerCase());
            if (externalId) {
                resolved.push(externalId);
            } else if (!silentMiss) {
                context.warnings.push(
                    `${entityId}: ${fieldName} reference unresolved — "${part}" appended to privateNotes`
                );
                unresolvedParts.push(part);
            }
        }

        return { resolved, unresolvedParts };
    }

    /**
     * Resolve Strategic Documents field value to annotated references
     * @param {string|null} rawValue - e.g. "iDL CONOPS"
     * @param {string} entityId
     * @param {Object} context
     * @returns {Object[]} Array of {externalId} objects
     * @private
     */
    _resolveStrategicDocuments(rawValue, entityId, context) {
        if (!rawValue) return [];

        const resolved = [];
        const parts = rawValue.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);

        for (const part of parts) {
            if (isEmptyValue(part)) continue;
            const externalId = this._resolveDocumentAlias(part, entityId, context);
            if (externalId) {
                resolved.push({ externalId });
            }
        }

        return resolved;
    }

    /**
     * Resolve a document name to a canonical refdoc externalId via DOCUMENT_ALIASES
     * @param {string} docName
     * @param {string} entityId - for warning context
     * @param {Object} context
     * @returns {string|null}
     * @private
     */
    _resolveDocumentAlias(docName, entityId, context) {
        const normalized = ExternalIdBuilder._normalize(docName);

        if (DOCUMENT_ALIASES[normalized]) {
            return DOCUMENT_ALIASES[normalized];
        }

        // Prefix match (handles version suffixes)
        for (const [prefix, externalId] of Object.entries(DOCUMENT_ALIASES)) {
            if (normalized.startsWith(prefix)) {
                return externalId;
            }
        }

        context.warnings.push(
            `${entityId}: Strategic Documents reference unresolved — cannot find alias for "${docName}" (dropped)`
        );
        return null;
    }

    /**
     * Resolve stakeholder Impact field to externalIds via synonym map
     * @param {string} rawText
     * @param {string} entityId
     * @param {Object} context
     * @returns {{ resolved: Object[], unresolvedText: string|null }}
     * @private
     */
    _resolveStakeholders(rawText, entityId, context) {
        const resolved = [];
        const seenIds = new Set();
        const unresolvedParts = [];

        // The Impact field may contain "Stakeholder Categories: Network, ANSP\nDomains: TCF"
        // or without newline: "Stakeholder Categories: Network, ANSPDomains: TCF"
        // Split on label boundaries first, then parse stakeholder tokens only
        const stakeholderSection = rawText
            .replace(/domains:\s*[^\n]*/gi, '')          // remove "Domains: ..." portions
            .replace(/stakeholder categories:\s*/gi, ''); // remove label prefix

        const lines = stakeholderSection.split('\n');

        for (const line of lines) {
            // Strip bullet markers
            let text = line
                .replace(/^[*\-•\s]+/, '')
                .trim();

            if (!text) continue;

            // Skip generic/noise references
            if (text.toLowerCase().includes('all idl stakeholders') ||
                text.toLowerCase() === 'data originators') {
                unresolvedParts.push(text);
                continue;
            }

            // Values may be comma-separated within a line
            const parts = text.split(',').map(s => s.trim()).filter(Boolean);

            for (const part of parts) {
                const normalized = part.toLowerCase().trim();
                const match = STAKEHOLDER_SYNONYMS[normalized];

                if (match) {
                    const ids = Array.isArray(match) ? match : [match];
                    for (const id of ids) {
                        if (!seenIds.has(id)) {
                            seenIds.add(id);
                            resolved.push({ externalId: id });
                        }
                    }
                } else {
                    unresolvedParts.push(part);
                    context.warnings.push(`${entityId}: Unresolved stakeholder "${part}"`);
                }
            }
        }

        return {
            resolved,
            unresolvedText: unresolvedParts.length > 0 ? unresolvedParts.join('\n') : null
        };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Convert text to Quill Delta rich text string
     * Returns empty string (not null) for missing/empty values — consistent with
     * how JSONImporter phase 2 initialises fields.
     * @param {string|undefined} text
     * @returns {string}
     * @private
     */
    _toRichText(text) {
        return this.converter.asciidocToDelta(isEmptyValue(text) ? '' : text);
    }

    /**
     * Convert text to Quill Delta rich text string, or null if empty
     * @param {string|undefined} text
     * @returns {string|null}
     * @private
     */
    _toRichTextOrNull(text) {
        if (isEmptyValue(text)) return null;
        return this.converter.asciidocToDelta(text);
    }

    /**
     * Append plain text to an existing rich text (Delta JSON string) field
     * @param {string|null} existing - Existing Delta JSON string or null
     * @param {string} addition - Plain text to append
     * @returns {string} Updated Delta JSON string
     * @private
     */
    _appendToRichText(existing, addition) {
        if (!addition) return existing;

        if (existing) {
            try {
                const delta = JSON.parse(existing);
                const ops = delta.ops || [];
                ops.push({ insert: `\n\n${addition}` });
                return JSON.stringify({ ops });
            } catch {
                // Fallback: treat existing as plain text
                return this.converter.asciidocToDelta(`${existing}\n\n${addition}`);
            }
        }

        return this.converter.asciidocToDelta(addition);
    }

    /**
     * Remove internal _raw* fields from a processed entity
     * @param {Object} entity
     * @private
     */
    _cleanInternalFields(entity) {
        delete entity._rawStrategicDocuments;
        delete entity._rawImpact;
        delete entity._rawRefines;
        delete entity._rawImplements;
        delete entity._rawDependencies;
    }

    // -------------------------------------------------------------------------
    // Output
    // -------------------------------------------------------------------------

    /**
     * Build final StructuredImportData output
     * @param {Object} context
     * @returns {Object}
     * @private
     */
    _buildOutput(context) {
        const requirements = [
            ...context.onMap.values(),
            ...context.orMap.values()
        ];

        console.log(
            `Output: ${requirements.length} requirements ` +
            `(${context.onMap.size} ONs, ${context.orMap.size} ORs)`
        );

        return {
            requirements,
            changes: [],
            stakeholderCategories: [],
            domains: [],
            referenceDocuments: [],
            waves: []
        };
    }
}

export default iDL_Mapper_new_format;