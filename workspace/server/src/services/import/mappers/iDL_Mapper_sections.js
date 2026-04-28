import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';
import AsciidocToDeltaConverter from './AsciidocToDeltaConverter.js';
import {textStartsWith} from "./utils.js";

/**
 * Mapper for iDL section-based Word documents
 * Transforms hierarchical section structure into ODIP entities
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
 * - "Private notes:" / "NM private notes:" / "Additional documents:" → nmPrivateNotes
 * - "Dependencies:" → dependencies array (OR-type only)
 *   - Same reference format as implementedONs, resolves to OR external IDs
 * - "ConOPS Reference:" / "ConOPS References:" → strategicDocuments array (ONs) / privateNotes (ORs)
 *   - Full external ID: "- document:idl_conops_v2.1" or "- document:idl_conops_v2.1: note"
 *   - Section reference: "- Section 4.1.1 - Title" (auto-maps to iDL ConOPS)
 *   - Placeholder "<to be completed>" ignored
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
 */
class iDL_Mapper_sections extends Mapper {

    /**
     * Alias map: normalized document name prefix → canonical refdoc external ID.
     * Handles variant phrasings found in Word documents (e.g. "iDL CONOPS Ed. 2.1",
     * "iDL CONOPS Edition 2.1") that all refer to the same setup document.
     */
    static DOCUMENT_ALIASES = {
        'idl_(airspace)_conops': 'refdoc:idl_(airspace)_conops',
        'idl_conops':            'refdoc:idl_(airspace)_conops'
    };

    /**
     * Resolve a document name to a canonical refdoc external ID.
     * First tries exact match, then prefix match against DOCUMENT_ALIASES.
     * Returns null and warns if unresolved.
     * @param {string} docName - Raw document name from document text
     * @param {string} sectionTitle - For warning context
     * @returns {string|null}
     * @private
     */
    _resolveDocumentAlias(docName, sectionTitle) {
        const normalized = ExternalIdBuilder._normalize(docName);

        // Exact match
        if (iDL_Mapper_sections.DOCUMENT_ALIASES[normalized]) {
            return iDL_Mapper_sections.DOCUMENT_ALIASES[normalized];
        }

        // Prefix match (handles version suffixes like "_ed_2.1", "_edition_2.1")
        for (const [prefix, externalId] of Object.entries(iDL_Mapper_sections.DOCUMENT_ALIASES)) {
            if (normalized.startsWith(prefix)) {
                return externalId;
            }
        }

        console.warn(`WARNING: Cannot resolve "Strategic Documents:" name "${docName}" in section "${sectionTitle}"`);
        return null;
    }

    constructor() {
        super();
        this.converter = new AsciidocToDeltaConverter();
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

        // Process ONs and ORs sections by title (section numbers vary across iDL documents)
        for (const section of rawData.sections || []) {
            if (section.title === 'Operational Needs') {
                this._processRequirementsSection(section, 'ON', context, null);
            } else if (section.title === 'Operational Requirements') {
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
            stakeholderCategoryMap: new Map(),
            waveMap: new Map(),
            changeMap: new Map()
        };
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
            // Note: parent field is used only for ExternalIdBuilder (expects { externalId }),
            // then replaced with refinesParents array to match importer contract.
            const parent = parentReq ? { externalId: parentReq.externalId } : null;
            const req = {
                title: subsection.title,
                type: type, // 'ON' or 'OR'
                drg: 'IDL',
                path: parent ? null : this._getCleanedPath(subsection.path, context),
                parent,
                ...this._extractRequirementDetails(subsection, type, context)
            };

            // Generate external ID using the complete object (requires parent in { externalId } shape)
            req.externalId = ExternalIdBuilder.buildExternalId(req, type.toLowerCase());

            // Replace parent with refinesParents array to match importer contract
            delete req.parent;
            req.refinesParents = parent ? [parent.externalId] : [];

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
     * Paragraphs are now AsciiDoc-formatted plain text from DocxExtractor
     * @private
     */
    _extractRequirementDetails(subsection, type, context) {
        const paragraphs = subsection.content?.paragraphs || [];
        let statement = '';
        let rationale = '';
        let flows = '';
        let privateNotes = '';
        let maturity = null;
        let additionalDocumentation = '';
        let implementedONs = [];
        let dependencies = [];
        let strategicDocuments = [];
        let conopsRefsForPrivateNotes = [];
        let currentSection = null;
        // For Strategic Documents: resolved document ID and accumulated section bullet notes
        let strategicDocumentExternalId = null;
        let strategicDocumentNoteLines = [];

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
            'ConOPS References:',
            'Private notes:',
            'NM private notes:',
            'Maturity level:',
            'Domain:',
            'Strategic Documents:',
            'NFRs:',
            'Additional documentation:',
            'Additional documents:'
        ];

        for (const p of paragraphs) {
            const text = (typeof p === 'string' ? p : p.text)?.trim() || '';

            // Check for section markers
            if (textStartsWith(text, 'Statement:')) {
                currentSection = 'statement';
                statement = text.substring(text.toLowerCase().indexOf('statement:') + 'statement:'.length).trim();
            } else if (textStartsWith(text, 'Rationale:')) {
                currentSection = 'rationale';
                rationale = text.substring(text.toLowerCase().indexOf('rationale:') + 'rationale:'.length).trim();
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

                    flows = text.substring(text.toLowerCase().indexOf(prefix.toLowerCase()) + prefix.length).trim();
                }
            } else if (textStartsWith(text, 'Implemented ONs:', 'Implemented Operational Needs:')) {
                currentSection = 'implementedONs';
            } else if (textStartsWith(text, 'Dependencies:')) {
                currentSection = 'dependencies';
            } else if (textStartsWith(text, 'Private notes:', 'NM private notes:', 'Additional documents:')) {
                currentSection = 'privateNotes';
            } else if (textStartsWith(text, 'ConOPS Reference:', 'ConOPS References:')) {
                currentSection = 'conopsReferences';
            } else if (textStartsWith(text, 'Domain:')) {
                // Consumed and discarded
                currentSection = 'domain';
            } else if (textStartsWith(text, 'NFRs:')) {
                // Consumed and discarded
                currentSection = 'nfrs';
            } else if (textStartsWith(text, 'Additional documentation:')) {
                currentSection = 'additionalDocumentation';
                const value = text.substring(text.toLowerCase().indexOf('additional documentation:') + 'additional documentation:'.length).trim();
                if (value && value.toLowerCase() !== 'none') {
                    additionalDocumentation = value;
                }
            } else if (textStartsWith(text, 'Maturity level:')) {
                currentSection = 'maturityLevel';
                const value = text.substring(text.toLowerCase().indexOf('maturity level:') + 'maturity level:'.length).trim();
                if (value) {
                    maturity = value.toUpperCase();
                }
            } else if (textStartsWith(text, 'Strategic Documents:')) {
                // Flush any previous strategic document block
                if (strategicDocumentExternalId && strategicDocumentNoteLines.length > 0) {
                    strategicDocuments.push({
                        externalId: strategicDocumentExternalId,
                        note: strategicDocumentNoteLines.join('\n')
                    });
                }
                strategicDocumentExternalId = null;
                strategicDocumentNoteLines = [];
                currentSection = 'strategicDocuments';
                // Parse inline document name after the keyword (e.g. "Strategic Documents: iDL CONOPS Ed. 2.1:")
                const afterKeyword = text.substring(text.toLowerCase().indexOf('strategic documents:') + 'strategic documents:'.length).trim();
                // Strip trailing colon if present
                const docName = afterKeyword.replace(/:$/, '').trim();
                if (docName) {
                    strategicDocumentExternalId = this._resolveDocumentAlias(docName, subsection.title);
                } else {
                    console.warn(`WARNING: "Strategic Documents:" keyword has no document name in section "${subsection.title}"`);
                }
            } else if (rationaleTerminators.some(term => textStartsWith(text, term))) {
                // Hit a terminator, stop capturing rationale
                currentSection = null;
            } else if (currentSection === 'statement' && text) {
                statement += '\n\n' + text;
            } else if (currentSection === 'rationale' && text) {
                rationale += '\n\n' + text;
            } else if (currentSection === 'flows' && text) {
                flows += '\n\n' + text;
            }  else if (currentSection === 'privateNotes' && text) {
                privateNotes += '\n\n' + text;
            } else if (currentSection === 'additionalDocumentation' && text) {
                additionalDocumentation += '\n\n' + text;
            } else if (currentSection === 'implementedONs') {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ')) {
                        const reference = line.substring(2).trim();
                        const normalizedId = this._normalizeONReference(reference, subsection.path, context);
                        if (normalizedId) {
                            implementedONs.push(normalizedId);
                        }
                    }
                }
            } else if (currentSection === 'dependencies') {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ')) {
                        const reference = line.substring(2).trim();
                        const normalizedId = this._normalizeORReference(reference, subsection.path, context);
                        if (normalizedId) {
                            dependencies.push(normalizedId);
                        }
                    }
                }
            } else if (currentSection === 'conopsReferences') {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ')) {
                        const reference = this._parseDocumentReference(line.substring(2).trim());
                        if (reference) {
                            conopsRefsForPrivateNotes.push(reference);
                        }
                    }
                }
            } else if (currentSection === 'strategicDocuments') {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('* ')) {
                        strategicDocumentNoteLines.push(line.substring(2).trim());
                    }
                }
            }
        }

        // Flush any pending Strategic Documents block
        if (strategicDocumentExternalId && strategicDocumentNoteLines.length > 0) {
            strategicDocuments.push({
                externalId: strategicDocumentExternalId,
                note: strategicDocumentNoteLines.join('\n')
            });
        } else if (strategicDocumentExternalId && strategicDocumentNoteLines.length === 0) {
            console.warn(`WARNING: "Strategic Documents:" block for "${strategicDocumentExternalId}" has no section bullets in "${subsection.title}"`);
        }

        // For ONs: conops refs become strategicDocuments
        // For ORs: conops refs go to privateNotes
        if (type === 'ON') {
            strategicDocuments = [...strategicDocuments, ...conopsRefsForPrivateNotes];
        } else if (conopsRefsForPrivateNotes.length > 0) {
            const refsText = conopsRefsForPrivateNotes
                .map(r => r.note ? `${r.externalId}: ${r.note}` : r.externalId)
                .join('\n');
            const refsNote = `**ConOPS References:**\n${refsText}`;
            privateNotes = privateNotes ? `${privateNotes}\n\n${refsNote}` : refsNote;
        }

        // Append additional documentation to statement if present
        if (additionalDocumentation) {
            statement = statement
                ? `${statement}\n\n**Additional documentation:**\n\n${additionalDocumentation}`
                : `**Additional documentation:**\n\n${additionalDocumentation}`;
        }

        const result = {
            statement: this.converter.asciidocToDelta(statement),
            rationale: this.converter.asciidocToDelta(rationale),
            flows: this.converter.asciidocToDelta(flows),
            privateNotes: this.converter.asciidocToDelta(privateNotes),
            maturity: maturity,
            implementedONs: type === 'OR' ? implementedONs : [],
            dependencies: type === 'OR' ? dependencies : []
        };

        // Add strategicDocuments only for ONs if found
        if (type === 'ON' && strategicDocuments.length > 0) {
            result.strategicDocuments = strategicDocuments;
        }

        return result;
    }

    /**
     * Parse document reference from text
     * Handles three formats:
     * 1. Full external ID: "refdoc:idl_(airspace)_conops" or "refdoc:...: note"
     * 2. Section reference: "Section 4.1.1 - Title" (auto-maps to iDL ConOPS)
     * 3. Placeholder: "<to be completed>" (ignored)
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
            // Find the second colon (first is part of external ID like "document:...")
            const firstColonIndex = trimmedText.indexOf(':');
            const secondColonIndex = trimmedText.indexOf(':', firstColonIndex + 1);

            if (secondColonIndex > 0) {
                // Has a third colon, extract note
                const thirdColonIndex = trimmedText.indexOf(':', secondColonIndex + 1);
                if (thirdColonIndex > 0) {
                    return {
                        externalId: trimmedText.substring(0, thirdColonIndex).trim(),
                        note: trimmedText.substring(thirdColonIndex + 1).trim()
                    };
                }
            }
            // No note, just the document external ID
            return {
                externalId: trimmedText
            };
        }

        // Otherwise, treat as section reference - auto-map to iDL ConOPS document
        const conopsExternalId = ExternalIdBuilder.buildExternalId({
            name: 'iDL (Airspace) CONOPS'
        }, 'refdoc');

        return {
            externalId: conopsExternalId,
            note: trimmedText
        };
    }

    /**
     * Normalize ON reference to external ID
     * @param {string} reference - './Title' or '/Absolute/Path/Title'
     * @param {Array<string>} currentPath - Current OR's path
     * @param {Object} context - Mapping context with folder
     * @returns {string} External ID with on: prefix
     * @private
     */
    _normalizeONReference(reference, currentPath, context) {
        let pathTokens;

        if (reference.startsWith('./')) {
            // Relative: same organizational path as current OR
            const title = reference.substring(2);
            const cleanedPath = this._getCleanedPath(currentPath, context);
            pathTokens = [...cleanedPath, title];
        } else if (reference.startsWith('/')) {
            // Absolute: parse path and normalize, prepend folder
            const pathString = reference.substring(1);
            pathTokens = [context.folder, ...pathString.split('/').map(s => s.trim()).filter(s => s.length > 0)];
        } else {
            // Fallback: parse path and normalize, prepend folder
            pathTokens = [context.folder, ...reference.split('/').map(s => s.trim()).filter(s => s.length > 0)];
        }

        // Build ON object and get external ID
        return ExternalIdBuilder.buildExternalId({
            drg: 'IDL',
            path: pathTokens.slice(0, -1), // Path without title
            title: pathTokens[pathTokens.length - 1] // Last segment as title
        }, 'on');
    }

    /**
     * Normalize OR reference to external ID
     * @param {string} reference - './Title' or '/Absolute/Path/Title'
     * @param {Array<string>} currentPath - Current OR's path
     * @param {Object} context - Mapping context with folder
     * @returns {string} External ID with or: prefix
     * @private
     */
    _normalizeORReference(reference, currentPath, context) {
        let pathTokens;

        if (reference.startsWith('./')) {
            // Relative: same organizational path as current OR
            const title = reference.substring(2);
            const cleanedPath = this._getCleanedPath(currentPath, context);
            pathTokens = [...cleanedPath, title];
        } else if (reference.startsWith('/')) {
            // Absolute: parse path and normalize, prepend folder
            const pathString = reference.substring(1);
            pathTokens = [context.folder, ...pathString.split('/').map(s => s.trim()).filter(s => s.length > 0)];
        } else {
            // Fallback: parse path and normalize, prepend folder
            pathTokens = [context.folder, ...reference.split('/').map(s => s.trim()).filter(s => s.length > 0)];
        }

        // Build OR object and get external ID
        return ExternalIdBuilder.buildExternalId({
            drg: 'IDL',
            path: pathTokens.slice(0, -1), // Path without title
            title: pathTokens[pathTokens.length - 1] // Last segment as title
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

    /**
     * Validate that all OR dependencies point to existing ORs
     * @private
     */
    _validateORDependencies(context) {
        let totalReferences = 0;
        let unresolvedReferences = 0;

        for (const or of context.orMap.values()) {
            if (or.dependencies && or.dependencies.length > 0) {
                totalReferences += or.dependencies.length;

                for (const orRef of or.dependencies) {
                    if (!context.orMap.has(orRef)) {
                        unresolvedReferences++;
                        console.warn(`WARNING: OR "${or.externalId}" references non-existent OR dependency: "${orRef}"`);
                    }
                }
            }
        }

        console.log(`OR dependencies validation: ${totalReferences - unresolvedReferences}/${totalReferences} resolved (${unresolvedReferences} unresolved)`);
    }

}

export default iDL_Mapper_sections;