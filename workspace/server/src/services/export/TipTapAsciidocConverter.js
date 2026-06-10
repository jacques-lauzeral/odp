/**
 * TipTapToAsciidocConverter
 *
 * Converts TipTap document JSON format to AsciiDoc-style text.
 * Replaces DeltaToAsciidocConverter for use with TipTap-stored rich-text fields.
 *
 * Supported node types:
 * =====================
 *
 * Block nodes:
 *   paragraph    → text run + blank line separator
 *   heading      → = / == / === ... prefix (levels 1–6) + blank line
 *   bulletList   → * item lines (nested via listItem recursion)
 *   orderedList  → . item lines (nested via listItem recursion)
 *   listItem     → delegates to inner paragraph/list content
 *   image        → image::./images/image-NNN.ext[] + extracted image data
 *   table        → AsciiDoc |=== block with header row support
 *   hardBreak    → AsciiDoc line continuation (+)
 *
 * Inline marks:
 *   bold         → **text**
 *   italic       → *text*
 *   underline    → __text__
 *   code         → `text`
 *   bold+italic  → ***text***
 *   link         → text (href preserved as AsciiDoc link macro when target available)
 *   o-ref        → xref:{chapterSlug}:{slugPath}/on-{id}.adoc[label] (via refResolver)
 *   n-ref        → xref:{chapterSlug}:index.adoc[label]            (via refResolver)
 *   d-ref        → link:url[label]                                  (via refResolver)
 *   textStyle    → color attribute ignored (AsciiDoc has no inline color)
 *
 * Input format (TipTap document JSON string):
 * {
 *   "type": "doc",
 *   "content": [
 *     { "type": "paragraph", "content": [
 *         { "type": "text", "text": "Hello", "marks": [{ "type": "bold" }] }
 *     ]},
 *     { "type": "heading", "attrs": { "level": 2 }, "content": [...] },
 *     { "type": "bulletList", "content": [
 *         { "type": "listItem", "content": [{ "type": "paragraph", "content": [...] }] }
 *     ]},
 *     { "type": "table", "content": [
 *         { "type": "tableRow", "content": [
 *             { "type": "tableHeader", "content": [...] },
 *             { "type": "tableHeader", "content": [...] }
 *         ]},
 *         { "type": "tableRow", "content": [
 *             { "type": "tableCell", "content": [...] },
 *             { "type": "tableCell", "content": [...] }
 *         ]}
 *     ]}
 *   ]
 * }
 *
 * Image extraction:
 *   Embedded base64 images are extracted and returned via getExtractedImages().
 *   Call resetImageTracking() before processing each document.
 *   Image references in AsciiDoc use relative paths: image::./images/image-NNN.ext[]
 */
class TipTapToAsciidocConverter {

    /**
     * @param {object|null} refResolver - Optional resolver for internal reference marks.
     *   Built once per publication run by ODPEditionService and shared across all chapters.
     *   Shape:
     *     resolveORef(itemId: string) → string|null  — Antora xref for an O* page
     *     resolveNRef(chapterId: string) → string|null — Antora xref for a chapter page
     *     resolveDRef(refdocId: string) → string|null  — URL for a reference document
     */
    constructor(refResolver = null) {
        this.imageCounter = 0;
        this.extractedImages = [];
        this._refResolver = refResolver;
    }

    // ─── Public API ──────────────────────────────────────────────────────────────

    /**
     * Reset image counter and collection.
     * Call before processing each new document.
     */
    resetImageTracking() {
        this.imageCounter = 0;
        this.extractedImages = [];
    }

    /**
     * Get extracted images from the last conversion.
     * @returns {Array<{filename: string, data: string, mediaType: string}>}
     */
    getExtractedImages() {
        return this.extractedImages;
    }

    /**
     * Convert a TipTap document JSON string to AsciiDoc text.
     * @param {string} jsonString - Stringified TipTap document JSON
     * @returns {string} AsciiDoc formatted text, or '' if input is empty/invalid
     */
    toAsciidoc(jsonString) {
        if (!jsonString || jsonString.trim() === '') return '';

        let doc;
        try {
            doc = JSON.parse(jsonString);
        } catch (error) {
            throw new Error(`Invalid TipTap JSON: ${error.message}`);
        }

        if (doc.type !== 'doc' || !Array.isArray(doc.content)) return '';

        const lines = this._renderBlockNodes(doc.content, 0);
        return lines.join('\n').replace(/\n+$/, '');
    }

    // ─── Block rendering ─────────────────────────────────────────────────────────

    /**
     * Render an array of block nodes, returning a lines array.
     * @param {Array} nodes
     * @param {number} listDepth - Current nesting depth inside lists (0 = top level)
     * @param {string|null} listMarkerChar - '.' for ordered, '*' for bullet, null outside list
     * @returns {string[]}
     * @private
     */
    _renderBlockNodes(nodes, listDepth, listMarkerChar = null) {
        const lines = [];
        for (const node of nodes) {
            const nodeLines = this._renderBlockNode(node, listDepth, listMarkerChar);
            lines.push(...nodeLines);
        }
        return lines;
    }

    /**
     * Dispatch a single block node to its renderer.
     * @private
     */
    _renderBlockNode(node, listDepth, listMarkerChar) {
        switch (node.type) {
            case 'paragraph':   return this._renderParagraph(node, listDepth, listMarkerChar);
            case 'heading':     return this._renderHeading(node);
            case 'bulletList':  return this._renderList(node, listDepth, '*');
            case 'orderedList': return this._renderList(node, listDepth, '.');
            case 'image':       return this._renderImage(node);
            case 'table':       return this._renderTable(node);
            // Ignore structural/layout-only nodes
            case 'horizontalRule': return ['\'\'\'', ''];
            default:            return [];
        }
    }

    /**
     * Render a paragraph node.
     * When inside a list (listMarkerChar set), emit as a list item line.
     * Otherwise emit as a paragraph followed by a blank separator line.
     * @private
     */
    _renderParagraph(node, listDepth, listMarkerChar) {
        const inline = this._renderInlineContent(node.content ?? []);
        if (!inline) return [];

        if (listMarkerChar !== null) {
            // Inside listItem — the marker prefix is applied by _renderListItem
            return [inline];
        }

        return [inline, ''];
    }

    /**
     * Render a heading node.
     * AsciiDoc heading levels: = (1), == (2), === (3), ==== (4), ===== (5), ====== (6)
     * @private
     */
    _renderHeading(node) {
        const level = node.attrs?.level ?? 1;
        const prefix = '='.repeat(level);
        const inline = this._renderInlineContent(node.content ?? []);
        if (!inline) return [];
        return [`${prefix} ${inline}`, ''];
    }

    /**
     * Render a bulletList or orderedList node.
     * Recursively handles nested lists by incrementing listDepth.
     * @private
     */
    _renderList(node, listDepth, markerChar) {
        const lines = [];
        for (const item of (node.content ?? [])) {
            if (item.type === 'listItem') {
                lines.push(...this._renderListItem(item, listDepth, markerChar));
            }
        }
        // Blank line after list block (only at top level to avoid extra spacing in nested lists)
        if (listDepth === 0) lines.push('');
        return lines;
    }

    /**
     * Render a listItem node.
     * A listItem may contain paragraphs and nested lists.
     * The first paragraph becomes the item text; nested lists are indented.
     * @private
     */
    _renderListItem(item, listDepth, markerChar) {
        const lines = [];
        const marker = markerChar.repeat(listDepth + 1); // *, **, *** or ., .., ...

        for (const child of (item.content ?? [])) {
            if (child.type === 'paragraph') {
                const paragraphLines = this._renderParagraph(child, listDepth, markerChar);
                if (paragraphLines.length > 0) {
                    // First line of paragraph becomes the list item text
                    lines.push(`${marker} ${paragraphLines[0]}`);
                }
            } else if (child.type === 'bulletList') {
                lines.push(...this._renderList(child, listDepth + 1, '*'));
            } else if (child.type === 'orderedList') {
                lines.push(...this._renderList(child, listDepth + 1, '.'));
            }
        }

        return lines;
    }

    /**
     * Render an image node.
     * Extracts base64 data from src attr and emits an AsciiDoc image macro.
     * @private
     */
    _renderImage(node) {
        const src = node.attrs?.src ?? '';
        if (!src) return [];

        const lines = [];

        // Blank line before image
        lines.push('');

        const imageInfo = this._extractImageData(src);
        if (imageInfo) {
            this.imageCounter++;
            const filename = `image-${String(this.imageCounter).padStart(3, '0')}.${imageInfo.extension}`;
            this.extractedImages.push({
                filename,
                data: imageInfo.base64Data,
                mediaType: imageInfo.mediaType
            });
            lines.push(`image::./images/${filename}[]`);
        } else {
            lines.push(`image::${src}[]`);
        }

        // Blank line after image
        lines.push('');

        return lines;
    }

    /**
     * Render a table node as an AsciiDoc |=== block.
     *
     * Header rows (tableHeader cells) are rendered with the [cols] directive
     * and a header separator row. Body rows follow.
     *
     * AsciiDoc table format:
     *   [cols="1,1,1"]
     *   |===
     *   | Header 1 | Header 2
     *
     *   | Cell 1   | Cell 2
     *   |===
     * @private
     */
    _renderTable(node) {
        const rows = node.content ?? [];
        if (rows.length === 0) return [];

        const lines = [];

        // Determine column count from first row
        const firstRow = rows[0];
        const colCount = (firstRow?.content ?? []).length;
        if (colCount === 0) return [];

        lines.push(`[cols="${Array(colCount).fill('1').join(',')}"]`);
        lines.push('|===');

        let headerDone = false;

        for (const row of rows) {
            if (row.type !== 'tableRow') continue;

            const cells = row.content ?? [];
            const isHeaderRow = cells.length > 0 && cells[0].type === 'tableHeader';

            // Header row
            if (isHeaderRow) {
                const headerCells = cells
                    .map(cell => this._renderCellContent(cell))
                    .join(' | ');
                lines.push(`| ${headerCells}`);
                headerDone = true;
            } else {
                // Blank line separates header from body (AsciiDoc convention)
                if (headerDone) {
                    lines.push('');
                    headerDone = false;
                }
                const bodyCells = cells
                    .map(cell => this._renderCellContent(cell))
                    .join(' | ');
                lines.push(`| ${bodyCells}`);
            }
        }

        lines.push('|===');
        lines.push('');

        return lines;
    }

    /**
     * Render the inline text content of a table cell.
     * @private
     */
    _renderCellContent(cell) {
        const paragraphs = cell.content ?? [];
        return paragraphs
            .map(p => this._renderInlineContent(p.content ?? []))
            .join(' ')
            .trim();
    }

    // ─── Inline rendering ────────────────────────────────────────────────────────

    /**
     * Render an array of inline nodes (text, hardBreak) to a plain string.
     * @param {Array} nodes
     * @returns {string}
     * @private
     */
    _renderInlineContent(nodes) {
        return (nodes ?? [])
            .map(node => this._renderInlineNode(node))
            .join('');
    }

    /**
     * Render a single inline node.
     * @private
     */
    _renderInlineNode(node) {
        switch (node.type) {
            case 'text':      return this._renderText(node);
            case 'hardBreak': return ' +\n';
            default:          return '';
        }
    }

    /**
     * Render a text node, applying marks as AsciiDoc inline formatting.
     * @private
     */
    _renderText(node) {
        const text = node.text ?? '';
        if (!text) return '';
        const marks = node.marks ?? [];
        return this._applyMarks(text, marks);
    }

    /**
     * Apply TipTap marks to text, producing AsciiDoc inline formatting.
     *
     * Mark application order (innermost to outermost):
     *   underline → italic → bold (matching DeltaToAsciidocConverter behaviour)
     *
     * Special cases:
     *   bold + italic combined → ***text***
     *   code                   → `text` (no other marks applied inside code)
     *   link                   → link:href[text] AsciiDoc macro
     *   ref, anchor            → plain text pass-through (custom ODIP marks)
     *   textStyle              → color ignored (no AsciiDoc equivalent)
     *
     * @param {string} text
     * @param {Array} marks
     * @returns {string}
     * @private
     */
    _applyMarks(text, marks) {
        const markTypes = new Set(marks.map(m => m.type));

        // Code takes precedence — no nested formatting inside inline code
        if (markTypes.has('code')) {
            return `\`${text}\``;
        }

        // Link macro
        const linkMark = marks.find(m => m.type === 'link');
        if (linkMark) {
            const href = linkMark.attrs?.href ?? '';
            if (href) {
                // Apply other formatting to the link text before wrapping
                const formattedText = this._applyInlineFormatting(text, markTypes);
                return `link:${href}[${formattedText}]`;
            }
        }

        // Internal reference marks — resolved to Antora xref / external link when a
        // refResolver is available; fall back to plain label text if not (e.g. unit tests).
        const oRefMark = marks.find(m => m.type === 'o-ref');
        if (oRefMark && this._refResolver) {
            const xref = this._refResolver.resolveORef(oRefMark.attrs?.value);
            if (xref) return `xref:${xref}[${text}]`;
        }

        const nRefMark = marks.find(m => m.type === 'n-ref');
        if (nRefMark && this._refResolver) {
            const xref = this._refResolver.resolveNRef(nRefMark.attrs?.value);
            if (xref) return `xref:${xref}[${text}]`;
        }

        const dRefMark = marks.find(m => m.type === 'd-ref');
        if (dRefMark && this._refResolver) {
            const url = this._refResolver.resolveDRef(dRefMark.attrs?.value);
            if (url) return `link:${url}[${text}]`;
        }

        return this._applyInlineFormatting(text, markTypes);
    }

    /**
     * Apply bold/italic/underline formatting to text.
     * @param {string} text
     * @param {Set<string>} markTypes
     * @returns {string}
     * @private
     */
    _applyInlineFormatting(text, markTypes) {
        let result = text;

        const hasBold      = markTypes.has('bold');
        const hasItalic    = markTypes.has('italic');
        const hasUnderline = markTypes.has('underline');

        // Bold + italic combination → *** marker
        if (hasBold && hasItalic) {
            result = `***${result}***`;
            if (hasUnderline) result = `__${result}__`;
            return result;
        }

        // Individual formats — innermost first
        if (hasUnderline) result = `__${result}__`;
        if (hasItalic)    result = `*${result}*`;
        if (hasBold)      result = `**${result}**`;

        return result;
    }

    // ─── Image extraction ────────────────────────────────────────────────────────

    /**
     * Extract image data from a data URI.
     * @param {string} dataUrl
     * @returns {{ base64Data: string, mediaType: string, extension: string }|null}
     * @private
     */
    _extractImageData(dataUrl) {
        if (!dataUrl?.startsWith('data:')) return null;

        try {
            const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (!match) return null;

            const mediaType  = match[1];
            const base64Data = match[2];

            const extensionMap = {
                'image/png':     'png',
                'image/jpeg':    'jpg',
                'image/jpg':     'jpg',
                'image/gif':     'gif',
                'image/webp':    'webp',
                'image/svg+xml': 'svg'
            };

            const extension = extensionMap[mediaType] ?? 'png';
            return { base64Data, mediaType, extension };

        } catch (error) {
            console.warn(`Failed to extract image data: ${error.message}`);
            return null;
        }
    }
}

export default TipTapToAsciidocConverter;