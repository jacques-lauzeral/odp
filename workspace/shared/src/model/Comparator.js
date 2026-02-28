/**
 * Entity comparison utilities for detecting changes
 * Used for import operations to determine CREATE/UPDATE/SKIP
 */
class Comparator {
    // Rich text field definitions
    static RICH_TEXT_FIELDS = {
        OperationalRequirement: ['statement', 'rationale', 'flows', 'privateNotes'],
        OperationalChange: ['purpose', 'initialState', 'finalState', 'details', 'privateNotes'],
        Milestone: ['description']
    };

    /**
     * Compare two OperationalRequirement entities
     * @param {Object} existing - Current entity from database
     * @param {Object} incoming - New entity data from import
     * @returns {Object} { hasChanges: boolean, changes: [...] }
     */
    static compareOperationalRequirement(existing, incoming) {
        const changes = [];
        const richTextFields = this.RICH_TEXT_FIELDS.OperationalRequirement;

        // Compare simple fields
        this._compareField(changes, 'title', existing.title, incoming.title, false);
        this._compareField(changes, 'type', existing.type, incoming.type, false);
        this._compareField(changes, 'statement', existing.statement, incoming.statement, richTextFields.includes('statement'));
        this._compareField(changes, 'rationale', existing.rationale, incoming.rationale, richTextFields.includes('rationale'));
        this._compareField(changes, 'flows', existing.flows, incoming.flows, richTextFields.includes('flows'));
        this._compareField(changes, 'privateNotes', existing.privateNotes, incoming.privateNotes, richTextFields.includes('privateNotes'));
        this._compareField(changes, 'drg', existing.drg, incoming.drg, false);

        // Compare arrays
        this._compareStringArray(changes, 'path', existing.path, incoming.path);

        // Compare reference arrays (by ID only)
        this._compareReferenceArray(changes, 'refinesParents', existing.refinesParents, incoming.refinesParents);
        this._compareReferenceArray(changes, 'implementedONs', existing.implementedONs, incoming.implementedONs);
        this._compareReferenceArray(changes, 'dependsOnRequirements', existing.dependsOnRequirements, incoming.dependsOnRequirements);

        // Compare annotated reference arrays (by ID and note)
        this._compareAnnotatedReferenceArray(changes, 'impactsStakeholderCategories', existing.impactsStakeholderCategories, incoming.impactsStakeholderCategories);
        this._compareAnnotatedReferenceArray(changes, 'impactsData', existing.impactsData, incoming.impactsData);
        this._compareAnnotatedReferenceArray(changes, 'impactsServices', existing.impactsServices, incoming.impactsServices);
        this._compareAnnotatedReferenceArray(changes, 'documentReferences', existing.documentReferences, incoming.documentReferences);

        return {
            hasChanges: changes.length > 0,
            changes
        };
    }

    /**
     * Compare two OperationalChange entities
     * @param {Object} existing - Current entity from database
     * @param {Object} incoming - New entity data from import
     * @returns {Object} { hasChanges: boolean, changes: [...] }
     */
    static compareOperationalChange(existing, incoming) {
        const changes = [];
        const richTextFields = this.RICH_TEXT_FIELDS.OperationalChange;

        // Compare simple fields
        this._compareField(changes, 'title', existing.title, incoming.title, false);
        this._compareField(changes, 'purpose', existing.purpose, incoming.purpose, richTextFields.includes('purpose'));
        this._compareField(changes, 'initialState', existing.initialState, incoming.initialState, richTextFields.includes('initialState'));
        this._compareField(changes, 'finalState', existing.finalState, incoming.finalState, richTextFields.includes('finalState'));
        this._compareField(changes, 'details', existing.details, incoming.details, richTextFields.includes('details'));
        this._compareField(changes, 'privateNotes', existing.privateNotes, incoming.privateNotes, richTextFields.includes('privateNotes'));
        this._compareField(changes, 'visibility', existing.visibility, incoming.visibility, false);
        this._compareField(changes, 'drg', existing.drg, incoming.drg, false);

        // Compare arrays
        this._compareStringArray(changes, 'path', existing.path, incoming.path);

        // Compare reference arrays (by ID only)
        this._compareReferenceArray(changes, 'satisfiesRequirements', existing.satisfiesRequirements, incoming.satisfiesRequirements);
        this._compareReferenceArray(changes, 'supersedsRequirements', existing.supersedsRequirements, incoming.supersedsRequirements);
        this._compareReferenceArray(changes, 'dependsOnChanges', existing.dependsOnChanges, incoming.dependsOnChanges);

        // Compare annotated reference arrays
        this._compareAnnotatedReferenceArray(changes, 'documentReferences', existing.documentReferences, incoming.documentReferences);

        // Note: Milestones are not compared - they have their own lifecycle

        return {
            hasChanges: changes.length > 0,
            changes
        };
    }

    // ==================== Private Helper Methods ====================

    /**
     * Compare a simple field (string, number, etc.)
     * @private
     * @param {Array} changes - Array to accumulate changes
     * @param {string} fieldName - Name of the field being compared
     * @param {*} oldValue - Existing value
     * @param {*} newValue - Incoming value
     * @param {boolean} isRichText - Whether this field contains rich text (Quill format)
     */
    static _compareField(changes, fieldName, oldValue, newValue, isRichText = false) {
        const normalizedOld = isRichText
            ? this._normalizeRichText(oldValue)
            : this._normalizeValue(oldValue);
        const normalizedNew = isRichText
            ? this._normalizeRichText(newValue)
            : this._normalizeValue(newValue);

        if (normalizedOld !== normalizedNew) {
            const change = {
                field: fieldName,
                oldValue: normalizedOld,
                newValue: normalizedNew
            };

            // Include raw values if normalization was applied
            // if (isRichText) {
            //    change.rawOldValue = oldValue;
            //    change.rawNewValue = newValue;
            //}

            changes.push(change);
        }
    }

    /**
     * Compare a simple string array (order matters)
     * @private
     */
    static _compareStringArray(changes, fieldName, oldArray, newArray) {
        const oldNorm = Array.isArray(oldArray) ? oldArray : [];
        const newNorm = Array.isArray(newArray) ? newArray : [];

        if (JSON.stringify(oldNorm) !== JSON.stringify(newNorm)) {
            changes.push({
                field: fieldName,
                oldValue: oldNorm,
                newValue: newNorm
            });
        }
    }

    /**
     * Compare reference arrays (OperationalEntityReference) - only by ID.
     * Order doesn't matter, so we sort IDs before comparing.
     * When a difference is detected, oldValue/newValue carry the original raw
     * reference objects (not just IDs) so callers can render titles and codes.
     * @private
     */
    static _compareReferenceArray(changes, fieldName, oldRefs, newRefs) {
        const oldIds = this._extractIds(oldRefs).sort();
        const newIds = this._extractIds(newRefs).sort();

        if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
            changes.push({
                field: fieldName,
                oldValue: Array.isArray(oldRefs) ? oldRefs : [],
                newValue: Array.isArray(newRefs) ? newRefs : []
            });
        }
    }

    /**
     * Compare annotated reference arrays (AnnotatedReference) - by ID and note.
     * Order doesn't matter, so we sort normalized forms before comparing.
     * When a difference is detected, oldValue/newValue carry the original raw
     * reference objects (not normalized) so callers can render titles and notes.
     * @private
     */
    static _compareAnnotatedReferenceArray(changes, fieldName, oldRefs, newRefs) {
        const oldNormalized = this._normalizeAnnotatedReferences(oldRefs);
        const newNormalized = this._normalizeAnnotatedReferences(newRefs);

        if (JSON.stringify(oldNormalized) !== JSON.stringify(newNormalized)) {
            changes.push({
                field: fieldName,
                oldValue: Array.isArray(oldRefs) ? oldRefs : [],
                newValue: Array.isArray(newRefs) ? newRefs : []
            });
        }
    }

    /**
     * Extract IDs from reference array
     * @private
     */
    static _extractIds(refs) {
        if (!Array.isArray(refs)) return [];
        return refs.map(ref => {
            if (typeof ref === 'number') return ref;
            return ref.id ?? ref.itemId ?? '';
        }).filter(id => id !== '');
    }

    /**
     * Normalize annotated references for comparison
     * Returns sorted array of {id, note} objects
     * @private
     */
    static _normalizeAnnotatedReferences(refs) {
        if (!Array.isArray(refs)) return [];

        return refs
            .map(ref => ({
                id: ref.id ?? ref.itemId ?? '',
                note: this._normalizeValue(ref.note)
            }))
            .filter(ref => ref.id !== '')
            .sort((a, b) => {
                // Numeric comparison for IDs
                if (a.id !== b.id) return a.id - b.id;
                return a.note.localeCompare(b.note);
            });
    }

    /**
     * Normalize a value for comparison
     * - null/undefined → empty string
     * - strings → trimmed
     * - other types → as-is
     * @private
     */
    static _normalizeValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value.trim();
        return value;
    }

    /**
     * Normalize rich text (Quill format) for comparison
     * - null/undefined → empty string
     * - empty string → empty string
     * - {"ops":[]} → empty string
     * - {"ops":[{"insert":"\n"}]} → empty string (common Quill empty state)
     * - valid non-empty Quill → keep as-is
     * - malformed JSON → log warning, treat as plain string
     *
     * Handles double-encoded JSON (e.g., "{\"ops\":[]}" as a string)
     * @private
     */
    static _normalizeRichText(value) {
        // Handle null/undefined
        if (value === null || value === undefined) return '';

        // Handle empty string
        if (value === '') return '';

        // If not a string, convert to string and trim
        if (typeof value !== 'string') {
            return String(value).trim();
        }

        const trimmed = value.trim();
        if (trimmed === '') return '';

        // Try to parse as JSON (Quill format)
        // Handle double-encoded JSON by parsing twice if needed
        try {
            let parsed = JSON.parse(trimmed);

            // If parsed result is a string, it was double-encoded - parse again
            if (typeof parsed === 'string') {
                parsed = JSON.parse(parsed);
            }

            // Check if it's a Quill delta structure
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ops)) {
                const ops = parsed.ops;

                // Empty ops array
                if (ops.length === 0) return '';

                // Single newline insert (common Quill empty state)
                if (ops.length === 1 &&
                    ops[0].insert === '\n' &&
                    Object.keys(ops[0]).length === 1) {
                    return '';
                }

                // Non-empty Quill content - normalize by re-stringifying
                return JSON.stringify(parsed);
            }

            // Valid JSON but not Quill format - keep as normalized JSON string
            return JSON.stringify(parsed);

        } catch (error) {
            // Not valid JSON - treat as plain string
            console.warn(`Rich text field contains non-JSON content, treating as plain string: ${error.message}`);
            return trimmed;
        }
    }
}

export default Comparator;