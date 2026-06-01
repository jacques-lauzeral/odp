/**
 * Converts source JSON blocks[] to a TipTap document JSON string.
 *
 * Handles the block types present in ODIP distributed edition source files:
 *   - heading      → TipTap heading node (levels 1–6)
 *   - paragraph    → TipTap paragraph node with inline marks
 *   - bullet       → TipTap bulletList > listItem > paragraph
 *   - numbered     → TipTap orderedList > listItem > paragraph
 *   - figure       → TipTap image node (data URI from base64)
 *   - caption      → TipTap paragraph node with italic mark
 *   - table        → TipTap table > tableRow > tableHeader/tableCell nodes
 *   - placeholder_section, page_break → silently skipped
 *
 * Each block carries content as either:
 *   - ops[]  — Quill-compatible op array (converted to TipTap text nodes + marks)
 *   - text   — plain string (wrapped in a single text node)
 *
 * Inline attribute mapping (Quill attributes → TipTap marks):
 *   bold, italic, underline → standard TipTap marks
 *   link                    → { type: 'link', attrs: { href } }
 *   ref, anchor             → custom marks preserved as-is for publication pipeline
 *
 * Output is a JSON string — consistent with how rich-text fields are stored
 * in the ODIP database (Neo4j property string).
 *
 * Usage:
 *   const json = BlocksToTipTapConverter.convert(blocks);
 *   // → '{"type":"doc","content":[...]}' or null if blocks is empty/null
 */
class BlocksToTipTapConverter {

    /**
     * Convert a blocks array to a TipTap document JSON string.
     * @param {Array|null|undefined} blocks - Source file blocks array
     * @returns {string|null} TipTap document JSON string, or null if no content
     */
    convert(blocks) {
        if (!blocks || blocks.length === 0) {
            return null;
        }

        const content = [];

        // Consecutive bullet/numbered blocks are merged into a single list node.
        let i = 0;
        while (i < blocks.length) {
            const block = blocks[i];

            if (block.type === 'bullet' || block.type === 'numbered') {
                const listType = block.type === 'bullet' ? 'bulletList' : 'orderedList';
                const items = [];

                // Consume all consecutive same-type list blocks
                while (i < blocks.length && blocks[i].type === block.type) {
                    const item = this._convertListItem(blocks[i]);
                    if (item) items.push(item);
                    i++;
                }

                if (items.length > 0) {
                    content.push({ type: listType, content: items });
                }
            } else {
                const node = this._convertBlock(block);
                if (node) content.push(node);
                i++;
            }
        }

        if (content.length === 0) {
            return null;
        }

        return JSON.stringify({ type: 'doc', content });
    }

    /**
     * Dispatch a single non-list block to its type-specific handler.
     * Returns a TipTap node object, or null to skip.
     * @private
     */
    _convertBlock(block) {
        switch (block.type) {
            case 'heading':         return this._convertHeading(block);
            case 'paragraph':       return this._convertParagraph(block);
            case 'figure':          return this._convertFigure(block);
            case 'table':           return this._convertTable(block);
            case 'caption':         return this._convertCaption(block);
            case 'placeholder_section':
            case 'page_break':
                return null;
            default:
                return null;
        }
    }

    /**
     * Convert a heading block.
     * @private
     */
    _convertHeading(block) {
        const level = block.level ?? 1;
        const content = this._extractInlineNodes(block);
        if (content.length === 0) return null;
        return { type: 'heading', attrs: { level }, content };
    }

    /**
     * Convert a paragraph block.
     * @private
     */
    _convertParagraph(block) {
        const content = this._extractInlineNodes(block);
        if (content.length === 0) return null;
        return { type: 'paragraph', content };
    }

    /**
     * Convert a bullet or numbered list block to a listItem node.
     * @private
     */
    _convertListItem(block) {
        const content = this._extractInlineNodes(block);
        if (content.length === 0) return null;
        return {
            type: 'listItem',
            content: [{ type: 'paragraph', content }]
        };
    }

    /**
     * Convert a figure block to a TipTap image node.
     * @private
     */
    _convertFigure(block) {
        const { data, media_type } = block.image ?? {};
        if (!data || !media_type) return null;
        return {
            type: 'image',
            attrs: { src: `data:${media_type};base64,${data}`, alt: null, title: null }
        };
    }

    /**
     * Convert a caption block to an italic paragraph.
     * @private
     */
    _convertCaption(block) {
        const text = block.text;
        if (typeof text !== 'string' || text.length === 0) return null;
        return {
            type: 'paragraph',
            content: [{
                type: 'text',
                text,
                marks: [{ type: 'italic' }]
            }]
        };
    }

    /**
     * Convert a table block to a TipTap table node.
     *
     * Source format:
     *   headers[] — array of { ops[] }, one delta per column header cell
     *   rows[][]  — array of arrays of plain strings (body cells)
     *
     * TipTap table structure:
     *   table > tableRow > tableHeader (one row, one cell per headers[] entry)
     *   table > tableRow > tableCell  (body rows)
     *
     * Header cell content is extracted from each column's Delta ops array,
     * preserving inline marks (bold, italic, etc.).
     * Body cells are plain strings.
     * @private
     */
    _convertTable(block) {
        const headers = block.headers ?? [];
        const rows    = block.rows    ?? [];

        if (headers.length === 0 && rows.length === 0) return null;

        const tableRows = [];

        // Header row — headers[] has one delta per column; build a single tableRow
        // with one tableHeader cell per entry.
        if (headers.length > 0) {
            const headerCells = headers.map(headerDelta => {
                const inlineNodes = Array.isArray(headerDelta.ops) && headerDelta.ops.length > 0
                    ? headerDelta.ops.map(op => this._opToTextNode(op)).filter(Boolean)
                    : [];
                return {
                    type: 'tableHeader',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null },
                    content: [{ type: 'paragraph', content: inlineNodes }]
                };
            });

            tableRows.push({ type: 'tableRow', content: headerCells });
        }

        // Body rows
        for (const row of rows) {
            if (!Array.isArray(row) || row.length === 0) continue;

            tableRows.push({
                type: 'tableRow',
                content: row.map(cell => ({
                    type: 'tableCell',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null },
                    content: [{
                        type: 'paragraph',
                        content: cell ? [{ type: 'text', text: String(cell) }] : []
                    }]
                }))
            });
        }

        if (tableRows.length === 0) return null;

        return { type: 'table', content: tableRows };
    }

    /**
     * Extract TipTap inline text nodes from a block's content.
     * Prefers block.ops (Quill-compatible array); falls back to block.text.
     * Returns an array of TipTap text node objects.
     * @private
     */
    _extractInlineNodes(block) {
        if (Array.isArray(block.ops) && block.ops.length > 0) {
            return block.ops
                .map(op => this._opToTextNode(op))
                .filter(Boolean);
        }

        if (typeof block.text === 'string' && block.text.length > 0) {
            return [{ type: 'text', text: block.text }];
        }

        return [];
    }

    /**
     * Convert a single Quill op to a TipTap text node.
     * Image ops (insert is an object) are skipped — figures are handled
     * by _convertFigure at the block level.
     *
     * Attribute → mark mapping:
     *   bold, italic, underline → { type: 'bold' | 'italic' | 'underline' }
     *   link                    → { type: 'link', attrs: { href: value } }
     *   ref                     → { type: 'ref', attrs: { value } }    (custom ODIP mark)
     *   anchor                  → { type: 'anchor', attrs: { value } } (custom ODIP mark)
     *   color                   → { type: 'textStyle', attrs: { color: value } }
     *   All others              → { type: key, attrs: { value } }      (pass-through)
     *
     * @private
     */
    _opToTextNode(op) {
        if (typeof op.insert !== 'string') return null;

        // Strip trailing newlines — block structure is conveyed by the node tree,
        // not by newline characters within text nodes.
        const text = op.insert.replace(/\n+$/, '');
        if (text.length === 0) return null;

        const node = { type: 'text', text };

        if (op.attributes && typeof op.attributes === 'object') {
            const marks = this._attrsToMarks(op.attributes);
            if (marks.length > 0) {
                node.marks = marks;
            }
        }

        return node;
    }

    /**
     * Convert a Quill attributes object to a TipTap marks array.
     * @private
     */
    _attrsToMarks(attributes) {
        const marks = [];

        for (const [key, value] of Object.entries(attributes)) {
            if (value === null || value === undefined || value === false) continue;

            switch (key) {
                case 'bold':
                case 'italic':
                case 'underline':
                case 'strike':
                    marks.push({ type: key });
                    break;
                case 'link':
                    marks.push({ type: 'link', attrs: { href: value, target: '_blank' } });
                    break;
                case 'color':
                    marks.push({ type: 'textStyle', attrs: { color: value } });
                    break;
                case 'ref':
                    marks.push({ type: 'ref', attrs: { value } });
                    break;
                case 'anchor':
                    marks.push({ type: 'anchor', attrs: { value } });
                    break;
                default:
                    // Pass-through — publication pipeline may consume unknown marks
                    marks.push({ type: key, attrs: { value } });
                    break;
            }
        }

        return marks;
    }
}

export default new BlocksToTipTapConverter();