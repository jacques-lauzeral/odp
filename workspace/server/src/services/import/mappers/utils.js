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
