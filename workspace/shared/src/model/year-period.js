/**
 * Shared year-period parse / format utilities.
 *
 * Used by:
 *   - CollectionEntityForm  `tentative` field type
 *   - TemporalGrid          zoom control input
 *
 * Format: 'YYYY' (single year) or 'YYYY-ZZZZ' (inclusive year range).
 *
 * Semantics:
 *   'YYYY'       → interval [YYYY/01/01, YYYY+1/01/01[
 *   'YYYY-ZZZZ'  → interval [YYYY/01/01, ZZZZ+1/01/01[
 */

/**
 * Parse a year-period string into { startYear, endYear }.
 *
 * @param {string} str
 * @param {{ minYear?: number, maxYear?: number }} options
 * @returns {{ startYear: number, endYear: number } | null}
 */
export function parseYearPeriod(str, options = {}) {
    if (!str || typeof str !== 'string') return null;

    const { minYear = 1900, maxYear = 2100 } = options;
    const s = str.trim();

    const single = s.match(/^(\d{4})$/);
    if (single) {
        const y = parseInt(single[1], 10);
        if (y >= minYear && y <= maxYear) {
            return { startYear: y, endYear: y };
        }
        return null;
    }

    const range = s.match(/^(\d{4})-(\d{4})$/);
    if (range) {
        const start = parseInt(range[1], 10);
        const end   = parseInt(range[2], 10);
        if (start <= end && start >= minYear && end <= maxYear) {
            return { startYear: start, endYear: end };
        }
        return null;
    }

    return null;
}

/**
 * Format a { startYear, endYear } object as a display string.
 *
 * @param {{ startYear: number, endYear: number } | null} period
 * @returns {string}
 */
export function formatYearPeriod(period) {
    if (!period) return '';
    const { startYear, endYear } = period;
    return startYear === endYear ? String(startYear) : `${startYear}-${endYear}`;
}

/**
 * Parse a [startYear, endYear] integer array (as stored on ON.tentative)
 * into a { startYear, endYear } object.
 *
 * @param {number[] | null} arr
 * @returns {{ startYear: number, endYear: number } | null}
 */
export function parseTentativeArray(arr) {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const [s, e] = arr;
    if (typeof s !== 'number' || typeof e !== 'number') return null;
    return { startYear: s, endYear: e };
}

/**
 * Format a [startYear, endYear] integer array for display.
 *
 * @param {number[] | null} arr
 * @returns {string}
 */
export function formatTentativeArray(arr) {
    return formatYearPeriod(parseTentativeArray(arr));
}