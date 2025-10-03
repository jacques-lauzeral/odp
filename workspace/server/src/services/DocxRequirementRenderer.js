// workspace/server/src/services/DocxRequirementRenderer.js
import { Table, TableRow, TableCell, Paragraph, TextRun, WidthType } from 'docx';

class DocxRequirementRenderer {
    /**
     * Render an ON as a form table
     */
    renderON(on, level) {
        const rows = [];

        // ID row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "ID", bold: true })]
                        })],
                        width: { size: 30, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: on.itemId ? String(on.itemId) : "" })],
                        width: { size: 70, type: WidthType.PERCENTAGE }
                    })
                ]
            })
        );

        // Title row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Title", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: on.title || "" })]
                    })
                ]
            })
        );

        // Statement row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Statement", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: on.statement || "" })]
                    })
                ]
            })
        );

        // Rationale row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Rationale", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: on.rationale || "" })]
                    })
                ]
            })
        );

        // References row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "References", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: on.references || "" })]
                    })
                ]
            })
        );

        // Flows row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Flows", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: on.flows || "" })]
                    })
                ]
            })
        );

        return [
            new Table({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE }
            }),
            // Add spacing after table
            new Paragraph({ text: "", spacing: { after: 400 } })
        ];
    }

    /**
     * Render an OR as a form table
     */
    renderOR(or, level) {
        const rows = [];

        // ID row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "ID", bold: true })]
                        })],
                        width: { size: 30, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: or.itemId ? String(or.itemId) : "" })],
                        width: { size: 70, type: WidthType.PERCENTAGE }
                    })
                ]
            })
        );

        // Title row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Title", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: or.title || "" })]
                    })
                ]
            })
        );

        // Statement row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Statement", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: or.statement || "" })]
                    })
                ]
            })
        );

        // Rationale row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Rationale", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: or.rationale || "" })]
                    })
                ]
            })
        );

        // References row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "References", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: or.references || "" })]
                    })
                ]
            })
        );

        // Flows row
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Flows", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: or.flows || "" })]
                    })
                ]
            })
        );

        // Implements ONs row
        const onTitles = (or.implementedONs && or.implementedONs.length > 0) ? or.implementedONs.map(on => on.title).join(", ") : "";
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: "Implements ONs", bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: onTitles })]
                    })
                ]
            })
        );

        // Impact rows
        this._addImpactRow(rows, "Impacts Stakeholders", or.impactsStakeholderCategories);
        this._addImpactRow(rows, "Impacts Data", or.impactsData);
        this._addImpactRow(rows, "Impacts Services", or.impactsServices);

        return [
            new Table({
                rows: rows,
                width: { size: 100, type: WidthType.PERCENTAGE }
            }),
            // Add spacing after table
            new Paragraph({ text: "", spacing: { after: 400 } })
        ];
    }

    /**
     * Helper to add impact rows if data exists
     */
    _addImpactRow(rows, label, impacts) {
        const names = (impacts && impacts.length > 0) ? impacts.map(i => i.title || i.name).join(", ") : "";
        rows.push(
            new TableRow({
                children: [
                    new TableCell({
                        children: [new Paragraph({
                            children: [new TextRun({ text: label, bold: true })]
                        })]
                    }),
                    new TableCell({
                        children: [new Paragraph({ text: names })]
                    })
                ]
            })
        );
    }
}

export default DocxRequirementRenderer;