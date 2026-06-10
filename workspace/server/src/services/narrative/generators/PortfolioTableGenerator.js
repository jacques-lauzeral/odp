/**
 * @file PortfolioTableGenerator.js
 * @description Generates a TipTap document fragment for the portfolio-table
 * generated block. Produces a single table with one row per content chapter
 * (including parent containers), showing chapter number, title (as n-ref link),
 * ON count, OR count, and primary scope.
 *
 * Input:
 *   rows: Array<{
 *     number:       string,        — chapter number e.g. "2", "2.1"
 *     title:        string,        — display title from edition.json
 *     itemId:       number,        — for n-ref navigation link
 *     onCount:      string|null,   — null for parent chapters without a domain
 *     orCount:      string|null,   — null for parent chapters without a domain
 *     primaryScope: string,        — brief scope description from edition.json
 *   }>
 *
 * Output: TipTap node array (not a full doc object) — the caller splices these
 * nodes into the narrative document at the placeholder position.
 *
 * This generator is pure — no store access, no side effects.
 */
export class PortfolioTableGenerator {

    /**
     * Generate the TipTap node array.
     *
     * @param {Array<object>} rows
     * @returns {object[]} TipTap node array (single table node wrapped in array)
     */
    static generate(rows) {
        const leafRows = rows.filter(r => !r.isAggregate);
        const onTotal = leafRows.reduce((s, r) => s + (r.onCount != null ? parseInt(r.onCount, 10) : 0), 0);
        const orTotal = leafRows.reduce((s, r) => s + (r.orCount != null ? parseInt(r.orCount, 10) : 0), 0);

        return [
            {
                type: 'table',
                content: [
                    this._headerRow(),
                    ...rows.map(row => this._dataRow(row)),
                    this._totalRow(onTotal, orTotal),
                ],
            },
            this._caption(),
        ];
    }

    // -------------------------------------------------------------------------
    // Row builders
    // -------------------------------------------------------------------------

    static _headerRow() {
        return {
            type: 'tableRow',
            content: [
                this._th('Chapter'),
                this._th('Title'),
                this._th('ONs'),
                this._th('ORs'),
                this._th('Primary scope'),
            ],
        };
    }

    static _dataRow(row) {
        return {
            type: 'tableRow',
            content: [
                this._td([this._text(row.number)]),
                this._td([this._nrefLink(row.itemId, row.title)]),
                this._td([this._text(row.onCount ?? '—')]),
                this._td([this._text(row.orCount ?? '—')]),
                this._td([this._text(row.primaryScope ?? '')]),
            ],
        };
    }

    // -------------------------------------------------------------------------
    // Cell builders
    // -------------------------------------------------------------------------

    static _totalRow(onTotal, orTotal) {
        return {
            type: 'tableRow',
            content: [
                this._td([this._text('Total')]),
                this._td([]),
                this._td([this._text(String(onTotal))]),
                this._td([this._text(String(orTotal))]),
                this._td([]),
            ],
        };
    }

    static _caption() {
        return {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Table # — ON and OR counts by chapter.' }],
        };
    }

    static _th(text) {
        return {
            type: 'tableHeader',
            attrs: { colspan: 1, rowspan: 1, colwidth: null },
            content: [{
                type: 'paragraph',
                content: [{ type: 'text', text }],
            }],
        };
    }

    static _td(inlineNodes) {
        // Filter nulls — _text() returns null for empty strings; TipTap
        // rejects text nodes with empty text.
        const nodes = inlineNodes.filter(Boolean);
        return {
            type: 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: null },
            content: [{
                type: 'paragraph',
                content: nodes.length > 0 ? nodes : [],
            }],
        };
    }

    // -------------------------------------------------------------------------
    // Inline node builders
    // -------------------------------------------------------------------------

    static _text(text) {
        const value = String(text ?? '');
        return value ? { type: 'text', text: value } : null;
    }

    /**
     * Chapter title rendered as an n-ref navigation link.
     * value is the chapter itemId as a string — ChapterBody resolves it to
     * the narrative URL on click.
     *
     * @param {number} itemId
     * @param {string} title
     * @returns {object}
     */
    static _nrefLink(itemId, title) {
        return {
            type: 'text',
            text: title,
            marks: [{
                type: 'n-ref',
                attrs: { value: String(itemId), label: title },
            }],
        };
    }
}