/**
 * @file PortfolioChartGenerator.js
 * @description Generates a TipTap image node containing a server-side SVG chart
 * for the portfolio-chart generated block.
 *
 * Produces a horizontal stacked bar chart with two bars per leaf domain chapter
 * (ON on top, OR below), each bar showing DRAFT / ADVANCED / MATURE segments.
 * Parent aggregating chapters (transversal, idl) are excluded.
 *
 * Input row shape (leaf chapters only):
 *   {
 *     number:  string,   — chapter number e.g. "2.1"
 *     title:   string,   — display title from edition.json
 *     on: { draft: number, advanced: number, mature: number },
 *     or: { draft: number, advanced: number, mature: number },
 *   }
 *
 * Output: TipTap node array — an image node (base64 SVG) followed by a caption paragraph.
 *
 * This generator is pure — no store access, no side effects.
 * Requires Node.js Buffer for base64 encoding (server-side only).
 */
export class PortfolioChartGenerator {

    static COLORS = {
        DRAFT:    '#F4B942',
        ADVANCED: '#4472C4',
        MATURE:   '#70AD47',
    };

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * @param {Array<object>} rows
     * @returns {object[]} TipTap node array — [imageNode, captionParagraph]
     */
    static generate(rows) {
        const svg    = this._buildSvg(rows);
        const base64 = Buffer.from(svg, 'utf8').toString('base64');
        return [
            {
                type:  'image',
                attrs: {
                    src: `data:image/svg+xml;base64,${base64}`,
                    alt: 'Portfolio overview by chapter — ON and OR counts split by maturity',
                },
            },
            {
                type:    'paragraph',
                content: [{ type: 'text', text: 'Figure \u2014 Portfolio overview by chapter, showing ON and OR counts split by maturity (DRAFT / ADVANCED / MATURE).' }],
            },
        ];
    }

    // -------------------------------------------------------------------------
    // SVG construction
    // -------------------------------------------------------------------------

    static _buildSvg(rows) {
        const W       = 1275;  // 850 × 1.5
        const LEFT    = 308;   // 205 × 1.5
        const RIGHT   = 83;    // 55  × 1.5
        const TOP     = 83;    // 55  × 1.5
        const BOT     = 68;    // 45  × 1.5
        const BAR     = 17;    // 11  × 1.5 (rounded)
        const GAP     = 5;     // 3   × 1.5 (rounded)
        const SPC     = 27;    // 18  × 1.5
        const CHART_W = W - LEFT - RIGHT;
        const GROUP_H = BAR * 2 + GAP;

        const n      = rows.length;
        const chartH = n * (GROUP_H + SPC) - SPC;
        const H      = TOP + chartH + BOT;

        const maxVal = Math.max(1, ...rows.flatMap(r => [
            r.on.draft + r.on.advanced + r.on.mature,
            r.or.draft + r.or.advanced + r.or.mature,
        ]));

        const scale    = CHART_W / maxVal;
        const tickStep = this._niceTick(maxVal, 6);
        const tickMax  = Math.ceil(maxVal / tickStep) * tickStep;

        const lines = [];

        lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial,Helvetica,sans-serif">`);
        lines.push(`<rect width="${W}" height="${H}" fill="white"/>`);

        // Legend
        lines.push(this._legend(W / 2 + 20, 16));

        // Gridlines, x-axis ticks and labels
        for (let v = 0; v <= tickMax; v += tickStep) {
            const x = (LEFT + v * scale).toFixed(1);
            lines.push(`<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + chartH}" stroke="#ddd" stroke-width="1" stroke-dasharray="4,3"/>`);
            lines.push(`<line x1="${x}" y1="${TOP + chartH}" x2="${x}" y2="${TOP + chartH + 5}" stroke="#aaa" stroke-width="1"/>`);
            lines.push(`<text x="${x}" y="${TOP + chartH + 17}" text-anchor="middle" font-size="15" fill="#666">${v}</text>`);
        }

        // Y-axis
        lines.push(`<line x1="${LEFT}" y1="${TOP}" x2="${LEFT}" y2="${TOP + chartH + 1}" stroke="#aaa" stroke-width="1.5"/>`);

        // X-axis label
        lines.push(`<text x="${(LEFT + CHART_W / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="16.5" fill="#555">Count</text>`);

        // Chapter rows
        for (let i = 0; i < rows.length; i++) {
            const row   = rows[i];
            const gy    = TOP + i * (GROUP_H + SPC);
            const onY   = gy;
            const orY   = gy + BAR + GAP;
            const midY  = (gy + GROUP_H / 2 + 3.5).toFixed(1);

            // Chapter label — right-aligned, vertically centred between bars
            lines.push(`<text x="${LEFT - 22}" y="${midY}" text-anchor="end" font-size="15" fill="#333">${this._esc(`${row.number} ${row.title}`)}</text>`);

            // ON / OR micro-labels
            lines.push(`<text x="${LEFT - 3}" y="${(onY + BAR - 1).toFixed(1)}" text-anchor="end" font-size="11.25" font-weight="600" fill="#555">ON</text>`);
            lines.push(`<text x="${LEFT - 3}" y="${(orY + BAR - 1).toFixed(1)}" text-anchor="end" font-size="11.25" font-weight="600" fill="#555">OR</text>`);

            // ON bar + count
            const onTotal = row.on.draft + row.on.advanced + row.on.mature;
            lines.push(this._segments(LEFT, onY, BAR, scale, row.on));
            if (onTotal > 0) {
                const cx = (LEFT + onTotal * scale + 4).toFixed(1);
                lines.push(`<text x="${cx}" y="${(onY + BAR - 1).toFixed(1)}" font-size="13.5" fill="#333">${onTotal}</text>`);
            }

            // OR bar + count
            const orTotal = row.or.draft + row.or.advanced + row.or.mature;
            lines.push(this._segments(LEFT, orY, BAR, scale, row.or));
            if (orTotal > 0) {
                const cx = (LEFT + orTotal * scale + 4).toFixed(1);
                lines.push(`<text x="${cx}" y="${(orY + BAR - 1).toFixed(1)}" font-size="13.5" fill="#333">${orTotal}</text>`);
            }
        }

        lines.push('</svg>');
        return lines.join('\n');
    }

    // -------------------------------------------------------------------------
    // SVG helpers
    // -------------------------------------------------------------------------

    static _segments(x0, y, h, scale, counts) {
        const parts = [
            [counts.draft,    this.COLORS.DRAFT],
            [counts.advanced, this.COLORS.ADVANCED],
            [counts.mature,   this.COLORS.MATURE],
        ];
        let s = '', cx = x0;
        for (const [val, color] of parts) {
            if (!val) continue;
            const w = val * scale;
            s += `<rect x="${cx.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="${color}"/>`;
            cx += w;
        }
        return s;
    }

    static _legend(cx, y) {
        const items = [
            ['DRAFT',    this.COLORS.DRAFT],
            ['ADVANCED', this.COLORS.ADVANCED],
            ['MATURE',   this.COLORS.MATURE],
        ];
        const BOX = 33, BH = 18, PAD = 9, SEP = 42;
        const totalW = items.reduce((s, [l]) => s + BOX + PAD + l.length * 6.2 + SEP, -SEP);
        let x = cx - totalW / 2;
        let s = '';
        for (const [label, color] of items) {
            s += `<rect x="${x.toFixed(1)}" y="${y}" width="${BOX}" height="${BH}" fill="${color}"/>`;
            s += `<text x="${(x + BOX + PAD).toFixed(1)}" y="${y + BH - 1}" font-size="16.5" fill="#333">${label}</text>`;
            x += BOX + PAD + label.length * 9.3 + SEP;
        }
        return s;
    }

    /**
     * Compute a "nice" tick interval for the given max value and target tick count.
     */
    static _niceTick(maxVal, targetTicks) {
        const raw  = maxVal / targetTicks;
        const pow  = Math.pow(10, Math.floor(Math.log10(raw || 1)));
        const norm = raw / pow;
        const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
        return nice * pow;
    }

    static _esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}