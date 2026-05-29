/**
 * Converts source JSON blocks[] to a Quill Delta JSON string.
 *
 * Handles the block types present in ODIP distributed edition source files:
 *   - heading      → Quill header attribute (levels 1–6)
 *   - paragraph    → plain Quill ops with inline formatting
 *   - bullet       → Quill list:bullet attribute
 *   - numbered     → Quill list:ordered attribute
 *   - figure       → Quill image embed op (data URI from base64)
 *   - caption      → italic paragraph
 *   - placeholder_section, page_break → silently skipped
 *
 * Each block carries content as either:
 *   - ops[]  — Quill-compatible op array (pass-through, attributes preserved)
 *   - text   — plain string (wrapped in a single insert op)
 *
 * Inline attributes are preserved as-is (bold, italic, underline, color,
 * ref, anchor, link, …). Unknown attributes pass through to Quill without
 * transformation — the Quill editor ignores attributes it does not recognise,
 * and the publication pipeline forwards them through DeltaToAsciidocConverter.
 *
 * Output is a JSON string (not an object) — consistent with how rich-text
 * fields are stored in the ODIP database (Neo4j property string).
 *
 * Usage:
 *   const deltaJson = BlocksToQuillDeltaConverter.convert(blocks);
 *   // → '{"ops":[...]}'  or null if blocks is empty/null
 */
class BlocksToQuillDeltaConverter {

    /**
     * Convert a blocks array to a Quill Delta JSON string.
     * @param {Array|null|undefined} blocks - Source file blocks array
     * @returns {string|null} Quill Delta JSON string, or null if no content
     */
    convert(blocks) {
        if (!blocks || blocks.length === 0) {
            return null;
        }

        const ops = [];

        for (const block of blocks) {
            this._convertBlock(block, ops);
        }

        if (ops.length === 0) {
            return null;
        }

        // Quill Delta must end with a plain newline insert
        const last = ops[ops.length - 1];
        if (typeof last?.insert !== 'string' || !last.insert.endsWith('\n')) {
            ops.push({ insert: '\n' });
        }

        return JSON.stringify({ ops });
    }

    /**
     * Dispatch a single block to its type-specific handler.
     * @private
     */
    _convertBlock(block, ops) {
        switch (block.type) {
            case 'heading':
                this._convertHeading(block, ops);
                break;
            case 'paragraph':
                this._convertParagraph(block, ops);
                break;
            case 'bullet':
                this._convertList(block, ops, 'bullet');
                break;
            case 'numbered':
                this._convertList(block, ops, 'ordered');
                break;
            case 'figure':
                this._convertFigure(block, ops);
                break;
            case 'table':
                this._convertTable(block, ops);
                break;
            case 'caption':
                this._convertCaption(block, ops);
                break;
            case 'placeholder_section':
            case 'page_break':
                // Intentionally skipped — structural/layout-only blocks
                break;
            default:
                // Unknown block type — skip silently, no error
                break;
        }
    }

    /**
     * Convert a heading block.
     * Emits inline ops for the heading text, followed by a newline op
     * carrying the Quill header attribute.
     * @private
     */
    _convertHeading(block, ops) {
        const level = block.level ?? 1;
        const inlineOps = this._extractInlineOps(block);

        if (inlineOps.length === 0) {
            return;
        }

        ops.push(...inlineOps);
        ops.push({ insert: '\n', attributes: { header: level } });
    }

    /**
     * Convert a paragraph block.
     * Emits inline ops followed by a plain newline.
     * @private
     */
    _convertParagraph(block, ops) {
        const inlineOps = this._extractInlineOps(block);

        if (inlineOps.length === 0) {
            return;
        }

        ops.push(...inlineOps);

        // Avoid double newline if the last inline op already ends with \n
        const last = inlineOps[inlineOps.length - 1];
        if (typeof last?.insert !== 'string' || !last.insert.endsWith('\n')) {
            ops.push({ insert: '\n' });
        }
    }

    /**
     * Convert a bullet or numbered list block.
     * Emits inline ops followed by a newline op carrying the list attribute.
     * Quill represents list items as a line whose terminating \n has
     * attributes: { list: 'bullet' } or { list: 'ordered' }.
     * @private
     */
    _convertList(block, ops, listType) {
        const inlineOps = this._extractInlineOps(block);

        if (inlineOps.length === 0) {
            return;
        }

        // Strip any trailing \n from the inline content — the list newline carries the attribute
        const lastInline = inlineOps[inlineOps.length - 1];
        if (typeof lastInline?.insert === 'string' && lastInline.insert.endsWith('\n')) {
            lastInline.insert = lastInline.insert.slice(0, -1);
            if (lastInline.insert === '') {
                inlineOps.pop();
            }
        }

        if (inlineOps.length === 0) {
            return;
        }

        ops.push(...inlineOps);
        ops.push({ insert: '\n', attributes: { list: listType } });
    }

    /**
     * Convert a figure block.
     * Emits a Quill image embed op using a data URI assembled from the
     * block's base64 payload, followed by a plain newline.
     * @private
     */
    _convertFigure(block, ops) {
        const { data, media_type } = block.image ?? {};
        if (!data || !media_type) {
            return;
        }
        ops.push({ insert: { image: `data:${media_type};base64,${data}` } });
        ops.push({ insert: '\n' });
    }

    /**
     * Convert a table block to a Quill code-block representation.
     *
     * Tables are stored as plain-text code blocks — an interim format until
     * a proper Quill table blot is implemented in RichTextComponent.
     *
     * Format:
     *   ** cell | cell          ← header row(s), prefixed with "** "
     *   ---                     ← separator
     *   cell | cell             ← body rows
     *
     * Header cells are extracted as plain text from their Delta ops arrays.
     * Body cells are plain strings in the source format.
     *
     * Each line is emitted as { insert: '...\n', attributes: { 'code-block': true } }.
     * A plain newline follows the block to visually separate it from subsequent content.
     *
     * TODO: replace with proper table blot ops when RichTextComponent implements table support.
     * @private
     */
    _convertTable(block, ops) {
        const headers = block.headers ?? [];
        const rows    = block.rows    ?? [];

        if (headers.length === 0 && rows.length === 0) {
            return;
        }

        // Header rows — extract plain text from Delta ops arrays
        for (const headerDelta of headers) {
            const text = this._extractPlainText(headerDelta.ops ?? []);
            ops.push({ insert: `** ${text}\n`, attributes: { 'code-block': true } });
        }

        // Separator
        if (headers.length > 0 && rows.length > 0) {
            ops.push({ insert: '---\n', attributes: { 'code-block': true } });
        }

        // Body rows — plain string cells joined with ' | '
        for (const row of rows) {
            const text = row.map(cell => String(cell ?? '')).join(' | ');
            ops.push({ insert: `${text}\n`, attributes: { 'code-block': true } });
        }

        // Blank line after the block
        ops.push({ insert: '\n' });
    }

    /**
     * Extract plain text from a Quill ops array, concatenating all string inserts.
     * Used to reduce header Delta ops to a plain string for code-block rendering.
     * @private
     */
    _extractPlainText(ops) {
        return ops
            .map(op => (typeof op.insert === 'string' ? op.insert : ''))
            .join('');
    }

    /**
     * Convert a caption block.
     * Emits the caption text as an italic paragraph.
     * Captions carry plain text only (no ops array in the source format).
     * @private
     */
    _convertCaption(block, ops) {
        const text = block.text;
        if (typeof text !== 'string' || text.length === 0) {
            return;
        }
        ops.push({ insert: text, attributes: { italic: true } });
        ops.push({ insert: '\n' });
    }

    /**
     * Extract inline ops from a block's content.
     * Prefers block.ops (Quill-compatible array); falls back to block.text
     * (plain string). Returns an array of op objects.
     * @private
     */
    _extractInlineOps(block) {
        if (Array.isArray(block.ops) && block.ops.length > 0) {
            return block.ops.map(op => this._normaliseOp(op));
        }

        if (typeof block.text === 'string' && block.text.length > 0) {
            return [{ insert: block.text }];
        }

        return [];
    }

    /**
     * Normalise a single op from the source format.
     * The source ops are already Quill-compatible; this method ensures
     * structural correctness and strips ops with empty insert strings.
     *
     * Attribute handling:
     *   - bold, italic, underline, strike, color, background → preserved as-is
     *   - link → preserved as-is
     *   - ref, anchor → preserved as-is (custom ODIP blots, ignored by stock Quill)
     *   - header, list → should not appear on inline ops; preserved but noted
     *
     * @private
     */
    _normaliseOp(op) {
        const normalised = { insert: op.insert ?? '' };

        if (op.attributes && typeof op.attributes === 'object') {
            const attrs = { ...op.attributes };

            // Remove empty-string attributes — Quill treats them as no-op
            for (const [key, value] of Object.entries(attrs)) {
                if (value === null || value === undefined || value === false) {
                    delete attrs[key];
                }
            }

            if (Object.keys(attrs).length > 0) {
                normalised.attributes = attrs;
            }
        }

        return normalised;
    }
}

export default new BlocksToQuillDeltaConverter();