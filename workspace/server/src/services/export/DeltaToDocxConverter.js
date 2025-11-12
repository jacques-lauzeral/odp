// workspace/server/src/services/DeltaToDocxConverter.js
import { Paragraph, TextRun, ImageRun } from 'docx';
import sizeOf from 'image-size';

/**
 * Converts Quill Delta JSON format to docx Paragraph arrays.
 * Supports inline formatting (bold, italic, underline), lists (bullet/ordered), and embedded images.
 */
class DeltaToDocxConverter {
    constructor() {
        // Track numbering instances for list restart
        this.numberingInstanceCounter = 0;
        this.usedNumberingInstances = new Set();
    }

    /**
     * Get all unique numbering instances used by this converter
     * @returns {Set} - Set of numbering instance IDs
     */
    getUsedNumberingInstances() {
        return this.usedNumberingInstances;
    }

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
     * Split ops array into paragraph segments with list boundary detection
     * Step 1: Normalize ops (split multi-line inserts)
     * Step 2: Segment into lines based on newlines
     * Step 3: Detect list boundaries and assign numbering instances
     * @param {Array} ops - Quill Delta ops array
     * @returns {Array} - Array of paragraph segments with numbering instance IDs
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

        // Step 3: Detect list boundaries and assign numbering instances
        this._assignNumberingInstances(segments);

        return segments;
    }

    /**
     * Detect list boundaries and assign unique numbering instances to each ordered list block
     * Modifies segments in place by adding numberingInstanceId property
     * @param {Array} segments - Array of paragraph segments
     */
    _assignNumberingInstances(segments) {
        let currentListType = null;
        let currentInstanceId = null;

        for (const segment of segments) {
            const listType = segment.attributes.list;

            // Detect list boundary (type change)
            if (listType !== currentListType) {
                // If starting a new ordered list block, create new instance
                if (listType === 'ordered') {
                    currentInstanceId = this.numberingInstanceCounter++;
                    this.usedNumberingInstances.add(currentInstanceId);
                } else {
                    currentInstanceId = null;
                }
                currentListType = listType;
            }

            // Assign instance ID to ordered list items
            if (listType === 'ordered' && currentInstanceId !== null) {
                segment.numberingInstanceId = currentInstanceId;
            }
        }
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
     * @param {Object} segment - Paragraph segment with runs, attributes, and optional numberingInstanceId
     * @returns {Paragraph} - docx Paragraph object
     */
    _createParagraph(segment) {
        const { runs, attributes, numberingInstanceId } = segment;

        // Build children (TextRuns/ImageRuns) from runs
        const children = runs.map(run => this._createRun(run)).filter(run => run !== null);

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
                // Use unique numbering reference for each ordered list block
                const reference = `ordered-list-${numberingInstanceId}`;
                paragraphOptions.numbering = {
                    reference: reference,
                    level: attributes.indent || 0
                };
            }
        }

        // Handle other line-level formatting (future extension point)
        // Examples: header, blockquote, code-block, align, etc.

        return new Paragraph(paragraphOptions);
    }

    /**
     * Create a TextRun or ImageRun from a Delta insert operation
     * @param {Object} op - Delta insert operation
     * @returns {TextRun|ImageRun|null} - docx Run object or null if unsupported
     */
    _createRun(op) {
        // Check if this is an image embed
        if (this._isImageEmbed(op)) {
            return this._createImageRun(op);
        }

        // Otherwise, create a text run
        return this._createTextRun(op);
    }

    /**
     * Check if operation is an image embed
     * @param {Object} op - Delta insert operation
     * @returns {boolean}
     */
    _isImageEmbed(op) {
        return typeof op.insert === 'object' &&
            op.insert !== null &&
            op.insert.hasOwnProperty('image');
    }

    /**
     * Create an ImageRun from a Delta image insert operation
     * @param {Object} op - Delta insert operation with image embed
     * @returns {ImageRun|null} - docx ImageRun object or null if conversion fails
     */
    _createImageRun(op) {
        try {
            const imageData = op.insert.image;

            // Validate data URL format: data:image/png;base64,<data>
            if (!imageData || typeof imageData !== 'string') {
                console.warn('Invalid image data in Delta op:', op);
                return null;
            }

            // Parse data URL
            const dataUrlMatch = imageData.match(/^data:image\/([^;]+);base64,(.+)$/);
            if (!dataUrlMatch) {
                console.warn('Invalid image data URL format:', imageData.substring(0, 100));
                return null;
            }

            const [, imageType, base64Data] = dataUrlMatch;

            // Convert base64 to buffer
            const imageBuffer = Buffer.from(base64Data, 'base64');

            const dimensions = sizeOf(imageBuffer);
            const aspectRatio = dimensions.height / dimensions.width;
            const targetWidth = 454;
            const targetHeight = Math.round(targetWidth * aspectRatio);

            // Create ImageRun with reasonable default dimensions
            // Note: docx library will handle the image size, but we can specify max dimensions
            return new ImageRun({
                data: imageBuffer,
                transformation: {
                    width: targetWidth,
                    height: targetHeight
                }
            });

        } catch (error) {
            console.error('Error creating ImageRun:', error);
            // Return placeholder text run on error
            return new TextRun({
                text: '[IMAGE - Conversion Error]',
                italics: true,
                color: '999999'
            });
        }
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

        // Handle non-image embeds (formulas, etc.) - return placeholder text
        if (typeof insert === 'object') {
            const embedType = Object.keys(insert)[0];
            // Don't show placeholder for images (handled separately)
            if (embedType === 'image') {
                return '';
            }
            return `[${embedType.toUpperCase()}]`;
        }

        return '';
    }
}

export default DeltaToDocxConverter;