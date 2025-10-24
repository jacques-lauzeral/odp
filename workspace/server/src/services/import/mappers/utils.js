/**
 * Mapper Utilities
 * Shared utilities for DrG mappers
 */

/**
 * Check if text starts with any of the given prefixes (case-insensitive)
 *
 * @param {string} text - Text to check
 * @param {...string} prefixes - One or more prefix strings to test
 * @returns {boolean} True if text starts with any prefix
 *
 * @example
 * textStartsWith('Flow example:', 'Flow:', 'Flow example:')
 * // Returns: true
 *
 * @example
 * textStartsWith('CONOPS Reference:', 'conops reference')
 * // Returns: true
 */
export function textStartsWith(text, ...prefixes) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    return prefixes.some(prefix => lowerText.startsWith(prefix.toLowerCase()));
}

/**
 * Convert plain text to stringified Quill Delta format
 *
 * Processing:
 * - Removes leading and trailing blank lines
 * - Detects consecutive lines starting with '- ' and converts to bullet list items
 *
 * @param {string} text - Plain text content
 * @returns {string} Stringified Delta JSON
 *
 * @example
 * textToDelta('Statement: This is a requirement')
 * // Returns: '{"ops":[{"insert":"Statement: This is a requirement"},{"insert":"\\n"}]}'
 *
 * @example
 * textToDelta('Items:\n- First item\n- Second item\nNormal text')
 * // Returns bullet list ops for the two items, then normal text
 */
export function textToDelta(text) {
    if (!text || text.trim() === '') {
        return JSON.stringify({ ops: [] });
    }

    // Split into lines and remove leading/trailing blank lines
    const lines = text.split('\n');
    let startIndex = 0;
    let endIndex = lines.length - 1;

    // Remove leading blank lines
    while (startIndex < lines.length && lines[startIndex].trim() === '') {
        startIndex++;
    }

    // Remove trailing blank lines
    while (endIndex >= startIndex && lines[endIndex].trim() === '') {
        endIndex--;
    }

    const trimmedLines = lines.slice(startIndex, endIndex + 1);

    if (trimmedLines.length === 0) {
        return JSON.stringify({ ops: [] });
    }

    const ops = [];
    let i = 0;

    while (i < trimmedLines.length) {
        const line = trimmedLines[i];

        // Skip empty lines
        if (line.trim() === '') {
            i++;
            continue;
        }

        // Check if line starts with '- '
        if (line.trimStart().startsWith('- ')) {
            // Process consecutive bullet list items
            while (i < trimmedLines.length && trimmedLines[i].trimStart().startsWith('- ')) {
                const bulletLine = trimmedLines[i];
                const content = bulletLine.trimStart().substring(2); // Remove '- '

                ops.push({
                    insert: content
                });
                ops.push({
                    insert: '\n',
                    attributes: { list: 'bullet' }
                });

                i++;
            }
            // Don't add extra newline after bullet group - Quill handles spacing
        } else {
            // Normal text line
            ops.push({
                insert: line
            });
            ops.push({
                insert: '\n'
            });
            i++;
        }
    }

    const delta = { ops };
    return JSON.stringify(delta);
}