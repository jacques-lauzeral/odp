// workspace/server/src/services/DocxRequirementRenderer.js
import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, convertInchesToTwip } from 'docx';
import { TABLE_CELL_MARGINS, TABLE_LABEL_STYLE, TABLE_VALUE_STYLE, SPACING } from './DocxStyles.js';
import DeltaToDocxConverter from './DeltaToDocxConverter.js';

class DocxRequirementRenderer {
    constructor() {
        this.deltaConverter = new DeltaToDocxConverter();
    }

    /**
     * Create table cell margins
     */
    _getCellMargins() {
        return {
            top: convertInchesToTwip(TABLE_CELL_MARGINS.top),
            bottom: convertInchesToTwip(TABLE_CELL_MARGINS.bottom),
            left: convertInchesToTwip(TABLE_CELL_MARGINS.left),
            right: convertInchesToTwip(TABLE_CELL_MARGINS.right)
        };
    }

    /**
     * Create a table row with label and value
     * @param {string} label - Row label
     * @param {string} value - Plain text value
     * @param {number} labelWidth - Label column width percentage
     */
    _createRow(label, value, labelWidth = 30) {
        const margins = this._getCellMargins();

        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: label,
                            ...TABLE_LABEL_STYLE
                        })]
                    })],
                    width: { size: labelWidth, type: WidthType.PERCENTAGE },
                    margins
                }),
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: value || "",
                            ...TABLE_VALUE_STYLE
                        })]
                    })],
                    width: { size: 100 - labelWidth, type: WidthType.PERCENTAGE },
                    margins
                })
            ]
        });
    }

    /**
     * Create a table row with label and rich text value (Delta format)
     * @param {string} label - Row label
     * @param {string} deltaJson - Quill Delta JSON string
     * @param {number} labelWidth - Label column width percentage
     */
    _createRichTextRow(label, deltaJson, labelWidth = 30) {
        const margins = this._getCellMargins();

        // Convert Delta to Paragraphs
        const valueParagraphs = this.deltaConverter.convertDeltaToParagraphs(deltaJson);

        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: label,
                            ...TABLE_LABEL_STYLE
                        })]
                    })],
                    width: { size: labelWidth, type: WidthType.PERCENTAGE },
                    margins
                }),
                new TableCell({
                    children: valueParagraphs,
                    width: { size: 100 - labelWidth, type: WidthType.PERCENTAGE },
                    margins
                })
            ]
        });
    }

    /**
     * Create a row for an entity reference array
     */
    _createEntityReferencesRow(label, references) {
        const value = (references && references.length > 0)
            ? references.map(ref => `${ref.code} [${ref.title}]`).join(", ")
            : "";
        return this._createRow(label, value);
    }

    /**
     * Create a row for an element reference array
     */
    _createElementReferenceRow(label, references) {
        const value = (references && references.length > 0)
            ? references.map(ref => ref.title || ref.name || "").join(", ")
            : "";
        return this._createRow(label, value);
    }

    /**
     * Render an ON as a form table
     */
    renderON(on, level) {
        const rows = [
            this._createRow("Code", String(on.code)),
            this._createRichTextRow("Statement", on.statement),
            this._createRichTextRow("Rationale", on.rationale),
            this._createRow("References", on.references),
            this._createRichTextRow("Flows", on.flows)
        ];

        return [
            new Table({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE }
            }),
            new Paragraph({
                text: "",
                spacing: SPACING.afterTable
            })
        ];
    }

    /**
     * Render an OR as a form table
     */
    renderOR(or, level) {
        const rows = [
            this._createRow("Code", String(or.code)),
            this._createRichTextRow("Statement", or.statement),
            this._createRichTextRow("Rationale", or.rationale),
            this._createRichTextRow("Flows", or.flows),
            this._createEntityReferencesRow("Implements", or.implementedONs),
            this._createElementReferenceRow("References", or.documentReferences),
            this._createElementReferenceRow("Impacts Stakeholders", or.impactsStakeholderCategories),
            this._createElementReferenceRow("Impacts Data", or.impactsData),
            this._createElementReferenceRow("Impacts Services", or.impactsServices)
        ];

        return [
            new Table({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE }
            }),
            new Paragraph({
                text: "",
                spacing: SPACING.afterTable
            })
        ];
    }
}

export default DocxRequirementRenderer;