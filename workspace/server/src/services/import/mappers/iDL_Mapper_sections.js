import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import HtmlToDeltaConverter from './HtmlToDeltaConverter.js';
import {textStartsWith} from "./utils.js";

/**
 * Mapper for iDL section-based Word documents
 * Transforms hierarchical section structure into ODP entities
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Hierarchical Organization Pattern:
 * -----------------------------------
 * The iDL document uses numbered sections to organize requirements:
 *
 * - Section 4: "Operational Needs" (all subsections become ONs)
 *   - 4.x: Organizational grouping (e.g., "Delivery to Operations and Publication")
 *     - 4.x.y: Entity subsection (contains Statement: paragraph → becomes ON)
 *       - 4.x.y.z: Child entity subsection (refines parent via parent-child relationship)
 *
 * - Section 5: "Operational Requirements" (all subsections become ORs)
 *   - 5.x: Organizational grouping
 *     - 5.x.y: Entity subsection (contains Statement: paragraph → becomes OR)
 *       - 5.x.y.z: Child entity subsection (refines parent via parent-child relationship)
 *
 * Any subsection containing a "Statement:" paragraph is extracted as a requirement.
 * Entity type determined by top-level section number (4 = ON, 5 = OR).
 *
 * Path Construction:
 * ------------------
 * - Path built from section title hierarchy (not section numbers)
 * - Level 1 section title ("Operational Needs" or "Operational Requirements") removed
 * - Target folder (e.g., 'iDLADP', 'iDLADMM') prepended as first path segment
 * - Requirement title excluded from path (stored separately)
 * - External ID built from: drg + path + title
 * - Example: "4.1.5 Operational Change via Instant Data Amendment" with folder 'iDLADP'
 *   → path: ["iDLADP", "Delivery to Operations and Publication"]
 *   → title: "Operational Change via Instant Data Amendment"
 *
 * Entity Hierarchy:
 * -----------------
 * - Nested subsections under an entity → parent-child REFINES relationship
 * - Parent reference stored in child's `parent.externalId` field
 * - Only immediate parent tracked (not full ancestry)
 *
 * Field Extraction (from subsection paragraphs):
 * ----------------------------------------------
 * - "Statement:" → statement (multi-paragraph concatenation until next keyword)
 * - "Rationale:" → rationale (multi-paragraph concatenation, terminated by specific keywords)
 *   - Terminators: "Implemented ONs:", "Impact:", "Dependencies:", "Flow:", "ConOPS Reference:"
 * - "Flow:" / "Flows:" / "Flow example:" / "Flow examples:" → flows
 * - "Implemented ONs:" / "Implemented Operational Needs:" → implementedONs array (OR-type only)
 *   - Format: "- ./Title" (relative) or "- /Full/Path/Title" (absolute)
 *   - Relative references resolved using current entity's organizational path
 * - "Dependencies:" → dependsOnRequirements array (OR-type only)
 *   - Same reference format as implementedONs, resolves to OR external IDs
 * - "ConOPS Reference:" / "ConOPS References:" → documentReferences array
 *   - Full external ID: "- document:idl_conops_v2.1" or "- document:idl_conops_v2.1: note"
 *   - Section reference: "- Section 4.1.1 - Title" (auto-maps to iDL ConOPS)
 *   - Placeholder "<to be completed>" ignored
 *
 * Document References (Auto-Mapping):
 * ------------------------------------
 * - Section references (e.g., "Section 4.1.1 - Title") automatically mapped to iDL ConOPS document
 * - Full document external IDs used as-is
 * - Note field populated with section text for section-style references
 *
 * External ID Format:
 * -------------------
 * - ON: on:idl/{folder_normalized}/{path_normalized}/{title_normalized}
 * - OR: or:idl/{folder_normalized}/{path_normalized}/{title_normalized}
 * - Note: folder prefix distinguishes requirements from different iDL documents
 *   (e.g., iDLADP for AIRAC Data Definition Process, iDLADMM for AIRAC Data Meta Model)
 *
 * Reference Documents:
 * --------------------
 * Pre-populated in mapper context:
 * - "iDL ConOPS" (v2.1) - default for section-style references
 *
 * Validation:
 * -----------
 * - Implemented ONs: Verify all referenced ON external IDs exist in extracted ON map
 * - OR Dependencies: Verify all referenced OR external IDs exist in extracted OR map
 * - Document References: Verify all referenced document external IDs exist in document map
 * - Statistics logged: resolved vs unresolved references
 *
 * IGNORED CONTENT:
 * ----------------
 * - Section numbering (e.g., "6.1.2") - only titles used for path/external ID
 * - Any content not within recognized field markers
 * - Placeholder references like "<to be completed>"
 * - Subsections without "Statement:" paragraph (organizational only, not requirements)
 *
 * IMPLEMENTATION NOTE (HTML-based paragraph format):
 * ==================================================
 * Paragraphs from DocxExtractor are objects with { html, plainText }:
 * - plainText: Used for keyword detection (Statement:, Rationale:, etc.)
 * - html: Aggregated and converted to Delta at output
 *
 * Aggregation pattern:
 *   htmlFragments.push(p.html)
 *   ...
 *   this.converter.htmlToDelta(htmlFragments.join(''))
 */
class iDL_Mapper_sections extends Mapper {
    constructor() {
        super();
        this.converter = new HtmlToDeltaConverter();
    }

    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @param {Object} [options] - Mapping options
     * @param {string} [options.folder] - Target folder (e.g., 'iDLADP', 'iDLADMM')
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData, options = {}) {
        const folder = options.folder;
        if (!folder) {
            throw new Error('iDL_Mapper_sections requires options.folder');
        }

        console.log(`iDL_Mapper_sections mapping raw data to folder: ${folder}`);
        const context = this._initContext(folder);

        // Add reference documents
        this._addReferenceDocuments(context);

        // Process sections 4 (ONs) and 5 (ORs)
        for (const section of rawData.sections || []) {
            if (section.sectionNumber?.startsWith('4')) {
                this._processRequirementsSection(section, 'ON', context, null);
            } else if (section.sectionNumber?.startsWith('5')) {
                this._processRequirementsSection(section, 'OR', context, null);
            }
        }

        return this._buildOutput(context);
    }

    /**
     * Initialize mapping context with entity maps
     * @param {string} folder - Target folder
     * @private
     */
    _initContext(folder) {
        return {
            folder,
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
     * Add reference documents to context
     * @private
     */
    _addReferenceDocuments(context) {
        const conopsDocument = {
            name: "iDL ConOPS",
            description: "Integrated Data Layer (iDL) - Concept of Operations (CONOPS)",
            version: "2.1",
            url: "https://www.eurocontrol.int/publication/integrated-data-layer-idl-concept-operations-conops"
        };
        conopsDocument.externalId = ExternalIdBuilder.buildExternalId(conopsDocument, 'document');
        context.documentMap.set(conopsDocument.externalId, conopsDocument);
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
            // Build the requirement object
            const req = {
                title: subsection.title,
                type: type, // 'ON' or 'OR'
                drg: 'IDL',
                path: parentReq ? null : this._getCleanedPath(subsection.path, context),
                parent: parentReq ? { externalId: parentReq.externalId } : null,
                ...this._extractRequirementDetails(subsection, type, context)
            };

            // Generate external ID using the complete object
            req.externalId = ExternalIdBuilder.buildExternalId(req, type.toLowerCase());

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
     * Uses plainText for keyword detection
     * @private
     */
    _hasStatement(subsection) {
        const paragraphs = subsection.content?.paragraphs || [];
        return paragraphs.some(p => {
            // Handle both old format (string) and new format ({ html, plainText })
            const text = typeof p === 'string' ? p : p.plainText;
            return text?.trim().startsWith('Statement:');
        });
    }

    /**
     * Get plain text from paragraph (handles both formats)
     * @param {string|Object} p - Paragraph (string or { html, plainText })
     * @returns {string} Plain text content
     * @private
     */
    _getPlainText(p) {
        return typeof p === 'string' ? p : (p.plainText || '');
    }

    /**
     * Get HTML from paragraph (handles both formats)
     * @param {string|Object} p - Paragraph (string or { html, plainText })
     * @returns {string} HTML content
     * @private
     */
    _getHtml(p) {
        return typeof p === 'string' ? `<p>${p}</p>` : (p.html || '');
    }

    /**
     * Clean and normalize path for external ID generation
     * Removes level 1 (Operational Needs/Requirements)
     * @param {Array<string>} path - Raw path from document structure
     * @param {Object} context - Mapping context with folder
     * @returns {Array<string>} Cleaned path segments
     * @private
     */
    _getCleanedPath(path, context) {
        let cleanPath = [...path];

        // Remove level 1 (Operational Needs or Operational Requirements)
        if (cleanPath.length > 0 &&
            (cleanPath[0] === 'Operational Needs' || cleanPath[0] === 'Operational Requirements')) {
            cleanPath = cleanPath.slice(1);
        }

        // Remove last element (the requirement title itself)
        if (cleanPath.length > 0) {
            cleanPath = cleanPath.slice(0, -1);
        }

        // Prepend folder as first path segment
        cleanPath = [context.folder, ...cleanPath];

        return cleanPath;
    }

    /**
     * Extract requirement details from subsection paragraphs
     * Paragraphs are now { html, plainText } objects from DocxExtractor
     *
     * Pattern:
     * - Use plainText for keyword detection
     * - Accumulate html fragments for rich text fields
     * - Join html fragments with <br> separator
     * - Convert to Delta at the end
     *
     * @private
     */
    _extractRequirementDetails(subsection, type, context) {
        const paragraphs = subsection.content?.paragraphs || [];

        // HTML fragment accumulators for rich text fields
        let statementHtml = [];
        let rationaleHtml = [];
        let flowsHtml = [];

        // Plain values for reference fields
        let implementedONs = [];
        let dependsOnRequirements = [];
        let documentReferences = [];
        let currentSection = null;

        // Terminator keywords for rationale section
        const rationaleTerminators = [
            'Implemented ONs:',
            'Implemented Operational Needs:',
            'Impact:',
            'Dependencies:',
            'Flow:',
            'Flows:',
            'Flow example:',
            'Flow examples:',
            'ConOPS Reference:',
            'ConOPS References:'
        ];

        for (const p of paragraphs) {
            const text = this._getPlainText(p).trim();
            const html = this._getHtml(p);

            // Check for section markers (using plainText)
            if (textStartsWith(text, 'Statement:')) {
                currentSection = 'statement';
                // Extract content after marker from HTML
                // For first paragraph, we need to strip the "Statement:" prefix from HTML too
                const contentAfterMarker = this._stripPrefixFromHtml(html, 'Statement:');
                if (contentAfterMarker) {
                    statementHtml.push(contentAfterMarker);
                }
            } else if (textStartsWith(text, 'Rationale:')) {
                currentSection = 'rationale';
                const contentAfterMarker = this._stripPrefixFromHtml(html, 'Rationale:');
                if (contentAfterMarker) {
                    rationaleHtml.push(contentAfterMarker);
                }
            } else if (textStartsWith(text, 'Flow:', 'Flows:', 'Flow example', 'Flow examples')) {
                if (currentSection === 'flows') {
                    // Already in flows section, append
                    flowsHtml.push(html);
                } else {
                    currentSection = 'flows';
                    // Determine which prefix to strip
                    let prefix;
                    if (textStartsWith(text, 'Flow examples')) prefix = 'Flow examples:';
                    else if (textStartsWith(text, 'Flow example:')) prefix = 'Flow example:';
                    else if (textStartsWith(text, 'Flow example')) prefix = 'Flow example';
                    else if (textStartsWith(text, 'Flows:')) prefix = 'Flows:';
                    else prefix = 'Flow:';

                    const contentAfterMarker = this._stripPrefixFromHtml(html, prefix);
                    if (contentAfterMarker) {
                        flowsHtml.push(contentAfterMarker);
                    }
                }
            } else if (textStartsWith(text, 'Implemented ONs:', 'Implemented Operational Needs:')) {
                currentSection = 'implementedONs';
            } else if (textStartsWith(text, 'Dependencies:')) {
                currentSection = 'dependsOnRequirements';
            } else if (textStartsWith(text, 'ConOPS Reference:', 'ConOPS References:')) {
                currentSection = 'conopsReferences';
            } else if (rationaleTerminators.some(term => textStartsWith(text, term))) {
                // Hit a terminator, stop capturing rationale
                currentSection = null;
            } else if (currentSection === 'statement' && text) {
                statementHtml.push(html);
            } else if (currentSection === 'rationale' && text) {
                rationaleHtml.push(html);
            } else if (currentSection === 'flows' && text) {
                flowsHtml.push(html);
            } else if (currentSection === 'implementedONs') {
                // Parse bullet list items from plainText
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ') || line.startsWith('. ')) {
                        const reference = line.substring(2).trim();
                        const normalizedId = this._normalizeONReference(reference, subsection.path, context);
                        if (normalizedId) {
                            implementedONs.push(normalizedId);
                        }
                    }
                }
            } else if (currentSection === 'dependsOnRequirements') {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ') || line.startsWith('. ')) {
                        const reference = line.substring(2).trim();
                        const normalizedId = this._normalizeORReference(reference, subsection.path, context);
                        if (normalizedId) {
                            dependsOnRequirements.push(normalizedId);
                        }
                    }
                }
            } else if (currentSection === 'conopsReferences') {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ') || line.startsWith('. ')) {
                        const reference = this._parseDocumentReference(line.substring(2).trim());
                        if (reference) {
                            documentReferences.push(reference);
                        }
                    }
                }
            }
        }

        // Convert aggregated HTML to Delta
        // Join fragments with <br> to create blank line between blocks
        const result = {
            statement: this._htmlFragmentsToDelta(statementHtml),
            rationale: this._htmlFragmentsToDelta(rationaleHtml),
            flows: this._htmlFragmentsToDelta(flowsHtml),
            implementedONs: type === 'OR' ? implementedONs : [],
            dependsOnRequirements: type === 'OR' ? dependsOnRequirements : []
        };

        // Add documentReferences only if explicitly found
        if (documentReferences.length > 0) {
            result.documentReferences = documentReferences;
        }

        return result;
    }

    /**
     * Strip a text prefix from HTML content
     * Handles cases where prefix may be in plain text or wrapped in tags
     * @param {string} html - HTML content
     * @param {string} prefix - Text prefix to strip (e.g., "Statement:")
     * @returns {string} HTML with prefix removed
     * @private
     */
    _stripPrefixFromHtml(html, prefix) {
        if (!html) return '';

        // Try to find and remove prefix (case-insensitive)
        const prefixLower = prefix.toLowerCase();
        const htmlLower = html.toLowerCase();

        // Find prefix position (might be after opening tags)
        const prefixIndex = htmlLower.indexOf(prefixLower);
        if (prefixIndex === -1) {
            return html; // Prefix not found, return original
        }

        // Remove prefix and any following whitespace
        let result = html.substring(0, prefixIndex) + html.substring(prefixIndex + prefix.length);

        // Clean up: remove leading whitespace after tags
        result = result.replace(/^(\s*<[^>]+>\s*)(\s+)/g, '$1');

        return result.trim();
    }

    /**
     * Convert array of HTML fragments to Delta JSON string
     * @param {string[]} htmlFragments - Array of HTML fragments
     * @returns {string|null} Delta JSON string or null if empty
     * @private
     */
    _htmlFragmentsToDelta(htmlFragments) {
        if (!htmlFragments || htmlFragments.length === 0) {
            return null;
        }

        // Filter out empty fragments
        const nonEmpty = htmlFragments.filter(h => h && h.trim());
        if (nonEmpty.length === 0) {
            return null;
        }

        return this.converter.htmlToDelta(nonEmpty.join(''));
    }

    /**
     * Parse document reference from text
     * @private
     */
    _parseDocumentReference(text) {
        const trimmedText = text.trim();

        // Skip placeholder references
        if (trimmedText.startsWith('<') && trimmedText.endsWith('>')) {
            return null;
        }

        // Check if this is a full external ID (starts with "document:")
        if (trimmedText.startsWith('document:')) {
            const firstColonIndex = trimmedText.indexOf(':');
            const secondColonIndex = trimmedText.indexOf(':', firstColonIndex + 1);

            if (secondColonIndex > 0) {
                const thirdColonIndex = trimmedText.indexOf(':', secondColonIndex + 1);
                if (thirdColonIndex > 0) {
                    return {
                        documentExternalId: trimmedText.substring(0, thirdColonIndex).trim(),
                        note: trimmedText.substring(thirdColonIndex + 1).trim()
                    };
                }
            }
            return {
                documentExternalId: trimmedText
            };
        }

        // Otherwise, treat as section reference - auto-map to ConOPS document
        const conopsExternalId = ExternalIdBuilder.buildExternalId({
            name: "iDL ConOPS",
            version: "2.1"
        }, 'document');

        return {
            documentExternalId: conopsExternalId,
            note: trimmedText
        };
    }

    /**
     * Normalize ON reference to external ID
     * @private
     */
    _normalizeONReference(reference, currentPath, context) {
        let pathTokens;

        if (reference.startsWith('./')) {
            const title = reference.substring(2);
            const cleanedPath = this._getCleanedPath(currentPath, context);
            pathTokens = [...cleanedPath, title];
        } else if (reference.startsWith('/')) {
            const pathString = reference.substring(1);
            pathTokens = [context.folder, ...pathString.split('/').map(s => s.trim())];
        } else {
            pathTokens = [context.folder, ...reference.split('/').map(s => s.trim())];
        }

        return ExternalIdBuilder.buildExternalId({
            drg: 'IDL',
            path: pathTokens.slice(0, -1),
            title: pathTokens[pathTokens.length - 1]
        }, 'on');
    }

    /**
     * Normalize OR reference to external ID
     * @private
     */
    _normalizeORReference(reference, currentPath, context) {
        let pathTokens;

        if (reference.startsWith('./')) {
            const title = reference.substring(2);
            const cleanedPath = this._getCleanedPath(currentPath, context);
            pathTokens = [...cleanedPath, title];
        } else if (reference.startsWith('/')) {
            const pathString = reference.substring(1);
            pathTokens = [context.folder, ...pathString.split('/').map(s => s.trim())];
        } else {
            pathTokens = [context.folder, ...reference.split('/').map(s => s.trim())];
        }

        return ExternalIdBuilder.buildExternalId({
            drg: 'IDL',
            path: pathTokens.slice(0, -1),
            title: pathTokens[pathTokens.length - 1]
        }, 'or');
    }

    /**
     * Build final output from context maps
     * @private
     */
    _buildOutput(context) {
        // Validate references
        this._validateImplementedONs(context);
        this._validateORDependencies(context);
        this._validateDocumentReferences(context);

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

    /**
     * Validate that all OR dependsOnRequirements point to existing ORs
     * @private
     */
    _validateORDependencies(context) {
        let totalReferences = 0;
        let unresolvedReferences = 0;

        for (const or of context.orMap.values()) {
            if (or.dependsOnRequirements && or.dependsOnRequirements.length > 0) {
                totalReferences += or.dependsOnRequirements.length;

                for (const orRef of or.dependsOnRequirements) {
                    if (!context.orMap.has(orRef)) {
                        unresolvedReferences++;
                        console.warn(`WARNING: OR "${or.externalId}" references non-existent OR dependency: "${orRef}"`);
                    }
                }
            }
        }

        console.log(`OR dependsOnRequirements validation: ${totalReferences - unresolvedReferences}/${totalReferences} resolved (${unresolvedReferences} unresolved)`);
    }

    /**
     * Validate that all document references point to existing documents
     * @private
     */
    _validateDocumentReferences(context) {
        let totalReferences = 0;
        let unresolvedReferences = 0;

        const allRequirements = Array.from(context.onMap.values()).concat(Array.from(context.orMap.values()));

        for (const req of allRequirements) {
            if (req.documentReferences && req.documentReferences.length > 0) {
                totalReferences += req.documentReferences.length;

                for (const docRef of req.documentReferences) {
                    if (!context.documentMap.has(docRef.documentExternalId)) {
                        unresolvedReferences++;
                        console.warn(`WARNING: ${req.type} "${req.externalId}" references non-existent document: "${docRef.documentExternalId}"`);
                    }
                }
            }
        }

        console.log(`Document references validation: ${totalReferences - unresolvedReferences}/${totalReferences} resolved (${unresolvedReferences} unresolved)`);
    }

}

export default iDL_Mapper_sections;