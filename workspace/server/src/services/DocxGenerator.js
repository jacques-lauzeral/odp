// workspace/server/src/services/DocxGenerator.js
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { getDraftingGroupDisplay } from '../../../shared/src/index.js';
import DocxRequirementRenderer from './DocxRequirementRenderer.js';

class DocxGenerator {
    constructor() {
        this.sectionCounter = {};
        this.renderer = new DocxRequirementRenderer();
    }

    /**
     * Generate a Word document from requirements
     * @param {Array} requirements - Flat list of requirements
     * @param {Object} metadata - Document metadata (drg, exportDate, userId)
     * @returns {Promise<Buffer>} Word document as buffer
     */
    async generate(requirements, metadata) {
        // Reset counters
        this.sectionCounter = {};

        // Build hierarchical structure from requirements
        const hierarchy = this._buildHierarchy(requirements);

        const doc = new Document({
            creator: metadata.userId || 'ODP System',
            title: `Requirements Export - ${metadata.drg}`,
            description: `Operational requirements for DRG: ${metadata.drg}`,
            styles: {
                default: {
                    document: {
                        run: {
                            font: "Aptos Body",
                            size: 22,  // 11pt = 22 half-points
                            color: "000000"
                        }
                    }
                },
                paragraphStyles: [
                    {
                        id: "Heading1",
                        name: "Heading 1",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos Display",
                            size: 40,  // 20pt = 40 half-points
                            color: "2C5A91"  // Grey-blue
                        }
                    },
                    {
                        id: "Heading2",
                        name: "Heading 2",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos Display",
                            size: 32,  // 16pt = 32 half-points
                            color: "2C5A91"  // Grey-blue
                        }
                    },
                    {
                        id: "Heading3",
                        name: "Heading 3",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos Body",
                            size: 28,  // 14pt = 28 half-points
                            color: "2C5A91"  // Grey-blue
                        }
                    },
                    {
                        id: "Heading4",
                        name: "Heading 4",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos Body",
                            size: 22,  // 11pt = 22 half-points
                            italics: true,
                            color: "2C5A91"  // Grey-blue
                        }
                    },
                    {
                        id: "Heading5",
                        name: "Heading 5",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos Body",
                            size: 22,  // 11pt = 22 half-points
                            color: "2C5A91"  // Grey-blue
                        }
                    },
                    {
                        id: "Heading6",
                        name: "Heading 6",
                        basedOn: "Normal",
                        next: "Normal",
                        quickFormat: true,
                        run: {
                            font: "Aptos Body",
                            size: 22,  // 11pt = 22 half-points
                            italics: true,
                            color: "808080"  // Grey
                        }
                    }
                ]
            },
            sections: [{
                properties: {},
                children: this._buildDocumentContent(hierarchy, metadata)
            }]
        });

        // Convert document to buffer
        const buffer = await Packer.toBuffer(doc);
        return buffer;
    }

    /**
     * Get next section number for a given level
     */
    _getNextSectionNumber(level) {
        if (!this.sectionCounter[level]) {
            this.sectionCounter[level] = 0;
        }
        this.sectionCounter[level]++;

        // Reset deeper levels
        for (let i = level + 1; i <= 6; i++) {
            this.sectionCounter[i] = 0;
        }

        // Build number string
        const parts = [];
        for (let i = 1; i <= level; i++) {
            parts.push(this.sectionCounter[i] || 1);
        }
        return parts.join('.');
    }

    /**
     * Build hierarchical structure from flat requirement list
     */
    _buildHierarchy(requirements) {
        // Separate ONs and ORs
        const ons = requirements.filter(r => r.type === 'ON');
        const ors = requirements.filter(r => r.type === 'OR');

        // Build parent-child relationships for ONs
        const onChildren = new Map();
        ons.forEach(on => {
            if (on.refinesParents && on.refinesParents.length > 0) {
                const parentId = on.refinesParents[0].id;
                if (!onChildren.has(parentId)) {
                    onChildren.set(parentId, []);
                }
                onChildren.get(parentId).push(on);
            }
        });

        // Build parent-child relationships for ORs
        const orChildren = new Map();
        ors.forEach(or => {
            if (or.refinesParents && or.refinesParents.length > 0) {
                const parentId = or.refinesParents[0].id;
                if (!orChildren.has(parentId)) {
                    orChildren.set(parentId, []);
                }
                orChildren.get(parentId).push(or);
            }
        });

        // Find root requirements
        const rootONs = ons.filter(on => !on.refinesParents || on.refinesParents.length === 0);
        const rootORs = ors.filter(or => !or.refinesParents || or.refinesParents.length === 0);

        // Build path-based structure
        const pathSections = this._buildPathSections(requirements);

        return {
            pathSections: pathSections,
            rootONs: rootONs,
            rootORs: rootORs,
            onChildren: onChildren,
            orChildren: orChildren
        };
    }

    /**
     * Build sections based on paths
     */
    _buildPathSections(requirements) {
        const sections = new Map();

        requirements.forEach(req => {
            if (req.path && req.path.length > 0) {
                const pathKey = req.path.join('/');
                if (!sections.has(pathKey)) {
                    sections.set(pathKey, {
                        path: req.path,
                        ons: [],
                        ors: []
                    });
                }

                if (req.type === 'ON') {
                    sections.get(pathKey).ons.push(req);
                } else {
                    sections.get(pathKey).ors.push(req);
                }
            }
        });

        return sections;
    }

    /**
     * Build the complete document content
     */
    _buildDocumentContent(hierarchy, metadata) {
        const children = [];

        // Title
        children.push(
            new Paragraph({
                text: `${getDraftingGroupDisplay(metadata.drg)} Operational Needs and Requirements`,
                heading: HeadingLevel.TITLE
            })
        );

        // Process path sections
        if (hierarchy.pathSections.size > 0) {
            hierarchy.pathSections.forEach((section, pathKey) => {
                children.push(...this._renderPathSection(section, hierarchy, 1));
            });
        }

        // Root ONs
        if (hierarchy.rootONs.length > 0) {
            const num = this._getNextSectionNumber(1);
            children.push(
                new Paragraph({
                    text: `${num}. Operational Needs`,
                    heading: HeadingLevel.HEADING_1
                })
            );

            hierarchy.rootONs.forEach(on => {
                children.push(...this._renderON(on, hierarchy, 2));
            });
        }

        // Root ORs
        if (hierarchy.rootORs.length > 0) {
            const num = this._getNextSectionNumber(1);
            children.push(
                new Paragraph({
                    text: `${num}. Operational Requirements`,
                    heading: HeadingLevel.HEADING_1
                })
            );

            hierarchy.rootORs.forEach(or => {
                children.push(...this._renderOR(or, hierarchy, 2));
            });
        }

        return children;
    }

    /**
     * Render a path-based section
     */
    _renderPathSection(section, hierarchy, level) {
        const paragraphs = [];

        const sectionTitle = section.path[section.path.length - 1] || 'Section';
        const num = this._getNextSectionNumber(level);

        paragraphs.push(
            new Paragraph({
                text: `${num}. ${sectionTitle}`,
                heading: this._getHeadingLevel(level)
            })
        );

        // ONs
        if (section.ons.length > 0) {
            const onNum = this._getNextSectionNumber(level + 1);
            paragraphs.push(
                new Paragraph({
                    text: `${onNum}. Operational Needs`,
                    heading: this._getHeadingLevel(level + 1)
                })
            );

            section.ons.forEach(on => {
                paragraphs.push(...this._renderON(on, hierarchy, level + 2));
            });
        }

        // ORs
        if (section.ors.length > 0) {
            const orNum = this._getNextSectionNumber(level + 1);
            paragraphs.push(
                new Paragraph({
                    text: `${orNum}. Operational Requirements`,
                    heading: this._getHeadingLevel(level + 1)
                })
            );

            section.ors.forEach(or => {
                paragraphs.push(...this._renderOR(or, hierarchy, level + 2));
            });
        }

        return paragraphs;
    }

    /**
     * Render an ON with its children
     */
    _renderON(on, hierarchy, level) {
        const elements = [];

        const num = this._getNextSectionNumber(level);
        elements.push(
            new Paragraph({
                text: `${num}. ${on.title}`,
                heading: this._getHeadingLevel(level)
            })
        );

        // Use renderer to create the form table
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

        const num = this._getNextSectionNumber(level);
        elements.push(
            new Paragraph({
                text: `${num}. ${or.title}`,
                heading: this._getHeadingLevel(level)
            })
        );

        // Use renderer to create the form table
        elements.push(...this.renderer.renderOR(or, level));

        // Child ORs
        const children = hierarchy.orChildren.get(or.itemId) || [];
        children.forEach(childOr => {
            elements.push(...this._renderOR(childOr, hierarchy, level + 1));
        });

        return elements;
    }


    /**
     * Get appropriate heading level
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
}

export default DocxGenerator;