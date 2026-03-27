/**
 * Projection definitions for OperationalRequirement and OperationalChange.
 *
 * Three field sets are defined per entity type:
 *   summary    — scalar and reference fields sufficient for list views
 *   rich-text  — rich text content fields (excluded from summary)
 *   derived    — reverse-traversal attributes (available on extended projection only)
 *
 * Three projections are defined:
 *   summary    — summary fields only
 *   standard   — summary + rich-text fields
 *   extended   — summary + rich-text + derived fields
 */

// ---------------------------------------------------------------------------
// Field set → projection mapping
// ---------------------------------------------------------------------------

const PROJECTION_FIELD_SETS = {
    'summary':  ['summary'],
    'standard': ['summary', 'rich-text'],
    'extended': ['summary', 'rich-text', 'derived'],
};

// ---------------------------------------------------------------------------
// (entity-type, field-set) → field list
// ---------------------------------------------------------------------------

const FIELD_SET_FIELDS = {
    'requirement': {
        'summary': [
            'itemId',
            'versionId',
            'version',
            'title',
            'code',
            'createdAt',
            'createdBy',
            'type',
            'drg',
            'maturity',
            'path',
            'tentative',
            'refinesParents',
            'implementedONs',
            'impactedStakeholders',
            'impactedDomains',
            'strategicDocuments',
            'dependencies',
        ],
        'rich-text': [
            'statement',
            'rationale',
            'flows',
            'nfrs',
            'privateNotes',
            'additionalDocumentation',
        ],
        'derived': [
            'implementedByORs',
            'implementedByOCs',
            'decommissionedByOCs',
            'refinedBy',
            'requiredByORs',
        ],
    },

    'change': {
        'summary': [
            'itemId',
            'versionId',
            'version',
            'title',
            'code',
            'createdAt',
            'createdBy',
            'drg',
            'maturity',
            'path',
            'cost',
            'orCosts',
            'implementedORs',
            'decommissionedORs',
            'dependencies',
            'milestones',
        ],
        'rich-text': [
            'purpose',
            'initialState',
            'finalState',
            'details',
            'privateNotes',
            'additionalDocumentation',
        ],
        'derived': [
            'requiredByOCs',
        ],
    },
};

// ---------------------------------------------------------------------------
// Valid values
// ---------------------------------------------------------------------------

const VALID_PROJECTIONS = Object.keys(PROJECTION_FIELD_SETS);
const VALID_ENTITY_TYPES = Object.keys(FIELD_SET_FIELDS);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Return the field set names included in a projection.
 * @param {string} projectionName - 'summary' | 'standard' | 'extended'
 * @returns {string[]} Ordered list of field set names
 * @throws {Error} If projectionName is not recognised
 */
export function getProjectionFieldSets(projectionName) {
    const sets = PROJECTION_FIELD_SETS[projectionName];
    if (!sets) {
        throw new Error(
            `Unknown projection '${projectionName}'. Valid values: ${VALID_PROJECTIONS.join(', ')}`
        );
    }
    return sets;
}

/**
 * Return the fields belonging to a field set for a given entity type.
 * @param {string} entityType - 'requirement' | 'change'
 * @param {string} fieldSetName - 'summary' | 'rich-text' | 'derived'
 * @returns {string[]} List of field names
 * @throws {Error} If entityType or fieldSetName is not recognised
 */
export function getFieldSetFields(entityType, fieldSetName) {
    const entitySets = FIELD_SET_FIELDS[entityType];
    if (!entitySets) {
        throw new Error(
            `Unknown entity type '${entityType}'. Valid values: ${VALID_ENTITY_TYPES.join(', ')}`
        );
    }
    const fields = entitySets[fieldSetName];
    if (!fields) {
        throw new Error(
            `Unknown field set '${fieldSetName}' for entity type '${entityType}'.`
        );
    }
    return fields;
}

/**
 * Return the full flat list of fields included in a projection for a given entity type.
 * Convenience composition of getProjectionFieldSets + getFieldSetFields.
 * @param {string} entityType - 'requirement' | 'change'
 * @param {string} projectionName - 'summary' | 'standard' | 'extended'
 * @returns {string[]} Deduplicated ordered list of field names
 * @throws {Error} If entityType or projectionName is not recognised
 */
export function getProjectionFields(entityType, projectionName) {
    const fieldSets = getProjectionFieldSets(projectionName);
    const seen = new Set();
    const fields = [];
    for (const setName of fieldSets) {
        for (const field of getFieldSetFields(entityType, setName)) {
            if (!seen.has(field)) {
                seen.add(field);
                fields.push(field);
            }
        }
    }
    return fields;
}