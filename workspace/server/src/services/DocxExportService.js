// workspace/server/src/services/DocxExportService.js
import OperationalRequirementService from './OperationalRequirementService.js';
import OperationalChangeService from './OperationalChangeService.js';
import DocxGenerator from './export/DocxGenerator.js';
import { isDraftingGroupValid } from '../../../shared/src/index.js';

class DocxExportService {
    /**
     * Parse folder path string into array
     * @param {string} folderPath - Folder path (e.g., 'ADP/SubFolder')
     * @returns {string[]} Path segments array
     */
    parseFolderPath(folderPath) {
        if (!folderPath) return null;
        return folderPath.split('/').filter(segment => segment.length > 0);
    }

    /**
     * Check if path starts with folder prefix
     * @param {string[]} entityPath - Entity's path array
     * @param {string[]} folderPrefix - Required prefix
     * @returns {boolean}
     */
    pathStartsWithPrefix(entityPath, folderPrefix) {
        if (!entityPath || entityPath.length < folderPrefix.length) return false;
        return folderPrefix.every((segment, index) => entityPath[index] === segment);
    }

    /**
     * Get effective path for an entity, walking up refinement hierarchy if needed
     * @param {Object} entity - The entity to check
     * @param {Map} entitiesById - Lookup map of all entities by itemId
     * @param {Set} visited - Set of visited entity IDs (to prevent cycles)
     * @returns {string[]|null} - The effective path or null if none found
     */
    getEffectivePath(entity, entitiesById, visited = new Set()) {
        // Prevent infinite loops
        if (visited.has(entity.itemId)) return null;
        visited.add(entity.itemId);

        // If entity has a path, return it
        if (entity.path && entity.path.length > 0) {
            return entity.path;
        }

        // Otherwise, check parent via refinesParents
        if (entity.refinesParents && entity.refinesParents.length > 0) {
            const parentRef = entity.refinesParents[0];
            const parentId = parentRef.itemId || parentRef.id || parentRef;
            const parent = entitiesById.get(parentId);

            if (parent) {
                return this.getEffectivePath(parent, entitiesById, visited);
            }
        }

        // No path found
        return null;
    }

    /**
     * Filter entities by folder, considering refinement hierarchy
     * @param {Array} entities - Array of entities
     * @param {string[]} folderPrefix - Folder prefix to filter by
     * @returns {Array} - Filtered entities
     */
    filterByFolder(entities, folderPrefix) {
        if (!folderPrefix) return entities;

        // Build lookup map by itemId
        const entitiesById = new Map();
        entities.forEach(e => entitiesById.set(e.itemId, e));

        // Filter entities by effective path
        return entities.filter(entity => {
            const effectivePath = this.getEffectivePath(entity, entitiesById);
            return effectivePath && this.pathStartsWithPrefix(effectivePath, folderPrefix);
        });
    }

    /**
     * Export operational requirements and changes as Word document for a specific DRG
     * @param {string} drg - Drafting Group to filter requirements and changes
     * @param {string} folder - Optional folder path filter (e.g., 'ADP/SubFolder')
     * @param {string} userId - User performing the export
     * @returns {Buffer} Word document as buffer
     */
    async exportRequirementsAndChanges(drg, folder, userId) {
        // Validate DRG using shared validation
        if (!isDraftingGroupValid(drg)) {
            throw new Error(`Invalid DRG value: ${drg}`);
        }

        const folderPrefix = this.parseFolderPath(folder);

        try {
            // Fetch requirements and changes filtered by DRG
            let requirements = await OperationalRequirementService.getAll(userId, null, null, {'drg': drg});
            let changes = await OperationalChangeService.getAll(userId, null, null, {'drg': drg});

            // Apply folder filter if specified
            if (folderPrefix) {
                requirements = this.filterByFolder(requirements, folderPrefix);
                changes = this.filterByFolder(changes, folderPrefix);
            }

            console.log(`Exporting ${requirements.length} requirements and ${changes.length} changes for DRG: ${drg}${folder ? `, folder: ${folder}` : ''}`);

            // Create generator and generate document
            const generator = new DocxGenerator();
            const buffer = await generator.generate(requirements, changes, {
                drg: drg,
                folder: folder || null,
                exportDate: new Date().toISOString(),
                userId: userId
            });

            return buffer;

        } catch (error) {
            console.error(`Failed to export requirements and changes: ${error.message}`);
            throw error;
        }
    }
}

export default new DocxExportService();