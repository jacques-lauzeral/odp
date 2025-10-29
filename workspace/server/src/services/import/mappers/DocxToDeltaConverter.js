/**
 * DocxToDeltaConverter
 *
 * Converts HTML content from DocxExtractor back to Quill Delta JSON format.
 * This is the reverse operation of DeltaToDocxConverter, enabling round-trip
 * editing: Delta → Docx → HTML → Delta
 *
 * Supported HTML structures:
 * - <p>text</p> → normal paragraph
 * - <strong>text</strong> → bold
 * - <em>text</em> or <i>text</i> → italic
 * - <u>text</u> → underline
 * - <p class="list-paragraph">text</p> → bullet list item
 * - Nested formatting: <strong><em>text</em></strong>
 *
 * Output format matches textToDelta utility:
 * {
 *   ops: [
 *     { insert: "text", attributes: { bold: true } },
 *     { insert: "\n" }
 *   ]
 * }
 */
class DocxToDeltaConverter {

    /**
     * Convert HTML string to Delta JSON string
     * @param {string} html - HTML content from DocxExtractor table cells
     * @returns {string} Stringified Delta JSON
     */
    convertHtmlToDelta(html) {
        // Handle null/empty input
        if (!html || html.trim() === '') {
            return JSON.stringify({ ops: [] });
        }

        // Extract paragraphs from HTML
        const paragraphs = this._extractParagraphs(html);

        if (paragraphs.length === 0) {
            return JSON.stringify({ ops: [] });
        }

        // Build Delta ops from paragraphs
        const ops = [];

        for (let i = 0; i < paragraphs.length; i++) {
            const paragraph = paragraphs[i];

            // Extract text runs with inline formatting
            const runs = this._extractTextRuns(paragraph.html);

            // Add runs to ops
            for (const run of runs) {
                if (run.text) {
                    const op = { insert: run.text };
                    if (Object.keys(run.attributes).length > 0) {
                        op.attributes = run.attributes;
                    }
                    ops.push(op);
                }
            }

            // Add newline with list attribute if applicable
            const newlineOp = { insert: '\n' };
            if (paragraph.isList) {
                newlineOp.attributes = { list: 'bullet' };
            }
            ops.push(newlineOp);
        }

        return JSON.stringify({ ops });
    }

    /**
     * Extract paragraph elements from HTML
     * @param {string} html - HTML content
     * @returns {Array<{html: string, isList: boolean}>} Paragraph objects
     * @private
     */
    _extractParagraphs(html) {
        const paragraphs = [];

        // Match <p> tags with optional class attribute
        const paragraphRegex = /<p(?:\s+class="([^"]*)")?>(.*?)<\/p>/gs;
        let match;

        while ((match = paragraphRegex.exec(html)) !== null) {
            const className = match[1] || '';
            const content = match[2];

            paragraphs.push({
                html: content,
                isList: className.includes('list-paragraph')
            });
        }

        return paragraphs;
    }

    /**
     * Extract text runs with inline formatting from paragraph HTML
     * @param {string} html - Paragraph inner HTML
     * @returns {Array<{text: string, attributes: Object}>} Text runs with formatting
     * @private
     */
    _extractTextRuns(html) {
        const runs = [];
        const stack = []; // Stack to track nested formatting tags
        let currentText = '';
        let currentAttributes = {};

        // Parse HTML character by character with tag detection
        let i = 0;
        while (i < html.length) {
            if (html[i] === '<') {
                // Save current text run if any
                if (currentText) {
                    runs.push({
                        text: currentText,
                        attributes: { ...currentAttributes }
                    });
                    currentText = '';
                }

                // Extract tag
                const tagEnd = html.indexOf('>', i);
                if (tagEnd === -1) break;

                const tag = html.substring(i, tagEnd + 1);
                const tagName = this._extractTagName(tag);

                if (tagName) {
                    if (tag.startsWith('</')) {
                        // Closing tag - pop from stack
                        if (stack.length > 0 && stack[stack.length - 1] === tagName) {
                            stack.pop();
                            currentAttributes = this._buildAttributes(stack);
                        }
                    } else {
                        // Opening tag - push to stack
                        stack.push(tagName);
                        currentAttributes = this._buildAttributes(stack);
                    }
                }

                i = tagEnd + 1;
            } else {
                // Regular character
                currentText += html[i];
                i++;
            }
        }

        // Add final text run if any
        if (currentText) {
            runs.push({
                text: currentText,
                attributes: { ...currentAttributes }
            });
        }

        // Decode HTML entities and strip list markers
        return runs.map(run => ({
            text: this._decodeHtmlEntities(this._stripListMarker(run.text)),
            attributes: run.attributes
        }));
    }

    /**
     * Extract tag name from tag string
     * @param {string} tag - HTML tag (e.g., "<strong>", "</em>")
     * @returns {string|null} Tag name or null
     * @private
     */
    _extractTagName(tag) {
        const match = tag.match(/<\/?([a-z]+)/i);
        return match ? match[1].toLowerCase() : null;
    }

    /**
     * Build attributes object from tag stack
     * @param {Array<string>} stack - Stack of active formatting tags
     * @returns {Object} Attributes object
     * @private
     */
    _buildAttributes(stack) {
        const attributes = {};

        for (const tag of stack) {
            switch (tag) {
                case 'strong':
                case 'b':
                    attributes.bold = true;
                    break;
                case 'em':
                case 'i':
                    attributes.italic = true;
                    break;
                case 'u':
                    attributes.underline = true;
                    break;
            }
        }

        return attributes;
    }

    /**
     * Strip leading list marker ("- ") from text
     * @param {string} text - Text content
     * @returns {string} Text without list marker
     * @private
     */
    _stripListMarker(text) {
        const trimmed = text.trimStart();
        if (trimmed.startsWith('- ')) {
            return trimmed.substring(2);
        }
        return text;
    }

    /**
     * Decode common HTML entities
     * @param {string} text - Text with HTML entities
     * @returns {string} Decoded text
     * @private
     */
    _decodeHtmlEntities(text) {
        const entities = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&nbsp;': ' '
        };

        let decoded = text;
        for (const [entity, char] of Object.entries(entities)) {
            decoded = decoded.split(entity).join(char);
        }

        return decoded;
    }
}

export default DocxToDeltaConverter;