import Mapper from '../Mapper.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * Mapper for FAAS Word documents (Edition 4 format)
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ====================================
 *
 * Section Detection:
 * ------------------
 * All entities are flat L2 subsections directly under the document root.
 * Entity type is detected from the subsection title:
 * - Starts with "Operational Need (ON)"   → ON
 * - Starts with "Operational Requirement (OR)" → OR
 * - Starts with "Operational Change (OC)" → OC
 *
 * Table Format:
 * -------------
 * Each entity is one 2-column table in section.content.tables[0].
 * Rows are plain 2-element arrays: [fieldLabel, value].
 * Field labels include a suffix like " (Mandatory)" or " (Optional)" — stripped for matching.
 *
 * Field Mapping:
 * --------------
 * | Source Field    | Target               | Scope    | Notes                         |
 * |-----------------|----------------------|----------|-------------------------------|
 * | Title           | title                | ALL      |                               |
 * | Statement       | statement            | ON + OR  | Rich text                     |
 * | Rationale       | rationale            | ON + OR  | Rich text                     |
 * | NFRs            | nfrs                 | OR only  | Rich text                     |
 * | Maturity Level  | maturity             | ALL      | Uppercased                    |
 * | Refines         | refinesParents       | ON + OR  | Title-resolved within batch   |
 * | Implements      | implementedONs       | OR only  | Title-resolved against ONs    |
 * | Implements      | implementedORs       | OC only  | Title-resolved against ORs    |
 * | Dependencies    | dependencies         | OR only  | Title-resolved against ORs    |
 * | Description     | purpose              | OC only  | Rich text                     |
 * | Domain          | (dropped)            | ALL      | Implicit from DrG             |
 * | Refined By      | (dropped)            | ON only  | Inverse direction — ignored   |
 * | Target Deploy.  | (dropped)            | OC only  |                               |
 * | Milestones      | (dropped)            | OC only  |                               |
 *
 * ExternalId Construction:
 * -------------------------
 * Empty path (no folder) — drg = 'FAAS':
 * - ONs: on:faas/{title_normalized}
 * - ORs: or:faas/{title_normalized}
 * - OCs: oc:faas/{title_normalized}
 *
 * Title-Based Reference Resolution:
 * -----------------------------------
 * Refines, Implements, Dependencies reference other entities by title (not code).
 * Two-pass: collect all entities first, build titleToExternalId maps, then resolve.
 * On unresolved reference: emit warning and drop.
 */

/**
 * Normalize a section title for entity type detection (lowercase, trimmed)
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
    return (title || '').trim().toLowerCase();
}

/**
 * Detect entity type from L2 subsection title
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
 * Strips label suffixes like " (Mandatory)" and " (Optional)".
 * @param {Object} table - table with rows as 2-element arrays
 * @returns {Object} plain object keyed by stripped label
 */
function extractTableFields(table) {
    const fields = {};
    for (const row of table.rows || []) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const rawKey = (row[0] || '').trim();
        const value  = (row[1] || '').trim();
        // Strip " (Mandatory)" / " (Optional)" suffixes
        const key = rawKey.replace(/\s*\((Mandatory|Optional)\)\s*$/i, '').trim();
        if (key && value) {
            fields[key] = value;
        }
    }
    return fields;
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

class FAAS_Mapper extends Mapper {

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData
     */
    map(rawData) {
        console.log('FAAS_Mapper mapping raw data');

        const context = this._initContext();

        // All entities are flat L2 subsections under the single root section
        const rootSection = (rawData.sections || [])[0];
        const subsections = rootSection?.subsections || [];

        // Pass 1: collect all ONs, ORs, OCs
        for (const sub of subsections) {
            const type = detectEntityType(sub.title);
            if (!type || type === 'OC') continue;

            const table = sub.content?.tables?.[0];
            if (!table) {
                this._warn(`Section "${sub.title}" has no table — skipped`);
                continue;
            }

            const entity = this._parseEntityTable(table, type, context);
            if (!entity) continue;

            if (type === 'ON') {
                context.onMap.set(entity.externalId, entity);
                context.onTitleMap.set(entity.title.toLowerCase(), entity.externalId);
            } else if (type === 'OR') {
                context.orMap.set(entity.externalId, entity);
                context.orTitleMap.set(entity.title.toLowerCase(), entity.externalId);
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

    _initContext() {
        return {
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
     * Parse a single 2-column vertical table as an ON, OR, or OC entity
     * @param {Object} table
     * @param {'ON'|'OR'|'OC'} type
     * @param {Object} context
     * @returns {Object|null}
     * @private
     */
    _parseEntityTable(table, type, context) {
        const fields = extractTableFields(table);
        const title  = (fields['Title'] || '').trim();

        if (!title) {
            return null;
        }

        // All FAAS entities share an empty path — externalId format: {type}:faas/{title_normalized}
        const externalId = ExternalIdBuilder.buildExternalId(
            { drg: 'FAAS', title, path: [] },
            type.toLowerCase()
        );

        this._currentEntity = { type, title, externalId };

        const maturity = (fields['Maturity Level'] || 'DRAFT').trim().toUpperCase();

        if (type === 'ON') {
            return this._parseON(fields, title, externalId, maturity);
        } else {
            return this._parseOR(fields, title, externalId, maturity);
        }
    }

    /**
     * @private
     */
    _parseON(fields, title, externalId, maturity) {
        const statement = this._toRichText(fields['Statement']);
        const rationale = this._toRichText(fields['Rationale']);

        if (!fields['Statement']) {
            this._warn(`ON "${title}" has no Statement — skipped`);
            return null;
        }

        const rawRefines = isEmptyValue(fields['Refines']) ? null : fields['Refines'];

        return {
            externalId,
            title,
            type: 'ON',
            drg: 'FAAS',
            path: [],
            statement,
            rationale,
            maturity,
            refinesParents:    [],  // resolved in pass 2
            implementedONs:    [],
            dependencies:      [],
            strategicDocuments: [],
            _rawRefines:       rawRefines
        };
    }

    /**
     * @private
     */
    _parseOR(fields, title, externalId, maturity) {
        if (!fields['Statement']) {
            this._warn(`OR "${title}" has no Statement — skipped`);
            return null;
        }

        const statement = this._toRichText(fields['Statement']);
        const rationale = this._toRichText(fields['Rationale']);
        const nfrs      = this._toRichTextOrNull(fields['NFRs']);

        const rawRefines      = isEmptyValue(fields['Refines'])      ? null : fields['Refines'];
        const rawImplements   = isEmptyValue(fields['Implements'])   ? null : fields['Implements'];
        const rawDependencies = isEmptyValue(fields['Dependencies']) ? null : fields['Dependencies'];

        return {
            externalId,
            title,
            type: 'OR',
            drg: 'FAAS',
            path: [],
            statement,
            rationale,
            nfrs,
            maturity,
            refinesParents: [],  // resolved in pass 2
            implementedONs: [],  // resolved in pass 2
            dependencies:   [],  // resolved in pass 2
            _rawRefines:    rawRefines,
            _rawImplements: rawImplements,
            _rawDependencies: rawDependencies
        };
    }

    /**
     * @private
     */
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
     * Resolve a raw reference value (single title or newline/comma-separated list)
     * against a title map.
     * @param {string|null} rawValue
     * @param {Map} titleMap - normalized title → externalId
     * @param {string} entityId - for warning messages
     * @param {string} fieldName - for warning messages
     * @param {Object} context
     * @param {boolean} [silentMiss=false] - suppress warnings on miss (dual-map Refines lookup)
     * @returns {string[]} resolved externalIds
     * @private
     */
    _resolveTitleRefs(rawValue, titleMap, entityId, fieldName, context, silentMiss = false) {
        if (!rawValue || isEmptyValue(rawValue)) return [];

        const resolved = [];
        const parts = rawValue.split(/[\n;,*•]+/).map(s => s.trim()).filter(Boolean);

        for (const part of parts) {
            if (isEmptyValue(part)) continue;
            // Guard against cell content bleeding into a following sentence
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

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Convert text to Quill Delta rich text string (empty string for missing values)
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
     * Remove internal _raw* fields from a processed entity
     * @param {Object} entity
     * @private
     */
    _cleanInternalFields(entity) {
        delete entity._rawRefines;
        delete entity._rawImplements;
        delete entity._rawDependencies;
    }

    /**
     * Emit a warning with current entity context
     * @param {string} msg
     * @private
     */
    _warn(msg) {
        const prefix = this._currentEntity
            ? `[${this._currentEntity.type} "${this._currentEntity.title}"]`
            : '[FAAS_Mapper]';
        console.warn(`${prefix} ${msg}`);
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
            changes:               [],
            stakeholderCategories: [],
            domains:               [],
            referenceDocuments:    [],
            waves:                 []
        };
    }
}

export default FAAS_Mapper;