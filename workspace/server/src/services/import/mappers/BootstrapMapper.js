import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import { textStartsWith } from './utils.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';

/**
 * Mapper for iCDM DrG Word documents (Bootstrap format)
 * Transforms hierarchical section structure extracted from DrG Word documents
 * into ODIP structured import format.
 *
 * DOCUMENT STRUCTURE:
 * ===================
 *
 * Each DrG Word document is extracted into a JSON hierarchy of sections.
 * The structure follows a fixed 4-level nesting pattern:
 *
 *   Level 2: Theme section       (e.g., "11.1 Crisis information portal")
 *     Level 3: Type section      (e.g., "11.1.1 Operational Needs")
 *       Level 4: Entity section  (e.g., "11.1.1.1 ON Crisis information management")
 *
 * Entity sections are identified by their title prefix: "ON " or "OR ".
 * Non-entity sections (narrative, intro) are silently skipped.
 *
 * FIELD MARKERS:
 * ==============
 *
 * Entity content is encoded as bold-prefixed paragraphs in the extracted JSON.
 * The following markers are recognised (Markdown bold syntax from extractor):
 *
 *   **External ID: **<value>            → externalId (read once, no accumulation)
 *   **Maturity: **<value>               → maturity (DRAFT | ADVANCED | MATURE)
 *   **Tentative implementation: **<val> → tentative ([start, end] year array)
 *   **Statement**                       → begins statement accumulation
 *   **Rationale**                       → begins rationale accumulation
 *   **Flow Descriptions and Examples**  → begins flows accumulation
 *   **Implemented By**                  → begins implementedBy list
 *   **Implements: **<ref>               → single implements reference (inline value)
 *   **Refined By**                      → begins refinedBy list
 *   **Refines: **<ref>                  → single refines reference (inline value)
 *   **Strategic Documents**             → begins strategicDocuments list
 *   **[Team: ...]**                     → ignored (editorial annotation)
 *
 * Unknown bold-prefixed lines reset the current accumulation section to null
 * (defensive: content after an unknown marker is not silently absorbed).
 *
 * PROSE CONTINUATION:
 * ===================
 *
 * Paragraphs that do not match any field marker are appended to the current
 * accumulation field (statement, rationale, flows). Named sub-sections that
 * appear inside these fields — such as "Fit Criteria:", "Opportunities / Risks:",
 * or "Flow Descriptions and Examples" labelling paragraphs — are treated as
 * plain prose and absorbed into the current field body unchanged.
 *
 * CROSS-REFERENCE RESOLUTION:
 * ============================
 *
 * Relationship fields use short IDs in the source documents:
 *   - "Implements:"    → "ON-CRS-0002 (ON Crisis information portal (operations))"
 *   - "Implemented By" → "* OR-CRS-0001 (OR Crisis content and publication management)"
 *   - "Refines:"       → "OR-RRT-0001 (OR Operationally Acceptable Rerouting Proposals)"
 *   - "Refined By"     → "* ON-CRS-0002 (ON Crisis information management)"
 *
 * Short IDs are resolved to externalIds using the mapper's own extracted entity
 * map (built from the same file). Cross-file references are not supported.
 * Unresolved references are warned and omitted from the output.
 *
 * STRATEGIC DOCUMENTS:
 * ====================
 *
 * Strategic document references are plain text names (e.g. "NSP SO 4/3").
 * They are converted to externalIds via ExternalIdBuilder.buildExternalId({ name }, 'refdoc'),
 * matching the pattern used by NM_B2B_Mapper. JSONImporter resolves these against
 * pre-loaded reference documents in the DB. No constructor argument needed.
 *
 * TENTATIVE FIELD:
 * ================
 *
 * Format: "YYYY" → [YYYY, YYYY]  or  "YYYY–YYYY" / "YYYY-YYYY" → [start, end]
 * (Both ASCII hyphen and Unicode en-dash are accepted.)
 *
 * ABSTRACT ONs:
 * =============
 *
 * ONs annotated with "*[Abstract — not directly implemented]*" are emitted
 * with abstract: true.
 *
 * OUTPUT:
 * =======
 *
 * Standard StructuredImportData shape:
 *   { referenceDocuments: [], stakeholderCategories: [], domains: [],
 *     bandwidths: [], waves: [], requirements: [], changes: [] }
 *
 * Only requirements[] is populated. All other collections are empty — setup
 * entities are pre-loaded from setup.json and must not be re-emitted here.
 */
class BootstrapMapper extends Mapper {
    /**
     * Canonical name aliases for strategic document references.
     * Maps variant names found in Word source documents to the canonical
     * names defined in setup.json / the reference document DB.
     * Add entries here when new mismatches are discovered.
     */
    static DOCUMENT_NAME_ALIASES = {
        'Network 4DT CONOPS': 'Network 4D Trajectory CONOPS',
        'ASM/ATFCM Integration CONOPS': 'ASM ATFCM Integration CONOPS',
    };

    /**
     * Normalize a strategic document name before alias lookup and ExternalIdBuilder.
     * Handles systemic naming differences between Word source documents and setup.json:
     * - NSP SO X.Y (dot) → NSP SO X/Y (slash)
     * @param {string} name
     * @returns {string}
     * @private
     */
    _normalizeDocumentName(name) {
        // NSP SO dot-notation → slash-notation: "NSP SO 5.2" → "NSP SO 5/2"
        return name.replace(/^(NSP SO \d+)\.(\d+)$/, '$1/$2');
    }

    constructor(drg) {
        super();
        this.drg = drg;
        this.converter = new AsciidocToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format.
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @param {Object} [options]
     * @param {string} [options.folder] - Prepended as first path segment (e.g. for IDL sub-domains)
     * @returns {Object} StructuredImportData
     */
    map(rawData, options = {}) {
        this.folder = options.folder || null;
        const context = this._initContext();

        for (const section of rawData.sections || []) {
            this._traverseSection(section, context);
        }

        return this._buildOutput(context);
    }

    // -------------------------------------------------------------------------
    // Context
    // -------------------------------------------------------------------------

    _initContext() {
        return {
            onMap: new Map(),   // externalId → entity object
            orMap: new Map(),   // externalId → entity object
            warnings: []
        };
    }

    // -------------------------------------------------------------------------
    // Section traversal
    // -------------------------------------------------------------------------

    /**
     * Recursively traverse sections, extracting entities from level-4 sections
     * whose titles begin with "ON " or "OR ".
     * @private
     */
    _traverseSection(section, context) {
        const title = (section.title || '').trim();
        const entityType = this._getEntityType(title);

        if (entityType) {
            this._extractEntity(section, entityType, context);
        } else {
            for (const sub of section.subsections || []) {
                this._traverseSection(sub, context);
            }
        }
    }

    /**
     * Determine entity type from section title prefix.
     * @private
     * @returns {'ON'|'OR'|null}
     */
    _getEntityType(title) {
        // Match "ON " or "OR " anywhere in the title (section number precedes it)
        if (/\bON\s/.test(title)) return 'ON';
        if (/\bOR\s/.test(title)) return 'OR';
        return null;
    }

    // -------------------------------------------------------------------------
    // Entity extraction
    // -------------------------------------------------------------------------

    /**
     * Extract a single ON or OR entity from a leaf section.
     * @private
     */
    _extractEntity(section, type, context) {
        this._currentEntity = section.title;
        const paragraphs = section.content?.paragraphs || [];
        const fields = this._extractFields(paragraphs, type);

        if (!fields.externalId) {
            this._warn(`Missing External ID in section "${section.title}" — skipping`);
            return;
        }

        const title = this._extractTitle(section.title, type);
        const entity = {
            externalId: fields.externalId,
            title,
            _fullTitle: section.title.replace(/^[\d.]+\s+/, '').trim(), // with ON/OR prefix
            type,
            drg: this.drg,
            path: this._buildPath(section.path),
            maturity: fields.maturity || 'DRAFT',
            statement: this.converter.asciidocToDelta(fields.statement),
            rationale: this.converter.asciidocToDelta(fields.rationale),
            flows: fields.flows ? this.converter.asciidocToDelta(fields.flows) : null,
            tentative: fields.tentative,
            abstract: fields.abstract || null,
            privateNotes: fields.privateNotes || null,
            // Relationship fields — resolved in _buildOutput post-pass
            _implementsRaw: fields.implementsRef,
            _implementedByRaw: fields.implementedByRefs,
            _refinesRaw: fields.refinesRef,
            _refinedByRaw: fields.refinedByRefs,
            _strategicDocumentsRaw: fields.strategicDocumentNames
        };

        const map = type === 'ON' ? context.onMap : context.orMap;
        map.set(fields.externalId, entity);
    }

    // -------------------------------------------------------------------------
    // Field extraction (paragraph state-machine)
    // -------------------------------------------------------------------------

    /**
     * Parse paragraphs array into structured fields using a state-machine.
     * @private
     */
    _extractFields(paragraphs, type) {
        let externalId = null;
        let maturity = null;
        let tentative = null;
        let abstract = false;
        let statement = '';
        let rationale = '';
        let flows = '';
        let privateNotes = '';
        let implementsRef = null;
        let implementedByRefs = [];
        let refinesRef = null;
        let refinedByRefs = [];
        let strategicDocumentNames = [];
        let currentSection = null;

        for (const p of paragraphs) {
            const text = (typeof p === 'string' ? p : p.text)?.trim() || '';
            if (!text) continue;

            // --- Detect abstract annotation ---
            if (text === '*[Abstract — not directly implemented]*') {
                abstract = true;
                continue;
            }

            // --- Team annotations ---
            // Case 1: before any field marker → preserve as privateNotes
            // Case 2: inside a field → append to current field body
            if (/^\*\*\[Team:/.test(text)) {
                if (currentSection === null) {
                    privateNotes = privateNotes ? privateNotes + '\n\n' + text : text;
                } else if (currentSection === 'statement') {
                    statement = statement ? statement + '\n\n' + text : text;
                } else if (currentSection === 'rationale') {
                    rationale = rationale ? rationale + '\n\n' + text : text;
                } else if (currentSection === 'flows') {
                    flows = flows ? flows + '\n\n' + text : text;
                }
                // In list sections (implementedBy, refinedBy, strategicDocuments) — ignore
                continue;
            }

            // --- Inline single-value markers ---
            if (textStartsWith(text, '**External ID: **')) {
                externalId = text.replace(/^\*\*External ID: \*\*/, '').trim();
                currentSection = null;
                continue;
            }
            if (textStartsWith(text, '**Maturity: **')) {
                maturity = text.replace(/^\*\*Maturity: \*\*/, '').trim();
                currentSection = null;
                continue;
            }
            if (textStartsWith(text, '**Tentative implementation: **')) {
                const raw = text.replace(/^\*\*Tentative implementation: \*\*/, '').trim();
                tentative = this._parseTentative(raw);
                currentSection = null;
                continue;
            }
            if (textStartsWith(text, '**Implements: **')) {
                implementsRef = text.replace(/^\*\*Implements: \*\*/, '').trim();
                currentSection = null;
                continue;
            }
            if (textStartsWith(text, '**Refines: **')) {
                refinesRef = text.replace(/^\*\*Refines: \*\*/, '').trim();
                currentSection = null;
                continue;
            }

            // --- Section-opening markers ---
            if (text === '**Statement**') {
                currentSection = 'statement';
                continue;
            }
            if (text === '**Rationale**') {
                currentSection = 'rationale';
                continue;
            }
            if (text === '**Flow Descriptions and Examples**' || text === 'Flow Descriptions and Examples') {
                currentSection = 'flows';
                continue;
            }
            if (text === '**Implemented By**') {
                currentSection = 'implementedBy';
                continue;
            }
            if (text === '**Refined By**') {
                currentSection = 'refinedBy';
                continue;
            }
            if (text === '**Strategic Documents**') {
                currentSection = 'strategicDocuments';
                continue;
            }

            // --- Unknown bold marker — reset section (defensive) ---
            if (/^\*\*[^*]/.test(text) && text.endsWith('**')) {
                currentSection = null;
                continue;
            }

            // --- Accumulation ---
            switch (currentSection) {
                case 'statement':
                    statement = statement ? statement + '\n\n' + text : text;
                    break;
                case 'rationale':
                    rationale = rationale ? rationale + '\n\n' + text : text;
                    break;
                case 'flows':
                    flows = flows ? flows + '\n\n' + text : text;
                    break;
                case 'implementedBy':
                    this._parseListItems(text).forEach(ref => implementedByRefs.push(ref));
                    break;
                case 'refinedBy':
                    this._parseListItems(text).forEach(ref => refinedByRefs.push(ref));
                    break;
                case 'strategicDocuments':
                    this._parseListItems(text).forEach(name => strategicDocumentNames.push(name));
                    break;
                default:
                    // Before first marker — ignore
                    break;
            }
        }

        return {
            externalId, maturity, tentative, abstract,
            statement, rationale, flows, privateNotes,
            implementsRef, implementedByRefs,
            refinesRef, refinedByRefs,
            strategicDocumentNames
        };
    }

    // -------------------------------------------------------------------------
    // Output construction with cross-reference resolution
    // -------------------------------------------------------------------------

    /**
     * Build final StructuredImportData from context maps.
     * Resolves all cross-references and strips internal fields.
     * @private
     */
    _buildOutput(context) {
        // Build a combined lookup: shortId + externalId → externalId
        const refLookup = this._buildRefLookup(context);

        const requirements = [];

        const allEntities = [
            ...context.onMap.values(),
            ...context.orMap.values()
        ];

        for (const entity of allEntities) {

            const cleaned = this._resolveAndClean(entity, refLookup);
            requirements.push(cleaned);
        }

        console.log(`BootstrapMapper: mapped ${requirements.filter(r => r.type === 'ON').length} ONs, ${requirements.filter(r => r.type === 'OR').length} ORs`);
        if (context.warnings.length > 0) {
            console.warn(`BootstrapMapper warnings (${context.warnings.length}):`);
            context.warnings.forEach(w => console.warn('  ' + w));
        }

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            domains: [],
            bandwidths: [],
            waves: [],
            requirements,
            changes: []
        };
    }

    /**
     * Build a lookup map: shortId → externalId.
     *
     * Short IDs (e.g. "ON-CRS-0002") appear only inside relationship reference
     * strings paired with a human-readable label:
     *   "ON-CRS-0002 (ON Crisis information portal (operations))"
     *
     * Strategy: scan all raw reference strings across all entities; for each
     * shortId+label pair, find the entity whose title matches the label, then
     * record shortId → that entity's externalId.
     * @private
     */
    _buildRefLookup(context) {
        const lookup = new Map();

        // Deduplicated entity set
        const allEntities = new Map();
        for (const entity of [...context.onMap.values(), ...context.orMap.values()]) {
            allEntities.set(entity.externalId, entity);
        }

        // Build title → externalId index (lowercase for matching)
        // Index both the clean title and the full title with ON/OR prefix,
        // since relationship field labels use the full title form.
        const titleIndex = new Map();
        for (const entity of allEntities.values()) {
            titleIndex.set(entity.title.toLowerCase(), entity.externalId);
            if (entity._fullTitle) {
                titleIndex.set(entity._fullTitle.toLowerCase(), entity.externalId);
            }
        }

        // Collect all raw reference strings from all entities
        const allRefs = [];
        for (const entity of allEntities.values()) {
            if (entity._implementsRaw) {
                allRefs.push(...this._parseMultiRef(entity._implementsRaw));
            }
            if (entity._implementedByRaw?.length) allRefs.push(...entity._implementedByRaw);
            if (entity._refinesRaw) {
                allRefs.push(...this._parseMultiRef(entity._refinesRaw));
            }
            if (entity._refinedByRaw?.length) allRefs.push(...entity._refinedByRaw);
        }

        // Resolve shortId → externalId via label matching
        for (const ref of allRefs) {
            const shortId = this._extractShortId(ref);
            if (!shortId || lookup.has(shortId)) continue;

            // Extract label from parenthetical
            const labelMatch = ref.match(/^[A-Z]+-[A-Z0-9]+-\d+\s+\((.+)\)$/);
            if (!labelMatch) continue;

            const label = labelMatch[1].trim().toLowerCase();
            const externalId = titleIndex.get(label);
            if (externalId) {
                lookup.set(shortId, externalId);
            }
        }

        return lookup;
    }

    /**
     * Resolve cross-references and return a clean entity object.
     * @private
     */
    _resolveAndClean(entity, refLookup) {
        this._currentEntity = entity.externalId;

        const result = {
            externalId: entity.externalId,
            title: entity.title,
            type: entity.type,
            drg: this.drg,
            statement: entity.statement,
            rationale: entity.rationale
        };

        if (entity.flows) result.flows = entity.flows;
        if (entity.tentative) result.tentative = entity.tentative;
        if (entity.abstract) result.abstract = true;
        if (entity.privateNotes) result.privateNotes = this.converter.asciidocToDelta(entity.privateNotes);

        // path is set now; will be nulled below if refinesParents resolves non-empty (XOR rule)

        // Resolve "Implements" (OR → ON) and "Refines" (OR → OR, or ON → ON)
        if (entity._implementsRaw) {
            const refs = this._parseMultiRef(entity._implementsRaw);
            const resolved = this._resolveRefs(refs, refLookup, entity.externalId, 'Implements');
            if (resolved.length > 0) {
                result.implementedONs = resolved;
            }
        }

        if (entity._refinesRaw) {
            const refs = this._parseMultiRef(entity._refinesRaw);
            const resolved = this._resolveRefs(refs, refLookup, entity.externalId, 'Refines');
            if (resolved.length > 0) {
                result.refinesParents = resolved;
                result.path = null; // XOR: path and refinesParents are mutually exclusive
            } else {
                result.path = entity.path;
            }
        } else {
            result.path = entity.path;
        }

        // Refined By / Implemented By are inverses — not emitted directly
        // (the pipeline derives these from the forward references on the other entity)

        // Strategic documents (ONs only)
        if (entity.type === 'ON' && entity._strategicDocumentsRaw?.length > 0) {
            const strategicDocuments = entity._strategicDocumentsRaw.map(raw => {
                const { name, note } = this._parseStrategicDocRef(raw);
                // If already a refdoc: externalId, pass through directly
                const externalId = name.startsWith('refdoc:')
                    ? name
                    : ExternalIdBuilder.buildExternalId({ name: BootstrapMapper.DOCUMENT_NAME_ALIASES[this._normalizeDocumentName(name)] ?? this._normalizeDocumentName(name) }, 'refdoc');
                const entry = { externalId };
                if (note) entry.note = note;
                return entry;
            });
            result.strategicDocuments = strategicDocuments;
        }

        // Maturity: use provided value, fall back to DRAFT
        result.maturity = entity.maturity || 'DRAFT';

        return result;
    }

    // -------------------------------------------------------------------------
    // Reference parsing helpers
    // -------------------------------------------------------------------------

    /**
     * Parse short ID from a relationship reference string.
     * Format: "ON-CRS-0002 (ON Crisis information portal (operations))"
     * Returns: "ON-CRS-0002"
     * @private
     */
    _extractShortId(refString) {
        const match = refString.match(/^([A-Z]+-[A-Z0-9]+-\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Parse one or more semicolon-separated reference strings from an inline field.
     * e.g. "ON-CRS-0002 (ON Crisis information portal (operations)); ON-CRS-0003 (...)"
     * @private
     */
    _parseMultiRef(refString) {
        return refString.split(';').map(s => s.trim()).filter(Boolean);
    }

    /**
     * Resolve an array of reference strings to externalIds.
     * Falls back through: shortId lookup → direct externalId match → warn.
     * @private
     */
    _resolveRefs(refs, refLookup, sourceExternalId, fieldName) {
        const resolved = [];
        for (const ref of refs) {
            const shortId = this._extractShortId(ref);
            const externalId = shortId ? refLookup.get(shortId) : refLookup.get(ref);
            if (externalId) {
                resolved.push(externalId);
            } else {
                this._warn(`Unresolved ${fieldName} reference "${ref}" on ${sourceExternalId}`);
            }
        }
        return resolved;
    }

    /**
     * Parse list items from a paragraph.
     * Handles "* item\n* item" multi-item paragraphs and single items.
     * Strips leading "* " bullet prefix and trims.
     * @private
     */
    _parseListItems(text) {
        return text
            .split('\n')
            .map(line => line.replace(/^\*\s+/, '').trim())
            .filter(Boolean);
    }

    /**
     * Parse a strategic document reference into name and optional note.
     *
     * Format: "<name>" or "<name> (<note>)"
     * Note: the note may itself contain parentheses, so we find the matching
     * opening parenthesis by scanning from the closing ')' rightward to left
     * using a depth counter.
     *
     * Examples:
     *   "NSP SO 4/3"                                    → { name: "NSP SO 4/3" }
     *   "Network 4DT CONOPS (5.1.4 - NM Trajectory)"   → { name: "Network 4DT CONOPS", note: "5.1.4 - NM Trajectory" }
     *   "Commission Implementing Regulation (EU) 2021/116 (AF 4)"
     *                                                   → { name: "Commission Implementing Regulation (EU) 2021/116", note: "AF 4" }
     * @param {string} text
     * @returns {{ name: string, note?: string }}
     * @private
     */
    _parseStrategicDocRef(text) {
        text = text.trim();

        // Must end with ')' to have a note
        if (!text.endsWith(')')) {
            return { name: text };
        }

        // Scan left from the final ')' to find its matching '('
        let depth = 0;
        let openPos = -1;
        for (let i = text.length - 1; i >= 0; i--) {
            if (text[i] === ')') {
                depth++;
            } else if (text[i] === '(') {
                depth--;
                if (depth === 0) {
                    openPos = i;
                    break;
                }
            }
        }

        if (openPos <= 0) {
            // No matching '(' found, or it's at position 0 — treat as name only
            return { name: text };
        }

        const name = text.substring(0, openPos).trim();
        const note = text.substring(openPos + 1, text.length - 1).trim();

        return note ? { name, note } : { name };
    }

    /**
     * Build the entity path from the section path array.
     *
     * Strips:
     * - The entity segment itself (last element)
     * - Leading section number prefix (e.g. "6.1 ", "9.1.1 ")
     * - "Operational Needs" and "Operational Requirements" segments
     *
     * Example:
     *   ["6.1 Identification of operationally acceptable trajectories",
     *    "6.1.1 Operational Needs",
     *    "6.1.1.1 ON Identification of operationally acceptable trajectories"]
     *   → ["Identification of operationally acceptable trajectories"]
     *
     * @param {string[]} sectionPath
     * @returns {string[]}
     * @private
     */
    _buildPath(sectionPath) {
        const IGNORED = /^operational (needs|requirements)$/i;
        const segments = sectionPath
            .slice(0, -1)
            .map(s => s.replace(/^[\d.]+\s+/, '').trim())
            .filter(s => !IGNORED.test(s));

        return this.folder ? [this.folder, ...segments] : segments;
    }

    /**
     * Input:  "11.1.1.1 ON Crisis information management"
     * Input:  "11.1.1.1 ON Crisis information management"
     * Output: "Crisis information management"
     * The full title including type prefix is preserved as entity._fullTitle
     * for use in cross-reference label matching.
     * @private
     */
    _extractTitle(sectionTitle, type) {
        // Remove leading section number
        const withoutNumber = sectionTitle.replace(/^[\d.]+\s+/, '').trim();
        // Strip the ON/OR type prefix
        return withoutNumber.replace(/^(ON|OR)\s+/, '').trim();
    }

    /**
     * Parse tentative year or year range into [start, end] array.
     * Accepts: "YYYY", "YYYY-YYYY", "YYYY–YYYY" (en-dash)
     * @private
     */
    _parseTentative(text) {
        const rangeMatch = text.match(/^(\d{4})[–-](\d{4})$/);
        if (rangeMatch) {
            return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
        }
        const singleMatch = text.match(/^(\d{4})$/);
        if (singleMatch) {
            const year = parseInt(singleMatch[1], 10);
            return [year, year];
        }
        this._warn(`Unrecognised tentative format: "${text}"`);
        return null;
    }

    // -------------------------------------------------------------------------
    // Warning helper
    // -------------------------------------------------------------------------

    _warn(msg) {
        const prefix = this._currentEntity ? `[${this._currentEntity}] ` : '';
        const warning = prefix + msg;
        // Warnings are collected on the context when available, else console
        console.warn('BootstrapMapper WARNING: ' + warning);
    }
}

export default BootstrapMapper;