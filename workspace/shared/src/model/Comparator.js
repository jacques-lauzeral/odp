/**
 * Entity comparison utilities for detecting changes
 * Used for import operations to determine CREATE/UPDATE/SKIP
 */
class Comparator {
    /**
     * Compare two OperationalRequirement entities
     * @param {Object} existing - Current entity from database
     * @param {Object} incoming - New entity data from import
     * @returns {Object} { hasChanges: boolean, changes: [...] }
     */
    static compareOperationalRequirement(existing, incoming) {
        const changes = [];

        // Compare simple fields
        this._compareField(changes, 'title', existing.title, incoming.title);
        this._compareField(changes, 'type', existing.type, incoming.type);
        this._compareField(changes, 'statement', existing.statement, incoming.statement);
        this._compareField(changes, 'rationale', existing.rationale, incoming.rationale);
        this._compareField(changes, 'flows', existing.flows, incoming.flows);
        this._compareField(changes, 'privateNotes', existing.privateNotes, incoming.privateNotes);
        this._compareField(changes, 'drg', existing.drg, incoming.drg);

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

        // Compare simple fields
        this._compareField(changes, 'title', existing.title, incoming.title);
        this._compareField(changes, 'purpose', existing.purpose, incoming.purpose);
        this._compareField(changes, 'initialState', existing.initialState, incoming.initialState);
        this._compareField(changes, 'finalState', existing.finalState, incoming.finalState);
        this._compareField(changes, 'details', existing.details, incoming.details);
        this._compareField(changes, 'privateNotes', existing.privateNotes, incoming.privateNotes);
        this._compareField(changes, 'visibility', existing.visibility, incoming.visibility);
        this._compareField(changes, 'drg', existing.drg, incoming.drg);

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
     */
    static _compareField(changes, fieldName, oldValue, newValue) {
        const normalizedOld = this._normalizeValue(oldValue);
        const normalizedNew = this._normalizeValue(newValue);

        if (normalizedOld !== normalizedNew) {
            changes.push({
                field: fieldName,
                oldValue: normalizedOld,
                newValue: normalizedNew
            });
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
     * Compare reference arrays (OperationalEntityReference) - only by ID
     * Order doesn't matter, so we sort before comparing
     * @private
     */
    static _compareReferenceArray(changes, fieldName, oldRefs, newRefs) {
        const oldIds = this._extractIds(oldRefs).sort();
        const newIds = this._extractIds(newRefs).sort();

        if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
            changes.push({
                field: fieldName,
                oldValue: oldIds,
                newValue: newIds
            });
        }
    }

    /**
     * Compare annotated reference arrays (AnnotatedReference) - by ID and note
     * Order doesn't matter, so we sort before comparing
     * @private
     */
    static _compareAnnotatedReferenceArray(changes, fieldName, oldRefs, newRefs) {
        const oldNormalized = this._normalizeAnnotatedReferences(oldRefs);
        const newNormalized = this._normalizeAnnotatedReferences(newRefs);

        if (JSON.stringify(oldNormalized) !== JSON.stringify(newNormalized)) {
            changes.push({
                field: fieldName,
                oldValue: oldNormalized,
                newValue: newNormalized
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
            if (typeof ref === 'string') return ref;
            return ref.id || ref.itemId || '';
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
                id: ref.id || ref.itemId || '',
                note: this._normalizeValue(ref.note)
            }))
            .filter(ref => ref.id !== '')
            .sort((a, b) => {
                // Sort by id first, then by note
                if (a.id !== b.id) return a.id.localeCompare(b.id);
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
}

export default Comparator;