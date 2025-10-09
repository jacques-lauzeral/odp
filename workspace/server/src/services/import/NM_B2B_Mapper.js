import Mapper from './Mapper.js';

/**
 * Mapper for NM B2B Word documents
 * Transforms hierarchical section structure into ODP entities
 */
class NM_B2B_Mapper extends Mapper {
    /**
     * Map raw extracted Word document data to structured import format
     * @param {Object} rawData - RawExtractedData from DocxExtractor
     * @returns {Object} StructuredImportData with all entity collections
     */
    map(rawData) {
        const context = this._initContext();

        // Add reference documents
        this._addReferenceDocuments(context);

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
            externalId: "NM_B2B_CONOPS",
            title: "NM B2B ConOPS",
            description: "NM B2B Concept of Operations",
            version: "2.1",
            url: "https://www.eurocontrol.int/publication/network-manager-b2b-concept-operations"
        };
        context.documentMap.set(conopsDocument.externalId, conopsDocument);

        const cirDocument = {
            externalId: "CIR-2021/116",
            title: "Commission Implementing Regulation (EU) 2021/116",
            url: "https://eur-lex.europa.eu/legal-content/en/TXT/?uri=CELEX%3A32021R0116"
        };
        context.documentMap.set(cirDocument.externalId, cirDocument);
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
            const externalId = this._buildExternalId(subsection.path, type);

            const req = {
                externalId: externalId,
                title: subsection.title,
                type: type, // 'ON' or 'OR'
                drg: 'NM_B2B',
                refines: parentReq?.externalId || null,
                path: parentReq ? null : this._getParentPath(subsection),
                ...this._extractRequirementDetails(subsection, type, context)
            };

            // Add implicit ConOPS document reference for ONs if not explicitly provided
            if (type === 'ON' && (!req.documentReferences || req.documentReferences.length === 0)) {
                req.documentReferences = [{
                    documentExternalId: "NM_B2B_CONOPS",
                    note: `Section: \'${this._getOrganizationalPathString(subsection.path)}\'`
                }];
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
     * Build external ID from path, removing common prefixes and section markers
     * Normalize: lowercase, trim tokens, replace spaces with underscores
     * Add type prefix (on: or or:)
     * @param {Array<string>} path - Full path array
     * @param {string} type - 'ON' or 'OR'
     * @returns {string} External ID with type prefix
     * @private
     */
    _buildExternalId(path, type) {
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

        // Normalize each token: lowercase, trim, replace spaces with underscores
        const normalizedTokens = cleanPath.map(token =>
            token.trim().toLowerCase().replace(/\s+/g, '_')
        );

        const basePath = normalizedTokens.join('/');
        const prefix = type === 'ON' ? 'on:' : 'or:';

        return `${prefix}${basePath}`;
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
     * Extract requirement details from subsection paragraphs
     * @private
     */
    _extractRequirementDetails(subsection, type, context) {
        const paragraphs = subsection.content?.paragraphs || [];
        let statement = '';
        let rationale = '';
        let flows = '';
        let implementedONs = [];
        let documentReferences = [];
        let currentSection = null;

        for (const p of paragraphs) {
            const text = (typeof p === 'string' ? p : p.text)?.trim() || '';

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
            } else if (text.startsWith('Implemented ONs:')) {
                currentSection = 'implementedONs';
            } else if (text.startsWith('References:') || text.startsWith('Reference:')) {
                currentSection = 'references';
            } else if (currentSection === 'statement' && text && !text.endsWith(':')) {
                statement += '\n\n' + text;
            } else if (currentSection === 'rationale' && text && !text.endsWith(':')) {
                rationale += '\n\n' + text;
            } else if (currentSection === 'flows' && text && !text.endsWith(':')) {
                flows += '\n\n' + text;
            } else if (currentSection === 'implementedONs' && text.startsWith('- ')) {
                const reference = text.substring(2).trim();
                const normalizedId = this._normalizeONReference(reference, subsection.path);
                if (normalizedId) {
                    implementedONs.push(normalizedId);
                }
            } else if (currentSection === 'references' && text.startsWith('- ')) {
                const reference = this._parseDocumentReference(text.substring(2).trim());
                if (reference) {
                    documentReferences.push(reference);
                }
            }
        }

        const result = {
            statement: statement || null,
            rationale: rationale || null,
            flows: flows || null,
            implementedONs: type === 'OR' ? implementedONs : []
        };

        // Add documentReferences only if explicitly found
        if (documentReferences.length > 0) {
            result.documentReferences = documentReferences;
        }

        return result;
    }

    /**
     * Parse document reference from text
     * Format: "DOC_ID" or "DOC_ID: note text"
     * @private
     */
    _parseDocumentReference(text) {
        const colonIndex = text.indexOf(':');
        if (colonIndex > 0) {
            return {
                documentExternalId: text.substring(0, colonIndex).trim(),
                note: text.substring(colonIndex + 1).trim()
            };
        }
        return {
            documentExternalId: text.trim()
        };
    }

    /**
     * Normalize ON reference to external ID with on: prefix
     * @param {string} reference - './Title' or '/Absolute/Path/Title'
     * @param {Array<string>} currentPath - Current OR's path (includes up to 'ORs' parent)
     * @returns {string} External ID with on: prefix
     * @private
     */
    _normalizeONReference(reference, currentPath) {
        if (reference.startsWith('./')) {
            // Relative: same organizational path as current OR
            const title = reference.substring(2);
            const orgPath = this._getOrganizationalPath(currentPath);
            return this._buildExternalId([...orgPath, title], 'ON');
        } else if (reference.startsWith('/')) {
            // Absolute: parse path and normalize
            const pathString = reference.substring(1);
            const pathTokens = pathString.split('/');
            return this._buildExternalId(pathTokens, 'ON');
        }
        // Fallback: treat as single token
        return this._buildExternalId([reference], 'ON');
    }

    /**
     * Build final output from context maps
     * @private
     */
    _buildOutput(context) {
        // Validate references
        this._validateImplementedONs(context);
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
        console.log(`Mapped entities - ONs: ${context.onMap.size}, ORs: ${context.orMap.size}, OCs: ${context.changeMap.size}`);

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

export default NM_B2B_Mapper;