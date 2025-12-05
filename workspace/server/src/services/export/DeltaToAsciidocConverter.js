/**
 * DeltaToAsciidocConverter
 *
 * Converts Quill Delta JSON format to AsciiDoc-style plain text.
 * This converter processes Delta ops and produces AsciiDoc formatting markers
 * for use in ODP Edition template rendering.
 *
 * Supported Delta operations:
 * ===========================
 *
 * Inline formatting attributes:
 * - { bold: true } → **text**
 * - { italic: true } → *text*
 * - { underline: true } → __text__
 * - { code: true } → `text`
 * - Combined: { bold: true, italic: true } → ***text***
 *
 * Code blocks (multi-line, preserves whitespace):
 * - { insert: "\n", attributes: { "code-block": true } } → ---- delimited block
 * - Content emitted verbatim (no formatting applied)
 * - Blank lines preserved before/after ---- delimiters
 *
 * List attributes on newlines (supports mixed list types):
 * - { list: "ordered" } → . item
 * - { list: "bullet" } → * item
 * - { list: "bullet", indent: 1 } under ordered → .* item
 * - { list: "ordered", indent: 2 } under bullet → .*. item
 * - Max indent depth: 4 (5 levels total)
 *
 * Images:
 * - { insert: { image: "data:..." } } → image::images/image-NNN.png[]
 * - Extracts base64 data and returns image collection
 *
 * Paragraphs:
 * - Newline without list attribute → paragraph separator (double newline)
 * - Multiple text runs combined into single line
 *
 * Input format (Quill Delta):
 * {
 *   ops: [
 *     { insert: "text", attributes: { bold: true } },
 *     { insert: "\n", attributes: { list: "ordered" } },
 *     { insert: "\n", attributes: { "code-block": true } },
 *     { insert: { image: "data:image/png;base64,..." } }
 *   ]
 * }
 *
 * Design rationale:
 * - Inverse operation of AsciidocToDeltaConverter (for round-trip capability)
 * - Produces readable AsciiDoc for template rendering
 * - Handles nested formatting and list structures
 * - Extracts embedded images for ZIP packaging
 * - Single converter for all Delta → AsciiDoc transformations
 */
class DeltaToAsciidocConverter {

    constructor() {
        this.imageCounter = 0;
        this.extractedImages = [];
    }

    /**
     * Reset image counter and collection (call before processing a new document)
     */
    resetImageTracking() {
        this.imageCounter = 0;
        this.extractedImages = [];
    }

    /**
     * Get extracted images from last conversion
     * @returns {Array<{filename: string, data: string, mediaType: string}>}
     */
    getExtractedImages() {
        return this.extractedImages;
    }

    /**
     * Convert Delta JSON string to AsciiDoc-style text
     * @param {string} deltaJson - Stringified Delta JSON
     * @returns {string} AsciiDoc formatted text
     */
    deltaToAsciidoc(deltaJson) {
        // Handle null/empty input
        if (!deltaJson || deltaJson.trim() === '') {
            return '';
        }

        let delta;
        try {
            delta = JSON.parse(deltaJson);
        } catch (error) {
            throw new Error(`Invalid Delta JSON: ${error.message}`);
        }

        if (!delta.ops || !Array.isArray(delta.ops)) {
            return '';
        }

        if (delta.ops.length === 0) {
            return '';
        }

        const lines = [];
        let currentLine = '';
        let inCodeBlock = false;
        let listTypeStack = []; // Track list types at each level for mixed lists

        // Helper: Close code block if open
        const closeCodeBlockIfNeeded = () => {
            if (inCodeBlock) {
                lines.push('----');
                lines.push(''); // Blank line after code block
                inCodeBlock = false;
            }
        };

        for (let i = 0; i < delta.ops.length; i++) {
            const op = delta.ops[i];

            // Handle image insert
            if (op.insert && typeof op.insert === 'object' && op.insert.image) {
                // Close any open code block
                closeCodeBlockIfNeeded();

                // Flush current line if any
                if (currentLine) {
                    lines.push(currentLine);
                    currentLine = '';
                }

                // Add blank line before image (if not at the start)
                if (lines.length > 0 && lines[lines.length - 1] !== '') {
                    lines.push('');
                }

                // Extract image data
                const dataUrl = op.insert.image;
                const imageInfo = this._extractImageData(dataUrl);

                if (imageInfo) {
                    this.imageCounter++;
                    const filename = `image-${String(this.imageCounter).padStart(3, '0')}.${imageInfo.extension}`;

                    // Store extracted image
                    this.extractedImages.push({
                        filename: filename,
                        data: imageInfo.base64Data,
                        mediaType: imageInfo.mediaType
                    });

                    // Add image reference with relative path
                    lines.push(`image::./images/${filename}[]`);
                } else {
                    // Fallback: keep original data URL if extraction fails
                    lines.push(`image::${dataUrl}[]`);
                }

                // Add blank line after image
                lines.push('');

                continue;
            }

            // Handle text insert
            if (typeof op.insert === 'string') {
                const text = op.insert;

                // Check if this is a newline
                if (text === '\n') {
                    // Check for code-block attribute
                    const isCodeBlock = op.attributes?.['code-block'] === true;

                    if (isCodeBlock) {
                        // Opening code block if not already in one
                        if (!inCodeBlock) {
                            // Ensure blank line before code block
                            if (lines.length > 0 && lines[lines.length - 1] !== '') {
                                lines.push('');
                            }
                            lines.push('----');
                            inCodeBlock = true;
                        }
                        // Emit line verbatim (no formatting)
                        lines.push(currentLine);
                        currentLine = '';
                    } else {
                        // Not a code block line - close any open code block first
                        closeCodeBlockIfNeeded();

                        // Check for list attributes
                        const listType = op.attributes?.list; // 'ordered' or 'bullet'
                        const indent = op.attributes?.indent || 0;

                        if (listType) {
                            // Update list type stack for mixed list support
                            // Truncate stack to current indent level
                            listTypeStack = listTypeStack.slice(0, indent);
                            // Set type at current level
                            listTypeStack[indent] = listType;

                            // Build list marker from stack
                            const marker = this._buildListMarkerFromStack(listTypeStack);
                            lines.push(`${marker} ${currentLine}`);
                        } else {
                            // Regular paragraph - reset list stack
                            listTypeStack = [];
                            // Add empty line for paragraph separation
                            lines.push(currentLine);
                            lines.push(''); // Empty line creates paragraph break in AsciiDoc
                        }

                        currentLine = '';
                    }
                } else {
                    // Regular text - apply formatting only if not in code block
                    if (inCodeBlock) {
                        // Inside code block - keep text verbatim
                        currentLine += text;
                    } else {
                        const formattedText = this._applyFormatting(text, op.attributes || {});
                        currentLine += formattedText;
                    }
                }
            }
        }

        // Close any remaining open code block
        closeCodeBlockIfNeeded();

        // Flush any remaining line
        if (currentLine) {
            lines.push(currentLine);
        }

        // Join lines with newlines and trim trailing empty lines
        return lines.join('\n').replace(/\n+$/, '');
    }

    /**
     * Extract image data from data URL
     * @param {string} dataUrl - Data URL (e.g., data:image/png;base64,...)
     * @returns {Object|null} { base64Data, mediaType, extension } or null if invalid
     * @private
     */
    _extractImageData(dataUrl) {
        if (!dataUrl || !dataUrl.startsWith('data:')) {
            return null;
        }

        try {
            // Parse data URL: data:image/png;base64,iVBORw0KGgo...
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) {
                return null;
            }

            const mediaType = match[1]; // e.g., "image/png"
            const base64Data = match[2];

            // Determine file extension from media type
            const extensionMap = {
                'image/png': 'png',
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'image/svg+xml': 'svg'
            };

            const extension = extensionMap[mediaType] || 'png'; // Default to png

            return {
                base64Data,
                mediaType,
                extension
            };
        } catch (error) {
            console.warn(`Failed to extract image data: ${error.message}`);
            return null;
        }
    }

    /**
     * Build list marker from type stack for mixed list support
     * @param {Array<string>} typeStack - Array of list types at each level ('ordered' or 'bullet')
     * @returns {string} List marker (e.g., '.', '.*', '.*.', etc.)
     * @private
     */
    _buildListMarkerFromStack(typeStack) {
        if (typeStack.length === 0) {
            return '.'; // Default to ordered if somehow empty
        }

        // Build marker from each level's type
        return typeStack.map(type => type === 'ordered' ? '.' : '*').join('');
    }

    /**
     * Apply inline formatting to text based on attributes
     * @param {string} text - Text to format
     * @param {Object} attributes - Quill attributes (bold, italic, underline, code)
     * @returns {string} Formatted text with AsciiDoc markers
     * @private
     */
    _applyFormatting(text, attributes) {
        let result = text;

        // Code formatting takes precedence (no nested formatting inside code)
        if (attributes.code === true) {
            return `\`${result}\``;
        }

        // Apply formatting in specific order for proper nesting
        // Order: bold+italic (outermost), then individual formats

        const hasBold = attributes.bold === true;
        const hasItalic = attributes.italic === true;
        const hasUnderline = attributes.underline === true;

        // Handle bold + italic combination (*** marker)
        if (hasBold && hasItalic) {
            result = `***${result}***`;

            // Apply underline on top if present
            if (hasUnderline) {
                result = `__${result}__`;
            }
        } else {
            // Apply individual formats (order matters for nesting)

            // Underline (innermost)
            if (hasUnderline) {
                result = `__${result}__`;
            }

            // Italic
            if (hasItalic) {
                result = `*${result}*`;
            }

            // Bold (outermost)
            if (hasBold) {
                result = `**${result}**`;
            }
        }

        return result;
    }
}

export default DeltaToAsciidocConverter;