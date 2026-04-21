import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import {textStartsWith} from "./utils.js";
import AsciidocToDeltaConverter from "./AsciidocToDeltaConverter.js";

/**
 * Mapper for NM B2B Word documents
 * Transforms hierarchical section structure into ODIP entities
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Hierarchical Organization Pattern:
 * -----------------------------------
 * The NM B2B document follows a nested structure where requirements are organized
 * within an arbitrary organizational hierarchy:
 *
 * - Level 1+: Organizational sections (e.g., "Technical Aspects", "Service Lifecycle")
 *   - "ONs" or "ORs" keyword section (marks entity container type)
 *     - Entity subsection (contains Statement: paragraph → becomes requirement)
 *       - Child entity subsection (refines parent via parent-child relationship)
 *
 * Any subsection containing a "Statement:" paragraph is extracted as a requirement.
 * Entity type determined by nearest ancestor containing "ONs" or "ORs" keyword.
 *
 * Path Construction:
 * ------------------
 * - Organizational path = all ancestor section titles up to (but excluding) "ONs"/"ORs" marker
 * - Requirement title = subsection heading text
 * - External ID built from: drg + path + title
 * - "Operational Needs and Requirements" prefix removed if present
 *
 * Entity Hierarchy:
 * -----------------
 * - Nested subsections under an entity → parent-child REFINES relationship
 * - Parent reference stored in child's `parent.externalId` field
 * - Only immediate parent tracked (not full ancestry)
 *
 * Field Extraction (from subsection paragraphs):
 * ----------------------------------------------
 * - "Statement:" → statement (multi-paragraph concatenation)
 * - "Rationale:" → rationale (multi-paragraph concatenation)
 * - "Flow:" / "Flows:" / "Flow example:" / "Flow examples:" → flows
 * - "Tentative:" → tentative year range (ON-type only)
 *   - Format: "YYYY" → [YYYY, YYYY] or "YYYY-YYYY" → [start, end]
 * - "Implemented ONs:" → implementedONs array (OR-type only)
 *   - Format: "- ./Title" (relative) or "- /Full/Path/Title" (absolute)
 *   - Relative references resolved using current entity's organizational path
 * - "References:" / "Reference:" → strategicDocuments (ONs) / privateNotes (ORs)
 *   - Format: "- document:external_id" or "- document:external_id: note text"
 *
 * Document References (Implicit Injection for Root ONs):
 * -------------------------------------------------------
 * Root ONs (ONs that do not refine a parent ON) always receive four implicit
 * strategic document references, appended after any explicit references:
 *
 * 1. NSP SO 2 (refdoc:nsp_so_2) — injected unconditionally on all root ONs
 * 2. ATMMP SDO 8 (refdoc:atmmp_sdo_8) — injected unconditionally on all root ONs
 * 3. Commission Implementing Regulation (EU) 2021/116 (refdoc:commission_implementing_regulation_(eu)_2021_116)
 *    with note 'AF 5' — injected unconditionally on all root ONs
 * 4. NM B2B ConOPS (refdoc:nm_b2b_conops) — injected only when no explicit
 *    "References:" are found in the document; note field set to the organisational
 *    path of the requirement: "Section: 'Path/To/Requirement'"
 *
 * Child ONs (refining a parent ON) receive no implicit references.
 * ORs receive no implicit references.
 *
 * External ID Format:
 * -------------------
 * - ON: on:nm_b2b/{path_normalized}/{title_normalized}
 * - OR: or:nm_b2b/{path_normalized}/{title_normalized}
 *
 * Reference Documents:
 * --------------------
 * Implicit references injected for root ONs:
 * - "NM B2B ConOPS" (refdoc:nm_b2b_conops) — conditional, see above
 * - "NSP SO 2" (refdoc:nsp_so_2) — unconditional
 * - "ATMMP SDO 8" (refdoc:atmmp_sdo_8) — unconditional
 * - "Commission Implementing Regulation (EU) 2021/116" (refdoc:commission_implementing_regulation_(eu)_2021_116), note 'AF 5' — unconditional
 *
 * Validation:
 * -----------
 * - Implemented ONs: Verify all referenced ON external IDs exist in extracted ON map
 * - Document References: Verify all referenced document external IDs exist in document map
 * - Statistics logged: resolved vs unresolved references
 *
 * IGNORED CONTENT:
 * ----------------
 * - Section numbering (e.g., "6.1.2") - only titles used
 * - Any content not within recognized field markers
 * - Subsections without "Statement:" paragraph (organizational only, not requirements)
 */
class NM_B2B_Mapper extends Mapper {
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

        // Process all top-level sections
        for (const section of rawData.sections || []) {
            this._mapSection(section, context);
        }

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
            stakeholderCategoryMap: new Map(),
            waveMap: new Map(),
            changeMap: new Map()
        };
    }

    /**
     * Recursively map a section based on its type
     * @private
     */
    _mapSection(section, context) {
        // console.log(`Traversing section: "${section.title}" (level ${section.level})`);

        const sectionType = this._getSectionType(section);

        if (sectionType) {
            this._processRequirementsSection(section, sectionType, context, null);
        } else {
            // Not a recognized section type, recurse into subsections
            for (const subsection of section.subsections || []) {
                this._mapSection(subsection, context);
            }
        }
    }

    /**
     * Determine if section is ONs or ORs
     * @private
     * @returns {'ON'|'OR'|null}
     */
    _getSectionType(section) {
        const title = section.title?.trim().toLowerCase();
        if (title === 'ons') return 'ON';
        if (title === 'ors') return 'OR';
        return null;
    }

    /**
     * Process requirements section (ONs or ORs) - iterate through subsections
     * @private
     */
    _processRequirementsSection(section, type, context, parentReq) {
        for (const subsection of section.subsections || []) {
            this._processRequirementSubsection(subsection, type, context, parentReq);
        }
    }

    /**
     * Recursively process subsection - create requirement if has Statement, else recurse
     * @private
     */
    _processRequirementSubsection(subsection, type, context, parentReq) {
        const isRequirement = this._hasStatement(subsection);

        if (isRequirement) {
            // Build the requirement object first
            const req = {
                title: subsection.title,
                type: type, // 'ON' or 'OR'
                drg: 'NM_B2B',
                path: parentReq? null : this._getCleanedPath(subsection.path),
                parent: parentReq ? { externalId: parentReq.externalId } : null,
                ...this._extractRequirementDetails(subsection, type, context)
            };

            // Generate external ID using the complete object
            req.externalId = ExternalIdBuilder.buildExternalId(req, type.toLowerCase());

            // Add implicit document references for root ONs
            if (type === 'ON' && !parentReq) {
                const nspSo2ExternalId = ExternalIdBuilder.buildExternalId({
                    name: "NSP SO 2",
                    parentExternalId: "refdoc:nsp"
                }, 'refdoc');
                const atmmpSdo8ExternalId = ExternalIdBuilder.buildExternalId({
                    name: "ATMMP SDO 8"
                }, 'refdoc');
                const euIrExternalId = ExternalIdBuilder.buildExternalId({
                    name: "Commission Implementing Regulation (EU) 2021/116"
                }, 'refdoc');
                const implicitRefs = [
                    { externalId: nspSo2ExternalId },
                    { externalId: atmmpSdo8ExternalId },
                    { externalId: euIrExternalId, note: 'AF 5' }
                ];

                // Add ConOPS reference if no explicit strategic documents provided
                if (!req.strategicDocuments || req.strategicDocuments.length === 0) {
                    const conopsExternalId = ExternalIdBuilder.buildExternalId({
                        name: "NM B2B ConOPS",
                        version: "2.1"
                    }, 'refdoc');
                    implicitRefs.push({
                        externalId: conopsExternalId,
                        note: `Section: '${this._getOrganizationalPathString(subsection.path)}'`
                    });
                }

                req.strategicDocuments = [...(req.strategicDocuments || []), ...implicitRefs];
            }

            const map = type === 'ON' ? context.onMap : context.orMap;
            map.set(req.externalId, req);

            // Recurse with this requirement as new parent
            for (const child of subsection.subsections || []) {
                this._processRequirementSubsection(child, type, context, req);
            }
        } else {
            // Not a requirement, no parent to pass down
            for (const child of subsection.subsections || []) {
                this._processRequirementSubsection(child, type, context, null);
            }
        }
    }

    /**
     * Check if subsection has a Statement paragraph
     * @private
     */
    _hasStatement(subsection) {
        const paragraphs = subsection.content?.paragraphs || [];
        return paragraphs.some(p => {
            const text = typeof p === 'string' ? p : p.text;
            return text?.trim().startsWith('Statement:');
        });
    }

    /**
     * Clean and normalize path for external ID generation
     * Removes common prefixes and section markers
     * @param {Array<string>} path - Raw path from document structure
     * @returns {Array<string>} Cleaned path segments (not normalized - ExternalIdBuilder handles that)
     * @private
     */
    _getCleanedPath(path) {
        let cleanPath = [...path];

        // Remove 'Operational Needs and Requirements' prefix if present
        if (cleanPath[0] === 'Operational Needs and Requirements') {
            cleanPath = cleanPath.slice(1);
        }

        // Remove 'ONs' or 'ORs' or 'OCs' markers
        cleanPath = cleanPath.filter(segment => {
            const normalized = segment.trim().toLowerCase();
            return normalized !== 'ons' && normalized !== 'ors' && normalized !== 'ocs';
        });

        // Remove last element
        cleanPath = cleanPath.slice(0, -1);

        return cleanPath;
    }

    /**
     * Get parent path for requirement (if no parent requirement)
     * @private
     */
    _getParentPath(subsection) {
        if (subsection.path.length <= 1) return null;
        return subsection.path.slice(0, -1);
    }

    /**
     * Get organizational path (exclude 'ONs'/'ORs'/'OCs' markers)
     * @param {Array<string>} path - Full path array
     * @returns {Array<string>} Organizational path
     * @private
     */
    _getOrganizationalPath(path) {
        // Find last occurrence of 'ONs', 'ORs', or 'OCs' and return everything before it
        for (let i = path.length - 1; i >= 0; i--) {
            const segment = path[i].trim().toLowerCase();
            if (segment === 'ons' || segment === 'ors' || segment === 'ocs') {
                return path.slice(0, i);
            }
        }
        return path; // No marker found, return full path
    }

    /**
     * Get organizational path as string for document reference
     * @private
     */
    _getOrganizationalPathString(path) {
        const orgPath = this._getOrganizationalPath(path);
        // Remove 'Operational Needs and Requirements' prefix if present
        if (orgPath[0] === 'Operational Needs and Requirements') {
            return orgPath.slice(1).join(' / ');
        }
        return orgPath.join(' / ');
    }

    /**
     * Extract requirement details from subsection paragraphs.
     * Paragraphs are now AsciiDoc-formatted plain text from DocxExtractor
     * @private
     */
    _extractRequirementDetails(subsection, type, context) {
        const paragraphs = subsection.content?.paragraphs || [];
        let statement = '';
        let rationale = '';
        let flows = '';
        let implementedONs = [];
        let parsedDocRefs = [];
        let tentative = null;
        let currentSection = null;

        for (const p of paragraphs) {
            const text = (typeof p === 'string' ? p : p.text)?.trim() || '';

            if (textStartsWith(text, 'Statement:')) {
                currentSection = 'statement';
                statement = text.substring('Statement:'.length).trim();
            } else if (textStartsWith(text, 'Rationale:')) {
                currentSection = 'rationale';
                rationale = text.substring('Rationale:'.length).trim();
            } else if (textStartsWith(text, 'Flow:', 'Flows:', 'Flow example', 'Flow examples')) {
                if (currentSection === 'flows') {
                    flows += '\n\n' + text;
                } else {
                    currentSection = 'flows';
                    // Determine which prefix to remove
                    let prefix;
                    if (textStartsWith(text, 'Flow:')) prefix = 'Flow:';
                    else if (textStartsWith(text, 'Flow examples')) prefix = 'Flow examples';
                    else if (textStartsWith(text, 'Flow example:')) prefix = 'Flow example:';
                    else if (textStartsWith(text, 'Flow example')) prefix = 'Flow example';
                    else if (textStartsWith(text, 'Flows:')) prefix = 'Flows:';
                    else prefix = 'Flow:';
                    flows = text.substring(prefix.length).trim();
                }
            } else if (textStartsWith(text, 'Implemented ONs:')) {
                currentSection = 'implementedONs';
            } else if (textStartsWith(text, 'Tentative:')) {
                currentSection = 'tentative';
                tentative = this._parseTentative(text.substring('Tentative:'.length).trim());
            } else if (textStartsWith(text, 'References:', 'Reference:')) {
                currentSection = 'references';
            } else if (currentSection === 'statement' && text) {
                statement += '\n\n' + text;
            } else if (currentSection === 'rationale' && text) {
                rationale += '\n\n' + text;
            } else if (currentSection === 'flows' && text) {
                flows += '\n\n' + text;
            } else if (currentSection === 'implementedONs') {
                // Split by newlines to handle both single and multi-line formats
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ')) {
                        const reference = line.substring(2).trim();
                        const normalizedId = this._normalizeONReference(reference, subsection.path);
                        if (normalizedId) {
                            implementedONs.push(normalizedId);
                        }
                    }
                }
            } else if (currentSection === 'references') {
                // Split by newlines to handle both single and multi-line formats
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ')) {
                        const reference = this._parseDocumentReference(line.substring(2).trim());
                        if (reference) {
                            parsedDocRefs.push(reference);
                        }
                    }
                }
            }
        }

        const result = {
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            flows: this.converter.asciidocToDelta(flows),
            implementedONs: type === 'OR' ? implementedONs : [],
            tentative: type === 'ON' ? tentative : null
        };

        // ONs: explicit refs become strategicDocuments
        // ORs: explicit refs go to privateNotes
        if (parsedDocRefs.length > 0) {
            if (type === 'ON') {
                result.strategicDocuments = parsedDocRefs;
            } else {
                const refsText = parsedDocRefs
                    .map(r => r.note ? `${r.externalId}: ${r.note}` : r.externalId)
                    .join('\n');
                result.privateNotes = this.converter.asciidocToDelta(`**References:**\n${refsText}`);
            }
        }

        return result;
    }

    /**
     * Parse document reference from text
     * Format: "DOC_ID" or "DOC_ID: note text"
     * @private
     */
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

    _parseDocumentReference(text) {
        // Find the second colon (first is part of external ID like "document:...")
        const firstColonIndex = text.indexOf(':');
        if (firstColonIndex > 0) {
            const secondColonIndex = text.indexOf(':', firstColonIndex + 1);
            if (secondColonIndex > 0) {
                return {
                    externalId: text.substring(0, secondColonIndex).trim(),
                    note: text.substring(secondColonIndex + 1).trim()
                };
            }
        }
        // No note, just the document external ID
        return {
            externalId: text.trim()
        };
    }

    /**
     * Normalize ON reference to external ID
     * @param {string} reference - './Title' or '/Absolute/Path/Title'
     * @param {Array<string>} currentPath - Current OR's path (includes up to 'ORs' parent)
     * @returns {string} External ID with on: prefix
     * @private
     */
    _normalizeONReference(reference, currentPath) {
        let pathTokens;

        if (reference.startsWith('./')) {
            // Relative: same organizational path as current OR
            const title = reference.substring(2);
            const orgPath = this._getOrganizationalPath(currentPath);
            pathTokens = [...orgPath, ...(title.includes('/') ? this._splitReferencePath(title) : [title.trim()])];
        } else if (reference.startsWith('/')) {
            // Absolute: parse path, respecting single-quoted tokens
            pathTokens = this._splitReferencePath(reference.substring(1));
        } else {
            // Fallback: parse path, respecting single-quoted tokens
            pathTokens = this._splitReferencePath(reference);
        }

        // Build ON object and get external ID
        return ExternalIdBuilder.buildExternalId({
            drg: 'NM_B2B',
            path: this._getCleanedPath(pathTokens),
            title: pathTokens[pathTokens.length - 1] // Last segment as title
        }, 'on');
    }

    /**
     * Split a reference path string into tokens.
     * - '/' in path-parsing mode → segment separator
     * - '/' in token-parsing mode (inside single quotes) → replaced with '_'
     * - "'" / U+2018 / U+2019 toggles between path-parsing and token-parsing mode
     * Quotes (straight and curly) are stripped from the resulting tokens.
     * @param {string} pathString
     * @returns {Array<string>}
     * @private
     */
    _splitReferencePath(pathString) {
        const tokens = [];
        let current = '';
        let inToken = false;

        for (const ch of pathString) {
            if (ch === "'" || ch === '\u2018' || ch === '\u2019') {
                inToken = !inToken;
            } else if (ch === '/') {
                if (inToken) {
                    current += '_';
                } else {
                    tokens.push(current.trim().replace(/[''\u2018\u2019]/g, ''));
                    current = '';
                }
            } else {
                current += ch;
            }
        }
        tokens.push(current.trim().replace(/[''\u2018\u2019]/g, ''));
        return tokens;
    }

    /**
     * Build final output from context maps
     * @private
     */
    _buildOutput(context) {
        // Validate references
        this._validateImplementedONs(context);

        // Helper to clean entity by removing null/empty fields
        const cleanEntity = (entity) => {
            const cleaned = {};
            for (const [key, value] of Object.entries(entity)) {
                if (key === 'parent') continue; // translated below
                if (value === null || value === undefined) continue;
                if (Array.isArray(value) && value.length === 0) continue;
                if (value === '') continue;
                cleaned[key] = value;
            }
            // Translate parent.externalId to refinesParents array
            if (entity.parent && entity.parent.externalId) {
                cleaned.refinesParents = [entity.parent.externalId];
            }
            return cleaned;
        };

        const cleanArray = (arr) => arr.map(cleanEntity);

        // Log mapped counts
        console.log(`Mapped entities - ONs: ${context.onMap.size}, ORs: ${context.orMap.size}, OCs: ${context.changeMap.size}`);

        // Dump ON title -> externalId map for debugging reference resolution
        console.log('ON map dump:');
        for (const [externalId, on] of context.onMap) {
            console.log(`  "${on.title}" -> ${externalId}`);
        }

        return {
            referenceDocuments: [],
            stakeholderCategories: [],
            waves: cleanArray(Array.from(context.waveMap.values())),
            requirements: cleanArray(Array.from(context.onMap.values()).concat(Array.from(context.orMap.values()))),
            changes: cleanArray(Array.from(context.changeMap.values()))
        };
    }

    /**
     * Validate that all implementedONs references point to existing ONs
     * @private
     */
    _validateImplementedONs(context) {
        let totalReferences = 0;
        let unresolvedReferences = 0;

        for (const or of context.orMap.values()) {
            if (or.implementedONs && or.implementedONs.length > 0) {
                totalReferences += or.implementedONs.length;

                for (const onRef of or.implementedONs) {
                    if (!context.onMap.has(onRef)) {
                        unresolvedReferences++;
                        console.warn(`WARNING: OR "${or.externalId}" references non-existent ON: "${onRef}"`);
                    }
                }
            }
        }

        console.log(`Implemented ONs validation: ${totalReferences - unresolvedReferences}/${totalReferences} resolved (${unresolvedReferences} unresolved)`);
    }

}

export default NM_B2B_Mapper;