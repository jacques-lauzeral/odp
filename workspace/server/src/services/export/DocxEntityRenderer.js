// workspace/server/src/services/DocxEntityRenderer.js
import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, convertInchesToTwip } from 'docx';
import { TABLE_CELL_MARGINS, TABLE_LABEL_STYLE, TABLE_VALUE_STYLE, SPACING } from './DocxStyles.js';
import DeltaToDocxConverter from './DeltaToDocxConverter.js';

class DocxEntityRenderer {
    constructor() {
        this.deltaConverter = new DeltaToDocxConverter();
    }

    /**
     * Get all unique numbering instances used by the delta converter
     * @returns {Set} - Set of numbering instance IDs
     */
    getUsedNumberingInstances() {
        return this.deltaConverter.getUsedNumberingInstances();
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
     * Create a row for an entity reference array as bullet list
     * Format: • CODE [Title]
     */
    _createEntityReferencesRow(label, references) {
        const margins = this._getCellMargins();

        // Create bullet paragraphs for each reference
        const valueParagraphs = [];

        if (references && references.length > 0) {
            references.forEach(ref => {
                const text = `${ref.code} [${ref.title}]`;
                valueParagraphs.push(new Paragraph({
                    children: [new TextRun({
                        text: text,
                        ...TABLE_VALUE_STYLE
                    })],
                    bullet: { level: 0 },
                    spacing: { after: 60 }
                }));
            });
        } else {
            // Empty cell with single empty paragraph
            valueParagraphs.push(new Paragraph({ text: '' }));
        }

        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: label,
                            ...TABLE_LABEL_STYLE
                        })]
                    })],
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    margins
                }),
                new TableCell({
                    children: valueParagraphs,
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    margins
                })
            ]
        });
    }

    /**
     * Create a row for an annotated reference array as bullet list
     * Format: • Title [Note] (note optional)
     */
    _createAnnotatedReferencesRow(label, references) {
        const margins = this._getCellMargins();

        // Create bullet paragraphs for each reference
        const valueParagraphs = [];

        if (references && references.length > 0) {
            references.forEach(ref => {
                const title = ref.title || ref.name || '';
                const note = ref.note || '';
                const text = note ? `${title} [${note}]` : title;

                valueParagraphs.push(new Paragraph({
                    children: [new TextRun({
                        text: text,
                        ...TABLE_VALUE_STYLE
                    })],
                    bullet: { level: 0 },
                    spacing: { after: 60 }
                }));
            });
        } else {
            // Empty cell with single empty paragraph
            valueParagraphs.push(new Paragraph({ text: '' }));
        }

        return new TableRow({
            children: [
                new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: label,
                            ...TABLE_LABEL_STYLE
                        })]
                    })],
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    margins
                }),
                new TableCell({
                    children: valueParagraphs,
                    width: { size: 70, type: WidthType.PERCENTAGE },
                    margins
                })
            ]
        });
    }

    /**
     * Render an ON as a form table
     */
    renderON(on, level) {
        const rows = [
            this._createRow("Code", String(on.code)),
            this._createRichTextRow("Statement", on.statement),
            this._createRichTextRow("Rationale", on.rationale),
            this._createAnnotatedReferencesRow("References", on.documentReferences),
            this._createRichTextRow("Flows", on.flows),
            this._createRichTextRow("Private Notes", on.privateNotes)
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
            this._createAnnotatedReferencesRow("References", or.documentReferences),
            this._createAnnotatedReferencesRow("Impacts Stakeholders", or.impactsStakeholderCategories),
            this._createAnnotatedReferencesRow("Impacts Data", or.impactsData),
            this._createAnnotatedReferencesRow("Impacts Services", or.impactsServices),
            this._createRichTextRow("Private Notes", or.privateNotes)
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
     * Render an OC as a form table
     */
    renderOC(oc, level) {
        const rows = [
            this._createRow("Code", String(oc.code)),
            this._createRow("Title", oc.title),
            this._createRichTextRow("Purpose", oc.purpose),
            this._createEntityReferencesRow("Satisfies Requirements", oc.satisfiesRequirements),
            this._createRichTextRow("Initial State", oc.initialState),
            this._createRichTextRow("Final State", oc.finalState),
            this._createRichTextRow("Details", oc.details),
            this._createRichTextRow("Private Notes", oc.privateNotes)
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

export default DocxEntityRenderer;