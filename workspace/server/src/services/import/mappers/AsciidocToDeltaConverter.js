/**
 * AsciiDocToDeltaConverter
 *
 * Converts AsciiDoc-style plain text to Quill Delta JSON format.
 * This converter processes text with AsciiDoc formatting markers produced by
 * DocxExtractor's HTML normalization.
 *
 * Supported AsciiDoc structures:
 * ===============================
 *
 * Lists:
 * - ". item" → ordered list item
 * - "* item" → bullet list item
 * - Multiple consecutive items grouped into single list
 *
 * Inline formatting:
 * - "**text**" → bold
 * - "*text*" → italic
 * - "__text__" → underline
 * - Nested formatting: "***text***" → bold + italic
 *
 * Paragraphs:
 * - Lines separated by "\n\n" → separate paragraphs
 * - Single "\n" within content → line break
 *
 * Output format matches Quill Delta specification:
 * {
 *   ops: [
 *     { insert: "text", attributes: { bold: true } },
 *     { insert: "\n", attributes: { list: "ordered" } }
 *   ]
 * }
 *
 * Design rationale:
 * - Unified text format from all extractors (Word, Excel)
 * - Simple, readable markup for debugging
 * - Well-established AsciiDoc conventions
 * - Single converter for all text → Delta transformations
 */
class AsciidocToDeltaConverter {

    /**
     * Convert AsciiDoc-style text to Delta JSON string
     * @param {string} text - AsciiDoc formatted text
     * @returns {string} Stringified Delta JSON
     */
    asciidocToDelta(text) {
        // Handle null/empty input
        if (!text || text.trim() === '') {
            return JSON.stringify({ ops: [] });
        }

        // Split into lines
        const lines = text.split('\n');

        if (lines.length === 0) {
            return JSON.stringify({ ops: [] });
        }

        // Build Delta ops from lines
        const ops = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];
            const trimmedLine = line.trimStart();

            // Skip empty lines (they're paragraph separators)
            if (trimmedLine === '') {
                i++;
                continue;
            }

            // Check for list items (with depth support: ., .., ... or *, **, ***)
            const listMatch = trimmedLine.match(/^([.*]{1,3})\s+/);
            if (listMatch) {
                const marker = listMatch[1];
                const listType = marker.includes('.') ? 'ordered' : 'bullet';
                const indent = marker.length - 1; // 0, 1, or 2 for max 3 levels

                // Process consecutive list items of same type and depth
                while (i < lines.length) {
                    const currentLine = lines[i].trimStart();
                    const currentMatch = currentLine.match(/^([.*]{1,3})\s+/);

                    // Stop if not a list item or different marker pattern
                    if (!currentMatch || currentMatch[1] !== marker) break;

                    const content = currentLine.substring(currentMatch[0].length);

                    // Parse inline formatting in list item
                    const runs = this._parseInlineFormatting(content);

                    // Add text runs
                    for (const run of runs) {
                        if (run.text) {
                            const op = { insert: run.text };
                            if (Object.keys(run.attributes).length > 0) {
                                op.attributes = run.attributes;
                            }
                            ops.push(op);
                        }
                    }

                    // Add newline with list attribute and indent
                    const listAttributes = { list: listType };
                    if (indent > 0) {
                        listAttributes.indent = indent;
                    }
                    ops.push({
                        insert: '\n',
                        attributes: listAttributes
                    });

                    i++;
                }
            } else {
                // Normal text line - parse inline formatting
                const runs = this._parseInlineFormatting(line);

                // Add text runs
                for (const run of runs) {
                    if (run.text) {
                        const op = { insert: run.text };
                        if (Object.keys(run.attributes).length > 0) {
                            op.attributes = run.attributes;
                        }
                        ops.push(op);
                    }
                }

                // Add newline (normal paragraph)
                ops.push({ insert: '\n' });

                i++;
            }
        }

        return JSON.stringify({ ops });
    }

    /**
     * Parse inline formatting from AsciiDoc text
     * Handles: **bold**, *italic*, __underline__, and nested combinations
     *
     * @param {string} text - Line of text with AsciiDoc formatting
     * @returns {Array<{text: string, attributes: Object}>} Text runs with formatting
     * @private
     */
    _parseInlineFormatting(text) {
        const runs = [];
        let i = 0;
        let currentText = '';
        let currentAttributes = {};

        while (i < text.length) {
            // Check for formatting markers
            if (this._matchesAt(text, i, '**')) {
                // Save current run if any
                if (currentText) {
                    runs.push({
                        text: currentText,
                        attributes: { ...currentAttributes }
                    });
                    currentText = '';
                }

                // Find closing **
                const closeIndex = text.indexOf('**', i + 2);
                if (closeIndex !== -1) {
                    const boldText = text.substring(i + 2, closeIndex);

                    // Recursively parse content inside bold (might have nested formatting)
                    const nestedRuns = this._parseInlineFormatting(boldText);
                    for (const run of nestedRuns) {
                        runs.push({
                            text: run.text,
                            attributes: { ...run.attributes, bold: true }
                        });
                    }

                    i = closeIndex + 2;
                    continue;
                }
            } else if (this._matchesAt(text, i, '__')) {
                // Save current run if any
                if (currentText) {
                    runs.push({
                        text: currentText,
                        attributes: { ...currentAttributes }
                    });
                    currentText = '';
                }

                // Find closing __
                const closeIndex = text.indexOf('__', i + 2);
                if (closeIndex !== -1) {
                    const underlineText = text.substring(i + 2, closeIndex);

                    // Recursively parse content inside underline
                    const nestedRuns = this._parseInlineFormatting(underlineText);
                    for (const run of nestedRuns) {
                        runs.push({
                            text: run.text,
                            attributes: { ...run.attributes, underline: true }
                        });
                    }

                    i = closeIndex + 2;
                    continue;
                }
            } else if (this._matchesAt(text, i, '*') && !this._matchesAt(text, i, '**')) {
                // Single * for italic (but not ** for bold)
                // Save current run if any
                if (currentText) {
                    runs.push({
                        text: currentText,
                        attributes: { ...currentAttributes }
                    });
                    currentText = '';
                }

                // Find closing *
                const closeIndex = text.indexOf('*', i + 1);
                if (closeIndex !== -1 && !this._matchesAt(text, closeIndex - 1, '*')) {
                    const italicText = text.substring(i + 1, closeIndex);

                    // Recursively parse content inside italic
                    const nestedRuns = this._parseInlineFormatting(italicText);
                    for (const run of nestedRuns) {
                        runs.push({
                            text: run.text,
                            attributes: { ...run.attributes, italic: true }
                        });
                    }

                    i = closeIndex + 1;
                    continue;
                }
            }

            // Regular character
            currentText += text[i];
            i++;
        }

        // Add final run if any
        if (currentText) {
            runs.push({
                text: currentText,
                attributes: { ...currentAttributes }
            });
        }

        return runs;
    }

    /**
     * Check if text matches a pattern at a specific index
     * @param {string} text - Text to check
     * @param {number} index - Position to check
     * @param {string} pattern - Pattern to match
     * @returns {boolean} True if pattern matches at index
     * @private
     */
    _matchesAt(text, index, pattern) {
        if (index + pattern.length > text.length) {
            return false;
        }
        return text.substring(index, index + pattern.length) === pattern;
    }
}

export default AsciidocToDeltaConverter;