// workspace/server/src/services/DocxGenerator.js
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { getDraftingGroupDisplay } from '../../../shared/src/index.js';
import DocxRequirementRenderer from './DocxRequirementRenderer.js';
import { DOCUMENT_STYLES, SPACING } from './DocxStyles.js';

class DocxGenerator {
    constructor() {
        this.sectionCounter = {};
        this.renderer = new DocxRequirementRenderer();
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
     * Create numbered heading
     */
    _createNumberedHeading(title, level) {
        const num = this._getNextSectionNumber(level);
        return this._createParagraph(`${num}. ${title}`, level);
    }

    /**
     * Generate a Word document from requirements
     */
    async generate(requirements, metadata) {
        this.sectionCounter = {};
        const hierarchy = this._buildHierarchy(requirements);

        const doc = new Document({
            creator: metadata.userId || 'ODP System',
            title: `Requirements Export - ${metadata.drg}`,
            description: `Operational requirements for DRG: ${metadata.drg}`,
            styles: DOCUMENT_STYLES,
            sections: [{
                properties: {},
                children: this._buildDocumentContent(hierarchy, metadata)
            }]
        });

        return await Packer.toBuffer(doc);
    }

    /**
     * Build the complete document content
     */
    _buildDocumentContent(hierarchy, metadata) {
        const children = [];

        // Title
        children.push(
            this._createParagraph(
                `${getDraftingGroupDisplay(metadata.drg)} Operational Needs and Requirements`,
                null,
                'title'
            )
        );

        // Process path sections
        if (hierarchy.pathSections.size > 0) {
            hierarchy.pathSections.forEach((section, pathKey) => {
                children.push(...this._renderPathSection(section, hierarchy, 1));
            });
        }

        // Root ONs
        if (hierarchy.rootONs.length > 0) {
            children.push(this._createNumberedHeading('Operational Needs', 1));
            hierarchy.rootONs.forEach(on => {
                children.push(...this._renderON(on, hierarchy, 2));
            });
        }

        // Root ORs
        if (hierarchy.rootORs.length > 0) {
            children.push(this._createNumberedHeading('Operational Requirements', 1));
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

        paragraphs.push(this._createNumberedHeading(sectionTitle, level));

        // ONs
        if (section.ons.length > 0) {
            paragraphs.push(this._createNumberedHeading('Operational Needs', level + 1));
            section.ons.forEach(on => {
                paragraphs.push(...this._renderON(on, hierarchy, level + 2));
            });
        }

        // ORs
        if (section.ors.length > 0) {
            paragraphs.push(this._createNumberedHeading('Operational Requirements', level + 1));
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

        elements.push(this._createNumberedHeading(on.title, level));
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

        elements.push(this._createNumberedHeading(or.title, level));
        elements.push(...this.renderer.renderOR(or, level));

        // Child ORs
        const children = hierarchy.orChildren.get(or.itemId) || [];
        children.forEach(childOr => {
            elements.push(...this._renderOR(childOr, hierarchy, level + 1));
        });

        return elements;
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
        const ons = requirements.filter(r => r.type === 'ON');
        const ors = requirements.filter(r => r.type === 'OR');

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

        const rootONs = ons.filter(on => !on.refinesParents || on.refinesParents.length === 0);
        const rootORs = ors.filter(or => !or.refinesParents || or.refinesParents.length === 0);
        const pathSections = this._buildPathSections(requirements);

        return {
            pathSections,
            rootONs,
            rootORs,
            onChildren,
            orChildren
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

    /**
     * Get spacing for heading level
     */
    _getSpacingForLevel(level) {
        const spacingMap = [
            SPACING.heading1,
            SPACING.heading2,
            SPACING.heading3,
            SPACING.heading4,
            SPACING.heading5,
            SPACING.heading6
        ];
        return spacingMap[Math.min(level - 1, 5)];
    }
}

export default DocxGenerator;