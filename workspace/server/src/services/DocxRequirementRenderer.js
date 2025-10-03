// workspace/server/src/services/DocxRequirementRenderer.js
import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, convertInchesToTwip } from 'docx';
import { TABLE_CELL_MARGINS, TABLE_LABEL_STYLE, TABLE_VALUE_STYLE, SPACING } from './DocxStyles.js';

class DocxRequirementRenderer {
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
     * Create a row for an entity reference array
     */
    _createReferenceRow(label, references) {
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
            this._createRow("ID", String(on.itemId)),
            this._createRow("Statement", on.statement),
            this._createRow("Rationale", on.rationale),
            this._createRow("References", on.references),
            this._createRow("Flows", on.flows)
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
            this._createRow("ID", String(or.itemId)),
            this._createRow("Statement", or.statement),
            this._createRow("Rationale", or.rationale),
            this._createRow("References", or.references),
            this._createRow("Flows", or.flows),
            this._createReferenceRow("Implements", or.implementedONs),
            this._createReferenceRow("Impacts Stakeholders", or.impactsStakeholderCategories),
            this._createReferenceRow("Impacts Data", or.impactsData),
            this._createReferenceRow("Impacts Services", or.impactsServices)
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