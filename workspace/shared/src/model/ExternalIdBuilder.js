/**
 * Builds standardized external IDs for all ODP entity types
 *
 * External ID Format: {type}:{type-specific-format}
 *
 * Type-specific formats:
 * - data|service|stakeholder: {parent.externalId}/{name} (parent optional) - name as-is
 * - document: {name_normalized}
 * - wave: {name_normalized}
 * - on|or: {drg}/{parent.externalId}/{title_normalized} OR {drg}/{path_normalized}/{title_normalized}
 * - oc: {drg}/{title_normalized}
 *
 * Normalization: lowercase + spaces replaced with underscores
 */
class ExternalIdBuilder {
    /**
     * Build external ID for an entity
     * @param {Object} object - Entity data
     * @param {string} type - Entity type: 'data'|'service'|'stakeholder'|'document'|'wave'|'on'|'or'|'oc'
     * @returns {string} External ID
     * @throws {Error} If required fields are missing
     */
    static buildExternalId(object, type) {
        switch (type) {
            case 'data':
            case 'service':
            case 'stakeholder':
                return this._buildHierarchicalId(object, type);

            case 'document':
            case 'wave':
                return this._buildSimpleId(object, type);

            case 'on':
            case 'or':
                return this._buildRequirementId(object, type);

            case 'oc':
                return this._buildChangeId(object, type);

            default:
                throw new Error(`Unknown entity type: ${type}`);
        }
    }

    /**
     * Build ID for hierarchical entities (data/service/stakeholder)
     * Format: {type}:{parent.externalId}/{name} or {type}:{name}
     * @private
     */
    static _buildHierarchicalId(object, type) {
        const name = object.name;

        if (!name) {
            throw new Error(`Missing required field 'name' for type '${type}'`);
        }

        const parent = object.parent;

        if (parent && parent.externalId) {
            return `${type}:${parent.externalId}/${name}`;
        }

        return `${type}:${name}`;
    }

    /**
     * Build ID for simple entities (document/wave)
     * Format: {type}:{name_normalized}
     * @private
     */
    static _buildSimpleId(object, type) {
        if (!object.name) {
            throw new Error(`Missing required field 'name' for type '${type}'`);
        }

        const normalized = this._normalize(object.name);
        return `${type}:${normalized}`;
    }

    /**
     * Build ID for requirements (on/or)
     * Format: {type}:{drg}/{parent.externalId}/{title_normalized}
     *     OR: {type}:{drg}/{path_normalized}/{title_normalized}
     * Business rule: parent XOR path (mutually exclusive)
     * @private
     */
    static _buildRequirementId(object, type) {
        if (!object.drg) {
            throw new Error(`Missing required field 'drg' for type '${type}'`);
        }

        if (!object.title) {
            throw new Error(`Missing required field 'title' for type '${type}'`);
        }

        const hasParent = object.parent && object.parent.externalId;
        const hasPath = object.path && object.path.length > 0;

        // Validate XOR rule
        if (hasParent && hasPath) {
            throw new Error(`Business rule violation for type '${type}': cannot have both 'parent' and 'path'`);
        }

        const titleNormalized = this._normalize(object.title);
        const drg = object.drg.toLowerCase();

        if (hasParent) {
            return `${type}:${drg}/${object.parent.externalId}/${titleNormalized}`;
        } else if (hasPath) {
            const pathNormalized = object.path.map(segment => this._normalize(segment)).join('/');
            return `${type}:${drg}/${pathNormalized}/${titleNormalized}`;
        } else {
            return `${type}:${drg}/${titleNormalized}`;
        }
    }

    /**
     * Build ID for operational changes (oc)
     * Format: oc:{drg}/{title_normalized}
     * @private
     */
    static _buildChangeId(object, type) {
        if (!object.drg) {
            throw new Error(`Missing required field 'drg' for type '${type}'`);
        }

        if (!object.title) {
            throw new Error(`Missing required field 'title' for type '${type}'`);
        }

        const titleNormalized = this._normalize(object.title);
        const drg = object.drg.toLowerCase();

        return `${type}:${drg}/${titleNormalized}`;
    }

    /**
     * Normalize text: lowercase + replace spaces with underscores
     * @private
     */
    static _normalize(text) {
        return text.trim().toLowerCase().replace(/\s+/g, '_');
    }
}

export default ExternalIdBuilder;