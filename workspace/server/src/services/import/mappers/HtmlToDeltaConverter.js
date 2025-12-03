/**
 * HtmlToDeltaConverter
 *
 * Converts HTML (from mammoth or other sources) directly to Quill Delta JSON format.
 * This replaces the two-step HTML → AsciiDoc → Delta pipeline with a single transformation.
 *
 * Supported HTML structures:
 * ==========================
 *
 * Block elements:
 * - <p>text</p> → paragraph (text + newline)
 * - <br> → soft line break within paragraph
 *
 * Lists:
 * - <ol><li>item</li></ol> → ordered list
 * - <ul><li>item</li></ul> → bullet list
 * - Nested lists → indent attribute (0, 1, 2, ...)
 * - Multiline list items: <li><p>first</p><p>second</p></li> → preserved as single item
 *
 * Inline formatting:
 * - <strong>, <b> → bold
 * - <em>, <i> → italic
 * - <u> → underline
 * - <s> → strike
 * - Nested formatting supported
 *
 * Images:
 * - <img src="data:image/png;base64,..."> → embedded image
 * - <img src="url"> → external image reference
 *
 * Output format matches Quill Delta specification:
 * {
 *   ops: [
 *     { insert: "text", attributes: { bold: true } },
 *     { insert: "\n", attributes: { list: "ordered" } },
 *     { insert: { image: "data:image/png;base64,..." } }
 *   ]
 * }
 *
 * MULTILINE LIST ITEM HANDLING:
 * =============================
 * In Quill Delta, the newline character carries the block formatting (list type).
 * For multiline list items like:
 *   <li><p>First paragraph</p><p>Second paragraph</p></li>
 *
 * We emit a single text op with embedded newlines, then one list newline:
 *   { insert: "First paragraph\nSecond paragraph" }
 *   { insert: "\n", attributes: { list: "ordered" } }
 *
 * The \n characters inside the text string are soft line breaks within the same
 * list item. Only the final \n op with list attribute defines the block type.
 *
 * This renders as:
 *   1. First paragraph
 *      Second paragraph
 *   2. Next item...
 *
 * All continuation lines stay indented under the same list item number.
 */
class HtmlToDeltaConverter {

    /**
     * Convert HTML to Delta JSON string
     * @param {string} html - HTML fragment
     * @returns {string} Stringified Delta JSON
     */
    htmlToDelta(html) {
        // Handle null/empty input
        if (!html || html.trim() === '') {
            return JSON.stringify({ ops: [] });
        }

        const ops = this._parseHtml(html);

        // Ensure document ends with newline if it has content
        if (ops.length > 0) {
            const lastOp = ops[ops.length - 1];
            const lastInsert = lastOp.insert;

            // Check if last op is not already a newline
            if (typeof lastInsert === 'string' && !lastInsert.endsWith('\n')) {
                ops.push({ insert: '\n' });
            } else if (typeof lastInsert === 'object') {
                // Last op is an image or other embed - add newline
                ops.push({ insert: '\n' });
            }
        }

        return JSON.stringify({ ops });
    }

    /**
     * Parse HTML and generate Delta ops
     * @param {string} html - HTML fragment
     * @returns {Array} Array of Delta ops
     * @private
     */
    _parseHtml(html) {
        const ops = [];
        const stack = []; // Track open tags: { tag, paragraphCount? }
        let position = 0;
        let textBuffer = '';

        // Helper: Get current formatting attributes from stack
        const getFormatAttributes = () => {
            const attrs = {};
            for (const item of stack) {
                switch (item.tag) {
                    case 'strong':
                    case 'b':
                        attrs.bold = true;
                        break;
                    case 'em':
                    case 'i':
                        attrs.italic = true;
                        break;
                    case 'u':
                        attrs.underline = true;
                        break;
                    case 's':
                        attrs.strike = true;
                        break;
                }
            }
            return attrs;
        };

        // Helper: Get current list context from stack
        const getListContext = () => {
            let listType = null;
            let depth = -1;

            for (const item of stack) {
                if (item.tag === 'ol' || item.tag === 'ul') {
                    listType = item.tag === 'ol' ? 'ordered' : 'bullet';
                    depth++;
                }
            }

            if (listType && depth >= 0) {
                return { type: listType, indent: depth > 0 ? depth : undefined };
            }
            return null;
        };

        // Helper: Check if we're inside a list item
        const isInListItem = () => {
            return stack.some(item => item.tag === 'li');
        };

        // Helper: Get the current list item from stack (if any)
        const getCurrentListItem = () => {
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].tag === 'li') {
                    return stack[i];
                }
            }
            return null;
        };

        // Helper: Flush text buffer to ops
        const flushText = () => {
            if (textBuffer) {
                const attrs = getFormatAttributes();
                const op = { insert: textBuffer };
                if (Object.keys(attrs).length > 0) {
                    op.attributes = attrs;
                }
                ops.push(op);
                textBuffer = '';
            }
        };

        // Helper: Emit a newline with optional list/block attributes
        const emitNewline = (blockAttrs = null) => {
            const op = { insert: '\n' };
            if (blockAttrs && Object.keys(blockAttrs).length > 0) {
                op.attributes = blockAttrs;
            }
            ops.push(op);
        };

        // Helper: Extract attribute value from tag string
        const extractAttribute = (tagString, attrName) => {
            const regex = new RegExp(`${attrName}=["']([^"']+)["']`, 'i');
            const match = tagString.match(regex);
            return match ? match[1] : null;
        };

        // Main parsing loop
        while (position < html.length) {
            const char = html[position];

            if (char === '<') {
                // Find end of tag
                const tagEnd = html.indexOf('>', position);
                if (tagEnd === -1) {
                    // Malformed HTML - treat rest as text
                    textBuffer += html.substring(position);
                    break;
                }

                const tagString = html.substring(position + 1, tagEnd);
                const isClosingTag = tagString.startsWith('/');
                const isSelfClosing = tagString.endsWith('/') ||
                    tagString.toLowerCase().startsWith('br') ||
                    tagString.toLowerCase().startsWith('img');

                // Extract tag name
                let tagName = isClosingTag
                    ? tagString.substring(1).trim().toLowerCase()
                    : tagString.split(/[\s/>]/)[0].toLowerCase();

                if (isClosingTag) {
                    // === CLOSING TAG ===

                    // Find and remove matching open tag from stack
                    let openTagIndex = -1;
                    for (let i = stack.length - 1; i >= 0; i--) {
                        if (stack[i].tag === tagName) {
                            openTagIndex = i;
                            break;
                        }
                    }

                    if (openTagIndex === -1) {
                        // No matching open tag - skip
                        position = tagEnd + 1;
                        continue;
                    }

                    // Handle block-level closing tags
                    switch (tagName) {
                        case 'p':
                            flushText();
                            // Check if we're inside a list item
                            const liItem = getCurrentListItem();
                            if (liItem) {
                                // Inside list item: add soft line break to text buffer
                                // instead of emitting a newline op (which would create new list item)
                                // The actual list newline will be emitted at </li>
                                textBuffer += '\n';
                                liItem.paragraphCount = (liItem.paragraphCount || 0) + 1;
                            } else {
                                // Normal paragraph outside list
                                emitNewline();
                            }
                            break;

                        case 'li':
                            // Flush any remaining text in list item
                            flushText();

                            const ctx = getListContext();

                            if (ctx) {
                                // Remove trailing newline from last text op if present
                                // (it was added by </p> as soft break, but we don't need it at the end)
                                const lastOp = ops[ops.length - 1];
                                if (lastOp && typeof lastOp.insert === 'string' && lastOp.insert.endsWith('\n')) {
                                    lastOp.insert = lastOp.insert.slice(0, -1);
                                    // Remove op entirely if now empty
                                    if (lastOp.insert === '') {
                                        ops.pop();
                                    }
                                }

                                // Emit single newline with list attributes
                                const blockAttrs = { list: ctx.type };
                                if (ctx.indent) {
                                    blockAttrs.indent = ctx.indent;
                                }
                                emitNewline(blockAttrs);
                            }
                            break;

                        case 'ol':
                        case 'ul':
                            flushText();
                            // List container closing - no special action needed
                            break;

                        case 'strong':
                        case 'b':
                        case 'em':
                        case 'i':
                        case 'u':
                        case 's':
                            // Inline formatting - just flush and let stack update handle it
                            flushText();
                            break;

                        default:
                            flushText();
                    }

                    // Remove from stack
                    stack.splice(openTagIndex, 1);

                } else if (isSelfClosing || tagName === 'br' || tagName === 'img') {
                    // === SELF-CLOSING TAG ===

                    if (tagName === 'br') {
                        flushText();
                        // Soft line break - emit plain newline
                        emitNewline();
                    } else if (tagName === 'img') {
                        flushText();
                        const src = extractAttribute(tagString, 'src');
                        if (src) {
                            ops.push({
                                insert: { image: src }
                            });
                        }
                    }

                } else {
                    // === OPENING TAG ===

                    switch (tagName) {
                        case 'p':
                            flushText();
                            stack.push({ tag: 'p' });
                            break;

                        case 'ol':
                        case 'ul':
                            flushText();
                            stack.push({ tag: tagName });
                            break;

                        case 'li':
                            flushText();
                            stack.push({ tag: 'li', paragraphCount: 0 });
                            break;

                        case 'strong':
                        case 'b':
                        case 'em':
                        case 'i':
                        case 'u':
                        case 's':
                            flushText();
                            stack.push({ tag: tagName });
                            break;

                        case 'a':
                            // Skip anchor tags (used for TOC links, bookmarks)
                            // Don't push to stack - we'll skip the closing tag too
                            break;

                        case 'table':
                        case 'tr':
                        case 'td':
                        case 'th':
                        case 'thead':
                        case 'tbody':
                            // Table elements - push to stack but no special handling
                            stack.push({ tag: tagName });
                            break;

                        default:
                            // Unknown tag - push to stack for balance
                            stack.push({ tag: tagName });
                    }
                }

                position = tagEnd + 1;

            } else {
                // Regular text character
                textBuffer += char;
                position++;
            }
        }

        // Flush any remaining text
        flushText();

        // Decode HTML entities in all text ops
        for (const op of ops) {
            if (typeof op.insert === 'string') {
                op.insert = this._decodeHtmlEntities(op.insert);
            }
        }

        // Clean up: collapse multiple consecutive newlines
        return this._normalizeOps(ops);
    }

    /**
     * Decode HTML entities in text
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
            '&apos;': "'",
            '&#39;': "'",
            '&nbsp;': ' ',
            '&#160;': ' ',
            '&ndash;': '–',
            '&mdash;': '—',
            '&lsquo;': "'",
            '&rsquo;': "'",
            '&ldquo;': '"',
            '&rdquo;': '"',
            '&hellip;': '…',
            '&bull;': '•',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
            '&euro;': '€',
            '&pound;': '£',
            '&yen;': '¥',
            '&cent;': '¢',
            '&deg;': '°',
            '&plusmn;': '±',
            '&times;': '×',
            '&divide;': '÷',
            '&frac12;': '½',
            '&frac14;': '¼',
            '&frac34;': '¾'
        };

        // Handle named entities
        let result = text.replace(/&[#\w]+;/g, (entity) => {
            if (entities[entity]) {
                return entities[entity];
            }
            // Handle numeric entities (&#123; or &#x1F;)
            if (entity.startsWith('&#x')) {
                const code = parseInt(entity.slice(3, -1), 16);
                return String.fromCodePoint(code);
            } else if (entity.startsWith('&#')) {
                const code = parseInt(entity.slice(2, -1), 10);
                return String.fromCodePoint(code);
            }
            return entity;
        });

        return result;
    }

    /**
     * Normalize ops: collapse whitespace, remove empty ops, etc.
     * @param {Array} ops - Array of Delta ops
     * @returns {Array} Normalized ops
     * @private
     */
    _normalizeOps(ops) {
        if (ops.length === 0) {
            return ops;
        }

        const normalized = [];

        for (const op of ops) {
            if (typeof op.insert === 'string') {
                // Skip empty text ops
                if (op.insert === '') {
                    continue;
                }

                // Normalize whitespace in text (but preserve newlines)
                let text = op.insert;

                // Collapse multiple spaces/tabs into single space
                text = text.replace(/[^\S\n]+/g, ' ');

                if (text === '' || text === ' ') {
                    // Check if previous op needs this space
                    const prevOp = normalized[normalized.length - 1];
                    if (prevOp &&
                        typeof prevOp.insert === 'string' &&
                        !prevOp.insert.endsWith(' ') &&
                        !prevOp.insert.endsWith('\n') &&
                        text === ' ') {
                        // Keep the space
                    } else if (text === '') {
                        continue;
                    }
                }

                // Merge with previous text op if same attributes (but not across newlines)
                const prevOp = normalized[normalized.length - 1];
                if (prevOp &&
                    typeof prevOp.insert === 'string' &&
                    !prevOp.insert.includes('\n') &&
                    !text.startsWith('\n') &&
                    this._attributesEqual(prevOp.attributes, op.attributes)) {
                    prevOp.insert += text;
                    continue;
                }

                normalized.push({
                    insert: text,
                    ...(op.attributes && Object.keys(op.attributes).length > 0
                        ? { attributes: op.attributes }
                        : {})
                });
            } else {
                // Non-text op (image, etc.) - keep as-is
                normalized.push(op);
            }
        }

        // Remove trailing empty newlines (keep at most one)
        while (normalized.length > 1) {
            const last = normalized[normalized.length - 1];
            const secondLast = normalized[normalized.length - 2];

            if (typeof last.insert === 'string' &&
                last.insert === '\n' &&
                !last.attributes &&
                typeof secondLast.insert === 'string' &&
                secondLast.insert === '\n' &&
                !secondLast.attributes) {
                normalized.pop();
            } else {
                break;
            }
        }

        return normalized;
    }

    /**
     * Compare two attribute objects for equality
     * @param {Object|undefined} a - First attributes object
     * @param {Object|undefined} b - Second attributes object
     * @returns {boolean} True if equal
     * @private
     */
    _attributesEqual(a, b) {
        if (!a && !b) return true;
        if (!a || !b) return false;

        const keysA = Object.keys(a);
        const keysB = Object.keys(b);

        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (a[key] !== b[key]) return false;
        }

        return true;
    }
}

export default HtmlToDeltaConverter;