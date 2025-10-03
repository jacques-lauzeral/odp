// workspace/server/src/services/DocxStyles.js
import { HeadingLevel } from 'docx';

export const DOCUMENT_STYLES = {
    default: {
        document: {
            run: {
                font: "Aptos",
                size: 22  // 11pt
            }
        },
        heading1: {
            run: {
                font: "Aptos Display",
                size: 32,  // 16pt
                bold: true
            }
        },
        heading2: {
            run: {
                font: "Aptos Display",
                size: 26,  // 13pt
                bold: true
            }
        },
        heading3: {
            run: {
                font: "Aptos",
                size: 24,  // 12pt
                bold: true
            }
        },
        heading4: {
            run: {
                font: "Aptos",
                size: 22,  // 11pt
                bold: true,
                italics: true
            }
        },
        heading5: {
            run: {
                font: "Aptos",
                size: 22,  // 11pt
                bold: true
            }
        },
        heading6: {
            run: {
                font: "Aptos",
                size: 22,  // 11pt
                italics: true
            }
        },
        title: {
            run: {
                font: "Aptos Display",
                size: 56  // 28pt
            }
        }
    }
};

export const SPACING = {
    title: { after: 600 },
    heading1: { before: 240, after: 360 },
    heading2: { before: 120, after: 300 },
    heading3: { before: 120, after: 240 },
    heading4: { before: 120, after: 200 },
    heading5: { before: 120, after: 200 },
    heading6: { before: 120, after: 200 },
    afterTable: { after: 400 }
};

export const TABLE_CELL_MARGINS = {
    top: 0.05,     // inches
    bottom: 0.05,
    left: 0.08,
    right: 0.08
};

export const TABLE_LABEL_STYLE = {
    font: "Aptos",
    size: 22,
    bold: true
};

export const TABLE_VALUE_STYLE = {
    font: "Aptos",
    size: 22
};