// workspace/server/src/services/DocxGenerator.js
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType, LevelFormat, Footer, PageNumber, TextRun } from 'docx';
import { getDraftingGroupDisplay } from '../../../../shared/src/index.js';
import DocxEntityRenderer from './DocxEntityRenderer.js';
import { DOCUMENT_STYLES, SPACING } from './DocxStyles.js';

class DocxGenerator {
    constructor() {
        this.renderer = new DocxEntityRenderer();
    }

    /**
     * Factory method for creating paragraphs
     */
    _createParagraph(text, level = null, type = 'heading') {
        if (type === 'title') {
            return new Paragraph({
                text,
                heading: HeadingLevel.TITLE,
                spacing: SPACING.title
            });
        }

        if (level === null) {
            return new Paragraph({ text });
        }

        return new Paragraph({
            text,
            heading: this._getHeadingLevel(level),
            spacing: this._getSpacingForLevel(level)
        });
    }

    /**
     * Create numbered heading using Word's outline numbering
     * Supports levels 1-9: levels 1-6 use native heading styles, 7-9 use custom styles
     * Note: Numbering is now defined in the style itself (via DOCUMENT_STYLES) for levels 1-6
     *       For levels 7-9, numbering must be applied explicitly since custom styles don't inherit it automatically
     */
    _createNumberedHeading(title, level) {
        // For levels 1-6, use native heading styles (numbering comes from style definition)
        if (level <= 6) {
            return new Paragraph({
                text: title,
                heading: this._getHeadingLevel(level),
                spacing: this._getSpacingForLevel(level)
            });
        }

        // For levels 7-9, use custom style names and apply numbering explicitly
        const styleName = `Heading${level}`;
        return new Paragraph({
            text: title,
            style: styleName,
            numbering: {
                reference: 'outline-numbering',
                level: level - 1  // Word levels are 0-indexed
            }
        });
    }

    /**
     * Build numbering configuration for lists
     * @param {Set} usedInstances - Set of numbering instance IDs used in content
     */
    _buildNumberingConfig(usedInstances = new Set()) {
        const config = [
            // Outline numbering for section headings (multilevel) - supports 9 levels
            {
                reference: 'outline-numbering',
                levels: [
                    {
                        level: 0,
                        format: LevelFormat.DECIMAL,
                        text: '%1.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 1,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 2,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 3,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.%4.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 4,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.%4.%5.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 5,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.%4.%5.%6.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 6,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.%4.%5.%6.%7.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 7,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.%4.%5.%6.%7.%8.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    },
                    {
                        level: 8,
                        format: LevelFormat.DECIMAL,
                        text: '%1.%2.%3.%4.%5.%6.%7.%8.%9.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 0, hanging: 0 }
                            }
                        }
                    }
                ]
            },
            // Bullet lists for content (shared across all bullet lists)
            {
                reference: 'default-bullet',
                levels: [
                    {
                        level: 0,
                        format: LevelFormat.BULLET,
                        text: '•',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 720, hanging: 360 }
                            }
                        }
                    },
                    {
                        level: 1,
                        format: LevelFormat.BULLET,
                        text: '◦',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 1440, hanging: 360 }
                            }
                        }
                    },
                    {
                        level: 2,
                        format: LevelFormat.BULLET,
                        text: '▪',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 2160, hanging: 360 }
                            }
                        }
                    },
                    {
                        level: 3,
                        format: LevelFormat.BULLET,
                        text: '▪',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 2880, hanging: 360 }
                            }
                        }
                    }
                ]
            }
        ];

        // Add dynamic numbering configs for each used ordered list instance
        usedInstances.forEach(instanceId => {
            config.push({
                reference: `ordered-list-${instanceId}`,
                levels: [
                    {
                        level: 0,
                        format: LevelFormat.DECIMAL,
                        text: '%1.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 720, hanging: 360 }
                            }
                        }
                    },
                    {
                        level: 1,
                        format: LevelFormat.LOWER_LETTER,
                        text: '%2.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 1440, hanging: 360 }
                            }
                        }
                    },
                    {
                        level: 2,
                        format: LevelFormat.LOWER_ROMAN,
                        text: '%3.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 2160, hanging: 360 }
                            }
                        }
                    },
                    {
                        level: 3,
                        format: LevelFormat.DECIMAL,
                        text: '%4.',
                        alignment: AlignmentType.START,
                        style: {
                            paragraph: {
                                indent: { left: 2880, hanging: 360 }
                            }
                        }
                    }
                ]
            });
        });

        return { config };
    }

    /**
     * Generate a Word document from requirements and changes
     * @param {Array} requirements - Array of ONs and ORs
     * @param {Array} changes - Array of OCs
     * @param {Object} metadata - Document metadata
     * @returns {Buffer} - Word document buffer
     */
    async generate(requirements, changes, metadata) {

        // Build hierarchy from separate requirements and changes arrays
        const hierarchy = this._buildHierarchy(requirements, changes);

        // Build document content first (this processes delta and assigns numbering instances)
        const content = this._buildDocumentContent(hierarchy, metadata);

        // Collect used numbering instances from renderer
        const usedInstances = this.renderer.getUsedNumberingInstances();

        // Build numbering config with dynamic instances
        const numberingConfig = this._buildNumberingConfig(usedInstances);

        // Build title suffix for folder filter
        const folderSuffix = metadata.folder ? ` / ${metadata.folder}` : '';

        const doc = new Document({
            creator: metadata.userId || 'ODP System',
            title: `Requirements Export - ${metadata.drg}${folderSuffix}`,
            description: `Operational requirements for DRG: ${metadata.drg}${metadata.folder ? `, folder: ${metadata.folder}` : ''}`,
            styles: {
                default: {
                    ...DOCUMENT_STYLES.default,
                    document: {
                        run: {
                            font: "Aptos",
                            size: 22,  // 11pt
                            language: {
                                value: "en-GB"
                            }
                        }
                    }
                },
                paragraphStyles: [
                    {
                        id: "Heading7",
                        name: "Heading 7",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos",
                            size: 22,  // 11pt
                            bold: true
                        },
                        paragraph: {
                            spacing: {
                                before: 120,
                                after: 200
                            },
                            numbering: {
                                reference: 'outline-numbering',
                                level: 6
                            }
                        }
                    },
                    {
                        id: "Heading8",
                        name: "Heading 8",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos",
                            size: 22,  // 11pt
                            bold: true
                        },
                        paragraph: {
                            spacing: {
                                before: 120,
                                after: 200
                            },
                            numbering: {
                                reference: 'outline-numbering',
                                level: 7
                            }
                        }
                    },
                    {
                        id: "Heading9",
                        name: "Heading 9",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos",
                            size: 22,  // 11pt
                            bold: true
                        },
                        paragraph: {
                            spacing: {
                                before: 120,
                                after: 200
                            },
                            numbering: {
                                reference: 'outline-numbering',
                                level: 8
                            }
                        }
                    }
                ]
            },
            numbering: numberingConfig,
            sections: [{
                properties: {},
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [
                                    new TextRun({
                                        children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES]
                                    })
                                ]
                            })
                        ]
                    })
                },
                children: content
            }]
        });

        return await Packer.toBuffer(doc);
    }

    /**
     * Build the complete document content
     */
    _buildDocumentContent(hierarchy, metadata) {
        const children = [];

        // Title - include folder if specified
        const folderSuffix = metadata.folder ? ` / ${metadata.folder}` : '';
        children.push(
            this._createParagraph(
                `${getDraftingGroupDisplay(metadata.drg)}${folderSuffix} Operational Needs, Requirements and Changes`,
                null,
                'title'
            )
        );

        // Section 1: Operational Needs and Requirements
        children.push(this._createNumberedHeading('Operational Needs and Requirements', 1));

        // Process path tree (organizational structure)
        if (hierarchy.pathSections.size > 0) {
            hierarchy.pathSections.forEach((node, nodeName) => {
                children.push(...this._renderPathNode(node, hierarchy, 2));
            });
        }

        // Root ONs (no path AND no parent) - directly under main section, ONs first
        hierarchy.rootONs.forEach(on => {
            children.push(...this._renderON(on, hierarchy, 2));
        });

        // Root ORs (no path AND no parent) - directly under main section, ORs second
        hierarchy.rootORs.forEach(or => {
            children.push(...this._renderOR(or, hierarchy, 2));
        });

        // Section 2: Operational Changes (separate top-level section)
        if (hierarchy.rootOCs.length > 0) {
            children.push(this._createNumberedHeading('Operational Changes', 1));
            hierarchy.rootOCs.forEach(oc => {
                children.push(...this._renderOC(oc, 2));
            });
        }

        return children;
    }

    /**
     * Render a path node recursively (organizational structure)
     * Handles nested path hierarchies with intermediate nodes
     *
     * Rendering order within each folder:
     * 1. ONs first (ordered by code), with refinement children nested
     * 2. ORs second (ordered by code), with refinement children nested
     * 3. Sub-folders last (alphabetically)
     *
     * @param {Object} node - Path node with name, children, ons, ors
     * @param {Object} hierarchy - Complete hierarchy structure
     * @param {number} level - Current heading level
     * @returns {Array} - Array of paragraphs
     */
    _renderPathNode(node, hierarchy, level) {
        const paragraphs = [];

        // Render this node's heading
        paragraphs.push(this._createNumberedHeading(node.name, level));

        // First: Render this node's ONs (if any) - directly, no intermediate heading
        node.ons.forEach(on => {
            paragraphs.push(...this._renderON(on, hierarchy, level + 1));
        });

        // Second: Render this node's ORs (if any) - directly, no intermediate heading
        node.ors.forEach(or => {
            paragraphs.push(...this._renderOR(or, hierarchy, level + 1));
        });

        // Third: Recursively render child nodes (organizational sub-sections, already sorted alphabetically)
        if (node.children.size > 0) {
            node.children.forEach((childNode, childName) => {
                paragraphs.push(...this._renderPathNode(childNode, hierarchy, level + 1));
            });
        }

        return paragraphs;
    }

    /**
     * Render an ON with its children
     */
    _renderON(on, hierarchy, level) {
        const elements = [];

        elements.push(this._createNumberedHeading(`[${on.code}] ${on.title}`, level));
        elements.push(...this.renderer.renderON(on, level));

        // Child ONs
        const children = hierarchy.onChildren.get(on.itemId) || [];
        children.forEach(childOn => {
            elements.push(...this._renderON(childOn, hierarchy, level + 1));
        });

        return elements;
    }

    /**
     * Render an OR with its children
     */
    _renderOR(or, hierarchy, level) {
        const elements = [];

        elements.push(this._createNumberedHeading(`[${or.code}] ${or.title}`, level));
        elements.push(...this.renderer.renderOR(or, level));

        // Child ORs
        const children = hierarchy.orChildren.get(or.itemId) || [];
        children.forEach(childOr => {
            elements.push(...this._renderOR(childOr, hierarchy, level + 1));
        });

        return elements;
    }

    /**
     * Render an OC (flat, no children)
     */
    _renderOC(oc, level) {
        const elements = [];

        elements.push(this._createNumberedHeading(`[${oc.code}] ${oc.title}`, level));
        elements.push(...this.renderer.renderOC(oc, level));

        return elements;
    }



    /**
     * Build hierarchical structure from requirements and changes
     * Orchestrates the complete hierarchy building process
     * @param {Array} requirements - Array of ONs and ORs
     * @param {Array} changes - Array of OCs
     */
    _buildHierarchy(requirements, changes) {
        // Create lookup map for requirement references
        const requirementsById = new Map();
        requirements.forEach(req => {
            requirementsById.set(req.itemId, req);
        });

        // Separate requirements based on path vs refinement
        const pathBasedRequirements = requirements.filter(r => r.path && r.path.length > 0);
        const refinementBasedRequirements = requirements.filter(r =>
            (!r.path || r.path.length === 0) && r.refinesParents && r.refinesParents.length > 0
        );
        const rootRequirements = requirements.filter(r =>
            (!r.path || r.path.length === 0) && (!r.refinesParents || r.refinesParents.length === 0)
        );

        // Build path sections (organizational structure)
        const pathSections = this._buildPathSections(pathBasedRequirements);

        // Build refinement hierarchy (parent-child relationships)
        const { onChildren, orChildren } = this._buildRefinementHierarchy(
            refinementBasedRequirements,
            requirementsById
        );

        // Separate and sort root ONs and ORs
        const rootONs = this._sortEntitiesByCode(
            rootRequirements.filter(r => r.type === 'ON')
        );
        const rootORs = this._sortEntitiesByCode(
            rootRequirements.filter(r => r.type === 'OR')
        );

        // Sort all OCs alphanumerically by code (flat list, no hierarchy)
        const rootOCs = this._sortEntitiesByCode([...changes]);

        return {
            pathSections,
            rootONs,
            rootORs,
            rootOCs,
            onChildren,
            orChildren
        };
    }

    /**
     * Build path sections from requirements with organizational paths
     * Creates nested tree structure from path arrays
     * @param {Array} requirements - Requirements with path attribute
     * @returns {Map} - Map of root-level path nodes (sorted alphabetically)
     */
    _buildPathSections(requirements) {
        const rootNodes = new Map();

        requirements.forEach(req => {
            if (!req.path || req.path.length === 0) return;

            // Navigate/create path in tree
            let currentLevel = rootNodes;

            req.path.forEach((pathToken, index) => {
                const isLeaf = (index === req.path.length - 1);

                // Create node if it doesn't exist
                if (!currentLevel.has(pathToken)) {
                    currentLevel.set(pathToken, {
                        name: pathToken,
                        children: new Map(),
                        ons: [],
                        ors: []
                    });
                }

                const node = currentLevel.get(pathToken);

                // If this is the leaf node, add the requirement
                if (isLeaf) {
                    if (req.type === 'ON') {
                        node.ons.push(req);
                    } else {
                        node.ors.push(req);
                    }
                }

                // Move to next level
                currentLevel = node.children;
            });
        });

        // Sort requirements within each node and sort children recursively
        this._sortPathTree(rootNodes);

        // Sort root nodes alphabetically
        const sortedRootNodes = new Map(
            Array.from(rootNodes.entries()).sort((a, b) =>
                a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
            )
        );

        return sortedRootNodes;
    }

    /**
     * Recursively sort path tree nodes and their requirements
     * @param {Map} nodes - Map of path nodes
     */
    _sortPathTree(nodes) {
        nodes.forEach((node, key) => {
            // Sort ONs and ORs within this node
            node.ons = this._sortEntitiesByCode(node.ons);
            node.ors = this._sortEntitiesByCode(node.ors);

            // Sort children alphabetically
            if (node.children.size > 0) {
                const sortedChildren = new Map(
                    Array.from(node.children.entries()).sort((a, b) =>
                        a[0].localeCompare(b[0], undefined, { sensitivity: 'base' })
                    )
                );
                node.children = sortedChildren;

                // Recursively sort children's children
                this._sortPathTree(node.children);
            }
        });
    }

    /**
     * Build refinement hierarchy (parent-child relationships)
     * Creates maps of children for each parent requirement
     * @param {Array} requirements - Requirements with refinesParents
     * @param {Map} requirementsById - Lookup map for all requirements
     * @returns {Object} - Object with onChildren and orChildren maps
     */
    _buildRefinementHierarchy(requirements, requirementsById) {
        const onChildren = new Map();
        const orChildren = new Map();

        requirements.forEach(req => {
            if (req.refinesParents && req.refinesParents.length > 0) {
                const parentRef = req.refinesParents[0];
                const parentId = parentRef.itemId || parentRef.id || parentRef;

                if (req.type === 'ON') {
                    if (!onChildren.has(parentId)) {
                        onChildren.set(parentId, []);
                    }
                    onChildren.get(parentId).push(req);
                } else if (req.type === 'OR') {
                    if (!orChildren.has(parentId)) {
                        orChildren.set(parentId, []);
                    }
                    orChildren.get(parentId).push(req);
                }
            }
        });

        // Sort children arrays by code
        onChildren.forEach((children, parentId) => {
            onChildren.set(parentId, this._sortEntitiesByCode(children));
        });

        orChildren.forEach((children, parentId) => {
            orChildren.set(parentId, this._sortEntitiesByCode(children));
        });

        return { onChildren, orChildren };
    }

    /**
     * Sort entities alphanumerically by code
     * @param {Array} entities - Array of entities with code property
     * @returns {Array} - Sorted array
     */
    _sortEntitiesByCode(entities) {
        return [...entities].sort((a, b) => this._compareAlphanumeric(a.code, b.code));
    }

    /**
     * Compare two codes alphanumerically (natural sort)
     * @param {string} a - First code
     * @param {string} b - Second code
     * @returns {number} - Comparison result
     */
    _compareAlphanumeric(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    }

    /**
     * Get appropriate heading level (for native Word heading styles only)
     * Only handles levels 1-6; levels 7+ use custom styles in _createNumberedHeading
     */
    _getHeadingLevel(level) {
        const levels = [
            HeadingLevel.HEADING_1,
            HeadingLevel.HEADING_2,
            HeadingLevel.HEADING_3,
            HeadingLevel.HEADING_4,
            HeadingLevel.HEADING_5,
            HeadingLevel.HEADING_6
        ];
        return levels[Math.min(level - 1, 5)];
    }

    /**
     * Get spacing for heading level
     * Supports levels 1-9
     */
    _getSpacingForLevel(level) {
        const spacingMap = [
            SPACING.heading1,
            SPACING.heading2,
            SPACING.heading3,
            SPACING.heading4,
            SPACING.heading5,
            SPACING.heading6,
            SPACING.heading7,
            SPACING.heading8,
            SPACING.heading9
        ];
        return spacingMap[Math.min(level - 1, 8)];
    }
}

export default DocxGenerator;