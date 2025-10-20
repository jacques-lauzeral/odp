import Mapper from '../Mapper.js';
import ExternalIdBuilder from '../../../../../shared/src/model/ExternalIdBuilder.js';

/**
 * Mapper for iDL AIRAC Data Definition Process Word documents
 * Transforms hierarchical section structure into ODP entities
 *
 * DOCUMENT STRUCTURE INTERPRETATION:
 * ==================================
 *
 * Hierarchical Organization Pattern:
 * -----------------------------------
 * The iDL document uses numbered sections to organize requirements:
 *
 * - Section 6: "Operational Needs" (all subsections become ONs)
 *   - 6.x: Organizational grouping (e.g., "Delivery to Operations and Publication")
 *     - 6.x.y: Entity subsection (contains Statement: paragraph → becomes ON)
 *       - 6.x.y.z: Child entity subsection (refines parent via parent-child relationship)
 *
 * - Section 7: "Operational Requirements" (all subsections become ORs)
 *   - 7.x: Organizational grouping
 *     - 7.x.y: Entity subsection (contains Statement: paragraph → becomes OR)
 *       - 7.x.y.z: Child entity subsection (refines parent via parent-child relationship)
 *
 * Any subsection containing a "Statement:" paragraph is extracted as a requirement.
 * Entity type determined by top-level section number (6 = ON, 7 = OR).
 *
 * Path Construction:
 * ------------------
 * - Path built from section title hierarchy (not section numbers)
 * - Level 1 section title ("Operational Needs" or "Operational Requirements") removed
 * - Requirement title excluded from path (stored separately)
 * - External ID built from: drg + path + title
 * - Example: "6.1.5 Operational Change via Instant Data Amendment"
 *   → path: ["Delivery to Operations and Publication"]
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
 * - ON: on:idl/{path_normalized}/{title_normalized}
 * - OR: or:idl/{path_normalized}/{title_normalized}
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
class iDL_Mapper extends Mapper {
    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        const context = this._initContext();

        // Add reference documents
        this._addReferenceDocuments(context);

        // Process sections 6 (ONs) and 7 (ORs)
        for (const section of rawData.sections || []) {
            if (section.sectionNumber?.startsWith('6')) {
                this._processRequirementsSection(section, 'ON', context, null);
            } else if (section.sectionNumber?.startsWith('7')) {
                this._processRequirementsSection(section, 'OR', context, null);
            }
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
                path: parentReq ? null : this._getCleanedPath(subsection.path),
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
     * @returns {Array<string>} Cleaned path segments
     * @private
     */
    _getCleanedPath(path) {
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

        return cleanPath;
    }

    /**
     * Extract requirement details from subsection paragraphs
     * @private
     */
    _extractRequirementDetails(subsection, type, context) {
        const paragraphs = subsection.content?.paragraphs || [];
        let statement = '';
        let rationale = '';
        let flows = '';
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
            const text = (typeof p === 'string' ? p : p.text)?.trim() || '';

            // Check for section markers
            if (text.startsWith('Statement:')) {
                currentSection = 'statement';
                statement = text.substring('Statement:'.length).trim();
            } else if (text.startsWith('Rationale:')) {
                currentSection = 'rationale';
                rationale = text.substring('Rationale:'.length).trim();
            } else if (text.startsWith('Flow:') || text.startsWith('Flows:') ||
                text.startsWith('Flow example:') || text.startsWith('Flow examples:')) {
                currentSection = 'flows';
                // Determine which prefix to remove
                let prefix;
                if (text.startsWith('Flow examples:')) prefix = 'Flow examples:';
                else if (text.startsWith('Flow example:')) prefix = 'Flow example:';
                else if (text.startsWith('Flows:')) prefix = 'Flows:';
                else prefix = 'Flow:';
                flows = text.substring(prefix.length).trim();
            } else if (text.startsWith('Implemented ONs:') || text.startsWith('Implemented Operational Needs:')) {
                currentSection = 'implementedONs';
            } else if (text.startsWith('Dependencies:')) {
                currentSection = 'dependsOnRequirements';
            } else if (text.startsWith('ConOPS Reference:') || text.startsWith('ConOPS References:')) {
                currentSection = 'conopsReferences';
            } else if (rationaleTerminators.some(term => text.startsWith(term))) {
                // Hit a terminator, stop capturing rationale
                currentSection = null;
            } else if (currentSection === 'statement' && text && !text.endsWith(':')) {
                statement += '\n\n' + text;
            } else if (currentSection === 'rationale' && text && !text.endsWith(':')) {
                rationale += '\n\n' + text;
            } else if (currentSection === 'flows' && text && !text.endsWith(':')) {
                flows += '\n\n' + text;
            } else if (currentSection === 'implementedONs' && text.startsWith('-')) {
                const reference = text.substring(1).trim();
                const normalizedId = this._normalizeONReference(reference, subsection.path);
                if (normalizedId) {
                    implementedONs.push(normalizedId);
                }
            } else if (currentSection === 'dependsOnRequirements' && text.startsWith('-')) {
                const reference = text.substring(1).trim();
                const normalizedId = this._normalizeORReference(reference, subsection.path);
                if (normalizedId) {
                    dependsOnRequirements.push(normalizedId);
                }
            } else if (currentSection === 'conopsReferences' && text.startsWith('-')) {
                const reference = this._parseDocumentReference(text.substring(1).trim());
                if (reference) {
                    documentReferences.push(reference);
                }
            }
        }

        const result = {
            statement: statement || null,
            rationale: rationale || null,
            flows: flows || null,
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
     * Parse document reference from text
     * Handles three formats:
     * 1. Full external ID: "document:idl_conops_v2.1" or "document:idl_conops_v2.1: note"
     * 2. Section reference: "Section 4.1.1 - Title" (auto-maps to ConOPS)
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
                        documentExternalId: trimmedText.substring(0, thirdColonIndex).trim(),
                        note: trimmedText.substring(thirdColonIndex + 1).trim()
                    };
                }
            }
            // No note, just the document external ID
            return {
                documentExternalId: trimmedText
            };
        }

        // Otherwise, treat as section reference - auto-map to ConOPS document
        // Get the ConOPS document external ID from context
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
     * @param {string} reference - './Title' or '/Absolute/Path/Title'
     * @param {Array<string>} currentPath - Current OR's path
     * @returns {string} External ID with on: prefix
     * @private
     */
    _normalizeONReference(reference, currentPath) {
        let pathTokens;

        if (reference.startsWith('./')) {
            // Relative: same organizational path as current OR
            const title = reference.substring(2);
            const cleanedPath = this._getCleanedPath(currentPath);
            pathTokens = [...cleanedPath, title];
        } else if (reference.startsWith('/')) {
            // Absolute: parse path and normalize
            const pathString = reference.substring(1);
            pathTokens = pathString.split('/').map(s => s.trim());
        } else {
            // Fallback: parse path and normalize
            pathTokens = reference.split('/').map(s => s.trim());
        }

        // Build ON object and get external ID
        return ExternalIdBuilder.buildExternalId({
            drg: 'iDL',
            path: pathTokens.slice(0, -1), // Path without title
            title: pathTokens[pathTokens.length - 1] // Last segment as title
        }, 'on');
    }

    /**
     * Normalize OR reference to external ID
     * @param {string} reference - './Title' or '/Absolute/Path/Title'
     * @param {Array<string>} currentPath - Current OR's path
     * @returns {string} External ID with or: prefix
     * @private
     */
    _normalizeORReference(reference, currentPath) {
        let pathTokens;

        if (reference.startsWith('./')) {
            // Relative: same organizational path as current OR
            const title = reference.substring(2);
            const cleanedPath = this._getCleanedPath(currentPath);
            pathTokens = [...cleanedPath, title];
        } else if (reference.startsWith('/')) {
            // Absolute: parse path and normalize
            const pathString = reference.substring(1);
            pathTokens = pathString.split('/').map(s => s.trim());
        } else {
            // Fallback: parse path and normalize
            pathTokens = reference.split('/').map(s => s.trim());
        }

        // Build OR object and get external ID
        return ExternalIdBuilder.buildExternalId({
            drg: 'iDL',
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
            documents: cleanArray(Array.from(context.documentMap.values())),
            stakeholderCategories: cleanArray(Array.from(context.stakeholderCategoryMap.values())),
            dataCategories: cleanArray(Array.from(context.dataCategoryMap.values())),
            services: cleanArray(Array.from(context.serviceMap.values())),
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

export default iDL_Mapper;