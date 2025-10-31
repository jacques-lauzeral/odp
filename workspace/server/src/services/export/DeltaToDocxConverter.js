// workspace/server/src/services/DeltaToDocxConverter.js
import { Paragraph, TextRun } from 'docx';

/**
 * Converts Quill Delta JSON format to docx Paragraph arrays.
 * Supports inline formatting (bold, italic, underline) and lists (bullet/ordered).
 */
class DeltaToDocxConverter {
    /**
     * Convert Delta JSON string to array of docx Paragraphs
     * @param {string} deltaJson - Escaped JSON string containing Quill Delta
     * @returns {Paragraph[]} - Array of docx Paragraph objects
     */
    convertDeltaToParagraphs(deltaJson) {
        // Handle null/empty input
        if (!deltaJson || deltaJson.trim() === '') {
            return [new Paragraph({ text: '' })];
        }

        try {
            // Parse JSON
            const delta = JSON.parse(deltaJson);

            // Validate structure
            if (!delta.ops || !Array.isArray(delta.ops)) {
                throw new Error('Invalid Delta format: missing or invalid ops array');
            }

            // Split ops into paragraph segments (two-pass approach)
            const paragraphSegments = this._segmentIntoParagraphs(delta.ops);

            // Convert each segment to a Paragraph
            const paragraphs = paragraphSegments.map(segment => this._createParagraph(segment));

            // Insert blank line separators between paragraphs for better visibility
            return this._insertBlankLineSeparators(paragraphs);

        } catch (error) {
            // Fallback: return error message as plain text
            return [new Paragraph({
                children: [new TextRun({
                    text: `[Error parsing rich text: ${error.message}]`,
                    italics: true,
                    color: '999999'
                })]
            })];
        }
    }

    /**
     * Insert blank line separators between paragraphs
     * @param {Paragraph[]} paragraphs - Array of content paragraphs
     * @returns {Paragraph[]} - Array with blank lines inserted between content
     */
    _insertBlankLineSeparators(paragraphs) {
        if (paragraphs.length <= 1) {
            return paragraphs;
        }

        const result = [];
        for (let i = 0; i < paragraphs.length; i++) {
            result.push(paragraphs[i]);

            // Add blank line separator after each paragraph except the last
            if (i < paragraphs.length - 1) {
                result.push(new Paragraph({ text: '' }));
            }
        }

        return result;
    }

    /**
     * Split ops array into paragraph segments
     * Step 1: Normalize ops (split multi-line inserts)
     * Step 2: Segment into lines based on newlines
     * @param {Array} ops - Quill Delta ops array
     * @returns {Array} - Array of paragraph segments
     */
    _segmentIntoParagraphs(ops) {
        // Step 1: Normalize ops by splitting multi-line insert strings
        const normalizedOps = this._normalizeOps(ops);

        // Step 2: Segment into lines
        const segments = [];
        let currentSegment = {
            runs: [],
            attributes: {} // Line-level attributes from \n
        };

        for (const op of normalizedOps) {
            if (this._isNewline(op)) {
                // Newline closes current line with its attributes
                currentSegment.attributes = op.attributes || {};
                segments.push(currentSegment);

                // Start new line
                currentSegment = {
                    runs: [],
                    attributes: {}
                };
            } else if (this._isInsert(op)) {
                // Add text run to current line
                currentSegment.runs.push(op);
            }
            // Ignore other operation types (retain, delete)
        }

        // Add final segment if it has content
        if (currentSegment.runs.length > 0) {
            segments.push(currentSegment);
        }

        // Handle empty delta
        if (segments.length === 0) {
            segments.push({ runs: [], attributes: {} });
        }

        return segments;
    }

    /**
     * Normalize ops by splitting insert strings that contain embedded newlines
     * @param {Array} ops - Original ops array
     * @returns {Array} - Normalized ops array
     */
    _normalizeOps(ops) {
        const normalized = [];

        for (const op of ops) {
            // Only process insert operations with string content
            if (this._isInsert(op) && typeof op.insert === 'string') {
                const text = op.insert;

                // Check if insert contains newlines
                if (text.includes('\n')) {
                    // Split on newlines, preserving them
                    const parts = text.split('\n');

                    for (let i = 0; i < parts.length; i++) {
                        // Add text part if non-empty
                        if (parts[i].length > 0) {
                            normalized.push({
                                insert: parts[i],
                                attributes: op.attributes
                            });
                        }

                        // Add newline between parts (except after last part)
                        if (i < parts.length - 1) {
                            normalized.push({
                                insert: '\n',
                                attributes: op.attributes
                            });
                        }
                    }
                } else {
                    // No newlines, keep as-is
                    normalized.push(op);
                }
            } else {
                // Non-string inserts or other ops, keep as-is
                normalized.push(op);
            }
        }

        return normalized;
    }

    /**
     * Create a docx Paragraph from a segment
     * @param {Object} segment - Paragraph segment with runs and attributes
     * @returns {Paragraph} - docx Paragraph object
     */
    _createParagraph(segment) {
        const { runs, attributes } = segment;

        // Build children (TextRuns) from runs
        const children = runs.map(run => this._createTextRun(run));

        // If no children, add empty text run to prevent docx errors
        if (children.length === 0) {
            children.push(new TextRun({ text: '' }));
        }

        // Determine paragraph type and properties
        const paragraphOptions = {
            children
        };

        // Handle list formatting
        if (attributes.list) {
            if (attributes.list === 'bullet') {
                paragraphOptions.numbering = {
                    reference: 'default-bullet',
                    level: attributes.indent || 0
                };
            } else if (attributes.list === 'ordered') {
                paragraphOptions.numbering = {
                    reference: 'default-numbering',
                    level: attributes.indent || 0
                };
            }
        }

        // Handle other line-level formatting (future extension point)
        // Examples: header, blockquote, code-block, align, etc.

        return new Paragraph(paragraphOptions);
    }

    /**
     * Create a TextRun from a Delta insert operation
     * @param {Object} op - Delta insert operation
     * @returns {TextRun} - docx TextRun object
     */
    _createTextRun(op) {
        const attributes = op.attributes || {};

        // Extract text content
        const text = this._getInsertText(op.insert);

        // Build TextRun options from attributes
        const runOptions = {
            text
        };

        // Apply inline formatting
        if (attributes.bold) {
            runOptions.bold = true;
        }
        if (attributes.italic) {
            runOptions.italics = true;
        }
        if (attributes.underline) {
            runOptions.underline = {};
        }

        // Future extension points for other formatting:
        // - attributes.strike → strikethrough
        // - attributes.color → text color
        // - attributes.background → highlight
        // - attributes.link → hyperlink

        return new TextRun(runOptions);
    }

    /**
     * Check if operation is a newline
     * @param {Object} op - Delta operation
     * @returns {boolean}
     */
    _isNewline(op) {
        return op.insert === '\n';
    }

    /**
     * Check if operation is an insert
     * @param {Object} op - Delta operation
     * @returns {boolean}
     */
    _isInsert(op) {
        return op.hasOwnProperty('insert');
    }

    /**
     * Extract text from insert value (handle both string and embed objects)
     * @param {string|Object} insert - Insert value from Delta op
     * @returns {string}
     */
    _getInsertText(insert) {
        if (typeof insert === 'string') {
            return insert;
        }

        // Handle embeds (images, formulas, etc.) - not yet supported
        // For now, return placeholder text
        if (typeof insert === 'object') {
            const embedType = Object.keys(insert)[0];
            return `[${embedType.toUpperCase()}]`;
        }

        return '';
    }
}

export default DeltaToDocxConverter;