import Mapper from '../Mapper.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * Mapper for CRISIS Word documents (Edition 4 format)
 * Handles two documents: Crisis Information Portal (CIP) and Conflict Zones.
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ====================================
 *
 * Section Detection:
 * ------------------
 * All entities are flat L1 root sections in rawData.sections.
 * Entity type is detected from the section title:
 * - Starts with "Operational Need (ON)"        → ON
 * - Starts with "Operational Requirement (OR)" → OR
 * - Starts with "Operational Change (OC)"      → OC (dropped)
 *
 * Table Format:
 * -------------
 * Each entity is one 2-column table in section.content.tables[0].
 * Rows are plain 2-element arrays: [fieldLabel, value].
 * Field labels may include bold markers (**...**) and suffixes like
 * " (Mandatory)" or " (Optional)" — both stripped for matching.
 *
 * Field Mapping:
 * --------------
 * | Source Field                        | Target               | Scope   | Notes                             |
 * |-------------------------------------|----------------------|---------|-----------------------------------|
 * | Title                               | title                | ON + OR |                                   |
 * | Statement                           | statement            | ON + OR | Rich text                         |
 * | Rationale                           | rationale            | ON + OR | Rich text                         |
 * | Flow Descriptions and Flow Examples | flows                | ON + OR | Rich text                         |
 * | NFRs                                | nfrs                 | OR only | Rich text                         |
 * | Private Notes                       | privateNotes         | ON + OR | Rich text                         |
 * | Additional Documentation            | privateNotes         | ON + OR | Appended with warning             |
 * | Maturity Level                      | maturity             | ON + OR | Uppercased                        |
 * | Refines                             | refinesParents       | ON + OR | Title-resolved within batch       |
 * | Implements                          | implementedONs       | OR only | Title-resolved against ONs        |
 * | Dependencies                        | dependencies         | OR only | Title-resolved against ORs        |
 * | Impact                              | impactedStakeholders | OR only | Resolved via stakeholder synonyms |
 * | Tentative Implementation Time       | tentative            | ON only | Parsed to [start, end] year range |
 * | Strategic Documents                 | strategicDocuments   | ON only | Resolved via document alias map   |
 * | Domain                              | (dropped)            | ALL     | Implicit from DrG/folder          |
 * | Refined By                          | (dropped)            | ON only | Inverse direction — ignored       |
 * | Target Deployment                   | (dropped)            | OC only |                                   |
 * | Milestones                          | (dropped)            | OC only |                                   |
 *
 * ExternalId Construction:
 * -------------------------
 * Uses folder option passed at import time:
 * - 'Crisis Information Portal' → on:crisis/crisis_information_portal/title_normalized
 * - 'Conflict Zones'            → on:crisis/conflict_zones/title_normalized
 *
 * Title-Based Reference Resolution:
 * -----------------------------------
 * Two-pass: collect all entities first, build titleToExternalId maps, then resolve.
 * On unresolved reference: emit warning and drop.
 *
 * Root ON Detection:
 * ------------------
 * ONs with no refinesParents and no strategicDocuments are treated as root ONs
 * and have their maturity forced to DRAFT.
 */

/**
 * Stakeholder synonym map
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

    // NMOC operations
    'nmoc operations': 'stakeholder:network/nm/nmoc',
    'nm operational staff (nmoc)': 'stakeholder:network/nm/nmoc',
    'nm data management staff': 'stakeholder:network/nm/nmoc',
    'aeronautical information service providers (aisps)': 'stakeholder:network/ansp',
    'ansp operational support units': 'stakeholder:network/ansp'
};

/**
 * Document alias map — resolves raw document names to canonical refdoc externalIds
 */
const DOCUMENT_ALIASES = {
    'crisis_conops': 'refdoc:crisis_conops'
};

/**
 * Normalize a section title for entity type detection (lowercase, trimmed)
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
    return (title || '').trim().toLowerCase();
}

/**
 * Detect entity type from section title
 * @param {string} title
 * @returns {'ON'|'OR'|'OC'|null}
 */
function detectEntityType(title) {
    const t = normalizeTitle(title);
    if (t.startsWith('operational need (on)')) return 'ON';
    if (t.startsWith('operational requirement (or)')) return 'OR';
    if (t.startsWith('operational change (oc)')) return 'OC';
    return null;
}

/**
 * Extract field map from a 2-column vertical table.
 * Strips bold markers (**...**) and label suffixes like " (Mandatory)" / " (Optional)".
 * @param {Object} table - table with rows as 2-element arrays
 * @returns {Object} plain object keyed by stripped label
 */
function extractTableFields(table) {
    const fields = {};
    for (const row of table.rows || []) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const rawKey = (row[0] || '').trim();
        const value  = (row[1] || '').trim();
        // Strip bold markers and " (Mandatory)" / " (Optional)" suffixes
        const key = rawKey
            .replace(/^\*\*/, '').replace(/\*\*$/, '')
            .replace(/\s*\((Mandatory|Optional)\)\s*$/i, '')
            .trim();
        if (key && value) {
            fields[key] = value;
        }
    }
    return fields;
}

/**
 * Parse tentative year range from string.
 * Handles: "2027–2029", "2027-2029", "2027 – 2029", "2027"
 * @param {string} value
 * @returns {number[]|null}
 */
function parseTentativeRange(value) {
    if (!value || value.trim().toLowerCase() === 'n/a') return null;
    const normalized = value.replace(/[–—]/g, '-');
    const match = normalized.match(/(\d{4})\s*-\s*(\d{4})/);
    if (match) return [parseInt(match[1], 10), parseInt(match[2], 10)];
    const single = value.match(/(\d{4})/);
    if (single) { const y = parseInt(single[1], 10); return [y, y]; }
    return null;
}

/**
 * Check if a field value is empty or a known placeholder
 * @param {string|undefined} value
 * @returns {boolean}
 */
function isEmptyValue(value) {
    if (!value) return true;
    const t = value.trim().toLowerCase();
    return t === '' || t === 'n/a' || t === 'none' || t === 'tbd';
}

class CRISIS_Mapper extends Mapper {

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @param {Object} options
     * @param {string} options.folder - 'Crisis Information Portal' or 'Conflict Zones'
     * @returns {Object} StructuredImportData
     */
    map(rawData, options = {}) {
        const { folder } = options;

        if (!folder) {
            throw new Error('CRISIS_Mapper requires folder option (e.g. "Crisis Information Portal")');
        }

        console.log(`CRISIS_Mapper mapping raw data for folder: ${folder}`);

        const context = this._initContext(folder);

        // All entities are flat L1 root sections in rawData.sections
        for (const section of rawData.sections || []) {
            const type = detectEntityType(section.title);
            if (!type || type === 'OC') continue;

            const table = section.content?.tables?.[0];
            if (!table) {
                this._warn(`Section "${section.title}" has no table — skipped`);
                continue;
            }

            const entity = this._parseEntityTable(table, type, context);
            if (!entity) continue;

            if (type === 'ON') {
                context.onMap.set(entity.externalId, entity);
                context.onTitleMap.set(entity.title.toLowerCase(), entity.externalId);
            } else {
                context.orMap.set(entity.externalId, entity);
                context.orTitleMap.set(entity.title.toLowerCase(), entity.externalId);
            }
        }

        console.log(
            `Parsed: ${context.onMap.size} ONs, ${context.orMap.size} ORs`
        );

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
            onMap:      new Map(),  // externalId → ON entity
            orMap:      new Map(),  // externalId → OR entity
            onTitleMap: new Map(),  // normalized title → externalId
            orTitleMap: new Map(),  // normalized title → externalId
            warnings:   []
        };
    }

    // -------------------------------------------------------------------------
    // Table parsing
    // -------------------------------------------------------------------------

    /**
     * Parse a single 2-column vertical table as an ON or OR entity
     * @param {Object} table
     * @param {'ON'|'OR'} type
     * @param {Object} context
     * @returns {Object|null}
     * @private
     */
    _parseEntityTable(table, type, context) {
        const fields = extractTableFields(table);
        const title  = (fields['Title'] || '').trim();

        if (!title) return null;

        const externalId = ExternalIdBuilder.buildExternalId(
            { drg: 'CRISIS', title, path: [context.folder] },
            type.toLowerCase()
        );

        this._currentEntity = { type, title, externalId };

        const maturity = (fields['Maturity Level'] || 'DRAFT').trim().toUpperCase();

        if (type === 'ON') {
            return this._parseON(fields, title, externalId, maturity, context);
        } else {
            return this._parseOR(fields, title, externalId, maturity, context);
        }
    }

    /**
     * @private
     */
    _parseON(fields, title, externalId, maturity, context) {
        if (!fields['Statement']) {
            this._warn(`ON "${title}" has no Statement — skipped`);
            return null;
        }

        const statement = this._toRichText(fields['Statement']);
        const rationale = this._toRichText(fields['Rationale']);
        const flows     = this._toRichTextOrNull(fields['Flow Descriptions and Flow Examples']);
        const tentative = parseTentativeRange(fields['Tentative Implementation Time']);

        // privateNotes — base + Additional Documentation appended
        let privateNotesText = isEmptyValue(fields['Private Notes']) ? '' : fields['Private Notes'];
        if (!isEmptyValue(fields['Additional Documentation'])) {
            context.warnings.push(
                `${externalId}: 'Additional Documentation' field present — appended to privateNotes`
            );
            const addDoc = fields['Additional Documentation'].trim();
            privateNotesText = privateNotesText
                ? `${privateNotesText}\n\n**Additional Documentation:**\n${addDoc}`
                : `**Additional Documentation:**\n${addDoc}`;
        }
        const privateNotes = this._toRichTextOrNull(privateNotesText);

        const rawRefines            = isEmptyValue(fields['Refines'])            ? null : fields['Refines'];
        const rawStrategicDocuments = isEmptyValue(fields['Strategic Documents']) ? null : fields['Strategic Documents'];

        return {
            externalId,
            title,
            type: 'ON',
            drg: 'CRISIS',
            path: [context.folder],
            statement,
            rationale,
            flows,
            tentative,
            privateNotes,
            maturity,
            refinesParents:     [],  // resolved in pass 2
            implementedONs:     [],
            dependencies:       [],
            strategicDocuments: [],  // resolved in pass 2
            _rawRefines:            rawRefines,
            _rawStrategicDocuments: rawStrategicDocuments
        };
    }

    /**
     * @private
     */
    _parseOR(fields, title, externalId, maturity, context) {
        if (!fields['Statement']) {
            this._warn(`OR "${title}" has no Statement — skipped`);
            return null;
        }

        const statement = this._toRichText(fields['Statement']);
        const rationale = this._toRichText(fields['Rationale']);
        const flows     = this._toRichTextOrNull(fields['Flow Descriptions and Flow Examples']);
        const nfrs      = this._toRichTextOrNull(fields['NFRs']);

        // privateNotes — base + Additional Documentation appended
        let privateNotesText = isEmptyValue(fields['Private Notes']) ? '' : fields['Private Notes'];
        if (!isEmptyValue(fields['Additional Documentation'])) {
            context.warnings.push(
                `${externalId}: 'Additional Documentation' field present — appended to privateNotes`
            );
            const addDoc = fields['Additional Documentation'].trim();
            privateNotesText = privateNotesText
                ? `${privateNotesText}\n\n**Additional Documentation:**\n${addDoc}`
                : `**Additional Documentation:**\n${addDoc}`;
        }
        const privateNotes = this._toRichTextOrNull(privateNotesText);

        const rawRefines      = isEmptyValue(fields['Refines'])      ? null : fields['Refines'];
        const rawImplements   = isEmptyValue(fields['Implements'])   ? null : fields['Implements'];
        const rawDependencies = isEmptyValue(fields['Dependencies']) ? null : fields['Dependencies'];
        const rawImpact       = isEmptyValue(fields['Impact'])       ? null : fields['Impact'];

        return {
            externalId,
            title,
            type: 'OR',
            drg: 'CRISIS',
            path: [context.folder],
            statement,
            rationale,
            flows,
            nfrs,
            privateNotes,
            maturity,
            refinesParents:       [],  // resolved in pass 2
            implementedONs:       [],  // resolved in pass 2
            dependencies:         [],  // resolved in pass 2
            impactedStakeholders: [],  // resolved in pass 2
            _rawRefines:          rawRefines,
            _rawImplements:       rawImplements,
            _rawDependencies:     rawDependencies,
            _rawImpact:           rawImpact
        };
    }

    // -------------------------------------------------------------------------
    // Pass 2: reference resolution
    // -------------------------------------------------------------------------

    /**
     * Resolve all title-based cross-references and remove internal fields
     * @param {Object} context
     * @private
     */
    _resolveReferences(context) {
        for (const [, on] of context.onMap) {
            on.refinesParents = this._resolveTitleRefs(
                on._rawRefines, context.onTitleMap, on.externalId, 'Refines', context
            );
            on.strategicDocuments = this._resolveStrategicDocuments(
                on._rawStrategicDocuments, on.externalId, context
            );
            this._cleanInternalFields(on);

            if (on.refinesParents.length === 0 && on.strategicDocuments.length === 0) {
                on.maturity = 'DRAFT';
                context.warnings.push(
                    `${on.externalId}: root ON detected — maturity forced to DRAFT`
                );
            }
        }

        for (const [, or] of context.orMap) {
            // Refines may target ONs or ORs
            const refinesONs = this._resolveTitleRefs(
                or._rawRefines, context.onTitleMap, or.externalId, 'Refines (ON)', context
            );
            const refinesORs = this._resolveTitleRefs(
                or._rawRefines, context.orTitleMap, or.externalId, 'Refines (OR)', context, true
            );
            or.refinesParents = [...new Set([...refinesONs, ...refinesORs])];

            or.implementedONs = this._resolveTitleRefs(
                or._rawImplements, context.onTitleMap, or.externalId, 'Implements', context
            );

            or.dependencies = this._resolveTitleRefs(
                or._rawDependencies, context.orTitleMap, or.externalId, 'Dependencies', context
            );

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
     * Resolve a raw reference value against a title map.
     * @param {string|null} rawValue
     * @param {Map} titleMap
     * @param {string} entityId
     * @param {string} fieldName
     * @param {Object} context
     * @param {boolean} [silentMiss=false]
     * @returns {string[]}
     * @private
     */
    _resolveTitleRefs(rawValue, titleMap, entityId, fieldName, context, silentMiss = false) {
        if (!rawValue || isEmptyValue(rawValue)) return [];

        const resolved = [];
        const parts = rawValue.split(/[\n;,*•]+/).map(s => s.trim()).filter(Boolean);

        for (const part of parts) {
            if (isEmptyValue(part)) continue;
            const titleCandidate = part.split(/\.\s+/)[0].trim();
            const externalId = titleMap.get(titleCandidate.toLowerCase());
            if (externalId) {
                resolved.push(externalId);
            } else if (!silentMiss) {
                context.warnings.push(
                    `${entityId}: ${fieldName} reference unresolved — title not found in batch: "${part}" (dropped)`
                );
            }
        }

        return resolved;
    }

    /**
     * Resolve Strategic Documents field to annotated references
     * @param {string|null} rawValue
     * @param {string} entityId
     * @param {Object} context
     * @returns {Object[]}
     * @private
     */
    _resolveStrategicDocuments(rawValue, entityId, context) {
        if (!rawValue) return [];

        const resolved = [];
        const parts = rawValue.split(/[\n;]+/).map(s => s.trim()).filter(Boolean);

        for (const part of parts) {
            if (isEmptyValue(part)) continue;
            const normalized = ExternalIdBuilder._normalize(part);
            let externalId = DOCUMENT_ALIASES[normalized] || null;

            if (!externalId) {
                for (const [prefix, id] of Object.entries(DOCUMENT_ALIASES)) {
                    if (normalized.startsWith(prefix)) { externalId = id; break; }
                }
            }

            if (externalId) {
                resolved.push({ externalId });
            } else {
                context.warnings.push(
                    `${entityId}: Strategic Documents reference unresolved — cannot find alias for "${part}" (dropped)`
                );
            }
        }

        return resolved;
    }

    /**
     * Resolve Impact field to stakeholder externalIds via synonym map
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

        const stakeholderSection = rawText
            .replace(/domains:\s*[^\n]*/gi, '')
            .replace(/stakeholder categories:\s*/gi, '');

        for (const line of stakeholderSection.split('\n')) {
            let text = line.replace(/^[*\-•\s]+/, '').trim();
            if (!text) continue;

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

    _toRichText(text) {
        return this.converter.asciidocToDelta(isEmptyValue(text) ? '' : text);
    }

    _toRichTextOrNull(text) {
        if (isEmptyValue(text)) return null;
        return this.converter.asciidocToDelta(text);
    }

    _appendToRichText(existing, addition) {
        if (!addition) return existing;
        if (existing) {
            try {
                const delta = JSON.parse(existing);
                const ops = delta.ops || [];
                ops.push({ insert: `\n\n${addition}` });
                return JSON.stringify({ ops });
            } catch {
                return this.converter.asciidocToDelta(`${existing}\n\n${addition}`);
            }
        }
        return this.converter.asciidocToDelta(addition);
    }

    _cleanInternalFields(entity) {
        delete entity._rawRefines;
        delete entity._rawImplements;
        delete entity._rawDependencies;
        delete entity._rawImpact;
        delete entity._rawStrategicDocuments;
    }

    _warn(msg) {
        const prefix = this._currentEntity
            ? `[${this._currentEntity.type} "${this._currentEntity.title}"]`
            : '[CRISIS_Mapper]';
        console.warn(`${prefix} ${msg}`);
    }

    // -------------------------------------------------------------------------
    // Output
    // -------------------------------------------------------------------------

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
            changes:               [],
            stakeholderCategories: [],
            domains:               [],
            referenceDocuments:    [],
            waves:                 []
        };
    }
}

export default CRISIS_Mapper;